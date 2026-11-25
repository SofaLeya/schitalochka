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

from transitions import atlas, register, tween, warp

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


def matte(image, box=None, erase=(), concept=False, shadow=False, arrow=None, trace=None, clip=None, restore=(), color_key=None):
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
    if color_key in ('gold', 'fruit', 'cherry'):
        # Use the studio colour separation where the subject has a yellow,
        # red or green silhouette. Fill enclosed details such as the eyes.
        if color_key == 'gold':
            material = (r > b + 28) & (g > 39) & (r > 95)
        else:
            material = ((r > b + 22) | (g > b + 24) | ((g > 122) & (b < r + 9))) & ((g > 39) | (r > 104))
        mask = components(material & allowed, biggest=True)
        filled = ndi.binary_fill_holes(mask)
        holes, count = ndi.label(filled & ~mask)
        for n in range(1, count + 1):
            region = holes == n
            # Preserve the open space between the shared cherry stems.
            violet = (r < 74) & (g < 34) & (b > g + 11) & (b > r * .8)
            if region.sum() < 12 or violet[region].mean() < .75:
                mask |= region
        if color_key == 'cherry' and not concept:
            between_stems = np.arange(h)[:, None] < 116
            purple = (g < 45) & (r < 90) & (b > g + 9)
            mask &= ~(between_stems & purple)
    if color_key == 'blue-fur':
        exterior = mask & ~ndi.binary_erosion(mask, iterations=3)
        mask &= ~(exterior & (g < 31) & (r < 90) & (b < 104) & (b > g + 15))
    if color_key in ('teal', 'horn', 'one-eye'):
        pink_bg = (r > g + 11) & (b > g + 18) & (b > r - 6)
        exterior = mask & ~ndi.binary_erosion(mask, iterations=5)
        if color_key == 'horn':
            exterior[:96, :] = mask[:96, :]
        mask &= ~(exterior & pink_bg)
    for vertices in restore:
        mask |= polygon((w, h), vertices) > 0
    if not shadow and not concept and not trace and not color_key:
        # Remove background at the exterior of an otherwise embedded dark rim.
        edge = mask & ~ndi.binary_erosion(mask, iterations=3)
        paint = (g > 42) | (r > 92) | (r > b + 19) | (b > 120)
        mask &= ~(edge & ~paint & (b > r * .91))
    mask = components(mask, minimum=17)
    inside = ndi.distance_transform_edt(mask)
    _, nearest = ndi.distance_transform_edt(inside < 2, return_indices=True)
    coverage = np.clip((ndi.gaussian_filter(mask.astype(float), .68) - .12) / .76, 0, 1)
    # The subpixel rim uses the edge colour on the opaque side of the mask.
    rim = (coverage > 0) & (inside < 1.5)
    rgba[rim, :3] = rgb[nearest[0][rim], nearest[1][rim]]
    rgba[:, :, 3] = np.uint8(coverage * 255)
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


def progressive_lid(clean, lid, skin, shape, mask):
    """Cover the painted eye from the lids toward the closing line."""
    x, y, rx, ry = shape
    base, closed, blank = (np.array(image)[:, :, :3].astype(np.float32) for image in (clean, lid, skin))
    yy, xx = np.indices(mask.shape)
    center = y + ry * .18 + ry * .12 * ((xx - x) / rx) ** 2
    frames = []
    for i in range(17):
        t = i / 16
        upper = y - ry * 1.08 + (center - y + ry * 1.08) * t
        lower = y + ry * 1.08 - (y + ry * 1.08 - center) * t
        reveal = np.clip(np.maximum(upper - yy, yy - lower) + .5, 0, 1)
        reveal *= np.clip(t * 6, 0, 1)
        # The reference lid stroke is revealed as the aperture disappears.
        finish = np.clip((t - .80) / .20, 0, 1)
        mix = base * (1 - reveal[:, :, None]) + blank * reveal[:, :, None]
        mix = mix * (1 - finish) + closed * finish
        if not i:
            mix = base
        frames.append(Image.fromarray(np.uint8(np.dstack((mix, mask)))))
    return frames


def gaze_layer(clean, shape, mask, direction):
    """Move only the painted pupil and its reflections inside the original iris."""
    x, y, rx, ry = shape
    rgba = np.array(clean)
    rgb = rgba[:, :, :3].copy()
    yy, xx = np.indices(mask.shape)
    u, v = (xx - x) / rx, (yy - y) / ry
    # Select the connected dark center while excluding the outer eye contour.
    aperture = (u * u + v * v < .78 ** 2) & (mask == 255)
    luma = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    dark = aperture & (luma < np.percentile(luma[aperture], 42))
    pupil = ndi.binary_fill_holes(components(dark, biggest=True))
    size = pupil.sum()
    if size < 12 or size > aperture.sum() * .62:
        return mask_part(clean, mask)
    pupil = ndi.binary_dilation(pupil, iterations=1) & aperture
    skin = cv2.inpaint(rgb, np.uint8(pupil) * 255, 3, cv2.INPAINT_TELEA)
    ux, uy = direction
    dx, dy = rx * ux, ry * uy
    weight = np.clip((.79 - np.hypot(u, v)) * 14, 0, 1)
    alpha = ndi.gaussian_filter(pupil.astype(np.float32), .55)
    moved = warp(alpha, xx - dx, yy - dy) * weight
    painted = warp(rgb, xx - dx, yy - dy)
    composed = skin * (1 - moved[:, :, None]) + painted * moved[:, :, None]
    return Image.fromarray(np.uint8(np.dstack((composed, mask))))


def joint_flex(image, part, folder):
    pivot = np.array(part['joint'])
    tip = np.array(part['tip'])
    direction = tip - pivot
    length = max(1, np.linalg.norm(direction))
    x, y, r, b = image.getbbox()
    margin = 18
    region = (x - margin, y - margin, r + margin, b + margin)
    source = np.array(image.crop(region))
    yy, xx = np.indices(source.shape[:2], dtype=np.float32)
    dx, dy = xx + region[0] - pivot[0], yy + region[1] - pivot[1]
    weight = np.clip((dx * direction[0] + dy * direction[1]) / length / 11, 0, 1)
    frames = []
    for degrees in np.linspace(-1, 1, 25) * max(map(abs, part['range'])) * .32:
        angle = np.radians(-degrees) * weight
        rx = dx * (np.cos(angle) - 1) - dy * np.sin(angle)
        ry = dx * np.sin(angle) + dy * (np.cos(angle) - 1)
        frames.append(Image.fromarray(warp(source, xx + rx, yy + ry)))
    return atlas(folder, f'flex-{part["id"]}', frames, region[:2])


def register_mouth(clean, donor, shape, selection):
    x, y, rx, ry = shape
    dx, dy, drx, dry = selection
    sx, sy = drx / rx, dry / ry
    aligned = donor.convert('RGB').transform(clean.size, Image.Transform.AFFINE,
        (sx, 0, dx - x * sx, 0, sy, dy - y * sy), Image.Resampling.BICUBIC)
    pixels = np.asarray(aligned).astype(np.float32)
    original = np.array(clean)
    yy, xx = np.indices(pixels.shape[:2])
    radius = np.hypot((xx - x) / rx, (yy - y) / ry)
    rim = (radius > .76) & (radius < .98) & (original[:, :, 3] == 255)
    delta = np.median(original[:, :, :3][rim].astype(np.float32) - pixels[rim], axis=0)
    pixels = np.clip(pixels + np.clip(delta, -28, 28), 0, 255)
    alpha = np.clip((1 - radius) * 6, 0, 1)[:, :, None]
    rgb = pixels * alpha + original[:, :, :3] * (1 - alpha)
    return Image.fromarray(np.uint8(np.dstack((rgb, original[:, :, 3]))))


def mouth_variants(clean, ellipse, donor, folder, i, only=None):
    x, y, rx, ry = ellipse
    mask = eye_mask(clean.size, ellipse, clean)
    base = mask_part(clean, mask)
    variants = {}
    left, top, right, bottom = base.getbbox()
    region = (left, top, right, bottom)
    neutral = base.crop(region)
    yy, xx = np.indices(mask.shape)
    u, v = (xx - x) / rx, (yy - y) / ry
    falloff = np.clip((1 - u * u - v * v), 0, 1) ** 2
    transforms = {'surprise': (.46, -.49, 0), 'content': (-.08, .30, .06),
                  'joy': (-.10, -.17, .15), 'determined': (.08, .16, .06),
                  'thought': (.15, .22, -.07), 'interest': (0, .10, .08)}
    for state, (narrow, height, curl) in transforms.items():
        if only is not None and state not in only:
            continue
        if state in donor:
            target = mask_part(donor[state], mask).crop(region)
            frames = tween(neutral, target, 12, silhouette=False)
        else:
            frames = []
            pixels = np.array(clean)[:, :, :3]
            for j in range(9):
                t = j / 8
                sx = xx + (xx - x) * narrow * falloff * t
                sy = yy + ((yy - y) * height + ry * curl * (u * u - .3)) * falloff * t
                rgb = warp(pixels, sx, sy)
                frames.append(Image.fromarray(np.dstack((rgb, mask))).crop(region))
        variants[state] = atlas(folder, f'mouth-{state}-{i}', frames, (left, top))
    return variants


def read_asset(folder, asset):
    return Image.open(folder / Path(asset['src']).name).convert('RGBA')


def pose_atlases(clean, rig, metadata, folder):
    """Use the original painted key poses and register them around the same center."""
    w, h = clean.size
    factor = min(1, 174 / max(w, h))
    size = (round(w * factor) + 72, round(h * factor) + 72)
    center = (size[0] / 2, size[1] / 2)
    left, top, right, bottom = clean.getbbox()
    cx, cy = (left + right) / 2, (top + bottom) / 2
    neutral = register(clean, size, (cx, cy), center, factor)
    flip = [neutral]
    for label, angle in zip(('flip1', 'flip2'), metadata['flipAngles'], strict=True):
        image = read_asset(folder, rig['views'][label])
        inverse = image.rotate(angle, expand=True, resample=Image.Resampling.BICUBIC)
        l, t, r, b = inverse.getbbox()
        # Align based on size after unrolling, before continuous rotation.
        view_factor = min((right-left) / (r-l), (bottom-top) / (b-t)) * factor
        flip.append(register(image, size, (image.width / 2, image.height / 2), center, view_factor, -angle))
    flip.append(neutral)
    segments = [tween(a, b, 16) for a, b in zip(flip, flip[1:])]
    frames = [frame for segment in segments[:-1] for frame in segment[:-1]] + segments[-1]
    # Store atlas pixels and world coordinates separately. World scale is
    # restored with the same neutral pose scale as the other states.
    art = atlas(folder, 'turn', frames, quality=94)
    art.update({'anchor': list(center), 'pixelsPerUnit': factor, 'angles': [0, *metadata['flipAngles'], 360], 'samples': 16})
    rig['turn'] = art

    stand_center = (center[0], center[1] + (bottom - cy) * factor)
    sleeper = read_asset(folder, rig['views']['sleep'])
    # Keep the supplied sleeping proportions and place the lowest painted pixel on the ground.
    sleep_factor = min((right-left) * 1.05 / sleeper.width, (bottom-top) / sleeper.height) * factor
    sleep = register(sleeper, size, (sleeper.width / 2, sleeper.height), stand_center, sleep_factor)
    rest = atlas(folder, 'settle', tween(neutral, sleep, 18), quality=94)
    rest.update({'anchor': list(stand_center), 'pixelsPerUnit': factor})
    rig['rest'] = rest
    if rig['id'] == 'jelly':
        keyframes = [neutral]
        for index in range(1, 7):
            asset = rig['views'][f'thought{index}']
            image = read_asset(folder, asset)
            x, y, _, _ = asset['box']
            keyframes.append(register(image, size, (cx-x, cy-y), center, factor))
        keyframes.append(neutral)
        frames = [
            frame
            for a, b in zip(keyframes, keyframes[1:])
            for frame in tween(a, b, 8)[:-1]
        ] + [neutral]
        thought = atlas(folder, 'ponder', frames)
        thought.update({'anchor': list(stand_center), 'pixelsPerUnit': factor, 'samples': 8})
        rig['ponder'] = thought


def build():
    manifest = read_data(REF / 'manifest.json')
    anatomy = read_data(REF / manifest['anatomy'])
    source = read_data(HERE / 'sources.json')
    anatomy_roles = read_data(HERE / 'anatomy.json')
    batch = (REF / manifest['batch1']['reference']).read_text()
    batch = json.loads(re.search(r'const DATA\s*=\s*(\{.*?\}), MOVES=', batch, re.S)[1])
    jelly = {}
    for status in ('blink', 'joy', 'sleep', 'surprise', 'interest', 'content'):
        file = next((REF / 'jelly').glob(f'*-{status}.html'))
        images = re.findall(r'data:image/\w+;base64,[\w+/=]+', file.read_text())
        jelly[status] = uri_image(images[-1])
    rigs = []
    cv2.setNumThreads(1)
    for char, notes in zip(manifest['characters'], anatomy, strict=True):
        name = char['name']
        assert name == notes['name']
        ident = Path(char['neutral']).stem.removesuffix('-pose')
        cfg = source[ident]
        metadata = anatomy_roles[ident]
        folder = HERE / ident
        folder.mkdir(exist_ok=True)
        original = Image.open(REF / char['neutral'])
        clean = matte(original, cfg.get('neutralBox'), cfg.get('erase', ()), shadow=cfg.get('shadow', False),
                      trace=cfg.get('trace'), clip=cfg.get('clip'), restore=cfg.get('restore', ()),
                      color_key=cfg.get('colorKey'))
        l, t, r, b = clean.getbbox()
        rig = {
            'id': ident, 'name': name, 'reference': '../monster-references/' + char['concept'],
            'neutralReference': '../monster-references/' + char['neutral'],
            'notes': notes['description'], 'motionRule': notes['motion_rule'],
            'size': list(clean.size), 'anchor': [(l + r) / 2, b],
            'neutral': save(clean, folder, 'neutral'), 'views': {},
            'limbs': [], 'occluded': [p['id'] for p in notes['hidden'] if p['id'] not in cfg['limbs']],
            'details': [p for p in notes['details'] if p['name'] not in ['глаз', 'рот']],
            'hiddenReferences': [p for p in notes['hidden'] if p['id'] not in cfg['limbs']],
        }
        limbs = np.zeros((clean.height, clean.width), np.uint8)
        for joint, (pivot, tip, low, high, *vertices) in cfg['limbs'].items():
            role = 'лапка'
            if ident == 'duck':
                role = 'крылышко' if joint in ('P1', 'P2') else 'перепончатая ножка'
            elif ident == 'octopus':
                role = 'видимое щупальце'
            elif ident.startswith('skeleton'):
                role = 'рука' if joint in ('P1', 'P2') else 'нога'
            assignment = metadata['limbs'][joint]
            part = {
                'id': joint, 'role': role, 'function': assignment['role'], 'pivot': pivot, 'tip': tip,
                'range': assignment.get('range', [low, high]), 'motion': assignment['motion'],
                'layer': len(rig['limbs']) + 2, 'visibility': 'painted' if vertices else 'integrated'
            }
            if 'joint' in assignment:
                part['joint'] = assignment['joint']
            if vertices:
                mask = polygon(clean.size, vertices[0])
                mask[limbs != 0] = 0
                separated = mask_part(clean, mask)
                part['art'] = save(separated, folder, joint)
                if 'joint' in part:
                    part['flex'] = joint_flex(separated, part, folder)
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
            rgba[:, :, 3][(limbs != 0) & ((patches == 0) | (inner > 12) | (rgba[:, :, 3] < 253))] = 0
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
            region = mask_part(clean, mask).getbbox()
            origin = region[:2]
            blink_frames = [frame.crop(region) for frame in progressive_lid(clean, lid, blank, ellipse, mask)]
            forward = gaze_layer(clean, ellipse, mask, (.095, -.13)).crop(region)
            pondering = gaze_layer(clean, ellipse, mask, (-.083, -.13)).crop(region)
            neutral = blink_frames[0]
            eye = {
                'shape': ellipse, 'blink': atlas(folder, f'blink-{i}', blink_frames, origin),
                'interest': atlas(folder, f'interest-eye-{i}', tween(neutral, forward, 8, silhouette=False), origin),
                'thought': atlas(folder, f'thought-eye-{i}', tween(neutral, pondering, 8, silhouette=False), origin),
            }
            if ident == 'jelly':
                calm = mask_part(jelly['content'], mask).crop(region)
                eye['content'] = atlas(folder, f'content-eye-{i}', tween(neutral, calm, 10, silhouette=False), origin)
            rig['eyes'].append(eye)
        rig['mouths'] = []
        shape = metadata.get('mouthShape', cfg['mouth'])
        if shape:
            for i, ellipse in enumerate([shape, *cfg.get('extraMouths', [])]):
                donors = {id: jelly[id] for id in ('surprise', 'content', 'joy', 'interest')} if ident == 'jelly' else {}
                for variant, local in metadata.get('mouthSources', {}).items():
                    donor = uri_image(batch[name]['sprites'][variant])
                    donors[variant] = register_mouth(clean, donor, ellipse, local)
                rig['mouths'].append({
                    'shape': ellipse, 'sources': sorted(donors),
                    'expressions': mouth_variants(clean, ellipse, donors, folder, i,
                                                  only=donors if ident == 'one-eye' else None)
                })

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
                                color_key=cfg['colorKey'] if ident in ('cherry', 'strawberry', 'duck') else None,
                                arrow='pink' if label == 'flip2' and ident not in ('jelly', 'pushistik', 'octopus', 'mohnatik', 'skeletoness') else None)
                rig['views'][label] = save(cleaned, folder, label)
            rig['flipSource'] = ('Два ракурса из концепт-листа' if ident == 'jelly' else
                                 'Воздушная поза и перевёрнутый ракурс из концепт-листа')
        pose_atlases(clean, rig, metadata, folder)
        rig['review'] = []
        if ident == 'jelly':
            rig['review'].append('Финальный утверждённый GIF «Решимость» отсутствует. Сохранено исходное выражение до сверки.')
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
