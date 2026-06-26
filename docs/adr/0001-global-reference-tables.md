# ADR 0001: Global Reference Tables Exemption

## Status

Accepted

## Date

2026-06-26

## Context

EduAdmin Pro Premium enforces tenant isolation through Row-Level Security (RLS) on every tenant-scoped table. Section 13 of `docs/architecture/identity-and-access.md` states this in one line: "cross-tenant data leakage is a ship-blocker." Section 2 reinforces it: every tenant-scoped table carries a `tenant_id` column plus an RLS policy. Migration `0000_tenant_spine.sql` codifies the pattern the rest of the schema follows:

- a `tenant_id` column defaulting to `current_setting('app.tenant_id', true)`, sourced from the authenticated session and never from a client value;
- `ENABLE` and `FORCE ROW LEVEL SECURITY`, so policies apply even to the table owner;
- a policy of `using (tenant_id = current_setting('app.tenant_id', true))` paired with the same `WITH CHECK`, which rejects any row whose tenant does not match the active membership;
- `GRANT SELECT, INSERT, UPDATE, DELETE` to the non-superuser `app_user` role.

Issue #9 introduces Kurikulum reference data: the Kurikulum Merdeka national curriculum, modeled as `kurikulum`, `mata_pelajaran`, `fase`, `capaian_pembelajaran`, `tujuan_pembelajaran`, and `alur_tujuan_pembelajaran`. Per `CONTEXT.md`, a **Kurikulum** is "the official learning framework used by a Satuan Pendidikan," and **Capaian Pembelajaran**, **Tujuan Pembelajaran**, and **Alur Tujuan Pembelajaran** are its official, derived learning statements. This data is national and universal. It is identical for every Satuan Pendidikan, defined by the Indonesian Ministry of Education, and no single school owns or authors it.

Applying the tenant-scoping pattern to this data would be wrong on two counts:

1. **Wasteful.** Every tenant would need its own copy of the national curriculum, duplicating thousands of rows that never differ.
2. **Semantically incorrect.** A school does not own the national curriculum. Treating it as tenant-scoped would imply that each Satuan Pendidikan authors its own Capaian Pembelajaran, which contradicts the domain glossary.

The tension is real: the RLS rule exists to prevent cross-tenant data leakage, which is a ship-blocker. Any exemption must be narrow, justified, and recorded.

## Decision

Introduce a category of **global reference tables** that are exempt from the tenant-scoping and RLS requirements. A table belongs to this category only when its data is universal, read-only from the application's perspective, and authored through reviewed migrations.

The rules for any global reference table:

1. **No `tenant_id` column.** The data is not partitioned by Satuan Pendidikan.
2. **No RLS.** No `ENABLE ROW LEVEL SECURITY`, no `FORCE`, no policy. The isolation model does not apply because there is nothing to isolate per tenant.
3. **`GRANT SELECT ONLY ON ... TO app_user`.** The application role can read these tables but never write them. This is the inverse of the tenant-scoped grant, which allows `INSERT, UPDATE, DELETE`.
4. **Writes only via the migrator role (superuser), applied through migrations.** No runtime code path can mutate reference data.
5. **Provenance columns** (`sumber`, `sumber_url`, `tanggal_ambil`, `status_persetujuan`) on every row, satisfying issue #9's acceptance criteria for versioned, provenance-tracked data and for review-required status until a human approves.

The first tables in this category, scheduled for migration `0004`, are: `kurikulum`, `mata_pelajaran`, `fase`, `capaian_pembelajaran`, `tujuan_pembelajaran`, and `alur_tujuan_pembelajaran`.

Future global reference tables may be added under this ADR only if they meet the same criteria: universal, application-read-only, migration-authored. A new ADR is not required for each addition, but the migration that introduces such a table must reference this ADR in its comments.

## Consequences

**Positive.**

- No data duplication across tenants. Every Satuan Pendidikan reads the same national curriculum rows.
- Correct domain semantics. The national curriculum is shared, not school-owned.
- Read-only access from the application prevents accidental tenant-level corruption. Even a bug in app code cannot insert or update reference data, because `app_user` lacks the grants.
- Seed management is centralized in migrations, reviewed like any other schema change.

**Negative.**

- A class of tables now exists that bypasses RLS. Future contributors must understand the distinction between tenant-scoped and global reference tables. This ADR is the formal record of that distinction.
- Tenant-level adoption, meaning "which Satuan Pendidikan uses which Kurikulum configuration," is not solved here. It is deferred to a future issue and will require a tenant-scoped table that references these global tables via foreign key. That table will follow the standard RLS pattern from `0000_tenant_spine.sql`.

**Mitigation for the RLS exemption.**

- Reference data is read-only from the application's perspective (`GRANT SELECT ONLY`).
- All writes go through reviewed migrations, executed by the migrator role.
- Provenance and review-status columns provide an audit trail for the reference data itself, independent of the tenant-scoped `catatan_audit` table.
- The global, RLS-exempt distinction is documented here and must be referenced in the migration comments of every table that relies on it.

## References

- `docs/architecture/identity-and-access.md`, section 13 (RLS ship-blocker rule) and section 2 (tenant-scoped table pattern).
- `CONTEXT.md`, entries for Kurikulum, Capaian Pembelajaran, Tujuan Pembelajaran, Alur Tujuan Pembelajaran, Mata Pelajaran, and Fase.
- `src/db/migrations/0000_tenant_spine.sql` (the RLS pattern this ADR exempts).
- Issue #9 (Kurikulum CP/TP/ATP seed browser).
