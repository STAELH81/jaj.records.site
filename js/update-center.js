const UPDATE_MANIFEST_URL = '/data/aq-updates.json';
const UPDATE_LAST_CHECK_KEY = 'aq_update_last_check_v1';

const currentVersionEl = document.getElementById('aq-update-current-version');
const latestVersionEl = document.getElementById('aq-update-latest-version');
const channelEl = document.getElementById('aq-update-channel');
const lastCheckEl = document.getElementById('aq-update-last-check');
const summaryEl = document.getElementById('aq-update-summary');
const changelogEl = document.getElementById('aq-update-changelog');
const checkBtn = document.getElementById('aq-update-check-btn');
const reloadBtn = document.getElementById('aq-update-reload-btn');

let installedVersion = '0.0.0';
let manifest = null;

function isEnglish() {
    return document.documentElement.lang === 'en';
}

function tr(fr, en) {
    return isEnglish() ? en : fr;
}

function parseVersion(value) {
    return String(value || '0.0.0')
        .replace(/^v/i, '')
        .split('.')
        .map((part) => Number.parseInt(part, 10) || 0)
        .slice(0, 3);
}

function compareVersions(a, b) {
    const av = parseVersion(a);
    const bv = parseVersion(b);
    for (let i = 0; i < 3; i += 1) {
        const diff = (av[i] || 0) - (bv[i] || 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

function formatCheckTime(value) {
    const stamp = Number(value || 0);
    if (!stamp) return tr('Jamais', 'Never');
    try {
        return new Intl.DateTimeFormat(isEnglish() ? 'en-GB' : 'fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(new Date(stamp));
    } catch (_) {
        return tr('Inconnue', 'Unknown');
    }
}

function renderChangelog() {
    if (!changelogEl) return;
    changelogEl.innerHTML = '';

    const notes = Array.isArray(manifest?.notes) ? manifest.notes : [];
    const history = Array.isArray(manifest?.history) ? manifest.history : [];

    const notesList = document.createElement('ul');
    notesList.className = 'aq-update-notes';

    notes.forEach((note) => {
        const li = document.createElement('li');
        li.textContent = note;
        notesList.appendChild(li);
    });

    if (notes.length) changelogEl.appendChild(notesList);

    if (history.length) {
        const historyTitle = document.createElement('div');
        historyTitle.className = 'aq-update-history-title';
        historyTitle.textContent = tr('Historique des versions', 'Version history');
        changelogEl.appendChild(historyTitle);

        const table = document.createElement('div');
        table.className = 'aq-update-history';

        history.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'aq-update-history-row';

            const version = document.createElement('strong');
            version.textContent = 'v' + String(entry.version || '');

            const title = document.createElement('span');
            title.textContent = entry.title || '';

            const date = document.createElement('span');
            date.textContent = entry.date || '';

            row.append(version, title, date);
            table.appendChild(row);
        });

        changelogEl.appendChild(table);
    }

    if (!notes.length && !history.length) {
        changelogEl.textContent = tr('Aucune note de version disponible.', 'No release notes available.');
    }
}

function renderState() {
    const latest = manifest?.latestVersion || installedVersion;
    const cmp = compareVersions(latest, installedVersion);

    if (currentVersionEl) currentVersionEl.textContent = 'v' + installedVersion;
    if (latestVersionEl) latestVersionEl.textContent = 'v' + latest;
    if (channelEl) channelEl.textContent = manifest?.channel === 'stable' ? tr('Stable', 'Stable') : String(manifest?.channel || 'Stable');
    if (lastCheckEl) {
        lastCheckEl.textContent = formatCheckTime(localStorage.getItem(UPDATE_LAST_CHECK_KEY));
    }

    if (summaryEl) {
        if (cmp > 0) {
            summaryEl.textContent = tr(
                `Une mise à jour AQ-NEO v${latest} est disponible.`,
                `AQ-NEO v${latest} is available.`
            );
            summaryEl.dataset.state = 'available';
        } else {
            summaryEl.textContent = tr(
                `AQ-NEO v${installedVersion} est à jour.`,
                `AQ-NEO v${installedVersion} is up to date.`
            );
            summaryEl.dataset.state = 'current';
        }
    }

    if (reloadBtn) reloadBtn.hidden = cmp <= 0;
    renderChangelog();
}

async function readInstalledVersion() {
    try {
        const response = await fetch('/package.json?aqv=' + Date.now(), { cache: 'no-store' });
        const pkg = await response.json();
        installedVersion = String(pkg?.version || '0.0.0');
    } catch (_) {
        installedVersion = '0.0.0';
    }
}

async function checkForUpdates({ userInitiated = false } = {}) {
    if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.textContent = tr('Vérification…', 'Checking…');
    }
    if (summaryEl && userInitiated) {
        summaryEl.textContent = tr('Connexion à AQ Update…', 'Connecting to AQ Update…');
        summaryEl.dataset.state = 'checking';
    }

    try {
        await readInstalledVersion();
        const response = await fetch(UPDATE_MANIFEST_URL + '?t=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) throw new Error('update_manifest_unavailable');
        manifest = await response.json();
        localStorage.setItem(UPDATE_LAST_CHECK_KEY, String(Date.now()));
        renderState();
    } catch (error) {
        if (summaryEl) {
            summaryEl.textContent = tr(
                'Impossible de contacter AQ Update. Réessaie plus tard.',
                'Unable to contact AQ Update. Try again later.'
            );
            summaryEl.dataset.state = 'error';
        }
        console.warn('[AQ Update] check failed', error);
    } finally {
        if (checkBtn) {
            checkBtn.disabled = false;
            checkBtn.textContent = tr('Rechercher des mises à jour', 'Check for updates');
        }
        if (lastCheckEl) {
            lastCheckEl.textContent = formatCheckTime(localStorage.getItem(UPDATE_LAST_CHECK_KEY));
        }
    }
}

function openUpdateCenter() {
    window.openWindow?.('win-updates', 'task-updates');
    checkForUpdates();
}

checkBtn?.addEventListener('click', () => checkForUpdates({ userInitiated: true }));
reloadBtn?.addEventListener('click', () => {
    reloadBtn.disabled = true;
    reloadBtn.textContent = tr('Redémarrage…', 'Restarting…');
    window.location.reload();
});

window.addEventListener('aq:updates-open', openUpdateCenter);
window.addEventListener('aq:language-changed', renderState);

window.AQUpdate = {
    open: openUpdateCenter,
    check: checkForUpdates,
    getManifest: () => manifest
};
