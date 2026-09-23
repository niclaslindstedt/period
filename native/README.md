# The native wrapper

A **thin** Expo / React Native shell around the cycle log, so it can ship to
the App Store and Google Play — and so it can do the two things a PWA cannot:
run entirely from inside its own download, and keep the document in the
reader's own **iCloud**.

Thin is the design, not an aspiration. The wrapper:

- packs the built web app into `assets/webroot.zip`, unpacks it on first
  launch and serves it from a **loopback HTTP server** (`src/local-server.ts`);
- points a `WebView` at that origin, and gets out of the way — the status bar
  and safe-area bands follow the page's own theme, off-origin links go to the
  system browser, and Android's back button drives the WebView's history;
- offers the page an **iCloud document store** (`src/icloudBridge.ts` →
  `src/icloud.ts` → `modules/icloud-store`), which the app's own sync engine
  drives exactly as it drives Dropbox and Drive.

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

| Path                     | What it is                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `App.tsx`                | The whole app: a WebView, a spinner, and a failure screen.                                  |
| `src/local-server.ts`    | Unpacks `assets/webroot.zip` and serves it on a **fixed** loopback port.                    |
| `src/injected.ts`        | The theme reporter injected into the page, and the service-worker teardown.                 |
| `src/icloudBridge.ts`    | **Pure.** The injected store host, and the request/response plumbing. Tested from the root. |
| `src/icloudWire.ts`      | **Import-free.** The shapes that cross the bridge, and nothing else.                        |
| `src/icloud.ts`          | Answers a store request through the native module, and maps a failure to its kind.          |
| `modules/icloud-store/`  | A local Expo module: list / read / write / remove inside the app's iCloud container.        |
| `scripts/bundle-web.mjs` | Builds the web app and packs `dist/` into `assets/webroot.zip`.                             |

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
