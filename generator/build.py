# Builds index.html from the page template, the game rules, the board geometry and the puzzle data.
# Usage: python3 build.py
e2=open('engine2.js').read()
runtime=e2[e2.index('// ===== RUNTIME START'):e2.index('// ===== RUNTIME END')]
parts={'/*ENGINE2*/':runtime, '/*GEOMETRY*/':open('geometry.js').read()}
for k in ['easy','medium','hard','extreme']: parts[f'/*PZ_{k.upper()}*/']=open(f'pz_{k}.json').read()
t=open('template2.html').read()
for k,v in parts.items():
    assert t.count(k)==1, k
    t=t.replace(k,v)
open('index.html','w').write(t)
print('wrote index.html', len(t)//1024, 'KB')
