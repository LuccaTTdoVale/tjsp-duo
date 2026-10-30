/* TJSP DUO V15: e-mail verificado antes do pedido, recusas definitivas e sessão em qualquer aparelho. */
import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,sendEmailVerification,updateProfile,reload,getIdToken,signOut,setPersistence,browserLocalPersistence,browserSessionPersistence} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,updateDoc,serverTimestamp,onSnapshot} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id),slots=['1','2','3','4','5'];
const allowed=new Set(['index.html','conteudo.html','calendario.html','questoes.html','ranking.html','estatisticas.html','historico.html','caderno-erros.html','perfil.html','sobre.html','admin.html']);
function destination(){
 const raw=new URLSearchParams(location.search).get('next');if(!raw)return './index.html';
 try{const v=new URL(raw,location.href),dir=location.pathname.slice(0,location.pathname.lastIndexOf('/')+1);
  if(v.origin!==location.origin||v.pathname.slice(0,v.pathname.lastIndexOf('/')+1)!==dir||!allowed.has(v.pathname.split('/').pop()))return './index.html';
  return v.pathname+v.search+v.hash;
 }catch{return './index.html';}
}
const next=destination();let auth,db,busy=false,registering=false,authTurn=0,stopRequest=null;
function message(msg,good=false){$('loginMessage').textContent=msg;$('loginMessage').dataset.kind=good?'note':'error';}
function wait(b){busy=b;for(const id of ['loginSubmit','loginToggle','resetPassword','retryRequest','pendingLogout','resendVerification','confirmVerification']){if($(id))$(id).disabled=b;}}
function errText(err){const s=String(err?.code||'')+' '+String(err?.message||'');
 if(/invalid-credential|wrong-password|user-not-found/.test(s))return 'E-mail ou senha incorretos. Use Esqueci a senha para recuperar.';
 if(/email-already-in-use/.test(s))return 'E-mail já cadastrado. Clique em Entrar.';
 if(/weak-password/.test(s))return 'Use uma senha com pelo menos 8 caracteres.';
 if(/too-many-requests/.test(s))return 'Muitas tentativas. Aguarde antes de tentar novamente.';
 if(/permission-denied|insufficient permissions/.test(s))return 'Acesso não autorizado. Seu e-mail deve estar confirmado, e as regras V15 devem estar publicadas. Se foi removido, contate o administrador.';
 if(/network-request-failed/.test(s))return 'Sem conexão. Prefira abrir no Safari ou Chrome.';
 return err?.message||'Não foi possível concluir. Tente novamente.';
}
function normalizeName(v){return String(v||'').normalize('NFC').trim().replace(/\s+/g,' ')}
function validName(v){return v.length>=2&&v.length<=60&&/^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ._-]+$/.test(v)&&/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v)}
// Validação sintática inicial; existência/posse da caixa é comprovada pelo link de e-mail do Firebase.
function validEmail(v){return v.length<=150&&/^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(v)&&v.split('@')[1].split('.').every(x=>x.length>0&&x.length<=63&&!x.startsWith('-')&&!x.endsWith('-'))&&/^[A-Za-z]{2,63}$/.test(v.split('.').pop())}
async function profileSlot(uid){
 for(const id of slots){const s=await getDoc(doc(db,'slots',id));if(s.exists()&&s.data().uid===uid){const p=await getDoc(doc(db,'profiles',id));return p.exists()&&p.data().uid===uid?{id,blocked:p.data().blocked===true}:null}}
 return null;
}
async function persistence(){
 try{await setPersistence(auth,browserLocalPersistence)}
 catch{try{await setPersistence(auth,browserSessionPersistence);message('Este navegador limita a sessão permanente. Prefira Safari ou Chrome.',true)}
 catch{throw Error('O navegador não permite armazenar sessões. Abra no Safari ou Chrome.')}}
}
function panel(msg,{request=false,verify=false,denied=false}={}){
 $('pendingPanel').hidden=false;
 $('loginForm').hidden=true;$('loginToggle').hidden=true;$('resetPassword').hidden=true;
 $('requestNameWrap').hidden=!request;$('retryRequest').hidden=!request;
 $('verifyActions').hidden=!verify;
 $('pendingHeading').textContent=denied?'Acesso recusado':verify?'Confirme seu e-mail':'Situação do cadastro';
 $('pendingDescription').textContent=msg;
 if(denied){message('Acesso não autorizado. Você não pode reenviar o pedido.',false)}
 else message(verify?'Confirme seu endereço de e-mail antes de pedir acesso.':'Seu cadastro está registrado.',true);
}
async function createRequest(user,name){
 const clean=normalizeName(name);
 if(!validName(clean))throw Error('Informe um nome de 2 a 60 caracteres, com letras.');
 if(!validEmail(user?.email||''))throw Error('O e-mail informado não possui um formato válido.');
 await reload(user);await getIdToken(user,true);
 if(!user.emailVerified)throw Error('Confirme o e-mail antes de enviar o pedido.');
 const removed=await getDoc(doc(db,'removedAccounts',user.uid));
 if(removed.exists())throw Error('Este acesso foi removido pelo administrador. Não é possível solicitar novamente.');
 const deniedEmail=await getDoc(doc(db,'deniedEmails',user.email.toLowerCase()));
 if(deniedEmail.exists())throw Error('Este e-mail está bloqueado para novos pedidos. Contate o administrador.');
 const ref=doc(db,'joinRequests',user.uid),old=await getDoc(ref);
 if(old.exists()){
  if(old.data().status!=='pending')throw Error('O pedido anterior já foi analisado. Não é possível reenviar.');
  if(old.data().emailVerified!==true)await updateDoc(ref,{emailVerified:true});
  return old.data();
 }
 await setDoc(ref,{uid:user.uid,email:user.email,name:clean,emailVerified:true,status:'pending',createdAt:serverTimestamp()});
 return {status:'pending'};
}
async function checkAccess(user){
 // Não oferecer uma nova solicitação para quem foi removido.
 const removal=await getDoc(doc(db,'removedAccounts',user.uid));
 if(removal.exists()){panel('Este acesso foi encerrado pelo administrador. Não é possível criar ou reenviar pedidos com esta conta.',{denied:true});return}
 const profile=await profileSlot(user.uid);
 if(profile&&!profile.blocked){location.replace(next);return}
 if(profile?.blocked){panel('O acesso desta conta foi suspenso pelo administrador. Entre em contato com ele.',{denied:true});return}
 const request=await getDoc(doc(db,'joinRequests',user.uid));
 if(request.exists()&&request.data().status==='rejected'){
  panel('Seu cadastro foi recusado. Não é permitido enviar outro pedido; converse com o administrador para esclarecimentos.',{denied:true});return;
 }
 if(request.exists()&&request.data().status==='approved'){
  panel('Seu pedido foi aprovado, mas o perfil ainda não está disponível. Peça ao administrador para verificar a vaga.');return;
 }
 // Contas antigas aprovadas preservam o acesso. Novos pedidos precisam verificar o e-mail.
 await reload(user);
 if(!user.emailVerified){
  panel('Enviamos a confirmação para '+(user.email||'seu endereço')+'. Abra o link recebido e depois clique em "Já confirmei". Confira também a pasta Spam.',{verify:true});return;
 }
 await getIdToken(user,true);
 const deniedEmail=await getDoc(doc(db,'deniedEmails',user.email.toLowerCase()));
 if(deniedEmail.exists()){panel('Este e-mail não está autorizado a enviar novos pedidos. Entre em contato com o administrador.',{denied:true});return}
 if(request.exists()){
  if(request.data().emailVerified!==true)await updateDoc(doc(db,'joinRequests',user.uid),{emailVerified:true});
  panel('Seu pedido foi recebido e aguarda análise do administrador. Você não precisa enviá-lo novamente.');return;
 }
 // Conta autenticada sem pedido: registrar somente com nome válido.
 const name=normalizeName(user.displayName||$('name').value||'');
 if(validName(name)){
  await createRequest(user,name);
  panel('Seu e-mail foi confirmado e o pedido foi enviado. Aguarde a aprovação do administrador.');return;
 }
 $('requestName').value=name;
 panel('E-mail confirmado. Informe seu nome para enviar o primeiro pedido.',{request:true});
}
async function start(){
 try{
  const app=getApps().length?getApp():initializeApp(firebaseConfig);auth=getAuth(app);auth.languageCode='pt-BR';db=getFirestore(app);
  onAuthStateChanged(auth,async user=>{
   const turn=++authTurn;
   if(stopRequest){stopRequest();stopRequest=null;}
   if(!user||busy)return;
   try{await checkAccess(user)}catch(err){if(turn===authTurn)message('Falha ao consultar seu cadastro: '+errText(err))}
   // Notifica recusas, aprovações e remoções no navegador sem recarregar.
   let previous=null;
   stopRequest=onSnapshot(doc(db,'joinRequests',user.uid),snap=>{
    if(turn!==authTurn)return;
    const current=snap.exists()?String(snap.data().status):'absent';
    if(previous!==null&&current!==previous&&!busy){checkAccess(user).catch(e=>message(errText(e)))}
    previous=current;
   },e=>console.warn('Pedido não sincronizado em tempo real:',e));
  },err=>message('Falha na autenticação: '+err.message));
  wait(false);message('Entre na sua conta ou solicite aprovação para participar.',true);
 }catch(err){message('Falha ao iniciar o Firebase. Abra no Safari/Chrome e recarregue.');}
}
$('loginToggle').onclick=()=>{
 registering=!registering;
 $('loginSubmit').textContent=registering?'Criar conta e verificar e-mail':'Entrar';
 $('loginToggle').textContent=registering?'Já tenho conta':'Criar conta';
 $('loginHeading').textContent=registering?'Solicitar acesso':'Entre para continuar';
 $('nameWrap').hidden=!registering;$('name').required=registering;
 $('password').autocomplete=registering?'new-password':'current-password';$('password').minLength=registering?8:1;
 message(registering?'O nome é obrigatório. A liberação depende da confirmação do e-mail e da aprovação do administrador.':'',true);
};
$('loginForm').onsubmit=async e=>{
 e.preventDefault();if(busy||!auth)return;wait(true);message('Verificando…',true);
 try{
  await persistence();const email=$('email').value.trim().toLowerCase(),pass=$('password').value;
  if(!validEmail(email))throw Error('Informe um e-mail completo e válido, como nome@dominio.com. Endereços como @teste não são aceitos.');
  if(registering){
   const name=normalizeName($('name').value);
   if(!validName(name))throw Error('Informe um nome válido de 2 a 60 caracteres.');
   const cred=await createUserWithEmailAndPassword(auth,email,pass);
   await updateProfile(cred.user,{displayName:name});
   await sendEmailVerification(cred.user);
   $('password').value='';
   panel('Enviamos uma mensagem para '+email+'. Confirme o endereço no link recebido e clique em "Já confirmei". Confira o Spam.',{verify:true});
  }else{
   const cred=await signInWithEmailAndPassword(auth,email,pass);
   $('password').value='';
   await checkAccess(cred.user);
  }
 }catch(err){message(errText(err))}finally{wait(false)}
};
$('retryRequest').onclick=async()=>{
 const user=auth?.currentUser;if(!user)return;
 wait(true);try{await createRequest(user,$('requestName').value);await checkAccess(user)}catch(e){message(errText(e))}finally{wait(false)}
};
$('resendVerification').onclick=async()=>{
 const user=auth?.currentUser;if(!user)return;
 wait(true);try{await sendEmailVerification(user);message('Novo e-mail de verificação enviado. Consulte também o Spam.',true)}catch(e){message(errText(e))}finally{wait(false)}
};
$('confirmVerification').onclick=async()=>{
 const user=auth?.currentUser;if(!user)return;
 wait(true);try{await reload(user);await getIdToken(user,true);if(!user.emailVerified)throw Error('Ainda não foi confirmada a propriedade do e-mail. Abra o link recebido primeiro.');await checkAccess(user)}catch(e){message(errText(e))}finally{wait(false)}
};
$('pendingLogout').onclick=async()=>{if(!auth)return;await signOut(auth);location.replace('./login.html')};
$('resetPassword').onclick=async()=>{
 if(busy||!auth)return;const email=$('email').value.trim().toLowerCase();if(!validEmail(email)){message('Digite um e-mail completo, como nome@dominio.com.');return}
 wait(true);try{await sendPasswordResetEmail(auth,email);message('Se o e-mail estiver cadastrado, procure também na pasta Spam do Gmail.',true)}catch(err){message(errText(err))}finally{wait(false)}
};
start();
