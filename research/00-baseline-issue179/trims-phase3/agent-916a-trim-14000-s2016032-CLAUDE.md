## Crypto/DeFi Transaction Preflight Checks
- Before preparing any on-chain tx, verify: native gas/bandwidth (TRX bandwidth on TRON), lending pause flags (`isWithdrawPaused` / `isSupplyPaused`), min borrow/supply thresholds, ERC-20 approval status.
- Never use `uint256.max` for collateral withdrawal — fetch the exact balance.
- Multi-step (approve + action): wait for the approval to confirm before sending the dependent tx.

## Tool Usage Discipline
- Don't repeat the same informational tool call within a single turn — cache mentally.
- Ambiguous / empty result: verify once with a different method; don't loop without user consent.

## Security Incident Response Tone
- Diagnose malware/compromise with evidence-based scoping before recommending destructive actions (wipe, nuke, rotate-all). Never delete evidence files before reading them.

## Cross-Repo Scope Splits
- **When an issue's solution splits between MCP code and skill rendering / agent-flow guidance, file the skill half as a tracked issue in [`vaultpilot-security-skill`](https://github.com/szhygulin/vaultpilot-security-skill) before merging the MCP PR — and link both ways.** "Skill-side, out of scope" buried in a PR-description bullet drops the work. A real issue with the proposed rules + explicit scope statement keeps it visible and lets the skill repo pull it in on its next release.
- Tells the split is happening: the issue's suggested fix names a tool the MCP doesn't expose (`list_contacts(label=…)` re-derivation before a non-recipient-parameter tool); the proposed defense is "agent should call X first" (skill rules bind cooperating agents); the proposed defense is "emit a CHECKS PERFORMED block listing …" (skill renders the block, not the MCP).
- Format for the skill issue: link the MCP issue + PR; one-paragraph context on what MCP-side shipped; the proposed rules in numbered sections; explicit scope label "cooperating-agent guidance only — rogue agent ignores any rule" (per Rogue-Agent-Only Finding Triage).
- Past application 2026-04-29: vaultpilot-mcp#557 (share_strategy / import_strategy bypass preflight Step 0). MCP-side ship: strict-shape gate ([PR #571](https://github.com/szhygulin/vaultpilot-mcp/pull/571)). Skill-side filed at [vaultpilot-security-skill#23](https://github.com/szhygulin/vaultpilot-security-skill/issues/23) — list_contacts re-derive, CHECKS PERFORMED, schema-relay refusal as defense in depth.

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

## Rogue-Agent-Only Finding Triage
- **When the threat is "rogue agent generates harmful advisory text" or "rogue agent fabricates/suppresses MCP results" with no signing flow, close as architectural — don't ship MCP/skill mitigations pretending to fix it.** The skill is text in the agent's context; a hostile agent reads any rule and ignores it. Real defenses live at model-safety-tuning (Anthropic) or chat-client output-filter (Claude Code / Cursor / Desktop) — neither in scope here.
- Tells: output is purely advisory text (no `prepare_*` / `preview_send` / `send_transaction`); agent fabricates a security UI (fake `CHECKS PERFORMED` with `{✓}` verdicts); agent suppresses or falsifies MCP results; proposed fix is "add a rule to SKILL.md" with no other layer.
- **Don't confuse with rogue-MCP + cooperating-agent (Role B).** Skill rules genuinely bind a cooperating agent; read-only response-spoofing, fabricated `compare_yields` rows are real targets for skill-side guidance.
- **Don't confuse with device-layer architectural** (e.g. Ledger blind-sign) — different escalation path (vendor, not model/UI safety).
- Closing template: brief comment naming the architectural gap, citing #536 (canonical) + vaultpilot-mcp-smoke-test#21 (Role A scope-reframing methodology), one-line recap of why skill rules don't help.
- Cooperating-agent guidance with an explicit honest scope label IS acceptable (skill v0.7.0 / vaultpilot-security-skill PR #20). The rule above forbids dressing it up as a defense against the rogue case it isn't actually defending — security theater. Scope label "guides cooperating agents; does NOT defend against a rogue agent that ignores it" must be in the rule body, not just the PR description.

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
<!-- run:run-2026-05-05T17-57-44-626Z issue:#150 outcome:implement ts:2026-05-05T18:03:31.335Z tags:data-layer-only,dedup,fail-soft,llm-call,orchestrator-llm-call,phased-split,schema-extension,zod-schema-extension -->
## Verify phase-dependency infrastructure in code before implementing a later-phase issue

**Before writing any code for a 'Phase N' or explicitly sequenced issue, grep for the concrete artifacts — type names, state-file paths, schema constants — that predecessor phases were supposed to create; if they are absent, push back regardless of the predecessor issue's open/closed label.**

**Why:** An issue can be marked open (or even closed) while the infrastructure it promised is still missing from the codebase. Implementing a later phase against empty infrastructure means every code path silently hits empty-state fallbacks, calibration thresholds are uninitialized, and the issue's own success metrics cannot be evaluated — producing code that is syntactically valid but semantically broken from day one.

**How to apply:** When an issue title or body contains 'Phase N', 'Step N', or an explicit 'depends on #X' line, (1) check the dependency issue's state, AND (2) grep for 2–3 key identifiers called out in the dependency — type names, file patterns, exported constants. If grep returns zero matches, the prerequisite has not landed.

**Tells:** Phase number in issue title; 'MUST land first' / 'depends on' language in body; state-file paths referenced by the new issue that nothing currently writes; schema type names with zero grep hits.

<!-- promote-candidate:phased-split -->
When a multi-phase feature set is implemented in separate issues, later phases routinely reference state files, schema types, and calibration constants that the earlier phase was supposed to create. Checking the predecessor issue status alone is insufficient — the actual file/type must be confirmed present in the codebase via grep before the later phase can produce correct behavior. Absent infrastructure causes silent empty-state fallbacks rather than compile errors, making the breakage hard to detect post-merge.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-51-54-224Z issue:#178 outcome:implement ts:2026-05-05T23:03:13.714Z tags:agent-memory-growth,data-layer-only,fail-soft-state,lesson-utility-scoring,phased-split,pushback-hook,stable-section-id,summarizer-hook -->
