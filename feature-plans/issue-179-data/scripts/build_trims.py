import os
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
    sections.append({'idx': k, 'heading': ttl, 'text': '\n'.join(lines[s:end])})

# Keep sets
KEEP_16 = {0,6,7,8,11,12,16,17,20}
KEEP_32 = KEEP_16 | {1,2,3,4,5,9,13,14,25,28,30}
KEEP_48 = KEEP_32 | {18,19,23,24,26,27,29}

def emit(keep, path):
    body = '\n'.join(sections[i]['text'].rstrip() for i in sorted(keep))
    if not body.endswith('\n'):
        body += '\n'
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w').write(body)
    return len(body)

for label, keep, path in [
    ('16KB', KEEP_16, '/tmp/study-claude-md/16kb.md'),
    ('32KB', KEEP_32, '/tmp/study-claude-md/32kb.md'),
    ('48KB', KEEP_48, '/tmp/study-claude-md/48kb.md'),
]:
    sz = emit(keep, path)
    print(f"{label}: {sz} bytes ({sz/1024:.1f}KB), {len(keep)} sections")
print("---")
print("Drop sets (sections removed at each trim):")
all_idx = set(range(len(sections)))
print(f"  Dropped at 48KB (vs orig): {sorted(all_idx - KEEP_48)}")
print(f"  Dropped at 32KB (vs 48):   {sorted(KEEP_48 - KEEP_32)}")
print(f"  Dropped at 16KB (vs 32):   {sorted(KEEP_32 - KEEP_16)}")
