import json, os, shutil
REG = 'state/agents-registry.json'
reg = json.load(open(REG))
parent = next(a for a in reg['agents'] if a['agentId'] == 'agent-916a')
shutil.copy(REG, REG + '.bak.smoke179.10')
now = '2026-05-06T08:30:00.000Z'
meta = json.load(open('/tmp/trim_meta_10.json'))
existing = {a['agentId'] for a in reg['agents']}
for m in meta:
    aid = m['aid']
    if aid in existing:
        reg['agents'] = [a for a in reg['agents'] if a['agentId'] != aid]
    rec = {
        'agentId': aid,
        'createdAt': now,
        'tags': list(parent['tags']),
        'issuesHandled': 0, 'implementCount': 0, 'pushbackCount': 0, 'errorCount': 0,
        'lastActiveAt': now,
        'name': f'Smoke10 {m["kb"]}KB',
        'parentAgentId': 'agent-916a',
    }
    reg['agents'].append(rec)
    dest = f'agents/{aid}'
    os.makedirs(dest, exist_ok=True)
    shutil.copy(m['path'], f'{dest}/CLAUDE.md')
    print(f'{aid} ("Smoke10 {m["kb"]}KB") -> {m["bytes"]}B')
with open(REG, 'w') as f:
    json.dump(reg, f, indent=2); f.write('\n')
