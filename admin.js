import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,getDocs,collection,runTransaction,updateDoc,serverTimestamp,writeBatch} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
let user=null,busy=false,requests=[],slots=[],profiles=[],removed=[];
function gate(msg){$('gateStatus').textContent=msg;document.body.classList.remove('authorized')}
function status(msg){$('actionStatus').textContent=msg}
function dateOf(v){try{return v?.toDate?.().toLocaleDateString('pt-BR')||'Data não informada'}catch{return 'Data não informada'}}
const nameOf=x=>x?.name||x?.username||'Sem nome';
async function refresh({preserveStatus=false}={}){
 if(!user||busy)return;
 try{
  const [reqs,sls,prs,rems]=await Promise.all([
   getDocs(collection(db,'joinRequests')),
   getDocs(collection(db,'slots')),
   getDocs(collection(db,'profiles')),
   getDocs(collection(db,'removedAccounts'))
  ]);
  requests=reqs.docs.map(d=>({id:d.id,...d.data()}));slots=sls.docs.map(d=>({id:d.id,...d.data()}));profiles=prs.docs.map(d=>({id:d.id,...d.data()}));removed=rems.docs.map(d=>({id:d.id,...d.data()}));
  document.body.classList.add('authorized');render();if(!preserveStatus)status('Dados atualizados.');
 }catch(err){console.error(err);gate('Acesso negado ou conexão indisponível. Confira se o UID da SUA conta está em firestore.rules e se as regras foram publicadas.');}
}
function render(){
 const pending=requests.filter(x=>x.status==='pending'),blocked=profiles.filter(x=>x.blocked===true);
 $('totalMembers').textContent=slots.length+' / 5';$('pendingCount').textContent=pending.length;$('blockedCount').textContent=blocked.length;$('removedCount').textContent=removed.length;
 const sorted=[...requests].filter(x=>x.status!=='approved').sort((a,b)=>({'pending':0,'rejected':1}[a.status]??3)-({'pending':0,'rejected':1}[b.status]??3));
 $('requests').innerHTML=sorted.length?sorted.map(r=>`<div class="item"><div><strong>${esc(nameOf(r))}</strong> <span class="tag">${esc(r.status==='pending'?'AGUARDANDO':r.status==='approved'?'APROVADO':'RECUSADO')}</span><div class="small">${esc(r.email)} · ${esc(dateOf(r.createdAt))}</div><div class="small mono">${esc(r.uid||r.id)} · ${r.emailVerified===true?'E-mail confirmado':'E-MAIL NÃO CONFIRMADO'}</div></div><div class="actions">${r.emailVerified===true?`<button type="button" data-approve="${esc(r.id)}">Aprovar</button>`:''}${r.status==='pending'?`<button type="button" class="secondary" data-reject="${esc(r.id)}">Recusar</button>`:''}<button type="button" class="dangerOutline" data-remove-request="${esc(r.id)}">Excluir do TJSP DUO</button></div></div>`).join(''):'<p class="small">Nenhuma solicitação ainda.</p>';
 $('members').innerHTML=slots.length?slots.sort((a,b)=>Number(a.id)-Number(b.id)).map(s=>{
  const p=profiles.find(x=>x.id===s.id),request=requests.find(x=>x.uid===s.uid),blocked=p?.blocked===true;
  return `<div class="item"><div><strong>Vaga ${esc(s.id)}: ${esc(nameOf(p)||'Conta antiga')}</strong> <span class="tag">${blocked?'SUSPENSO':'ATIVO'}</span><div class="small">${esc(p?.email||request?.email||'E-mail: consulte Authentication → Users')}</div><div class="small mono">UID: ${esc(s.uid)}</div></div><div class="actions">${s.uid!==user.uid&&p?`<button type="button" class="secondary" data-block="${esc(s.id)}" data-new="${blocked?'false':'true'}">${blocked?'Reativar':'Suspender acesso'}</button>`:''}${s.uid!==user.uid?`<button type="button" class="dangerOutline" data-remove-member="${esc(s.id)}">Excluir do TJSP DUO</button>`:''}</div></div>`;
 }).join(''):'<p class="small">Nenhuma vaga ocupada.</p>';
 $('requests').querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>approve(b.dataset.approve));
 $('requests').querySelectorAll('[data-reject]').forEach(b=>b.onclick=()=>reject(b.dataset.reject));
 $('members').querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>block(b.dataset.block,b.dataset.new==='true'));
 $('requests').querySelectorAll('[data-remove-request]').forEach(b=>b.onclick=()=>removeAccount(b.dataset.removeRequest,'request'));
 $('members').querySelectorAll('[data-remove-member]').forEach(b=>b.onclick=()=>removeAccount(b.dataset.removeMember,'member'));
 $('removedAccounts').innerHTML=removed.length?[...removed].reverse().map(r=>`<div class="item"><div><strong>${esc(nameOf(r))}</strong><div class="small">${esc(r.email||'E-mail não informado')}</div><div class="small mono">UID: ${esc(r.id)}</div><div class="small">Acesso revogado. Exclua também no Authentication → Users para concluir a exclusão do login.</div></div><div class="actions"><button type="button" class="secondary" data-copy-removed="${esc(r.id)}">Copiar UID</button></div></div>`).join(''):'<p class="small">Nenhuma conta removida.</p>';
 $('removedAccounts').querySelectorAll('[data-copy-removed]').forEach(b=>b.onclick=async()=>{try{await navigator.clipboard.writeText(b.dataset.copyRemoved);status('UID copiado. Exclua a conta correspondente no Firebase Authentication → Users.')}catch{status('Copie o UID mostrado na lista para procurar no Firebase Authentication.') }});
 
}
async function approve(uid){
 if(busy)return;if(!confirm('Aprovar esta pessoa? O acesso será liberado imediatamente.'))return;
 busy=true;status('Aprovando e reservando vaga de forma atômica…');
 try{
  const chosen=await runTransaction(db,async tx=>{
   const reqRef=doc(db,'joinRequests',uid),req=await tx.get(reqRef);
   if(!req.exists()||!['pending','rejected'].includes(req.data().status)||req.data().uid!==uid)throw Error('Pedido não disponível para aprovação.');
   if(req.data().emailVerified!==true)throw Error('Não aprove: este e-mail ainda não foi confirmado pelo destinatário.');
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
 }catch(e){status('Falha na aprovação: '+(e?.message||e))}finally{busy=false;await refresh({preserveStatus:true})}
}
async function reject(uid){
 if(busy)return;if(!confirm('Recusar este pedido? A conta continuará no Firebase, mas sem acesso às aulas.'))return;
 busy=true;try{const r=doc(db,'joinRequests',uid);await updateDoc(r,{status:'rejected',reviewedAt:serverTimestamp(),reviewedBy:user.uid});status('Pedido recusado.')}catch(e){status('Erro: '+e.message)}finally{busy=false;await refresh({preserveStatus:true})}
}
async function block(slot,blocked){
 if(busy)return;const data=slots.find(s=>s.id===slot);
 if(!data||data.uid===user.uid){status('Não é possível suspender sua própria conta.');return}
 if(!confirm(blocked?'Suspender este acesso? O histórico será preservado.':'Reativar o acesso desta pessoa?'))return;
 busy=true;try{await updateDoc(doc(db,'profiles',slot),{blocked});status(blocked?'Acesso suspenso.':'Acesso reativado.')}catch(e){status('Erro: '+e.message)}finally{busy=false;await refresh({preserveStatus:true})}
}
/* Excluir do aplicativo não exclui o usuário do Firebase Authentication. Essa etapa exige
   Firebase Console ou Admin SDK em backend seguro; NUNCA inserir chave admin no GitHub. */
async function removeAccount(identifier,kind){
 if(busy||!user)return;
 const member=kind==='member',sl=member?slots.find(x=>x.id===identifier):null;
 const req=member?requests.find(x=>x.uid===sl?.uid):requests.find(x=>x.id===identifier);
 const uid=member?sl?.uid:req?.uid||identifier;
 if(!uid||uid===user.uid){status('Não é permitido excluir sua própria conta administradora.');return}
 const name=member?nameOf(profiles.find(p=>p.id===identifier)):nameOf(req);
 const email=req?.email||profiles.find(p=>p.id===identifier)?.email||'';
 const confirmation=prompt('EXCLUSÃO: remover '+name+' do TJSP DUO, liberar a vaga e apagar os dados do aplicativo?\nIsso não poderá ser desfeito.\n\nDigite EXCLUIR para confirmar:');
 if(confirmation!=='EXCLUIR')return;
 busy=true;status('Removendo acesso e registros do TJSP DUO…');
 try{
  // Confirmar permissão de leitura e obter exames antes de revogar a vaga.
  const exams=await getDocs(collection(db,'users',uid,'exams'));
  await runTransaction(db,async tx=>{
   const tombRef=doc(db,'removedAccounts',uid),reqRef=doc(db,'joinRequests',uid);
   const slotRef=member?doc(db,'slots',identifier):null,profileRef=member?doc(db,'profiles',identifier):null;
   const emailRef=email?doc(db,'deniedEmails',email.toLowerCase()):null;
   const tomb=await tx.get(tombRef),reqDoc=await tx.get(reqRef);
   const slotDoc=slotRef?await tx.get(slotRef):null;
   const profileDoc=profileRef?await tx.get(profileRef):null;
   const emailDoc=emailRef?await tx.get(emailRef):null;
   if(tomb.exists())throw Error('Esta pessoa já foi removida.');
   if(member&&(!slotDoc.exists()||slotDoc.data().uid!==uid||!profileDoc.exists()||profileDoc.data().uid!==uid))throw Error('A vaga não corresponde mais a este usuário. Atualize a lista.');
   if(!member&&(!reqDoc.exists()||reqDoc.data().status==='approved'))throw Error('O pedido mudou; atualize a lista.');
   tx.set(tombRef,{uid,email,name,removedBy:user.uid,removedAt:serverTimestamp()});
   if(emailRef)tx.set(emailRef,{uid,email,removedBy:user.uid,removedAt:serverTimestamp()});
   if(slotRef){tx.delete(slotRef);tx.delete(profileRef)}
   if(reqDoc.exists())tx.delete(reqRef);
  });
  // Todos os simulados ligados ao UID são apagados em lotes limitados do Firestore.
  const docs=exams.docs;
  for(let i=0;i<docs.length;i+=400){const batch=writeBatch(db);for(const d of docs.slice(i,i+400))batch.delete(d.ref);await batch.commit()}
  status('Acesso e dados do TJSP DUO removidos. '+docs.length+' simulados excluídos. PARA CONCLUIR: Firebase Console → Authentication → Users → exclua o UID '+uid+'. A identidade no Firebase Authentication ainda existe até essa ação.');
 }catch(err){status('Atenção: remoção não concluída ou limpeza parcial: '+(err?.message||err)+'. Verifique o Firestore e Authentication antes de tentar novamente.');}
 finally{busy=false;await refresh({preserveStatus:true})}
}
$('copyUid').onclick=async()=>{const uid=$('myUid').textContent;if(uid&&uid!=='—')try{await navigator.clipboard.writeText(uid);$('copyUid').textContent='Copiado!'}catch{gate('Copie manualmente o UID exibido acima.')}};
$('refresh').onclick=refresh;
onAuthStateChanged(auth,async u=>{
 user=u;if(!u){gate('Você não está conectado. Faça login na sua conta administradora.');return}
 $('myUid').textContent=u.uid;
 await refresh();
},e=>gate('Falha no Firebase: '+e.message));
