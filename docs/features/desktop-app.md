# The desktop app

Cycle runs in any browser, and it installs to a home screen or a dock as a
Progressive Web App. There is a third way to have it: a proper desktop download
for **Windows, macOS and Linux**, attached to every release on the
[releases page](https://github.com/niclaslindstedt/period/releases).

## Which file

Pick the one for your machine — the app inside all three is the same app.

- **Windows** — the `.exe` installer.
- **macOS** — the `.dmg`. When the release notes say it is notarized by Apple,
  it opens like any other app. Otherwise the first launch is refused: open
  **System Settings → Privacy & Security**, scroll to the message about Cycle
  and choose **Open Anyway**. macOS remembers after that.
- **Linux** — the `.AppImage` runs on anything without installing; the `.deb`
  is for Debian and Ubuntu.

## What is different from the browser

Almost nothing, deliberately. The desktop app is the website with a window
around it: the same calendar and history, the same settings. Two differences are worth knowing about.

**It needs no network at all.** The whole app is inside the download rather
than fetched and cached, so a first launch on a machine that has never been
online works exactly like a hundredth launch.

**It updates by being replaced.** There is no "a new version is ready" prompt in
here, because there is no deploy for it to notice — a new version is a new
download from the releases page.

## Where your days live

In the app, on your machine, the same way they do in a browser tab — and in a
different place from the browser's. The desktop app has storage of its own, so
the days you keep in Chrome are not the ones the desktop app opens. Connect the same Dropbox in both (Settings → **Storage**) and they share one history.

Uninstalling the app removes that storage with it, so connect a backend or export anything you want to keep first.
