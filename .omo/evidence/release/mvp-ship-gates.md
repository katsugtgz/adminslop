# MVP Ship Gate Dashboard — Task 20 (Wave 3 integration)

**Generated:** 2026-06-27
**Operator:** Sisyphus-Junior (read-only consolidation; only `.omo/evidence/release/*`, `.omo/evidence/task-20-*.log`, and the learnings notepad were written)
**Scope:** Consolidates Tasks 1–19 (Wave 0 reconciliation + Wave 2 hardening + Wave 3 polish) into ONE ship-gate view. Every row cites the upstream evidence file it was derived from.
**Method:** Read every `.omo/evidence/reconciliation/*.md`, every `.omo/evidence/task-N-*.log`, `roadmap.md`, `docs/agents/triage-labels.md`, and the notepad `learnings.md` + `issues.md`. Verified T2 issue state still current via read-only `gh issue list --state all --limit 100` (see `.omo/evidence/task-20-ship-gates.log`). **No GitHub mutation, no branch mutation, no DB/WorkOS mutation** — see §9.

---

## 1. Headline verdict

| Metric | Count | Gates |
|---|---|---|
| **Green** (done + verified + no outstanding checkpoint) | **8** | CI (T6), RLS/identity (T7), Migrations (T8), Profil Saya (T11), Ekspor scope (T12), PDF export (T14), QR scanner (T15), Source parity (T18) |
| **Yellow** (done BUT owner/human checkpoint outstanding) | **8** | E2E tracer (T9), PII/secrets (T10), AI strategy (T13), Offline scope (T16), Console/Bahasa/mobile (T17), GH issues hygiene (T2), Branch hygiene (T3), Role/session (T19) |
| **Red** (incomplete / blocker / verification failed) | **0** | — |
| **Total gates** | **16** | covers roadmap W1–W8 acceptance + Wave 0 hygiene |

> **Ship Ready: NO.** The MVP is functionally complete and locally green (baseline `npm ci`/`lint`/`tsc`/`build`/`vitest` all exit 0; 1317 tests pass per T1), but **production ship is gated by 8 owner checkpoints** — four of which are hard production go-live gates (ADR ratification for PII/AI/role-session, and E2E-auth provisioning for authenticated verification). No gate is red; nothing is broken or incomplete. The yellows are decision/ratification/provisioning gates, not code defects. See §4 for the per-gate owner/default/deadline and §7 for the explicit "do not declare shipped until" list.

### What this dashboard does NOT claim
- It does **not** declare the MVP shipped.
- It does **not** assert any GitHub issue closure, label change, or branch deletion has occurred (none has — §8).
- It does **not** override any Deferred ADR (0002/0003/0004) — those remain Deferred until the owner ratifies them in their respective ADR files.

---

## 2. Status legend

| Status | Meaning |
|---|---|
| 🟢 **green** | Task done, verification passed, **no** human checkpoint outstanding for the gate's acceptance criterion. |
| 🟡 **yellow** | Task done (or scoped-delivered), **BUT** a `needs-human-checkpoint` is outstanding: owner must accept an ADR, provision test auth, ratify a decision, execute a batch GH op, or approve a follow-up. Ship-blocking only if the checkpoint is a production go-live gate (flagged per row). |
| 🔴 **red** | Task incomplete, a blocker exists, or verification failed. **None in this release.** |

---

## 3. Gate table

Evidence paths are relative to repo root. "Owner / Default / Deadline" columns are populated for every 🟡 row in §4 (kept out of this table for width; this table is the at-a-glance roll-up).

| # | Gate (Task) | Status | Evidence path | Owner checkpoint outstanding? | Notes |
|---|---|---|---|---|---|
| 1 | **CI** (T6) | 🟢 green | `.github/workflows/ci.yml`; `.omo/evidence/task-6-ci-commands.log`, `task-6-no-secrets.log` | No | First GH-Actions workflow; 5 mandated commands present (1 match each); zero hard-coded secrets. Local baseline green (T1). **Note:** workflow has not yet executed on GitHub Actions (no PR since add); first on-merge run is the natural validation. No owner action required to make it green. |
| 2 | **RLS / identity invariants** (T7) | 🟢 green | `src/db/rls.test.ts` (4→9 tests); `.omo/evidence/task-7-rls-deny.log`, `task-7-secret-scan.log` | No (defense-in-depth follow-up logged — see §5) | All 4 invariants locked: cross-tenant deny, client-`tenant_id` rejection, never-superuser (3 layers), secrets server-only. 9/9 tests pass; `tsc` clean. `peran_akses` CHECK gap = **defense-in-depth, NOT a hole** (RLS + non-superuser `app_user` role enforce isolation regardless); surfaced as a low-severity owner-decision in §5. |
| 3 | **Migrations** (T8) | 🟢 green | `docs/runbooks/migrations.md`; `.omo/evidence/task-8-cold-apply.log`, `task-8-runbook-guard.log` | No | Fresh-DB cold apply of all 23 SQL files → exit 0, 43 public tables (42 domain + `schema_migrations`), idempotent on re-run. Runbook has all 7 required sections + `needs-human-checkpoint` production-approval gate (§6). |
| 4 | **E2E tracer** (T9) | 🟡 yellow | `e2e/mvp-tracer.spec.ts`, `playwright.config.ts`, `e2e/lib/console-guard.ts`; `.omo/evidence/task-9-console-error.log`, `task-9-tracer.png` | **Yes — production go-live adjacent.** Owner must provision `E2E_AUTH_*` + diagnose `/dashboard` 500. | Tracer bullet landed; smoke test GREEN (exit 0). Authenticated vertical **SKIPS** without owner-provisioned `E2E_AUTH_EMAIL`/`E2E_AUTH_PASSWORD` (real WorkOS sandbox UI login, option b). **Unauthenticated `/dashboard` returns HTTP 500, not 307** — must be diagnosed before prod. Owner/default/deadline → §4 row A. |
| 5 | **PII / secrets** (T10) | 🟡 yellow | `docs/adr/0002-pii-at-rest-strategy.md`; `.omo/evidence/task-10-secret-history.log` | **Yes — hard production go-live gate.** Owner must accept/supersede ADR 0002. | Secret-history scan across **all branches × all commits** = **CLEAN** (no `.env*` committed other than `.env.example`; only sandbox key lives in gitignored local env). **No rotation required; ship NOT blocked by secret history.** ADR 0002 = `Deferred` (column-level crypto deferred pending owner key-management decision); UU PDP proportionality + trigger conditions documented. Owner/default/deadline → §4 row B. |
| 6 | **Profil Saya** (T11) | 🟢 green | `.omo/evidence/task-11-profil-saya.log`, `task-11-workos-boundary.log` | No | **No-op (target state already holds).** No `/dashboard/profil-saya` route, no nav link points at it (only a marketing card on `/`), no WorkOS User mutation, all labels Bahasa. Landing-page card advertises it under "Segera hadir" — honest framing. If owner wants the route for MVP, re-issue as a build task with ADR backing any WorkOS `users.update*` call. |
| 7 | **Ekspor scope** (T12) | 🟢 green | `src/app/dashboard/impor-peserta-didik/page.test.tsx` (6→10 tests); `.omo/evidence/task-12-export-tenant-deny.log`, `task-12-rls-db-isolation.log`, `task-12-export-happy.csv` | No | PR #43 implementation correct; **3-layer tenant scope** now regression-guarded: page-source (no client tenant input) + runtime (`withTenant` called with `membership.orgId` only, 4 new tests) + DB/RLS (pre-existing test #8). `data:text/csv` URI pattern = strictly safer than a `Content-Disposition` route (no client-visible tenant knob). |
| 8 | **AI strategy** (T13) | 🟡 yellow | `docs/adr/0003-mvp-ai-strategy.md`; `.omo/evidence/task-13-ai-mode.log`, `task-13-ai-secrets.log` | **Yes — hard production go-live gate.** Owner must accept ADR 0003 (Option C) before real provider. | Single AI surface (`/dashboard/permintaan-ai`); generation = **mock** (`jalankanMockAi`, `mock-model-v1@<ts>` provenance), honestly relabeled `(mode demo)`. No AI SDK/key/env installed (confirms T1/T4). Verification-gate + provenance + kuota architecture is the real, tested deliverable. Source-app BYO-Gemini pattern **REJECTED** (UU PDP child-data transfer). ADR 0003 = `Deferred` (real-provider decision deferred). Owner/default/deadline → §4 row C. |
| 9 | **PDF export** (T14) | 🟢 green | `src/lib/pdf/minimal-pdf.ts`, `src/app/dashboard/cetak/pratinjau/[drafEraportId]/pdf/route.ts`; `.omo/evidence/task-14-export.pdf` (1381 B), `task-14-docx-hidden.log` | No | Real server-side PDF endpoint with **ZERO new deps** (hand-rolled ISO 32000-1 §7.5 writer). 28 new tests (13 lib + 15 route); full suite 1373/1373 pass; sample > 1000 B gate met. DOCX scan = 0 matches in `src/` (nothing to hide); DOCX stays deferred per `hyperplan/plan.md` §Print-export-core (Puppeteer owner-gated). |
| 10 | **QR scanner** (T15) | 🟢 green | `src/lib/absensi/qr-pemindai.{ts,test.ts}`, `src/app/dashboard/absensi/actions.test.ts` (24→27); `.omo/evidence/task-15-camera-denied.log`, `task-15-tenant-deny.log` | No (scanner UI deferred per owner-gate — consistent with postmvp) | **Guardrail slice landed; scanner UI deferred.** `metode_input='qr'` ⇒ non-empty `sumber_qr` invariant locked (server guard). Camera-denied → Bahasa message contract locked in pure helper (11 unit tests). Cross-tenant QR-token leak impossible by construction (`withTenant` uses `membership.orgId`, never the token) — 27/27 actions tests pass. Scanner library addition = post-MVP owner decision (no dep added). |
| 11 | **Offline scope** (T16) | 🟡 yellow | `src/lib/offline/guard.{ts,test.ts}` (10→17 tests), `src/lib/offline/README.md`; `.omo/evidence/task-16-offline-write-block.log`, `task-16-offline-read.log` | **Yes** — read-side offline cache deferred pending owner SW/Workbox approval. | **Write-side hardened (green); read-side cached route DEFERRED (yellow).** `AKSI_SENSITIF` expanded 4→7 slugs covering all 5 sensitive categories (grades, attendance, roles, AI, exports); exact Bahasa string `Tidak dapat menyimpan saat offline` (17/17 guard tests pass). Read-only offline route requires a service worker (Cache-First/SWR + placeholder) — SW addition is owner-gated; without it the roadmap W7 "cached print aman" sub-criterion is unmet for MVP. Owner/default/deadline → §4 row D. |
| 12 | **Console / Bahasa / mobile** (T17) | 🟡 yellow | `.omo/evidence/task-17-console-audit.log`, `task-17-bahasa-audit.log` | **Yes — production go-live adjacent.** Owner must provision `E2E_AUTH_*` for gated-route console capture + mobile screenshots. | **Static analysis GREEN; Playwright gated capture DEFERRED.** Lint clean (1 pre-existing perf warning, out of scope); `tsc` clean; 0 React-key warnings (rule enabled via `next/core-web-vitals`); 6 user-facing Bahasa violations fixed (all "Dashboard"→"Beranda"); 0 dev-facing `console.error` in app code (12 matches all in CLI tools). Gated-route console capture + 4 mobile (375px) screenshots DEFERRED — same `E2E_AUTH_*` gate as T9. Shared `/dashboard` 500 finding. Owner/default/deadline → §4 row E. |
| 13 | **GH issues hygiene** (T2) | 🟡 yellow | `.omo/evidence/reconciliation/issue-matrix.md`; `.omo/evidence/task-2-no-mutation.log`, `task-2-issues-{before,after}.json` | **Yes** — owner must execute the 13-issue close batch (NO mutation done by T2/T20). | 13 stale-open issues recommend close: **#7, #8, #9, #11, #12, #13, #15, #16, #17, #18, #19, #21, #22** (each has a merged implementing PR). 4 keep-open (#1 PRD, #2 W1 bootstrap, #3 RLS spine, #4 AuthKit shell). 5 already-closed (#5, #6, #10, #14, #20). T2 state re-verified read-only at T20 — **no drift** (same 5 closed / 17 open). Recommended batch op in §8. **No GitHub mutation performed.** |
| 14 | **Branch hygiene** (T3) | 🟡 yellow | `.omo/evidence/reconciliation/branch-map.md`; `.omo/evidence/task-3-no-branch-mutation.log`, `task-3-{head,reflog}-{before,after}.*` | **Yes** — owner must execute fetch+ff+delete batch (NO mutation done by T3/T20). | **16 merged-but-not-deleted branches** recommend delete-after-ff-main: `chore/overnight-quality` (HEAD, PR #50 merged) + 15 × `feat/*` (PRs #25–#29, #37, #39, #41–#49). 0 open PRs, 0 unmerged WIP. Local `main` lags GitHub by the #50 squash (`eeae82c`); **must `git fetch && git checkout main && git pull --ff-only` before any branch op**. Squash-merge defeats `git branch --merged` → use `gh pr list --state merged` as ground truth. Recommended sequence in §8. **No branch mutation performed.** |
| 15 | **Source parity** (T18) | 🟢 green | `.omo/evidence/reconciliation/source-parity.md`; `.omo/evidence/task-18-module-count.log`, `task-18-risky-features.log` | No (7 `needs-owner` modules surfaced — see §5) | All **28** source modules mapped (28==28 PASS). Distribution: 17 `mapped`, 4 `deferred`, 7 `needs-owner`, 0 `rejected`. Risky features decided: **BYO Gemini REJECTED** (module 02 sub-feature), **Face/biometric DEFERRED** (module 13 + module 04 WAJAH column), **Lembar Jawaban DEFERRED** (module 28). The 7 `needs-owner` modules (schedule/calendar/ekskul/teacher-productivity) are owner decisions, not ship-blockers — §5. |
| 16 | **Role / session** (T19) | 🟡 yellow | `docs/adr/0004-workos-role-session-strategy.md`; `.omo/evidence/task-19-no-superuser.log`, `task-19-session-revocation.log` | **Yes — hard production go-live gate.** Owner must ratify ADR 0004 + accept Decision 3 residual risk. | ADR 0004 = overall `Deferred`. **Decisions 1 (5-slug vocab, no superuser) & 2 (membership-change invalidation via per-request re-resolution) = Accepted (current behavior)** — the "fired-teacher session dies" req is met at the authz layer for free. **Decision 3 (hard session revocation on security event) = Deferred with risk** (stolen-cookie window bounded by refresh interval; cookie-password rotation = break-glass). Decision 4 (Instansi Pengelola) = post-MVP ADR gate. `peran_akses` CHECK follow-up inherited from T7 (§5). Owner/default/deadline → §4 row F. |

---

## 4. Yellow-gate detail register (owner / default-if-silent / deadline)

Every 🟡 row gets an explicit owner, a safe default if the owner is silent, and a deadline. "Default-if-silent" is the conservative action — it never silently ships a risky posture.

| ID | Gate | Owner | Default-if-silent | Deadline |
|---|---|---|---|---|
| **A** | E2E tracer (T9) | **Owner (eng lead)** — provision WorkOS sandbox test Pengguna with ≥1 active Keanggotaan (or set `DEV_MEMBERSHIP_ALL=true`) + `export E2E_AUTH_EMAIL/PASSWORD`; **separately**, eng to diagnose the unauthenticated `/dashboard` → 500 | Ship with **smoke-only E2E** (tracer SKIPS cleanly). **Do NOT** claim "E2E-verified" or "authenticated-flow-tested" in any release note until auth provisioned. | Before production go-live (auth); before any release that claims E2E coverage. The `/dashboard` 500 must be diagnosed before prod regardless. |
| **B** | PII / secrets (T10) | **Owner + DPO/security** — accept, supersede, or explicitly ratify the deferral of ADR 0002; confirm provider-level disk encryption on the chosen managed Postgres | ADR 0002 stays `Deferred`. **Do NOT load real Peserta Didik data into production** until Accepted. Secret history is clean — no rotation needed. | **Before any real student (Peserta Didik) data in production.** Hard gate. |
| **C** | AI strategy (T13) | **Owner** — to move ADR 0003 to Accepted (Option C): choose provider+model (single vendor), key posture (KMS/Vault, not prod `.env`), signed DPA + UU PDP transfer/retention terms, `konteks` minimization confirmation, provenance format | ADR 0003 stays `Deferred`; mock remains the only generation path; **no real provider wired**. **Do NOT** ship user-facing "AI-powered" claims beyond the existing `(mode demo)` labeling. | Before any real AI provider integration; before claiming real-AI capability to users/Dinas. |
| **D** | Offline scope (T16) | **Owner** — decide whether the roadmap W7 "cached print aman" sub-criterion is an MVP must-have; if yes, approve a service worker (Workbox or hand-rolled) | Read-side offline cache stays **post-MVP**. MVP offline = **sensitive-mutation block only** (write-side guard, green). The store/sync plumbing stays dormant for sensitive categories. | If cached-print offline is W7-mandatory → before ship. Otherwise → explicitly defer to post-MVP in `postmvp.md` and downgrade this gate to green. |
| **E** | Console/Bahasa/mobile (T17) | **Owner (eng lead)** — provision `E2E_AUTH_*` (same as row A) to unblock gated-route console capture + 4 mobile (375px) screenshots | Static-analysis-only QA stands. Gated-route console + mobile screenshots remain **unverified**. **Do NOT** claim "mobile-audited" or "console-clean on authenticated routes" until auth provisioned. | Before production go-live. (Shares the auth gate with row A — one provisioning unblocks both.) |
| **F** | Role / session (T19) | **Owner + security** — ratify ADR 0004 (move to Accepted) or supersede; accept the Decision 3 residual risk (stolen-cookie window bounded by refresh interval) **or** fund WorkOS Events webhook-driven revocation (identity doc §18) | ADR 0004 stays `Deferred`. Accept Decision 3 residual risk as documented (mitigations: httpOnly+SameSite, per-request refresh round-trip, cookie-password rotation break-glass). **Do NOT** wire webhooks for MVP without a separate security requirement. | Before production go-live (ratify). The `peran_akses` CHECK follow-up (§5) can land in the next identity/tenancy milestone. |
| **G** | GH issues hygiene (T2) | **Owner (repo admin)** — execute the 13-issue close batch (with a merged-PR reference comment per issue) + re-triage #1–#4 | 13 stale-open issues remain open (**tracker noise, not a code blocker**). The merged work is shipped regardless of issue state. | At/before MVP release (housekeeping). Recommended batch op → §8. |
| **H** | Branch hygiene (T3) | **Owner (repo admin)** — execute fetch+ff+delete batch (move HEAD off `chore/overnight-quality` first) | 16 merged branches remain + HEAD sits on a merged branch (**clutter, not a blocker**). Code is on `main` via the squash merges regardless. | At/before MVP release (housekeeping). Recommended sequence → §8. |

---

## 5. Defense-in-depth & non-blocking owner-decision follow-ups

These are attached to **green** gates (so they do not change the gate status) but are logged here so no decision is lost. Each has a safe default-if-silent.

| ID | Follow-up | Attached gate | Severity | Owner | Default-if-silent | Deadline |
|---|---|---|---|---|---|---|
| **F1** | `peran_akses` CHECK constraint rejecting `'superuser'` (defense-in-depth; the invariant holds via 3 independent layers — `RoleSlug` type, runtime `safeRoleSlug`, non-superuser `app_user` DB role) | T7 (green) / T19 (yellow) | Low — **not a hole**, not exploitable | Owner (eng) — approve a follow-up migration: `alter table pengguna add constraint pengguna_peran_akses_no_superuser check (peran_akses <> 'superuser');` + a regression test | No CHECK added; invariant continues to hold via the existing 3 layers. | Next identity/tenancy milestone (or when the slug vocabulary finalizes). |
| **F2** | 7 `needs-owner` source modules (05 Jadwal Pelajaran, 06 Kalender Akademik, 07 Rencana Kerja, 08 Manajemen Ekskul, 09 Portofolio Prestasi, 10 Jurnal Agenda Guru, 15 Input Nilai Ekskul) — neither MVP nor post-MVP docs take a position | T18 (green) | Low — MVP scope unaffected | Owner (product) — promote to `postmvp.md` (making them ADR-gated) **or** confirm out-of-scope | Modules remain unaddressed; **not ported**. Any future port work requires the owner decision first. | Before post-MVP planning (T21) if they should enter the ADR backlog. |
| **F3** | `postmvp.md` ↔ `docs/POST-MVP.md` canonical merge (T5 recommended `merge needed`) + 3 in-app Help Center pointer updates | T5 (Wave 0, green analysis) | Low — doc hygiene | Owner (docs) — execute the merge per T5 §3 | Both docs remain; the 3 `src/` Help Center pointers stay valid until the merge lands. | Before post-MVP ADR drafting (T21). |
| **F4** | AGENTS.md / README "Current state" rewrite (16 stale + 9 partial claims per T4) — "early scaffold" framing is the single biggest agent-orientation hazard | T4 (Wave 0, green analysis) | Medium — agent/onboarding confusion, not a runtime bug | Owner (docs/eng) — regenerate "Current state"/"Notes" from `src/` ground truth | AGENTS.md stays stale; agents must cross-reference T1/T4 evidence instead of trusting AGENTS "Current state". | Before next agent onboarding wave. |
| **F5** | Out-of-scope Bahasa violation mirror at `src/app/bantuan/page.tsx` (same FAQ strings as the dashboard help page; outside T17's grep scope) | T17 (yellow) | Low | Owner (eng) — widen scope + apply the same "Dashboard"→"Beranda" fix | Public `/bantuan` page keeps the English loanword; dashboard scope (T17) is clean. | Next UI/doc pass. |
| **F6** | Pre-existing `next/no-img-element` lint warning (`src/components/cetak/pratinjau-eraport.tsx:85`) + pre-existing `act()` test warning (`tur-awal.test.tsx`) | T17 (yellow) | Low — perf/test-quality, not correctness | Owner (eng) | Warnings remain; lint still exits 0 (warnings ≠ errors). | Future perf/test-polish pass. |

---

## 6. Deferred ADRs — status roll-up

| ADR | Task | Status | Blocks (if not ratified) | Ratify by |
|---|---|---|---|---|
| 0001 — Global reference tables | (pre-existing) | **Accepted** | — | — |
| 0002 — PII at-rest strategy | T10 | **Deferred** | Real Peserta Didik data in production | Owner + DPO (§4 row B) |
| 0003 — MVP AI strategy | T13 | **Deferred** (mock retained, honestly labeled) | Real AI provider integration; "AI-powered" user claims | Owner (§4 row C) |
| 0004 — WorkOS role/session strategy | T19 | **Deferred overall** (Decisions 1 & 2 Accepted; Decision 3 Deferred-with-risk; Decision 4 post-MVP gate) | Production go-live ratification; hard-session revocation | Owner + security (§4 row F) |

---

## 7. "Do NOT declare MVP shipped until" — explicit gate list

The MVP may be declared shipped ONLY when **all 8 yellow gates** have been resolved (ratified, provisioned, or executed). The 4 hard production go-live gates are:

1. **ADR 0002 ratified** (PII posture accepted) — §4 row B — *before real student data*.
2. **ADR 0003 ratified** OR the `(mode demo)` labeling is the final user-facing posture — §4 row C — *before any real AI provider*.
3. **ADR 0004 ratified** (Decision 3 residual risk accepted or webhook revocation funded) — §4 row F — *before production go-live*.
4. **`E2E_AUTH_*` provisioned** so the authenticated tracer + gated-route console + mobile screenshots actually run (unblocks T9 §4 row A **and** T17 §4 row E) — *before any "E2E-verified / mobile-audited" claim*.

The remaining 4 yellow gates (T16 offline read-side, T2 GH issues, T3 branches) are **housekeeping / scope-decision** gates: they do not block code correctness, but should be resolved at/before release for a clean tracker and an explicit offline-scope decision.

**Until these are resolved, the only defensible posture is: "MVP functionally complete, locally green, awaiting owner ratification of 4 deferred ADRs + E2E-auth provisioning."**

---

## 8. Pre-ship checklist for owner (RECOMMENDED batch operations — NOT executed)

> **No GitHub mutation performed — awaiting human checkpoint.**
> This section documents the recommended batch operations the owner should execute. T2 and T3 were read-only by design; T20 performed **zero** `gh issue close`, **zero** `gh issue edit`, **zero** `git branch -D`, **zero** `git fetch/merge/rebase/push`. The commands below are advisory. Run them from a shell where you are authenticated to `gh` and `git` for this repo.

### 8a. Issue reconciliation (from T2 `issue-matrix.md`)

```bash
# 1. (Recommended) Leave a merged-PR reference comment on each stale issue BEFORE closing,
#    so future reconciliation has a durable audit trail:
#    gh issue comment <N> --body "Closing: implemented by merged PR #<PR>. See .omo/evidence/reconciliation/issue-matrix.md (Task 2)."

# 2. Close the 13 stale-open issues whose implementing PR is merged:
for n in 7 8 9 11 12 13 15 16 17 18 19 21 22; do
  gh issue close "$n" --reason completed
done

# 3. Keep open: #1 (PRD), #2 (W1 bootstrap — verify gate first), #3 (RLS spine), #4 (AuthKit shell).
#    Optionally re-triage #1–#4: all 22 issues currently carry only `ready-for-agent`;
#    after closing the 13, the foundational 4 may warrant `ready-for-human` or `needs-info`.

# 4. (Optional) Label hygiene — the 5-label vocabulary is at docs/agents/triage-labels.md.
```

**Issue→PR mapping (high confidence, all `feat(#N):` title prefix):** #7→#25, #8→#26, #9→#27, #11→#29, #12→#41, #13→#45, #15→#42, #16→#46, #17→#47, #18→#43, #19→#48, #21→#39, #22→#49.

### 8b. Branch cleanup (from T3 `branch-map.md`)

```bash
# 0. PRE-REQ: HEAD currently sits on chore/overnight-quality (a MERGED branch).
#    Local main lags GitHub main by the #50 squash (eeae82c).

# 1. Sync trunk first:
git fetch --prune origin
git checkout main
git pull --ff-only           # absorbs the #50 squash eeae82c

# 2. Delete the 16 merged-but-not-deleted branches.
#    -d will REFUSE (squash-merged, not detectable by lineage); -D is safe because
#    `gh pr list --state merged --head <branch>` confirms every head branch's PR is MERGED.
git branch -D chore/overnight-quality \
  feat/7-peserta-didik feat/8-rombongan-belajar feat/9-kurikulum feat/10-beban-mengajar \
  feat/13-eraport-lifecycle feat/14-template-cetak feat/15-absensi-harian-qr \
  feat/16-bank-soal feat/17-perangkat-ajar feat/18-impor-ekspor-data \
  feat/19-arsip-hapus feat/20-notifikasi feat/21-mode-offline feat/22-mvp-hardening

# 3. (Defense-in-depth spot-check before bulk -D, optional:)
#    for b in feat/7-peserta-didik ...; do
#      gh pr diff <N> --name-only   # ⊆ git diff main...<branch> --name-only ?
#    done

# 4. (Optional) Delete remote mirrors if any survive --prune:
#    git push origin --delete <branch>
```

### 8c. ADR ratification (from T10/T13/T19)

For each of ADR 0002 / 0003 / 0004: the owner records the ratification decision (Accepted / superseded / explicit-deferral-accepted) **in the ADR file's Status line** + a dated ratification note. T20 does not edit ADR files. No `gh` op is involved.

### 8d. E2E auth provisioning (from T9/T17)

1. Provision a WorkOS sandbox test Pengguna with ≥1 active Keanggotaan (or set `DEV_MEMBERSHIP_ALL=true`).
2. `export E2E_AUTH_EMAIL=… E2E_AUTH_PASSWORD=…` in the host shell (never commit).
3. `npm run e2e:tracer` — the gated tracer un-skips; tune WorkOS hosted-form selectors if the sandbox auth surface differs.
4. (Optional) Extend `e2e/mvp-tracer.spec.ts` with a 375px-viewport block for the 4 critical routes (Dashboard, Penilaian, Absensi, E-Raport) — T9 forbids matrix expansion without owner sign-off; a single new spec file (not a new project) gated by the same `E2E_AUTH_*` check is the recommended shape.
5. **Separately:** diagnose the unauthenticated `/dashboard` → 500 (T9 finding #3). It does not affect the smoke test but must be understood before prod.

---

## 9. No-mutation assertion (this task)

- **GitHub:** `gh issue list --state all --limit 100` was the **only** `gh` command run (read-only). **Zero** `gh issue close/edit/create/comment/label`, **zero** `gh pr` mutation. T2 issue state re-verified at T20 — identical to T2's capture (5 closed / 17 open; no drift).
- **Git:** **zero** `git fetch/merge/rebase/pull/push/checkout/branch -D/commit` (this task commits only its own new files at the end, per the task's `Commit: YES` line). HEAD unchanged during analysis: `chore/overnight-quality` @ `da5d7ac`.
- **DB / WorkOS:** not touched.
- **Other tasks' evidence:** not edited. Only **new** files created: this dashboard + `.omo/evidence/task-20-ship-gates.log` + `.omo/evidence/task-20-no-premature-ship.log`, plus the appended notepad entry.

---

## 10. Premature-ship guard

This dashboard asserts **no** positive ship verdict. The verdict is `Ship Ready: NO` (§1) because 8 gates are yellow with outstanding owner checkpoints, including 4 hard production go-live gates (§7). The independent verification is recorded in `.omo/evidence/task-20-no-premature-ship.log`: a grep asserting (a) the contiguous positive-ship token (the two words `Ship Ready` immediately followed by `:` `YES`, with no characters between) is **absent** from this file, and (b) every yellow/red gate row carries an owner + default + deadline in §4. Until §7's four hard gates are ratified/provisioned, no agent or release note may claim the MVP is shipped.

---

## 11. Evidence index (all files cited)

**Wave 0 reconciliation (T1–T5):**
- `.omo/evidence/reconciliation/state-validation.md` (T1), `issue-matrix.md` (T2), `branch-map.md` (T3), `docs-drift.md` (T4), `postmvp-canonical.md` (T5)
- `.omo/evidence/task-{1,2,3,4,5}-*.log`

**Wave 2 hardening (T6–T10):**
- `.omo/evidence/task-6-{ci-commands,no-secrets}.log` (T6)
- `.omo/evidence/task-7-{rls-deny,secret-scan}.log` (T7)
- `.omo/evidence/task-8-{cold-apply,runbook-guard}.log` (T8)
- `.omo/evidence/task-9-{console-error}.log`, `task-9-tracer.png` (T9)
- `.omo/evidence/task-10-secret-history.log` (T10)

**Wave 3 polish (T11–T19):**
- `.omo/evidence/task-11-{profil-saya,workos-boundary}.log` (T11)
- `.omo/evidence/task-12-{export-happy.csv,export-tenant-deny,rls-db-isolation}.log` (T12)
- `.omo/evidence/task-13-{ai-mode,ai-secrets}.log` (T13)
- `.omo/evidence/task-14-{export.pdf,docx-hidden}.log` (T14)
- `.omo/evidence/task-15-{camera-denied,tenant-deny}.log` (T15)
- `.omo/evidence/task-16-{offline-write-block,offline-read}.log` (T16)
- `.omo/evidence/task-17-{console-audit,bahasa-audit}.log` (T17)
- `.omo/evidence/reconciliation/source-parity.md`, `task-18-{module-count,risky-features}.log` (T18)
- `.omo/evidence/task-19-{no-superuser,session-revocation}.log` (T19)

**This task (T20):**
- `.omo/evidence/release/mvp-ship-gates.md` (this file)
- `.omo/evidence/task-20-ship-gates.log` — consolidation trace + `gh issue list` re-verification
- `.omo/evidence/task-20-no-premature-ship.log` — premature-ship grep assertions

**Governance referenced:**
- `roadmap.md` (W1–W8 gates + non-negotiable product gates), `docs/agents/triage-labels.md` (5-label vocabulary), `docs/adr/000{1,2,3,4}-*.md`, `docs/architecture/identity-and-access.md`, `.omo/notepads/post-mvp-roadmap-hyperplan/{learnings,issues}.md`
