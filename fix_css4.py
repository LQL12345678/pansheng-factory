import os

p = r'C:\Users\Admin\WorkBuddy\2026-05-10-task-1\frontend\src\dark-theme.css'
with open(p, 'r', encoding='utf-8') as f:
    content = f.read()

# The file has literal \r\n characters (4 chars: backslash, r, backslash, n)
# We need to replace: "}\r\n  .card > table tbody td.td-fault::before {"
# with: "}\n  .card > table tbody td.td-fault::before {\n"
old = '}\\r\\n  .card > table tbody td.td-fault::before {'
new = '}\n\n  .card > table tbody td.td-fault::before {\n'

if old in content:
    content = content.replace(old, new, 1)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Fixed!')
else:
    # Check what's actually there
    idx = content.find('}.card')
    if idx > 0:
        print('Found: near char', idx)
        print(repr(content[idx:idx+80]))
    else:
        print('Pattern not found')
        idx2 = content.find('td-fault::before')
        if idx2 > 0:
            print('Found ::before at', idx2)
            print(repr(content[idx2-30:idx2+50]))
