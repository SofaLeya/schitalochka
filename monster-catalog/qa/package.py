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
            phase = {'blink': 4500, 'sway': 2500, 'flip': 5000, 'thought': 5800}.get(key, 5000)
            chosen = min(frames, key=lambda f: abs(int(f.stem) - phase))
            thumb = composite(chosen, background, (w - 2, h - 7))
            image.paste(thumb, (130 + j * w, 26 + i * h))
    path.mkdir(parents=True, exist_ok=True)
    image.save(path / f'{theme}.png')


def motion_sheet(root, char, states, theme, background, ink):
    width, height = 64, 61
    fractions = range(0, 10001, 500)
    image = Image.new('RGB', (133 + len(fractions) * width, 44 + len(states) * height), background)
    font = ImageFont.truetype(FONT, 11)
    headline = ImageFont.truetype(FONT, 17)
    draw = ImageDraw.Draw(image)
    draw.text((9, 5), char['name'], fill=ink, font=headline)
    for j, value in enumerate(fractions):
        draw.text((137 + j * width, 27), f'{value // 100}%', fill=ink, font=font)
    for i, state in enumerate(states):
        folder = root / 'frames' / char['id'] / state['id']
        draw.text((9, 61 + i * height), state['label'], fill=ink, font=font)
        for j, value in enumerate(fractions):
            thumb = composite(folder / f'{value}.png', background, (width - 2, height - 2))
            image.paste(thumb, (133 + width * j, 42 + height * i))
    path = root / 'contact-sheets' / 'motion' / char['id']
    path.mkdir(parents=True, exist_ok=True)
    image.save(path / f'{theme}.png')


def audit(root, data):
    notes = json.loads(Path(__file__).with_name('findings.json').read_text(encoding='utf-8'))
    characters = {char['id']: char['name'] for char in data['characters']}
    states = {state['id']: state['label'] for state in data['states']}
    metrics = data['results']
    fields = ['Персонаж', 'Анимация', 'Кадров', 'Кадров в GIF', 'Разных контрольных кадров', 'Единый масштаб',
              'Границы сцены', 'Опора', 'Один силуэт в сальтухе', 'Конец или цикл',
              'Конечности спереди, по карте', 'Максимум размечено в фазе', 'Скрытые по карте',
              'Визуальный статус', 'Замечания', 'Кадры', 'GIF']
    status = lambda condition: 'ОК' if condition else 'Проверить'
    with (root / 'audit-247.csv').open('w', encoding='utf-8-sig', newline='') as stream:
        output = csv.writer(stream, delimiter=';')
        output.writerow(fields)
        for row in metrics:
            ident, state = row['id'], row['state']
            compares = [r for r in metrics if r['id'] == ident]
            same_fit = all(r['fit'] == row['fit'] for r in compares)
            annotations = list(notes.get('states', {}).get(state, []))
            annotations += notes.get('characters', {}).get(ident, {}).get(state, [])
            annotations += notes.get('characters', {}).get(ident, {}).get('*', [])
            if row['hidden']:
                annotations += [f"Скрыты {', '.join(row['hidden'])}; положение не восстановлено."]
            key = f'{ident}/{state}'
            output.writerow([characters[ident], states[state], row['frames'], row['animatedSamples'], row['changes'],
                             status(same_fit), status(row['withinStage']), status(row['ground']),
                             status(row['single']) if state == 'flip' else '—', status(row['boundary']),
                             row['jointsInNeutral'], row['maxInPose'], ', '.join(row['hidden']),
                             'К повторной приёмке', ' '.join(annotations), 'frames/' + key, 'gif/' + key + '.gif'])
    total = sum(row['frames'] for row in metrics)
    failures = [(row['id'], row['state'], field) for row in metrics
                for field in ('withinStage', 'ground', 'single', 'boundary') if not row[field]]
    (root / 'README.md').write_text(
        f'# Визуальная проверка каталога\n\n'
        f'{len(metrics)} сочетаний, {total} контрольных PNG и {len(metrics)} GIF. '
        f'Каждое сочетание содержит 21 равномерный кадр и дополнительные кадры вокруг ключевых фаз.\n\n'
        '- `audit-247.csv` — одна строка на сочетание, итог программных проверок и визуальные замечания.\n'
        '- `contact-sheets/motion/` — листы по персонажам, два фона, 13 строк × 21 фаза.\n'
        '- `contact-sheets/overview/` — сводные листы.\n'
        '- `frames/` — исходные контрольные PNG в отдельном архиве `monster-catalog-frames`. Число в имени — фаза из 10 000.\n'
        '- `gif/` — непрерывное воспроизведение каждого движения. '
        'В GIF сна вступление повторяется после конца файла, в каталоге повторяется только дыхание.\n\n'
        f'Отклонений программных проверок по отдельным параметрам: **{len(failures)}**.\n'
        + ''.join(f'- `{ident}/{state}` — `{field}`\n' for ident, state, field in failures)
        + '\n' + '\n'.join('- ' + note for note in notes.get('summary', [])) + '\n',
        encoding='utf-8')


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
        rows.writerows([char['name'], *(['К повторной приёмке'] * len(states))] for char in chars)
    for char in chars:
        for state in states:
            name = Path(char['id']) / state['id']
            gif(sorted((gif_input / name).glob('*.png')), root / 'gif' / name.with_suffix('.gif'), delay)
    for theme, bg, ink in [('light', '#f1eaf5', '#2f2341'), ('dark', '#271c31', '#f4eaf7')]:
        for i in range(0, len(chars), 5):
            sheet(root, chars[i:i + 5], states, theme, bg, ink, root / 'contact-sheets' / 'overview' / str(i // 5 + 1))
        for char in chars:
            motion_sheet(root, char, states, theme, bg, ink)
    audit(root, data)
    shutil.rmtree(gif_input)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('capture', type=Path)
    package(parser.parse_args().capture)
