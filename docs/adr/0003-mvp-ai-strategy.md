# ADR 0003: MVP AI Strategy

## Status

Deferred — pending owner acceptance (human checkpoint). The real-provider
decision is **not** made here. The mock surface described under "Decision"
remains in force for MVP and must stay clearly labeled as demo/contoh; **no
real LLM call may be wired** until the owner accepts a provider, a key-management
posture, and the data-handling terms in this ADR. This ADR must be moved to
**Accepted** (real provider chosen, Option C) or superseded before any
production tenant is invited to use the Permintaan AI module against a live
model. Option D's reasoning is partially superseded by ADR 0007 for the
BYO-LLM-via-Clipboard sub-pattern, but remains in force for any direct API call
/ BYO-key model.

## Date

2026-06-27

## Context

EduAdmin Pro Premium ships an **AI-assistance surface** whose *architecture* is
real but whose *generation* is a deterministic mock. This ADR records what
exists today, what is explicitly rejected, and the conditions under which a real
provider may land.

### Current AI surface inventory (audited 2026-06-27)

The full AI footprint is narrow and was verified by reading every file, not by
keyword alone:

- **Route.** `src/app/dashboard/permintaan-ai/page.tsx` — the only AI-visible
  dashboard route. Gated by `permintaan_ai:baca`; tenant scope derived solely
  from `akses.membership.orgId` (identity doc §12/§13).
- **Server actions.** `src/app/dashboard/permintaan-ai/actions.ts` —
  `buatPermintaanAiAction`, `batalkanPermintaanAiAction`,
  `verifikasiDrafAiAction`, `retryPermintaanAiAction`. **Generation is MOCK**:
  `jalankanMockAi(jenis)` returns the literal `[AI-GENERATED: jenis ${jenis}]`
  with provenance `mock-model-v1@<ISO 8601 ts>`. No network call, no SDK, no
  model. The comment block on `jalankanMockAi` states this is deliberate: the
  wave validates the verification-gate + provenance + state-machine architecture
  (AC#1–3, #5 of issue #12), not AI quality.
- **DB tables** (`src/db/schema.ts`, lines 1000–1108):
  - `permintaan_ai` — request lifecycle state machine (`dibuat → diproses →
    selesai | gagal | dibatalkan`), CHECK-constrained `jenis` and `status`,
    `konteks` JSONB, retry self-FK `permintaan_terkait_id` (ON DELETE SET NULL).
  - `draf_ai` — 1:1 output per request (UNIQUE on `permintaan_ai_id`), carries
    `konten` + `provenance`, and the **verification gate**
    `status_verifikasi ∈ (menunggu, disetujui, ditolak)`. Only `disetujui` may
    flow downstream.
  - `kuota_ai` — per-tenant per-(tahun-ajaran, semester) budget, UNIQUE on the
    triple, `batas` default 100; the action checks `tersisa > 0` **before**
    processing and increments `terpakai` in the same transaction (AC#5).
  - `draf_ai` is referenced downstream by `eraport.draf_ai_id`,
    `butir_penilaian.draf_ai_id`, and `perangkat_ajar.draf_ai_id` — so a
    *verified* AI draft is a first-class document, while an *unverified* one is
    inert. This is the load-bearing AC#3 invariant: **AI content is not final by
    default.**
- **Components.** `src/components/permintaan-ai/{form-permintaan,kartu-kuota,
  kartu-draf,daftar-permintaan}.tsx`. The draft card renders `[DRAF AI]` and the
  raw `provenance` string, so a reviewer can already see `mock-model-v1@…`.
- **API routes.** **None.** `src/app/api/` contains only `auth/callback`
  (AuthKit-owned) and `sinkronisasi`. There is no `/api/ai/*`, no streaming
  endpoint, no webhook receiver for model callbacks.
- **Libraries.** **No AI SDK is installed.** `package.json` carries no `ai`,
  `@ai-sdk/*`, `@google/generative-ai` / `@google/genai`, `openai`,
  `@anthropic-ai/*`, `@mistralai/*`, or any vendor SDK. This confirms the
  inherited wisdom from T1/T4: the Vercel AI SDK and equivalents are
  **planned-only**, not present.
- **Env / secrets.** `.env`, `.env.local`, `.env.example` contain **zero**
  AI-provider key names (`AI_*`, `GEMINI_*`, `OPENAI_*`, `ANTHROPIC_*`,
  `GOOGLE_AI_*`, `LLM_*`, etc.). A scan of `src/` for `NEXT_PUBLIC_AI*` and
  client-component references to any AI key returned **zero matches**. Transcript
  in `.omo/evidence/task-13-ai-secrets.log`.
- **No `src/lib/ai` or `src/lib/llm`** exists. The mock is a single function
  inside `actions.ts`; there is no client wrapper to accidentally expose.

In short: the **plumbing is real and tested** (state machine, provenance,
verification gate, kuota, tenant isolation via `withTenant` + RLS); the **model
is a placeholder**.

### Source-app BYO-Gemini pattern (rejected)

The source application being ported from (`scrape/pages/27-bank_soal_ai.json`)
exposes a "Bank Soal AI (Super Cepat)" surface with a "Generate Cepat (1-Klik)"
action, built on a **bring-your-own (BYO) Gemini key** model: the
school/teacher supplies their own Google Gemini API key, and the client (or a
thin proxy) calls Google directly.

This ADR **explicitly rejects** porting that pattern, for three reasons:

1. **UU PDP / children's-data transfer.** Permintaan AI `konteks` and the
   downstream verified drafts (CP/TP/ATP descriptions, report narratives, bank
   soal items) routinely carry **student-context data** — mata pelajaran, fase,
   elemen, and in the bank-soal/raport cases, student-facing or
   student-derived content. Under **UU No. 27/2022 (UU PDP)** Pasal 5 ayat 2
   and Pasal 16, children's personal data is a regulated category; sending it
   to an external processor (Google, OpenAI, Anthropic, …) without a data
   processing agreement, without transfer-impact assessment, and without
   verifiable parental/institutional consent is a compliance violation on its
   face. A BYO-key model makes this transfer invisible and uncontrolled: the
   data controller (the Satuan Pendidikan) cannot demonstrate *who* received
   the data, *where* it was processed, or *that* it was deleted.
2. **Key management on non-experts.** A teacher-pasted API key is the highest-
   leakage key posture in the threat model: it sits in browser storage, in a
   proxy config, or in a `.env` the teacher cannot rotate. Loss of the key is
   silent; abuse is billable to the school; there is no provenance trail.
3. **It breaks the architecture this product chose.** AC#2 (provenance) and
   AC#3 (verification gate) presuppose that **the platform** generates, stamps
   `provenance`, and holds the draft for review. A BYO-key client-side call
   cannot be provenance-stamped by the platform, cannot be quota-gated, and
   cannot be verified before it reaches a document. Porting the source pattern
   would discard the load-bearing invariants of issue #12.

### Why the decision is an owner checkpoint, not an engineering call

Wiring a real provider (Option C) touches three owner-owned concerns that
engineering cannot resolve unilaterally:

- **Procurement & cost.** Any provider bills per token; `kuota_ai.batas` is
  currently a soft budget the platform does not pay for (mock). A real provider
  makes `batas` a real-money lever, which is a business/pricing decision.
- **Data-processing agreement + UU PDP posture.** Sending child-adjacent
  education data to a third-country LLM provider requires a DPA, a transfer
  mechanism, a retention term, and a deletion guarantee. Only the owner
  (acting as / with the data controller) can sign that.
- **Key custody.** Whether the key lives in `.env`, a KMS, WorkOS Vault, or a
  secrets manager is an operational posture decision with breach blast-radius
  consequences (see ADR 0002's reasoning on key management for the parallel
  PII-encryption question).

This is therefore a `needs-human-checkpoint` decision. The default, absent
owner signoff, is **defer** — and the sections below spell out exactly what
"defer" means for the codebase as it stands today.

## Decision

**Defer real-provider integration. Retain the existing mock surface, clearly
labeled as demo/contoh.** No real LLM call, no provider SDK, and no AI key may
be introduced until the owner accepts a provider + key posture + data-handling
terms and this ADR moves to **Accepted** (Option C).

The deferral is **not** "hide the AI UI." The Permintaan AI route, actions,
tables, and components stay in place because their **architecture** — the
state machine (AC#1), provenance (AC#2), verification gate (AC#3), retry
(AC#4), and kuota budget (AC#5) — is the MVP deliverable for issue #12 and is
already under regression. What is deferred is *only* the substitution of
`jalankanMockAi` for a real model call.

### Controls in force while deferred (must remain green)

1. **Mock-only generation.** `jalankanMockAi` is the single generation path.
   It is deterministic, side-effect-free, and makes no network call. Any change
   that introduces a `fetch`/SDK call inside the AI action path requires this
   ADR to move to Accepted first.
2. **Honest labeling.** Every user-facing AI surface must clearly indicate demo
   mode so no reviewer, guru, or Satuan Pendidikan mistakes mock output for
   model output. The draft card already shows raw `provenance`
   (`mock-model-v1@<ts>`); the request form's description qualifies that
   generation is demo/contoh. **Misleading copy is a regression** — any new AI
   copy that claims real generation without a `(demo)` / `contoh` / `mode demo`
   qualifier fails this control.
3. **No BYO key.** No UI, env var, or code path may accept a user-supplied AI
   provider key. This rejects the source-app pattern outright (see Context).
4. **No AI env vars, no client exposure.** `.env*` must contain zero AI key
   names; `src/` must contain zero `NEXT_PUBLIC_*AI*` references and zero
   AI-key reads inside `'use client'` modules. Verified clean at
   `.omo/evidence/task-13-ai-secrets.log`.
5. **Verification gate stays authoritative.** Even in mock mode, a `draf_ai`
   row is inert until `verifikasiDrafAi` sets `status_verifikasi = disetujui`.
   Downstream FKs (`eraport`, `butir_penilaian`, `perangkat_ajar`) may only
   honor a `disetujui` draft. This control survives the mock→real transition
   unchanged.
6. **Provenance is always recorded.** Every `draf_ai` row carries a non-null
   `provenance` (today `mock-model-v1@<ts>`; tomorrow
   `<provider>:<model>:<prompt_hash>@<ts>`). Anonymous AI output is forbidden.

### Owner checkpoint — what "Accepted" would require

To move this ADR to **Accepted** (Option C), the owner must record, in
`learnings.md` or a follow-up ADR, **all** of:

- the chosen provider and model (single vendor; no multi-vendor in MVP);
- the key-management posture (`.env` for sandbox is acceptable; production
  must use a secrets manager / KMS / WorkOS Vault — `.env`-in-production is
  not acceptable for a key that gates child-adjacent data);
- the signed Data Processing Agreement or equivalent terms with the provider,
  and the UU PDP transfer/retention/deletion posture;
- confirmation that the `konteks` payload sent to the provider is **minimized**
  (no NISN/NIP/parent contact — the schema already excludes these, but the
  prompt assembly must not re-introduce them);
- the provenance format for real output (`<provider>:<model>:<prompt_hash>@<ts>`)
  and the decision on whether prompt/response bodies are stored for audit or
  discarded after the draft is verified/rejected.

### Trigger conditions (when this deferral must be revisited)

- The owner accepts a provider + key posture + DPA → move to Accepted, wire
  Option C (single flow first — see Alternatives).
- A regulator, a contracting Dinas/Yayasan, or a school's DPO requires AI
  output provenance or human-review guarantees *stronger* than the current
  gate — the gate is already adequate, but the *labeling* may need to change
  from "demo" to a real-output disclosure.
- A new `jenis` permintaan is added that would send a new data class (e.g.
  free-text student commentary) to the model — re-run the minimization review.
- A breach or near-miss shows the mock labeling was misread as real output.

## Consequences

**Positive.**

- The architecture that actually defends students and reviewers (state machine,
  provenance, verification gate, kuota, tenant isolation) stays in place and
  under test. Wiring a real provider later is a **swap of one function**
  (`jalankanMockAi` → a server-only provider call), not a redesign.
- No provider cost, no key, no DPA, and no third-country data transfer is
  incurred in MVP. UU PDP exposure is zero by construction (no data leaves the
  trust boundary).
- The demo surface remains usable for UX validation and stakeholder demos: the
  verification-gate flow (the real product value) is demonstrable end-to-end
  without a model.
- Misleading "AI generates" copy is corrected up front; no reviewer or Satuan
  Pendidikan can mistake `[AI-GENERATED: jenis …]` for genuine model output.

**Negative.**

- A user who reads "Permintaan AI" and clicks "Kirim Permintaan AI" receives
  the literal `[AI-GENERATED: jenis …]`, not model-quality text. This is
  intentional (demo) but is a UX letdown if the labeling is missed. Mitigated
  by the demo qualifier in the form copy and the visible `mock-model-v1`
  provenance.
- A naive future reviewer may flag "you have an AI module with no AI." This
  ADR is the response: the deferral is deliberate, the mock is labeled, and the
  real-provider decision is a named owner checkpoint.
- The downstream modules (`eraport`, `butir_penilaian`, `perangkat_ajar`) carry
  an optional `draf_ai_id` FK that, in MVP, will only ever bind to mock-sourced
  drafts. That is correct (the FK is optional and the gate is real) but means
  no real model-assisted document will exist until Option C lands.

**Mitigation for the deferral.**

- Every control in the Decision is either already regression-tested (state
  machine, kuota, verification idempotency, provenance non-null) or statically
  scannable (no AI env vars, no `NEXT_PUBLIC_*AI*`). The evidence transcript
  makes the static controls repeatable.
- The mock surface is small (one function), so the future real-provider swap is
  reviewable in a single diff.
- The rejected BYO-key pattern is documented here so a future "port the source
  app's AI" request has a recorded refusal with reasons, not just a silent no.

## Alternatives

**Option A — Retain mock, labeled as demo (this ADR's mode).** Effort: zero
(the mock exists); only the copy qualifier is added. Risk: low — no data leaves
the trust boundary; the only failure mode is a reviewer misreading the demo as
real, which the labeling prevents. **Chosen mode within the deferred status.**

**Option B — Defer entirely / hide the AI UI.** Effort: medium (gate or remove
`/dashboard/permintaan-ai` and its nav entry, leave the tables/components
dormant). Risk: **discards tested, merged architecture** (issue #12 AC#1–5) and
removes the only demonstration surface for the verification-gate flow that is
the product's actual differentiator. **Rejected** — the deferral this ADR
records is of the *real provider*, not of the *module*. Hiding the UI would be
a re-litigation of a converged build decision.

**Option C — Wire a real provider now (single flow, server-only key,
provenance, verification gate).** Effort: medium (vendor SDK, server-only key,
prompt minimization, one `jenis` flow first). Risk: **owner-owned** — cost,
DPA/UU PDP transfer terms, key custody. **Out of scope without owner signoff**;
this ADR's Status is `Deferred` precisely because that signoff has not been
given. When it is, the recommended shape is: one `jenis` (e.g.
`deskripsi_cp`) on one provider, server-only key in a secrets manager (not
`.env` in production), `konteks` minimized to exclude any student identifier,
provenance `<provider>:<model>:<prompt_hash>@<ts>`, and the existing
verification gate unchanged.

**Option D — BYO user-supplied key (the source-app Gemini pattern).** Effort:
medium. Risk: **high and unacceptable** — uncontrolled third-country transfer of
child-adjacent data (UU PDP Pasal 5(2)/16), no platform provenance, key leakage
on non-experts, breaks AC#2/AC#3. **Rejected** (see Context). Not eligible even
under Option C without a separately-accepted ADR.

**Option E — Multi-vendor / fine-tuning.** Effort: high. Risk: multiplies the
DPA/key/minimization surface for no MVP value. **Rejected for MVP**; explicitly
deferred alongside the real-provider decision.

## References

- `src/app/dashboard/permintaan-ai/page.tsx` — the AI route (visibility only;
  actions are the boundary, identity doc §12).
- `src/app/dashboard/permintaan-ai/actions.ts` — `jalankanMockAi` (the mock
  generation path this ADR governs) and the AC#1–5 action surface.
- `src/db/schema.ts` lines 1000–1108 — `permintaan_ai`, `draf_ai`, `kuota_ai`;
  lines 1314, 1430, 1582 — the downstream `draf_ai_id` FKs that make the
  verification gate load-bearing.
- `src/components/permintaan-ai/` — the four presentational components; the
  draft card's raw-`provenance` rendering is the honest-labeling control.
- `scrape/pages/27-bank_soal_ai.json` — the source-app BYO-Gemini "Bank Soal AI
  (Super Cepat)" / "Generate Cepat (1-Klik)" pattern rejected under Option D.
- `postmvp.md` — canonical post-MVP AI items: deterministic AI-assisted
  curriculum seeding, pgvector RAG over curriculum, Bantuan AI / RAG-based
  product help. All `ADR first`; this ADR is the MVP-side gate they inherit.
- `docs/adr/0002-pii-at-rest-strategy.md` — parallel reasoning on owner-owned
  key-management / UU PDP proportionality; this ADR mirrors its style and its
  "defer with compensating controls + trigger conditions" shape.
- `docs/adr/0001-global-reference-tables.md` — ADR house style and the tenant-
  isolation invariant (`app.tenant_id` GUC, never client-supplied) that every
  AI query runs under via `withTenant`.
- `.omo/evidence/task-13-ai-mode.log` — AI surface inventory + mode
  determination transcript.
- `.omo/evidence/task-13-ai-secrets.log` — AI key / `NEXT_PUBLIC_*AI*` /
  client-component secret scan transcript (clean).
- Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Pelindungan
  Data Pribadi (UU PDP), Pasal 5, 16 — children's personal data as a regulated
  category; the basis for rejecting uncontrolled transfer to an LLM provider.
