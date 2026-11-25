"""Build RGBA rig layers from the checked-in reference crops.

Run from the repository root with Pillow, NumPy, SciPy and OpenCV installed,
after monster-references/rebuild.py. Coordinates in sources.json use the
original neutral image, or the concept sheet normalized to 1050px width.
"""
import base64
import io
import json
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = Path(__file__).resolve().parent
REF = HERE.parents[1] / 'monster-references'
RESAMPLE = Image.Resampling.LANCZOS


def read_data(path):
    return json.loads(path.read_text())


def uri_image(uri):
    return Image.open(io.BytesIO(base64.b64decode(uri.split(',')[1]))).convert('RGBA')


def polygon(size, vertices):
    w, h = size
    mask = np.zeros((h, w), dtype=np.uint8)
    cv2.fillPoly(mask, [np.array(vertices, dtype=np.int32)], 255)
    return mask


def components(mask, minimum=10, biggest=False):
    labels, _ = ndi.label(mask)
    counts = np.bincount(labels.ravel())
    counts[0] = 0
    if biggest:
        return labels == counts.argmax()
    return (labels != 0) & (counts[labels] >= minimum)


def matte(image, box=None, erase=(), concept=False, shadow=False, arrow=None, trace=None, clip=None, restore=None):
    rgba = np.array(image.convert('RGBA'))
    h, w = rgba.shape[:2]
    x1, y1, x2, y2 = box or (0, 0, w, h)
    allowed = np.zeros((h, w), dtype=bool)
    allowed[y1:y2, x1:x2] = True
    for vertices in erase:
        allowed &= polygon((w, h), vertices) == 0
    if clip:
        allowed &= polygon((w, h), clip) > 0
    if rgba[:, :, 3].min() < 255:
        # Keep source antialiasing and remove isolated pixels and barely visible fringe.
        alpha = rgba[:, :, 3]
        opaque = components((alpha > 180) & allowed, biggest=True)
        keep = ndi.binary_dilation(opaque, iterations=1)
        alpha[~keep | (alpha < 60)] = 0
        fringe = (alpha > 0) & (alpha < 220)
        _, edge_indices = ndi.distance_transform_edt(~opaque, return_indices=True)
        rgba[fringe, :3] = rgba[edge_indices[0][fringe], edge_indices[1][fringe], :3]
        return Image.fromarray(rgba)
    rgb = rgba[:, :, :3].copy()
    r, g, b = rgb.transpose(2, 0, 1).astype(np.int16)
    # The original studio background is violet, near black or magenta.
    # Bright material, warm ink and neutral rims can seed the matte.
    dark_violet = (g < 34) & (r < 109) & (b > r * .98) & (b > g + 8)
    dark_neutral = (r < 32) & (g < 23) & (b < 49)
    background = dark_violet | dark_neutral
    if shadow:
        background |= (g < 44) & (b > r * 1.33) & (b > g + 25)
    if concept:
        background |= (g < 91) & (b > r * 1.35) & (r < 108)
    if arrow == 'pink':
        # Remove the isolated magenta graphics drawn around the concept flip.
        pink = (r > 120) & (b > 112) & (r > g + 43) & (b > g + 45) & (b > r * .76)
        background |= pink & ~ndi.binary_erosion(ndi.binary_fill_holes(~background & allowed), iterations=4)
        allowed &= ~(pink & (g < 145))
    foreground = ~background & ((g > 31) | (r > b + 16) | ((b > 112) & (g > 17)))
    if shadow or concept:
        foreground &= (g > 37) | (r > b + 17)
    connected = ndi.binary_closing(foreground & allowed, iterations=2) | (foreground & allowed)
    core = ndi.binary_fill_holes(components(connected, biggest=True))
    near = ndi.binary_dilation(core, iterations=3)
    seeds = np.full((h, w), cv2.GC_BGD, dtype=np.uint8)
    seeds[allowed & near] = cv2.GC_PR_BGD
    seeds[core & allowed] = cv2.GC_PR_FGD
    seeds[ndi.binary_erosion(core, iterations=3) & allowed] = cv2.GC_FGD
    if np.any(seeds == cv2.GC_FGD):
        cv2.setRNGSeed(19)
        cv2.grabCut(rgb, seeds, None, np.zeros((1, 65)), np.zeros((1, 65)), 3, cv2.GC_INIT_WITH_MASK)
    mask = ndi.binary_fill_holes(components(((seeds & 1) != 0) & allowed, biggest=True)) & allowed
    if trace:
        mask = polygon((w, h), trace) > 0
    if restore:
        mask |= polygon((w, h), restore) > 0
    if not shadow and not concept and not trace:
        # Remove background at the exterior of an otherwise embedded dark rim.
        edge = mask & ~ndi.binary_erosion(mask, iterations=3)
        paint = (g > 42) | (r > 92) | (r > b + 19) | (b > 120)
        mask &= ~(edge & ~paint & (b > r * .91))
    inside = ndi.distance_transform_edt(mask)
    _, nearest = ndi.distance_transform_edt(inside < 2, return_indices=True)
    # Only the outermost mixed pixels borrow colour from the interior.
    rim = mask & (inside < 1.5)
    rgba[rim, :3] = rgb[nearest[0][rim], nearest[1][rim]]
    rgba[:, :, 3] = np.where(mask, np.minimum(255, 164 + (inside - 1) * 190), 0).astype(np.uint8)
    return Image.fromarray(rgba)


def save(image, directory, label):
    bounds = image.getbbox()
    if not bounds:
        raise ValueError(f'Empty image: {directory.name}/{label}')
    x, y, right, bottom = bounds
    image.crop(bounds).save(directory / f'{label}.png', optimize=True)
    asset = {'src': f'art/{directory.name}/{label}.png', 'box': [x, y, right - x, bottom - y]}
    if label in ('neutral', 'body', 'sleep') or label.startswith(('flip', 'thought', 'P')):
        alpha = np.array(image)[:, :, 3]
        contours, _ = cv2.findContours(np.uint8(alpha > 125), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        asset['outline'] = [
            cv2.approxPolyDP(contour, 1.5, True).reshape(-1, 2).tolist()
            for contour in contours if cv2.contourArea(contour) >= 20
        ]
    return asset


def mask_part(image, mask):
    layer = np.array(image)
    layer[:, :, 3] = np.minimum(layer[:, :, 3], mask)
    return Image.fromarray(layer)


def inpaint(image, mask):
    rgba = np.array(image)
    rgb = np.ascontiguousarray(rgba[:, :, :3])
    rgba[:, :, :3] = cv2.inpaint(rgb, np.ascontiguousarray(mask), 3, cv2.INPAINT_TELEA)
    return Image.fromarray(rgba)


def eye_mask(size, ellipse, image):
    x, y, rx, ry = ellipse
    w, h = size
    mask = np.zeros((h, w), np.uint8)
    cv2.ellipse(mask, (x, y), (rx, ry), 0, 0, 360, 255, -1)
    return np.minimum(mask, np.array(image)[:, :, 3])


def eye_layers(clean, shape, donor, donor_shape, same_crop=False):
    """Register one painted eyelid onto the neutral face, then feather its edge."""
    x, y, rx, ry = shape
    dx, dy, drx, dry = donor_shape
    if same_crop:
        aligned = donor.convert('RGB')
    else:
        kx = drx / rx
        ky = dry / ry
        aligned = donor.convert('RGB').transform(
            clean.size, Image.Transform.AFFINE, (kx, 0, dx - x * kx, 0, ky, dy - y * ky), Image.Resampling.BICUBIC)
    closed = np.array(aligned)
    base = np.array(clean)
    yy, xx = np.indices((clean.height, clean.width))
    radius = np.hypot((xx - x) / rx, (yy - y) / ry)
    mask = np.uint8(np.clip((1.015 - radius) * 8, 0, 1) * 255)
    mask = np.minimum(mask, base[:, :, 3])
    if not same_crop:
        # Align colour to the area around each eye, where the layers meet.
        sample = (radius > .92) & (radius < 1.12) & (base[:, :, 3] > 240)
        sample &= (closed.max(axis=2) > 95) & (base[:, :, :3].max(axis=2) > 95)
        if sample.any():
            difference = np.median(base[sample, :3].astype(float) - closed[sample], axis=0)
            closed = np.uint8(np.clip(closed.astype(float) + np.clip(difference, -39, 39), 0, 255))
    lid_image = Image.fromarray(np.dstack((closed, mask)))
    # The source lid is already a narrow stroke. Remove only that stroke
    # for the base of the adjustable gaze layer.
    stroke = (radius < .75) & (closed.max(axis=2) < 108)
    stroke = ndi.binary_dilation(stroke, iterations=2) & (radius < 1)
    blank = inpaint(lid_image, np.uint8(stroke) * 255)
    return lid_image, blank, mask


def build():
    manifest = read_data(REF / 'manifest.json')
    anatomy = read_data(REF / manifest['anatomy'])
    source = read_data(HERE / 'sources.json')
    batch = (REF / manifest['batch1']['reference']).read_text()
    batch = json.loads(re.search(r'const DATA\s*=\s*(\{.*?\}), MOVES=', batch, re.S)[1])
    jelly = {}
    for status in ('blink', 'joy', 'sleep', 'surprise', 'interest', 'content'):
        file = next((REF / 'jelly').glob(f'*-{status}.html'))
        images = re.findall(r'data:image/\w+;base64,[\w+/=]+', file.read_text())
        jelly[status] = uri_image(images[-1])
    rigs = []
    for char, notes in zip(manifest['characters'], anatomy, strict=True):
        name = char['name']
        assert name == notes['name']
        ident = Path(char['neutral']).stem.removesuffix('-pose')
        cfg = source[ident]
        folder = HERE / ident
        folder.mkdir(exist_ok=True)
        original = Image.open(REF / char['neutral'])
        clean = matte(original, cfg.get('neutralBox'), cfg.get('erase', ()), shadow=cfg.get('shadow', False),
                      trace=cfg.get('trace'), clip=cfg.get('clip'), restore=cfg.get('restore'))
        l, t, r, b = clean.getbbox()
        rig = {
            'id': ident, 'name': name, 'reference': '../monster-references/' + char['concept'],
            'neutralReference': '../monster-references/' + char['neutral'],
            'notes': notes['description'], 'motionRule': notes['motion_rule'],
            'size': list(clean.size), 'anchor': [(l + r) / 2, b],
            'neutral': save(clean, folder, 'neutral'), 'views': {},
            'limbs': [], 'gestures': ['jump', 'joy', 'happy'] if cfg['limbs'] else [], 'occluded': [p['id'] for p in notes['hidden'] if p['id'] not in cfg['limbs']],
            'details': [p['name'] for p in notes['details'] if p['name'] not in ['глаз', 'рот']],
        }
        if ident == 'jelly':
            rig['gestures'].append('thought')
        limbs = np.zeros((clean.height, clean.width), np.uint8)
        for joint, (pivot, tip, low, high, *vertices) in cfg['limbs'].items():
            role = 'лапка'
            if ident == 'duck':
                role = 'крылышко' if joint in ('P1', 'P2') else 'перепончатая ножка'
            elif ident == 'octopus':
                role = 'видимое щупальце'
            elif ident.startswith('skeleton'):
                role = 'рука' if joint in ('P1', 'P2') else 'нога'
            part = {'id': joint, 'role': role, 'pivot': pivot, 'tip': tip, 'range': [low, high], 'layer': len(rig['limbs']) + 2}
            if vertices:
                mask = polygon(clean.size, vertices[0])
                mask[limbs != 0] = 0
                part['art'] = save(mask_part(clean, mask), folder, joint)
                limbs |= mask
            rig['limbs'].append(part)
        # Keep the original neutral pose pixel-exact within the matte. Only
        # the animated layer is cut out, then restored underneath its pivot.
        if limbs.any():
            body = inpaint(clean, limbs)
            rgba = np.array(body)
            # Recover only material near the attachment. The old appendage
            # contour is transparent; recovery must stay inside the silhouette.
            inner = ndi.distance_transform_edt(limbs != 0)
            patches = np.zeros_like(limbs)
            for part in rig['limbs']:
                if 'art' not in part:
                    continue
                px, py = part['pivot']
                cv2.circle(patches, (px, py), 12 if ident == 'jelly' else 9, 255, -1)
            rgba[:, :, 3][(limbs != 0) & ((patches == 0) | (inner > 12))] = 0
            rig['body'] = save(Image.fromarray(rgba), folder, 'body')
        else:
            rig['body'] = rig['neutral']

        concept = Image.open(REF / char['concept'])
        ratio = concept.width / 1050
        blink = cfg['blink']
        if ident == 'jelly':
            donor = jelly['blink']
        elif name in batch:
            donor = uri_image(batch[name]['sprites']['blink'])
        else:
            box = blink['box']
            donor = concept.crop(tuple(round(q * ratio) for q in box))
            if ratio != 1:
                donor = donor.resize((box[2] - box[0], box[3] - box[1]), RESAMPLE)
        rig['eyes'] = []
        for i, (ellipse, donor_shape) in enumerate(zip(cfg['eyes'], blink['eyes'], strict=True)):
            lid, blank, mask = eye_layers(clean, ellipse, donor, donor_shape, same_crop=ident == 'jelly')
            rig['eyes'].append({
                'shape': ellipse, 'cover': save(blank, folder, f'cover-{i}'),
                'art': save(mask_part(clean, mask), folder, f'eye-{i}'),
                'closed': save(lid, folder, f'closed-{i}')
            })
        rig['mouths'] = []
        if cfg['mouth']:
            for i, ellipse in enumerate([cfg['mouth'], *cfg.get('extraMouths', [])]):
                mask = eye_mask(clean.size, ellipse, clean)
                mouth = {'shape': ellipse, 'cover': save(mask_part(inpaint(clean, mask), mask), folder, f'mouth-cover-{i}')}
                if ident == 'jelly':
                    for expression in ('surprise', 'content', 'joy', 'interest'):
                        mouth[expression] = save(mask_part(jelly[expression], mask), folder, f'{expression}-mouth-{i}')
                rig['mouths'].append(mouth)

        if name in batch:
            for label in ('flip1', 'flip2', 'sleep'):
                source_view = uri_image(batch[name]['sprites'][label])
                erase = []
                if ident == 'horn' and label == 'flip1':
                    erase = [[[108, 0], [135, 0], [135, 46], [124, 45], [111, 24]]]
                rig['views'][label] = save(matte(source_view, erase=erase), folder, label)
            rig['flipSource'] = 'Два ракурса из batch1 v2'
        else:
            if ident == 'jelly':
                rig['views']['sleep'] = save(matte(jelly['sleep']), folder, 'sleep')
                source_text = (REF / 'jelly/11-thought.html').read_text()
                frames = re.findall(r'data:image/\w+;base64,[\w+/=]+', source_text)
                for i, uri in enumerate(frames[1:7], 1):
                    # Frames 1–6 carry the approved P2 lift and recovery.
                    # The connected character matte drops the detached dots.
                    original = uri_image(uri).convert('RGB')
                    cropped = matte(original, (23, 53, 420, 389), concept=True)
                    cropped = cropped.crop((24, 53, 420, 389)).resize(clean.size, RESAMPLE)
                    rig['views'][f'thought{i}'] = save(cropped, folder, f'thought{i}')
            for label, bounds in cfg['views'].items():
                view = concept.crop(tuple(round(q * ratio) for q in bounds))
                erase = [
                    [[round((x - bounds[0]) * ratio), round((y - bounds[1]) * ratio)] for x, y in polygon]
                    for polygon in cfg.get('viewErase', {}).get(label, [])
                ]
                cleaned = matte(view, erase=erase, concept=True,
                                arrow='pink' if label == 'flip2' and ident not in ('jelly', 'pushistik', 'octopus', 'mohnatik', 'skeletoness') else None)
                rig['views'][label] = save(cleaned, folder, label)
            rig['flipSource'] = ('Два ракурса из концепт-листа' if ident == 'jelly' else
                                 'Воздушная поза и перевёрнутый ракурс из концепт-листа')
        rig['review'] = []
        if ident == 'jelly':
            rig['review'].append('Финальный GIF «Решимость» не перенесён. Ухмылка в каталоге требует сверки с оригиналом.')
        if ident in ('octopus', 'tongue', 'mohnatik', 'skeletoness') or rig['occluded']:
            rig['review'].append('Скрытые или спорные крепления требуют сверки с исходными видами.')
        for part in rig['limbs']:
            if 'art' not in part:
                part['layer'] = 0
        rigs.append(rig)
    payload = ',\n'.join('  ' + json.dumps(rig, ensure_ascii=False, separators=(',', ':')) for rig in rigs)
    (HERE.parent / 'rigs.js').write_text('// Generated by art/build.py from the reference manifest and sources.json.\n'
                                        'export const rigs = [\n' + payload + '\n];\n')


if __name__ == '__main__':
    build()
