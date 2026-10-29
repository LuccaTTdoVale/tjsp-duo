import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,updateDoc} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';

const app=getApps().length?getApp():initializeApp(firebaseConfig);
const auth=getAuth(app), db=getFirestore(app);
const $=id=>document.getElementById(id);
let currentUid=null, profileRef=null, originalName='';

function message(text,type='bad'){
  const box=$('profileMessage');
  box.textContent=text;
  box.className='profileMsg '+type;
}
function enableForm(enabled){$('profileDisplayName').disabled=!enabled;$('profileSave').disabled=!enabled;}
function normalizeName(raw){return String(raw||'').normalize('NFC').trim().replace(/\s+/g,' ');}
async function findProfile(uid){
  for(const id of ['1','2','3','4','5']){
    const slot=await getDoc(doc(db,'slots',id));
    if(slot.exists()&&slot.data().uid===uid){
      const reference=doc(db,'profiles',id);
      const result=await getDoc(reference);
      if(!result.exists()||result.data().uid!==uid)throw new Error('Seu perfil não está disponível para esta conta.');
      return {reference,data:result.data()};
    }
  }
  throw new Error('Esta conta não possui um perfil vinculado no TJSP DUO.');
}

onAuthStateChanged(auth,async user=>{
  enableForm(false);
  if(!user){location.replace('./index.html');return;}
  currentUid=user.uid;
  $('profileEmail').textContent=user.email||'(e-mail não disponível)';
  try{
    const {reference,data}=await findProfile(user.uid);
    if(auth.currentUser?.uid!==user.uid)return;
    profileRef=reference;
    originalName=data.username||user.email?.split('@')[0]||'Estudante';
    $('profileCurrentName').textContent=originalName;
    $('profileDisplayName').value=originalName;
    enableForm(true);
  }catch(err){message('Não foi possível carregar seu perfil: '+err.message);}
},err=>message('Falha na autenticação: '+err.message));

$('profileForm').addEventListener('submit',async event=>{
  event.preventDefault();
  if(!profileRef||!auth.currentUser||auth.currentUser.uid!==currentUid){message('Entre na sua conta novamente para alterar o nome.');return;}
  const name=normalizeName($('profileDisplayName').value);
  if(name.length<2||name.length>32){message('Informe um nome com 2 a 32 caracteres.');return;}
  if(!/^[\p{L}\p{M}\p{N} .'-]+$/u.test(name)){
    message('Use somente letras, números, espaços, ponto, apóstrofo ou hífen.');return;
  }
  enableForm(false);
  message('Salvando seu nome...','good');
  try{
    // A autorização também é verificada pelo Firestore: cada perfil é editável apenas por seu dono.
    const snapshot=await getDoc(profileRef);
    if(!snapshot.exists()||snapshot.data().uid!==auth.currentUser?.uid)throw new Error('Sua sessão mudou. Entre novamente.');
    await updateDoc(profileRef,{username:name});
    originalName=name;
    $('profileCurrentName').textContent=name;
    $('profileDisplayName').value=name;
    message('Nome atualizado! Ao abrir o Ranking ou o Painel, o novo nome já aparecerá.','good');
  }catch(err){message('Não foi possível salvar o nome. '+(err?.code==='permission-denied'?'Verifique as regras de acesso do Firestore.':err.message));}
  finally{if(auth.currentUser?.uid===currentUid)enableForm(true);}
});
