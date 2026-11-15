// Основные сценарии считалОчки. Запуск: npm test
const { test, expect } = require('@playwright/test');

// чистый старт + пройденный онбординг: на карте 20 000, план 1 500 в день
async function start(page, errs) {
  if (errs) {
    page.on('pageerror', e => errs.push(String(e)));
  }
  await page.goto('/index.html');
  await page.fill('#ob_bal', '20000');
  await page.fill('#ob_lim', '1500');
  await page.click('[data-a=onbGo]');
  await expect(page.locator('.hero .big')).toContainText('20');
}

async function addExpense(page, amount, note) {
  await page.click('.tabs .plus');
  await page.fill('#f_amt', String(amount));
  await page.fill('#f_note', note);
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toBeHidden();
}

const heroNumber = async page => parseInt((await page.locator('.hero .big').innerText()).replace(/\D/g, ''), 10);

test('приложение открывается без ошибок в консоли', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('/index.html');
  await expect(page.locator('h1')).toContainText('считалОчка');
  expect(errs).toEqual([]);
});

test('новичок видит онбординг, примеры можно пропустить', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('#ob_bal')).toBeVisible();
  await page.click('[data-a=onbSkip]');
  await expect(page.locator('#ov .sheet')).toBeHidden();
  await expect(page.getByText('Это примеры')).toBeVisible();
});

test('онбординг: баланс и план попадают на главную, примеров нет', async ({ page }) => {
  await start(page);
  expect(await heroNumber(page)).toBe(20000);
  await expect(page.getByText('Это примеры')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#ob_bal')).toHaveCount(0); // второй раз не показывается
  expect(await heroNumber(page)).toBe(20000);
});

test('трата вычитается из свободных денег и видна в истории', async ({ page }) => {
  await start(page);
  await addExpense(page, 450, 'Кофе и круассан');
  expect(await heroNumber(page)).toBe(19550);
  await page.locator('#tabs >> text=История').click();
  await expect(page.getByText('Кофе и круассан')).toBeVisible();
});

test('удаление траты можно отменить', async ({ page }) => {
  await start(page);
  await addExpense(page, 300, 'Пятёрочка');
  expect(await heroNumber(page)).toBe(19700);
  await page.locator('#tabs >> text=История').click();
  await page.getByText('Пятёрочка').first().click();
  await page.click('[data-a=askDel]');        // "Удалить запись"
  await page.click('[data-a=delEntry]');      // "Точно удалить"
  await page.locator('#tabs >> text=Кошелёк').click();
  expect(await heroNumber(page)).toBe(20000);
  await page.locator('#toast button', { hasText: 'Отменить' }).click();
  expect(await heroNumber(page)).toBe(19700);
});

test('данные переживают перезагрузку', async ({ page }) => {
  await start(page);
  await addExpense(page, 120, 'Кофе и круассан');
  await page.reload();
  expect(await heroNumber(page)).toBe(19880);
});

test('карандашик открывает правку остатка', async ({ page }) => {
  await start(page);
  await page.click('.penb');
  await expect(page.locator('#ov .sheet')).toBeVisible();
});

test('режимы простой и полный переключаются, вкладки открываются без ошибок', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.click('[data-a=setMode][data-v=full]');
  await expect(page.locator('.stat.main')).toBeVisible();
  for (const t of ['История', 'Анализ', 'Платежи', 'Кошелёк']) {
    await page.locator('#tabs >> text=' + t).click();
  }
  await page.click('[data-a=setMode][data-v=simple]');
  for (const t of ['История', 'Анализ', 'Кошелёк']) {
    await page.locator('#tabs >> text=' + t).click();
  }
  expect(errs).toEqual([]);
});

test('монстрика можно убрать и вернуть', async ({ page }) => {
  await start(page);
  await expect(page.locator('.card.monster')).toBeVisible();
  await page.click('[data-a=petPick]');
  await page.click('[data-a=petHide]');
  await expect(page.locator('.card.monster')).toHaveCount(0);
  await page.click('[data-a=petShow]');
  await expect(page.locator('.card.monster')).toBeVisible();
});

test('настройки открываются, крупный текст включается', async ({ page }) => {
  await start(page);
  await page.click('[data-a=settings]');
  await expect(page.getByText('Настройки').first()).toBeVisible();
  await page.click('[data-a=optBig]');
  await expect(page.locator('html')).toHaveClass(/bigtext/);
});

test('нет копилок и долгов - одна компактная карточка', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('heading', { name: 'Копилки и долги' })).toBeVisible();
});
