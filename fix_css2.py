p = r'C:\Users\Admin\WorkBuddy\2026-05-10-task-1\frontend\src\dark-theme.css'
with open(p, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    stripped = line.strip()
    # Skip misplaced text-align: left (not inside any block)
    if stripped == 'text-align: left;':
        # Check if previous non-empty line is a closing brace
        prev = ''
        for j in range(i-1, -1, -1):
            if lines[j].strip():
                prev = lines[j].strip()
                break
        if prev == '}':
            i += 1
            continue
    new_lines.append(line)
    i += 1

# Ensure ::before block has text-align: left
final = []
i = 0
while i < len(new_lines):
    line = new_lines[i]
    final.append(line)
    if '::before' in line and '{' in line:
        # Check if text-align: left exists in next 5 lines
        has = False
        for j in range(i+1, min(i+6, len(new_lines))):
            if 'text-align: left' in new_lines[j]:
                has = True
                break
        if not has:
            final.append('    text-align: left;\n')
            i += 1
            continue
    i += 1

with open(p, 'w', encoding='utf-8') as f:
    f.writelines(final)
print('Done')
