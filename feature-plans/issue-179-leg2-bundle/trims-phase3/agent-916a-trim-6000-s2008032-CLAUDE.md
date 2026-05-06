## Tool Usage Discipline
- Don't repeat the same informational tool call within a single turn — cache mentally.
- Ambiguous / empty result: verify once with a different method; don't loop without user consent.

## Security Incident Response Tone
- Diagnose malware/compromise with evidence-based scoping before recommending destructive actions (wipe, nuke, rotate-all). Never delete evidence files before reading them.

## Chat Output Formatting
- Markdown hyperlinks over raw URLs everywhere: `[label](url)`. Long URLs (swiss-knife decoders, Etherscan tx, tenderly/phalcon simulations) wrap the terminal into unreadable walls when raw. Apply in user replies AND in any text the server tells the agent to render. Raw URLs OK only when short and scannable (bare domains) or required for machine-readable JSON paste-blocks.

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
