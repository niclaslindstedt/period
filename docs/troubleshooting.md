# Troubleshooting

## Install and build

**`npm install` fails with `401 Unauthorized`**
`@niclaslindstedt/oss-framework` lives on GitHub Packages, which needs a token
even for public reads. Run
`npm config set //npm.pkg.github.com/:_authToken <token>` with a
`read:packages` token. See [getting-started.md](getting-started.md).

**`tsc` can't find `react` types**
The runtime is Preact. `tsconfig.json`'s `paths` map `react` onto
`preact/compat`, so this usually means `node_modules` is incomplete — re-run
`npm install`.

**A JSX boolean attribute fails to type-check**
Preact types some SVG attributes as strings. Write `focusable="false"`, not
`focusable={false}`.

## The forecast

**It says "Not enough data yet"**
A cycle is measured from one period's start to the next, so it takes two
periods before there is anything to measure. One period gives a prediction from
the default cycle length, labelled as such.

**The predicted date looks wrong**
Open History → Periods. That list is exactly what the averages were computed
from, so a mistyped or missing day shows up there. Fix the day on the Report
tab and every number moves with it.

**A period is late and the app has moved on to next month**
It shouldn't — a passed prediction is reported as overdue until a whole cycle
has gone by. If the app has rolled forward, more than one cycle's worth of time
has passed since the last logged period. Logging the period that did happen
puts the forecast back on track.

**Two periods a couple of days apart show as one**
A single non-bleeding day inside a run is bridged deliberately (see
[cycle.md](cycle.md)). Two or more quiet days split them.

**My old mood tags and notes are gone**
The report was reduced to two yes/no answers, and the update carried across
what the app actually derives anything from: any bleeding level other than
`none` became **Blood: yes**, and any mood swing above `steady` became **Mood
swings: yes**. The mood tags, the bleeding heaviness and the free-text notes
were not migrated — nothing read them. A backup exported before the update
still holds them as plain JSON and can be read in any text editor, but
restoring it runs the same conversion: the days come back, the tags do not.

**The fertile window is showing and I don't want it**
Settings → Cycle → turn off **Show the fertile window**. It disappears from the
Forecast screen and the calendar legend entirely.

## Sync

**"Reconnect needed"**
The provider's session lapsed. Tap the cloud glyph → **Reconnect**. Google
Drive's popup tokens are short-lived by design, so this is normal after a while
rather than a fault.

**"Offline — editing a local copy"**
The backend was unreachable. Your edits are safe locally and push on their own
once it comes back; **Check connection** in the command centre re-probes
immediately.

**A day I deleted came back**
Expected — deletions don't propagate. See
[sync.md](sync.md#the-known-limitation-deletions-come-back).

**Two devices show different data**
Both need to have synced. Open the command centre on each and check the status
reads "synced" rather than showing pending edits; **Save now** and **Reload**
force each direction.

## Data

**"Couldn't read the reports saved on this device"**
The stored document couldn't be parsed. The original bytes are left untouched
and a copy is quarantined under `period:doc:unreadable`. The usual cause is a
stale, service-worker-cached build reading a document a newer build already
upgraded — it resolves itself once the update finishes. If it persists, export
the quarantined value from devtools and open an issue.

**Everything disappeared**
Clearing site data (or a browser's "clear cookies and site data" for the
origin) removes localStorage, and there is no server copy to restore from. If
sync was connected, the cloud file still has it — reconnect and it merges back.
If not, restore a backup.

**How do I delete everything for good?**
Settings → Your data → **Delete everything** clears this device. If a cloud
backend is connected, also delete the file from the provider's own file browser
— disconnecting removes this device's tokens but deliberately leaves the cloud
copy alone.
