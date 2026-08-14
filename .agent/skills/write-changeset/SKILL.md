---
name: write-changeset
description: "Use before opening a PR with any user-visible change, to add the changelog fragment under .changes/unreleased/ that the release pipeline collates into CHANGELOG.md and derives the semver bump from."
---

# Write a changeset

`CHANGELOG.md`'s released sections are generated, never hand-written (OSS_SPEC §8.4). Each user-visible change contributes one fragment under `.changes/unreleased/`; `version-bump.yml` collates them into a dated section and derives the semver bump from their front matter. CI's `changeset` job fails a PR that changes user-visible code without one.

## When to run

- Before opening any PR that changes what a user sees or can do.
- Not for pure refactors, CI/build tweaks, or docs-only changes — those are on the skip-list in `scripts/release/check-changeset.mjs`, or can be opted out with the `no-changelog` label.

## Tracking mechanism

`.agent/skills/write-changeset/.last-updated` holds the commit this skill last ran against. Unlike the `update-*` skills this one is per-change rather than periodic, so the marker is mostly a record of the last fragment written.

## Discovery process

1. Find what the branch actually changed:

   ```sh
   git diff --name-only origin/main...HEAD
   git log --oneline origin/main..HEAD
   ```

2. Decide whether it is user-visible: would someone using the app notice, without reading the source? A new control, a changed default, a fixed wrong number, a faster start — yes. A renamed internal helper — no.

3. Check whether a fragment already exists for it:

   ```sh
   ls .changes/unreleased/
   ```

4. Pick the `type` from what the change did to the _user's_ experience, not from the commit type:

   | `type`       | Use for                            | Bump  |
   | ------------ | ---------------------------------- | ----- |
   | `Added`      | Something you can now do           | minor |
   | `Changed`    | Something behaves differently      | minor |
   | `Removed`    | Something is gone                  | minor |
   | `Deprecated` | Something is on its way out        | minor |
   | `Fixed`      | Something was wrong and now is not | patch |
   | `Security`   | A vulnerability was closed         | patch |

   `breaking: true` forces a major bump — for this app that means a document-format change an older build cannot read, or a removed setting.

## Mapping

| Changed source                         | Fragment needed                           |
| -------------------------------------- | ----------------------------------------- |
| `src/app/*Screen.tsx`, `BottomNav.tsx` | Yes — the UI moved                        |
| `src/app/cycle.ts`, `moods.ts`         | Yes — the numbers a user reads changed    |
| `src/app/useSyncEngine.ts`, `merge.ts` | Yes — sync behaviour is user-visible      |
| `src/app/types.ts`, `migrations.ts`    | Yes, and consider `breaking: true`        |
| `src/app/i18n/en.ts` alone             | Only if the wording change alters meaning |
| `tests/`, `docs/`, `.github/`, config  | No                                        |

## Update checklist

- [ ] Write the fragment (see the shape below)
- [ ] Title is a short noun phrase, not a commit subject ("Mood swings by phase", not "feat: add phase bucketing")
- [ ] Body is **one sentence**, in the user's vocabulary — no file names, no symbol names, no "refactored"
- [ ] For a substantial feature, add a `[Learn more](feature:<slug>)` link and make sure `docs/features/<slug>.md` exists
- [ ] Preview the bump the release will derive: `make bump`
- [ ] Record the marker:

      git rev-parse HEAD > .agent/skills/write-changeset/.last-updated

### The fragment's shape

```sh
cat > ".changes/unreleased/$(date +%s)-short-slug.md" <<'FRAGMENT'
---
type: Added
title: Short bold title
---

One sentence a user will read in the changelog.
FRAGMENT
```

## Verification

1. `node scripts/release/check-changeset.mjs` passes for the branch.
2. `make bump` prints the bump you expected.
3. `make changelog VERSION=0.0.0` renders the fragment as intended — then revert that preview, since collating consumes the fragments.
4. Any `feature:` link in the fragment resolves to a real file under `docs/features/`.

## Skill self-improvement

If a change type turned out to be user-visible in a way the mapping table calls invisible (or the reverse), fix the row. If a fragment you wrote read badly in the collated changelog, note what made it read badly in the checklist.
