## Crypto/DeFi Transaction Preflight Checks
- Before preparing any on-chain tx, verify: native gas/bandwidth (TRX bandwidth on TRON), lending pause flags (`isWithdrawPaused` / `isSupplyPaused`), min borrow/supply thresholds, ERC-20 approval status.
- Never use `uint256.max` for collateral withdrawal — fetch the exact balance.
- Multi-step (approve + action): wait for the approval to confirm before sending the dependent tx.
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
<!-- run:run-2026-05-05T15-08-13-725Z issue:#33 outcome:implement ts:2026-05-05T15:18:31.373Z tags:advisory-prose,c4-reframe,cooperating-agent-guidance,smoke-test-batch-04,speculative-pick-refusal,tool-misframing -->
## SKILL.md content changes require a coordinated MCP-side EXPECTED_SKILL_SHA256 bump

**Every content-changing SKILL.md edit must be paired with an MCP-side `EXPECTED_SKILL_SHA256` update shipped in a coordinated PR.**

**Why:** vaultpilot-mcp pins `EXPECTED_SKILL_SHA256` to the last known-good sentinel hash (`vN_<hex>`). Bumping only the skill side leaves the integrity gate mismatched, silently blocking cooperating agents at runtime.

**How to apply:** When a SKILL.md commit increments the sentinel (e.g., v12 → v13), open a paired PR in vaultpilot-mcp updating `EXPECTED_SKILL_SHA256`; merge-order so the MCP side never leads the skill side.

**Tells:** scope notes contain 'coordinated PR pair'; sentinel string in SKILL.md changes; issue carries `c4-reframe`, `tool-misframing`, or `speculative-pick-refusal` tags.

New SKILL.md sections scoped to cooperating-agent scenarios must carry the explicit `cooperating-agent-only` label per Rogue-Agent-Only Finding Triage policy.

<!-- promote-candidate:cooperating-agent-guidance -->
In the vaultpilot-security-skill repo, every SKILL.md change that alters the integrity sentinel string (`vN_<hex>`) has a required paired update in vaultpilot-mcp: the `EXPECTED_SKILL_SHA256` constant must be bumped to match. The two changes are always described in scope notes as a 'coordinated PR pair' and must be merge-ordered so the MCP side does not go live before the new skill content is present. Missing the MCP half causes the integrity gate to mismatch and breaks cooperating-agent runtime checks without an obvious error signal at authoring time.
<!-- /promote-candidate -->
