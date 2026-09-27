# Sync

The app is local-first: your reports live in this browser, and that copy is
always the working copy. Sync adds a second copy in **your own** cloud account
so another device can read it. There is no server in between — the app talks to
Dropbox directly from the page.

## What gets stored, and where

One file — the document the app keeps locally, **encrypted on this device
before it is sent** (see [Encryption](#encryption) below):

| Backend | Path                    |
| ------- | ----------------------- |
| Dropbox | `Apps/cycle/cycle.json` |

You can see it, back it up, or delete it from the provider's own file browser,
but not read it: it is an `oss.encrypted.v1` envelope (AES-256-GCM,
PBKDF2-SHA256 at 600,000 iterations), and only your passphrase opens it.
Decrypted, it is the format documented in
[architecture.md](architecture.md#the-shape-of-the-data).

### If you synced before the rename

The folder used to be called `Cycle`, and it moved to `cycle` when the app
did. A build looks in exactly one folder, so an account that synced to the old
one will look empty on the first connection after the rename.

Nothing was deleted — `Apps/Cycle/cycle.json` and `Cycle/cycle.json` are still
where they were. Move or copy that file into the new folder from your
provider's own file browser and the history comes back: the two copies merge
day by day rather than one replacing the other (see below), so nothing is lost
whichever copy is newer. An old file is plaintext; the app re-writes it
encrypted the first time it reads it. The reports on the device you had been using were
never in the cloud copy's hands anyway — they are still in that browser.

## Connecting

Settings → **Sync** → pick a provider. Dropbox redirects to its consent screen
and back (in the phone app, in a sheet over the app). The tokens land in this
browser's localStorage and are used for nothing but that one file.

A provider whose client id wasn't configured at build time doesn't appear in
the picker at all — see [configuration.md](configuration.md).

**Disconnecting** removes the tokens and the remembered passphrase from this
device. Your reports stay here,
and the copy already in the cloud is left exactly where it is; delete it in the
provider's file browser if you want it gone.

## Encryption

A copy that leaves this device is always encrypted, and there is no switch to
turn that off — it is a requirement of every backend that is not this device,
not a setting (`useRequiredEncryption` from the framework, wired in
`src/app/useSyncEngine.ts`). Until a passphrase is held, the sync engine has no
adapter to talk to, so nothing is pulled or pushed at all.

- **First connect.** The app looks at what the backend holds. Nothing yet (or
  an old plaintext copy) → it asks you to **choose a passphrase**, twice. An
  old plaintext copy is re-written as ciphertext on the first read after that.
- **Another device.** The backend already holds an envelope → it asks you to
  **enter the passphrase** you chose; a wrong one is refused and nothing
  syncs.
- **Remembered here.** The passphrase is remembered on this device (in
  localStorage, beside the reports themselves, which are already plaintext
  here), so a device asks once, not on every open. What it protects is the
  copy the provider holds: Dropbox only ever sees ciphertext.
- **Changing it.** Settings → Sync → **Change the passphrase** re-encrypts the
  cloud copy. Your other devices find their passphrase no longer opens it,
  forget it, and ask for the new one.
- **Forgetting it.** Nobody can recover a forgotten passphrase — not the app,
  not Dropbox. The reports on each device are unaffected; disconnect, delete
  the cloud file, and connect again with a new passphrase.

The on-device copy is not encrypted by this. If the phone itself needs a lock,
that is the [app lock](features/encryption.md#app-lock).

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
while no passphrase is held,
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

Nothing but that one encrypted file, to that one account. No analytics, no error
reporting, no telemetry, no third-party requests at runtime — the fonts are
bundled and served from the app's own origin. If you never connect a backend,
the app makes no network requests at all after it loads.
