# Round 2 — Quality Maximalist cross-attacks

### vs Contrarian Minimalist
**Fatal flaw.** "11 modules = 1 feature wearing 11 masks" is reckless reductionism. Each generator has a **different compliance surface**: Bank Soal needs validated answer keys; KKTP needs Kurikulum Merdeka kriteria against the official rubric; Modul Ajar needs Profil Pelajar Pancasila dimensi (max 3, per the brief). A unified "Generator Dokumen" hides per-type validation gates behind one UI. One blast radius, eleven failure modes invisible to the user until a fabricated Bank Soal key reaches a real exam.
**Unsupported claim.** "One test harness" — the validation rules, banned-content regex, and golden sets are eleven **different** sets. He's relocating 11 test surfaces inside one render primitive and calling it consolidation.
**Missed.** Zero PII analysis. Killing 08/09/14/24 doesn't erase liability — fold-into operations inherit it. Merging Prestasi into Siswa profile concentrates more PII in one CRUD surface.
**Concession.** "Pick one ORM" — Drizzle over Prisma is correct; Prisma's generated client obscures the SQL path needed to debug RLS policies.

### vs Architecture Logician
**Fatal flaw.** His §6 "question for the lead" (User↔School 1:N or M:N) is theatre — §3 already commits to `SchoolMembership` M:N. If lead answers 1:N, his entity graph breaks. Faux humility masking a foregone decision.
**Unsupported claim.** "`SET LOCAL app.tenant_id` per tx" asserted without naming the pooler. PgBouncer in transaction mode breaks `SET LOCAL` semantics for prepared statements — the #1 production RLS footgun. Silent on it.
**Missed.** RLS testing is absent. A migration linter (his Failure A) catches missing policies, not WRONG policies. Cross-tenant read attempts must be a CI assertion, not hope.
**Concession.** "`GradeRecord` locked immutable once E-Raport finalized (post-lock = break-glass audit)" — exactly right. Post-lock mutation is a compliance violation; nailed.

### vs Wildcard Visionary
**Fatal flaw.** "WhatsApp Audit Pack" = broadcasting attendance, prestasi, agenda to parent WA groups via an uncontrolled third-party channel. Every send is a UU PDP disclosure to N recipients with no consent log, no audit trail, no revocation. Branded A4-shareable images of student attendance = PII broadcast with marketing sugar.
**Unsupported claim.** "Anonymous kecamatan leaderboards unless opt-in." "Anonymous" is doing massive work. Schools are re-identifiable from n=3 attributes (jenjang + mapel coverage + sync cadence) at kecamatan scale. No k-anonymity threshold, no suppression rule. Re-identification waiting to happen.
**Missed.** AI as "retrieval + transformation + diff" over a per-school "institutional memory" corpus — built from teacher + student PII. He proposes a per-school training surface with zero governance: no ownership, no export control, no churn-scrub. UU PDP silent.
**Concession.** "Real-time must degrade to eventually trusted or it's theater" — correct. Module 13 sold as real-time over flaky WITA school wifi burns trust faster than honest eventual consistency.

### vs Depth Researcher
**Fatal flaw.** Recommends Supastarter ($299) without auditing its RLS schema, audit-log primitives, or PII handling. "Multi-tenant via RLS" is a marketing bullet until threat-modeled. Shipping Indonesian-minor PII on top of an unaudited boilerplate inherits every security assumption of a $299 template.
**Unsupported claim.** "Recommend scrape → review → seed DB" for Kurikulum Merdeka. Scrape from Kemendikbud is a ToS/copyright risk waved off in one clause; "review" is undefined — by whom, against what ground truth, what acceptance bar? The seed IS the compliance source of truth; it can't be a hack-day scrape.
**Missed.** No AI output evaluation. He picked Vercel AI SDK for `generateObject`/Zod — that's input shaping, not output correctness. Zod-passing content can still be pedagogically wrong. Where's the eval harness against my golden set?
**Concession.** nimiq/qr-scanner over html5-qrcode — correct. 35kb, no ZXing dep, frame-grabber API is testable with Playwright `fakeVideo`. Smallest dependency surface for the most fragile module.
