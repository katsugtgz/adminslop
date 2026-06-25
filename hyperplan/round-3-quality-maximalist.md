# Round 3 — Quality Maximalist (defend/refine/concede)

**REFINE [contrarian-minimalist]**
Concede Legal page size (Indonesia = A4/F4 only — drop Legal) and Safari/Firefox from v1 matrix: Chromium-only Playwright. Concede byte-hash → pixel-diff at fixed DPI (non-determinism across font/OS versions is real, react-to-print #406). Keep: A4 print matrix still gates ship; golden set persists as versioned fixtures re-validated on every model/prompt bump. Margin hit rejected — KMS + append-only Postgres table is cheap; CM invented the Rp 50k/cost conflict.

**REFINE [arch-logician]**
Concede: field-level encryption is NOT UU PDP Art. 47 mandated (Art. 47 = access control + audit log; RLS + append-only log satisfies it). Concede: routine per-tenant rotation = the perf cliff AL flagged — drop it. Keep: field encryption as defense-in-depth against backup-leak / dump / analytics-clone / read-replica misuse (RLS does NOT protect at-rest copies); key rotation on compromise incident only, never scheduled.

**REFINE [depth-researcher]**
Concede: "canonical CP/TP source (Kemdikbudristek kisi-kisi)" is unbuilt off-the-shelf — DR's search confirms no machine-readable Kemendikbud source exists; PMM/kurikulum.kemdikbud.go.id are login-gated PDFs. Keep: AI generation MUST ground against a versioned, hand-curated seed corpus; that seed (per DR's own §3 methodology) IS the compliance artifact, not a reference to an external API. Concede provenance must snapshot `provider + model + key_id` per AI_Job (AL's hit, correct), not `model_version` alone.

**DEFEND [wildcard-visionary]**
Inspection-day rage is caused by AI latency/failure, NOT the signature gate — the gate is one click, not a wall. Dropping it trades one teacher click for unbounded UU PDP Art. 20 liability (data controller accountable for automated processing of minors' data). Signature = auditable human-in-the-loop; without it, every fabricated Modul Ajar reaching a real classroom is the vendor's processing, not the teacher's. Non-negotiable stands. "Quality that blocks survival gets bypassed" is a UX critique of the gate's implementation, not the gate's existence — solve with one-click UX + offline draft mode, not removal.
