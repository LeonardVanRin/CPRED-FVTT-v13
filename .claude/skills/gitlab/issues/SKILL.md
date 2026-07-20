[SKILL.md](https://github.com/user-attachments/files/30197486/SKILL.md)
---
name: gitlab-issues
description: Draft or file a GitLab issue for this project using the team's issue templates. Use when asked to raise, file, open, create, or draft a GitLab issue (bug, feature, localization, module support, DLC content). Keeps issues concise — problem + steps to reproduce, no implementation detail.
---

# Raising GitLab issues

Issues for this project go to the gitlab.com project `cyberpunk-red-team/fvtt-cyberpunk-red-core`.
**Always start from the team's issue template** — never invent your own headings.

## Pick a template

The canonical templates live in the sibling `templates` repo under `.gitlab/issue_templates/` (it's the
`cyberpunk-red-team` group's template project, so these are exactly what GitLab offers in the issue-template
dropdown). **Don't hardcode a path to that repo** — its checkout location is developer-specific. Resolve it
from `foundryconfig.json`:

```bash
cat "$(jq -r '.repos.templates' foundryconfig.json)/.gitlab/issue_templates"
```

**Read the actual template file before filling it in** — don't reconstruct it from memory; the headings and
the trailing label matter.

| Template            | Use for                                                                  |
| ------------------- | ------------------------------------------------------------------------ |
| `Bug.md`            | a bug, defect, regression, or unexpected behaviour                       |
| `Feature.md`        | a feature request or enhancement                                         |
| `Localization.md`   | requesting support for a new language (you must be able to proofread it) |
| `Module Support.md` | an issue with a third-party Foundry module                               |
| `DLC Content.md`    | compendium / DLC content lists                                           |
| `Default.md`        | just a picker that points at the above — never file this one             |

If unsure which fits, ask the dev rather than guessing.

## Fill it out

- **Keep every heading the template ships with**, in order, and replace each `[Type text here]` placeholder.
- **Be concise and concrete.** State the problem, then give numbered **Steps to Reproduce** with
  **Expected** vs **Actual** results. A reader should be able to reproduce it without further questions.
- **Leave implementation out.** No proposed fixes, file paths, code design, or work breakdowns — that
  belongs in the MR, not the issue. An issue describes _what_ and _why_, never _how_.
- **Bugs:** fill in _Versions and builds_ (Foundry VTT + Cyberpunk RED versions) and _Have you been able
  to reproduce_.
- **Keep the trailing `/label ~"…"` quick-action line** the template ends with — it sets the type label
  when the issue is created.

## Draft vs. file

Creating an issue is public and outward-facing. **Default to drafting** — write the filled-in markdown and
show it to the dev — and only run `glab issue create` when they explicitly say to raise it.

## File it (glab)

`glab` (already installed and API-authenticated — no SSH key dance needed) files from inside the repo:

```bash
glab issue create \
  --title "Short imperative title" \
  --description "$(cat issue.md)" \
  --yes
```

- The repo is inferred from the `origin` remote; add `-R cyberpunk-red-team/fvtt-cyberpunk-red-core` to be
  explicit.
- The `/label` line in the body applies the type label; alternatively pass `--label "Type::Feature"`.
- `glab` prints the new issue's URL on success — report it back to the dev.
