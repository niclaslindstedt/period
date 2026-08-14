# Getting started

## Run it

The app is a static site — there is nothing to provision, no database, no
account.

```sh
npm install     # needs a GitHub Packages token, see below
npm run dev
```

Open the printed URL. Everything you log is written to your browser's
localStorage under the `period:doc` key and nothing else happens: no request
leaves the page until you connect a cloud backend yourself.

### The GitHub Packages token

`@niclaslindstedt/oss-framework` is published to GitHub Packages, which
requires authentication even to read a public package. Create a personal access
token with the `read:packages` scope and tell npm about it once:

```sh
npm config set //npm.pkg.github.com/:_authToken <your-token>
```

CI does the same thing with the workflow's own `GITHUB_TOKEN`, and Claude Code
web sessions do it from `.claude/hooks/session-start.sh`.

## Log your first day

The app opens on the **Report** tab with today selected.

1. Answer **Blood** — yes or no. Any bleeding counts, spotting included. `No`
   is a real answer: it records "I checked and there was nothing", which is
   different from not logging at all, and the cycle derivation treats the two
   differently.
2. Answer **Mood swings** — whether your mood moved noticeably across the day.
3. Optionally, type your **waking temperature** — to two decimal places, taken
   before getting up. Leave it blank on any morning you didn't take one; the
   forecast is built to cope with gaps.
4. **Save report.**

That is the whole screen. To report for an earlier day, press the date at the
top of the card and pick it from the month calendar; the line under the date
says whether the day you are looking at already has a report.

## Watch the forecast appear

There is nothing to configure for the forecast — it is derived from the
reports, so it fills in as you log.

| After you have logged…       | The Forecast tab shows                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Nothing                      | A prompt to log some bleeding days                                                                            |
| One period                   | A prediction from the default 28-day cycle, labelled as an estimate, with a deliberately wide range around it |
| Two periods                  | Your own observed cycle length, a narrower range, and a `Rough estimate` confidence                           |
| Three or more                | A `Fair estimate`, tightening to `Steady pattern` once the range is about a week wide                         |
| Five or more                 | A **Track record** in the advanced view: how far off the model has been on your own past cycles               |
| A few weeks of daily reports | Your mood and temperature patterns, which start sharpening the prediction within each cycle                   |

The prediction is a range, not just a date: the chart shows how likely each day
is, with the bands it falls in half, four-fifths and nineteen-twentieths of the
time. It starts wide and narrows honestly as you log — including _during_ a
cycle, since every day you report without bleeding rules that day out.

The confidence label is not decoration. A date from two cycles and a date from
twelve look the same on a calendar; the label — read straight off the width of
the range — is what tells them apart.

Switch the **Detail** control at the bottom of the screen to **Advanced** if you
want to see the model's parameters, the patterns it has learned from you, and
how well it has scored on your past cycles. It is the same prediction either
way.

## Get it onto your phone

The app is an installable PWA. Open the deployed URL on the phone and use the
browser's install / "Add to Home Screen" action. It then runs offline, opens
without browser chrome, and keeps its own copy of the data — the phone's copy is
independent of the laptop's until you connect sync.

## Keep it on more than one device

Settings → **Sync** connects your own Dropbox or Google Drive. The app writes
one JSON file to a folder in your account, pulls it on open, and pushes about a
second after each edit. Two devices merge day by day, so logging Tuesday on the
phone and Wednesday on the laptop leaves you with both.

See [sync.md](sync.md) for what merges, what doesn't, and where the file lives.

## Back it up

Settings → **Your data** → **Export a backup** downloads every report as a JSON
file you can read in any text editor. **Restore from a backup** merges one back
in — it adds to what is already there rather than replacing it, so restoring an
old backup onto a live phone cannot silently drop this month.
