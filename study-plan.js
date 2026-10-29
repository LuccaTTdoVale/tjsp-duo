/* TJSP Duo | plano de 2 matérias + prática. Data local de São Paulo. */
(function(root){
'use strict';
const START='2026-10-29',EXAM='2027-03-14';
const WEEK=[
 ['Matemática','Direito Penal'],
 ['Português','Processo Civil'],
 ['Informática','Legislação Interna'],
 ['Português','Processo Penal'],
 ['Raciocínio Lógico','Direito Constitucional'],
 [],['Atualidades e Inclusão']
];
const ms=86400000,parsed=s=>new Date(s+'T12:00:00Z');
const addDays=(s,n)=>new Date(parsed(s).getTime()+n*ms).toISOString().slice(0,10);
const diff=s=>Math.round((parsed(s)-parsed(START))/ms);
const today=()=>{
 const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=t=>f.find(x=>x.type===t)?.value||'01';return get('year')+'-'+get('month')+'-'+get('day');
};
const stage=d=>d<'2026-12-01'?'Fundamentos':d<'2027-02-01'?'Aprofundamento':'Revisão final';
const weekIndex=d=>Math.floor((diff(d)+3)/7);
const subjectsFor=d=>{
 const wd=(parsed(d).getUTCDay()+6)%7;
 if(wd===4)return ['Raciocínio Lógico',weekIndex(d)%2?'Direito Administrativo':'Direito Constitucional'];
 return WEEK[wd];
};
const titleFor=(subject,d,lessons)=>{
 if(!Array.isArray(lessons)||!lessons.length)return null;
 const all=lessons.filter(x=>x.subject===subject).sort((a,b)=>(a.ordemSugerida??999)-(b.ordemSugerida??999));
 if(!all.length)return null;
 let visit=0;
 for(let i=0;i<Math.max(0,diff(d));i++){
  const other=addDays(START,i);visit+=subjectsFor(other).filter(x=>x===subject).length;
 }
 const lesson=all[visit%all.length];return lesson?{id:lesson.id,title:lesson.title,subject}:null;
};
function tasksFor(d,lessons){
 if(d<START)return [{label:'Planejamento ainda não iniciado',minutes:0,type:'info'}];
 if(d>EXAM)return [{label:'Acompanhar comunicados oficiais da VUNESP',minutes:0,type:'info'}];
 if(d===EXAM)return [{label:'PROVA PREVISTA — TJSP Escrevente',minutes:300,type:'exam',url:'https://www.vunesp.com.br/TJSP2607'}];
 if(d===addDays(EXAM,-1))return [{label:'Revisão leve e preparação para o local de prova',minutes:40,type:'review'},{label:'Descanso e sono',minutes:0,type:'review'}];
 const wd=(parsed(d).getUTCDay()+6)%7;
 if(wd===5)return [
  {label:'Simulado completo — 70 questões, sem consultas',minutes:230,type:'exam',url:'./questoes.html?modo=prova'},
  {label:'Redação e conferência final dentro das 5h totais',minutes:70,type:'essay',url:'./questoes.html?modo=prova'}
 ];
 if(wd===6)return [
  {label:'Analisar erros do simulado e revisar conteúdos',minutes:60,type:'errors',url:'./caderno-erros.html'},
  {label:'Atualidades e Inclusão',minutes:40,type:'lesson',subject:'Atualidades e Inclusão',lesson:titleFor('Atualidades e Inclusão',d,lessons)},
  {label:'Revisão espaçada: 1, 7 e 21 dias',minutes:20,type:'review'}
 ];
 const [first,second]=subjectsFor(d);
 return [
  {label:first,minutes:45,type:'lesson',subject:first,lesson:titleFor(first,d,lessons)},
  {label:second,minutes:45,type:'lesson',subject:second,lesson:titleFor(second,d,lessons)},
  {label:'Questões — resolver 20 a 40 e conferir os erros',minutes:30,type:'practice',url:'./questoes.html'}
 ];
}
root.TJSPStudyPlan=Object.freeze({START,EXAM,today,addDays,diff,stage,subjectsFor,tasksFor});
})(window);
