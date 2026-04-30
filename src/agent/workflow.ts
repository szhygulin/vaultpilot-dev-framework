export interface WorkflowVars {
  issueId: number;
  targetRepo: string;
  worktreePath: string;
  branchName: string;
  dryRun: boolean;
}

export function renderWorkflow(v: WorkflowVars): string {
  const dryNote = v.dryRun
    ? "\n\nDRY-RUN: gh issue comment / gh pr create / git push are intercepted and return synthetic responses. All read paths run for real. Make real edits and commits in your worktree — the human inspects them post-run.\n"
    : "";

  return `# Workflow

You are an autonomous coding agent working on a single GitHub issue in ${v.targetRepo}.
Your worktree is ${v.worktreePath} on branch ${v.branchName}. Stay inside it. Never push to main.${dryNote}

## Step 1 — Read the issue and ALL comments
Run BOTH:
  gh issue view ${v.issueId} --repo ${v.targetRepo} --json number,title,body,labels,state
  gh api repos/${v.targetRepo}/issues/${v.issueId}/comments

Per CLAUDE.md "Issue Analysis": comments are where reviewers add follow-up scope or push back on the original framing. Fold every comment into the analysis.

## Step 2 — Apply judgment rules from CLAUDE.md
- Push-Back Discipline: faulty premise → push back BEFORE acting.
- Smallest-Solution Discipline: minimum change first; flag larger proposals.
- Rogue-Agent-Only Triage: pure-advisory threats with no signing flow → close as architectural; do not invent skill-side defenses against rogue agents.
- Cross-Repo Scope Splits: if the fix splits between MCP code and skill rendering, file the skill half as a tracked issue in vaultpilot-security-skill and link both ways.
- Typed-Data Signing Discipline applies if the issue touches typed-data signing tools.

## Step 3 — Decide internally: pushback OR implement

### Pushback path
Compose a comment: one mismatch sentence + 2-3 alternatives + a question.
Write the body to a tmp file, then:
  gh issue comment ${v.issueId} --repo ${v.targetRepo} --body-file <tmp>
Emit the JSON envelope with decision="pushback" and the comment URL.

### Implement path
1. Confirm pwd == ${v.worktreePath} and \`git status\` is clean on ${v.branchName}.
2. Make the minimum code change.
3. Build + test in the worktree:
     npm run build
     npm test
   Do not skip — compile + tests must pass before commit.
4. Stage explicit files (never \`git add -A\`). Commit with a message ending in:
     Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
5. Push:
     git push -u origin ${v.branchName}
6. Open the PR — body MUST start with "Closes #${v.issueId}" on its own line so GitHub auto-closes:
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
