# @alanos/domain-kit

Shared wire and plumbing for Alan OS domain repositories. A domain is a standalone repository that serves durable personal knowledge through MCP under the Alan OS constitution; this kit removes the machinery every such repository used to copy by hand, and nothing else.

## Modules

- `createMcpServer` / `connectMcpServer`: the MCP server bootstrap. Structured rejections flagged as errors without losing their shape, no-argument tools registered without an input schema, and `acceptMissingArguments` filling in an absent `arguments` field at the wire so a tool whose inputs are all optional is callable with none.
- `emitManifest`: the manifest emitter engine. Capabilities are derived from the running tool registry, never copied beside it; `--check` fails when the committed manifest is not what the code would emit. The manifest body is the domain's own and arrives as a parameter.
- `createDomainGit`: the EV-14 commit engine. Every write commits exactly the paths it wrote, in the same act; a commit that cannot be made never fails the action and is reported instead. Includes `list_changes` and `commit_pending` for the owner's application, and, for a domain that declares `captured` paths, the at-least-daily rhythm for content captured without an act of the owner (`capturedState`, `commitCaptured`, `commitCapturedIfDue`). Pushing is always the owner's act.
- `improvement`: the shapes, schemas and pure functions of the domain improvement standard (`list_pending`, `list_updates`, `list_insights`, `get_insight_report`, `transition_insight`), parameterized by the domain's id and threshold. The watch list and threshold are the domain's own.
- `composeStatus`: the status standard's response shape.
- `appendAuditRecord` / `readAuditLog`: the append-only action log with request-id replay.
- `@alanos/domain-kit/testing`: `sandboxConformance`, the executor sandbox test suite. Call it from one test file; the deny lists stay in the domain's own `.claude/settings.json`.
- `tsconfig.base.json`: the shared compiler options, via `"extends": "@alanos/domain-kit/tsconfig.base.json"`.

## How a domain consumes it

A pinned git dependency, one tag per release:

```json
"dependencies": {
  "@alanos/domain-kit": "github:mortoni/alanos-domain-kit#v0.1.0"
}
```

Each domain pins its own version and upgrades on its own schedule. The lockfile resolves the tag to a commit, so builds are reproducible.

## What stays in the domain

The tool registry and every capability's name, description and handler; every schema and policy; entity types and the manifest body; the contract floor and its rationale; knowledge validation rules; the improvement watch list and threshold; the sandbox deny lists; and every test of domain behavior. See CONSTITUTION.md: the kit is a library a domain calls, never a framework that owns it.

## Versioning

Semver. Each release's notes state the Alan OS constitution version and standards it was written against. A kit upgrade never forces a domain's declared floor to move.
