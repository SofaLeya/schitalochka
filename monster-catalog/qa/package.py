"""Create contact sheets, a review matrix and GIFs from the browser capture."""
import argparse
import csv
import json
from pathlib import Path
import shutil

from PIL import Image, ImageDraw, ImageFont

FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'


def composite(path, background, scale=None):
    with Image.open(path) as original:
        image = original.convert('RGBA')
    if scale:
        image.thumbnail(scale, Image.Resampling.LANCZOS)
    output = Image.new('RGB', image.size, background)
    output.paste(image, mask=image.getchannel('A'))
    return output


def gif(paths, target, delay):
    images = [composite(path, '#f1eaf5') for path in paths]
    palette = images[len(images) // 2].quantize(colors=256)
    frames = [image.quantize(palette=palette, dither=Image.Dither.NONE) for image in images]
    target.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(target, save_all=True, append_images=frames[1:], duration=delay, loop=0, optimize=False)


def sheet(root, chars, states, theme, background, ink, path):
    w, h = 105, 101
    image = Image.new('RGB', (130 + len(states) * w, 29 + len(chars) * h), background)
    label = ImageFont.truetype(FONT, 11)
    name = ImageFont.truetype(FONT, 14)
    draw = ImageDraw.Draw(image)
    for j, state in enumerate(states):
        draw.text((133 + j * w, 9), state['label'], font=label, fill=ink)
    for i, char in enumerate(chars):
        draw.text((10, 63 + i * h), char['name'], font=name, fill=ink)
        for j, state in enumerate(states):
            key = state['id']
            raw = root / 'frames' / char['id'] / key
            frames = sorted(raw.glob('*.png'), key=lambda f: int(f.stem))
            phase = {'blink': 450, 'sway': 250, 'flip': 500, 'thought': 580}.get(key, 500)
            chosen = min(frames, key=lambda f: abs(int(f.stem) - phase))
            thumb = composite(chosen, background, (w - 2, h - 7))
            image.paste(thumb, (130 + j * w, 26 + i * h))
    path.mkdir(parents=True, exist_ok=True)
    image.save(path / f'{theme}.png')


def package(root):
    data = json.loads((root / 'manifest.json').read_text())
    gif_input = root / '.gif-frames'
    if not gif_input.is_dir():
        raise FileNotFoundError(gif_input)
    chars = data['characters']
    states = data['states']
    delay = round(100 / data['fps']) * 10
    with (root / 'review-matrix.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        rows = csv.writer(stream)
        rows.writerow(['Персонаж', *(state['label'] for state in states)])
        rows.writerows([char['name'], *(['К приёмке'] * len(states))] for char in chars)
    for char in chars:
        for state in states:
            name = Path(char['id']) / state['id']
            gif(sorted((gif_input / name).glob('*.png')), root / 'gif' / name.with_suffix('.gif'), delay)
    for i in range(0, len(chars), 5):
        for theme, bg, ink in [('light', '#f1eaf5', '#2f2341'), ('dark', '#271c31', '#f4eaf7')]:
            sheet(root, chars[i:i + 5], states, theme, bg, ink, root / 'contact-sheets' / str(i // 5 + 1))
    shutil.rmtree(gif_input)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('capture', type=Path)
    package(parser.parse_args().capture)
