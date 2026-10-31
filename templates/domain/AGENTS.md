# AGENTS.md

Instructions for any agent working on **__REPO_NAME__**, an Alan OS domain, whatever the
harness (Claude Code, Codex or another). This file points to where things are; it does not
repeat them.

## What this is

__PURPOSE__

Its charter is `charter.json`. Its brief is [docs/00-brief.md](docs/00-brief.md).

## The law

[CONSTITUTION.md](CONSTITUTION.md) binds, under the Alan OS constitution in
`AlanOS/constitution/`. Read it before you change what the domain does. Nothing here or in
a skill overrides it.

## You may not read

Every private folder on the constitution's VIS-S4 list (`evidence/`, `knowledge/`,
`audit/`, `review-queue/`, `data/` and the rest) is refused by `.claude/settings.json`.
Do not work around the refusal. Tests build their own data. If a task seems to need the real records,
stop and ask the owner.

## Before you finish

`pnpm check` must pass. If you changed a tool, run `pnpm emit:manifest` and commit the
manifest with the code. Never push: pushes are the owner's.
