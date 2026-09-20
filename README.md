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
- `artist` — artist account; shows an ARTIST badge and enables Artist Publisher
- `admin` — admin account; implicitly has artist publishing permission

The frontend exposes:
- `window.AQPermissions.isArtist()`
- `window.AQPermissions.isAdmin()`
- `window.AQPermissions.canPublish()`

Artist Publisher is available to ARTIST and ADMIN sessions (Phases 7A–7C below).


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

## Phases 7A–7C — Artist Publisher

Open **Artist Publisher** from the desktop, start menu or mobile navigation after signing
in as an ARTIST or ADMIN. The temporary icon is `medias/img/exeimg.png`.

Create, reopen and edit private release drafts with a title, artist name, album/EP/single
type, optional planned date, uploaded PNG/JPEG/WebP cover (up to 1 MiB), and up to 50
ordered tracks. Save the draft once to import MP3/WAV/Ogg files (up to 15 MiB per track),
or supply HTTPS audio URLs. Every track needs audio before publication. A live preview shows the cover, release details and track order.
Saving is explicit. Failed saves retain the form; switching drafts warns about unsaved changes.

`/api/artist-drafts` uses Netlify Identity's current server-controlled roles. Artists can
access their own drafts; admins can access all drafts without changing ownership.
Draft edits remain private. **Publish** atomically records a public snapshot inside the
same draft record; later saves leave that snapshot unchanged until **Publish changes**.
Publication is immediate, even when the optional release date is in the future.
`/api/catalog` exposes only public metadata, with covers served by `/api/catalog-cover`.
The catalogue loads before session restoration and merges publications with bundled Dual.
Navigator refresh and successful publication reload it without interrupting active playback.

`/api/artist-audio` imports 1 MiB chunks under the saved draft's ownership, verifies
length/signature, and makes completed uploads immutable. GET/HEAD support byte ranges
for seeking. Unpublished files require the owning artist or an admin; anonymous access
is available only while a file belongs to a published snapshot. All responses use
no-store caching. Preview and production media share the same separation as drafts.
**Unpublish** removes the public snapshot while preserving the draft and its audio.
**Delete draft** is available only after unpublishing and requires confirmation. A minimal
server tombstone blocks recreation by stale clients; title, cover and tracks are removed.
**Clean unused files** permanently removes eligible audio (artist: own account; admin:
all accounts). Draft and published references are protected. Unreferenced imports receive
a 24-hour grace period unless their draft was deleted. Each request processes up to ten
files; the UI indicates when another cleanup pass is needed. There is no scheduled cleanup.

Cleanup records retired asset IDs with a conditional write before removing binary chunks.
Concurrent edits either win the ETag race or retry; retired IDs cannot be reattached.
Failed chunk deletions keep the manifest for a later retry. An in-flight chunk upload
rechecks the draft after writing and discards its part if deletion/retirement won.
Cleanup tombstones and retired IDs are retained as small concurrency safeguards.

Production uses the strongly consistent `aq-artist-drafts-v1-production` site store.
Previews use a separate, branch-scoped site store so drafts survive preview redeploys
without touching production drafts. The API verifies request origin, validates media
and payload size, and uses revision checks plus conditional ETag writes to reject
concurrent edits. A conflict leaves the form intact so changes can be copied before reload.
See [Netlify's conditional-write documentation](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).

Validation:

- `npm run test:publisher`: real handler with in-memory Identity/Blobs dependencies;
  checks permissions, ownership, validation, concurrent writes, chunked uploads, byte ranges,
  draft/public isolation, publication snapshots, unpublish/delete, cleanup grace periods,
  partial failures and concurrent edits.
- `npm run test:publisher:ui`: static server and Playwright setup as above; routes draft
  requests through that handler with simulated identities, and exercises the full UI,
  save/reopen/edit, cover, track order, failed saves, FR/EN, mobile and session isolation;
  WAV upload/playback/seek, publish/republish, Navigator → Player and selected-release restoration; unpublish/republish, cancelled
  confirmations, delete/cleanup and active-player fallback after withdrawal.
- Real Identity login and durable Blobs storage require the deployed Netlify preview;
  the fixtures do not claim to validate those external services.


## Phase 8 — public artist pages

AQ-Navigator links artist names in the catalogue and release pages to an artist page:
bio, avatar, and public/archived releases with direct AQ-Player actions. A profile can
remain visible with no releases; private drafts never appear on the public page.

Open **Artist pages** in Artist Publisher to edit the bio (2,000 characters) and upload
a PNG/JPEG/WebP avatar (1 MiB). **Publish profile** immediately updates the public page.
Unsaved changes are guarded when switching/closing, errors retain edits, and session
changes clear private editor state. Labels are FR/EN and the dialog/page adapt to mobile.

`/api/artist-profiles` derives editable identities from saved release drafts, publication
snapshots and existing profiles. Artists must save their first draft to establish their
artist name. IDs retain the existing owner + normalized-name hash, so equal display
names never let accounts claim each other's profiles. Administrators may edit all
profiles, including the bundled Cha archive identity. The bundled archive is separate
from user-owned identities, even with matching names; automatic merging is intentionally
avoided. Profiles outlive draft deletion and their name is tied to their release identity.

Profiles use the same isolated preview/production store and conditional revisions as
Publisher. `/api/catalog` emits only public name/bio/avatar metadata; `/api/artist-avatar`
serves validated raster bytes. Avatar changes use versioned URLs and no-store responses.
The catalogue merges profile metadata into the bundled Cha artist without duplicating
or removing Dual. The public bio is rendered as text, preserving line breaks.

`npm run test:publisher` includes profile authorization, namespace isolation, input
validation, public data boundaries and conflicts. `npm run test:artists:ui` exercises
profile save/reopen/avatar, failure recovery, discard cancellation, FR/EN/mobile,
public navigation, Player launch, guest access, account isolation and archive merging.
The Phase 7C lifecycle was also verified with the real preview account: a disposable
release and WAV were published, withdrawn, republished, deleted and cleaned successfully.


## Phase 9 — shareable links

Navigator artist/release pages and the Player toolbar expose Share. The dialog provides
an actual URL on the current deployment (`?artist=cha`, `?release=cha-dual-2026`), a copy
button and a selectable fallback if clipboard access is unavailable. No email is sent.
Incoming links open Navigator after account/guest session activation, including mobile;
the release page's Player action starts the listening flow without automatic playback.
Unknown, withdrawn and ambiguous links show an unavailable message. Refresh retries a
transient catalogue failure. Preview links stay on the preview; production links stay
on production. This phase does not add social-network preview metadata.

Run `npm run test:share` against the static test server for incoming URLs, sharing,
FR/EN, mobile and unavailable-link handling. AQ-Mail remains unchanged pending a separate
messaging design: currently its messages exist only in memory and sending is simulated.
