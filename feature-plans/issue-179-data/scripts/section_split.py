import re, sys, json
src = open('agents/agent-916a/CLAUDE.md').read()
# Section starts at either:
#   - leading `## ` heading (first section), OR
#   - a `<!-- run:...` or `<!-- promote-candidate` line followed by `## ` heading later
# For simplicity: split on `^## ` and prepend any sentinel comments that immediately precede.
lines = src.split('\n')
sections = []  # list of {idx, heading, start_line, end_line, sentinel_lines}
cur_start = 0
cur_heading = None
sentinel_buf = []
def heading_text(line):
    return line[3:].strip()

# Walk lines, group into sections
i = 0
n = len(lines)
collected = []  # list of (idx, heading, content_string)
buf = []
heading = None
sentinel_pre = []
def flush():
    if heading is not None or buf:
        content = '\n'.join(sentinel_pre + ([f'## {heading}'] if heading else []) + buf)
        collected.append((heading, content))
heading = None
sentinel_pre = []
buf = []
for line in lines:
    is_heading = line.startswith('## ')
    is_sentinel = line.startswith('<!--') and ('run:' in line or 'promote-candidate' in line)
    if is_heading:
        # close previous
        if heading is not None or buf or sentinel_pre:
            collected.append((heading, sentinel_pre, buf))
        heading = heading_text(line)
        sentinel_pre = []
        # take any trailing sentinel from prev buffer? Actually we already appended sentinels to sentinel_pre when we saw them at start.
        buf = []
    elif is_sentinel:
        # a sentinel always precedes its section's heading; if we're inside a section's body, this sentinel belongs to NEXT section
        if heading is None and not buf:
            sentinel_pre.append(line)
        else:
            # close current and start a holding zone for next section
            collected.append((heading, sentinel_pre, buf))
            heading = None
            sentinel_pre = [line]
            buf = []
    else:
        if heading is None and sentinel_pre:
            # body line before first heading — add to buf with no heading
            buf.append(line)
        elif heading is None and not sentinel_pre:
            # leading body before first heading
            buf.append(line)
        else:
            buf.append(line)
# flush last
collected.append((heading, sentinel_pre, buf))

# Print summary
total = 0
for i, (h, s, b) in enumerate(collected):
    text = '\n'.join(s + ([f'## {h}'] if h else []) + b)
    sz = len(text)
    total += sz + 1  # newline between
    print(f"{i:2d}\t{sz:5d}\t{h or '<preamble>'}")
print(f"---\ntotal={total}\nfile={len(src)}")
