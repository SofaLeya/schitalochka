/**
 * UI regressions: «Пришло» writes actual cash date; legacy incomes without source stay safe.
 */
const {test, expect} = require('@playwright/test');

test.beforeEach(async ({page}) => {
  await page.route(u => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname), r => r.abort());
});

async function start(page, errs){
  if(errs) page.on('pageerror', e => errs.push(String(e)));
  await page.goto('/index.html');
  await page.click('[data-a=onbNext]');
  await page.fill('#ob_bal', '20000');
  await page.click('[data-a=onbNext]');
  await page.fill('#ob_lim', '1500');
  await page.click('[data-a=onbNext]');
  await page.click('[data-a=onbGo]');
  await expect(page.locator('.hero .big')).toContainText('20');
}

const patch = (page, o) => page.evaluate(o => {
  const d = JSON.parse(localStorage.getItem('podkopka-v1'));
  Object.assign(d, o);
  localStorage.setItem('podkopka-v1', JSON.stringify(d));
}, o);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('podkopka-v1')));

async function markPrishlo(page, name, amt){
  await page.click('[data-a=tab][data-v=plan]');
  // Current-month «Пришло» has no data-v; overdue previous-month rows set data-v=YYYY-MM.
  const btn = page.locator('.row', {hasText: name}).locator('[data-a=toggle][data-k=i]:not([data-v])').first();
  await expect(btn).toBeVisible();
  await btn.click();
  const dlg = page.locator('.dlg');
  await expect(dlg).toBeVisible();
  await dlg.locator('input').fill(String(amt != null ? amt : 50000));
  await dlg.locator('button.yes').click();
  await expect(dlg).toHaveCount(0);
}

test('UI: Пришло writes today as cash date, not scheduled payday', async ({page}) => {
  const errs = [];
  await page.clock.setFixedTime(new Date(2026, 11, 28, 13, 0)); // 2026-12-28
  await start(page, errs);
  await patch(page, {
    simple: false,
    planFrom: '2026-01-01',
    accounts: [{id: 'a1', name: 'Основная карта', type: 'main', start: 20000}],
    incomes: [{id: 'sal', name: 'Зарплата', amt: 50000, day: 10}],
    rules: [],
    recur: [],
    entries: [],
    unameAsked: 1
  });
  await page.reload();
  // Dec 10 2026 is Thursday (workday) — scheduled stays 2026-12-10
  const scheduled = '2026-12-10';
  await markPrishlo(page, 'Зарплата');
  const st = await stored(page);
  const got = st.entries.find(e => e.type === 'i' && e.note === 'Зарплата');
  expect(got).toBeTruthy();
  expect(got.date).toBe('2026-12-28');
  expect(got.date).not.toBe(scheduled);
  expect(got.payYm).toBe('2026-12');
  expect(got.amt).toBe(50000);
  expect(errs).toEqual([]);
});

test('UI: Пришло on holiday-shifted payday still uses today, keeps payYm', async ({page}) => {
  const errs = [];
  await page.clock.setFixedTime(new Date(2026, 11, 28, 13, 0));
  await start(page, errs);
  await patch(page, {
    simple: false,
    planFrom: '2026-01-01',
    accounts: [{id: 'a1', name: 'Основная карта', type: 'main', start: 20000}],
    incomes: [{id: 'sal', name: 'Январская', amt: 50000, day: 1}],
    rules: [],
    recur: [],
    entries: [],
    unameAsked: 1
  });
  await page.reload();
  // Jan 1 2027 holiday → scheduled 2026-12-30 (look-ahead row; Dec-1 same name also exists)
  const scheduled = '2026-12-30';
  await page.click('[data-a=tab][data-v=plan]');
  const btn = page.locator('.row', {hasText: 'Январская'}).filter({hasText: /перенос|30/}).locator('[data-a=toggle][data-k=i]:not([data-v])').first();
  await expect(btn).toBeVisible();
  await btn.click();
  const dlg = page.locator('.dlg');
  await expect(dlg).toBeVisible();
  await dlg.locator('input').fill('50000');
  await dlg.locator('button.yes').click();
  await expect(dlg).toHaveCount(0);
  const st = await stored(page);
  const got = st.entries.filter(e => e.type === 'i' && /Январская/.test(e.note || '')).pop();
  expect(got).toBeTruthy();
  expect(got.date).toBe('2026-12-28');
  expect(got.date).not.toBe(scheduled);
  expect(got.payYm).toBe('2027-01');
  expect(errs).toEqual([]);
});

test('UI: legacy income without source marks Пришло without errors', async ({page}) => {
  const errs = [];
  await page.clock.setFixedTime(new Date(2026, 10, 25, 13, 0)); // 2026-11-25
  await start(page, errs);
  await patch(page, {
    simple: false,
    planFrom: '2026-01-01',
    accounts: [{id: 'a1', name: 'Основная карта', type: 'main', start: 20000}],
    // Old format: day + amt only, no source
    incomes: [{id: 'legacy', name: 'Аванс', amt: 30000, day: 25}],
    rules: [],
    recur: [],
    entries: [],
    unameAsked: 1
  });
  await page.reload();
  const hasSource = (await stored(page)).incomes.some(r => r.id === 'legacy' && r.source);
  expect(hasSource).toBe(false);
  await markPrishlo(page, 'Аванс', 30000);
  const st = await stored(page);
  const got = st.entries.find(e => e.type === 'i' && e.note === 'Аванс');
  expect(got).toBeTruthy();
  expect(got.date).toBe('2026-11-25');
  expect(got.payYm).toBe('2026-11');
  expect(got.cat).toBe('salary');
  expect(errs).toEqual([]);
});
