const root = document.getElementById('publisher-root');
const tr = (fr, en) => document.documentElement.lang === 'en' ? en : fr;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const state = { session: window.JAJSession, drafts: [], draft: null, dirty: false, busy: false, epoch: 0, message: '', error: false };
const allowed = () => state.session?.type === 'user' && state.session.roles?.some(role => ['artist', 'admin'].includes(role));
const isAdmin = () => state.session?.roles?.includes('admin');

function message(code) {
    const messages = {
        loading: ['Chargement…', 'Loading…'], saving: ['Enregistrement…', 'Saving…'],
        saved: ['Brouillon enregistré.', 'Draft saved.'], unsaved: ['Modifications non enregistrées', 'Unsaved changes'],
        unauthorized: ['Ta session a expiré. Reconnecte-toi pour continuer.', 'Your session expired. Sign in again to continue.'],
        forbidden: ['Cet espace est réservé aux comptes ARTIST et ADMIN.', 'This space is reserved for ARTIST and ADMIN accounts.'],
        conflict: ['Ce brouillon a changé dans une autre session. Copie tes modifications, puis recharge-le avant de réessayer.', 'This draft changed in another session. Copy your changes, then reload it before trying again.'],
        service_unavailable: ['Enregistrement indisponible. Tes modifications restent dans cette fenêtre ; réessaie dans un instant.', 'Saving is unavailable. Your changes remain in this window; try again shortly.'],
        not_found: ['Ce brouillon est introuvable ou inaccessible.', 'This draft is missing or inaccessible.'],
        invalid_draft: ['Vérifie les champs : titre, artiste, date et titres des pistes.', 'Check the fields: title, artist, date and track titles.'],
        cover: ['Choisis une image PNG, JPEG ou WebP valide.', 'Choose a valid PNG, JPEG or WebP image.'],
        coverSize: ['La pochette doit faire au maximum 1 Mo.', 'The cover must be 1 MB or smaller.'],
        too_large: ['Ce brouillon est trop volumineux. Réduis la taille de la pochette.', 'This draft is too large. Use a smaller cover.'],
        audioUrl: ['Utilise un lien audio HTTPS ou un chemin medias/.', 'Use an HTTPS audio link or a medias/ path.'],
    };
    return tr(...(messages[code] || messages.service_unavailable));
}

function status(code = '', error = false) {
    state.message = code;
    state.error = error;
    const output = root.querySelector('#publisher-status');
    if (output) {
        output.textContent = code ? message(code) : '';
        output.classList.toggle('error', error);
    }
}

async function api(method = 'GET', data = null, id = '') {
    const response = await fetch(`/api/artist-drafts${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
        method, credentials: 'same-origin', cache: 'no-store',
        headers: { Accept: 'application/json', ...(data ? { 'Content-Type': 'application/json' } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.field === 'coverSize' || body.field === 'cover' || body.field === 'audioUrl' ? body.field : body.error || 'service_unavailable');
    return body;
}

function mayLeave() {
    return !state.dirty || window.confirm(tr('Abandonner les modifications non enregistrées ?', 'Discard unsaved changes?'));
}

function setBusy(value) {
    state.busy = value;
    root.querySelectorAll('fieldset, [data-action="new"], [data-action="refresh"], [data-draft-id]').forEach(el => { el.disabled = value; });
}

async function loadList() {
    if (!allowed() || state.busy) return;
    const epoch = state.epoch;
    setBusy(true);
    status('loading');
    try {
        const result = await api();
        if (epoch !== state.epoch) return;
        state.drafts = result.drafts;
        status();
    } catch (error) {
        if (epoch === state.epoch) status(error.message, true);
    } finally {
        if (epoch === state.epoch) { state.busy = false; render(); }
    }
}

async function loadDraft(id) {
    if (state.busy || !mayLeave()) return;
    const epoch = state.epoch;
    setBusy(true);
    status('loading');
    try {
        const result = await api('GET', null, id);
        if (epoch !== state.epoch) return;
        state.draft = result.draft;
        state.dirty = false;
        status();
    } catch (error) {
        if (epoch === state.epoch) status(error.message, true);
    } finally {
        if (epoch === state.epoch) { state.busy = false; render(); }
    }
}

function newDraft() {
    if (!allowed() || state.busy || !mayLeave()) return;
    state.draft = { id: crypto.randomUUID(), revision: '', title: '', artist: state.session.displayName || '', type: 'album', releaseDate: '', cover: '', tracks: [] };
    state.dirty = false;
    status();
    render();
    root.querySelector('[name="title"]').focus();
}

function markDirty() {
    state.dirty = true;
    status('unsaved');
    renderPreview();
}

async function saveDraft(event) {
    event.preventDefault();
    if (!allowed() || state.busy || !state.draft) return;
    const epoch = state.epoch;
    setBusy(true);
    status('saving');
    try {
        const result = await api('POST', { id: state.draft.id, revision: state.draft.revision, draft: state.draft });
        if (epoch !== state.epoch) return;
        state.draft = result.draft;
        state.dirty = false;
        const { cover, tracks, ...summary } = result.draft;
        state.drafts = [{ ...summary, trackCount: tracks.length }, ...state.drafts.filter(item => item.id !== summary.id)];
        status('saved');
    } catch (error) {
        if (epoch === state.epoch) status(error.message, true);
    } finally {
        if (epoch === state.epoch) { state.busy = false; render(); }
    }
}

function renderPreview() {
    const target = root.querySelector('#publisher-preview');
    const draft = state.draft;
    if (!target || !draft) return;
    target.innerHTML = `
        <div class="publisher-preview-cover">${draft.cover ? `<img src="${esc(draft.cover)}" alt="${esc(tr('Pochette', 'Cover'))}">` : '<span aria-hidden="true">♫</span>'}</div>
        <div class="publisher-badge">${tr('BROUILLON PRIVÉ', 'PRIVATE DRAFT')}</div>
        <h2>${esc(draft.title || tr('Sans titre', 'Untitled'))}</h2>
        <p>${esc(draft.artist || tr('Artiste', 'Artist'))}</p>
        <p class="publisher-muted">${esc(draft.type.toUpperCase())}${draft.releaseDate ? ` · ${esc(draft.releaseDate)}` : ''}</p>
        <ol>${draft.tracks.map(track => `<li><span>${esc(track.title || tr('Piste sans titre', 'Untitled track'))}</span></li>`).join('')}</ol>
        <p class="publisher-muted">${tr('Visible par toi et les administrateurs. Aucune sortie publique à ce stade.', 'Visible to you and administrators. Nothing is published at this stage.')}</p>`;
}

function render() {
    if (!allowed()) {
        root.innerHTML = `<div class="publisher-access"><img src="medias/img/exeimg.png" alt=""><h2>Artist Publisher</h2><p>${message('forbidden')}</p></div>`;
        return;
    }
    const draft = state.draft;
    root.innerHTML = `
        <header class="publisher-header"><img src="medias/img/exeimg.png" alt=""><div><strong>Artist Publisher</strong><p>${tr('Prépare ta prochaine sortie.', 'Prepare your next release.')}</p></div><span class="publisher-badge">${isAdmin() ? 'ADMIN' : 'ARTIST'}</span></header>
        <div class="publisher-toolbar"><button type="button" class="retro-btn" data-action="new">${tr('+ Nouveau brouillon', '+ New draft')}</button><button type="button" class="retro-btn" data-action="refresh">${tr('Actualiser la liste', 'Refresh list')}</button><span id="publisher-status" role="status" aria-live="polite" class="${state.error ? 'error' : ''}">${state.message ? message(state.message) : ''}</span></div>
        <div class="publisher-layout">
            <aside class="publisher-list"><h2>${isAdmin() ? tr('Tous les brouillons', 'All drafts') : tr('Mes brouillons', 'My drafts')}</h2>
                ${state.drafts.length ? state.drafts.map(item => `<button type="button" class="publisher-draft ${draft?.id === item.id ? 'selected' : ''}" data-draft-id="${esc(item.id)}"><strong>${esc(item.title)}</strong><span>${esc(item.artist)} · ${esc(item.type.toUpperCase())}</span><small>${item.trackCount} ${tr('piste(s)', 'track(s)')}${isAdmin() ? ` · ${esc(item.ownerName)}` : ''}</small></button>`).join('') : `<p class="publisher-muted">${tr('Tes idées commencent ici. Crée ton premier brouillon.', 'Your ideas start here. Create your first draft.')}</p>`}
            </aside>
            ${draft ? `<form id="publisher-form" class="publisher-editor"><fieldset ${state.busy ? 'disabled' : ''}>
                <legend>${draft.revision ? tr('Modifier le brouillon', 'Edit draft') : tr('Nouvelle sortie', 'New release')}</legend>
                ${isAdmin() && draft.ownerName ? `<p class="publisher-muted">${tr('Compte propriétaire :', 'Owner account:')} ${esc(draft.ownerName)}</p>` : ''}
                <div class="publisher-fields">
                    <label>${tr('Titre de la sortie', 'Release title')}<input name="title" maxlength="120" required value="${esc(draft.title)}"></label>
                    <label>${tr('Nom de l’artiste', 'Artist name')}<input name="artist" maxlength="80" required value="${esc(draft.artist)}"></label>
                    <label>${tr('Type de sortie', 'Release type')}<select name="type">${['album','ep','single'].map(type => `<option value="${type}" ${type === draft.type ? 'selected' : ''}>${type === 'ep' ? 'EP' : type[0].toUpperCase() + type.slice(1)}</option>`).join('')}</select></label>
                    <label>${tr('Date prévue (facultative)', 'Planned date (optional)')}<input type="date" name="releaseDate" value="${esc(draft.releaseDate)}"></label>
                </div>
                <div class="publisher-cover-input"><label>${tr('Pochette — PNG, JPEG ou WebP, 1 Mo max.', 'Cover — PNG, JPEG or WebP, up to 1 MB')}<input type="file" id="publisher-cover" accept="image/png,image/jpeg,image/webp"></label>${draft.cover ? `<button type="button" class="retro-btn" data-action="remove-cover">${tr('Retirer', 'Remove')}</button>` : ''}</div>
                <h3>${tr('Pistes', 'Tracks')} <small>(${draft.tracks.length}/50)</small></h3>
                <p class="publisher-muted">${tr('Prépare l’ordre et les titres. Un lien audio HTTPS est facultatif pour le brouillon.', 'Prepare the order and titles. An HTTPS audio link is optional for a draft.')}</p>
                <div class="publisher-tracks">${draft.tracks.map((track,index) => `<div class="publisher-track" data-track="${index}"><span class="publisher-track-number">${index+1}</span><div><label>${tr('Titre de la piste', 'Track title')}<input data-track-field="title" maxlength="160" required value="${esc(track.title)}"></label><label>${tr('Lien audio (facultatif)', 'Audio link (optional)')}<input data-track-field="audioUrl" maxlength="2048" placeholder="https://…" value="${esc(track.audioUrl)}"></label></div><div class="publisher-track-actions"><button type="button" class="retro-btn" data-action="up" ${index === 0 ? 'disabled' : ''} aria-label="${tr('Monter la piste', 'Move track up')}">↑</button><button type="button" class="retro-btn" data-action="down" ${index === draft.tracks.length-1 ? 'disabled' : ''} aria-label="${tr('Descendre la piste', 'Move track down')}">↓</button><button type="button" class="retro-btn" data-action="remove-track" aria-label="${tr('Retirer la piste', 'Remove track')}">×</button></div></div>`).join('')}</div>
                <button type="button" class="retro-btn" data-action="add-track" ${draft.tracks.length >= 50 ? 'disabled' : ''}>${tr('+ Ajouter une piste', '+ Add track')}</button>
                <div class="publisher-save"><button type="submit" class="retro-btn publisher-primary">${tr('Enregistrer le brouillon', 'Save draft')}</button>${draft.revision ? `<button type="button" class="retro-btn" data-action="reload">${tr('Recharger', 'Reload')}</button>` : ''}</div>
            </fieldset></form><aside class="publisher-preview-wrap"><h2>${tr('Aperçu', 'Preview')}</h2><div id="publisher-preview"></div></aside>` : `<div class="publisher-empty"><span aria-hidden="true">♫</span><h2>${tr('De l’idée à la sortie.', 'From idea to release.')}</h2><p>${tr('Rassemble la pochette, les titres et les premières pistes dans un brouillon privé.', 'Bring your cover, titles and first tracks together in a private draft.')}</p><button type="button" class="retro-btn" data-action="new">${tr('Créer un brouillon', 'Create a draft')}</button></div>`}
        </div>`;
    renderPreview();
    setBusy(state.busy);
}

root.addEventListener('input', event => {
    if (!state.draft || state.busy) return;
    const target = event.target;
    if (target.dataset.trackField) {
        state.draft.tracks[Number(target.closest('[data-track]').dataset.track)][target.dataset.trackField] = target.value;
    } else if (['title','artist','type','releaseDate'].includes(target.name)) {
        state.draft[target.name] = target.value;
    } else return;
    markDirty();
});

root.addEventListener('change', async event => {
    if (event.target.id !== 'publisher-cover' || !state.draft || state.busy) return;
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) { status('cover', true); return; }
    if (file.size > 1024 * 1024) { status('coverSize', true); return; }
    const epoch = state.epoch;
    const id = state.draft.id;
    setBusy(true);
    status('loading');
    try {
        const cover = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        if (epoch !== state.epoch || state.draft?.id !== id) return;
        state.draft.cover = cover;
        markDirty();
    } catch {
        if (epoch === state.epoch) status('cover', true);
    } finally {
        if (epoch === state.epoch) { state.busy = false; render(); }
    }
});

root.addEventListener('submit', saveDraft);
root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || !allowed() || state.busy) return;
    if (button.dataset.draftId) { void loadDraft(button.dataset.draftId); return; }
    const action = button.dataset.action;
    if (action === 'new') return newDraft();
    if (action === 'refresh') { void loadList(); return; }
    if (!state.draft) return;
    if (action === 'reload') { void loadDraft(state.draft.id); return; }
    const index = Number(button.closest('[data-track]')?.dataset.track);
    if (action === 'add-track' && state.draft.tracks.length < 50) state.draft.tracks.push({ title:'', audioUrl:'' });
    else if (action === 'remove-cover') state.draft.cover = '';
    else if (action === 'remove-track') state.draft.tracks.splice(index, 1);
    else if (action === 'up' || action === 'down') {
        const next = index + (action === 'up' ? -1 : 1);
        if (next < 0 || next >= state.draft.tracks.length) return;
        [state.draft.tracks[index], state.draft.tracks[next]] = [state.draft.tracks[next], state.draft.tracks[index]];
    } else return;
    markDirty();
    render();
});

function sessionChanged() {
    state.epoch++;
    state.session = window.JAJSession;
    state.drafts = [];
    state.draft = null;
    state.dirty = false;
    state.busy = false;
    state.message = '';
    state.error = false;
    document.querySelectorAll('.publisher-entry').forEach(el => { el.hidden = !allowed(); });
    render();
    if (allowed() && document.getElementById('win-publisher').style.display === 'block') void loadList();
}

window.addEventListener('jaj:session-changed', sessionChanged);
window.addEventListener('aq:publisher-open', () => { if (!state.draft) void loadList(); });
window.addEventListener('aq:language-changed', render);
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
sessionChanged();
