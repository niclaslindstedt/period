# Configuration

The app has no configuration file and needs no configuration to run. What
follows is the build-time environment (which mostly decides whether cloud sync
is offered at all) and the runtime settings a user can change.

## Build-time environment

All optional. The app builds and runs with none of them set.

| Variable                  | Default  | Effect                                                                                                                                                                                                                             |
| ------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_BASE`               | `/`      | Deploy base path. Drives the bundler base, the service-worker scope, and the PWA install identity. The Pages workflow sets `/` for the released build and `/preview/` for main.                                                    |
| `VITE_PWA_IGNORE_PATHS`   | —        | Comma-separated absolute paths this build's service worker must disown. Only the root release sets it (`/preview/`), because a scope is a path prefix and the root worker would otherwise claim the preview channel's navigations. |
| `VITE_DROPBOX_APP_KEY`    | —        | Dropbox OAuth app key (PKCE public client). Unset ⇒ the Dropbox backend is hidden from Settings → Sync rather than offered and then failing.                                                                                       |
| `VITE_GOOGLE_CLIENT_ID`   | —        | Google OAuth client id (GIS token client). Unset ⇒ the Google Drive backend is hidden.                                                                                                                                             |
| `VITE_DROPBOX_APP_FOLDER` | `Period` | The app-folder name shown as the file's location. Dropbox fixes this from the OAuth app's own configuration, so it has to be told what the folder is actually called.                                                              |
| `VITE_GDRIVE_APP_FOLDER`  | `Period` | The folder the app creates in the user's My Drive.                                                                                                                                                                                 |

Both OAuth identifiers are **public**: the flows are PKCE with no client
secret, so they are supplied as repository _variables_ (not secrets) and
injected at build time. There is no server-side half of the flow to protect.

The declarations live in `src/vite-env.d.ts`; the consumers are
`vite.config.ts` and `src/app/useSyncEngine.ts`.

### Setting them up

- **Dropbox** — create an app at
  [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps) with
  "App folder" access, add your deploy origin as a redirect URI, and take the
  app key. The app-folder name you pick there is what `VITE_DROPBOX_APP_FOLDER`
  must repeat.
- **Google Drive** — create an OAuth 2.0 Web client in Google Cloud Console,
  add your origin to the authorised JavaScript origins, and take the client id.
  The app requests `drive.file` scope only, so it can see the files it created
  and nothing else in the user's Drive.

## Runtime settings

Everything under Settings persists to localStorage (`period:settings`) and
applies immediately. Stored values are range-clamped on read, so a
hand-edited blob can't produce a forecast that divides by zero.

| Setting                 | Default | Range                 | Notes                                                                                                                                                                                        |
| ----------------------- | ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme                   | System  | light / dark / system | Two palettes only, by design.                                                                                                                                                                |
| Week starts on          | Monday  | Monday / Sunday       | Applies to every calendar grid.                                                                                                                                                              |
| Default cycle length    | 28      | 15–60                 | Used only until two periods are logged; after that the observed median wins.                                                                                                                 |
| Default period length   | 5       | 1–15                  | Used only until a period is logged.                                                                                                                                                          |
| Luteal phase            | 14      | 8–20                  | How far _before_ the next period ovulation is estimated. The forecast counts back from the predicted start, because the luteal phase is far steadier between people than the follicular one. |
| Show the fertile window | On      | on / off              | Off keeps the app to periods only — no fertility estimate anywhere in the UI.                                                                                                                |
| Developer mode          | Off     | on / off              | Reveals the sync log and the raw document size.                                                                                                                                              |
| Capture console output  | Off     | on / off              | Mirrors `console.*` into the in-app log buffer.                                                                                                                                              |

The fertile window's _width_ (5 days before ovulation, 1 after) is not
adjustable: it is sperm and egg viability, not a preference.

## Storage keys

Everything the app persists, all under one origin:

| Key                                         | Holds                                                       |
| ------------------------------------------- | ----------------------------------------------------------- |
| `period:doc`                                | The document — every day report.                            |
| `period:settings`                           | The settings above.                                         |
| `period:logs`                               | The in-app log buffer.                                      |
| `period:language`                           | The active UI language.                                     |
| `period:sync:backend`                       | Which backend is selected (`local` / `dropbox` / `gdrive`). |
| `period:sync:dropbox`, `period:sync:gdrive` | OAuth tokens for the connected backend.                     |
| `oss:cache:<backend>:period`                | The framework's offline mirror of the cloud copy.           |

Clearing site data removes all of it. That is the whole uninstall procedure —
there is nothing on a server to delete.
