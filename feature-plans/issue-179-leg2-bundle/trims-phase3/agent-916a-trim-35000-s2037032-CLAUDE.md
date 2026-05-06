## Crypto/DeFi Transaction Preflight Checks
- Before preparing any on-chain tx, verify: native gas/bandwidth (TRX bandwidth on TRON), lending pause flags (`isWithdrawPaused` / `isSupplyPaused`), min borrow/supply thresholds, ERC-20 approval status.
- Never use `uint256.max` for collateral withdrawal — fetch the exact balance.
- Multi-step (approve + action): wait for the approval to confirm before sending the dependent tx.

## Git/PR Workflow
- PR-based always. Never push to `main` or to the wrong branch.
- Confirm with the user before force-pushing or rebasing a pushed branch. `--force-with-lease` only on feature branches; never plain `--force`, never on `main`.
- **One worktree per feature/fix** under `.claude/worktrees/<branch-name>`. Never edit in the main worktree at `/home/szhygulin/dev/recon-mcp` — parallel agents race the index, working tree, and `node_modules`. Recipe: `cd /home/szhygulin/dev/recon-mcp && git fetch origin main && git worktree add .claude/worktrees/<short-name> -b <branch-name> origin/main`. Exceptions: `claude-work/` (gitignored) and `~/.claude/projects/.../memory/` (per-user) are editable from anywhere.
- **`cd /home/szhygulin/dev/recon-mcp` BEFORE every `git worktree add`** — the recipe path is relative. From a previous worktree, the new one silently nests at `<prior>/.claude/worktrees/<new>` and every `git status` / build / push afterwards runs against a confused tree. Run `pwd` after the cd if uncertain. Past incidents 2026-04-28: SunSwap → readme-roadmap, pnl-mtd → claude-md-close-keyword.
- **Sync to `origin/main` before starting any work** (`git fetch origin main && git rebase origin/main`). Stale main causes spurious conflicts and risks overlap with another agent's in-flight change. New worktrees from the recipe start at fresh main — still run it; consistency beats remembering when it matters. Re-rebasing a pushed/PR-open branch needs user confirmation.
- **Branch every new PR off `origin/main` — never stack PRs**, even when two in-flight PRs touch shared registration files (`src/index.ts` imports + `registerTool`, `src/modules/execution/index.ts` exports, `src/modules/execution/schemas.ts` zod inputs). Second-to-merge resolves at PR time: rebase after the prior lands, fix conflicts, `--force-with-lease`. Stacking creates fragile queues — base squash-merges orphan downstream; out-of-order merges break the chain.
- **Don't watch CI unless asked.** After push: report the PR as a Markdown hyperlink (`[#553](url)` or `[PR title](url)` — never the raw URL) + one-line summary, then stop. Same rule applies any time a fresh PR / issue / release is created: link it via `[label](url)`, not bare `https://…`. If asked to watch: `gh pr checks <PR>` or `gh run watch <id> --exit-status`. Most runs 1–3 min; release workflows (npm + MCP Registry) 90s–2min. Past ~5 min over typical → assume stuck runner: `gh run rerun <id> --failed` or push an empty commit for a fresh `synchronize`.
- **PR body must use `Closes #N` paired directly with the issue number.** GitHub's parser only fires when the keyword (`Closes` / `Fixes` / `Resolves`) is bound to `#N`. Works: `Closes #432.`; `Closes part of #439 — the gap`. Doesn't: `Closes the smoke-test gap` (keyword bound to prose); `feat(x): add Y (#447)` in title (parenthetical, not close keyword). Lead the PR body with `Closes #N` on its own line. PR #525 merged but #447 stayed open due to bare prose `#447` references.

## Tool Usage Discipline
- Don't repeat the same informational tool call within a single turn — cache mentally.
- Ambiguous / empty result: verify once with a different method; don't loop without user consent.

## SDK Scope-Probing Discipline
- **Scope-probe new third-party SDKs BEFORE committing the plan.** Invoke `rnd`. 15-30 min: `npm view <pkg>` for runtime deps + last-published; install into `/tmp/<pkg>-probe/`, read `dist/*.d.ts`; check transit graph for `*-contracts`, hardhat, ethersproject v5, parallel core libs; confirm the API exposes UNSIGNED tx output (Ledger-compatible), not internally-signing helpers.
- Document the verdict in the plan: SDK / version / red flags / decision (adopt / cherry-pick / skip).
- Cost of skipping: PR #334 adopted `@uniswap/v3-sdk`; shallow d.ts inspection missed the `swap-router-contracts → hardhat → solc/sentry/undici/mocha` transit graph that Snyk caught at PR-CI. ~2h refactor to drop the SDK and port the math to native bigint with fixture-locked bit-exactness.
- Reward: Phase 2/3 (Curve + Balancer) planning rejected `@curvefi/api` (ethers-coupled signing) and `@balancer-labs/sdk` V2 (ethersproject-bound, stale), accepted `@balancer/sdk` V3 (viem-native + V2 helpers). 1 SDK adopted instead of 3.

## Security Incident Response Tone
- Diagnose malware/compromise with evidence-based scoping before recommending destructive actions (wipe, nuke, rotate-all). Never delete evidence files before reading them.

## Chat Output Formatting
- Markdown hyperlinks over raw URLs everywhere: `[label](url)`. Long URLs (swiss-knife decoders, Etherscan tx, tenderly/phalcon simulations) wrap the terminal into unreadable walls when raw. Apply in user replies AND in any text the server tells the agent to render. Raw URLs OK only when short and scannable (bare domains) or required for machine-readable JSON paste-blocks.

## Push-Back Discipline
- **Push back BEFORE acting if the request is built on a faulty premise that won't achieve the user's stated goal.** Mid-response caveats ("won't actually fix the thing you asked for") prove the wrong action got taken.
- Tells: re-running a workflow on a tag that predates the fix; re-broadcasting a tx with a confirmed nonce; wrapping a destructive action with "won't really do what you want, but doing it anyway".
- Format: one sentence on the mismatch + 2-3 alternatives + a question. Short — unblock the decision, don't lecture.
- If the user says "do it anyway", proceed.
- Past incident 2026-04-27: user asked to retrigger release-binaries.yml on the v0.9.4 tag for a missing macos-arm64 upload; tag predated #346 / #349 / #361 (size + retry fixes). Right move was flag the frozen-tag problem and recommend cutting v0.9.5.

## Issue Analysis
- **When asked to work on an issue, read the comments too — not just the body — and fold relevant content into the analysis.** Comments are where reviewers add follow-up scope, push back on the original framing, or specify defense layers the body left implicit. Skipping them ships a half-answer to the wrong question. `gh api repos/<owner>/<repo>/issues/<N>/comments` returns the thread.
- Past incident 2026-04-29: implemented #556 (burn-address approval refusal) from the body alone. The user's follow-up comment ("agent should route this through the approve tool, not prepare_custom_call") was the second defense layer the issue actually required — caught only after the user pointed it out, costing a round-trip.

## Smallest-Solution Discipline
- **Push back with the smallest solution that solves the stated problem.** Minimum change first; escalate only if it demonstrably doesn't cover the requirement. Issue/plan text is a problem description, not a license to build infrastructure.
- Tells the proposal is too big: persistence layer for a one-shot operation; new module when an inline call-site change would do; background worker/scheduler for an action that fires once per request; generalizing for hypothetical future callers; "while I'm here" refactors bundled into a fix PR.
- Format: smallest fix + what the larger proposal adds + which scope to pursue. If the issue/plan author specified the heavy approach, surface the lighter one explicitly — don't silently downscope either.
- If the user says the larger scope is intended, proceed.

## Install-State-Aware Recommendations
- **Before recommending a command that depends on how a tool is installed (npm-global vs local clone vs pipx vs system-package vs MCP-server registration), verify the actual install state first.** This is the `rnd` skill's "name the source before you name the fact" applied to recommendations: the source of truth is the user's actual installed state, not a plausible guess about how they installed it. One cheap read (`which <bin>`, `claude mcp get <name>`, `cat <config>`, `ls <expected dir>`) costs less than a command that silently switches the user off their dev build, points at the wrong binary, or installs a duplicate alongside the real one. Generalizes: any recommendation whose correctness depends on user-side state — shell, package manager, version, scope, env — verifies that state before naming the command.
- Tells you're about to recommend without verifying:
  - `npx -y <pkg>` for a tool the user runs from `node /path/to/dist/index.js`.
  - `pip install` when the user has it under pipx / conda / system-package.
  - `brew` on Linux, `apt` on macOS, or any pkg-manager that doesn't match the platform.
  - `claude mcp add <name>` without `claude mcp get <name>` first to capture existing scope, command, args, env.
  - `~/.bashrc` edits when the user runs zsh (or vice versa).
- Format: lead with one observation line ("`claude mcp get` shows scope=local, launches via `node /path/dist/index.js`, no env vars set"), then the command tailored to that state. The observation line lets the user catch mismatches you missed.
- Past incident 2026-04-29: drafted `claude mcp add vaultpilot-mcp --env SAFE_API_KEY=<key> -- npx -y vaultpilot-mcp` for a `SAFE_API_KEY` setup, assuming the published npm package. User actually runs a local dev clone at `/home/szhygulin/dev/recon-mcp/dist/index.js`. The recommended command would have switched their MCP off the dev build onto npm-latest, silently dropping unmerged local work. Caught only because the user asked for the exact command, forcing me to read `claude mcp get` first. Right move: read first, recommend second.

## Documentation Style — concise, non-redundant, sharp
- **In user-facing docs (READMEs, AGENTS.md, INSTALL, prose sections of SECURITY.md, ROADMAP, AND CLAUDE.md itself), state each idea once, in its most natural place.** Long docs accumulate redundancy as features land incrementally — taglines, callouts, intro paragraphs, and feature bullets all end up restating the same pitch because each was written in isolation.
- Tells: same fact in 3+ places; intro region with tagline + callout + multi-paragraph "what this is" (pick one); tool descriptions explaining what the name implies; bullet lists duplicating prose immediately above; "Limitations" sections re-covering body ground.
- Apply at write time:
  - Lead with the strongest sentence. Don't ramp up.
  - One fact, one home — link from secondary locations instead of duplicating.
  - Cut adjectives that don't change meaning ("comprehensive" / "robust" / "powerful" / "seamless").
  - Tool/feature descriptions: state what's NON-obvious from the name; otherwise just list the name.
  - **Stay high-level. Don't over-explain.** Prefer one sharp sentence over an explanatory paragraph; one canonical example over four; a brief reference over a transcript. Readers can ask follow-ups; they cannot un-read filler. Factual accuracy is non-negotiable — high-level is fine, vague-bordering-on-wrong is not. If you're tempted to add a third example "for clarity," the first two were probably enough.
- Apply at edit time:
  - Read top-to-bottom; flag every sentence you've read before. Keep the best location, delete the rest, link if navigation value is lost.
  - Opportunistic dedup is fine while editing for another reason. Standalone churn PRs aren't.
- Scope: user-facing docs and PR descriptions. Internal plans, memory, code comments, chat replies can stay verbose.
- Past incident 2026-04-28: README grew to 258 lines with the intro restated four times, Solana durable-nonce in three sections, WC-Tron/Solana fact in two. Rewrite cut to 227 without losing technical content. CLAUDE.md rewritten same day from 110 to 103 by trimming filler — dense rule content compresses less than feature/marketing prose.
- **Don't re-explain synonyms.** Once a term is named clearly, don't paraphrase it in the next sentence "for clarity" — readers parse repetition as either condescension or signal that the first phrasing was wrong. Pick the strongest term, use it, move on.

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
## Compound / rogue-MCP security findings: decompose by threat layer and reject mitigations living i...

**Rule:** When a security finding either (a) bundles multiple distinct threat layers (e.g. advisory-prose + MCP-tool-surface) or (b) names the MCP server itself as the threat actor while proposing fixes inside that same MCP, decompose by threat layer and reject any mitigation that resides inside the attacker's own process. Cite each layer's canonical tracker separately; do not close the whole finding on one layer's disposition and do not implement self-defeating in-process guards.

**Past incidents:** issue #597 (run 2026-05-01, compound advisory-prose + spoofed MCP metrics 'corroboration' attack); issue #585 (run 2026-05-05, reporter proposed slug allowlist inside `get_protocol_risk_score` against rogue MCP); issue #581 (run 2026-05-05, compound finding proposing `data_source` fields / signed oracle data / multi-source consensus all inside the rogue MCP).

**Why:**
- 'Corroboration' attacks pair an out-of-scope component (fake recommendation in free-text prose) with a potentially in-scope component (spoofed MCP metrics lending the prose credibility). Closing on the prose component alone discards a surface that may still be actionable; a single combined patch covers neither layer fully and may reopen or obscure existing canonical closures.
- When the MCP is itself the threat actor, any in-process check — input validation, slug allowlist, response-schema guard, `data_source` metadata field, internal signing logic, multi-source consensus — is self-defeating: the rogue server can silently skip or forge anything it controls. These produce audit theater, not a real trust boundary.
- Reporters frequently conflate 'where the symptom appears' (inside the MCP tool response) with 'where the fix should live' (upstream of the MCP, outside attacker control).

**How to apply:**
1. On any `compound-security-finding`, multi-actor, `rogue-mcp-collude`, or `read-only-spoofing` issue, enumerate the distinct threat layers in the pushback comment.
2. Map each layer to its canonical tracker / closure separately (e.g. advisory-layer-scam closure for the prose layer, read-only-MCP-spoofing closure for the metrics layer); do not collapse layers into a single disposition.
3. For every layer where the suggested fix is an MCP-internal code change, include an explicit sentence that names the proposed fix, states plainly that it does not bind the threat actor, and redirects to the upstream defense layer — server-signed response envelopes verified by the orchestrator, chat-client output filters / verification, agent-side schema validation, out-of-band oracle cross-check, co-signature from a separate process, or model-safety output filter — operating before or after the MCP call, never within it.
4. Offer concrete re-scope paths per layer: architectural close / re-scope to a named MCP tool call / cooperating-agent skill guidance with explicit scope statement / external-integrity tracker. Ask the reporter for confirmation before closing.

**Hard constraint:** Fixes that live inside the threat actor's own process do not bind it. A rogue MCP can silently ignore its own `data_source` field, its own signing logic, and its own consensus check.

**Tells (union):**
- Finding title or body contains both a content/endorsement claim AND a data/metrics claim, or references two distinct mechanisms in one sentence.
- Reporter frames spoofed MCP tool responses as 'corroborating' or 'validating' harmful prose content.
- Issue carries `advisory-prose` and `rogue-mcp` characteristics simultaneously, or is labelled `compound-security-finding`.
- `security_finding` label where the reporter's proposed fix cites MCP source files, schema guards, slug allowlists, or response-schema enforcement.
- The named attacker and the proposed-fix recipient are the same component; proposed mitigations all touch the component that is itself the threat actor.
<!-- run:run-2026-05-02T06-32-08-433Z issue:#41 outcome:implement ts:2026-05-02T06:35:22.666Z -->
## Write audit-trail companion fields atomically with the state-transition flag that triggers them

**When a mutation flips a boolean state flag (`archived`, `completed`, `deleted`, etc.), always write every companion audit field (`archivedAt`, `splitInto`, `reason`, related-ID arrays) in the exact same transaction or mutation block — never leave them for a follow-up write.**

**Why:** A flag-only write creates a permanently incomplete audit trail: the registry can answer 'was this archived?' but not 'when?' or 'into what?'. Backfilling after the fact is lossy and the gap is invisible until a consumer tries to query the companion fields.

**How to apply:** Before closing any state-transition mutation, scan the target schema for fields named `*At`, `*By`, `*Into`, `*From`, `*Reason`, or sibling ID arrays. If the flag is being set but its companions are not, extend the same mutation to include them.

**Tells:** A schema has a boolean like `archived?: boolean` next to `archivedAt?: string` or `splitInto?: string[]`. Only the boolean is being written. The companion fields are either missing from the schema entirely or present but never populated.

**Also:** Issue descriptions may misstate the current schema — always read the actual source files before assuming fields exist. Add missing fields as optional (`?`) to preserve back-compat with pre-transition records already in the registry.

<!-- run:run-2026-05-05T11-30-15-426Z issue:#102 outcome:implement ts:2026-05-05T11:41:20.005Z tags:cli-subcommand,file-lock,lesson-curation,llm-call,pool-trim,shared-lessons -->
## Thread originating-agent identity end-to-end in resume and salvage workflows

**When a resume or salvage path is introduced, originating-agent metadata (agentId, agentName, runId) must be explicitly piped from its source (registry or state file) through every intermediate data structure — ResumeContext, WorkflowVars, or equivalent — all the way to the rendered output artifact (PR body, commit message).**

**Why:** Without explicit threading, the resumed agent has no data available to emit a co-signature line; post-hoc attribution audits (e.g., `gh pr list --search 'in:body "agent-XXXX"'`) silently miss the originating contributor. The data does not "flow through" by accident — each hop must be deliberate.

**How to apply:** On any PR touching resume, salvage, or re-dispatch logic, trace the attribution field from its source to the final artifact. If any intermediate struct lacks the field, add it before writing the rendering layer.

**Tells:** `ResumeContext` or `WorkflowVars` lacking `agentId`/`agentName` fields; workflow prompt templates with no co-signature block; operator-side hand-salvage paths that bypass `--resume-incomplete` entirely.

<!-- promote-candidate:salvage-workflow -->
In salvage and resume workflows, the originating agent's identity (agentId, agentName, runId) is typically available in the agent registry or a persisted state file, but it does not automatically propagate to the resumed agent's rendered prompt. Each intermediate data structure in the pipeline (e.g. ResumeContext, WorkflowVars) must explicitly carry these fields, or the resumed agent has nothing to attribute. PRs produced by salvaged runs without this threading will omit co-signature lines, making multi-contributor audit queries unreliable.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T16-33-14-458Z issue:#131 outcome:implement ts:2026-05-05T16:43:01.731Z tags:cost-surface,in-flight-signals,jsonl-log-parser,live-progress,operator-tooling,run-state-schema,status-cli -->
## Operator ad-hoc scripts against raw state/log files are a CLI UX gap to fill natively

**When operators are repeatedly hand-rolling scripts (python one-liners, grep/jq pipelines) against raw `state/*.json` or `logs/*.jsonl` artifacts to answer a common question, that is a direct signal to enrich the relevant CLI subcommand — not to document the workaround.**

**Why:** Issue originated from operators re-writing the same progress-query scripts every time someone asked "what is the run doing?". The fix — computing cost burn, per-issue tool counts, and a recent-events tail natively in `vp-dev status` — permanently removed the need for ad-hoc scripting and made the data discoverable.

**How to apply:** When an issue title/description contains phrases like "requires custom scripts", "output is too thin", or "hand-rolling against state files", prefer extending the existing CLI subcommand over adding documentation of the workaround. Compute the new data in a **pure, independently-testable helper** (e.g. `runActivity.ts`) so it is easy to unit-test without spawning the full orchestrator.

**Tells:** issue labelled bug+enhancement together; operators querying `.json`/`.jsonl` files directly; phrases like "one-liner", "custom script", "vp-dev ... too thin".

**Implementation pattern:**
- Persist derived metrics (e.g. `costAccumulatedUsd`) into `RunState` at every `saveRunState` callsite so the CLI reads a single source of truth.
- Expose time-varying data via `--watch` on the same subcommand rather than a new command.
- Gate new fields on existence (graceful no-op when the log or state file predates the feature).

<!-- promote-candidate:operator-tooling -->
When operators of a dev-agent system routinely write ad-hoc scripts (python one-liners, grep/jq) against raw state JSON or JSONL log files to answer common operational questions ("what is the run doing?", "how much has been spent?"), this pattern recurs across projects and domains. The sustainable fix is to (a) persist the computed metric into the persisted run-state object at every save-calls
[…truncated]

<!-- run:merge-2026-05-05T21-49-44-518Z issue:#134+#140+#141+#649 outcome:compacted ts:2026-05-05T21:49:44.519Z -->
## Verify the authoritative type file before editing the path named in an issue body

**When an issue body names a specific file for a schema or interface change, search for the actual type/interface definition before editing — the named file may only import and consume the type.** The authoritative definition may live elsewhere (e.g., `types.ts` vs. a domain-specific state file).
**Why:** Issue bodies are written at planning time and can lag behind refactors; `RunState` was described as living in `src/state/runState.ts` but was actually defined in `src/types.ts` — editing the consumer file would have left the interface unchanged.
**How to apply:** On every schema-extension or interface-addition task, grep or use `go-to-definition` for the type name before writing any edit. Edit only the file that _declares_ the type; files that merely import it need no change.
**Tells:** Issue body cites a concrete file path for a type/interface change; codebase has both a `types.ts` and domain-specific state/schema files; the named file imports from `types.ts`.

<!-- promote-candidate:schema-extension -->
Issue bodies naming a concrete file for a type/interface change can lag behind refactors. In this codebase, `RunState` was described as living in `src/state/runState.ts` but was actually defined in `src/types.ts`; `runState.ts` only imported and consumed it. Editing the consumer file would have left the interface unchanged. Searching for the actual type definition before any schema-extension edit is the reliable approach.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T20-22-10-610Z issue:#158 outcome:pushback ts:2026-05-05T20:25:42.364Z tags:advisory-vs-mutation-seam,agent-memory-growth,best-architectural-solution-discipline,claude-md-compaction,mechanism-ambiguity,phased-split,pre-dispatch-triage,scope-fit-check,splitter-section-floor -->
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
## Calibrate HEADING_MAX to the LLM's observed synthesis-output distribution, not single-item intuition

**When a constant caps both the LLM prompt constraint and the schema clamp, calibrate it against real production-data output — especially when two kinds of headings coexist.**

**Why:** Phase A `appendBlock` headings (one rule → one title) fit comfortably in 100 chars; compaction-via-merge thesis-summary headings (3-6 rules → one synthesized heading) naturally run 110-145 chars. A single 100-char constant silently truncated every merged block with a literal `...` on the first production-data run.

**How to apply:** Whenever a new compaction phase or merge step asks the LLM to synthesize multiple inputs into a single heading or title, verify the existing cap was designed for that use case. If two kinds of headings share one constant, widen the cap or split into two constants.

**Tells:** LLM output consistently ends in `...`; the heading describes a cluster or group of source items rather than a single item; the same `HEADING_MAX` constant drives both the Zod schema clamp and the system-prompt instruction.

<!-- promote-candidate:claude-md-compaction -->
Compaction-via-merge thesis-summary headings — where the LLM synthesizes what 3-6 source sections have in common — naturally run 110-145 chars. Single-item appendBlock headings stay well under 100. A cap calibrated for single-item headings silently truncates synthesis headings with a literal `...` on the first production-data run. Observed safe cap for thesis-summary headings: 160 chars.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-51-54-224Z issue:#180 outcome:pushback ts:2026-05-05T22:53:39.411Z tags:advisory-vs-mutation-seam,agent-memory-growth,claude-md-compaction,dependency-ordering,phased-split,pre-dispatch-triage -->
