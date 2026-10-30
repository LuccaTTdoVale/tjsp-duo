import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,getDocs,collection,runTransaction,updateDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
let user=null,busy=false,requests=[],slots=[],profiles=[];
function gate(msg){$('gateStatus').textContent=msg;document.body.classList.remove('authorized')}
function status(msg){$('actionStatus').textContent=msg}
function dateOf(v){try{return v?.toDate?.().toLocaleDateString('pt-BR')||'Data não informada'}catch{return 'Data não informada'}}
const nameOf=x=>x?.name||x?.username||'Sem nome';
async function refresh(){
 if(!user||busy)return;
 try{
  const [reqs,sls,prs]=await Promise.all([
   getDocs(collection(db,'joinRequests')),
   getDocs(collection(db,'slots')),
   getDocs(collection(db,'profiles'))
  ]);
  requests=reqs.docs.map(d=>({id:d.id,...d.data()}));slots=sls.docs.map(d=>({id:d.id,...d.data()}));profiles=prs.docs.map(d=>({id:d.id,...d.data()}));
  document.body.classList.add('authorized');render();status('Dados atualizados.');
 }catch(err){console.error(err);gate('Acesso negado ou conexão indisponível. Confira se o UID da SUA conta está em firestore.rules e se as regras foram publicadas.');}
}
function render(){
 const pending=requests.filter(x=>x.status==='pending'),blocked=profiles.filter(x=>x.blocked===true);
 $('totalMembers').textContent=slots.length+' / 5';$('pendingCount').textContent=pending.length;$('blockedCount').textContent=blocked.length;
 const sorted=[...requests].sort((a,b)=>({'pending':0,'rejected':1,'approved':2}[a.status]??3)-({'pending':0,'rejected':1,'approved':2}[b.status]??3));
 $('requests').innerHTML=sorted.length?sorted.map(r=>`<div class="item"><div><strong>${esc(nameOf(r))}</strong> <span class="tag">${esc(r.status==='pending'?'AGUARDANDO':r.status==='approved'?'APROVADO':'RECUSADO')}</span><div class="small">${esc(r.email)} · ${esc(dateOf(r.createdAt))}</div><div class="small mono">${esc(r.uid||r.id)}</div></div><div class="actions">${r.status!=='approved'?`<button type="button" data-approve="${esc(r.id)}">Aprovar</button>`:''}${r.status==='pending'?`<button type="button" class="secondary" data-reject="${esc(r.id)}">Recusar</button>`:''}</div></div>`).join(''):'<p class="small">Nenhuma solicitação ainda.</p>';
 $('members').innerHTML=slots.length?slots.sort((a,b)=>Number(a.id)-Number(b.id)).map(s=>{
  const p=profiles.find(x=>x.id===s.id),request=requests.find(x=>x.uid===s.uid),blocked=p?.blocked===true;
  return `<div class="item"><div><strong>Vaga ${esc(s.id)}: ${esc(nameOf(p)||'Conta antiga')}</strong> <span class="tag">${blocked?'SUSPENSO':'ATIVO'}</span><div class="small">${esc(p?.email||request?.email||'E-mail: consulte Authentication → Users')}</div><div class="small mono">UID: ${esc(s.uid)}</div></div><div class="actions">${s.uid!==user.uid&&p?`<button type="button" class="secondary" data-block="${esc(s.id)}" data-new="${blocked?'false':'true'}">${blocked?'Reativar':'Suspender acesso'}</button>`:''}</div></div>`;
 }).join(''):'<p class="small">Nenhuma vaga ocupada.</p>';
 $('requests').querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>approve(b.dataset.approve));
 $('requests').querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>reject(b.dataset.reject));
 $('members').querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>block(b.dataset.block,b.dataset.new==='true'));
}
async function approve(uid){
 if(busy)return;if(!confirm('Aprovar esta pessoa? O acesso será liberado imediatamente.'))return;
 busy=true;status('Aprovando e reservando vaga de forma atômica…');
 try{
  const chosen=await runTransaction(db,async tx=>{
   const reqRef=doc(db,'joinRequests',uid),req=await tx.get(reqRef);
   if(!req.exists()||!['pending','rejected'].includes(req.data().status)||req.data().uid!==uid)throw Error('Pedido não disponível para aprovação.');
   const refs=['1','2','3','4','5'].map(id=>doc(db,'slots',id));
   const docs=[];for(const ref of refs)docs.push(await tx.get(ref));
   if(docs.some(s=>s.exists()&&s.data().uid===uid))throw Error('Usuário já ocupa uma vaga.');
   const n=docs.findIndex(s=>!s.exists());if(n<0)throw Error('As cinco vagas estão ocupadas. Nenhum cadastro foi apagado.');
   const profileRef=doc(db,'profiles',String(n+1)),profile=await tx.get(profileRef);
   if(profile.exists())throw Error('Há dados de perfil nesta vaga; examine o Firestore antes de aprovar.');
   const data=req.data(),slot=String(n+1);
   tx.set(refs[n],{uid});
   tx.set(profileRef,{uid,username:data.name,blocked:false,approvedAt:serverTimestamp(),approvedBy:user.uid,goal:20,answered:0,correct:0,wrong:0,distinct:0,daily:{},streak:0,exams:0,subjectStats:{},topicStats:{},lessonProgress:{}});
   tx.update(reqRef,{status:'approved',slot,reviewedAt:serverTimestamp(),reviewedBy:user.uid});
   return slot;
  });
  status('Cadastro aprovado e vaga '+chosen+' atribuída.');
 }catch(e){status('Falha na aprovação: '+(e?.message||e))}finally{busy=false;await refresh()}
}
async function reject(uid){
 if(busy)return;if(!confirm('Recusar este pedido? A conta continuará no Firebase, mas sem acesso às aulas.'))return;
 busy=true;try{const r=doc(db,'joinRequests',uid);await updateDoc(r,{status:'rejected',reviewedAt:serverTimestamp(),reviewedBy:user.uid});status('Pedido recusado.')}catch(e){status('Erro: '+e.message)}finally{busy=false;await refresh()}
}
async function block(slot,blocked){
 if(busy)return;const data=slots.find(s=>s.id===slot);
 if(!data||data.uid===user.uid){status('Não é possível suspender sua própria conta.');return}
 if(!confirm(blocked?'Suspender este acesso? O histórico será preservado.':'Reativar o acesso desta pessoa?'))return;
 busy=true;try{await updateDoc(doc(db,'profiles',slot),{blocked});status(blocked?'Acesso suspenso.':'Acesso reativado.')}catch(e){status('Erro: '+e.message)}finally{busy=false;await refresh()}
}
$('copyUid').onclick=async()=>{const uid=$('myUid').textContent;if(uid&&uid!=='—')try{await navigator.clipboard.writeText(uid);$('copyUid').textContent='Copiado!'}catch{gate('Copie manualmente o UID exibido acima.')}};
$('refresh').onclick=refresh;
onAuthStateChanged(auth,async u=>{
 user=u;if(!u){gate('Você não está conectado. Faça login na sua conta administradora.');return}
 $('myUid').textContent=u.uid;
 await refresh();
},e=>gate('Falha no Firebase: '+e.message));
