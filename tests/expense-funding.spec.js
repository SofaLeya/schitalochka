const { readFile } = require('node:fs/promises');
const { test, expect } = require('@playwright/test');

const storageKey = 'podkopka-v1';
const initialAccounts = [
  { id: 'main', name: 'Основная карта', type: 'main', start: 80 },
  { id: 'trip', name: 'Отпуск', type: 'save', start: 61 },
  { id: 'other', name: 'Резервная карта', type: 'other', start: 20 },
  { id: 'gifts', name: 'Подарки', type: 'save', start: 10 },
];

async function openApp(page, { simple = true, accounts = initialAccounts, bank = false, payment = false } = {}) {
  await page.route(url => !/^(localhost|127\.0\.0\.1)$/.test(url.hostname), route => route.abort());
  await page.route('**/index.html', async route => {
    const response = await route.fetch();
    const html = await response.text();
    const marker = '})();\n/* Новая версия на сайте:';
    const probe = `window.fundingTest = {
      totals() {
        return {
          balances: Object.fromEntries(S.accounts.map(a => [a.id, accBalN(a)])),
          life: lifeNet(S.entries), cash: cashPlanSpent(T,T), freeBefore: balanceBefore(T),
          category: categoryAnalysis(S.entries), gross: sum(S.entries,'e'), trips: goalPace(accById('trip'))
        };
      },
      themes: () => Object.keys(PTHEME),
      backup: () => ydPack(),
      restore: () => migrate(JSON.parse(ydPack()).data),
      exportText: () => exportText('all'),
      merge3, validFunding, getToday: () => T, doneFor
    };\n`;
    if (!html.includes(marker)) throw Error('Test hook insertion point missing');
    await route.fulfill({ response, body: html.replace(marker, probe + marker) });
  });
  await page.addInitScript(({ key, simple, accounts, bank, payment }) => {
    if (localStorage.getItem(key)) return;
    const t = new Date();
    const date = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    localStorage.setItem(key, JSON.stringify({
      v: 1, setup: 1, onb: 1, unameAsked: 1, planAsked: 1, demo: false, simple,
      cur: 'RUB', accounts, entries: [], dayLimit: 100,
      recur: payment ? [{ id: 'bill', amt: 100, name: 'Интернет', cat: 'conn', day: t.getDate(), acc: 'trip' }] : [],
      planFrom: date, incomes: [], rules: [],
      bankQ: bank ? [{ id: 'bank1', type: 'e', amt: 100, note: 'Пятёрочка', raw: 'Покупка 100 ₽ в Пятёрочка', date }] : [],
    }));
  }, { key: storageKey, simple, accounts, bank, payment });
  await page.goto('/index.html');
}

const snapshot = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
const totals = page => page.evaluate(() => window.fundingTest.totals());
const funding = page => page.locator('#f_funding');
const submit = page => page.locator('#fm button[type=submit]').click();

async function chooseAccount(page, id) {
  if (!(await page.locator('#f_acc').isVisible())) await page.locator('#f_more summary').click();
  await page.selectOption('#f_acc', id);
}

async function chooseAdditional(page, name) {
  await funding(page).getByRole('button', { name: 'Добрать с другого счёта' }).click();
  await funding(page).getByRole('button', { name }).click();
}

test('одна покупка из трёх источников, редактирование и удаление', async ({ page }) => {
  await openApp(page);
  await page.locator('.tabs .plus').click();
  await chooseAccount(page, 'trip');
  await page.fill('#f_note', 'Пятёрочка');
  await page.fill('#f_amt', '100');
  await expect(funding(page)).toContainText('Не хватает 39 ₽');
  await chooseAdditional(page, /Резервная карта.*20 ₽/);
  await expect(funding(page)).toContainText('Не хватает 19 ₽');
  await submit(page);
  await expect(page.locator('#f_err')).toBeVisible();
  expect((await snapshot(page)).entries).toHaveLength(0);
  await funding(page).getByRole('button', { name: 'Добрать из свободных средств' }).click();
  await expect(funding(page)).toContainText('Распределение по источникам');
  await expect(funding(page)).toContainText('Основная карта19 ₽');
  await expect(funding(page)).not.toContainText('Не хватает');
  await submit(page);
  await expect(page.locator('#ov')).toBeHidden();
  const state = await snapshot(page);
  expect(state.entries).toHaveLength(1);
  const [entry] = state.entries;
  expect(entry).toMatchObject({ amt: 100, type: 'e', cat: 'prod', note: 'Пятёрочка' });
  expect(entry.funding.map(({ acc, amt }) => [acc, amt])).toEqual([['trip', 61], ['other', 20], ['main', 19]]);
  expect(await totals(page)).toEqual({
    balances: { main: 61, trip: 0, other: 0, gifts: 10 },
    life: 19, cash: 19, freeBefore: 80, category: { prod: 100 }, gross: 100, trips: -61,
  });

  await page.reload();
  await page.click('.tabs [data-a=tab][data-v=hist]');
  const row = page.locator(`[data-a=edit][data-id="${entry.id}"]`);
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(funding(page)).toContainText('Резервная карта20 ₽');
  await page.fill('#f_amt', '171,01');
  await chooseAdditional(page, /Подарки.*10 ₽/);
  await expect(funding(page)).toContainText('Не хватает 0,01 ₽');
  await submit(page);
  expect((await snapshot(page)).entries[0].amt).toBe(100);

  await page.fill('#f_amt', '165');
  await expect(funding(page)).toContainText('Подарки4 ₽');
  await submit(page);
  expect((await snapshot(page)).entries).toHaveLength(1);
  expect(await totals(page)).toMatchObject({
    balances: { main: 0, trip: 0, other: 0, gifts: 6 },
    life: 80, cash: 80, category: { prod: 165 }, gross: 165,
  });
  await row.click();
  await page.locator('[data-a=askDel]').click();
  await page.locator('[data-a=delEntry]').click();
  expect((await snapshot(page)).entries).toHaveLength(0);
  expect(await totals(page)).toMatchObject({
    balances: { main: 80, trip: 61, other: 20, gifts: 10 },
    life: 0, cash: 0, category: {}, gross: 0,
  });
});

test('покупка ровно на остаток сохраняется в прежнем формате', async ({ page }) => {
  await openApp(page);
  await page.locator('.tabs .plus').click();
  await chooseAccount(page, 'trip');
  await page.fill('#f_note', 'Пятёрочка');
  await page.fill('#f_amt', '61');
  await expect(funding(page)).toBeHidden();
  await submit(page);
  const [entry] = (await snapshot(page)).entries;
  expect(entry).toMatchObject({ amt: 61, acc: 'trip' });
  expect(entry.funding).toBeUndefined();
  expect(await totals(page)).toMatchObject({ balances: { trip: 0 }, life: 0, gross: 61 });
});

test('архив задействованного счёта сохраняет покупку и её распределение', async ({ page }) => {
  await openApp(page);
  await page.locator('.tabs .plus').click();
  await chooseAccount(page, 'trip');
  await page.fill('#f_note', 'Пятёрочка');
  await page.fill('#f_amt', '161');
  await chooseAdditional(page, /Резервная карта.*20 ₽/);
  await funding(page).getByRole('button', { name: 'Добрать из свободных средств' }).click();
  await submit(page);
  const [entry] = (await snapshot(page)).entries;

  await page.locator('[data-a=editAcc][data-id=other]').first().click();
  await page.locator('#ov [data-a=askDel]').click();
  await page.locator('#ov [data-a=delAcc]').click();
  const archived = await snapshot(page);
  expect(archived.accounts.find(a => a.id === 'other').archived).toBe(true);
  expect(archived.entries).toEqual([entry]);
  expect(await totals(page)).toMatchObject({ balances: { main: 0, trip: 0, other: 0 }, category: { prod: 161 }, life: 80 });

  await page.click('.tabs [data-a=tab][data-v=hist]');
  await page.locator(`[data-a=edit][data-id="${entry.id}"]`).click();
  await expect(page.locator('#ov .sheet')).toContainText('Резервная карта (архив)20 ₽');
});

test('скрытое банковское уведомление, ручная покупка и отметка платежа сохраняют учёт', async ({ page }) => {
  await openApp(page, { simple: false, bank: true, payment: true });
  await expect(page.locator('[data-a=bankAdd][data-id=bank1]')).toHaveCount(0);
  await page.locator('.tabs .plus').click();
  await chooseAccount(page, 'main');
  await page.fill('#f_note', 'Пятёрочка');
  await page.fill('#f_amt', '100');
  await expect(funding(page)).toContainText('Не хватает 20 ₽');
  await chooseAdditional(page, /Резервная карта.*20 ₽/);
  await submit(page);
  expect((await snapshot(page)).bankQ).toEqual([expect.objectContaining({ id: 'bank1' })]);
  expect(await totals(page)).toMatchObject({ life: 80, cash: 80, gross: 100 });

  await page.click('.tabs [data-a=tab][data-v=plan]');
  const ym = await page.evaluate(() => window.fundingTest.getToday().slice(0, 7));
  await page.locator('[data-a=toggle][data-id=bill]:not([data-v])').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Записать' }).click();
  await expect(funding(page)).toContainText('Не хватает 39 ₽');
  await chooseAdditional(page, /Подарки.*10 ₽/);
  await expect(funding(page)).toContainText('Не хватает 29 ₽');
  await page.fill('#f_amt', '71');
  await submit(page);
  expect((await snapshot(page)).entries).toHaveLength(2);
  expect((await snapshot(page)).entries[1]).toMatchObject({ rid: 'bill', amt: 71, cat: 'conn', note: 'Интернет' });
  expect(await page.evaluate(ym => window.fundingTest.doneFor('rid', 'bill', ym), ym)).toBe(true);
  expect(await totals(page)).toMatchObject({ cash: 80, life: 80, gross: 171, category: { prod: 100, conn: 71 } });
});

test('валютные списания и сумма покупки переживают экспорт, восстановление и конфликт синхронизации', async ({ page }) => {
  const accounts = initialAccounts.map(a => a.id === 'other' ? { ...a, cur: 'USD', start: 0.25 } : a);
  await openApp(page, { accounts });
  await page.locator('.tabs .plus').click();
  await chooseAccount(page, 'trip');
  await page.fill('#f_note', 'Пятёрочка');
  await page.fill('#f_amt', '100');
  await chooseAdditional(page, /Резервная карта.*0,25/);
  await funding(page).getByRole('button', { name: 'Добрать из свободных средств' }).click();
  await expect(funding(page)).toContainText('0,25 $');
  await submit(page);
  expect(await totals(page)).toMatchObject({ balances: { main: 61, trip: 0, other: 0 }, cash: 19 });
  const [entry] = (await snapshot(page)).entries;
  const result = await page.evaluate(entry => {
    const { merge3, validFunding, backup, restore, exportText } = window.fundingTest;
    const remote = { ...entry, amt: 101, funding: entry.funding.map(p => p.acc === 'main' ? { ...p, amt: 20, nat: 20 } : p) };
    const local = { ...entry, note: 'Уточнение' };
    const merged = merge3(entry, local, remote);
    const conflict = merge3(entry, { ...local, amt: 61, funding: undefined }, remote);
    return {
      restored: restore().entries[0], exported: JSON.parse(backup()).data.entries[0],
      text: exportText(), merged, valid: validFunding(merged), conflict,
    };
  }, entry);
  expect(result.restored).toEqual(entry);
  expect(result.exported).toEqual(entry);
  expect(result.text).toContain('расходы 100 (со свободных денег 19, из копилок 61, с других счетов 20)');
  expect(result.text).toContain('Резервная карта 0,25 $ (≈ 20 ₽)');
  expect(result.merged).toMatchObject({ amt: 101, note: 'Уточнение' });
  expect(result.valid).toBe(true);
  expect(result.conflict).toMatchObject({ amt: 61, note: 'Уточнение' });
  expect(result.conflict.funding).toBeUndefined();

  await page.click('.tabs [data-a=tab][data-v=an]');
  await page.locator('[data-a=csvOpen]').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-a=csvGo]').click(),
  ]);
  const csv = await readFile(await download.path(), 'utf8');
  expect(csv.trim().split('\r\n')).toHaveLength(2);
  expect(csv).toContain('Расход;Продукты;100;Пятёрочка');
  expect(csv).toContain('Отпуск 61 ₽ / Резервная карта 0,25 $ (≈ 20 ₽) / Основная карта 19 ₽');
});

test('выбор источников помещается на узком экране во всех темах', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const accounts = initialAccounts.map(a => a.id === 'other'
    ? { ...a, name: 'Длинное название запасного счёта для крупных покупок' } : a);
  await openApp(page, { accounts });
  await page.locator('.tabs .plus').click();
  await chooseAccount(page, 'trip');
  await page.fill('#f_amt', '100');
  await funding(page).getByRole('button', { name: 'Добрать с другого счёта' }).click();
  await expect(funding(page).locator('#f_sources')).toBeVisible();
  const layouts = await page.evaluate(() => {
    const root = document.documentElement;
    const panel = document.querySelector('#f_funding');
    root.classList.add('cheer', 'bigtext');
    return window.fundingTest.themes().map(theme => {
      root.dataset.pet = theme;
      const bounds = panel.getBoundingClientRect();
      return { theme, visible: bounds.width > 0, fits: panel.scrollWidth <= panel.clientWidth && bounds.right <= innerWidth };
    });
  });
  expect(layouts.length).toBeGreaterThan(1);
  for (const { theme, visible, fits } of layouts) expect(visible && fits, theme).toBe(true);
});
