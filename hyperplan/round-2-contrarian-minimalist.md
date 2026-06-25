# Round 2 — Contrarian Minimalist cross-attacks

### vs quality-maximalist

**Fatal flaw:** QM is auditing a bank, not shipping a school tool. The print matrix — "every doc type × {Chrome, Safari, Firefox} × {A4, Legal} × {portrait, landscape} × {logo on/off}" — is 24+ golden byte-hashes per document. Legal page size is irrelevant in Indonesia (A4/F4 only). Nobody will run deterministic Playwright across Safari for a Vite SPA. Theater.

**Unsupported claim:** "Golden set: 200+ (jenjang × mapel × fase × CP) tuples." Authored by whom? Maintained how when the model version bumps? Pure aspiration.

**Missed:** Margin. Field-level encryption + per-tenant rotatable keys + append-only audit of every PII read/write = infra cost and latency that dwarfs the Rp 50k/month a teacher pays. QM never priced the fortress.

**Concession:** The "diverifikasi oleh guru" signature gate is right. Unchecked AI raports are a legal liability.

### vs architecture-logician

**Fatal flaw:** AL's finale — "The Question for Lead" — punts the one fork that "rewrites the security layer." That's not analysis; it's a shrug. Worse, the AI Job state machine (DRAFT→QUEUED→RUNNING + REJECTED/EXPIRED/FAILED/CANCELLED, idempotency keys, dead-letter queues, per-user concurrency=1) is payment-processing architecture for "call Gemini, render docx."

**Unsupported claim:** DB-per-tenant "collapses past ~200 schools; pool exhaustion." Cite? Supabase manages thousands. 200 is invented.

**Missed:** AL never asks whether this app needs that relational graph at v1. Year-5 modeling at year-0 cost. A JSON doc store could ship the raport slice in a week.

**Concession:** "Firebase OAuth + password are two credentials, not two identities" is correct and load-bearing. The Identity-linking model prevents silent-merge disasters.

### vs wildcard-visionary

**Fatal flaw:** WV isn't rewriting the product — WV is pitching a different company. "Parent as real admin" + "Dinas/Kecamatan license" is a GTM pivot. Selling to Indonesian Dinas = 18-month procurement, RFP hell, corruption risk. Kills the startup faster than any feature bloat.

**Unsupported claim:** "Per-teacher SaaS churns (underpaid, priorities rotate)." No churn data cited. And "parents create retention" — parents aren't the buyer and don't pay; WA groups churn faster than SaaS.

**Missed:** Offline-first PWA for multi-tenant RLS + AI gen + real-time QR is a research problem, not a feature. WV waves "eventually trusted" and never costed sync-conflict resolution on concurrent offline nilai edits.

**Concession:** The AI margin point lands — "6 AI modules burning tokens for generic docs = margin trap." Retrieval-over-generation is genuinely smarter.

### vs depth-researcher

**Fatal flaw:** DR benchmarked frameworks but never asked "do we need a framework?" Picking Next 15 + RSC + Server Actions abandons the SPA model, adds server complexity, and locks into Vercel — for an app used 3×/day behind auth. DR optimized the resume, not the product.

**Unsupported claim:** "Supabase RLS = multi-tenant by default." False. RLS is a mechanism; correctness needs policies you write, test, and audit. Supabase hands you the gun, not the safety.

**Missed:** A server-side Puppeteer PDF service is a second deployable to maintain, scale, and keep Chromium-patched — for exports browsers do natively via `window.print()`. Unmeasured complexity.

**Concession:** nimiq/qr-scanner (35kb, no deps, front-camera) is the correct minimal pick. Genuinely researched.
