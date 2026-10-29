/* TJSP Duo: Painel — 2 matérias, 20–40 questões e progresso automático. */
(()=>{
 const plan=window.TJSPStudyPlan,host=document.getElementById('dailyStudyPlan');if(!host||!plan)return;
 const safe=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const date=plan.today(),labelDate=new Date(date+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'});
 const link=t=>t.lesson?'./conteudo.html?lesson='+encodeURIComponent(t.lesson.id):t.url||'';
 let allLessons=null;
 function drawProgress(){
  const target=document.getElementById('dailyProgress');if(!target)return;
  const api=window.TJSPDailyActivity,rec=api?.getDay(date);
  if(!rec){target.innerHTML='<p class="helper">Conectando o acompanhamento de estudo...</p>';return}
  const min=Math.floor(rec.seconds/60),questions=rec.questions,achieved=rec.status==='done';
  target.innerHTML='<h3>Sua meta automática de hoje '+(achieved?'✓':'')+'</h3>'+
   '<p class="helper">Conclua <b>2 horas de estudo ativo</b> <em>OU</em> <b>50 questões respondidas</b>. A recomendação de treino é de 20 a 40 questões; 50 é a alternativa para cumprir a meta do calendário.</p>'+
   '<div class="duoActivityRow"><span>Tempo ativo</span><strong>'+min+' / 120 min</strong></div><div class="duoProgressTrack"><i style="width:'+Math.min(100,rec.seconds/7200*100)+'%"></i></div>'+
   '<div class="duoActivityRow"><span>Questões respondidas</span><strong>'+questions+' / 50</strong></div><div class="duoProgressTrack"><i style="width:'+Math.min(100,questions/50*100)+'%"></i></div>'+
   '<p class="duoActivityStatus">'+(achieved?'✓ Meta do dia cumprida.':rec.status==='signin'?'Entre na conta para iniciar a contagem automática.':'Em andamento · o tempo só conta com a aba ativa e interação recente.')+'</p>';
 }
 const tasks=t=>'<div class="dailyTask"><div><strong>'+safe(t.type==='lesson'?(t.subject||t.label)+' — '+(t.lesson?.title||'Assunto a definir'):t.label)+'</strong><small>'+safe(t.type==='practice'?'Meta sugerida: 20 a 40 questões':t.minutes+' min')+'</small></div>'+(link(t)?'<a href="'+safe(link(t))+'">'+(t.type==='lesson'?'Abrir aula →':t.type==='practice'?'Treinar →':'Acessar →')+'</a>':'')+'</div>';
 function renderStudyTasks(lessons){
  const tasksList=plan.tasksFor(date,lessons,window.TJSPDailyActivity?.getCompletedLessons?.());
  host.innerHTML='<div class="eyebrow">SEU PLANO DE HOJE · '+safe(plan.stage(date))+'</div><h2 class="subhead">O que estudar hoje? 📚</h2><p class="helper">'+safe(labelDate)+' · Sequência recomendada, respeitando as aulas ainda pendentes.</p>'+
   '<div class="dailyTasks">'+tasksList.map(tasks).join('')+'</div>'+
   '<div id="dailyProgress" class="duoDailyProgress" aria-live="polite"></div>'+
   '<a class="dailyGo" href="./calendario.html">📅 Consultar calendário completo até 14/03/2027 →</a>';
  drawProgress();
 }
 fetch('./aulas.json?v=7').then(r=>{if(!r.ok)throw Error('Aulas indisponíveis');return r.json()}).then(lessons=>{
  allLessons=lessons;renderStudyTasks(lessons);
  drawProgress();

 }).catch(()=>{host.innerHTML='<h2 class="subhead">Plano de estudos</h2><p>Consulte as atividades diárias no calendário.</p><a class="dailyGo" href="./calendario.html">Abrir calendário →</a>'});
 let progressKey='';document.addEventListener('tjsp:study-progress',()=>{const key=JSON.stringify(window.TJSPDailyActivity?.getCompletedLessons?.()||{});if(allLessons&&key!==progressKey){progressKey=key;renderStudyTasks(allLessons);}else drawProgress();});
})();
