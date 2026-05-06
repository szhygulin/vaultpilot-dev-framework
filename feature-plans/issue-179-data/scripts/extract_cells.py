import json, re, os, sys
cells = []
for agent in ['9161', '9162', '9163']:
    for issue in [649, 574, 565, 162, 156]:
        path = f'logs/study-agent-{agent}-{issue}.log'
        try:
            text = open(path).read()
        except FileNotFoundError:
            cells.append({'agent': agent, 'issue': issue, 'error': 'log missing'})
            continue
        # The spawn output prints a JSON envelope at the end. Find the LAST top-level JSON object.
        # Scan from the end backwards for `\n}\n` and try to bracket-match.
        # Simpler: find the last `{\n` at column 0 and parse from there
        idx = text.rfind('\n{\n')
        if idx < 0:
            idx = text.rfind('{\n')
        if idx < 0:
            cells.append({'agent': agent, 'issue': issue, 'error': 'no json'})
            continue
        candidate = text[idx:].lstrip()
        # Try parsing
        try:
            obj = json.loads(candidate)
        except Exception as e:
            # Try until last `\n}` in case trailing garbage
            end = text.rfind('\n}')
            if end > 0:
                try:
                    obj = json.loads(text[idx:end+2])
                except Exception:
                    cells.append({'agent': agent, 'issue': issue, 'error': f'parse fail: {e}'})
                    continue
            else:
                cells.append({'agent': agent, 'issue': issue, 'error': f'parse fail: {e}'})
                continue
        env = obj.get('envelope') or {}
        cells.append({
            'agent': agent,
            'issue': issue,
            'decision': env.get('decision'),
            'costUsd': obj.get('costUsd'),
            'durationMs': obj.get('durationMs'),
            'isError': obj.get('isError'),
            'errorReason': obj.get('errorReason'),
            'reason': env.get('reason'),
            'commentUrl': env.get('commentUrl'),
            'prUrl': env.get('prUrl'),
            'scopeNotes': env.get('scopeNotes'),
            'addTags': (env.get('memoryUpdate') or {}).get('addTags'),
        })

# Print summary table
print(f"{'agent':<6} {'issue':<5} {'decision':<10} {'cost':>6} {'dur(s)':>6}  reason_head")
print('-' * 100)
for c in cells:
    if 'error' in c:
        print(f"{c['agent']:<6} {c['issue']:<5} ERROR: {c['error']}")
        continue
    cost = c.get('costUsd') or 0
    dur = (c.get('durationMs') or 0) / 1000
    rh = (c.get('reason') or '')[:60].replace('\n', ' ')
    print(f"{c['agent']:<6} {c['issue']:<5} {c['decision'] or '?':<10} ${cost:5.2f} {dur:5.1f}s  {rh}")

# Totals
total_cost = sum((c.get('costUsd') or 0) for c in cells if 'error' not in c)
total_dur = sum((c.get('durationMs') or 0) for c in cells if 'error' not in c) / 1000
print(f"\ntotal cost: ${total_cost:.2f}, sequential dur: {total_dur:.0f}s")

# Outcome distribution per agent
print()
for agent in ['9161', '9162', '9163']:
    rows = [c for c in cells if c['agent'] == agent and 'error' not in c]
    counts = {}
    for r in rows:
        d = r.get('decision') or '?'
        counts[d] = counts.get(d, 0) + 1
    cost = sum(r.get('costUsd', 0) for r in rows)
    print(f"agent-{agent}: {counts}  cost=${cost:.2f}")

# Save full table for later
json.dump(cells, open('/tmp/study_cells.json', 'w'), indent=2)
print(f"\nFull cell data → /tmp/study_cells.json")
