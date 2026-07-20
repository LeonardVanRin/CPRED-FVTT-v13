[SKILL.md](https://github.com/user-attachments/files/30197500/SKILL.md)
---
name: gitlab-merge-requests
description: Draft or open a GitLab merge request for this project using the team's MR template. Use when asked to raise, open, create, or draft an MR / merge request. Keeps it terse — an overview with one bullet per major change, plus ordered, human-followable test steps.
---

# Raising merge requests

MRs target `dev` on `cyberpunk-red-team/fvtt-cyberpunk-red-core`. **Always start from the team's MR
template** — keep its headings.

## Template

There's one MR template. Don't hardcode the sibling-repo path; resolve it from `foundryconfig.json`:

```bash
cat "$(jq -r '.repos.templates' foundryconfig.json)/.gitlab/merge_request_templates/Default.md"
```

Read it, keep every heading, and fill each section terse.

## Fill it out

- **Intent** — a 1–2 sentence overview of what the MR does and why, then **one bullet per _major_
  change** (a behaviour, API, or data-shape change). Not a per-commit changelog — skip incidental
  refactors. Keep implementation detail out; reviewers read the diff.
- **Steps to Test** — the load-bearing section. Numbered, in order, **followable by a human with no
  context**, like bug repro steps. Group them per thing to check: the steps to exercise it, then the
  result they should see. Cover each major change. Shape:

  ```text
  ### Steps to Test
  1. Open a weapon and set Damage to `{3d6,12}kh`, then roll damage.
     → the roll is refused with a "not supported in a Damage field" warning (no crash).
  2. In chat, type `/r 1d6red4dmg`.
     → the roll is blocked with a red/dmg warning; nothing is posted.
  3. In chat, type `/r 1d10red`.
     → rolls normally.
  ```

- **Screenshots (visible UI changes only)** — if the MR adjusts a sheet layout or makes visible CSS
  changes, add a **before / after** table: two columns (`Before` | `After`), **one change per row**, as
  many rows as needed. Skip entirely for non-visual changes.

  ```text
  | Change | Before | After |
  | --- | --- | --- |
  | Skill list spacing | ![](before-skills.png) | ![](after-skills.png) |
  ```

  Capture the shots with the browser/Playwright tooling, then upload each with `glab` and put the
  returned reference in the cell:

  ```bash
  glab api --form file=@before.png \
    "projects/cyberpunk-red-team%2Ffvtt-cyberpunk-red-core/uploads"
  ```

  The response's `.markdown` (e.g. `![before](/uploads/<hash>/before.png)`) drops straight into the table
  cell; `.url` is the bare path if you want to size it with raw `<img>`. (Web-UI drag-drop yields the same
  `/uploads/…` links if you'd rather attach by hand.)

- **Related Issues** — list **only issues this MR should close.** ⚠️ An automation closes _every_ issue
  referenced **anywhere** in the description on merge — not just this section, and regardless of keyword.
  So never write an issue number (`#nnn`) anywhere in the description unless you intend it to close: to
  merely _mention_ a related-but-not-closed issue, link it by URL or refer to it by title instead of `#nnn`.
  Replace the placeholder `#100`.
- **Checklist** — set the boxes: `[x]` = applies, `[~]` = not applicable (the template's convention).
  Almost every change is for the next release, so leave "next release" checked unless it's a hotfix.
- **Future Work / Additional Notes** — terse, or delete the heading if there's nothing to say.

## Milestone

The MR should carry the milestone for the release it's going into (not part of the description — it's an
MR attribute, set with `--milestone`). Find the target version from the **top `## Version X.YY` heading of
`CHANGELOG.md`** (the in-progress release), then match it to an active project milestone:

```bash
head -1 CHANGELOG.md                                         # actually: first `## Version …` line
glab api "projects/cyberpunk-red-team%2Ffvtt-cyberpunk-red-core/milestones?state=active" \
  | jq -r '.[].title'                                        # e.g. 0.95.0  0.94.0  0.93.0
```

Milestones are titled `X.YY.Z` (no `v` prefix). A **bare `X.YY`** in the changelog maps to `X.YY.0` —
e.g. changelog `## Version 0.93` → milestone `0.93.0`. Pass it as `--milestone 0.93.0`.

## Draft vs. open

Opening an MR is outward-facing. **Default to drafting** the description and showing it; only run
`glab mr create` when the dev explicitly says to open it.

## Open it (glab)

Push the source branch, then create the MR:

```bash
git push -u origin HEAD          # remote git — uses this machine's configured auth
glab mr create \
  --target-branch dev \
  --title "Short imperative title" \
  --description "$(cat mr.md)" \
  --milestone 0.93.0 \
  --yes
```

- `glab` is API-authenticated (no SSH needed for the API call; the branch push is ordinary git).
- `--fill` can seed title/description from the commits, but prefer a curated description off the template.
- `glab` prints the MR URL on success — report it back to the dev.
