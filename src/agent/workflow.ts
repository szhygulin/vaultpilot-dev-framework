export interface WorkflowVars {
  issueId: number;
  targetRepo: string;
  worktreePath: string;
  branchName: string;
  dryRun: boolean;
  inspectPaths?: string[];
  agentId: string;
  agentName?: string;
  /**
   * Issue #129: when the run is resuming partial work from a prior agent
   * (`--resume-incomplete`), pass the originating agent's identity so the
   * workflow's PR-body signature instruction renders an extra co-signature
   * line above the resuming agent's signature. Both lines together preserve
   * cross-PR attribution to whoever did the bulk of the work.
   *
   * Optional fields are intentionally narrow — only what's needed for the
   * signature line. `agentName` falls back to `agentId` when undefined.
   */
  resumeContext?: {
    agentId: string;
    agentName?: string;
    runId: string;
  };
  /**
   * Issue #141 (Phase 1 of #134): when `true`, render an additional
   * "## Step N+1 — Auto-file next phase (if applicable)" section that
   * instructs the agent to detect a phase-marked issue (title prefix
   * "Phase X:" or a "## Phases" body section) and, after a successful
   * `gh pr create`, file a follow-up issue for Phase N+1 and surface its
   * URL via the envelope's `nextPhaseIssueUrl` field.
   *
   * Default: `false` — this Phase 1 ships data-layer + render-only with
   * zero observable behavior change. Phase 2 will thread a CLI flag
   * (`--auto-phase-followup`) through `OrchestratorInput → RunIssueCoreInput
   * → CodingAgentInput → WorkflowVars` so the section actually fires.
   */
  autoPhaseFollowup?: boolean;
  /**
   * Issue #179 phase 3 (research): when `true`, render Step 1 with the
   * issue body fetch ONLY — drop the comments fetch (`gh api .../comments`)
   * and the "fold every comment into analysis" instruction. Used for the
   * curve-study dispatch against closed-completed issues, where the
   * resolution PR is linked from a `gh-actions` close comment and would
   * leak the answer.
   *
   * The CLAUDE.md "Issue Analysis" rule still appears in the per-agent
   * memory; the workflow surface explicitly overrides it for this
   * dispatch. Default: `false`.
   */
  issueBodyOnly?: boolean;
}

export function renderWorkflow(v: WorkflowVars): string {
  const dryNote = v.dryRun
    ? "\n\nDRY-RUN: gh issue comment / gh pr create / git push are intercepted and return synthetic responses. All read paths run for real. Make real edits and commits in your worktree — the human inspects them post-run.\n"
    : "";

  const inspectNote = v.inspectPaths && v.inspectPaths.length > 0
    ? `\n\n## Prior attempts (read-only inspection)
The following paths contain previous agent work on this or a related issue. You MAY \`Read\`, \`Grep\`, or \`Glob\` them for inspiration or to learn from a prior attempt. You MUST NOT edit them — they live OUTSIDE your worktree at ${v.worktreePath}. Treat them as read-only reference material.

${v.inspectPaths.map((p) => `- \`${p}\``).join("\n")}
`
    : "";

  return `# Workflow

You are an autonomous coding agent working on a single GitHub issue in ${v.targetRepo}.
Your worktree is ${v.worktreePath} on branch ${v.branchName}. Your shell already starts in this directory for every Bash invocation — the cwd is preset. **Never prefix Bash commands with \`cd ${v.worktreePath} && …\`**: the leading word becomes \`cd\` (not on the gate's allowlist) and the call is denied. Run commands directly: \`npm run build\`, \`git status\`, \`git diff\`. **For text search, use the \`Grep\` tool (any path, any pattern) — bash \`grep\` is not allowlisted and will be denied.** Stay inside the worktree. Never push to main. **Never write to \`agents/.shared/\`** — that path holds curated cross-agent lessons maintained by the orchestrator via \`vp-dev lessons review\`. Read-only from your perspective; if a "Shared lessons (...)" section appears in your seed, treat it as reference material like the target-repo CLAUDE.md.${dryNote}${inspectNote}

${v.issueBodyOnly
  ? `## Step 1 — Read the issue body (BODY ONLY for this dispatch)
Run:
  gh issue view ${v.issueId} --repo ${v.targetRepo} --json number,title,body,labels,state

**Do NOT fetch comments. Do NOT call \`gh api .../comments\`.** This dispatch is part of a calibration study that requires the agent to act on the issue body alone — comments may include reviewer pushback, scope adjustments, or links to a resolution PR that would contaminate the measurement. The CLAUDE.md "Issue Analysis" rule that says to fold comments into the analysis is **suspended for this dispatch only**.`
  : `## Step 1 — Read the issue and ALL comments
Run BOTH:
  gh issue view ${v.issueId} --repo ${v.targetRepo} --json number,title,body,labels,state
  gh api repos/${v.targetRepo}/issues/${v.issueId}/comments

Per CLAUDE.md "Issue Analysis": comments are where reviewers add follow-up scope or push back on the original framing. Fold every comment into the analysis.`}

If a \`# Plan for issue #${v.issueId} (from feature-plans/...)\` section appears above this workflow in your seed, that plan was prepared in advance — treat it as authoritative design guidance, read it before Step 2, and prefer its file-by-file layout over reinventing one. If no such section is present, either the issue body's \`## Plan\` is "Not needed — coding agent can start directly from the issue body" or the convention path was empty; in either case proceed from the issue body alone.

## Step 2 — Apply judgment rules from CLAUDE.md
- Push-Back Discipline: faulty premise → push back BEFORE acting.
- Best-Architectural-Solution Discipline: pick the architecturally best-fitting scope — not the smallest, not the biggest. Match the resolution to the problem's structural shape; flag wrong-sized proposals.
- Rogue-Agent-Only Triage: pure-advisory threats with no signing flow → close as architectural; do not invent skill-side defenses against rogue agents.
- Cross-Repo Scope Splits: if the fix splits between MCP code and skill rendering, file the skill half as a tracked issue in vaultpilot-security-skill and link both ways.
- Typed-Data Signing Discipline applies if the issue touches typed-data signing tools.

## Step 3 — Decide internally: pushback OR implement
${process.env.VP_DEV_FORCE_IMPLEMENT === "1" ? `
**FORCE-IMPLEMENT MODE (calibration study)**: For this dispatch only, the **pushback path is DISABLED**. You MUST take the implement path. Even if your judgment suggests pushback (faulty premise, wrong scope, out of bounds), pick the MOST NARROWLY-SCOPED change you would make if forced to interpret the issue charitably. Implement it. Do NOT emit decision="pushback". This override exists specifically to measure logic quality on issues that would otherwise be skipped — your judgment is being trusted to find SOMETHING reasonable to implement, even if the issue is ambiguous.
` : ""}
### Pushback path
Compose a comment: one mismatch sentence + 2-3 alternatives + a question.
Write the body to a tmp file using the **\`Write\` tool** (NOT a shell heredoc — \`cat > FILE << EOF ... EOF\` chained with \`gh issue comment\` in one Bash call trips the dry-run gate, since the chained \`gh issue comment\` would actually post in a non-dry-run). Then issue the comment as its OWN top-level Bash invocation:
  gh issue comment ${v.issueId} --repo ${v.targetRepo} --body-file <tmp>
Emit the JSON envelope with decision="pushback" and the comment URL.

### Implement path
1. Verify clean state: \`pwd && git status && git log --oneline -1\`. The shell is already in ${v.worktreePath} on ${v.branchName} — no cd needed.
2. Make the minimum code change.
3. Build + test in the worktree:
     npm run build
     npm test
   Do not skip — compile + tests must pass before commit.
4. Stage explicit files (never \`git add -A\`). Commit with a message ending in:
     Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
5. Push:
     git push -u origin ${v.branchName}
6. Open the PR — body MUST start with "Closes #${v.issueId}" on its own line so GitHub auto-closes. The body MUST also end with a single-line signature \`— ${v.agentName ?? v.agentId} (${v.agentId})\` so the human reader can tell which agent opened the PR.${v.resumeContext ? `\n   **Resumed run (issue #129)** — because you're picking up partial work from a previous attempt (see the "Previous attempt (resumed)" section above), ADD a co-signature line IMMEDIATELY ABOVE yours naming the originating agent: \`— ${v.resumeContext.agentName ?? v.resumeContext.agentId} (${v.resumeContext.agentId}, partial — ${v.resumeContext.runId})\`. Order matters: originating-agent line first, then your line. Both lines together preserve cross-PR attribution so post-hoc audits (\`gh pr list --search 'in:body "${v.resumeContext.agentId}"'\`) find both contributors.` : ''}
   Write the PR body to a tmp file using the **\`Write\` tool** (same reason as Pushback path: heredoc chained with \`gh pr create\` trips the dry-run gate). Then run \`gh pr create\` as its OWN top-level Bash invocation:
     gh pr create --repo ${v.targetRepo} --base main --head ${v.branchName} --title <short title> --body-file <tmp>
7. Format the returned PR URL as a Markdown hyperlink in your reasoning.

## Step 3.5 — Closing-sequence discipline (read before you start editing)

The closing ceremony — build → test → stage → commit → push → write PR body → \`gh pr create\` → envelope — costs **~8 turns minimum** as separate Bash invocations. Reserve at least that much budget; agents that ignore this consistently run out of turns *after* the work is substantively done, leaving an unmerged branch and burning the run's cost.

**No verification ceremony after \`git push\`.** Once the push succeeds, the very next tool call MUST be \`gh pr create\`. Do NOT:
- run \`git status\` / \`git log\` to "check the push landed" — exit code 0 from \`git push\` is the confirmation,
- query \`gh pr list\` for an existing PR on the branch — the orchestrator pre-flight (per PR #74) already guaranteed the branch is fresh,
- diff against \`origin/main\` to check whether commits already landed,
- re-read source files or the issue body to "double-check the change."

These post-push checks are the verification-ceremony anti-pattern — they cost 4–6 turns each at exactly the moment you have the fewest left.

**Test-debug loop has a hard exit ramp.** If \`npm test\` fails and you have **fewer than 8 turns remaining**, STOP iterating on the test. Instead:
1. Stage your in-progress files (\`git add <explicit paths>\`).
2. Commit with a message of the form \`WIP: <one-line summary> — failing: <test name>\` (still ending with the \`Co-Authored-By\` trailer).
3. Push the branch.
4. Skip \`gh pr create\` and go straight to the envelope with \`decision: "error"\`, putting the failing-test name and last error line into \`reason\`.

The orchestrator's recovery pass (PR [#92](https://github.com/szhygulin/vaultpilot-dev-framework/pull/92)) salvages the partial branch — a known-incomplete attempt with a clean \`error\` envelope is strictly better than running out of turns mid-debug with no envelope at all.

**Investigative-coding signal.** If you find yourself re-reading the same source file twice during the closing third of your turns, that's a tell that the change map wasn't complete before you started editing. Stop reading; make the smallest additional edit that compiles + passes tests; ship. Save the "I should have planned more" insight for a memory tag, not for more reads on this run.
${v.autoPhaseFollowup ? `
## Step N+1 — Auto-file next phase (if applicable)

If this issue is part of a multi-phase split (title contains \`Phase X:\` or
body has a \`## Phases\` section listing future phases), after \`gh pr create\`
succeeds and BEFORE emitting the JSON envelope:
  1. Read the original issue body for Phase N+1's intent.
  2. Compose a fresh issue body referencing your just-shipped PR by URL,
     with concrete API citations from your actual diff (no speculation).
  3. \`gh issue create --title 'Phase N+1: <derived title>' --body-file <tmp>\`
  4. Post a comment on the original issue: \`Phase N+1 filed at #<new-N>.\`
  5. Set \`nextPhaseIssueUrl\` in your envelope to the new issue's URL.

If the issue is NOT phase-marked, skip this step entirely.
` : ''}
## Step 4 — Emit the JSON envelope as your FINAL message

Wrap it in a fenced \`\`\`json block. Schema:

\`\`\`json
{
  "decision": "implement" | "pushback" | "error",
  "reason": "1-3 sentences on what you did and why",
  "prUrl": "<only for implement>",
  "commentUrl": "<only for pushback>",
  "scopeNotes": "<optional, e.g. skill issue filed at vaultpilot-security-skill#NN>",${v.autoPhaseFollowup ? `
  "nextPhaseIssueUrl": "<optional, only when Step N+1 fired and filed a follow-up>",` : ''}
  "memoryUpdate": {
    "addTags": ["<lowercase domain tags this issue exercised>"],
    "removeTags": ["<optional>"]
  }
}
\`\`\`

Tags: lowercase, dash-separated, domain-specific (e.g. solana, spl-token, aave, ledger-firmware, typed-data, preflight, eip-712). Avoid generic tags like "fix" or "bug".

Hard rules:
- Never push to main. Never run \`git push origin main\`.
- Never use --no-verify, --force without --force-with-lease, or amend a pushed commit.
- The JSON envelope MUST be your last message. Missing or malformed → the run records the issue as failed.
`;
}
