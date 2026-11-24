from pathlib import Path
import json,re,base64
root=Path(__file__).resolve().parent
for key,name,count in [('anatomy','anatomy/monster-anatomy-v3.html',8),('batch1','batch1/monster-batch1-v2.html',7)]:
    chunks=sorted((root/'chunks'/key).glob('*.txt'))
    assert len(chunks)==count,(key,len(chunks))
    dest=root/name
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_bytes(b''.join(p.read_bytes() for p in chunks))
    print(dest)
# The anatomy HTML includes 19 concept sheets and 19 character crops.
s=(root/'anatomy/monster-anatomy-v3.html').read_text(encoding='utf-8')
concepts=root/'concepts'; concepts.mkdir(exist_ok=True)
for article in re.findall(r'<article\b.*?</article>',s,re.S):
    name=re.search(r'<h2>(.*?)</h2>',article,re.S).group(1)
    img=re.search(r'<img\b[^>]*src="data:image/(\w+);base64,([A-Za-z0-9+/=]+)"',article)
    if img:
        ext='jpg' if img.group(1)=='jpeg' else img.group(1)
        (concepts/(name+'.'+ext)).write_bytes(base64.b64decode(img.group(2)))
print('Recovered concept sheets:',len(list(concepts.glob('*'))))
