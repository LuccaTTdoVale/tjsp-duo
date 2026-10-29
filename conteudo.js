import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,updateDoc,runTransaction} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id), escapeHtml=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
let lessons=[],progress={},profileId=null,active=null,currentUser=null;
let practicePromise=null,lessonVisit=0;
function getPracticeData(){
 if(!practicePromise)practicePromise=fetch('./questoes-aulas.json?v=3')
   .then(r=>{if(!r.ok)throw Error('Banco de prática não encontrado');return r.json();})
   .catch(e=>{console.warn('Banco completo indisponível:',e);return {version:3,questions:{},lessons:{},custom:{}};});
 return practicePromise;
}
function shuffle(list){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function practiceKey(l){return 'tjduo-seen-v3:'+String(currentUser?.uid||'visitante')+':'+encodeURIComponent(l.id);}
function readSeen(l){try{const v=JSON.parse(localStorage.getItem(practiceKey(l))||'[]');return Array.isArray(v)?v.filter(x=>typeof x==='string').slice(-1000):[]}catch{return [];}}
function writeSeen(l,ids){try{localStorage.setItem(practiceKey(l),JSON.stringify(ids.slice(-1000)))}catch(e){console.warn('Histórico local indisponível',e);}}
function getPool(l,data){
 const questionIds=data.lessons?.[l.id]||[];
 const bank=questionIds.map(id=>{const q=data.questions?.[String(id)];return q?{...q,key:'bank_'+id,origin:'bank'}:null;}).filter(Boolean);
 const custom=(data.custom?.[l.id]||[]).map((q,i)=>({...q,key:'custom_'+String(q.id||i),origin:'custom'}));
 const authored=(l.check||[]).map((q,i)=>({...q,key:'authored_'+i,origin:'authored'}));
 const map=new Map();
 // Agrupar por enunciado evita duplicidade literal, mesmo com alternativas reordenadas.
 for(const q of [...bank,...custom,...authored]){
   const sig=String(q.q||'').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g,' ')+'|'+[...q.options].map(String).sort().join('|');
   if(!sig||!Array.isArray(q.options)||q.options.length<2||!Number.isInteger(Number(q.answer))||Number(q.answer)<0||Number(q.answer)>=q.options.length)continue;
   if(!map.has(sig))map.set(sig,q);
 }
 return [...map.values()];
}
function pickPractice(l,data){
 const pool=getPool(l,data);if(!pool.length)return {picked:[],total:0,left:0};
 const count=Math.min(5,pool.length),seen=readSeen(l),seenSet=new Set(seen);
 let available=pool.filter(q=>!seenSet.has(q.key));
 // Só reiniciar o ciclo quando todos os exercícios disponíveis já foram usados.
 if(available.length<count){available=pool;seen.length=0;seenSet.clear();}
 const picked=[];const usedGroups=new Set();const random=shuffle(available);
 // Uma frase introdutória pode ter 200 versões; não repetir a mesma ideia no mesmo conjunto.
 for(const q of random){const group=q.group||q.q;if(usedGroups.has(group))continue;picked.push(q);usedGroups.add(group);if(picked.length===count)break;}
 if(picked.length<count)for(const q of random){if(picked.some(x=>x.key===q.key))continue;picked.push(q);if(picked.length===count)break;}
 writeSeen(l,[...seen,...picked.map(q=>q.key)]);
 const result=picked.map(q=>{
   const order=shuffle(q.options.map((_,i)=>i));
   return {...q,options:order.map(i=>q.options[i]),answer:order.indexOf(Number(q.answer)),
     wrong:Array.isArray(q.wrong)?order.map(i=>q.wrong[i]||''):[]};
 });
 return {picked:result,total:pool.length,left:Math.max(0,available.length-count)};
}
async function populatePractice(l,visit){
 const host=$('practiceHost');if(!host)return;
 const data=await getPracticeData();
 if(visit!==lessonVisit||active?.id!==l.id||$('lesson').classList.contains('hide'))return;
 const list=pickPractice(l,data.lessons?.[l.id]);
 if(!list.length){host.textContent='Não há questões de fixação disponíveis nesta aula.';return;}
 host.innerHTML=`<div class="practiceTop"><div><h3>🧠 Teste sua compreensão</h3><p class="dim">${total} questões distintas ligadas a esta aula · ${left} ainda não vistas neste ciclo · seleção renovada a cada entrada.</p></div><button class="btn secondary" type="button" id="newQuestions">↻ Outras questões</button></div>${list.map((q,i)=>`<div class="checkQuestion"><strong>${i+1}. ${escapeHtml(q.q)}</strong>${q.options.map((o,j)=>`<button type="button" class="checkOpt" data-i="${i}" data-choice="${j}" aria-pressed="false">${escapeHtml(String.fromCharCode(65+j)+') '+o)}</button>`).join('')}<p class="checkFeedback" id="checkFeedback${i}" aria-live="polite"></p></div>`).join('')}`;
 host.querySelector('#newQuestions')?.addEventListener('click',()=>populatePractice(l,visit));
 host.querySelectorAll('.checkOpt').forEach(btn=>btn.addEventListener('click',async()=>{
  const i=Number(btn.dataset.i),chosen=Number(btn.dataset.choice),q=list[i];
  const fb=$('checkFeedback'+i);if(!fb||btn.disabled)return;
  const answer=q.answer,correct=chosen===answer;
  const buttons=[...host.querySelectorAll('.checkOpt[data-i="'+i+'"]')];
  buttons.forEach(b=>{const n=Number(b.dataset.choice);b.classList.toggle('is-wrong',n===chosen&&!correct);b.classList.toggle('is-correct',n===answer);b.classList.toggle('was-answer',n===answer&&!correct);b.setAttribute('aria-pressed',String(n===chosen));b.disabled=true;});
  const chosenText=String.fromCharCode(65+chosen)+') '+q.options[chosen];
  const correctText=String.fromCharCode(65+answer)+') '+q.options[answer];
  fb.replaceChildren();const box=document.createElement('div');box.className='feedbackBox'+(correct?'':' incorrect');
  const title=document.createElement('strong');title.textContent=correct?'✓ Você acertou!':'✕ Resposta incorreta — veja onde está o erro';box.append(title);
  const p1=document.createElement('p');p1.textContent=correct?'Resposta: '+correctText:'Você marcou: '+chosenText+' | Resposta correta: '+correctText;box.append(p1);
  const p2=document.createElement('p');const specific=Array.isArray(q.wrong)?q.wrong[chosen]:'';p2.textContent='Explicação: '+(!correct&&specific&&specific!==q.why?specific+' '+(q.why||''):q.why||'Revise a regra apresentada na aula e compare com as alternativas.');box.append(p2);
  const status=document.createElement('small');status.className='feedbackSaved';if(!correct){status.textContent='Registrando erro no seu Caderno de Erros...';box.append(status);}fb.append(box);
  if(!correct){
   if(!currentUser||!profileId){status.textContent='Entre na sua conta para salvar este erro.';return;}
   try{await saveLessonMistake(l,q.key,{...q,why:p2.textContent},chosen);status.textContent='✓ Erro salvo no Caderno de Erros.';}
   catch(e){status.textContent='Erro de sincronização: '+e.message+' (você poderá refazer a questão).';}
  }
 }));
}

async function fetchLessons(){const r=await fetch('./aulas.json?v=4');if(!r.ok)throw Error('Não foi possível baixar as aulas');lessons=await r.json();}
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
async function saveLessonMistake(l,questionKey,q,chosen){
 if(!currentUser||!profileId)throw Error('Usuário sem perfil autenticado');
 const ref=doc(db,'profiles',String(profileId));
 const key=l.id+'__'+String(questionKey),now=new Date().toISOString();
 await runTransaction(db,async tx=>{
   const snap=await tx.get(ref);const data=snap.data();
   if(!snap.exists()||data.uid!==currentUser.uid)throw Error('Você não tem acesso a este perfil');
   const errors={...(data.lessonErrors||{})};const old=errors[key]||{};
   errors[key]={id:key,lessonId:l.id,subject:l.subject,topic:l.title,title:l.title,question:q.q,options:q.options,
      choice:chosen,answer:q.answer,explanation:q.why,lastSeen:now,firstSeen:old.firstSeen||now,count:(old.count||0)+1};
   tx.update(ref,{lessonErrors:errors});
 });
}
function openLesson(id){const l=lessons.find(x=>x.id===id);if(!l)return;const visit=++lessonVisit;active=l;$('catalog').classList.add('hide');$('lesson').classList.remove('hide');$('crumb').textContent=l.subject+' · '+l.level;$('lessonTitle').textContent=l.title;$('objective').textContent=l.objective;$('status').textContent=progress[l.id]?'✓ Concluída':'○ Não concluída';$('complete').textContent=progress[l.id]?'↺ Desmarcar conclusão':'✓ Marcar como concluída';const section=l.sections.map(([h,p])=>`<section class="lesson-section"><h3>${escapeHtml(h)}</h3><p>${escapeHtml(p)}</p></section>`).join('');$('lessonBody').innerHTML=`<div class="visualCustom"><strong>📍 Ordem recomendada: ${l.ordemSugerida>=100?'Complementar':l.ordemSugerida}ª aula de ${escapeHtml(l.subject)}</strong><p>Como estudar: ${escapeHtml(l.conclusaoOrientada||'Leia, resolva exemplos e pratique.')}</p><small>Retome este assunto após 1, 7 e 21 dias. ${escapeHtml(l.etapa||'')}</small></div><div class="formula">${escapeHtml(l.formula)}</div><div class="diagram"><div><small>Conceito</small><br><strong>${escapeHtml(l.subject)}</strong></div><span style="font-size:26px;color:#b50913">➜</span><div><small>Objetivo da aula</small><br><strong style="font-size:14px">${escapeHtml(l.objective)}</strong></div></div>${section}<div class="example"><h3>🧩 Exemplo resolvido</h3><p>${escapeHtml(l.example)}</p></div><h3>⚠️ Erros comuns</h3><ul class="pitfallList">${l.pitfalls.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul><h3>📖 Referência e verificação</h3><p>${escapeHtml(l.source)}</p>${l.fonteOficialBase?`<p><a href="${escapeHtml(l.fonteOficialBase)}" rel="noopener noreferrer" target="_blank">Consultar fonte oficial para conferência de alterações</a></p>`:""}`;const visual=l.visual?.kind==='percent'?`<div class="visualCustom"><strong>${escapeHtml(l.visual.label)}</strong><div class="percentGrid">${Array.from({length:100},(_,i)=>`<span class="${i<l.visual.value?'filled':''}"></span>`).join('')}</div><small>As células coloridas representam ${l.visual.value} de cada 100 partes.</small></div>`:l.visual?.kind==='logic'?`<div class="visualCustom"><strong>Tabela-verdade: condicional P → Q</strong><table><tr><th>P</th><th>Q</th><th>P → Q</th></tr><tr><td>V</td><td>V</td><td>V</td></tr><tr><td>V</td><td>F</td><td>F</td></tr><tr><td>F</td><td>V</td><td>V</td></tr><tr><td>F</td><td>F</td><td>V</td></tr></table></div>`:l.visual?.kind==='ratio'?`<div class="visualCustom"><strong>Relação inversa — mais máquinas, menos tempo</strong><div class="diagram"><span>5 máquinas<br>8 horas</span><b>→</b><span>10 máquinas<br>4 horas</span></div></div>`:l.visual?.kind==='reading'?`<div class="visualCustom"><strong>Escada da compreensão</strong><div class="diagram"><span>Texto literal</span><b>→</b><span>Pistas do texto</span><b>→</b><span>Inferência sustentada</span></div></div>`:'';
const steps=l.steps?.length?`<div class="example"><h3>🔎 Resolução comentada passo a passo</h3><ol>${l.steps.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol></div>`:'';
const refs=l.references?.length?`<div class="visualCustom"><h3>Fontes para aprofundar e conferir</h3><ul>${l.references.map(r=>{let url='';try{const u=new URL(r.url);if(u.protocol==='https:')url=u.href}catch{}return url?`<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.name)}</a></li>`:''}).join('')}</ul><small>Links de apoio; confira o conteúdo programático e as atualizações da legislação no edital oficial.</small></div>`:'';
const checks=`<div class="visualCustom" id="practiceHost" aria-live="polite"><h3>🧠 Teste sua compreensão</h3><p class="dim">Sorteando novas questões desta aula...</p></div>`;
$('lessonBody').insertAdjacentHTML('beforeend',visual+steps+checks+refs);
populatePractice(l,visit);
$('saveMsg').textContent='';const link=new URL('./questoes.html',location.href);link.searchParams.set('materia',l.subject);link.searchParams.set('assunto',l.title.split(':')[0]);$('exercise').href=link.href;window.scrollTo(0,0);}
$('back').onclick=()=>{lessonVisit++;$('lesson').classList.add('hide');$('catalog').classList.remove('hide');cards();window.scrollTo(0,0);};
$('complete').onclick=async()=>{if(!active)return;if(!currentUser||!profileId){$('saveMsg').textContent='Entre no TJSP Duo para sincronizar seu progresso.';return;}const key=active.id;const next=!progress[key];$('complete').disabled=true;$('saveMsg').textContent='Salvando no Firebase...';try{const ref=doc(db,'profiles',String(profileId));const snap=await getDoc(ref);const current=snap.data();if(!current||current.uid!==currentUser.uid)throw Error('Perfil não encontrado ou não autorizado');const updated={...(current.lessonProgress||{})};if(next)updated[key]=new Date().toISOString();else delete updated[key];await updateDoc(ref,{lessonProgress:updated});progress=updated;updateProgress();$('status').textContent=next?'✓ Concluída':'○ Não concluída';$('complete').textContent=next?'↺ Desmarcar conclusão':'✓ Marcar como concluída';$('saveMsg').textContent='Progresso salvo e sincronizado!';}catch(e){$('saveMsg').textContent='Falha ao salvar: '+e.message;}finally{$('complete').disabled=false;}};
async function init(){try{await fetchLessons();render();const params=new URLSearchParams(location.search),direct=params.get('lesson'),subject=params.get('materia');if(direct&&lessons.some(l=>l.id===direct)){const item=lessons.find(l=>l.id===direct);currentSubject=item.subject;currentTopic=topicFor(item);openLesson(direct);}else if(subject&&lessons.some(l=>l.subject===subject)){currentSubject=subject;const requested=params.get('assunto');if(requested){const matches=lessons.filter(l=>l.subject===subject);const names=new Set(matches.map(topicFor));if(names.has(requested))currentTopic=requested;}cards();}onAuthStateChanged(auth,async user=>{currentUser=user;if(!user){$('who').textContent='Entre no site principal para salvar o progresso';return;}try{for(const slot of ['1','2']){const snap=await getDoc(doc(db,'slots',slot));if(snap.exists()&&snap.data().uid===user.uid){profileId=slot;const profile=await getDoc(doc(db,'profiles',slot));progress=profile.data()?.lessonProgress||{};$('who').textContent='Progresso sincronizado com sua conta';updateProgress();cards();return;}}$('who').textContent='Conta sem perfil vinculado.';}catch(e){$('who').textContent='Erro ao carregar progresso: '+e.message;}});}catch(e){$('who').textContent=e.message;}}init();
