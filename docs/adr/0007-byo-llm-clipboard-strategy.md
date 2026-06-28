# ADR 0007: BYO-LLM-via-Clipboard Strategy for Bank Soal

## Status

Accepted. This ADR is the active path for external LLM assistance in the
**Bank Soal** vertical slice. It partially supersedes ADR 0003's rejection of
Option D only for the **BYO-LLM-via-Clipboard** sub-pattern defined here. ADR
0003 remains in force for any direct provider API call, user-supplied API key,
platform proxy, provider SDK, or model call made by EduAdmin Pro Premium.

## Date

2026-06-28

## Context

ADR 0003 deferred real LLM integration for the MVP and explicitly rejected the
source application's BYO-Gemini pattern, recorded there as **Option D - BYO
user-supplied key**. The source pattern allowed a school or teacher to provide
their own Gemini API key and have the application, the client, or a thin proxy
call Google to generate Bank Soal content.

ADR 0003 rejected Option D for three reasons:

1. **UU PDP / children's-data transfer.** The platform would transmit
   child-adjacent education data to an external LLM provider without the
   platform controlling the provider contract, data-processing agreement,
   retention term, deletion term, transfer path, or consent posture. ADR 0003
   cites UU No. 27/2022 (UU PDP) Pasal 5 ayat 2 and Pasal 16 because children's
   personal data is a regulated category.
2. **Key management on non-experts.** Teacher-pasted API keys are likely to leak
   through browser storage, copied configuration, screenshots, logs, or local
   `.env` files the school cannot rotate safely.
3. **Architecture breakage.** The product's AI architecture in ADR 0003 depends
   on platform-generated provenance plus a `draf_ai` verification gate before
   AI content becomes canonical. A BYO-key path cannot be stamped reliably by
   the platform and cannot be controlled by the existing `kuota_ai` and
   verification-state machine.

The owner has now accepted a different pattern for a narrow Bank Soal slice:
**Option F - BYO-LLM-via-Clipboard**. Option F does not revive Option D. It
accepts no key, calls no LLM, proxies no provider traffic, adds no provider SDK,
and creates no `draf_ai` rows. The application prepares a minimized Bahasa
Indonesia prompt; the user copies it to their own external LLM session, reviews
the result, and pastes JSON back for validation and import.

This distinction matters because the platform boundary is different. In Option
D, the platform participates in the transfer to the model provider. In Option
F, the platform does not. The school user decides whether to paste the prompt
into ChatGPT, Gemini, Claude, or another external tool. The prompt is designed
to contain no student PII. The returned JSON is treated as teacher-authored
Bank Soal content at import time, with an audit record that preserves external
origin provenance.

The accepted scope is intentionally narrow: **Bank Soal only**. Bank Soal can
be generated from low-risk instructional context: `mata_pelajaran`, optional
`tingkat`, `jenis butir`, and `jumlah butir`. It does not require student
names, NISN, parent contacts, assessment histories, attendance records, report
comments, disability notes, or class membership.

The existing Bank Soal surface already has the controls this ADR relies on:
`requireAuth()`, server-side `getAksesSaya().boleh(...)` checks (identity doc
§12), tenant scope from `akses.membership.orgId` through `withTenant(...)`
(identity doc §13), RLS-backed `buatButirSoal`, and schema checks for
`butir_soal.jenis` and `status`.

Option F is therefore a product decision about **how users may prepare input**
for a normal Bank Soal import, not a decision to integrate an AI provider into
the platform.

## Decision

Accept **Option F - BYO-LLM-via-Clipboard** for the Bank Soal vertical slice.
The feature may expose an **"AI Eksternal"** surface in Bank Soal that helps a
Guru or Admin prepare a minimized prompt for an external LLM and paste a JSON
answer back for validation and import.

The required user flow is:

1. A Guru or Admin opens Bank Soal and clicks **"AI Eksternal"**.
2. The page renders a prompt-generator form with these fields:
   `mata_pelajaran`, optional `tingkat`, `jenis butir`, and `jumlah butir`.
3. The app renders a Bahasa Indonesia prompt containing only the selected
   instructional context, a strict JSON schema, a no-PII instruction, and output
   constraints for factuality, copyright avoidance, and Bahasa Indonesia.
4. The user clicks **"Salin Prompt"**. The prompt is copied to the clipboard.
5. The user opens an external LLM tool themselves, for example ChatGPT, Gemini,
   or Claude, pastes the prompt, and obtains JSON.
6. The user returns to the app and pastes the JSON into **"Tempel Hasil"**.
7. The user clicks **"Validasi & Impor"**.
8. The server action `imporButirSoalJsonAction` validates and imports only valid
   items.
9. The UI shows per-item success or failure.

The platform invariants are mandatory:

1. **No outbound LLM call.** EduAdmin Pro Premium must never call OpenAI,
   Anthropic, Google, Gemini, Claude, Mistral, Vercel AI SDK, or any model API
   for this flow.
2. **No user API key.** The app must never accept, store, proxy, log, validate,
   or transmit an LLM provider key from a user or Satuan Pendidikan.
3. **No provider SDK required.** This feature must not add an AI provider SDK or
   `AI_*`, `OPENAI_*`, `ANTHROPIC_*`, `GEMINI_*`, `GOOGLE_AI_*`, or `LLM_*`
   environment variable.
4. **No `draf_ai` row.** Imported Bank Soal items created from pasted JSON do
   not use the Permintaan AI draft pipeline. They are not platform-generated AI
   drafts. They are user-reviewed, user-pasted content.
5. **No `drafAiId`.** Calls to `buatButirSoal` from this import path must pass
   no `drafAiId`. The imported `butir_soal.draf_ai_id` remains `null`.
6. **Audit provenance is required.** Each import action must write
   `catatan_audit` with action **`impor-ai-eksternal`** and provenance in the
   audit context JSON.
7. **Immediate active status.** Imported valid items use the same canonical path
   as manual creation through `buatButirSoal`; therefore they become
   `status = "aktif"` immediately.
8. **Existing RLS and FK constraints remain authoritative.** The importer must
   use `withTenant(db, akses.membership.orgId, ...)`; it must not accept a
   tenant id from the client.

The server action shape is normative:

1. `imporButirSoalJsonAction` calls `requireAuth()` first.
2. It calls `getAksesSaya()` and rejects any non-active membership.
3. It requires `getAksesSaya().boleh("bank_soal:buat")` to pass.
4. It parses the pasted body with `JSON.parse` and rejects malformed JSON.
5. It validates each item independently:
   `jenis` must be one of `pg`, `essay`, `isian`, `jodohkan`, `benar_salah`;
   `pertanyaan` must be non-empty; `kunciJawaban` must be non-empty;
   `pilihan` must match the expected JSON shape for the selected `jenis`.
6. For each valid item, it calls `buatButirSoal(tx, { ... })` with
   `dibuatOleh: akses.userId` and with no `drafAiId`.
7. It runs inside `withTenant(db, akses.membership.orgId, ...)`.
8. It writes `catatan_audit` with action `impor-ai-eksternal` and provenance
   `eksternal-pengguna:<userId>:<jenis>:<ISO ts>` in the audit context JSON.
9. It returns `{ tersimpan: N, gagal: M, errors: [...] }`, where invalid items
   do not block valid items unless transaction design intentionally chooses
   all-or-nothing later in a separate ADR or issue.

### Prompt minimization rules

The prompt template must be designed so copying it to an external LLM does not
copy personal data from the platform.

The prompt must exclude: NISN, NIP, student names, parent or guardian names,
parent or guardian contact information, addresses, attendance records, grades
or report narratives tied to a student, class rosters, free-text notes that
identify a student, parent, teacher, or household, and any other personal data
or child-adjacent record not required to create a generic Bank Soal item.

The prompt may include only:

- the `mata_pelajaran` name, for example **"Matematika"**;
- the optional `tingkat` name, for example **"Kelas 7"**;
- the selected `jenis` value and a Bahasa label for it, for example `pg` or
  **"pilihan ganda"**;
- the requested count, for example `10` items;
- the strict output schema;
- generic generation constraints.

The prompt must include the exact no-student-PII instruction in Bahasa
Indonesia or a materially equivalent sentence:

```text
Jangan sertakan data pribadi siswa, termasuk nama siswa, NISN, alamat, nama
orang tua, kontak orang tua, atau informasi lain yang dapat mengidentifikasi
siswa.
```

The prompt must also instruct the external LLM to:

- return only valid JSON, with no Markdown fence and no prose wrapper;
- write all student-facing content in Bahasa Indonesia;
- avoid copyrighted passages or copied exam-bank content;
- prefer factual, grade-appropriate questions;
- avoid claims that require current events or specialized facts unless the
  prompt provides the source text;
- leave source citations out of the item text unless the schema later adds a
  field for them.

### JSON shape and validation stance

The prompt may tell the external LLM to return an array of objects. The exact
schema may evolve with the UI issue, but the import action must validate into
the existing `buatButirSoal` input shape: `jenis`, `pertanyaan`, optional
`pilihan`, `kunciJawaban`, and optional `pembahasan`.

Validation must be conservative. The external model is untrusted input. The
server action owns schema validation, enum validation, trimming, maximum length
checks if added by the implementation issue, and per-item error reporting.

### Provenance format

The provenance string for this flow is:

```text
eksternal-pengguna:<userId>:<jenis>:<ISO ts>
```

Where:

- `<userId>` is the authenticated WorkOS user id from `akses.userId`.
- `<jenis>` is the validated Bank Soal item type: `pg`, `essay`, `isian`,
  `jodohkan`, or `benar_salah`.
- `<ISO ts>` is the server-side timestamp in ISO 8601 format, created at import
  time.

The provenance is stored in `catatan_audit.konteks` JSON, not in a new database
column. `butir_soal.dibuat_oleh` remains the existing author field and must be
set to the same `userId`. The platform must not add a `butir_soal.provenance`
column for this decision.

The audit log is the traceability surface. It records that the content came
from a user-mediated external-AI workflow without representing that the
platform generated, verified, or endorsed the model output.

### UU PDP posture

EduAdmin Pro Premium remains the data processor for the Satuan Pendidikan for
platform-hosted school data, as recorded in the identity and PII decisions. This
ADR does not change that relationship.

For Option F, the transfer posture is:

1. **Prompt generation in the app.** The platform renders a prompt containing
   only `mata_pelajaran`, optional `tingkat`, `jenis`, `jumlah`, schema, and
   generic instructions. It contains no student personal data.
2. **Copy to clipboard.** Copying the minimized prompt is not a student-data
   transfer because the prompt contains no student data.
3. **Paste into an external LLM.** If the user pastes the prompt into ChatGPT,
   Gemini, Claude, or another external LLM, the Satuan Pendidikan is the data
   controller for that action. The school decides whether that external tool is
   allowed under its own DPA, procurement terms, internal policy, and UU PDP
   posture.
4. **Paste JSON back into EduAdmin Pro Premium.** The platform stores the pasted
   result as teacher-authored Bank Soal content, subject to normal server-side
   authorization, RLS, FK checks, validation, and audit logging.

The key difference from ADR 0003 Option D is responsibility for transfer. In
Option D, the platform would call or proxy the provider and would therefore
participate in the transfer. In Option F, the platform does not transfer data
to an LLM provider. The school user performs any external paste in their own
provider session and under the school's own controller decision.

This is why the three Option D objections do not apply to Option F:

1. **UU PDP / children's-data transfer.** Option F's platform-generated prompt
   is minimized and must not contain student PII. The platform makes no
   provider call. If the school user independently pastes text into an external
   LLM, that transfer is the school's controller action, not an EduAdmin Pro
   Premium processor transfer. UU PDP Pasal 5 ayat 2 and Pasal 16 remain
   relevant to the school's policy, but they are not triggered by a platform
   transfer because there is no platform transfer.
2. **Key management on non-experts.** Option F accepts no API key. There is no
   key field, no stored key, no proxy key, no browser persistence, and no
   platform-side rotation problem. The user may already have their own external
   LLM account, but EduAdmin Pro Premium never takes custody of that credential.
3. **Architecture breakage.** Option F does not claim to be the `draf_ai`
   pipeline. It bypasses `draf_ai` precisely because the platform did not
   generate the content. The human review happens before paste: the user sees
   and chooses the JSON they paste back. Traceability is preserved through
   `catatan_audit` provenance, while canonical creation still goes through
   `buatButirSoal`, `withTenant`, RLS, and server-side authorization.

### Scope limits

This ADR authorizes only the Bank Soal import slice. It does not authorize
external-LLM clipboard generation for `perangkat_ajar`, `penilaian`, `eraport`,
attendance, discipline, counseling, or student-profile narratives. It also does
not authorize any direct provider integration under Permintaan AI, any user-
supplied API key model, or any model call made by a server action, route
handler, client component, edge function, background job, webhook, or browser
proxy.

A later module may reuse the clipboard pattern only through its own ADR or a
recorded amendment to this ADR, including a new data-minimization review for
that module.

## Consequences

**Positive.**

- Bank Soal gets useful external-LLM assistance without the platform taking a
  provider dependency, paying token costs, holding keys, or making a transfer
  to an LLM provider.
- The feature gives schools that already have an approved LLM workflow a path
  to use it, while keeping EduAdmin Pro Premium out of provider procurement and
  provider credential custody.
- The prompt minimization rule keeps the copied prompt free of student PII by
  construction.
- Server-side authorization and tenant isolation remain unchanged. The import
  action is still guarded by `requireAuth()`, `getAksesSaya().boleh(...)`, and
  `withTenant(db, akses.membership.orgId, ...)`.
- The canonical write path remains `buatButirSoal`, so `butir_soal` schema
  checks, RLS, FKs, `dibuat_oleh`, and default `status = "aktif"` continue to
  apply.
- Traceability is preserved through `catatan_audit` with the
  `eksternal-pengguna:<userId>:<jenis>:<ISO ts>` provenance string.

**Negative.**

- Output quality depends on the user's external LLM choice and review before
  paste. The platform cannot guarantee model quality, safety filters, or
  provider retention.
- The platform cannot prove which external provider produced the pasted JSON.
  The provenance records a user-mediated external workflow, not a verified
  provider identity.
- A user could manually alter the JSON before import. That is acceptable for
  this slice because the imported item is treated as teacher-authored content,
  but it means the audit log must not imply provider-certified output.
- Users may still paste the minimized prompt into a provider their school has
  not approved. The platform mitigates this with copy and policy text, but the
  school remains responsible for its own external-LLM use.
- The `draf_ai` verification gate does not apply to this path. This is an
  intentional distinction, not a gap, but future reviewers may confuse it with
  ADR 0003's AI pipeline unless the UI and audit naming stay explicit.

**Mitigation for the accepted path.**

- Label the surface **"AI Eksternal"**, not **"Permintaan AI"** or any name
  that suggests platform generation.
- Include explanatory UI copy near **"Salin Prompt"** and **"Tempel Hasil"**:
  the user is responsible for the external tool they choose, and the app only
  imports reviewed JSON.
- Keep the prompt template small and inspectable in code. Any future addition
  to prompt context must be reviewed against the exclusion list in this ADR.
- Treat pasted JSON as hostile input. Validate every field server-side and show
  per-item errors.
- Keep audit provenance in `catatan_audit.konteks`; do not create a new
  provenance column unless a later reporting requirement proves it is needed.
- Do not reuse this pattern outside Bank Soal without a new module-specific
  minimization review.

## Alternatives

**Option A - Keep ADR 0003 mock-only posture for Bank Soal.** Effort: low. Risk:
low. **Rejected for Bank Soal** because the owner has accepted Option F and the
minimized clipboard flow does not share Option D's platform-transfer or key-
custody risks.

**Option B - Wire a platform-owned provider call.** Effort: medium. Risk: owner-
owned DPA, procurement, key custody, cost, retention terms, and UU PDP transfer
posture. This is ADR 0003 Option C territory. **Rejected for this slice.**

**Option C - User-supplied API key or platform proxy.** This is ADR 0003 Option
D. Risk: unacceptable for ADR 0003's reasons: uncontrolled child-adjacent
transfer, non-expert key custody, and broken platform provenance. **Rejected.**

**Option D - Store external provenance on `butir_soal`.** Requires a schema
change before there is a reporting need and creates another field whose
semantics differ from `draf_ai.provenance`. **Rejected.** Store provenance in
`catatan_audit.konteks` only.

**Option E - Route pasted output through `draf_ai`.** Risk: misrepresents the
source. `draf_ai` is for platform-created AI drafts; pasted external JSON is
user-mediated content. **Rejected.** Use direct `buatButirSoal` import with
audit provenance.

**Option F - BYO-LLM-via-Clipboard for Bank Soal.** Effort: medium-low. Risk:
bounded by prompt minimization, no platform transfer, no key custody, server-
side validation, RLS, and audit provenance. **Accepted.**

## References

- ADR 0003: `docs/adr/0003-mvp-ai-strategy.md` - the deferred real-provider AI
  strategy and the rejected Option D BYO-key pattern. This ADR partially
  supersedes only the reasoning for the clipboard sub-pattern defined here.
- `docs/architecture/identity-and-access.md` §12 - server-side authorization
  boundaries. The import action must authorize on the server; client UI hiding
  is not authorization.
- `docs/architecture/identity-and-access.md` §13 - organization data-isolation
  rules. Tenant scope is derived from the authenticated active membership and
  enforced by RLS, never from a client-supplied tenant id.
- `src/app/dashboard/bank-soal/actions.ts` - current Bank Soal server-action
  surface and the required `requireAuth()`, permission, audit, and `withTenant`
  pattern.
- `src/db/queries/bank-soal.ts` - `buatButirSoal`, the repository function the
  import path must use for valid pasted items.
- `src/db/schema.ts` lines 1411-1529 - `butir_soal`, `paket_soal`, and
  `paket_soal_butir`; especially `butir_soal.jenis`, `draf_ai_id`, `status`,
  and `dibuat_oleh`.
- `docs/adr/0002-pii-at-rest-strategy.md` - parallel UU PDP and proportionality
  reasoning for children's data and owner-owned compliance checkpoints.
- Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Pelindungan Data
  Pribadi (UU PDP), Pasal 5 ayat 2 and Pasal 16 - children's personal data and
  required protection proportional to risk.
