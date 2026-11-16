// Основные сценарии считалОчки. Запуск: npm test
const { test, expect } = require('@playwright/test');

// чистый старт + пройденный онбординг: на карте 20 000, план 1 500 в день
async function start(page, errs) {
  if (errs) {
    page.on('pageerror', e => errs.push(String(e)));
  }
  await page.goto('/index.html');
  await page.click('[data-a=onbNext]');
  await page.fill('#ob_bal', '20000');
  await page.click('[data-a=onbNext]');
  await page.fill('#ob_lim', '1500');
  await page.click('[data-a=onbNext]');
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
  await expect(page.locator('#ob_mon')).toBeVisible();
  await page.click('[data-a=onbSkip]');
  await expect(page.locator('#ov .sheet')).toBeHidden();
  await expect(page.getByText('Это примеры')).toBeVisible();
});

test('онбординг: баланс и план попадают на главную, примеров нет', async ({ page }) => {
  await start(page);
  expect(await heroNumber(page)).toBe(20000);
  await expect(page.getByText('Это примеры')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#ob_mon')).toHaveCount(0); // второй раз не показывается
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

test('знакомство с монстриком: реагирует на ввод, выбранный монстрик и имя сохраняются', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('/index.html');
  await expect(page.locator('#ob_mon .onbpic svg')).toBeVisible();
  await page.click('[data-a=onbNext]');
  await page.fill('#ob_bal', '10000');
  await expect(page.locator('#ob_mon .bub')).toContainText('10');
  await page.click('[data-a=onbNext]');
  await expect(page.locator('#ob_btns [data-a=onbNext]')).toHaveText('Пропустить');
  await page.fill('#ob_lim', '1000');
  await expect(page.locator('#ob_mon .bub')).toContainText('10 дней');
  await page.click('[data-a=onbNext]');
  await page.click('[data-a=onbPet][data-v=cat]');
  await expect(page.locator('#ob_mon .bub')).toContainText('Котик');
  await page.fill('#ob_name', 'Барсик');
  await page.click('[data-a=onbGo]');
  await expect(page.locator('.card.monster')).toContainText('Барсик');
  await expect(page.locator('html')).toHaveAttribute('data-pet', 'cat');
  await page.reload();
  await expect(page.locator('.card.monster')).toContainText('Барсик');
  expect(errs).toEqual([]);
});

const patch = (page, o) => page.evaluate(o => { const d = JSON.parse(localStorage.getItem('podkopka-v1')); Object.assign(d, o); localStorage.setItem('podkopka-v1', JSON.stringify(d)); }, o);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('podkopka-v1')));

test('монстрик через пару дней спрашивает имя, "Не скажу" больше не спрашивает', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 10, 16, 13, 0)); // днём: ночью (0-7) монстрик спит и имя не спрашивает
  await start(page);
  await addExpense(page, 300, 'Кофе');
  await expect(page.locator('#un_in')).toHaveCount(0); // сразу после знакомства не спрашивает
  await patch(page, { onbAt: '2020-01-01' }); // прошло больше двух дней
  await page.reload();
  await expect(page.locator('#un_in')).toBeVisible();
  await page.fill('#un_in', 'Софа');
  await page.click('[data-a=unameOk]');
  await expect(page.locator('#un_in')).toHaveCount(0);
  expect((await stored(page)).uname).toBe('Софа');
  await patch(page, { uname: '', unameAsked: 0 });
  await page.reload();
  await page.click('[data-a=unameNo]');
  await page.reload();
  await expect(page.locator('#un_in')).toHaveCount(0);
});

test('подсказки: монстрик говорит про мелочи, "Не интересно" выключает', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await start(page);
  // 3 недели мелких трат по 200 ₽, в этом месяце 12 штук; сегодня записей нет; 12:00 - день подсказок выбираем перебором
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const t = new Date(); const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    d.entries = d.entries.filter(e => e.date !== iso(t));
    for (let i = 1; i <= 25; i++) { const x = new Date(t); x.setDate(t.getDate() - i); d.entries.push({ id: 'k' + i, type: 'e', amt: 200, cat: 'cafe', note: 'Кофе', date: iso(x), acc: '' }); }
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  const types = await page.evaluate(() => window.tipsNow().map(t => t.t));
  expect(types).toContain('small'); // 12+ покупок до 300 ₽
  expect(types).not.toContain('sub'); // кофе каждый день - не подписка
  const bub = page.locator('.card.monster [data-a=tipOff]');
  if (await bub.count()) {
    await bub.click();
    await expect(page.locator('.card.monster [data-a=tipOff]')).toHaveCount(0);
  }
  await page.click('[data-a=tab][data-v=an]');
  await expect(page.locator('text=Разбор месяца')).toBeVisible();
  expect(errs).toEqual([]);
});

test('один чек раскладывается по категориям, суммы с плюсом складываются', async ({ page }) => {
  await start(page);
  await page.click('.tabs .plus');
  await page.fill('#f_amt', '2000+601');
  await expect(page.locator('#f_amtsum')).toContainText('2 601');
  await page.fill('#f_note', 'Заказ продукты');
  await page.click('[data-a=partsOn]');
  await page.fill('#pa0', '400');
  await page.click('[data-a=amtPlus][data-v=pa0]');
  await page.locator('#pa0').pressSequentially('250');
  await expect(page.locator('#f_prest')).toContainText('1 951');
  await page.locator('#fm button[type=submit]').click();
  const es = await page.evaluate(() => JSON.parse(localStorage.getItem('podkopka-v1')).entries.filter(e => !e.demo && e.type === 'e').map(e => e.cat + ':' + e.amt).sort());
  expect(es).toEqual(['home:650', 'prod:1951']);
});

test('возврат за весь чек делится по разложенным частям пропорционально', async ({ page }) => {
  await start(page);
  // трата 5201 и возврат 2600, привязанный к ней
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const t = new Date(); const iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    d.entries.push({ id: 'big', type: 'e', amt: 5201, cat: 'prod', note: 'Заказ', date: iso, acc: d.accounts[0].id });
    d.entries.push({ id: 'ref', type: 'i', amt: 2600, cat: 'refund', note: 'Вернули половину', date: iso, acc: d.accounts[0].id, for: 'big' });
    localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  await page.click('.tabs [data-a=tab][data-v=hist]');
  await page.click('[data-a=edit][data-id=big]');
  await page.click('[data-a=partsOn]');
  await page.fill('#pa0', '650');
  await page.locator('#fm button[type=submit]').click();
  const es = await page.evaluate(() => JSON.parse(localStorage.getItem('podkopka-v1')).entries.filter(e => e.type === 'e' && e.grp).map(e => e.cat + ':' + e.amt).sort());
  expect(es).toEqual(['home:650', 'prod:4551']);
  // в истории у «Дома» видна доля возврата 325 ₽
  await expect(page.locator('text=доля возврата 325')).toBeVisible();
});
