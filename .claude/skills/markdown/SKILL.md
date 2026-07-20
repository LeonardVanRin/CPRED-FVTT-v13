[SKILL.md](https://github.com/user-attachments/files/30197521/SKILL.md)
---
name: markdown
description: Format and lint any Markdown file after creating or editing it — docs, READMEs, specs, plans, and skill `SKILL.md` files included. Use immediately after every Write/Edit to a `.md` file, before treating it as done.
---

# Markdown formatting & linting

Every Markdown file this repo touches is formatted with **Prettier** and linted with **markdownlint** —
both already installed (`devDependencies`), configured by `.prettierrc.json` and `.markdownlint.yaml`.
There is no npm script for it; run the tools directly on the file you changed.

## After writing or editing any `.md`

Run, from the repo root, on the file you just changed:

```bash
npx prettier --write <file>.md      # fixes formatting (wrapping, lists, spacing)
npx markdownlint --fix <file>.md    # auto-fixes what it can; prints anything left
```

Then **fix by hand** whatever `markdownlint` still reports (structural rules Prettier and `--fix` won't
resolve — e.g. heading levels, duplicate headings, bare URLs). Re-run `npx markdownlint <file>.md` until
it's clean.

This applies to **all** Markdown, including the skill files under `.claude/skills/**/SKILL.md` — format
and lint them the same way.

## Notes

- `markdownlint` auto-discovers `.markdownlint.yaml`; `prettier` auto-discovers `.prettierrc.json`. Run
  from the repo root so both are found.
- `.claude/` is **not** in `.prettierignore`, so skill files are formatted like any other doc.
- To sweep everything at once: `npx prettier --write '**/*.md' && npx markdownlint --fix '**/*.md'`
  (respects the ignore files).
