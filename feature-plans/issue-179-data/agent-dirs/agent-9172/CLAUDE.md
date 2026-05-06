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
## Cross-Repo Scope Splits
- **When an issue's solution splits between MCP code and skill rendering / agent-flow guidance, file the skill half as a tracked issue in [`vaultpilot-security-skill`](https://github.com/szhygulin/vaultpilot-security-skill) before merging the MCP PR — and link both ways.** "Skill-side, out of scope" buried in a PR-description bullet drops the work. A real issue with the proposed rules + explicit scope statement keeps it visible and lets the skill repo pull it in on its next release.
- Tells the split is happening: the issue's suggested fix names a tool the MCP doesn't expose (`list_contacts(label=…)` re-derivation before a non-recipient-parameter tool); the proposed defense is "agent should call X first" (skill rules bind cooperating agents); the proposed defense is "emit a CHECKS PERFORMED block listing …" (skill renders the block, not the MCP).
- Format for the skill issue: link the MCP issue + PR; one-paragraph context on what MCP-side shipped; the proposed rules in numbered sections; explicit scope label "cooperating-agent guidance only — rogue agent ignores any rule" (per Rogue-Agent-Only Finding Triage).
- Past application 2026-04-29: vaultpilot-mcp#557 (share_strategy / import_strategy bypass preflight Step 0). MCP-side ship: strict-shape gate ([PR #571](https://github.com/szhygulin/vaultpilot-mcp/pull/571)). Skill-side filed at [vaultpilot-security-skill#23](https://github.com/szhygulin/vaultpilot-security-skill/issues/23) — list_contacts re-derive, CHECKS PERFORMED, schema-relay refusal as defense in depth.
## Smallest-Solution Discipline
- **Push back with the smallest solution that solves the stated problem.** Minimum change first; escalate only if it demonstrably doesn't cover the requirement. Issue/plan text is a problem description, not a license to build infrastructure.
- Tells the proposal is too big: persistence layer for a one-shot operation; new module when an inline call-site change would do; background worker/scheduler for an action that fires once per request; generalizing for hypothetical future callers; "while I'm here" refactors bundled into a fix PR.
- Format: smallest fix + what the larger proposal adds + which scope to pursue. If the issue/plan author specified the heavy approach, surface the lighter one explicitly — don't silently downscope either.
- If the user says the larger scope is intended, proceed.
## Rogue-Agent-Only Finding Triage
- **When the threat is "rogue agent generates harmful advisory text" or "rogue agent fabricates/suppresses MCP results" with no signing flow, close as architectural — don't ship MCP/skill mitigations pretending to fix it.** The skill is text in the agent's context; a hostile agent reads any rule and ignores it. Real defenses live at model-safety-tuning (Anthropic) or chat-client output-filter (Claude Code / Cursor / Desktop) — neither in scope here.
- Tells: output is purely advisory text (no `prepare_*` / `preview_send` / `send_transaction`); agent fabricates a security UI (fake `CHECKS PERFORMED` with `{✓}` verdicts); agent suppresses or falsifies MCP results; proposed fix is "add a rule to SKILL.md" with no other layer.
- **Don't confuse with rogue-MCP + cooperating-agent (Role B).** Skill rules genuinely bind a cooperating agent; read-only response-spoofing, fabricated `compare_yields` rows are real targets for skill-side guidance.
- **Don't confuse with device-layer architectural** (e.g. Ledger blind-sign) — different escalation path (vendor, not model/UI safety).
- Closing template: brief comment naming the architectural gap, citing #536 (canonical) + vaultpilot-mcp-smoke-test#21 (Role A scope-reframing methodology), one-line recap of why skill rules don't help.
- Cooperating-agent guidance with an explicit honest scope label IS acceptable (skill v0.7.0 / vaultpilot-security-skill PR #20). The rule above forbids dressing it up as a defense against the rogue case it isn't actually defending — security theater. Scope label "guides cooperating agents; does NOT defend against a rogue agent that ignores it" must be in the rule body, not just the PR description.
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
<!-- run:merge-2026-05-05T21-49-44-518Z issue:#134+#140+#141+#649 outcome:compacted ts:2026-05-05T21:49:44.519Z -->
## Cross-cutting features need a layer-chain audit and phase split along the data-layer / integratio...

**Rule:** Cross-cutting orchestration / envelope / dedup / fee-rendering features touch a predictable plumbing chain that is consistently underestimated by 1.5–2×. Before dispatch, run a layer-chain audit; if ≥5–6 layers are implicated, propose a phased split along the natural seam, and gate Phase 1 so the merged artifact is a byte-identical no-op until Phase 2 wires activation.

**Canonical layer chain:** `types` → `state/schema` → `workflow logic` → `orchestrator` → `CLI wiring` → `tests`. Each layer typically adds one file, making stated '4–5 file' estimates low by 1.5–2× (the ×1.5 calibration multiplier).

**Past incidents:**
- Issue #134 (run 2026-05-05, workflow-threading auto-phase-followup; 6-layer chain surfaced under-stated file count).
- Issue #141 (run 2026-05-05, Phase 1 of multi-phase split landed as no-op via optional Zod fields + `autoPhaseFollowup` default-off guard).
- Issue #140 (run 2026-05-05, dedup feature with `--apply-dedup` destructive flag; 6–8 file layer chain hidden behind ~5-file scope).
- Issue #649 (run 2026-05-05, cost-preview multi-chain expansion; TRON net-burn enrichment forced a Phase 1 (render-and-wire) / Phase 2 (envelope schema extension + enrichment) split).

**Natural split seams (use the one that fits):**
- **Data-layer vs. integration-wiring** (general orchestration features): types + schema + render helpers in Phase 1; CLI + orchestrator + lifecycle hooks + tests in Phase 2.
- **Advisory-vs-mutation seam** (dedup-style features): Phase A = detection + advisory report only; Phase B = destructive close path behind a flag like `--apply-dedup`.
- **Envelope-vs-enrichment seam** (cost-preview / fee-rendering across chains): Phase 1 = render-and-wire against chains whose fee data already lives on the unsigned-tx envelope (`networkFee`, `priorityFee`, `feeEstimate`); Phase 2 = new envelope fields + enrichment math at build sites for chains needing on-chain computation.

**Why:**
- Issue authors enumerate the new logic file plus one or two call-sites; they consistently miss the integration glue at each layer boundary. The ×1.5 calibration multiplier reliably pushes stated ~5 counts past the 5-file dispatch threshold once every layer is counted.
- Mixing render-only chains with enrichment-heavy chains in one PR produces cross-cutting diffs across types / data-fetch / render / wiring / tests simultaneously — exactly the shape phased-split targets.
- Without a default-off Phase 1 gate, a missing CLI flag or unset config silently activates incomplete behavior before Phase 2 lands.

**How to apply:**
1. Count one file per layer actually touched against the canonical chain. If ≥5 layers (or ≥6 files for dedup-style features), treat the issue as 8+ files regardless of stated count.
2. For envelope/fee work: grep each chain's unsigned-tx envelope type for existing fee fields. Any chain missing a displayable fee field needs a schema-extension phase first.
3. Propose the appropriate phase split (data/integration, advisory/mutation, or envelope/enrichment) at the natural seam.
4. **Phase 1 implementation pattern (mandatory for safety):**
   - Add new Zod schema fields as `.optional()` (with URL or type validation as needed).
   - Guard every new render section behind a boolean `WorkflowVars` flag (e.g. `autoPhaseFollowup`) that nothing currently sets — no default or explicit `false`.
   - Write subtests for both the off-state (asserts baseline shape is byte-identical to pre-phase) and the on-state (asserts new section is present). Full suite must stay green in both states.
5. Defer activation path (CLI flag wiring, config plumbing) explicitly to a later issue.

**Domain-specific note (TRON / non-EVM fee rendering):** TRON cost-preview requires computing net burn after subtracting frozen-stake energy offsets. The raw `estimatedEnergyCostSun` value on the unsigned-tx envelope overstates actual user cost whenever the account holds frozen TRX for energy (common for active wallets). A derived `feeNetSun` field must be populated at tx-build sites via a `getAccountResource`-style call before the value reaches the render layer — display-time enrichment is too late because the resource query needs the sender address from build context.

**Tells (union):**
- Issue title contains 'auto-', 'wire', 'propagate', 'lifecycle', 'phase', 'Phase 1', 'no CLI yet', or 'data layer only'.
- Touches CLI flag AND types AND workflow AND orchestrator simultaneously.
- Issue mentions 'close duplicates', 'skip if already seen', 'pre-dispatch', or an `--apply-*` destructive flag.
- Issue lists 3+ chains; at least one is TRON or uses staked-resource accounting; the others already carry a numeric fee on their envelope type.
- Stated file count ≤ 5 but the feature is cross-cutting through the orchestration stack.
- Scope notes explicitly defer activation path to a later issue.
- Prior splits with the same shape (data → integration) have succeeded.
<!-- run:run-2026-05-05T22-51-54-224Z issue:#180 outcome:pushback ts:2026-05-05T22:53:39.411Z tags:advisory-vs-mutation-seam,agent-memory-growth,claude-md-compaction,dependency-ordering,phased-split,pre-dispatch-triage -->
## Verify phase-dependency infrastructure in code before implementing a later-phase issue

**Before writing any code for a 'Phase N' or explicitly sequenced issue, grep for the concrete artifacts — type names, state-file paths, schema constants — that predecessor phases were supposed to create; if they are absent, push back regardless of the predecessor issue's open/closed label.**

**Why:** An issue can be marked open (or even closed) while the infrastructure it promised is still missing from the codebase. Implementing a later phase against empty infrastructure means every code path silently hits empty-state fallbacks, calibration thresholds are uninitialized, and the issue's own success metrics cannot be evaluated — producing code that is syntactically valid but semantically broken from day one.

**How to apply:** When an issue title or body contains 'Phase N', 'Step N', or an explicit 'depends on #X' line, (1) check the dependency issue's state, AND (2) grep for 2–3 key identifiers called out in the dependency — type names, file patterns, exported constants. If grep returns zero matches, the prerequisite has not landed.

**Tells:** Phase number in issue title; 'MUST land first' / 'depends on' language in body; state-file paths referenced by the new issue that nothing currently writes; schema type names with zero grep hits.

<!-- promote-candidate:phased-split -->
When a multi-phase feature set is implemented in separate issues, later phases routinely reference state files, schema types, and calibration constants that the earlier phase was supposed to create. Checking the predecessor issue status alone is insufficient — the actual file/type must be confirmed present in the codebase via grep before the later phase can produce correct behavior. Absent infrastructure causes silent empty-state fallbacks rather than compile errors, making the breakage hard to detect post-merge.
<!-- /promote-candidate -->
