# HYPERPLAN — Defensible Insights Bundle (Phase 6 Distillation)

**Origin:** 5-member adversarial team (contrarian-minimalist, quality-maximalist, arch-logician, wildcard-visionary, depth-researcher) × 3 rounds (independent → cross-attack → defend/refine/concede).
**Rule:** Only positions that survived attack AND were defended or refined (not dropped) in Round 3 appear below. Lead does NOT write the plan — this bundle is the input to the plan agent.

---

## A. CONVERGED POSITIONS (defensible)

### A1. Multi-tenancy & Data Isolation
- **User ↔ School = M:N `SchoolMembership`** (NOT 1:N). Evidence: Kemendikbud Guru Berbagi program, MGMP cross-assignments, Yayasan chains. AL conceded posing this as "open" was faux-humility.
- **RLS policy on EVERY table** + `SET LOCAL app.tenant_id` per transaction (transaction-scoped, PgBouncer-pooling-safe; auto-resets at COMMIT).
- **Opaque server session in httpOnly cookie** (NOT client JWT). `@supabase/ssr` mints this. Client JWT (`auth.uid()`) is the Supabase default we deliberately reject as a tenant-escape vector.
- **`tenant_role` never superuser.** CI linter fails any migration missing `tenant_id` + policy.
- **REJECT:** schema-per-tenant, DB-per-tenant (200-school collapse unsourced), per-tenant Gemini key (breaks provenance).
- **Field-level encryption KEPT as defense-in-depth** for at-rest copies (backup leak / dump / analytics clone / read-replica) — RLS does NOT protect at-rest. **Key rotation = incident-only**, NEVER scheduled (QM conceded AL's perf cliff).

### A2. Auth
- ✅ **OVERRIDE: WorkOS AuthKit** (not Supabase Auth). Server-side opaque httpOnly session fits §A2's rejection of client JWT exactly.
- WorkOS Organization = tenant (**Satuan Pendidikan**); WorkOS Membership + Role = `tenant_role` (never superuser).
- ~~Supabase Auth + Google OAuth provider (replaces Firebase).~~ → WorkOS owns identity, organizations, memberships, roles, session.
- `User 1:N Identity` for linking (verified-email match).
- Session = opaque server-side, httpOnly, SameSite=Strict.
- Fired teacher's session dies on role change (server-controlled revocation).

### A3. AI Document Generation
- **11 generator modules ≠ 1 feature** (AL defeated CM at data layer). Distinct inputs: Cover Administrasi takes NO AI; Bank Soal keys on Bloom+komposisi; Modul Ajar keys on Profil Lulusan+CP+TP. **Per-type storage + per-type validation; unified UX shell only** (CM R3 conceded).
- **AI Job state machine v1 = 3 terminals:** `COMPLETED | FAILED | CANCELLED` (AL R3 collapsed the v2 dead-letter/rejected/expired taxonomy per CM).
- **Load-bearing:** `idempotency_key UNIQUE` in DB (Indonesian school wifi + teacher double-click = duplicate token spend against school's BYO budget).
- **Bounded retry on provider 5xx ONLY**, exponential backoff, ≤3.
- **Cooperative cancel.**
- **Concurrency:** per-school **token budget**, N≈4-8 concurrent jobs, queue the tail (AL R3 fixed DR's 1-per-user arithmetic error — 40th teacher would've waited 20-40min).
- **Signature gate = SHIP-BLOCKER.** UU PDP Art. 20/35: vendor liable for unverified automated processing of minors' data. Every AI doc has visible "diverifikasi oleh guru" + immutable provenance (`prompt_hash + provider + model + key_id` — AL corrected QM's `model_version`-only). Solve blocking with **one-click UX + offline draft mode**, NOT removal.
- **NO machine-readable Kurmer source exists** (PMM/kurikulum.kemdikbud.go.id = login-gated PDFs). Hand-curated seed corpus per fase×jenjang×mapel IS the compliance artifact. Schema: `fase/jenjang/mapel/kelas/cp/tp[]/atp[]`. Transcribing public gov facts ≠ ToS violation (DR R3).
- **AI SDK:** Vercel AI SDK + `generateObject` + Zod schema validation (uncontested).

### A4. Stack
- ✅ **OVERRIDE: Next.js 15.3.x LTS-line** (most-patched; authkit+Drizzle best-tested). Not Next 16.
- **Next.js 15.3 + WorkOS AuthKit + Supabase (DB/RLS only) + Drizzle** (DR R1 winner, defended R3 — OpenNext self-hosts to Cloudflare/AWS, no Vercel lock-in).
- **Tailwind v4 + shadcn/ui** (USER HARD CONSTRAINT — non-negotiable).
- **react-to-print** for CETAK browser-print buttons.
- **Puppeteer (server-side)** for PDF + WORD export (react-to-print cannot generate files; modules 02 + 28 need .docx).
- **nimiq/qr-scanner** (WebWorker + native BarcodeDetector, 5.6kB gz) for live QR attendance.
- **pgvector** (Supabase-native) for curriculum retrieval (if/when RAG added).

### A5. Module Scope (Information Architecture)
- **CUT 28 → ~6-10 core MVP modules.** CM's thesis (refined, not fully accepted): unified "Generator Dokumen" nav entry with doc-type dropdown; meter for Kurmer coverage signal ("Coverage 92%") replaces 28-item sidebar signaling.
- **MVP vertical slices:** E-Raport + Input Nilai (one slice), Data Siswa, unified Perangkat Ajar generator, Pengaturan Sekolah, Absensi (QR), Profil Saya.
- **Kill:** 03 (Panduan Kurikulum → static docs), 24 (Lembar Jawaban config — defer), 28 (Cover Administrasi — no AI, trivial).
- **Merge:** 16→13 (Kalender→Jadwal fold conceded by CM — different writers: Absensi reads `SchoolHoliday`); 19→18; 20/21/22/23/25 → unified generator shell; 11/26 → Bank Soal.

### A6. Print
- **A4 + F4 ONLY** (drop Legal — Indonesia standard).
- **Chromium-only Playwright** matrix for v1 (drop Safari/Firefox — QM conceded).
- **Pixel-diff at fixed DPI** (NOT byte-hash — font/OS nondeterminism, react-to-print #406).
- Matrix axes: `doctype × {A4, F4} × {portrait, landscape} × {logo present, absent}`.
- Golden set persists as versioned fixtures, re-validated on every model/prompt bump.

### A7. Offline-first (scoped)
- **Offline-first for daily ops ONLY:** attendance, nilai drafts, jadwal, jurnal, print cached docs.
- **Online-required:** CBT anti-cheat (EduExam), live AI generation, real-time QR sync (offline = cheating enabled — DR R2).
- **Versioned-write + reject-on-stale-semester protocol** for post-finalization offline sync conflicts (AL R3 conceded the miss — bare DB flag insufficient).

### A8. Parent Channel (contested → refined)
- Parents are **external principals**, NOT school-tenant members (UU PDP Art. 16 — minor data to shared/borrowed/abusive co-parent WA numbers is a breach).
- Parent data disclosure = external-principal flow: consent + withdrawal + minimization.
- **KEEP parent as retention audience** (WV R3).
- **WhatsApp features = consented aggregate packaging ONLY**, never raw PII broadcast (QM's attack held).
- **"WhatsApp Audit Pack"** (WV viral feature, refined): branded weekly cards (attendance recap, moments, agenda, prestasi, Kurmer explainer), shareable image format, consent-gated.

### A9. Time & Calendar
- **UTC store, WIB/WITA/WIT render.** Per-school TZ from day 1.
- Per-school Semester start/end (NOT hardcoded calendar dates).

### A10. Gamification (refined)
- Shame-free institutional pride: "Sinkron 5 Hari Berturut-turut", "Raport Siap H-7".
- **Kecamatan leaderboards need k-anonymity check** before shipping (QM R2: re-identifiable at n=3 attrs at kecamatan scale).

---

## B. CONCEDED / DROPPED POSITIONS

| Position | Dropped by | Reason |
|---|---|---|
| DB-per-tenant | all | 200-school collapse unsourced |
| schema-per-tenant | all | AL rejected in R1 |
| routine field-key rotation | QM (R3) | AL's perf cliff |
| Legal page size | QM (R3) | Indonesia = A4/F4 |
| Safari/Firefox print matrix v1 | QM (R3) | Chromium-only |
| byte-hash print CI | QM (R3) | font/OS nondeterminism |
| Canonical external CP/TP API | QM (R3) | doesn't exist |
| Per-tenant Gemini key | AL (R2) | breaks model provenance |
| Dinas-first GTM | WV (R3) | 18mo procurement death |
| 11-modules-into-1-god-table | CM (R3) | AL: distinct compliance surfaces |
| Supastarter $299 as audited | DR (R3) | marketing copy, not security |

---

## C. UNRESOLVED / DEFERRED (flag for plan agent)

1. **GTM final shape:** school-first (charge per-student cap, private schools only) + free parent layer. Dinas/Kecamatan license = future phase.
2. **Dapodik retention duty:** unsourced (DR flagged). Defer to compliance review post-MVP.
3. **Monetization model:** per-student cap (private schools), free (public schools + parents). Final numbers TBD.
4. **Starter scaffold:** build from scratch OR use Supastarter as disposable scaffolding (never inherited security posture). Plan agent decides.
5. **k-anonymity threshold** for kecamatan leaderboards.

---

## D. USER HARD CONSTRAINTS (non-negotiable)

- **Tailwind v4 + shadcn/ui** for all UI/UX.
- **agent-browser CLI** for browser automation (NOT playwright MCP — playwright lib OK for CI print tests).
- **firecrawl CLI** for scraping reference material.
- **Bahasa Indonesia** UI strings (source app is Indonesian).

---

## E. SOURCE ARTIFACTS (on disk)

- `/Users/ktz/adminslop/hyperplan/round-1-bundle.md` — all 5 R1 independent analyses.
- `/Users/ktz/adminslop/hyperplan/round-2-{member}.md` × 5 — cross-attacks.
- `/Users/ktz/adminslop/hyperplan/round-3-{member}.md` × 5 — defend/refine/concede.
- `/Users/ktz/adminslop/scrape/all-modules.md` — 28-module recon brief (13KB).
- `/Users/ktz/adminslop/scrape/pages/NN-slug.{json,png}` × 28 — module content + screenshots.
