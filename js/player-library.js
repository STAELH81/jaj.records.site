import AQCatalog from './catalog.js';

const tr = (fr, en) => document.documentElement.lang === 'en' ? en : fr;
const blank = () => ({ revision: '', playlists: [], favorites: [] });
const state = { library: blank(), selected: 'favorites', shared: null, epoch: 0, shareEpoch: 0, busy: false, loaded: false, status: '', error: false, query: '' };
const userId = () => window.JAJSession?.type === 'user' ? window.JAJSession.id : null;
const same = (a, b) => a.releaseId === b.releaseId && a.trackId === b.trackId;
const root = document.createElement('section');
root.id = 'aqmp-playlists-view'; root.className = 'aqmp-view';
document.getElementById('aqmp-stage').append(root);
function el(tag, text = '', className = '') { const node = document.createElement(tag); node.textContent = text; node.className = className; return node; }
function button(text, callback, disabled = false) { const node = el('button', text, 'retro-btn'); node.type = 'button'; node.disabled = disabled || state.busy; node.addEventListener('click', callback); return node; }
function resolve(ref) {
    const release = AQCatalog.getRelease(ref.releaseId);
    const track = release?.tracks.find(item => item.id === ref.trackId);
    return { release, track, artist: AQCatalog.getArtist(release?.artistId)?.name || '', playable: !!track?.audio && ['full', 'snippet'].includes(track.availability) };
}
function message(code) {
    const messages = {
        unauthorized: ['Connecte-toi pour sauvegarder tes playlists.', 'Sign in to save your playlists.'],
        conflict: ['La bibliothèque a changé ailleurs. Actualise avant de réessayer.', 'Your library changed elsewhere. Refresh before trying again.'],
        not_found: ['Cette playlist est privée, supprimée ou introuvable.', 'This playlist is private, deleted or unavailable.'],
        invalid_library: ['Limite atteinte : 50 playlists, 200 pistes par playlist, 500 favoris. Vérifie aussi le nom.', 'Limit reached: 50 playlists, 200 tracks per playlist, 500 favorites. Also check the name.'],
        unavailable: ['Aucune piste disponible à lire.', 'No available tracks to play.'],
        too_large: ['La bibliothèque est trop volumineuse. Retire des pistes avant de réessayer.', 'The library is too large. Remove tracks before trying again.'],
    };
    return tr(...(messages[code] || ['Connexion indisponible. Tes données sauvegardées sont conservées ; réessaie.', 'Connection unavailable. Your saved data is preserved; try again.']));
}
function status(text, error = false) { state.status = text; state.error = error; const node = root.querySelector('[role="status"]'); if (node) { node.textContent = text; node.classList.toggle('error', error); } }
async function api(query = '', body = null) {
    const response = await fetch('/api/player-library' + query, { method: body ? 'PUT' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000), headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'service_unavailable');
    if (query ? !Array.isArray(data.playlist?.tracks) : !Array.isArray(data.library?.playlists) || !Array.isArray(data.library?.favorites)) throw new Error('service_unavailable');
    return data;
}
async function load() {
    if (!userId() || state.busy) { render(); return; }
    const epoch = state.epoch;
    state.busy = true; render(); status(tr('Chargement…', 'Loading…'));
    try { const data = await api(); if (epoch !== state.epoch) return; state.library = data.library; state.loaded = true; status(tr('Bibliothèque synchronisée.', 'Library synced.')); }
    catch (error) { if (epoch === state.epoch) status(message(error.message), true); }
    finally { if (epoch === state.epoch) { state.busy = false; render(); } }
}
async function mutate(change) {
    if (!userId() || !state.loaded || state.busy) return false;
    const epoch = state.epoch, next = structuredClone(state.library);
    change(next);
    state.busy = true;
    root.querySelectorAll('button, input').forEach(node => { node.disabled = true; });
    status(tr('Sauvegarde…', 'Saving…'));
    try {
        const data = await api('', { revision: state.library.revision, library: next });
        if (epoch !== state.epoch) return false;
        state.library = data.library;
        status(tr('Sauvegardé sur ton compte.', 'Saved to your account.'));
        return true;
    } catch (error) { if (epoch === state.epoch) status(message(error.message), true); return false; }
    finally { if (epoch === state.epoch) { state.busy = false; render(); } }
}
function selected() {
    if (state.selected === 'shared') return state.shared?.playlist;
    if (state.selected === 'favorites') return { name: tr('Mes favoris', 'My favorites'), tracks: state.library.favorites };
    return state.library.playlists.find(item => item.id === state.selected);
}
function play(ref = null) {
    const list = selected();
    if (!list || !window.AQPlayerCatalog.playQueue(list.tracks, list.name, ref)) status(message('unavailable'), true);
}
function editTracks(change) {
    return mutate(library => change(state.selected === 'favorites' ? library.favorites : library.playlists.find(item => item.id === state.selected).tracks));
}
function favorite(ref) {
    return mutate(library => { const index = library.favorites.findIndex(item => same(item, ref)); if (index < 0) library.favorites.push(ref); else library.favorites.splice(index, 1); });
}
function shareURL(playlist) { return `${location.origin}/?aqPlaylist=${encodeURIComponent(userId() + '/' + playlist.id)}`; }
async function openShared(value) {
    const parts = String(value || '').split('/');
    if (parts.length !== 2 || !parts.every(part => /^[\w-]{1,120}$/.test(part))) return;
    const epoch = state.epoch;
    const shareEpoch = ++state.shareEpoch;
    state.shared = null; state.selected = 'shared';
    window.openWindow?.('win-player', 'task-player'); window.AQPlayerCatalog.showPlaylists();
    status(tr('Ouverture de la playlist…', 'Opening playlist…'));
    try {
        const data = await api(`?owner=${encodeURIComponent(parts[0])}&playlist=${encodeURIComponent(parts[1])}`);
        if (epoch !== state.epoch || shareEpoch !== state.shareEpoch) return;
        state.shared = data; status(''); render();
    } catch (error) { if (epoch === state.epoch && shareEpoch === state.shareEpoch) { status(message(error.message), true); render(); } }
}
function render() {
    root.replaceChildren();
    const allowed = !!userId() && state.loaded && !state.busy;
    const layout = el('div', '', 'aqpl-layout'), aside = el('aside', '', 'aqpl-nav'), main = el('div', '', 'aqpl-main');
    const header = el('div', '', 'aqpl-heading'); header.append(el('strong', 'AQ-Player++'), el('span', tr('Ta musique. Tes sélections.', 'Your music. Your mixes.')));
    const toolbar = el('div', '', 'aqpl-toolbar');
    toolbar.append(button(tr('Actualiser', 'Refresh'), () => void load(), !userId()));
    const notice = el('p', state.status, `aqpl-status${state.error ? ' error' : ''}`); notice.setAttribute('role', 'status');
    root.append(header, toolbar, notice);
    if (!userId()) root.append(el('p', tr('Connecte-toi pour créer des playlists et retrouver tes favoris sur tes appareils. Les playlists partagées restent écoutables en invité.', 'Sign in to create playlists and access favorites across your devices. Shared playlists can be played as a guest.'), 'aqpl-guest'));
    const nav = (name, id) => { const node = button(name, () => { state.selected = id; render(); }); node.classList.toggle('selected', state.selected === id); aside.append(node); };
    nav('♥ ' + tr('Mes favoris', 'My favorites'), 'favorites');
    state.library.playlists.forEach(item => nav(item.name, item.id));
    if (state.shared) nav('↗ ' + state.shared.playlist.name, 'shared');
    const create = el('form', '', 'aqpl-create');
    const name = el('input'); name.placeholder = tr('Nom de la playlist', 'Playlist name'); name.setAttribute('aria-label', name.placeholder); name.maxLength = 80; name.required = true; name.disabled = !allowed;
    const createButton = button(tr('+ Créer', '+ Create'), () => {}, !allowed); createButton.type = 'submit';
    create.append(name, createButton); aside.append(create);
    create.addEventListener('submit', async event => { event.preventDefault(); const value = name.value.trim(); if (!value) return; const id = crypto.randomUUID(); if (await mutate(library => library.playlists.push({id, name:value, visibility:'private', tracks:[]}))) { state.selected = id; render(); } });
    const list = selected();
    if (!list) main.append(el('p', tr('Sélectionne ou crée une playlist.', 'Select or create a playlist.')));
    else {
        main.append(el('h2', list.name));
        main.append(el('p', `${list.tracks.length} ${tr('pistes', 'tracks')} · ${state.selected === 'shared' ? state.shared.ownerName : list.visibility === 'public' ? tr('Accessible par lien', 'Accessible by link') : tr('Privé', 'Private')}`, 'aqpl-meta'));
        const actions = el('div', '', 'aqpl-toolbar');
        actions.append(button('▶ ' + tr('Écouter', 'Play'), () => play(), !list.tracks.some(ref => resolve(ref).playable)));
        const current = window.AQPlayerCatalog.getCurrentTrack();
        if (current && state.selected !== 'shared') {
            const ref = {releaseId:current.releaseId, trackId:current.id};
            actions.append(button(tr('+ Piste en cours', '+ Current track'), () => void editTracks(tracks => tracks.push(ref)), !allowed || list.tracks.some(item => same(item,ref))));
        }
        if (state.selected === 'shared') actions.append(button(tr('Copier dans mes playlists', 'Copy to my playlists'), async () => {
            const copy = { ...structuredClone(list), id: crypto.randomUUID(), visibility:'private' };
            if (await mutate(library => library.playlists.push(copy))) { state.selected = copy.id; render(); }
        }, !allowed));
        else if (list.id) {
            const rename = el('input'); rename.value = list.name; rename.maxLength = 80; rename.setAttribute('aria-label', tr('Renommer la playlist', 'Rename playlist')); rename.disabled = !allowed;
            actions.append(rename, button(tr('Renommer', 'Rename'), () => { const value = rename.value.trim(); if (value) void mutate(library => { library.playlists.find(item => item.id === list.id).name = value; }); }, !allowed));
            actions.append(button(list.visibility === 'public' ? tr('Rendre privée', 'Make private') : tr('Rendre partageable', 'Make shareable'), () => void mutate(library => { library.playlists.find(item => item.id === list.id).visibility = list.visibility === 'public' ? 'private' : 'public'; }), !allowed));
            actions.append(button(tr('Supprimer', 'Delete'), async () => { if (!confirm(tr('Supprimer cette playlist ?', 'Delete this playlist?'))) return; if (await mutate(library => { library.playlists = library.playlists.filter(item => item.id !== list.id); })) { state.selected = 'favorites'; render(); } }, !allowed));
            if (list.visibility === 'public') {
                actions.append(button(tr('Copier le lien', 'Copy link'), async () => { try { await navigator.clipboard.writeText(shareURL(list)); status(tr('Lien copié.', 'Link copied.')); } catch { status(tr('Copie le lien ci-dessous.', 'Copy the link below.')); } }, !allowed));
                actions.append(button(tr('Partager sur MySpace', 'Share on MySpace'), () => window.dispatchEvent(new CustomEvent('aq:myspace-compose', {detail: `${list.name}\n${shareURL(list)}`})), !allowed));
                const link = el('input'); link.readOnly = true; link.value = shareURL(list); link.setAttribute('aria-label', tr('Lien de partage', 'Share link')); actions.append(link);
            }
        }
        main.append(actions);
        if (!list.tracks.length) main.append(el('p', tr('Ajoute tes premières pistes depuis le catalogue ci-dessous.', 'Add your first tracks from the catalog below.'), 'aqpl-empty'));
        const rows = el('ol', '', 'aqpl-tracks');
        list.tracks.forEach((ref, index) => {
            const info = resolve(ref), row = el('li');
            const title = `${info.track?.title || tr('Piste indisponible', 'Unavailable track')} · ${info.artist || ref.releaseId}`;
            row.append(button(title, () => play(ref), !info.playable));
            if (!info.playable) row.append(el('small', tr('Indisponible', 'Unavailable')));
            if (info.track?.availability === 'snippet') row.append(el('small', tr('Extrait', 'Snippet')));
            if (state.selected !== 'shared') {
                row.append(button('↑', () => void editTracks(tracks => { [tracks[index-1], tracks[index]] = [tracks[index], tracks[index-1]]; }), !allowed || index === 0));
                row.append(button('↓', () => void editTracks(tracks => { [tracks[index+1], tracks[index]] = [tracks[index], tracks[index+1]]; }), !allowed || index === list.tracks.length-1));
                row.append(button(tr('Retirer', 'Remove'), () => void editTracks(tracks => { tracks.splice(index, 1); }), !allowed));
            }
            const liked = state.library.favorites.some(item => same(item, ref));
            const heart = button(liked ? '♥' : '♡', () => void favorite(ref), !allowed); heart.setAttribute('aria-label', tr('Favori : ', 'Favorite: ') + title); heart.setAttribute('aria-pressed', String(liked)); row.append(heart);
            rows.append(row);
        });
        main.append(rows);
    }
    layout.append(aside, main); root.append(layout);
    if (state.selected !== 'shared') {
        const picker = el('section', '', 'aqpl-picker'); picker.append(el('h3', tr('Ajouter depuis le catalogue', 'Add from catalog')));
        const search = el('input'); search.type = 'search'; search.placeholder = tr('Rechercher une piste, un artiste…', 'Search tracks, artists…'); search.setAttribute('aria-label', search.placeholder); search.value = state.query;
        const results = el('div', '', 'aqpl-results');
        function searchTracks() {
            state.query = search.value;
            results.replaceChildren(); let count = 0;
            AQCatalog.getReleases().forEach(release => (release.tracks || []).forEach(track => {
                const ref = {releaseId:release.id, trackId:track.id}, info = resolve(ref);
                if (!info.playable || !`${track.title} ${info.artist} ${release.title}`.toLowerCase().includes(state.query.toLowerCase())) return;
                if (++count > 40) return;
                const row = el('div', '', 'aqpl-result'); row.append(el('span', `${track.title} · ${info.artist} — ${release.title}${track.availability === 'snippet' ? tr(' (extrait)', ' (snippet)') : ''}`));
                const included = list?.tracks.some(item => same(item, ref));
                row.append(button(included ? '✓' : '+', () => void editTracks(tracks => tracks.push(ref)), !allowed || !list || included)); results.append(row);
            }));
            if (!count) results.append(el('p', tr('Aucune piste disponible.', 'No available tracks.')));
            if (count > 40) results.append(el('p', tr('Affichage limité à 40 pistes : précise ta recherche.', 'Showing 40 tracks: refine your search.')));
        }
        search.addEventListener('input', searchTracks); picker.append(search, results); root.append(picker); searchTracks();
    }
}
window.addEventListener('aq:playlists-open', () => { if (!state.loaded && !state.busy && userId()) void load(); else render(); });
window.addEventListener('jaj:session-changed', () => {
    state.epoch++; state.shareEpoch++; state.library = blank(); state.loaded = false; state.busy = false; state.selected = 'favorites'; state.shared = null; state.status = ''; state.error = false; state.query = ''; render();
    void load();
    const link = new URL(location.href).searchParams.get('aqPlaylist'); if (link) void openShared(link);
});
window.addEventListener('aq:language-changed', render);
window.addEventListener('aq:catalog-updated', render);
window.AQPlayerLibrary = { openShared, getState: () => structuredClone(state) };
render();
