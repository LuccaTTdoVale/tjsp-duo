import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,deleteUser} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,runTransaction,collection,getDocs,query,orderBy,limit,updateDoc} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
try {
if(firebaseConfig.apiKey.includes('COLE_')||firebaseConfig.appId.includes('COLE_'))throw new Error('Preencha apiKey e appId em firebase-config.js antes de publicar.');
const app=initializeApp(firebaseConfig), auth=getAuth(app), db=getFirestore(app);
let readyUser=null;
const ready=new Promise(resolve=>onAuthStateChanged(auth,u=>{readyUser=u;resolve();}));
const error=e=>{let msg=e?.message||String(e); if(/email-already-in-use/.test(msg))msg='Este e-mail já possui conta.';if(/invalid-email/.test(msg))msg='E-mail inválido.';if(/weak-password/.test(msg))msg='Senha fraca: use pelo menos 6 caracteres.';if(/invalid-credential|wrong-password|user-not-found/.test(msg))msg='E-mail ou senha incorretos.';if(/permission-denied|Missing or insufficient permissions/.test(msg))msg='Acesso negado pelo Firestore. Publique as regras incluídas no ZIP.';return new Error(msg)};
const slots=['1','2','3','4','5'];
async function getSlotUser(uid){for(const id of slots){const snap=await getDoc(doc(db,'slots',id));if(snap.exists()&&snap.data().uid===uid)return Number(id)}return null}
async function getUser(){await ready;const u=auth.currentUser;if(!u)throw new Error('Você precisa entrar.');const slot=await getSlotUser(u.uid);if(!slot)throw new Error('Sua conta ainda não possui perfil. Entre em contato com o administrador.');const p=await getDoc(doc(db,'profiles',String(slot)));return {id:slot,uid:u.uid,username:p.data()?.username||u.email.split('@')[0],goal:p.data()?.goal||20}}
const userProfiles=async()=>{const docs=await Promise.all(slots.map(s=>getDoc(doc(db,'profiles',s))));return docs.filter(d=>d.exists()).map(d=>({id:Number(d.id),...d.data()}))};
const dayKey=(time=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(time);
const bank=()=>window.QUESTION_BANK_ACCESS||[];
const totals=(qs)=>{const subj={},topics={};for(const q of qs){subj[q.s]=(subj[q.s]||0)+1;const key=q.s+'\u0000'+q.t;topics[key]=(topics[key]||0)+1}return {subj,topics}};
async function history(slot){const p=await getUser();if(p.id!==Number(slot))return {history:[]};const exams=await getDocs(query(collection(db,'users',p.uid,'exams'),orderBy('createdAt','desc'),limit(100)));return {history:exams.docs.map(d=>{const data=d.data();return {id:d.id,...data,responses:(data.responses||[]).map(r=>Array.isArray(r)?r:[r.id,r.choice])}})}}
async function stats(){const users=await userProfiles();const qs=bank();const {subj,topics}=totals(qs);return {today:dayKey(),bank_total:qs.length,users:users.map(u=>({id:u.id,username:u.username,goal:u.goal||20,answered:u.answered||0,correct:u.correct||0,wrong:u.wrong||0,distinct:u.distinct||0,today:u.daily?.[dayKey()]||0,daily:u.daily||{},streak:u.streak||0,exams:u.exams||0,subjects:Object.entries(subj).map(([subject,total_bank])=>({subject,total_bank,...(u.subjectStats?.[subject]||{distinct:0,answered:0,correct:0})})),topics:Object.entries(u.topicStats||{}).map(([k,v])=>({subject:k.split('\u0000')[0],topic:k.split('\u0000')[1],total_bank:topics[k]||1,...v}))}))}}
async function recalc(p){const result=await history(p.id);const qs=bank(),map=new Map(qs.map(q=>[q.i,q]));const all=result.history, bySub={},byTopic={},distinct=new Set(),dayCounts={};let answered=0,correct=0;
for(const h of all){const day=h.day||dayKey(new Date(h.createdAt||Date.now()));for(const [id,choice] of h.responses||[]){if(choice===null||choice===undefined)continue;const q=map.get(id);if(!q)continue;answered++;const isCorrect=choice===q.a?1:0;correct+=isCorrect;dayCounts[day]=(dayCounts[day]||0)+1;distinct.add(id);const sub=bySub[q.s]||(bySub[q.s]={answered:0,correct:0,ids:new Set()});sub.answered++;sub.correct+=isCorrect;sub.ids.add(id);const key=q.s+'\u0000'+q.t;const topic=byTopic[key]||(byTopic[key]={answered:0,correct:0,ids:new Set()});topic.answered++;topic.correct+=isCorrect;topic.ids.add(id)}}
const flatten=x=>Object.fromEntries(Object.entries(x).map(([k,v])=>[k,{answered:v.answered,correct:v.correct,distinct:v.ids.size}]));let streak=0;let d=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));if(!dayCounts[dayKey(d)])d.setDate(d.getDate()-1);while(dayCounts[dayKey(d)]){streak++;d.setDate(d.getDate()-1)};
await updateDoc(doc(db,'profiles',String(p.id)),{answered,correct,wrong:answered-correct,distinct:distinct.size,daily:dayCounts,streak,exams:all.length,subjectStats:flatten(bySub),topicStats:flatten(byTopic)});
}
window.duoFirebaseAPI=async function(path,payload){try{await ready;
if(path==='/api/status'){if(!auth.currentUser)return {accounts:0,slots:5};const profiles=await userProfiles();return {accounts:profiles.length,slots:Math.max(0,5-profiles.length)}}
if(path==='/api/register'){
 const email=String(payload.username||'').trim().toLowerCase(),pass=String(payload.password||'');if(!email.includes('@'))throw new Error('Digite um e-mail válido.');
 // Nunca consulte perfis antes de autenticar: as regras bloqueiam leituras anônimas.
 const credential=await createUserWithEmailAndPassword(auth,email,pass);const uid=credential.user.uid;let chosen=null;
 for(const id of slots){try{await runTransaction(db,async tx=>{const ref=doc(db,'slots',id);const snap=await tx.get(ref);if(snap.exists())throw new Error('Ocupado');tx.set(ref,{uid});});chosen=id;break}catch(err){if(err.message!=='Ocupado')throw err}}
 if(!chosen){try{await deleteUser(credential.user)}catch(_){await signOut(auth)}throw new Error('As 5 vagas estão ocupadas.')}const username=email.split('@')[0].slice(0,32);await setDoc(doc(db,'profiles',chosen),{uid,username,goal:20,answered:0,correct:0,wrong:0,distinct:0,daily:{},streak:0,exams:0,subjectStats:{},topicStats:{}});return {user:{id:Number(chosen),uid,username,goal:20}};
}
if(path==='/api/login'){await signInWithEmailAndPassword(auth,String(payload.username||'').trim(),String(payload.password||''));return {user:await getUser()}}
if(path==='/api/logout'){await signOut(auth);return {ok:true}}
if(path==='/api/me')return {user:await getUser()};
if(path==='/api/summary')return await stats();
if(path.startsWith('/api/history')){const id=new URLSearchParams(path.split('?')[1]||'').get('user');return await history(id)}
if(path==='/api/goal'){const p=await getUser(),goal=Number(payload.goal);if(!Number.isInteger(goal)||goal<1||goal>500)throw new Error('Meta deve ser de 1 a 500 questões.');await updateDoc(doc(db,'profiles',String(p.id)),{goal});return {goal}}
if(path==='/api/finish'){const p=await getUser(),responses=payload.responses;if(!Array.isArray(responses)||responses.length<1||responses.length>100)throw new Error('Quantidade inválida');const qmap=new Map(bank().map(q=>[q.i,q]));const used=new Set();let correct=0,answered=0;for(const [id,choice] of responses){if(!qmap.has(id)||used.has(id)||(choice!==null&&(!Number.isInteger(choice)||choice<0||choice>4)))throw new Error('Questão ou resposta inválida');used.add(id);if(choice!==null){answered++;if(choice===qmap.get(id).a)correct++}}const eid=String(payload.client_id||'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80);if(!eid)throw new Error('Identificador inválido');const ref=doc(db,'users',p.uid,'exams',eid);const existing=await getDoc(ref);if(existing.exists()){return {id:eid,correct:existing.data().correct,wrong:existing.data().failed,blanks:existing.data().blanks}}const now=new Date(),day=dayKey(now);await setDoc(ref,{createdAt:now.toISOString(),date:now.toLocaleString('pt-BR'),day,total:responses.length,correct,failed:answered-correct,blanks:responses.length-answered,elapsed:payload.elapsed||0,filter:payload.filter||{},responses:responses.map(([id,choice])=>({id,choice}))});await recalc(p);return {id:eid,correct,wrong:answered-correct,blanks:responses.length-answered}}
throw new Error('Rota desconhecida '+path);
}catch(e){throw error(e)}};
window.duoFirebaseResolve();
}catch(e){window.duoFirebaseReject(e);console.error('Falha ao iniciar Firebase:',e)}
