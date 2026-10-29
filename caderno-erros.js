import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import {getAuth,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs,runTransaction} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clean=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const app=getApps().length?getApp():initializeApp(firebaseConfig);
const auth=getAuth(app),db=getFirestore(app);
let activeUser=null,profileId=null,reviewed={},entries=[],lessons=[],isLoading=false,topicTargets={};
const status=(txt)=>{$('notebookStatus').textContent=txt;$('notebookStatus').hidden=!txt;};
async function profileForUser(uid){for(const id of ['1','2','3','4','5']){const sl=await getDoc(doc(db,'slots',id));if(sl.exists()&&sl.data().uid===uid)return id;}return null;}
function lessonMatch(subject,topic){
 const list=lessons.filter(l=>l.subject===subject);if(!list.length)return null;
 const t=clean(topic),a=new Set(t.split(' ').filter(x=>x.length>3));
 let best=null,score=0;
 for(const l of list){const n=clean(l.title),b=new Set(n.split(' ').filter(x=>x.length>3));
   let s=0;if(t&&n.includes(t))s+=20;if(t&&t.includes(n))s+=16;
   for(const w of a)if(b.has(w))s+=3;
   if(s>score){score=s;best=l;}
 }
 // Só vinculamos à aula específica quando há correspondência textual confiável.
 return score>=3?best:null;
}
function reviewTarget(item){
 if(item.lessonId){const exact=lessons.find(l=>l.id===item.lessonId);if(exact)return {name:exact.title,url:'./conteudo.html?lesson='+encodeURIComponent(exact.id)};}
 const mappedId=topicTargets[item.subject+'|'+item.topic];
 const mapped=lessons.find(l=>l.id===mappedId);
 if(mapped)return {name:mapped.title,url:'./conteudo.html?lesson='+encodeURIComponent(mapped.id)};
 const target=lessonMatch(item.subject,item.topic);
 if(target)return {name:target.title,url:'./conteudo.html?lesson='+encodeURIComponent(target.id)};
 return {name:'Ver aulas de '+item.subject+' (sem aula exata cadastrada)',url:'./conteudo.html?materia='+encodeURIComponent(item.subject)};
}
function foldExamErrors(docs,bank){
 const questionMap=new Map(bank.map(q=>[Number(q.i),q])),collected=new Map();
 const exams=docs.sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
 for(const exam of exams){const date=exam.createdAt||exam.date||'';
   for(const r of exam.responses||[]){const id=Array.isArray(r)?Number(r[0]):Number(r?.id),choice=Array.isArray(r)?r[1]:r?.choice;
     const q=questionMap.get(id);if(!q||choice===null||choice===undefined||choice===q.a)continue;
     const k='exam:'+id,previous=collected.get(k);
     collected.set(k,{key:k,source:'exam',subject:q.s,topic:q.t,question:q.q,options:q.o,choice,answer:q.a,
       explanation:q.e||'Consulte a explicação do simulado e refaça o exercício.',lastSeen:date,
       count:(previous?.count||0)+1});
   }
 }
 return [...collected.values()];
}
function isReviewed(item){return Boolean(reviewed[item.key]&&reviewed[item.key]>=item.lastSeen);}
function populateSummary(){
 $('totalMistakes').textContent=entries.length;
 $('openMistakes').textContent=entries.filter(x=>!isReviewed(x)).length;
 $('doneMistakes').textContent=entries.filter(isReviewed).length;
}
function textOption(item,i){return i===null||i===undefined||!Array.isArray(item.options)?'Não informada':
   (String.fromCharCode(65+Number(i))+') '+String(item.options[i]??'(alternativa indisponível)'));
}
function renderEntries(){populateSummary();const q=clean($('searchMistake').value),filter=$('statusMistake').value;
 const rows=entries.filter(e=>
   (filter==='all'||(filter==='pending'?!isReviewed(e):isReviewed(e)))&&
   (!q||clean([e.subject,e.topic,e.question,e.explanation].join(' ')).includes(q)));
 if(!rows.length){$('mistakeList').innerHTML='<div class="noteEmpty">Nenhum erro encontrado neste filtro. Se você já respondeu simulados, confira se entrou na conta correta.</div>';return;}
 $('mistakeList').innerHTML=rows.map(x=>{
   const reviewedNow=isReviewed(x),target=reviewTarget(x);
   const choice=textOption(x,x.choice),answer=textOption(x,x.answer);
   const date=x.lastSeen?new Date(x.lastSeen).toLocaleDateString('pt-BR'):'Data indisponível';
   return `<article class="noteCard ${reviewedNow?'':'isPending'}" data-error="${esc(x.key)}">
     <div class="noteMeta">✎ Simulado · ${esc(x.subject)} / ${esc(x.topic)} · ${esc(date)} · ${x.count} ${x.count===1?'erro registrado':'erros registrados'}</div>
     <h3>${esc(x.question)}</h3>
     <div class="noteWrong"><strong>Onde você errou</strong><p>Você marcou: <b>${esc(choice)}</b></p></div>
     <div class="noteRight"><strong>Resposta correta: ${esc(answer)}</strong><p>Explicação: ${esc(x.explanation)}</p></div>
     <p class="notebookHelp"><b>O que revisar:</b> ${esc(x.topic)}. Leia a aula relacionada, refaça o exemplo sem consultar e responda outra questão do mesmo assunto.</p>
     <div class="noteActions"><a class="noteBtn secondary" href="${esc(target.url)}">📚 Revisar: ${esc(target.name)}</a>
     <button class="noteBtn" type="button" data-mark="${esc(x.key)}" ${reviewedNow?'disabled':''}>${reviewedNow?'✓ Revisado':'Marcar como revisado'}</button></div>
   </article>`;
 }).join('');
 $('mistakeList').querySelectorAll('button[data-mark]:not([disabled])').forEach(b=>b.addEventListener('click',()=>markReviewed(b.dataset.mark,b)));
}
async function markReviewed(key,button){if(!activeUser||!profileId)return;
 button.disabled=true;button.textContent='Salvando...';const ref=doc(db,'profiles',profileId),date=new Date().toISOString();
 try{await runTransaction(db,async tx=>{const snap=await tx.get(ref);if(!snap.exists()||snap.data().uid!==activeUser.uid)throw Error('Perfil sem permissão');const updated={...(snap.data().reviewedErrors||{}),[key]:date};tx.update(ref,{reviewedErrors:updated});});
 reviewed[key]=date;renderEntries();status('Revisão marcada e sincronizada com o seu perfil.');}
 catch(e){button.disabled=false;button.textContent='Tentar novamente';status('Falha ao registrar revisão: '+e.message);}
}
async function loadCurrentUser(user){activeUser=user;profileId=null;reviewed={};entries=[];populateSummary();
 if(!user){$('currentStudent').textContent='Entre na sua conta';status('Para acessar os seus erros, faça login no TJSP DUO e volte a esta página.');$('mistakeList').innerHTML='<div class="noteEmpty"><a class="noteBtn" href="./index.html">Entrar no TJSP DUO</a></div>';return;}
 isLoading=true;status('Carregando erros e aulas...');
 try{
   profileId=await profileForUser(user.uid);if(!profileId)throw Error('Este usuário não possui um perfil vinculado.');
   const ref=doc(db,'profiles',profileId);
   const [profile,examsSnap,lessonsResp,practiceResp]=await Promise.all([
     getDoc(ref),getDocs(collection(db,'users',user.uid,'exams')),fetch('./aulas.json',{cache:'no-cache'}),fetch('./questoes-aulas.json?v=3').catch(()=>null)
   ]);
   if(!profile.exists()||profile.data().uid!==user.uid)throw Error('Perfil inválido.');
   if(!lessonsResp.ok)throw Error('Falha ao carregar a lista de aulas.');
   lessons=await lessonsResp.json();topicTargets=practiceResp?.ok?(await practiceResp.json()).targets||{}:{};reviewed=profile.data().reviewedErrors||{};
   // Questões de aulas não são contabilizadas aqui; o caderno é exclusivo para simulados.
   const examDocs=examsSnap.docs.map(d=>d.data());let examEntries=[];
   if(examDocs.length){
     status('Localizando as questões dos seus simulados...');
     const bankResp=await fetch('./banco-consulta.json',{cache:'default'});
     if(!bankResp.ok)throw Error('Arquivo banco-consulta.json não encontrado no GitHub.');
     examEntries=foldExamErrors(examDocs,await bankResp.json());
   }
   entries=examEntries.sort((a,b)=>String(b.lastSeen||'').localeCompare(String(a.lastSeen||'')));
   $('currentStudent').textContent=(profile.data().username||user.email||'Seu perfil')+' · Perfil '+profileId;
   status('');renderEntries();
 }catch(e){status('Não foi possível abrir seu Caderno: '+e.message+'. Verifique a conexão, a publicação dos arquivos e as permissões do Firebase.');
   $('mistakeList').innerHTML='<div class="noteEmpty">Não foi possível carregar todos os registros; nenhum erro foi excluído.</div>';
 }finally{isLoading=false;}
}
for(const id of ['searchMistake','statusMistake'])$(id).addEventListener(id==='searchMistake'?'input':'change',()=>{if(!isLoading)renderEntries()});
onAuthStateChanged(auth,loadCurrentUser,error=>status('Erro ao autenticar: '+error.message));
