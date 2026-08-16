---
name: maintenance
description: "Use when you want to bring every drift-prone artifact in the repo back into sync. Dispatches to all individual update-* skills in the correct order, aggregates their results, and leaves a single combined commit ready to review."
---

# Maintenance

This is the umbrella skill for cycle, mandated by §21.6 of `OSS_SPEC.md`. It does no rewriting itself — it decides which sync skills are stale, runs each one, and reports a combined summary. Use it when you do not know which specific artifact is out of date, or when several have likely drifted at once (for example, after a large merge).

## When to run

- After a big merge from the default branch when you are not sure which surfaces moved.
- On a cadence (weekly / before a release) as a "drift sweep".
- When CI flags a staleness check but it is unclear which skill to invoke.

Do **not** use this skill for a targeted fix — if you know exactly which artifact is stale, call the corresponding `update-*` skill directly.

## Tracking mechanism

Each skill records the commit it last ran against in `.agent/skills/<skill>/.last-updated`. That file is the baseline every discovery step diffs from. An empty or missing file means "never run" — treat the whole history as the diff.

## Registry

The registry is the single source of truth for which sync skills exist in this repo. Every skill directory under `.agent/skills/` must appear here exactly once.

| Skill             | Fixes                                                            | Spec sections | Run order                                                                       |
| ----------------- | ---------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| `write-changeset` | A user-visible change with no fragment in `.changes/unreleased/` | §8.4          | 1 — run first; the fragment describes the change the other skills then document |
| `update-docs`     | `docs/*.md` vs. source of truth                                  | §11.1         | 2                                                                               |
| `update-readme`   | `README.md` vs. the current public surface                       | §3            | 3                                                                               |

Run order matters: `update-readme` reads the docs that `update-docs` rewrites, so it must run after it. A new skill that reads files another skill rewrites goes after that skill.

## Discovery process

For each skill in the registry, decide whether it needs to run:

1. Read the skill's baseline:

   ```sh
   BASELINE=$(cat .agent/skills/<skill>/.last-updated 2>/dev/null)
   ```

2. Diff the watched paths for that skill against the baseline:

   ```sh
   git diff --name-only "$BASELINE"..HEAD
   ```

   If any file in the skill's mapping table appears in the diff, schedule the skill.

3. Build the list of skills to run, preserving the run order from the registry.

## Mapping

| Changed source                                                     | Skill to schedule |
| ------------------------------------------------------------------ | ----------------- |
| `.changes/unreleased/` is empty while `src/` changed               | `write-changeset` |
| `src/app/**`, `src/*.ts*`, `pwa-plugin.ts`, `vite.config.ts`       | `update-docs`     |
| `Makefile`, `package.json` scripts, `src/vite-env.d.ts`, `docs/**` | `update-readme`   |

## Execution

For each scheduled skill, in order:

1. Load `.agent/skills/<skill>/SKILL.md`.
2. Follow its discovery process, mapping table, and update checklist exactly.
3. Verify the skill's own verification section passes.
4. Record the commit hash the skill wrote to its `.last-updated`.

Between skills, do **not** commit — aggregate all edits into a single working tree so the final commit covers the whole sync sweep.

## Update checklist

- [ ] Read every skill's `.last-updated` and build the schedule
- [ ] Run each scheduled skill in registry order
- [ ] After all skills finish, run:
  - [ ] `make fmt`
  - [ ] `make lint`
  - [ ] `make test`
- [ ] Stage every touched file (including each updated `.last-updated`)
- [ ] Commit with a conventional-commit message describing the sweep
- [ ] Update this skill's own marker:

      git rev-parse HEAD > .agent/skills/maintenance/.last-updated

## Verification

1. Every scheduled skill's verification section must pass.
2. `make lint` and `make test` must pass.
3. The final diff should touch only documentation, changeset fragments, and skill `.last-updated` files — code changes mean a skill overstepped.
4. Every skill that ran must have its `.last-updated` rewritten with the same commit hash.

## Skill self-improvement

After every run, update this file:

1. **Add new sync skills to the registry**, in run order, with their spec sections.
2. **Adjust run order** if you discovered a hidden dependency.
3. **Record drift signals.** If a change should have triggered a skill but did not appear in any skill's mapping table, extend that skill's mapping table — not this one.
4. **Commit the skill edits** together with the drift sweep.
