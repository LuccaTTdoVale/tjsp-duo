import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,updateDoc} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id), escapeHtml=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
let lessons=[],progress={},profileId=null,active=null,currentUser=null;
let practicePromise=null,notesPromise=null,lessonVisit=0,passedLessonId=null,roundState=null;
function getNotesData(){if(!notesPromise)notesPromise=fetch('./resumos-caderno.json?v=10').then(r=>{if(!r.ok)throw Error('Resumos indisponíveis');return r.json()});return notesPromise;}
function getPracticeData(){
 if(!practicePromise)practicePromise=fetch('./pratica-exclusiva.json?v=19')
  .then(r=>{if(!r.ok)throw Error('Banco exclusivo de aulas não disponível');return r.json()})
  .catch(e=>{console.warn('Falha nas questões exclusivas:',e);return {lessons:{}}});
 return practicePromise;
}
function shuffle(list){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function practiceKey(l){return 'tjduo-autoral-v7:'+String(currentUser?.uid||'visitante')+':'+encodeURIComponent(l.id)}
function readSeen(l){try{const v=JSON.parse(localStorage.getItem(practiceKey(l))||'[]');return Array.isArray(v)?v:[]}catch{return []}}
function pickPractice(l,data){
 const pool=data.lessons?.[l.id]||[];if(!pool.length)return {picked:[],total:0,left:0};
 const count=Math.min(12,pool.length);let seen=readSeen(l),available=pool.filter(q=>!seen.includes(q.id));
 if(!available.length){seen=[];available=pool;}
 const chosen=shuffle(available).slice(0,count);
 if(chosen.length<count){
   const recent=new Set(seen.slice(-count));
   const extras=shuffle(pool.filter(q=>!chosen.includes(q)&&!recent.has(q.id)));
   chosen.push(...extras.slice(0,count-chosen.length));
 }
 if(chosen.length<count){const rest=shuffle(pool.filter(q=>!chosen.includes(q)));chosen.push(...rest.slice(0,count-chosen.length));}
 try{localStorage.setItem(practiceKey(l),JSON.stringify([...seen,...chosen.map(q=>q.id)].slice(-120)))}catch(_){ }
 return {picked:chosen.map(q=>{const order=shuffle(q.options.map((_,i)=>i));return {...q,options:order.map(i=>q.options[i]),answer:order.indexOf(Number(q.answer)),wrong:order.map(i=>q.wrong?.[i]||'')}}),total:pool.length,left:Math.max(0,available.length-count)};
}
function lessonCompletionState(l){
 const btn=$('complete');if(!btn)return;
 if(progress[l.id]){btn.disabled=true;btn.textContent='✓ Aula já concluída';return;}
 btn.disabled=passedLessonId!==l.id;
 btn.textContent=passedLessonId===l.id?'✓ Concluir aula (100% de acertos)':'🔒 Concluir: acerte todas as questões';
}
function practiceMessage(host,message,ready=false){
 let box=host.querySelector('#practiceRoundStatus');if(!box)return;
 box.className='practiceRoundStatus'+(ready?' is-passed':'');
 box.textContent=message;
}
function drawPracticeRound(l,visit,host,questions,total,left){
 if(visit!==lessonVisit||active?.id!==l.id)return;
 passedLessonId=null;roundState={lessonId:l.id,questions,answered:new Map(),wrong:0};
 lessonCompletionState(l);
 host.innerHTML=`<div class="practiceTop"><div><h3>🧠 Teste sua compreensão</h3><p class="dim">Rodada com ${questions.length} questões, de ${total} disponíveis nesta aula. Responda tudo corretamente na mesma tentativa para liberar a conclusão. Os erros são explicados e você pode refazer a rodada.</p></div><button class="btn secondary" type="button" id="newQuestions">↻ Outras questões</button></div><div id="practiceRoundStatus" class="practiceRoundStatus" role="status" aria-live="polite">0 de ${questions.length} respondidas · 100% de acertos necessários.</div>${questions.map((q,i)=>`<div class="checkQuestion"><strong>${i+1}. ${escapeHtml(q.q)}</strong>${q.options.map((o,j)=>`<button type="button" class="checkOpt" data-i="${i}" data-choice="${j}" aria-pressed="false">${escapeHtml(String.fromCharCode(65+j)+') '+o)}</button>`).join('')}<div class="checkFeedback" id="checkFeedback${i}" role="status" aria-live="polite"></div></div>`).join('')}<div id="practiceActions" class="practiceActions"></div>`;
 host.querySelector('#newQuestions').onclick=()=>{passedLessonId=null;lessonCompletionState(l);populatePractice(l,visit);};
 host.querySelectorAll('.checkOpt').forEach(btn=>btn.addEventListener('click',()=>{
   const i=Number(btn.dataset.i),chosen=Number(btn.dataset.choice),q=questions[i],fb=host.querySelector('#checkFeedback'+i);
   if(!roundState||roundState.questions!==questions||roundState.answered.has(i))return;
   const answer=Number(q.answer),correct=chosen===answer;
   roundState.answered.set(i,correct);if(!correct)roundState.wrong++;
   window.TJSPDailyActivity?.recordLessonAnswer(l.id+':'+q.id);
   host.querySelectorAll('.checkOpt[data-i="'+i+'"]').forEach(b=>{const n=Number(b.dataset.choice);b.classList.toggle('is-wrong',n===chosen&&!correct);b.classList.toggle('is-correct',n===answer);b.classList.toggle('was-answer',n===answer&&!correct);b.setAttribute('aria-pressed',String(n===chosen));b.disabled=true});
   const box=document.createElement('div');box.className='feedbackBox'+(correct?'':' incorrect');
   const heading=document.createElement('strong');heading.textContent=correct?'✓ Resposta correta':'✕ Resposta incorreta';box.append(heading);
   const add=(label,detail)=>{const p=document.createElement('p'),b=document.createElement('b');b.textContent=label+' ';p.append(b,document.createTextNode(detail));box.append(p)};
   const fmt=n=>String.fromCharCode(65+n)+') '+q.options[n];
   if(!correct){
     add('Você marcou:',fmt(chosen));
     add('O problema dessa escolha:',q.wrong?.[chosen]||'Compare os termos do enunciado com o sentido e a função da alternativa escolhida.');
     add('Resposta esperada:',fmt(answer));
   }
   add('Entenda o raciocínio:',q.why||'Revise o conceito correspondente antes de tentar novamente.');
   fb.replaceChildren(box);
   const n=roundState.answered.size,wrong=roundState.wrong;
   if(n<questions.length){practiceMessage(host,`${n} de ${questions.length} respondidas · ${wrong} erro(s).`);return;}
   const actions=host.querySelector('#practiceActions');
   if(wrong===0){passedLessonId=l.id;lessonCompletionState(l);practiceMessage(host,`✓ Excelente! ${n} de ${n} corretas. Agora você pode concluir esta aula.`,true);actions.innerHTML='<a href="#complete" class="btn">Ir para concluir aula ↓</a>';}
   else{passedLessonId=null;lessonCompletionState(l);practiceMessage(host,`${n} respondidas, ${wrong} erro(s). Revise as explicações e refaça a rodada para conseguir 100%.`);actions.innerHTML='<button class="btn" type="button" id="repeatPractice">↻ Refazer esta rodada</button>';
    actions.querySelector('#repeatPractice').onclick=()=>{
      const shuffled=questions.map(q=>{const idx=shuffle(q.options.map((_,j)=>j));return {...q,options:idx.map(j=>q.options[j]),answer:idx.indexOf(q.answer),wrong:idx.map(j=>q.wrong?.[j]||'')}});
      drawPracticeRound(l,visit,host,shuffled,total,left);
      host.scrollIntoView({behavior:'smooth',block:'start'});
    };
   }
 }));
}
async function populatePractice(l,visit){
 const host=$('practiceHost');if(!host)return;
 const data=await getPracticeData();if(visit!==lessonVisit||active?.id!==l.id||$('lesson').classList.contains('hide'))return;
 const {picked:list,total,left}=pickPractice(l,data);
 if(!list.length){host.innerHTML='<h3>🧠 Teste sua compreensão</h3><p>O banco desta aula não carregou. Atualize a página antes de tentar concluir.</p>';lessonCompletionState(l);return;}
 drawPracticeRound(l,visit,host,list,total,left);
}
async function populateNotebook(l,visit){
 const host=$('notesHost');if(!host)return;
 try{
  const data=await getNotesData();if(visit!==lessonVisit||active?.id!==l.id)return;
  const note=data.lessons?.[l.id];if(!note){host.innerHTML='<p>Resumo ainda indisponível nesta aula.</p>';return;}
  const points=(note.points||[]).map(x=>`<div class="notePoint"><strong>${escapeHtml(x.heading)}</strong><p>${escapeHtml(x.text)}</p></div>`).join('');
  const steps=(note.steps||[]).length?`<h4>Como resolver ou aplicar</h4><ol>${note.steps.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol>`:'';
  host.innerHTML=`<div class="notesHeading"><div><span class="notesEyebrow">PARA ANOTAR À MÃO</span><h2>📓 Resumo do assunto</h2><p>Registre estas regras e exemplos no caderno para suas revisões de 1, 7 e 21 dias.</p></div><button id="copyNotes" class="btn secondary" type="button">Copiar resumo</button></div><h3>${escapeHtml(note.title)}</h3><p><strong>Objetivo:</strong> ${escapeHtml(note.objective)}</p>${points}${note.formula?`<div class="noteFormula"><strong>Regra ou fórmula essencial:</strong><p>${escapeHtml(note.formula)}</p></div>`:''}${steps}${note.example?`<h4>Exemplo aplicado</h4><p>${escapeHtml(note.example)}</p>`:''}${note.pitfalls?.length?`<h4>Atenção aos erros comuns</h4><ul>${note.pitfalls.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:''}<p class="notesSource">Este resumo é um apoio para revisão. Estude primeiro a aula completa; para legislação, confira sempre a versão vigente na fonte oficial.</p>`;
  host.querySelector('#copyNotes').onclick=async()=>{
   const t=[note.title,'Objetivo: '+note.objective,...note.points.map(x=>x.heading+'\n'+x.text),note.formula?'Regra: '+note.formula:'',...(note.steps||[]).map(x=>'• '+x),note.example?'Exemplo: '+note.example:'',...(note.pitfalls||[]).map(x=>'Atenção: '+x)].filter(Boolean).join('\n\n');
   try{await navigator.clipboard.writeText(t);host.querySelector('#copyNotes').textContent='✓ Copiado';}
   catch{host.querySelector('#copyNotes').textContent='Copie o texto selecionando o resumo';}
  };
 }catch(err){if(visit===lessonVisit)host.innerHTML='<p>Não foi possível carregar o resumo. Atualize a página.</p>';}
}


/* V12: blocos didáticos com legendas DEFINIDAS e juridiquês real no texto. */
let teachingStructurePromise=null, legalGlossaryPromise=null;
const lawSubjects=new Set(['Direito Penal','Processo Penal','Processo Civil','Direito Constitucional','Direito Administrativo','Legislação Interna']);
function getTeachingStructure(){
 if(!teachingStructurePromise)teachingStructurePromise=fetch('./estrutura-aulas.json?v=16')
  .then(r=>{if(!r.ok)throw Error('Organização de aulas indisponível');return r.json()})
  .catch(error=>{console.warn('TJSP Duo: usando ordem original',error);return null});
 return teachingStructurePromise;
}
function getLegalGlossary(){
 if(!legalGlossaryPromise)legalGlossaryPromise=fetch('./glossario-juridico.json?v=12')
  .then(r=>{if(!r.ok)throw Error('Vocabulário jurídico indisponível');return r.json()})
  .catch(error=>{console.warn('TJSP Duo: glossário indisponível',error);return {termos:[]}});
 return legalGlossaryPromise;
}
function lessonHeading(text){return String(text).replace(/^\s*\d+\s*[.)]\s*/, '').replace(/^Aprofundamento(?:\s+dirigido\s+\d+)?\s*[—–:-]\s*/i,'').trim();}
// Cada categoria visual explica O QUE É, não apenas dá o nome.
const legendExplanations={
 'Dispositivo ou referência normativa citada':'É a parte identificável de uma lei ou norma (artigo, inciso, parágrafo etc.) usada como fundamento. Leia a regra completa e as exceções.',
 'Conceito tratado neste bloco':'É a ideia ou definição principal do trecho. Identifique o significado e o que diferencia esse conceito de outros semelhantes.',
 'Condição, exceção ou relação lógica':'Condição é o requisito necessário; exceção é o caso em que a regra geral muda; relação lógica conecta hipóteses e consequências.',
 'Percentual presente no exemplo':'Porcentagem representa uma parte de cada 100: 25% significa 25 de 100. Confira sempre qual quantidade é o total.',
 'Prazo ou duração citada no texto':'É o intervalo de tempo relacionado à regra ou ao exemplo. Verifique o evento inicial, a unidade e a forma de contagem.',
 'Percentual aplicado':'É a taxa usada no cálculo, escrita como razão de 100: 12% = 0,12.',
 'Base de cálculo':'É o valor total sobre o qual se aplica a taxa percentual. Exemplo: 12% de 250 → a base é 250.',
 'Parte encontrada':'É o resultado da operação de porcentagem. Exemplo: 12% de 250 = 30.',
 'Sujeito (quem começou)':'Sujeito é o termo sobre o qual se declara algo. Em “A reunião começou às 9h”, o sujeito é “A reunião”.',
 'Núcleo verbal do predicado':'Predicado é aquilo que se declara sobre o sujeito. Em “A reunião começou às 9h”, o predicado é “começou às 9h”, e “começou” é seu núcleo verbal.',
 'Informação de tempo':'Indica quando ocorreu a ação. “Às 9h” é expressão de tempo (adjunto adverbial de tempo) no exemplo.',
 'Concessão: obstáculo apresentado':'Concessão apresenta um fato contrário à expectativa que não impede o resultado: “Embora chovesse, saiu”.',
 'Sujeito':'É o termo sobre o qual se declara alguma informação; concorda com o verbo em diversos casos.',
 'Fato que o texto afirma':'É a informação expressa diretamente. Responda apenas o que o texto sustenta, sem acrescentar suposições.',
 'Frase original: sentido pelo contexto':'É a expressão como aparece no texto, cujo significado depende das frases que a cercam.',
 'Substituição que preserva o sentido':'É uma troca de palavra ou expressão que mantém o significado no contexto.',
 'Substituição inadequada ao contexto':'É uma troca que altera o sentido ou o tom da frase original; por isso não serve como equivalência.',
 'Advérbio de dúvida':'Advérbio que indica possibilidade ou incerteza, como “talvez” e “possivelmente”.',
 'Verbo no futuro':'Forma verbal que situa a ação em momento posterior ao da referência; pode ter valor de previsão ou hipótese.',
 'Advérbio de tempo':'Palavra ou expressão que situa temporalmente uma ação, como “ontem”, “hoje” ou “amanhã”.',
 'Adjetivo que concorda':'Adjetivo caracteriza um nome e, em regra, concorda com ele em gênero e número: “casas bonitas”.',
 'Substantivo de referência':'É o nome a que se refere outro termo da frase, por exemplo o adjetivo ou o pronome.',
 'Primeira equação':'É uma igualdade matemática com incógnita; funciona como primeira condição do sistema.',
 'Segunda equação':'É outra igualdade do sistema, que deve ser satisfeita ao mesmo tempo que a primeira.',
 'Solução de x':'É o valor que torna as equações verdadeiras quando substituído na incógnita x.',
 'Base do triângulo':'É o lado adotado como referência para a medida da altura no cálculo da área.',
 'Altura do triângulo':'É a distância perpendicular entre a base e o vértice oposto ou o prolongamento da base.',
 'Área calculada':'É a medida da superfície da figura. Para triângulo: área = base × altura ÷ 2.',
 'Condição lógica testada':'É a expressão verificada para decidir qual resultado ou ramo será adotado.',
 'Valor se verdadeiro':'É o resultado usado quando a condição lógica avaliada é verdadeira.',
 'Valor se falso':'É o resultado usado quando a condição lógica avaliada é falsa.',
 'Ato de incorporar peça aos autos':'É a juntada: inclusão de petição, documento ou certidão no processo.',
 'Encaminhamento para decisão ou despacho':'É a remessa dos autos ao magistrado para que analise ou determine providências; pode ser chamada conclusão.',
 'Envio do processo ou expediente':'É a remessa de autos ou documentos para outra unidade ou órgão conforme o procedimento.',
 'Chamamento para integrar o processo':'É a citação: comunicação formal para o réu, executado ou interessado integrar a relação processual.',
 'Comunicação de ato ou decisão':'É a intimação: meio de dar ciência a alguém de um ato ou termo processual.',
 'Forma de divulgação ou comunicação':'É o meio pelo qual um ato chega ao conhecimento de quem deve ser informado (publicação, expediente, meio eletrônico etc.).',
 'Relação de número e pessoa':'É a concordância: flexão do verbo ou de outro termo conforme número (singular/plural) e pessoa gramatical.',
 'Exigência de complemento ou preposição':'É a regência: relação entre termo regente e complemento, incluindo a preposição exigida quando aplicável.',
 'Organização sintática e sentido':'É a estrutura das funções dos termos na oração e como sua posição altera o significado.'
};
const isLetter=ch=>Boolean(ch)&&/[\p{L}\p{N}]/u.test(ch);
function termOccurrences(text,forms){
 const out=[],lower=text.toLocaleLowerCase('pt-BR');
 for(const form of forms||[]){
  const needle=String(form).toLocaleLowerCase('pt-BR');if(!needle)continue;
  let from=0,match;
  while((match=lower.indexOf(needle,from))>=0){
   const end=match+needle.length;
   if(!isLetter(text[match-1])&&!isLetter(text[end]))out.push({start:match,end});
   from=end;
  }
 }
 out.sort((a,b)=>a.start-b.start||b.end-a.end);
 return out;
}
// Marca termos nos próprios parágrafos; não altera nenhuma palavra do texto original.
function paintTeachingText(text,markers=[],terms=[]){
 const original=String(text??''),matches=[];
 for(const item of markers){
  if(!item?.trecho||!['red','blue','amber'].includes(item.cor))continue;
  const n=original.indexOf(item.trecho);if(n<0)continue;
  matches.push({start:n,end:n+item.trecho.length,kind:'visual',item,priority:0});
 }
 for(const term of terms){
  // Não grifar uma expressão jurídica em ocorrência que faria parte de outro termo maior.
  for(const hit of termOccurrences(original,term.formas).slice(0,3))matches.push({...hit,kind:'legal',item:term,priority:1});
 }
 matches.sort((a,b)=>a.start-b.start||a.priority-b.priority||b.end-a.end);
 let html='',position=0;
 for(const hit of matches){
  if(hit.start<position)continue;
  html+=escapeHtml(original.slice(position,hit.start));
  if(hit.kind==='legal'){
   html+=`<mark class="tj-focus tj-law" title="${escapeHtml(hit.item.termo+': '+hit.item.definicao)}">${escapeHtml(original.slice(hit.start,hit.end))}</mark>`;
  }else{
   html+=`<mark class="tj-focus tj-${hit.item.cor}" title="${escapeHtml(hit.item.rotulo+': '+(legendExplanations[hit.item.rotulo]||''))}">${escapeHtml(original.slice(hit.start,hit.end))}</mark>`;
  }
  position=hit.end;
 }
 return html+escapeHtml(original.slice(position));
}
function legalTermsForBlock(l,group,terms){
 if(!lawSubjects.has(l.subject))return [];
 const text=(group.itens||[]).map(i=>l.sections[i].join(' ')).join(' ');
 const present=terms.filter(t=>t.formas?.some(f=>termOccurrences(text,[f]).length>0));
 // Não inundar o texto de destaques; termos do bloco aparecem em ordem de ocorrência.
 const firstPos=t=>Math.min(...t.formas.flatMap(f=>termOccurrences(text,[f]).map(x=>x.start)));
 return present.sort((a,b)=>firstPos(a)-firstPos(b)).slice(0,9);
}
function sidebarFor(markers,terms){
 if(!markers.length&&!terms.length)return '';
 const vis=markers.length?`<div class="tj-legend-title">Guia visual do trecho</div><p class="tj-legend-desc">O destaque mostra <b>onde</b> está a informação; abaixo está <b>o que ela significa</b>.</p><ul class="tj-legend-list">${markers.map(m=>`<li><span class="tj-legend-dot tj-${m.cor}" aria-hidden="true"></span><span><b>${escapeHtml(m.rotulo)}</b><small class="tj-meaning">${escapeHtml(legendExplanations[m.rotulo]||'É um elemento importante a identificar no trecho. Compare sua função com o contexto.')}</small><small class="tj-quote">Trecho: “${escapeHtml(m.trecho)}”</small></span></li>`).join('')}</ul>`:'';
 const law=terms.length?`<div class="tj-legal-title">⚖ Juridiquês explicado</div><p class="tj-legend-desc">Termos grifados no texto ao lado. As definições abaixo são didáticas: consulte a norma para detalhes e exceções.</p><dl class="tj-legal-list">${terms.map(t=>`<div class="tj-legal-item"><dt>${escapeHtml(t.termo)}</dt><dd>${escapeHtml(t.definicao)}<small><b>Exemplo:</b> ${escapeHtml(t.exemplo)}</small></dd></div>`).join('')}</dl><div class="tj-legal-source"><a href="https://www.tjsp.jus.br/Especialidade/JuizadosEspeciais/Vocabulario" target="_blank" rel="noopener noreferrer">Vocabulário do TJSP ↗</a></div>`:'';
 const grammar=markers.some(m=>/Sujeito|predicado/i.test(m.rotulo))?'<p class="tj-grammar-tip"><b>Compare:</b> sujeito = “A reunião”; predicado = “começou às 9h”. O verbo “começou” é o núcleo verbal; “às 9h” indica tempo.</p>':'';
 return `<aside class="tj-teaching-legend" aria-label="Explicações dos destaques">${vis}${grammar}${law}</aside>`;
}
let pillarPromise=null;
function getPillarData(){
 if(!pillarPromise)pillarPromise=fetch('./pilares-conceitos.json?v=16').then(r=>{
   if(!r.ok)throw Error('Definições e exemplos indisponíveis');return r.json();
 }).catch(error=>{console.warn('TJSP Duo: não foi possível baixar os dois pilares',error);return {lessons:{}}});
 return pillarPromise;
}
function pillarCardsFor(group,lesson,index,all){
 const pair=all?.lessons?.[lesson.id]?.[index];
 if(!pair||typeof pair.definicao!=='string'||typeof pair.aplicacao!=='string'){
   return `<div class="tj-pillars tj-pillars-unavailable" role="status">Definição e exemplo não disponíveis neste momento. Recarregue a página para recuperar o material explicativo.</div>`;
 }
 const def=escapeHtml(pair.definicao),use=escapeHtml(pair.aplicacao);
 return `<div class="tj-pillars" aria-label="Definição e aplicação do conceito">
  <div class="tj-pillar tj-definition"><h3><span class="tj-pillar-step">01</span> Definição <small>O que é?</small></h3><p>${def}</p></div>
  <div class="tj-pillar tj-application"><h3><span class="tj-pillar-step">02</span> Contextualização / Exemplificação <small>Como se aplica?</small></h3><p>${use}</p></div>
 </div>`;
}
function layoutForLesson(l,structure,glossary,pillars){
 const groups=structure?.lessons?.[l.id]?.blocos;
 const arranged=Array.isArray(groups)&&groups.length?groups:l.sections.map((pair,i)=>({titulo:lessonHeading(pair[0]),itens:[i]}));
 const indexed=new Set();
 for(const group of arranged){for(const index of group.itens||[]){
  if(!Number.isInteger(index)||index<0||index>=l.sections.length||indexed.has(index))throw Error('Estrutura de aula inválida');indexed.add(index);
 }}
 if(indexed.size!==l.sections.length)throw Error('Conteúdo incompleto na estrutura');
 return `<div class="tj-teaching-layout">${arranged.map((group,gidx)=>{
  const focus=group.destaque,focusedIndex=Number.isInteger(focus?.indice)?focus.indice:-1;
  const markers=Array.isArray(focus?.marcas)?focus.marcas.filter(m=>m&&m.trecho&&m.rotulo&&['red','blue','amber'].includes(m.cor)&&m.rotulo!=='Conceito tratado neste bloco'&&l.sections[focusedIndex]?.[1]?.includes(m.trecho)):[];
  const terms=legalTermsForBlock(l,group,glossary?.termos||[]);
  const sidebar=sidebarFor(markers,terms);
  const inner=group.itens.map((idx,subidx)=>{
   const [title,text]=l.sections[idx],deep=/^Aprofundamento/i.test(title),pure=lessonHeading(title);
   const heading=deep?`APROFUNDAMENTO${pure&&pure.toLowerCase()!==String(group.titulo||'').toLowerCase()?': '+paintTeachingText(pure,[],terms):''}`:
     ((subidx===0&&pure===group.titulo)?'':paintTeachingText(pure,[],terms));
   const shown=paintTeachingText(text,focusedIndex===idx?markers:[],terms).replace(/\n\n+/g,'</p><p>');
   return `<section class="tj-teaching-part${deep?' tj-depth':''}">${heading?`<h3>${heading}</h3>`:''}<p>${shown}</p></section>`;
  }).join('');
  return `<section class="tj-teaching-group"><header class="tj-teaching-head"><span class="tj-teaching-number">Conceito ${gidx+1} de ${arranged.length}</span><h2>${paintTeachingText(group.titulo||l.title,[],terms)}</h2></header><div class="tj-teaching-columns${sidebar?'':' no-legend'}"><div class="tj-teaching-main">${pillarCardsFor(group,l,gidx,pillars)}${inner}</div>${sidebar}</div></section>`;
 }).join('')}</div>`;
}

/* Português: curso editorial com teoria aplicada, sem duplicação de conteúdo genérico. */
let ptCursoPromise=null;
function getPtCurso(){
 if(!ptCursoPromise)ptCursoPromise=fetch('./portugues-curso.json?v=17')
 .then(r=>{if(!r.ok)throw Error('Curso de Português indisponível');return r.json()})
 .catch(e=>{console.error('Falha ao abrir o curso de Português',e);return null});
 return ptCursoPromise;
}
function renderPtCurso(l,book){
 const data=book?.lessons?.[l.id];if(!data||!data.capitulos?.length)throw Error('Aula sem capítulos');
 const imgs={
  'Português-interpretacao':{0:'midia-portugues/inferencia-guia.webp',2:'midia-portugues/informacao-explicita.svg',3:'midia-portugues/inferencia-dialogo.webp',7:'midia-portugues/interpretacao-alternativas.svg'}
 };
 const escapes=txt=>escapeHtml(txt).replace(/\n/g,'<br>');
 const intro=`<section class="pt-intro" aria-label="Introdução da aula"><span class="pt-kicker">AULA COMPLETA • PORTUGUÊS</span><h2>Vamos aprender passo a passo</h2><p>${escapes(data.introducao)}</p><p class="pt-orientacao">O objetivo é entender o conteúdo e saber aplicá-lo em uma questão nova. Os exercícios estão depois da teoria e exigem 100% de acertos para concluir a aula.</p></section>`;
 const chapters=data.capitulos.map((c,i)=>{
  const pic=imgs[l.id]?.[i]||(i===1?'midia-portugues/'+l.id.replace('Português-','')+'.svg':null);
  const graphic=pic?`<figure class="pt-figure"><img loading="lazy" decoding="async" src="./${pic}" alt="Esquema autoral do conceito ${escapeHtml(c.titulo)}"/><figcaption>Esquema visual de estudo. <a href="./${pic}" target="_blank" rel="noopener noreferrer">Abrir imagem ampliada</a> para ler os detalhes no celular. A teoria completa está logo acima e abaixo.</figcaption></figure>`:'';
  return `<section class="pt-chapter" id="pt-cap-${i+1}"><header class="pt-chapter-head"><span>CONCEITO ${String(i+1).padStart(2,'0')} DE ${String(data.capitulos.length).padStart(2,'0')}</span><h2>${escapeHtml(c.titulo)}</h2></header><div class="pt-chapter-content"><section class="pt-explain pt-definition"><h3><span class="pt-step">01</span> Definição <small>O que é e como identificar?</small></h3><p>${escapes(c.definicao)}</p></section><section class="pt-explain pt-application"><h3><span class="pt-step">02</span> Contextualização / Exemplo <small>Como aparece na prática?</small></h3><p>${escapes(c.aplicacao)}</p></section>${graphic}<section class="pt-analysis"><h3>Como pensar na hora da prova</h3><p>${escapes(c.aprofundamento)}</p></section><div class="pt-trap"><strong>⚠️ Pegadinha para reconhecer</strong><p>${escapes(c.erro_comum)}</p></div></div></section>`;
 }).join('');
 const sources='<details class="pt-sources"><summary>Fontes e critérios editoriais</summary><p>Material autoral de apoio para estudo. A estrutura foi comparada com o programa de Português de plataformas de questões e com o edital do concurso; nenhum texto ou questão de plataforma comercial foi reproduzido.</p><ul><li><a href="https://www.qconcursos.com/questoes-de-concursos/disciplinas/letras-portugues" target="_blank" rel="noopener noreferrer">Qconcursos — tópicos e questões de Português</a></li><li><a href="https://www.academia.org.br/nossa-lingua/busca-no-vocabulario" target="_blank" rel="noopener noreferrer">ABL — VOLP</a></li><li><a href="https://www.vunesp.com.br/TJSP2607" target="_blank" rel="noopener noreferrer">VUNESP — referência do concurso</a></li></ul></details>';
 return `<div class="pt-course">${intro}<nav class="pt-chapter-nav" aria-label="Sumário da aula"><strong>Nesta aula você vai aprender</strong><ol>${data.capitulos.map((c,i)=>`<li><a href="#pt-cap-${i+1}">${escapeHtml(c.titulo)}</a></li>`).join('')}</ol></nav>${chapters}${sources}</div>`;
}


/* V18 — Curso por disciplina: capítulos independentes com fontes primárias,
   exemplos resolvidos e esquemas visuais próprios por aula. */
let subjectsCoursePromise=null;
function getSubjectsCourse(){
 if(!subjectsCoursePromise)subjectsCoursePromise=fetch('./materias-curso.json?v=18')
 .then(r=>{if(!r.ok)throw Error('Novo conteúdo das matérias não publicado');return r.json()})
 .catch(e=>{console.error('Curso por matéria indisponível',e);return null});
 return subjectsCoursePromise;
}
function renderSubjectsCourse(l,book){
 const data=book?.lessons?.[l.id];if(!data||!Array.isArray(data.capitulos)||!data.capitulos.length)throw Error('Capítulos da matéria indisponíveis');
 const x=t=>escapeHtml(t).replace(/\n/g,'<br>');
 const chapters=data.capitulos.map((c,i)=>{
  const isCase=/^Caso aplicado/.test(c.titulo);
  const image=(isCase&&data.imagem)?`<figure class="pt-figure"><img loading="lazy" decoding="async" src="./${escapeHtml(data.imagem)}" alt="Mapa visual com conceitos, exemplo e alerta de prova da aula ${escapeHtml(l.title)}"><figcaption>Mapa visual autoral desta aula. <a href="./${escapeHtml(data.imagem)}" target="_blank" rel="noopener noreferrer">Abrir imagem para ampliar e ler no celular.</a></figcaption></figure>`:'';
  return `<section class="pt-chapter" id="mc-cap-${i+1}"><header class="pt-chapter-head"><span>CONCEITO ${String(i+1).padStart(2,'0')} DE ${String(data.capitulos.length).padStart(2,'0')}</span><h2>${escapeHtml(c.titulo)}</h2></header><div class="pt-chapter-content"><section class="pt-explain pt-definition"><h3><span class="pt-step">01</span> ${isCase?'Situação-problema':'Definição'} <small>${isCase?'O que aconteceu?':'O que significa?'}</small></h3><p>${x(c.definicao)}</p></section><section class="pt-explain pt-application"><h3><span class="pt-step">02</span> ${isCase?'Resolução fundamentada':'Contextualização e aplicação'} <small>Como usar?</small></h3><p>${x(c.aplicacao)}</p></section>${image}${c.aprofundamento?`<section class="pt-analysis"><h3>${isCase?'Como evitar o erro':'Aprofundamento'}</h3><p>${x(c.aprofundamento)}</p></section>`:''}${c.erro_comum?`<div class="pt-trap"><strong>Atenção à pegadinha</strong><p>${x(c.erro_comum)}</p></div>`:''}</div></section>`;
 }).join('');
 const ref=(data.fontes||[]).filter(x=>Array.isArray(x)&&/^https:\/\//.test(x[1]||'')).map(([name,url])=>`<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a></li>`).join('');
 return `<div class="pt-course"><section class="pt-intro"><span class="pt-kicker">TJSP DUO · CURSO DE ${escapeHtml(l.subject.toUpperCase())}</span><h2>Estudo completo do tópico</h2><p>${x(data.introducao)}</p><p class="pt-orientacao">Cada conceito é explicado e aplicado antes de avançar; o caso final mostra a resolução. As questões de fixação são exclusivas desta aula e não entram no simulado.</p></section><nav class="pt-chapter-nav" aria-label="Sumário da aula"><strong>Roteiro desta aula</strong><ol>${data.capitulos.map((c,i)=>`<li><a href="#mc-cap-${i+1}">${escapeHtml(c.titulo)}</a></li>`).join('')}</ol></nav>${chapters}<details class="pt-sources"><summary>Fontes oficiais e materiais de apoio</summary><p>Conteúdo autoral para aprendizagem. A lei e os atos vigentes prevalecem sobre qualquer explicação; confira a redação e os limites do edital.</p><ul>${ref}</ul></details></div>`;
}


/* V19 — Matemática do início ao fim: fórmula, interpretação, conta montada,
   resolução numérica verificável e armadilhas próprias do assunto. */
let mathCoursePromise=null;
function getMathCourse(){
 if(!mathCoursePromise)mathCoursePromise=fetch('./matematica-passo-a-passo.json?v=19')
  .then(r=>{if(!r.ok)throw Error('Não foi possível carregar as resoluções de Matemática');return r.json()})
  .catch(e=>{console.error('TJSP Duo Matemática:',e);return null});
 return mathCoursePromise;
}
function renderMathCourse(l,book){
 const lesson=book?.lessons?.[l.id];
 if(!lesson||!Array.isArray(lesson.capitulos)||lesson.capitulos.length<4)
  throw Error('Aula de Matemática sem roteiro completo');
 const esc=t=>escapeHtml(String(t??''));
 const units=lesson.capitulos.map((u,i)=>{
  const id='math-unidade-'+(i+1);
  const steps=u.passos.map((s,j)=>`<li><span class="math-step-num">${j+1}</span><span>${esc(s)}</span></li>`).join('');
  return `<section id="${id}" class="math-unit" aria-labelledby="${id}-title">
    <header class="math-unit-head"><span>ETAPA ${String(i+1).padStart(2,'0')} / ${String(lesson.capitulos.length).padStart(2,'0')}</span><h2 id="${id}-title">${esc(u.titulo)}</h2></header>
    <div class="math-unit-body">
     <div class="math-def"><h3>01 · Definição — entenda o conceito</h3><p>${esc(u.definicao)}</p></div>
     <div class="math-formula"><h3><span aria-hidden="true">∑</span> Fórmula e significado</h3><div class="math-expression">${esc(u.formula)}</div><p>${esc(u.simbolos)}</p></div>
     <div class="math-example"><h3>02 · Exemplo resolvido — como montar a conta</h3><p class="math-problem">${esc(u.problema)}</p><ol class="math-steps">${steps}</ol>
      <p class="math-answer"><strong>Resultado:</strong> ${esc(u.resposta)}</p>
      <p class="math-check"><strong>Conferência:</strong> ${esc(u.conferencia)}</p></div>
     <aside class="math-warning"><strong>Atenção à pegadinha</strong><p>${esc(u.atencao)}</p></aside>
    </div>
  </section>`;
 }).join('');
 const summary=lesson.capitulos.map(u=>`<li><strong>${esc(u.titulo)}:</strong> ${esc(u.formula)}</li>`).join('');
 const src=(lesson.fontes||[]).filter(x=>Array.isArray(x)&&/^https:\/\//.test(x[1]||''))
  .map(([title,url])=>`<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)}</a></li>`).join('');
 return `<div class="math-course"><section class="math-intro"><span class="pt-kicker">TJSP DUO · MATEMÁTICA · AULA COMPLETA</span><h2>Aprenda a montar e resolver</h2><p>${esc(lesson.introducao)}</p>
  <div class="math-method"><strong>Como estudar:</strong> leia a definição, entenda a fórmula, tente montar o exemplo no papel, compare cada etapa e só então resolva as questões ao final. Anote a unidade da resposta.</div></section>
  <nav class="math-toc" aria-label="Roteiro da aula"><strong>Nesta aula você aprenderá</strong><ol>${lesson.capitulos.map((u,i)=>`<li><a href="#math-unidade-${i+1}">${esc(u.titulo)}</a></li>`).join('')}</ol></nav>
  ${units}<section class="math-summary" aria-label="Resumo de fórmulas para seu caderno"><h2>Resumo para copiar no caderno</h2><p>Escreva a fórmula junto das condições de uso; não decore uma operação sem entender a situação em que ela vale.</p><ul>${summary}</ul></section>
  <details class="pt-sources"><summary>Fontes didáticas e conferência</summary><ul>${src}</ul></details></div>`;
}
async function populateTeachingLayout(l,visit){
 const host=$('lessonSections');if(!host)return;
 if(l.subject==='Matemática'){
  const book=await getMathCourse();
  if(visit!==lessonVisit||active?.id!==l.id)return;
  try{host.innerHTML=renderMathCourse(l,book);host.removeAttribute('aria-busy');}
  catch(err){console.error('Falha em Matemática:',err);host.innerHTML='<p role="alert">O material completo de Matemática ainda não carregou. Publique matematica-passo-a-passo.json e atualize a página.</p>';host.removeAttribute('aria-busy');}
  return;
 }
 if(l.subject==='Português'){
  const book=await getPtCurso();
  if(visit!==lessonVisit||active?.id!==l.id)return;
  try{host.innerHTML=renderPtCurso(l,book);host.removeAttribute('aria-busy');}
  catch(e){console.error('TJSP Duo: falha ao mostrar curso Português',e);host.innerHTML='<p role="alert">A aula aprofundada não carregou. Verifique se o arquivo portugues-curso.json foi publicado e atualize a página.</p>';host.removeAttribute('aria-busy');}
  return;
 }
 const book=await getSubjectsCourse();
 if(visit!==lessonVisit||active?.id!==l.id)return;
 try{host.innerHTML=renderSubjectsCourse(l,book);host.removeAttribute('aria-busy');}
 catch(error){console.error('Falha ao carregar curso por matéria:',error);host.innerHTML='<p role="alert">O curso atualizado desta matéria não carregou. Publique materias-curso.json e a pasta midia-materias e atualize a página.</p>';host.removeAttribute('aria-busy');}
}

async function fetchLessons(){const r=await fetch('./aulas.json?v=16');if(!r.ok)throw Error('Não foi possível baixar as aulas');lessons=await r.json();}
const topicRules={
 'Português':[['Interpretação e compreensão',/interpretação|inferência|coesão|coerência/i],['Ortografia e vocabulário',/sinônimos|antônimos|polissemia|sentido literal|sentido figurado|ortografia|acentuação/i],['Morfologia: classes de palavras',/classes de palavras|pronomes/i],['Sintaxe e concordância',/sintaxe|concordância/i],['Regência e crase',/regência|crase/i],['Pontuação e colocação',/pontuação|colocação/i]],
 'Matemática':[['Números e operações',/números|divisibilidade|MMC|MDC|grandezas|unidades/i],['Razões, proporções e porcentagem',/razões|proporções|regra de três|porcentagem/i],['Álgebra e equações',/equação|sistemas/i],['Matemática financeira',/juros/i],['Estatística e geometria',/médias|geometria|tabelas|gráficos/i]],
 'Informática':[['Sistema operacional',/windows/i],['Editor de textos',/word/i],['Planilhas eletrônicas',/excel/i],['Internet e comunicação',/navegadores|URL|HTTPS|e-mail|teams/i],['Arquivos e nuvem',/onedrive/i]],
 'Direito Penal':[['Crimes contra a Administração',/administração|peculato|concussão|corrupção|prevaricação|advocacia|desobediência/i],['Crimes contra a fé pública',/fé pública|falsifica|falsidade|documento falso/i]],
 'Processo Penal':[['Sujeitos e comunicações processuais',/sujeitos|impedimentos|citação|intimação|notificações/i],['Procedimentos e provas',/procedimentos|provas|audiência/i],['Recursos e juizados',/recursos|juizados/i]],
 'Processo Civil':[['Atos, sujeitos e prazos',/atos|prazos|impedimento|suspeição/i],['Tutelas e procedimento comum',/tutela|petição|resposta|provas|sentença/i],['Recursos e juizados',/recursos|juizados/i]],
 'Direito Constitucional':[['Direitos e garantias',/direitos|garantias|sociais|nacionalidade/i],['Organização do Estado',/administração|judiciário/i]],
 'Direito Administrativo':[['Servidores públicos',/servidores|responsabilidade|disciplina/i],['Improbidade administrativa',/improbidade/i]],
 'Raciocínio Lógico':[['Lógica proposicional',/proposições|conectivos|negação|equivalências|condicional|argumentos/i],['Sequências e conjuntos',/sequências|diagramas|conjuntos/i]],
 'Redação':[['Planejamento e estrutura',/redação|estrutura|planejamento/i],['Desenvolvimento do texto',/coesão|progressão|revisão/i],['Prática da redação',/treino/i]],
 'Legislação Interna':[['Organização do TJSP',/estrutura|funcionamento/i],['Normas da Corregedoria',/corregedoria|comunicação|cartorária/i],['Resoluções e regime de trabalho',/resoluções|regime/i]],
 'Atualidades e Inclusão':[['Direitos da pessoa com deficiência',/inclusão|deficiência|trabalho/i],['Atualidades',/atualidades/i]]
};
let currentSubject=null,currentTopic=null;
function topicFor(l){for(const [name,re] of topicRules[l.subject]||[]){if(re.test(l.title))return name;}return 'Outros assuntos';}
function sortedLessons(items){return [...items].sort((a,b)=>(a.ordemSugerida||999)-(b.ordemSugerida||999));}
function render(){cards();updateProgress();}
function updateProgress(){let done=lessons.filter(l=>progress[l.id]).length;$('progressText').textContent=`${done} de ${lessons.length} aulas concluídas`;$('progressBar').style.width=`${lessons.length?100*done/lessons.length:0}%`;}
function cards(){
 const area=$('cards'),crumb=$('catalogTrail'),back=$('catalogBack'),heading=$('catalogHeading');
 if(!currentSubject){crumb.textContent='Biblioteca / Matérias';heading.textContent='Escolha uma matéria';back.classList.add('hide');
  const subjects=[...new Set(lessons.map(l=>l.subject))];area.innerHTML=subjects.map(name=>{const a=lessons.filter(l=>l.subject===name),done=a.filter(l=>progress[l.id]).length;return `<button class="tile" data-subject="${escapeHtml(name)}"><span class="chip">MATÉRIA</span><strong>${escapeHtml(name)}</strong><small>${a.length} aulas · ${done} concluídas</small><span class="tileArrow">Ver assuntos →</span></button>`}).join('');area.querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>{currentSubject=b.dataset.subject;cards();window.scrollTo(0,0)});return;
 }
 if(!currentTopic){crumb.textContent=`Biblioteca / ${currentSubject}`;heading.textContent=currentSubject;back.classList.remove('hide');
 const a=lessons.filter(l=>l.subject===currentSubject),topics=[...new Set(sortedLessons(a).map(topicFor))];area.innerHTML=topics.map((name,i)=>{const list=a.filter(l=>topicFor(l)===name),done=list.filter(l=>progress[l.id]).length;return `<button class="tile" data-topic="${escapeHtml(name)}"><span class="chip">ASSUNTO ${i+1}</span><strong>${escapeHtml(name)}</strong><small>${list.length} aulas · ${done} concluídas</small><span class="tileArrow">Ver aulas →</span></button>`}).join('');area.querySelectorAll('[data-topic]').forEach(b=>b.onclick=()=>{currentTopic=b.dataset.topic;cards();window.scrollTo(0,0)});return;
 }
 crumb.textContent=`Biblioteca / ${currentSubject} / ${currentTopic}`;heading.textContent=currentTopic;back.classList.remove('hide');
 const a=sortedLessons(lessons.filter(l=>l.subject===currentSubject&&topicFor(l)===currentTopic));area.innerHTML=a.map((l,i)=>`<button class="tile" data-id="${escapeHtml(l.id)}"><span class="chip">AULA ${i+1}</span><strong>${escapeHtml(l.title)}</strong><small>${escapeHtml(l.etapa||l.level||'Aula')} · ${progress[l.id]?'✓ Concluída':'○ Pendente'}</small><span class="tileArrow">Abrir aula →</span></button>`).join('');area.querySelectorAll('[data-id]').forEach(b=>b.onclick=()=>openLesson(b.dataset.id));
}
$('catalogBack').onclick=()=>{if(currentTopic)currentTopic=null;else currentSubject=null;cards();};
/* Avança apenas para a próxima AULA ainda pendente na agenda individual, não para questões avulsas. */
function plannedNextLesson(currentId){
 const plan=window.TJSPStudyPlan;
 if(plan?.tasksFor&&plan?.today&&plan?.addDays){
  const today=plan.today();let date=today;if(date<plan.START)date=plan.START;
  const completedSubjectsToday=new Set();
  for(const l of lessons){
   const stamp=progress[l.id];if(!stamp)continue;
   const parsed=new Date(stamp);if(!Number.isFinite(parsed.getTime()))continue;
   const f=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(parsed);
   const val=k=>f.find(v=>v.type===k)?.value||'';
   if(`${val('year')}-${val('month')}-${val('day')}`===today)completedSubjectsToday.add(l.subject);
  }
  for(let n=0;n<160&&date<=plan.EXAM;n++,date=plan.addDays(date,1)){
   const tasks=plan.tasksFor(date,lessons,progress);
   const candidate=tasks.find(t=>t.type==='lesson'&&t.lesson?.id&&t.lesson.id!==currentId&&!progress[t.lesson.id]
     &&(date!==today||!completedSubjectsToday.has(t.subject)));
   if(candidate)return {lesson:candidate.lesson,date};
  }
 }
 const next=[...lessons].filter(l=>!progress[l.id]&&l.id!==currentId)
  .sort((a,b)=>a.subject.localeCompare(b.subject,'pt-BR')||(a.ordemSugerida??999)-(b.ordemSugerida??999))[0];
 return next?{lesson:{id:next.id,title:next.title,subject:next.subject},date:null}:null;
}
function updateNextLessonButton(){
 const btn=$('exercise');if(!btn||!active)return;
 if(!progress[active.id]){
  btn.textContent='🔒 Conclua esta aula para ir à próxima';btn.removeAttribute('href');btn.setAttribute('aria-disabled','true');btn.classList.add('tj-next-disabled');return;
 }
 const next=plannedNextLesson(active.id);
 btn.classList.remove('tj-next-disabled');btn.removeAttribute('aria-disabled');
 if(next){btn.href='./conteudo.html?lesson='+encodeURIComponent(next.lesson.id);
  btn.textContent='Próxima aula do calendário: '+next.lesson.subject+' — '+next.lesson.title+' →';
  btn.title=next.date?'Planejada para '+next.date:'Próxima aula pendente';
 }else{btn.href='./calendario.html';btn.textContent='✓ Aulas programadas concluídas — consultar calendário →';btn.title='';}
}
function openLesson(id){const l=lessons.find(x=>x.id===id);if(!l)return;const visit=++lessonVisit;active=l;$('catalog').classList.add('hide');$('lesson').classList.remove('hide');$('crumb').textContent=l.subject+' · '+l.level;$('lessonTitle').textContent=l.title;$('objective').textContent=l.objective;$('status').textContent=progress[l.id]?'✓ Concluída':'○ Não concluída';$('complete').textContent=progress[l.id]?'↺ Desmarcar conclusão':'✓ Marcar como concluída';const section=`<div id="lessonSections" aria-busy="true" class="tj-teaching-wait">Organizando explicações por conceito…</div>`;$('lessonBody').innerHTML=`<div class="visualCustom"><strong>📍 Ordem recomendada: ${l.ordemSugerida>=100?'Complementar':l.ordemSugerida}ª aula de ${escapeHtml(l.subject)}</strong><p>Como estudar: ${escapeHtml(l.conclusaoOrientada||'Leia, resolva exemplos e pratique.')}</p><small>Retome este assunto após 1, 7 e 21 dias. ${escapeHtml(l.etapa||'')}</small></div><div class="formula">${escapeHtml(l.formula)}</div><div class="diagram"><div><small>Conceito</small><br><strong>${escapeHtml(l.subject)}</strong></div><span style="font-size:26px;color:#b50913">➜</span><div><small>Objetivo da aula</small><br><strong style="font-size:14px">${escapeHtml(l.objective)}</strong></div></div>${section}${l.subject==='Português'?'':`<div class="example"><h3>🧩 Exemplo resolvido</h3><p>${escapeHtml(l.example)}</p></div>`}<h3>⚠️ Erros comuns</h3><ul class="pitfallList">${l.pitfalls.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><h3>📖 Referência e verificação</h3><p>${escapeHtml(l.source)}</p>${l.fonteOficialBase?`<p><a href="${escapeHtml(l.fonteOficialBase)}" rel="noopener noreferrer" target="_blank">Consultar fonte oficial para conferência de alterações</a></p>`:""}`;const visual=l.subject==='Português'?'':l.visual?.kind==='percent'?`<div class="visualCustom"><strong>${escapeHtml(l.visual.label)}</strong><div class="percentGrid">${Array.from({length:100},(_,i)=>`<span class="${i<l.visual.value?'filled':''}"></span>`).join('')}</div><small>As células coloridas representam ${l.visual.value} de cada 100 partes.</small></div>`:l.visual?.kind==='logic'?`<div class="visualCustom"><strong>Tabela-verdade: condicional P → Q</strong><table><tr><th>P</th><th>Q</th><th>P → Q</th></tr><tr><td>V</td><td>V</td><td>V</td></tr><tr><td>V</td><td>F</td><td>F</td></tr><tr><td>F</td><td>V</td><td>V</td></tr><tr><td>F</td><td>F</td><td>V</td></tr></table></div>`:l.visual?.kind==='ratio'?`<div class="visualCustom"><strong>Relação inversa — mais máquinas, menos tempo</strong><div class="diagram"><span>5 máquinas<br>8 horas</span><b>→</b><span>10 máquinas<br>4 horas</span></div></div>`:l.visual?.kind==='reading'?`<div class="visualCustom"><strong>Escada da compreensão</strong><div class="readingSteps" aria-label="Etapas da interpretação"><span>1. Identifique as informações explícitas</span><span>2. Reúna as pistas relevantes</span><span>3. Formule apenas uma inferência sustentada</span></div></div>`:'';
const steps=l.subject==='Português'?'':l.steps?.length?`<div class="example"><h3>🔎 Resolução comentada passo a passo</h3><ol>${l.steps.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol></div>`:'';
const refs=l.subject==='Português'?'':l.references?.length?`<div class="visualCustom"><h3>Fontes para aprofundar e conferir</h3><ul>${l.references.map(r=>{let url='';try{const u=new URL(r.url);if(u.protocol==='https:')url=u.href}catch{}return url?`<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.name)}</a></li>`:''}).join('')}</ul><small>Links de apoio; confira o conteúdo programático e as atualizações da legislação no edital oficial.</small></div>`:'';
const checks=`<div class="visualCustom" id="practiceHost" aria-live="polite"><h3>🧠 Teste sua compreensão</h3><p class="dim">Sorteando novas questões desta aula...</p></div>`;
$('lessonBody').insertAdjacentHTML('beforeend',checks+refs+'<section class="studyNotes visualCustom" id="notesHost"><p>Preparando resumo para seu caderno…</p></section>');
if(true){const body=$('lessonBody');body.querySelector('.formula')?.remove();body.querySelector(':scope > .diagram')?.remove();body.querySelectorAll(':scope > h3,:scope > ul.pitfallList,:scope > p,:scope > .example').forEach(el=>el.remove());}
passedLessonId=null;lessonCompletionState(l);populateTeachingLayout(l,visit);populatePractice(l,visit);populateNotebook(l,visit);
$('saveMsg').textContent='';updateNextLessonButton();window.scrollTo(0,0);}
$('back').onclick=()=>{lessonVisit++;$('lesson').classList.add('hide');$('catalog').classList.remove('hide');cards();window.scrollTo(0,0);};
$('complete').onclick=async()=>{if(!active)return;if(!currentUser||!profileId){$('saveMsg').textContent='Entre no TJSP Duo para sincronizar seu progresso.';return;}const key=active.id;if(progress[key]){$('saveMsg').textContent='Esta aula já está concluída. Seu progresso foi preservado.';return;}if(passedLessonId!==key){$('saveMsg').textContent='Para concluir esta aula, acerte todas as questões na mesma rodada. Revise os erros e refaça quando necessário.';return;}const next=true;$('complete').disabled=true;$('saveMsg').textContent='Salvando no Firebase...';try{const ref=doc(db,'profiles',String(profileId));const snap=await getDoc(ref);const current=snap.data();if(!current||current.uid!==currentUser.uid)throw Error('Perfil não encontrado ou não autorizado');const updated={...(current.lessonProgress||{})};if(next)updated[key]=new Date().toISOString();else delete updated[key];await updateDoc(ref,{lessonProgress:updated});progress=updated;updateProgress();updateNextLessonButton();$('status').textContent=next?'✓ Concluída':'○ Não concluída';$('complete').textContent=next?'↺ Desmarcar conclusão':'✓ Marcar como concluída';$('saveMsg').textContent='Parabéns! Aula concluída com 100% na rodada de fixação. Progresso sincronizado.';lessonCompletionState(active);}catch(e){$('saveMsg').textContent='Falha ao salvar: '+e.message;}finally{if(active)lessonCompletionState(active);}};
async function init(){try{await fetchLessons();render();const params=new URLSearchParams(location.search),direct=params.get('lesson'),subject=params.get('materia');if(direct&&lessons.some(l=>l.id===direct)){const item=lessons.find(l=>l.id===direct);currentSubject=item.subject;currentTopic=topicFor(item);openLesson(direct);}else if(subject&&lessons.some(l=>l.subject===subject)){currentSubject=subject;const requested=params.get('assunto');if(requested){const matches=lessons.filter(l=>l.subject===subject);const names=new Set(matches.map(topicFor));if(names.has(requested))currentTopic=requested;}cards();}onAuthStateChanged(auth,async user=>{currentUser=user;if(!user){$('who').textContent='Entre no site principal para salvar o progresso';return;}try{for(const slot of ['1','2','3','4','5']){const snap=await getDoc(doc(db,'slots',slot));if(snap.exists()&&snap.data().uid===user.uid){profileId=slot;const profile=await getDoc(doc(db,'profiles',slot));progress=profile.data()?.lessonProgress||{};$('who').textContent='Progresso sincronizado com sua conta';updateProgress();cards();if(active){lessonCompletionState(active);updateNextLessonButton();}return;}}$('who').textContent='Conta sem perfil vinculado.';}catch(e){$('who').textContent='Erro ao carregar progresso: '+e.message;}});}catch(e){$('who').textContent=e.message;}}init();
