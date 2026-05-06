import json
cells = json.load(open('/tmp/study_cells.json'))
# Group: per-issue cross-agent comparison
issues = [649, 574, 565, 162, 156]
sizes = {'9161': '16KB', '9162': '32KB', '9163': '48KB'}

print("=" * 100)
print("PER-AGENT SUMMARY")
print("=" * 100)
for ag in ['9161', '9162', '9163']:
    rows = [c for c in cells if c['agent'] == ag]
    counts = {}
    for r in rows:
        d = r.get('decision') or '?'
        counts[d] = counts.get(d, 0) + 1
    cost = sum((r.get('costUsd') or 0) for r in rows)
    dur = sum((r.get('durationMs') or 0) for r in rows) / 1000
    print(f"agent-{ag} ({sizes[ag]}): {counts}, total cost=${cost:.2f}, total dur={dur:.0f}s")

print()
print("=" * 100)
print("PER-ISSUE DETAIL (for operator scoring)")
print("=" * 100)

for issue in issues:
    print(f"\n----- Issue #{issue} -----")
    for ag in ['9161', '9162', '9163']:
        c = next((x for x in cells if x['agent']==ag and x['issue']==issue), None)
        if not c:
            continue
        size = sizes[ag]
        d = c.get('decision') or 'ERROR'
        cost = c.get('costUsd') or 0
        dur = (c.get('durationMs') or 0) / 1000
        reason = (c.get('reason') or '').replace('\n', ' ')
        scope = c.get('scopeNotes') or ''
        print(f"  [{size}] decision={d}  cost=${cost:.2f}  dur={dur:.0f}s")
        print(f"    reason: {reason[:280]}{'...' if len(reason)>280 else ''}")
        if scope:
            print(f"    scope:  {scope[:200]}{'...' if len(scope)>200 else ''}")
