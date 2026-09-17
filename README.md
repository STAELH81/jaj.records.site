# JAJ Records / Aquerty AQ-NEO

Web desktop for JAJ Records, hosted on Netlify.

## Phase 2 — accounts

The site now has an AQ-NEO welcome screen inspired by the Windows XP account chooser:

- Guest session with a temporary fake `@aquerty.fr` address.
- Real accounts backed by Netlify Identity.
- Recent accounts remembered only on the current browser (passwords are never stored).
- AQ-NEO fake mail address attached to each real account.
- Hooks for future roles such as `artist` and `admin`.
- Start menu actions to switch user or log out.

### Enable Netlify Identity

1. Deploy/link this repository to your Netlify project.
2. In Netlify, open **Identity** for the project.
3. Select **Enable Identity**.
4. Keep registration **Open** if visitors should be allowed to create accounts.
5. By default Netlify sends a confirmation email after signup. If you want instant signup for this project, enable the Identity option that allows signup without e-mail verification.

The frontend uses the current `@netlify/identity` package through a pinned browser ESM import, so the project can stay a zero-build static site for now.

### Local testing

Guest mode works on any local web server.

Real Netlify Identity login/signup needs the Netlify environment. Test on the deployed site, or use Netlify Dev locally.

## Branch plan

- `phase-1-jaj-cleanup`: JAJ Records rebrand / timer removal / code split.
- `phase-2-accounts`: AQ-NEO welcome screen + Netlify Identity accounts.


## Phase 3 — account profile synchronization

Authenticated AQ-NEO sessions now synchronize their desktop profile through a Netlify Function and Netlify Blobs.

Synchronized data:
- desktop settings and wallpaper
- icon positions
- recent apps
- Tempus unlock state
- open window layout / AQ-Navigator page
- AQ-Player preferences (volume, shuffle, repeat, skin, night mode)

Guest sessions stay local to the current browser session.

The API endpoint is `/api/aq-sync`. It derives the storage key from the authenticated Netlify Identity user on the server, so the browser cannot choose another user's profile key.

Production uses a global strongly-consistent Blob store. Deploy previews and local Netlify environments use deploy-scoped storage so test data cannot overwrite production profiles.


## Artist role

Netlify Identity roles are read from `app_metadata.roles`.

Supported roles:
- `user` — normal JAJ/AQ-NEO account
- `artist` — artist account; shows an ARTIST badge and enables the future publishing permission hook
- `admin` — admin account; implicitly has artist publishing permission

The frontend exposes:
- `window.AQPermissions.isArtist()`
- `window.AQPermissions.isAdmin()`
- `window.AQPermissions.canPublish()`

No Publisher UI is included in this patch yet.


## Phase 6C regression check

The Navigator and Player share `js/catalog.js`. `js/bootstrap.js` loads the catalogue
before restoring the classic desktop, then initializes Player, skins, visualizer and account UI.
Legacy Dual addresses remain aliases for its catalogue release page; album notes live with its catalogue entry.

Run a static server at the repository root (`python -m http.server 8765`), install
project dependencies and Chromium (`npm install`, `npx playwright install chromium`),
then run `npm run test:phase6c`. `BASE_URL` overrides the server URL and `BROWSER_CHANNEL`
can select an installed browser such as `msedge`.

The browser regression adds a second artist/release only to intercepted test responses.
It checks catalogue navigation, FR/EN, release/track/theme/preset restoration, eight visual presets,
mobile navigation and window bounds, and JavaScript errors. No fixture is published in the catalogue.
Account services and cloud uploads require a Netlify environment and are not covered by the static-server test.
