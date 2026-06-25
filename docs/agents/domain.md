# Domain docs

This repo uses a single-context domain documentation layout.

## Context

- Read `CONTEXT.md` at the repo root before work that depends on domain language.
- Use the glossary terms from `CONTEXT.md` in plans, issues, PRDs, code, tests, and UI copy where applicable.

## ADRs

- Architectural decisions belong in `docs/adr/`.
- If `docs/adr/` does not exist yet, treat that as "no ADRs recorded yet", not as permission to ignore domain constraints.
- When ADRs are added later, read relevant ADRs before changing architecture.

## Consumer rules

Skills such as `improve-codebase-architecture`, `diagnose`, `tdd`, `to-issues`, and `to-prd` should read these docs before making domain-sensitive recommendations or changes.
