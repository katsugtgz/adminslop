# Round 3 — Architecture Logician adjudicates

## REFINE contrarian-minimalist

On: *"payment-processing architecture for 'call Gemini, render docx.'"* **Concede:** the terminal-state taxonomy (`REJECTED` vs `EXPIRED` vs `FAILED-with-reason`) plus dead-letter queue + alert is v2 ceremony I borrowed from payments plumbing. v1 collapses to three terminals: `COMPLETED`, `FAILED`, `CANCELLED`. **Keep:** idempotency is load-bearing, not optional — Indonesian school wifi + a teacher double-clicking "Generate Modul Ajar" = duplicate token spend against the school's BYO budget. Same logic keeps bounded retry on provider 5xx, cooperative cancel, and per-school cost tracking. Those survive because the constraints (double-clicks, flaky net, real key budget) are real, not because I like state machines.

## REFINE quality-maximalist

On: *"§6 'question for the lead' is theatre — §3 already commits to SchoolMembership M:N."* **Concede:** correct, and fairly caught. My §3 graph drew the M:N edge; posing User↔School cardinality as "open" was faux humility. Treat M:N as decided — I'll cite Guru Berbagi + MGMP cross-assignments as evidence rather than ask the lead. **Keep & correct:** the SET LOCAL primitive stands. QM conflated session-level `SET` with transaction-scoped `SET LOCAL` / `set_config(name, val, true)`. The latter is *designed* for PgBouncer transaction pooling — it auto-resets at COMMIT. The prepared-statement footgun is real; SET LOCAL doesn't trip it.

## REFINE wildcard-visionary

On: *"`SET LOCAL app.tenant_id` does nothing for two teachers editing nilai offline, then syncing contradictory semester data after finalization lock."* **Concede:** real miss, and it's in my lane (consistency boundaries), not yours. My finalization lock assumes online transactional writes; offline-sync-then-conflict post-lock is a failure mode the lock alone can't resolve. Revised: the lock needs a versioned-write + reject-on-stale-semester protocol, not a bare DB flag. **Keep:** "no school is GB-scale" refers to single-tenant *working set* — one romel × one semester's hot rows are KB-MB. Blobs (face images, PDFs) live in object storage; partitioning handles growth. Different axis than aggregate disk.

## REFINE depth-researcher

On: *"Per-user concurrency = 1... 40-teacher school with one concurrent slot = 39 blocked teachers."* **Concede:** arithmetic error, full stop. 40 teachers × 30-60s gen = the 40th waits 20-40 min — unacceptable. Revised: throttle on the actual scarce resource (per-school *token budget*), allow N concurrent jobs (≈4-8), queue the tail. **Keep & correct:** SET LOCAL is *not* "incompatible with the de-facto stack" — I explicitly rejected the Supabase/PostgREST client-JWT default in §2 as a tenant-escape vector. DR's incompatibility is circular: it's incompatible with the very default I argued against. Server-minted session + SET LOCAL is the deliberate replacement, not an oversight.

---

Stopping per Round 3 rules. Awaiting distillation / handoff.
