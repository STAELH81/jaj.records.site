# AQ-Player++

Open **Playlists & favorites** in AQ-Player. Signed-in accounts can create, rename,
reorder and delete playlists, add available catalog tracks, and save favorites.
The library is saved by `/api/player-library` separately from desktop preferences.
An atomic revision check rejects concurrent writes instead of overwriting another
device's changes. Refresh and retry when a conflict is reported. Failed saves
leave the last confirmed library intact.

Playlists are private by default. **Make shareable** permits anyone holding the
link to read that playlist's name, track references and author display name.
Favorites and other private playlists are never included. **Make private** or
deleting the playlist revokes future reads. A recipient can create an independent
private copy; revocation does not erase copies or previously downloaded data.
MySpace sharing prepares a post for the user to publish explicitly.

Playback resolves track references against the current public catalog. Withdrawn
or unavailable tracks remain visible in saved playlists but cannot play. The mixed
queue supports the existing next/previous, shuffle, repeat, skins and visualizer.
Playback resets on account switch; the transient queue does not restore as an
unrelated album after reload. Saved playlists and favorites persist on the server.

Limits: 50 playlists, 200 tracks per playlist, 500 favorites. Preview storage uses
the existing isolated branch store and does not alter production libraries.

Validation:

- `npm run test:player-library` exercises authorization, isolation, public share
  revocation, validation and concurrent writes using the actual handler.
- `npm run test:player-library:ui` starts a local static server and runs the browser
  against the actual handler with an in-memory store. Set `BASE_URL` to test a
  deployed preview; authenticated data remains mocked. `BROWSER_CHANNEL` defaults
  to `msedge`. `SCREENSHOT_PATH` optionally records the playlist screen.
- Existing `test:phase6c`, `test:publisher`, `test:publisher:ui` and
  `test:notifications` cover regression behavior.
