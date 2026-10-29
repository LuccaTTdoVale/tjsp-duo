import {initializeApp,getApp,getApps} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,updateDoc} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const app=getApps().length?getApp():initializeApp(firebaseConfig);
const auth=getAuth(app), db=getFirestore(app),plan=window.TJSPStudyPlan,$=id=>document.getElementById(id);
const display=s=>new Date(s+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let lessons=[],currentUid=null,slot=null,completed={},month=plan.today().slice(0,7),selected=plan.today(),saving=false;
if(selected<plan.START)selected=plan.START;if(selected>plan.EXAM)selected=plan.EXAM;
month=selected.slice(0,7);
function addMonth(x,step){const [y,m]=x.split('-').map(Number),d=new Date(Date.UTC(y,m-1+step,1));return d.toISOString().slice(0,7)}
function taskUrl(task){if(task.lesson)return './conteudo.html?lesson='+encodeURIComponent(task.lesson.id);return task.url||''}
function getState(date){const a=completed[date];return Array.isArray(a)?a:[]}
function paint(){
 const actual=plan.today();$('daysRemaining').textContent=Math.max(0,plan.diff(plan.EXAM)-plan.diff(actual));
 $('monthTitle').textContent=new Date(month+'-15T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'});
 $('prevMonth').disabled=addMonth(month,-1)<plan.START.slice(0,7);$('nextMonth').disabled=addMonth(month,1)>plan.EXAM.slice(0,7);
 const [year,mm]=month.split('-').map(Number),first=new Date(Date.UTC(year,mm-1,1)),last=new Date(Date.UTC(year,mm,0)).getUTCDate();
 let cells=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(n=>'<div class="dayName">'+n+'</div>');
 const offset=(first.getUTCDay()+6)%7;for(let i=0;i<offset;i++)cells.push('<div class="day blank"></div>');
 for(let day=1;day<=last;day++){
  const iso=month+'-'+String(day).padStart(2,'0'),wd=new Date(iso+'T12:00:00Z').getUTCDay();
  const valid=iso>=plan.START&&iso<=plan.EXAM;
  const tasks=valid?plan.tasksFor(iso,lessons):[],done=tasks.length&&tasks.every((t,i)=>getState(iso).includes(i));
  const cls=['day',iso===actual?'current':'',iso===selected?'selected':'',wd===0||wd===6?'weekend':'',done?'done':''].join(' ');
  cells.push('<button type="button" class="'+cls+'" data-date="'+iso+'" '+(!valid?'disabled':'')+' aria-label="'+escape(display(iso))+'"><b>'+day+'</b><small>'+(!valid?'':done?'Concluído':wd===6?'Simulado':wd===0?'Revisão':'Estudo')+'</small></button>');
 }
 $('calendarGrid').innerHTML=cells.join('');
 $('calendarGrid').querySelectorAll('[data-date]').forEach(b=>b.addEventListener('click',()=>{selected=b.dataset.date;paint()}));
 $('selectedStage').textContent=plan.stage(selected).toUpperCase();$('selectedTitle').textContent=selected===plan.EXAM?'Dia da prova prevista':new Date(selected+'T12:00:00Z').toLocaleDateString('pt-BR',{timeZone:'UTC',weekday:'long'});
 $('selectedDate').textContent=display(selected);
 const tasks=plan.tasksFor(selected,lessons),done=getState(selected);
 $('dayTasks').innerHTML=tasks.map((t,i)=>{
   const label=t.lesson?t.label+t.subject+' — '+t.lesson.title:t.type==='lesson'?t.label+t.subject:t.label;
   const url=taskUrl(t);
   return '<div class="task"><input type="checkbox" id="task-'+i+'" data-i="'+i+'" '+(done.includes(i)?'checked':'')+' '+(!slot||selected===plan.EXAM?'disabled':'')+' aria-label="Concluir '+escape(label)+'"><div class="taskText"><label for="task-'+i+'">'+escape(label)+'</label>'+(url?'<div><a href="'+escape(url)+'">'+(t.lesson?'Abrir esta aula →':t.type==='exam'||t.type==='essay'?'Abrir modo prova →':'Acessar →')+'</a></div>':'')+'</div><span class="taskMinutes">'+(t.minutes?t.minutes+' min':'')+'</span></div>';
 }).join('');
 $('dayTasks').querySelectorAll('[data-i]').forEach(box=>box.addEventListener('change',async()=>{
   if(saving||!slot){box.checked=!box.checked;return}
   const ix=Number(box.dataset.i),prior={...completed},next=new Set(getState(selected));if(box.checked)next.add(ix);else next.delete(ix);
   completed={...completed,[selected]:[...next].sort((a,b)=>a-b)};paint();saving=true;$('saveStatus').textContent='Salvando no Firebase...';
   try{await updateDoc(doc(db,'profiles',slot),{calendarChecks:completed});$('saveStatus').textContent='✓ Progresso do calendário salvo'}
   catch(e){completed=prior;paint();$('saveStatus').textContent='Falha ao salvar. Verifique sua conexão e tente novamente.'}
   finally{saving=false}
 }));
}
$('prevMonth').addEventListener('click',()=>{month=addMonth(month,-1);paint()});
$('nextMonth').addEventListener('click',()=>{month=addMonth(month,1);paint()});
paint();
(async()=>{
 try{const r=await fetch('./aulas.json?v=7');if(!r.ok)throw Error('Aulas não disponíveis');lessons=await r.json();paint()}
 catch(e){$('saveStatus').textContent='Não foi possível carregar as aulas. Confira aulas.json.'}
})();
onAuthStateChanged(auth,async user=>{
 currentUid=user?.uid||null;slot=null;completed={};
 if(!user){$('userStatus').textContent='Entre na sua conta no Painel para marcar tarefas neste calendário.';paint();return}
 try{
   for(const id of ['1','2','3','4','5']){
     const s=await getDoc(doc(db,'slots',id));if(s.exists()&&s.data()?.uid===user.uid){slot=id;break}
   }
   if(!slot){$('userStatus').textContent='Sua conta ainda não possui perfil vinculado.';paint();return}
   const p=await getDoc(doc(db,'profiles',slot));completed=p.data()?.calendarChecks||{};
   $('userStatus').textContent='Conectado como '+(p.data()?.username||user.email)+' · marcações salvas individualmente.';paint();
 }catch(e){$('userStatus').textContent='Falha ao ler seu progresso: '+e.message;paint()}
});
