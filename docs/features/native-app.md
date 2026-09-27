# The app on a phone

Cycle is a PWA first: open it in a browser, add it to the home screen, and it
is an app. `native/` is the other way in — the same web app, wrapped thinly
enough to ship through the **App Store** and **Google Play**. What the wrapper
adds is what a browser cannot: the whole app inside the download, and a
Dropbox sign-in that stays in the app.

## What the wrapper is

A `WebView` and a loopback HTTP server, and very little else.

The whole web build is packed into the download (`assets/webroot.zip`),
unpacked on first launch, and served from `http://localhost:<fixed port>`.
Nothing is fetched. The app works on a plane, in a tunnel, and on a phone that
has never had a network — and it changes only when a new build ships to the
store, not when the website deploys.

Around that, the wrapper keeps the native chrome in step: the status bar and
the safe-area bands take the page's own theme. Links out of the app open in
the system browser. On Android the hardware back button drives the WebView's
history.

There is **no native UI**. Everything you see is the web app, unchanged.

## Where your reports live

On the phone, exactly where they live on the website: on **this device**, and —
if you connect it — in **your own Dropbox**. **Settings → Sync** offers those
two and nothing else. Your reports are health data, and they go nowhere you did
not choose.

## Dropbox

Connecting Dropbox opens Dropbox's own sign-in in a sheet over the app. You
approve there, the sheet closes, and the app is connected — the sign-in never
leaves for Safari. Closing the sheet simply leaves Dropbox unconnected. The
app never sees your Dropbox password; the sheet is Dropbox's page, and what
comes back is a one-time code the app trades for access to its own folder.

## What the wrapper is not allowed to do

Two rules, and they are what keep the app and the website the same product:

- **Nothing in `src/` knows the wrapper exists.** The web app does not check
  whether it is native. It looks for a sign-in _capability_ on `window`
  (`getAuthSessionHost`, from the framework) and uses it when one answers.
- **The wrapper decides nothing about the cycle.** It moves bytes. What a
  day's report holds, what the forecast predicts and how two copies reconcile
  are the web app's, in `cycle.ts`, `forecastModel.ts` and `merge.ts`. A
  second copy of that in Swift would drift the first week it existed.

## Building it

See [`../../native/README.md`](../../native/README.md) for the day-to-day, and
[`../../native/RELEASING.md`](../../native/RELEASING.md) for what a store build
needs.
