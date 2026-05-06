import json, os, re
from glob import glob
done_cells = []
inflight_cells = []
total_cost = 0
total_dur_ms = 0
for f in sorted(glob('logs/smoke-agent-*.log')):
    name = os.path.basename(f).replace('smoke-','').replace('.log','')
    parts = name.rsplit('-', 1)
    agent, issue = parts[0], parts[1]
    try:
        text = open(f).read()
    except: continue
    if not text.rstrip().endswith('}'):
        # in flight or never wrote envelope
        if len(text) > 100:  # has some content
            inflight_cells.append((agent, issue, len(text)))
        continue
    idx = text.rfind('\n{\n')
    if idx < 0: continue
    try:
        obj = json.loads(text[idx:].lstrip())
    except: continue
    cost = obj.get('costUsd') or 0
    dur = obj.get('durationMs') or 0
    decision = (obj.get('envelope') or {}).get('decision')
    is_err = obj.get('isError')
    err_reason = obj.get('errorReason') or ''
    total_cost += cost
    total_dur_ms += dur
    done_cells.append({'agent': agent, 'issue': issue, 'decision': decision, 'cost': cost, 'dur_ms': dur, 'is_err': is_err, 'err_reason': err_reason[:60]})

# Sort by cost desc
done_cells.sort(key=lambda x: -x['cost'])
print(f"DONE cells: {len(done_cells)}")
print(f"  total cost: ${total_cost:.2f}")
print(f"  mean cost:  ${total_cost/max(1,len(done_cells)):.2f}")
print(f"  mean dur:   {total_dur_ms/max(1,len(done_cells))/1000:.0f}s")
print()
print("Per-agent done:")
agents = {}
for c in done_cells:
    agents.setdefault(c['agent'], {'n':0, 'cost':0, 'dur':0, 'outcomes':{}})
    agents[c['agent']]['n'] += 1
    agents[c['agent']]['cost'] += c['cost']
    agents[c['agent']]['dur'] += c['dur_ms']
    d = c['decision'] or 'err'
    agents[c['agent']]['outcomes'][d] = agents[c['agent']]['outcomes'].get(d,0)+1
for ag in sorted(agents):
    a = agents[ag]
    print(f"  {ag}: {a['n']:2d}/10  cost=${a['cost']:5.2f}  dur={a['dur']/1000:.0f}s  outcomes={a['outcomes']}")
print()
print(f"IN-FLIGHT cells: {len(inflight_cells)}")
for ag, iss, sz in sorted(inflight_cells)[:20]:
    print(f"  {ag} / #{iss}  ({sz} bytes log)")

# Project: if mean cost holds, total for 70 cells:
remaining = 70 - len(done_cells)
if done_cells:
    proj = total_cost + remaining * (total_cost/len(done_cells))
    print(f"\nProjection: {remaining} cells remaining; if mean cost holds, total ≈ ${proj:.0f}")
