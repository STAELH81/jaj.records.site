const tr=(fr,en)=>document.documentElement.lang==='en'?en:fr;
const params=new URLSearchParams(location.search);
const requests=['artist','release'].filter(key=>params.has(key));
let pending=requests.length>0;
let opening=false;
const dialog=document.createElement('dialog');
dialog.id='aq-share-dialog';dialog.setAttribute('aria-label','Partager / Share');
dialog.innerHTML='<form method="dialog"><button class="retro-btn" aria-label="Fermer / Close">×</button></form><h2></h2><p></p><input readonly aria-label="Lien / Link"><button type="button" class="retro-btn" data-copy></button><span role="status" aria-live="polite"></span>';
document.body.append(dialog);
const input=dialog.querySelector('input'),copy=dialog.querySelector('[data-copy]'),status=dialog.querySelector('[role=status]');
function labels(){
 document.querySelectorAll('[data-share-kind],#aq-player-share').forEach(button=>button.textContent=tr('Partager','Share'));
 dialog.querySelector('h2').textContent=tr('Partager un lien','Share a link');
 copy.textContent=tr('Copier le lien','Copy link');
}
function showLink(kind,id){
 const item=kind==='artist'?window.AQCatalog.getArtist(id):window.AQCatalog.getRelease(id);
 if(!item)return;
 const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set(kind,id);
 labels();input.hidden=false;copy.hidden=false;input.value=url.href;status.textContent='';
 dialog.querySelector('p').textContent=item.title||item.name;
 dialog.showModal();input.focus();input.select();
}
copy.addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(input.value);status.textContent=tr('Lien copié.','Link copied.');}
 catch(_){input.focus();input.select();status.textContent=tr('Copie le lien sélectionné avec Ctrl+C ou le menu de ton appareil.','Copy the selected link with Ctrl+C or your device menu.');}
});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-share-kind]');
 if(button)showLink(button.dataset.shareKind,button.dataset.shareId);
});
const playerButton=document.createElement('button');playerButton.type='button';playerButton.id='aq-player-share';playerButton.className='aqmp-tool-pill';
playerButton.addEventListener('click',()=>showLink('release',window.AQPlayerCatalog.getCurrentReleaseId()));
document.getElementById('aqmp-toolbar')?.append(playerButton);
async function openIncoming(){
 if(!pending||opening||!window.JAJSessionReady||!['guest','user'].includes(window.JAJSession?.type))return;
 opening=true;
 const session=window.JAJSession;
 const kind=requests[0],id=params.get(kind);
 const valid=requests.length===1&&params.getAll(kind).length===1&&!!id;
 const find=()=>kind==='artist'?window.AQCatalog.getArtist(id):window.AQCatalog.getRelease(id);
 if(valid&&!find())await window.AQCatalog.refresh();
 opening=false;
 if(session!==window.JAJSession){void openIncoming();return;}
 pending=false;
 if(!valid||!find()){
  labels();dialog.querySelector('p').textContent=tr('Cette page est introuvable ou n’est plus publique. Actualise la page pour réessayer.','This page is unavailable or no longer public. Refresh the page to try again.');
  input.hidden=true;copy.hidden=true;status.textContent='';dialog.showModal();return;
 }
 window.openWindow('win-ie','task-ie');window.setIEPage(`${kind}:${id}`);
}
window.addEventListener('jaj:session-changed',()=>{dialog.close();void openIncoming();});
window.addEventListener('aq:language-changed',labels);
window.addEventListener('aq:catalog-updated',labels);
// Navigator renders pages dynamically, so label its buttons when their content changes.
new MutationObserver(labels).observe(document.getElementById('ie-content-box'),{childList:true});
const mailButton=document.createElement('button');mailButton.type='button';mailButton.className='retro-btn';mailButton.textContent=tr('Partager par AQ-Mail','Share via AQ-Mail');dialog.append(mailButton);
mailButton.addEventListener('click',()=>{const title=dialog.querySelector('p').textContent;dialog.close();window.AQMail?.compose({subject:title.slice(0,120),text:input.value});});
window.addEventListener('aq:language-changed',()=>{mailButton.textContent=tr('Partager par AQ-Mail','Share via AQ-Mail');});
new MutationObserver(()=>{mailButton.hidden=input.hidden;}).observe(input,{attributes:true,attributeFilter:['hidden']});
labels();void openIncoming();
