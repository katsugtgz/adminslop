# Round 2 — Architecture Logician cross-attacks

### vs Contrarian Minimalist

**Fatal flaw.** "11 AI modules = 1 feature wearing 11 masks" is false at the data layer. Cover Administrasi (17) takes NO AI — pure template render. Bank Soal (27) keys on `komposisi + taksonomi Bloom + jumlah opsi`. Modul Ajar (21) keys on `dimensi profil lulusan + CP + TP`. Forcing these into one "Generator Dokumen" produces either a `Document.params JSONB` god-table (no index, no per-type validation) OR you re-split at storage — the "1 codebase" win is illusory; the 11-way branch just relocates into the renderer and the print matrix.

**Unsupported.** "Ship 11 docs for the price of 1." Reality: 11 Zod schemas, 11 golden sets, 11 print matrices (QM §3, §4). Price is 11× validation, 1× plumbing.

**Missed.** Folding Kalender Akademik (06) into Jadwal (05) couples a write-heavy schedule editor to the `SchoolHoliday`/`SchoolEvent` registry that CM's own MVP #3 (Absensi) must read to distinguish alfa from holiday. Different consistency boundaries, different writers.

**Concession.** Modulith over microservices — correct at this data volume.

### vs Quality Maximalist

**Fatal flaw.** "Field-level encryption... keys per-tenant, rotatable" adds near-zero defense over RLS but real cost. If the app decrypts to render Profil Saya (it must), the key is reachable by the same request context RLS would already block. Per-tenant rotation = full re-encrypt scan of every NIP row per tenant — the exact perf cliff I flagged in §1. UU PDP Art. 47 mandates access control + audit, NOT field encryption; RLS + append-only audit log already satisfies it.

**Unsupported.** "Golden set: 200+ (jenjang × mapel × fase × CP) tuples." The combinatorial space is jenjang(5) × mapel(9) × fase(6) × CP(many) — 200 is <1% coverage with no rationale for why 200 counts as "golden."

**Missed.** BYO Gemini key rotation (Pengaturan Sekolah §02) breaks QM's "immutable provenance record (prompt hash + model version)." Storing `model_version` is insufficient; must snapshot `provider + model + key_id` per AI_Job or provenance points at a model that no longer exists.

**Concession.** "Append-only audit log of every read/write of PII fields" — correct, the one true non-negotiable.

### vs Wildcard Visionary

**Fatal flaw.** "Parent as real admin... QR attendance → instant WIB timestamp to parent WA" inverts the tenant boundary catastrophically. Parents are NOT members of the school tenant in any defensible data model — they are external principals. Pushing a minor's attendance (name + status + timestamp + inferred location) to a WhatsApp number that may be shared, borrowed, swapped SIM, or belong to an abusive co-parent is a UU PDP Art. 16 breach. "Parent-safe cards" is asserted, never consent-modeled; no number-verification flow, no right-to-withdraw registry.

**Unsupported.** "Invert: Dinas/Kecamatan license." Zero cited procurement precedent. Indonesian Dinas procurement is per-kabupaten, budget-cyclic, 12–18 month cycles. Asserting B2G monetization without one named case is fiction.

**Missed.** "Offline-first PWA" + "real-time QR attendance" are mutually hostile invariants. Offline writes create attendance conflicts; merge needs CRDT or last-write-wins — both corrupt the immutable `Attendance` aggregate and the finalization lock (AL §3, §5). WV names the break point, never resolves the conflict semantics.

**Concession.** "Internet is not a dependency" — operationally true for rural Indonesian schools; the product must degrade through 2G/3G.

### vs Depth Researcher

**Fatal flaw.** "Supabase RLS = multi-tenant by default... aligned with AL's RLS+SET LOCAL primitive." Category error. Supabase RLS keys on `auth.uid()` from the **client JWT** — the exact session model I rejected in §2. A leaked/long-lived JWT = tenant escape with no revocation. "Aligned with my primitive" is false; Supabase's default flow violates it. Server-side session minting is possible but requires a custom Edge Function mediator that DR never costed or even mentioned.

**Unsupported.** "Supastarter ($299)... Multi-tenant via RLS. AI-ready." Citing a paid kit's marketing copy as architectural proof. No audit of HOW it isolates (membership-join = my perf cliff; single-column = different migration story), no test of whether it survives BYO per-school Gemini keys (Pengaturan §02).

**Missed.** Drizzle's query builder obscures which RLS policy fired on a generated query — making my §1 Failure-A CI linter (every `CREATE TABLE` needs a sibling policy) effectively untestable through Drizzle's abstraction. DR needed a raw-SQL migration/policy layer separate from the app ORM; didn't specify one.

**Concession.** Vercel AI SDK `streamObject()` + Zod schema — correct tool. The provider-abstraction layer genuinely mitigates the BYO-key swap (AL §4). DR got the AI layer right where they got the data layer wrong.
