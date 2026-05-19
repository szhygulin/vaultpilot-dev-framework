## SDK Scope-Probing Discipline
- **Scope-probe new third-party SDKs BEFORE committing the plan.** Invoke `rnd`. 15-30 min: `npm view <pkg>` for runtime deps + last-published; install into `/tmp/<pkg>-probe/`, read `dist/*.d.ts`; check transit graph for `*-contracts`, hardhat, ethersproject v5, parallel core libs; confirm the API exposes UNSIGNED tx output (Ledger-compatible), not internally-signing helpers.
- Document the verdict in the plan: SDK / version / red flags / decision (adopt / cherry-pick / skip).
- Cost of skipping: PR #334 adopted `@uniswap/v3-sdk`; shallow d.ts inspection missed the `swap-router-contracts → hardhat → solc/sentry/undici/mocha` transit graph that Snyk caught at PR-CI. ~2h refactor to drop the SDK and port the math to native bigint with fixture-locked bit-exactness.
- Reward: Phase 2/3 (Curve + Balancer) planning rejected `@curvefi/api` (ethers-coupled signing) and `@balancer-labs/sdk` V2 (ethersproject-bound, stale), accepted `@balancer/sdk` V3 (viem-native + V2 helpers). 1 SDK adopted instead of 3.

## Security Incident Response Tone
- Diagnose malware/compromise with evidence-based scoping before recommending destructive actions (wipe, nuke, rotate-all). Never delete evidence files before reading them.

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

## Typed-Data Signing Discipline
- **No typed-data signing tool ships without paired Inv #1b (typed-data tree decode) + Inv #2b (digest recompute) in the same release.** Tools: `prepare_eip2612_permit`, `prepare_permit2_*`, `prepare_cowswap_order`, `sign_typed_data_v4`, any `eth_signTypedData_v4` exposure. Tracked at [#453](https://github.com/szhygulin/vaultpilot-mcp/issues/453).
- Why: hash-recompute alone passes tautologically over a tampered tree — a rogue MCP swaps `spender` inside `Permit{owner, spender, value, nonce, deadline}` and the digest still matches because it's computed over the swap. Worst blast radius in EVM signing: ONE permit signature → perpetual transfer authority for `deadline`'s lifetime (Permit2 batch with 5-year USDT expiration, smoke-test 126, irrevocable once signed).
- Hard precondition: Ledger must clear-sign the typed-data type. If it blind-signs the digest, the agent has no on-device intent verification — the tool MUST refuse (user can't tell `Permit{spender: TRUST_ROUTER}` from `Permit{spender: ATTACKER}` on screen).
- Inv #1b: decode `domain` / `types` / `primaryType` / `message` locally; surface every address-typed field (`spender`, `to`, `receiver`, `verifyingContract`) in CHECKS PERFORMED with bold + inline-code; surface `deadline` / `validTo` / `expiration` with delta-from-now and flag if > 90 days; pin `verifyingContract` against a curated map (Permit2 = `0x000000000022D473030F116dDEE9F6B43aC78BA3`, USDC permit, CowSwap settlement) and refuse on mismatch; apply Inv #11 unlimited / long-lived rules per entry when `primaryType` ∈ `{Permit, PermitSingle, PermitBatch, Order}`.
- Inv #2b: independently recompute `keccak256("\x19\x01" || domainSeparator || hashStruct(message))` from the decoded tree, match against MCP-reported digest.
- Apply at PR-review and design time — push back on plans that bundle "ship the tool, add invariants later." Today's defense is gap-by-design (no typed-data tools); the moment that gap closes without #1b + #2b, every existing skill defense is silently bypassed.

## Rogue-Agent-Only Finding Triage
- **When the threat is "rogue agent generates harmful advisory text" or "rogue agent fabricates/suppresses MCP results" with no signing flow, close as architectural — don't ship MCP/skill mitigations pretending to fix it.** The skill is text in the agent's context; a hostile agent reads any rule and ignores it. Real defenses live at model-safety-tuning (Anthropic) or chat-client output-filter (Claude Code / Cursor / Desktop) — neither in scope here.
- Tells: output is purely advisory text (no `prepare_*` / `preview_send` / `send_transaction`); agent fabricates a security UI (fake `CHECKS PERFORMED` with `{✓}` verdicts); agent suppresses or falsifies MCP results; proposed fix is "add a rule to SKILL.md" with no other layer.
- **Don't confuse with rogue-MCP + cooperating-agent (Role B).** Skill rules genuinely bind a cooperating agent; read-only response-spoofing, fabricated `compare_yields` rows are real targets for skill-side guidance.
- **Don't confuse with device-layer architectural** (e.g. Ledger blind-sign) — different escalation path (vendor, not model/UI safety).
- Closing template: brief comment naming the architectural gap, citing #536 (canonical) + vaultpilot-mcp-smoke-test#21 (Role A scope-reframing methodology), one-line recap of why skill rules don't help.
- Cooperating-agent guidance with an explicit honest scope label IS acceptable (skill v0.7.0 / vaultpilot-security-skill PR #20). The rule above forbids dressing it up as a defense against the rogue case it isn't actually defending — security theater. Scope label "guides cooperating agents; does NOT defend against a rogue agent that ignores it" must be in the rule body, not just the PR description.

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
## Write audit-trail companion fields atomically with the state-transition flag that triggers them

**When a mutation flips a boolean state flag (`archived`, `completed`, `deleted`, etc.), always write every companion audit field (`archivedAt`, `splitInto`, `reason`, related-ID arrays) in the exact same transaction or mutation block — never leave them for a follow-up write.**

**Why:** A flag-only write creates a permanently incomplete audit trail: the registry can answer 'was this archived?' but not 'when?' or 'into what?'. Backfilling after the fact is lossy and the gap is invisible until a consumer tries to query the companion fields.

**How to apply:** Before closing any state-transition mutation, scan the target schema for fields named `*At`, `*By`, `*Into`, `*From`, `*Reason`, or sibling ID arrays. If the flag is being set but its companions are not, extend the same mutation to include them.

**Tells:** A schema has a boolean like `archived?: boolean` next to `archivedAt?: string` or `splitInto?: string[]`. Only the boolean is being written. The companion fields are either missing from the schema entirely or present but never populated.

**Also:** Issue descriptions may misstate the current schema — always read the actual source files before assuming fields exist. Add missing fields as optional (`?`) to preserve back-compat with pre-transition records already in the registry.

<!-- run:run-2026-05-05T11-30-15-426Z issue:#102 outcome:implement ts:2026-05-05T11:41:20.005Z tags:cli-subcommand,file-lock,lesson-curation,llm-call,pool-trim,shared-lessons -->
## SKILL.md content changes require a coordinated MCP-side EXPECTED_SKILL_SHA256 bump

**Every content-changing SKILL.md edit must be paired with an MCP-side `EXPECTED_SKILL_SHA256` update shipped in a coordinated PR.**

**Why:** vaultpilot-mcp pins `EXPECTED_SKILL_SHA256` to the last known-good sentinel hash (`vN_<hex>`). Bumping only the skill side leaves the integrity gate mismatched, silently blocking cooperating agents at runtime.

**How to apply:** When a SKILL.md commit increments the sentinel (e.g., v12 → v13), open a paired PR in vaultpilot-mcp updating `EXPECTED_SKILL_SHA256`; merge-order so the MCP side never leads the skill side.

**Tells:** scope notes contain 'coordinated PR pair'; sentinel string in SKILL.md changes; issue carries `c4-reframe`, `tool-misframing`, or `speculative-pick-refusal` tags.

New SKILL.md sections scoped to cooperating-agent scenarios must carry the explicit `cooperating-agent-only` label per Rogue-Agent-Only Finding Triage policy.

<!-- promote-candidate:cooperating-agent-guidance -->
In the vaultpilot-security-skill repo, every SKILL.md change that alters the integrity sentinel string (`vN_<hex>`) has a required paired update in vaultpilot-mcp: the `EXPECTED_SKILL_SHA256` constant must be bumped to match. The two changes are always described in scope notes as a 'coordinated PR pair' and must be merge-ordered so the MCP side does not go live before the new skill content is present. Missing the MCP half causes the integrity gate to mismatch and breaks cooperating-agent runtime checks without an obvious error signal at authoring time.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T16-20-40-497Z issue:#129 outcome:implement ts:2026-05-05T16:26:30.113Z tags:co-signature,pr-attribution,resume-incomplete,salvage-workflow,workflow-prompt -->
## Diagnose CLAUDE.md growth shape before choosing splitter vs compactor

**When CLAUDE.md has ≤4 sections but individual sections are accreting rules, the splitter is the wrong tool — route to compaction-via-merge instead.**
**Why:** The splitter resolves horizontal overload (distinct sub-specialties → sibling agents); it cannot act on vertical growth (depth within one coherent specialty). Applying the splitter to the wrong shape produces spurious sibling agents with no real scope boundary.
**How to apply:** Before invoking the splitter, check whether active section count clears the splitter-section-floor threshold; if it does not, route to `compact-claude-md` (advisory) first.
**Tells:** `agent-memory-growth` or `claude-md-compaction` tags active; CLAUDE.md has ≤4 sections but individual sections exceed line or rule-count budgets.

**LLM merge proposals must pass a collapsed-distinct-rules check before surfacing — flag any cluster whose merge would drop a past-incident date.**
**Why:** A `Why:` line containing a date or issue reference is episodic memory that justifies the rule's existence; silent loss during compaction lets a future agent re-learn the same lesson expensively.
**How to apply:** Run the validator immediately after parsing the Zod-validated LLM response; surface per-cluster warnings, not a hard abort — the operator decides whether the drop is acceptable.

<!-- promote-candidate:claude-md-compaction -->
CLAUDE.md growth has two distinct shapes: section-count growth (many distinct sub-specialties accumulate → splitter resolves it by creating sibling agents) and section-depth growth (≤4 sections are internally dense for one coherent specialty → splitter cannot help). LLM merge proposals for the depth shape carry a hidden risk: silently dropping `Why:` lines that contain dates or issue references, which are episodic anchors justifying rule existence. Flagging these per-cluster rather than aborting lets operators decide intentionally.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-03-52-041Z issue:#167 outcome:implement ts:2026-05-05T22:06:16.655Z tags:claude-md-compaction,heading-max,production-data-clamp-overrun,single-source-of-truth-const,thesis-summary-heading -->
## Verify phase-dependency infrastructure in code before implementing a later-phase issue

**Before writing any code for a 'Phase N' or explicitly sequenced issue, grep for the concrete artifacts — type names, state-file paths, schema constants — that predecessor phases were supposed to create; if they are absent, push back regardless of the predecessor issue's open/closed label.**

**Why:** An issue can be marked open (or even closed) while the infrastructure it promised is still missing from the codebase. Implementing a later phase against empty infrastructure means every code path silently hits empty-state fallbacks, calibration thresholds are uninitialized, and the issue's own success metrics cannot be evaluated — producing code that is syntactically valid but semantically broken from day one.

**How to apply:** When an issue title or body contains 'Phase N', 'Step N', or an explicit 'depends on #X' line, (1) check the dependency issue's state, AND (2) grep for 2–3 key identifiers called out in the dependency — type names, file patterns, exported constants. If grep returns zero matches, the prerequisite has not landed.

**Tells:** Phase number in issue title; 'MUST land first' / 'depends on' language in body; state-file paths referenced by the new issue that nothing currently writes; schema type names with zero grep hits.

<!-- promote-candidate:phased-split -->
When a multi-phase feature set is implemented in separate issues, later phases routinely reference state files, schema types, and calibration constants that the earlier phase was supposed to create. Checking the predecessor issue status alone is insufficient — the actual file/type must be confirmed present in the codebase via grep before the later phase can produce correct behavior. Absent infrastructure causes silent empty-state fallbacks rather than compile errors, making the breakage hard to detect post-merge.
<!-- /promote-candidate -->

<!-- run:run-2026-05-05T22-51-54-224Z issue:#178 outcome:implement ts:2026-05-05T23:03:13.714Z tags:agent-memory-growth,data-layer-only,fail-soft-state,lesson-utility-scoring,phased-split,pushback-hook,stable-section-id,summarizer-hook -->
