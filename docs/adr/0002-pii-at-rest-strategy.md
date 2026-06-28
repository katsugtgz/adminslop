# ADR 0002: PII at-Rest Strategy

## Status

Deferred — pending owner acceptance (human checkpoint). Compensating controls
in §"Decision" are in force for MVP and must remain green before any production
go-live. This ADR must be moved to **Accepted** or superseded by a follow-up
ADR before the first production tenant that carries real student data.

## Date

2026-06-27

## Context

EduAdmin Pro Premium stores **personally identifiable information of minors**
and their guardians. The PII inventory in `src/db/schema.ts` (42 tables,
audited 2026-06-27, transcript in `.omo/evidence/task-10-secret-history.log`
§4) identifies the high-sensitivity columns:

- **`peserta_didik`** (students): `nama`, `nisn` (national student ID), `nis`
  (school student ID), `tanggal_lahir`, `jenis_kelamin`.
- **`wali_peserta_didik`** (parent/guardian contacts): `nama`, `telepon`,
  `email`.
- **`kontak_darurat`** (emergency contacts): `nama`, `telepon`.
- **`akses`** (PTK / teachers): `nama`, `nip` (national teacher ID).
- **`profil_satuan`** (school profile): `nama_kepala`, `alamat`.

The schema is intentionally lean: it does **not** store NIK / No. KK (national
ID / family card), religion, blood type, health records, biometrics, photos,
or mother's maiden name. The highest-risk class is **minor student identity
combined with parent contact data**.

This data is regulated under **UU No. 27/2022 (Undang-Undang Pelindungan Data
Pribadi — "UU PDP")**, Indonesia's Personal Data Protection Law, which took
full effect 17 October 2024. Two features of UU PDP sharpen the risk profile
beyond a generic PII store:

1. **Children's personal data is a regulated category** (Pasal 5 ayat 2, Pasal
   16). Processing a child's data requires verifiable parental consent and
   heightened protective measures.
2. **Specific data** (Pasal 4 ayat 2) — which includes data of children —
   demands protection proportionate to the risk, with the controller
   accountable for demonstrating that protection.

The current at-rest posture is **plain Postgres columns** behind three
controls: (a) Row-Level Security on every tenant-scoped table (the ship-blocker
rule from `docs/architecture/identity-and-access.md` §13 and ADR 0001), (b) a
non-superuser `app_user` role that RLS applies to, and (c) the WorkOS-owned
opaque session that injects `tenant_id` server-side. `pgcrypto` is already
enabled across the migrations (for `gen_random_uuid()`), but **no column uses
`pgp_sym_encrypt` / `pgp_sym_decrypt`**. Cloud-provider disk encryption (the
default on managed Postgres / Supabase) is assumed but is the owner's
hosting-procurement decision, not something this codebase controls.

The secret-history scan (`.omo/evidence/task-10-secret-history.log`) confirmed
that **no secret has ever been committed** to this repository across all
branches, so the at-rest question is genuinely about column-level crypto, not
about recovering leaked credentials.

The tension: column-level encryption is a recognizable "defense in depth" line
item in a security review, and a naive reviewer may flag its absence. But
applied naively — where the application server holds the decryption key in the
same trust boundary as the database — it is **cargo-cult crypto**: it adds key
management, indexing, and query-complexity cost without materially reducing
the dominant breach vectors for this application (RLS bypass, app-layer
authorization bypass, credential leak). The decision therefore cannot be made
purely on engineering grounds; it depends on the owner's tolerance for
key-management operational burden, the hosting provider's actual at-rest
encryption posture, and the UU PDP compliance stance the institution wants to
defend. That is a human checkpoint.

## Decision

**Defer column-level encryption for MVP.** Rely on a defined set of
compensating controls that are independently verifiable and already (mostly)
in place. The deferral is conditional: it holds only while every control below
stays green.

### Compensating controls (in force; must remain green)

1. **RLS on every tenant-scoped table.** Cross-tenant isolation is a
   ship-blocker (`identity-and-access.md` §13). The Phase 1 exit test — "a user
   in Satuan Pendidikan A cannot read or write Satuan Pendidikan B rows" —
   must stay green. This is the single highest-value control and it already
   exists.
2. **Non-superuser app role.** The runtime connection uses `app_user`, to which
   RLS is `FORCE`-applied. The migrator role is a separate connection
   (`.env.example` lines 36–39). No runtime code path may use the migrator URL.
3. **Server-side authorization, never client.** Every protected action verifies
   authenticated session + membership + `tenant_role` + fine-grained business
   rule in server components / server actions / route handlers
   (`identity-and-access.md` §12). Client UI may hide controls; hiding is not
   authorization.
4. **Audit log.** `catatan_audit` records mutations to tenant data, giving
   post-incident visibility into who accessed what.
5. **Secret hygiene.** `.env` is gitignored and never committed (verified clean
   across all history). `WORKOS_API_KEY` and `WORKOS_COOKIE_PASSWORD` are
   server-only (`identity-and-access.md` §16). No `NEXT_PUBLIC_*` secret exists.
6. **Cloud-provider at-rest encryption (owner procurement control).** Disk /
   volume encryption must be enabled on the managed Postgres / Supabase
   instance that hosts production data. This is the control that actually
   defeats the "someone walks off with the disk" threat. **The owner must
   confirm this is enabled on the chosen hosting provider before production
   go-live** and record the confirmation in `learnings.md`.

### Recommended lean (non-binding until Accepted)

The deferral is the recommendation, not a placeholder. The reasoning, to be
ratified or overturned by the owner:

- The dominant breach vectors for a multi-tenant school app are RLS bypass,
  app-layer authz bypass, and credential leak. **Column-level pgcrypto does
  not materially reduce any of these**, because the application server holds
  the decryption key in the same trust boundary as the database. A DB-only
  attacker who cannot also compromise the app's key still cannot decrypt — but
  the realistic threat model is "both are compromised together," against which
  column crypto offers little marginal protection.
- Proportionality under UU PDP Pasal 16 asks for measures proportional to
  risk. The control set above — RLS, least-privilege role, server authz,
  audit, secret hygiene, and provider disk encryption — is a defensible,
  proportionate posture for MVP. Disk encryption covers the at-rest threat at
  the storage layer; RLS covers the multi-tenant isolation threat; authz
  covers the app-layer reach.
- Correct column-level crypto requires a key-management decision (KMS / HSM /
  WorkOS Vault / env-var key) that has cost and operational implications and
  is therefore an owner-level call. Doing it badly — key in `.env`, same
  breach surface as the data — is worse than not doing it and documenting why.

### Trigger conditions (when this deferral must be revisited)

The deferral expires — and a follow-up ADR is required — when any of these
becomes true:

- A hosting change removes provider-level disk encryption, or the owner cannot
  confirm it.
- A new column lands in `src/db/schema.ts` from a regulated category beyond
  the current inventory (e.g. NIK, No. KK, health, biometric, financial).
- A regulator, a contracting Dinas / Yayasan, or a school's DPO requires
  column-level encryption as a contractual term.
- A breach or near-miss shows the control set above was insufficient.
- An export / data-portability feature is added that ships PII outside the
  RLS + disk-encryption boundary.

## Consequences

**Positive.**

- No key-management burden is added to MVP. The team is not responsible for
  rotating, backing up, and restoring an encryption key whose loss would turn
  student records into permanent ciphertext.
- Query patterns, indexing, and Drizzle's type inference stay simple.
  `pgp_sym_encrypt` columns cannot be indexed for equality / range without a
  deterministic MAC sidecar, which would itself be a leaky oracle.
- The control set that actually defends the data (RLS, least privilege, server
  authz, audit, secret hygiene) is fully in place and verifiable today.
- UU PDP proportionality is defensible: the response is documented, the
  controls are enumerated, and the trigger conditions name exactly when the
  posture will be strengthened.

**Negative.**

- A column-level compromise of the database (an attacker with raw SQL access
  who has *also* defeated RLS) would read PII as plaintext. The control set
  relies on RLS + `app_user` least-privilege to make that path implausible,
  but it is not a cryptographic guarantee.
- A naive future security review may flag "no encryption at rest on PII
  columns." This ADR is the response to that review: the deferral is
  deliberate, the reasoning is on record, and the trigger conditions are
  explicit.
- Children's data carries heightened UU PDP scrutiny (Pasal 5 ayat 2, Pasal 16
  ayat 3). If the institution's DPO or a contracting authority takes a
  stricter view, the deferral must be escalated to column-level crypto on a
  shorter timeline. This is a business/legal call, not an engineering one.

**Mitigation for the deferral.**

- Every compensating control in the Decision is independently testable; the
  RLS suite (`src/db/rls.test.ts`) and the ownership-gate security fixes
  already merged (`fix(security): C1+C3+C14…`) keep the highest-value controls
  under regression.
- The PII inventory is recorded here and in the evidence transcript; any
  schema change that adds a regulated column trips a trigger condition.
- The owner acceptance checkpoint forces an explicit decision before real
  student data is loaded into production — the deferral cannot silently
  become the permanent posture.

## Alternatives

**Option A — pgcrypto column-level encryption now (`pgp_sym_encrypt` /
`pgp_sym_decrypt`).** Effort: medium (schema migration, Drizzle read/write
wrappers, key bootstrap). Risk: **key management**. The decryption key must be
held by the application server; if it lives in `.env` alongside the DB URL, it
adds no defense against the realistic "app + DB compromised together" threat,
while introducing a new catastrophic failure mode (key loss = permanent data
loss) and breaking equality / range indexing on encrypted columns. `pgcrypto`
is already enabled, so this is technically cheap to start but operationally
expensive to do *correctly* (KMS / HSM / Vault). **Rejected for MVP** unless an
owner decision overrides the deferral.

**Option B — defer with compensating controls (this ADR).** Effort: low (the
controls already exist). Risk: relies on RLS + provider disk encryption being
correctly configured and maintained. Proportionate to the MVP threat model and
defensible under UU PDP proportionality. **Recommended lean, status
`deferred` pending owner acceptance.**

**Option C — application-layer field encryption in Drizzle / server code
(before the data reaches Postgres).** Moves the key out of the DB connection
but not out of the app trust boundary; same indexing pain as Option A, plus a
custom serialization layer. Considered and set aside — it has Option A's costs
without its (already marginal) benefit.

**Option D — tokenization / vault for the highest-sensitivity identifiers
(NISN, NIP, parent contact).** Replace identifiers with opaque tokens, store
the mapping in a separately-controlled vault. This is the strongest option for
specific columns but is a post-MVP architecture with its own access-control
surface. Flagged as the likely shape of any follow-up ADR if a trigger
condition fires.

## UU PDP (Indonesia) compliance checklist

This checklist is the operational mirror of the controls above. Each item must
be verifiable before production go-live.

- [ ] **Pasal 16 — technical protection.** RLS on every tenant-scoped table
      (regression-tested by `src/db/rls.test.ts`); `app_user` least-privilege;
      server-side authorization on every protected action.
- [ ] **Pasal 16 — at-rest protection.** Owner confirms the managed Postgres /
      Supabase hosting provides disk/volume encryption; confirmation recorded
      in `learnings.md`.
- [ ] **Pasal 16 ayat 3 / Pasal 5 ayat 2 — children's data.** The data of
      students (minors) is treated as the highest-sensitivity class; access is
      limited to the student's own `Satuan Pendidikan` membership via RLS and
      fine-grained app authorization.
- [ ] **Pasal 13 — accountability.** `catatan_audit` records mutations; the
      controller can demonstrate who accessed or changed which records.
- [ ] **Pasal 14–15 — data minimization & retention.** The schema stores only
      the columns listed in the Context inventory (no NIK / KK / health /
      biometrics). A retention-and-deletion policy for graduated students is a
      separate, deferred task.
- [ ] **Pasal 17 — access control.** `tenant_role` is never superuser;
      WorkOS RBAC + app-layer authz enforce it; fired-teacher session
      revocation is wired (`identity-and-access.md` §10).
- [ ] **Pasal 34–36 — breach notification.** Incident-response runbook (who to
      notify within 3×24 hours) is a deferred, separate task; flagged in
      `learnings.md`.
- [ ] **Secret hygiene.** No secret committed across history (verified
      2026-06-27); `.env` gitignored; `WORKOS_*` secrets server-only.

**Minor-data risk note.** Because the regulated population includes children,
any trigger condition in the Decision section — especially the addition of any
column from a new regulated category, or the loss of provider disk encryption
— must be treated as accelerating the timeline for a follow-up ADR. Children's
data is not the place to test the lower bound of the proportionality defence.

## References

- `.omo/evidence/task-10-secret-history.log` — full redacted secret-history
  scan transcript (clean) and PII inventory source.
- `docs/adr/0001-global-reference-tables.md` — the RLS exemption pattern; this
  ADR assumes every tenant-scoped table keeps the ADR 0001 / `0000_tenant_spine.sql`
  isolation pattern.
- `docs/architecture/identity-and-access.md`, §10 (session revocation), §12
  (server-side authorization), §13 (RLS ship-blocker), §16–17 (secret /
  environment separation).
- `src/db/schema.ts` — PII-bearing tables (`peserta_didik`,
  `wali_peserta_didik`, `kontak_darurat`, `akses`, `profil_satuan`).
- `src/db/migrations/0000_tenant_spine.sql` — the RLS + least-privilege
  pattern this ADR relies on as its primary control.
- `src/db/migrations/*.sql` — `create extension if not exists pgcrypto;` is
  present in 14 migrations (used for `gen_random_uuid()`; no column-level use).
- Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Pelindungan
  Data Pribadi (UU PDP), Pasal 4–5, 13–17, 34–36.
