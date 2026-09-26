# The native wrapper

A **thin** Expo / React Native shell around the cycle log, so it can ship to
the App Store and Google Play — and so it can do the two things a PWA cannot:
run entirely from inside its own download, and keep the document in the
reader's own **iCloud**.

Thin is the design, not an aspiration. The wrapper:

- packs the built web app into `assets/webroot.zip`, unpacks it on first
  launch and serves it from a **loopback HTTP server** (`src/local-server.ts`);
- points a `WebView` at that origin, and gets out of the way — on iOS the
  WebView runs edge to edge and the page pads itself with
  `env(safe-area-inset-*)`, as the installed PWA does; on Android the frame
  keeps the page clear of the system bars and paints the bands in the page's
  own background. On both, the status bar takes its style from the background
  the page reports — light icons on a dark theme, dark on a light one — never
  from the phone's light or dark setting (`barStyleFor` in `src/injected.ts`);
  off-origin links go to the system browser, and Android's back button drives
  the WebView's history;
- offers the page an **iCloud document store** (`src/icloudBridge.ts` →
  `src/icloud.ts` → `modules/icloud-store`), which the app's own sync engine
  drives exactly as it drives Dropbox and Drive.
- opens Dropbox's sign-in in an **authentication session** when the page asks
  for one (`src/authSessionBridge.ts` → `src/authSession.ts` →
  `expo-web-browser`) — see [Signing in to Dropbox](#signing-in-to-dropbox).

That is the entire list, and it is deliberately not empty: **App Store
guideline 4.2 rejects a build that is only a viewer for a website**, so the
wrapper has to do things the browser cannot. The self-contained bundle and
iCloud are those things. Adding a third is allowed; adding one that makes
`src/` aware of this wrapper is not.

**Nothing in the repo's `src/` knows this exists.** iCloud, which the web app
has to _offer_ in its storage picker, works without breaking that rule: the
app looks for a document-store **capability** on `window`
(`src/app/cloudHost.ts`) and this installs one, so a browser — which has none
— simply does not show the backend. The app never asks what it is running
inside.

The wrapper also decides nothing about the cycle log. It moves bytes: a file
in, a file out. What a day's report holds, what the next cycle is predicted to
be and how two devices' edits reconcile are the web app's, in
`src/app/cycle.ts`, `forecastModel.ts` and `merge.ts`.

## Layout

| Path                       | What it is                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `App.tsx`                  | The whole app: a WebView, a spinner, and a failure screen.                                                  |
| `src/local-server.ts`      | Unpacks `assets/webroot.zip` and serves it on a **fixed** loopback port.                                    |
| `src/injected.ts`          | The theme reporter injected into the page, the status-bar style it drives, and the service-worker teardown. |
| `src/icloudBridge.ts`      | **Pure.** The injected store host, and the request/response plumbing. Tested from the root.                 |
| `src/icloudWire.ts`        | **Import-free.** The shapes that cross the bridge, and nothing else.                                        |
| `src/icloud.ts`            | Answers a store request through the native module, and maps a failure to its kind.                          |
| `src/authSessionBridge.ts` | **Pure.** The injected sign-in provider (`window.__ossAuthSession`) and its plumbing. Tested from the root. |
| `src/authSession.ts`       | Opens one sign-in in an authentication session (`expo-web-browser`) and hands back where it ended.          |
| `src/scriptText.ts`        | **Import-free.** Splicing text safely into an injected script; shared by both bridges.                      |
| `modules/icloud-store/`    | A local Expo module: list / read / write / remove inside the app's iCloud container.                        |
| `scripts/bundle-web.mjs`   | Builds the web app and packs `dist/` into `assets/webroot.zip`.                                             |

`ios/` and `android/` are **prebuild output**: regenerated from `app.config.js`
by `expo prebuild --clean`, gitignored, and the source of truth for nothing.
Never edit them.

## Working on it

```sh
make native-install      # or: npm --prefix native install
make native-bundle       # build the web app into assets/webroot.zip
make native-typecheck
make native-prebuild     # inspect what the config generates
```

Then run it on a device or simulator (needs Xcode / Android Studio):

```sh
cd native
npm run ios        # bundles the web app first, then expo run:ios
npm run android
```

`npm run bundle` must have run at least once before any native build — the
wrapper serves that zip, and without it the app launches to a blank screen.

To point a build at a deployed slot instead of the bundled copy (debugging
only — a store build must never do this):

```sh
EXPO_PUBLIC_CYCLE_URL=https://cycle.niclaslindstedt.se/preview/ npm run ios
```

## iCloud

One file, `cycle.json`, in the app's own iCloud container, under `Documents`
— which is the folder iCloud publishes to the **Files app**, so the reader can
open, copy and delete the file holding their own reports. A cycle log that
synced to a place its owner could not see would be a worse answer than not
syncing at all.

It appears in **Settings → Sync** beside Dropbox, and
there is no OAuth: the container belongs to the device's iCloud account, so
"connecting" is choosing it. Signing in and out of iCloud happens in iOS
Settings, which is why the app re-asks whether the store is usable every time
the page is shown again.

### How the bytes get there

```
the app's sync engine (src/app/useSyncEngine.ts)
   │  a StorageAdapter over the host — src/app/cloudHost.ts
   ▼
window.__cycleCloudHost          — installed by src/icloudBridge.ts
   │  postMessage ⇅ injectJavaScript
   ▼
App.tsx → src/icloud.ts → modules/icloud-store
   │
   ▼
iCloud.se.agilator.cycle/Documents/cycle.json
```

The four operations are the framework's `FileStore` — `list`, `read`, `write`,
`remove` — which is what lets the document go through the app's ordinary
per-record merge with no iCloud-shaped special case anywhere in `src/`.

**The container id is pinned in three files that must agree**: `app.config.js`
(all three iCloud entitlements), `modules/icloud-store/index.ts`, and its
Swift twin. Changing it after release strands every document already synced
under the old one.

## Signing in to Dropbox

The page's own Dropbox sign-in is a redirect: consent at dropbox.com, then
back to the page's origin with a code, which the page trades for tokens using
the PKCE verifier it kept in `sessionStorage`. That cannot finish in here.
Dropbox refuses consent inside an embedded WebView, so `App.tsx` sends an
off-origin page to Safari — and Dropbox then redirects **Safari** to the
loopback origin, which it has not registered, in a browser that does not hold
the verifier.

So the wrapper offers the page an **authentication session**
(`ASWebAuthenticationSession` on iOS, a Custom Tab on Android): a browser sheet
over the app that closes as soon as Dropbox redirects to the app's own scheme,
and hands that URL back.

```
Settings → Sync → Dropbox
   │  src/app/useSyncEngine.ts — getAuthSessionHost() is present, so
   │  connectDropboxAuthSession(appKey, host)   (oss-framework)
   ▼
window.__ossAuthSession.open(authorizeUrl)   — installed by src/authSessionBridge.ts
   │  postMessage (request)  /  injectJavaScript (answer)
   ▼
App.tsx → src/authSession.ts → WebBrowser.openAuthSessionAsync(url, "se.agilator.cycle://oauth")
   │  the reader consents in the sheet; Dropbox redirects to
   │  se.agilator.cycle://oauth?code=…&state=dropbox and the sheet closes
   ▼
the page checks the state, trades the code (same verifier, same redirect URI)
```

As with iCloud, the page asks for a **capability**, not for this wrapper: the
host lives at `window.__ossAuthSession`, a name the framework owns
(`AUTH_SESSION_HOST_PROPERTY`), so the website — which has no host — keeps its
redirect flow and the desktop app keeps its loopback one. The wrapper never
sees a token: it opens an `https:` URL (nothing else is accepted) and returns
the callback URL, unread; a closed sheet comes back as `null`, which the page
treats as "cancelled" rather than as an error.

**The URL scheme is the bundle id** (`scheme: BUNDLE_ID` in `app.config.js`,
from `identifiers.js`), reverse-DNS so no other app can claim it — and so
**the redirect URI is `se.agilator.cycle://oauth`** in a store build (`dev.local.cycle://oauth`
in a plain checkout). Dropbox requires the exact URI to be registered, so the
Dropbox app behind `VITE_DROPBOX_APP_KEY` must list `se.agilator.cycle://oauth` under
**Settings → OAuth 2 → Redirect URIs** in the
[App Console](https://www.dropbox.com/developers/apps), next to the website's
and the desktop app's. Without it Dropbox shows "Invalid redirect_uri" in the
sheet.

Other off-origin links are unchanged: they still leave for the system browser.

## Things that will bite you

- **The port in `src/local-server.ts` is fixed on purpose.** A web origin is
  scheme + host + port, and `localStorage` is keyed by origin — so a random
  port would hand the WebView an empty store on every launch, and every day
  the user logged would appear to vanish.
- **`localhost`, not `127.0.0.1`.** App Transport Security blocks the literal
  address from `WKWebView` even with exception domains declared. The failure
  mode is a silent blank page on iOS.
- **The service worker is unregistered** (`src/injected.ts`). The origin is
  stable across app updates, so a worker registered by an older build would
  keep answering from its precache after a store update had already unpacked
  the new one.
- **A file iCloud has listed is not a file iCloud has downloaded.** The Swift
  side waits for the bytes and reports a timeout as a failure, never as an
  empty document — because an empty document is a valid one, and the app
  would merge it as such and push over what was really there.

## Releasing

See [`RELEASING.md`](RELEASING.md).
