/* Calendário V8 — metas automáticas: 2h ativas OU 50 questões, sem checkboxes manuais. */
const plan=window.TJSPStudyPlan,$=id=>document.getElementById(id);
const display=s=>new Date(s+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'});
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let lessons=[],month=plan.today().slice(0,7),selected=plan.today();
if(selected<plan.START)selected=plan.START;if(selected>plan.EXAM)selected=plan.EXAM;month=selected.slice(0,7);
const activity=d=>window.TJSPDailyActivity?.getDay(d)||{seconds:0,questions:0,status:'signin'};
const addMonth=(x,step)=>{const [y,m]=x.split('-').map(Number);return new Date(Date.UTC(y,m-1+step,1)).toISOString().slice(0,7)};
const taskUrl=t=>t.lesson?'./conteudo.html?lesson='+encodeURIComponent(t.lesson.id):t.url||'';
function statusText(s){return ({done:'✓ Meta cumprida',missed:'✕ Meta não cumprida',pending:'⏳ Em andamento',future:'Aguardando',untracked:'Sem registro anterior',signin:'Entre para acompanhar'})[s]||'—'}
function render(){
 const actual=plan.today();$('daysRemaining').textContent=Math.max(0,plan.diff(plan.EXAM)-plan.diff(actual));
 $('monthTitle').textContent=new Date(month+'-15T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'});
 $('prevMonth').disabled=addMonth(month,-1)<plan.START.slice(0,7);$('nextMonth').disabled=addMonth(month,1)>plan.EXAM.slice(0,7);
 const [year,mm]=month.split('-').map(Number),first=new Date(Date.UTC(year,mm-1,1)),last=new Date(Date.UTC(year,mm,0)).getUTCDate();
 const cells=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(n=>'<div class="dayName">'+n+'</div>');
 for(let i=0;i<(first.getUTCDay()+6)%7;i++)cells.push('<div class="day blank"></div>');
 for(let day=1;day<=last;day++){
  const iso=month+'-'+String(day).padStart(2,'0'),valid=iso>=plan.START&&iso<=plan.EXAM;
  const wd=new Date(iso+'T12:00:00Z').getUTCDay();
  const status=valid?activity(iso).status:'untracked';
  const cls=['day',iso===actual?'current':'',iso===selected?'selected':'',wd===0||wd===6?'weekend':'','st-'+status].join(' ');
  const symbol=status==='done'?'✓':status==='missed'?'✕':status==='pending'?'·':'';
  cells.push('<button type="button" class="'+cls+'" data-date="'+iso+'" '+(!valid?'disabled':'')+' aria-label="'+safe(display(iso))+' — '+safe(statusText(status))+'"><b>'+day+'</b><small>'+symbol+' '+(wd===6?'Simulado':wd===0?'Revisão':'Estudo')+'</small></button>');
 }
 $('calendarGrid').innerHTML=cells.join('');
 $('calendarGrid').querySelectorAll('[data-date]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.date;render()}));
 $('selectedStage').textContent=plan.stage(selected).toUpperCase();
 $('selectedTitle').textContent=selected===plan.EXAM?'Dia da prova prevista':new Date(selected+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',weekday:'long'});
 $('selectedDate').textContent=display(selected);
 const record=activity(selected),mins=Math.floor(record.seconds/60);
 const details=$('automaticStatus');
 if(details)details.innerHTML='<div class="duoAutoStatus st-'+record.status+'"><strong>'+safe(statusText(record.status))+'</strong>'+
 '<div>Tempo ativo: <b>'+mins+' / 120 min</b> · Questões: <b>'+record.questions+' / 50</b></div>'+
 '<small>Critério automático: 2 horas ativas OU 50 questões (aulas + simulados finalizados). Sem cliques manuais. Tempo de abas ocultas ou sem interação recente não conta.</small></div>';
 $('dayTasks').innerHTML=plan.tasksFor(selected,lessons,window.TJSPDailyActivity?.getCompletedLessons?.()).map(t=>{
  const label=t.type==='lesson'?(t.subject||t.label)+' — '+(t.lesson?.title||'Assunto pendente'):t.label;
  const url=taskUrl(t);
  return '<div class="task"><span class="duoTaskMarker" aria-hidden="true">•</span><div class="taskText"><strong>'+safe(label)+'</strong>'+(url?'<div><a href="'+safe(url)+'">'+(t.type==='lesson'?'Abrir esta aula →':t.type==='exam'||t.type==='essay'?'Abrir Modo Prova →':'Acessar →')+'</a></div>':'')+'</div><span class="taskMinutes">'+(t.minutes?t.minutes+' min':'')+'</span></div>';
 }).join('');
 const msg=$('saveStatus');if(msg)msg.textContent=record.status==='signin'?'Entre na conta para iniciar o acompanhamento.':record.status==='untracked'?'O sistema não inventa resultados de dias anteriores à ativação.':'O registro é automático e separado por usuário.';
}
$('prevMonth').addEventListener('click',()=>{month=addMonth(month,-1);render()});
$('nextMonth').addEventListener('click',()=>{month=addMonth(month,1);render()});
render();
document.addEventListener('tjsp:study-progress',render);
fetch('./aulas.json?v=7').then(r=>{if(!r.ok)throw Error('Aulas indisponíveis');return r.json()}).then(data=>{lessons=data;render()}).catch(()=>{$('saveStatus').textContent='Não foi possível carregar as aulas. Confira aulas.json.'});
