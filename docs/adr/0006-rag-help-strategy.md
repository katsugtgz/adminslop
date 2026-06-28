# ADR 0006: RAG / Help Corpus Strategy

## Status

**Deferred.** The retrieval-augmented-generation (RAG) help surface and any
pgvector-backed retrieval over curriculum or help corpora are **not built in
the near-term post-MVP slice**. This ADR records the dependency that forces the
deferral, the bounded shape the slice would take **if** the dependency clears,
and the items explicitly excluded from the slice.

This ADR cannot move to **Accepted** until **ADR 0003 (MVP AI Strategy)** moves
to Accepted (real provider chosen, key posture decided, DPA + UU PDP transfer
terms agreed). Per the plan rule "If AI (T13) remains mock/deferred, RAG/help
build must defer," ADR 0003's `Deferred` status propagates here: **as long as the
only generation path is `jalankanMockAi`, no RAG/help build may start.**

The curriculum-seeding item (postmvp.md #16, "Deterministic AI-assisted
curriculum seeding") is **separately gated** — see "Curriculum seeding" below.
Advanced analytics / ML / prediction (postmvp.md #24-class, T21 backlog #24
"Analitik lanjutan") are **explicitly excluded** from this slice — see
"Excluded from this slice."

## Date

2026-06-27

## Context

EduAdmin Pro Premium has a real **AI request architecture** (state machine,
provenance, verification gate, kuota, tenant isolation — all under regression
for issue #12) but a **mock generation path**. ADR 0003 records that the real-
provider decision is an owner checkpoint and is currently `Deferred`. This ADR
extends that deferral to the **retrieval** surfaces that would sit on top of a
real model: a RAG-based product-help assistant ("Bantuan AI") and pgvector
retrieval over curriculum.

### Current help surface inventory (audited 2026-06-27)

The product already has **static** help surfaces — none of which retrieve, embed,
or call a model. The full footprint, verified by reading every file:

- **`src/components/bantuan-kontekstual.tsx`** — an inline tooltip that wraps a
  `HelpCircle` icon and reveals a **hardcoded `teks` prop** on hover/focus/click.
  No fetch, no query, no model. The `teks` is authored inline at each call site.
- **`src/app/dashboard/bantuan/page.tsx`** ("Pusat Bantuan") — a static FAQ page.
  The answers live in a `const FAQ: { q: string; a: string }[]` array at module
  top, hand-written in Bahasa Indonesia. No retrieval.
- **`src/app/bantuan/page.tsx`** and **`src/components/pusat-bantuan.tsx`** —
  the unauthenticated help-center companion surface, also static.
- **`src/app/panduan/page.tsx`** ("Panduan") — a static guide page.
- **`src/components/tur-awal.tsx`** — the first-run tour; static steps.

In short: **every help surface today is a static document or a hardcoded
string.** There is no embedding, no vector store, no retrieval step, no
similarity search, no model call in any help path. The "Bantuan" the user sees
is honest static content — which is exactly why replacing it with RAG is a
non-trivial, ADR-gated change, not a drop-in upgrade.

### pgvector is not installed

`src/db/schema.ts` contains **zero** references to `pgvector`, `vector(`,
`embedding`, or any vector-typed column (verified by grep, 2026-06-27 —
inherited wisdom T1/T4). The Supabase/Drizzle layer is plain Postgres + RLS.
Adopting pgvector is therefore a **new dependency decision**: extension install,
migration, embedding pipeline, and a retrieval-safety regime all land together.
This is in-scope for this ADR's "if accepted" slice but is **not** done today.

### Source-app RAG/help features (porting pressure)

The source application being ported from (`scrape/pages/`) exposes help/RAG-
adjacent surfaces. These are recorded as **porting pressure**, not as a spec:
the source app's patterns do not bind this product, and ADR 0003's rejection of
the source BYO-Gemini model (Option D) applies here too. Any "port the source
app's help assistant" request inherits ADR 0003's refusal and this ADR's
deferral.

### Why RAG/help cannot ride on the mock

A RAG help assistant has two halves: **retrieval** (find the relevant doc chunk)
and **generation** (compose an answer). The mock (`jalankanMockAi`) can stand in
for the second half during demos because mock output is clearly labeled. But:

1. **Retrieval without generation is just search.** A keyword/TF-IDF search over
   a local help corpus is valuable and safe — but it is not RAG, and calling it
   "Bantuan AI" would be misleading labeling (violates ADR 0003 Control 2,
   "honest labeling"). That option is documented under Alternatives as "mock-safe
   local search," not chosen.
2. **Generation without a real model is the mock.** Wiring RAG plumbing to
   `jalankanMockAi` would produce a help assistant that retrieves a real doc
   chunk and then *fabricates* an answer labeled `[AI-GENERATED: …]`. That is
   worse than today's static FAQ: it adds the appearance of intelligence without
   the substance, and a reviewer who skips the provenance string gets a
   hallucination shaped like a help answer.
3. **Help answers have a correctness floor.** Unlike `permintaan_ai` (where the
   verification gate catches a bad draft before it reaches a document), a help
   answer is consumed immediately by a Guru or admin trying to complete a task.
   There is no human-verification gate between the assistant and the user. This
   raises the bar for the generation path: **only a real provider with a
   documented accuracy/evaluation regime is acceptable**, which is precisely
   what ADR 0003 has not accepted.

## Decision

**Defer the RAG/help build.** No pgvector install, no embedding pipeline, no
retrieval step, and no help-assistant UI may be introduced until **both**:

1. **ADR 0003 moves to Accepted** (real provider chosen, key posture, DPA, UU
   PDP transfer terms). This is the load-bearing dependency.
2. The owner signals that RAG/help is the chosen near-term slice (vs. curriculum
   seeding, vs. other post-MVP items). This ADR records the *shape* of the
   slice; it does not prioritize it over T25/T26 siblings.

### Depends on

**This ADR explicitly depends on ADR 0003 (MVP AI Strategy, T13) reaching
Accepted status.** The dependency is one-directional and load-bearing:

- **ADR 0003 `Deferred` → ADR 0006 `Deferred`.** If the real-provider decision
  is not made, no retrieval-augmented generation surface may build. This is the
  plan rule ("If AI remains mock/deferred, RAG/help build must defer") made
  concrete.
- **ADR 0003 `Accepted` does NOT auto-accept ADR 0006.** A real provider clears
  the *generation* dependency but not the *retrieval* decisions (corpus scope,
  citation regime, pgvector adoption, evaluation). Those still need owner
  sign-off recorded here before build.

The dependency chain is therefore: **T13 (ADR 0003) → ADR 0006 (this) → T25
(build, if ever accepted) → T26 (curriculum seeding, which additionally depends
on this ADR).**

### If accepted later — the bounded slice (spec only, build deferred to T25)

If ADR 0003 reaches Accepted **and** the owner chooses RAG/help as the slice,
the build is bounded as follows. **This is a specification, not an authorization
to build.** T25 owns the build; T25 may not start until this ADR is Accepted.

- **Corpus: local, curated, PII-free.** The retrievable corpus is limited to:
  - `CONTEXT.md` (domain glossary),
  - `docs/architecture/` (identity-and-access, etc.),
  - `docs/vendor/workos/` (vendored WorkOS docs),
  - the static help content already authored (`src/app/**/bantuan/`,
    `src/app/panduan/`, the `FAQ` arrays, the `teks` strings at
    `bantuan-kontekstual` call sites).
- **No PII indexing.** The corpus must not include any tenant-scoped table
  (`peserta_didik`, `ptk`, `wali`, `catatan_audit`, `permintaan_ai.konteks`,
  `draf_ai.konten`, free-text report narratives). The embedding pipeline runs
  on **checked-in documentation only**, never on database contents. This keeps
  the RAG surface on the safe side of ADR 0002 (PII at rest) by never letting
  PII enter the retrieval index.
- **Citation required.** Every generated help answer must cite the source file
  (and section, where applicable) it was drawn from. An uncited answer is a
  regression. This is the help-surface analogue of ADR 0003's provenance control
  (Control 6).
- **No web crawl, no external ingestion.** The corpus is the local doc set
  above. Crawling external sites (Ministry of Education, WorkOS live docs,
  arbitrary URLs) is excluded — it introduces freshness/sync, licensing, and
  retrieval-safety problems outside this slice.
- **pgvector adoption.** If vector retrieval is the chosen method, pgvector is
  installed via migration, with the extension enabled and the embedding table
  holding only doc-chunk embeddings (no tenant_id column — this is a global
  reference surface akin to ADR 0001's pattern, but read-only from a separate
  `embeddings` table, not the curriculum tables). The provider's embedding model
  is chosen as part of ADR 0003's provider decision (single vendor).

### Curriculum seeding — separately gated (T26)

The "Deterministic AI-assisted curriculum seeding" item (postmvp.md #16) is
**not** covered by this ADR's acceptance. It is separately gated because:

- it operates on **curriculum source snapshots** (a different corpus than help
  docs), with its own repeatable-prompt / parser / golden-diff / human-approval
  regime (per postmvp.md L33);
- it writes to the **global reference tables** (ADR 0001), which are
  migration-authored and `GRANT SELECT ONLY` — the seeding pipeline needs a
  write path that does not exist today;
- it depends on **both** ADR 0003 (real provider) **and** this ADR (retrieval
  safety for the curriculum corpus, which is a different minimization question
  than help docs).

T26 owns the curriculum-seeding decision. **This ADR's acceptance does not
unblock curriculum seeding.** Curriculum seeding requires this ADR Accepted
**plus** a separate T26 decision on the seeding pipeline.

### Excluded from this slice

The following are **explicitly excluded** from the RAG/help slice and marked
**deferred / ADR-required**. They may not ride along even if ADR 0006 moves to
Accepted:

- **Advanced analytics / predictive dashboards.** "Analitik lanjutan" —
  at-risk-student prediction, clustering, cohort trend ML — is T21 backlog item
  #24. It requires **ML governance for Peserta Didik data (minors)**, a training
  pipeline, model selection, and a sub-ADR dedicated to ML governance. It is a
  Critical-risk item (child data in ML training) and is in a different risk
  class than help-corpus retrieval. **Deferred / ADR-required** (its own ADR,
  not this one).
- **ML / model training on tenant data.** Any model that learns from
  `peserta_didik`, `penilaian`, `eraport`, or attendance data is excluded. This
  includes "predictive" features of any kind. **Deferred / ADR-required.**
- **Prediction over individual students.** No at-risk scoring, no dropout
  prediction, no individual-level inference. These are the highest-risk ML
  applications for a minors'-data product and require the ML-governance sub-ADR.
  **Deferred / ADR-required.**

These three exclusions are recorded here so that a future "we accepted RAG/help,
so let's also ship a small predictive feature" request has a recorded refusal.
The boundary between retrieval (this ADR) and prediction (excluded) is: **this
slice retrieves from checked-in docs; it never scores, classifies, or predicts
anything about a user, a student, a class, or a tenant.**

## Consequences

**Positive.**

- **No hallucination surface is added.** The static help surfaces stay honest: a
  Guru reads a hand-written FAQ answer, not a fabricated one. Until a real
  provider with an evaluation regime exists, this is the correct posture.
- **No new dependency lands.** pgvector, an embedding pipeline, and a retrieval-
  safety regime are all deferred. The DB stays plain Postgres + RLS; the help
  surfaces stay static strings. The codebase does not inherit a vector-store
  operational burden.
- **The dependency chain is documented.** A future reviewer asking "why is there
  no help assistant?" has a recorded answer: ADR 0003 is Deferred, and this ADR
  inherits the deferral. The chain (T13 → T23 → T25/T26) is explicit.
- **The bounded slice is pre-specified.** If the owner accepts, T25 has a
  ready-made spec (corpus, no-PII, citation, no-crawl, pgvector shape) rather
  than starting from a blank page. Pre-specifying de-risks the eventual build.
- **Advanced analytics/ML is fenced off.** The exclusion list prevents scope
  creep from retrieval into prediction, which is the highest-risk direction for
  a minors'-data product.

**Negative.**

- **Help does not get smarter.** A Guru with a question the FAQ does not answer
  must fall back to human support. This is a real product gap, but it is the
  honest gap given the AI posture.
- **The static help corpus can drift.** As MVP features land, the `FAQ` arrays
  and `teks` strings must be kept current by hand. There is no retrieval to
  paper over staleness. Mitigation: the help surfaces are small and centralized;
  a docs-drift check (T4 pattern) can cover them.
- **A naive future reviewer may flag "you have an AI module but no AI help."**
  This ADR is the response: the deferral is deliberate, inherited from ADR 0003,
  and the slice shape is recorded for when the dependency clears.

**Mitigation for the deferral.**

- The static help surfaces are honest and maintained; they do not pretend to be
  more than they are.
- The "mock-safe local search" alternative (below) is documented as an interim
  option if the owner wants a smarter-than-static help surface before ADR 0003
  clears. It is **not** implemented by this ADR.
- Every control is statically checkable: grep `schema.ts` for `pgvector`/`vector(`
  (zero today), grep `src/` for an embedding fetch (zero today), grep help
  surfaces for a model call (zero today). The deferral is verifiable.

## Alternatives

**Option A — Defer RAG/help; keep static help surfaces (this ADR's choice).**
Effort: zero (the static surfaces exist). Risk: low — no model, no retrieval, no
hallucination. The only failure mode is help-content staleness, mitigated by the
small centralized corpus. **Chosen.** Inherits ADR 0003's deferral cleanly.

**Option B — Mock-safe local search (interim, no LLM, no hallucination).** A
keyword/TF-IDF search over the same local doc corpus defined under "If accepted
later," with **no generative model** in the loop: the user types a query, the
surface returns ranked doc chunks with citations, and the user reads the source
directly. This is **not RAG** (no generation) and must be labeled honestly
("Pencarian Bantuan", not "Bantuan AI"). Effort: medium. Risk: low — no model,
no fabrication, citation is inherent. **Documented as a permitted interim option
but NOT implemented by this ADR.** If the owner wants a smarter help surface
before ADR 0003 clears, this is the safe shape; it requires its own task/ADR to
build (it touches the corpus-curation question but not the provider question).
Recording it here prevents a future "just wire up Gemini for help" request from
being the path of least resistance.

**Option C — Build RAG/help on the mock generator.** Wire retrieval to
`jalankanMockAi`. Effort: medium. Risk: **high and unacceptable** — the mock
fabricates an answer shaped like help, the retrieval gives it a real doc to
point at, and a reviewer who skips provenance gets a confident hallucination.
This inverts ADR 0003's honest-labeling control (the retrieval makes the mock
*look* real). **Rejected.**

**Option D — Build RAG/help assuming ADR 0003 will clear.** Start the pgvector
install and embedding pipeline now, on the assumption that a provider will be
chosen. Effort: high. Risk: **medium-high** — if ADR 0003 does not clear, the
product carries a vector store and embedding pipeline with no generation path,
which is operational cost for zero user value; if ADR 0003 clears a different
provider/model than assumed, the embedding choice may need rework. **Rejected**
— this ADR's acceptance is gated on ADR 0003's acceptance precisely to avoid
speculative infra.

**Option E — Expand the slice to include curriculum RAG and/or predictive
analytics.** Effort: high–very-high. Risk: **critical** — pulls in curriculum-
seeding minimization (T26's scope) and ML governance for minors (a separate
ADR). **Rejected for this slice.** Curriculum seeding is separately gated
(T26); advanced analytics/ML/prediction is explicitly excluded (see above).

## References

- `docs/adr/0003-mvp-ai-strategy.md` — **the load-bearing dependency.** Its
  `Deferred` status (T13) propagates to this ADR. Its controls (mock-only
  generation, honest labeling, no BYO key, no AI env vars, verification gate,
  provenance) govern the generation half of any future RAG surface.
- `postmvp.md` lines 33–35 — the three AI/RAG items: #16 Deterministic AI-
  assisted curriculum seeding (separately gated, T26), #17 pgvector RAG over
  curriculum (deferred, this ADR), #18 Bantuan AI / RAG-based product help
  (deferred, this ADR).
- `docs/roadmap/post-mvp-backlog.md` (T21) — §3 items #16, #17, #18, #24;
  §4 Wave-5 ranking (T23 blocked on ADR 0003); §5 ADR grouping. T21 projected
  [0008] for "AI provenance & retrieval safety"; this ADR takes **0006** and
  scopes to RAG/help only (curriculum seeding → T26, analytics/ML → excluded),
  narrowing the T21 projection. The re-numbering reflects actual drafting order.
- `src/components/bantuan-kontekstual.tsx` — the static inline help tooltip
  (hardcoded `teks` prop, no retrieval). Representative of today's help surface.
- `src/app/dashboard/bantuan/page.tsx` — the static FAQ page (`const FAQ` array,
  no retrieval). The corpus a future RAG slice would index.
- `src/app/bantuan/page.tsx`, `src/components/pusat-bantuan.tsx`,
  `src/app/panduan/page.tsx`, `src/components/tur-awal.tsx` — the remaining
  static help/guide surfaces.
- `src/db/schema.ts` — **zero** `pgvector`/`vector(`/`embedding` references
  (verified 2026-06-27, T1/T4). pgvector adoption is a new dependency gated by
  this ADR's acceptance.
- `docs/adr/0001-global-reference-tables.md` — ADR house style; the global-
  reference-table pattern (no `tenant_id`, no RLS, `GRANT SELECT ONLY`) is the
  shape a future doc-embeddings table would echo, since embeddings index
  checked-in docs, not tenant data.
- `docs/adr/0002-pii-at-rest-strategy.md` — parallel reasoning on owner-owned
  data-posture decisions; the "no PII indexing" rule in this ADR's slice keeps
  the RAG surface on the safe side of ADR 0002 by never letting PII enter the
  retrieval index.
- `.omo/evidence/task-23-rag-dependency.log` — existing evidence log with the
  grep assertion that this ADR's `Depends on` references ADR 0003 / T13.
- `.omo/evidence/task-23-analytics-excluded.log` — existing evidence log with
  the grep assertion that advanced analytics / ML / prediction are marked
  deferred / ADR-required in this ADR.
- `.omo/notepads/post-mvp-roadmap-hyperplan/learnings.md` — T5, T13, T20, T21
  entries (the dependency chain this ADR formalizes).
