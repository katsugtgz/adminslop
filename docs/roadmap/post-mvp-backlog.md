# Post-MVP ADR-Gated Backlog — Task 21 (Wave 4 foundation)

**Generated:** 2026-06-27
**Operator:** Sisyphus-Junior (read-only synthesis; only `docs/roadmap/post-mvp-backlog.md`, `.omo/evidence/task-21-*.log`, and the learnings notepad were written)
**Scope:** Converts the 25-feature post-MVP union (T5) plus the T18 source-parity risky-feature decisions into a single ADR-gated backlog with explicit Owner / Default-if-silent / ADR-required per item. Ranks Wave 5 candidates.
**Method:** Read `postmvp.md`, `docs/POST-MVP.md`, T5 `postmvp-canonical.md`, T18 `source-parity.md`, T20 `mvp-ship-gates.md`, ADRs 0001–0004, the 947-line `learnings.md`. No governance doc, ADR, or `src/` file was modified.
**Inputs:** T5 (25-feature union, 7-ADR grouping), T18 (28-module parity, BYO Gemini rejected, Face/biometric deferred), T20 (8 yellow owner-checkpoint gates, ADR 0002/0003/0004 Deferred), ADRs 0001–0004 (house style + status roll-up).

---

## 1. Headline

**Backlog size: 26 items. 17 ADR-required (Y), 9 defer (no ADR — explicitly killed, out-of-scope, business-review, or already policy-deferred), 0 build-now.** Every ADR-required item has `Owner: product-owner` (or more specific owner where the plan/ADRs specify) and `Default-if-silent: defer`. **Zero Wave 5 candidates accepted** — the safe default, because every Wave 5-eligible item depends on at least one Deferred ADR (0002/0003/0004) or on T22 (consent) / T23 (AI/RAG), both of which are themselves owner-gated and unresolved.

This is the post-MVP **ADR backlog**, not a build backlog. Every Y row is a decision waiting on an owner signal, not a ticket waiting on an engineer.

---

## 2. Owner assignment policy

Per the task MUST-DO: where `hyperplan/plan.md` / `AGENTS.md` / the ADRs do not specify an owner, the default is `product-owner` with `default-if-silent: defer`. **No build starts without an owner signal.** This is the safe default — silence never ships a risky feature.

Specific owners are assigned where prior tasks narrowed them:

| Owner label | Applies to | Source |
|---|---|---|
| `business-owner` | GTM shape, monetization, Dapodik retention duty (business review precedes any technical ADR) | T5 §4 ("3 owner business decisions that gate technical ADRs") |
| `legal-owner` | Digital signature (UU ITE / BSrE), biometric / face scan (UU PDP Pasal 5(2)), cross-tenant oversight, external comms consent | T18 §4 (risky features), T10 ADR 0002 (regulated-category triggers), T19 ADR 0004 Decision 4 |
| `product-owner` | Everything else (default) | Task MUST-DO |
| `product-owner + security` | WorkOS enterprise features, hard session revocation, advanced analytics / ML governance | AGENTS.md §"Identity and access", T19 ADR 0004 Decision 3 |
| `product-owner + eng` | Real-time collab infra, offline sensitive actions, curriculum AI seeding, RAG | T16 offline read-side defer, T13 ADR 0003 provider decision |

**Every row's `Default-if-silent` is `defer`.** There are no exceptions. If the owner is silent, the item does not get built.

---

## 3. Backlog table

Columns (matching Task 21 MUST-DO column spec):

- **#** — stable ID (inherited from T5 §4 feature walk; #26 added for the T18 biometric deferral).
- **Item** — short name.
- **Description** — one line.
- **Owner** — who must signal (default `product-owner`).
- **Trigger** — when to revisit (verbatim from `postmvp.md` "Trigger revisit" where present).
- **Default-if-silent** — the conservative action if the owner is silent. **Always `defer`** in this backlog.
- **ADR-required** — `Y` = a new post-MVP ADR (next free number: **0005**) must be drafted and accepted before any build. `N` = no ADR (item is killed, out-of-scope, or a pure business review that gates — but is not — a technical ADR).
- **Risk** — `Low` / `Medium` / `High` / `Critical`. `Critical` = regulated-category data transfer (children's data, biometrics, legal signature, cross-tenant).
- **Effort** — `S` / `M` / `L` / `XL`. **Refers to the eventual build effort, not the ADR drafting effort.** The ADR itself is always `S` (a decisions document).
- **Dependency** — which ADR or prior item blocks this. ADR numbers in brackets are *projected* (not yet drafted); ADR 0005+ numbering follows the §5 grouping.
- **Wave-5** — `Y` / `N`. **All `N` in this backlog** (see §4).
- **Rationale** — one line.

| # | Item | Description | Owner | Trigger | Default-if-silent | ADR-required | Risk | Effort | Dependency | Wave-5 | Rationale |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | GTM final shape | School-first + free parent layer; Dinas/Kecamatan license decision | business-owner | Post-MVP business review | defer | N | Medium | M | none (gates #22 Instansi Pengelola ADR) | N | Business review, not a technical ADR. Gates the cross-tenant oversight ADR. |
| 2 | Dapodik retention duty | Legal retention obligation for student/PTK records | legal-owner | Compliance review post-MVP | defer | Y | High | M | ADR 0002 Accepted (PII posture) | N | Legal/compliance-sensitive (UU PDP retention). ADR required before any retention rule change. |
| 3 | Monetization final numbers | Pricing + willingness-to-pay + school segmentation | business-owner | Business review | defer | N | Low | S | none (gates #25 WorkOS enterprise adoption) | N | Pure business decision. Does not touch regulated data. |
| 4 | Starter scaffold alternatif | Disposable starter if velocity stalls | product-owner + eng | Only if velocity stall is concrete | defer | N | Low | S | none | N | Explicitly killed (build-from-scratch chosen for security posture). Re-open only on evidence of stall. |
| 5 | k-anonymity threshold | Re-identification threshold for kecamatan leaderboard | product-owner + security | Before any analytics/leaderboard goes public | defer | Y | High | M | ADR [0006] k-anon (this item IS the ADR) | N | Privacy decision for minor-identifying analytics. Blocks #6. |
| 6 | Gamification leaderboards | Kecamatan rankings with anti-shaming design | product-owner | After k-anon resolved | defer | Y | High | L | #5 (k-anon ADR Accepted) | N | Gated by #5. Anti-shaming design is a separate product decision. |
| 7 | Parent WhatsApp channel | External channel to principals/parents | legal-owner + product-owner | After consent infra + channel preferences available | defer | Y | Critical | L | ADR [0005] external-consent (T22); #11 Wali access model | N | External comms + UU PDP consent + withdrawal + minimization + audit + anti-spam. Critical: children's data path. |
| 8 | WhatsApp Audit Pack | Branded weekly cards via WhatsApp | legal-owner + product-owner | With #7 Parent WhatsApp channel | defer | Y | Critical | M | #7 (Parent WhatsApp channel) | N | Same consent regime as #7. Cannot ship standalone. |
| 9 | Email notification automation | SMTP relayer for reports/announcements/absence | legal-owner + product-owner | After in-app notification pattern stabilises | defer | Y | High | M | ADR [0005] external-consent (T22) | N | Same consent/audit/anti-spam regime as WhatsApp (UU PDP Pemberitahuan + Persetujuan). |
| 10 | Parent-facing routine notifications | Routine alerts to Wali Peserta Didik | legal-owner + product-owner | After Wali consent + access model mature | defer | Y | Critical | M | #11 (Wali access model); ADR [0005] external-consent | N | Wali are not MVP Pengguna. Needs access + consent + audit + communication language decisions. |
| 11 | Wali / parent login portal | Separate auth surface for parents/guardians | product-owner + security | After Wali consent + access + audit + minimization mature | defer | Y | Critical | XL | ADR [0007] wali-access (this item IS the ADR); ADR 0004 role vocab extension | N | Non-PTK auth role + data minimization for Wali Peserta Didik. Trips ADR 0002 trigger (new data category) + ADR 0004 (new RoleSlug). |
| 12 | EduExam / CBT | Anti-cheat online exam system | product-owner | Separate project (not this app) | defer | N | Medium | XL | none (separate codebase) | N | Separate project per `postmvp.md` L29. Not near-term scope for this app. |
| 13 | Lembar Jawaban config | Print-config form for exam answer sheets | product-owner | After Bank Soal/Penilaian stabilises | defer | N | Low | S | #12 (EduExam scope decision) | N | Config-only, low value. Coupled to deferred CBT scope. |
| 14 | Cover Administrasi | Administrative cover-page generator | product-owner | Only if concrete cover-page need appears | defer | N | Low | S | none | N | Explicitly killed. Build inline if ever needed. |
| 15 | Panduan Kurikulum | Static curriculum PDFs/docs | product-owner | If static-asset hosting need confirmed | defer | N | Low | S | none | N | Static docs, not a core product flow. Host as static assets if needed. |
| 16 | Deterministic AI-assisted curriculum seeding | AI extraction of CP/TP/ATP from source snapshots | product-owner + eng | After schema seed + review workflow stabilises | defer | Y | High | L | ADR 0003 Accepted (real provider); ADR [0008] ai-provenance (T23) | N | AI provenance + source snapshots + repeatable prompts/parsers + golden diffs + human approval. Blocks on real AI provider (ADR 0003 Deferred). |
| 17 | pgvector RAG over curriculum | Retrieval over seed corpus | product-owner + eng | If seed-corpus retrieval proves insufficient | defer | Y | High | L | ADR 0003 Accepted; ADR [0008] ai-provenance (T23); pgvector install (0 refs in schema.ts today) | N | AI/RAG decision. pgvector has 0 references in `src/db/schema.ts` (T1/T4). Must decide "adopt pgvector?" AND "retrieval safety regime?". |
| 18 | Bantuan AI / RAG-based product help | Curated help corpus + retrieval | product-owner + eng | After core flows + guidance copy stabilise | defer | Y | High | L | ADR 0003 Accepted; ADR [0008] ai-provenance (T23) | N | AI/RAG decision. Needs curated help corpus + retrieval safety + answer evaluation. |
| 19 | Free-form / WYSIWYG print template editor | Drag-drop visual E-Raport layout editor | product-owner + eng | After print format stabilises + pixel-diff QA lands | defer | N | Medium | L | none (technology selection ADR may be needed at build time) | N | Heavy rendering dependency (Canvas/HTML-to-PDF) not chosen. Gate on print format stability. Tech-selection ADR may be needed; backlog marks N until then. |
| 20 | Legal digital signature workflow | BSrE / sertifikat elektronik for E-Raport signing | legal-owner + product-owner | After legal need, audit, certificate, approval workflow are clear | defer | Y | Critical | L | ADR [0009] legal-signature (this item IS the ADR); UU ITE + PerMenkominfo + KTP-e dependency | N | UU ITE + PerMenkominfo + BSrE integration. Legal/compliance-sensitive. Tanda Tangan MVP = print element only. |
| 21 | Full offline product / offline sensitive actions | Offline-capable sensitive writes (E-Raport, Koreksi Data, Verifikasi Dokumen AI) | product-owner + eng + security | After conflict rules + offline authz + offline audit mature | defer | Y | High | XL | ADR [0010] offline-sensitive (this item IS the ADR); T16 read-side offline cache (deferred SW) | N | Offline authorization for sensitive writes. T16 hardened write-side block; this item opens it back up under a new ADR. |
| 22 | Dashboard lintas Satuan Pendidikan / Instansi Pengelola | Cross-tenant aggregation (yayasan oversight) | product-owner + security | After multi-school purchase/oversight need validated | defer | Y | Critical | XL | ADR 0004 Decision 4 (Instansi Pengelola — post-MVP gate); ADR [0011] cross-tenant-oversight (this item IS the ADR); #1 GTM | N | Tenancy expansion (org-of-orgs). New `lintas_satuan:baca` permission + cross-yayasan RLS. T19 Decision 4 explicitly gates this. Cross-tenant = ship-blocker category. |
| 23 | Kolaborasi real-time (CRDT / WebSocket) | Parallel edit by multiple PTK | product-owner + eng | After conflict rules + entity-lock model designed | defer | Y | Medium | XL | ADR [0012] realtime-collab (this item IS the ADR) | N | New infra (WebSocket/SSE) + conflict resolution model + entity-lock design. |
| 24 | Analitik lanjutan (ML / pgvector predictive) | Predictive dashboards (at-risk students, clustering) | product-owner + security | After ML governance + training pipeline decided | defer | Y | Critical | XL | ADR 0003 Accepted; ADR [0008] ai-provenance (T23); ML governance sub-ADR; pgvector install | N | ML governance for Peserta Didik data (minors, HIPAA-equivalent). Distinct from #17 (predictive vs retrieval). Critical: child data in ML training. |
| 25 | WorkOS enterprise features | SSO, Directory Sync/SCIM, MFA enforcement, Admin Portal, Widgets, FGA, Vault, Radar, Custom Domains | product-owner + security | When enterprise tier customer requires | defer | N | Medium | L | per-feature ADR at adoption time | N | Already deferred by `AGENTS.md` §"Identity and access". Marked N at backlog level because the deferral is already policy; each feature needs its own ADR **at adoption time**, not now. |
| 26 | Biometric / face scan (attendance + WAJAH column) | Face-based attendance + student face column | legal-owner + product-owner + security | Only after biometrics ADR + DPIA + consent flow | defer | Y | Critical | L | ADR [0013] biometrics (this item IS the ADR); ADR 0002 trigger (regulated-category column); UU PDP Pasal 5(2) | N | T18 §4b explicit deferral. Face data = biometric data of minors. Adding WAJAH column trips ADR 0002 regulated-category trigger. Most likely feature to be re-requested. |

**Status distribution (this backlog):**

| Status | Count | Items |
|---|---|---|
| `ADR-required (Y)` | 17 | #2, #5, #6, #7, #8, #9, #10, #11, #16, #17, #18, #20, #21, #22, #23, #24, #26 |
| `defer (N — killed / out-of-scope / business-review / already policy-deferred)` | 9 | #1 (business review), #3 (business review), #4 (killed), #12 (separate project), #13 (low value), #14 (killed), #15 (static docs), #19 (gated, no ADR until tech selection), #25 (already-deferred policy) |
| `build-now` | 0 | — |

**Zero `build-now`** is correct and load-bearing: every post-MVP feature is in post-MVP because it needs an owner decision or is killed. This is the same property T5 §4 established for the 25-feature union; this backlog preserves it.

---

## 4. Wave 5 ranking

**Wave 5 candidates accepted: 0.**

**Default posture:** every Wave 5-eligible item is yellow (owner decision outstanding) → defer. Per the task MUST-DO, no Wave 5 candidate is auto-accepted without an owner signal. No owner signal has been recorded for any post-MVP item as of 2026-06-27.

### 4a. Why zero — the dependency chain

The plan's three suggested Wave 5 candidates (per Task 21 MUST-DO) and why each is blocked:

| Suggested candidate | Why blocked (this Wave 5 cycle) | Unblocks when |
|---|---|---|
| **T22 consent/email foundation** | The consent ADR [0005] itself is the deliverable of T22. T22 is owner-gated and has not run. Without the consent ADR Accepted, items #7–#10 (the external-comms family) cannot start. Building a "foundation" before the ADR is Accepted inverts the gate. | Owner signals T22 start; ADR [0005] reaches Accepted status. |
| **T23 RAG/help (curriculum + help corpus)** | Depends on ADR 0003 (MVP AI strategy) moving from Deferred to Accepted. ADR 0003 is Deferred (T13, T20 §6). The real-provider decision (provider + key posture + DPA + UU PDP transfer terms) is an owner checkpoint that has not fired. Mock is the only generation path today. | Owner ratifies ADR 0003 (Option C); real provider chosen; DPA signed. |
| **Curriculum seeding** | Depends on BOTH T22 (consent for any source-text processing) AND T23 (AI provider). Both blocked above. Additionally requires schema seed stabilisation + review workflow (per `postmvp.md` L33). | ADR 0003 Accepted + ADR [0008] ai-provenance Accepted + seed workflow stable. |

### 4b. The safe default

**Zero Wave 5 candidates accepted. Document this explicitly.**

- The 8 yellow gates from T20 (E2E tracer, PII/secrets ADR 0002, AI strategy ADR 0003, offline scope, console/Bahasa/mobile, GH issues hygiene, branch hygiene, role/session ADR 0004) are the critical-path owner checkpoints. Post-MVP ADR drafting cannot responsibly start before the MVP ship gates close.
- ADR 0002 (PII), 0003 (AI), 0004 (role/session) are all `Deferred`. These three ADRs are inputs to multiple post-MVP items (#16, #17, #18, #22, #24, #26 at minimum). Drafting post-MVP ADRs that depend on Deferred MVP ADRs inherits the deferral.
- **The owner must explicitly accept a Wave 5 candidate before T24–T26 build runs.** This backlog records no such acceptance.

### 4c. What would unblock Wave 5 (owner actions, in dependency order)

1. **Ratify ADR 0002 / 0003 / 0004** (the 3 hard MVP ship gates from T20 §7). This is the precondition for any post-MVP ADR that touches PII, AI, or auth.
2. **Signal T22 start** (consent regime ADR [0005]). Unblocks #7–#10.
3. **Signal T23 start** (AI provenance/RAG ADR [0008]). Requires ADR 0003 Accepted first. Unblocks #16, #17, #18, #24.
4. **Promote the 7 `needs-owner` T18 modules** (schedule/calendar/ekskul/teacher-productivity) to `postmvp.md` OR confirm out-of-scope. Not blocking Wave 5 but cleans up the input set.

Until at least step 1 lands, **Wave 5 stays empty**.

---

## 5. ADR grouping (input for ADR drafting, NOT ADRs themselves)

Inherited from T5 §4 + this backlog's additions. Next free ADR number is **0005**.

| Projected ADR | Covers items | Shared dependency | Status |
|---|---|---|---|
| **[0005] External channel consent regime** | #7, #8, #9, #10 (partly #11) | consent + withdrawal + Catatan Audit + anti-spam + Preferensi Notifikasi + recipient authorization + UU PDP Pemberitahuan/Persetujuan | not drafted; gates T22 |
| **[0006] k-anonymity & anti-shaming for leaderboards** | #5, #6 | k-anon threshold + re-identification risk for minor-identifying analytics | not drafted |
| **[0007] Parent/Wali access model** | #11 (partly #10) | non-PTK auth role + data minimization + consent model + ADR 0004 role vocab extension | not drafted |
| **[0008] AI provenance & retrieval safety** | #16, #17, #18, #24 | source snapshots + repeatable prompts/parsers + schema validation + golden diffs + human approval + retrieval safety + ML governance for minors + pgvector adoption decision | not drafted; gates T23; requires ADR 0003 Accepted |
| **[0009] Legal signature workflow** | #20 | UU ITE / PerMenkominfo / BSrE + certificate authority + approval workflow + audit | not drafted |
| **[0010] Offline sensitive actions** | #21 | offline authorization + conflict rules + audit + T16 read-side offline-cache dependency | not drafted |
| **[0011] Multi-tenant oversight expansion (Instansi Pengelola)** | #22 | new `lintas_satuan:baca` permission + cross-yayasan RLS + org-of-orgs model | not drafted; T19 ADR 0004 Decision 4 explicitly gates this; requires #1 GTM |
| **[0012] Real-time collaboration infra** | #23 | WebSocket/SSE + conflict resolution + entity-lock | not drafted |
| **[0013] Biometrics (face scan + WAJAH column)** | #26 | UU PDP Pasal 5(2) + DPIA + consent from Wali + purpose limitation + retention + secure storage | not drafted; T18 §4b explicit deferral; trips ADR 0002 trigger |

**Plus 3 owner business decisions that gate technical ADRs (not ADRs themselves):**

| Business decision | Gates |
|---|---|
| #1 GTM final shape | [0011] Instansi Pengelola |
| #2 Dapodik retention duty (compliance review) | #2 retention ADR (compliance-sensitive) |
| #3 Monetization final numbers | #25 WorkOS enterprise adoption sequencing |

---

## 6. Risk gates — explicit ADR-required callouts

Per Task 21 MUST-DO, the following risk categories are **explicitly ADR-gated**. Each has `ADR-required: Y` in the §3 table and `Default-if-silent: defer`. None may proceed to build without the ADR reaching Accepted status AND an owner signal.

| Risk category | Items | Why ADR-required | Reg hook |
|---|---|---|---|
| **Parent portal / Wali access** | #10, #11 | Non-PTK auth role + consent model + data minimization | UU PDP (consent, access); ADR 0004 role extension |
| **WhatsApp / external comms** | #7, #8, #9 | External channel + consent + withdrawal + minimization + audit + anti-spam | UU PDP Pemberitahuan + Persetujuan; provider terms |
| **Cross-school / Instansi Pengelola** | #22 | Tenant isolation expansion; new permission layer; cross-yayasan RLS | T19 ADR 0004 Decision 4 (post-MVP gate); ship-blocker category (identity doc §13) |
| **Digital signature** | #20 | Legal signing (not print element); certificate authority | UU ITE; PerMenkominfo Tanda Tangan Elektronik; BSrE |
| **EduExam / CBT** | #12 | Separate project (not this app) | Out-of-scope at app level; ADR may be needed at project level |
| **WorkOS enterprise features** | #25 | SSO, MFA, Admin Portal, Widgets, FGA, Vault, Radar, Directory Sync, Custom Domains | Per-feature ADR at adoption time (already policy-deferred by AGENTS.md) |
| **Biometric / face scan** | #26 | Biometric data of minors; DPIA required | UU PDP Pasal 5(2) (special protection for children's data including biometric); ADR 0002 trigger |
| **Advanced analytics / ML** | #24 | ML governance for child data; training pipeline; model selection | UU PDP + ML governance; HIPAA-equivalent for Peserta Didik (minors) |

---

## 7. No-build assertion

This task drafted one new doc (`docs/roadmap/post-mvp-backlog.md`) and two evidence logs (`.omo/evidence/task-21-backlog-defaults.log`, `.omo/evidence/task-21-risk-gates.log`), and appended one entry to the learnings notepad. **Zero** `src/` files modified. **Zero** existing ADRs modified. **Zero** governance docs (`postmvp.md`, `docs/POST-MVP.md`, `roadmap.md`, `AGENTS.md`) modified. **Zero** Wave 5 candidates accepted. Evidence: `.omo/evidence/task-21-backlog-defaults.log`, `.omo/evidence/task-21-risk-gates.log`.

---

## 8. References

- T5: `.omo/evidence/reconciliation/postmvp-canonical.md` (25-feature union, 7-ADR grouping)
- T18: `.omo/evidence/reconciliation/source-parity.md` (28-module parity, BYO Gemini rejected, Face/biometric deferred)
- T20: `.omo/evidence/release/mvp-ship-gates.md` (8 yellow owner-checkpoint gates; 3 hard production go-live ADRs)
- ADRs: `docs/adr/0001-global-reference-tables.md` (Accepted), `docs/adr/0002-pii-at-rest-strategy.md` (Deferred, T10), `docs/adr/0003-mvp-ai-strategy.md` (Deferred, T13), `docs/adr/0004-workos-role-session-strategy.md` (Deferred overall, Decisions 1&2 Accepted, T19)
- Source scope: `postmvp.md` (governance-canonical), `docs/POST-MVP.md` (Help-Center-canonical)
- Learnings: `.omo/notepads/post-mvp-roadmap-hyperplan/learnings.md` (T5, T13, T18, T19, T20 critical)
