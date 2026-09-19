// JAJ Records / Aquerty AQ-NEO — Phase 6 dynamic catalogue
// Single source of truth for artists, releases and tracks.

const CATALOG_VERSION = 1;

const catalog = {
    version: CATALOG_VERSION,
    label: {
        id: 'jaj-records',
        name: 'JAJ Records'
    },
    defaultReleaseId: 'cha-dual-2026',
    artists: [
        {
            id: 'cha',
            name: 'Cha',
            slug: 'cha'
        }
    ],
    releases: [
        {
            id: 'cha-dual-2026',
            slug: 'dual',
            artistId: 'cha',
            title: 'Dual',
            type: 'album',
            year: 2026,
            label: 'JAJ Records',
            status: 'archive',
            cover: 'medias/img/albumimg.png',
            copyright: '© 2026 JAJ Records',
            navigatorNotes: (isEn) => `                    <p><strong>Hey!</strong> ${isEn ? 'Thanks for taking the time to read this.' : 'Merci de prendre le temps de lire ceci.'}</p>
                    <p>
                        ${isEn
                            ? 'Originally, this album was meant to be a collection of all my SoundCloud releases. Then I recovered older projects (thanks Clancy &lt;3), and putting everything together made more sense.'
                            : "À l'origine, cet album devait être une collection de toutes mes sorties SoundCloud. Puis j'ai récupéré d'anciens projets (merci Clancy &lt;3), et les réunir dans un seul ensemble faisait beaucoup plus sens."}
                    </p>
                    <p>
                        ${isEn
                            ? "The name <strong>Dual</strong> is about duality: identity, daily choices and two possible paths."
                            : "Le nom <strong>Dual</strong> parle de dualité : identité, choix du quotidien et deux chemins possibles."}
                    </p>
                    <p><strong>LRJR</strong> = <em>Lost Records of JAJ Records</em> : ${isEn ? 'lost recordings, experiments and sketches.' : 'enregistrements perdus, expérimentations et essais.'}</p>
                    <p><strong>${isEn ? 'System key' : 'Clé système'} :</strong> <span style="color:#000080;font-weight:bold;">NdZkLa</span></p>
`,
            tracks: [
                { id: 'dual-01', number: 1, title: 'Just Not Enough For It (Remastered)', availability: 'unavailable' },
                { id: 'dual-02', number: 2, title: 'Feelings Of Nostalgia', availability: 'full', audio: 'medias/musique/sorti/01.mp3' },
                { id: 'dual-03', number: 3, title: 'The Lobby', availability: 'unavailable' },
                { id: 'dual-04', number: 4, title: 'LRJR_3', availability: 'full', audio: 'medias/musique/sorti/03.mp3' },
                { id: 'dual-05', number: 5, title: 'Reverie', availability: 'snippet', audio: 'medias/musique/snippets/04_prev.mp3' },
                { id: 'dual-06', number: 6, title: 'Warsaw', availability: 'full', audio: 'medias/musique/sorti/05.mp3' },
                { id: 'dual-07', number: 7, title: 'Just Not Enough For It (Speech Intro)', availability: 'unavailable' },
                { id: 'dual-08', number: 8, title: 'LRJR_1 / Figured Out', availability: 'snippet', audio: 'medias/musique/snippets/15_prev.mp3' },
                { id: 'dual-09', number: 9, title: 'Cloudy Awakening', availability: 'unavailable' },
                { id: 'dual-10', number: 10, title: 'LRJR_2', availability: 'full', audio: 'medias/musique/sorti/07.mp3' },
                { id: 'dual-11', number: 11, title: "The Red Willow Hotel's Lounge", availability: 'full', audio: 'medias/musique/sorti/08.mp3' },
                { id: 'dual-12', number: 12, title: 'Inconsistent Use Of Tabs', availability: 'unavailable' },
                { id: 'dual-13', number: 13, title: 'The Emergency', availability: 'full', audio: 'medias/musique/sorti/10.mp3' },
                { id: 'dual-14', number: 14, title: 'Huxley', availability: 'unavailable' },
                { id: 'dual-15', number: 15, title: 'LRJR_4', availability: 'full', audio: 'medias/musique/sorti/12.mp3' },
                { id: 'dual-16', number: 16, title: 'Loosing', availability: 'full', audio: 'medias/musique/sorti/13.mp3' },
                { id: 'dual-17', number: 17, title: 'Feelings Of Nostalgia (Alt)', availability: 'unavailable' },
                { id: 'dual-18', number: 18, title: 'LRJR_5 / Gender Mess', availability: 'unavailable' }
            ]
        }
    ]
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function getArtist(artistId) {
    return catalog.artists.find((artist) => artist.id === artistId) || null;
}

function getRelease(releaseId) {
    return catalog.releases.find((release) => release.id === releaseId) || null;
}

function getReleases(options = {}) {
    const { artistId = null, status = null } = options;
    return catalog.releases.filter((release) => {
        if (artistId && release.artistId !== artistId) return false;
        if (status && release.status !== status) return false;
        return true;
    });
}

function splitAudioPath(path) {
    const raw = String(path || '');
    const slash = raw.lastIndexOf('/');
    if (slash < 0) return { base: '', file: raw };
    return {
        base: raw.slice(0, slash + 1),
        file: raw.slice(slash + 1)
    };
}

function toPlayerTracks(releaseId) {
    const release = getRelease(releaseId);
    if (!release) return [];

    return release.tracks.map((track) => {
        const source = splitAudioPath(track.audio);
        return {
            id: track.id,
            number: track.number,
            title: track.title,
            status: track.availability || 'unavailable',
            file: source.file,
            audioBase: source.base,
            releaseId: release.id,
            artistId: release.artistId
        };
    });
}

function validateCatalog() {
    const errors = [];
    const artistIds = new Set();
    const releaseIds = new Set();
    const trackIds = new Set();

    catalog.artists.forEach((artist) => {
        if (!artist?.id) errors.push('artist_missing_id');
        if (artistIds.has(artist.id)) errors.push(`duplicate_artist:${artist.id}`);
        artistIds.add(artist.id);
    });

    catalog.releases.forEach((release) => {
        if (!release?.id) errors.push('release_missing_id');
        if (releaseIds.has(release.id)) errors.push(`duplicate_release:${release.id}`);
        releaseIds.add(release.id);
        if (!artistIds.has(release.artistId)) errors.push(`unknown_artist:${release.id}:${release.artistId}`);

        (release.tracks || []).forEach((track) => {
            if (!track?.id) errors.push(`track_missing_id:${release.id}`);
            if (trackIds.has(track.id)) errors.push(`duplicate_track:${track.id}`);
            trackIds.add(track.id);
            if (!['full', 'snippet', 'unavailable', 'locked'].includes(track.availability)) {
                errors.push(`invalid_track_availability:${track.id}`);
            }
            if (['full', 'snippet'].includes(track.availability) && !track.audio) {
                errors.push(`playable_track_missing_audio:${track.id}`);
            }
        });
    });

    if (!getRelease(catalog.defaultReleaseId)) {
        errors.push(`invalid_default_release:${catalog.defaultReleaseId}`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

const bundledArtists = [...catalog.artists];
const bundledReleases = [...catalog.releases];
let refreshing;
async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
        try {
            const response = await fetch('/api/catalog', { cache:'no-store', signal:AbortSignal.timeout(5000) });
            if (!response.ok) return false;
            const data = await response.json();
            if (!Array.isArray(data.artists) || !Array.isArray(data.releases)) return false;
            const oldArtists = catalog.artists, oldReleases = catalog.releases;
            catalog.artists = [...new Map([...bundledArtists, ...data.artists].map(artist => [artist.id, artist])).values()];
            catalog.releases = [...bundledReleases, ...data.releases];
            let valid = false;
            try { valid = validateCatalog().valid; } catch (_) { /* Reject malformed responses. */ }
            if (!valid) {
                catalog.artists = oldArtists; catalog.releases = oldReleases;
                return false;
            }
            window.dispatchEvent(new CustomEvent('aq:catalog-updated'));
            return true;
        } catch (_) { return false; }
        finally { refreshing = null; }
    })();
    return refreshing;
}

const api = {
    refresh,
    version: CATALOG_VERSION,
    data: catalog,
    defaultReleaseId: catalog.defaultReleaseId,
    getArtist,
    getRelease,
    getReleases,
    getTracks: (releaseId) => clone(getRelease(releaseId)?.tracks || []),
    toPlayerTracks,
    validate: validateCatalog
};

const validation = validateCatalog();
if (!validation.valid) {
    console.error('[AQ Catalog] invalid catalogue', validation.errors);
}

window.AQCatalog = api;
window.dispatchEvent(new CustomEvent('aq:catalog-ready', { detail: { version: CATALOG_VERSION } }));

export { catalog, getArtist, getRelease, getReleases, toPlayerTracks, validateCatalog };
export default api;
