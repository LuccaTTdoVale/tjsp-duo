/* TJSP Duo — planejamento diário até a data prevista da prova. Sem bibliotecas externas. */
(function(root){
'use strict';
const START='2026-10-29',EXAM='2027-03-14';
const WEEK=[
 ['Matemática','Direito Penal'],
 ['Português','Processo Civil'],
 ['Informática','Legislação Interna'],
 ['Português','Processo Penal'],
 ['Raciocínio Lógico','Direito Constitucional'],
 [],
 ['Atualidades e Inclusão']
];
const ms=86400000;
const parsed=s=>new Date(s+'T12:00:00Z');
const addDays=(s,n)=>new Date(parsed(s).getTime()+n*ms).toISOString().slice(0,10);
const diff=(s)=>Math.round((parsed(s)-parsed(START))/ms);
const today=()=>{
 const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=t=>f.find(x=>x.type===t)?.value||'01';return get('year')+'-'+get('month')+'-'+get('day');
};
const stage=d=>d<'2026-12-01'?'Fundamentos':d<'2027-02-01'?'Aprofundamento':'Revisão final';
const weekIndex=d=>Math.floor((diff(d)+3)/7); // início da semana 26/10/2026
const subjectsFor=d=>{
 const wd=(parsed(d).getUTCDay()+6)%7; // segunda=0
 if(wd===4)return ['Raciocínio Lógico',weekIndex(d)%2?'Direito Administrativo':'Direito Constitucional'];
 return WEEK[wd];
};
const titleFor=(subject,d,lessons)=>{
 if(!lessons||!lessons.length)return null;
 const all=lessons.filter(x=>x.subject===subject).sort((a,b)=>(a.ordemSugerida??999)-(b.ordemSugerida??999));
 if(!all.length)return null;
 let visit=0;
 for(let i=0;i<=Math.max(0,diff(d));i++){
   const other=addDays(START,i);
   if(other===d)break;
   visit+=subjectsFor(other).filter(x=>x===subject).length;
 }
 const lesson=all[visit%all.length];return lesson?{id:lesson.id,title:lesson.title,subject}:null;
};
function tasksFor(d,lessons){
 if(d<START)return [{label:'Planejamento ainda não iniciado',minutes:0,type:'info'}];
 if(d>EXAM)return [{label:'Acompanhe as publicações oficiais da VUNESP',minutes:0,type:'info'}];
 if(d===EXAM)return [{label:'PROVA PREVISTA — TJSP Escrevente: questões + redação',minutes:300,type:'exam',url:'https://www.vunesp.com.br/TJSP2607'}];
 if(d===addDays(EXAM,-1))return [{label:'Revisão leve dos resumos essenciais: nada de simulado longo',minutes:40,type:'review'},{label:'Conferir local de prova, documento, deslocamento e materiais permitidos',minutes:20,type:'review'},{label:'Descansar e preservar o sono para o dia seguinte',minutes:0,type:'review'}];
 const wd=(parsed(d).getUTCDay()+6)%7;
 if(wd===5)return [
   {label:'Simulado TJSP completo: 70 questões (16 Português + 30 Direito + 24 Gerais)',minutes:230,type:'exam',url:'./questoes.html?modo=prova'},
   {label:'Redação dissertativo-argumentativa + revisão final das respostas (tempo total: 5 horas)',minutes:70,type:'essay',url:'./questoes.html?modo=prova'}
 ];
 if(wd===6)return [
   {label:'Revisar as questões erradas e registrar as causas no Caderno de Erros',minutes:60,type:'errors',url:'./caderno-erros.html'},
   {label:'Atualidades e Inclusão: revisar a aula sugerida',minutes:40,type:'lesson',subject:'Atualidades e Inclusão',lesson:titleFor('Atualidades e Inclusão',d,lessons)},
   {label:'Revisão de 1, 7 e 21 dias + planejar a próxima semana',minutes:20,type:'review'}
 ];
 const subjects=subjectsFor(d);
 return [
   {label:stage(d)==='Revisão final'?'Revisão ativa: ': 'Aula completa: ',minutes:45,type:'lesson',subject:subjects[0],lesson:titleFor(subjects[0],d,lessons)},
   {label:stage(d)==='Revisão final'?'Revisão de legislação/conceitos: ': 'Aula completa: ',minutes:45,type:'lesson',subject:subjects[1],lesson:titleFor(subjects[1],d,lessons)},
   {label:'Questões de fixação das aulas do dia + correção imediata',minutes:20,type:'practice',lesson:titleFor(subjects[0],d,lessons)},
   {label:'Revisão ativa de conteúdos vistos há 1, 7 e 21 dias',minutes:10,type:'review'}
 ];
}
root.TJSPStudyPlan=Object.freeze({START,EXAM,today,addDays,diff,stage,subjectsFor,tasksFor});
})(window);
