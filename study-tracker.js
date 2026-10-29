/* TJSP Duo V8 — medição automática de estudo ativo e questões.
   Critério: 120 minutos ativos OU 50 questões no dia (São Paulo).
   Medição aproximada: aba visível, em foco, interação nos últimos 4 minutos.
   A contagem anterior à instalação não pode ser reconstruída. */
import {initializeApp,getApp,getApps} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,onSnapshot,updateDoc,increment} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const app=getApps().length?getApp():initializeApp(firebaseConfig);
const auth=getAuth(app),db=getFirestore(app);
const localDay=()=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=x=>parts.find(p=>p.type===x)?.value||'01';return `${get('year')}-${get('month')}-${get('day')}`;
};
let uid='',slot='',profile={},ref=null,pending=0,busy=false,unsub=null,sessionId=Math.random().toString(36).slice(2)+Date.now().toString(36);
let lastInput=Date.now(),lastTick=Date.now();
const EMPTY=Object.freeze({seconds:0,questions:0,practice:0,simulados:0,status:'signin'});
const maxSec=7200,targetQuestions=50,leaseMs=19000;
function getDay(date=localDay()){
 if(!uid||!slot)return {...EMPTY};
 const seconds=Math.max(0,Number(profile.studySeconds?.[date]||0))+(date===localDay()?pending:0);
 const practice=Math.max(0,Number(profile.studyPractice?.[date]||0));
 const simulados=Math.max(0,Number(profile.daily?.[date]||0));
 const questions=practice+simulados;
 let status;
 if(seconds>=maxSec||questions>=targetQuestions)status='done';
 else if(date>localDay())status='future';
 else if(date===localDay())status='pending';
 else if(!profile.studyTrackingStart||date<profile.studyTrackingStart)status='untracked';
 else status='missed';
 return {seconds,questions,practice,simulados,status};
}
function announce(){document.dispatchEvent(new CustomEvent('tjsp:study-progress',{detail:{day:localDay(),current:getDay()}}));}
window.TJSPDailyActivity=Object.freeze({getDay,today:localDay,refresh:announce,recordLessonAnswer,getCompletedLessons:()=>({...profile.lessonProgress||{}})});
function canCount(){return Boolean(uid&&slot)&&document.visibilityState==='visible'&&document.hasFocus()&&(Date.now()-lastInput<4*60*1000);}
function lockOwner(){
 if(!uid)return false;
 try{
  const key='tjsp-duo-active-tab:'+uid;
  const prev=JSON.parse(localStorage.getItem(key)||'null');
  if(prev&&prev.owner!==sessionId&&prev.until>Date.now())return false;
  localStorage.setItem(key,JSON.stringify({owner:sessionId,until:Date.now()+leaseMs}));
  return JSON.parse(localStorage.getItem(key)||'null')?.owner===sessionId;
 }catch{return true}
}
async function flush(){
 if(!ref||busy||pending<1)return;
 const seconds=pending;pending=0;busy=true;
 const day=localDay();
 try{await updateDoc(ref,{[`studySeconds.${day}`]:increment(seconds)});}
 catch(err){pending=Math.min(120,pending+seconds);console.warn('TJSP DUO: não foi possível sincronizar o tempo ativo',err);}
 finally{busy=false;announce()}
}
function tick(){
 const now=Date.now(),elapsed=Math.min(10,Math.max(0,Math.round((now-lastTick)/1000)));lastTick=now;
 if(canCount()&&lockOwner()&&elapsed>0){pending+=elapsed;announce();}
 if(pending>=20)flush();
}
function touch(){lastInput=Date.now()}
for(const ev of ['pointerdown','keydown','touchstart','wheel','scroll'])document.addEventListener(ev,touch,{passive:true});
document.addEventListener('visibilitychange',()=>{lastTick=Date.now();if(document.visibilityState!=='visible')flush();else touch()});
window.addEventListener('focus',()=>{lastTick=Date.now();touch()});
window.addEventListener('blur',()=>{lastTick=Date.now();flush()});
window.addEventListener('pagehide',()=>{flush();try{const key='tjsp-duo-active-tab:'+uid;const old=JSON.parse(localStorage.getItem(key)||'null');if(old?.owner===sessionId)localStorage.removeItem(key)}catch{}});
setInterval(tick,10000);
async function recordLessonAnswer(questionKey){
 if(!uid||!slot||!ref||!questionKey)return false;
 const date=localDay(),key='tjsp-duo-answered:'+uid+':'+date;
 let seen=[];try{seen=JSON.parse(localStorage.getItem(key)||'[]');if(!Array.isArray(seen))seen=[]}catch{}
 const unique=String(questionKey);if(seen.includes(unique))return false;
 try{localStorage.setItem(key,JSON.stringify([...seen,unique].slice(-1200)))}catch{}
 touch();
 try{await updateDoc(ref,{[`studyPractice.${date}`]:increment(1)});announce();return true}
 catch(err){try{localStorage.setItem(key,JSON.stringify(seen))}catch{}console.warn('TJSP DUO: falha ao registrar exercício',err);return false}
}
onAuthStateChanged(auth,async user=>{
 if(unsub){unsub();unsub=null}
 if(uid&&pending)await flush();
 uid=user?.uid||'';slot='';ref=null;profile={};pending=0;lastTick=Date.now();announce();
 if(!user)return;
 try{
  for(const candidate of ['1','2','3','4','5']){
   const d=await getDoc(doc(db,'slots',candidate));
   if(auth.currentUser?.uid!==user.uid)return;
   if(d.exists()&&d.data().uid===user.uid){slot=candidate;break}
  }
  if(!slot)return;
  ref=doc(db,'profiles',slot);
  unsub=onSnapshot(ref,snap=>{
   if(auth.currentUser?.uid!==uid)return;
   profile=snap.data()||{};announce();
   if(!profile.studyTrackingStart){
    updateDoc(ref,{studyTrackingStart:localDay()}).catch(e=>console.warn('TJSP DUO: data inicial não gravada',e));
   }
  },err=>console.warn('TJSP DUO: acompanhamento indisponível',err));
 }catch(err){console.warn('TJSP DUO: não foi possível localizar o perfil',err)}
});
