---
name: update-readme
description: "Use when the project's public surface has changed — commands, configuration, features, or badges — and README.md may no longer describe it. Rewrites the affected README sections so a first-time reader is not misled."
---

# Update README

Keeps `README.md` true to the current public surface (OSS_SPEC §3). The README is the only document most people read, and its Quick start is the one thing that must work from a clean checkout — a stale command there costs a contributor before they have written a line.

## When to run

- A `make` target or npm script was added, renamed, or removed.
- A `VITE_*` variable changed.
- A feature was added, removed, or meaningfully reshaped.
- A workflow was added or renamed (the badge row names workflows by file).

## Tracking mechanism

`.agent/skills/update-readme/.last-updated` holds the commit this skill last ran against:

```sh
BASELINE=$(cat .agent/skills/update-readme/.last-updated 2>/dev/null)
git diff --name-only "${BASELINE:-$(git rev-list --max-parents=0 HEAD)}"..HEAD
```

## Discovery process

1. Diff from the baseline and pick out changes to `Makefile`, `package.json`, `src/vite-env.d.ts`, `.github/workflows/`, `docs/`, and `src/app/*Screen.tsx`.
2. Read the README end to end. The twelve §3 sections must all still be present and in order: What / Why / Prerequisites / Install / Quick start / Usage / Configuration / Examples / Troubleshooting / Documentation / Contributing / License.
3. Run the Quick start commands as written, from the repo root, and confirm they do what the README says they do.
4. Check the Examples block still type-checks against the current API — it is real code, and the app's exported shapes move.

## Mapping

| Changed source                         | README section                                   |
| -------------------------------------- | ------------------------------------------------ |
| `Makefile`, `package.json` scripts     | Quick start; the command list in `AGENTS.md` too |
| `src/vite-env.d.ts`, `vite.config.ts`  | Configuration table                              |
| `src/app/cycle.ts` exports             | Examples block                                   |
| `src/app/*Screen.tsx`, `BottomNav.tsx` | Usage table                                      |
| `docs/*.md` added or renamed           | Documentation list                               |
| `.github/workflows/*.yml`              | Badge row                                        |
| `LICENSE`                              | License section and the license badge            |

## Update checklist

- [ ] Rewrite the affected sections; keep the §3 section order intact
- [ ] Verify every badge URL points at a workflow file that exists
- [ ] Verify every relative link resolves
- [ ] Run the Quick start from a clean checkout
- [ ] Confirm the Examples block compiles against the current exports
- [ ] Keep the "not a medical device" note at the foot — it is not decoration
- [ ] `make fmt`
- [ ] Record the marker:

      git rev-parse HEAD > .agent/skills/update-readme/.last-updated

## Verification

1. All twelve §3 sections present, in order, with no placeholder text.
2. Every command in the README runs successfully from a clean checkout.
3. Every link and badge resolves.
4. `make fmt-check` passes.

## Skill self-improvement

If a change type falsified the README in a way this mapping table does not cover, add the row. If the Quick start needed a step the README does not mention, that is a README bug, not a note for this file — fix the README.
