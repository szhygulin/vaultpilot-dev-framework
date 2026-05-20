#!/usr/bin/env python3
"""Strip specific files from a unified-diff file. Usage: filter-diff.py <inFile> <outFile> <pathToExclude> [<pathToExclude>...]"""
import sys

inFile, outFile = sys.argv[1], sys.argv[2]
exclude = set(sys.argv[3:])

with open(inFile, 'r') as f:
    lines = f.readlines()

out = []
keep = True
i = 0
while i < len(lines):
    line = lines[i]
    if line.startswith('diff --git '):
        # parse paths
        parts = line.split()
        if len(parts) >= 4:
            # parts[2] = "a/path", parts[3] = "b/path"
            apath = parts[2][2:] if parts[2].startswith('a/') else parts[2]
            bpath = parts[3][2:] if parts[3].startswith('b/') else parts[3]
            keep = apath not in exclude and bpath not in exclude
        else:
            keep = True
    if keep:
        out.append(line)
    i += 1

with open(outFile, 'w') as f:
    f.writelines(out)
print(f"wrote {outFile} (kept {len(out)} of {len(lines)} lines)")
