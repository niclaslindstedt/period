# Cloud sync

Your reports always live on **this device** first. Connect a cloud account and
the app keeps a copy there too:

- **Dropbox** — OAuth (PKCE) with silent token refresh; the document lives in
  the app folder as `cycle.json`.
- **Google Drive** — Google Identity Services consent, `drive.file` scope only;
  the document lives in a `nird-cycle` folder in My Drive.

There is no server in between and no account to create — the app talks to your
provider directly, and the file it writes is plain JSON you can open yourself.

## Two devices, no prompt

Reports merge **day by day, with the later edit winning**. Log Tuesday on your
phone and Wednesday on your laptop and you end up with both — nobody is asked to
pick a side, and nothing is lost. The same merge runs when a conflict is
detected mid-push, and when you restore a backup file.

The one thing it cannot do is propagate a deletion: a cleared day is an absence
rather than a record, so it comes back from any device that still holds it. See
[sync.md](../sync.md) for the details and the reasoning.

## Reading the status

The cloud glyph in the header shows whether everything is pushed, something is
waiting, a save is in flight, or the backend is unreachable. Tapping it always
opens the command centre, which spells the state out and offers Save now,
Reload, Reconnect, and Check connection.
