# The app on a phone

Cycle is a PWA first: open it in a browser, add it to the home screen, and it
is an app. `native/` is the other way in — the same web app, wrapped thinly
enough to ship through the **App Store** and **Google Play**. What the wrapper
adds is what a browser cannot: the whole app inside the download, and a
backup that leaves through the phone's own share sheet.

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

There is **no native UI**. Everything you see is the web app, unchanged — but
for its name: the top bar says the store listing's name, the one under the
icon, where the website and the desktop app say "Cycle".

## Where your reports live

On **this device**, and nowhere else. The phone app offers no cloud: there is
no Sync section in Settings, no Dropbox and no iCloud. Your reports are health
data, and the only way they leave the phone is a backup you export yourself
(below). The website and the desktop app still offer your own Dropbox.

A development build that had Dropbox connected comes back to this device on
its next launch, with every report still on it; its Dropbox sign-in is
forgotten, and the copy already in Dropbox is left where it is.

## Backups

**Settings → Export a backup** opens the phone's share sheet with the backup
file (`cycle-backup-<date>.json`): save it to Files, mail it to yourself, or
send it anywhere the sheet offers. On the website the same button downloads
the file. **Restore from a backup** reads it back in both.

The file goes only where you send it from the sheet. The app keeps nothing
beyond the one latest export, in the phone's temporary cache, which the next
export clears.

## What the wrapper is not allowed to do

Two rules, and they are what keep the app and the website the same product:

- **Nothing in `src/` talks to the wrapper.** A backup goes through the
  framework's `saveFile`, which finds the wrapper's `save-file` capability
  on `window`. The one thing the web build knows is the flag it is built
  with (`VITE_NATIVE_BUILD`): the listing's name, and no cloud.
- **The wrapper decides nothing about the cycle.** It moves bytes. What a
  day's report holds, what the forecast predicts and how two copies reconcile
  are the web app's, in `cycle.ts`, `forecastModel.ts` and `merge.ts`. A
  second copy of that in Swift would drift the first week it existed.

## Building it

See [`../../native/README.md`](../../native/README.md) for the day-to-day, and
[`../../native/RELEASING.md`](../../native/RELEASING.md) for what a store build
needs.
