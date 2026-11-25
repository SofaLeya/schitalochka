from pathlib import Path
import re, base64
root = Path(__file__).resolve().parent
for folder, target, count in [('batch1/parts','batch1/monster-batch1-v2.html',13),('jelly/thought-parts','jelly/11-thought.html',2)]:
    paths = sorted((root/folder).glob('*.part'))
    assert len(paths)==count, (folder,len(paths))
    data = b''.join(p.read_bytes() for p in paths)
    assert b'</html>' in data[-100:], target
    (root/target).write_bytes(data)
    print(target, len(data))
