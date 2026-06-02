import os

p = r'C:\Users\Admin\WorkBuddy\2026-05-10-task-1\frontend\src\dark-theme.css'
with open(p, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Build new lines, removing the stray text-align: left
new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.strip()
    if stripped == 'text-align: left;':
        # Check if this is between blocks (prev non-empty line is '}')
        prev_stripped = ''
        for j in range(i-1, -1, -1):
            if lines[j].strip():
                prev_stripped = lines[j].strip()
                break
        is_stray = (prev_stripped == '}')
        if is_stray:
            i += 1
            continue
    new_lines.append(line)
    i += 1

# Now ensure ::before block has text-align: left
final = []
i = 0
while i < len(new_lines):
    line = new_lines[i]
    final.append(line)
    if '::before' in line and '{' in line:
        # Check next 6 lines for text-align: left
        has_align = False
        for j in range(i+1, min(i+7, len(new_lines))):
            if 'text-align: left' in new_lines[j]:
                has_align = True
                break
        if not has_align:
            final.append('    text-align: left;\n')
            i += 1
            continue
    i += 1

with open(p, 'w', encoding='utf-8') as f:
    f.writelines(final)
print('Fixed!')
