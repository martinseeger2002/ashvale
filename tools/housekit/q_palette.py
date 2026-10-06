"""q_palette.py -> q_palette.json: one flat colour per Quaternius material = the average of its base-colour texture
(times its colour factor). The pieces then need no textures at all (ASHVALE's look: flat colours, flat shading)."""
import json, glob, os
import numpy as np
from PIL import Image
D = 'quaternius/glTF/'; pal = {}; tex = {}
for f in sorted(glob.glob(D + '*.gltf')):
    j = json.load(open(f))
    for m in j.get('materials', []):
        n = m.get('name'); 
        if n in pal: continue
        pb = m.get('pbrMetallicRoughness', {}); fac = pb.get('baseColorFactor', [1, 1, 1, 1])
        t = pb.get('baseColorTexture')
        if t is not None:
            uri = j['images'][j['textures'][t['index']]['source']]['uri']
            if uri not in tex:
                a = np.asarray(Image.open(D + uri).convert('RGB').resize((64, 64)), dtype=np.float64) / 255
                tex[uri] = (a ** 2.2).reshape(-1, 3).mean(0) ** (1 / 2.2)   # average in linear light
            c = tex[uri] * np.array(fac[:3]) ** (1 / 2.2)
        else: c = np.array(fac[:3]) ** (1 / 2.2)
        pal[n] = '#%02x%02x%02x' % tuple(int(round(min(1, v) * 255)) for v in c)
json.dump(pal, open('q_palette.json', 'w'), indent=1, sort_keys=True)
print(len(pal), 'materials,', len(tex), 'textures averaged'); print(json.dumps(pal, sort_keys=True)[:900])
