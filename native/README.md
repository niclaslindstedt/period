# The native wrapper

A **thin** Expo / React Native shell around the cycle log, so it can ship to
the App Store and Google Play — and so it can do the two things a PWA cannot:
run entirely from inside its own download, and sign in to the reader's own
**Dropbox** in a system sheet the app gets back from.

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
- opens Dropbox's sign-in in an **authentication session** when the page asks
  for one (`src/authSessionBridge.ts` → `src/authSession.ts` →
  `expo-web-browser`) — see [Signing in to Dropbox](#signing-in-to-dropbox).

That is the entire list, and it is deliberately not empty: **App Store
guideline 4.2 rejects a build that is only a viewer for a website**, so the
wrapper has to do things the browser cannot. The self-contained bundle and
the authentication session are those things. Adding a third is allowed;
adding one that makes `src/` aware of this wrapper is not.

**The reports stay on the device or in the reader's own Dropbox.** They are
health data, and nothing in this wrapper offers a place of Apple's to keep
them — no container, no entitlement, no store beside Dropbox.

**Nothing in the repo's `src/` knows this exists.** The page looks for a
sign-in **capability** on `window` and this installs one, so a browser —
which has none — keeps its redirect flow. The app never asks what it is
running inside.

The wrapper also decides nothing about the cycle log. It moves bytes: a file
in, a file out. What a day's report holds, what the next cycle is predicted to
be and how two devices' edits reconcile are the web app's, in
`src/app/cycle.ts`, `forecastModel.ts` and `merge.ts`.

## Layout

| Path                        | What it is                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `App.tsx`                   | The whole app: a WebView, a spinner, and a failure screen.                                                  |
| `src/local-server.ts`       | Unpacks `assets/webroot.zip` and serves it on a **fixed** loopback port.                                    |
| `src/injected.ts`           | The theme reporter injected into the page, the status-bar style it drives, and the service-worker teardown. |
| `src/authSessionBridge.ts`  | **Pure.** The injected sign-in provider (`window.__ossAuthSession`) and its plumbing. Tested from the root. |
| `src/authSession.ts`        | Opens one sign-in in an authentication session (`expo-web-browser`) and hands back where it ended.          |
| `src/scriptText.ts`         | **Import-free.** Splicing text safely into an injected script.                                              |
| `scripts/bundle-web.mjs`    | Builds the web app and packs `dist/` into `assets/webroot.zip`.                                             |
| `scripts/web-build-env.mjs` | The web build's environment: `VITE_EMBEDDED_BUILD` and the name the top bar carries (`APP_DISPLAY_NAME`).   |

`ios/` and `android/` are **prebuild output**: regenerated from `app.config.js`
by `expo prebuild --clean`, gitignored, and the source of truth for nothing.
Never edit them.

## Working on it

```sh
make native-install      # or: npm --prefix native install
make native-bundle       # build the web app into assets/webroot.zip
make native-typecheck    # what CI's `native` job runs, with `npx expo-doctor` in native/
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

The page asks for a **capability**, not for this wrapper: the
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

## Releasing

See [`RELEASING.md`](RELEASING.md).
