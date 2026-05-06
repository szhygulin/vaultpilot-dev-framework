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
<!-- run:run-2026-05-05T22-51-54-224Z issue:#180 outcome:pushback ts:2026-05-05T22:53:39.411Z tags:advisory-vs-mutation-seam,agent-memory-growth,claude-md-compaction,dependency-ordering,phased-split,pre-dispatch-triage -->
## Verify phase-dependency infrastructure in code before implementing a later-phase issue

**Before writing any code for a 'Phase N' or explicitly sequenced issue, grep for the concrete artifacts — type names, state-file paths, schema constants — that predecessor phases were supposed to create; if they are absent, push back regardless of the predecessor issue's open/closed label.**

**Why:** An issue can be marked open (or even closed) while the infrastructure it promised is still missing from the codebase. Implementing a later phase against empty infrastructure means every code path silently hits empty-state fallbacks, calibration thresholds are uninitialized, and the issue's own success metrics cannot be evaluated — producing code that is syntactically valid but semantically broken from day one.

**How to apply:** When an issue title or body contains 'Phase N', 'Step N', or an explicit 'depends on #X' line, (1) check the dependency issue's state, AND (2) grep for 2–3 key identifiers called out in the dependency — type names, file patterns, exported constants. If grep returns zero matches, the prerequisite has not landed.

**Tells:** Phase number in issue title; 'MUST land first' / 'depends on' language in body; state-file paths referenced by the new issue that nothing currently writes; schema type names with zero grep hits.

<!-- promote-candidate:phased-split -->
When a multi-phase feature set is implemented in separate issues, later phases routinely reference state files, schema types, and calibration constants that the earlier phase was supposed to create. Checking the predecessor issue status alone is insufficient — the actual file/type must be confirmed present in the codebase via grep before the later phase can produce correct behavior. Absent infrastructure causes silent empty-state fallbacks rather than compile errors, making the breakage hard to detect post-merge.
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
