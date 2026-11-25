"""Register and interpolate painted poses into single-silhouette frame atlases."""

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def warp(array, x, y):
    return cv2.remap(array, x.astype(np.float32), y.astype(np.float32), cv2.INTER_LINEAR)


def flow_input(image, alpha):
    # Accent both the painted features and the edge against a fixed background.
    grey = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    return np.uint8(np.rint(grey * alpha + 44 * (1 - alpha)))


def distance(alpha):
    mask = alpha >= .5
    return ndi.distance_transform_edt(mask) - ndi.distance_transform_edt(~mask)


def tween(first, second, count, silhouette=True):
    """Bidirectional flow and a single interpolated matte (with exact endpoints)."""
    a, b = np.asarray(first), np.asarray(second)
    if a.shape != b.shape:
        raise ValueError('Pose canvases must use identical coordinates')
    if np.array_equal(a, b):
        return [first] * (count + 1)
    rgb_a, rgb_b = a[:, :, :3], b[:, :, :3]
    alpha_a, alpha_b = (array[:, :, 3].astype(np.float32) / 255 for array in (a, b))
    ga, gb = flow_input(rgb_a, alpha_a), flow_input(rgb_b, alpha_b)
    def estimate(p, q):
        return cv2.calcOpticalFlowFarneback(p, q, None, .55, 4, 19, 4, 7, 1.5, 0)
    forward, backward = estimate(ga, gb), estimate(gb, ga)
    y, x = np.indices(a.shape[:2], dtype=np.float32)
    if silhouette:
        field_a = distance(alpha_a).astype(np.float32)
        field_b = distance(alpha_b).astype(np.float32)
    frames = [first]
    for i in range(1, count):
        t = i / count
        xa, ya = x - forward[:, :, 0] * t, y - forward[:, :, 1] * t
        xb, yb = x - backward[:, :, 0] * (1 - t), y - backward[:, :, 1] * (1 - t)
        # Refine the inverse map at the warped coordinates.
        for _ in range(3):
            f = warp(forward, xa, ya)
            g = warp(backward, xb, yb)
            xa, ya = x - f[:, :, 0] * t, y - f[:, :, 1] * t
            xb, yb = x - g[:, :, 0] * (1 - t), y - g[:, :, 1] * (1 - t)
        wa = warp(alpha_a, xa, ya) * (1 - t)
        wb = warp(alpha_b, xb, yb) * t
        rgb = (warp(rgb_a, xa, ya) * wa[:, :, None] + warp(rgb_b, xb, yb) * wb[:, :, None])
        rgb /= np.maximum(wa + wb, .00001)[:, :, None]
        if silhouette:
            da = warp(field_a, xa, ya)
            db = warp(field_b, xb, yb)
            alpha = np.clip(.5 + (da * (1 - t) + db * t) * .75, 0, 1)
            alpha[(wa + wb) < .025] = 0
            # Keep coherent disconnected details of the supplied art such as
            # skeleton fingers; the caller controls the complete pose mask.
        else:
            alpha = alpha_a
        frames.append(Image.fromarray(np.uint8(np.rint(np.dstack([rgb, alpha * 255])))))
    return frames + [second]


def register(image, size, anchor, position, scale=1, angle=0):
    """Bring a painted pose into the neutral coordinates, without anisotropic scaling."""
    theta = np.radians(angle)
    c, s = np.cos(theta) / scale, np.sin(theta) / scale
    px, py = position
    ax, ay = anchor
    return image.transform(size, Image.Transform.AFFINE,
                           (c, s, ax - c * px - s * py, -s, c, ay + s * px - c * py),
                           Image.Resampling.BICUBIC)


def atlas(folder, label, frames, origin=(0, 0), quality=None):
    # Bound each frame separately and arrange tiles in a near-square atlas.
    regions = [image.getbbox() for image in frames]
    bounds = (min(b[0] for b in regions), min(b[1] for b in regions),
              max(b[2] for b in regions), max(b[3] for b in regions))
    x, y, right, bottom = bounds
    w, h = right - x, bottom - y
    cols = min(len(frames), max(1, round(np.sqrt(len(frames) * h / w))))
    rows = (len(frames) + cols - 1) // cols
    gap = 2
    sheet = Image.new('RGBA', (cols * (w + gap), rows * (h + gap)))
    tiles = []
    dx, dy = origin
    for i, (frame, box) in enumerate(zip(frames, regions, strict=True)):
        left, top, right, bottom = box
        col, row = (i % cols) * (w + gap), (i // cols) * (h + gap)
        sheet.paste(frame.crop(box), (col + left - x, row + top - y))
        tiles.append([col + left - x, row + top - y, left + dx, top + dy, right - left, bottom - top])
    name = f'{label}.webp'
    settings = {'lossless': True} if quality is None else {'quality': quality, 'alpha_quality': 100}
    sheet.save(folder / name, method=4, **settings)
    return {'src': f'art/{folder.name}/{name}', 'tiles': tiles}
