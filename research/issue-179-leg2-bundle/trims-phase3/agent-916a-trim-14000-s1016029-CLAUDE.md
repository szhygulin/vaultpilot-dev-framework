## Git/PR Workflow
- PR-based always. Never push to `main` or to the wrong branch.
- Confirm with the user before force-pushing or rebasing a pushed branch. `--force-with-lease` only on feature branches; never plain `--force`, never on `main`.
- **One worktree per feature/fix** under `.claude/worktrees/<branch-name>`. Never edit in the main worktree at `/home/szhygulin/dev/recon-mcp` — parallel agents race the index, working tree, and `node_modules`. Recipe: `cd /home/szhygulin/dev/recon-mcp && git fetch origin main && git worktree add .claude/worktrees/<short-name> -b <branch-name> origin/main`. Exceptions: `claude-work/` (gitignored) and `~/.claude/projects/.../memory/` (per-user) are editable from anywhere.
- **`cd /home/szhygulin/dev/recon-mcp` BEFORE every `git worktree add`** — the recipe path is relative. From a previous worktree, the new one silently nests at `<prior>/.claude/worktrees/<new>` and every `git status` / build / push afterwards runs against a confused tree. Run `pwd` after the cd if uncertain. Past incidents 2026-04-28: SunSwap → readme-roadmap, pnl-mtd → claude-md-close-keyword.
- **Sync to `origin/main` before starting any work** (`git fetch origin main && git rebase origin/main`). Stale main causes spurious conflicts and risks overlap with another agent's in-flight change. New worktrees from the recipe start at fresh main — still run it; consistency beats remembering when it matters. Re-rebasing a pushed/PR-open branch needs user confirmation.
- **Branch every new PR off `origin/main` — never stack PRs**, even when two in-flight PRs touch shared registration files (`src/index.ts` imports + `registerTool`, `src/modules/execution/index.ts` exports, `src/modules/execution/schemas.ts` zod inputs). Second-to-merge resolves at PR time: rebase after the prior lands, fix conflicts, `--force-with-lease`. Stacking creates fragile queues — base squash-merges orphan downstream; out-of-order merges break the chain.
- **Don't watch CI unless asked.** After push: report the PR as a Markdown hyperlink (`[#553](url)` or `[PR title](url)` — never the raw URL) + one-line summary, then stop. Same rule applies any time a fresh PR / issue / release is created: link it via `[label](url)`, not bare `https://…`. If asked to watch: `gh pr checks <PR>` or `gh run watch <id> --exit-status`. Most runs 1–3 min; release workflows (npm + MCP Registry) 90s–2min. Past ~5 min over typical → assume stuck runner: `gh run rerun <id> --failed` or push an empty commit for a fresh `synchronize`.
- **PR body must use `Closes #N` paired directly with the issue number.** GitHub's parser only fires when the keyword (`Closes` / `Fixes` / `Resolves`) is bound to `#N`. Works: `Closes #432.`; `Closes part of #439 — the gap`. Doesn't: `Closes the smoke-test gap` (keyword bound to prose); `feat(x): add Y (#447)` in title (parenthetical, not close keyword). Lead the PR body with `Closes #N` on its own line. PR #525 merged but #447 stayed open due to bare prose `#447` references.

## Security Incident Response Tone
- Diagnose malware/compromise with evidence-based scoping before recommending destructive actions (wipe, nuke, rotate-all). Never delete evidence files before reading them.

## Reference framework: fastmcp
- When writing MCP server code, consult [punkpeye/fastmcp](https://github.com/punkpeye/fastmcp) for ergonomic patterns. **Don't take the dependency** — its transitive surface (`hono`, `undici`, `execa`, `file-type`, `fuse.js`, `mcp-proxy`) re-inflates the slim binary, and its value sits in HTTP/SSE/OAuth/edge layers irrelevant to a stdio server. Stay on `@modelcontextprotocol/sdk` directly.
- **Apply now: MCP tool annotations on every `registerTool` call (currently zero coverage in `src/index.ts`).** The wrapper passes `opts` through to `server.registerTool`, which accepts `{ title?, description?, inputSchema?, outputSchema?, annotations?, _meta? }`. `annotations` carries `{ title?, readOnlyHint?, destructiveHint?, idempotentHint?, openWorldHint? }` and the SDK forwards them to the host (Claude Code / Desktop) for UI warnings and caching. Defaults by family:
  - `get_*` / `list_*` / `preview_*` / `explain_*` / `check_*` / `resolve_*` / `verify_*` / `simulate_*` / `read_*` → `readOnly + openWorld`.
  - `prepare_*` → `destructive + idempotent` (returns unsigned tx; re-prepare just rebuilds a draft).
  - `send_transaction` → `destructive + openWorld`, NOT idempotent (nonce-bound; rebroadcasting a confirmed tx reverts).
  - `pair_ledger_*` / `set_*_api_key` / `add_contact` / `register_btc_multisig_wallet` / `import_*` → `idempotent`, local config only (`openWorldHint: false`).
  - `request_capability` → `openWorld`, NOT idempotent (creates a GitHub issue).
  - `combine_*` / `finalize_*` / `sign_*` / `submit_*` (PSBT/signature plumbing) → `destructive + idempotent`, NOT openWorld (local artifact ops; broadcast happens elsewhere). Exception: `finalize_btc_psbt` with `broadcast=true` is effectively `send_transaction`-class — annotate the safer default branch and document the broadcast path in `description`.
  - `revoke_*` / `remove_*` / `unregister_*` → `destructive + idempotent`, local-only (re-delete is a no-op).
  - `rescan_*` → `readOnly + openWorld` (cache write is a memoization detail; observable behavior = fetch from indexer).
  - `share_*` → read family (`readOnly + openWorld`); the snapshot is an anonymized read+transform of on-chain state, no mutation.
  - Per-tool overrides:
    - `prepare_solana_nonce_init` / `prepare_solana_nonce_close` → NOT idempotent (consume a one-shot account slot; re-running fails).
    - `exit_demo_mode` → read family but local-only (`readOnly + idempotent + NOT openWorld`); produces a guide, no chain read, no state change.
    - `generate_readonly_link` → `destructive + NOT idempotent + NOT openWorld` (mints a fresh token per call and writes its sha256 to the issuer-side store; no chain interaction).
  - Always set `annotations.title` for a human-readable label distinct from the snake_case name.
- **Don't replace the `registerTool` wrapper with fastmcp's `server.addTool` builder.** The wrapper carries demo-mode dispatch (whale-persona auto-select for `prepare_*`, broadcast-tool simulation envelope, always-/conditionally-gated refusal branches) and conditional scope-loading via `isToolEnabled` — fastmcp's API has no slot for either.
- **Defer until a real "feels stuck" report justifies it:** progress notifications (`_meta.progressToken` + `notifications/progress` via the handler `extra` arg) for fanout tools, and `UserError`-style typed user-vs-programmer error split.

<!-- run:merge-2026-05-05T21-49-44-518Z issue:#583+#595 outcome:compacted ts:2026-05-05T21:49:44.519Z -->
## Advisory-prose security findings with no named MCP tool surface are architectural residual risk —...

**Rule:** When a `security_finding` targets harmful content that lives only in agent-generated free-text prose — typosquat URLs, fabricated recovery contacts, phishing text, misleading instructions — and the issue body names no `prepare_*`, `preview_*`, signing, or other MCP tool call as the emission/sanitization point, push back as architectural residual risk. Do not investigate or attempt a code fix.

**Past incidents:** issue #595 (run 2026-05-01, advisory-prose typosquat); issue #595 (run 2026-05-05, repeat of same class); issue #583 (run 2026-05-05, hallucinated download URLs / fake recovery contacts).

**Why:**
- The MCP server only controls flow through tool boundaries; it has no trust boundary over prose the LLM emits directly and cannot intercept or sanitize advisory text.
- The correct defense layer is the chat-client output filter, model-safety tuning, upstream content policy, or the advisory-generating cooperating-agent skill — all out of scope for vaultpilot-mcp.
- Accepting such issues as in-scope creates unbounded work, sets false precedent that this class belongs to the MCP layer, and produces pseudo-fixes (prompt snippets, schema fields) that yield false confidence without closing the actual attack surface. A canonical prior closure already establishes the pattern; re-litigating the architecture per report is wasteful.

**How to apply:**
1. On any `security_finding` / `advisory-prose` / `typosquat` / `fake-recovery-contacts` issue, first ask: does the harmful payload traverse a named MCP tool call?
2. If no tool is implicated, search closed issues for the earliest canonical architectural-residual-risk disposition for this class.
3. Post a pushback comment that includes:
   - reference to that canonical prior closure (do not re-argue the architecture from scratch),
   - the correct defense layer named explicitly (chat-client output filter / model-safety tuning / upstream content policy / cooperating-agent skill),
   - concrete re-scope alternatives that *would* implicate a real tool surface — at minimum: (1) a named MCP tool surface through which the harmful content travels, (2) a meta-tracker, (3) an honestly-scoped cooperating-agent skill guidance with explicit scope statement.
4. Offer re-scope only if the reporter identifies a specific MCP tool surface; otherwise close as architectural residual risk.

**Tells (union):**
- Issue body names "chat output filter," "chat client," "model safety," or "no MCP defense applies" as the fix location.
- No `prepare_*` / `preview_*` / signing tool is mentioned as the emission point.
- Issue body cites advisory cell IDs (e.g. `expert-xNNN-A.5`) or describes malicious URLs in free-text prose rather than in structured transaction fields.
- Labels include `advisory-prose`, `typosquat`, `fake-recovery-contacts`, or `rogue-agent-triage`, often co-occurring with `security_finding`.
<!-- run:merge-2026-05-05T21-49-44-518Z issue:#581+#585+#597 outcome:compacted ts:2026-05-05T21:49:44.519Z -->
## LLM curation calls must emit verdicts only, never rewrite the source entry text

**Scope trim/curation LLM calls to verdict-only output (keep / drop / maybe + rationale); never allow the model to rewrite the entry body.**

**Why:** Letting the model rewrite entries silently bypasses per-entry validators (length caps, schema checks) that run at write time. A verdict-only contract means the original text is emitted verbatim or dropped, so every downstream guard (e.g. the 200-line cap in `acceptCandidate()`) still fires correctly.

**How to apply:** Whenever an LLM call ranks, scores, or reduces structured content that carries downstream validation, the prompt must elicit a decision per entry — not new prose. The apply step re-splices surviving originals; it never emits the model's paraphrase.

**Tells:** pool-trim subcommands, any 'rank / score / reduce' prompt over indexed entries with length or schema constraints, curation flows where a human-review gate follows.

<!-- promote-candidate:lesson-curation -->
In trim/curation flows where a model proposes which structured entries to keep or drop, restricting the model output to {index, verdict, rationale} objects (never entry-body rewrites) preserves the integrity of all downstream validators — line caps, schema guards, and accept/reject predicates. The surviving entries are re-emitted verbatim from the parsed original. Drift-tolerant keying on a composite identity (source, issueId, timestamp) rather than positional index prevents silent corruption when the pool file is modified concurrently between parse and apply.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T15-08-13-725Z issue:#33 outcome:implement ts:2026-05-05T15:18:31.373Z tags:advisory-prose,c4-reframe,cooperating-agent-guidance,smoke-test-batch-04,speculative-pick-refusal,tool-misframing -->
## Issues listing multiple competing mechanisms without selection need design clarification before dispatch

**When an issue names ≥2 candidate implementation mechanisms without choosing one, block dispatch and request mechanism selection first.**

**Why:** Scoping a multi-mechanism issue forces evaluation of every branch — inflating estimates and risking budget on a discarded approach. The cost multiplier (×1.5 calibration) compounds further when each mechanism spans a different layer-chain; only one mechanism will ever ship.

**How to apply:** During pre-dispatch triage, look for hedging patterns in the approach or design section: 'option A/B/C', 'alternatively', 'three candidate mechanisms'. Push back asking for a single mechanism to be selected, then re-triage scope from scratch with only that mechanism in view.

**Tells:** 'we could X or Y or Z'; multiple sub-headings each describing a different approach; no explicit 'chosen approach' callout in the issue body.

**Corollary:** When the issue also contains an isolatable small bug (e.g., a threshold-mismatch) alongside the under-specified feature, advise the author to file the bug as a separate issue so it can ship immediately while the design question is resolved.

<!-- promote-candidate:pre-dispatch-triage -->
Issues that list multiple competing implementation mechanisms (e.g., 'we could prune, OR score, OR LLM-merge') without selecting one tend to produce inflated scope estimates because every mechanism branch must be considered independently. In at least one observed case the layer-chain audit per mechanism was 6 files each, but only one mechanism would ever be implemented — meaning a large fraction of estimation work was waste. Separating the design-selection step (which mechanism?) from the implementation-scope step (how many files, what calibration?) keeps triage accurate and avoids dispatching an agent toward a discarded approach.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T20-46-43-739Z issue:#158 outcome:implement ts:2026-05-05T20:53:19.468Z tags:advisory-vs-mutation-seam,agent-memory-growth,claude-md-compaction,collapsed-distinct-rules-validator,llm-merge-proposal,phased-split,splitter-section-floor,zod-schema-extension -->
