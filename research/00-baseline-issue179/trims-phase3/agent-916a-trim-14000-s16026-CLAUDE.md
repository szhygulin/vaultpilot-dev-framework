## Chat Output Formatting
- Markdown hyperlinks over raw URLs everywhere: `[label](url)`. Long URLs (swiss-knife decoders, Etherscan tx, tenderly/phalcon simulations) wrap the terminal into unreadable walls when raw. Apply in user replies AND in any text the server tells the agent to render. Raw URLs OK only when short and scannable (bare domains) or required for machine-readable JSON paste-blocks.

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

## Typed-Data Signing Discipline
- **No typed-data signing tool ships without paired Inv #1b (typed-data tree decode) + Inv #2b (digest recompute) in the same release.** Tools: `prepare_eip2612_permit`, `prepare_permit2_*`, `prepare_cowswap_order`, `sign_typed_data_v4`, any `eth_signTypedData_v4` exposure. Tracked at [#453](https://github.com/szhygulin/vaultpilot-mcp/issues/453).
- Why: hash-recompute alone passes tautologically over a tampered tree — a rogue MCP swaps `spender` inside `Permit{owner, spender, value, nonce, deadline}` and the digest still matches because it's computed over the swap. Worst blast radius in EVM signing: ONE permit signature → perpetual transfer authority for `deadline`'s lifetime (Permit2 batch with 5-year USDT expiration, smoke-test 126, irrevocable once signed).
- Hard precondition: Ledger must clear-sign the typed-data type. If it blind-signs the digest, the agent has no on-device intent verification — the tool MUST refuse (user can't tell `Permit{spender: TRUST_ROUTER}` from `Permit{spender: ATTACKER}` on screen).
- Inv #1b: decode `domain` / `types` / `primaryType` / `message` locally; surface every address-typed field (`spender`, `to`, `receiver`, `verifyingContract`) in CHECKS PERFORMED with bold + inline-code; surface `deadline` / `validTo` / `expiration` with delta-from-now and flag if > 90 days; pin `verifyingContract` against a curated map (Permit2 = `0x000000000022D473030F116dDEE9F6B43aC78BA3`, USDC permit, CowSwap settlement) and refuse on mismatch; apply Inv #11 unlimited / long-lived rules per entry when `primaryType` ∈ `{Permit, PermitSingle, PermitBatch, Order}`.
- Inv #2b: independently recompute `keccak256("\x19\x01" || domainSeparator || hashStruct(message))` from the decoded tree, match against MCP-reported digest.
- Apply at PR-review and design time — push back on plans that bundle "ship the tool, add invariants later." Today's defense is gap-by-design (no typed-data tools); the moment that gap closes without #1b + #2b, every existing skill defense is silently bypassed.

## Security Documentation Vocabulary
- **In user-facing docs (PR descriptions, SECURITY.md, README threat-model sections, issue-close comments), use established security-engineering vocabulary** — not informal "honest threat model" / "honest scope label". Professional readers parse "honest" as a credibility claim, not a technical property.
- Substitutions:
  - "Honest about what we can't defend" → **"residual risk"** / a **"Limitations"** section.
  - "Honest scope label" → **"explicit scope statement"** / **"explicit assumptions"** with in-scope vs. out-of-scope named.
  - "Honest threat model" → **"comprehensive"** (covers attack surface), **"rigorous"** (STRIDE/PASTA/attack trees), or **"documented"**.
  - "When the agent / MCP is honest" → **"cooperating agent"** / **"honest-MCP threat model"** (contrast with compromised). Umbrella: **compromise model** — what each component does when attacker-controlled.
- Cheatsheet: **trust boundary**, **defense in depth**, **fail-safe defaults** (uncertainty defaults to denial), **attack surface**, **threat actor** / **adversary model**, **tamper-evident** / **-resistant** / **-proof** (Ledger is tamper-resistant; skill-pin SHA gives tamper-evidence), **cryptographic integrity** (`payloadFingerprint`, skill-pin SHA, BIP-143 sighashes — name it).
- Scope: user-facing docs only. Internal plans, memory, chat replies, commit messages can stay informal.
- No churn PRs to bulk find-and-replace existing usages — migrate opportunistically.

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
## Fail-soft wiring for state-collection hooks added to critical run paths

**Wrap every new `record*`/`persist*` call added to an orchestrator in a caught, log-only block — never let state-collection throw on the main run path.**

**Why:** File-lock contention, schema mismatch, or disk-full in a recording helper must not abort an in-flight issue run. One unguarded `await` added to `runIssueCore.ts` can silently kill sibling agent runs mid-flight. The utility record is observability data; the run result is not.

**How to apply:** Any time a Phase-N feature wires a new hook into an existing orchestrator, pattern is `try { await record(...) } catch (e) { logger.warn('record failed', e) }`. Never rethrow. Never propagate.

**Tells:** New "data layer only" phase; state file is gitignored (non-essential output); hook inserted alongside an existing summarizer-append or pushback call site.

<!-- promote-candidate:fail-soft-state -->
State-collection hooks wired into a shared orchestrator (runIssueCore.ts or equivalent) behave as fire-and-forget in practice: file-lock contention, schema mismatch, or disk-full errors in a recording helper must not propagate to the main run path. Losing one utility record is acceptable; aborting the run — and potentially cascading to sibling agents — is not. The pattern `try { await record(...) } catch (e) { logger.warn(...) }` at each call site is the minimal safe form.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-51-54-224Z issue:#179 outcome:pushback ts:2026-05-05T23:05:00.814Z tags:best-architectural-solution-discipline,context-cost-curve,operator-vs-agent-seam,phased-split,pre-dispatch-triage,research-study-scope -->
## Research-study execution issues are operator/agent-seam mismatches — push back with a phase split

**Rule:** When an issue's core deliverables are "raw per-run measurements" or "fitted curves" produced by running N-agent × M-issue studies with operator-judged scoring, classify the whole issue as an operator/agent-seam mismatch and push back with a concrete three-way split before touching any code.

**Why:** A single coding agent has no authority to invoke the orchestrator against sibling forks and cannot perform the human-side scoring rubrics needed to label pushback accuracy. Attempting partial delivery produces phantom measurements or silent scope collapse.

**How to apply:** Triggers when (a) estimated study cost >> remaining agent budget by ≥10×, AND (b) deliverables include empirical measurements that require actual multi-agent runs or operator-judged labels. Propose: Phase A — agent builds harness/methodology/util skeleton with a STUDY_PENDING placeholder; Phase B — operator runs the study manually; Phase C — a tiny follow-up issue encodes the results.

**Tells:** Issue title contains "measure", "curve", or "calibrate"; body lists "raw per-run measurements" or "fitted" values; estimated execution cost is $50–$200 while agent budget is $1–$5.

<!-- promote-candidate:research-study-scope -->
Issues framed as "measure X curve at Y sizes" or "calibrate Z factor against outcome-quality" typically require:
- Repeated orchestrator invocations across many agent forks (cost $50–$200 for a 7-size × 10-issue study)
- Operator-side scoring rubrics that no single agent can self-evaluate
- A phase split: agent builds the harness/skeleton (agent-doable), operator runs the study (operator-side), follow-up issue encodes results (agent-doable)
Attempting full delivery in one agent run produces either phantom measurements or silent scope collapse.
<!-- /promote-candidate -->

