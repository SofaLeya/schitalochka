const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test, expect } = require('@playwright/test');

const forecastIcons = ['cards', 'basket', 'pouch', 'crystals'].map(name => `assets/forecast-icons/${name}.png`);

function paletteChunk(png) {
  for (let offset = 8; offset < png.length;) {
    const size = png.readUInt32BE(offset);
    const start = offset + 8;
    const end = start + size;
    if (png.toString('ascii', offset + 4, start) === 'PLTE') return {start, end};
    offset = end + 4;
  }
  throw new Error('PNG palette missing');
}

async function seedForecast(page, {theme = 'puff', currency = 'RUB', value = 0, irreg = false} = {}) {
  await page.clock.setFixedTime(new Date(2026, 10, 16, 13));
  await page.goto('/index.html');
  await page.locator('[data-a=onbNext]').click();
  await page.locator('#ob_bal').fill('20000');
  await page.locator('[data-a=onbNext]').click();
  await page.locator('#ob_lim').fill('1500');
  await page.locator('[data-a=onbNext]').click();
  await page.locator('[data-a=onbGo]').click();
  await page.evaluate(({theme, currency, value, irreg}) => {
    const data = JSON.parse(localStorage.getItem('podkopka-v1'));
    Object.assign(data, {
      demo: false,
      simple: true,
      irreg,
      unameAsked: 1,
      cur: currency,
      payDays: irreg ? [] : [25],
      accounts: [{id: 'a1', type: 'main', name: 'Карта', start: value}],
      entries: [],
      fcPlans: [],
      noSpend: ['2026-11-15', '2026-11-14', '2026-11-13', '2026-11-12', '2026-11-11'],
    });
    data.pet.theme = theme;
    localStorage.setItem('podkopka-v1', JSON.stringify(data));
  }, {theme, currency, value, irreg});
  await page.reload();
}

test.beforeEach(async ({page}) => {
  await page.route(url => url.hostname !== 'localhost', route => route.abort());
});

const cases = [
  [320, 'puff', 'RUB', 0, '~0 ₽'],
  [360, 'slime', 'USD', -123456, '−123 456 $'],
  [390, 'puff', 'AMD', 1234567, '~1 234 500 ֏'],
  [430, 'slime', 'CHF', -1234567, '−1 234 567 CHF'],
];

for (const [width, theme, currency, value, amount] of cases) {
  test(`карты при ${width} px, тема ${theme}, валюта ${currency}`, async ({page}) => {
    await page.setViewportSize({width, height: 640});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await seedForecast(page, {theme, currency, value});
    const forecast = await page.evaluate(() => {
      const f = window.fcCalc();
      return [f.usualLeft, f.withLargeLeft];
    });
    expect(forecast).toEqual([value, value]);
    await page.locator('[data-a=fcOpen]').click();
    await expect(page.locator('html')).toHaveAttribute('data-pet', theme);
    const sheet = page.locator('#ov .sheet.fc-magic');
    const cards = sheet.locator('.fc-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.locator('.fc-back .fc-card-caption')).toHaveCount(2);
    await expect(cards.locator('.fc-front .fc-card-caption')).toHaveCount(0);
    await expect(cards.first().locator('.fc-back .fc-card-caption')).toHaveCSS('font-family', /Forecast Serif/);
    const initial = await cards.evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()));
    expect(initial[0].width).toBeCloseTo(initial[1].width, 1);
    expect(initial[0].height).toBeCloseTo(initial[1].height, 1);
    expect(initial[0].top).toBeCloseTo(initial[1].top, 1);
    expect(initial[0].right).toBeLessThan(initial[1].left);
    expect(initial[0].left).toBeGreaterThanOrEqual(0);
    expect(initial[1].right).toBeLessThanOrEqual(width);
    await cards.nth(0).click();
    await cards.nth(1).click();
    for (const card of await cards.all()) {
      await expect(card.locator('.fc-card-amount')).toHaveText(amount);
      await expect(card.locator('.fc-shortfall')).toHaveCount(value < 0 ? 1 : 0);
      await expect(card.locator('.fc-card-turn')).toHaveCSS('transition-duration', '0s');
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll('.fc-art')].map(art => art.decode()));
    });
    const geometry = await sheet.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const fits = (inner, outer) => inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1 &&
        inner.left >= outer.left - 1 && inner.right <= outer.right + 1;
      return {
        scrollsHorizontally: el.scrollWidth > el.clientWidth + 1,
        cards: [...el.querySelectorAll('.fc-card')].map(card => {
          const rect = card.getBoundingClientRect();
          return {
            rect: rect.toJSON(),
            fits: fits(rect, bounds),
            artFits: fits(card.querySelector('.fc-art').getBoundingClientRect(), rect),
            textFits: [...card.querySelectorAll('.fc-front .fc-card-amount')].every(text => {
              const range = document.createRange();
              range.selectNodeContents(text);
              return fits(range.getBoundingClientRect(), rect);
            }),
          };
        }),
      };
    });
    expect(geometry.scrollsHorizontally).toBe(false);
    for (const [index, card] of geometry.cards.entries()) {
      expect(card).toEqual({rect: initial[index], fits: true, artFits: true, textFits: true});
    }
    const future=sheet.locator('.fc-future');
    await future.locator('summary').click();
    await expect(future.locator('.fc-future-summary')).toBeVisible();
    const plans = future.getByRole('button', {name: /^Мои планы/});
    const modal = page.getByRole('dialog', {name: 'Мои планы'});
    const scrollTop = await sheet.evaluate(el => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    });
    expect(scrollTop).toBeGreaterThan(0);
    await plans.click();
    await expect(modal).toBeVisible();
    await expect(sheet).toBeVisible();
    await expect(page.locator('#ov')).toHaveJSProperty('inert', true);
    await expect(modal.getByRole('button', {name: 'Назад'})).toBeFocused();
    await modal.getByRole('button', {name: '+ Добавить план'}).click();
    await expect(modal.locator('#fc_amt')).toBeVisible();
    for (const panel of [sheet, modal]) {
      expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    await modal.getByRole('button', {name: 'Назад'}).click();
    await expect(modal).toBeHidden();
    await expect(page.locator('#ov')).toHaveJSProperty('inert', false);
    await expect(plans).toBeFocused();
    await expect(sheet).toHaveJSProperty('scrollTop', scrollTop);
    await expect(future).toHaveJSProperty('open', true);
    await expect(future.locator('.fc-future-summary')).toBeVisible();
    await future.locator('summary').click();
    await expect(future).toHaveJSProperty('open',false);
    for(const card of await cards.all())await expect(card).toHaveAttribute('aria-pressed','true');
  });
}

test('шрифт, иллюстрации и PNG-иконки прогноза загружаются при первом открытии без сети', async ({browser, baseURL}) => {
  const context = await browser.newContext({baseURL, serviceWorkers: 'allow'});
  try {
    const page = await context.newPage();
    await seedForecast(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, {once: true}));
      }
    });
    await page.reload();
    await expect(page.locator('[data-a=fcOpen]')).toBeVisible();
    await expect.poll(() => page.evaluate(async () => !!(await caches.match(location.href)))).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await page.locator('[data-a=fcOpen]').click();
    const loaded = await page.evaluate(async () => {
      const faces = await document.fonts.load('700 32px "Forecast Serif"', 'Предсказание ₽');
      return faces.some(face => face.status === 'loaded');
    });
    expect(loaded).toBe(true);
    const artSizes = await page.locator('.fc-art').evaluateAll(images =>
      Promise.all(images.map(async img => {
        await img.decode();
        return [img.naturalWidth, img.naturalHeight];
      })));
    expect(artSizes).toEqual([[372, 501], [372, 501]]);
    const future = page.locator('.fc-future');
    await future.locator('summary').click();
    await expect.poll(() => future.locator('img').evaluateAll(images =>
      images.filter(img => img.currentSrc.startsWith('blob:')).length)).toBe(4);
    expect(await future.locator('img').evaluateAll(images =>
      Promise.all(images.map(async img => {
        await img.decode();
        return [img.getAttribute('src'), img.naturalWidth, img.naturalHeight];
      }))
    )).toEqual(forecastIcons.map(src => [src, 96, 96]));
  } finally {
    await context.close();
  }
});

test('все 12 тем перекрашивают фиолетовые оттенки PNG на открытом прогнозе', async ({page}) => {
  await seedForecast(page, {theme: 'fluff', value: 20000});
  await page.locator('[data-a=fcOpen]').click();
  const future = page.locator('.fc-future');
  await future.locator('summary').click();
  const icons = future.locator('img');
  const themes = ['fluff','puff','slime','rat','mouse','frog','duck','cat','skel','skelf','straw','cher'];
  const originals = forecastIcons.map(src => readFileSync(join(__dirname, '..', src)));
  const iconPalettes = originals.map(() => new Set());
  const themeStyles = [];
  let previous = [];

  for (const theme of themes) {
    // Предсказание уже открыто, меняем тот же атрибут, что и настройки монстрика.
    await page.locator('html').evaluate((root, theme) => { root.dataset.pet = theme; }, theme);
    await expect(page.locator('html')).toHaveAttribute('data-pet', theme);
    await expect.poll(() => icons.evaluateAll((images, previous) =>
      images.every((img, i) => img.currentSrc.startsWith('blob:') && img.currentSrc !== previous[i]),
      previous
    ), {message: `PNG для темы ${theme}`}).toBe(true);
    const variants = await icons.evaluateAll(images => Promise.all(images.map(async img => {
      await img.decode();
      const response = await fetch(img.currentSrc);
      return {src: img.currentSrc, original: img.getAttribute('src'), png: [...new Uint8Array(await response.arrayBuffer())]};
    })));
    previous = variants.map(variant => variant.src);
    expect(variants.map(variant => variant.original)).toEqual(forecastIcons);

    const styles = await future.evaluate(el => {
      const css = getComputedStyle(el);
      const style = selector => getComputedStyle(el.querySelector(selector));
      return {
        accent: css.getPropertyValue('--fc-future-theme').trim(),
        background: css.backgroundImage,
        border: css.borderTopColor,
        button: style('.fc-plan-toggle').backgroundImage,
        glow: style('.fc-future-symbol').filter,
        cloud: style('#fcClouds stop').stopColor,
        gold: style('.fc-future-title').color,
      };
    });
    themeStyles.push(styles);
    const accent = [...Buffer.from(styles.accent.slice(1), 'hex')];
    const channelPairs = [[0, 1], [0, 2], [1, 2]].filter(([x, y]) => Math.abs(accent[x] - accent[y]) >= 16);

    for (const [i, variant] of variants.entries()) {
      const original = originals[i];
      const tinted = Buffer.from(variant.png);
      const {start, end} = paletteChunk(original);
      expect(paletteChunk(tinted)).toEqual({start, end});
      expect(tinted.subarray(0, start).equals(original.subarray(0, start))).toBe(true);
      // Включая все данные о пикселях и прозрачности, после CRC палитры.
      expect(tinted.subarray(end + 4).equals(original.subarray(end + 4))).toBe(true);
      const shades = tinted.subarray(start, end);
      iconPalettes[i].add(shades.toString('hex'));
      const alteredGold = [];
      let changed = 0;
      let matchesTheme = true;
      for (let color = start; color < end; color += 3) {
        const rgb = original.subarray(color, color + 3);
        const result = tinted.subarray(color, color + 3);
        if (rgb[2] - rgb[1] <= 8 && !result.equals(rgb)) alteredGold.push([...rgb]);
        if (rgb[2] - rgb[1] >= 32 && !result.equals(rgb)) {
          changed++;
          for (const [x, y] of channelPairs) {
            matchesTheme &&= Math.sign(result[x] - result[y]) === Math.sign(accent[x] - accent[y]);
          }
          expect(Math.abs(Math.max(...rgb) + Math.min(...rgb) -
            Math.max(...result) - Math.min(...result))).toBeLessThanOrEqual(1);
        }
      }
      expect(alteredGold, `Золотые и нейтральные оттенки ${variant.original} в теме ${theme}`).toEqual([]);
      expect(matchesTheme, `Цвет ${variant.original} в теме ${theme}`).toBe(true);
      expect(changed, `Фиолетовые оттенки ${variant.original} в теме ${theme}`).toBeGreaterThan(10);
    }
  }

  for (const palettes of iconPalettes) expect(palettes.size).toBe(themes.length);
  for (const key of ['background', 'border', 'button', 'glow', 'cloud']) {
    expect(new Set(themeStyles.map(style => style[key])).size, key).toBe(themes.length);
  }
  expect(themeStyles.every(style => style.glow.startsWith('drop-shadow('))).toBe(true);
  expect(new Set(themeStyles.map(style => style.gold)).size).toBe(1);
  expect(await page.locator('.fc-art').evaluateAll(images => images.map(img => img.getAttribute('src'))))
    .toEqual(['assets/prediction/usual.png', 'assets/prediction/large.png']);
});

test('системная кнопка «Назад» сначала закрывает планы, затем предсказание', async ({page}) => {
  await seedForecast(page, {irreg: true, value: 20000});
  await page.locator('[data-a=fcOpen]').click();
  const sheet = page.locator('#ov .sheet');
  const plans = sheet.getByRole('button', {name: /^Мои планы/});
  const modal = page.getByRole('dialog', {name: 'Мои планы'});
  const slider = sheet.locator('#fc_wif');
  await slider.fill('200');
  await plans.click();
  await expect(modal).toBeVisible();
  await page.goBack();
  await expect(modal).toBeHidden();
  await expect(slider).toHaveValue('200');
  await expect(plans).toBeFocused();
  await page.goBack();
  await expect(sheet).toBeHidden();
});
