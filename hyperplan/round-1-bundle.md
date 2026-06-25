# Hyperplan Round 1 Bundle — EduAdmin Pro Rewrite

5-member adversarial cell. Independent analyses. Source brief: `/Users/ktz/adminslop/scrape/all-modules.md`.

---

## Round 1 — Quality Maximalist

PII surface: UU PDP (in force Oct 2022). Module 01 (Profil Saya) collects NIK, NIP, NUPTK, BPJS, bank account, spouse/child names, blood type, medical history. Module 04 (Data Siswa) adds minors' names, parent contacts, face images, QR IDs. Several are "data pribadi spesifik" (minors + biometric).

**1. Type/Data Fortress**
- RLS scoped to `tenant_id` on **every** table, including join + audit. No service-role bypass from client. Ever.
- Field-level encryption for NIK, NIP, BPJS, face URLs, addresses. Keys per-tenant, rotatable.
- Append-only audit log of every read/write of PII fields (actor, ts, tenant, purpose) — UU PDP Art. 47.
- Right-to-erasure path (Art. 8) — but schools have Dapodik retention duties, so build retention taxonomy, not naive delete.

**2. Untestable Surfaces**
- AI gen (11, 18–23, 25–27): non-deterministic. Snapshot + JSON-Schema validation + content gates.
- A4 print (17, 28, plus Cetak on 05, 06, 07, 08, 09, 10, 12, 16): pixel-coupled. Playwright print-to-PDF in CI, byte-hash diff vs golden per (doctype × browser × page-size × orientation).
- QR/Face scan (13): fake-camera harness (Playwright `fakeVideo`), pure-function decoder extraction, manual fallback e2e.

**3. AI Pipeline Integrity**
- Structured JSON-Schema output, validated before render. No free-text blobs.
- Canonical CP/TP source (Kemdikbudristek kisi-kisi) the prompt is grounded against.
- Golden set: 200+ (jenjang × mapel × fase × CP) tuples. Score: structural pass rate + banned-content regex.
- Bank Soal: every question ships with validated answer key AND worked explanation.

**4. Print Perfection**
Matrix: every doc type × {Chrome, Safari, Firefox} × {A4, Legal} × {portrait, landscape} × {logo on/off}. Cover (17) and Lembar Jawaban (28) highest risk — single-page exact. Byte-hash per combo.

**5. Observability Floor (v1)**
Structured logs with `tenant_id`, `user_id`, `module`, correlation id. Sentry-class with PII scrubbing per **field**. Per-AI-gen telemetry (prompt hash, model version, token cost, latency, validation pass/fail). Feature flags per tenant per module.

**6. One Non-Negotiable**
Every AI-generated document ships with visible "diverifikasi oleh guru" signature gate AND immutable provenance record (prompt hash + model version + CP references) stored server-side. No signature → no document → no export.

---

## Round 1 — Contrarian Minimalist

28 modules = bloated menu theater. 46% is duplicate UI for the same 3 jobs.

**1. Kill List (46% cut, 13 of 28)**
Kill: 03 Panduan (static text → docs site), 06 Kalender Akademik (fold into 05 Jadwal), 08 Manajemen Ekskul (fold into 04 Siswa + 24 Nilai Ekskul), 09 Portofolio Prestasi (fold into 04 Siswa profile tab), 14 Input Nilai Ekskul (fold into 12 Input Nilai Mapel as type filter), 19 Program Semester (merge into 18 Program Tahunan as semester expansion), 21 Bahan Ajar (merge into 20 Modul Ajar), 23 Modul Kokurikuler (merge into 20), 24 KKTP Kriteria (fold into 25 Bank Soal as config), 11 Penilaian Siswa (merge into 25 Bank Soal + 22 LKPD — same AI engine).

**2. MVP Boundary (irreducible 6 modules → 20% of 28)**
Rank by user pain:
1. **04 Data Siswa** (student CRUD = bedrock)
2. **12 Input Nilai Mapel** (grades = the actual job)
3. **13 Absensi Scan QR** (daily ritual, high retention)
4. **25 Bank Soal AI** (differentiator, viral)
5. **15 Modul Ajar / RPM** (administrative pain = buying trigger)
6. **05 Jadwal Pelajaran** (schedule = daily orientation)

Everything else v2.

**3. Tech Stack Heresy**
Refuse: SSR (React Server Components). SPA + In-memory cache > SSR complexity for a school admin tool used 3×/day.
Refuse: monorepo (turborepo/nx). Single app + worker queue. YAGNI.
Refuse: microservices. Modulith.
Refuse: GraphQL. REST or RPC, typed with Zod.
Refuse: Drizzle AND Prisma. Pick one. Drizzle (closer to SQL, no schema DSL lock-in).

**4. Biggest Risk**
The 11 "AI" modules are **the same feature wearing 11 masks**. Each generator is just a templated prompt + A4 renderer. Building 11 separate UIs = 11× maintenance for 1× capability. Risk: build 11 → ship none well.

**5. One Bold Bet**
**Build ONE "Generator Dokumen" primitive**: user picks document type (Modul Ajar / Bank Soal / Bahan Ajar / LKPD / KKTP / Program Asesmen / Cover / Prosem / Prota / ATP / Kokurikuler), fills one dynamic form, gets one AI call + one A4 render. One codebase. One test harness. One provenance model. Ship 11 docs for the price of 1.

---

## Round 1 — Architecture Logician

All 28 modules carry "SEKOLAH AKTIF" — every screen tenant-scoped. NIK/NIP/BPJS/grades/face biometrics in scope.

**1. Tenant Isolation**
**Pick: RLS on shared schema. `tenant_id` NOT NULL everywhere.**
- Reject schema-per-tenant: 28 entities × N schools = migration hell; cross-tenant analytics need FDW.
- Reject DB-per-tenant: no school is GB-scale; backup/restore/upgrade collapses past ~200 schools; pool exhaustion.

Failure A — leak via missing policy: CI linter fails migration if `CREATE TABLE` lacks sibling `tenant_id` + policy. App connects as `tenant_role` (never superuser), `SET LOCAL app.tenant_id` per tx; policies read `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.

Failure B — perf cliff: resolve `tenant_id` ONCE at request start (from session), inject via `SET LOCAL`; policy becomes bare equality — no join. Partition `Attendance`, `AI_Job`, `Document` by `tenant_id` when one school exceeds ~5% of rows.

**2. Auth Model**
Firebase OAuth + password are two **credentials**, not two **identities**.
- `User (id, firebase_uid NULL, primary_email, default_school_id)` 1:N `Identity (provider ∈ {google, password}, subject, claims_json, linked_at)`.
- Linking user-initiated, verified-email match. No silent auto-merge.
- **Session: opaque server-side session id in httpOnly cookie + refresh rotation.** NOT client JWT. Firebase ID token verifies server-side, mints our session. Token never reaches DB.
- School's custom Gemini key (§02) is a secret: KMS encrypt at rest, decrypt only in AI worker, rotate without code dep.

**3. Core Entity Graph**
```
School 1──N SchoolMembership N──1 User      (M:N — open Q §6)
School 1──N {Teacher, Student, Class, Subject, Document, AI_Job}
Class 1──N Rombel
Rombel 1──N StudentEnrollment N──1 Student  (per academic_year_id)
Teacher M──N Subject via TeachingAssignment (scoped: class/rombel/year)
Student 1──N Grade (student × subject × semester × type)
Student 1──N Attendance (student × date; hadir/sakit/izin/alfa)
Document 1──N AI_Job
```
Aggregates: `School` root; `StudentEnrollment` per year (re-enrollment = new record, never in-place); `GradeRecord` locked immutable once E-Raport finalized (post-lock = break-glass audit); `AI_Job` own aggregate, never holds user tx open.

Grades/attendance carry `(school_id, academic_year_id, semester_id)` — never bare timestamp.

**4. AI Job Lifecycle**
```
DRAFT → QUEUED → RUNNING →(stream)→ COMPLETED
  │       │        │
  ▼       ▼        ▼
REJECTED EXPIRED  FAILED (retry ≤3, exp backoff on provider 5xx ONLY)
                    │
                    ▼
              dead-letter + alert
any pre-terminal ──cancel_requested──▶ CANCELLED
```
- Idempotency in DB: `idempotency_key = hash(school_id, user_id, module, params_hash, academic_year, semester)` UNIQUE.
- Cost: pre-flight token estimate reserves school quota; post-flight settles. Per-school daily budget; per-user concurrency = 1.
- Retry ONLY on 5xx/timeout/network. NEVER on validation/content-policy/quota.
- Cancellation cooperative: `cancel_requested` flag, worker checks between stream chunks.
- BYO school key vs platform key: worker selects per `School.ai_provider_config`. Key exhaustion = `EXPIRED(reason='key_invalid')`.

**5. Time & Academic Calendar**
- All timestamps UTC. Render Asia/Jakarta (WIB) at edge. Model TZ per school from day 1 (Indonesia spans WIB/WITA/WIT).
- `AcademicYear (start_year, end_year)` composite natural key.
- `Semester (1=Ganjil, 2=Genap)` with **per-school** `start_date, end_date`. NOT hardcoded July/January.
- `SchoolHoliday`/`SchoolEvent` define non-instructional days.
- Time-bound data carries `semester_id` FK. **Finalization lock** flips semester read-only.

**6. The Question for Lead**
**Is `User` scoped to exactly one `School` (`User.school_id` FK, 1:N hermetic), or can one human belong to many Schools via `SchoolMembership` (M:N — multi-school teachers, district supervisors, Yayasan admins)?**

Forks entire plan: RLS shape, auth unification, AI quota/billing boundary, audit scope, whether "Yayasan dashboard" is expressible. Picking wrong = rewrite of security layer, not refactor. Indonesian reality: teachers commonly teach at 2 schools; Yayasan chains common. Leans M:N.

---

## Round 1 — Wildcard Visionary

Original = teacher paperwork machine wearing AI perfume. Power user = **the parent** (WhatsApp-first ibu/bapak who decides trust, payment pressure, reputation, daily compliance without logging in).

**1. User Inversion — Parent as real admin**
Reframe every module as "proof the school is alive today." QR attendance → instant WIB timestamp to parent WA: hadir/terlambat/pulang. E-Raport → evolving parent-readable growth story. Teachers input; parents create retention.

**2. Monetization Twist — district-paid, parent-visible**
Per-teacher SaaS churns (underpaid, priorities rotate). Per-document punishes usage. Invert: **Dinas/Kecamatan license + free parent layer**. Sell compliance dashboards upward; parents get viral daily value. Per-student cap only for private schools.

**3. Gamification Edge — shame-free school leagues**
No childish badges. Institutional pride: "Sinkron 5 Hari Berturut-turut," "Raport Siap H-7," "Absensi WIB Tertib," "Kurikulum Merdeka Coverage 92%." Anonymous kecamatan leaderboards unless opt-in.

**4. Offline Reality — internet is not a dependency**
Offline-first PWA is the product, not a feature. Breaks first: real-time QR, face scan, CBT, AI gen, CSV import collisions, multi-user nilai edits. "Real-time" must degrade to "eventually trusted" or it's theater.

**5. AI Cost Bomb — compound school memory, don't generate**
6 AI modules burning tokens for generic docs = margin trap. Moat: **local curriculum corpus per school/jenjang/fase** reusing CP, TP, mapel, prior outputs, teacher edits, accepted Dinas language. AI = retrieval + transformation + diff. "Deep Learning" dies; institutional memory wins.

**6. Heretical Viral Feature — WhatsApp Audit Pack**
One button: "Kirim Paket Bukti Mingguan ke Grup WA." Parent-safe cards: attendance recap, top class moments, upcoming agenda, unpaid tasks, prestasi, one Kurikulum Merdeka explainer. Branded with school logo, A4-printable, shareable image. Prevents 37 repetitive parent questions; every share is marketing.

---

## Round 1 — Depth Researcher

**1. Stack Benchmark — WINNER: Next.js 15 + Supabase + Drizzle**
- (a) **Next 15 + Supabase + Drizzle** — Next 15 (github.com/vercel/next.js, 128k★): App Router, RSC, Server Actions, built-in ISR, Vercel deploy. Supabase (github.com/supabase/supabase, 78k★): Postgres + RLS + Auth + Realtime + Storage + Edge Functions. Drizzle (github.com/drizzle-team/drizzle-orm, 24k★): SQL-first, 9kb runtime, edge-compatible.
- (b) SvelteKit + Pocketbase — SvelteKit (github.com/sveltejs/kit, 19k★) fast but smaller ecosystem; Pocketbase (github.com/pocketbase/pocketbase, 43k★) single-binary Go but no RLS primitives, manual tenant isolation, no managed managed-pg.
- (c) TanStack Start + Supabase — TanStack Start (github.com/TanStack/router, 8k★) promising but beta, no production case studies for SaaS yet.

WINNER rationale: Supabase RLS = multi-tenant by default; Drizzle edge-compatible for Vercel; Next 15 + Server Actions = zero-API-surface for type-safe mutations. Stack aligned with AL's RLS+SET LOCAL primitive.

**2. SaaS Starter Kit**
- **Supastarter (supastarter.dev, $299)** — Next.js + Supabase + shadcn/ui. Multi-tenant via RLS. AI-ready (Vercel AI SDK pre-wired). License: commercial. WINNER for this project.
- Makerkit (makerkit.com, $299) — Next.js + Supabase. Multi-tenant via org membership. Mature but heavier, less AI-focused.
- Open SaaS (github.com/Ashutosh00710/open-saas, free) — shameless plug variant; free but less polish, smaller community.

**3. Kurikulum Merdeka Data**
NO open machine-readable source exists. Kemendikbudristek publishes PDF kisi-kisi per mapel per jenjang (link.kemdikbud.go.id/kurikulum). Belajar.id / Platform Merdeka Mengajar has data but no public API. **Must hand-curate seed**: CP, TP, ATP, Alur Tujuan Pembelajaran per (jenjang × mapel × fase). Recommend scrape → review → seed DB at bootstrap. Mitigates AL §3 time-bound risk.

**4. AI Stack for Doc Gen — Vercel AI SDK**
- Direct OpenAI SDK: low-level, manual streaming, manual tool calls.
- **Vercel AI SDK (sdk.vercel.ai/ai-sdk)** (github.com/vercel/ai, 11k★): `streamObject()` for structured JSON streaming, `generateObject()` with Zod schema, multi-provider abstraction (OpenAI, Anthropic, Google Gemini, Mistral). Native Next 15 integration. Mitigates QM §3 (JSON-Schema validation before render). Mitigates AL §4 (provider swap when BYO key).
- LangChain.js: over-abstracted, verbose, poor streaming.

**5. Print Stack**
Production pattern: **CSS print + react-to-print** for in-browser print, **Puppeteer PDF service** for server-side branded A4 PDF. react-to-print (github.com/MatthewVach/wte-react-print, 3.2k★) stable. For Lembar Jawaban (28) and Cover (17) use Puppeteer service (github.com/puppeteer/puppeteer, 90k★) running server-side. Mitigates QM §4 (deterministic byte-hash).

**6. QR Attendance — nimiq/qr-scanner**
- nimiq/qr-scanner (github.com/nimiq/qr-scanner, 3.8k★): modern, no external deps, 35kb, works in all modern browsers, supports front camera.
- html5-qrcode (github.com/mebjas/html5-qrcode, 4.1k★): heavier, depends on ZXing.
- @zxing/browser (github.com/zxing-library/zxing, 11k★): overkill for single-purpose QR.

WINNER: nimiq/qr-scanner — minimal, frame-grabber-based, supports the Offline PWA case (WV §4).
