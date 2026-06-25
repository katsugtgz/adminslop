# Round 2 — Depth Researcher cross-attacks

### vs Quality Maximalist

**Fatal flaw:** QM's AI integrity rests on a phantom. "Canonical CP/TP source (Kemdikbudristek kisi-kisi) the prompt is grounded against" — I searched: no machine-readable CP/TP source exists (github.com/SyamilAlfatih/Kurikulum-Merdeka-Bahasa-Inggris-API is English-only; kurikulum.kemdikbud.go.id + PMM are login-gated PDFs). Your §3 grounding strategy is unbuilt.

**Unsupported:** "Right-to-erasure path (Art. 8)... schools have Dapodik retention duties." Which Dapodik regulation mandates retaining NIK, blood type, spouse names? You invented a legal conflict with no citation.

**Missed:** "Byte-hash diff vs golden per (doctype × browser × page-size × orientation)" — react-to-print issue #406 proves A4 sizing is broken in Chrome; browser PDF output is non-deterministic across font/OS versions. Your golden-hash CI gate will flake on every infra update.

**Concession:** Visible "diverifikasi oleh guru" signature gate + immutable provenance (§6) is correct and unifies with Vercel AI SDK structured output.

### vs Contrarian Minimalist

**Fatal flaw:** "Refuse SSR... SPA + In-memory cache." This is a multi-tenant app holding NIK, grades, face biometrics. RLS enforcement needs a server holding `SET LOCAL app.tenant_id` (AL §1). A pure SPA forces PII into the browser = leak surface. CM's stack choice contradicts every security requirement in the brief.

**Unsupported:** "46% is duplicate UI for the same 3 jobs." The brief shows Jadwal (05), Kalender (06), Rencana Kerja (07) are distinct entities — recurring slots vs dated events vs tracked targets. Zero evidence of duplication.

**Missed:** "ONE Generator Dokumen primitive" assumes 11 AI modules share a schema. They don't. Bank Soal (27) has Taksonomi Bloom + komposisi soal; Modul Ajar (21) has Profil Lulusan dimensions. One schema = lowest-common-denominator garbage output.

**Concession:** "11× maintenance for 1× capability" — the unified A4 render layer is a valid anti-bloat instinct.

### vs Architecture Logician

**Fatal flaw:** §6 punts the single architecture-defining decision (User 1:N vs M:N School) to the Lead. Indonesian multi-school teachers are documented reality (Kemdikbud Guru Berbagi program, cross-school MGMP assignments). You should have cited the fact, not asked the question.

**Unsupported:** "Per-user concurrency = 1" for AI jobs. A 40-teacher school with one concurrent slot = 39 blocked teachers. No benchmark justifies this number.

**Missed:** "SET LOCAL app.tenant_id" needs a long-lived Postgres connection per request. Supabase/PostgREST — the platform every winning starter uses (Supajump, GitKit, Ingram) — enforces RLS via JWT claims, not SET LOCAL. Your primitive is incompatible with the de-facto stack.

**Unsupported:** "SchoolHoliday/SchoolEvent define non-instructional days" — where's the seed? Kaldik is published as PDF by Dinas. You assumed structured input that won't materialize.

**Concession:** M:N User↔School is correct; Yayasan chains are real.

### vs Wildcard Visionary

**Fatal flaw:** "Offline-first PWA is the product" collides head-on with the brief. Module 13 demands "real-time" QR; module 24 EduExam requires "deteksi tab switching" + browser lock for CBT integrity. Exam anti-cheat CANNOT "degrade to eventually trusted" — offline = cheating enabled. WV's north star breaks the spec's differentiators.

**Unsupported:** "AI = retrieval + transformation + diff... Deep Learning dies." Zero evidence retrieval beats generation for Modul Ajar. Every shipped competitor (kangtoer/IPS-Maestro uses Gemini gen; NgodingCik/modul-ajar-generator uses OpenAI gen) uses generation. A per-school vector DB is cost, not savings.

**Missed:** "WhatsApp Audit Pack" ignores WhatsApp Business API per-message pricing + Meta bulk-messaging policy. Rural-school economics: schools cannot afford the API tier.

**Unsupported:** "Dinas/Kecamatan license" monetization — Dinas procurement runs 12-18 months via DPA/Pokja. No EdTech-budget-precedent citation.

**Concession:** Rural Indonesian connectivity is genuinely poor; offline-tolerant attendance sync is correct — just not PWA-everything.
