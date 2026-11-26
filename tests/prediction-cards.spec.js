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
    const plans=future.locator('.fc-plan-toggle');
    await expect(plans).toHaveAttribute('aria-expanded','false');
    await expect(future.locator('#fc-personal-plans')).toBeHidden();
    await plans.click();
    await expect(future.locator('#fc-personal-plans')).toBeVisible();
    await expect(future.locator('.fc-future-summary')).toBeVisible();
    expect(await sheet.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    await plans.click();
    await expect(future.locator('#fc-personal-plans')).toBeHidden();
    await future.locator('summary').click();
    await expect(future).toHaveJSProperty('open',false);
    for(const card of await cards.all())await expect(card).toHaveAttribute('aria-pressed','true');
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

test('Что грядёт: фон, рамка, кнопка, облака и иконки подстраиваются под тему, золото и иллюстрации неизменны', async ({page}) => {
  await page.setViewportSize({width:390,height:740});
  await seedForecast(page,{theme:'fluff',value:20000});
  const themes=['fluff','puff','slime','rat','mouse','frog','duck','cat','skel','skelf','straw','cher'];
  const palettes=[];
  for(const theme of themes){
    await page.evaluate(theme=>{
      const d=JSON.parse(localStorage.getItem('podkopka-v1'));
      d.pet.theme=theme;
      localStorage.setItem('podkopka-v1',JSON.stringify(d));
    },theme);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-pet',theme);
    await page.locator('[data-a=fcOpen]').click();
    const future=page.locator('.fc-future');
    await future.locator('summary').click();
    const colors=await future.evaluate(el=>{
      const css=getComputedStyle(el),select=s=>el.querySelector(s);
      return {
        background:css.backgroundImage,
        border:css.borderTopColor,
        button:getComputedStyle(select('.fc-plan-toggle')).backgroundImage,
        icon:getComputedStyle(select('#fcBasket stop')).stopColor,
        cloud:getComputedStyle(select('#fcClouds stop')).stopColor,
        gold:getComputedStyle(select('.fc-future-title')).color,
        art:[...document.querySelectorAll('.fc-art')].map(x=>x.getAttribute('src'))
      };
    });
    palettes.push(colors);
    await expect(future.locator('.fc-plan-toggle')).toBeVisible();
    await expect(future.locator('.fc-future-summary')).toBeVisible();
  }
  for(const key of ['background','border','button','icon','cloud']){
    expect(new Set(palettes.map(p=>p[key])).size).toBeGreaterThanOrEqual(10);
  }
  expect(new Set(palettes.map(p=>p.gold)).size).toBe(1);
  for(const p of palettes)expect(p.art).toEqual(['assets/prediction/usual.png','assets/prediction/large.png']);
});
