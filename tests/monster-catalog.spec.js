const { test, expect } = require('@playwright/test');

const catalog = '/monster-catalog/';
const widths = [320, 768, 1440];

for (const width of widths) {
  test(`каталог отрисовывает 247 сочетаний при ширине ${width}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 850 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(catalog);
    await expect(page.locator('#character option')).toHaveCount(19);
    await expect(page.locator('#moves button')).toHaveCount(13);
    await expect(page.locator('#progress')).toHaveText('0 / 247 согласовано');
    const result = await page.evaluate(async () => {
      const { rigs } = await import('/monster-catalog/rigs.js');
      const { Renderer, stage, states } = await import('/monster-catalog/engine.js');
      const renderer = new Renderer(document.querySelector('canvas'));
      const { canvas, ctx } = renderer;
      const failures = [];
      let combinations = 0;
      if (new Set(rigs.map(rig => rig.id)).size !== 19) failures.push('ID персонажей');
      if (new Set(states.map(state => state.id)).size !== 13) failures.push('ID состояний');
      if (document.documentElement.scrollWidth > innerWidth) failures.push('Горизонтальная прокрутка');
      if (canvas.getBoundingClientRect().width > innerWidth) failures.push('Размер холста');
      const pixels = () => ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const ids = rigs.map(rig => rig.id);
      for (const rig of rigs) {
        const select = document.querySelector('#character');
        select.value = rig.id;
        select.dispatchEvent(new Event('change'));
        await renderer.load(rig);
        const assetStatus = document.querySelector('#asset-status');
        while (assetStatus.textContent === 'Загрузка слоёв…') {
          await new Promise(requestAnimationFrame);
        }
        if (assetStatus.textContent) failures.push(`${rig.id}: ${assetStatus.textContent}`);
        const concept = new Image();
        concept.src = rig.reference;
        await concept.decode();
        if (!concept.naturalWidth) failures.push(`${rig.id}: концепт`);
        const ids = [...rig.limbs.map(limb => limb.id), ...rig.occluded];
        if (new Set(ids).size !== ids.length) failures.push(`${rig.id}: повтор ID лапы`);
        const art = rig.limbs.filter(limb => limb.art);
        if (new Set(art.map(part => part.art.src)).size !== art.length ||
            new Set(art.map(part => part.layer)).size !== art.length) failures.push(`${rig.id}: повтор слоя лапы`);
        if (art.some(part => part.pivot.some((pos, i) => pos < 0 || pos > rig.size[i]))) {
          failures.push(`${rig.id}: координаты креплений`);
        }

        for (const [index, state] of states.entries()) {
          document.querySelectorAll('#moves button')[index].click();
          const frames = Array.from({ length: 45 }, (_, i) => i / 44);
          let fit;
          for (const t of frames) {
            const { bounds, fit: scale } = renderer.draw(rig, state.id, t);
            fit ??= scale;
            const [left, top, right, bottom] = bounds;
            if (fit !== scale || bounds.some(value => !Number.isFinite(value)) ||
                left < 9 || top < 9 || right > stage.width - 9 || bottom > stage.height - 9) {
              failures.push(`${rig.id}/${state.id}/${t}: ${bounds.join(',')}`);
            }
          }
          if (document.querySelector('#playing').textContent !== state.label) failures.push(`${rig.id}/${state.id}: выбор`);
          combinations++;
        }
        renderer.draw(rig, 'blink', 0);
        const open = pixels();
        renderer.draw(rig, 'blink', .44);
        const blink = pixels();
        const transform = renderer.geometry(rig, 'blink', 0).face.transform;
        const ratio = canvas.width / stage.width;
        let changed = false;
        for (let p = 0; p < blink.length; p += 4) {
          if ([0, 1, 2, 3].every(c => open[p + c] === blink[p + c])) continue;
          const x = ((p / 4) % canvas.width / ratio - stage.x - transform[4]) / transform[0];
          const y = (Math.floor(p / 4 / canvas.width) / ratio - stage.ground - transform[5]) / transform[3];
          const inEye = rig.eyes.some(({ shape, cover }) => {
            const [ex, ey, ew, eh] = cover.box;
            return x >= ex - 4 && x <= ex + ew + 4 && y >= ey - 4 && y <= ey + eh + 4 && shape.length === 4;
          });
          if (!inEye) {
            failures.push(`${rig.id}: изменился пиксель за пределами глаз`);
            break;
          }
          changed = true;
        }
        if (!changed) failures.push(`${rig.id}: моргание не видно`);
        for (let x = 0; x < canvas.width; x++) {
          if (blink[x * 4 + 3] || blink[((canvas.height - 1) * canvas.width + x) * 4 + 3]) {
            failures.push(`${rig.id}: пиксель на границе холста`);
            break;
          }
        }
      }
      const byId = Object.fromEntries(rigs.map(rig => [rig.id, rig]));
      const oneEye = byId['one-eye'];
      if (oneEye.limbs.length !== 6 || oneEye.eyes.length !== 1) failures.push('Одноглазик');
      if (byId.jelly.limbs.length !== 4 || byId.slime.limbs.length !== 0 ||
          byId.duck.limbs.filter(part => part.role === 'крылышко').length !== 2 ||
          byId.duck.limbs.filter(part => part.role === 'перепончатая ножка').length !== 2) failures.push('Анатомия');
      const cherry = byId.cherry.neutral;
      const [cherryX, cherryY, cherryWidth, cherryHeight] = cherry.box;
      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = cherryWidth;
      sourceCanvas.height = cherryHeight;
      const sourceContext = sourceCanvas.getContext('2d');
      sourceContext.drawImage(renderer.images.get(cherry.src).image, 0, 0);
      const alphaAt = (x, y) => sourceContext.getImageData(x - cherryX, y - cherryY, 1, 1).data[3];
      if (alphaAt(103, 81) < 225 || alphaAt(165, 81) < 225 || alphaAt(137, 84) !== 0) {
        failures.push('Вишенка: целые черешки с прозрачным просветом');
      }
      const jelly = byId.jelly;
      const joints = renderer.geometry(jelly, 'thought', .55).joints;
      const p2 = joints.find(joint => joint.id === 'P2');
      if (joints.length !== 4 || p2.to[1] >= p2.from[1]) failures.push('Желейник: жест P2');
      for (const state of states) {
        const effects = renderer.geometry(byId.tongue, state.id, .55).effects;
        if (effects.filter(effect => effect.kind === 'line').length !== (['happy', 'joy', 'jump'].includes(state.id) ? 3 : 0)) {
          failures.push(`Языкастик: полоски / ${state.id}`);
        }
      }
      for (const rig of rigs) {
        const middle = renderer.geometry(rig, 'flip', .49);
        for (let i = 0; i <= 90; i++) {
          if (renderer.geometry(rig, 'flip', i / 90).figure.length !== 1) {
            failures.push(`${rig.id}: двойной силуэт в сальтухе`);
            break;
          }
        }
        const end = renderer.geometry(rig, 'flip', .82);
        if (!middle.figure.some(part => part.asset.src.includes('/flip')) ||
            !middle.effects.some(effect => effect.kind === 'vortex') ||
            end.effects.some(effect => effect.kind === 'vortex')) failures.push(`${rig.id}: сальтуха`);
      }
      return { ids, combinations, failures };
    });
    expect(result.ids).toHaveLength(19);
    expect(result.combinations).toBe(247);
    expect(result.failures).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('просмотр, пауза, возврат в дыхание, последовательный показ', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(catalog);
  await expect(page.locator('#pause')).toHaveText('Продолжить');
  await expect(page.locator('#asset-status')).toBeEmpty();
  await page.getByRole('button', { name: /^Прыжок/ }).click();
  await page.locator('#phase').fill('510');
  await expect(page.locator('#time')).toHaveText('0,61 с');
  const pixelState = await page.locator('canvas').evaluate(canvas => canvas.toDataURL());
  await page.waitForTimeout(190);
  expect(await page.locator('canvas').evaluate(canvas => canvas.toDataURL())).toBe(pixelState);
  await page.locator('#pause').click();
  await expect(page.locator('#playing')).toHaveText('Прыжок · снова дыхание');
  await page.locator('#replay').click();
  await expect(page.locator('#playing')).toHaveText('Прыжок');
  await page.locator('#sequence').click();
  await expect(page.locator('#playing')).toHaveText('Дыхание');
  await expect(page.locator('#playing')).toHaveText('Моргание', { timeout: 6200 });
  await page.locator('#next').click();
  await expect(page.locator('#name')).toHaveText('Растенник');
  await expect(page.locator('#sequence')).toHaveAttribute('aria-pressed', 'false');
  await page.locator('#dark').check();
  await expect(page.locator('#picture')).toHaveClass('picture dark');
  await page.locator('#guides').check();
  await page.locator('summary').click();
  await expect(page.locator('#reference')).toBeVisible();
});

test('комментарии сохраняются отдельно, импорт и экспорт проверяются', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('test-existing-app-data', '{"pet":"Вупсень","level":7}'));
  await page.goto(catalog);
  await page.locator('#note').fill('Проверить край при 200%');
  await page.locator('#revise').click();
  await expect(page.locator('#review-state')).toHaveText('На правку');
  await page.reload();
  await expect(page.locator('#note')).toHaveValue('Проверить край при 200%');
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('monster-review.json');
  const contents = await require('node:fs/promises').readFile(await file.path(), 'utf8');
  expect(JSON.parse(contents)).toEqual({ version: 1, reviews: { 'jelly/idle': { status: 'revise', note: 'Проверить край при 200%' } } });
  await page.locator('#import').setInputFiles({
    name: 'review.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, reviews: { 'duck/flip': { status: 'approved', note: 'Пример' } } }))
  });
  await expect(page.locator('#progress')).toHaveText('1 / 247 согласовано');
  await page.locator('#import').setInputFiles({
    name: 'bad.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, reviews: { 'imagined/idle': { status: 'approved', note: '' } } }))
  });
  await expect(page.locator('#review-message')).toContainText('Импорт не выполнен');
  await expect(page.locator('#progress')).toHaveText('1 / 247 согласовано');
  expect(await page.evaluate(() => localStorage.getItem('test-existing-app-data'))).toBe('{"pet":"Вупсень","level":7}');
});

test('автономный HTML открывается без сети', async ({ page }) => {
  const { execFileSync } = require('node:child_process');
  const { mkdtemp, readFile, rm } = require('node:fs/promises');
  const { tmpdir } = require('node:os');
  const { join } = require('node:path');
  const { pathToFileURL } = require('node:url');
  const folder = await mkdtemp(join(tmpdir(), 'monster-catalog-'));
  const file = join(folder, 'monster-catalog-offline.html');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const requests = [];
  await page.route(/^https?:/, route => {
    requests.push(route.request().url());
    return route.abort();
  });
  try {
    execFileSync('python3', ['monster-catalog/qa/standalone.py', file]);
    if (process.env.GITHUB_ACTIONS) {
      await page.goto(pathToFileURL(file).href);
    } else {
      // Managed Chromium can block file://. The bundled content still runs
      // in a blank document without an HTTP origin or a running server.
      await page.setContent(await readFile(file, 'utf8'));
    }
    const character = page.locator('#character');
    const progress = page.locator('#progress');
    await expect(progress).toHaveText('0 / 247 согласовано');
    await expect(character.locator('option')).toHaveCount(19);
    await expect(page.locator('#moves button')).toHaveCount(13);
    await page.locator('summary').click();
    for (const id of await character.locator('option').evaluateAll(options => options.map(option => option.value))) {
      await character.selectOption(id);
      await expect(page.locator('#asset-status')).toBeEmpty();
      await expect(page.locator('#reference')).toHaveJSProperty('complete', true);
      expect(await page.locator('#reference').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    }
    await expect(page.locator('#reference-link')).toHaveAttribute('href', /^blob:/);
    await page.getByRole('button', { name: /^Сальтуха/ }).click();
    await expect(page.locator('#playing')).toHaveText('Сальтуха');
    await page.locator('#phase').fill('500');
    const frame = await page.locator('#stage').evaluate(canvas => canvas.toDataURL());
    await page.locator('#phase').fill('100');
    expect(await page.locator('#stage').evaluate(canvas => canvas.toDataURL())).not.toBe(frame);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
