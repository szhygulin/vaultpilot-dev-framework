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

# Same utility ranking as 7-size build (smoke-test domain)
util_map = {
    'Crypto/DeFi Transaction Preflight Checks': 1, 'Git/PR Workflow': 4, 'Tool Usage Discipline': 5, 'SDK Scope-Probing Discipline': 3,
    'Security Incident Response Tone': 2, 'Chat Output Formatting': 4, 'Push-Back Discipline': 5, 'Issue Analysis': 5,
    'Cross-Repo Scope Splits': 5, 'Smallest-Solution Discipline': 5, 'Install-State-Aware Recommendations': 1,
    'Typed-Data Signing Discipline': 1, 'Rogue-Agent-Only Finding Triage': 4, 'Security Documentation Vocabulary': 4,
    'Documentation Style — concise, non-redundant, sharp': 4, 'Reference framework: fastmcp': 1,
    'Advisory-prose security findings with no named MCP tool surface are architectural residual risk —...': 4,
    'Compound / rogue-MCP security findings: decompose by threat layer and reject mitigations living i...': 4,
    'Write audit-trail companion fields atomically with the state-transition flag that triggers them': 3,
    'LLM curation calls must emit verdicts only, never rewrite the source entry text': 2,
    'SKILL.md content changes require a coordinated MCP-side EXPECTED_SKILL_SHA256 bump': 2,
    'Thread originating-agent identity end-to-end in resume and salvage workflows': 1,
    'Operator ad-hoc scripts against raw state/log files are a CLI UX gap to fill natively': 4,
    'Cross-cutting features need a layer-chain audit and phase split along the data-layer / integratio...': 5,
    'Verify the authoritative type file before editing the path named in an issue body': 4,
    'Issues listing multiple competing mechanisms without selection need design clarification before dispatch': 4,
    'Diagnose CLAUDE.md growth shape before choosing splitter vs compactor': 1,
    "Calibrate HEADING_MAX to the LLM's observed synthesis-output distribution, not single-item intuition": 1,
    'Verify phase-dependency infrastructure in code before implementing a later-phase issue': 5,
    'Fail-soft wiring for state-collection hooks added to critical run paths': 3,
    'Research-study execution issues are operator/agent-seam mismatches — push back with a phase split': 3,
}
ranked = sorted(sections, key=lambda s: (-util_map.get(s['heading'], 1), s['bytes']))

sizes_kb = [6, 10, 14, 18, 22, 28, 34, 42, 50, 58]
agent_ids = [f'agent-918{n}' for n in range(10)]  # agent-9180..9189

os.makedirs('/tmp/study-claude-md-10', exist_ok=True)
selected_idxs = set()
results = []
for kb, aid in zip(sizes_kb, agent_ids):
    target_bytes = kb * 1024
    cur_total = sum(sections[i]['bytes'] + 1 for i in selected_idxs)
    # Greedy add highest-utility sections that fit (including 5% tolerance)
    for sec in ranked:
        if sec['idx'] in selected_idxs: continue
        if cur_total + sec['bytes'] + 1 > int(target_bytes * 1.02): continue
        selected_idxs.add(sec['idx'])
        cur_total += sec['bytes'] + 1
    # Strict fill: anything that still fits under target
    while True:
        added = False
        for sec in ranked:
            if sec['idx'] in selected_idxs: continue
            if cur_total + sec['bytes'] + 1 <= target_bytes:
                selected_idxs.add(sec['idx'])
                cur_total += sec['bytes'] + 1
                added = True; break
        if not added: break
    sel = sorted(selected_idxs)
    body = '\n'.join(sections[i]['text'].rstrip() for i in sel) + '\n'
    path = f'/tmp/study-claude-md-10/{kb}kb.md'
    open(path, 'w').write(body)
    actual = len(body)
    print(f'{kb}KB ({aid}): {actual:6d} bytes ({actual/1024:.1f}KB), {len(sel):2d} sections')
    results.append({'kb': kb, 'aid': aid, 'path': path, 'bytes': actual, 'sectionIds': sel})
json.dump(results, open('/tmp/trim_meta_10.json', 'w'), indent=2)
