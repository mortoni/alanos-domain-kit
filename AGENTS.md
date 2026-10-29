# AGENTS.md

Instructions for any agent working on **@alanos/domain-kit**, whatever the harness (Claude
Code, Codex or another). This file points to where things are; it does not repeat them.

## What this is

The shared wire and plumbing Alan OS domain repositories call: the MCP server bootstrap,
the manifest emitter, validators, the commit helper and the template a new domain is
created from. [README.md](README.md) lists the modules and how a domain consumes the kit.

## The law

[CONSTITUTION.md](CONSTITUTION.md) binds. Two of its rules catch most changes: the kit
never owns a domain decision, and this repository is public, so nothing personal enters
it (`pnpm check:hygiene` enforces the list).

## Before you finish

`pnpm check` must pass. A release is a tag the owner makes: never tag, publish or push.
