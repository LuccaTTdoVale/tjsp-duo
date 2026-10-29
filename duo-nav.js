/* TJSP DUO — Navegação protegida pela autenticação Firebase.
   O menu começa oculto e só é liberado ao confirmar uma sessão válida. */
(()=>{
  const links=[
    ['index.html','▦','Painel'],
    ['conteudo.html','▤','Aulas'],
    ['questoes.html','✎','Questões'],
    ['ranking.html','🏆','Ranking'],
    ['estatisticas.html','◉','Estatísticas'],
    ['historico.html','▥','Histórico'],
    ['caderno-erros.html','✕','Caderno de Erros'],
    ['perfil.html','👤','Meu perfil'],
    ['sobre.html','ⓘ','Sobre']
  ];
  const current=location.pathname.split('/').pop()||'index.html';
  // A regra é aplicada antes de inserir o botão, evitando que ele pisque no login.
  const secureStyles=document.createElement('style');
  secureStyles.textContent=`
    body:not(.duoNavAuthorized) #duoMenuButton {display:none!important}
    body:not(.duoNavAuthorized) #duoSidebar,
    body:not(.duoNavAuthorized) #duoMenuMask {visibility:hidden!important;pointer-events:none!important}
    body:has(#authGate):not(.logged) #duoMenuButton {display:none!important}
  `;
  document.head.appendChild(secureStyles);
  const wrapper=document.createElement('div');
  wrapper.innerHTML=`
    <button class="duoMenuBtn" id="duoMenuButton" type="button" aria-expanded="false" aria-controls="duoSidebar" aria-label="Abrir menu de navegação">☰</button>
    <div class="duoMenuMask" id="duoMenuMask"></div>
    <aside id="duoSidebar" class="duoSide" role="dialog" aria-modal="true" aria-label="Navegação" aria-hidden="true">
      <div class="duoSideHead"><span class="duoSideMark">⚖</span>
        <div><div class="duoSideName">TJSP <strong>Duo</strong></div><div class="duoSideSub">Sua jornada de aprovação</div></div>
        <button class="duoSideClose" type="button" aria-label="Fechar menu" id="duoMenuClose">✕</button>
      </div>
      <nav class="duoSideLinks" aria-label="Seções do site">
        ${links.map(([p,i,n])=>`<a href="./${p}" ${p===current?'aria-current="page"':''}><span class="duoNavIcon" aria-hidden="true">${i}</span>${n}</a>`).join('')}
      </nav>
      <div class="duoSideFooter">Projeto independente de preparação para concursos. Não afiliado ao Tribunal de Justiça.</div>
    </aside>`;
  document.body.append(wrapper);
  const button=document.getElementById('duoMenuButton');
  const mask=document.getElementById('duoMenuMask');
  const panel=document.getElementById('duoSidebar');
  const close=document.getElementById('duoMenuClose');
  let previous=null;
  function toggle(open){
    if(open&&!document.body.classList.contains('duoNavAuthorized'))return;
    document.body.classList.toggle('duoMenuOpen',open);
    button.setAttribute('aria-expanded',String(open));
    panel.setAttribute('aria-hidden',String(!open));
    if(open){previous=document.activeElement;close.focus();}
    else if(previous&&document.contains(previous)){previous.focus();previous=null;}
  }
  button.addEventListener('click',()=>toggle(true));
  close.addEventListener('click',()=>toggle(false));
  mask.addEventListener('click',()=>toggle(false));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&document.body.classList.contains('duoMenuOpen'))toggle(false);
    if(e.key==='Tab'&&document.body.classList.contains('duoMenuOpen')){
      const els=[close,...panel.querySelectorAll('a')];
      if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els[els.length-1].focus();}
      else if(!e.shiftKey&&document.activeElement===els[els.length-1]){e.preventDefault();els[0].focus();}
    }
  });
  // Usamos a mesma instância Firebase do app e observamos mudanças de sessão.
  Promise.all([
    import('https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js'),
    import('./firebase-config.js')
  ]).then(([firebase,authLib,config])=>{
    const app=firebase.getApps().length?firebase.getApp():firebase.initializeApp(config.firebaseConfig);
    authLib.onAuthStateChanged(authLib.getAuth(app),user=>{
      const loggedIn=Boolean(user);
      document.body.classList.toggle('duoNavAuthorized',loggedIn);
      if(!loggedIn)toggle(false);
    },err=>{
      document.body.classList.remove('duoNavAuthorized');
      toggle(false);
      console.warn('TJSP Duo: não foi possível validar o menu:',err);
    });
  }).catch(err=>{
    // Falha de rede/autenticação: falha fechada, sem permitir navegar pelo menu.
    document.body.classList.remove('duoNavAuthorized');
    console.warn('TJSP Duo: menu indisponível enquanto a autenticação não é validada.',err);
  });
})();
