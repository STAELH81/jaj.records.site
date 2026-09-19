const tr = (fr,en) => document.documentElement.lang === 'en' ? en : fr;
const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dialog = document.createElement('dialog');
dialog.id = 'artist-profile-dialog';
dialog.setAttribute('aria-labelledby','artist-profile-title');
document.body.appendChild(dialog);
const state = { artists:[], selected:'', profile:null, busy:false, dirty:false, epoch:0, status:'', error:false };
const allowed = () => window.JAJSession?.type === 'user' && window.JAJSession.roles?.some(r=>['artist','admin'].includes(r));
function text(code) {
    const labels = {
        loading:['Chargement…','Loading…'],saving:['Publication du profil…','Publishing profile…'],
        saved:['Profil publié.','Profile published.'],unsaved:['Modifications non publiées','Unpublished changes'],
        conflict:['Le profil a changé dans une autre session. Copie tes modifications puis recharge les profils.','This profile changed in another session. Copy your changes, then reload profiles.'],
        cover:['Choisis un avatar PNG, JPEG ou WebP valide.','Choose a valid PNG, JPEG or WebP avatar.'],
        coverSize:['L’avatar doit faire au maximum 1 Mo.','The avatar must be 1 MB or smaller.'],
        invalid_profile:['La bio doit faire au maximum 2 000 caractères.','The bio must be 2,000 characters or fewer.'],
        unauthorized:['Reconnecte-toi pour modifier ton profil.','Sign in again to edit your profile.'],
        forbidden:['Cet espace est réservé aux artistes et administrateurs.','This area is for artists and administrators.'],
        not_found:['Ce profil est introuvable ou inaccessible.','This profile is missing or inaccessible.'],
        service_unavailable:['Publication indisponible. Tes modifications restent dans cette fenêtre.','Publishing is unavailable. Your changes remain in this window.'],
    };
    return tr(...(labels[code] || labels.service_unavailable));
}
async function api(body) {
    const response = await fetch('/api/artist-profiles', { method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',
        headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}) });
    const data = await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error || 'service_unavailable');
    return data;
}
function mayLeave() { return !state.dirty || window.confirm(tr('Abandonner les modifications du profil non publiées ?','Discard unpublished profile changes?')); }
function status(code='',error=false) {
    state.status=code; state.error=error;
    const node=dialog.querySelector('[role="status"]');
    if(node){node.textContent=code?text(code):'';node.classList.toggle('error',error);}
}
function busy(value) { state.busy=value; dialog.querySelectorAll('fieldset, [data-profile-action="reload"], [data-profile-action="close"]').forEach(el=>el.disabled=value); }
function select(id) {
    state.selected=id;
    const artist=state.artists.find(a=>a.id===id);
    state.profile=artist?{bio:'',avatar:'',revision:'',...artist.profile}:null;
    state.dirty=false;status();render();
}
async function load() {
    if(!allowed() || state.busy || !mayLeave())return;
    const epoch=state.epoch;
    busy(true);status('loading');
    try {
        const data=await api();if(epoch!==state.epoch)return;
        state.artists=data.artists;
        select(state.artists.some(a=>a.id===state.selected)?state.selected:state.artists[0]?.id || '');
    }catch(error){if(epoch===state.epoch)status(error.message,true);}
    finally{if(epoch===state.epoch){state.busy=false;render();}}
}
function renderPreview() {
    const node=dialog.querySelector('.artist-editor-preview'),artist=state.artists.find(a=>a.id===state.selected);
    if(!node||!artist)return;
    node.innerHTML=`${state.profile.avatar?`<img class="artist-avatar" src="${esc(state.profile.avatar)}" alt="${esc(tr('Avatar','Avatar'))}">`:`<div class="artist-avatar artist-initial" aria-hidden="true">${esc(artist.name.slice(0,1).toUpperCase())}</div>`}<h3>${esc(artist.name)}</h3><p class="artist-bio">${esc(state.profile.bio || tr('La bio apparaîtra ici.','Your bio will appear here.'))}</p>`;
}
function render() {
    const artist=state.artists.find(a=>a.id===state.selected);
    dialog.innerHTML=`<div class="title-bar"><span id="artist-profile-title">${tr('Pages artistes','Artist pages')}</span><button type="button" class="retro-btn" data-profile-action="close" aria-label="${tr('Fermer','Close')}">×</button></div>
        <div class="artist-editor-body"><p>${tr('Publie une bio et un avatar sur ta page dans AQ-Navigator. Les visiteurs y retrouveront tes sorties publiques.','Publish a bio and avatar on your AQ-Navigator page. Visitors will find your public releases there.')}</p>
        <div class="artist-editor-toolbar"><button type="button" class="retro-btn" data-profile-action="reload">${tr('Recharger les profils','Reload profiles')}</button><span role="status" aria-live="polite" class="${state.error?'error':''}">${state.status?text(state.status):''}</span></div>
        ${artist?`<form id="artist-profile-form"><fieldset ${state.busy?'disabled':''}><label>${tr('Page à modifier','Page to edit')}<select name="artistId">${state.artists.map(a=>`<option value="${esc(a.id)}" ${a.id===artist.id?'selected':''}>${esc(a.name)}${a.ownerName?` — ${esc(a.ownerName)}`:''}${a.id==='cha'?tr(' (archives)',' (archives)'):''}</option>`).join('')}</select></label>
        <div class="artist-editor-grid"><div><label>${tr('Bio — 2 000 caractères maximum','Bio — up to 2,000 characters')}<textarea name="bio" rows="7" maxlength="2000">${esc(state.profile.bio)}</textarea></label>
        <label>${tr('Avatar — PNG, JPEG ou WebP, 1 Mo max.','Avatar — PNG, JPEG or WebP, up to 1 MB')}<input type="file" name="avatar" accept="image/png,image/jpeg,image/webp"></label>
        ${state.profile.avatar?`<button type="button" class="retro-btn" data-profile-action="remove-avatar">${tr('Retirer l’avatar','Remove avatar')}</button>`:''}
        <p class="publisher-muted">${tr('La bio et l’avatar deviennent publics quand tu publies le profil. Le nom vient de tes sorties enregistrées.','Your bio and avatar become public when you publish the profile. The name comes from your saved releases.')}</p></div><aside class="artist-editor-preview" aria-label="${tr('Aperçu du profil','Profile preview')}"></aside></div>
        <div class="artist-editor-toolbar"><button type="submit" class="retro-btn publisher-primary">${tr('Publier le profil','Publish profile')}</button>${state.profile.revision||window.AQCatalog?.getArtist(artist.id)?`<button type="button" class="retro-btn" data-profile-action="open">${tr('Voir la page artiste','View artist page')}</button>`:''}</div></fieldset></form>`:`<p class="publisher-muted">${tr('Enregistre un premier brouillon dans Artist Publisher pour créer ta page artiste.','Save your first draft in Artist Publisher to create your artist page.')}</p>`}</div>`;
    renderPreview();busy(state.busy);
}
document.addEventListener('click',event=>{
    if(!event.target.closest('[data-action="artist-profiles"]')||!allowed())return;
    render();if(!dialog.open)dialog.showModal();void load();
});
dialog.addEventListener('input',event=>{
    if(event.target.name!=='bio'||state.busy||!state.profile)return;
    state.profile.bio=event.target.value;state.dirty=true;status('unsaved');renderPreview();
});
dialog.addEventListener('change',async event=>{
    if(state.busy)return;
    if(event.target.name==='artistId'){
        if(mayLeave())select(event.target.value);else event.target.value=state.selected;
        return;
    }
    if(event.target.name!=='avatar'||!state.profile)return;
    const file=event.target.files?.[0];if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status('cover',true);return;}
    if(file.size>1024*1024){status('coverSize',true);return;}
    const epoch=state.epoch;busy(true);
    try {
        const avatar=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});
        if(epoch!==state.epoch)return;
        state.profile.avatar=avatar;state.dirty=true;status('unsaved');
    }catch(_){if(epoch===state.epoch)status('cover',true);}
    finally{if(epoch===state.epoch){state.busy=false;render();}}
});
dialog.addEventListener('submit',async event=>{
    event.preventDefault();if(state.busy||!state.profile||!allowed())return;
    const epoch=state.epoch;busy(true);status('saving');
    try{
        const {profile}=await api({artistId:state.selected,revision:state.profile.revision,profile:state.profile});
        if(epoch!==state.epoch)return;
        state.profile=profile;state.dirty=false;
        state.artists.find(a=>a.id===state.selected).profile=profile;
        await window.AQCatalog?.refresh();if(epoch===state.epoch)status('saved');
    }catch(error){if(epoch===state.epoch)status(error.message,true);}
    finally{if(epoch===state.epoch){state.busy=false;render();}}
});
dialog.addEventListener('click',event=>{
    if(state.busy)return;
    const action=event.target.closest('[data-profile-action]')?.dataset.profileAction;
    if(action==='close'&&mayLeave()){state.dirty=false;dialog.close();}
    if(action==='reload')void load();
    if(action==='remove-avatar'){state.profile.avatar='';state.dirty=true;status('unsaved');render();}
    if(action==='open'&&mayLeave()){
        state.dirty=false;dialog.close();window.openWindow('win-ie','task-ie');window.setIEPage(`artist:${state.selected}`);
    }
});
dialog.addEventListener('cancel',event=>{if(state.busy||!mayLeave())event.preventDefault();else state.dirty=false;});
window.addEventListener('aq:language-changed',()=>{if(dialog.open)render();});
window.addEventListener('jaj:session-changed',()=>{
    state.epoch++;state.artists=[];state.profile=null;state.selected='';state.dirty=false;state.busy=false;state.status='';state.error=false;
    dialog.close();dialog.replaceChildren();
});
window.addEventListener('beforeunload',event=>{if(state.dirty){event.preventDefault();event.returnValue='';}});
