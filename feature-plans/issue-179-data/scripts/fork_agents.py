import json, os, shutil, sys
REG = 'state/agents-registry.json'
reg = json.load(open(REG))
parent = next(a for a in reg['agents'] if a['agentId'] == 'agent-916a')

# Backup
shutil.copy(REG, REG + '.bak.study179')

now = '2026-05-06T08:00:00.000Z'
forks = [
    ('agent-9161', 'Study 16KB', '/tmp/study-claude-md/16kb.md'),
    ('agent-9162', 'Study 32KB', '/tmp/study-claude-md/32kb.md'),
    ('agent-9163', 'Study 48KB', '/tmp/study-claude-md/48kb.md'),
]

existing_ids = {a['agentId'] for a in reg['agents']}
for aid, name, _ in forks:
    if aid in existing_ids:
        print(f'ERROR: {aid} already exists', file=sys.stderr); sys.exit(1)

for aid, name, src_path in forks:
    new_rec = {
        'agentId': aid,
        'createdAt': now,
        'tags': list(parent['tags']),  # copy tags from parent
        'issuesHandled': 0,
        'implementCount': 0,
        'pushbackCount': 0,
        'errorCount': 0,
        'lastActiveAt': now,
        'name': name,
        'parentAgentId': 'agent-916a',
    }
    reg['agents'].append(new_rec)
    # Place trimmed CLAUDE.md
    dest_dir = f'agents/{aid}'
    os.makedirs(dest_dir, exist_ok=True)
    shutil.copy(src_path, f'{dest_dir}/CLAUDE.md')
    print(f'Forked {aid} ("{name}") with {len(new_rec["tags"])} tags, CLAUDE.md @ {dest_dir}/CLAUDE.md')

with open(REG, 'w') as f:
    json.dump(reg, f, indent=2)
    f.write('\n')
print('Registry written.')
