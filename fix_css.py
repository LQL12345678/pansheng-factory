p = r'C:\Users\Admin\WorkBuddy\2026-05-10-task-1\frontend\src\dark-theme.css'
with open(p, 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    # Skip the misplaced "text-align: left;" that's between blocks
    if line.strip() == 'text-align: left;':
        # Check if this is between blocks (not inside ::before)
        if i > 0 and '::before' not in lines[i-1] and (i+1 >= len(lines) or '::before' not in lines[i+1]):
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
        # Check next few lines for text-align: left
        has = any('text-align: left' in new_lines[j] for j in range(i+1, min(i+5, len(new_lines))))
        if not has:
            final.append('    text-align: left;\n')
            i += 1
            continue
    i += 1

with open(p, 'w', encoding='utf-8') as f:
    f.writelines(final)
print('Done')
