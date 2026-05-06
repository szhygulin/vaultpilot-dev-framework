import json
cells = json.load(open('/tmp/study_cells.json'))
# For implement cells, dump full reason + scopeNotes
print("=== FULL `reason` text for IMPLEMENT cells (PR-correctness scoring) ===\n")
for c in cells:
    if c.get('decision') == 'implement':
        size = {'9161':'16KB','9162':'32KB','9163':'48KB'}[c['agent']]
        print(f"\n────────────  agent-{c['agent']} ({size}) / #{c['issue']}  ────────────")
        print(c.get('reason') or '')
        if c.get('scopeNotes'):
            print(f"\nscope: {c['scopeNotes']}")
