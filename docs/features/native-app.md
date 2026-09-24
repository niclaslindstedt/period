# The app on a phone

Cycle is a PWA first: open it in a browser, add it to the home screen, and it
is an app. `native/` is the other way in — the same web app, wrapped thinly
enough to ship through the **App Store** and **Google Play**, and in exchange
for that wrapper it gains one thing the browser cannot give it: **iCloud**.

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

## iCloud

**Settings → Sync** offers **iCloud Drive** beside Dropbox, and only in the
app — a browser has no way to reach a device's iCloud, so on the website the
option is simply not there.

Choosing it is all there is to it. There is nothing to connect and no window
to grant anything in: the container belongs to the iCloud account the phone is
already signed into. From then on the document — one file, `cycle.json` — is
kept in the app's own iCloud folder, and every device signed into the same
account merges the same way two Dropbox devices do: day by day, the later edit
of each winning (see [`../sync.md`](../sync.md)).

The file lives under **Files → iCloud Drive → Cycle**, where you can open it,
copy it out, or delete it. That is deliberate: these are your reports, and a
copy you cannot see is a copy you do not control.

Two things it will tell you rather than guess about:

- **iCloud is signed out.** The app says so and offers to reconnect instead of
  failing quietly; signing in happens in iOS Settings, and the app re-checks
  every time you come back to it.
- **The file is in iCloud but has not arrived yet.** Another device wrote it a
  moment ago and the bytes are still coming down. The app waits, and if they
  do not arrive it keeps working from the copy on this device and says it is
  offline — it never treats a file it could not read as an empty one.

Android has no iCloud, so there the app is the web app served from inside the
download, with Dropbox as before.

## Dropbox

Connecting Dropbox opens Dropbox's own sign-in in a sheet over the app. You
approve there, the sheet closes, and the app is connected — the sign-in never
leaves for Safari. Closing the sheet simply leaves Dropbox unconnected. The
app never sees your Dropbox password; the sheet is Dropbox's page, and what
comes back is a one-time code the app trades for access to its own folder.

## What the wrapper is not allowed to do

Two rules, and they are what keep the app and the website the same product:

- **Nothing in `src/` knows the wrapper exists.** The web app does not check
  whether it is native. It looks for a document-store _capability_ on
  `window` (`src/app/cloudHost.ts`) and offers the backend when one answers.
- **The wrapper decides nothing about the cycle.** It moves bytes. What a
  day's report holds, what the forecast predicts and how two copies reconcile
  are the web app's, in `cycle.ts`, `forecastModel.ts` and `merge.ts`. A
  second copy of that in Swift would drift the first week it existed.

## Building it

See [`../../native/README.md`](../../native/README.md) for the day-to-day, and
[`../../native/RELEASING.md`](../../native/RELEASING.md) for what a store build
needs.
