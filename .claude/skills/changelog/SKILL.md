[SKILL.md](https://github.com/user-attachments/files/30197470/SKILL.md)
---
name: changelog
description: Add an entry to CHANGELOG.md — a feature, change, bug fix, or a GM "Action Needed" note. Use whenever a change should be recorded in the changelog. Entries are terse and placed to avoid merge conflicts with other open MRs.
---

# Editing the changelog

Entries go under the **top `## Version X.YY` block** of `CHANGELOG.md` (the in-progress release). English
`CHANGELOG.md` is the source — never edit the translated `CHANGELOG.<lang>.md` files; a Crowdin bot
regenerates them.

## Write a terse entry

One `-` bullet. Name the feature / fix / change and **no more** — communicate it, don't explain it. Put it
in the right section (the block's sections, in order):

- **New Features** — a new player-facing capability
- **Changes** — changed behaviour
- **Bug Fixes** — a fix
- **Plumbing** — internal / dev / CI / refactor, nothing player-visible

Terse enough:

```text
- Add a `red` die modifier (explode-on-max / implode-on-1) usable in any roll formula
- Fix grouped-pool formulas throwing when used as an item's Damage value
```

Too much — trim to the change itself:

```text
- Added a new `red` die modifier which, when appended to a die term, makes it explode once on its
  maximum face and implode once on a natural 1, and which supersedes Foundry's own explode… (etc.)
```

## Action Needed (manual GM steps)

If a change needs a GM to act by hand because no suitable migration can be written — **the dev decides
whether a migration is possible; confirm with them, don't assume** — record it in `### Action Needed` (as
well as any normal-section entry). Give a terse description of what changed and why hands-on action is
needed, then **numbered** steps the GM follows:

```text
### Action Needed

- Ammo damage overrides no longer accept grouped-pool formulas. Fix any affected ammo by hand:
  1. Open the ammo item's sheet.
  2. Replace the Damage value with a plain die expression (e.g. `3d6+2`).
  3. Save.
```

## Place it to avoid merge conflicts

Most CHANGELOG conflicts happen because MRs pile their entry onto the same line — usually the **end** of a
section. There is **no safe fixed position**: "always insert at the top" (or bottom) just relocates the
pile-up — if every MR follows the same rule, they all collide at the new spot. A conflict happens when two
branches insert into the **same gap** between two base lines; it's avoided only when your line and theirs
sit at **different, non-adjacent** anchors. So place relative to the other open MRs, not by a fixed rule:

1. Dump what every open MR is adding to the changelog, and where:

   ```bash
   for iid in $(glab mr list --per-page 100 | grep -oE '![0-9]+' | tr -d '!' | sort -u); do
     glab mr diff "$iid" --raw \
       | awk '/^diff --git.*CHANGELOG\.md/{f=1;next} /^diff --git/{f=0} f&&/^\+[^+]/' \
       | sed "s|^|!$iid |"
   done
   ```

2. Anchor your bullet **right after a distinctive existing line that no open MR is inserting at or next
   to** (a specific older entry in the target section works well). Different, non-adjacent anchors merge
   cleanly; the same gap conflicts.
3. Don't contort. If the section is tiny and every open MR is already crowded into it, just add your line
   — a CHANGELOG conflict is trivial to resolve (keep both entries). The goal is fewer needless
   collisions, not zero.

Keep the diff to your added line(s). `CHANGELOG.md` is already Prettier/markdownlint clean, so don't let a
formatter reflow the whole file — a big reflow is itself a conflict magnet.

Then, per the Markdown rule, `npx prettier --write CHANGELOG.md` (a no-op if you only added a clean line)
and `npx markdownlint CHANGELOG.md`.
