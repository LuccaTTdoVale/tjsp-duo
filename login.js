import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,sendPasswordResetEmail,signOut,deleteUser,setPersistence,browserLocalPersistence,browserSessionPersistence} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,runTransaction} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id);
const allowed=new Set(['index.html','conteudo.html','calendario.html','questoes.html','ranking.html','estatisticas.html','historico.html','caderno-erros.html','perfil.html','sobre.html']);
function destination(){
 const raw=new URLSearchParams(location.search).get('next');if(!raw)return './index.html';
 try{const v=new URL(raw,location.href),dir=location.pathname.slice(0,location.pathname.lastIndexOf('/')+1);
  if(v.origin!==location.origin||v.pathname.slice(0,v.pathname.lastIndexOf('/')+1)!==dir||!allowed.has(v.pathname.split('/').pop()))return './index.html';
  return v.pathname+v.search+v.hash;
 }catch{return './index.html';}
}
const next=destination();let auth,db,busy=false,registering=false;
const slots=['1','2','3','4','5'];
function message(msg,good=false){$('loginMessage').textContent=msg;$('loginMessage').dataset.kind=good?'note':'error';}
function wait(b){busy=b;for(const id of ['loginSubmit','loginToggle','resetPassword'])$(id).disabled=b;}
function errText(err){const s=String(err?.code||'')+' '+String(err?.message||'');
 if(/invalid-credential|wrong-password|user-not-found/.test(s))return 'E-mail ou senha incorretos. Use Esqueci minha senha para recuperar.';
 if(/email-already-in-use/.test(s))return 'E-mail já cadastrado. Clique em Entrar.';
 if(/weak-password/.test(s))return 'A senha precisa ter pelo menos 8 caracteres.';
 if(/too-many-requests/.test(s))return 'Muitas tentativas. Tente mais tarde ou recupere sua senha.';
 if(/network-request-failed/.test(s))return 'Sem conexão. Tente abrir diretamente no Safari ou Chrome.';
 return err?.message||'Não foi possível concluir. Tente novamente.';
}
async function profileSlot(uid){
 const checks=await Promise.all(slots.map(async id=>{const d=await getDoc(doc(db,'slots',id));return d.exists()&&d.data().uid===uid?id:null;}));
 const id=checks.find(Boolean);if(!id)return null;
 const profile=await getDoc(doc(db,'profiles',id));return profile.exists()&&profile.data().uid===uid?id:null;
}
async function persistence(){
 try{await setPersistence(auth,browserLocalPersistence)}
 catch{try{await setPersistence(auth,browserSessionPersistence);message('Seu navegador limita o login permanente. Prefira Safari ou Chrome para manter a sessão.',true)}
 catch{throw Error('O navegador não permite armazenar sessões. Abra o site no Safari ou Chrome.')}}
}
function go(){location.replace(next)}
async function start(){
 try{
  const app=getApps().length?getApp():initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
  onAuthStateChanged(auth,async user=>{
   if(!user||busy)return;
   try{const slot=await profileSlot(user.uid);if(slot)go();else message('Sua conta não está vinculada a um perfil TJSP DUO. Use seu cadastro original.');}
   catch{message('Não foi possível verificar o perfil. Verifique a conexão e tente novamente.');}
  },err=>message('Falha na autenticação: '+err.message));
  wait(false);message('Você pode entrar com a mesma conta em qualquer dispositivo.',true);
 }catch(err){message('Falha ao iniciar o Firebase. Abra no Safari ou Chrome e recarregue.');}
}
$('loginToggle').onclick=()=>{registering=!registering;$('loginSubmit').textContent=registering?'Criar minha conta':'Entrar';$('loginToggle').textContent=registering?'Já tenho conta':'Criar conta';$('password').autocomplete=registering?'new-password':'current-password';$('password').minLength=registering?8:1;message('',true)};
$('loginForm').onsubmit=async e=>{
 e.preventDefault();if(busy||!auth)return;wait(true);message('Autenticando…',true);
 try{
  await persistence();const email=$('email').value.trim().toLowerCase(),pass=$('password').value;
  if(registering){
   const cred=await createUserWithEmailAndPassword(auth,email,pass);let chosen=null;
   try{
    for(const slot of slots){
     try{await runTransaction(db,async tx=>{const ref=doc(db,'slots',slot),snap=await tx.get(ref);if(snap.exists())throw Error('Ocupado');tx.set(ref,{uid:cred.user.uid})});chosen=slot;break;}
     catch(err){if(err.message!=='Ocupado')throw err}
    }
    if(!chosen)throw Error('As cinco vagas estão ocupadas.');
    await setDoc(doc(db,'profiles',chosen),{uid:cred.user.uid,username:email.split('@')[0].slice(0,32),goal:20,answered:0,correct:0,wrong:0,distinct:0,daily:{},streak:0,exams:0,subjectStats:{},topicStats:{}});
   }catch(err){if(!chosen){try{await deleteUser(cred.user)}catch{try{await signOut(auth)}catch{}}}throw err}
  }else{await signInWithEmailAndPassword(auth,email,pass)}
  if(!await profileSlot(auth.currentUser.uid))throw Error('Seu login não possui perfil no TJSP DUO.');
  $('password').value='';go();
 }catch(err){message(errText(err))}finally{wait(false)}
};
$('resetPassword').onclick=async()=>{
 if(busy||!auth)return;const email=$('email').value.trim();if(!email.includes('@')){message('Digite seu e-mail para receber a recuperação de senha.');return}
 wait(true);try{await sendPasswordResetEmail(auth,email);message('Se o e-mail estiver cadastrado, confira a caixa de entrada e o spam.',true)}catch(err){message(errText(err))}finally{wait(false)}
};
start();
