# Sync

The app is local-first: your reports live in this browser, and that copy is
always the working copy. Sync adds a second copy in **your own** cloud account
so another device can read it. There is no server in between — the app talks to
Dropbox or Google Drive directly from the page.

## What gets stored, and where

One JSON file — the same document the app keeps locally, byte for byte:

| Backend      | Path                           |
| ------------ | ------------------------------ |
| Dropbox      | `Apps/Cycle/cycle.json`        |
| Google Drive | `Cycle/cycle.json` in My Drive |

You can open it, read it, back it up, or delete it from the provider's own file
browser. It is the format documented in
[architecture.md](architecture.md#the-shape-of-the-data).

Google Drive access uses the `drive.file` scope: the app can see the files it
created and nothing else in the account.

## Connecting

Settings → **Sync** → pick a provider. Dropbox redirects to its consent screen
and back; Google Drive opens a token popup. Either way the tokens land in this
browser's localStorage and are used for nothing but that one file.

A provider whose client id wasn't configured at build time doesn't appear in
the picker at all — see [configuration.md](configuration.md).

**Disconnecting** removes the tokens from this device. Your reports stay here,
and the copy already in the cloud is left exactly where it is; delete it in the
provider's file browser if you want it gone.

## How the two copies reconcile

Day by day, with the later edit winning.

Every report carries the timestamp of its last edit. When two copies meet, the
merge walks the union of their days and keeps, for each day, whichever side
edited it more recently. So:

- Logging Tuesday on the phone and Wednesday on the laptop leaves you with
  both. No prompt, no "which side do you want to keep?", no lost day.
- Editing the _same_ day on both devices keeps the later edit and drops the
  earlier one — the only case where anything is discarded, and the one where
  there is no other honest answer.
- The merge is order-independent: both devices reach the same document
  regardless of which syncs first.

The same merge runs when you restore a backup file, which is why a restore adds
to what is already there instead of replacing it.

### The known limitation: deletions come back

A deleted report is an _absence_, not a tombstone. If you clear a day on your
phone and your laptop still holds it, the laptop's copy reappears on the next
merge — the phone has nothing to say about the day, so there is nothing for the
merge to prefer.

This is a deliberate trade. Reports are added far more often than deleted, and
the alternative (tracking deletions as records) means carrying tombstones
forever to protect a rare operation. If you need a day gone everywhere, clear
it on each device, or clear it on one and let that device sync before the other
one opens.

## When it pushes and pulls

- **On open**, the app pulls the cloud copy and merges it in.
- **After an edit**, it pushes about a second later — long enough to coalesce a
  burst of taps on the report screen into one request.
- **On conflict** (the backend moved on under a queued push), it merges the
  backend's newer copy in and pushes the merged result. Nothing is dropped and
  nothing is asked of you.

Pushes are held while the app is offline, while a backend session has lapsed,
and until the first pull has established the backend's revision — pushing on an
unknown revision is what produces phantom conflicts. Your edit is safe in
localStorage the whole time.

Sync is suspended entirely — no pull, no push — while the developer **Demo
data** switch is on, because the reports on screen then are invented ones. The
credentials and the copy already in the cloud are untouched, and turning the
switch off (or reloading) resumes from your real document.

## Reading the status

The cloud glyph in the header is the whole state machine, and tapping it always
opens the command centre:

| Glyph                | Meaning                                                               |
| -------------------- | --------------------------------------------------------------------- |
| Cloud with a tick    | Everything is pushed                                                  |
| Cloud with an arrow  | Local edits waiting to push                                           |
| Spinner              | A push is in flight                                                   |
| Struck-through cloud | Offline — you are editing the local copy                              |
| Cloud with an alert  | Session lapsed, rate-limited, or a failed save; the details say which |

The command centre spells out the status, names the file's location, and offers
**Save now**, **Reload**, **Reconnect**, and — while offline — **Check
connection**. With developer mode on it also shows the sync log, newest line
first.

## What is _not_ sent

Nothing but that one file, to that one account. No analytics, no error
reporting, no telemetry, no third-party requests at runtime — the fonts are
bundled and served from the app's own origin. If you never connect a backend,
the app makes no network requests at all after it loads.
