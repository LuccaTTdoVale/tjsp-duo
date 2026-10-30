/* TJSP DUO — Navegação protegida pela autenticação Firebase.
   O menu começa oculto e só é liberado ao confirmar uma sessão válida. */
(()=>{
  const links=[
    ['index.html','▦','Painel'],
    ['conteudo.html','▤','Aulas'],
    ['calendario.html','▦','Calendário'],
    ['questoes.html','✎','Questões'],
    ['ranking.html','🏆','Ranking'],
    ['estatisticas.html','◉','Estatísticas'],
    ['historico.html','▥','Histórico'],
    ['caderno-erros.html','✕','Caderno de Erros'],
    ['perfil.html','👤','Meu perfil'],
    ['admin.html','⚙','Administração'],
    ['sobre.html','ⓘ','Sobre']
  ];
  const current=location.pathname.split('/').pop()||'index.html';
  // A regra é aplicada antes de inserir o botão, evitando que ele pisque no login.
  const secureStyles=document.createElement('style');
  secureStyles.textContent=`
    #duoSidebar a[hidden]{display:none!important}
    html:not([data-tjsp-session="ready"]) #duoMenuButton,body:not(.duoNavAuthorized) #duoMenuButton {display:none!important}
    html:not([data-tjsp-session="ready"]) #duoSidebar,html:not([data-tjsp-session="ready"]) #duoMenuMask,body:not(.duoNavAuthorized) #duoSidebar,
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
  const adminLink=panelAdminLink();
  function panelAdminLink(){const a=wrapper.querySelector('a[href="./admin.html"]');if(a)a.hidden=true;return a;}
  const button=document.getElementById('duoMenuButton');
  const mask=document.getElementById('duoMenuMask');
  const panel=document.getElementById('duoSidebar');
  const close=document.getElementById('duoMenuClose');
  let previous=null;
  function toggle(open){
    if(open&&(!document.body.classList.contains('duoNavAuthorized')||document.documentElement.dataset.tjspSession!=='ready'))return;
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
    import('./firebase-config.js'),
    import('https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js')
  ]).then(([firebase,authLib,config,fs])=>{
    const app=firebase.getApps().length?firebase.getApp():firebase.initializeApp(config.firebaseConfig);
    authLib.onAuthStateChanged(authLib.getAuth(app),async user=>{
      const loggedIn=Boolean(user);
      document.body.classList.toggle('duoNavAuthorized',loggedIn);
      if(!loggedIn){toggle(false);if(adminLink)adminLink.hidden=true;}
      else {try{await fs.getDocs(fs.collection(fs.getFirestore(app),'joinRequests'));if(adminLink)adminLink.hidden=false;}catch{if(adminLink)adminLink.hidden=true;}}
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
