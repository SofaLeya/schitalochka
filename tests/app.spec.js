// Основные сценарии считалОчки. Запуск: npm test
const { test, expect } = require('@playwright/test');
// внешний интернет в тестах не нужен: без этого запросы курсов/GitHub висят до таймаута и тесты тормозят.
// Тесты, которым нужен ответ (курсы, Google Диск), ставят свой page.route позже - он важнее.
test.beforeEach(async ({ page }) => { await page.route(u => !/^(localhost|127\.0\.0\.1)$/.test(u.hostname), r => r.abort()); });

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
  await page.click('[data-a=amtMore]'); await page.click('[data-a=partsOn]');
  await page.fill('#pa0', '400');
  await page.click('[data-a=amtPlus][data-v=pa0]');
  await page.locator('#pa0').pressSequentially('250');
  await expect(page.locator('#f_prest')).toContainText('1 951');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toBeHidden();
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
  await page.click('[data-a=amtMore]'); await page.click('[data-a=partsOn]');
  await page.fill('#pa0', '650');
  await page.locator('#fm button[type=submit]').click();
  const es = await page.evaluate(() => JSON.parse(localStorage.getItem('podkopka-v1')).entries.filter(e => e.type === 'e' && e.grp).map(e => e.cat + ':' + e.amt).sort());
  expect(es).toEqual(['home:650', 'prod:4551']);
  // в истории у «Дома» видна доля возврата 325 ₽
  await expect(page.locator('text=доля возврата 325')).toBeVisible();
});

test('окно не прыгает наверх, когда добавляешь строку в разложение', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await start(page);
  await page.click('.tabs .plus');
  await page.fill('#f_amt', '5201');
  await page.click('[data-a=amtMore]'); await page.click('[data-a=partsOn]');
  await page.fill('#pa0', '892');
  const sh = page.locator('#ov .sheet');
  await sh.evaluate(e => { e.scrollTop = e.scrollHeight; });
  const before = await sh.evaluate(e => e.scrollTop);
  expect(before).toBeGreaterThan(50);
  await page.click('[data-a=partAdd]');
  const after = await page.locator('#ov .sheet').evaluate(e => e.scrollTop);
  expect(Math.abs(after - before)).toBeLessThan(120);
  await expect(page.locator('[data-pc="1"]')).toHaveValue('home'); // новая строка - в ту же категорию
});

test('разложенный чек помечен и показывает свои части', async ({ page }) => {
  await start(page);
  await page.click('.tabs .plus');
  await page.fill('#f_amt', '1000');
  await page.fill('#f_note', 'Заказ продукты');
  await page.click('[data-a=amtMore]'); await page.click('[data-a=partsOn]');
  await page.fill('#pa0', '300');
  await expect(page.locator('#f_prest')).toContainText('700');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toBeHidden();
  await page.click('.tabs [data-a=tab][data-v=hist]');
  await expect(page.locator('text=часть чека 1 000').first()).toBeVisible();
  await page.locator('.row:has-text("Продукты")').first().click();
  await expect(page.locator('text=Чек на 1 000 ₽ разложен')).toBeVisible();
});

test('меню монстрика: 4 вкладки, на 1-м уровне цветок открыт, имя и цвета сохраняются', async ({ page }) => {
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await start(page);
  await page.click('[data-a=petPick]');
  await expect(page.locator('.ptabs button')).toHaveText(['Монстрик', 'Наряд', 'Фон', 'Цвета']);
  await page.fill('#pu_name', 'Софа');
  await page.click('[data-a=petTab][data-v=outfit]');
  await expect(page.locator('[data-a=petAcc][data-v=flower] .lkb')).toHaveCount(0);
  await page.click('[data-a=petTab][data-v=col]');
  await page.click('[data-a=petTheme][data-v=puff]');
  await page.locator('#fm button[type=submit]').click();
  const d = await page.evaluate(() => JSON.parse(localStorage.getItem('podkopka-v1')));
  expect(d.uname).toBe('Софа');
  expect(d.pet.theme).toBe('puff');
  expect(errs).toEqual([]);
});

const optVal = (page, sel, txt) => page.$eval(sel, (e, t) => [...e.options].find(o => o.text.includes(t)).value, txt);

test('валюта: можно выбрать основную, значок меняется везде', async ({ page }) => {
  const errs = [];
  await page.route(/currency-api/, r => r.fulfill({contentType:'application/json',body:JSON.stringify({date:'2026-11-16',gel:{rub:30},rub:{gel:1/30}})}));
  await start(page, errs);
  await page.click('[data-a=settings]');
  await page.click('[data-a=curOpen]');
  await page.selectOption('#s_cur', 'GEL');
  await page.click('#ov [data-a=close]');
  await expect(page.locator('.hero .big')).toContainText('₾');
  await page.click('.tabs .plus');
  await page.fill('#f_amt','15.5');
  await page.fill('#f_note','Пятёрочка');
  await expect(page.locator('#f_amt')).toHaveValue('15.5');
  await expect(page.locator('#f_cat')).not.toHaveValue('');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toBeHidden();
  await page.click('.tabs [data-a=tab][data-v=hist]');
  await expect(page.locator('text=15,50 ₾').first()).toBeVisible();
  expect(errs).toEqual([]);
});

test('валюта: счёт в другой валюте, трата с него и обмен по курсу', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  // карта в лари, свой курс 30 ₽ за 1 ₾
  await page.click('.hero .penb');
  await page.click('#ov [data-a=newCard]');
  await page.fill('#a_name', 'Карта в лари');
  await page.selectOption('#a_cur', 'GEL');
  await page.uncheck('#a_live');
  await page.fill('#a_start', '100');
  await page.locator('#fm button[type=submit]').click();
  await page.click('[data-a=settings]');
  await page.click('[data-a=curOpen]');
  await page.fill('#mr_GEL', '30');
  await page.click('[data-a=curSave]');
  const row = page.locator('.row[data-a=editAcc]:has-text("Карта в лари")');
  await expect(row).toContainText('100 ₾');
  await expect(row).toContainText('≈ 3 000 ₽');
  // трата 10 ₾ с этой карты
  await page.click('.tabs .plus');
  await page.fill('#f_amt', '10');
  await page.fill('#f_note', 'Пятёрочка Тбилиси');
  await page.locator('#f_more summary').click();
  await page.selectOption('#f_acc', await optVal(page, '#f_acc', 'Карта в лари'));
  await expect(page.locator('#f_fx')).toContainText('≈ 300 ₽');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toBeHidden();
  await expect(row).toContainText('90 ₾');
  expect(await heroNumber(page)).toBe(20000);
  // обмен: 3 000 ₽ со свободных денег -> пришло 95 ₾
  await page.click('.tabs .plus');
  await page.click('#ov [data-a=stype][data-v=t]');
  await page.selectOption('#f_to', await optVal(page, '#f_to', 'Карта в лари'));
  await page.fill('#f_amt', '3000');
  await page.fill('#f_amt2', '95');
  await expect(page.locator('#f_amt')).toHaveValue('3000');
  await expect(page.locator('#f_amt2')).toHaveValue('95');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toBeHidden();
  await expect(row).toContainText('185 ₾');
  expect(await heroNumber(page)).toBe(17000);
  await page.click('.tabs [data-a=tab][data-v=hist]');
  await expect(page.locator('.row:has-text("Пятёрочка Тбилиси")')).toContainText('10 ₾');
  expect(errs).toEqual([]);
});

test('валюта: курс подтягивается из интернета', async ({ page }) => {
  await page.route(/currency-api/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ date: '2026-11-16', rub: { gel: 0.025 } }) }));
  await start(page);
  await page.click('.hero .penb');
  await page.click('#ov [data-a=newCard]');
  await page.fill('#a_name', 'Лари');
  await page.selectOption('#a_cur', 'GEL');
  await page.fill('#a_start', '10');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('.hero .hcard:has-text("Лари")')).toContainText('10 ₾');
  await expect.poll(() => heroNumber(page)).toBe(20400);
  await page.click('[data-a=settings]');
  await page.click('[data-a=curOpen]');
  await expect(page.locator('#ov')).toContainText('курс из интернета');
});

test('валюта: трата в евро с рублёвой карты, с суммой списания по банку', async ({ page }) => {
  const errs = [];
  await page.route(/currency-api/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ date: '2026-11-16', rub: { eur: 0.01 } }) }));
  await start(page, errs);
  await page.click('.tabs .plus');
  await page.fill('#f_amt', '20');
  await page.click('[data-a=curShow]').catch(() => {}); await page.selectOption('#f_cur', 'EUR');
  await expect(page.locator('#f_fx')).toContainText('≈ 2 000 ₽');
  await page.fill('#f_note', 'Пятёрочка Рим');
  await page.fill('#f_chg', '2100');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toBeHidden();
  expect(await heroNumber(page)).toBe(17900);
  // без суммы списания - по курсу
  await page.click('.tabs .plus');
  await page.fill('#f_amt', '5');
  await page.click('[data-a=curShow]').catch(() => {}); await page.selectOption('#f_cur', 'EUR');
  await page.fill('#f_note', 'Пятёрочка кофе');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toBeHidden();
  expect(await heroNumber(page)).toBe(17400);
  await page.click('.tabs [data-a=tab][data-v=hist]');
  const r = page.locator('.row:has-text("Пятёрочка Рим")');
  await expect(r).toContainText('20 €');
  await expect(r).toContainText('≈ 2 100 ₽');
  // правка сохраняет валюту и сумму списания
  await r.click();
  await expect(page.locator('#f_cur')).toHaveValue('EUR');
  await expect(page.locator('#f_chg')).toHaveValue('2100');
  expect(errs).toEqual([]);
});

// поддельный Google Диск в памяти: хватает для проверки синхронизации
function fakeDrive() {
  const files = {}; let n = 0;
  const handler = async route => {
    const req = route.request(), url = new URL(req.url()), m = req.method();
    const json = o => route.fulfill({ contentType: 'application/json', body: JSON.stringify(o) });
    const id = (url.pathname.match(/files\/([^/]+)/) || [])[1];
    if (m === 'GET' && !id) {
      const q = url.searchParams.get('q') || '';
      let list = Object.values(files).filter(f => !f.trashed);
      const nm = q.match(/name='([^']*)'/), par = q.match(/'([^']*)' in parents/), cont = q.match(/name contains '([^']*)'/);
      if (nm) list = list.filter(f => f.name === nm[1]);
      if (cont) list = list.filter(f => f.name.includes(cont[1]));
      if (par) list = list.filter(f => (f.parents || []).includes(par[1]));
      if (q.includes('folder')) list = list.filter(f => f.folder);
      return json({ files: list.map(f => ({ id: f.id, name: f.name, version: String(f.version), modifiedTime: 't' + f.version })) });
    }
    if (m === 'GET' && id) return route.fulfill({ contentType: 'application/json', body: files[id].body });
    if (m === 'POST' && url.pathname.endsWith('/copy')) { const b = JSON.parse(req.postData()); const f = { id: 'f' + (++n), name: b.name, parents: b.parents, body: files[id].body, version: 1 }; files[f.id] = f; return json({ id: f.id }); }
    if (m === 'POST' && url.pathname.includes('/upload/')) {
      const pd = req.postData(); const parts = pd.split(/--sch\d+/);
      const meta = JSON.parse(parts[1].split('\r\n\r\n')[1]); const body = parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      const f = { id: 'f' + (++n), name: meta.name, parents: meta.parents, body, version: 1 }; files[f.id] = f; return json({ id: f.id });
    }
    if (m === 'POST') { const b = JSON.parse(req.postData()); const f = { id: 'f' + (++n), name: b.name, folder: true, version: 1 }; files[f.id] = f; return json({ id: f.id }); }
    if (m === 'PATCH') { files[id].body = req.postData(); files[id].version++; return json({ id }); }
    if (m === 'DELETE') { delete files[id]; return route.fulfill({ status: 204, body: '' }); }
    return route.fulfill({ status: 400, body: '' });
  };
  return { files, handler };
}

test('Google Диск: данные уходят в облако и приходят на второе устройство', async ({ browser }) => {
  const drive = fakeDrive();
  const conn = JSON.stringify({ tok: 'x', exp: Date.now() + 3600e3, prov: 'gd', dev: 'A' });
  const a = await (await browser.newContext()).newPage();
  await a.route(/googleapis\.com/, drive.handler);
  await start(a);
  await a.evaluate(c => { localStorage.setItem('yd-sync', c) }, conn);
  await a.reload();
  await addExpense(a, 500, 'Пятёрочка');
  await expect.poll(() => Object.values(drive.files).some(f => f.name === 'schitalochka.json' && f.body.includes('Пятёрочка')), { timeout: 20000 }).toBe(true);
  const b = await (await browser.newContext()).newPage();
  await b.route(/googleapis\.com/, drive.handler);
  await b.goto('/index.html');
  await b.evaluate(c => { localStorage.setItem('yd-sync', c.replace('"A"', '"B"')) }, conn);
  await b.reload();
  await expect.poll(async () => (await b.locator('.hero .big').innerText()).replace(/\D/g, ''), { timeout: 20000 }).toBe('19500');
  await expect(b.locator('#syncbtn')).toContainText('Диск');
});

test('карты: вторая карта в долларах «на жизнь» входит в свободные деньги', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.click('.hero .penb');
  await page.click('#ov [data-a=newCard]');
  await page.fill('#a_name', 'Долларовая');
  await page.selectOption('#a_cur', 'USD');
  await expect(page.locator('#a_live')).toBeChecked();
  await page.fill('#a_start', '50');
  await page.locator('#fm button[type=submit]').click();
  await page.click('[data-a=settings]');
  await page.click('[data-a=curOpen]');
  await page.fill('#mr_USD', '100');
  await page.click('[data-a=curSave]');
  await expect.poll(() => heroNumber(page)).toBe(25000);
  // трата с долларовой карты: выбор карты виден сразу, без «Ещё»
  await page.click('.tabs .plus');
  await page.fill('#f_amt', '10');
  await page.fill('#f_note', 'Пятёрочка');
  await expect(page.locator('#f_acc')).toBeVisible();
  await page.selectOption('#f_acc', await optVal(page, '#f_acc', 'Долларовая'));
  await expect(page.locator('#f_fx')).toContainText('≈ 1 000 ₽');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toBeHidden();
  await expect.poll(() => heroNumber(page)).toBe(24000);
  await expect(page.locator('.hero .hcard:has-text("Долларовая")')).toContainText('40 $');
  expect(errs).toEqual([]);
});

async function importTable(page, name, text) {
  await page.click('[data-a=settings]');
  await page.locator('#ov summary', { hasText: 'Загрузить данные' }).click();
  await page.locator('#ov summary', { hasText: 'Траты из таблицы' }).click();
  await page.setInputFiles('#s_xl', { name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') });
  await expect(page.locator('#ov h3')).toContainText('Траты из таблицы');
}
const storedE = page => stored(page).then(o => o.entries.filter(e => !e.demo));

test('таблица: американская выписка в долларах (даты месяц/день, минус - расход)', async ({ page }) => {
  const errs = [];
  await page.route(/currency-api/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ date: '2026-11-16', rub: { usd: 0.01 } }) }));
  await start(page, errs);
  await importTable(page, 'chase.csv', 'Posting Date,Description,Amount,Type,Balance\n11/14/2026,STARBUCKS,-4.50,DEBIT,995.50\n11/13/2026,PAYROLL,"1,500.00",CREDIT,1000.00\n10/20/2026,WHOLE FOODS,-23.10,DEBIT,500\n');
  await expect(page.locator('#xm_ccy')).toHaveValue('RUB');
  await page.selectOption('#xm_ccy', 'USD');
  await expect(page.locator('#ov')).toContainText('месяц/день/год');
  await page.click('[data-a=xlNext]');
  await page.click('[data-a=bkAdd]');
  await expect(page.locator('#ov .sheet')).toBeHidden();
  const es = await storedE(page);
  const sb = es.find(e => /starbucks/i.test(e.note));
  expect(sb).toMatchObject({ type: 'e', date: '2026-11-14', amt: 450, oc: 'USD', oa: 4.5 });
  expect(es.find(e => /payroll/i.test(e.note))).toMatchObject({ type: 'i', date: '2026-11-13', oa: 1500 });
  expect(es.find(e => /whole foods/i.test(e.note)).date).toBe('2026-10-20');
  expect(errs).toEqual([]);
});

test('таблица: расход и приход в разных столбцах, запятая в дробях, валюта в сумме', async ({ page }) => {
  const errs = [];
  await page.route(/currency-api/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ date: '2026-11-16', rub: { gel: 0.04 } }) }));
  await start(page, errs);
  await importTable(page, 'bog.csv', 'Date;Details;Debit;Credit;Balance\n16.11.2026;Carrefour;12,50 GEL;;100,00\n15.11.2026;Transfer in;;200,00 GEL;112,50\n');
  await expect(page.locator('#xm_ccy')).toHaveValue('GEL');
  await page.click('[data-a=xlNext]');
  await page.click('[data-a=bkAdd]');
  await expect(page.locator('#ov .sheet')).toBeHidden();
  const es = await storedE(page);
  expect(es.find(e => e.note === 'Carrefour')).toMatchObject({ type: 'e', amt: 312.5, oc: 'GEL', oa: 12.5 });
  expect(es.find(e => e.note === 'Transfer in')).toMatchObject({ type: 'i', oa: 200 });
  expect(errs).toEqual([]);
});

test('долги: вид долга - кредитка, кредит, займ, долг человеку', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.click('[data-a=newDebt]');
  await page.fill('#a_name', 'Маме');
  await page.selectOption('#a_dk', 'person');
  await page.fill('#a_start', '5000');
  await page.locator('#fm button[type=submit]').click();
  const r = page.locator('.row[data-a=editAcc]:has-text("Маме")');
  await expect(r).toContainText('Долг человеку');
  await expect(r).toContainText('🤝');
  await r.click();
  await expect(page.locator('#a_dk')).toHaveValue('person');
  await page.selectOption('#a_dk', 'card');
  await page.locator('#fm button[type=submit]').click();
  await expect(r).toContainText('Кредитка');
  expect(errs).toEqual([]);
});

test('раскладка с условием: после цели копилки деньги идут на долг, у долга есть дата закрытия', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  // полный режим, копилка с целью почти набрана и долг
  await patch(page, {
    simple: false,
    accounts: [{ id: 'a1', name: 'Основная карта', type: 'main', start: 20000 },
      { id: 'pk', name: 'Подкопка', type: 'save', start: 175000, goal: 180000 },
      { id: 'dv', name: 'Вадиму', type: 'debt', start: -30000, dk: 'person' }],
    rules: [
      { id: 'r1', name: 'Подкопка', amt: 10000, day: 10, acc: 'pk', stop: 1 },
      { id: 'r2', name: 'Долг: Вадиму', amt: 15000, day: 10, acc: 'dv', after: 'pk' }],
  });
  await page.reload();
  const d = await page.evaluate(() => window.ruleDbg());
  expect(d.on).toEqual([true, false]);
  expect(d.cap).toEqual([5000, 0]); // до цели осталось 5 000 - больше не кладём
  // месяц 0: 5 000 добирают подкопку, долг ждёт (начнёт со следующей выплаты); дальше по 15 000, 30 000 - за 2 месяца
  expect(d.sim).toEqual([{ r1: 5000 }, { r2: 15000 }, { r2: 15000 }, {}]);
  expect(d.eta[0]).toMatch(/^\d{4}-\d{2}$/);
  // в карточке долга видна дата закрытия
  const r = page.locator(".row[data-a=editAcc][data-id=dv]");
  await expect(r).toContainText('закроется в');
  // окно долга: план погашения и кнопка добавить платёж
  await r.click();
  await expect(page.locator('#ov .sheet')).toContainText('План погашения');
  await expect(page.locator('#ov .sheet')).toContainText('после цели «Подкопка»');
  await page.click('[data-a=newDebtRule]');
  await expect(page.locator('#u_name')).toHaveValue('Долг: Вадиму');
  // в правиле для долга: нет галочки «Остановить» и нет пункта «когда закрыт долг Вадиму»
  await expect(page.locator('#u_stop')).toHaveCount(0);
  await expect(page.locator('#u_after option')).toHaveText(['сразу', 'когда набрана цель «Подкопка»']);
  // переключили на копилку с целью: галочка появилась, введённая сумма не пропала
  await page.fill('#u_amt', '1234');
  await page.selectOption('#u_acc', 'pk');
  await expect(page.locator('#u_stop')).toHaveCount(1);
  await expect(page.locator('#u_after option')).toHaveText(['сразу', 'когда закрыт долг «Вадиму»']);
  await expect(page.locator('#u_amt')).toHaveValue('1234');
  await page.selectOption('#u_acc', 'dv');
  await page.fill('#u_amt', '1000');
  await page.fill('#u_day', '25');
  await page.locator('#fm button[type=submit]').click();
  expect((await stored(page)).rules.filter(x => x.acc === 'dv').length).toBe(2);
  // когда подкопка набрана - её правило останавливается, долговое включается
  const st = await stored(page);
  st.accounts.find(a => a.id === 'pk').start = 180000;
  await patch(page, { accounts: st.accounts });
  await page.reload();
  expect((await page.evaluate(() => window.ruleDbg())).on.slice(0, 2)).toEqual([false, true]);
  expect(errs).toEqual([]);
});

test('правило без условия работает как раньше, даже если цель набрана', async ({ page }) => {
  await start(page);
  await patch(page, {
    accounts: [{ id: 'a1', name: 'Основная карта', type: 'main', start: 20000 }, { id: 'ot', name: 'Отпуск', type: 'save', start: 5000, goal: 1000 }],
    rules: [{ id: 'x', name: 'Отпуск', amt: 5000, day: 10, acc: 'ot' }],
  });
  await page.reload();
  const d = await page.evaluate(() => window.ruleDbg());
  expect(d.on).toEqual([true]);
  expect(d.cap).toEqual([5000]);
  expect(d.sim[1]).toEqual({ x: 5000 });
});

test('«Куда дальше?»: одно окно настраивает переключение подкопки на долг и новую копилку', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await patch(page, {
    simple: false,
    accounts: [{ id: 'a1', name: 'Основная карта', type: 'main', start: 20000 },
      { id: 'pk', name: 'Подкопка', type: 'save', start: 175000, goal: 180000 },
      { id: 'dv', name: 'Вадиму', type: 'debt', start: -30000, dk: 'person' }],
    rules: [{ id: 'r1', name: 'Подкопка', amt: 10000, day: 10, acc: 'pk' }, { id: 'r2', name: 'Подкопка', amt: 10000, day: 25, acc: 'pk' }],
  });
  await page.reload();
  await page.locator('.row[data-a=editAcc]:has-text("Подкопка")').click();
  await page.click('[data-a=wiz]');
  await expect(page.locator('#ov .sheet')).toContainText('20 000');
  await expect(page.locator('#w_t0')).toHaveValue('dv'); // долг подставлен сам
  await page.fill('#w_a0', '15000');
  await page.click('[data-a=wizAdd]');
  await page.selectOption('#w_t1', '__new');
  await page.fill('#w_n1', 'Фонд');
  await page.fill('#w_a1', '5000');
  await expect(page.locator('#w_prev')).toContainText('закроется в');
  await expect(page.locator('#w_prev')).toContainText('Распределено всё');
  await page.locator('#fm button[type=submit]').click();
  const st = await stored(page);
  const fund = st.accounts.find(a => a.name === 'Фонд');
  expect(fund).toBeTruthy();
  const auto = st.rules.filter(r => r.auto === 'pk').map(r => `${r.acc === 'dv' ? 'dv' : 'fund'}:${r.day}:${r.amt}:${r.after}`).sort();
  expect(auto).toEqual(['dv:10:7500:pk', 'dv:25:7500:pk', 'fund:10:2500:pk', 'fund:25:2500:pk']);
  expect(st.rules.filter(r => r.acc === 'pk').every(r => r.stop === 1)).toBe(true);
  await expect(page.locator('.row[data-a=editAcc]:has-text("Подкопка")')).toContainText('потом → Вадиму');
  // повторное открытие показывает настроенное, «Готово» не плодит дубли
  await page.locator('.row[data-a=editAcc]:has-text("Подкопка")').click();
  await page.click('[data-a=wiz]');
  await expect(page.locator('#w_a0')).toHaveValue('15000');
  await page.locator('#fm button[type=submit]').click();
  expect((await stored(page)).rules.filter(r => r.auto === 'pk').length).toBe(4);
  expect(errs).toEqual([]);
});

test('«Куда дальше?» без правил: спрашивает сумму и делит на дни зарплаты', async ({ page }) => {
  await start(page);
  await patch(page, {
    simple: false,
    incomes: [{ id: 'i1', name: 'ЗП', amt: 50000, day: 10 }, { id: 'i2', name: 'Аванс', amt: 40000, day: 25 }, { id: 'i3', name: 'мелочь', amt: 1000, day: 5 }],
    accounts: [{ id: 'a1', name: 'Основная карта', type: 'main', start: 20000 },
      { id: 'ot', name: 'Отпуск', type: 'save', start: 0, goal: 60000 },
      { id: 'mm', name: 'Маме', type: 'debt', start: -10000 }],
    rules: [],
  });
  await page.reload();
  await page.locator('.row[data-a=editAcc]:has-text("Отпуск")').click();
  await page.click('[data-a=wiz]');
  await page.fill('#w_mo', '6000');
  await page.fill('#w_a0', '6000');
  await page.locator('#fm button[type=submit]').click();
  const r = (await stored(page)).rules.map(x => `${x.acc}:${x.day}:${x.amt}`).sort();
  expect(r).toEqual(['mm:10:3000', 'mm:25:3000', 'ot:10:3000', 'ot:25:3000']);
});

test('«Куда дальше?» подхватывает правила «после цели», созданные вручную, без дублей', async ({ page }) => {
  await start(page);
  await patch(page, {
    simple: false,
    accounts: [{ id: 'a1', name: 'Основная карта', type: 'main', start: 20000 },
      { id: 'pk', name: 'Подкопка', type: 'save', start: 100000, goal: 180000 },
      { id: 'dv', name: 'Вадиму', type: 'debt', start: -200000 }],
    rules: [{ id: 'r1', name: 'Подкопка', amt: 10000, day: 10, acc: 'pk', stop: 1 }, { id: 'r2', name: 'Подкопка', amt: 10000, day: 25, acc: 'pk', stop: 1 },
      { id: 'm1', name: 'Долг: Вадиму', amt: 7500, day: 10, acc: 'dv', after: 'pk' }, { id: 'm2', name: 'Долг: Вадиму', amt: 7500, day: 25, acc: 'dv', after: 'pk' }],
  });
  await page.reload();
  await page.locator('.row[data-a=editAcc]:has-text("Подкопка")').click();
  await expect(page.locator('#ov .sheet')).toContainText('Вадиму 15 000');
  await page.click('[data-a=wiz]');
  await expect(page.locator('#w_t0')).toHaveValue('dv');
  await expect(page.locator('#w_a0')).toHaveValue('15000');
  await page.locator('#fm button[type=submit]').click();
  expect((await stored(page)).rules.filter(r => r.acc === 'dv').length).toBe(2);
});

test('предсказание: сколько останется к зарплате, свои планы по дням недели', async ({ page }) => {
  const errs = [];
  // Сценарий сравнивает два прогноза на несколько дней, а не накануне зарплаты.
  await page.clock.setFixedTime(new Date(2026, 10, 16, 13, 0));
  await start(page, errs);
  await page.click('[data-a=fcOpen]');
  await expect(page.locator('#ov .sheet h3')).toContainText('Предсказание');
  // без дней зарплаты просит их задать
  await page.fill('#fc_pd', '25');
  await page.click('[data-a=fcPd]');
  // 10 обычных дней по 500 ₽ и одна крупная покупка (не еда) 1 000 ₽ вчера
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const t = new Date(); const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    const ago = n => { const x = new Date(t); x.setDate(t.getDate() - n); return iso(x); };
    for (let i = 1; i <= 10; i++) d.entries.push({ id: 'k' + i, type: 'e', amt: 500, cat: 'cafe', note: 'Ужин', date: ago(i), acc: '' });
    d.entries.push({ id: 'big1', type: 'e', amt: 1000, cat: 'tech', note: 'Лампа', date: ago(1), acc: '' });
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  await page.click('[data-a=fcOpen]');
  const sheet = page.locator('#ov .sheet');
  await expect(sheet).toContainText('останется');
  await expect(sheet).toContainText('без крупных покупок');
  // свой план: по средам 2 000, половину вернут
  await page.selectOption('#fc_cat', 'prod').catch(() => {});
  await page.fill('#fc_amt', '2000');
  await page.locator('#fc_half').check();
  await page.click('[data-a=fcAdd]');
  await expect(sheet).toContainText('вернут половину');
  const plans = (await stored(page)).fcPlans.length;
  expect(plans).toBe(1);
  const f = await page.evaluate(() => window.fcCalc());
  expect(f.pace).toBeGreaterThan(f.paceB);
  expect(f.leftB).toBeGreaterThan(f.left);
  await page.click('[data-a=fcDel]');
  expect((await stored(page)).fcPlans.length).toBe(0);
  expect(errs).toEqual([]);
});

test('история: трата с другой карты подписана, "всего" на второй строке дня', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const t = new Date(); const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    d.accounts.push({ id: 'c2', type: 'other', name: 'Альфа', bal: 1000 });
    d.entries.push({ id: 'z1', type: 'e', amt: 300, cat: 'cafe', note: 'Ужин', date: iso(t), acc: '' });
    d.entries.push({ id: 'z2', type: 'e', amt: 125, cat: 'health', note: 'Трубочка', date: iso(t), acc: 'c2' });
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  await page.click('[data-a=tab][data-v=hist]');
  await expect(page.locator('.row', { hasText: 'Трубочка' })).toContainText('💳 Альфа');
  await expect(page.locator('.row', { hasText: 'Ужин' })).not.toContainText('💳');
  await page.locator('.card', { hasText: 'Трубочка' }).first().screenshot({ path: '/tmp/day.png' });
  expect(errs).toEqual([]);
});

test('карты в "Чем оплачено" выше копилок; своей категории можно выбрать картинку', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    d.accounts.push({ id: 's1', type: 'save', name: 'Копилка А', bal: 100 });
    d.accounts.push({ id: 'c2', type: 'other', name: 'ОТП', bal: 1000 });
    d.ccats = [{ id: 'c_x', name: 'Кресла', color: 'hsl(10 70% 45%)' }];
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  await page.click('.tabs .plus');
  const names = await page.locator('#f_acc option').allTextContents();
  expect(names.findIndex(t => t.startsWith('ОТП'))).toBeLessThan(names.findIndex(t => t.startsWith('Копилка А')));
  await page.click('[data-a=close]');
  await page.click('[data-a=settings]');
  await page.locator('#ov summary', { hasText: 'Мои категории' }).click();
  await page.click('[data-a=ccIco][data-id=c_x]');
  await page.click('[data-a=ccIcoSet][data-v="🛋️"]');
  await expect(page.locator('#ov details[open]', { hasText: 'Мои категории' })).toContainText('🛋️');
  expect((await stored(page)).ccats[0].ico).toBe('🛋️');
  expect(errs).toEqual([]);
});

test('нерегулярный доход: на сколько дней хватит, процент с дохода в копилку, подушка', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const t = new Date(); const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    const ago = n => { const x = new Date(t); x.setDate(t.getDate() - n); return iso(x); };
    for (let i = 1; i <= 10; i++) d.entries.push({ id: 'k' + i, type: 'e', amt: 500, cat: 'cafe', note: 'Ужин', date: ago(i), acc: '' });
    d.accounts.push({ id: 'cu', type: 'save', name: 'Подушка', bal: 15000 });
    d.payDays = []; d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  // без дней зарплаты предсказание предлагает нерегулярный доход
  await page.click('[data-a=fcOpen]');
  await page.click('#ov [data-a=irrOn]');
  const sheet = page.locator('#ov .sheet');
  await expect(sheet).toContainText('хватит на');
  await page.click('#ov [data-a=close]');
  // правило 10% и подушка - через мастер в настройках
  await page.click('[data-a=settings]');
  await page.locator('#ov summary', { hasText: 'Нерегулярный доход' }).click();
  await page.click('[data-a=irrWiz][data-v="1"]');
  await page.selectOption('#pct_acc', 'cu');
  await page.fill('#pct_v', '10');
  await page.click('[data-a=pctAdd]');
  await expect(page.locator('#ov .sheet')).toContainText('10%');
  await page.click('[data-a=irrWiz][data-v="2"]');
  await page.click('[data-a=irrWiz][data-v="3"]');
  await page.selectOption('#cu_acc', 'cu');
  await page.click('[data-a=irrWizEnd]');
  const st = await stored(page);
  expect(st.irreg).toBe(true);
  expect(st.pct[0].pct).toBe(10);
  expect(st.cushion).toBe('cu');
  await page.locator('#ov [data-a=close]').last().click();
  await expect(page.locator('.row:visible', { hasText: 'Подушка' }).filter({hasText:'из 3 мес. жизни'})).toContainText('из 3 мес. жизни');
  // доход 5 000 -> предложение отложить 500
  await page.click('.tabs .plus');
  await page.click('[data-a=stype][data-v=i]');
  await page.fill('#f_amt', '5000');
  await page.evaluate(() => { const e = document.getElementById('f_cat'); e.value = 'side'; e.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toContainText('Разложить с дохода');
  await page.click('[data-a=pctDo]');
  const st2 = await stored(page);
  const tr = st2.entries.filter(e => e.type === 't' && e.to === 'cu');
  expect(tr.length).toBe(1);
  expect(tr[0].amt).toBe(500);
  expect(errs).toEqual([]);
});

test('нерегулярный доход в полном режиме: плитка "Хватит" и план по скромному месяцу', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const t = new Date(); const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    const ago = n => { const x = new Date(t); x.setDate(t.getDate() - n); return iso(x); };
    for (let i = 1; i <= 100; i++) d.entries.push({ id: 'k' + i, type: 'e', amt: 300, cat: 'cafe', note: 'Ужин', date: ago(i), acc: '' });
    for (let i = 1; i <= 100; i += 7) d.entries.push({ id: 'i' + i, type: 'i', amt: i < 40 ? 9000 : 6000, cat: 'side', note: 'Смена', date: ago(i), acc: '' });
    d.simple = false; d.irreg = true; d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  await expect(page.locator('.hero')).toContainText('Хватит');
  await page.click('[data-a=fcOpen]');
  await expect(page.locator('#ov .sheet')).toContainText('хватит на');
  expect(errs).toEqual([]);
});

test('нерегулярный доход: мне должны, сам себе зарплата, копилка для налога', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const t = new Date(); const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    const ago = n => { const x = new Date(t); x.setDate(t.getDate() - n); return iso(x); };
    for (let i = 1; i <= 10; i++) d.entries.push({ id: 'k' + i, type: 'e', amt: 500, cat: 'cafe', note: 'Ужин', date: ago(i), acc: '' });
    d.accounts.push({ id: 'buf', type: 'save', name: 'Буфер', start: 30000 });
    d.irreg = true; d.payDays = []; d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  // мне должны
  await page.click('[data-a=owedOpen]');
  await page.fill('#ow_n', 'Смена');
  await page.fill('#ow_a', '3000');
  await page.click('[data-a=owedAdd]');
  await expect(page.locator('#ov .sheet')).toContainText('Всего должны');
  await page.click('#ov [data-a=close]');
  await expect(page.locator('[data-a=owedOpen]')).toContainText('3 000');
  await page.click('[data-a=fcOpen]');
  await expect(page.locator('#ov .sheet')).toContainText('если заплатят');
  await page.click('#ov [data-a=close]');
  const before = await heroNumber(page);
  await page.click('[data-a=owedOpen]');
  await page.click('[data-a=owedGot]');
  await page.click('.dlg .yes');
  await expect.poll(() => heroNumber(page)).toBe(before + 3000);
  expect((await stored(page)).owed.length).toBe(0);
  // налог и сам себе зарплата - через мастер
  await page.evaluate(() => { const o = document.querySelector('#ov [data-a=close]'); if (o) o.click(); });
  await page.click('[data-a=settings]');
  await page.locator('#ov summary', { hasText: 'Нерегулярный доход' }).click();
  await page.click('[data-a=irrWiz][data-v="1"]');
  await page.click('[data-a=taxQuick]');
  await page.click('[data-a=irrWiz][data-v="2"]');
  await page.selectOption('#sp_acc', 'buf');
  await page.fill('#sp_amt', '7000');
  await page.selectOption('#sp_ev', 'w');
  await expect(page.locator('#sp_dwb')).toBeVisible();
  await expect(page.locator('#sp_dmb')).toBeHidden();
  const wd = await page.evaluate(() => new Date().getDay());
  await page.selectOption('#sp_dw', String(wd));
  await page.click('[data-a=irrWiz][data-v="3"]');
  await page.click('[data-a=irrWizEnd]');
  const st = await stored(page);
  expect(st.pct.some(r => r.pct === 6)).toBe(true);
  expect(st.selfPay.amt).toBe(7000);
  await page.locator('#ov [data-a=close]').last().click();
  await expect(page.locator('body')).toContainText('Сам себе зарплата');
  const b2 = await heroNumber(page);
  await page.click('[data-a=spDo]');
  await expect.poll(() => heroNumber(page)).toBe(b2 + 7000);
  expect(errs).toEqual([]);
});

test('нерегулярный доход: вопрос при знакомстве и "ещё не пришло" в окне дохода', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto('/index.html');
  await page.click('[data-a=onbNext]');
  await page.fill('#ob_bal', '20000');
  await page.click('[data-a=onbNext]');
  await page.click('[data-a=onbIrr][data-v="1"]');
  await page.click('[data-a=onbNext]');
  await page.click('[data-a=onbGo]');
  await expect.poll(async () => (await stored(page)).irreg).toBe(true);
  await expect(page.locator('#ov .sheet')).toBeHidden();
  await page.click('.tabs .plus');
  await page.click('[data-a=stype][data-v=i]');
  await page.fill('#f_amt', '2500');
  await page.fill('#f_note', 'Смена');
  await page.locator('#f_owed').check();
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('[data-a=owedOpen]')).toContainText('2 500');
  expect(errs).toEqual([]);
});

test('копилки: мешочек по умолчанию и своя картинка', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    d.accounts.push({ id: 'f1', type: 'save', name: 'Отпуск', start: 1000 });
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  const row = page.locator('.row[data-acc=f1]');
  await expect(row).toContainText('💰');
  await row.click();
  await page.locator('#ov details.icod summary').click();
  await page.click('#ov .icob[data-e="🏖️"]');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('.row[data-acc=f1]')).toContainText('🏖️');
  expect((await stored(page)).accounts.find(a => a.id === 'f1').ico).toBe('🏖️');
  expect(errs).toEqual([]);
});

test('перевод: сначала карты, потом копилки, долги подписаны', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    d.accounts.push({ id: 'd1', type: 'debt', name: 'ОТП', start: -1000 });
    d.accounts.push({ id: 's1', type: 'save', name: 'Отпуск', start: 100 });
    d.accounts.push({ id: 'c1', type: 'other', name: 'ОТП', start: 500 });
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  await page.click('.tabs .plus');
  await page.click('[data-a=stype][data-v=t]');
  const t = await page.locator('#f_to option').allTextContents();
  const iCard = t.findIndex(x => x.includes('💳 ОТП')), iSave = t.findIndex(x => x.includes('Отпуск')), iDebt = t.findIndex(x => x.includes('ОТП (долг)'));
  expect(iCard).toBeGreaterThan(-1);
  expect(iCard).toBeLessThan(iSave);
  expect(iSave).toBeLessThan(iDebt);
  expect(errs).toEqual([]);
});

test('возврат можно получить на долг, другую карту или в копилку', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    d.accounts.push({ id: 'd1', type: 'debt', name: 'Кредитка', start: -5000 });
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  const before = await heroNumber(page);
  await page.click('.tabs .plus');
  await page.click('[data-a=stype][data-v=r]').catch(async () => { await page.locator('#ov button', { hasText: 'Вернули' }).first().click(); });
  await page.fill('#f_amt', '951');
  await page.selectOption('#f_acc', 'd1');
  await page.locator('#fm button[type=submit]').click();
  await expect(page.locator('#ov .sheet')).toBeHidden();
  const st = await stored(page);
  const e = st.entries.find(x => x.amt === 951);
  expect(e.acc).toBe('d1');
  expect(await heroNumber(page)).toBe(before);
  expect(errs).toEqual([]);
});

test('история: итог дня виден, даже если общий возврат больше трат', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const t = new Date(); const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    d.entries.push({ id: 'a1', type: 'e', amt: 355, cat: 'cafe', note: 'Ужин', date: iso(t), acc: '' });
    d.entries.push({ id: 'a2', type: 'i', amt: 955, cat: 'refund', note: '', date: iso(t), acc: '' });
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  await page.click('[data-a=tab][data-v=hist]');
  const card = page.locator('.card', { hasText: 'Ужин' }).first();
  await expect(card).toContainText('из 1 500');
  await expect(card).toContainText('больше');
  expect(errs).toEqual([]);
});

test('гибкая раскладка: пришло меньше - суммы под пришедшее, недостающее на следующую выплату', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  const t = new Date(); const ym = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0');
  await patch(page, {
    simple: false, planFrom: ym + '-01',
    accounts: [{ id: 'a1', name: 'Основная карта', type: 'main', start: 20000 },
      { id: 'k1', name: 'Подкопка', type: 'save', start: 0 }, { id: 'k2', name: 'Клода', type: 'save', start: 0 }],
    incomes: [{ id: 'i1', name: 'Аванс', amt: 2000, day: 1 }],
    rules: [{ id: 'r1', name: 'Подкопка', amt: 1500, day: 1, acc: 'k1' }, { id: 'r2', name: 'Клода', amt: 500, day: 1, acc: 'k2' }],
    entries: [{ id: 'in1', type: 'i', amt: 1600, cat: 'salary', date: ym + '-01', note: 'Аванс', iid: 'i1', acc: '' }],
  });
  await page.reload();
  await page.click('[data-a=tab][data-v=plan]');
  await page.click('[data-a=applyP]');
  await expect(page.locator('#po_inc')).toHaveValue('1600');
  // сразу предлагает уложиться в пришедшее: 1500*0.8=1200, 500*0.8=400
  await expect(page.locator('.po_in[data-rule=r1]')).toHaveValue('1200');
  await expect(page.locator('.po_in[data-rule=r2]')).toHaveValue('400');
  await expect(page.locator('#po_tot')).toContainText('1 600');
  // округление не оставляет копейки на жизнь: 1641 из 2000
  await page.fill('#po_inc', '1641');
  await page.locator('#ov button', { hasText: 'Уложиться' }).click();
  const sum = await page.$$eval('.po_in', es => es.reduce((a, e) => a + (+e.value || 0), 0));
  expect(sum).toBe(1641);
  await page.fill('#po_inc', '1600');
  await page.locator('#ov button', { hasText: 'Уложиться' }).click();
  await expect(page.locator('#po_cl')).toContainText('на 400 ₽ меньше плана');
  // «из свободных денег» - суммы по плану, потом снова «докинуть» - под пришедшее
  await page.check('input[name=po_m][value=free]');
  await expect(page.locator('.po_in[data-rule=r1]')).toHaveValue('1500');
  await expect(page.locator('#po_tot')).toContainText('свободных денег');
  await page.check('input[name=po_m][value=carry]');
  await expect(page.locator('.po_in[data-rule=r1]')).toHaveValue('1200');
  // по порядку: первая полностью, вторая - сколько осталось
  await page.locator('#ov button', { hasText: 'По порядку' }).click();
  await expect(page.locator('.po_in[data-rule=r2]')).toHaveValue('100');
  // галочка «уже отложено» сразу записывает перевод, повторно при «Разложить» он не пишется
  await page.locator('.po_in[data-rule=r1] + .po_ck').check();
  expect((await stored(page)).entries.filter(e => e.type === 't' && e.to === 'k1').length).toBe(1);
  await expect(page.locator('[data-a=poDo]')).toHaveText('Разложить остальное');
  await page.click('[data-a=poDo]');
  expect((await stored(page)).entries.filter(e => e.type === 't' && e.to === 'k1').length).toBe(1);
  const st = await stored(page);
  expect(st.entries.filter(e => e.type === 't' && e.to === 'k1')[0].amt).toBe(1500);
  expect(st.entries.filter(e => e.type === 't' && e.to === 'k2')[0].amt).toBe(100);
  expect(st.carry).toEqual([expect.objectContaining({ acc: 'k2', amt: 400 })]);
  // после раскладки можно открыть и поправить: снять галочку у Клоды, поменять сумму, поставить снова
  await page.locator('[data-a=fold][data-v=donePayouts]').click();
  await page.click('[data-a=editP]');
  await expect(page.locator('.po_in[data-rule=r2]')).toHaveValue('100');
  await page.locator('.po_in[data-rule=r2] + .po_ck').uncheck();
  await page.fill('.po_in[data-rule=r2]', '300');
  await page.locator('.po_in[data-rule=r2] + .po_ck').check();
  const k2 = (await stored(page)).entries.filter(e => e.type === 't' && e.to === 'k2');
  expect(k2.map(e => e.amt)).toEqual([300]);
  expect(errs).toEqual([]);
});

test('обновление: если на сайте новая сборка - плашка «Есть обновление»', async ({ page }) => {
  const errs = [];
  await page.route(/index\.html/, async r => { const res = await r.fetch(); const b = (await res.text()).replace("var BUILD='__BUILD__'", "var BUILD='aaaaaaa'"); r.fulfill({ response: res, body: b }); });
  await page.route(/version\.txt/, r => r.fulfill({ contentType: 'text/plain', body: 'bbbbbbb\n' }));
  await start(page, errs);
  await expect(page.locator('#updbar')).toContainText('Есть обновление', { timeout: 8000 });
  expect(errs).toEqual([]);
});

test('окно записи: одна кнопка «+ ещё сумма» - в ту же категорию или в другую', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.click('.tabs .plus');
  await expect(page.locator('#ov [data-a=partsOn]')).toHaveCount(0);
  await page.fill('#f_amt', '100');
  await page.click('[data-a=amtMore]');
  await page.click('.amtmore [data-a=amtPlus]');
  await expect(page.locator('#f_amt')).toHaveValue('100+');
  await expect(page.locator('.amtmore')).toHaveCount(0);
  await page.locator('#f_amt').pressSequentially('50');
  await page.click('[data-a=amtMore]');
  await page.click('.amtmore [data-a=partsOn]');
  await expect(page.locator('#ov .parts')).toBeVisible();
  await expect(page.locator('#f_amt')).toHaveValue('100+50');
  expect(errs).toEqual([]);
});

test('разбор QR-кода чека и уведомлений банка', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  const r = await page.evaluate(() => ({
    q1: window.qrParse('t=20261120T1907&s=369.00&fn=7380440700000000&i=12345&fp=1234567890&n=1'),
    q2: window.qrParse('t=20261118T101500&s=1500.50&n=2'),
    q3: window.qrParse('просто текст'),
    b1: window.bankParse('Покупка 369 ₽ в ПЯТЁРОЧКА. Баланс 15 279 ₽'),
    b2: window.bankParse('Зачисление 57 420,00 ₽ от ООО Рога. Доступно 70 000 ₽'),
    b3: window.bankParse('Ваш код для входа 1234'),
    b4: window.bankParse('Возврат 300 ₽ ОЗОН'),
  }));
  expect(r.q1).toEqual({ amt: 369, date: '2026-11-20', refund: false });
  expect(r.q2).toEqual({ amt: 1500.5, date: '2026-11-18', refund: true });
  expect(r.q3).toBeNull();
  expect(r.b1).toMatchObject({ amt: 369, type: 'e', note: 'ПЯТЁРОЧКА' });
  expect(r.b2).toMatchObject({ amt: 57420, type: 'i' });
  expect(r.b3).toBeNull();
  expect(r.b4).toMatchObject({ amt: 300, type: 'i', refund: true });
  expect(errs).toEqual([]);
});

test('как вчера и ярлык «Сегодня без трат»', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const t = new Date(); t.setDate(t.getDate() - 1);
    const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    d.entries.push({ id: 'y1', type: 'e', amt: 430, cat: 'cafe', note: 'Ужин', date: iso(t), acc: '' });
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  await page.click('.tabs .plus');
  const chip = page.locator('#ov [data-a=quick][title="Как вчера"]');
  await expect(chip).toContainText('Ужин');
  await chip.click();
  await expect(page.locator('#f_amt')).toHaveValue('430');
  await page.goto('/index.html?ns=1');
  await expect.poll(async () => ((await stored(page)).noSpend || []).length).toBe(1);
  expect(errs).toEqual([]);
});

test('производственный календарь: загрузка на новый год', async ({ page }) => {
  const errs = [];
  const y = new Date().getFullYear() + 2;
  const n = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  const str = Array.from({ length: n }, (_, i) => (i < 8 ? '1' : '0')).join('');
  await page.route(/isdayoff\.ru/, r => r.fulfill({ contentType: 'text/plain', body: str, headers: { 'access-control-allow-origin': '*' } }));
  await start(page, errs);
  await page.click('[data-a=settings]');
  await page.locator('#ov summary', { hasText: 'График поступлений' }).click();
  await page.locator('#ov summary', { hasText: 'Производственный календарь' }).click();
  await page.click(`[data-a=calLoad][data-v="${y}"]`);
  await expect.poll(async () => ((await stored(page)).rucal || {})[y]).toBe(str);
  expect(errs).toEqual([]);
});

test('страховка: если приложение упало при запуске - можно скачать данные', async ({ page }) => {
  await page.route(/index\.html/, async r => { const res = await r.fetch(); const b = (await res.text()).replace('window.__schOk=true;', 'throw new Error("boom");'); r.fulfill({ response: res, body: b }); });
  await page.goto('/index.html');
  await expect(page.locator('#rescue')).toContainText('Что-то пошло не так');
  await expect(page.locator('#rsDl')).toBeVisible();
});

test('итоги года в конце декабря и итог недели в воскресенье вечером', async ({ page }) => {
  const errs = [];
  await page.clock.install({ time: new Date('2026-12-27T19:00:00') });
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    for (let i = 1; i <= 60; i++) { const x = new Date(2026, 11, 27); x.setDate(x.getDate() - i); d.entries.push({ id: 'z' + i, type: 'e', amt: 300 + i, cat: 'cafe', note: 'Ужин', date: iso(x), acc: '' }); }
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  await expect(page.locator('.monster')).toContainText('Итоги 2026 года');
  await page.click('[data-a=yrOk]');
  await expect(page.locator('.monster')).toContainText('Итог недели');
  await page.click('[data-a=wkOk]');
  await expect(page.locator('.monster')).not.toContainText('Итог недели');
  expect(errs).toEqual([]);
});

test('отпуск: примерные отпускные и зарплата, монстрик не ругает', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    const t = new Date(); const iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    for (let k = 1; k <= 6; k++) { const x = new Date(t.getFullYear(), t.getMonth() - k, 10); d.entries.push({ id: 'in' + k, type: 'i', amt: 60000, cat: 'salary', note: 'ЗП', date: iso(x), acc: '' }); }
    d.unameAsked = 1; localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  await page.click('[data-a=settings]');
  await page.locator('#ov summary', { hasText: 'Отпуск и больничный' }).click();
  await page.click('[data-a=perAdd]');
  const st = await stored(page);
  expect(st.periods.length).toBe(1);
  await expect(page.locator('#ov .sheet')).toContainText('отпускные ≈');
  await page.locator('#ov [data-a=close]').last().click();
  await expect(page.locator('body')).toContainText('отпускные ≈');
  expect(errs).toEqual([]);
});


test('карта вне свободных денег: метро входит в план, но не меняет свободный баланс', async ({ page }) => {
  const errs = [];
  await start(page, errs);
  await page.click('.hero .penb');
  await page.click('#ov [data-a=newCard]');
  await page.fill('#a_name', 'ВТБ транспорт');
  await page.uncheck('#a_live');
  await expect(page.locator('#a_planSpend')).toBeChecked();
  await page.fill('#a_start', '500');
  await page.locator('#fm button[type=submit]').click();
  const before = await heroNumber(page);
  let data = await stored(page);
  let card = data.accounts.find(a => a.name === 'ВТБ транспорт');
  expect(card.live).toBeFalsy();
  expect(card.planSpend).toBe(true);
  await page.click('.tabs .plus');
  await page.fill('#f_amt', '65');
  await page.fill('#f_note', 'Метро');
  await page.locator('#f_more summary').click();
  await page.selectOption('#f_acc', await page.locator('#f_acc option', { hasText: 'ВТБ транспорт' }).first().getAttribute('value'));
  await page.locator('#fm button[type=submit]').click();
  expect(await heroNumber(page)).toBe(before);
  data = await stored(page);
  card = data.accounts.find(a => a.name === 'ВТБ транспорт');
  expect(data.entries.some(e => e.type === 'e' && e.amt === 65 && e.acc === card.id)).toBe(true);
  await page.click('.tabs [data-a=tab][data-v=hist]');
  await expect(page.locator('text=65 ₽').first()).toBeVisible();
  expect(errs).toEqual([]);
});

test('отдельная настройка плана сохраняется и не меняет баланс', async ({ page }) => {
  await start(page);
  await page.click('.hero .penb');
  await page.click('#ov [data-a=newCard]');
  await page.fill('#a_name', 'Отдельная карта');
  await page.uncheck('#a_live');
  await page.uncheck('#a_planSpend');
  await page.fill('#a_start', '300');
  await page.locator('#fm button[type=submit]').click();
  expect(await heroNumber(page)).toBe(20000);
  let a = (await stored(page)).accounts.find(x => x.name === 'Отдельная карта');
  expect(a.live).toBeFalsy();
  expect(a.planSpend).toBe(false);
  await page.reload();
  a = (await stored(page)).accounts.find(x => x.name === 'Отдельная карта');
  expect(a.live).toBeFalsy();
  expect(a.planSpend).toBe(false);
});

 
// Only the test browser receives this read-only hook; production JS stays private.
async function archiveProbe(page) {
  await page.route(/\/index\.html(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const html = await response.text();
    const marker = '})();\n/* Новая версия на сайте:';
    if (!html.includes(marker)) throw new Error('Archive probe insertion point not found');
    const hook = 'window.__archiveProbe = function(){return {balance:balance(),life:lifeNet(S.entries),entries:JSON.stringify(S.entries),accounts:activeAccounts().map(function(a){return {id:a.id,b:accBalN(a)}}),all:S.accounts.map(function(a){return {id:a.id,archived:!!a.archived}})}};\n';
    await route.fulfill({response,body:html.replace(marker,hook+marker)});
  });
}

test('архив: закрытие карты, долга и копилки сохраняет историю, план и остатки', async ({ page }) => {
  await archiveProbe(page);
  const errs = [];
  await page.clock.setFixedTime(new Date(2026, 10, 16, 13, 0));
  await start(page, errs);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('podkopka-v1'));
    d.unameAsked = 1;
    d.accounts.push(
      {id:'closedCard', type:'other', name:'Закрываемая карта', start:600, live:true, planSpend:true},
      {id:'closedDebt', type:'debt', name:'Закрываемая кредитка', start:-1000, dk:'card'},
      {id:'closedSave', type:'save', name:'Закрываемая копилка', start:200},
      {id:'openCard', type:'other', name:'Активная карта', start:100, live:false, planSpend:false}
    );
    const date='2026-11-15';
    d.entries.push(
      {id:'c-exp', type:'e', acc:'closedCard', amt:600, date, cat:'cafe', note:'Трата по закрываемой карте'},
      {id:'d-pay', type:'t', from:'a1', to:'closedDebt', amt:1000, date, note:'Погашение кредитки'},
      {id:'s-exp', type:'e', acc:'closedSave', amt:200, date, cat:'gift', note:'Трата из закрываемой копилки'}
    );
    localStorage.setItem('podkopka-v1', JSON.stringify(d));
  });
  await page.reload();
  const snapshot = () => page.evaluate(() => window.__archiveProbe());
  const before = await snapshot();
  expect(before.life).toBe(600);
  expect(before.balance).toBe(19000);
  await page.locator('.hero .hcard', {hasText:'Закрываемая карта'}).click();
  await page.click('[data-a=askDel]');
  await page.click('[data-a=delAcc]');
  await expect(page.locator('#ov .sheet')).toBeHidden();
  for (const name of ['Закрываемая кредитка','Закрываемая копилка']) {
    await page.locator('.row[data-a=editAcc]', {hasText:name}).click();
    await page.click('[data-a=askDel]');
    await page.click('[data-a=delAcc]');
    await expect(page.locator('#ov .sheet')).toBeHidden();
  }
  const after = await snapshot();
  expect(after.balance).toBe(before.balance);
  expect(after.life).toBe(before.life);
  expect(after.entries).toBe(before.entries);
  expect(after.accounts).toEqual(before.accounts.filter(a=>!a.id.startsWith('closed')));
  await expect(page.locator('[data-a=unarchiveAcc]')).toHaveCount(3);
  await page.reload();
  expect((await snapshot()).life).toBe(before.life);
  await page.click('.tabs [data-a=tab][data-v=hist]');
  await expect(page.locator('.row', {hasText:'Погашение кредитки'})).toContainText('Закрываемая кредитка');
  await expect(page.locator('.row', {hasText:'Трата по закрываемой карте'})).toContainText('Закрываемая карта');
  await page.click('.tabs .plus');
  await page.click('[data-a=stype][data-v=t]');
  for (const sel of ['#f_from','#f_to']) {
    const values=await page.locator(sel+' option').evaluateAll(o=>o.map(e=>e.value));
    expect(values).not.toContain('closedCard');
    expect(values).not.toContain('closedDebt');
    expect(values).not.toContain('closedSave');
  }
  await page.click('#ov [data-a=close]');
  await page.click('.tabs [data-a=tab][data-v=home]');
  await page.click('[data-a=unarchiveAcc][data-id=closedCard]');
  await expect(page.locator('.hero .hcard', {hasText:'Закрываемая карта'})).toBeVisible();
  expect((await snapshot()).balance).toBe(before.balance);
  expect((await snapshot()).life).toBe(before.life);
  expect(errs).toEqual([]);
});

test('архив: нельзя закрыть ненулевой счёт или счёт с будущим правилом', async ({page}) => {
  await start(page);
  await page.evaluate(() => {
    const d=JSON.parse(localStorage.getItem('podkopka-v1'));
    d.accounts.push({id:'nonzero',type:'other',name:'С остатком',start:100,live:false},{id:'linked',type:'save',name:'Связанная копилка',start:0});
    d.rules.push({id:'linkedRule',acc:'linked',name:'В копилку',amt:500,day:25});
    d.unameAsked=1;
    localStorage.setItem('podkopka-v1',JSON.stringify(d));
  });
  await page.reload();
  for(const [name, msg] of [['С остатком','Сначала обнули остаток'],['Связанная копилка','Сначала перенеси связанные платежи']]){
    await page.locator('.row[data-a=editAcc]',{hasText:name}).click();
    await page.click('[data-a=askDel]');
    await page.click('[data-a=delAcc]');
    await expect(page.locator('#f_err')).toContainText(msg);
    await page.click('#ov [data-a=close]');
  }
  expect((await stored(page)).accounts.filter(a=>a.archived)).toHaveLength(0);
});

test('архив: старые удалённые счета не переносят расходы на основную карту', async ({page}) => {
  await archiveProbe(page);
  await page.clock.setFixedTime(new Date(2026, 10, 16, 13, 0));
  await start(page);
  await page.evaluate(() => {
    const d=JSON.parse(localStorage.getItem('podkopka-v1'));
    const date='2026-11-16';
    d.entries.push({id:'old-exp',type:'e',acc:'missing-old',amt:100,date,cat:'tech',note:'Старая покупка'},
      {id:'old-pay',type:'t',from:'a1',to:'missing-old',amt:100,date,note:'Старый перевод'});
    d.unameAsked=1;
    localStorage.setItem('podkopka-v1',JSON.stringify(d));
  });
  await page.reload();
  const state=await page.evaluate(()=>window.__archiveProbe());
  expect(state.balance).toBe(19900);
  expect(state.life).toBe(0);
  expect(state.all.find(a=>a.id==='missing-old')).toEqual({id:'missing-old',archived:true});
  await page.click('.tabs [data-a=tab][data-v=hist]');
  await expect(page.locator('.row',{hasText:'Старая покупка'})).toContainText('Удалённый счёт');
  await expect(page.locator('.row',{hasText:'Старый перевод'})).toContainText('Удалённый счёт');
});


test('дневной бюджет в день выплаты: до дохода, после дохода и после раскладки', async ({ page }) => {
  const errs=[];
  await page.clock.setFixedTime(new Date(2026, 10, 25, 13, 0));
  await start(page, errs);
  await page.evaluate(() => {
    const d=JSON.parse(localStorage.getItem('podkopka-v1'));
    Object.assign(d,{simple:false,unameAsked:1,planFrom:'2026-11-01',skips:[],ruleZero:{},
      accounts:[{id:'a1',name:'Основная карта',type:'main',start:6000},{id:'save1',name:'Накопления',type:'save',start:0}],
      incomes:[{id:'salary25',name:'Аванс',amt:30000,day:25},{id:'salary10',name:'Зарплата',amt:30000,day:10}],
      recur:[{id:'bill25',name:'Платёж',amt:1000,day:25,cat:'conn',acc:'a1'}],
      rules:[{id:'save25',name:'Накопления',amt:18000,day:25,acc:'save1'}],entries:[]});
    localStorage.setItem('podkopka-v1',JSON.stringify(d));
  });
  await page.reload();
  const tile=page.locator('.hero .stat.main'),details=page.locator('#tip_h_can'),link=page.locator('.home-detail-link');
  await expect(tile.locator('b')).toHaveText('5 000 ₽');
  await expect(tile.locator('.lbl')).toHaveText('Можно сегодня');
  await link.click();
  await expect(details.locator('.row').filter({hasText:'На завтра'}).locator('b')).toHaveText('Ждём доход');
  await expect(details).toContainText('Доход сегодня ещё не отмечен.');
  await expect(tile.locator('b')).toHaveText('5 000 ₽');
  await link.click();
  await page.evaluate(() => {
    const d=JSON.parse(localStorage.getItem('podkopka-v1'));
    d.entries.push({id:'paid25',type:'i',cat:'salary',amt:30000,date:'2026-11-25',iid:'salary25',acc:'a1'});
    localStorage.setItem('podkopka-v1',JSON.stringify(d));
  });
  await page.reload();
  await expect(tile.locator('b')).toHaveText('1 133 ₽');
  await link.click();
  await expect(details.locator('.budget-period')).toContainText('До 10 декабря');
  await expect(details.locator('.row').filter({hasText:'На завтра'}).locator('b')).toHaveText('1 133 ₽');
  expect(await heroNumber(page)).toBe(36000);
  await page.evaluate(() => {
    const d=JSON.parse(localStorage.getItem('podkopka-v1'));
    d.entries.push({id:'distributed25',type:'t',amt:18000,date:'2026-11-25',from:'a1',to:'save1',rule:'save25'});
    localStorage.setItem('podkopka-v1',JSON.stringify(d));
  });
  await page.reload();
  await expect(tile.locator('b')).toHaveText('1 133 ₽');
  expect(await heroNumber(page)).toBe(18000);
  expect(errs).toEqual([]);
});
