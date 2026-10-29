/* Cartão de estudo diário: carregamento progressivo, sem dependência de Firebase. */
(()=>{
const plan=window.TJSPStudyPlan,host=document.getElementById('dailyStudyPlan');if(!host||!plan)return;
const safe=s=>String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const day=plan.today();
fetch('./aulas.json?v=7').then(r=>r.json()).then(lessons=>{
const tasks=plan.tasksFor(day,lessons);
host.innerHTML='<div class="eyebrow">SEU PLANO DE HOJE · '+safe(plan.stage(day))+'</div><h2 class="subhead">O que estudar hoje? 📚</h2><p class="helper">'+new Date(day+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long'})+' · Roteiro sugerido de acordo com o edital TJSP 2026.</p>'+
'<div class="dailyTasks">'+tasks.map(t=>'<div class="dailyTask"><div><strong>'+safe(t.lesson?t.subject+' — '+t.lesson.title:t.subject?t.subject+' — '+t.label:t.label)+'</strong><small>'+t.minutes+' min</small></div>'+(t.lesson?'<a href="./conteudo.html?lesson='+encodeURIComponent(t.lesson.id)+'">Abrir aula →</a>':t.url?'<a href="'+safe(t.url)+'">Abrir →</a>':'')+'</div>').join('')+'</div>'+
'<a class="dailyGo" href="./calendario.html"><span>📅</span> Consultar calendário completo até 14/03/2027 →</a>';
}).catch(()=>{host.innerHTML='<h2 class="subhead">Plano de estudos</h2><p>Consulte as atividades diárias no calendário.</p><a class="dailyGo" href="./calendario.html">Abrir calendário →</a>'});
})();
