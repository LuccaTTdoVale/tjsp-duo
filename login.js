import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut,setPersistence,browserLocalPersistence,browserSessionPersistence} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
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
const next=destination();let auth,db,busy=false,registering=false;
function message(msg,good=false){$('loginMessage').textContent=msg;$('loginMessage').dataset.kind=good?'note':'error';}
function wait(b){busy=b;for(const id of ['loginSubmit','loginToggle','resetPassword','retryRequest','pendingLogout']){if($(id))$(id).disabled=b;}}
function errText(err){const s=String(err?.code||'')+' '+String(err?.message||'');
 if(/invalid-credential|wrong-password|user-not-found/.test(s))return 'E-mail ou senha incorretos. Use Esqueci a senha para recuperar.';
 if(/email-already-in-use/.test(s))return 'E-mail já cadastrado. Clique em Entrar.';
 if(/weak-password/.test(s))return 'Use uma senha com pelo menos 8 caracteres.';
 if(/too-many-requests/.test(s))return 'Muitas tentativas. Tente mais tarde.';
 if(/permission-denied|insufficient permissions/.test(s))return 'O cadastro precisa das novas regras do Firestore. Avise o administrador.';
 if(/network-request-failed/.test(s))return 'Sem conexão. Prefira abrir no Safari ou Chrome.';
 return err?.message||'Não foi possível concluir. Tente novamente.';
}
function normalizeName(v){return String(v||'').normalize('NFC').trim().replace(/\s+/g,' ');}
function validName(v){return v.length>=2&&v.length<=60&&/^[A-Za-zÀ-ÖØ-öø-ÿ0-9 ._-]+$/.test(v)&&/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(v)}
async function profileSlot(uid){
 for(const id of slots){const s=await getDoc(doc(db,'slots',id));if(s.exists()&&s.data().uid===uid){const p=await getDoc(doc(db,'profiles',id));return p.exists()&&p.data().uid===uid?{id,blocked:p.data().blocked===true}:null}}
 return null;
}
async function persistence(){
 try{await setPersistence(auth,browserLocalPersistence)}
 catch{try{await setPersistence(auth,browserSessionPersistence);message('Este navegador limita a sessão permanente. Prefira Safari ou Chrome.',true)}
 catch{throw Error('O navegador não permite armazenar sessões. Abra no Safari ou Chrome.')}}
}
function pending(show,msg,canRequest=false){
 $('pendingPanel').hidden=!show;
 $('loginForm').hidden=show;
 $('loginToggle').hidden=show;
 $('resetPassword').hidden=show;
 $('requestNameWrap').hidden=!canRequest;
 $('retryRequest').hidden=!canRequest;
 if(msg)$('pendingDescription').textContent=msg;
}
async function createRequest(user,name){
 const clean=normalizeName(name);
 if(!validName(clean))throw Error('Informe um nome de 2 a 60 caracteres, com letras.');
 if(!user?.email)throw Error('A conta precisa de um e-mail.');
 const ref=doc(db,'joinRequests',user.uid),old=await getDoc(ref);
 if(old.exists())return old.data();
 await setDoc(ref,{uid:user.uid,email:user.email,name:clean,status:'pending',createdAt:serverTimestamp()});
 return {status:'pending'};
}
async function checkAccess(user){
 const profile=await profileSlot(user.uid);
 if(profile&&!profile.blocked){location.replace(next);return}
 if(profile?.blocked){pending(true,'O acesso a esta conta foi suspenso pelo administrador. Entre em contato com ele.');message('Conta com acesso suspenso.');return}
 const request=await getDoc(doc(db,'joinRequests',user.uid));
 if(!request.exists()){
  pending(true,'Esta conta existe, mas ainda não solicitou acesso. Informe seu nome para enviar o pedido.',true);
  $('requestName').value=$('name').value.trim()||user.displayName||'';
  message('Aguardando solicitação de cadastro.',true);return;
 }
 const data=request.data();
 const states={pending:'Seu cadastro foi recebido e aguarda aprovação do administrador.',rejected:'Seu pedido de acesso não foi aprovado. Entre em contato com o administrador.',approved:'Seu pedido foi aprovado, mas o perfil ainda não está disponível. Avise o administrador.'};
 pending(true,states[data.status]||'Solicitação registrada. Aguardando administrador.');
 message(data.status==='rejected'?'Acesso não autorizado.':'Pedido registrado.',data.status!=='rejected');
}
async function start(){
 try{
  const app=getApps().length?getApp():initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
  onAuthStateChanged(auth,async user=>{
   if(!user||busy)return;
   try{await checkAccess(user)}catch(err){message('Não foi possível verificar o acesso: '+errText(err));}
  },err=>message('Falha na autenticação: '+err.message));
  wait(false);message('Entre na sua conta ou solicite aprovação para participar.',true);
 }catch(err){message('Falha ao iniciar o Firebase. Abra no Safari/Chrome e recarregue.');}
}
$('loginToggle').onclick=()=>{
 registering=!registering;
 $('loginSubmit').textContent=registering?'Solicitar cadastro':'Entrar';
 $('loginToggle').textContent=registering?'Já tenho conta':'Criar conta';
 $('loginHeading').textContent=registering?'Solicitar acesso':'Entre para continuar';
 $('nameWrap').hidden=!registering;$('name').required=registering;
 $('password').autocomplete=registering?'new-password':'current-password';$('password').minLength=registering?8:1;
 message(registering?'Seu acesso só será liberado após aprovação. Informe o nome pelo qual deseja ser identificado.':'',true);
};
$('loginForm').onsubmit=async e=>{
 e.preventDefault();if(busy||!auth)return;wait(true);message('Verificando…',true);
 try{
  await persistence();const email=$('email').value.trim().toLowerCase(),pass=$('password').value;
  if(registering){
   const name=normalizeName($('name').value);
   if(!validName(name))throw Error('Informe um nome válido de 2 a 60 caracteres.');
   const cred=await createUserWithEmailAndPassword(auth,email,pass);
   await createRequest(cred.user,name);
   $('password').value='';
   await checkAccess(cred.user);
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
$('pendingLogout').onclick=async()=>{if(!auth)return;await signOut(auth);location.replace('./login.html')};
$('resetPassword').onclick=async()=>{
 if(busy||!auth)return;const email=$('email').value.trim();if(!email.includes('@')){message('Digite seu e-mail para receber a recuperação de senha.');return}
 wait(true);try{await sendPasswordResetEmail(auth,email);message('Se o e-mail estiver cadastrado, procure também na pasta Spam do Gmail.',true)}catch(err){message(errText(err))}finally{wait(false)}
};
start();
