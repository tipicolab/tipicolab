/* Tipico Lab — interfaccia in italiano o inglese.
   L'app è scritta in italiano; questo file traduce al volo testi, attributi, avvisi e conferme
   quando la lingua è "en". Non tocca i contenuti dell'utente (prompt, nomi dei progetti, tag, modelli). */
(()=>{
'use strict';
const T=s=>tr(s);
/* ---------- testi esatti ---------- */
const EX={
// barra e progetti
'Modifica':'Edit','Rinomina, elimina, cartella di salvataggio':'Rename, delete, download folder','Lingua':'Language',
'Scegli la cartella di salvataggio…':'Choose the download folder…','Cambia cartella di salvataggio…':'Change the download folder…',
'Salva tutti i file nella cartella':'Save all files to the folder','Non usare più questa cartella':'Stop using this folder',
'I download vanno in:':'Downloads go to:','I download chiedono ogni volta dove salvare.':'Downloads ask every time where to save.',
'Download in':'Downloads in','Cartella non trovata:':'Folder not found:','Scegli dove salvare i download':'Choose where to save downloads',
'I download chiederanno ogni volta dove salvare':'Downloads will ask every time where to save','Scarica':'Download','Salva con nome…':'Save as…',
'Scegliere una cartella funziona solo sul Mac.':'Choosing a folder only works on the Mac.','File non trovato.':'File not found.',
// aggiornamenti
'In generazione su OpenRouter…':'Generating on OpenRouter…','In generazione su OpenRouter (via alternativa)…':'Generating on OpenRouter (alternative route)…',
'Il modello non ha restituito immagini.':'The model returned no images.',
'Aggiorna e riavvia':'Update and restart','Più tardi':'Later','Inizio…':'Starting…','Scarico l\'aggiornamento…':'Downloading the update…',
'Preparo la nuova versione…':'Preparing the new version…','Installo…':'Installing…','Riavvio…':'Restarting…',
'Nessuna versione nuova da installare.':'No new version to install.','Il file scaricato non contiene l\'app.':'The downloaded file doesn\'t contain the app.',
'Sposta Tipico Lab nella cartella Applicazioni, riaprila e riprova.':'Move Tipico Lab to the Applications folder, reopen it and try again.',
'Aggiornamento automatico disponibile solo nell\'app (non da "Avvia Tipico Lab.command").':'Automatic updates only work in the app (not from "Avvia Tipico Lab.command").',
'Ci sono generazioni in corso: se aggiorni adesso si interrompono.':'Generations are running: updating now will stop them.','Aggiornare lo stesso?':'Update anyway?',
'Rinomina progetto…':'Rename project…','Elimina progetto…':'Delete project…','Rinomina o elimina il progetto':'Rename or delete the project',
'+ Nuovo progetto':'+ New project','Griglia':'Grid','+ Modelli':'+ Models','Apri cartella':'Open folder','Progetto':'Project','Vista':'View',
'Nuovo nome del progetto':'New project name','Nome del nuovo progetto':'Name of the new project',
'In questo progetto c\'è una generazione in corso: aspetta che finisca.':'A generation is running in this project: wait for it to finish.',
// pannello di sinistra
'Crea':'Create','Immagini e video con i modelli che scegli tu. Paghi solo quello che generi.':'Images and videos with the models you choose. You only pay for what you generate.',
'Manca la chiave. Apri':'The key is missing. Open','nella cartella dell\'app, incolla la chiave OpenRouter al posto del segnaposto e riavvia.':'in the app folder, paste your OpenRouter key in place of the placeholder and restart.',
'Modello':'Model','Trascina qui le immagini':'Drop images here','o clicca per sceglierle':'or click to choose them',
'Ogni reference ha un tag. Scrivi':'Each reference has a tag. Type','nel prompt o clicca un\'immagine per citarla. Puoi rinominare il tag (es.':'in the prompt or click an image to mention it. You can rename the tag (e.g.',
'@giacca':'@jacket','Ultimo frame':'Last frame','Primo frame':'First frame','Trascina qui':'Drop here','o clicca (opzionale)':'or click (optional)',
'Video da upscalare':'Video to upscale','Trascina qui il video o clicca':'Drop the video here or click','Prompt (opzionale)':'Prompt (optional)',
'Costo stimato':'Estimated cost','Genera':'Generate','n.d.':'n/a','Sì':'Yes','+ nel prompt':'+ to prompt','Rimuovi':'Remove','Tag della reference':'Reference tag',
'Descrivi immagine o movimento…':'Describe the image or motion…',
'Opzionale: es. "mantieni nitidi i dettagli del tessuto e i volti"':'Optional: e.g. "keep fabric details and faces sharp"',
'Es. la modella di @img1 indossa la giacca di @img2, luce come in @img3…':'E.g. the model from @img1 wears the jacket from @img2, lighting like @img3…',
'Vedrai il costo reale dopo la generazione':'You\'ll see the actual cost after generating',
'Il file è pesante: se OpenRouter lo rifiuta, esportalo più leggero (H.264).':'The file is large: if OpenRouter rejects it, export a lighter one (H.264).',
// parametri dei modelli
'Risoluzione':'Resolution','Formato':'Aspect ratio','Quante immagini':'Number of images','Seed (opzionale)':'Seed (optional)','Durata (s)':'Duration (s)',
'Modalità':'Mode','Ingrandimento':'Upscale factor','Da evitare':'Avoid','Immagini':'Images','Aggiunti da te':'Added by you','Consigliati':'Recommended','Upscale e modifica':'Upscale & edit',
'Video da modificare (obbligatorio)':'Video to edit (required)','Scrivi nel prompt come modificare il video.':'Write in the prompt how to edit the video.',
'Descrivi la modifica: es. "cambia il colore della giacca in rosso"':'Describe the edit: e.g. "change the jacket colour to red"',
'Primo frame (opzionale: senza = da testo)':'First frame (optional: without = from text)','Ultimo frame (opzionale)':'Last frame (optional)',
'Video da upscalare (obbligatorio)':'Video to upscale (required)','Reference (outfit, location, luce…)':'References (outfit, location, lighting…)',
'Nano Banana Pro · da testo':'Nano Banana Pro · text to image','Nano Banana Pro · con reference':'Nano Banana Pro · with references',
'Kling 3 Standard · da immagine':'Kling 3 Standard · image to video','Seedance 2.0 · da immagine':'Seedance 2.0 · image to video',
// galleria e segnaposto
'Ancora niente qui':'Nothing here yet','Scegli un modello, scrivi un prompt e premi Genera.':'Pick a model, write a prompt and press Generate.',
'Riusa prompt':'Reuse prompt','Scarica… (scegli la cartella)':'Download… (choose the folder)','Usa come reference':'Use as reference','Scarica…':'Download…',
'Chiudi (Esc)':'Close (Esc)','Chiudi':'Close','Preparo…':'Preparing…','Quasi pronto…':'Almost done…','Errore':'Error',
// finestra modelli
'Aggiungi modelli':'Add models','Cerca nel catalogo di OpenRouter (e fal.ai, se hai la chiave) e aggiungi i modelli al tuo menu.':'Search the OpenRouter catalogue (and fal.ai, if you have the key) and add models to your menu.',
'Cerca: seedream, veo, flux, gpt image, wan, hailuo…':'Search: seedream, veo, flux, gpt image, wan, hailuo…','Cerca':'Search','Modelli che hai aggiunto':'Models you added',
'Nessuno per ora.':'None yet.','Cerco…':'Searching…','Aggiungi':'Add','Aggiunto ✓':'Added ✓','Nessun risultato.':'No results.',
// avvisi
'I video non si possono usare come reference.':'Videos can\'t be used as references.',
'Il modello scelto non accetta reference. Scegline uno che le accetta (ad esempio Nano Banana Pro) e riprova.':'The selected model doesn\'t accept references. Pick one that does (for example Nano Banana Pro) and try again.',
'Il modello scelto non accetta reference. Scegline uno che le accetta, ad esempio Nano Banana Pro.':'The selected model doesn\'t accept references. Pick one that does, for example Nano Banana Pro.',
'Carica prima il video da upscalare.':'Upload the video to upscale first.','Generare lo stesso?':'Generate anyway?','Procedere?':'Proceed?',
'Non riesco a leggere questo video. Prova un MP4 (H.264).':'I can\'t read this video. Try an MP4 (H.264).',
'La Canvas non si è caricata.':'The Canvas didn\'t load.',
'Chiudi la finestra del Terminale di Tipico Lab e riapri "Avvia Tipico Lab.command": il server deve ripartire per usare la versione aggiornata.':'Close the Tipico Lab Terminal window and reopen "Avvia Tipico Lab.command": the server has to restart to use the updated version.',
// errori del server
'Servono progetto e prompt.':'A project and a prompt are required.','Progetto non trovato.':'Project not found.','Scrivi un nome.':'Write a name.',
'Non riesco a spostare il progetto nel Cestino.':'I couldn\'t move the project to the Trash.','Manca il progetto.':'The project is missing.',
'Manca la chiave OpenRouter: incollala in config.json al posto del segnaposto e riavvia.':'The OpenRouter key is missing: paste it into config.json in place of the placeholder and restart.',
'Manca la chiave fal: incollala in config.json al posto del segnaposto e riavvia.':'The fal key is missing: paste it into config.json in place of the placeholder and restart.',
'Manca la chiave OpenRouter in config.json.':'The OpenRouter key is missing from config.json.','Questo modello ha bisogno di almeno una reference.':'This model needs at least one reference.',
'Carica il video da upscalare.':'Upload the video to upscale.','Tempo scaduto (45 minuti).':'Timed out (45 minutes).',
'Tempo scaduto (30 minuti). Controlla la richiesta sul sito di fal.':'Timed out (30 minutes). Check the request on the fal website.',
'La canvas è troppo grande per essere salvata.':'The canvas is too big to be saved.','Template non trovato.':'Template not found.','Servono nome e struttura.':'A name and a structure are required.',
'File vuoto o troppo grande (max 600 MB).':'Empty or too large file (max 600 MB).','Modello non trovato su fal.':'Model not found on fal.',
'Non riesco a leggere i parametri di questo modello.':'I can\'t read this model\'s parameters.','fal non fornisce i parametri di questo modello.':'fal doesn\'t provide this model\'s parameters.',
// Canvas
'Canvas vuota':'Empty canvas','Aggiungi un nodo dalla barra in alto, fai doppio clic sulla board o trascina qui foto e video dal Finder.':'Add a node from the bar at the top, double-click the board or drag photos and videos here from the Finder.',
'+ Prompt':'+ Prompt','+ Reference':'+ Reference','+ Generazione':'+ Generation','+ Nota':'+ Note','+ Gruppo':'+ Group','Esegui selezionati':'Run selected',
'Template ▾':'Templates ▾','Asset':'Assets','Annulla (⌘Z)':'Undo (⌘Z)','Ripeti (⇧⌘Z)':'Redo (⇧⌘Z)','Minimappa: clicca o trascina per spostarti':'Minimap: click or drag to move around',
'Riduci':'Zoom out','Ingrandisci':'Zoom in','Adatta':'Fit','Adatta alla vista (⌘0)':'Fit to view (⌘0)','Asset del progetto':'Project assets',
'Trascina un\'immagine sulla board per creare un nodo Reference.':'Drag an image onto the board to create a Reference node.','Ancora nessun file generato.':'No generated files yet.',
'Generazione':'Generation','Nota':'Note','Gruppo':'Group','Tag da usare nel prompt':'Tag to use in the prompt','Azioni':'Actions','Titolo del gruppo':'Group title',
'Trascina per spostare il gruppo e il suo contenuto':'Drag to move the group and its contents',
'Descrivi l\'immagine. Scrivi @ per citare una reference collegata.':'Describe the image. Type @ to mention a connected reference.','Scrivi una nota…':'Write a note…',
'Video da ingrandire':'Video to upscale','— scegli un modello —':'— choose a model —','Collega un prompt e premi Genera':'Connect a prompt and press Generate',
'Scegli un modello':'Choose a model','Scegli un modello.':'Choose a model.','In corso…':'Running…','Stima':'Estimate','costo n.d.':'cost n/a',
'Trascina qui un file':'Drop a file here','o clicca per sceglierlo':'or click to choose it',
'Clic: seleziona · trascina sulla board: nuovo nodo Reference':'Click: select · drag onto the board: new Reference node',
'Usa come reference (nuovo nodo collegabile)':'Use as reference (new connectable node)','Esegui catena':'Run chain','Duplica':'Duplicate','Elimina':'Delete',
'Copia prompt':'Copy prompt','Apri file':'Open file','Aggiungi qui':'Add here','Reference (scegli file)':'Reference (choose file)','Incolla nodi':'Paste nodes',
'Adatta alla vista':'Fit to view','Crea nodo collegato':'Create connected node','Generazione immagine':'Image generation','Generazione video':'Video generation',
'Generazione con reference':'Generation with reference','Video dal primo frame':'Video from first frame','Salva come template…':'Save as template…',
'Nuovo da template':'New from template','Nessun template salvato':'No saved templates','Nome del template':'Template name','Prompt copiato':'Prompt copied',
'Collegamento non valido.':'Invalid connection.','Questo nodo non ha uscite.':'This node has no outputs.','Questo nodo non ha ingressi.':'This node has no inputs.',
'Questo ingresso non esiste per il modello scelto.':'This input doesn\'t exist for the selected model.','Già collegati.':'Already connected.','Creerebbe un ciclo.':'It would create a loop.',
'Caricamento non riuscito':'Upload failed','Trascina immagini, video o audio (dal Finder o dagli asset del progetto).':'Drag images, videos or audio (from the Finder or the project assets).',
'Collega un nodo Prompt con del testo.':'Connect a Prompt node with some text.','Questo modello vuole almeno una reference collegata.':'This model needs at least one connected reference.',
'Collega il video da ingrandire.':'Connect the video to upscale.','Catena completata.':'Chain completed.','nessun ingresso compatibile':'no compatible input','testo':'text',
};
/* ---------- testi con parti variabili ---------- */
const PAT=[
[/^È disponibile la versione (.+)$/,(m,v)=>`Version ${v} is available`],
[/^Hai la (.+)\. L'aggiornamento richiede un minuto: i tuoi progetti e la tua chiave restano come sono\.$/,(m,v)=>`You have ${v}. Updating takes a minute: your projects and your key stay as they are.`],
[/^Scarico l'aggiornamento… (\d+)%$/,(m,n)=>`Downloading the update… ${n}%`],
[/^Non ho il permesso di sostituire l'app in (.+)\.$/,(m,p)=>`I don't have permission to replace the app in ${p}.`],
[/^Salvato in "(.*)" come (.+)$/,(m,c,n)=>`Saved to "${c}" as ${n}`],[/^Salvato in "(.*)"$/,(m,c)=>`Saved to "${c}"`],
[/^Salva in "(.*)"$/,(m,c)=>`Save to "${c}"`],
[/^Già salvato in "(.*)"$/,(m,c)=>`Already saved in "${c}"`],
[/^(\d+) file salvati in "(.*)"( · (\d+) c'erano già)?$/,(m,n,c,x,g)=>`${n} file${n==='1'?'':'s'} saved to "${c}"${g?` · ${g} already there`:''}`],
[/^Tutti i file sono già in "(.*)"$/,(m,c)=>`All files are already in "${c}"`],
[/^I download di "(.*)" vanno in "(.*)"$/,(m,p,c)=>`Downloads of "${p}" go to "${c}"`],
[/^Dove salvare i file del progetto "(.*)"\?$/,(m,p)=>`Where should the files of "${p}" be saved?`],
[/^La cartella di salvataggio "(.*)" non esiste più \(spostata o cancellata\?\): sceglila di nuovo\.$/,(m,c)=>`The download folder "${c}" no longer exists (moved or deleted?): choose it again.`],
[/^Genera( · .+)$/,(m,a)=>'Generate'+a],
[/^(\d+) file · spesa totale (.+)$/,(m,n,c)=>`${n} file${n==='1'?'':'s'} · total spent ${c}`],
[/^Reference \(opzionali, max (\d+)\)$/,(m,n)=>`References (optional, max ${n})`],
[/^Reference di stile \(obbligatoria, max (\d+)\)$/,(m,n)=>`Style reference (required, max ${n})`],
[/^In coda…(.*)$/,(m,r)=>'Queued…'+tr2(r)],[/^OpenRouter è occupato: riprovo tra (\d+) s \((\d+)\/(\d+)\)…$/,(m,s,k,n)=>`OpenRouter is busy: retrying in ${s} s (${k}/${n})…`],
[/^Genero…(.*)$/,(m,r)=>'Generating…'+tr2(r)],[/^Quasi pronto…(.*)$/,(m,r)=>'Almost done…'+tr2(r)],
[/^Errore: ([\s\S]*)$/,(m,r)=>'Error: '+T(r)],
[/^Inserisci (@\w+) nel prompt$/,(m,t)=>`Insert ${t} into the prompt`],
[/^Nessuna reference con il tag (.+): aggiungila o correggi il nome\.$/,(m,t)=>`No reference with the tag ${t}: add it or fix the name.`],
[/^Nessuna reference collegata con (.+)\.$/,(m,t)=>`No connected reference named ${t}.`],
[/^Questo modello accetta al massimo (\d+) reference\.$/,(m,n)=>`This model accepts at most ${n} references.`],
[/^Aggiunta come reference (@\w*)$/,(m,t)=>`Added as reference ${t}`],
[/^Non riesco a usare questa immagine: ([\s\S]*)$/,(m,e)=>'I can\'t use this image: '+T(e)],
[/^Progetto rinominato in "(.*)"$/,(m,n)=>`Project renamed to "${n}"`],
[/^Eliminare il progetto "(.*)"\?$/,(m,n)=>`Delete the project "${n}"?`],
[/^Le sue (\d+) immagini\/video finiscono nel Cestino del Mac: da lì puoi ancora recuperarlo\.$/,(m,n)=>`Its ${n} images/videos go to the Mac Trash: you can still recover it from there.`],
[/^Finisce nel Cestino del Mac: da lì puoi ancora recuperarlo\.$/,()=>'It goes to the Mac Trash: you can still recover it from there.'],
[/^"(.*)" spostato nel Cestino$/,(m,n)=>`"${n}" moved to the Trash`],
[/^Esiste già un progetto chiamato "(.*)"\.$/,(m,n)=>`A project called "${n}" already exists.`],
[/^Aggiungi (.+)\.$/,(m,x)=>`Add ${T(x.charAt(0).toUpperCase()+x.slice(1)).toLowerCase()}.`],
[/^(.+) · immagine$/,(m,a)=>a+' · image'],
[/^Modello sconosciuto: (.*)$/,(m,x)=>'Unknown model: '+x],[/^Tipo di file non supportato: (.*)$/,(m,x)=>'Unsupported file type: '+x],
[/^Generazione fallita: ([\s\S]*)$/,(m,x)=>'Generation failed: '+T(x)],[/^OpenRouter non ha restituito immagini: ([\s\S]*)$/,(m,x)=>'OpenRouter returned no images: '+x],
[/^OpenRouter ha risposto (\d+): ([\s\S]*)$/,(m,c,x)=>`OpenRouter replied ${c}: `+x.replace('credito OpenRouter esaurito o limite della chiave raggiunto.','OpenRouter credit used up or key limit reached.')
  .replace(' — Di solito è un intoppo temporaneo di OpenRouter: riprova tra qualche minuto. Se continua, controlla il credito su openrouter.ai/settings/credits.',' — This is usually a temporary OpenRouter hiccup: try again in a few minutes. If it keeps happening, check your credit at openrouter.ai/settings/credits.')],
[/^fal ha risposto (\d+): ([\s\S]*)$/,(m,c,x)=>`fal replied ${c}: ${x}`],
[/^Non riesco a caricare il video online \(([\s\S]*)\)$/,(m,x)=>`I couldn't upload the video online (${x})`],
// Canvas
[/^Esegui selezionati \((\d+)\) · (.+)$/,(m,n,c)=>`Run selected (${n}) · ${c}`],
[/^(.*) \*$/,(m,a)=>T(a)+' *'],
[/^Carico… (.+)$/,(m,x)=>'Uploading… '+x],
[/^Tipo non compatibile: (\S+) → (.+)\.$/,(m,t,p)=>`Incompatible type: ${T(t)} → ${T(p)}.`],
[/^(.+): massimo (\d+) per questo modello\.$/,(m,p,n)=>`${T(p)}: at most ${n} for this model.`],
[/^(\d+) collegament[io] rimoss[io]: non compatibil[ie] con il nuovo modello\.$/,(m,n)=>`${n} connection${n==='1'?'':'s'} removed: not compatible with the new model.`],
[/^Il tag (@\w+) esiste già\.$/,(m,t)=>`The tag ${t} already exists.`],
[/^Salvataggio non riuscito: ([\s\S]*)$/,(m,x)=>'Save failed: '+T(x)],[/^Formato non supportato: (.*)$/,(m,x)=>'Unsupported format: '+x],
[/^File non trovato: (.*)$/,(m,x)=>'File not found: '+x],
[/^(@\w+): (.*?) Il nodo resta sulla board\.$/,(m,t,x)=>`${t}: ${T(x)} The node stays on the board.`],
[/^(\d+) nod[io] copiat[io]$/,(m,n)=>`${n} node${n==='1'?'':'s'} copied`],
[/^(@\w+) non ha ancora un risultato: usa "Esegui catena"\.$/,(m,t)=>`${t} has no result yet: use "Run chain".`],
[/^(@\w+): carica un file\.$/,(m,t)=>`${t}: upload a file.`],[/^(@\w+): caricamento in corso\.$/,(m,t)=>`${t}: upload in progress.`],
[/^(Esegui catena|Esegui selezionati): (\d+) nod[io] · costo stimato (\S+)(?: \(\+(\d+) senza stima\))?$/,(m,c,n,v,k)=>`${T(c)}: ${n} node${n==='1'?'':'s'} · estimated cost ${v}${k?` (+${k} without an estimate)`:''}`],
[/^Catena interrotta su (@\w+)\.$/,(m,t)=>`Chain stopped at ${t}.`],
[/^Creato il nodo Reference (@\w+): collegalo a una generazione\.$/,(m,t)=>`Created the Reference node ${t}: connect it to a generation.`],
[/^Creato il nodo Reference (@\w+)\.$/,(m,t)=>`Created the Reference node ${t}.`],
[/^Template "(.*)" salvato( \(solo i nodi selezionati\))?\.$/,(m,n,s)=>`Template "${n}" saved${s?' (selected nodes only)':''}.`],
[/^Creato da "(.*)"$/,(m,n)=>`Created from "${n}"`],
[/^Canvas aggiornata: (\d+) immagini sono ora nodi Reference\.$/,(m,n)=>`Canvas updated: ${n} images are now Reference nodes.`],
];
/* frasi dentro testi misti (dettagli dell'anteprima) */
const SUB=[[/costo reale /g,'actual cost '],[/stimato ~/g,'estimated ~']];
const tr2=r=>r.replace(/^ · /,' · ');
// la lingua scelta è salvata dal server (lingua.txt) e arriva come <html lang>; localStorage è solo una riserva
let lingua=document.documentElement.dataset.lingua||'';if(!lingua)try{lingua=localStorage.getItem('lingua')||''}catch(e){}
lingua=lingua==='en'?'en':'it';
function tr1(s){const t=s.trim();if(!t)return s;let r=EX[t];
  if(r===undefined){for(const [re,f] of PAT){const m=t.match(re);if(m){r=f(...m);break}}}
  return r===undefined?s:s.replace(t,r)}
function tr(s){if(lingua!=='en'||s==null)return s;s=String(s);if(s.includes('\n\n'))return s.split('\n\n').map(tr).join('\n\n');return tr1(s)}
window.tr=tr;

/* ---------- applicazione al DOM (ricorda l'originale per tornare all'italiano) ---------- */
const SALTA='textarea,script,style,.p,.nd-file,#progetto,#lingua,#titolo,.hl,.chip,.prezzo,.op small,[data-noi18n],.tx,.voce small,.ph-eti b,.nd-tag,.fr-testa input';
const ATTR=['placeholder','title','aria-label','label'];
function testo(n){const p=n.parentElement;if(!p||p.closest(SALTA))return;
  if(n.__fatto===undefined||n.nodeValue!==n.__fatto)n.__orig=n.nodeValue;
  let v=n.__orig;if(lingua==='en')v=p.closest('#vistaTesto')?SUB.reduce((a,[re,b])=>a.replace(re,b),v):tr(v);
  n.__fatto=v;if(n.nodeValue!==v)n.nodeValue=v}
function attributi(el){if(el.closest('#progetto,[data-noi18n]'))return;el.__o=el.__o||{};el.__f=el.__f||{};
  for(const a of ATTR){if(!el.hasAttribute(a))continue;const cur=el.getAttribute(a);
    if(el.__f[a]===undefined||cur!==el.__f[a])el.__o[a]=cur;
    const v=lingua==='en'?tr(el.__o[a]):el.__o[a];el.__f[a]=v;if(cur!==v)el.setAttribute(a,v)}}
function applica(radice){if(radice.nodeType===3)return testo(radice);if(radice.nodeType!==1)return;
  attributi(radice);const w=document.createTreeWalker(radice,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
  let n;while((n=w.nextNode()))n.nodeType===3?testo(n):attributi(n)}
new MutationObserver(ms=>{for(const m of ms){
  if(m.type==='characterData')testo(m.target);
  else if(m.type==='attributes')attributi(m.target);
  else m.addedNodes.forEach(applica)}}).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTR});

/* avvisi, conferme e richieste del browser */
const A=window.alert.bind(window),C=window.confirm.bind(window),P=window.prompt.bind(window);
window.alert=m=>A(tr(m));window.confirm=m=>C(tr(m));window.prompt=(m,d)=>P(tr(m),d);

/* ---------- interruttore IT / EN ---------- */
function imposta(l,salva){lingua=l==='en'?'en':'it';document.documentElement.lang=lingua;
  try{localStorage.setItem('lingua',lingua)}catch(e){}
  const sel=document.getElementById('lingua');if(sel)sel.value=lingua;
  applica(document.body);
  if(salva)fetch('/api/lingua',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lingua})}).catch(()=>{})}
{const sel=document.getElementById('lingua');if(sel)sel.onchange=()=>imposta(sel.value,true)}
imposta(lingua,true);
})();
