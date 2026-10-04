# The domain-kit constitution

**Status:** IN FORCE from the first commit. This repository is a shared tooling library under the Alan OS federation (Schedule FED, FED-S3 as amended). It is not a domain: it holds no knowledge, no evidence, and no store of any kind, so destroying it loses nothing a `pnpm install` cannot restore (FED-9).

These rules bind this repository only, in the pattern DOC-5 sets: a rule that binds one thing lives in that thing's constitution.

## What the kit is

A library of wire and plumbing that a domain calls. Each module is importable on its own. There is no object and no lifecycle that owns a domain's `main()`; a domain composes functions.

## The rules

1. **The kit never owns a domain decision.** It defines no MCP tool, no schema, no entity type, no policy, no threshold, no watch list, no deny list, and no manifest body. Everything domain-specific enters as an explicit parameter. If a change wants the kit to define one of these, the change is wrong by this rule.
2. **The kit never imports from a domain**, and never discovers configuration by convention. A domain hands the kit what it needs at the call site.
3. **The kit writes no file except where the domain points it.** The manifest engine writes the path it is given; the commit engine commits the paths it is given; nothing else writes at all.
4. **The kit's version is invisible to callers.** It appears in no manifest, no contract, and no tool response. A domain's exterior is its manifest and its MCP tools; which kit version built them is interior (FED-12).
5. **Each domain pins its own kit version** and upgrades on its own schedule. A kit release never forces a domain's constitution floor to move, and no kit change may require two domains to upgrade together (FED-8).
6. **The exit path is guaranteed.** Any domain can vendor the files it uses back into its own `src/` and drop the dependency without touching its exterior. Nothing in the kit may be built in a way that makes leaving it harder.
7. **This repository is public, so nothing personal enters it.** The source names no domain, no person, and describes no domain's evidence. Constitution clause ids (EV-14, VIS-S5) are fine: they say a constitution exists, not what any domain holds. `pnpm check:hygiene` enforces the list in `scripts/check-hygiene.mjs` and is part of `pnpm check`.
8. **A release states what it implements.** Each tagged version's notes name the Alan OS constitution version and the standards (status, improvement, manifest, sandbox) it was written against.
9. **Code is never committed by the engines here** (EV-14). The commit engine stages exactly the content paths it is handed, and pushing is always the owner's act.
