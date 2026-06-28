# ADR 0005: Consent & Notification Foundation

## Status

Deferred — pending owner acceptance (human checkpoint). This ADR records the
boundary and decision framework for the external-channel consent regime
(post-MVP backlog items #7–#11) but **defers all build**. No consent record
table, no opt-out flag, no external email queue, and no WhatsApp send path is
authorized by this ADR. Wave 4 Task 24 (T24) **will skip** until the owner
explicitly flips this ADR to **Accepted** AND a thin vertical slice is scoped.

The deferral is the safe default mandated by the post-MVP backlog
(`docs/roadmap/post-mvp-backlog.md` §3, items #7–#11): every consent-family
item carries `Owner: legal-owner + product-owner`, `Default-if-silent: defer`,
`ADR-required: Y`. No owner signal has been recorded as of 2026-06-27.

**WhatsApp is explicitly gated as `deferred / ADR-required`, NOT `build-now`.**
Even if this ADR were flipped to Accepted, the WhatsApp channel (items #7, #8)
would remain deferred pending a separate channel-specific acceptance (see
§"WhatsApp gate" below).

## Date

2026-06-27

## Context

### Current notification state (MVP, in force)

The MVP ships **in-app notifications only**. Two tables in
`src/db/schema.ts` (lines 1196–1267) implement the complete surface:

- **`notifikasi`** — in-app notification addressed to exactly one `Pengguna`
  (a PTK/teacher recipient). `tipe` ∈
  `tugas_nilai | tugas_absensi | tugas_eraport | umum`. `konteks` carries an
  optional deep-link. Recipient-scoped via `pengguna_id` + tenant-scoped via
  the `app.tenant_id` GUC. The MVP acceptance criterion (AC#5, page doc
  `src/app/dashboard/notifikasi/page.tsx` lines 36–38) states verbatim:
  *"MVP scope: in-app ONLY. No WhatsApp/email/SMS delivery is part of this
  slice."*
- **`preferensi_notifikasi`** — per-`Pengguna` per-`tipe` on/off toggle
  (self-service, in-app only). A missing row defaults to `aktif` (on).

**Critical boundary:** MVP notification recipients are `Pengguna` only — i.e.
authenticated teachers/staff who hold a `Keanggotaan Satuan Pendidikan`.
`Wali Peserta Didik` (parents/guardians) are **not** `Pengguna` in the MVP
(`src/db/schema.ts` lines 342–344: *"NOT Pengguna logins — a wali cannot sign
in"*; `CONTEXT.md` line 397). There is no notification path — in-app or
external — that reaches a parent today.

### Parent contact data at rest (the regulated surface)

The PII inventory from ADR 0002 (`docs/adr/0002-pii-at-rest-strategy.md`
§"Context") records the parent-contact columns this regime would touch:

- **`wali_peserta_didik`** (`schema.ts` lines 346–362): `nama`, `hubungan`
  (Ayah/Ibu/Wali), `telepon`, `email`. These are **contact records only**,
  not logins. They cascade on `peserta_didik` delete.
- **`kontak_darurat`** (`schema.ts` lines 368–383): `nama`, `hubungan`,
  `telepon`. Explicitly *"does not replace Wali Peserta Didik responsibility
  or create a routine messaging channel"* (`CONTEXT.md` line 398).

Combined with `peserta_didik` (student: `nama`, `nisn`, `nis`, `tanggal_lahir`,
`jenis_kelamin`), the join `peserta_didik ↔ wali_peserta_didik` is the
regulated join: **a minor's identity paired with a guardian contact channel**.
Any external send to a `wali_peserta_didik.email` / `.telepon` is a UU PDP
disclosure of a minor's data to a recipient outside the school's tenant
boundary.

### Audit infrastructure (exists, generic)

`catatan_audit` (`schema.ts` lines 73–86) records `aktor` / `aksi` / `target`
/ `beban` (jsonb) per tenant-scoped mutation. It is a generic mutation audit
log for authenticated `Pengguna` actors. It does **not** today record:
external-channel sends, consent grants/withdrawals, or recipient-resolution
events. Any consent regime that reuses `catatan_audit` needs an extension
convention; a dedicated `catatan_konsen` / `catatan_notifikasi_eksternal` table
is the more likely shape (deferred to the Accepted spec).

### UU PDP consent regime (the legal hook)

**UU No. 27/2022 (UU PDP — Pelindungan Data Pribadi)**, in full effect since
17 October 2024, governs this surface. Two provisions sharpen the post-MVP
consent decision beyond a generic "send an email" feature:

1. **Pemberitahuan (Pasal 3–5, 28)** — before processing, the controller must
   inform the subject: purpose, data categories, recipients, retention,
   transfer, and the subject's rights. For a minor's data, the Pemberitahuan
   is served to the **Wali Peserta Didik**. This is more than an "opt-in
   checkbox" — it is a documented disclosure.
2. **Persetujuan (Pasal 20–22)** — valid consent must be specific, informed,
   freely given, and **withdrawable at any time** (Pasal 20 ayat 2). For
   children's data (Pasal 5 ayat 2), consent must come from a verifiable
   parent/guardian. Withdrawal must be as easy as grant.
3. **Anak (Pasal 5 ayat 2, Pasal 16 ayat 3)** — children's personal data is a
   heightened category. The join `peserta_didik ↔ wali_peserta_didik` is a
   minor's data path; external comms over it is Critical-risk (per
   `post-mvp-backlog.md` §3, items #7, #8, #10 all marked `Risk: Critical`).

The MVP's `preferensi_notifikasi` toggle is a **self-service in-app preference
for an authenticated Pengguna's own inbox**. It is **not** a UU PDP consent
record: it does not record Pemberitahuan delivery, it does not name a data
purpose or recipient, it cannot be exercised by a non-Pengguna (a Wali), and
`CONTEXT.md` line 345 explicitly lists *"Consent-free external messages"*
among its `_Avoid_` values. Reusing it as a parent-consent store would
collapse two distinct legal constructs.

### Post-MVP backlog items this ADR governs

From `docs/roadmap/post-mvp-backlog.md` §3 (the T21 ADR-gated backlog), this
ADR is the projected home of the external-channel consent family:

| # | Item | Owner | Risk | ADR-required |
|---|------|-------|------|--------------|
| 7 | Parent WhatsApp channel | legal-owner + product-owner | Critical | Y |
| 8 | WhatsApp Audit Pack (branded weekly cards) | legal-owner + product-owner | Critical | Y |
| 9 | Email notification automation | legal-owner + product-owner | High | Y |
| 10 | Parent-facing routine notifications (to Wali) | legal-owner + product-owner | Critical | Y |
| 11 | Wali / parent login portal | product-owner + security | Critical | Y (partly — own ADR [0007]) |

All five carry `Default-if-silent: defer`. Items #7–#10 are fully in this
ADR's scope ([0005] External channel consent regime). Item #11 (Wali portal)
spans this ADR **and** projected ADR [0007] (Parent/Wali access model) because
it adds a non-PTK auth role and trips ADR 0004's role vocabulary and ADR
0002's regulated-category trigger.

### Why this is a human checkpoint, not an engineering default

Three properties make "build the foundation now" the wrong default:

1. **The recipient population is not a MVP auth surface.** Wali Peserta Didik
   cannot sign in. A consent record, an opt-out flag, and an audit trail all
   need a stable identity for the consent *subject*. Whether that identity is
   a signed token, a magic-link row, a phone-verified record, or a full Wali
   auth role (ADR [0007]) is an owner-level access-model decision that has not
   been made. Building the data model before that decision risks rework.
2. **The Pemberitahuan/Persetujuan pair is a legal-artifact decision.** The
   consent record must capture purpose, data categories, recipient,
   Pemberitahuan delivery proof, and a withdrawal path that is "as easy as
   grant." The exact fields, the retention of the consent artifact itself
   (outliving the contact row), and the cross-tenant oversight model (does a
   yayasan see aggregated consent state?) are legal-owner calls. The
   `legal-owner` assignment in the backlog is load-bearing, not decorative.
3. **Two of the three channels are Critical-risk children's-data paths.**
   Items #7, #8, #10 are Critical because a WhatsApp/email send to a Wali
   carries a minor's identity outside the tenant boundary. The MVP ship gates
   (T20 §7) require ADR 0002 (PII at rest) to reach **Accepted** before any
   production tenant carries real student data. A consent regime that ships
   external sends while ADR 0002 is still Deferred inherits a paper-only
   security posture for the regulated join.

## Decision

**Defer the consent & notification foundation. Status: Deferred.** No build.
T24 skips. The deferral holds until the owner explicitly flips this ADR to
Accepted and a bounded vertical slice is scoped.

### Compensating posture (in force; must remain true)

These are properties the MVP already guarantees and that this deferral relies
on. They must stay green:

1. **In-app notifications only.** No code path sends to `wali_peserta_didik`
   or `kontak_darurat` contact fields. The `notifikasi` table is
   recipient-scoped to `Pengguna.id`; no foreign key reaches a Wali.
2. **`preferensi_notifikasi` is not a consent store.** Its docstring and
   `CONTEXT.md` line 345 forbid repurposing it for external consent. Any
   future consent record is a separate table.
3. **Contact fields are read-only display/import columns.** `telepon`/`email`
   on `wali_peserta_didik` are surfaced for admin viewing and Dapodik import
   only; no automation reads them for delivery.
4. **Audit log is generic.** `catatan_audit` records `Pengguna` mutations; it
   does not pretend to be a consent or send audit. The absence of a consent
   audit table is the honest state, not a gap to quietly fill.

### Trigger conditions (when this deferral must be revisited)

The deferral expires — and a follow-up Accepted version of this ADR is
required — when any of these becomes true:

- **Owner signals start.** The owner (legal-owner + product-owner) explicitly
  accepts T22 and scopes T24. This is the primary trigger; the rest are
  forcing functions.
- **Owner accepts the Wali access model (ADR [0007]).** A parent auth role is
  the single biggest unblocker: it gives the consent regime a stable subject
  identity. If [0007] lands first, this ADR should be reopened immediately to
  define the consent record against real identities.
- **A regulator, a contracting Dinas/Yayasan, or a school DPO requires
  automated external communication** (e.g. mandatory absence alerts) as a
  contractual term.
- **ADR 0002 (PII at rest) moves to Accepted** AND a production tenant
  requests parent-facing comms. This is the security-posture precondition for
  any external send of the regulated join.
- **A breach or near-miss** shows that ad-hoc external comms (e.g. an admin
  manually copying a Wali's number to a personal WhatsApp) is happening
  uncontrolled — in which case this ADR's regime becomes a containment
  measure, not a feature.

### WhatsApp gate (explicit, non-negotiable)

**WhatsApp (items #7, #8) is `deferred / ADR-required`, NOT `build-now`.**

Even if this ADR were flipped to Accepted for the email/consent-record
foundation, the WhatsApp channel stays deferred. The reasons, all from the
hyperplan record (`hyperplan/round-2-quality-maximalist.md`,
`hyperplan/round-2-arch-logician.md`, `hyperplan/insights-bundle.md` §66–69):

- WhatsApp is an **uncontrolled third-party channel**. Every send is a UU PDP
  disclosure to N recipients with no in-band consent log, no revocation, and
  no audit from the provider. A WhatsApp number may be shared, borrowed,
  swapped SIM, or belong to an abusive co-parent — the controller cannot
  verify the recipient identity at send time.
- The "WhatsApp Audit Pack" (branded weekly cards of attendance/prestasi) is a
  **PII broadcast** of a minor's identity to a group chat. The round-2
  quality-maximalist review called this *"PII broadcast with marketing sugar"*
  and it is explicitly consent-gated in `insights-bundle.md` line 69.
- A WhatsApp send path requires: recipient identity verification, a consent
  registry per-purpose, a withdrawal path that actually suppresses sends, an
  audit trail of every send (with content hash, not content, retained), and a
  provider-terms review (Meta Business API / BSP terms on children's data).

**Therefore:** any Accepted version of this ADR that authorizes email/consent
build (T24) MUST still mark WhatsApp as `deferred / ADR-required` and require
a **separate** channel-specific acceptance before any WA send code lands.
Items #7 and #8 cannot ride along on a #9/#10 email-foundation acceptance.

### If Accepted later — the bounded vertical slice for T24 (thin spec only)

This section is **non-binding until Status flips to Accepted**. It exists to
make the owner's acceptance decision concrete: "what exactly would T24 build?"
The answer is a thin vertical slice covering the four required elements, with
**no WhatsApp and no parent auth**:

1. **Consent record table** (`catatan_konsen` or similar). Captures, per
   `(tenant, wali_peserta_didik, purpose)`: Pemberitahuan delivered-at,
   Persetujuan status (`aktif | dicabut | kedaluwarsa`), granted-at,
   granted-via (import-migrated-pending-reconfirm | self-confirmed), withdrawn-at,
   withdrawn-via. The consent artifact **outlives** the contact row (no cascade
   delete) so a withdrawal is auditable after a Wali record is removed.
2. **Opt-out flag / withdrawal surface.** A withdrawal must be as easy as
   grant (Pasal 20 ayat 2). Thin slice: an admin-managed withdrawal toggle in
   the existing `pengaturan` surface (Wali cannot self-serve in MVP because
   Wali cannot sign in — see ADR [0007] dependency). Self-serve withdrawal
   waits on the Wali access model.
3. **Audit trail.** A dedicated `catatan_notifikasi_eksternal` (or an
   extension convention on `catatan_audit`) recording: recipient-resolved-at,
   channel, purpose, content-hash, consent-state-at-send, send-status, error.
   Retention per the (deferred) Dapodik-retention ADR. **No plaintext message
   body retained** — only a hash, to avoid re-creating a PII store.
4. **Email queue UI/backend stub.** A backlog table (`antrian_email` or
   similar) + a server action that enqueues — **no SMTP relayer wired in the
   thin slice.** The worker that drains the queue is a separate, post-acceptance
   task. This keeps T24 buildable without choosing an SMTP provider (a
   procurement/legal decision: DPA, UU PDP cross-border transfer terms).

**Explicitly out of the Accepted T24 slice:**
- **No WhatsApp.** (WhatsApp gate above.)
- **No parent auth / Wali login.** (ADR [0007] dependency; T24 cannot add a
  non-PTK auth role.)
- **No SMTP provider wiring.** (Procurement/legal decision; the stub enqueues
  only.)
- **No cross-tenant (yayasan) aggregated consent view.** (ADR [0010]
  Instansi Pengelola dependency.)
- **No automated retention/purge of the consent artifact.** (Gates on the
  Dapodik-retention compliance review, backlog item #2.)

## Consequences

**Positive.**

- The MVP notification surface stays honest: in-app, `Pengguna`-scoped, no
  external PII disclosure. The `notifikasi` / `preferensi_notifikasi` tables
  are not quietly overloaded into a consent store they were not designed for.
- `wali_peserta_didik` contact fields remain read-only admin/import columns.
  No code path ships a minor's data outside the tenant boundary.
- The legal-owner gate is respected. The Pemberitahuan/Persetujuan artifact
  shape is decided by the owner, not improvised by an engineer under deadline.
- ADR 0002's Deferred posture is not undermined: no external send of the
  regulated join ships while at-rest PII protection is itself owner-pending.
- Wave 5 stays empty (T21 §4). This ADR is consistent with "zero Wave 5
  candidates accepted without an owner signal."

**Negative.**

- Parent-facing communication — which the hyperplan round-3 wildcard-visionary
  review identified as a real retention driver ("attendance uncertainty and
  raport opacity are daily trust failures") — remains unavailable. Schools
  that want it today will do uncontrolled manual WA forwards, which is worse
  than a consent-gated channel. This is the core cost of deferral and the
  strongest argument for the owner to accept sooner.
- The consent artifact model is undefined. When the owner does flip this ADR,
  T24 will need to make the table-shape decisions this deferral postpones.
  That is acceptable: a deferred decision is cheaper than a wrong one baked
  into a migration.
- A naive future reviewer may see `preferensi_notifikasi` and `wali_peserta_didik`
  in the same schema and assume a parent-notification path exists. This ADR
  and `CONTEXT.md` line 439 are the response: external channels require
  explicit future consent and audit decisions, which are deferred here.

**Mitigation for the deferral.**

- This ADR records the trigger conditions and the thin-slice shape, so the
  owner's future acceptance is a flip + a scope confirmation, not a fresh
  research effort.
- The WhatsApp gate is explicit and isolated: an email/consent acceptance
  cannot accidentally authorize a WhatsApp send.
- The compensating posture (§"Decision") is testable today: no foreign key
  from `notifikasi` to a Wali table; no code path reads contact fields for
  delivery.

## Alternatives

**Option A — Accept now, build the full consent foundation (email + WA +
parent self-serve).** Rejected. (a) No owner signal has been recorded; the
backlog default is `defer` and silence never ships a risky feature. (b) The
parent auth role (ADR [0007]) is unresolved, so a self-serve consent/withdrawal
surface has no subject identity to bind to. (c) WhatsApp is a Critical-risk
children's-data broadcast that requires its own channel-specific acceptance.
(d) ADR 0002 (PII at rest) is Deferred; shipping external sends of the
regulated join before at-rest protection is Accepted is regulatorily
premature. Full-scope acceptance inverts every gate.

**Option B — Accept a thin email-only slice now, defer WhatsApp.** Considered
and set aside for this cycle. This is the most defensible "Accepted" variant
and is exactly what the §"If Accepted later" thin slice describes. It is set
aside only because **no owner signal has fired** — not because the slice is
technically wrong. If the owner signals acceptance, this becomes the default
shape: consent record + opt-out (admin-managed) + audit + email queue stub
(no SMTP, no WA, no parent auth). The thin slice is documented above so the
owner can accept by reference rather than re-deriving scope.

**Option C — Defer entirely, no thin spec (this ADR, weaker variant).**
Rejected in favor of the documented thin slice. Recording the slice shape
(even while Deferred) costs nothing and removes a research tax from the
owner's future acceptance decision. The trigger conditions + slice spec turn
"defer" from a stall into a prepared position.

**Option D — Repurpose `preferensi_notifikasi` as the consent store.**
Rejected outright. It is `Pengguna`-scoped (a Wali is not a `Pengguna`),
self-service for an authenticated inbox, and explicitly barred by
`CONTEXT.md` line 345 from being a consent/audit substitute. Overloading it
would collapse Pemberitahuan/Persetujuan into an in-app preference toggle and
violate UU PDP Pasal 20's withdrawal standard.

## UU PDP compliance checklist (non-binding until Accepted)

Mirror of ADR 0002's checklist format. Each item must be verifiable before any
build of the consent foundation. Today all are unchecked because Status is
Deferred.

- [ ] **Pasal 3–5, 28 — Pemberitahuan.** A documented disclosure (purpose,
      data categories, recipients, retention, transfer, subject rights) is
      delivered to the Wali before any external send.
- [ ] **Pasal 20–22 — Persetujuan.** Consent is specific, informed, freely
      given, recorded, and **withdrawable as easily as granted** (Pasal 20
      ayat 2). The consent artifact outlives the contact row.
- [ ] **Pasal 5 ayat 2, Pasal 16 ayat 3 — Anak.** Children's data (the
      `peserta_didik ↔ wali_peserta_didik` join) is treated as heightened;
      any external send is Critical-risk and requires verified-parental
      consent.
- [ ] **Pasal 13 — Akuntabilitas.** Every external send is auditable:
      recipient-resolved, channel, purpose, content-hash, consent-state,
      send-status.
- [ ] **Pasal 14–15 — Minimization & retention.** The message body is not
      retained as a PII store (hash only); the consent artifact's retention is
      governed by the (deferred) Dapodik-retention ADR.
- [ ] **Pasal 17 — Access control.** Recipient resolution and send actions
      are server-side authorized; `tenant_role` is never superuser; no
      client-supplied `tenant_id`.
- [ ] **WhatsApp-specific gate.** Items #7/#8 require a separate
      channel-specific acceptance covering recipient-identity verification,
      per-purpose consent registry, withdrawal suppression, send audit, and
      provider-terms review before any WA send code lands.

## References

- `docs/roadmap/post-mvp-backlog.md` — T21 ADR-gated backlog §3 (items #7–#11),
  §5 (projected ADR [0005] External channel consent regime), §6 (risk-gate
  call-outs for parent portal, WhatsApp/external comms).
- `docs/adr/0002-pii-at-rest-strategy.md` — PII inventory
  (`wali_peserta_didik`, `kontak_darurat`, `peserta_didik`); Deferred status
  is a precondition for any external send of the regulated join.
- `docs/adr/0004-workos-role-session-strategy.md` — role vocabulary; Wali
  access (projected ADR [0007]) requires a role-extension decision.
- `src/db/schema.ts` lines 342–394 (`wali_peserta_didik`, `kontak_darurat`),
  73–86 (`catatan_audit`), 1196–1267 (`notifikasi`,
  `preferensi_notifikasi`).
- `src/app/dashboard/notifikasi/page.tsx` lines 36–38 — MVP AC#5: in-app ONLY.
- `CONTEXT.md` lines 91–101 (Wali Peserta Didik, Kontak Darurat, Wali Kelas),
  337 (Notifikasi `_Avoid_: external reminder without consent`), 345
  (Preferensi Notifikasi `_Avoid_: consent-free external messages`), 397–400,
  438–439, 479 (resolved boundary: external channels require explicit future
  consent + audit decisions).
- `hyperplan/round-2-quality-maximalist.md`, `hyperplan/round-2-arch-logician.md`,
  `hyperplan/insights-bundle.md` §66–69 — WhatsApp-as-PII-broadcast analysis;
  consent-gated aggregate-only resolution.
- `hyperplan/plan.md` §A8 (line 369–370) — Parent WhatsApp channel / WhatsApp
  Audit Pack deferred to post-MVP, consent-gated aggregate only.
- `.omo/evidence/reconciliation/postmvp-canonical.md` — T5 canonical: items
  #7–#11, ADR grouping, Q31 boundary framework.
- `.omo/evidence/release/mvp-ship-gates.md` — T20 §7: ADR 0002 Accepted is a
  hard production go-live gate.
- Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Pelindungan
  Data Pribadi (UU PDP), Pasal 3–5 (Pemberitahuan), 13–17 (hak & kewajiban),
  20–22 (Persetujuan), 28 (hak subjek), 5 ayat 2 & 16 ayat 3 (data anak).
