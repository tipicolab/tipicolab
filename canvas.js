/* Tipico Lab — Canvas a nodi (stile Higgsfield Canvas).
   Riusa la logica di generazione di index.html: lanciaGenerazione() → /api/genera, /api/lavoro,
   compilaPromptCon() per i tag, /api/stima per i costi, segnaposto condivisi con la Griglia.
   Board salvata per progetto in canvas.json (versione 2) tramite /api/canvas. */
(()=>{
'use strict';
const SVGNS='http://www.w3.org/2000/svg';
const GRID=24,TOLL=6,MAXUNDO=120;
const LARGH={prompt:300,ref:230,gen:320,nota:230};
const TIT={prompt:'Prompt',ref:'Reference',gen:'Generazione',nota:'Nota',frame:'Gruppo'};

/* ---------------- stato ---------------- */
let B=null;                 // board corrente: {progetto, nodi:[], archi:[], vista}
const V={x:0,y:0,z:1};
const sel=new Set();let selArco=null;
const el=new Map();         // id nodo → elemento
const corse=new Map();      // id nodo gen → {job,t,ar,errore,progetto}
let attivo=false,assets=[],caricando=null,spazio=false,mouse={x:0,y:0};
let pilaUndo=[],pilaRedo=[],ultimo='';
let clip=null;              // appunti interni (nodi copiati)
const cacheDati=new Map(),cacheMeta=new Map(),stime=new Map();
const uid=()=>Math.random().toString(36).slice(2,10);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const modello=id=>S.modelli.find(m=>m.id===id);
const kindDa=f=>/\.(mp4|mov|webm)$/i.test(f)?'video':/\.(mp3|m4a|wav|aac|ogg)$/i.test(f)?'audio':'image';
const kindMime=t=>/^video\//.test(t)?'video':/^audio\//.test(t)?'audio':/^image\//.test(t)?'image':null;
const url=f=>urlF(B.progetto,f);

/* ---------------- DOM ---------------- */
const wrap=$('#cvWrap');
wrap.innerHTML=`
<div id="nb" tabindex="-1">
  <div id="nbMondo"><div id="nbScala"><div id="nbFrame"></div><svg id="nbArchi"></svg><div id="nbNodi"></div><div id="nbGuide"></div></div></div>
  <div id="nbMarquee"></div>
  <div class="nb-vuoto" id="nbVuoto" hidden><b>Canvas vuota</b>Aggiungi un nodo dalla barra in alto, fai doppio clic sulla board o trascina qui foto e video dal Finder.</div>
</div>
<div class="nb-barra">
  <button data-add="prompt">+ Prompt</button><button data-add="ref">+ Reference</button><button data-add="gen">+ Generazione</button>
  <button data-add="nota">+ Nota</button><button data-add="frame">+ Gruppo</button><span class="sep"></span>
  <button id="nbEsegui" class="btn-dark" disabled>Esegui selezionati</button><span class="sep"></span>
  <button id="nbUndo" title="Annulla (⌘Z)">↶</button><button id="nbRedo" title="Ripeti (⇧⌘Z)">↷</button><span class="sep"></span>
  <button id="nbTpl">Template ▾</button><button id="nbAssetBtn">Asset</button>
</div>
<div class="nb-ctrl">
  <div class="nb-spesa" id="nbSpesa" hidden></div>
  <canvas id="nbMini" width="200" height="130" title="Minimappa: clicca o trascina per spostarti"></canvas>
  <div class="nb-zoom"><button id="nbMeno" title="Riduci">−</button><span id="nbPerc">100%</span><button id="nbPiu" title="Ingrandisci">+</button><button id="nbAdatta" title="Adatta alla vista (⌘0)">Adatta</button></div>
</div>
<div class="nb-asset" id="nbAsset" hidden><header>Asset del progetto<button class="btn-sm" id="nbAssetX">×</button></header>
  <p>Trascina un'immagine sulla board per creare un nodo Reference.</p><div class="lista" id="nbAssetLista"></div></div>
<div class="nb-toast" id="nbToast"></div>
<input type="file" id="nbFile" accept="image/*,video/*,audio/*" multiple hidden>`;
const nb=$('#nb'),mondo=$('#nbMondo'),scala=$('#nbScala'),strFrame=$('#nbFrame'),svg=$('#nbArchi'),strNodi=$('#nbNodi'),strGuide=$('#nbGuide');
let menuEl=null;

/* ---------------- utilità ---------------- */
let toastT=null;
function toast(t,err){const x=$('#nbToast');x.textContent=t;x.classList.toggle('err',!!err);x.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>x.classList.remove('on'),err?5000:2600)}
function aMondo(cx,cy){const r=nb.getBoundingClientRect();return {x:(cx-r.left-V.x)/V.z,y:(cy-r.top-V.y)/V.z}}
function centroVista(){const r=nb.getBoundingClientRect();return aMondo(r.left+r.width/2,r.top+r.height/2)}
const nodo=id=>B&&B.nodi.find(n=>n.id===id);
function dimNodo(n){const e=el.get(n.id);if(n.tipo==='frame')return {w:n.w,h:n.h};return {w:e?e.offsetWidth:(LARGH[n.tipo]||240),h:e?e.offsetHeight:120}}
function rett(n){const d=dimNodo(n);return {x:n.x,y:n.y,w:d.w,h:d.h}}
const inCampo=t=>t&&t.closest&&t.closest('input,textarea,select,[contenteditable],dialog');
async function datiDi(file){if(!cacheDati.has(file))cacheDati.set(file,fetch(url(file)).then(r=>{if(!r.ok)throw new Error('File non trovato: '+file);return r.blob()})
  .then(b=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(b)})));
  try{return await cacheDati.get(file)}catch(e){cacheDati.delete(file);throw e}}
function metaDi(file){if(!cacheMeta.has(file))cacheMeta.set(file,new Promise(res=>{const k=kindDa(file);
  if(k==='video'){const v=document.createElement('video');v.preload='metadata';v.muted=true;v.onloadedmetadata=()=>res({w:v.videoWidth,h:v.videoHeight,dur:v.duration});v.onerror=()=>res({w:16,h:9,dur:5});v.src=url(file)}
  else if(k==='image'){const i=new Image();i.onload=()=>res({w:i.naturalWidth,h:i.naturalHeight});i.onerror=()=>res({w:1,h:1});i.src=url(file)}
  else res({w:1,h:1})}));return cacheMeta.get(file)}

/* ---------------- tipi, porte, collegamenti ---------------- */
function tipoUscita(n){if(!n)return null;
  if(n.tipo==='prompt')return 'testo';
  if(n.tipo==='ref')return n.kind||'image';
  if(n.tipo==='gen'){const m=modello(n.modello);return m&&m.tipo!=='immagine'?'video':'image'}
  return null}
function porte(n){
  if(n.tipo!=='gen')return [];
  const m=modello(n.modello);
  if(!m)return [{p:'prompt',acc:['testo'],max:4,et:'Prompt'}];
  const P=[];
  if(m.prompt!==false)P.push({p:'prompt',acc:['testo'],max:4,et:m.prompt_opzionale?'Prompt (opzionale)':'Prompt'});
  if(m.reference){const multi=!!m.reference.multiple;P.push({p:'ref',acc:['image'],max:multi?(m.reference.max||14):1,
    et:multi?'Reference':(m.tipo==='immagine'?'Reference':'Primo frame'),obbl:!!m.reference.obbligatoria})}
  if(m.reference_fine)P.push({p:'fine',acc:['image'],max:1,et:'Ultimo frame'});
  if(m.video_sorgente)P.push({p:'video',acc:['video'],max:1,et:'Video da ingrandire',obbl:true});
  return P}
const archiIn=(id,p)=>B.archi.filter(a=>a.a===id&&(!p||a.p===p));
function raggiunge(da,a){const vis=new Set();const st=[da];while(st.length){const x=st.pop();if(x===a)return true;if(vis.has(x))continue;vis.add(x);
  B.archi.filter(e=>e.da===x).forEach(e=>st.push(e.a))}return false}
function valida(da,a,p){
  const nd=nodo(da),na=nodo(a);if(!nd||!na||da===a)return 'Collegamento non valido.';
  const t=tipoUscita(nd);const P=porte(na).find(x=>x.p===p);
  if(!t)return 'Questo nodo non ha uscite.';if(!P)return 'Questo ingresso non esiste per il modello scelto.';
  if(!P.acc.includes(t))return `Tipo non compatibile: ${t==='testo'?'testo':t} → ${P.et}.`;
  if(B.archi.some(x=>x.da===da&&x.a===a&&x.p===p))return 'Già collegati.';
  if(archiIn(a,p).length>=P.max)return `${P.et}: massimo ${P.max} per questo modello.`;
  if(raggiunge(a,da))return 'Creerebbe un ciclo.';
  return null}
function primaPortaValida(da,a){for(const P of porte(nodo(a)))if(!valida(da,a,P.p))return P.p;return null}
/* dopo un cambio di modello: toglie i collegamenti non più validi */
function ripulisciArchi(id){const n=nodo(id);const P=porte(n);let tolti=0;const tenuti=[];
  for(const a of B.archi){if(a.a!==id){tenuti.push(a);continue}
    const pp=P.find(x=>x.p===a.p);const t=tipoUscita(nodo(a.da));
    if(!pp||!pp.acc.includes(t)||tenuti.filter(x=>x.a===id&&x.p===a.p).length>=pp.max){tolti++;continue}tenuti.push(a)}
  B.archi=tenuti;if(tolti)toast(`${tolti} collegament${tolti>1?'i':'o'} rimoss${tolti>1?'i':'o'}: non compatibil${tolti>1?'i':'e'} con il nuovo modello.`)}

/* ---------------- tag ---------------- */
const pulisciTag=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9_]/g,'').slice(0,24);
function tagLibero(base,escludi){const usati=new Set(B.nodi.filter(n=>n.tag&&n.id!==escludi).map(n=>n.tag));
  if(base&&!/^(img|gen)\d*$/.test(base)&&!usati.has(base))return base;
  const pre=base&&/^gen/.test(base)?'gen':(base&&/^img/.test(base)?'img':(base||'img'));
  if(!/^(img|gen)$/.test(pre)){let i=2;while(usati.has(pre+i))i++;return pre+i}
  let i=1;while(usati.has(pre+i))i++;return pre+i}
function rinominaTag(n,nuovo){const vecchio=n.tag;nuovo=pulisciTag(nuovo);
  if(!nuovo||nuovo===vecchio)return false;
  if(B.nodi.some(x=>x!==n&&x.tag===nuovo)){toast(`Il tag @${nuovo} esiste già.`,true);return false}
  n.tag=nuovo;const re=new RegExp('@'+vecchio+'(?![a-z0-9_])','gi');
  B.nodi.filter(x=>x.tipo==='prompt').forEach(p=>{const t=p.testo.replace(re,'@'+nuovo);if(t!==p.testo){p.testo=t;aggiornaNodo(p)}});
  return true}
/* tag che un prompt può citare: sorgenti collegate alle stesse generazioni; se non è collegato, tutte */
function tagPer(pn){const gens=B.archi.filter(a=>a.da===pn.id).map(a=>a.a);
  let src=B.archi.filter(a=>gens.includes(a.a)&&a.p!=='prompt').map(a=>nodo(a.da)).filter(Boolean);
  if(!gens.length)src=B.nodi.filter(n=>n.tag&&(n.tipo==='ref'||n.tipo==='gen'));
  return [...new Map(src.map(n=>[n.id,n])).values()]}

/* ---------------- board: carica / salva ---------------- */
function nuovaBoard(progetto){return {progetto,versione:2,nodi:[],archi:[],vista:null}}
function serializza(b,perTemplate){
  return {versione:2,vista:perTemplate?null:b.vista,archi:b.archi.map(a=>({...a})),
    nodi:b.nodi.map(n=>{const o=pulito(n);if(perTemplate){if(o.tipo==='gen'){o.risultati=[];o.sel=0}if(o.tipo==='ref'){o.file=null;o.nomeOrig=''}}return o})}}
function migraV1(c){const b=nuovaBoard();const usati=new Set();
  Object.entries(c.posizioni||{}).forEach(([f,p])=>{let i=1;while(usati.has('img'+i))i++;usati.add('img'+i);
    b.nodi.push({id:uid(),tipo:'ref',x:p.x,y:p.y,file:f,kind:kindDa(f),tag:'img'+i,nomeOrig:f})});
  b.vista=c.vista||null;return b}
async function caricaBoard(progetto){
  let c={};try{c=await api('/api/canvas?progetto='+encodeURIComponent(progetto))}catch(e){}
  let b;
  if(c&&c.versione===2&&Array.isArray(c.nodi)){b={...nuovaBoard(progetto),nodi:c.nodi,archi:c.archi||[],vista:c.vista||null}}
  else if(c&&c.posizioni&&Object.keys(c.posizioni).length){b=migraV1(c);b.progetto=progetto;b.migrata=true}
  else b=nuovaBoard(progetto);
  b.progetto=progetto;return b}
let salvaT=null,salvaPend=null;
function salva(b=B){if(!b)return;salvaPend=b;clearTimeout(salvaT);salvaT=setTimeout(salvaOra,1000)}
function salvaOra(){const b=salvaPend;salvaPend=null;clearTimeout(salvaT);if(!b)return;
  if(b===B)b.vista={x:V.x,y:V.y,z:V.z};
  return api('/api/canvas',{progetto:b.progetto,board:serializza(b)}).catch(e=>toast('Salvataggio non riuscito: '+e.message,true))}
addEventListener('pagehide',()=>{if(!salvaPend)return;const b=salvaPend;if(b===B)b.vista={x:V.x,y:V.y,z:V.z};
  try{navigator.sendBeacon('/api/canvas',new Blob([JSON.stringify({progetto:b.progetto,board:serializza(b)})],{type:'application/json'}))}catch(e){}});

/* ---------------- annulla / ripeti ---------------- */
const pulito=n=>Object.fromEntries(Object.entries(n).filter(([k])=>k[0]!=='_'));
function istantanea(){return JSON.stringify({nodi:B.nodi.map(n=>{const o=pulito(n);delete o.risultati;delete o.sel;return o}),archi:B.archi})}
function commit(){if(!B)return;const s=istantanea();if(s===ultimo)return;
  pilaUndo.push(ultimo);if(pilaUndo.length>MAXUNDO)pilaUndo.shift();pilaRedo=[];ultimo=s;salva();aggiornaBarra()}
function ripristina(s){const st=JSON.parse(s);const vecchi=new Map(B.nodi.map(n=>[n.id,n]));const ris=new Map(B.nodi.filter(n=>n.tipo==='gen').map(n=>[n.id,{r:n.risultati,s:n.sel}]));
  B.nodi=st.nodi.map(n=>{if(n.tipo==='gen'){const r=ris.get(n.id);n.risultati=r?r.r:(n.risultati||[]);n.sel=r?r.s:0}return n});
  B.nodi.forEach(n=>{const v=vecchi.get(n.id);if(!v)return;for(const k in v)if(k[0]==='_')n[k]=v[k];
    /* un file già caricato non torna "vuoto" annullando */
    if(n.tipo==='ref'&&!n.file&&v.file){n.file=v.file;n.kind=v.kind;n.nomeOrig=v.nomeOrig}});
  B.archi=st.archi;ultimo=s;for(const id of [...sel])if(!nodo(id))sel.delete(id);selArco=null;
  el.forEach(e=>e.remove());el.clear();render();salva();aggiornaBarra()}
function annulla(){if(!pilaUndo.length)return;pilaRedo.push(ultimo);ripristina(pilaUndo.pop())}
function ripeti(){if(!pilaRedo.length)return;pilaUndo.push(ultimo);ripristina(pilaRedo.pop())}

/* ---------------- vista ---------------- */
/* Lo spostamento è un translate; l'ingrandimento usa CSS "zoom" (non transform: scale), così testi, bordi e immagini
   vengono impaginati e disegnati davvero alla dimensione a cui li vedi: sempre nitidi, anche a 300%.
   (Con scale il motore di Safari disegna la board a 100% e poi la allarga come una foto: sfocata.) */
function applica(){mondo.style.transform=`translate(${V.x}px,${V.y}px)`;if(scala.style.zoom!==String(V.z))scala.style.zoom=V.z;
  let g=GRID*V.z;while(g<12)g*=2;nb.style.backgroundSize=`${g}px ${g}px`;nb.style.backgroundPosition=`${V.x}px ${V.y}px`;
  $('#nbPerc').textContent=Math.round(V.z*100)+'%';disegnaMini();if(B)salva()}
function zoomA(cx,cy,z){const r=nb.getBoundingClientRect();z=Math.min(3,Math.max(.1,z));
  const p=aMondo(cx,cy);V.z=z;V.x=cx-r.left-p.x*z;V.y=cy-r.top-p.y*z;applica()}
function zoomCentro(z){const r=nb.getBoundingClientRect();zoomA(r.left+r.width/2,r.top+r.height/2,z)}
function limiti(lista){if(!lista.length)return null;const R=lista.map(rett);
  const x=Math.min(...R.map(r=>r.x)),y=Math.min(...R.map(r=>r.y));
  return {x,y,w:Math.max(...R.map(r=>r.x+r.w))-x,h:Math.max(...R.map(r=>r.y+r.h))-y}}
function adatta(lista){const b=limiti(lista||B.nodi);const r=nb.getBoundingClientRect();
  if(!b){V.z=1;V.x=r.width/2;V.y=r.height/2;applica();return}
  const top=70,bot=40,pad=60;const aw=r.width-pad*2,ah=r.height-top-bot-pad;
  const z=Math.min(1.2,Math.max(.1,Math.min(aw/b.w,ah/b.h)));V.z=z;V.x=r.width/2-(b.x+b.w/2)*z;V.y=top+pad/2+ah/2-(b.y+b.h/2)*z+pad/2;applica()}

/* ---------------- render ---------------- */
function render(){if(!B||!attivo)return;
  const ids=new Set(B.nodi.map(n=>n.id));
  for(const [id,e] of el)if(!ids.has(id)){e.remove();el.delete(id)}
  for(const n of B.nodi){let e=el.get(n.id);if(!e){e=creaNodo(n);el.set(n.id,e)}
    e.style.left=n.x+'px';e.style.top=n.y+'px';if(n.tipo==='frame'){e.style.width=n.w+'px';e.style.height=n.h+'px'}
    e.classList.toggle('sel',sel.has(n.id))}
  $('#nbVuoto').hidden=B.nodi.length>0;
  disegnaArchi();aggiornaBarra();disegnaMini()}
function aggiornaBarra(){const g=[...sel].map(nodo).filter(n=>n&&n.tipo==='gen');
  const b=$('#nbEsegui');b.disabled=!g.length;
  const tot=g.reduce((s,n)=>s+(stime.get(n.id)||0),0);
  b.textContent=g.length?`Esegui selezionati (${g.length}) · ~${usd(tot)}`:'Esegui selezionati';
  $('#nbUndo').disabled=!pilaUndo.length;$('#nbRedo').disabled=!pilaRedo.length}

function creaNodo(n){
  const e=document.createElement('div');e.dataset.id=n.id;
  if(n.tipo==='frame'){e.className='nb-frame';e.innerHTML=`<div class="fr-testa"><span class="fr-presa" title="Trascina per spostare il gruppo e il suo contenuto">⠿</span><input value="${esc(n.titolo||'Gruppo')}" spellcheck="false" aria-label="Titolo del gruppo"></div><div class="fr-res"></div>`;
    const i=e.querySelector('input');i.oninput=()=>{n.titolo=i.value};i.onchange=commit;strFrame.appendChild(e);return e}
  e.className='nd nd-'+n.tipo;e.style.width=(LARGH[n.tipo]||240)+'px';
  const tag=(n.tipo==='ref'||n.tipo==='gen')?`<label class="nd-tag" title="Tag da usare nel prompt"><span>@</span><input value="${esc(n.tag||'')}" spellcheck="false"></label>`:'';
  const out=(n.tipo!=='nota')?`<span class="porta out" data-porta="out"></span>`:'';
  e.innerHTML=`<div class="nd-testa"><span class="nd-tit"><i></i>${TIT[n.tipo]}</span>${tag}<button class="nd-piu" title="Azioni">⋯</button>${out}</div><div class="nd-corpo"></div>`;
  const ti=e.querySelector('.nd-tag input');
  if(ti){ti.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();ti.blur()}if(ev.key==='Escape'){ti.value=n.tag;ti.blur()}};
    ti.onblur=()=>{if(rinominaTag(n,ti.value))commit();ti.value=n.tag}}
  e.querySelector('.nd-piu').onclick=ev=>{ev.stopPropagation();if(!sel.has(n.id)){sel.clear();sel.add(n.id);render()}menuNodo(n,ev.clientX-8,ev.clientY+12)};
  corpoNodo(n,e);strNodi.appendChild(e);
  new ResizeObserver(()=>pianificaArchi()).observe(e);
  return e}
function corpoNodo(n,e){const c=e.querySelector('.nd-corpo');
  if(n.tipo==='prompt'){c.innerHTML=`<div class="pwrap"><div class="hl" aria-hidden="true"></div><textarea spellcheck="false" placeholder="Descrivi l'immagine. Scrivi @ per citare una reference collegata."></textarea><div class="menu" hidden></div></div><p class="nd-msg"></p>`;
    editorTag(n,c)}
  else if(n.tipo==='nota'){c.innerHTML=`<textarea spellcheck="false" placeholder="Scrivi una nota…"></textarea>`;const t=c.querySelector('textarea');t.value=n.testo||'';
    t.oninput=()=>{n.testo=t.value;salva()};t.onblur=commit}
  else if(n.tipo==='ref')corpoRef(n,c);
  else if(n.tipo==='gen')corpoGen(n,c)}
function aggiornaNodo(n){const e=el.get(n.id);if(!e)return;
  if(n.tipo==='prompt'){const t=e.querySelector('textarea');if(t.value!==n.testo){t.value=n.testo||'';t._evid&&t._evid()}}
  else if(n.tipo==='ref'||n.tipo==='gen'){corpoNodo(n,e);const ti=e.querySelector('.nd-tag input');if(ti&&document.activeElement!==ti)ti.value=n.tag}
  else corpoNodo(n,e)}

/* -------- nodo Prompt: textarea con @tag ed evidenziazione (come nella Griglia) -------- */
function editorTag(n,c){const ta=c.querySelector('textarea'),hl=c.querySelector('.hl'),menu=c.querySelector('.menu'),msg=c.querySelector('.nd-msg');
  ta.value=n.testo||'';let sc=0,match=null;
  const evid=()=>{const noti=new Set(tagPer(n).map(x=>x.tag));const v=ta.value,caret=document.activeElement===ta?ta.selectionStart:-1;let h='',u=0;const bad=new Set();
    for(const k of v.matchAll(/@([a-z0-9_]+)/gi)){const f=k.index+k[0].length,ok=noti.has(k[1].toLowerCase()),scr=f===caret;if(!ok&&!scr)bad.add(k[0]);
      h+=esc(v.slice(u,k.index))+`<mark class="${ok||scr?'':'bad'}">${esc(k[0])}</mark>`;u=f}
    hl.innerHTML=h+esc(v.slice(u))+'\n ';hl.scrollTop=ta.scrollTop;
    msg.textContent=bad.size?`Nessuna reference collegata con ${[...bad].join(', ')}.`:''};
  ta._evid=evid;
  const chiudi=()=>{menu.hidden=true;match=null;sc=0};
  const apriMenu=()=>{const prima=ta.value.slice(0,ta.selectionStart);const k=prima.match(/(^|[^a-z0-9_])@([a-z0-9_]*)$/i);
    const fonti=tagPer(n);if(!k||!fonti.length){chiudi();return}
    const q=k[2].toLowerCase();const l=fonti.filter(x=>x.tag.includes(q));if(!l.length){chiudi();return}
    match={da:ta.selectionStart-k[2].length-1,a:ta.selectionStart,l};sc=Math.min(sc,l.length-1);
    menu.innerHTML=l.map((x,i)=>{const f=fileDi(x);const im=f&&kindDa(f)==='image'?`<img src="${url(f)}" alt="">`:'<span style="width:34px"></span>';
      return `<div class="op ${i===sc?'on':''}" data-i="${i}">${im}<b>@${esc(x.tag)}</b><small>${esc(TIT[x.tipo])}</small></div>`}).join('');
    menu.querySelectorAll('.op').forEach(o=>o.onmousedown=ev=>{ev.preventDefault();scegli(+o.dataset.i)});menu.hidden=false};
  const scegli=i=>{if(!match)return;const t=match.l[i].tag,v=ta.value,pr=v.slice(0,match.da),dp=v.slice(match.a);
    const ins='@'+t+(/^\s/.test(dp)?'':' ');ta.value=pr+ins+dp;const pos=(pr+ins).length;ta.setSelectionRange(pos,pos);n.testo=ta.value;chiudi();evid();salva()};
  ta.addEventListener('input',()=>{n.testo=ta.value;evid();apriMenu();salva()});
  ta.addEventListener('click',apriMenu);
  ta.addEventListener('scroll',()=>{hl.scrollTop=ta.scrollTop});
  ta.addEventListener('blur',()=>setTimeout(()=>{chiudi();evid();commit()},120));
  ta.addEventListener('keydown',ev=>{if(menu.hidden||!match)return;const k=match.l.length;
    if(ev.key==='ArrowDown'){ev.preventDefault();sc=(sc+1)%k;apriMenu()}else if(ev.key==='ArrowUp'){ev.preventDefault();sc=(sc-1+k)%k;apriMenu()}
    else if(ev.key==='Enter'||ev.key==='Tab'){ev.preventDefault();scegli(sc)}else if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();chiudi()}});
  evid()}

/* -------- nodo Reference -------- */
function corpoRef(n,c){
  let m='';
  if(n.file){const s=url(n.file);
    m=n.kind==='video'?`<video src="${s}" muted loop playsinline controls preload="metadata"></video>`:n.kind==='audio'?`<audio src="${s}" controls preload="metadata"></audio>`:`<img src="${s}" alt="" draggable="false">`}
  else if(n._anteprima){m=n.kind==='video'?`<video src="${n._anteprima}" muted></video>`:n.kind==='audio'?'<audio controls></audio>':`<img src="${n._anteprima}" alt="">`}
  c.innerHTML=(n.file||n._anteprima)?`<div class="nd-media">${m}${n._carica?`<div class="nd-carica">Carico… ${n._carica}</div>`:''}</div><div class="nd-file" title="${esc(n.nomeOrig||n.file||'')}">${esc(n.nomeOrig||n.file||'')}</div>`
    :`<div class="nd-media" style="background:none"><div class="nd-vuoto">Trascina qui un file<br>o clicca per sceglierlo</div></div>`;
  const v=c.querySelector('.nd-vuoto');if(v)v.onclick=()=>scegliFile(f=>caricaSuNodo(n,f[0]));
  const vid=c.querySelector('video');if(vid&&n.file){vid.onpointerenter=()=>vid.play().catch(()=>{});vid.onpointerleave=()=>vid.pause()}
  const pe=el.get(n.id);if(pe){const o=pe.querySelector('.porta.out');if(o)o.dataset.tipo=tipoUscita(n)}}

/* -------- nodo Generazione -------- */
function opzioniModelli(sc){const g=[['Immagini',m=>m.tipo==='immagine'&&!m.aggiunto],['Video',m=>m.tipo!=='immagine'&&!m.aggiunto],['Aggiunti da te',m=>m.aggiunto]];
  return g.map(([t,f])=>{const l=S.modelli.filter(f);return l.length?`<optgroup label="${t}">${l.map(m=>`<option value="${m.id}" ${m.id===sc?'selected':''}>${esc(m.nome)}</option>`).join('')}</optgroup>`:''}).join('')}
function valoriDefault(m){const v={};(m?m.parametri:[]).forEach(p=>{v[p.nome]=p.tipo==='sino'?!!p.default:(p.default??'')});return v}
function normalizza(m,vals){const out={};for(const p of m.parametri){let v=vals[p.nome];if(v===undefined)v=p.tipo==='sino'?!!p.default:p.default;
    if(p.tipo==='sino')out[p.nome]=v===true||v==='true';
    else if(p.tipo==='numero'){if(v!==''&&v!=null&&!isNaN(v))out[p.nome]=p.intero===false?parseFloat(v):parseInt(v,10)}
    else if(p.tipo==='scelta'&&typeof p.opzioni[0]==='number')out[p.nome]=Number(v);
    else if(v!=null)out[p.nome]=v}
  return out}
function fileDi(n){if(!n)return null;if(n.tipo==='ref')return n.file||null;if(n.tipo==='gen')return (n.risultati||[])[n.sel??0]||null;return null}
function corpoGen(n,c){
  const m=modello(n.modello);
  const P=porte(n);
  const ingressi=P.map(pp=>{const k=archiIn(n.id,pp.p).length;return `<div class="nd-in ${k?'':'vuota'}" data-porta="${pp.p}"><span class="porta in ${k?'piena':''}" data-porta="${pp.p}" data-tipo="${pp.acc[0]}" style="color:var(--t-${pp.acc[0]})"></span><b>${pp.et}${pp.obbl?' *':''}</b><small>${k}/${pp.max}</small></div>`}).join('');
  const par=m?m.parametri.map(p=>{const v=(n.params||{})[p.nome]??(p.tipo==='sino'?!!p.default:(p.default??''));let ctl;
    if(p.tipo==='scelta')ctl=`<select data-p="${p.nome}">${p.opzioni.map(o=>`<option ${String(o)===String(v)?'selected':''}>${esc(o)}</option>`).join('')}</select>`;
    else if(p.tipo==='sino')ctl=`<select data-p="${p.nome}"><option value="false" ${!v||v==='false'?'selected':''}>No</option><option value="true" ${v===true||v==='true'?'selected':''}>Sì</option></select>`;
    else if(p.tipo==='numero')ctl=`<input type="number" data-p="${p.nome}" step="${p.intero===false?'any':'1'}" value="${esc(v??'')}" placeholder="—">`;
    else ctl=`<input type="text" data-p="${p.nome}" value="${esc(v??'')}">`;
    return `<label class="${p.tipo==='testo'?'largo':''}">${esc(p.etichetta)}${ctl}</label>`}).join(''):'';
  const run=corse.get(n.id);let out;
  if(run){const ar=run.ar||{w:1,h:1};out=`<div class="ph ${run.errore?'err':''}" style="aspect-ratio:${ar.w} / ${ar.h}"><div class="ph-eti"><b>${esc(nomeBreve(m?m.nome:''))}</b><span class="ph-stato">${esc(statoCorsa(n))}</span></div><div class="ph-err"><p>${esc(run.errore?'Errore: '+run.errore:'')}</p><button class="ph-x" title="Chiudi">×</button></div></div>`}
  else{const f=fileDi(n);
    out=f?`<div class="nd-media">${kindDa(f)==='video'?`<video src="${url(f)}" muted loop playsinline controls preload="metadata"></video>`:`<img src="${url(f)}" alt="" draggable="false">`}<div class="nd-az"><button class="icona-btn" data-az="scarica" title="Scarica">${ICONA.scarica}</button>${kindDa(f)==='video'?'':`<button class="icona-btn" data-az="ref" title="Usa come reference (nuovo nodo collegabile)">${ICONA.ref}</button>`}</div></div>`
      :`<div class="vuoto">${m?'Collega un prompt e premi Genera':'Scegli un modello'}</div>`}
  const strip=(n.risultati||[]).map((f,i)=>`<div class="th ${i===(n.sel??0)?'on':''}" data-i="${i}" title="Clic: seleziona · trascina sulla board: nuovo nodo Reference">${kindDa(f)==='video'?`<video src="${url(f)}" muted preload="metadata"></video>`:`<img src="${url(f)}" alt="" loading="lazy">`}</div>`).join('');
  c.innerHTML=`<div class="nd-ingressi">${ingressi}</div><select class="nd-modello" aria-label="Modello">${m?'':'<option value="">— scegli un modello —</option>'}${opzioniModelli(n.modello)}</select>
    <div class="nd-par">${par}</div><div class="nd-out">${out}</div><div class="nd-strip">${strip}</div>
    <p class="nd-msg">${esc(n._msg||'')}</p>
    <div class="nd-piede"><span class="nd-stima">${stimaTesto(n)}</span><button class="btn-dark nd-gen" ${run&&!run.errore?'disabled':''}>${run&&!run.errore?'In corso…':'Genera'}</button></div>`;
  c.querySelector('.nd-modello').onchange=ev=>{const nm=modello(ev.target.value);n.modello=ev.target.value;n.params=valoriDefault(nm);
    try{localStorage.setItem('cv-mod-'+(nm.tipo==='immagine'?'img':'vid'),nm.id)}catch(e){}
    ripulisciArchi(n.id);corpoNodo(n,el.get(n.id));aggiornaStima(n);aggiornaUscita(n);disegnaArchi();commit()};
  c.querySelectorAll('[data-p]').forEach(x=>{const h=()=>{const p=m.parametri.find(q=>q.nome===x.dataset.p);n.params=n.params||{};
    n.params[p.nome]=p.tipo==='sino'?x.value==='true':x.value;aggiornaStima(n);commit()};x.onchange=h;if(x.tagName==='INPUT')x.oninput=()=>{n.params[x.dataset.p]=x.value;salva()}});
  c.querySelector('.nd-gen').onclick=()=>eseguiNodo(n);
  c.querySelectorAll('.nd-out [data-az]').forEach(b=>b.onclick=ev=>{ev.stopPropagation();const f=fileDi(n);
    if(b.dataset.az==='scarica')scaricaFile(B.progetto,f);else usaRefDaNodo(n)});
  const px=c.querySelector('.ph-x');if(px)px.onclick=()=>{corse.delete(n.id);corpoNodo(n,el.get(n.id))};
  const v=c.querySelector('.nd-out video');if(v){v.onpointerenter=()=>v.play().catch(()=>{});v.onpointerleave=()=>v.pause()}
  c.querySelectorAll('.nd-strip .th').forEach(t=>t.addEventListener('pointerdown',ev=>trascinaRisultato(ev,n,+t.dataset.i)));
  if(!stime.has(n.id))aggiornaStima(n)}
function aggiornaUscita(n){const e=el.get(n.id);if(!e)return;const o=e.querySelector('.porta.out');if(o)o.dataset.tipo=tipoUscita(n)}
function statoCorsa(n){const r=corse.get(n.id);if(!r)return '';if(r.errore)return 'Errore';
  const a=S.attese[r.job]||{t:r.t,n:1};if(!r.job)return 'Preparo…';return testoStato(r.job,a,0)}
function stimaTesto(n){const v=stime.get(n.id);if(v===undefined)return '–';if(v===null)return 'costo n.d.';return `Stima <b>~${usd(v)}</b>`}
const stimaT=new Map();
function aggiornaStima(n){clearTimeout(stimaT.get(n.id));stimaT.set(n.id,setTimeout(()=>stimaOra(n),150))}
async function stimaOra(n){{const m=modello(n.modello);if(!m){stime.set(n.id,null);return null}
  const params=normalizza(m,n.params||{});
  if(m.video_sorgente){const v=archiIn(n.id,'video')[0];const f=v&&fileDi(nodo(v.da));if(f){const mt=await metaDi(f);params._src_w=mt.w;params._src_h=mt.h;params._src_dur=mt.dur}}
  try{const r=await api('/api/stima',{modello:m.id,parametri:params});stime.set(n.id,r.usd)}catch(e){stime.set(n.id,null)}
  const e=el.get(n.id);if(e){const s=e.querySelector('.nd-stima');if(s)s.innerHTML=stimaTesto(n)}aggiornaBarra();return stime.get(n.id)}}

/* ---------------- archi ---------------- */
let archiRaf=0;function pianificaArchi(){if(archiRaf)return;archiRaf=requestAnimationFrame(()=>{archiRaf=0;disegnaArchi();disegnaMini()})}
/* centro di una porta in coordinate della board, dalle misure di impaginazione (non dipendono da zoom o animazioni) */
function centroPorta(e){let x=e.offsetWidth/2,y=e.offsetHeight/2,c=e;
  while(c&&c!==scala){x+=c.offsetLeft;y+=c.offsetTop;const p=c.offsetParent;if(p&&p!==scala){x+=p.clientLeft;y+=p.clientTop}c=p}
  return {x,y}}
function portaEl(id,p){const e=el.get(id);if(!e)return null;return p==='out'?e.querySelector('.porta.out'):e.querySelector(`.porta.in[data-porta="${p}"]`)}
const curva=(a,b)=>{const d=Math.max(40,Math.abs(b.x-a.x)*.5);return `M${a.x},${a.y} C${a.x+d},${a.y} ${b.x-d},${b.y} ${b.x},${b.y}`};
function disegnaArchi(){if(!B||!attivo)return;
  const fr=document.createDocumentFragment();
  for(const a of B.archi){const pa=portaEl(a.da,'out'),pb=portaEl(a.a,a.p);if(!pa||!pb)continue;
    const d=curva(centroPorta(pa),centroPorta(pb));const t=tipoUscita(nodo(a.da))||'testo';
    const hit=document.createElementNS(SVGNS,'path');hit.setAttribute('d',d);hit.setAttribute('class','hit');hit.dataset.arco=a.id;
    const p=document.createElementNS(SVGNS,'path');p.setAttribute('d',d);p.setAttribute('class',`arco t-${t} ${selArco===a.id?'sel':''}`);
    fr.appendChild(p);fr.appendChild(hit)}
  const temp=svg.querySelector('.temp');svg.replaceChildren(fr);if(temp)svg.appendChild(temp);
  /* contatori degli ingressi */
  for(const n of B.nodi)if(n.tipo==='gen'){const e=el.get(n.id);if(!e)continue;
    porte(n).forEach(pp=>{const r=e.querySelector(`.nd-in[data-porta="${pp.p}"]`);if(!r)return;const k=archiIn(n.id,pp.p).length;
      r.classList.toggle('vuota',!k);r.querySelector('small').textContent=`${k}/${pp.max}`;r.querySelector('.porta').classList.toggle('piena',!!k)})}}
svg.addEventListener('pointerdown',ev=>{const id=ev.target.dataset&&ev.target.dataset.arco;if(!id)return;ev.stopPropagation();selArco=id;sel.clear();render();nb.focus()});

/* ---------------- creazione nodi ---------------- */
function modelloPredefinito(tipo,conRef){const k=tipo==='video'?'vid':'img';let id=null;try{id=localStorage.getItem('cv-mod-'+k)}catch(e){}
  const ok=m=>m&&(tipo==='video'?m.tipo!=='immagine'&&!m.video_sorgente:m.tipo==='immagine')&&(!conRef||m.reference);
  if(ok(modello(id)))return id;const m=S.modelli.find(ok);return m?m.id:(S.modelli[0]||{}).id}
function aggiungi(tipo,x,y,extra={}){
  const n={id:uid(),tipo,x:Math.round(x),y:Math.round(y),...extra};
  if(tipo==='prompt')n.testo=n.testo||'';
  if(tipo==='nota')n.testo=n.testo||'';
  if(tipo==='frame'){n.w=n.w||560;n.h=n.h||380;n.titolo=n.titolo||'Gruppo'}
  if(tipo==='ref'){n.tag=tagLibero(n.tag||'img');n.kind=n.kind||(n.file?kindDa(n.file):'image')}
  if(tipo==='gen'){n.tag=tagLibero(n.tag||'gen');n.modello=n.modello||modelloPredefinito('image');n.params=n.params||valoriDefault(modello(n.modello));n.risultati=n.risultati||[];n.sel=n.sel||0}
  if(tipo==='frame')B.nodi.unshift(n);else B.nodi.push(n);return n}
function aggiungiAlCentro(tipo){const c=centroVista();const n=aggiungi(tipo,c.x-(LARGH[tipo]||560)/2,c.y-120);sel.clear();sel.add(n.id);render();commit();
  if(tipo==='ref')scegliFile(f=>caricaSuNodo(n,f[0]));if(tipo==='prompt')setTimeout(()=>{const t=el.get(n.id).querySelector('textarea');t&&t.focus()},30)}
function collega(da,a,p){const err=valida(da,a,p);if(err){toast(err,true);return false}
  B.archi.push({id:uid(),da,a,p});const n=nodo(a);if(n.tipo==='gen'&&p==='video')aggiornaStima(n);return true}

/* ---------------- file: Finder, appunti, asset ---------------- */
function scegliFile(cb){const i=$('#nbFile');i.onchange=()=>{if(i.files.length)cb([...i.files]);i.value=''};i.click()}
async function carica(file){
  const r=await fetch(`/api/carica?progetto=${encodeURIComponent(B.progetto)}&nome=${encodeURIComponent(file.name||'incollato.png')}`,
    {method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});
  const j=await r.json();if(!r.ok)throw new Error(j.errore||'Caricamento non riuscito');return j.file}
async function caricaSuNodo(n,file){if(!file)return;const k=kindMime(file.type);if(!k){toast('Formato non supportato: '+file.name,true);return}
  const b=B;n.kind=k;n.nomeOrig=file.name||'incollato';n._anteprima=URL.createObjectURL(file);n._carica=(file.size/1048576).toFixed(1)+' MB';n.file=null;aggiornaNodo(n);aggiornaUscita(n);
  try{const f=await carica(file);n.file=f;cacheMeta.delete(f)}
  catch(e){toast(e.message,true);if(b===B&&!n.file){b.nodi=b.nodi.filter(x=>x!==n);b.archi=b.archi.filter(a=>a.da!==n.id&&a.a!==n.id)}}
  finally{delete n._carica;if(n._anteprima){URL.revokeObjectURL(n._anteprima);delete n._anteprima}}
  if(b===B){render();aggiornaNodo(n);disegnaArchi();ultimo=istantanea();salva()}else salva(b)}
async function fileComeNodi(files,p,suNodo){
  const nuovi=[];let dy=0;
  for(const f of files){const k=kindMime(f.type);if(!k){toast('Formato non supportato: '+f.name,true);continue}
    const n=aggiungi('ref',p.x-LARGH.ref/2+dy,p.y-60,{kind:k});dy+=LARGH.ref+40;nuovi.push([n,f])}
  if(!nuovi.length)return;
  if(suNodo){/* rilasciati su una generazione: diventano sue reference (fino al massimo del modello) */
    vicinoA(nuovi.map(([n])=>n),suNodo)}
  sel.clear();nuovi.forEach(([n])=>sel.add(n.id));render();
  if(suNodo)nuovi.forEach(([n])=>{const p=primaPortaValida(n.id,suNodo.id);if(p)collega(n.id,suNodo.id,p);
    else toast(`@${n.tag}: ${valida(n.id,suNodo.id,n.kind==='video'?'video':'ref')||'nessun ingresso compatibile'} Il nodo resta sulla board.`,true)});
  render();commit();
  await Promise.all(nuovi.map(([n,f])=>caricaSuNodo(n,f)))}
function assetDaUrl(t){try{const u=new URL(t,location.href);if(u.origin!==location.origin||u.pathname!=='/file')return null;
  if(u.searchParams.get('progetto')!==B.progetto)return null;return u.searchParams.get('nome')}catch(e){return null}}
/* primo posto libero vicino a (x,y): prima verso il basso, poi colonne a sinistra */
function postoLibero(x,y,w,h,escludi){const occ=B.nodi.filter(n=>n.tipo!=='frame'&&!escludi.includes(n.id)).map(rett);
  const lib=(px,py)=>!occ.some(o=>px<o.x+o.w+24&&px+w+24>o.x&&py<o.y+o.h+24&&py+h+24>o.y);
  for(let c=0;c<6;c++)for(let r=0;r<8;r++){const px=x-c*(w+40),py=y+r*(h+40);if(lib(px,py))return {x:px,y:py}}return {x,y}}
function vicinoA(nuovi,g){let y=g.y;nuovi.forEach(n=>{const p=postoLibero(g.x-LARGH.ref-80,y,LARGH.ref,260,nuovi.map(x=>x.id));n.x=p.x;n.y=p.y;y=p.y})}
function nodoRefDaFile(f,x,y){const n=aggiungi('ref',x,y,{file:f,kind:kindDa(f),nomeOrig:f});return n}

nb.addEventListener('dragover',ev=>{if(!B)return;ev.preventDefault();ev.dataTransfer.dropEffect='copy';
  const t=nodoSotto(ev.clientX,ev.clientY);$$('.nd.drop-su').forEach(x=>x.classList.remove('drop-su'));
  if(t&&(t.tipo==='gen'||(t.tipo==='ref'&&!t.file)))el.get(t.id).classList.add('drop-su');else nb.classList.add('drop-su')});
nb.addEventListener('dragleave',ev=>{if(ev.target===nb){nb.classList.remove('drop-su')}});
nb.addEventListener('drop',async ev=>{ev.preventDefault();nb.classList.remove('drop-su');$$('.nd.drop-su').forEach(x=>x.classList.remove('drop-su'));if(!B)return;
  const p=aMondo(ev.clientX,ev.clientY);const t=nodoSotto(ev.clientX,ev.clientY);
  const files=[...ev.dataTransfer.files];
  if(files.length){if(t&&t.tipo==='ref'&&!t.file){caricaSuNodo(t,files[0]);return}await fileComeNodi(files,p,t&&t.tipo==='gen'?t:null);return}
  const testo=ev.dataTransfer.getData('text/uri-list')||ev.dataTransfer.getData('text/plain');
  const lista=testo.split(/\s+/).map(assetDaUrl).filter(Boolean);
  if(!lista.length){toast('Trascina immagini, video o audio (dal Finder o dagli asset del progetto).',true);return}
  const nuovi=lista.map((f,i)=>nodoRefDaFile(f,p.x-LARGH.ref/2+i*(LARGH.ref+40),p.y-60));
  if(t&&t.tipo==='gen'){vicinoA(nuovi,t);nuovi.forEach(n=>{const pp=primaPortaValida(n.id,t.id);if(pp)collega(n.id,t.id,pp)})}
  sel.clear();nuovi.forEach(n=>sel.add(n.id));render();commit()});
document.addEventListener('paste',async ev=>{if(!attivo||!B||inCampo(ev.target))return;
  const files=[...(ev.clipboardData||{}).files||[]].filter(f=>kindMime(f.type));
  const p=aMondo(mouse.x,mouse.y);
  if(files.length){ev.preventDefault();await fileComeNodi(files,p,null);return}
  const t=(ev.clipboardData&&ev.clipboardData.getData('text/plain'))||'';
  if(t.startsWith('fratak-nodi:')){ev.preventDefault();try{incollaNodi(JSON.parse(t.slice(12)),p)}catch(e){}return}
  if(clip){ev.preventDefault();incollaNodi(clip,p)}});
document.addEventListener('copy',ev=>{if(!attivo||!B||inCampo(ev.target)||!sel.size)return;ev.preventDefault();clip=copiaSelezione();
  try{ev.clipboardData.setData('text/plain','fratak-nodi:'+JSON.stringify(clip))}catch(e){}toast(`${clip.nodi.length} nod${clip.nodi.length>1?'i copiati':'o copiato'}`)});

/* ---------------- copia, incolla, duplica, elimina ---------------- */
function conContenuto(ids){const out=new Set(ids);for(const id of ids){const f=nodo(id);if(f&&f.tipo==='frame')contenutoFrame(f).forEach(n=>out.add(n.id))}return out}
function copiaSelezione(){const ids=conContenuto(sel);const nodi=B.nodi.filter(n=>ids.has(n.id)).map(n=>JSON.parse(JSON.stringify(n)));
  return {nodi,archi:B.archi.filter(a=>ids.has(a.da)&&ids.has(a.a)).map(a=>({...a}))}}
function incollaNodi(c,p){if(!c||!c.nodi||!c.nodi.length)return;const b=limitiDati(c.nodi);const dx=p?p.x-b.x:40,dy=p?p.y-b.y:40;
  const map={};sel.clear();
  for(const o of c.nodi){const n={...JSON.parse(JSON.stringify(o)),id:uid(),x:o.x+dx,y:o.y+dy};map[o.id]=n.id;
    if(n.tag)n.tag=tagLibero(n.tag);if(n.tipo==='frame')B.nodi.unshift(n);else B.nodi.push(n);sel.add(n.id)}
  for(const a of c.archi||[])if(map[a.da]&&map[a.a])B.archi.push({id:uid(),da:map[a.da],a:map[a.a],p:a.p});
  render();commit()}
function limitiDati(l){return {x:Math.min(...l.map(n=>n.x)),y:Math.min(...l.map(n=>n.y))}}
function duplica(){if(!sel.size)return;const c=copiaSelezione();const b=limitiDati(c.nodi);incollaNodi(c,{x:b.x+40,y:b.y+40})}
function elimina(){if(selArco){B.archi=B.archi.filter(a=>a.id!==selArco);selArco=null;render();commit();return}
  if(!sel.size)return;const ids=new Set(sel);B.nodi=B.nodi.filter(n=>!ids.has(n.id));B.archi=B.archi.filter(a=>!ids.has(a.da)&&!ids.has(a.a));
  sel.clear();render();commit()}
function contenutoFrame(f){return B.nodi.filter(n=>n!==f&&n.tipo!=='frame'&&(()=>{const r=rett(n),cx=r.x+r.w/2,cy=r.y+r.h/2;return cx>f.x&&cx<f.x+f.w&&cy>f.y&&cy<f.y+f.h})())}

/* ---------------- esecuzione ---------------- */
function haRisultato(n){return !!fileDi(n)}
async function preparaRichiesta(n){
  const m=modello(n.modello);if(!m)throw new Error('Scegli un modello.');
  const src=p=>archiIn(n.id,p).map(a=>nodo(a.da)).filter(Boolean);
  const prompts=src('prompt').map(x=>(x.testo||'').trim()).filter(Boolean);const testo=prompts.join('\n\n');
  if(m.prompt!==false&&!m.prompt_opzionale&&!testo)throw new Error('Collega un nodo Prompt con del testo.');
  const prendi=async(x)=>{const f=fileDi(x);if(!f)throw new Error(x.tipo==='gen'?`@${x.tag} non ha ancora un risultato: usa "Esegui catena".`:`@${x.tag}: carica un file.`);
    if(x.tipo==='ref'&&!x.file)throw new Error(`@${x.tag}: caricamento in corso.`);
    const [dati,mt]=await Promise.all([datiDi(f),metaDi(f)]);return {x,f,dati,mt}};
  const refs=await Promise.all(src('ref').map(prendi));
  if(m.reference&&m.reference.obbligatoria&&!refs.length)throw new Error('Questo modello vuole almeno una reference collegata.');
  const fine=src('fine')[0]?await prendi(src('fine')[0]):null;
  const vid=src('video')[0]?await prendi(src('video')[0]):null;
  if(m.video_sorgente&&!vid)throw new Error('Collega il video da ingrandire.');
  const params=normalizza(m,n.params||{});
  if(m.video_sorgente&&vid){params._src_w=vid.mt.w;params._src_h=vid.mt.h;params._src_dur=vid.mt.dur}
  const tags=refs.map(r=>({tag:r.x.tag}));
  return {progetto:B.progetto,m,testo,compilato:compilaPromptCon(testo,tags,m),params,
    reference:m.reference?refs.map(r=>({nome:'@'+r.x.tag+' · '+r.f,dati:r.dati})):[],
    reference_fine:m.reference_fine&&fine?{nome:fine.f,dati:fine.dati}:null,
    video_sorgente:m.video_sorgente&&vid?{nome:vid.f,dati:vid.dati}:null,
    refsAr:refs.map(r=>({_ar:{w:r.mt.w,h:r.mt.h},dati:r.dati})),videoAr:vid?{w:vid.mt.w,h:vid.mt.h}:null}}
async function eseguiNodo(n){
  if(corse.has(n.id)&&!corse.get(n.id).errore)return false;
  const b=B;n._msg='';let req;
  try{req=await preparaRichiesta(n)}catch(e){n._msg=e.message;aggiornaNodo(n);return false}
  const pr=proporzioneRichiesta(req.m,req.params,req.refsAr,req.videoAr);
  corse.set(n.id,{t:Date.now(),ar:pr.ar,progetto:b.progetto});aggiornaNodo(n);
  try{const {id,fine}=await lanciaGenerazione(req);corse.get(n.id).job=id;aggiornaNodo(n);
    const j=await fine;
    if(j.errore){corse.get(n.id).errore=j.errore;aggiornaNodo(n);return false}
    n.risultati=[...(n.risultati||[]),...(j.file||[])];n.sel=n.risultati.length-1;corse.delete(n.id);
    if(b===B){aggiornaNodo(n);aggiornaUscita(n);B.nodi.filter(x=>x.tipo==='gen'&&B.archi.some(a=>a.da===n.id&&a.a===x.id)).forEach(aggiornaStima);salva()}else salva(b);
    return true}
  catch(e){const r=corse.get(n.id);if(r)r.errore=e.message;aggiornaNodo(n);return false}}
function aMonte(n){const ord=[],vis=new Set();const visita=x=>{if(vis.has(x.id))return;vis.add(x.id);archiIn(x.id).forEach(a=>{const s=nodo(a.da);if(s)visita(s)});if(x.tipo==='gen')ord.push(x)};visita(n);return ord}
async function conferma(lista,cosa){
  await Promise.all(lista.map(stimaOra));
  const ign=lista.filter(n=>stime.get(n.id)==null).length;const tot=lista.reduce((s,n)=>s+(stime.get(n.id)||0),0);
  const t=`${cosa}: ${lista.length} nod${lista.length>1?'i':'o'} · costo stimato ~${usd(tot)}${ign?` (+${ign} senza stima)`:''}`;
  if(tot>1)return confirm(t+'\n\nProcedere?');toast(t);return true}
async function eseguiCatena(n){const lista=aMonte(n).filter(x=>x===n||!haRisultato(x));
  if(!await conferma(lista,'Esegui catena'))return;
  for(const x of lista){const ok=await eseguiNodo(x);if(!ok){toast(`Catena interrotta su @${x.tag}.`,true);return}}
  toast('Catena completata.')}
async function eseguiSelezionati(){const lista=[...sel].map(nodo).filter(n=>n&&n.tipo==='gen');if(!lista.length)return;
  if(!await conferma(lista,'Esegui selezionati'))return;await Promise.all(lista.map(eseguiNodo))}
window.cvDisegnaAttese=function(){if(!attivo||!B)return;for(const [id,r] of corse){const e=el.get(id);if(!e)continue;const s=e.querySelector('.ph-stato');if(s)s.textContent=statoCorsa(nodo(id))}};

/* ---------------- anteprima, menu ---------------- */
function anteprima(f){if(!f)return;const e=assets.find(x=>x.file===f)||{file:f,modello:'Reference',data:'',parametri:{},prompt:'',costo_usd:0,costo_reale:true};apri(B.progetto,e)}
function chiudiMenu(){if(menuEl){menuEl.remove();menuEl=null}}
function mostraMenu(voci,x,y){chiudiMenu();menuEl=document.createElement('div');menuEl.className='nb-menu';
  menuEl.innerHTML=voci.map((v,i)=>v==='-'?'<div class="sep"></div>':v.tit?`<div class="tit">${esc(v.tit)}</div>`:`<button data-i="${i}" ${v.off?'disabled':''}>${esc(v.t)}${v.k?`<kbd>${v.k}</kbd>`:''}</button>`).join('');
  document.body.appendChild(menuEl);const r=menuEl.getBoundingClientRect();
  menuEl.style.left=Math.max(8,Math.min(x,innerWidth-r.width-8))+'px';menuEl.style.top=Math.max(8,Math.min(y,innerHeight-r.height-8))+'px';
  menuEl.querySelectorAll('button').forEach(b=>b.onclick=()=>{const v=voci[+b.dataset.i];chiudiMenu();v.f()})}
addEventListener('pointerdown',ev=>{if(menuEl&&!menuEl.contains(ev.target))chiudiMenu()},true);
function testoPrompt(n){if(n.tipo==='prompt')return n.testo||'';if(n.tipo==='gen')return archiIn(n.id,'prompt').map(a=>nodo(a.da)).filter(Boolean).map(x=>x.testo).join('\n\n');
  const f=fileDi(n);const a=assets.find(x=>x.file===f);return a?a.prompt:''}
function menuNodo(n,x,y){const f=fileDi(n);const V_=[];
  if(n.tipo==='gen'){V_.push({t:'Genera',f:()=>eseguiNodo(n)},{t:'Esegui catena',f:()=>eseguiCatena(n)},'-')}
  V_.push({t:'Duplica',k:'⌘D',f:duplica},{t:'Elimina',k:'⌫',f:elimina});
  if(n.tipo!=='frame'&&n.tipo!=='nota'){V_.push('-',{t:'Copia prompt',off:!testoPrompt(n),f:()=>{navigator.clipboard.writeText(testoPrompt(n));toast('Prompt copiato')}});
    V_.push({t:'Usa come reference',off:!(n.tipo==='gen'&&f),f:()=>usaRefDaNodo(n)});
    V_.push({t:'Apri file',off:!f,f:()=>api('/api/apri-cartella',{progetto:B.progetto,file:f}).catch(()=>{})},
      {t:'Scarica',off:!f,f:()=>scaricaFile(B.progetto,f)})}
  mostraMenu(V_,x,y)}
/* risultato di una generazione → nuovo nodo Reference accanto, pronto da collegare */
function usaRefDaNodo(n){const f=fileDi(n);if(!f)return;const d=dimNodo(n);const p=postoLibero(n.x+d.w+80,n.y,LARGH.ref,260,[]);
  const r=nodoRefDaFile(f,p.x,p.y);sel.clear();sel.add(r.id);render();commit();toast(`Creato il nodo Reference @${r.tag}: collegalo a una generazione.`)}
window.cvUsaRef=f=>{if(!B)return;const c=centroVista();const p=postoLibero(c.x-LARGH.ref/2,c.y-130,LARGH.ref,260,[]);
  const r=nodoRefDaFile(f,p.x,p.y);sel.clear();sel.add(r.id);render();commit();toast(`Creato il nodo Reference @${r.tag}.`)};
function menuBoard(x,y){const p=aMondo(x,y);const add=t=>()=>{const n=aggiungi(t,p.x,p.y);sel.clear();sel.add(n.id);render();commit();if(t==='ref')scegliFile(f=>caricaSuNodo(n,f[0]))};
  mostraMenu([{tit:'Aggiungi qui'},{t:'Prompt',f:add('prompt')},{t:'Reference (scegli file)',f:add('ref')},{t:'Generazione',f:add('gen')},{t:'Nota',f:add('nota')},{t:'Gruppo',f:add('frame')},'-',
    {t:'Incolla nodi',k:'⌘V',off:!clip,f:()=>incollaNodi(clip,p)},{t:'Adatta alla vista',k:'⌘0',f:()=>adatta()}],x,y)}
/* trascinando un'uscita nel vuoto: crea un nodo già collegato */
function menuCreaCollegato(da,x,y){const t=tipoUscita(nodo(da));const p=aMondo(x,y);const voci=[{tit:'Crea nodo collegato'}];
  const nuovaGen=(tipo,conRef)=>()=>{const n=aggiungi('gen',p.x,p.y-60,{modello:modelloPredefinito(tipo,conRef)});render();const pp=primaPortaValida(da,n.id);
    if(pp)collega(da,n.id,pp);sel.clear();sel.add(n.id);render();corpoNodo(n,el.get(n.id));disegnaArchi();commit()};
  if(t==='testo')voci.push({t:'Generazione immagine',f:nuovaGen('image',false)},{t:'Generazione video',f:nuovaGen('video',false)});
  if(t==='image')voci.push({t:'Generazione con reference',f:nuovaGen('image',true)},{t:'Video dal primo frame',f:nuovaGen('video',true)});
  if(t==='video'){const up=S.modelli.find(m=>m.video_sorgente);if(up)voci.push({t:'Upscale video',f:()=>{const n=aggiungi('gen',p.x,p.y-60,{modello:up.id});render();collega(da,n.id,'video');render();commit()}})}
  voci.push('-',{t:'Nota',f:()=>{const n=aggiungi('nota',p.x,p.y-40);render();commit()}});
  mostraMenu(voci,x,y)}

/* ---------------- puntatore ---------------- */
let az=null;
const interattivo=t=>t.closest('input,textarea,select,button,audio,.porta,.nd-strip,.fr-res,.menu,label.nd-tag,.nd-vuoto')||(t.tagName==='VIDEO'&&t.controls);
/* elemento "utile" sotto il cursore, ignorando linee e anteprime che lo coprono */
function sotto(cx,cy,sel_){for(const x of document.elementsFromPoint(cx,cy)){const m=x.closest&&x.closest(sel_);if(m)return m}return null}
function nodoSotto(cx,cy){const els=document.elementsFromPoint(cx,cy);for(const x of els){const n=x.closest&&x.closest('.nd');if(n)return nodo(n.dataset.id)}return null}
nb.addEventListener('pointerdown',ev=>{if(!B)return;chiudiMenu();mouse={x:ev.clientX,y:ev.clientY};
  const t=ev.target;
  if(ev.button===2)return;
  /* collegamento da una porta di uscita */
  const po=t.closest('.porta.out');
  if(po&&ev.button===0){ev.preventDefault();ev.stopPropagation();const da=po.closest('.nd').dataset.id;
    az={tipo:'filo',da,p0:centroPorta(po)};nb.setPointerCapture(ev.pointerId);nb.classList.add('collega');
    const tmp=document.createElementNS(SVGNS,'path');tmp.setAttribute('class','temp');svg.appendChild(tmp);
    $$('.porta.in').forEach(pi=>{const a=pi.closest('.nd').dataset.id;if(!valida(da,a,pi.dataset.porta))pi.classList.add('ok')});return}
  const pin=t.closest('.porta.in');
  if(pin&&ev.button===0){/* trascinare da un ingresso stacca l'ultimo collegamento */
    ev.preventDefault();const a=pin.closest('.nd').dataset.id,p=pin.dataset.porta;const ar=archiIn(a,p).pop();
    if(ar){B.archi=B.archi.filter(x=>x!==ar);disegnaArchi();az={tipo:'filo',da:ar.da,p0:centroPorta(portaEl(ar.da,'out')),staccato:true};
      nb.setPointerCapture(ev.pointerId);nb.classList.add('collega');const tmp=document.createElementNS(SVGNS,'path');tmp.setAttribute('class','temp');svg.appendChild(tmp)}return}
  const pan=ev.button===1||spazio;
  const ne=t.closest('.nd,.nb-frame');
  const sulFrameTesta=t.closest('.fr-testa')&&!t.closest('input');
  if(!pan&&ne&&ev.button===0){
    if(t.closest('.fr-res')){const f=nodo(ne.dataset.id);az={tipo:'resize',f,sx:ev.clientX,sy:ev.clientY,w0:f.w,h0:f.h};nb.setPointerCapture(ev.pointerId);return}
    if(interattivo(t)&&!sulFrameTesta)return;
    if(ne.classList.contains('nb-frame')&&!sulFrameTesta)return iniziaVuoto(ev);
    const id=ne.dataset.id;selArco=null;
    if(ev.shiftKey){sel.has(id)?sel.delete(id):sel.add(id)}else if(!sel.has(id)){sel.clear();sel.add(id)}
    render();if(!sel.has(id))return;
    nb.focus({preventScroll:true});
    const muovi=[...conContenuto(sel)].map(nodo).filter(Boolean);
    az={tipo:'nodi',sx:ev.clientX,sy:ev.clientY,orig:muovi.map(n=>({n,x:n.x,y:n.y})),mosso:false,
      bb:limiti(muovi.filter(n=>sel.has(n.id))),altri:B.nodi.filter(n=>!muovi.includes(n)&&n.tipo!=='frame').map(rett),pid:ev.pointerId};
    return}
  if(pan||ev.button===0)iniziaVuoto(ev,pan)});
/* Clic sul vuoto e trascina: rettangolo di selezione, come in Figma.
   - seleziona i nodi che il rettangolo tocca; un gruppo solo se è tutto dentro
   - con ⇧ aggiunge alla selezione che c'era; un clic senza trascinare deseleziona
   - vicino al bordo la board scorre da sola
   Spazio + trascina (o tasto centrale del mouse) sposta la board; due dita sul trackpad la spostano sempre. */
function iniziaVuoto(ev,pan){ev.preventDefault();nb.focus({preventScroll:true});
  if(!pan){const p=aMondo(ev.clientX,ev.clientY);
    az={tipo:'lazo',p0:p,p1:null,cx:ev.clientX,cy:ev.clientY,base:ev.shiftKey?new Set(sel):new Set(),mosso:false};
    if(!ev.shiftKey&&(sel.size||selArco)){sel.clear();selArco=null;segnaSel()}
    nb.setPointerCapture(ev.pointerId);return}
  az={tipo:'pan',sx:ev.clientX,sy:ev.clientY,x0:V.x,y0:V.y,mosso:false};nb.setPointerCapture(ev.pointerId);nb.classList.add('panning')}
/* aggiorna solo l'evidenziazione (più leggero di render) */
function segnaSel(){for(const [id,e] of el)e.classList.toggle('sel',sel.has(id));disegnaArchi();aggiornaBarra();disegnaMini()}
function aggiornaLazo(){const a=az;if(!a||a.tipo!=='lazo')return;const r=nb.getBoundingClientRect();
  const p1=aMondo(a.cx,a.cy);a.p1=p1;
  const x0=Math.min(a.p0.x,p1.x),y0=Math.min(a.p0.y,p1.y),x1=Math.max(a.p0.x,p1.x),y1=Math.max(a.p0.y,p1.y);
  const m=$('#nbMarquee');m.style.display='block';
  m.style.left=x0*V.z+V.x+'px';m.style.top=y0*V.z+V.y+'px';m.style.width=(x1-x0)*V.z+'px';m.style.height=(y1-y0)*V.z+'px';
  const nuovo=new Set(a.base);
  for(const n of B.nodi){const q=rett(n);
    const tocca=q.x<x1&&q.x+q.w>x0&&q.y<y1&&q.y+q.h>y0,dentro=q.x>=x0&&q.x+q.w<=x1&&q.y>=y0&&q.y+q.h<=y1;
    if(n.tipo==='frame'?dentro:tocca)nuovo.add(n.id)}
  if(nuovo.size!==sel.size||[...nuovo].some(id=>!sel.has(id))){sel.clear();nuovo.forEach(id=>sel.add(id));segnaSel()}}
/* scorrimento automatico quando il rettangolo arriva al bordo */
function scorriLazo(){const a=az;if(!a||a.tipo!=='lazo')return;const r=nb.getBoundingClientRect(),M=36,vel=18;
  const vx=a.cx<r.left+M?vel*(1-(a.cx-r.left)/M):a.cx>r.right-M?-vel*(1-(r.right-a.cx)/M):0;
  const vy=a.cy<r.top+M?vel*(1-(a.cy-r.top)/M):a.cy>r.bottom-M?-vel*(1-(r.bottom-a.cy)/M):0;
  if(vx||vy){V.x+=Math.max(-vel,Math.min(vel,vx));V.y+=Math.max(-vel,Math.min(vel,vy));applica();aggiornaLazo()}
  a.raf=requestAnimationFrame(scorriLazo)}
nb.addEventListener('pointermove',ev=>{mouse={x:ev.clientX,y:ev.clientY};if(!az)return;
  const dx=ev.clientX-(az.sx??0),dy=ev.clientY-(az.sy??0);
  if(az.tipo==='pan'){if(Math.hypot(dx,dy)>3)az.mosso=true;V.x=az.x0+dx;V.y=az.y0+dy;applica();return}
  if(az.tipo==='filo'){const p=aMondo(ev.clientX,ev.clientY);const tmp=svg.querySelector('.temp');tmp.setAttribute('d',curva(az.p0,p));
    const pi=sotto(ev.clientX,ev.clientY,'.porta.in');tmp.classList.toggle('ok',!!(pi&&pi.classList.contains('ok')));return}
  if(az.tipo==='resize'){az.f.w=Math.max(200,Math.round(az.w0+dx/V.z));az.f.h=Math.max(140,Math.round(az.h0+dy/V.z));render();return}
  if(az.tipo==='lazo'){az.cx=ev.clientX;az.cy=ev.clientY;
    if(!az.mosso){if(Math.hypot(ev.clientX-(az.p0.x*V.z+V.x+nb.getBoundingClientRect().left),ev.clientY-(az.p0.y*V.z+V.y+nb.getBoundingClientRect().top))<3)return;
      az.mosso=true;az.raf=requestAnimationFrame(scorriLazo)}
    aggiornaLazo();return}
  if(az.tipo==='nodi'){if(!az.mosso&&Math.hypot(dx,dy)<4)return;
    if(!az.mosso){az.mosso=true;try{nb.setPointerCapture(az.pid)}catch(e){}az.orig.forEach(o=>el.get(o.n.id)?.classList.add('trascina'))}
    let mx=dx/V.z,my=dy/V.z;const bb=az.bb;const guide=[];
    if(bb&&!ev.altKey){mx=Math.round((bb.x+mx)/GRID)*GRID-bb.x;my=Math.round((bb.y+my)/GRID)*GRID-bb.y;
      /* guide di allineamento: bordi e centri */
      const tol=TOLL/V.z,xs=[0,bb.w/2,bb.w],ys=[0,bb.h/2,bb.h];let bx=null,by=null;
      for(const o of az.altri){for(const a of xs)for(const b of [o.x,o.x+o.w/2,o.x+o.w]){const raw=bb.x+dx/V.z+a;const d=b-raw;if(Math.abs(d)<tol&&(!bx||Math.abs(d)<Math.abs(bx.d)))bx={d,line:b,o}}
        for(const a of ys)for(const b of [o.y,o.y+o.h/2,o.y+o.h]){const raw=bb.y+dy/V.z+a;const d=b-raw;if(Math.abs(d)<tol&&(!by||Math.abs(d)<Math.abs(by.d)))by={d,line:b,o}}}
      if(bx){mx=dx/V.z+bx.d;guide.push({v:true,at:bx.line,o:bx.o})}
      if(by){my=dy/V.z+by.d;guide.push({v:false,at:by.line,o:by.o})}}
    for(const o of az.orig){o.n.x=Math.round(o.x+mx);o.n.y=Math.round(o.y+my);const e=el.get(o.n.id);if(e){e.style.left=o.n.x+'px';e.style.top=o.n.y+'px'}}
    disegnaGuide(guide,bb?{x:bb.x+mx,y:bb.y+my,w:bb.w,h:bb.h}:null);pianificaArchi()}});
function disegnaGuide(g,bb){strGuide.innerHTML=g.map(x=>{const o=x.o;
  if(x.v){const y0=Math.min(o.y,bb.y)-20,y1=Math.max(o.y+o.h,bb.y+bb.h)+20;return `<div class="guida" style="left:${x.at-.75/V.z}px;top:${y0}px;width:${1.5/V.z}px;height:${y1-y0}px"></div>`}
  const x0=Math.min(o.x,bb.x)-20,x1=Math.max(o.x+o.w,bb.x+bb.w)+20;return `<div class="guida" style="top:${x.at-.75/V.z}px;left:${x0}px;height:${1.5/V.z}px;width:${x1-x0}px"></div>`}).join('')}
function fine(ev){if(!az)return;const a=az;az=null;nb.classList.remove('panning','collega');strGuide.innerHTML='';
  if(a.tipo==='pan'){if(!a.mosso&&(sel.size||selArco)){sel.clear();selArco=null;render()}return}
  if(a.tipo==='resize'){commit();return}
  if(a.tipo==='lazo'){cancelAnimationFrame(a.raf);$('#nbMarquee').style.display='none';render();return}
  if(a.tipo==='nodi'){a.orig.forEach(o=>el.get(o.n.id)?.classList.remove('trascina'));if(a.mosso){disegnaArchi();commit()}return}
  if(a.tipo==='filo'){const tmp=svg.querySelector('.temp');$$('.porta.ok').forEach(x=>x.classList.remove('ok'));
    const pi=sotto(ev.clientX,ev.clientY,'.porta.in');const ne=sotto(ev.clientX,ev.clientY,'.nd');
    let dest=null,porta=null;
    if(pi){dest=pi.closest('.nd').dataset.id;porta=pi.dataset.porta}else if(ne&&ne.dataset.id!==a.da){dest=ne.dataset.id;porta=primaPortaValida(a.da,dest)||(porte(nodo(dest))[0]||{}).p}
    if(dest){const err=porta?valida(a.da,dest,porta):'Questo nodo non ha ingressi.';
      if(err){tmp.classList.add('no');tmp.classList.remove('ok');toast(err,true);setTimeout(()=>{tmp.remove();if(a.staccato)commit()},380);return}
      tmp.remove();collega(a.da,dest,porta);render();commit();return}
    tmp.remove();if(a.staccato){render();commit();return}
    if(!ne)menuCreaCollegato(a.da,ev.clientX,ev.clientY)}}
nb.addEventListener('pointerup',fine);nb.addEventListener('pointercancel',fine);
nb.addEventListener('contextmenu',ev=>{if(inCampo(ev.target))return;ev.preventDefault();const ne=ev.target.closest('.nd,.nb-frame');
  if(ne){const n=nodo(ne.dataset.id);if(!sel.has(n.id)){sel.clear();sel.add(n.id);render()}menuNodo(n,ev.clientX,ev.clientY)}else menuBoard(ev.clientX,ev.clientY)});
nb.addEventListener('dblclick',ev=>{if(inCampo(ev.target)||ev.target.closest('button,.porta,.nd-strip'))return;const t=nodoSotto(ev.clientX,ev.clientY);
  if(t){if(t.tipo==='ref'||t.tipo==='gen')anteprima(fileDi(t));return}
  if(!ev.target.closest('.fr-testa'))menuBoard(ev.clientX,ev.clientY)});

/* risultato trascinato fuori dal nodo → nuovo nodo Reference */
function trascinaRisultato(ev,n,i){ev.preventDefault();ev.stopPropagation();const f=n.risultati[i];const sx=ev.clientX,sy=ev.clientY;let g=null;
  const mv=e=>{if(!g&&Math.hypot(e.clientX-sx,e.clientY-sy)<5)return;
    if(!g){g=document.createElement('div');g.className='nb-ghost';g.innerHTML=kindDa(f)==='video'?`<video src="${url(f)}" muted></video>`:`<img src="${url(f)}" alt="">`;document.body.appendChild(g)}
    g.style.left=e.clientX-32+'px';g.style.top=e.clientY-32+'px'};
  const up=e=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up);
    if(!g){n.sel=i;aggiornaNodo(n);aggiornaUscita(n);disegnaArchi();salva();return}
    g.remove();const t=nodoSotto(e.clientX,e.clientY);const p=aMondo(e.clientX,e.clientY);
    if(t===n)return;
    const r=nodoRefDaFile(f,p.x-LARGH.ref/2,p.y-40);
    if(t&&t.tipo==='gen'){vicinoA([r],t);const pp=primaPortaValida(r.id,t.id);if(pp)collega(r.id,t.id,pp)}
    sel.clear();sel.add(r.id);render();commit()};
  addEventListener('pointermove',mv);addEventListener('pointerup',up)}

/* rotella: pan con due dita, zoom con ctrl/⌘ o pinch */
nb.addEventListener('wheel',ev=>{
  const sc=ev.target.closest&&ev.target.closest('textarea,.nd-strip,.menu,.nd-par');
  if(sc&&!ev.ctrlKey&&!ev.metaKey&&(sc.scrollHeight>sc.clientHeight||sc.scrollWidth>sc.clientWidth))return;
  ev.preventDefault();
  if(ev.ctrlKey||ev.metaKey){const d=ev.deltaMode===1?ev.deltaY*33:ev.deltaY;zoomA(ev.clientX,ev.clientY,V.z*Math.exp(-d*(ev.ctrlKey&&!ev.metaKey?.01:.0025)))}
  else{V.x-=ev.deltaX;V.y-=ev.deltaY;applica()}},{passive:false});
let zG=1;nb.addEventListener('gesturestart',e=>{e.preventDefault();zG=V.z});nb.addEventListener('gesturechange',e=>{e.preventDefault();zoomA(e.clientX,e.clientY,zG*e.scale)});

/* tastiera */
addEventListener('keydown',ev=>{if(!attivo||!B)return;
  if(document.querySelector('dialog[open]'))return;
  const mod=ev.metaKey||ev.ctrlKey;
  if(inCampo(ev.target)){if(ev.key==='Escape'){ev.target.blur();nb.focus({preventScroll:true})}return}
  if(ev.code==='Space'){ev.preventDefault();if(!spazio){spazio=true;nb.classList.add('pan')}return}
  if(ev.key==='Backspace'||ev.key==='Delete'){ev.preventDefault();elimina();return}
  if(ev.key==='Escape'){chiudiMenu();sel.clear();selArco=null;render();return}
  if(ev.key==='Enter'&&sel.size===1){ev.preventDefault();const n=nodo([...sel][0]);const e=el.get(n.id);
    const f=e.querySelector('textarea')||e.querySelector('.nd-modello')||e.querySelector('.fr-testa input');
    if(f){f.focus();if(f.select&&f.tagName==='INPUT')f.select()}else if(n.tipo==='ref'&&!n.file)scegliFile(x=>caricaSuNodo(n,x[0]));return}
  if(!mod)return;const k=ev.key.toLowerCase();
  if(k==='z'){ev.preventDefault();ev.shiftKey?ripeti():annulla()}
  else if(k==='y'){ev.preventDefault();ripeti()}
  else if(k==='d'){ev.preventDefault();duplica()}
  else if(k==='a'){ev.preventDefault();B.nodi.forEach(n=>sel.add(n.id));render()}
  else if(k==='0'){ev.preventDefault();adatta()}
  else if(k==='1'){ev.preventDefault();zoomCentro(1)}});
addEventListener('keyup',ev=>{if(ev.code==='Space'){spazio=false;nb.classList.remove('pan')}});
addEventListener('blur',()=>{spazio=false;nb.classList.remove('pan')});

/* ---------------- minimappa ---------------- */
let miniScala=null;
function disegnaMini(){const c=$('#nbMini');if(!c||!B||!attivo)return;const g=c.getContext('2d');const W=c.width,H=c.height;g.clearRect(0,0,W,H);
  const r=nb.getBoundingClientRect();const vista={x:-V.x/V.z,y:-V.y/V.z,w:r.width/V.z,h:r.height/V.z};
  const R=B.nodi.map(rett);const tutti=[...R,vista];
  const x0=Math.min(...tutti.map(q=>q.x)),y0=Math.min(...tutti.map(q=>q.y)),x1=Math.max(...tutti.map(q=>q.x+q.w)),y1=Math.max(...tutti.map(q=>q.y+q.h));
  const s=Math.min((W-16)/(x1-x0||1),(H-16)/(y1-y0||1));const ox=8-x0*s+((W-16)-(x1-x0)*s)/2,oy=8-y0*s+((H-16)-(y1-y0)*s)/2;miniScala={s,ox,oy};
  B.nodi.forEach((n,i)=>{const q=R[i];g.fillStyle=n.tipo==='frame'?'rgba(0,0,0,.05)':sel.has(n.id)?'#465bd2':n.tipo==='gen'?'#222':n.tipo==='ref'?'#b6c0ef':n.tipo==='nota'?'#f0d873':'#bdbdbd';
    g.fillRect(ox+q.x*s,oy+q.y*s,Math.max(2,q.w*s),Math.max(2,q.h*s))});
  g.strokeStyle='#465bd2';g.lineWidth=1.5;g.strokeRect(ox+vista.x*s,oy+vista.y*s,vista.w*s,vista.h*s)}
(()=>{const c=$('#nbMini');let giu=false;const vai=e=>{if(!miniScala)return;const r=c.getBoundingClientRect();const wx=(e.clientX-r.left-miniScala.ox)/miniScala.s,wy=(e.clientY-r.top-miniScala.oy)/miniScala.s;
  const nr=nb.getBoundingClientRect();V.x=nr.width/2-wx*V.z;V.y=nr.height/2-wy*V.z;applica()};
  c.addEventListener('pointerdown',e=>{giu=true;c.setPointerCapture(e.pointerId);vai(e)});c.addEventListener('pointermove',e=>{if(giu)vai(e)});c.addEventListener('pointerup',()=>giu=false)})();

/* ---------------- barra, template, asset ---------------- */
$$('.nb-barra [data-add]').forEach(b=>b.onclick=()=>aggiungiAlCentro(b.dataset.add));
$('#nbEsegui').onclick=eseguiSelezionati;$('#nbUndo').onclick=annulla;$('#nbRedo').onclick=ripeti;
$('#nbMeno').onclick=()=>zoomCentro(V.z/1.25);$('#nbPiu').onclick=()=>zoomCentro(V.z*1.25);$('#nbAdatta').onclick=()=>adatta();
$('#nbPerc').ondblclick=()=>zoomCentro(1);
$('#nbTpl').onclick=async ev=>{const r=ev.target.getBoundingClientRect();let lista=[];try{lista=(await api('/api/template')).template}catch(e){}
  mostraMenu([{t:'Salva come template…',off:!B.nodi.length,f:salvaTemplate},'-',{tit:lista.length?'Nuovo da template':'Nessun template salvato'},
    ...lista.map(t=>({t,f:()=>usaTemplate(t)}))],r.left,r.bottom+6)};
async function salvaTemplate(){const nome=prompt('Nome del template');if(!nome)return;
  try{await api('/api/template',{nome,board:serializza({...B,nodi:sel.size?B.nodi.filter(n=>conContenuto(sel).has(n.id)):B.nodi,archi:B.archi},true)});toast(`Template "${nome}" salvato${sel.size?' (solo i nodi selezionati)':''}.`)}
  catch(e){toast(e.message,true)}}
async function usaTemplate(nome){try{const t=await api('/api/template?nome='+encodeURIComponent(nome));
  const c=centroVista();const nodi=(t.nodi||[]).map(n=>({...n}));if(!nodi.length)return;
  const b={x:Math.min(...nodi.map(n=>n.x)),y:Math.min(...nodi.map(n=>n.y))};
  const w=Math.max(...nodi.map(n=>n.x+(n.w||LARGH[n.tipo]||240)))-b.x;
  incollaNodi({nodi,archi:t.archi||[]},{x:c.x-w/2,y:c.y-150});toast(`Creato da "${nome}"`)}catch(e){toast(e.message,true)}}
$('#nbAssetBtn').onclick=()=>{$('#nbAsset').hidden=!$('#nbAsset').hidden;disegnaAsset()};$('#nbAssetX').onclick=()=>{$('#nbAsset').hidden=true};
function disegnaAsset(){if($('#nbAsset').hidden||!B)return;const l=$('#nbAssetLista');
  l.innerHTML=assets.length?assets.map(a=>{const u=new URL(url(a.file),location.href).href;return kindDa(a.file)==='video'?`<video src="${u}" muted draggable="true" data-u="${u}" title="${esc(a.prompt)}"></video>`:`<img src="${u}" draggable="true" data-u="${u}" title="${esc(a.prompt)}" alt="">`}).join(''):'<p>Ancora nessun file generato.</p>';
  l.querySelectorAll('[data-u]').forEach(x=>x.ondragstart=e=>{e.dataTransfer.setData('text/uri-list',x.dataset.u);e.dataTransfer.setData('text/plain',x.dataset.u);e.dataTransfer.effectAllowed='copy'})}

/* ---------------- vista Griglia / Canvas ---------------- */
function leggiVista(){try{return localStorage.getItem('vista')==='canvas'?'canvas':'griglia'}catch(e){return 'griglia'}}
function misuraBar(){document.documentElement.style.setProperty('--bar-h',document.querySelector('.bar').offsetHeight+'px')}
addEventListener('resize',()=>{misuraBar();if(attivo){disegnaArchi();disegnaMini()}});
async function impostaVista(v){attivo=v==='canvas';try{localStorage.setItem('vista',v)}catch(e){}
  $$('#vistaSwitch button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
  document.querySelector('main').classList.toggle('modo-canvas',attivo);wrap.hidden=!attivo;misuraBar();
  if(attivo){const u=S.ultimo;if(u)await apriProgetto(u.nome,u.d);else render()}}
window.impostaVista=impostaVista;
$$('#vistaSwitch button').forEach(b=>b.onclick=()=>impostaVista(b.dataset.v));
async function apriProgetto(nome,d){
  if(d)assets=d.elementi||[];
  if(!B||B.progetto!==nome){
    if(caricando===nome)return;caricando=nome;
    if(salvaPend)await salvaOra();
    const b=await caricaBoard(nome);caricando=null;if(!attivo&&!b)return;
    B=b;sel.clear();selArco=null;el.forEach(e=>e.remove());el.clear();stime.clear();pilaUndo=[];pilaRedo=[];ultimo=istantanea();
    render();
    if(B.vista){Object.assign(V,B.vista);applica()}else adatta();
    if(B.migrata){delete B.migrata;salva();toast(`Canvas aggiornata: ${B.nodi.length} immagini sono ora nodi Reference.`)}
  }else{
    /* stesso progetto: aggiorna solo i modelli nei menu se sono cambiati (es. dopo "+ Modelli") */
    if(S.modelli.length!==(apriProgetto._n||0)){apriProgetto._n=S.modelli.length;B.nodi.filter(n=>n.tipo==='gen').forEach(n=>aggiornaNodo(n))}
    render()}
  apriProgetto._n=S.modelli.length;disegnaAsset()}
/* prima di rinominare/eliminare un progetto: salva e "dimentica" la sua board, così non ricrea la cartella */
window.cvLascia=async nome=>{if(salvaPend&&salvaPend.progetto===nome)await salvaOra();clearTimeout(salvaT);
  if(salvaPend&&salvaPend.progetto===nome)salvaPend=null;
  if(B&&B.progetto===nome){B=null;el.forEach(e=>e.remove());el.clear();sel.clear()}};
/* spesa del progetto (la stessa della Griglia), in basso a sinistra sopra la minimappa */
function disegnaSpesa(d){const s=$('#nbSpesa');if(!s||!d)return;const k=(d.elementi||[]).length;s.hidden=!k;
  if(k)s.textContent=`${k} file · spesa totale $${Number(d.totale_usd||0).toFixed(2)}`}
window.cvAggiorna=(nome,d)=>{if(d){assets=d.elementi||[];disegnaSpesa(d)}if(attivo)apriProgetto(nome,d);else if(B&&B.progetto!==nome&&salvaPend)salvaOra()};

/* debug/test */
window.__nb={get B(){return B},V,sel,corse,annulla,ripeti,collega:(a,b,p)=>{const r=collega(a,b,p);render();commit();return r},aggiungi:(t,x,y,e)=>{const n=aggiungi(t,x,y,e);render();commit();return n},
  eseguiCatena:id=>eseguiCatena(nodo(id)),salvaOra,valida,adatta};
applica();impostaVista(leggiVista());
})();
