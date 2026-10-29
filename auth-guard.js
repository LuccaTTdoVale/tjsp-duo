/* TJSP DUO V9 — interface de acesso protegida.
   Atenção: GitHub Pages serve arquivos públicos; segurança dos dados depende das regras do Firestore. */
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
const overlay=document.getElementById('tjspSessionShield');
const shieldText=document.getElementById('tjspShieldMessage');
const signInLink=document.getElementById('tjspShieldLogin');
const currentFile=location.pathname.split('/').pop()||'index.html';
const intended=currentFile+location.search+location.hash;
const loginUrl='./login.html?next='+encodeURIComponent(intended);
if(signInLink)signInLink.href=loginUrl;
const showError=(msg)=>{
  document.documentElement.removeAttribute('data-tjsp-session');
  if(shieldText)shieldText.textContent=msg;
  overlay?.classList.add('tjspShieldError');
};
try{
  const app=getApps().length?getApp():initializeApp(firebaseConfig);
  const auth=getAuth(app),db=getFirestore(app);
  let generation=0;
  const slotIds=['1','2','3','4','5'];
  // Não mostramos o site apenas porque há um usuário Auth; ele precisa possuir um perfil autorizado.
  onAuthStateChanged(auth,async user=>{
    const turn=++generation;
    if(!user){location.replace(loginUrl);return;}
    if(shieldText)shieldText.textContent='Verificando seu perfil e restaurando a sessão…';
    try{
      const slots=await Promise.all(slotIds.map(async id=>{
        const s=await getDoc(doc(db,'slots',id));
        return s.exists()&&s.data().uid===user.uid?id:null;
      }));
      if(turn!==generation)return;
      const id=slots.find(Boolean);
      if(!id){showError('Esta conta não está vinculada a um perfil do TJSP DUO. Entre com a conta cadastrada.');return;}
      const profile=await getDoc(doc(db,'profiles',id));
      if(turn!==generation)return;
      if(!profile.exists()||profile.data().uid!==user.uid){showError('Não foi possível validar seu perfil. Confirme a conta utilizada no login.');return;}
      document.documentElement.setAttribute('data-tjsp-session','ready');
      overlay?.remove();
      window.dispatchEvent(new CustomEvent('tjsp:session-ready',{detail:{uid:user.uid,slot:id}}));
    }catch(err){
      if(turn!==generation)return;
      console.error('TJSP Duo: verificação do perfil',err);
      showError('Não foi possível confirmar sua sessão. Verifique a conexão e toque em Recarregar. Seus dados não foram apagados.');
    }
  },err=>showError('Falha ao recuperar a autenticação. Recarregue a página ou entre novamente.'));
}catch(err){
  console.error('TJSP Duo: inicialização do Firebase',err);
  showError('Falha ao iniciar o Firebase. Confira sua conexão, abra no Safari/Chrome e tente novamente.');
}
