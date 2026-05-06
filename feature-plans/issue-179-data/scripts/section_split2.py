import re, sys
src = open('agents/agent-916a/CLAUDE.md').read()
lines = src.split('\n')

# Walk lines: a section runs from `## Heading` (with any immediately-preceding sentinel `<!-- run:...-->` line) to just before the next such start.
# Find all section starts
starts = []  # list of (line_idx_of_start, line_idx_of_heading, heading_text)
for i, line in enumerate(lines):
    if line.startswith('## '):
        # look back: include <!-- run:...--> on the line immediately before, with optional blank
        start = i
        if i > 0 and lines[i-1].startswith('<!-- run:'):
            start = i - 1
        starts.append((start, i, line[3:].strip()))

# Build sections
sections = []
for k, (s, h, ttl) in enumerate(starts):
    end = starts[k+1][0] if k+1 < len(starts) else len(lines)
    text = '\n'.join(lines[s:end])
    sections.append({'idx': k, 'start': s, 'end': end, 'heading': ttl, 'bytes': len(text), 'text': text})

# Print
total = 0
for sec in sections:
    print(f"{sec['idx']:2d}\t{sec['bytes']:5d}\t{sec['heading'][:90]}")
    total += sec['bytes']
print(f"---\nsum_section_bytes={total}\nfile_bytes={len(src)}")
