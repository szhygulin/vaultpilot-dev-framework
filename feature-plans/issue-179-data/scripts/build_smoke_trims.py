import os, json
src = open('agents/agent-916a/CLAUDE.md').read()
lines = src.split('\n')
starts = []
for i, line in enumerate(lines):
    if line.startswith('## '):
        s = i - 1 if i > 0 and lines[i-1].startswith('<!-- run:') else i
        starts.append((s, i, line[3:].strip()))
sections = []
for k, (s, h, ttl) in enumerate(starts):
    end = starts[k+1][0] if k+1 < len(starts) else len(lines)
    sections.append({'idx': k, 'heading': ttl, 'text': '\n'.join(lines[s:end]), 'bytes': len('\n'.join(lines[s:end]))})

# Smoke-test domain utility ranking. Smoke-test repo is a test-orchestration
# harness — issues cover aggregator bugs, batch QA, dedup, calibration,
# defense-in-depth, finding-filtering. Domain rules from agent-916a's CLAUDE.md
# fall into three buckets:
#   - process habits (ALWAYS fire on any issue): push-back, issue analysis, etc.
#   - smoke-test-relevant domain (FIRES on advisory-class findings filed by smoke-test): rogue-agent triage, advisory-prose architectural, compound rogue-MCP
#   - crypto/DeFi specifics (RARELY fire on smoke-test): preflight, typed-data signing, fastmcp, install-state
util = {
    # heading -> utility 1-5 for smoke-test target
    'Crypto/DeFi Transaction Preflight Checks': 1,            # crypto-only
    'Git/PR Workflow': 4,                                      # always
    'Tool Usage Discipline': 5,                                # always
    'SDK Scope-Probing Discipline': 3,                         # smoke-test uses npm packages occasionally
    'Security Incident Response Tone': 2,
    'Chat Output Formatting': 4,                               # always
    'Push-Back Discipline': 5,                                 # ALWAYS fires
    'Issue Analysis': 5,                                       # ALWAYS fires
    'Cross-Repo Scope Splits': 5,                              # smoke-test files cross-repo issues
    'Smallest-Solution Discipline': 5,                         # ALWAYS fires
    'Install-State-Aware Recommendations': 1,                  # rarely
    'Typed-Data Signing Discipline': 1,                        # crypto-only
    'Rogue-Agent-Only Finding Triage': 4,                      # smoke-test files advisory findings — triage applies
    'Security Documentation Vocabulary': 4,                    # PR descriptions of smoke-test changes
    'Documentation Style — concise, non-redundant, sharp': 4,  # always
    'Reference framework: fastmcp': 1,                         # MCP-server-only
    'Advisory-prose security findings with no named MCP tool surface are architectural residual risk —...': 4,  # smoke-test FILES these — meta-rule
    'Compound / rogue-MCP security findings: decompose by threat layer and reject mitigations living i...': 4,  # smoke-test FILES compound findings
    'Write audit-trail companion fields atomically with the state-transition flag that triggers them': 3,  # smoke-test has state transitions
    'LLM curation calls must emit verdicts only, never rewrite the source entry text': 2,  # harness-tooling
    'SKILL.md content changes require a coordinated MCP-side EXPECTED_SKILL_SHA256 bump': 2,  # skill-only
    'Thread originating-agent identity end-to-end in resume and salvage workflows': 1,  # harness resume only
    'Operator ad-hoc scripts against raw state/log files are a CLI UX gap to fill natively': 4,  # smoke-test has CLI/aggregator code
    'Cross-cutting features need a layer-chain audit and phase split along the data-layer / integratio...': 5,  # smoke-test features cross multiple layers
    'Verify the authoritative type file before editing the path named in an issue body': 4,  # always useful
    'Issues listing multiple competing mechanisms without selection need design clarification before dispatch': 4,  # some smoke-test issues list options
    'Diagnose CLAUDE.md growth shape before choosing splitter vs compactor': 1,  # vp-dev-only
    "Calibrate HEADING_MAX to the LLM's observed synthesis-output distribution, not single-item intuition": 1,  # vp-dev-only
    'Verify phase-dependency infrastructure in code before implementing a later-phase issue': 5,  # smoke-test has explicit phase work
    'Fail-soft wiring for state-collection hooks added to critical run paths': 3,  # smoke-test has state-collection
    'Research-study execution issues are operator/agent-seam mismatches — push back with a phase split': 3,  # smoke-test has calibration/research issues (#48)
}

# Sort sections by utility desc, then by bytes asc (smaller first, for tighter packing)
ranked = sorted(sections, key=lambda s: (-util.get(s['heading'], 1), s['bytes']))

def build_for_target(target_kb):
    target_bytes = target_kb * 1024
    selected = []
    total = 0
    # Greedy: add highest-utility first; among ties, smaller first; stop when next addition would exceed target by >5%
    for sec in ranked:
        if total + sec['bytes'] + 1 <= int(target_bytes * 1.02):  # 2% tolerance
            selected.append(sec)
            total += sec['bytes'] + 1  # newline between
    return sorted(selected, key=lambda s: s['idx']), total

sizes_kb = [8, 16, 24, 32, 40, 48, 64]
agent_ids = ['agent-9171', 'agent-9172', 'agent-9173', 'agent-9174', 'agent-9175', 'agent-9176', 'agent-9177']

os.makedirs('/tmp/study-claude-md-smoke', exist_ok=True)
results = []
for kb, aid in zip(sizes_kb, agent_ids):
    selected, total = build_for_target(kb)
    body = '\n'.join(s['text'].rstrip() for s in selected) + '\n'
    path = f'/tmp/study-claude-md-smoke/{kb}kb.md'
    open(path, 'w').write(body)
    actual = len(body)
    print(f'{kb}KB ({aid}): {actual:6d} bytes ({actual/1024:.1f}KB), {len(selected):2d} sections, kept idxs={[s["idx"] for s in selected]}')
    results.append({'kb': kb, 'aid': aid, 'path': path, 'bytes': actual, 'sectionIds': [s['idx'] for s in selected], 'sectionHeadings': [s['heading'] for s in selected]})

# Save metadata
json.dump(results, open('/tmp/smoke_trim_meta.json', 'w'), indent=2)
print('\nSaved /tmp/smoke_trim_meta.json')

# Sanity: nesting
print('\nNesting check (smaller ⊂ larger):')
prev = set()
for r in results:
    cur = set(r['sectionIds'])
    if not prev <= cur:
        missing = prev - cur
        print(f'  {r["kb"]}KB: NOT nested — missing {missing}')
    else:
        print(f'  {r["kb"]}KB: ✓ nested ({len(cur)} sections)')
    prev = cur
