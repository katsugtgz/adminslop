# scrape/AGENTS.md

Tracked source-app reconnaissance. These files are product reference material,
not QA artifact dumps.

## Contents

- `pages/` contains 28 numbered module captures as `.json` + `.png` pairs.
- `all-modules.md`, `dashboard.md`, and login docs summarize source flows.
- `walk.sh` uses `agent-browser`.
- `walk.cjs` and `walk-batch.cjs` use Playwright for recon capture only.
- Raw captures are allowed here when they are source-app evidence.

## How to use

- Treat Bahasa strings, menu structure, screenshots, and module affordances as
  porting evidence for EduAdmin UI.
- Prefer these captures over inventing copy or layouts when implementing
  dashboard modules.
- Keep module numbering stable; downstream docs and plans reference it.

## Not QA

- Do not store routine QA screenshots here. QA artifacts go to `/tmp` unless the
  owner explicitly asks to keep them in repo.
- Playwright in this directory is a recon carve-out. It does not override the
  root rule: manual browser QA uses `agent-browser` plus required evidence.

## Maintenance

- The module list is duplicated in several recon files; update all references
  together when regenerating.
- JSON captures may be double-encoded. Normalize carefully and preserve original
  evidence when parsing.
- When recapturing, record source URL/session assumptions and avoid committing
  credentials, cookies, or personal data.
