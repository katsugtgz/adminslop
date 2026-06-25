# EduAdmin Pro Premium — Implementation Plan (MVP Rewrite)

> ⚠ **DECISION OVERRIDES (EXECUTION MODE — 2026-06-25, locked by owner)**
>
> 1. ✅ **Auth provider: WorkOS AuthKit REPLACES Supabase Auth.**
>    - Overrides bundle §A2 + Phase 2 ("Supabase Auth + Google OAuth").
>    - Rationale: WorkOS maps 1:1 onto the converged tenancy model —
>      `Organization` = **Satuan Pendidikan** (tenant),
>      `Membership` = **Keanggotaan Satuan Pendidikan** (M:N, §A1),
>      `Role` = `tenant_role` (never superuser, §A1),
>      httpOnly server session = exactly AuthKit's default
>      (satisfies the "reject client JWT / `auth.uid()` tenant-escape" §A2 constraint).
>    - **Supabase is retained for DB / RLS / pgvector only.** No Supabase Auth.
> 2. ✅ **Framework version: Next.js 15.3.x LTS-line (not Next 16).**
>    - WorkOS `@workos-inc/authkit-nextjs@4.x` peers allow `^15.2.3 || ^16`;
>      15.3 is the most-patched backport line and best-tested with
>      Drizzle + Supabase-SSR. Next 16 = 1-line bump later.
>    - Node runtime floor pinned `>=22.11` (authkit engines); local runs Node 26.
>
> Future agents: treat these two as settled. Do **not** re-propose Supabase
> Auth or Next 16 without owner sign-off.

**Status:** Plan only. Authoritative architectural decisions are converged in `hyperplan/insights-bundle.md` (5-member adversarial hyperplan, 3 rounds). This document **sequences** that bundle — it does not re-decide architecture. MVP roadmap is split into `../roadmap.md`; deferred/Post-MVP scope is split into `../postmvp.md`.
**Stack (fixed by §A4 + §D, refined by EXECUTION-MODE overrides above):** Next.js 15.3.x ✅ · **WorkOS AuthKit** ✅ (replaces Supabase Auth) · Supabase (DB/RLS/pgvector only) · Drizzle · Tailwind v4 · shadcn/ui · Vercel AI SDK · pgvector · react-to-print · Puppeteer (PDF/DOCX) · nimiq/qr-scanner · Playwright (Chromium, print-CI only) · `agent-browser` CLI (browser automation) · `firecrawl` CLI (scraping). UI strings: **Bahasa Indonesia**.
**Compliance regime:** UU PDP (in force Oct 2022). Minor student data = "data pribadi spesifik" (highest sensitivity). Signature gate + provenance + RLS-every-table + audit log are **ship-blockers**, not features.

---

## 0. Scope Guardrail — The 28 → 7 Module Collapse (READ BEFORE EXPANDING)

The source app ships 28 sidebar modules. Per bundle §A5, the MVP collapses these to **7 modules** plus shared infra. **Do NOT re-add cut modules during implementation.** If a downstream agent proposes restoring a cut module, reject and reference this section.

| # | MVP Module | Source modules absorbed | Notes |
|---|---|---|---|
| 1 | **Profil Saya** | 01 | Pro, kepegawaian, kontak. |
| 2 | **Pengaturan Sekolah** | 02 | Per-school config, logo, TZ, semester, **no** per-tenant Gemini key (rejected §A1). |
| 3 | **Data Siswa** | 04 | CRUD, import CSV, QR card. |
| 4 | **Input Nilai + E-Raport** (TRACER BULLET) | 12, 14, 16 | Rekap absensi (16) feeds E-Raport (12); nilai (14) drives deskripsi AI. |
| 5 | **Bank Soal** (unified) | 11, 26, 27 | AI question bank; keys on Bloom + komposisi. |
| 6 | **Perangkat Ajar** (unified generator shell) | 18, 19, 20, 21, 22, 23, 25 | One UX shell, per-type storage/validation. Prog Tahunan+Semester merged. |
| 7 | **Absensi (QR)** | 13, 05, 06, 10 | Live QR scan; Jadwal (05) + Kalender (06) feed `SchoolHoliday`; Jurnal (10) daily-ops. |

**Killed (do not build — §A5):** Cover Administrasi (no AI, trivial) · Panduan Kurikulum (static docs).
**Deferred to Post-MVP (§C + §A8):** EduExam/CBT · Lembar Jawaban config · Parent WhatsApp channel (external-principal consent flow) · Gamification leaderboards (k-anon gate unmet) · Dapodik retention · AI-based help/RAG · deterministic AI-assisted curriculum seeding. See §"Post-MVP / Deferred".

---

## 1. Hard Constraints & Ship-Blockers (non-negotiable)

**Hard constraints (§D — honor verbatim):**
- Tailwind v4 + shadcn/ui for ALL UI.
- `agent-browser` CLI for browser automation (NOT playwright MCP; playwright lib OK for print CI only).
- `firecrawl` CLI for scraping reference material.
- Bahasa Indonesia UI strings.
- Mobile-first responsive UX: HP is the primary target; desktop follows responsively.
- WCAG/A11Y baseline for all UI: readable text, large tap targets, keyboard/focus states, labels, contrast, and screen-reader semantics.
- **Panduan Penggunaan** baseline: every core flow must be understandable for older/non-technical users through **Tur Awal** and **Bantuan Kontekstual**. AI-based help is a roadmap enhancement, not a substitute for clear UI.

**Ship-blockers (must exist in Foundation, not bolted on):**
1. **RLS on EVERY table** + `SET LOCAL app.tenant_id` per transaction (PgBouncer-safe).
2. **RLS linter** in CI — fails any migration missing `tenant_id` + policy.
3. **Audit log** for all sensitive writes.
4. **Provenance** immutable on every AI doc: `prompt_hash + provider + model + key_id`.
5. **Signature gate** — "diverifikasi oleh guru" one-click UX + offline draft mode (UU PDP Art. 20/35).
6. **`tenant_role` never superuser.**
7. **Opaque server session** in httpOnly cookie (reject client JWT / `auth.uid()` tenant-escape).

**Explicitly rejected (do not propose):** schema-per-tenant · DB-per-tenant · per-tenant Gemini key · microservices · monorepo-with-many-packages · scheduled field-key rotation · Legal page size · Safari/Firefox print matrix v1 · byte-hash print CI · canonical external CP/TP API · Dinas-first GTM.

---

## 2. Phase Dependency Graph

```
Phase 0: Bootstrap
   │
   ▼
Phase 1: Tenancy & Compliance Foundation  ◄── ship-blockers live here
   │
   ▼
Phase 2: Auth Foundation
   │
   ├──────────────────────┐
   ▼                      ▼
Phase 3: AI Gen Core   Phase 4: Print Core     (parallel wave)
   │                      │
   └──────────┬───────────┘
              ▼
   Phase 5: Tracer-Bullet — E-Raport E2E  (login→data→AI→print)
              │
              ▼
   Phase 6: Horizontal MVP Modules (Bank Soal · Perangkat Ajar · Absensi QR)
              │
              ▼
   Phase 7: Offline-first (scoped daily ops)
              │
              ▼
   Phase 8: Ship Gate & Hardening
```

---

## 3. Parallel Execution Waves

| Wave | Phases | Can run concurrently? |
|---|---|---|
| **W1** | Phase 0 | solo (everything blocks on it) |
| **W2** | Phase 1 | solo (compliance foundation — no parallelism, correctness-critical) |
| **W3** | Phase 2 | solo (depends on W2) |
| **W4** | **Phase 3 ∥ Phase 4** | **YES — parallel.** AI core and print core are independent; print uses a placeholder doc until the tracer bullet binds real golden-sets. |
| **W5** | Phase 5 | solo (integrates W2+W3+W4) |
| **W6** | **Phase 6a ∥ 6b ∥ 6c** | **YES — parallel.** Bank Soal, Perangkat Ajar, Absensi QR are independent modules sharing the Phase 3/4 cores. |
| **W7** | Phase 7 | solo |
| **W8** | Phase 8 | solo (verification) |

**Critical path:** 0 → 1 → 2 → 3 → 5 → 6 → 7 → 8. (Phase 4 rides alongside 3 in W4.)

---

## 4. Phases

> Effort sizing: **S** ≈ 1–2 days · **M** ≈ 3–5 days · **L** ≈ 1–2 weeks · **XL** ≈ 2–3 weeks (per engineer; relative, not a commitment).
> TDD rule for every phase: **write the failing test first** that encodes the exit criterion, then implement to green.

### Phase 0 — Bootstrap & Tooling
**Goal:** Runnable greenfield repo with the fixed stack, CI skeleton, and Bahasa Indonesia baseline.
**Built:**
- `git init`, branch protection, `.gitignore`, `AGENTS.md` (stack + constraints + commit conventions).
- Next.js 15 (App Router) + TypeScript strict + Drizzle + Supabase client wiring.
- Tailwind v4 + shadcn/ui init; base theme tokens.
- Bahasa Indonesia string namespace + i18n hook (no en-US fallback in UI).
- CI skeleton: typecheck, lint, format, build, Drizzle migration gate.
- Tooling installed: `agent-browser` CLI, `firecrawl` CLI, Playwright (Chromium-only) for print-CI.

**Exit criteria (mechanical):**
- `pnpm build` green; `pnpm typecheck` + `pnpm lint` clean.
- `/health` route returns 200.
- A shadcn `<Button>` renders on `/` with an ID string in Bahasa Indonesia.
- CI runs on PR and blocks on red.

**Dependencies:** None.
**Effort:** S–M.
**Commit strategy:** `chore: bootstrap next15 supabase drizzle tailwind4 shadcn` · `chore(ci): add typecheck lint build pipeline` · `feat(i18n): id locale baseline`.

---

### Phase 1 — Tenancy & Compliance Foundation  ★ SHIP-BLOCKERS
**Goal:** The multi-tenancy + compliance substrate that every feature sits on. **This phase is non-negotiable and cannot be skipped or parallelized.**
**Built:**
- Drizzle schema: `school`, `user`, `school_membership` (M:N, `tenant_role` never superuser), `identity` (1:N from user).
- `tenant_id` column + RLS policy on **every** tenant-scoped table.
- Transaction pattern: `SET LOCAL app.tenant_id` per request (transaction-scoped, PgBouncer-safe, auto-resets at COMMIT).
- **RLS linter** — CI script that introspects all migrations and fails if any tenant-scoped table lacks `tenant_id` + policy.
- **Audit log** table + write helper invoked on all sensitive writes.
- **Field-level encryption** (defense-in-depth, at-rest only) for PII columns; rotation = incident-only, never scheduled.
- Time/Calendar primitives (§A9): UTC store, WIB/WITA/WIT render helpers, per-school TZ, per-school Semester start/end (no hardcoded calendar).

**Exit criteria (TDD — red first):**
- Test: a query with no `app.tenant_id` set returns **zero rows** from any tenant-scoped table (red → green).
- Test: user in School A cannot read/write School B rows (cross-tenant isolation test, must fail before RLS, pass after).
- Test: a sensitive write produces an audit-log row.
- RLS linter test: drop a policy in a throwaway migration → CI fails.
- Time test: a UTC timestamp renders as WIB and WITA correctly per school TZ.

**Dependencies:** Phase 0.
**Effort:** L.
**Commit strategy:** one atomic commit per concern → `feat(db): school user membership schema` · `feat(rls): tenant_id + policy on all tenant tables` · `feat(rls): SET LOCAL app.tenant_id tx pattern` · `feat(ci): rls linter gate` · `feat(audit): immutable audit log helper` · `feat(security): field-level encryption for PII` · `feat(time): utc store wib wita wit render`.

---

### Phase 2 — Auth Foundation
**Goal:** ~~Supabase Auth + Google OAuth~~ → **WorkOS AuthKit** (per EXECUTION-MODE override): opaque server sessions, organizations = tenants, roles = `tenant_role`, and role-change revocation.
**Built:**
- **WorkOS AuthKit** integration (replaces Supabase Auth + Firebase); server-side session via httpOnly cookie.
- WorkOS `Organization` = **Satuan Pendidikan** (tenant); `Membership` = **Keanggotaan Satuan Pendidikan** (M:N).
- `User 1:N Identity` linking (verified-email match) preserved conceptually at the app/DB layer.
- **Opaque server-side session**, httpOnly, SameSite=Strict via AuthKit (deliberately NOT client JWT / `auth.uid()`).
- Session revocation on role change (fired teacher's session dies server-side).
- `tenant_role` resolution into transaction context on every authenticated request.

**Exit criteria (TDD):**
- Test: Google OAuth sign-in issues an httpOnly, SameSite=Strict cookie; no client-readable JWT.
- Test: a user with memberships in 2 schools can switch active school and sees only that tenant's data.
- Test: revoking a role mid-session → next request is 401/403 (fired-teacher test).
- Test: authenticated request sets `app.tenant_id` to the user's active membership.

**Dependencies:** Phase 1 (tenant context + membership schema).
**Effort:** M.
**Commit strategy:** `feat(auth): supabase auth + google oauth` · `feat(auth): opaque httpOnly server session` · `feat(auth): role-change session revocation` · `feat(auth): tenant_role binding per request`.

---

### Phase 3 — AI Generation Core  ★ SHIP-BLOCKERS (parallel with Phase 4)
**Goal:** The shared AI job infrastructure every generator module reuses. First generator type lands here as the canonical reference.
**Built:**
- **AI Job state machine** with exactly 3 terminals: `COMPLETED | FAILED | CANCELLED` (no v2 taxonomy).
- `idempotency_key UNIQUE` on job table (prevents double-click duplicate token spend).
- **Bounded retry** on provider 5xx ONLY — exponential backoff, ≤3.
- **Cooperative cancel.**
- **Per-school token budget** + concurrency: N≈4–8 concurrent jobs, queue the tail.
- **Provenance** immutable per doc: `prompt_hash + provider + model + key_id`.
- **Signature gate UX**: visible "diverifikasi oleh guru" + one-click verify + offline draft mode.
- Vercel AI SDK + `generateObject` + Zod schema validation (uncontested).
- **Curriculum seed corpus** (MVP compliance artifact): schema `fase/jenjang/mapel/kelas/cp/tp[]/atp[]`. The first seed is approved/curated and versioned. Transcribing public gov facts ≠ ToS violation. No machine-readable source exists (login-gated PDFs). Roadmap: deterministic AI-assisted seeding may accelerate future updates only after source snapshots, schema validation, golden diffs, provenance, and human approval are in place.
- One reference generator wired end-to-end (the E-Raport *deskripsi capatian* generator — reused by the tracer bullet).

**Exit criteria (TDD):**
- Test: duplicate submit with same `idempotency_key` returns cached result, spends token once.
- Test: a 5xx from provider triggers ≤3 retries then `FAILED`; a 4xx does not retry.
- Test: cancel mid-flight → job reaches `CANCELLED` without orphan spend.
- Test: 9th concurrent job in a school with N=8 budget queues (not rejected, not run immediately).
- Test: completed doc has provenance row with all 4 fields and a visible signature flag defaulting to *unverified*.
- Test: `generateObject` output validates against its Zod schema or job = `FAILED`.
- Test: curriculum seed query returns seeded CP/TP/ATP for a given fase×jenjang×mapel.

**Dependencies:** Phases 1 + 2 (provenance needs user; idempotency keyed per-school; signature needs teacher identity).
**Effort:** XL.
**Commit strategy:** atomic per subsystem → `feat(ai): job table + 3-terminal state machine` · `feat(ai): idempotency_key unique` · `feat(ai): bounded 5xx retry backoff` · `feat(ai): cooperative cancel` · `feat(ai): per-school token budget + queue` · `feat(ai): immutable provenance row` · `feat(ai): signature gate ux + offline draft` · `feat(ai): vercel sdk generateObject + zod` · `feat(curriculum): seed corpus schema + fase jenjang mapel data`.

---

### Phase 4 — Print & Export Core  ★ (parallel with Phase 3)
**Goal:** The print/export matrix harness and golden-set mechanism. Built against a placeholder doc; real golden-sets bind in Phase 5.
**Built:**
- **react-to-print** wrapper for browser CETAK (print buttons).
- **Puppeteer (server-side)** for PDF + WORD (.docx) export (react-to-print cannot make files).
- Page sizes: **A4 + F4 only** (no Legal).
- **Chromium-only Playwright** print matrix for CI.
- **Pixel-diff at fixed DPI** (NOT byte-hash — font/OS nondeterminism, react-to-print #406).
- Matrix axes: `doctype × {A4,F4} × {portrait,landscape} × {logo present,absent}`.
- **Golden-set fixture mechanism**: versioned, re-validated on every model/prompt bump.

**Exit criteria (TDD):**
- Test: a rendered A4 portrait doc prints via react-to-print without layout error.
- Test: Puppeteer produces a `.pdf` and a `.docx` for the same doc.
- Test: changing the placeholder doc's content triggers a pixel-diff failure against its golden fixture; regenerating the golden passes.
- Test: logo-present vs logo-absent variants both render within the matrix.
- CI: print matrix job runs Chromium-only and is green on the placeholder.

**Dependencies:** Phase 1 (per-school logo/TZ in render context). Independent of Phase 3 except golden-binding (done in Phase 5).
**Effort:** L.
**Commit strategy:** `feat(print): react-to-print cetak wrapper` · `feat(print): puppeteer pdf + docx export` · `feat(print): a4 f4 page sizing` · `feat(ci): chromium-only playwright print matrix` · `feat(print): pixel-diff at fixed dpi` · `feat(print): versioned golden-set fixtures`.

---

### Phase 5 — Tracer-Bullet Vertical Slice: E-Raport E2E  ★ TRACER BULLET
**Goal:** The thinnest possible end-to-end path — **login → Data Siswa → Input Nilai → AI deskripsi → E-Raport → print** — exercising every layer (auth, tenancy, AI core, print core, compliance). This proves the architecture before breadth.
**Built (thin versions, full UX later):**
- **Profil Saya** (minimal — name, NIP, contact).
- **Pengaturan Sekolah** (minimal — name, logo, kepsek, semester, TZ).
- **Data Siswa** (minimal CRUD — add/edit student in a rombel).
- **Input Nilai Mapel** (formatif/PTS/PAS → NA computed; deskripsi capatian triggers the Phase 3 reference generator).
- **E-Raport** (render a single student's raport with nilai + AI deskripsi + signature + provenance).
- **Input Rekap Absensi** (ketidakhadiran feeds E-Raport).
- **Bind first real golden-sets** into the Phase 4 print matrix for the E-Raport doctype.
- Full Bahasa Indonesia UI on all screens.

**Exit criteria (TDD — the tracer-bullet user flow):**
- E2E test (Playwright via `agent-browser`): teacher logs in (Google) → creates a student → enters nilai → generates AI deskripsi → the doc shows *unverified* signature → one-click verifies → prints E-Raport (A4) → Puppeteer exports PDF + DOCX → pixel-diff against golden passes.
- Test: cross-tenant — School B teacher cannot see the School A raport created above.
- Test: AI deskripsi row carries provenance + signature flag.
- Test: the offline draft mode produces an unverified draft that cannot be exported as final until signed.
- Print matrix green for `eraport × {A4,F4} × {portrait,landscape} × {logo present,absent}`.
- Lint/typecheck/build all green.

**Dependencies:** Phases 1, 2, 3, 4.
**Effort:** L.
**Commit strategy:** `feat(profil-saya): minimal professional profile` · `feat(pengaturan): school config + logo + semester + tz` · `feat(data-siswa): crud + rombel + import` · `feat(input-nilai): formatif pts pas + NA + deskripsi AI trigger` · `feat(e-raport): render + signature + provenance` · `feat(rekap-absensi): ketidakhadiran → eraport` · `feat(print): bind eraport golden-sets into matrix` · `test(e2e): tracer-bullet login→nilai→ai→print flow`.

> **Verification gate (HARD):** Do not start Phase 6 until the tracer-bullet E2E test is green and cross-tenant isolation holds. This is the architectural proof point.

---

### Phase 6 — Horizontal MVP Modules  (parallel sub-waves)
**Goal:** Build the remaining MVP modules on the proven core. Three independent modules → parallel.

#### 6a — Bank Soal (unified)
- Merge source 11 (Penilaian/KKTP) + 26 (KKTP) + 27 (Bank Soal AI).
- Keys on **Bloom taxonomy + komposisi soal** (distinct input surface per §A3).
- Reuses Phase 3 job machine, idempotency, provenance, signature.
- Print via Phase 4 (soal paper, A4/F4).
- **Exit:** E2E test generates a HOTS question set for a given CP+TP, validates provenance+signature, prints.

#### 6b — Perangkat Ajar (unified generator shell)
- Merge source 18 (Prog Tahunan) + 19 (Prog Semester) + 20 (ATP) + 21 (Modul Ajar/RPM) + 22 (Bahan Ajar) + 23 (Modul Kokurikuler) + 25 (LKPD).
- **One UX shell, per-type storage + per-type validation** (NOT one god-table — rejected §B). Modul Ajar keys on Profil Lulusan + CP + TP; others vary.
- "Coverage %" meter signal replaces 28-item sidebar (§A5).
- **Exit:** E2E test generates a Modul Ajar for 3 Profil Lulusan dims + CP + TP, validates per-type Zod schema, signs, prints.

#### 6c — Absensi (QR)
- Source 13 (realtime scan) + supporting 05 (Jadwal) + 06 (Kalender → `SchoolHoliday`) + 10 (Jurnal).
- **nimiq/qr-scanner** (WebWorker + native BarcodeDetector, 5.6kB gz).
- Online-required for real-time QR sync (offline = cheating enabled — §A7).
- Rekap feeds E-Raport (Phase 5).
- **Exit:** E2E test scans a student QR → records hadir → Jurnal entry created → rekap updates → reflects in E-Raport.

**Phase 6 dependencies:** Phase 5 (core proven).
**Phase 6 effort:** Bank Soal L · Perangkat Ajar XL · Absensi L. Run in parallel (W6).
**Commit strategy:** per module, atomic per feature → e.g. `feat(bank-soal): bloom+komposisi input + zod` · `feat(bank-soal): reuse job machine + provenance` · … one E2E test commit per module.

> **Verification gate:** All three modules pass their E2E tests; cross-tenant isolation re-tested; print matrix extended with new doctypes (golden-sets bound).

---

### Phase 7 — Offline-first (scoped to daily ops)
**Goal:** Offline support for daily operations only (§A7).
**Built:**
- Offline-first for: **attendance, nilai drafts, jadwal, jurnal, print cached docs**.
- Online-required (no offline): live AI generation, real-time QR sync.
- **Versioned-write + reject-on-stale-semester** protocol for post-finalization offline sync conflicts (bare DB flag insufficient — §A7).
- Conflict UX: reject stale-semester writes, surface version mismatch.

**Exit criteria (TDD):**
- Test: enter nilai draft offline → persists locally → syncs on reconnect with correct version.
- Test: a write finalized server-side (semester closed) is **rejected** on offline sync, not silently merged.
- Test: cached raport prints offline; live AI gen is blocked offline with a clear ID message.

**Dependencies:** Phases 5 + 6.
**Effort:** L.
**Commit strategy:** `feat(offline): nilai draft local persistence` · `feat(offline): attendance offline queue` · `feat(offline): versioned-write stale-semester reject` · `feat(offline): cached doc print`.

---

### Phase 8 — Ship Gate & Hardening
**Goal:** Final compliance + quality verification before release.
**Verification (all must pass):**
- Full RLS pen-test: scripted cross-tenant probe across all tenant tables (zero leakage).
- RLS linter green on 100% of tenant-scoped tables.
- Signature gate + provenance present on 100% of generated AI docs (sampled audit).
- Audit log covers all sensitive write paths.
- Print matrix green across **all** doctypes × {A4,F4} × {portrait,landscape} × {logo present,absent}.
- Golden-set re-validation run after final prompt/model bump.
- **k-anonymity check** on any leaderboard/analytics (per §A10) — block release if re-identifiable; gamification ships only as shame-free institutional pride (e.g. "Sinkron 5 Hari Berturut-turut"), leaderboards deferred.
- UU PDP review checklist signed off (consent flows, minimization, minor-data handling).
- Mobile + WCAG/A11Y review: core flows pass phone viewport checks, tap-target review, labels/focus/contrast checks, and include baseline **Panduan Penggunaan** affordances.

**Dependencies:** Phase 7.
**Effort:** M.
**Commit strategy:** `test(compliance): cross-tenant rls pentest` · `test(compliance): signature+provenance coverage` · `chore(release): golden-set revalidation` · `docs: uu pdp compliance checklist`.

---

## 5. Atomic Commit Strategy (global)

- **Convention:** `<type>(<scope>): <subject>` — types: `feat · fix · chore · test · docs · refactor`.
- **Atomic rule:** one verifiable concern per commit. If a commit can't be described by a single exit criterion, split it.
- **TDD order:** failing test commit (`test(scope): red — <criterion>`) may precede the green commit (`feat(scope): <impl>`).
- **Compliance commits are mandatory and never squashed** — RLS policy, audit log, provenance, signature each stand alone for audit traceability.
- **No commit touches two tenant-scoped tables without also touching their RLS policies** (enforced by review + RLS linter).
- **Tracer-bullet commits must include their E2E test in the same logical group.**

---

## 6. Post-MVP / Deferred (do NOT sequence into MVP)

> Canonical split file: `../postmvp.md`. The table below is retained as the
> original hyperplan-derived summary.

From bundle §C (unresolved/deferred) + §A8 + §A5 kills:

| Item | Reason deferred | Trigger to revisit |
|---|---|---|
| **GTM final shape** (school-first + free parent layer; Dinas/Kecamatan license) | §C.1 — needs market validation | Post-MVP business review |
| **Dapodik retention duty** | §C.2 — unsourced legal duty | Compliance review post-MVP |
| **Monetization final numbers** (per-student cap private / free public+parent) | §C.3 | Business review |
| **Starter scaffold** (build-from-scratch vs Supastarter-as-disposable) | §C.4 — plan-agent decision; Phase 0 chose build-from-scratch for security posture clarity | If velocity stalls, revisit as disposable only |
| **k-anonymity threshold** for kecamatan leaderboards | §C.5 + §A10 — re-identifiable at n=3 | Before any leaderboard ships |
| **Gamification leaderboards** | Need k-anon gate first | After k-anon resolved |
| **Parent WhatsApp channel** (external-principal consent + withdrawal + minimization) | §A8 — external principal, consent-gated aggregate only | Post-MVP, after consent infra |
| **"WhatsApp Audit Pack"** branded weekly cards | §A8 — consent-gated | With parent channel |
| **EduExam / CBT (source 24)** | Online-required anti-cheat = separate system | Separate project |
| **Lembar Jawaban config (source 28)** | Config-only, low value early | Post-MVP |
| **Cover Administrasi (source 17)** | No AI, trivial | Killed (build inline if needed) |
| **Panduan Kurikulum (source 03)** | Static docs | Killed (host as static assets) |
| **Deterministic AI-assisted curriculum seeding** | MVP needs approved CP/TP/ATP seed data first; AI-assisted extraction can be high-quality only with locked source snapshots, repeatable prompts/parsers, schema validation, golden diffs, provenance, and human approval | Post-MVP, after the curriculum seed schema and review workflow stabilize |
| **pgvector RAG** over curriculum | §A4 — "if/when RAG added" | If seed-corpus retrieval proves insufficient |
| **Bantuan AI** / RAG-based product help | Requires curated help corpus, retrieval safety, answer evaluation, and stable baseline **Panduan Penggunaan** content first | Post-MVP, after core flows and guidance copy stabilize |

---

## 7. Category + Skills Recommendations (per phase, for downstream agents)

| Phase | Category | Skills to load | Rationale |
|---|---|---|---|
| 0 Bootstrap | `quick` | `customize-opencode`¹ (config only) | Mechanical scaffold. ¹only if editing opencode config. |
| 1 Tenancy & Compliance | `deep` | — (TDD discipline internal) | Correctness-critical; one goal = the RLS/audit/encryption substrate. |
| 2 Auth | `unspecified-high` | — | Supabase Auth integration, multi-session edge cases. |
| 3 AI Core | `deep` (fan out: state-machine, provenance, budget as parallel `deep` calls) | — | Each is a discrete hard subproblem; one goal per call. |
| 4 Print Core | `unspecified-high` | `frontend-ui-ux` (print CSS), `playwright` (print-CI) | Pixel-diff + Puppeteer + react-to-print. |
| 5 Tracer Bullet | `unspecified-high` | `frontend-ui-ux`, `playwright` (E2E via agent-browser) | Integrates all layers; UI polish + E2E proof. |
| 6a Bank Soal | `unspecified-high` | — | Reuses core; Bloom/komposisi domain logic. |
| 6b Perangkat Ajar | `deep` (per generator type, parallel) | — | Per-type storage/validation; multiple distinct generators. |
| 6c Absensi QR | `visual-engineering` + `unspecified-high` | `frontend-ui-ux` (camera/scanner UX) | Live scanner client UX + backend. |
| 7 Offline-first | `deep` | — | Versioned-write conflict protocol is hard. |
| 8 Ship Gate | `unspecified-high` | `security-review` (RLS pen-test), `visual-qa` (print matrix) | Verification + hardening. |

**Skills explicitly omitted from feature phases:** `remove-ai-slops`, `cubic-loop`, `review-work` — invoke only as post-phase QA, not during build. `git-master` — load for any commit/rebase operation.

---

## 8. TODO List (for the caller — execute by wave)

> Add these via TodoWrite; execute in wave order. Each QA check is mechanically verifiable.

### Wave 1 — Phase 0
- [ ] **0. Bootstrap repo + stack + CI** — What: git init, Next15+Supabase+Drizzle+Tailwind4+shadcn, ID i18n, typecheck/lint/build CI, agent-browser+firecrawl+Playwright. Depends: none. Blocks: all. Category: `quick`. Skills: []. QA: `pnpm build` green, `/health` 200, ID string renders.

### Wave 2 — Phase 1
- [ ] **1. Tenancy & compliance foundation** — What: schema+RLS-everywhere+`SET LOCAL app.tenant_id`+RLS linter+audit log+field encryption+UTC/WIB/WITA/WIT. Depends: 0. Blocks: 2,3,4. Category: `deep`. Skills: []. QA: cross-tenant isolation test green; RLS linter fails on dropped policy.

### Wave 3 — Phase 2
- [ ] **2. Auth foundation** — What: Supabase Auth + Google OAuth, opaque httpOnly session, role-change revocation, tenant_role binding. Depends: 1. Blocks: 3,4. Category: `unspecified-high`. Skills: []. QA: no client JWT; fired-teacher session dies; tenant switch isolates data.

### Wave 4 — Phase 3 ∥ Phase 4 (parallel)
- [ ] **3. AI generation core** — What: 3-terminal job machine, idempotency_key, 5xx retry≤3, cooperative cancel, per-school budget N≈4–8, provenance (4 fields), signature gate+offline draft, Vercel SDK+Zod, curriculum seed corpus, reference deskripsi generator. Depends: 1,2. Blocks: 5. Category: `deep` (fan out per subsystem). Skills: []. QA: idempotency dedup; cancel→CANCELLED; provenance complete; Zod invalid→FAILED.
- [ ] **4. Print & export core** — What: react-to-print, Puppeteer PDF+DOCX, A4/F4, Chromium-only matrix, fixed-DPI pixel-diff, versioned golden-set. Depends: 1. Blocks: 5. Category: `unspecified-high`. Skills: [`frontend-ui-ux`,`playwright`]. QA: pixel-diff fails on content change; A4+F4 both export.

### Wave 5 — Phase 5
- [ ] **5. Tracer bullet: E-Raport E2E** — What: thin Profil Saya + Pengaturan + Data Siswa + Input Nilai + E-Raport + Rekap Absensi; bind first golden-sets. Depends: 1,2,3,4. Blocks: 6. Category: `unspecified-high`. Skills: [`frontend-ui-ux`,`playwright`]. QA: E2E login→nilai→AI→verify→print→export green; cross-tenant isolated; matrix green for eraport.

> **HARD GATE:** Do not start Wave 6 until Phase 5 E2E + cross-tenant isolation pass.

### Wave 6 — Phase 6a ∥ 6b ∥ 6c (parallel)
- [ ] **6a. Bank Soal (unified)** — What: merge 11/26/27; Bloom+komposisi input; reuse core; print. Depends: 5. Blocks: 7. Category: `unspecified-high`. Skills: []. QA: HOTS generation E2E + provenance + print.
- [ ] **6b. Perangkat Ajar (unified shell)** — What: merge 18/19/20/21/22/23/25; per-type storage+validation; coverage meter. Depends: 5. Blocks: 7. Category: `deep` (per generator type). Skills: []. QA: Modul Ajar gen for 3 Profil Lulusan + per-type Zod + print.
- [ ] **6c. Absensi QR** — What: 13+05+06+10; nimiq/qr-scanner; online-required sync; rekap→E-Raport. Depends: 5. Blocks: 7. Category: `visual-engineering`+`unspecified-high`. Skills: [`frontend-ui-ux`]. QA: scan→hadir→jurnal→rekap→E-Raport reflection.

### Wave 7 — Phase 7
- [ ] **7. Offline-first (daily ops)** — What: offline attendance/nilai-draft/jadwal/jurnal/cached-print; versioned-write stale-semester reject. Depends: 6. Blocks: 8. Category: `deep`. Skills: []. QA: offline draft syncs; stale-semester write rejected; cached print works offline.

### Wave 8 — Phase 8
- [ ] **8. Ship gate & hardening** — What: RLS pen-test, signature+provenance coverage audit, full print matrix, golden re-validation, k-anon block on leaderboards, UU PDP checklist. Depends: 7. Blocks: release. Category: `unspecified-high`. Skills: [`security-review`,`visual-qa`]. QA: zero cross-tenant leakage; 100% AI docs signed+provenanced; full matrix green.

---

## 9. Risks & Watch-items (carried from bundle, not re-litigated)
- **Indonesian school wifi + double-click** → idempotency_key is load-bearing (Phase 3). Stress-test concurrent duplicate submits.
- **Per-school token budget** → 40th teacher must queue, not wait 20–40min (§A3). Load-test N=8 budget.
- **react-to-print #406** nondeterminism → pixel-diff (not byte-hash) is mandatory (Phase 4).
- **Field-key rotation perf cliff** → incident-only rotation, never scheduled (§A1).
- **Client JWT tenant escape** → opaque server session is the deliberate rejection of Supabase default (Phase 2) — do not "simplify" back to `auth.uid()`.
- **Older/non-technical users + phone-first usage** → treat mobile ergonomics, WCAG/A11Y, and baseline **Panduan Penggunaan** as product requirements; do not defer clarity to a future AI chatbot.
- **Curriculum AI determinism/quality** → AI may assist CP/TP/ATP seeding only through a repeatable, source-locked pipeline with schema validation, golden diffs, provenance, and human approval; unreviewed AI output must not become canonical curriculum data.

---

*End of plan. Derived entirely from `hyperplan/insights-bundle.md` (converged positions §A, deferred §C, hard constraints §D). No architectural positions re-litigated.*
