const { test, expect } = require('@playwright/test');

async function seedForecast(page, {theme = 'puff', currency = 'RUB', value = 0} = {}) {
  await page.clock.setFixedTime(new Date(2026, 10, 16, 13));
  await page.goto('/index.html');
  await page.locator('[data-a=onbNext]').click();
  await page.locator('#ob_bal').fill('20000');
  await page.locator('[data-a=onbNext]').click();
  await page.locator('#ob_lim').fill('1500');
  await page.locator('[data-a=onbNext]').click();
  await page.locator('[data-a=onbGo]').click();
  await page.evaluate(({theme, currency, value}) => {
    const data = JSON.parse(localStorage.getItem('podkopka-v1'));
    Object.assign(data, {
      demo: false,
      simple: true,
      irreg: false,
      unameAsked: 1,
      cur: currency,
      payDays: [25],
      accounts: [{id: 'a1', type: 'main', name: 'Карта', start: value}],
      entries: [],
      fcPlans: [],
      noSpend: ['2026-11-15', '2026-11-14', '2026-11-13', '2026-11-12', '2026-11-11'],
    });
    data.pet.theme = theme;
    localStorage.setItem('podkopka-v1', JSON.stringify(data));
  }, {theme, currency, value});
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
    const sheet = page.locator('.sheet.fc-magic');
    const cards = sheet.locator('.fc-card');
    await expect(cards).toHaveCount(2);
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
            textFits: [...card.querySelectorAll('.fc-front .fc-card-amount, .fc-front .fc-card-caption')].every(text => {
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
  });
}

test('шрифт и иллюстрации прогноза загружаются при первом открытии без сети', async ({browser, baseURL}) => {
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
  } finally {
    await context.close();
  }
});
