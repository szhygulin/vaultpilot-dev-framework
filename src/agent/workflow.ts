export interface WorkflowVars {
  issueId: number;
  targetRepo: string;
  worktreePath: string;
  branchName: string;
  dryRun: boolean;
  inspectPaths?: string[];
  agentId: string;
  agentName?: string;
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
Your worktree is ${v.worktreePath} on branch ${v.branchName}. Your shell already starts in this directory for every Bash invocation — the cwd is preset. **Never prefix Bash commands with \`cd ${v.worktreePath} && …\`**: the leading word becomes \`cd\` (not on the gate's allowlist) and the call is denied. Run commands directly: \`npm run build\`, \`git status\`, \`git diff\`. **For text search, use the \`Grep\` tool (any path, any pattern) — bash \`grep\` is not allowlisted and will be denied.** Stay inside the worktree. Never push to main.${dryNote}${inspectNote}

## Step 1 — Read the issue and ALL comments
Run BOTH:
  gh issue view ${v.issueId} --repo ${v.targetRepo} --json number,title,body,labels,state
  gh api repos/${v.targetRepo}/issues/${v.issueId}/comments

Per CLAUDE.md "Issue Analysis": comments are where reviewers add follow-up scope or push back on the original framing. Fold every comment into the analysis.

If a \`# Plan for issue #${v.issueId} (from feature-plans/...)\` section appears above this workflow in your seed, that plan was prepared in advance — treat it as authoritative design guidance, read it before Step 2, and prefer its file-by-file layout over reinventing one. If no such section is present, either the issue body's \`## Plan\` is "Not needed — coding agent can start directly from the issue body" or the convention path was empty; in either case proceed from the issue body alone.

## Step 2 — Apply judgment rules from CLAUDE.md
- Push-Back Discipline: faulty premise → push back BEFORE acting.
- Smallest-Solution Discipline: minimum change first; flag larger proposals.
- Rogue-Agent-Only Triage: pure-advisory threats with no signing flow → close as architectural; do not invent skill-side defenses against rogue agents.
- Cross-Repo Scope Splits: if the fix splits between MCP code and skill rendering, file the skill half as a tracked issue in vaultpilot-security-skill and link both ways.
- Typed-Data Signing Discipline applies if the issue touches typed-data signing tools.

## Step 3 — Decide internally: pushback OR implement

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
6. Open the PR — body MUST start with "Closes #${v.issueId}" on its own line so GitHub auto-closes. The body MUST also end with a single-line signature \`— ${v.agentName ?? v.agentId} (${v.agentId})\` so the human reader can tell which agent opened the PR.
   Write the PR body to a tmp file using the **\`Write\` tool** (same reason as Pushback path: heredoc chained with \`gh pr create\` trips the dry-run gate). Then run \`gh pr create\` as its OWN top-level Bash invocation:
     gh pr create --repo ${v.targetRepo} --base main --head ${v.branchName} --title <short title> --body-file <tmp>
7. Format the returned PR URL as a Markdown hyperlink in your reasoning.

## Step 4 — Emit the JSON envelope as your FINAL message

Wrap it in a fenced \`\`\`json block. Schema:

\`\`\`json
{
  "decision": "implement" | "pushback" | "error",
  "reason": "1-3 sentences on what you did and why",
  "prUrl": "<only for implement>",
  "commentUrl": "<only for pushback>",
  "scopeNotes": "<optional, e.g. skill issue filed at vaultpilot-security-skill#NN>",
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
