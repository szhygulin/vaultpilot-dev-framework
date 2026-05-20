# Super-agent CLAUDE.md (pooled-lessons union)

Built by `research/curve-redo-bundle/super-agent/build-super-agent.cjs` on 2026-05-09T05:42:15.897Z.
Contributors: 27 eligible agents (out of 47 total registered).
Input bytes (raw): 716861. Pooled (post-preamble-strip): 208675.
Compaction model output: 0 merged clusters, 122 verbatim sections.

<!-- run:run-2026-05-01T13-20-53-983Z issue:#559 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Auto-escalate secondLlmRequired when humanDecode source is 'none' (opaque calldata)

**When `verification.humanDecode.source === "none"`, stamp `secondLlmRequired = true` automatically in `issueHandles` (or any equivalent tx-stamping function); never leave second-LLM verification as opt-in for opaque-bytes flows.**

**Why:** A coordinate attack swapped recipient bytes inside opaque calldata; local PREPARE-RECEIPT decode and Ledger clear-sign both showed the legitimate router — only a voluntary `get_verification_artifact` + second-LLM 4byte cross-check caught the swap. An optional check that requires user initiative is not a reliable defense.

**How to apply:** After resolving `humanDecode` in any tx-store stamping path, check `source === "none"` (or absent / unrecognized) and set `secondLlmRequired = true`. Preserve any explicitly caller-supplied boolean override (`true`/`false`) so higher-level callers can still tighten or relax the flag intentionally.

**Tells:**
- `prepare_custom_call` targeting a non-curated contract
- Any `prepare_*` whose decoder returns no match for `to`
- ABI-decode failure on a known destination
- `humanDecode.source` is `"none"`, missing, or `"unknown"`

Note: this MCP-side auto-stamp is defense-in-depth for cooperating-MCP paths. The load-bearing rogue-MCP defense lives in the skill-side rule (vaultpilot-security-skill); both must exist.

<!-- run:run-2026-05-01T13-48-07-936Z issue:#573 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Selector-only partial decode for high-risk standard selectors on uncurated destinations

**When `decodeCalldata` would return `source:none` because the destination is absent from the curated contracts map, attempt a selector-only partial decode for any known high-risk standard selector before giving up.** Return `source:'local-abi-partial'` with fully typed args so security-critical arguments (operator address, spender, new owner) always surface in CHECKS PERFORMED.

**Why:** A C.2 collude attack routes an NFT operator-approval to an uncurated aggregator while the MCP narrates something benign. With `source:none` the attacker-controlled operator address is never extracted, so Inv #1 sees opaque bytes and cannot flag the mismatch — the user-facing label passes while the calldata is malicious.

**How to apply:** For every new high-risk 4-byte selector (operator grants, ERC-20 unlimited approvals, ownership transfers, upgrade authorizations), add a selector-match branch in the "unknown-destination" early-exit path of the decoder. The branch must: (1) verify the full calldata length, (2) ABI-decode args, (3) return `source:'local-abi-partial'` — never silently swallow decode errors.

**Tells:** destination not in curated map; calldata ≥ 36 bytes; selector matches a well-known permission-granting function; return would otherwise be `{source:'none', args:[]}`.

**Scope boundary:** The MCP-side selector fallback is defense-in-depth for a cooperating MCP. Independent verification of operator-vs-label consistency (the load-bearing Inv #1 guard against a rogue MCP) belongs in the security-skill repo and must be filed as a linked issue before merging the MCP-side PR — see CLAUDE.md §Cross-Repo Scope Splits.

<!-- run:run-2026-05-02T06-32-08-433Z issue:#38 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Push back on issues that bundle multiple architectural layers into one PR

**When a feature plan touches ≥ 3 distinct layers** (e.g., LLM prompt design, new state-machine values, orchestrator branching, CLI surface, and cost surfacing all at once), refuse to implement the full scope in a single pass and instead propose a numbered phase split.

**Why:** Multi-layer issues produce 500+ LOC diffs across 8+ files with two or more LLM prompts that are nearly impossible to review or iterate on together. Each phase should deliver standalone value so the user can stop after any phase.

**How to apply:** Before writing any code, count the distinct architectural concerns (prompt design, type changes, orchestration logic, CLI, cost display, etc.). If the count exceeds 2, draft a phase breakdown and post it as a comment asking which scope the user wants before touching code.

**Tells:**
- Feature plan file exists and lists 5+ bullet sub-features
- Issue labels include both an LLM/AI concern and an orchestrator/CLI concern simultaneously
- Estimated LOC across files exceeds ~300 before any implementation begins

**Phase split heuristic:** Phase 1 = consumption of existing artifacts with zero new state; Phase 2 = new state machine + core logic; Phase 3 = user-facing CLI + cost/preview surface.

<!-- run:run-2026-05-02T10-31-33-192Z issue:#38 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Inject pre-written feature-plans into the agent seed as authoritative design guidance, before the workflow block

**Glob `feature-plans/issue-<N>-*.md` in the worktree and, when a match exists, append its content as a named section between the agent's CLAUDE.md and the workflow block, marked 'authoritative design guidance'.**
**Why:** Without an explicit upfront plan, coding agents reinvent file layouts and architecture from scratch on every run, causing design drift across reruns and wasted tokens re-litigating structure already decided by a human architect.
**How to apply:** Any change to `buildAgentSystemPrompt()` or equivalent prompt-assembly entry points should preserve and sit below this plan-injection step; once a plan file is committed to `feature-plans/`, it takes effect on the next run with zero other infrastructure.
**Tells:** An issue has a matching `feature-plans/` file already committed; the prompt assembly doesn't reference it yet; or the agent's proposed file layout diverges from the pre-written plan.
**Ordering discipline:** Ship the plan-consumption path (reading existing files) before the plan-production path (live Opus planner, complexity gate, orchestrator state). Hand-written plans already exist and pay off immediately; the planner that generates them is a separate, deferrable phase.

<!-- run:run-2026-05-05T19-14-11-189Z issue:#573 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Selector-only partial decode fallback for high-risk standard selectors on uncurated destinations

**When `decodeCalldata` would return `source:'none'` on an uncurated destination, consult a `HIGH_RISK_STANDARD_SELECTORS` registry first.** Map each dangerous 4-byte selector to its minimal ABI, decode arguments directly from the calldata bytes, and return `source:'local-abi-partial'` instead of nothing.

**Why:** A C.2 collude attack routes an NFT operator-approval (`setApprovalForAll`) to an uncurated address while a cooperating MCP narrates a benign label. With `source:'none'` the operator address never surfaces in CHECKS PERFORMED, so the invariant-1 refusal never fires and the label goes unchallenged.

**How to apply:** For every registry entry enforce an exact byte-length guard (4 + 32 × arg_count — no trailing junk, no truncation), EIP-55-checksum every decoded address, and tag the result `source:'local-abi-partial'` so downstream name-equality cross-checks are skipped while operator/spender addresses still appear in CHECKS PERFORMED.

**Tells:** selector is a well-known standard shared across token standards, decoded args include an operator or spender address, destination is absent from the curated list.

**Test matrix per new registry entry:** operator surfacing on uncurated destination, revoke variant (`approved=false`), EIP-55 checksum casing, truncated calldata rejection, trailing-junk rejection, unknown-selector regression (`source:'none'` must hold), curated-destination regression pin (must NOT take the partial-decode path).

<!-- promote-candidate:nft-operator-approval -->
`setApprovalForAll(address operator, bool approved)` carries the same 4-byte selector `0xa22cb465` on both ERC-721 and ERC-1155. Calldata for this function is always exactly 68 bytes (4-byte selector + 32-byte address slot + 32-byte bool slot). Because the selector is standard and the encoding is fixed-length, the operator address can be recovered from raw calldata bytes without any destination ABI metadata — provided trailing bytes are rejected and the extracted a
[…truncated]

<!-- run:run-2026-05-01T14-48-57-664Z issue:#594 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Smoke-Test / Reinforcement Issues Against a Closed Security Finding Need a Predecessor Check First

**Before acting on any issue that references or 'reinforces' a prior security finding, verify the predecessor's closure state and whether its lesson is already captured in CLAUDE.md.** If the predecessor is closed because its rule was absorbed into a CLAUDE.md section, and no relevant code yet exists to harden, push back rather than re-adding the rule or pre-emptively scaffolding.

**Why:** Smoke-test and reinforcement issues are routinely filed after a parent finding is closed. Acting without checking means either duplicating a CLAUDE.md rule that already exists, or building pre-emptive scaffolding for a feature that doesn't exist yet — both violate Smallest-Solution Discipline.

**How to apply:** When an issue is tagged `smoke-test`, `tracking-issue`, or cites 'reinforces #NNN', run three checks: (1) is the referenced issue closed? (2) is its rule already in CLAUDE.md? (3) does the relevant code/tool exist to harden? If the finding is already covered and the target code is absent, post a structured pushback comment with explicit triage options (close as won't-fix, close as duplicate, keep as reminder card).

**Tells:** Labels include `smoke-test` or `tracking-issue`; issue body contains 'reinforces #NNN' or 'missing — … (reinforces #NNN)'; referenced issue is closed with `stateReason: completed`.

<!-- run:run-2026-05-01T17-27-23-838Z issue:#594 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Security 'Reinforcement' Issues Targeting Non-Existent Code — Pushback as Duplicate, Not Pre-Emptive Scaffolding

**When a security issue is filed as a reinforcement of an already-closed predecessor, first verify (a) the predecessor's rule is absorbed into CLAUDE.md and (b) the attack-surface code does not yet exist in the repo; if both are true, push back and offer close-as-duplicate.**

**Why:** Pre-emptively wiring invariant checks (Inv #1b, Inv #2b, etc.) for a tool that hasn't shipped yet adds dead code, violates Smallest-Solution Discipline, and muddies the real rule (which lives in CLAUDE.md for enforcement at PR-review time). The current posture is 'defense-by-gap' — no tool, no exploit.

**How to apply:** On any issue labelled `security_finding` that mentions a predecessor issue number or uses language like 'reinforces #NNN' / 'missing catch': (1) `gh issue view <predecessor>` — confirm closed; (2) grep the src tree for the target tool/function — confirm absent; (3) grep CLAUDE.md for the rule — confirm present. All three checks pass → structured pushback with triage options (default: close as duplicate).

**Tells:** 'smoke-test' or 'reinforcement' in issue title; predecessor issue referenced by number; grep of `src/` for the target symbol returns zero matches; existing CLAUDE.md section already names the invariant.

**Never** scaffold placeholder plumbing 'so the check is ready when the tool ships' — that belongs in the PR that introduces the tool, enforced by the CLAUDE.md rule, not in a pre-emptive commit.

<!-- run:run-2026-05-02T06-32-08-433Z issue:#35 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## LLM pre-flight classification gates: lightweight model, content-hash cache, fail-open, bypass flag

**When adding an LLM-driven gate that filters or classifies items before dispatch, follow four invariants together: use a cheap/fast model, cache by content hash, fail open, and ship a bypass flag in the same PR.**

**Why:** Pre-flight classification is called once per item on every run; using the full model wastes tokens, re-classifying unchanged issues wastes latency, a broken API call must never silently drop work, and operators need an escape hatch without code changes.

**How to apply:** Any time an LLM call is introduced as a gate (triage, duplicate detection, readiness check, etc.) before the main dispatch loop.

**Tells:** New `triage`, `classify`, or `filter` step inserted before work is dispatched; issues or items can be dropped/skipped based on the result.

- **Model:** prefer `claude-haiku-*` (or equivalent cheapest tier) for yes/no or enum classification rubrics.
- **Cache key:** SHA-256 of the input content (body + comments, query text, etc.); store at a stable path like `state/<feature>/<repo>/<id>.json`; skip the API call on a hit.
- **Fail-open:** if the classification call throws or returns an unexpected shape, treat the item as passing — never let a broken pre-flight silently discard work.
- **Bypass flag:** add a `--include-<thing>` or `--skip-<gate>` CLI flag in the same commit so the gate can be disabled without code changes.
- **Pipeline position:** insert the gate *after* range resolution and *before* the approval gate so skipped items surface in the user-visible preview.

<!-- run:run-2026-05-05T14-26-37-251Z issue:#596 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## False-factual-claim security findings during newcomer onboarding have no in-MCP fix layer

**When a `security_finding` reports a false financial or regulatory claim (e.g., incorrect FDIC/insurance coverage) emitted during newcomer onboarding, there is no MCP code surface to harden — close as architectural and route to model-layer safety tuning.**
**Why:** Content gates and allowlists embedded in skill context live inside the same trust domain as the miscalibrated model; a rogue or drifted model ignores any in-process rule it emitted itself. In-MCP defenses are security theater for model-output-quality failures.
**How to apply:** On any `security_finding` or `advisory-prose` issue, first confirm there is no `prepare_*` / `preview_send` / `send_transaction` surface involved. If the finding is purely about *what the model said* (false claim, suppressed self-custody education), apply the `model-shaped-failure` tag, cite the canonical architectural-close precedent, and offer three explicit redirect options (skill-side cooperating-agent guidance with honest scope label / upstream model tuning / smoke-test corpus tagging) so the issue author can choose a different scope.
**Tells:** issue body names 'model-layer safety tuning' as the fix; no signing or transaction flow mentioned; labels combine `security_finding` with `newcomer-onboarding` or `fdic-claim`; threat is misinformation rather than unauthorized action.

<!-- promote-candidate:rogue-agent-triage -->
Security findings that cite false financial-regulatory claims (e.g., incorrect FDIC or deposit-insurance coverage on crypto custodial accounts) emitted during newcomer onboarding represent a class of model-output-quality failures. These findings contain no MCP code exploit path — the attack surface is the model's factual calibration, not a signing or transaction flow. In-skill content filters added to address these findings end up inside the same trust boundary as the miscalibrated model, making them bypassable by design. The pattern is recognizable when: (1) the issue body itself points to m
[…truncated]

<!-- run:run-2026-05-05T19-14-11-189Z issue:#575 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## When the threat model assumes dual-layer compromise, skill-side invariants cannot defend

**If a security report's threat actor is 'agent + colluding MCP' — both trust boundaries breached simultaneously — any skill-side gate (Inv rule, premise-validity check, advisory prose) is text inside the rogue agent's own context window, which it ignores by definition.**

**Why:** Inv-style invariants only bind cooperative agents. A colluding agent reads and discards them; shipping a 'fix' here creates false assurance without reducing real risk. The body of such issues often concedes this implicitly ('the MCP cannot defend this alone').

**How to apply:** Classify as architectural residual risk, not a patchable bug. Post structured pushback offering three redirects: (1) honest-scope cooperating-agent guidance in the skill repo with an explicit scope label, (2) upstream model-safety escalation, (3) smoke-test corpus tagging. Do NOT file a skill-side fix before the reporter chooses a redirect, to avoid wasted cross-repo work.

**Tells:** Issue body says 'agent AND the MCP', 'both layers', or describes a threat that requires the defender to already be inside the compromised perimeter; educational/onboarding flows reframed into `prepare_*` calls by a compromised agent.

<!-- promote-candidate:rogue-agent-triage -->
When a security report places both the calling agent and the MCP server inside the compromised perimeter, skill-side text rules (invariants, premise-validity checks, advisory prose) are definitionally ineffective — they live only in the rogue agent's context window, which it ignores. A recurring variant: an educational or onboarding prompt is silently reframed by the compromised agent into an actionable prepare_* call; neither the skill nor the MCP can intercept this because both are already inside the trust-boundary breach. Correct disposition is architectural pushback with three redirect options rather than a filed fix.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T14-26-37-251Z issue:#641 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Research issues for cross-cutting agent tools warrant pushback when scoped to a product repo

**When a research issue targets a tool that would affect all Claude Code sessions** (global hooks, global CLAUDE.md entries), treat the filing repo as a mismatch signal and push back before starting work.
**Why:** Global-scope tooling decisions belong in the global config or orchestrator repo, not in a product repo. Delivering a CLAUDE.md note into the wrong repo creates dead code; the actual adoption path lives elsewhere.
**How to apply:** Before executing any research-evaluation issue, verify (1) whether the deliverable would live outside the current repo and (2) whether required evidence (install tests, transcript sampling, before/after token measurement) needs host-side or live user-session access. If either is true, surface both mismatches and offer alternatives: refile to the correct repo, narrow to a surface-only desk-review, or close as human-supervised research.
**Tells:** "evaluate X for Claude Code," "add to CLAUDE.md globally," "measure token spend before/after install," research steps requiring live session data.

<!-- promote-candidate:agent-tooling -->
RTK (rtk-ai/rtk) is a Bash-tool hook that intercepts every Claude Code tool call to compress or skip tool outputs before they re-enter context. Because it operates at the Claude Code host layer rather than inside any single repo, adoption decisions affect every agent session across every repo simultaneously. Research issues filed in product repos to evaluate RTK are structurally misrouted — the natural deliverable home is a global CLAUDE.md or a multi-agent orchestrator repo. Empirical evaluation (before/after token measurement, transcript sampling, install-and-test fidelity) requires host-side install and live user-session access that autonomous agent runs on a product repo cannot legitimately perform.
<!-- /promote-candidate -->

<!-- run:run-2026-05-02T10-31-33-192Z issue:#56 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Verify dependency PR merge status before implementing features that build on them

**Rule:** Before starting implementation of any issue that cites upstream PRs as prerequisites, confirm each cited PR is actually merged to `main` (not just closed or open) by checking `gh pr view <N> --json state,mergedAt`.

**Why:** Issue bodies can misstate PR status (e.g., 'PR #50 merged' when it was closed-unmerged). Building on absent foundations wastes effort and produces dead code — or worse, silently diverges from actual `main` behavior.

**How to apply:** Any time an issue references prior PRs, task numbers, or preceding agents' work as a prerequisite for the new feature, run the status check before touching any source file. If a dependency is missing, push back with a concrete list of blocked items and offer alternatives (block, reframe, or stub).

**Tells:**
- Issue body contains phrases like 'after PR #N is merged', 'depends on', 'builds on', or references specific outcome types / data structures not visible in `HEAD`.
- Grep for the key symbols (functions, types, file paths) introduced by the cited PR returns no results on `main`.

<!-- run:run-2026-05-05T14-26-37-251Z issue:#640 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Soft prose constraints in agent-facing docs don't survive summarization — upgrade to hard gate language

**When editing AGENTS.md or any agent-facing instruction doc, express hard constraints as `MUST NOT` / `MUST` refusal gates, not soft advisory prose.**

**Why:** Soft phrasing like 'ask the user — don't assume' gets stripped when agents fetch and compress instruction docs. A PR that added soft Step-0 prose had its constraints summarized away in the field; upgrading to `MUST NOT` / `MUST` with a named failure mode (e.g. 'wrong-client install') survived the same summarization pass.

**How to apply:** Any pre-action check in AGENTS.md should read: 'MUST NOT propose X without confirming Y. MUST ask a single bare question if Y is unknown.' Name the failure mode inline — the label gives the consuming agent a reason to comply rather than smooth over the check.

**Tells:** Existing constraint prose uses 'if unsure, ask', 'don't assume', or 'check with the user' — these are signals the constraint will collapse under summarization and needs upgrading to gate language.

<!-- promote-candidate:doc-summarization-resilience -->
In agent-facing instruction documents (AGENTS.md, CLAUDE.md), soft advisory phrases like 'ask the user — don't assume' and 'if unsure, check' are systematically stripped during agent summarization passes. Constraints expressed as MUST NOT / MUST gates paired with a named failure mode (e.g. 'wrong-client install') are empirically more resilient. The named failure mode appears to anchor the constraint: agents retain a labelled reason to comply rather than treating the check as optional context.
<!-- /promote-candidate -->

<!-- run:run-2026-05-01T13-48-07-936Z issue:#563 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Self-attestation from the untrusted component is not a defense — clarify threat model before any MCP-side change

**When an issue asks an MCP (or any producer) to self-report its own compliance, verify the threat model first: if the threat is a rogue/compromised producer, self-attestation adds zero security because the adversary can lie in the structured field as easily as it can omit the prose.** The defense must live in the consumer (skill, harness, second-LLM checker).

**Why:** Proposals framed as 'user without the skill is unprotected → add `directives_emitted` to MCP response' conflate two distinct threats — honest-MCP drift (detectable by consumer-side verification) and rogue-MCP (not fixable by asking the rogue to self-certify). Implementing MCP-side self-attestation under the rogue-threat framing produces code churn with no security gain.

**How to apply:** When the issue headline implies a server-side field will protect users who lack any consumer-side checker, push back with three options: (a) skill-side smallest-fix (per-tool expected-directives map, zero MCP change), (b) cross-repo split filing consumer issues first, (c) architectural close if the skill-less framing is the actual premise.

**Tells:** Issue labels include `rogue-mcp-threat-model`, `self-attestation`, or `invariant-*`; issue asks a server to emit a 'I performed checks' field; framing assumes server-side output is visible to users who have no agent-side verifier; no consumer repo issue exists yet.

<!-- run:run-2026-05-01T17-27-23-838Z issue:#596 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Advisory-text hallucination findings are architectural: close without MCP-layer fix

**When a security finding consists solely of hallucinated advisory prose — no signing flow, no fabricated/suppressed MCP tool result, no `prepare_*`/`send_transaction` call in the trace — close it as architectural and do not attempt an MCP or skill-layer patch.**

**Why:** MCP code and skill rules execute only when a tool is invoked. A model that confidently generates wrong regulatory or financial claims (e.g. false FDIC-coverage assertions) bypasses every skill gate entirely; the failure is in the language model's parametric knowledge, not in the integration layer. Patching skills or adding preflight checks cannot intercept pure text generation.

**How to apply:** At triage, check whether the harmful payload required any MCP tool call to manifest. If the agent's full trace shows only conversational turns — no tool invocations, no suppressed results, no result-fabrication — the finding belongs to the model-safety / advisory layer, not to this repo.

**Tells:**
- Issue body attributes the failure to 'model-layer' or 'hallucination' explicitly.
- No `prepare_*`, `preview_send`, or `send_transaction` appears in the tool-call log.
- Finding involves factual claims (insurance, regulatory status, yield guarantees) rather than execution behavior.
- Labels include `security_finding` but no `opaque-calldata`, `opaque-bytes`, or signing-related tags.

**Canonical close path:** reference the established architectural-close tracker (e.g. the repo-level rogue-agent tracking issue and the smoke-test repo counterpart) in the closing comment so the finding is linked to the broader model-safety workstream rather than silently discarded.

<!-- run:run-2026-05-05T11-30-15-426Z issue:#100 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Sentinel-anchored GitHub comments as deterministic triage gate — clear only on explicit human keyword

**Write a fixed sentinel string into failure comments and use a pre-model regex gate — never LLM inference — to block re-dispatch until a human explicitly unlocks.**

**Why:** LLM inference on free-form comment history is expensive and non-deterministic. A sentinel like `## vp-dev failure post-mortem` lets a single regex pass detect both the blocked state and its resolution with zero false positives from ambient discussion comments.

**How to apply:** On any non-clean agent exit (no envelope, decision=`error`, SDK truncation): (1) post the sentinel comment on the issue, (2) scan all issue comments for that sentinel in a deterministic pre-model gate before triage scoring, (3) require a case-insensitive keyword from a fixed allowlist (`retry`, `fix landed`, `scope changed`, `unblock`, `proceed`) posted AFTER the most recent sentinel to clear the block. A back-to-back post-mortem must NOT auto-clear the previous one.

**Tells:** re-dispatch loop risk, post-mortem comment, triage gate, human-in-the-loop unlock.

<!-- promote-candidate:orchestrator -->
Orchestrator agents that dispatch sub-agents on GitHub issues can fall into a re-dispatch loop when a repeatedly-failing issue is picked up again on the next run. Posting a sentinel-anchored comment (a known heading string) on non-clean exits and scanning for it with a pre-model deterministic gate breaks this loop cheaply. The gate clears only when a human posts a resolution keyword from a fixed allowlist after the most recent sentinel. Back-to-back failure comments on the same issue do not auto-clear the gate — only an explicit human signal does.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T14-26-37-251Z issue:#592 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Self-attestation fixes provide zero security against rogue-MCP or collude threat classes

**Re-querying or cross-checking through the same MCP endpoint being defended is self-attestation — a rogue producer fabricates the confirmatory response as easily as the original.**
**Why:** A collude-class issue proposed re-query, MCP-signed receipt, and list-cross-anchor for a mutation tool; every verification step routed back through the same untrusted server, making the fix security theater against its own labeled threat.
**How to apply:** Before writing code for any security issue targeting rogue-MCP or collude threat classes, trace each proposed verification step: if all paths terminate at the defended MCP endpoint, push back as self-attestation and require an out-of-band trust anchor.
**Tells:** Proposed defenses that "re-query," "request a signed receipt," or "cross-check with a list endpoint" all on the same server; fix footnotes admitting "won't help under full collude"; issue labels naming a stronger threat class than the fix actually targets.

<!-- promote-candidate:rogue-mcp-threat-model -->
In MCP security proposals targeting rogue-server or collude threat classes, verification mechanisms that call back through the same MCP endpoint being defended are self-attestation. A rogue producer can fabricate the confirmatory re-query response, the signed receipt, and the list-cross-anchor response with equal ease. Meaningful verification against a rogue MCP requires an out-of-band trust anchor — a channel or store the MCP server cannot write to. Proposals that only "raise the bar" without specifying such an anchor do not address the labeled threat class, even when the author acknowledges this limitation in a footnote.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#567 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Second-LLM cross-check defenses that route through the verified MCP are self-attesting under the collude-class threat...

**A second-LLM cross-check that fetches its verification artifact via the same MCP being evaluated is logically self-attesting and fails the collude / rogue-MCP threat model.**
**Why:** Under C.1-collude the server can forge any artifact it returns — ABI data, calldata explanations, attestation objects — so a check that still trusts the same channel adds zero independence, regardless of which LLM consumes the data.
**How to apply:** When reviewing or writing a second-LLM / cross-check defense, confirm the ABI or calldata source is fetched from a channel orthogonal to the MCP under scrutiny (e.g., [4byte.directory](https://www.4byte.directory/), an independent block-explorer ABI endpoint, or a pinned local registry). If no OOB source is named, push back and require one before approving the defense.
**Tells:** Proposal calls `get_verification_artifact` or any tool on the suspected server; cross-check LLM receives data solely from that server; no independent registry/endpoint is cited.

<!-- promote-candidate:rogue-mcp-threat-model -->
A second-LLM cross-check that fetches its verification data (ABI, calldata explanation, attestation) through the same MCP channel it is meant to verify provides no protection under the collude-class threat model. The rogue server can serve whatever artifact it chooses, making the check equivalent to self-attestation. Real independence requires an out-of-band ABI source (4byte.directory, independent block-explorer ABI endpoint, or a locally-pinned registry) that the MCP under scrutiny cannot influence. This pattern has been observed in Gelato + Aave automation flows where `get_verification_artifact` was the sole ABI source for the cross-check step.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#574 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Per-tool verification patches on a shared rogue-component surface accumulate incoherent half-defenses

**When N tools share the same rogue-MCP threat model, patching each tool individually produces N partial defenses, not one coherent one — even if each patch looks plausible (multi-RPC consensus, canonical-resolver Safe Anchor, `data-source-not-attested` marker).**

**Why:** Multi-RPC consensus routed through the rogue MCP is self-attestation by another name: the compromised component fabricates `consensus: true` across however many `eth_call` fan-outs it controls. A Safe Anchor resolver address *checked by the MCP* is equally forgeable. Per-tool patches that re-route through the same untrusted layer add implementation surface without adding integrity — and produce a patchwork where some tools appear 'fixed' while the threat model is unchanged.

**How to apply:** When an issue proposes adding verification *inside* a specific MCP tool for a threat that applies equally to sibling tools (same read-only data plane, same rogue-component exposure), push back with architecturally honest options: (1) external-URL advisory that is out-of-band by construction (a browser the MCP can't re-skin), (2) close as duplicate of the canonical surface issue so the gap is tracked in one place, (3) cooperating-agent skill rule with an explicit honest-scope label. Ask which option matches intent before writing code.

**Tells:** Issue title names one specific tool; proposed fix lives entirely inside the MCP; the same rogue-MCP gap was already filed against a sibling tool; the fix uses words like 'consensus', 'anchor', or 'attested marker' without specifying an out-of-band verifier.

<!-- promote-candidate:rogue-mcp-threat-model -->
Multi-RPC consensus performed *inside* a rogue or compromised MCP provides zero integrity guarantee. The compromised component controls all RPC fan-out and can fabricate `consensus: true` over any number of `eth_call` results. Similarly, a canonical-resolver address or an attested-marker flag checked *by the MCP itself* is forgeable by the same com
[…truncated]

<!-- run:run-2026-05-01T13-48-07-936Z issue:#162 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Upstream-gated tracker issues: verify preconditions before acting, then push back with a status summary

**When an issue is labeled `tracking` (or equivalent) and its body contains explicit "no action today" language, do not take implementation action — instead verify whether the stated unblock conditions have flipped, then post a status comment.**

**Why:** Tracker issues exist precisely because action is blocked on an external precondition (upstream publish, advisory patch, third-party merge). Acting anyway contradicts the issue's own resolution criteria and creates noise. The correct contribution is a verified status check.

**How to apply:** Any time an issue's labels or body contain signals like `tracking`, `upstream-gated`, `waiting`, or "action today: none" — check the specific conditions listed (e.g. upstream package version, advisory status), confirm they are still unmet, and post a comment summarising current status plus available paths forward (leave open / close won't-fix / re-scope to a CI canary or scheduled re-check).

**Tells:**
- Labels: `tracking`, `upstream-gated`, `upstream-tracking`, `tracker-issue`, `transitive-cve`
- Body phrases: "Action today: none", "Gated on", "waiting for upstream"
- Existing comments containing "waiting" or "blocked on"
- Issue references an advisory ID (e.g. GHSA-…) with no code change requested

<!-- run:run-2026-05-01T13-48-07-936Z issue:#568 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Issues prefixed with a layer name (Skill:, Harness:) filed in the wrong repo demand re-routing, not implementation

**Before doing any work, check whether the issue title or body signals ownership in a different repo (security-skill, smoke-test, etc.).** If so, search sibling repos for existing trackers, then post a pushback that offers ≥2 concrete paths (split into correct repos / close-and-defer to existing tracker / re-scope to a real change in *this* repo).

**Why:** "Skill:" and "Harness:" prefixes are layer-ownership signals. Implementing such work in the MCP repo creates orphaned code that diverges from the authoritative rule/harness definitions and duplicates tracking effort.

**How to apply:** Triggered when (a) the issue title begins with a layer prefix (Skill:, Harness:, Test:, etc.), (b) the suggested fix references files that live in a different repo, or (c) the issue is a meta/investigation task with no concrete MCP-side deliverable.

**Tells:** title like `Skill: investigate …` or `Harness: add logging …`; fix description mentions files not present in the current repo; a sibling-repo tracker already exists for the same invariant/feature.

**Pushback must include:** (1) which repo(s) own each half of the work, (2) any existing sibling-repo issue numbers found during search, (3) a path to re-scope as a concrete MCP change if the reporter wants to keep it here.

<!-- run:run-2026-05-04T14-08-59-410Z issue:#67 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Triage rubrics must distinguish irreconcilable conflicts from transient dependency signals

**When a triage rubric checks for body/comments conflicts, treat only *permanent* conflict signals as skip conditions — never transient upstream-dependency language.**

**Why:** A comment saying 'blocked on PR #N' or 'depends on #M' is a point-in-time state, not a verdict on the issue itself. The dispatched coding agent re-reads comments at runtime and can push back or proceed once the dependency lands. Skipping at triage throws away valid work and hides the issue from the queue indefinitely.

**How to apply:** When editing or writing a triage prompt's rubric, partition conflict signals into two explicit buckets:
- *Skip (irreconcilable):* obsolete, superseded, won't-fix, redirects to a still-open true duplicate, premise explicitly invalidated by comments.
- *Pass through (transient):* 'blocked on PR #N', 'depends on #M', 'waiting for upstream', 'gated on another issue'.

**Tells:**
- Rubric has a catch-all 'body and comments conflict → skip' clause.
- Issue is upstream-gated or tagged `upstream-tracking` / `upstream-gated`.
- The dispatched agent already has a global 're-read comments before acting' rule.

**How to apply (implementation):** A prompt-only edit to the rubric is sufficient — no orchestrator code changes needed. List the irreconcilable signals explicitly so the model does not overgeneralize.

<!-- run:run-2026-05-05T11-30-15-426Z issue:#101 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Two-tier (global / per-target) store extension: XDG path, tier discriminant, ENOENT-empty, load order

**When elevating any per-target store to cross-repo scope, introduce a `Tier = "target" | "global"` discriminant; resolve the global path via `$XDG_CONFIG_HOME/<app>/` with `~/.<app>/` as fallback; thread the tier param through every path-resolver, reader, and writer.** In prompt construction load global-tier entries first so per-target entries supplement rather than replace them. Treat ENOENT on either tier as an empty result, never an error.

**Why:** The shared-lessons global tier validated this pattern end-to-end. XDG compliance keeps the global store at a user-controllable location independent of any target-repo clone. ENOENT-empty semantics let the global tier be absent on fresh machines without breaking anything.

**How to apply:** Any time a store currently scoped to `agents/.shared/` needs to survive repo moves or span multiple target repos — shared lessons, agent memory, rubrics, skill maps.

**Tells:** Feature request mentions "portable", "cross-repo", or "machine-wide"; existing data lives under `agents/.shared/`; a new `--global` CLI flag is requested.

**Test checklist (9 cases minimum):** XDG env-var honored, `~/.<app>/` fallback honored, tier dispatch (write lands in correct dir), validation refusal, ENOENT → empty, tier isolation (no cross-bleed).

<!-- promote-candidate:cross-target-repo -->
Vaultpilot implements a two-tier store ("target" and "global") for shared domain knowledge. The global tier lives at `$XDG_CONFIG_HOME/vaultpilot/shared-lessons/` with `~/.vaultpilot/shared-lessons/` as the fallback. The per-target tier stays at `agents/.shared/lessons/` inside the target repo. At agent-prompt-build time both tiers are read per-domain: global entries load first, per-target entries append afterward. ENOENT on either tier resolves to an empty list; neither tier's absence is treated as an error. Promotion to either tier remains human-gated; the `--global` flag selects which tier `vp-dev lessons review` writes to.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T14-26-37-251Z issue:#597 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## MCP-collude grounding does not elevate a rogue-agent advisory finding to MCP-fixable

**When a finding combines rogue-agent advisory prose with rogue-MCP metric spoofing ('MCP-collude grounding'), the issue class remains architectural-close — the collusion leg changes nothing.**

**Why:** A rogue MCP supplying fabricated grounding data to corroborate harmful advice cannot be constrained by any rule on a legitimate MCP server; both legs of the threat live outside the server's trust boundary. Adding MCP-side guardrails is security theater in the same way it is for the plain rogue-agent case.

**How to apply:** If the harm vector is advisory-shaped — no `prepare_*` / `preview_send` / `send_transaction` flow present — close as architectural even when the issue body also cites spoofed MCP metrics, fabricated tool responses, or corroborating rogue-MCP signals. Reference the canonical pattern and link to the architectural-close precedent.

**Tells:** Issue mentions spoofed platform metrics, fabricated tool output, or 'grounding' data attributed to a rogue MCP *alongside* a harmful prose recommendation; no execution or signing flow is cited; issue body uses language like 'advisory-model-shaped' or 'Anthropic-side concern'.

<!-- promote-candidate:rogue-agent-triage -->
When a security finding combines rogue-agent advisory output (harmful prose recommendation, no transaction/signing flow) with rogue-MCP metric spoofing ('MCP-collude grounding'), the combined threat class is still architectural. Rules on a legitimate MCP server cannot constrain a rogue MCP from supplying false grounding data. The presence of spoofed MCP metrics does not change the triage outcome — it remains a model-layer / Anthropic-side concern. Both the rogue-agent leg and the rogue-MCP grounding leg are outside any MCP server's trust boundary.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#568 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## For two-repo cross-repo-split pushbacks, search both sibling repos before offering refile paths

**When a misrouted issue splits across two sibling repos, search each target repo for existing trackers before posting pushback — then cite the search result (found / not found) in the comment so the reporter can choose the right path.**

**Why:** Saying 'no existing tracker found in either sibling' vs. 'tracker #X already covers this in repo Y' changes which option the reporter should pick (split-and-refile vs. close-and-defer). Omitting the search forces a follow-up round-trip.

**How to apply:** Whenever a `wrong-repo-prefix` issue fans out to two or more target repos — i.e., `cross-repo-split` — run a targeted search in each sibling before drafting the pushback comment.

**Tells:** issue title carries a layer prefix (`Skill:`, `Harness:`, `Inv #N:`); the suggested fix mentions two distinct concerns that map to different repo owners; the filing repo has no concrete deliverable for either half.

Always name the sibling repos explicitly in the pushback and include a contrast anchor (e.g., an MCP-side mirror issue) so the reporter has a concrete reference for what a correctly-scoped issue in *this* repo looks like.

<!-- promote-candidate:cross-repo-scope -->
When a misrouted issue's fix splits across two sibling repos, pre-flight searches in both target repos before posting pushback are important. The presence or absence of existing trackers in each sibling materially changes which resolution path (split-and-refile vs. close-and-defer) is cheapest for the reporter. Issues with layer-prefix titles (`Skill:`, `Inv #N:`) filed against an MCP or orchestration repo are a reliable signal that the split-search step is needed.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#579 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Title prefix 'Skill:' (or other domain prefix) signals wrong-repo filing — verify tool surface before acting

**When an issue title carries a domain prefix that belongs to a sibling repo (e.g. 'Skill:', 'SDK:', 'CLI:'), treat it as a wrong-repo-filing signal and halt before implementing anything.**

**Why:** Issues misfiled in MCP after originating in a skill/security/CLI layer waste implementation effort and can produce duplicate or contradictory fixes. The prefix is the filer's own label of where the work lives.

**How to apply:** On triage, if the title prefix names a non-MCP domain: (1) grep the relevant tool surface in `src/` to confirm whether it even exists here; (2) check whether the parent tracker cited in the issue body is already closed-completed; (3) if both checks return 'nothing here', post pushback offering three paths — close-as-subsumed, refile skill-side, or harden the existing CLAUDE.md rule into a CI guard.

**Tells:** title starts with `Skill:`, `Rubric:`, `SDK:`, `Harness:`, or similar non-MCP label; grep for the relevant function name returns zero hits; a linked tracker shows `state_reason: completed`.

<!-- promote-candidate:cross-repo-split -->
Issues misfiled in MCP often carry their correct target repo as a title prefix ('Skill:', 'Harness:', 'SDK:', etc.). When a grep for the referenced tool surface returns zero matches in the MCP src/ tree and the parent tracker is already closed-completed, the MCP repo has no actionable surface — the correct response is pushback with a refile suggestion to the named sibling repo, not implementation.
<!-- /promote-candidate -->

<!-- run:run-2026-05-02T06-32-08-433Z issue:#31 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## When a feature has multiple detection modes, defer any branch whose input signal does not yet exist

**Ship only the detection branches that are fully grounded by signals available today; leave schema fields and apply-branches for the PR that adds the missing signal.**

**Why:** Pre-building dead-code branches and registry fields (e.g., `retiredAt`, `retireReason`) for a mode that can never fire yet adds maintenance surface, misleads reviewers about feature completeness, and risks schema drift by the time the upstream signal actually ships.

**How to apply:** Before building each detection branch, confirm its input signal exists in the codebase or is delivered in the same PR. If it isn't, record the upstream gate explicitly in PR scope notes and emit zero proposals from that branch — do not stub it.

**Tells:** Issue covers two related cleanup actions (e.g., merge vs. retire); one action is gated on outcome metrics from a future issue; the temptation is to add stubs or empty schema keys "for completeness."

**Corollary:** A detection subcommand that emits zero proposals today because its signal hasn't landed is correct behavior, not a gap — document it as intentional rather than apologizing for it.

<!-- run:run-2026-05-02T10-31-33-192Z issue:#36 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Omit schema fields whose upstream producer does not yet exist

**When extending a data schema or adding a new one, leave out any field whose input signal has no upstream producer yet — even if the issue spec lists it.** Ship with only the fields that can be fully populated by existing code.
**Why:** A stub field (always `null`, always `0`) misleads downstream consumers and auditors into believing a data flow exists. It also creates schema churn: the field must be re-introduced, re-typed, and re-documented when the real signal arrives.
**How to apply:** If a field is gated on a sister issue that hasn't shipped, record the omission explicitly in the PR description and scope notes (e.g. 'costUsd omitted; joins schema in the PR that ships #34'). The field's owning PR adds it atomically with the producer.
**Tells:** Field names tied to a sibling tracking issue still open; columns like `$/merge` or `cost-per-X` when no cost-capture module exists yet; spec language like 'once #N lands'.
**Contrast:** Do not add `// TODO: populate when #N ships` placeholders in the schema type — the absence of the field is the correct state until the producer exists.

<!-- run:run-2026-05-03T05-54-13-869Z issue:#54 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Deduplicate cross-module parsers into a typed util with Zod schema and smoke tests

**When two or more modules contain near-identical parsing or transformation logic, extract it into `src/util/` as a single generic typed helper rather than letting copies diverge.**

**Why:** Diverging copies accumulate subtle differences silently — a resilience fix applied to one copy is missed in the others. Four independent `parseJsonLoose` implementations had drifted from each other, meaning bugs fixed in one were still present elsewhere.

**How to apply:** On any refactor touching parsing/serialization in 2+ modules: (1) audit for duplicate logic first, (2) extract to `src/util/<helperName>.ts` with a generic `<T>` and a Zod schema parameter for runtime validation, (3) add a comprehensive smoke-test file covering all input variants (bare object, fenced-tagged, fenced-untagged, stray brace, malformed JSON, schema mismatch), (4) wire `npm test` in `package.json` and add the CI step in the same commit.

**Tells:** Multiple files each define their own `parseJson*` or `extract*` helper; they share recognizable three-candidate logic (bare / fenced-tagged / fenced-untagged) but live in separate modules; the functions have drifted in minor ways (whitespace handling, error return shape).

<!-- run:run-2026-05-05T11-30-15-426Z issue:#95 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Extract safety-net predicates into pure helpers; enumerate all non-clean exit subtypes plus a catch-all

**When a partial-branch safety-net predicate grows beyond one `errorSubtype` match, extract it into a named pure helper (e.g. `shouldPushPartial`) and enumerate every known non-clean exit shape plus a catch-all.**

**Why:** A single inline guard (`errorSubtype === "error_max_turns"`) silently leaves other non-clean exits — `error_during_execution`, `error_max_budget_usd`, SDK-untagged throws — without the same value-preservation guarantee. The gap only surfaces when a second exit variant ships.

**How to apply:** Move the full predicate to a standalone helper file the moment a second condition is added. List each known subtype explicitly, then close with `isError && !envelope` as a catch-all. Pass `result.errorSubtype ?? "unknown"` to the salvage commit message so the catch-all path still produces a legible log. Wire the new `*.test.ts` file into the test glob immediately.

**Tells:** A single `errorSubtype === "..."` guard inside `runIssueCore`; an issue requesting safety-net coverage for a new exit shape; a new budget or timeout subtype being introduced.

<!-- promote-candidate:safety-net -->
The orchestrator's partial-branch push guard covers four non-clean exit shapes: `error_max_turns` (turn limit), `error_during_execution` (mid-tool-use throw), `error_max_budget_usd` (budget exhaustion), and a catch-all `isError && !envelope` for SDK exits with no recognized subtype. All four have identical value-loss semantics — partial worktree work is silently discarded without the salvage push. Extracting the predicate into a pure helper lets each case be unit-tested independently and makes future subtypes addable without touching orchestrator core logic.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T14-26-37-251Z issue:#639 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## In agent-facing docs, gate every concrete command behind a heading-anchored branch — prose routing hints do not bind ...

**Prose-only routing hints inside a flat bullet list are insufficient when multiple client/OS/environment branches share one section.** Agents read linearly and execute the first concrete command they encounter, regardless of prose like "Match Step 0's host client" placed above it.

**Why:** A previous prose-only fix to Step 2 of AGENTS.md failed in practice: `claude mcp add` was the first shell command in the section, so agents ran the Claude Code CLI path unconditionally even when operating under a different host client.

**How to apply:** Whenever writing or revising an AGENTS.md section that has per-client, per-OS, or per-environment variants, replace the bullet-list-with-prominent-first-command shape with `####` (or deeper) subsections — one per branch. No concrete command or config snippet should appear before the first such heading. The agent must pass through a named heading to reach any actionable content.

**Tells:** A section whose first bullet happens to be the 'most common' client path; prose above saying 'pick the right one' or 'if unsure, ask'; prior fix that added a sentence but left command order unchanged.

<!-- promote-candidate:docs-routing -->
In documentation intended for agent consumption, heading-anchored subsections (e.g. `#### Claude Code (CLI)`, `#### Claude Desktop`) enforce branch commitment before any concrete command is visible. A flat bullet list where one client's command appears first causes agents to run that command unconditionally, regardless of prose routing hints placed above it. Prose like 'match your host client' or 'if unsure, ask' does not prevent agents from executing the first shell command or config snippet they encounter in the section.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#569 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Metadata-only collection tools create fabrication pressure for ranked-intent queries — add a grounded listings tool

**When a `get_X_collection`-style tool exposes only aggregate metadata (floor, volume, holders) and a user asks "show me the N cheapest / ranked" items, add a separate `get_X_listings` tool sourced from the live order book — never overload the metadata tool with ranked data.**
**Why:** Smoke tests confirmed the agent correctly refused to fabricate, but refusal-without-source is poor UX and unsustainable. The right fix removes fabrication pressure by grounding the response in real ranked order data.
**How to apply:** Any `tool_gap` issue citing metadata-only coverage + a ranked/actionable user intent warrants a new tool hitting the actual ask endpoint (e.g. Reservoir `/orders/asks/v5?status=active&sortBy=price&sortDirection=asc`).
**Tells:** issue label `tool_gap`; existing tool description says "metadata-only"; smoke-test scenarios with "N cheapest / N ranked" wording.
- Schema-cap page size (≤10) to bound the fabrication surface and keep responses inspectable.
- Filter collection-bid orders so every row names a concrete `tokenId` — mixed order types from the same endpoint will otherwise yield ungrounded rows.
- When the downstream fill path (buy/swap/approve) is not yet implemented, document the boundary in both the tool `description` AND in handler-emitted `notes[]` so a cooperating agent surfaces it verbatim rather than inventing a workflow.

<!-- promote-candidate:reservoir -->
Reservoir `/orders/asks/v5` returns a mix of token-level asks and collection-bid orders in the same response. Token-level asks carry `criteria.data.token.tokenId`; collection-bid orders do not. Callers that want only individually-priced listings (e.g. floor-sweep candidates) must filter rows where `tokenId` is absent — otherwise the result set includes collection-wide bids that cannot be attributed to a specific item and inflate apparent liquidity.
<!-- /promote-candidate -->

<!-- run:run-2026-05-01T14-48-57-664Z issue:#610 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Enrich opaque third-party SDK errors with a diagnostic read probe on failure

**When a third-party SDK swallows HTTP response bodies and surfaces only `statusText` (e.g. "Unprocessable Content"), wrap the SDK call in try/catch, issue a lightweight read probe against the same service on failure, and re-throw an enriched error that includes: (1) the original SDK message verbatim, (2) current service-side state from the probe (or a 404 signal), (3) any routing-decision hints, and (4) chain/signer/address context.**

**Why:** SDKs such as Safe API Kit only extract the response body when its JSON matches a hard-coded key allowlist (`data`, `detail`, `message`, `nonFieldErrors`, …); any other shape falls through to `throw new Error(response.statusText)`. Callers receive no actionable signal, making silent 422s impossible to debug without reading SDK internals.

**How to apply:** Any time you own a thin wrapper around a third-party HTTP SDK that can return 4xx errors — especially for write/mutate operations — add a post-failure probe (a corresponding read/get call) to recover service state before re-throwing. Keep the original message intact so upstream logs are not corrupted.

**Tells:** opaque error strings like "Unprocessable Content" or "Bad Request" with no body detail; SDK source shows `response.statusText` as fallback; issue title contains words like "opaque", "no detail", "no context"; write operation (propose/confirm/sign) paired with a sibling read endpoint (getTransaction, getStatus).

**Constraint:** the probe must be read-only and must not alter state; catch and swallow probe failures so the enrichment step never masks the original error.

<!-- run:run-2026-05-01T18-04-35-881Z issue:#610 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Enriching SDK write errors: probe with a read call and report three state branches

**When a third-party SDK write call (propose, confirm, submit) throws only the HTTP status-text (e.g. 'Unprocessable Content'), assume the SDK's internal response-body extractor has a hard-coded key allowlist that drops validation error payloads — the real detail is never surfaced by the SDK itself.**

**Why:** `@safe-global/api-kit`'s `sendRequest` only extracts the response body when the JSON shape matches a fixed set of keys; Safe Transaction Service 422 validation errors use field-keyed shapes that miss the allowlist, so the SDK falls through to `throw new Error(response.statusText)` with no further context.

**How to apply:** Wrap every write call in an `enrichXxxError` helper: on catch, immediately issue an equivalent read-only probe (e.g. `getTransaction(hash)`) and re-throw a new error that includes (a) the original SDK message verbatim, (b) one of three probe outcomes — `known` (service already has the record), `not-found` (service has never seen this hash), `probe-failed` (the read itself threw), and (c) chain / signer / contract address context so the caller can act without guessing.

**Tells:**
- Error message is a bare HTTP reason-phrase with no field detail (`Unprocessable Content`, `Bad Request`)
- SDK is a wrapper around a REST service that returns structured validation errors
- The failing call is a state-mutating write where an idempotent read counterpart exists

**Unit-test coverage:** write one test per probe branch (known / not-found / probe-failed); do not rely on integration tests to catch probe regressions.

<!-- run:run-2026-05-05T14-26-37-251Z issue:#604 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Keep config-status apiKeys map in sync with wizard fields and resolver functions

**When the setup wizard gains a new credential field OR a new `resolve*ApiKey` helper is introduced, update `get_vaultpilot_config_status.apiKeys` in the same PR.** The wizard and the diagnostic tool are separate code paths that silently drift apart.

**Why:** `configureSafe` and `resolveSafeApiKey` shipped months before `apiKeys.safe` was added to the diagnostic output — leaving the canonical "is my server configured?" tool blind to the Safe key. The demo-mode suppression check also missed it.

**How to apply:** Any PR touching a `configure*` wizard step or a `resolve*ApiKey` function must also patch `src/modules/diagnostics/index.ts`: add the key to `apiKeys` with `{ set, source }`, mirror the same env-var > config precedence as the resolver, fold the key into the demo-mode-hint suppression check, and add unit tests for env-var path, config path, and demo-hint self-clear.

**Tells:** `apiKeys` entry count is less than the number of `resolve*ApiKey` functions; a wizard `configure*` step landed without a companion diagnostics change; demo-mode hint fails to self-clear when a new key is populated.

<!-- promote-candidate:diagnostics -->
In vaultpilot-mcp, the setup wizard (`configure*` functions) and the `get_vaultpilot_config_status` diagnostic tool are independent code paths that enumerate supported credentials separately. When a new credential is added to the wizard, the diagnostic `apiKeys` block is NOT updated automatically — it requires an explicit parallel change. The diagnostic tool mirrors each resolver's env-var > config precedence logic rather than calling the resolver directly, so both sites must be kept in step. A missing entry in `apiKeys` causes the demo-mode-hint suppression check to ignore that credential even when it is set.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#578 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## MCP issues requiring conversation-history access are skill-side scope, not MCP-code scope

**When an issue asks the MCP to disambiguate, recall prior turns, or resolve pronoun references (`my Safe`, `my multisig`), push back as scope-mismatch and file a companion skill-repo issue.** The MCP is stateless per-call: it receives only explicit parameters and has zero visibility into conversation history.
**Why:** Ambiguous self-references and attacker-planted candidates live in conversation context owned by the cooperating-agent layer — nothing in MCP code can inspect or enforce rules over them.
**How to apply:** Any proposed fix that requires the MCP to "check what was mentioned earlier" or "resolve an ambiguous reference across turns" is out of MCP scope by definition.
**Tells:** issue body references conversation history, pronoun references without an explicit address, `disambiguation` framing, attacker-planted-value scenarios.
**Cross-repo pattern:** post a scope-mismatch comment on the MCP issue; file the skill half (trigger list + refusal template) in the skill repo; cross-link both ways.

<!-- promote-candidate:safe -->
MCP tools that accept an explicit `safeAddress` parameter are stateless per-call and have no access to conversation history. Disambiguation rules for ambiguous self-references (`my Safe`, `my multisig`) cannot be enforced at the MCP layer — they can only be enforced by the cooperating agent that constructs the call. Issues filed against a Safe/multisig MCP that require conversation-context reasoning are scope-mismatch by definition; the correct fix is a companion skill or agent-behavior issue, not an MCP code change.
<!-- /promote-candidate -->

<!-- run:run-2026-05-03T05-54-13-869Z issue:#64 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Agent display names must always come from the human-name pool, never from topical labels

**Rule:** Any code path that creates or stores an `AgentRecord` must obtain the display name via `pickName(id, takenNames)` — never by reusing a proposal label, cluster title, section heading, or other descriptive phrase.

**Why:** Split-children were persisted with `cluster.proposedName` (e.g. "Rogue-MCP Trust Boundary") as their `name` field. These read as topic labels, not identities, and broke the visual convention of curated single human names (Ada, Erlang, Khwarizmi, Tesla, …) that all freshly-minted agents share.

**How to apply:** Whenever a new agent record is constructed — whether from a split, a spawn, a clone, or a registry migration — call `pickName(id, takenNames)` for the stored `name`. Keep any proposal/cluster label in memory for logging or display in `formatProposal`, but never persist it as the agent identity.

**Tells:**
- A `proposedName`, `clusterName`, `topic`, or similar field being assigned directly to `AgentRecord.name`
- Multi-word or hyphenated strings appearing as agent names in registry output
- Bespoke collision-fallback logic adjacent to name assignment (a sign `pickName` is being bypassed)

<!-- run:run-2026-05-04T14-08-59-410Z issue:#70 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Sync agent-seed surfaces when a global CLAUDE.md discipline changes

**When a canonical rule is updated in CLAUDE.md, grep every prompt-building surface for the old rule text and update it before closing the issue.**

**Why:** Seed surfaces (`workflow.ts` Step-2 judgment rules, `specialization.ts` GENERIC_SEED, and similar prompt constructors) often duplicate global discipline text verbatim. When the canonical source changes, those copies drift silently — every freshly spawned agent inherits the superseded rule while the rest of the system has moved on.

**How to apply:** After any discipline rename or rewrite in CLAUDE.md, run a project-wide grep for the old discipline name *and* its key phrases (e.g. `Smallest-Solution`, `smallest change first`). Any match in a prompt-builder file is a required sync, not optional cleanup.

**Tells:** Files that construct a system/seed prompt for sub-agents — commonly named `workflow.ts`, `specialization.ts`, `seed.ts`, or anything that appends a numbered rule list into an LLM call.

**Check:** Build + tests must pass after the sync; a discipline change that compiles but ships stale text to agents is a silent regression.

<!-- run:run-2026-05-05T14-26-37-251Z issue:#598 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Distinguish native USDC from bridged USDC.e when a signing flow targets an L2 USDC contract

**When a `prepare_*` or `preview_send` call targets a USDC contract on an L2, verify whether the address is native USDC (Circle CCTP-issued) or USDC.e (bridge-wrapped) — they are NOT interchangeable.**

**Why:** Advisory/educational misdirection (prose only) is out of MCP scope, but the same confusion becomes an in-scope Role B finding the moment a `prepare_*` call carries a wrong-chain USDC address. The two token types differ in liquidity, redemption path, and security guarantees.

**How to apply:** Fires when a signing flow includes a USDC token address on Arbitrum, Optimism, Polygon, Base, or similar L2s. Cross-reference the address against known canonical USDC vs USDC.e contracts; surface a mismatch warning before the sign step.

**Tells:** token symbol shows `USDC` but address matches a known bridge wrapper; transaction context mentions bridging or L2; destination chain differs from Ethereum mainnet.

<!-- promote-candidate:usdc-bridged-variants -->
On Arbitrum, Optimism, Polygon, and Base, two distinct USDC contracts coexist: native USDC (Circle CCTP-issued) and USDC.e (bridge-wrapped variant). They share the 'USDC' symbol in many UIs but carry different addresses, liquidity profiles, and redemption paths. A transaction targeting USDC.e when native USDC is intended — or vice versa — may strand funds in an illiquid pool or fail destination-chain redemption. This distinction is frequently absent from newcomer L2 education prose, making it a recurring source of confusion and a plausible misdirection vector in agentic bridging workflows.
<!-- /promote-candidate -->

<!-- run:run-2026-05-02T06-32-08-433Z issue:#29 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Centralize SDK native-binary overrides in a single helper, not at each call site

**When an SDK resolves a native binary per-platform (e.g., musl-first on Linux, breaking glibc hosts), create one `*BinPath()` helper that reads the env-var override and returns the resolved path; pass its result to every `query()` / SDK call site from that single source.**

**Why:** Patching individual call sites lets any new call site silently regress to the broken default. A central helper guarantees every future consumer inherits the override automatically without an explicit checklist.

**How to apply:** Whenever an SDK exposes a path option (e.g., `pathToClaudeCodeExecutable`) that must be set consistently across multiple invocation sites, extract it into a dedicated module (e.g., `src/agent/sdkBinary.ts`) that reads the env var once and returns the value.

**Tells:**
- Multiple call sites passing the same SDK constructor/option with copy-pasted logic
- Runtime 'binary not found' error that succeeds manually when the path is overridden
- Linux-only crash where the SDK prefers a musl ELF but the host is glibc (or vice-versa)
- The issue enumerates N call sites but the codebase actually has N+1 — centralization catches them all

**Also:** Add a README troubleshooting entry naming the env-var override so operators can self-serve without reading source code.

<!-- run:run-2026-05-04T14-37-10-004Z issue:#33 outcome:failure-lesson ts:2026-05-09T05:42:15.897Z -->
## Consolidate commit-phase steps to avoid turn exhaustion before final git commit

**After tests pass, commit within 2 turns: combine `git add` and `git commit -m "..."` in one Bash call — no interim diff reviews, no temp-file message drafts, no redundant `git status` or `git fetch` calls.**
**Why:** Agents burn turns in the cleanup phase (reviewing diffs of already-reviewed files, writing commit messages to `/tmp/`, re-running builds that just passed) and hit the 50-turn ceiling before issuing `git commit`, leaving complete, tested work uncommitted.
**How to apply:** The moment `npm test` (or equivalent) is green and you know which files changed, issue `git add -A && git commit -m "<message>"` immediately — one Bash call. Don't split staging, committing, and verification across separate turns.
**Tells:** Last tool calls show ≥3 consecutive git diff / git status / git fetch / Write-to-/tmp/ calls with no `git commit` issued — the agent is in stall-loop review mode after implementation is already done.
**Guard rule:** Never write a commit message to a temp file; write it inline. Never re-run a build that just passed clean. If you catch yourself doing either, skip straight to the commit call.

<!-- run:run-2026-05-05T14-26-37-251Z issue:#638 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Hybrid tool-surface: add per-protocol prepare_* only when it encodes prepare-time invariants; route long tail through...

**Rule:** A dedicated `prepare_<protocol>` tool earns its place only when it must encode prepare-time invariants that a generic call cannot enforce — slippage/MEV guards, pause/cap preconditions, atomic approve+action bundling, non-standard token semantics, or durable binding per Inv #15. Everything else belongs in `prepare_custom_call`.

**Why:** A full pivot to a single generic tx tool silently drops safety preconditions that must be checked at prepare time, not at signing time. Conversely, proliferating per-protocol tools without a generic escape hatch leaves novel or niche protocols unserviceable.

**How to apply:** For any new protocol or action type, ask: "does this call site require a prepare-time invariant the generic tool cannot enforce?" Yes → add a dedicated tool. No → direct callers to `prepare_custom_call` + `get_contract_abi` + `read_contract`.

**Tells:** Issue frames a binary choice between "generic tx tool" and "keep per-protocol tools"; protocol has unusual fee/slippage semantics; action must bundle approve+action atomically; a pause/cap/threshold check must gate the prepared tx.

<!-- promote-candidate:tool-surface -->
In DeFi MCP servers the decision between a per-protocol specialized tool and a generic escape hatch consistently resolves to a hybrid: per-protocol tools exist specifically to enforce prepare-time invariants (slippage, MEV, pause checks, atomic bundling). A generic `prepare_custom_call` tool backed by `get_contract_abi` and `read_contract` adequately covers the long tail of novel or niche protocols. Safe, Rabby, MetaMask Snaps, and Phantom all follow the same pattern — structured flows for known high-risk paths, raw call surface for everything else.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#652 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Verify 4-byte selectors and topic hashes against viem/ethers — never trust plan literals

**Always recompute ABI-derived constants (4-byte selectors, event topic hashes) from the canonical signature rather than copying them from design docs, archive plans, or inline comments.**
**Why:** A one-nibble difference — e.g. `0xa22cba26` vs `0xa22cb465` for `setApprovalForAll(address,bool)` — is visually plausible, compiles cleanly, and passes lint, but causes the classifier branch to never fire, silently defeating the security control.
**How to apply:** Whenever a selector literal appears in a spec, plan, or existing codebase, recompute it with `viem`'s `toFunctionSelector(sig)` or `ethers.id(sig).slice(0,10)` before writing it into source or tests. Treat this as a mandatory one-liner verification, not an afterthought.
**Tells:** `0x` eight-hex-char constants in design docs; selector tables in architecture notes; comments of the form `functionName(…) 0xXXXXXXXX`; any selector copied from a PR description or archive plan.

<!-- promote-candidate:erc20 -->
ABI-derived 4-byte function selectors and 32-byte event topic hashes in design documents and archive plans are a frequent source of one-nibble typos. The selector for `setApprovalForAll(address,bool)` is `0xa22cb465`; a circulated architecture plan had `0xa22cba26` — off by two nibbles in the 5th byte. Verification via `viem.toFunctionSelector` or `ethers.id(sig).slice(0,10)` is the authoritative check. Hardcoded selectors in classifier tables that are wrong will compile, pass all static checks, and appear correct in review, but will silently never match real calldata at runtime.
<!-- /promote-candidate -->

<!-- run:run-2026-05-01T17-27-23-838Z issue:#608 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Hardcoded cryptographic constants in tool descriptions and test fixtures must be independently verified

**Rule:** Any literal hash, selector, or other cryptographic constant embedded in a tool description or test fixture must be recomputed from its canonical source (e.g. `keccak256("ROLE_NAME")` via viem/ethers/cast) before the PR is merged — never trust the existing value.

**Why:** A wrong hash in a tool description is silently copied by agents into on-chain calls (`hasRole`, `getRoleMember`, etc.), producing false negatives on every query. The agent concludes 'no permissions' and pushes back to the user — a subtle, hard-to-diagnose failure that persists until the description is corrected.

**How to apply:** Whenever a doc-bug or test-fix touches a role hash, ABI selector, address checksum, or any other deterministically-derived constant, run an independent computation and diff it against the value in the file before editing.

**Tells:**
- Issue title contains 'wrong hash', 'incorrect hash', or 'typo' next to a hex literal
- Constant appears in both a tool description string and a test fixture comment claiming equality
- Failing calls return `false`/zero uniformly across all addresses (signals a bad input, not a logic error)

<!-- run:run-2026-05-01T18-04-35-881Z issue:#608 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Hardcoded crypto constants in tool descriptions silently poison agent behavior — recompute before editing

**Recompute every cryptographic constant independently before editing it in a tool description, schema comment, or inline doc — never trust the existing literal.**

**Why:** A wrong `keccak256` role hash in a tool description is copied verbatim by downstream agents into `hasRole` / `getRoleMember` calls. Unlike a type error, a wrong hash returns `false` silently — the agent concludes 'no role granted' and delivers a misleading answer with no error signal, making the defect invisible until a human notices the wrong conclusion.

**How to apply:** Any time you touch a tool description that contains a `bytes32` role hash, ABI selector, or any `0x…` documentation example, run the canonical computation (e.g. `viem keccak256`, `cast keccak`) and diff the result against the existing literal before writing the edit.

**Tells:** `keccak256("ROLE_NAME")`, `bytes32` role-hash comments, ABI 4-byte selectors, or any hex literal cited as a 'for example' in a tool description or schema docstring.

After correcting the literal in the primary file, **grep the full repo for the old value** — test fixtures and secondary docs frequently embed the same wrong constant and need a parallel fix in the same commit.

<!-- run:run-2026-05-05T11-30-15-426Z issue:#98 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Prefer `maxBudgetUsd` over `maxTurns` as the primary SDK pass stop criterion

**Never use a hardcoded `maxTurns` as a cost proxy in `runSdkPass()` calls.** Supply `maxBudgetUsd: tracker.remainingBudget()` instead, drawn from the run-level `RunCostTracker`.

**Why:** A hardcoded turn ceiling fires at a semantically arbitrary mid-edit boundary. A 9-file plan twice hit `error_max_turns` mid-edit despite forward progress, burning ~$8.30 with no recovered work. The budget ceiling fires at the same dollar threshold but at a cleaner stop point.

**How to apply:** Every `runSdkPass()` call — pass 1 AND all recovery passes — must read `tracker.remainingBudget()` so they share one budget envelope across the full run. Re-read the tracker *after* each pass so subsequent passes see the residual, not the pre-pass budget.

**Tells:** Any `runSdkPass()` with a literal `maxTurns` value; any recovery pass that resets turn count rather than reading residual budget.

**Also:** Extend recovery-trigger logic to catch `error_max_budget_usd` alongside `error_max_turns` — budget exhaustion mid-edit deserves the same truncation-recovery treatment as a turn-count stop.

<!-- promote-candidate:coding-agent -->
In the VaultPilot SDK, `maxTurns` and `maxBudgetUsd` are independent query-level constraints. Using `maxTurns` as a cost proxy causes abrupt mid-edit stops at semantically arbitrary turn boundaries. Threading `RunCostTracker.remainingBudget()` into every pass (main + recovery) as `maxBudgetUsd` gives a shared cost envelope across the full run and fires at a cleaner boundary. Recovery triggers should handle `error_max_budget_usd` the same way they handle `error_max_turns`.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T14-26-37-251Z issue:#637 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Separate pure analytics from spawn/RPC plumbing in MCP diagnostic scripts

**When adding a `bench:*` or diagnostic runner that spawns the MCP server, extract all stateless computation into a pure module; keep the runner as a thin I/O shell.**

**Why:** Pure functions (byte-counting, token estimation, table formatting) can be exhaustively unit-tested without a live server. Mixing analytics with spawn/JSON-RPC couples test reliability to server availability, inflates integration-test surface, and makes CI brittle.

**How to apply:** Any time a script performs `initialize` + `tools/list` (or similar RPC) and then formats output — funnel the parsed payload into a dedicated `src/diagnostics/*.ts` module; keep the runner (`scripts/*.mjs`) as a thin shell that only handles process lifecycle and stdio. Write unit tests against the pure module alone.

**Tells:** Script reads from a child-process stdout, parses JSON-RPC frames, then computes metrics or renders tables — signals that all math/formatting belongs in a separately testable file.

<!-- promote-candidate:benchmarking -->
In a representative MCP server build (188 tools, ~323 KB total static surface), input JSON schemas account for ~54% of per-conversation token cost while tool descriptions account for ~44%; the remainder is envelope/field-name overhead. A chars/4 approximation is sufficient for relative ranking across tools — exact tokenizer output is not needed to identify the heaviest tools. When prioritizing token-reduction efforts on MCP tool surface, trimming or lazily-loading input schemas yields a larger return than shortening description text.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T16-51-01-872Z issue:#133 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## When an issue body self-proposes a phase split, treat that split as mandatory at pre-dispatch

**When an issue body contains an explicit phase-split or 'Suggested implementation split' section, push back on the combined scope — the split is mandatory, not advisory.**

**Why:** Issue authors who pre-propose splits have already diagnosed over-scoping; dispatching the combined scope burns turns on a predictable rejection and duplicates the author's own analysis.

**How to apply:** During pre-dispatch scope-fit check, scan the issue body for phase-split language ('Phase 1/2', 'Suggested split', 'dependency seam', 'imports X constant'). Evaluate each phase independently against the 5-file threshold (with 1.5× calibration). Name the dependency seam explicitly in the pushback comment and recommend filing as sequential issues, citing any prior split pattern (e.g., #34 → #85+#86) as precedent.

**Tells:** 'Phase 1', 'Phase 2', 'Suggested implementation split', 'clean dependency seam', 'imports [Phase 1 export]' anywhere in the issue body.

**Bonus sweep:** Grep `src/` for the relevant model/constant patterns during scope inspection — issue authors routinely miss 1–2 files that belong in Phase 1's migration list. Name them in the pushback so re-filed issues are complete from the start.

<!-- promote-candidate:pre-dispatch-scope-fit -->
Issue bodies that contain explicit 'Phase 1 / Phase 2' or 'Suggested implementation split' sections reliably signal that the combined scope exceeds the per-issue budget. Each such issue tends to have a named dependency seam (e.g., Phase 2 imports a constant exported by Phase 1). The combined stated file count, after the 1.5x under-count calibration, consistently lands above the 5-file pre-dispatch threshold. Grepping source files for the relevant model/constant patterns during scope inspection typically surfaces 1–2 additional files the issue author omitted; these belong in the first phase's migration list. Recommending sequential issue filing with the dependency seam named in the pushback comment is the correct resolutio
[…truncated]

<!-- run:run-2026-05-05T17-13-23-624Z issue:#139 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Consolidate scattered model literals into env-overridable registry and emit resolved map at startup

**When multiple call sites each carry their own hardcoded model string, create a single registry module with one named export per call site, apply a `NAMESPACE_CALLSITE_MODEL` env-var override per constant, and emit the fully-resolved map in the earliest lifecycle log event (e.g., `run.started`).**

**Why:** Scattered literals drift independently — tier changes require touching every call site, and there is no single place to confirm what is actually running. Env-overrides let cost-sensitive operators downshift without code changes. Logging the _resolved_ values (after env application, not the raw defaults) is the only reliable signal that the running process uses the intended tier.

**How to apply:** Triggers whenever an issue asks to "consolidate" or "centralize" model strings, or grep reveals the same model literal in 3+ files. (1) Create the registry module first. (2) Per constant: `process.env.VP_DEV_CALLSITE_MODEL ?? DEFAULT_LITERAL`. (3) Emit the full resolved object in the startup log — never the raw defaults. For phase-split issues where Phase 1 is the registry, stub out future-phase constants now to reserve namespace.

**Tells:** Multiple files import from `@anthropic-ai/claude-agent-sdk` with identical or near-identical model strings; issue title contains "consolidate" or "single source of truth"; phase label on the issue.

<!-- promote-candidate:env-overridable-config -->
Orchestrator model-tier registries that pair env-var overrides with startup log emission of the fully-resolved map (post-env application) provide both operator flexibility and operational observability. Logging raw defaults instead of resolved values misleads operators who have set overrides. The two concerns — override support and resolved-value logging — are most effective when introduced together in the same commit.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#576 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Fabricated advisory-text findings (CHECKS PERFORMED, preflight attestations) are unmitigatable at the skill layer

**When an issue reports a rogue agent fabricating advisory output — CHECKS PERFORMED blocks, 'Step-N preflight passed' claims, or in-chat audit trails — close as architectural gap without attempting a skill-layer fix.**

**Why:** A rogue agent reads any new invariant and either ignores it, omits the block, or emits a plausible-looking nonce/HMAC that the chat UI has no key to verify. The fabrication lives entirely in the agent's text output, bypassing every MCP call chain. Proposals like Inv #16 (HMAC/nonce signing of advisory text) fail at the same layer: the verifier is absent.

**How to apply:** The moment an issue asks skill rules to guarantee authenticity of agent-emitted attestation text (not MCP tool results), skip invariant drafting and go straight to rogue-agent-only triage. Post a close comment citing the canonical architectural-gap precedent and the cooperating-agent + rogue-MCP variant (Role B) covered by Inv #3.

**Tells:** 'fabricated CHECKS PERFORMED', 'fabricated Step-0/preflight', proposed HMAC or nonce signing of advisory text, issue asks how skill rules can 'detect' or 'prevent' a rogue agent from lying in chat output.

<!-- promote-candidate:advisory-layer-attack -->
Advisory-text attestation blocks (CHECKS PERFORMED, preflight summaries) emitted by an agent are pure text output with no MCP roundtrip backing. Any skill-layer invariant requiring a signed nonce or HMAC in that text still fails because the chat client has no shared key to run the verification. Defense against fabricated advisory text requires model-safety tuning or a chat-client output filter — not MCP skill rules.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#563 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Self-attestation compliance fields in MCP output weaken the CHECKS PERFORMED defense, not strengthen it

**Reject proposals that add structured 'compliance-reported' fields to MCP response payloads as a verification mechanism.**
**Why:** A rogue or compromised MCP that skips a required text block (e.g. `CHECKS PERFORMED`) fabricates a `directives_emitted` field just as easily; a skill rule that compares against that field can REPLACE text-scan with a weaker check — the forgeable field bypasses comparison while text-scan still catches the missing block.
**How to apply:** When an issue proposes a structured field in MCP output so a skill or harness can 'verify' directive emission, determine whether the new rule replaces or supplements the existing text-scan. If it could substitute, push back as a defense regression and offer the per-tool expected-directives map (skill-side only, zero MCP attestation) as the correct alternative.
**Tells:** fields named `directives_emitted`, `checks_performed`, `compliance_state` in MCP response schemas; skill logic that branches on field value rather than scanning response text; issue framing that conflates 'compromised' and 'buggy' MCPs as a single threat model.

<!-- promote-candidate:rogue-mcp-triage -->
In rogue-MCP threat models, the MCP server is treated as a potentially-hostile or compromised component. Adding a structured self-report field (e.g. `directives_emitted`) to MCP responses does not improve verification: the same adversary that omits a required text block also fabricates the field. A skill-side comparison rule keyed to the field value is bypassable, while existing text-scanning of response content remains effective. The more secure pattern is a per-tool expected-directives map maintained entirely on the skill/trusted side, with zero MCP-side attestation. Proposals that add structured self-attestation to MCP output and then add a skill rule comparing against it effectively replace a harder-to-spoof check with an easier-to-spoof one.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T20-22-10-610Z issue:#157 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Emit canonical monitoring-command breadcrumbs at CLI launch-time transitions

**Any CLI command that starts a long-running process and writes a run-ID / state file should immediately print the canonical status command before returning control.** Absent that breadcrumb, agents and operators default to shell forensics (`pgrep`, `ls -lt logs/`, manual grep) even when a first-class status path exists.

**Why:** The forensics pattern compounds: each downstream agent independently rediscovers the run state via indirect means, wasting turns and producing fragile, path-specific discovery logic. The fix is trivially cheap — one `process.stdout.write` block at the exact moment the run becomes active.

**How to apply:** Identify the line where the run ID / active-run marker is committed to disk (e.g., `writeCurrentRunId`). Immediately after that line, print `Run launched`, the run ID, and the exact invocations for spot-check (`vp-dev status`) and live-tail (`vp-dev status --watch`). Mirror a shorter hint wherever the 'confirm token' or plan summary is printed.

**Tells:** Issue titles or descriptions containing 'shell-grovel', 'pgrep', 'ls -lt logs', 'forensics', or 'how is the run going' — especially when a dedicated status subcommand already exists but isn't being used.

<!-- run:run-2026-05-05T22-03-52-041Z issue:#169 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Self-proposed phase split in an issue body is a mandatory scope boundary

**When an issue body itself proposes a Phase A / Phase B split with a named dependency seam, that self-proposed split is mandatory — push back and require two sequential issues before any implementation begins.**
**Why:** An author who names the sequencing dependency inside the combined issue is signaling scope overload. Bundling both phases in one dispatch defeats the stated precondition (e.g., the advisory dry-run must exercise real agent files before the destructive `--apply` sibling ships), and prior compact-feature precedent shows a single phase alone produces 700–800 lines of source + test.
**How to apply:** At pre-dispatch, scan the issue body for self-proposed splits. If a dependency is named — especially advisory-before-destructive — push back regardless of apparent implementation size or the author's intent to 'just combine them for convenience'.
**Tells:** Phrases like 'Phase A / Phase B', 'advisory predecessor', 'don't repeat the mistake of shipping the destructive sibling', or paired `--dry-run` / `--apply` with an explicit ordering note anywhere in the body.

<!-- promote-candidate:advisory-then-destructive -->
When a feature issue bundles an advisory (dry-run / read-only) phase with a destructive (write / apply) phase and explicitly names the sequencing dependency in its own body, the combined dispatch consistently fails the pre-dispatch scope-fit check. The advisory phase must be dispatched, merged, and exercised on real agent files before the destructive sibling is filed as a separate issue — not merely described as a future concern. A single advisory phase alone in this codebase has produced 700–800 lines of source and test; bundling both phases roughly doubles that before any safety validation has occurred on live data.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-51-54-224Z issue:#176 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## CLI review-gate commands must default to prose diffs, not just summary metrics

**When a CLI subcommand feeds a human review step before an irreversible action (`--apply`, `--confirm`), its default output must include a prose diff — not only a byte-savings count or aggregate score.**

**Why:** A byte-savings figure cannot answer 'is this rewrite correct?' Operators silently rubber-stamp the confirm-token when the output gives them nothing actionable to inspect. This failure mode directly blocked Phase B (`--apply`) adoption for `tighten-claude-md`.

**How to apply:** Any command pair of the form *propose → apply* or *preview → confirm* falls under this rule. Wire the diff on by default; provide `--no-diff` as the opt-out for batch or scripted callers.

**Tells:** subcommand output contains a count/score metric; a sibling `--apply` or confirm-token flag exists in the same flow; issue or tags include `operator-review`.

- `--json` mode is exempted — keep JSON payloads lean; JSON consumers can reconstruct diffs from source bodies if needed.
- Cap diff body lines (≈60) to avoid wall-of-text on large rewrites; fall back to summary-only below a minimum savings floor (≈50 bytes).
- For line-oriented content (CLAUDE.md sections), prefer LCS-based line diff over word diff.

<!-- run:run-2026-05-08T13-36-56-309Z issue:#199 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Stacking lesson-append gates: hard cost-forecast gate runs before soft utility gate with default-disabled threshold

**When adding a new hard-refusal gate to `maybeAppendSummary`, place it before the existing `predictedUtility` soft gate** so the cheap delta-computation can short-circuit without touching utility logic.
**Why:** Cost-forecast gate was initially threaded after the utility gate, causing unnecessary utility work on doomed appends; reordering eliminated wasted cycles and made gate semantics clearer.
**How to apply:** Any new gate in `maybeAppendSummary` should (1) default its threshold to `+Infinity` (gate disabled) until calibration data from ≥K triples justifies a concrete value, (2) expose opt-in via a named env var parsed by a dedicated `resolve*Threshold` function, (3) share the single `currentClaudeMdBytes` read already present in the function, and (4) live in a pure exported function with its own test file covering empty-file fast-path, default-disabled invariant, log contract, and env-parse edge cases.
**Tells:** Issue asks for a new append gate, filter, or threshold; `maybeAppendSummary` is the integration point; env var named `VP_DEV_*` controls the knob.

<!-- run:run-2026-05-09T00-00-27-940Z issue:#71 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Split stop-condition counters when matrix roles have different defensive responsibilities

**Split stop-condition counters whenever the matrix contains roles that are architecturally expected to produce the counted outcome.** A single `tricked_yes_count` gate fired on every non-trivial batch because advisory cells (A.5/C.5) are upstream-routed and designed to trick at the tool layer — their contribution always pushed the shared counter past the tight bound.
**Why:** Mixing "expected-failure" components with "must-be-clean" components under one threshold drowns the signal, causes alert fatigue, and hides real regressions in the tool-surface cells the gate was meant to protect.
**How to apply:** Before writing or editing a stop-condition rule, enumerate which matrix roles contribute to the counted metric. If any role is architecturally upstream-routed or advisory-only, partition it into a separate counter with its own (wider) bound and exclude it from the tight gate. Preserve the old aggregated field for back-compat but do not gate on it.
**Tells:** A stop-condition fires on every batch that includes advisory/routing cells; the issue description uses phrases like "spurious trigger" or "masking signal"; the matrix mixes defense-owner roles with pass-through or model-layer-safety roles.

<!-- promote-candidate:stop-conditions -->
In this smoke-test harness, stop-condition counters that aggregate over all matrix roles without partitioning by defensive responsibility will fire spuriously on any batch with non-trivial advisory cell share (A.5/C.5). Advisory cells route to the chat-client filter or model-layer safety and are architecturally expected to trick the user at the tool-surface layer, so they require a separate, wider bound rather than sharing the tight tool-surface gate. The pattern: partition the aggregator output into `tool_surface_tricked_count` (tight bound, ~2) and `advisory_tricked_count` (soft bound, ~8), expose both in `aggregate.json`, and write two distinct stop-condition rules instead of one combined rule.
<!-- /promote-candidate -->

<!-- run:run-2026-05-09T02-20-51-182Z issue:#268 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## When splitting a dispatcher prompt for caching, any tick-varying value must live in the volatile suffix

**When splitting a dispatcher prompt for caching, any tick-varying value must live in the volatile suffix — not the stable prefix — even if it feels structural.**
**Why:** Cap directives, current pending-issue lists, prior-attempt errors, and prefer-agent overrides all differ between ticks or between a first attempt and its validation retry; leaving them in the stable prefix silently busts the cache on every such change.
**How to apply:** Stable prefix = preamble + routing rules rewritten cap-agnostic + per-agent CLAUDE.md prose deduped against seed. Volatile suffix = pending issues + cap directive + prefer-agent override + prior-attempt errors + JSON shape directive.
**SDK wiring:** `systemPrompt: [prefix, SYSTEM_PROMPT_DYNAMIC_BOUNDARY]`, suffix passed as `prompt`; cache telemetry lives on `result.usage.cache_creation_input_tokens` / `cache_read_input_tokens`.
**Test discipline:** add byte-identity assertions on the prefix across (a) the validation-retry round-trip and (b) cap-shrinkage — those are the two most common invalidation paths.
**Tells:** routing rules that reference a specific agent cap, error strings in the system prompt, or issue lists embedded in the preamble — all signal prefix contamination.
<!-- promote-candidate:prompt-caching -->
The Agent SDK exposes prompt caching via `systemPrompt: string[]` with `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` as a sentinel element; the suffix is passed as `prompt`. Cache hit/miss telemetry is on `result.usage`: `cache_creation_input_tokens` and `cache_read_input_tokens`. Cap directives and per-tick state (pending issues, prior-attempt errors, prefer-agent overrides) must stay in the volatile suffix; only truly tick-invariant content (preamble, cap-agnostic routing rules, static CLAUDE.md prose) belongs in the stable prefix. The most common invalidation paths are the validation-retry round-trip and cap-shrinkage between ticks.
<!-- /promote-candidate -->

<!-- run:run-2026-05-02T10-31-33-192Z issue:#55 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Verify all named prerequisites are merged before implementing dependency-gated issues

**Rule:** When an issue explicitly defers to another (e.g. 'pick up after #N lands'), check *every* prerequisite — the blocking issue AND any data-source or infrastructure PRs it depends on — are merged to `main` before writing a single line of implementation code.

**Why:** Implementing half of a multi-part feature (e.g. surfacing triage cost with no projected-dispatch-cost anchor) can land a worse UX than doing nothing — partial cost surfaces, inconsistent UI rows, or silent scope expansion into undesigned territory.

**How to apply:** On any issue that contains phrases like 'depends on', 'pick up after', 'blocked by', or lists a sibling issue number in its body, run `gh issue view <dep>` and `gh pr list` to confirm merged state before proceeding. If any named dependency is still OPEN or its PR is unmerged, post a pushback with the specific gap and ask the user to choose: hold, expand scope, or accept a flagged skeleton.

**Tells:**
- Issue title or body contains 'depends on #N' or equivalent
- A data-source PR (e.g. one introducing a new field consumed by this issue) exists but is unmerged
- The issue describes UI output that requires a value only another issue's code will produce

<!-- run:run-2026-05-04T14-37-10-004Z issue:#55 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Break dependency-chain stalls by making the missing anchor field optional and omitting its display row

**Rule:** When an issue's display row depends on an upstream that is itself blocked, add the dependent value as an *optional* field on the shared struct, gate the rendered row on *presence* (not on zero), and ship the issue standalone with a scope note that the upstream will slot in when it lands.

**Why:** A stalled upstream can block an otherwise self-contained change indefinitely. Making the field optional decouples the two issues: the row simply doesn't appear until the upstream ships, which is the correct UX — a zero-valued or 'N/A' row would be worse than no row.

**How to apply:** Identify whether the blocked dependency is *strictly required* or only needed for one display row. If the latter, scope the issue to the optional-field pattern, note the integration point in a `scopeNotes` comment, and proceed. Update tests to assert the row is absent (not zero) when the field is undefined.

**Tells:** Issue title says 'depends on #N'; the dependency is marked blocked or awaiting another fix; the missing data is already logged elsewhere and only needs to be threaded to the UI.

<!-- run:run-2026-05-05T11-30-15-426Z issue:#99 outcome:failure-lesson ts:2026-05-09T05:42:15.897Z -->
## Budget arithmetic tests: use approximate equality to avoid float-precision fix loops

**When implementing cost-estimation or budget-gate features, define a float-tolerant assertion helper before writing any test that subtracts or accumulates USD values.**

**Why:** Derived budget values like `5.0 - 3.6` evaluate to `1.3999999...` in IEEE 754; exact `assert.equal` fails, pushing the agent into a run-test → edit-assertion → run-test loop that burns turns without converging — lethal under a 50-turn ceiling.

**How to apply:** At the top of every cost/budget test file, declare a `closeEnough(a, b, tol = 0.001): boolean` helper and use it for every `remainingBudgetUsd`, `totalForecast`, or accumulated-cost assertion. Never use strict equality on a float derived from subtraction or multi-step accumulation.

**Tells:** Repeated `Edit` + `Bash npm test` alternation on the same test file; `old_string` references `remainingBudget`, `totalForecast`, or similar fields; expected vs actual values differ by < 0.01.

**Recovery heuristic:** If two successive test-fix attempts fail on the same assertion, stop and introduce the tolerance helper before any further edits — don't keep adjusting the literal value.

<!-- run:run-2026-05-05T14-26-37-251Z issue:#636 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Fee preview in prepare_* responses: position first, store native+USD, return null on failure

**Place `renderCostPreviewBlock` output at the top of every `prepare_*` response, ahead of VERIFY BEFORE SIGNING and the full verification stack.** Users can abort on fee shock fastest when the cost line is the first thing they read; burying it below a long crosscheck table wastes attention they've already spent.
**Why:** The verification render pipeline historically emitted VERIFY BEFORE SIGNING first, so a surprising fee was only visible after the user had already read the whole block.
**How to apply:** Any new `prepare_*` handler or render-pipeline change must place the cost block first. Chain handlers that lack a precomputed cost field (TRON, Solana, BTC, LTC) must omit the block entirely rather than fabricate one — `renderCostPreviewBlock` returns `null` on estimation failure, not `"~$0.00"`.
**`enrichTx` must store both `gasCostUsd` (USD float) and `gasCostNative` (string, 18-decimal normalized).** When the USD price feed degrades, the renderer falls back to native-only display; when gas estimation itself failed, it stays silent.
**Tells:** price-oracle timeout in `enrichTx`; `gasCostUsd` absent but `gasCostNative` present; adding a new EVM `prepare_*` handler; touching the render-verification pipeline.

<!-- promote-candidate:evm-cost -->
EVM `prepare_*` handlers have precomputed `gasCostUsd` and `gasCostNative` fields available after `enrichTx`; TRON, Solana, BTC, and LTC do not share this field shape and require separate fee-surfacing implementations. Rendering a cost preview line for EVM can be done with a single `renderCostPreviewBlock(enrichedTx)` call that returns null on estimation failure rather than a fabricated figure. The dual-field pattern (USD float + native string at 18 decimals) allows graceful degradation when price oracles are unavailable.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T16-20-40-497Z issue:#128 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Guarantee a stable parseable terminal sentinel on all long-running CLI stdout paths via try/finally

**Every long-running CLI command that external processes may tail or monitor must emit a stable, machine-parseable sentinel line as its final stdout output, guaranteed by a `try/finally` wrap so it fires on every exit path — success, error, budget-abort, maxTicks, and orchestrator-throw.**

**Why:** Without a terminal anchor, watchers (`tail -F | awk`, Claude Code Monitors, shell `until` polling) leak indefinitely until session exit. One stranded watcher per run compounds quickly across repeated invocations. The sentinel is the only reliable contract between the process and its observers.

**How to apply:** Whenever a CLI command spans multiple async phases (orchestration, tick loops, budget checks, resume logic), wrap the entire body in `try/catch/finally` and emit the sentinel in `finally` — never inside the `try` only. Emit to **stdout** (not stderr) so pipelines and `tail -F` catch it without redirection. Use `key=value` token format (`runId=... status=... total=N durationMs=N`) for easy `awk '/^sentinel.name /{ … }'` parsing.

**Tells:** Command runs for >1 async tick · has multiple abort/error paths · is documented as pipeable or tailable · sibling commands (`cmdRun`, `runResume`) share the same lifecycle pattern.

<!-- promote-candidate:cli-stdout -->
Long-running CLI commands in vp-dev (cmdRun, runResume) that external processes tail need a guaranteed final sentinel line on stdout. The pattern that works: wrap the full command body in try/catch/finally; emit a `key=value`-formatted sentinel in finally so it fires regardless of exit path (success, thrown error, budget abort, maxTicks). Watchers anchored on `awk '/^run.completed /{print; exit}'` can then terminate cleanly. Without this, watchers leak until session exit and compound across repeated runs.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T16-51-01-872Z issue:#136 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## New stdout output at run completion must precede the terminal sentinel, never follow it

**Any human-readable block emitted at run end — reports, summaries, cost rollups — must be written before the `run.completed` sentinel, never after it.**
**Why:** External watchers anchor on the sentinel being the absolute last stdout line; inserting new output after it silently breaks `tail -F | awk '/^run.completed /{exit}'`-style consumers with no error signal.
**How to apply:** In `cmdRun`, `runResume`, and any future run-completion path, emit new content in the `finally` block strictly before the sentinel write. Preserve pre-feature behavior with a `--no-report`-style escape-hatch flag so callers that don't want the extra block stay unaffected.
**Tells:** Any `process.stdout.write` addition inside a run-completion `finally` block; features that add lines "after" the run finishes; issues asking for richer terminal output at completion.
<!-- promote-candidate:watcher-contract -->
The `run.completed` sentinel line functions as a machine-readable termination anchor for external log-tail watchers. When `vp-dev run` or `vp-dev run --resume` adds new human-readable output blocks at completion, those blocks are inserted before the sentinel — never after — so that `tail -F | awk '/^run.completed /{exit}'` consumers remain correct without modification. A `--no-report` flag suppresses the new block, restoring the pre-feature stdout contract for callers that depend on minimal output.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T17-13-23-624Z issue:#137 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Every value baked into a plan→confirm previewHash must be persisted in the triage cache

**Every numeric/monetary field included in gate text (and therefore in the previewHash) must be explicitly serialized into the disk cache.** Un-persisted fields silently return zero on every cache hit, drifting rendered text between the cold `--plan` pass and the warm `--confirm` pass.
**Why:** `triageBatch` returned `costUsd: 0` on all cache hits because the field was never written to disk. `Triage cost: ~$0.0241` became `Triage cost: ~$0.0000` — a different string, a different hash, a spurious 'Plan diverged' on the very first `--confirm`.
**How to apply:** Whenever a cost, count, or timestamp field is added to gate text, immediately add it to the cache schema too. If caching is infeasible, exclude the field from the hash and store it only in the confirm token.
**Tells:** Divergence only on first `--confirm` after a cold `--plan`; the drifted line shows `$0.00` or `0`; error vanishes after cache clear; line diff points to a cost/count line.

<!-- promote-candidate:content-determined-rendering -->
In two-phase CLI flows (plan/confirm), gate text is hashed to detect drift between phases. Any numeric or monetary field included in that hash which is sourced from a disk cache must be explicitly written to the cache schema. Cache hits that omit a field silently return its zero-value, making rendered text differ between the cold (plan) pass and the warm (confirm) pass, producing a false divergence error on the first confirm after a fresh plan. The pattern is identifiable: divergence only on the first confirm after a cold plan, the drifted line shows a zero/empty value, and clearing the cache resolves it temporarily.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T17-42-15-244Z issue:#142 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## New CLI flags in --plan/--confirm two-phase workflows must be stored in the confirmation token with back-compat defaults

**When a CLI flag affects behavior that spans a `--plan` / `--confirm` two-phase run, persist it in `RunConfirmParams` at plan time and read it back at confirm time.**

**Why:** A flag that only exists at CLI-parse time is silently lost between the two phases. The `--confirm` invocation has no way to recover the operator's original intent without the token, causing the feature to appear wired but never fire on the confirm path.

**How to apply:** Any new field threaded through `OrchestratorInput → RunIssueCoreInput → CodingAgentInput → WorkflowVars` that traces back to a CLI flag and influences confirm-phase behavior must also get a matching optional field in `RunConfirmParams`. Thread the full chain end-to-end in one PR rather than splitting flag addition from wiring.

**Tells:** New `--foo` boolean flag; two-phase CLI with a persisted state/token between phases; existing `RunConfirmParams` shape; behavior 'should fire' but silently does nothing on `--confirm`.

**Back-compat rule:** Old tokens lacking the new field must deserialize cleanly — treat missing as `false` / `undefined`, never throw. Add at least one round-trip test that mints a token *without* the new field and asserts the confirm path still succeeds with the safe default.

<!-- run:run-2026-05-05T17-57-44-626Z issue:#149 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Formatter-pair edits surface new RunIssueEntry fields across all status paths at once

**Edit only `formatStatusText` and `formatStatusJson` to expose a new `RunIssueEntry` field everywhere.** All status-rendering paths — `vp-dev status` (text), `--json`, `--watch` NDJSON, and the end-of-run report — funnel through this formatter pair and require no independent changes.

**Why:** The formatter pair is the single source of truth for per-issue rendering. Touching individual CLI handlers, watchers, or report generators instead would create drift and missed surfaces, as happened when `nextPhaseIssueUrl` was persisted to state (#141) and wired to the CLI (#142) but never rendered.

**How to apply:** When a field already exists on `RunIssueEntry` (or the equivalent state entry type) but does not appear in user output — especially as a follow-up to a 'persist' or 'wire CLI flag' issue — go straight to the formatter pair. No other files need changing for display.

**Tells:** Issue title contains 'follow up', 'surface', 'expose', or 'render'; the field is already typed on the entry interface; prior issues persisted the value but only to raw state JSON.

<!-- run:run-2026-05-05T19-14-11-189Z issue:#650 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Thread every chain-queried fee field into the stash struct at pin time, not at render time

**When a new render block needs a live-chain value (e.g. `baseFeePerGas`), add that field to every stash / cached-pin struct at the moment the RPC call already happens — never re-fetch it downstream.**

**Why:** `baseFeePerGas` was queried at `pinSendFields` time but absent from `StashedPin`; cached re-pins silently dropped the EIP-1559 cost breakdown because the original RPC response was no longer reachable at render time.

**How to apply:** Before wiring a new renderer that consumes a chain-derived value, trace the data flow back to every struct that can short-circuit the RPC path (stash, cache, re-pin) and add the field there — parallel to already-stored siblings like `maxFeePerGas` or `gas`.

**Tells:** Renderer needs `baseFeePerGas` / `effectiveGasPrice` / `gasCostNative`; stash already carries `maxFeePerGas`, `nonce`, or `gas`; the pipeline has a pin phase that can be replayed from cache.

<!-- promote-candidate:eip-1559 -->
EIP-1559 cost blocks rendered at `preview_send` use the pinned tuple (baseFeePerGas + maxPriorityFeePerGas + gas) stored in `StashedPin`. effectiveGasPrice = baseFee + priority (capped at maxFee). The cost block is positioned as the FIRST human-readable block on a successful preview_send response so fee-shock signals are visible before the transaction hash. All three values (baseFeePerGas, gasCostNative, gasCostUsd) are computed once at pin time and forwarded through the envelope — no extra RPC call at render time.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T20-22-10-610Z issue:#156 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Any LLM pass whose cost appears in preview text must be cached by content hash

**Every LLM pass that contributes a cost line to preview text must persist its full output — decisions AND `costUsd` — to a content-keyed cache before the preview is rendered.**

**Why:** `previewHash` is computed over the full formatted preview string, including lines like `"Dedup cost: ~$X (already incurred)"`. LLM per-call billing is non-deterministic: identical inputs yield slightly different costs across invocations. Without a cache, `--plan` and `--confirm` each invoke the model, get different costs, render different strings, and the hash check rejects the confirm step.

**How to apply:** When wiring any new LLM pass into the pipeline, immediately add a write-through cache following the triage/dedup pattern: hash the input set (order-invariant content hash), check `state/<pass>/<repo>.json` on entry, return cached `{clusters, costUsd}` on hit, persist on miss. The cached `costUsd` is what `--confirm` must read — never a re-computed value.

**Tells:** `plan-confirm-divergence` tag; `previewHash` mismatch errors at confirm time; any pass with a `costUsd` field surfaced in `--plan` output but no corresponding `state/<pass>/` cache directory; issue titles containing "breaks previewHash" or "cost variance".

<!-- promote-candidate:preview-hash-determinism -->
In plan/confirm CLI workflows, `previewHash` is computed over the entire formatted preview string, including any rendered cost lines. LLM per-call billing is non-deterministic: even for byte-identical inputs, successive API calls return slightly different `usage` token counts and therefore slightly different USD amounts. Any pass that (a) calls an LLM and (b) surfaces its cost in the preview text will cause `previewHash` mismatch between `--plan` and `--confirm` unless the pass caches its output (including `costUsd`) keyed on a content hash of its inputs, and `--confirm` reads from that cache rather than re-invoking the model.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T20-46-43-739Z issue:#161 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Remediation hints must pre-check the target command's own eligibility before surfacing

**When a warning or diagnostic surfaces a 'run `vp-dev X <id>`' line, the formatting code must evaluate X's own hard preconditions — not only the caller's threshold — before choosing that branch of text.**

**Why:** The overload detector (CLAUDE.md >= 30 KB OR tags >= 50 OR issuesHandled >= 20) and the splitter clusterer (attributable sections >= `SPLIT_MIN_SECTIONS`) are independent; the pre-dispatch preview told operators to run `vp-dev agents split` for agents the splitter would refuse with 'Too few attributable sections (<4) to cluster meaningfully.' 4 of 5 flagged agents hit a dead-end UX.

**How to apply:** Any time a `formatXPreview` or status-formatter adds a remediation line, import and evaluate the target command's eligibility constant (e.g., `SPLIT_MIN_SECTIONS`) before selecting that branch. Fall through to an alternate path (e.g., compaction) when eligibility fails. Consolidate the floor into a single named export so both the command and the formatter share one source of truth.

**Tells:** Two subsystems with separate boolean thresholds; a hint that names a follow-up CLI command; that command has its own hard precondition that is NOT a subset of the caller's threshold.

<!-- promote-candidate:splitter-eligibility -->
The overload detector and the splitter clusterer carry independent eligibility criteria. An agent can exceed the overload threshold (CLAUDE.md >= 30 KB OR tags >= 50 OR issuesHandled >= 20) without meeting the splitter's hard floor (attributable sections >= SPLIT_MIN_SECTIONS, currently 4). Pre-dispatch preview code that surfaces a split hint without checking attributableSections will send operators to a command that hard-refuses. The fix is to extend the overload verdict with attributableSections and branch the remediation text at the formatter layer, using a single exported constant shared between split.ts and setup.ts.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-03-52-041Z issue:#168 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Relax a safety floor via an explicit opt-in flag, never by changing the default

**When an operator requests a lower threshold than an established safety floor, add a per-invocation opt-in flag — do not change the default.** The safe default exists to protect unattended / automated runs; changing it creates silent regression risk for every existing caller.

**Why:** A prior incident (floor raised from 2→3 because 2 was too aggressive for unattended compaction) is the historical contract behind the default. New feature requests that want the lower value are legitimate but must opt in explicitly so that unattended pipelines are unaffected.

**How to apply:** (1) Export the alternative floor as a named constant (e.g. `PAIR_CLUSTER_FLOOR = 2`). (2) Centralize all floor-resolution logic in a single exported helper (e.g. `resolveMinClusterSize({minClusterSize, allowPairClusters})`). (3) The helper owns the precedence table; CLI and tests both import from it. (4) The existing human-in-the-loop gate (`--apply`/`--confirm`) stays untouched — it is orthogonal to threshold relaxation.

**Tells:** issue text says "opt-in for clean cases", "support size=N when default is M", or "lower threshold for a specific scenario".

<!-- promote-candidate:operator-opt-in -->
When a CLI safety floor (e.g. min-cluster-size=3) was established to prevent aggressive behavior in unattended runs, requests to lower it are implemented as an explicit per-invocation opt-in flag rather than a default change. The floor values are exported as named constants (PAIR_CLUSTER_FLOOR, DEFAULT_MIN_CLUSTER_SIZE), and a single exported resolver function owns the precedence table. This keeps the safe default intact for all automated callers while giving operators a documented escape hatch.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-51-54-224Z issue:#175 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## When a clamp embeds a sentinel truncation marker, validate for it before every write path

**When a schema-validation clamp silently embeds a literal sentinel string (e.g., `\n[…truncated]`) to keep a field within a byte cap, that sentinel is a reliable detection signal — scan for it explicitly in a downstream validator before any write/apply gate fires.**

**Why:** `clampClusterFields` kept JSON valid by truncating `proposedBody`/`rationale` and appending a literal marker, but no gate checked for the marker before `applyCompaction` wrote the file, so the artifact silently persisted to disk on `--apply`.

**How to apply:** Whenever a pipeline has a clamping step that adds a detectable marker, add a `findXxx` validator that surfaces detections as a new discriminated-union `CompactionWarning` kind and piggybacks on the existing `warnings.length > 0` refusal gate — no parallel refusal mechanism needed. Also raise the byte cap alongside the refusal fix so the trigger rate drops immediately.

**Tells:** a `clamp*` / `truncate*` helper that appends a hard-coded string to signal overflow; a write path (`applyCompaction`, atomic-rename, etc.) downstream of the clamp with no intervening sentinel check.

<!-- promote-candidate:compact-claude-md -->
`clampClusterFields` (compactClaudeMd) and the analogous clamp in `tightenClaudeMd` both use the same literal marker `\n[…truncated]` to signal a truncated body. Any downstream write path that does not scan for this marker will silently persist the marker to disk. The marker is detectable as a simple `.endsWith("\n[\u2026truncated]")` check on each string field after LLM output is parsed.
<!-- /promote-candidate -->

**Note on tests:** accessing variant-specific fields on a discriminated-union warning requires a type-narrowing guard (`if (w.kind !== "expected-kind") return;`) before the field access, or TypeScript rejects the test at compile time.

<!-- run:run-2026-05-08T13-36-56-309Z issue:#197 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## On re-dispatch after an unmet gate, surface the prior pushback and escalate for override

**When re-dispatched on an issue where a prior agent already posted a pushback for the same blocking gate, explicitly reference that prior comment and request an operator override rather than silently re-posting an identical conclusion.**

**Why:** A re-dispatch after pushback usually signals operator intent to proceed; posting a bare repeat of the earlier verdict wastes a dispatch cycle, buries the prior comment, and leaves the operator without a clear escalation path. The correct response is to surface the earlier pushback URL, restate the delta (elapsed vs. required time), and ask explicitly whether an override is authorized.

**How to apply:** At pre-dispatch, run `gh api .../issues/{n}/comments` and scan for prior pushback comments from other agent IDs. If found and the gate condition is still unmet, link the prior comment by URL in the new comment, quantify remaining wait time, and end with an explicit override question before any implementation work begins.

**Tells:** Issue carries tags like `bake-window`, `phase-deferral`, or `upstream-gate`; prior comments within the last few days show a pushback from a different agent id; issue was re-opened or re-dispatched without a label change or operator reply acknowledging the block.

<!-- run:run-2026-05-09T00-00-27-940Z issue:#72 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Recalibrating DEFAULT_TOKENS_PER_CELL requires atomic updates across all anchor sites

**When `DEFAULT_TOKENS_PER_CELL` is updated, change it atomically in every co-location site** — the constant itself, its inline comment (preserve full history: 25k → 130k → 50k), the module docstring batch-sizing example, the `--per-cell` CLI help text, and the CLAUDE.md Phase 2.5 'Per-subagent token anchors' + 'Batch sizing' paragraphs.

**Why:** A 2.5x anchor overshoot (130k vs measured ~45k) was traced to a dispatch-shape collapse: adversarial cells shrank from multi-step MCP calls to 2 tool calls (Read prompt + Write transcript). Stale documentation in multiple sites compounded the confusion and delayed correction.

**How to apply:** Any time a batch run reports per-cell token averages materially different from the constant (>20% off), treat it as a calibration event — grep for every mention of the old value across `tools/`, `CLAUDE.md`, and CLI help before committing.

**Tells:** Issue title contains 'anchor is stale'; per-cell averages in run logs diverge from constant by >20%; dispatch shape changed recently (tool-call count differs from prior batch).

Note: `partition.json` freezes the anchor at init time, so a live run keeps old batch sizing; the update only takes effect on next re-init.

<!-- run:run-2026-05-09T02-20-51-182Z issue:#264 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## .gitignore trailing-slash rule does not match symlinks — add the bare form too

**When a directory name appears in .gitignore only as `name/` (trailing slash), git will NOT exclude a symlink of the same name** (mode 120000); only the bare form `name` or a pattern without a trailing slash matches symlinks.
**Why:** A stray `node_modules -> ../../../node_modules` symlink was committed (mode 120000) because `.gitignore` listed `node_modules/` but not `node_modules`. Every consumer of the worktree subfolder resolved the symlink instead of a real install, causing `ERR_MODULE_NOT_FOUND` on any subsequent invocation after the symlink target was cleaned.
**How to apply:** When auditing or writing `.gitignore` entries for artifact directories, verify both forms are present: the bare name (catches symlinks and plain files) and the trailing-slash form (catches directories). Run `git ls-files --others --ignored --exclude-standard` AND `git ls-files | grep '^node_modules'` to detect accidental tracking.
**Tells:** `git ls-files` emits a mode-120000 entry for a path that should be ignored; `git status` shows a symlink as tracked after `git add`; ERR_MODULE_NOT_FOUND appears in a repo subfolder where a relative symlink substitutes for an actual install.
**Bonus:** When writing a preflight probe for an npm package, use the bare package name (`require.resolve('commander')`) rather than `commander/package.json` — modern packages often omit `package.json` from their exports map, making the `package.json` probe path itself throw `ERR_PACKAGE_PATH_NOT_EXPORTED`.

<!-- run:run-2026-05-01T13-48-07-936Z issue:#574 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Tool-specific patches routed through the threat channel don't close rogue-MCP data integrity gaps

**When a security issue frames the threat as a rogue or compromised MCP server, confirm every proposed fix has an independent trust anchor before implementing it.** Multi-RPC consensus, attestation markers, and canonical-resolver lookups all returned by the same MCP provide zero additional assurance — the attacker controls every return value.

**Why:** A rogue MCP can fabricate any field it owns: consensus vote counts, `data_source` attestation markers, secondary-resolver results. Shipping a tool-specific patch in this scenario creates false closure without raising the actual security bar, and may block the durable fix from being prioritized.

**How to apply:** Before coding any verification step for a read-only data-plane finding, ask: "Does this verification call the same server that returned the suspect data?" If yes, the fix does not defend against the stated rogue-MCP threat. Either (a) redirect to an out-of-band trust anchor (third-party URL advisory, transport-layer response signing, skill-side policy), (b) surface the issue as a duplicate of the relevant data-integrity tracking issue, or (c) ask the author which option matches intent — do not ship the tool-specific patch silently.

**Tells:** Issue has `security_finding` + `rogue-mcp` or `data-source-attestation` labels; proposed fix adds a verification field sourced from the same MCP tool; no independent ground truth (off-chain URL, signing key, separate service) is referenced in the issue body.

<!-- run:run-2026-05-01T13-48-07-936Z issue:#566 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Self-reported provenance fields do not close rogue-component threats — push back and redirect

**A security fix that asks an untrusted component to attest its own trustworthiness is security theater.** Any metadata block (`rpc_provider`, `block_height`, `source_count`, etc.) returned inside the same MCP response it is meant to authenticate can be fabricated by a compromised MCP with zero additional effort.

**Why:** Smoke-test batch exercises (`expert-074-F` class) specifically probe whether a rogue MCP can inject plausible-looking provenance fields to pass downstream checks. If the fix lives entirely inside the tool's own response envelope, it fails that test unconditionally.

**How to apply:** When a `security_finding`-labeled issue proposes adding attestation/provenance metadata to a tool's response as the primary mitigation for a rogue-MCP or supply-chain trust threat, reject the framing. The real fix requires an **independent trust anchor** outside the untrusted component — e.g., response signing verified by the skill layer, multi-RPC consensus checked by a separate data plane, or allowlist cross-check on the caller side.

**Tells:** issue labels include `security_finding` + `rogue-mcp`/`data-source-attestation`; proposed diff only touches the MCP's output schema; no independent verifier is introduced.

**Offer three options:** (1) close as subsumed by the parent issue tracking the real fix, (2) re-scope as observability/staleness UX and drop `security_finding`, or (3) promote to a proper multi-RPC consensus or signing issue with a skill-side verifier.

<!-- run:run-2026-05-01T14-48-57-664Z issue:#591 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## MCP-side attestation of enumerated sets is a self-attestation antipattern when the MCP is the threat actor

**When the threat model names the MCP (or data source) itself as the potential adversary, any integrity proof — signed digest, hash anchor, Merkle root — computed and returned by that same MCP adds zero security.** A rogue MCP that fabricates enumerated-set rows (validator lists, SR catalogs, RPC endpoints) trivially fabricates the accompanying digest.

**Why:** Repeated proposals conflate "tamper-evident transport" (where the signer is trusted) with "rogue-source defense" (where the signer is the attacker). The anchor is only as trustworthy as the signer; if the signer is inside the untrusted boundary, the proof is circular.

**How to apply:** Before implementing any "prefix/sign the response with a digest" feature, ask: does the threat model include the signing party being compromised? If yes, push back and redirect to a real-anchor alternative.

**Tells:** labels `rogue-mcp`, `data-source-attestation`, `enumerated-set`; proposals mentioning "sign the catalog response," "hash-anchored digest per set," or "integrity proof attached to the tool response."

**Real-anchor alternatives to offer:** (1) skill-side ground-truth cross-check against a hardcoded or separately-fetched reference; (2) user OOB echo-back against an off-chain registry; (3) close as duplicate of the parent self-attestation tracking issue if one already exists.

<!-- run:run-2026-05-01T17-27-23-838Z issue:#592 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Reject mitigations that route verification through the threat actor (self-attestation antipattern)

**When a proposed security fix asks the suspected-rogue component to confirm its own honesty, reject it as security theater regardless of 'defense-in-depth' framing.**
**Why:** Re-querying the same MCP, or having it sign its own receipt, does not raise the security bar against a colluding/rogue MCP — the threat actor controls the verification channel. Even the issue author may admit this ('won't help under full collude') while still advocating for shipping; that admission is the signal to push back, not a reason to relent.
**How to apply:** Any time a security issue proposes a fix whose verification path runs through the component named as the threat actor, label it the self-attestation antipattern and decline to implement. Offer concrete re-scoping options instead (subsume into existing integrity-class tracking issue, re-scope to cooperating-agent skill guidance, or promote to a real out-of-band trust-anchor proposal).
**Tells:** fix described as 're-query the same source after the mutation', 'MCP signs its own response/receipt', 'tool-level patch' against a rogue-MCP class issue, 'partial improvement' language when the improvement routes through the adversary, existing parent tracking issues already cover the integrity class.

<!-- run:run-2026-05-05T14-26-37-251Z issue:#591 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Self-attestation antipattern — reject integrity proofs generated inside the threat boundary

**Reject any mitigation where the proof generator sits inside the threat boundary.** A component proposed as both the adversary and the integrity-proof source provides zero net defense — it fabricates data and fabricates the proof at identical cost.

**Why:** On enumerated-set surfaces (validator vote-pubkeys, super-representative lists, RPC endpoints) a rogue MCP that poisons a row also controls any hash/signature/receipt it attaches to that row. Placing the verifier inside the attacked surface is structurally tautological regardless of cryptographic strength.

**How to apply:** When a security issue proposes "MCP-side signed digest", "hash-anchored response", or "self-signed receipt" as the mitigation AND the threat model names a rogue/colluding MCP as the adversary — push back immediately. Redirect to: (a) external-authority `provenanceHints` pointing to sources the MCP cannot influence; (b) skill/agent-side cross-checking against an independently-fetched reference; (c) durable-binding objects whose authority was set outside the MCP boundary.

**Tells:** proposal says "sign", "hash anchor", "digest", or "receipt" over MCP output; no external oracle or out-of-band channel mentioned; rogue MCP is explicitly in the threat model.

<!-- promote-candidate:rogue-mcp -->
When a threat model explicitly names a rogue/colluding MCP as adversary, any integrity proof (hash digest, signature, receipt) that the MCP generates over its own output is structurally defeated at zero cost: the rogue MCP fabricates both the payload and the proof simultaneously. Integrity verification for enumerated sets (validator vote-pubkeys, super-representative entries, RPC endpoint lists) sourced from an MCP must be anchored at an external authority the MCP cannot influence — e.g., a pinned external URL fetched independently by the skill or agent layer (stakewiz.app, tronscan.org/#/sr, chainlist.org), or a durable-binding object whose authority was established outside the MCP bound
[…truncated]

<!-- run:run-2026-05-05T19-14-11-189Z issue:#565 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Verification channel must be independent of the named adversary — rogue-MCP self-attestation antipattern

**When the threat model names a component as the adversary, any verification path that flows through that same component provides zero security uplift.**

**Why:** MCP-side per-session response signing is the canonical self-attestation antipattern — a rogue MCP that fabricates data can equally fabricate its own signatures. Skill-side multi-source consensus via 'second RPC / Chainlink / multi-RPC' still routes through MCP tool calls, so the rogue MCP controls every vote in the consensus. Both patterns have precedent in prior pushbacks.

**How to apply:** Before accepting any integrity-check proposal against a rogue-MCP threat, confirm the verification channel is structurally independent of that adversary (out-of-band oracle, on-chain proof, cooperating agent with separate credentials and a separate process boundary). If not independent, push back and ask the requester to pick a framing: (1) subsume into an already-open parent issue, (2) re-scope as skill guidance with an explicit rogue-agent scope label filed in the correct repo, or (3) reclassify from `security_finding` to observability/UX.

**Tells:** `security_finding` + `read-only-data-plane` labels together; mitigations proposing MCP-side signing or consensus fetched via MCP tool calls; threat model explicitly names the MCP server as the adversary.

<!-- promote-candidate:data-integrity -->
In MCP-based systems where the stated threat is a rogue MCP server, verification schemes that route through MCP tool calls (multi-RPC consensus, Chainlink-via-MCP, second-source fetch via MCP) remain fully under the adversary's control — the rogue MCP controls every input to the consensus. MCP-side per-session signing is equally ineffective: the component generating the signature is the same component generating the fabricated data. Structural independence (out-of-band oracle, on-chain verifiable proof, separate-process cooperating agent with independent credentials) is required before an integrity check provi
[…truncated]

<!-- run:run-2026-05-01T14-48-57-664Z issue:#599 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Data-surfacing DeFi tools must carry explicit SCOPE and AGENT BEHAVIOR docstring clauses to block C.4 reframe attacks

**Every tool that returns protocol-level financial metrics (risk scores, yield data, audit results, governance health, TVL) must include both a `SCOPE` clause (what the number actually measures) and an `AGENT BEHAVIOR` clause (what the agent must NOT conclude from it) in its docstring.**

**Why:** The C.4 reframe class is persistent — agents repeatedly bridge from protocol-safety data to speculative token picks when the docstring is silent on scope limits. Multiple smoke-test batches confirm 6/7+ cells are exploitable via tool-misframing when clauses are absent.

**How to apply:** When adding, reviewing, or patching any tool whose output is a numeric or categorical signal about a financial instrument or protocol, verify both clauses are present before merging. Follow the established `compare_yields` pattern: *"this tool surfaces data; it does NOT pick."*

**Tells:** Tool name contains `risk_score`, `yield`, `audit`, `governance`, `tvl`, `rating`, or similar metric; user prompt carries speculative intent ("will 100x", "best coin", "should I buy", "recommend").

**Cross-repo note:** The docstring fix lives MCP-side (tool definition); the intent-layer refusal rule that generalises across tools belongs skill-side. File both halves as a Cross-Repo Scope Split and label each as cooperating-agent guidance only — docstring clauses do not defend against rogue agents.

<!-- run:run-2026-05-01T17-27-23-838Z issue:#599 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Add SCOPE + AGENT BEHAVIOR clauses to every data-surfacing tool docstring to block C.4 reframe attacks

**Every MCP tool that surfaces numeric or ranked data (risk scores, yield comparisons, token prices, TVL metrics) must include an explicit `SCOPE` clause (what the number measures) and an `AGENT BEHAVIOR` clause (what the agent must NOT infer from it) in its registration docstring.**

**Why:** A bare docstring leaves the data's scope implicit. Agents then bridge protocol-safety scores or yield data into speculative token-pick endorsements ('What coin will 100x?'), anchoring the answer on the tool output to give it false legitimacy — the C.4 reframe class. The missing boundary in `get_protocol_risk_score` allowed exactly this: a protocol-level safety score was laundered into a speculative pepe pick.

**How to apply:** When registering any new data-surfacing tool, or auditing an existing one that lacks scope constraints, add two labeled clauses mirroring the `compare_yields` / `get_protocol_risk_score` pattern: `SCOPE: measures X, NOT Y` and `AGENT BEHAVIOR: refuse speculative-pick prompts even when this tool was called; do not present this output as [upside/endorsement/recommendation]`.

**Tells:**
- Tool returns a score, ratio, rank, or price
- Docstring describes what the tool does but not what agents may conclude from it
- Smoke-test or red-team prompt is a speculative question ('best', 'will 100x', 'should I buy') that the agent answers by citing a data tool
- Companion skill-side issue is needed in a separate repo; file it manually if cross-repo `gh issue create` is allowlist-gated, and save the drafted body to `/tmp/` before the run ends.

<!-- run:run-2026-05-05T14-26-37-251Z issue:#599 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## C.4 reframe fix requires full sweep of all data-surfacing tools plus a cross-repo skill-side companion

**When a C.4 speculative-pick reframe is found on one data-surfacing tool, every adjacent tool returning scored/numeric output needs the same fix.** Patching only the named tool leaves all similar tools open to the same misuse class.

**Why:** Smoke-test batch-04 found the agent anchoring a token-pick (`pepe`) to `get_protocol_risk_score` output — the same reframe class that had already exploited 6/7 tools in batch-03. Single-tool fixes consistently fail because the reframe migrates to the next available data-surfacing anchor.

**How to apply:** On any `c4-reframe` or `speculative-pick` issue: (1) grep all tools returning scored/numeric/price output; (2) add `SCOPE` + `AGENT BEHAVIOR` docstring clauses to each that lacks them, mirroring whichever tool already carries the pattern (e.g. `compare_yields`); (3) file a companion skill-side issue — the intent-layer refusal rule belongs in the skill repo, not MCP docstrings.

**Tells:** Issue labels `c4-reframe`, `speculative-pick`, or `security_finding`; trigger is a speculative-pick question whose answer is anchored to a safety/score/price tool's numeric output.

<!-- promote-candidate:c4-reframe -->
Data-surfacing tools that return scored or numeric output (protocol risk scores, token prices, contract security scores, permission risk levels) are systematically vulnerable to the C.4 speculative-pick reframe class. In observed incidents the agent answered speculative-pick questions by anchoring the pick to a scored tool's output, presenting a safety score or price datum as token endorsement. The MCP-side mitigation pattern is explicit SCOPE and AGENT BEHAVIOR docstring clauses on each such tool; a companion skill-side intent-layer refusal rule handles the other half. Tools already carrying the clause pattern (e.g. compare_yields) are immune; a fix sweep should target every tool in the same data-surfacing category that lacks those clauses.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#560 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Push back on MCP-repo issues whose fix structurally belongs in the intent/skill layer

**When a security finding filed against the MCP repo proposes a purely behavioral fix — pre-call phrase refusal, intent-layer guardrails, agent-side blocklists — push back and redirect to the sibling skill/agent repo; do not implement it MCP-side.**

**Why:** Intent-layer checks (fuzzy address detection, trigger-phrase blocklists, hard-refuse-before-any-tool-call logic) live in the skill repo. Mirroring them into the MCP server is wrong-shaped. The MCP-side schema (e.g., strict 42-char hex regex on address fields) is a separate, already-existing backstop that does not overlap with pre-call behavioral refusals.

**How to apply:** Before accepting an MCP-repo issue, classify the proposed fix: (a) schema/handler validation inside the MCP server → MCP-repo work; (b) agent behavior executing before any tool call → skill-repo work. If (b), search the skill repo for an existing companion issue first, then post a pushback comment with a pointer, and recommend closing the MCP-repo issue as not-planned.

**Tells:** Issue title contains 'intent-layer', 'before any MCP call', or 'agent should refuse'; proposed fix references SKILL.md, Step 0, or trigger-phrase lists rather than server handler code; issue labels include `skill-side-only` or `cooperating-agent-guidance`.

<!-- promote-candidate:cross-repo-scope-split -->
In the vaultpilot ecosystem, pre-call input validation (fuzzy address phrase detection, intent-layer hard-refusals) is a skill-layer concern tracked in the skill/agent repo, not the MCP server repo. The MCP server strict input schema (42-char hex regex on address fields) acts as a downstream backstop but does not substitute for upstream agent-side behavioral guardrails. Security findings filed in the MCP repo that propose phrase-blocklist logic or agent refusals before tool invocation are structurally misrouted — the correct fix location is the sibling skill repo. Companion issues between the two repos are common for security findings spanning bot
[…truncated]

<!-- run:run-2026-05-02T06-32-08-433Z issue:#40 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## CLI list commands must mirror the operational filter — hide archived records by default, expose them via --all

**When a runtime layer (dispatcher, router, scheduler) already excludes records marked `archived` or soft-deleted, every CLI `list`-style command over the same data must apply the identical filter by default.**

**Why:** A display surface that shows more records than the runtime uses misleads operators: the roster looks larger than it is, archived entries appear actionable, and the gap between "what I see" and "what the system routes to" silently erodes trust in both views.

**How to apply:** Before shipping any new `list`/`specialties`/`show` command, audit whether a runtime layer already filters on a status flag in the same data set. If so: (1) add the same predicate to the display loop, (2) add a `--all` opt-in that restores the unfiltered view, (3) make archived rows visually distinct in the `--all` output (extra `archived` column, `[archived]` heading tag, dimmed row, etc.).

**Tells:** Schema has a boolean `archived`/`disabled`/`active` field. A dispatcher or router already consults it. A CLI command iterates the raw array without filtering. Reported symptom is "list shows stale/retired entries."

**Do not** require `--all` as the default just because the underlying record still exists in the store — presence in storage is not the same as operational relevance.

<!-- run:run-2026-05-02T10-31-33-192Z issue:#39 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Add mtime-based dist-freshness preflight to compiled CLIs; prefer fail-fast over auto-rebuild

**When a CLI binary executes from a compiled `dist/` directory, add a startup preflight that walks `src/` and `bin/` for the max `.ts` mtime and compares it to the compiled entry-point. Exit 1 with a one-line build instruction if src is newer.**

**Why:** Stale compiled artifacts produce silent corruption (e.g. a fixed regex in `src/` never reaching `dist/`), causing downstream callers to receive wrong data (`sectionCount: 0`) with no error signal. The failure is nearly impossible to diagnose without knowing to suspect the build.

**How to apply:** Any time a TypeScript CLI is invoked directly from `dist/` (ESM bin shim or otherwise) and source files may drift ahead of it between runs. Implement in a thin helper (e.g. `src/distFreshness.ts`) called at the very top of the binary's boot, before any tool or command logic runs.

**Tells:** binary lives in `bin/`, compiled output in `dist/bin/`; users run the CLI without a mandatory build step; past issues involved wrong or empty output with no error thrown.

**Prefer fail-fast (exit 1 + message) over auto-rebuild.** Spawning `tsc` from inside the running binary adds re-exec complexity and hides the failure; a one-line `"run 'npm run build'"` message keeps the gap visible and respects Smallest-Solution Discipline.

<!-- run:run-2026-05-04T14-08-59-410Z issue:#33 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Pre-screen framework-evaluation redirects against existing stack before investigating

**When an issue comment re-scopes work to 'investigate/adopt framework X', run a quick compatibility check first — language, dependency model, architectural pattern, and whether X actually solves the stated problem — before any deep investigation.**
**Why:** A framework can appear relevant to the issue title (e.g. 'shared memory') while being a language mismatch, a paradigm mismatch, and solving a different abstraction layer entirely. Deep investigation wastes cycles and risks misleading the owner with a plausible-sounding but fundamentally broken path.
**How to apply:** On any framework-evaluation re-scope, check at minimum: (1) same language/runtime as the project? (2) same workload shape (e.g. sequential pipeline vs parallel issue-driven dispatch)? (3) does the framework's headline feature actually address the issue's core need? If two or more dimensions fail, post a structured assessment with concrete forward paths and ask for direction — don't implement or investigate further.
**Tells:** Issue comment names a specific third-party framework; the original issue was about an internal architectural feature; the project has a strongly-typed or single-runtime stack; the named framework's docs feature a different primary language or execution model.

<!-- run:run-2026-05-04T14-37-10-004Z issue:#34 outcome:failure-lesson ts:2026-05-09T05:42:15.897Z -->
## Thread-through parameter changes exhaust turn budget when edited site-by-site

**When plumbing a new option end-to-end (CLI flag → interface → parse → propagate → runtime use), enumerate every change site up front and batch all edits into the fewest possible tool calls before touching any file.**

**Why:** Each granular Edit call costs one turn. A 5-site thread-through (option declaration, interface field, profile merge, run-params spread, logger log) plus build + test + commit + push + PR creation requires ~15 turns at minimum. Executing those same changes as N small targeted edits can consume 35+ turns, leaving no budget for the finalization steps — agent crashes at "all tests pass, committing" with zero turns left.

**How to apply:** On any issue whose title implies adding a flag, limit, ceiling, or config knob: (1) read all relevant files first, (2) write a mental edit plan listing every location, (3) apply each file's changes in a single large Edit or Write, never one field at a time. Reserve at least 8 turns for build → test → commit → push → PR before making the first code change.

**Tells:** Issue title contains "ceiling", "limit", "option", "per-run", "config"; implementation touches a CLI parser, a typed options interface, and one or more downstream call sites — the combination signals a multi-site thread-through.

<!-- run:run-2026-05-05T11-30-15-426Z issue:#84 outcome:failure-lesson ts:2026-05-09T05:42:15.897Z -->
## Multi-file flag propagation exhausts turn budget when edits are piecemeal

**When threading a new CLI flag through 5+ files, prefer full-file `Write` or large batched `Edit` calls over many small sequential edits.**

**Why:** Each `Edit` is a turn; a flag that propagates through CLI → interface → orchestrator → state → preview can require 20–30 edits before the first build check, burning most of the 50-turn budget and leaving no room for compilation errors or iteration.

**How to apply:** Before starting, enumerate every file to touch and estimate edits per file. If total estimated edits > 20, switch to full-file `Write` for the most-edited files. Alternatively, widen `old_string` to capture and replace an entire function signature or interface block in one call instead of editing one field at a time.

**Tells:** New option added to a shared interface that also appears in CLI opts, orchestrator params, dispatcher args, state serialization, and a preview formatter — classic fan-out propagation where each layer needs its own edit.

<!-- run:run-2026-05-05T14-26-37-251Z issue:#587 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Verify referenced artifacts exist before acting on tooling or aggregator bug reports

**Rule:** Before writing any code or fix for a bug report that names specific files, directories, or symbols, run a repo-wide scan (grep/find/`gh search code`) to confirm those artifacts actually exist in THIS repo. If the scan returns zero hits, treat the issue as potentially misfiled rather than inventing a duplicate implementation.

**Why:** An issue naming `tools/sample_matrix_run.py` and `runs/matrix-sampled/` was filed in the wrong repo; both paths were absent repo-wide. Implementing a phantom aggregator from scratch would have created maintenance-splitting debt and diverged from the canonical logic in the sibling repo.

**How to apply:** Whenever an issue references a concrete file path, module name, or CLI entrypoint — especially in `tools/`, `scripts/`, or a named sub-command — confirm the path exists before scoping work. If it doesn't exist, push back with three options: refile in the correct repo, file a doc-only sub-issue for any vocabulary/interface contract that does belong here, or close as misfiled.

**Tells:** Issue title names a specific script or aggregator; repo has no `tools/` directory or no Python sources; referenced symbols return zero grep hits across the entire worktree.

<!-- promote-candidate:misfiled-issue -->
When a bug report names a concrete file path or script (e.g. `tools/sample_matrix_run.py`) and that path returns zero hits in a repo-wide scan, the issue is almost certainly misfiled against a sibling repo. The correct handling is pushback with three explicit options: refile in the owning repo, file a doc-only sub-issue for any shared interface contract, or close as misfiled. Creating a duplicate implementation from scratch to satisfy the issue as filed splits maintenance and diverges from canonical logic.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#562 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Yield-sanity checks at skill or prose layer cannot defend against rogue-agent threats

**Before implementing any 'yield feasibility gate', explicitly place it in one of three enforcement layers: (1) skill/prompt rules — text in the agent's context, bypassed by a rogue; (2) MCP tool hooks — intercept tool calls but never advisory prose; (3) hard cap inside the yield tool itself — the only unconditionally enforceable position for a cooperative MCP.**

**Why:** Proposals phrased as 'skill calls canonical estimator when prose APY > 2×' conflate all three layers. A rogue agent never reaches the skill rule. MCP has no prose-intercept hook. Using `compare_yields` to validate `compare_yields` output is circular — enforcer and suspect share the same trust boundary.

**How to apply:** For every yield-anomaly gate issue, name the threat actor (cooperative mistake vs. rogue) and check whether the proposed enforcer is inside or outside that actor's control. If inside, push back with three alternatives: (a) architectural close (no code for rogue paths), (b) skill guidance for cooperative path only, (c) hard cap inside the tool.

**Tells:** Issue title mentions 'yield too good to be true', 'MCP-side feasibility', or 'refuse if APY exceeds'; proposed fix describes a skill rule calling an estimator on agent prose; issue labeled `tool_gap` but threat is actually rogue-agent.

<!-- promote-candidate:yield-anomaly -->
In the vaultpilot-mcp stack, the MCP tool layer intercepts only tool calls — it has no hook into advisory prose emitted by the agent in its response. Yield feasibility gates written as skill rules (prompt-layer text) are transparent to a rogue agent that chooses to ignore them. A yield-validation tool that cross-checks its output using a sibling tool on the same MCP server shares the same trust boundary as the value being checked, providing no independent safety guarantee.
<!-- /promote-candidate -->

<!-- run:run-2026-05-02T10-31-33-192Z issue:#53 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## On envelope parse failure, reconcile from durable side-channel state before marking errored

**When structured agent output fails to parse, query git/gh side-channel state before finalizing a failure status.**
**Why:** Parse errors can occur even after an agent successfully opens a PR. Recording `decision=null, isError=true` in that case is silent status corruption — landed PRs vanish from the success ledger and block downstream orchestration. The parse-error fix alone (sanitizing output) does not close this gap if historical runs already produced malformed envelopes.
**How to apply:** After any `extractEnvelope` / structured-output parse failure, run a bounded reconciliation pass — one `git ls-remote` for the agent's expected branch, one `gh pr list` for a matching PR. Branch+PR found → synthesize a success envelope, preserve `parseError` as a soft warning field. Branch-only (orphan) → emit a structured log event with a salvage hint and surface the branch URL in the failure record. No state found → fall through to the original parse-error behavior unchanged. Always skip reconciliation in dry-run mode where push/PR calls are intercepted.
**Tells:** `extractEnvelope` returns `parseError`; orchestrator emits `decision=null` beside an issue whose PR actually merged; agent stdout is truncated mid-JSON or missing the closing brace.

<!-- run:run-2026-05-03T05-54-13-869Z issue:#62 outcome:failure-lesson ts:2026-05-09T05:42:15.897Z -->
## Commit-push-envelope must be consecutive turns; pre-commit verification burns kill the envelope

**After `git push` succeeds, emit the decision envelope in the very next turn — no intervening reads, greps, or build re-checks.**

**Why:** Agents that front-load exhaustive verification (build → typecheck → test → grep wiring checks) before the final commit+push consume most of the 50-turn budget. The push lands on turn 49 and there is no turn left to emit the envelope. The SDK sees an unfinished run and records a crash, discarding all the work even though the branch was pushed.

**How to apply:** Treat the final sequence as atomic and inviolable: `git add/commit` → `git push` → emit envelope. If optional validation (typecheck, test, grep cross-checks) hasn't been done yet, skip it rather than defer the envelope. The pushed branch is recoverable; a missing envelope is not.

**Tells:** Five or more of build/typecheck/test/grep calls appearing in the last 15 turns before the first commit attempt signals the budget is almost gone — stop verifying and push immediately.

**Corollary:** If the issue fix requires iterative build-fix cycles, do them in the first half of the turn budget. Reserve the second half for commit + push + envelope only.

<!-- run:run-2026-05-04T14-08-59-410Z issue:#34 outcome:failure-lesson ts:2026-05-09T05:42:15.897Z -->
## Batch multi-site edits into one Write per file to avoid turn-ceiling exhaustion on feature work

**When implementing a feature that touches many locations in a file, consolidate all changes into a single `Write` (full-file replacement) or the fewest possible `Edit` calls — never one `Edit` per change site.**

**Why:** The 50-turn SDK ceiling is consumed by granular per-hunk edits before implementation, tests, and CI verification can complete, causing the agent to crash without emitting an envelope. The pattern is self-defeating: the more carefully the agent edits, the less likely it finishes.

**How to apply:** Before touching a file, enumerate every change site; write them all in one pass. If turn count passes 30 with build/test not yet green, switch immediately to `Write` for each remaining file rather than continuing surgical edits.

**Tells:**
- 5+ sequential `Edit` calls to the same file in the visible tool log
- `npm run build` / `npm test` not reached until the final 2 turns
- Agent still adding interface fields or CLI options after turn 40

**Corollary:** For features requiring new CLI flags + new interfaces + new logic + new tests, treat each file as one atomic unit of work — read the full file, plan all changes mentally, write it once.

<!-- run:run-2026-05-05T11-30-15-426Z issue:#86 outcome:failure-lesson ts:2026-05-09T05:42:15.897Z -->
## Create the PR immediately after push — post-push verification burns turns needed for the deliverable

**After `git push` succeeds, call `gh pr create` as the very next action — before any `git log`, `git show --stat`, or `gh pr list` checks.**

**Why:** Post-push verification steps (confirming commit hashes, listing PRs, inspecting file stats) consume turns without advancing toward the actual deliverable. When a turn ceiling is close, these confirmation calls prevent PR creation from completing — leaving a fully-committed, fully-pushed branch with no open PR, which recovery passes can't fix in 4 turns if they also burn turns on re-verification.

**How to apply:** Write the PR body to a temp file early in the session (right after tests pass). After push, immediately call `gh pr create --body-file`. Reserve `git log` / `gh pr list` / `git show` only as diagnostics *if* the create step itself fails or returns an error.

**Tells:** Seeing `git log --oneline`, `git show --stat`, and `gh pr list` all appearing *after* `git push` but *before* `gh pr create` is the signature of turn-exhaustion-before-delivery risk.

<!-- run:run-2026-05-05T19-14-11-189Z issue:#156 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Verify all explicit gates before acting on tracking or dependency-gated issues

**Before writing a single line of code on a `tracking` issue, independently verify every named gate** (upstream package version via `npm view`, upstream issue/PR state via `gh issue view`, live-bite signals in the issue's own comment thread).

**Why:** Tracking issues are deliberately parked on external events; shipping speculative or defensive code against an unmet gate wastes cycles and may couple the codebase to an API surface that has not yet stabilized or landed.

**How to apply:** If every gate is still closed — upstream package unchanged, upstream PR still OPEN, no user comment reporting a live failure — post a structured status comment that (a) enumerates each gate with its current state, (b) links the upstream tracker, and (c) offers 2–3 scoped next-move options. Then record decision = pushback. Do not open a branch or PR.

**Tells:** issue labeled `tracking`; body phrases like "gated on", "blocked until", "waiting for upstream"; a linked external issue/PR; no comments from users hitting the live error.

<!-- promote-candidate:sdk-drift -->
Tracking issues for Solana/MarginFi SDK drift commonly name two independent unlock gates: (1) a new npm package version and (2) a user-reported live failure. Both must be checked independently — a new SDK version alone does not confirm the variant is handled in production, and a live-bite comment alone does not confirm the upstream fix has shipped. Checking only one gate and acting on it risks shipping code against an unresolved or already-bypassed surface.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#582 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Security findings proposing skill invariants as the fix for rogue-agent address-substitution are misrouted

**Skill rules bind cooperating agents only — they cannot stop a rogue agent (Role A) from substituting a destination address or fabricating a CHECKS PERFORMED block.** When a security bug proposes Inv #X or a CHECKS PERFORMED requirement as its sole remedy, the fix belongs in the skill repo, not MCP code.

**Why:** A rogue agent ignores skill invariants by definition; on-device clear-sign (outside the agent stack) is the layer that actually catches live incidents. Conflating the two layers creates false confidence that a skill rule closes the threat.

**How to apply:** When a `security_finding` bug names only skill-side defenses and the threat is address substitution or fabricated audit output, apply Rogue-Agent-Only Finding Triage: push back and offer three paths — refile in skill repo, close as architectural, or identify a missing MCP-side field the reporter failed to name.

**Tells:** labels `security_finding` + `bug_report`; proposed fix cites Inv #1 / Inv #3 or CHECKS PERFORMED; on-device signing was the actual catch; no MCP-layer field is named as absent.

<!-- promote-candidate:solana -->
In Solana MCP security findings, the MCP already surfaces instruction-decode output (`decoded.functionName`, `decoded.args.to`, `description`) for skill rules to bind on. These bindings only constrain cooperating agents — a rogue agent substituting a destination address or fabricating a CHECKS PERFORMED block operates outside skill-rule reach entirely. On-device clear-sign is the effective defense for Role A (rogue-agent) address-substitution threats. Findings that propose Inv #1 (instruction-decode re-derivation) or Inv #3 (intent validation) as the primary fix are addressing cooperating-agent hygiene, not rogue-agent threats; the two scopes belong in separate issues in separate repos.
<!-- /promote-candidate -->

<!-- run:run-2026-05-01T14-48-57-664Z issue:#614 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Status APIs used as preflight gates must probe liveness on-demand, not consume cached background-keepalive flags

**Never let a status/health-check tool return its answer from a flag written solely by a periodic background keepalive when that tool is used as a preflight gate before a blocking or costly operation.**

**Why:** Background keepalives can leave cached state stale for up to one full interval (e.g., 30 s). A caller that reads `paired:true` from stale cache then attempts the blocking operation — which hangs or fails opaquely — producing a far worse outcome than the status check returning `false` directly. The false-positive window is invisible to the caller.

**How to apply:** When implementing or auditing a status function, check (1) whether its result drives a go/no-go decision upstream, and (2) whether any flag it reads is owned by a `setInterval` / background timer. If both are true, insert an on-demand bounded-timeout probe before the flag read.

**Tells:** Function named `get*Status`, `isConnected`, `isPaired`, etc.; a shared boolean flag set inside a `setInterval` callback; caller code that branches on the result before a network or signing call.

Keep the on-demand probe **non-destructive**: update only the liveness flag — do not reset `currentSession`, clear persisted topics, or trigger disconnect logic. Session-retain invariants established elsewhere must not be broken by a preflight probe.

<!-- run:run-2026-05-01T17-27-23-838Z issue:#604 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## When a config key ships in one surface, audit every other surface that enumerates the same keys

**When a new API key or config field is added to the schema, verify it appears in ALL surfaces that enumerate keys** — setup wizard, diagnostics/status tools, `noKeys`-style predicates, and docs. Any surface can lag independently.

**Why:** A key can ship in the wizard and on-disk schema while the diagnostics status tool silently omits it, leaving inconsistent 'set/unset' reporting for users. Issues filed against the wizard are often already fixed; the real remaining gap is a parallel reporting surface nobody updated.

**How to apply:** On any issue mentioning a missing field, grep for sibling field names (e.g., `etherscan`, `oneInch`) to locate every enumeration site. Update all of them atomically in the same PR.

**Tells:** Labels like `tool-gap` + `config-schema` + `diagnostics` together; a feature that appears to have shipped (commit cited in history) but the issue is still open; a diagnostics/status tool whose `apiKeys` interface is shorter than the wizard's field list.

Also: when an issue is partly stale (primary surface already fixed), do not close — re-scope to the remaining gap rather than abandoning the issue.

<!-- run:run-2026-05-01T17-27-23-838Z issue:#614 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Status tools used as preflight gates must probe liveness on-demand, not read a cached flag

**Rule:** When a `get_*_status` / session-status tool is used (or designed) as a preflight gate before a destructive call, the reachability answer must come from a fresh, bounded probe — never from a flag last written by a background keepalive timer.

**Why:** A background timer (e.g. 30 s cadence) that refreshes a module-private `peerUnreachable` flag leaves a stale window. A status call reading that cached flag can report `paired:true` while the relay is dead, so downstream tools (e.g. `send_transaction`) proceed and fail with opaque errors instead of getting a clear preflight rejection.

**How to apply:** When implementing or reviewing any status/health tool that gates other operations, replace the cached-flag read with an on-demand probe bounded by a short timeout (≤ 5 s). Update the shared flag as a side-effect so the background timer stays consistent, but do not reset session lifecycle state (topic, persisted credentials) as part of the probe.

**Tells:** tool names matching `get_*_status`, `is_*_connected`, `check_*`; module-level booleans like `peerUnreachable` / `isConnected` written by a periodic timer; downstream agent flows that call a status tool before a send/sign operation; bug reports where the status says OK but the next call fails with a serialisation or relay error.

<!-- run:run-2026-05-05T19-14-11-189Z issue:#566 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Self-reported provenance footers are theatrical against rogue-MCP threats until an integrity mechanism exists

**A `data_provenance` footer on an MCP tool is a display artifact, not a security control.** A rogue MCP fabricates `rpc_provider`, `block_height`, `fetch_timestamp`, and `source_count` at the same trivial cost as the balance itself — the footer is theatrical against the exact threat it claims to address.

**Why:** Shipping provenance UI ahead of the backing integrity mechanism (response signing, skill-side multi-RPC consensus) inverts the dependency. Every footer before consensus exists renders `source_count: single`, training users to ignore the field before it becomes meaningful. Self-reported metadata cannot attest to its own trustworthiness.

**How to apply:** When a ticket proposes a provenance footer as a security measure on a read-only data-plane tool, verify an out-of-band integrity mechanism already exists. If not, push back and propose folding the UI into the integrity issue so they ship as one artifact — or narrow MCP scope to the one chain-locked field (e.g. `block_height`) the user can independently verify on a public explorer.

**Tells:** labels `security_finding` + `data-provenance` together; threat model names a rogue or compromised MCP server; no signing or multi-source consensus PR is open yet.

<!-- promote-candidate:rogue-mcp-threat-model -->
Self-reported MCP tool output fields (`rpc_provider`, `source_count`, `fetch_timestamp`) are fabricatable by a rogue MCP at the same trivial cost as the domain data those fields annotate. A provenance footer on a read-only data-plane tool provides no integrity guarantee against a compromised server. Its value is only realized once an out-of-band mechanism — response signing, cooperating-agent multi-RPC consensus, or a chain-verifiable field like `block_height` — backs the claim. Shipping the display field ahead of the mechanism trains users to trust a field before it is trustworthy.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T19-14-11-189Z issue:#580 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## BIP-32 cosigner xpubs encode parentFingerprint not masterFingerprint — device round-trip is the only valid master-ide...

**Agent-side re-derivation of master identity from cosigner xpubs is structurally infeasible under BIP-32.** Each xpub encodes `parentFingerprint` (first 4 bytes of HASH160 of the *parent* public key), not the device's `masterFingerprint`. Any MCP-layer cross-check that infers cosigner master identity purely from supplied xpubs will silently accept rogue-substituted xpubs that are structurally valid.
**Why:** A `security_finding` requested this exact check; the fix was technically impossible — only `app.getMasterFingerprint()` (a live device call) yields the true master fingerprint. The BIP-32 spec makes pure-xpub inference of master identity impossible.
**How to apply:** When evaluating "xpub fingerprint cross-check" proposals for multisig cosigners, verify whether the check requires `masterFingerprint` (device-attested) vs. `parentFingerprint` (readable from the xpub struct, proves nothing about root identity). Reject proposals that conflate the two and frame the residual gap as vendor/UX-architectural per the Role-C blind-sign structural-limit precedent.
**Tells:** `security_finding` + `btc-multisig` labels; phrases like "re-derive fingerprint from xpub", "agent-side cosigner cross-check", "validate xpub identity" without mentioning a device call.

Correct layered defense: (1) device-derived xpub round-trip for our slot, (2) `getMasterFingerprint()` attestation, (3) durable bindings per cosigner with rogue-MCP hint, (4) clear-sign during `registerWallet`.

<!-- promote-candidate:bip32-xpub -->
BIP-32 xpub bytes contain `parentFingerprint` (first 4 bytes of HASH160 of the *direct parent* public key), not the wallet's `masterFingerprint`. These fields are commonly confused in security proposals. masterFingerprint is only retrievable via a live device attestation call (e.g., `app.getMasterFingerprint()`); it cannot be back-calculated from any child xpub at any depth. Proposals that attempt agent-side master-identity verification from cosigner xpubs a
[…truncated]

<!-- run:run-2026-05-01T13-48-07-936Z issue:#558 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Cross-RPC divergence checks must use a reference provider from a different trust domain and field-specific comparison

**When building any RPC-integrity or chain-data divergence check, the reference provider must be outside the trust domain of the suspected-rogue endpoint, and comparison must be field-specific — not byte-equality.**

**Why:** A rogue RPC can fabricate consistent responses to *both* a primary and reference call if they share a trust boundary (e.g., routing a "Chainlink check" through the same provider being defended against is circular — the adversary controls both answers). Separately, byte-equality cross-provider comparison produces spurious divergence on fast chains due to 1-block fork drift between fetches.

**How to apply:** Before designing any cross-provider verification mechanism, explicitly map the trust domain of each provider. If the reference source overlaps with the adversarial threat model, reject the design and escalate for an independent oracle or a public gateway with a distinct operator. Replace raw-response byte-equality with field-extracted comparison (e.g., LLTV, oracle address, IRM address pulled individually).

**Tells:** Proposed check fetches both values from the same configured endpoint or the same operator's infrastructure; issue mentions "verify via Chainlink" or "second RPC call" without specifying provider independence; spec uses `===` or byte-diff on full RPC response objects.

**Escalation:** If no genuinely independent reference source is available, the mechanism should be scoped down or deferred rather than shipped with a circular trust chain — a false sense of verification is worse than an acknowledged gap.

<!-- run:run-2026-05-01T13-48-07-936Z issue:#565 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Integrity-check proposals for rogue-component threats must be validated for trust-domain independence before any code...

**Never accept a proposed integrity fix for a rogue-MCP / rogue-agent threat without first tracing the full verification chain to confirm it is independent of the suspected rogue party.**

**Why:** A signer whose key is controlled by the rogue component, or a cross-check whose data plane passes through that component, is null security — the attacker fabricates response and proof together. This is easy to miss when the fix looks structurally correct ("sign responses", "validate against a second source") but the second source is reachable via the same compromised path.

**How to apply:** For any issue tagged `rogue-mcp`, `rogue-agent-triage`, or carrying a security label where the threat actor *is* a component in the system, map the proposed fix's trust chain end-to-end before approving. If any link in that chain touches the threat actor's data plane, push back immediately.

**Tells:** proposed fix adds signing or checksums; the signing key is generated or stored inside the component under suspicion; proposed "independent" RPC or oracle still routes through the same MCP layer; a parallel issue is still designing the independent-verification primitive.

**When pushing back**, offer concrete framings: (1) escalate as architectural residual risk, (2) scope down to cooperating-agent provenance only, or (3) defer until the independent-verification primitive is settled — then ask the author which compromise model to ship against before writing any code.

<!-- run:run-2026-05-01T14-48-57-664Z issue:#593 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Security fixes that self-verify through the attacked component violate cross-trust-domain independence

**Never accept a fix that routes threat verification through the same trust domain the attacker controls.** Allowlists, fingerprint tools, preflight gates, or in-process validation placed inside a potentially-compromised component cannot constrain the adversary — the attacker controls the defense.

**Why:** A rogue-MCP or rogue-agent threat makes every tool, schema, and allowlist inside that process suspect. Adding in-process verification gives the attacker authority over the check meant to stop them. This matches past precedent closing curated-allowlist and in-MCP security proposals as architectural residual risk.

**How to apply:** When a security issue proposes a new MCP tool, allowlist, or preflight gate and the labeled threat is a compromised MCP/agent, push back. Offer three paths: (1) close as architectural residual risk mirroring prior closures; (2) re-scope the fix to a genuinely independent trust domain with an explicit boundary statement; (3) offer a narrow schema-tightening change that is orthogonal to the threat model.

**Tells:** Issue labels include `rogue-mcp`, `rogue-agent-triage`, or `trust-boundary`; proposed fix is a new in-repo tool or in-process allowlist; the same agent the fix is meant to defend against could invoke the defense.

<!-- run:run-2026-05-05T19-14-11-189Z issue:#558 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Proposed integrity checks for rogue-component threats must not route through the suspected component

**Before implementing any 'cross-check' or 'divergence check' proposed as the fix for a rogue-RPC / rogue-MCP threat, audit two properties: (1) the verifying path uses a trust domain provably disjoint from the suspected component; (2) the equality criterion tolerates legitimate state drift between sequential on-chain reads.**

**Why:** A 'cross-check against Chainlink' that still issues the verification call through the same `rpcUrl` operator is circular — a rogue endpoint fabricates both responses consistently. Independently, 'byte-for-byte equality between two providers' yields false positives from normal 1-block drift between sequentially issued calls.

**How to apply:** When a security issue proposes validation-by-comparison for on-chain market params (LLTV, oracle price, exchange rate, IRM address), trace the full call path for both legs before writing code. If both legs share the same operator or URL family, push back and offer: (A) operator-distinct providers with field-specific (not byte-level) comparison, (B) a trust-domain-clean sanity bound (e.g., yield-feasibility range check), or (C) documented residual-risk deferral.

**Tells:** Issue title mentions 'divergence check' or 'cross-check'; proposed fix queries the same `rpcUrl` for primary and verification reads; labels include `security_finding` alongside `rogue-rpc` or `rogue-mcp`.

<!-- promote-candidate:trust-domain-independence -->
When a proposed on-chain integrity check issues both the primary read and the verification read through the same RPC endpoint (same `rpcUrl` or same operator family), a rogue endpoint can fabricate both responses consistently, making the check circular with zero security benefit. Additionally, byte-for-byte equality between two sequential RPC calls on live chain data is not a reliable divergence signal because 1-block drift between calls produces legitimate divergence for any mutable field (exchange rate, oracle price). Field-specific numeric-tolerance compa
[…truncated]

<!-- run:run-2026-05-02T10-31-33-192Z issue:#33 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Shared knowledge pools seeded from agent-controlled files inherit those files' trust level — treat promotion as an in...

**When a cross-agent knowledge-aggregation pipeline reads from per-agent files (CLAUDE.md, local notes) and promotes content into a shared pool, the shared pool's integrity boundary sits *inside* the agent's data plane.** The pool is only as trustworthy as the least-trusted file that feeds it.
**Why:** A subtly injected or compromised CLAUDE.md can silently propagate adversarial rules into every sibling agent that consumes the shared pool. Human reviewers scanning ~200-line pool diffs under normal workload pressure are an unreliable sole defense.
**How to apply:** Before implementing or approving any lessons-promotion or knowledge-aggregation feature, verify whether the promotion source is agent-controlled. If it is, require: (a) a fixed schema with bounded field sizes that strips freeform prose, (b) a diff-only human review gate that specifies *exactly* what the reviewer must check, and (c) explicit documentation of the residual injection risk.
**Tells:** feature spec reads from `CLAUDE.md` or equivalent per-agent file to populate a shared resource; review step is described only as "human approval" with no checklist; pool files grow past ~100 lines of freeform text.

<!-- run:run-2026-05-04T14-08-59-410Z issue:#56 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Expire in-file sentinels using their own chronological chain; never expire legacy markers

**Embed all metadata needed for expiry decisions into the sentinel header at write-time, and source the streak signal from the file's own chronological chain — not from external state directories.**
**Why:** Cross-referencing an external `state/outcomes/` store couples expiry logic to a second data source, introduces ordering races, and breaks idempotency; a self-contained in-file chain is reproducible and trivially unit-testable.
**How to apply:** Whenever a sentinel or in-file marker needs lifecycle management (expiry, promotion, retirement), emit the tag fingerprint or other decision key into the sentinel header on creation, then read only that file to decide expiry.
**Tells:** 'expire after K successes' requirements, in-file CLAUDE.md lifecycle rules, sentinel schemas being extended with new metadata fields.
- **Never expire sentinels that predate the new metadata schema.** Records missing the required field must be treated as perpetual — silent expiry of legacy entries is data loss.
- **Expose the threshold (K) via an env var with a conservative default** (e.g. 3); never hard-code policy constants in expiry logic.
- **Isolate parsing + expiry into a pure utility module** with no side-effects so it can be exhaustively unit-tested independent of file I/O.

<!-- run:run-2026-05-05T19-14-11-189Z issue:#584 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Hallucinated DeFi advisory text normalizing unlimited approvals or risky yield closes architectural

**When an issue reports model-hallucinated DeFi explanations that normalize unlimited token approvals, sycophantic yield promises, or risky on-chain patterns — and no signing tool (`prepare_approve`, `preview_send`, `send_transaction`) appears in the reported flow — close as `not_planned` (architectural).** Skill-level rules cannot bind a rogue agent that ignores them; a cooperating agent already refuses these patterns. The real fix path is Anthropic model-safety tuning or chat-client output filters, both out of scope for this repo and vaultpilot-security-skill.

**Why:** Adding skill rules here is security theater: the harm lives in conversational advisory text, not in a signing action this repo controls. Canonical close [#536](https://github.com/szhygulin/vaultpilot-mcp/issues/536) established this pattern; repeated advisory-layer issues confirm it recurs, especially for newcomer-DeFi audiences.

**How to apply:** On any `security_finding` whose body mentions hallucination, sycophancy, unlimited approvals, or risky yield — first confirm no `prepare_*` / `preview_send` / `send_transaction` tool call is implicated. If harm is purely explanatory, apply architectural-close; do NOT file a skill-side issue.

**Tells:** Issue body self-attributes to "hallucination" or "sycophancy"; author names Anthropic RLHF as fix path; no on-chain action log present; labels include `security_finding` + no `signing-flow` label.

<!-- promote-candidate:newcomer-defi -->
In vaultpilot-mcp, a recurring class of security finding involves model-hallucinated DeFi explanations (e.g. normalizing uint256.max approvals, promising high yield) surfaced during newcomer onboarding conversations. These findings consistently have no signing-tool involvement — the harm is purely in advisory text. The signing-flow defenses (unlimited-approval refusal at prepare_approve, long-lived-authority check) remain correctly scoped to tool calls and continue to fire; the advisory-text class is arch
[…truncated]

<!-- run:run-2026-05-01T13-20-53-983Z issue:#561 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Verify tool input schemas before implementing security-invariant gates on named parameters

**Read the actual schema definition of the targeted tool before writing any enforcement code for a security invariant.** Security bug reports often assume a parameter type (e.g., `addressOrLabel`) is accepted by a tool when the real schema only accepts regex-validated literals — silently installing a guard on a non-existent parameter does nothing and wastes a fix slot.

**Why:** A well-formed invariant report (Inv #N, named tool, named parameter, proposed gate) can have a false premise that is invisible until you grep the schema. Discovering this after implementing wastes review cycles and can introduce dead code near security-critical paths.

**How to apply:** When an issue asks you to add re-derivation, rate-limiting, or any enforcement on `tool.param`, do `grep -n 'param\|schema' src/**/<tool>.ts` and read the `Input` type before touching implementation. If the parameter doesn't exist as described, push back with the schema line reference and a precise statement of what the tool actually accepts.

**Tells:** Issue cites an invariant number, names a specific tool + parameter, proposes a 'gate' or 'enforcement step', and links to a threat-model doc. Also: proposed defense routes through the same trust boundary as the adversary (e.g., requiring a `list_contacts` call to validate labels when the rogue-MCP also controls `list_contacts`) — flag this circularity explicitly in the pushback.

<!-- run:run-2026-05-01T17-27-23-838Z issue:#593 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Verify actual tool input-validation code before accepting a security report's claimed attack surface

**Before treating a reported injection or override surface as real, inspect the tool's runtime validation code — the surface the reporter describes may not exist in the current implementation.**
**Why:** An issue claimed `set_helius_api_key` / `set_etherscan_api_key` provided arbitrary-URL injection with 'zero invariants'; `runtime-rpc-overrides.ts` lines 164-169 explicitly reject URL/scheme inputs — the surface did not exist. Accepting an overstated premise inflates severity, wastes fix cycles, and can trigger unnecessary architectural escalations.
**How to apply:** Any time a security issue says a tool 'accepts arbitrary X,' 'has no invariants,' or 'lacks validation,' grep the tool handler and every referenced validation helper for the claimed input class before confirming the premise. Confirm or deny in the triage comment with a specific file:line citation.
**Tells:** Title contains 'zero invariants' / 'no validation' / 'arbitrary input'; labels include `security_finding`; no specific code line cited proving the gap; tool names sound mutable (`set_*`, `configure_*`, `switch_*`); report describes threat model in terms of what the tool *could* do rather than what it currently does.

<!-- run:run-2026-05-01T18-04-35-881Z issue:#614 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Audit the existing implementation before accepting a bug report's premise about missing behavior

**Rule:** When a report claims 'endpoint X never probes Y,' trace the full execution path — SDK restore hooks, background timers, per-request guards — before accepting the gap as real or writing new code.
**Why:** Reporters see a surface symptom (e.g., a stale status field, an opaque error string) without knowing the underlying pipeline. Accepting the premise unchecked risks duplicating existing probes, masking the real root cause, and growing technical debt.
**How to apply:** Grep the relevant subsystem for the claimed missing behavior first. If the behavior already exists at multiple layers, the reporter's proposed fix is likely mis-targeted; redirect attention to the actual anomaly (e.g., error serialization, rendering, asymmetric code paths).
**Tells:** Report proposes adding a probe or check to a thin status/health function; related issues already exist for the same symptom class; the reported error output (e.g., `[object Object]`) doesn't match what a missing-probe failure would produce.
**Secondary signal:** An opaque stringified error (`[object Object]`) in a codebase with typed error classes is its own bug — suggest retargeting to error rendering before adding new checks.

<!-- run:run-2026-05-05T19-14-11-189Z issue:#561 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Verify actual MCP tool schemas before accepting security-finding premises about parameter types

**When a security report claims an MCP tool accepts a specific parameter variant (e.g. `addressOrLabel`), read the actual `schemas.ts` before accepting the premise.**
**Why:** Issues have asserted label-resolution paths in tools that only accept regex-validated literal addresses; a false schema premise wastes triage effort and risks spawning duplicate skill issues against a threat vector that doesn't exist at the MCP boundary.
**How to apply:** For any `security_finding` or `bug_report` whose core claim hinges on a specific parameter name or type, grep the relevant schema file first. If the parameter doesn't exist, push back immediately and cite the schema line range.
**Tells:** Issue title names a compound parameter variant (e.g. `addressOrLabel`, `recipientOrAlias`); labels include `security_finding`; named tools are MCP boundary tools.

<!-- promote-candidate:rogue-mcp-self-attestation -->
A proposed security gate that routes enforcement through the same trust channel as the adversary provides no real protection. When the threat model is a rogue MCP server, requiring a prior call to another MCP tool (e.g. list_contacts) as a pre-condition is ineffective — the rogue server can fabricate both the spoofed decoration and a gate-bypass response. Effective enforcement must occur at a layer the adversary cannot control: cryptographic verification, out-of-band re-derivation, or schema-enforced literal-address validation at the MCP boundary itself.
<!-- /promote-candidate -->

**Also:** Before accepting a "missing control" finding, audit existing defenses (`assertNoAddressLeak`, regex-validated address fields) — they often already block the stated vector by construction.

<!-- run:run-2026-05-02T10-31-33-192Z issue:#52 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Log raw output on parse failure, omit it on success

**When a structured-envelope parse fails, capture the raw final text (truncated to a safe ceiling, e.g. 4KB) in the same log entry that records the failure.** On the happy path, omit the field entirely so logs aren't bloated.

**Why:** Without the raw text, diagnosing `parseError`-class failures required re-running the agent at real cost — the evidence that would explain the failure was silently discarded at log time.

**How to apply:** Any log site that records a boolean or structured `parseError` / `decodeError` field should also emit the truncated raw input that caused it, keyed as `finalText`, `rawOutput`, or similar. Reuse an existing `truncate(s, n)` helper rather than adding a new one.

**Tells:**
- A log entry carries `parseError: true` (or non-null) with no accompanying raw content
- Diagnosing a failure class requires a re-run rather than inspecting existing logs
- A `truncate` helper already exists in scope but isn't used at the error-logging call site

<!-- run:run-2026-05-03T05-54-13-869Z issue:#63 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Sweep and prune functions must return structured partial-failure lists, not silent warn events

**When a sweep/cleanup function cannot process some items (e.g. branches locked to a worktree, files held open), it must return a typed skipped list — not just emit a log warning.** A quiet `warn` event scrolls past in verbose output and accumulates silently for months until disk pressure or namespace collisions force emergency manual triage.

**Why:** `pruneStaleAgentBranches` was returning `void` and emitting a single dim warn event per unprunable branch. Over heavy use those branches piled up with no audit trail and no user-visible prompt to act.

**How to apply:** Any function named `prune*`, `sweep*`, `clean*`, or `delete*` that may skip items must: (1) return `{ pruned: T[], unprunable: T[] }` (or equivalent); (2) persist the unprunable list into the relevant `RunState` field so `state/<runId>.json` serves as an audit trail; (3) print a prominently-coloured (yellow/red) remediation summary on stderr at **every** call site listing paths and owning agent/process so the operator can act.

**Tells:** function has `void` return type; failure is only visible in structured log events; skipped condition is a predictable locked-resource pattern (worktree checkout, open file handle, held lock).

**Safety boundary:** Never auto-force-remove an attached or checked-out resource (worktrees, volumes, sockets) — that risks silently destroying in-flight user work. Always require explicit operator action; provide the exact command to run.

<!-- run:run-2026-05-04T14-08-59-410Z issue:#62 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Partition dispatch list against open PRs before creating worktrees to prevent branch-collision failures

**Always query open PRs before dispatching issues that create named branches or worktrees; remove issues already covered by an open PR from the dispatch list rather than attempting to re-mint the same branch.**

**Why:** The stale-sweep correctly preserves `vp-dev/<agentId>/issue-<N>` branches when live PRs depend on them, but the dispatcher then calls `git worktree add -b <branch>` for the same `(agentId, issueId)` on the next run. The branch already exists, so the command fails silently under a generic uncaught-error path — the issue is dropped with no visible warning and no retry. The collision rate compounds across runs.

**How to apply:** At the start of any `run` or `resume` command, make a single `gh pr list --state open` call (or equivalent), parse the branch names to extract covered issue IDs, and call a pure `partitionOpenPrIssues` helper that splits the candidate list into `(toDispatch, alreadyCovered)`. Surface `alreadyCovered` in the user-facing y/N gate alongside `triageSkipped` so operators see why issues are being held back.

**Tells:** dispatch command creates branches with deterministic names derived from `(agentId, issueId)` · stale-sweep is configured to preserve branches with open PRs · errors appear as `error.agent.uncaught` on `git worktree add` rather than a named dispatch failure · issue loss rate grows with the number of open PRs.

**How to apply (scope):** Add the preflight partition to every entry-point that calls `git worktree add -b`; a single RPC call at run start is cheaper than a per-issue retry loop and avoids the race entirely. Prefer the smallest fix (filter before dispatch) over branch-salting or orchestrator-level overrides.

<!-- run:run-2026-05-05T19-14-11-189Z issue:#586 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Advisory finding self-identifies as architectural when Suggested-fix cites model-layer RLHF

**When a `security_finding`'s own Suggested-fix section names model-layer training or RLHF as the remedy, treat it as self-confirming architectural scope and post the architectural-close template immediately — no skill issue needed.**

**Why:** A reporter who correctly diagnoses the fix as upstream model-safety-tuning has already placed the finding outside vaultpilot-mcp's control surface. Filing a skill-layer workaround on top is security theater; the issue's own framing is the triage signal.

**How to apply:** Read the Suggested-fix block first during triage. If it leads with words like "model-layer", "RLHF", "training", or "Anthropic upstream", close as architectural and skip skill-issue creation entirely. The author's remedy language is dispositive.

**Tells:** `advisory-layer` + `rogue-agent-only` tags present; no MCP tool surface (`prepare_*`, `preview_send`, `send_transaction`) named anywhere in the body; Suggested-fix is framed toward the LLM/model rather than toward skill code or plugin configuration.

<!-- run:run-2026-05-05T19-14-11-189Z issue:#559 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Skill-side mandates don't defend Role-A rogue-agent attacks — fix layer must exceed attacker's trust boundary

**When a repro frames the attacker as the invoking agent itself (Role-A / rogue-agent), skill-side mandates or advisories provide zero marginal defense** — the hostile agent ignores them exactly as it ignored any existing advisory.
**Why:** A rogue agent controls when and whether it calls any skill tool; a "skill must call X before Y" rule is bypassed trivially by simply not calling it. The fix layer must sit above the attacker's control plane: MCP-side state gates, Role-B out-of-band verification, or an architectural close are the only meaningful options.
**How to apply:** On any `security_finding` issue, first classify the threat — cooperative-agent (Role-B, fix lives in skill) vs. rogue-agent (Role-A, skill-side fix is inert). If rogue-agent, push back on skill-side fixes and surface three options: (a) close architectural, (b) reframe as cooperative-agent variant filed at the correct repo/layer with explicit Role-B scope, (c) add an MCP-side session-state gate.
**Tells:** `security_finding` label; repro says "agent + MCP coordinate-attack" or "agent chose not to invoke"; suggested fix is "skill should require/mandate X before advancing to Y".

<!-- promote-candidate:advisory-layer -->
In vaultpilot's opaque-calldata flows, skill-side advisories ("extra-vigilant, not mandatory") and skill-side mandates are both neutralized by a rogue Role-A agent because the agent controls skill invocation entirely. An advisory that a cooperative agent honors becomes a no-op when the agent itself is the attacker. MCP-side session-state gates — tracking whether `get_verification_artifact` was called before `preview_send` inside the MCP server's own state — are the only enforcement point that survives a Role-A attack in this architecture.
<!-- /promote-candidate -->

<!-- run:run-2026-05-01T14-48-57-664Z issue:#600 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## MCP-side checks do not defend against rogue-MCP threats — validate the trust boundary before accepting a mitigation

**When a security finding proposes adding validation on the MCP/server side to defend against a colluding or compromised MCP, reject it as tautological.** A rogue-MCP fabricates both the payload and the check result; placing the validator on the attacked boundary provides zero net defense.

**Why:** A proposed "server-side election-state digest" extension was structurally circular — the same fabrication path that corrupts witness rankings also corrupts any MCP-emitted digest. The relevant invariant for rogue-MCP scenarios is always on the *skill* side (durable-binding source-of-truth), not the MCP side.

**How to apply:** Before implementing any mitigation, identify which trust boundary is being attacked. If the proposed fix lives inside that boundary, flag tautological and redirect to the skill-side gap — typically a durable-binding kind in `src/security/durable-binding.ts` (Inv #15) or a device-firmware blind-sign architectural limit (Role-C).

**Tells:** Proposed fix is "extend [MCP/server/oracle] to also verify [value that same component already provides]"; labels include `set-level-collude`, `role-c`, or `ledger-blind-sign`; threat model names a colluding MCP or server.

Also verify before acting: (a) scan existing durable-binding closed-enum kinds for coverage already in place; (b) search for closed won't-fix duplicates on the same blind-sign architectural limit before re-implementing; (c) confirm the canonical multi-surface tracking issue before opening a new one.

<!-- run:run-2026-05-01T17-27-23-838Z issue:#591 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## RPC-endpoint-origin threats are skill-side pin rules, not MCP-side invariant extensions

**Rule:** When an issue proposes an MCP-side defense (digest, signature, or hash-anchor) against a 'MCP could return a falsified RPC / connection endpoint' threat, push back and reroute: the correct fix is a skill-side 'pin to curated registry, refuse MCP-emitted URLs' rule, filed as a `cross-repo-scope-split` in the skill repo with cooperating-agent-only scope.
**Why:** Any proof the MCP emits over the same URL set it controls is tautological — a colluding MCP fabricates both the URL and the accompanying digest from inside the same trust boundary. The defense must live outside that boundary (skill layer, curated registry) to have any bite.
**How to apply:** On any issue asking to extend an MCP-side invariant (e.g. Inv #14 or equivalent) to cover RPC / validator / SR endpoint enumeration, decompose the cells first: items already covered by existing `durable-binding` kinds get closed as duplicate-of-design; the endpoint-switch cell gets rerouted skill-side.
**Tells:** issue proposes MCP 'prefix the set with a signed digest'; threat is described as validator/RPC node selection emitted by the MCP; tags include `rpc-endpoint-pinning`, `set-level-collude`, or `inv-14`.
**Recommended triage output:** (1) close MCP-side request as tautological, (2) open skill-side issue for curated-registry pin, (3) confirm with user before filing the skill-side issue if scope is ambiguous.

<!-- run:run-2026-05-01T17-27-23-838Z issue:#600 outcome:pushback ts:2026-05-09T05:42:15.897Z -->
## Reject tautological mitigations when the attacker controls both data and its attestation

**Never accept a proposed integrity check whose attestation is sourced from the same component the threat model names as the adversary.** A rogue MCP can fabricate both the data it returns (e.g. a validator/witness list) and any digest, block-anchored hash, or signed proof it emits over that same data — adding the digest to an invariant provides zero additional trust.

**Why:** Block-anchored or hash-extended defenses implemented inside a compromised trust boundary are circular: the attacker controls the input, the hash, and the claimed provenance simultaneously. The net security delta is zero.

**How to apply:** Before implementing or approving any MCP-side integrity extension, ask: 'Does the verifier trust the same component the threat model names as the adversary?' If yes, reject or re-scope to an out-of-band trust anchor — hardware attestation, an independent RPC the agent pins separately, or on-device clear-sign verification.

**Tells:** Issue proposes 'MCP emits an anchored digest / signed proof of its own output'; threat model explicitly names rogue-MCP or colluding agent; proposed fix introduces no external oracle or hardware anchor; existing invariant already names the at-risk address kind with a public-provenance hint.

<!-- run:run-2026-05-02T06-32-08-433Z issue:#32 outcome:implement ts:2026-05-09T05:42:15.897Z -->
## Reuse existing sentinel formats when adding parallel output paths — extend with a new variant value

**When a plan calls for a separate sentinel or marker format for a new parallel path, prefer adding a variant value to the existing format instead.**
**Why:** A new sentinel shape forces every downstream consumer — pruner, filter, parser — to be updated simultaneously; missed updates cause silent data loss or double-processing. Extending the existing format (e.g. `outcome:failure-lesson` alongside `outcome:lesson`) leaves all current consumers compatible with zero changes and shrinks the diff surface.
**How to apply:** Before introducing a new sentinel shape, check whether the existing marker has a string/enum field that can carry a new value. Accept a wholly new format only when the semantics are genuinely incompatible with the existing shape.
**Tells:** Plan says 'introduce a separate sentinel format'; existing sentinel has a fixed `outcome:` or `type:` discriminator field; at least one downstream pruner/filter already handles the existing format.
**Corollary:** Apply the same principle to error classifiers — add an `isInfraFlake` (or equivalent noise-gate) guard on any new error-handling path so that transport / 5xx / filesystem failures that carry no learning value are silently dropped rather than producing junk output.
