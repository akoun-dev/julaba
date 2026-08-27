import re
f='/home/z/my-project/src/app/page.tsx'
with open(f,'r') as f:
    c=f.read()
    new_lines=[l for l in c.split(chr(10)) if 'IDENT_BOTTOM_BAR_FORCE_RELOAD' not in l]
with open(f,'w') as f:
        f.write(chr(10).join(new_lines))
    print('Done')
