const { readFile } = require('node:fs/promises');
const { test, expect, devices } = require('@playwright/test');

const windows = {
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  platform: 'Win32',
  maxTouchPoints: 10,
};
const android = {
  userAgent: devices['Pixel 7'].userAgent,
  platform: 'Linux armv8l',
  maxTouchPoints: 5,
};
const ios = {
  userAgent: devices['iPhone 13'].userAgent,
  platform: 'iPhone',
  maxTouchPoints: 5,
};
const ipad = {
  userAgent: devices['Desktop Safari'].userAgent,
  platform: 'MacIntel',
  maxTouchPoints: 5,
};
const date = '2026-11-25';
const note = 'Кофе; "с собой"';
const fileFormats = [
  { format: 'TXT', filename: `schitalochka-vygruzka-${date}.txt`, shareType: 'text/plain' },
  { format: 'CSV', filename: 'schitalochka-2026-11-01_2026-11-30.csv', shareType: 'text/csv' },
  { format: 'JSON', filename: `schitalochka-${date}.json`, shareType: 'text/plain' },
];

test.use({ timezoneId: 'UTC' });

async function openExport(page, format, device, shareSupport = 'files') {
  await page.route(url => url.hostname !== 'localhost', route => route.abort());
  await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
  await page.addInitScript(({ device, shareSupport }) => {
    for (const [key, value] of Object.entries(device)) {
      Object.defineProperty(navigator, key, { value });
    }
    window.shareCalls = [];
    Object.defineProperties(navigator, {
      canShare: { value: shareSupport === 'missing' ? undefined : () => shareSupport !== 'no-files' },
      share: {
        value: ['missing', 'no-share'].includes(shareSupport) ? undefined : async ({ files }) => {
          window.shareCalls.push(files.map(({ name, type }) => ({ name, type })));
        },
      },
    });
  }, { device, shareSupport });

  await page.goto('/index.html');
  await page.click('[data-a=onbNext]');
  await page.fill('#ob_bal', '20000');
  await page.click('[data-a=onbNext]');
  await page.fill('#ob_lim', '1500');
  await page.click('[data-a=onbNext]');
  await page.click('[data-a=onbGo]');
  await page.click('.tabs .plus');
  await page.fill('#f_amt', '450');
  await page.fill('#f_note', note);
  await page.locator('#fm button[type=submit]').click();

  if (format === 'JSON') {
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.locator('summary').filter({ hasText: 'Копии и синхронизация' }).click();
    await page.getByText('Скачать файл на устройство', { exact: true }).click();
    return page.getByRole('button', { name: 'Сохранить файл', exact: true });
  }

  await page.locator('#tabs').getByText('Анализ', { exact: true }).click();
  if (format === 'CSV') {
    await page.getByRole('button', { name: 'CSV', exact: true }).click();
    return page.getByRole('button', { name: 'Скачать', exact: true });
  }

  await page.getByRole('button', { name: 'Для ИИ', exact: true }).click();
  return page.getByRole('button', { name: 'Сохранить файл', exact: true });
}

async function downloadFile(page, button, filename) {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), button.click()]);
  expect(download.suggestedFilename()).toBe(filename);
  expect(await download.failure()).toBeNull();
  expect(await page.evaluate(() => window.shareCalls)).toEqual([]);
  return readFile(await download.path(), 'utf8');
}

for (const { format, filename, shareType } of fileFormats) {
  test(`Windows с сенсорным экраном скачивает ${format} при доступном Web Share API без вызова share`, async ({ page }) => {
    const button = await openExport(page, format, windows);
    const content = await downloadFile(page, button, filename);

    if (format === 'TXT') {
      expect(content).toBe(await page.locator('#ex_out').inputValue());
      expect(content).toContain(note);
    } else if (format === 'CSV') {
      expect(content).toMatch(/^\uFEFFДата;Тип;Категория;Сумма;Заметка;Счёт;Не считать в тратах\r\n/);
      expect(content).toContain('25.11.2026;Расход;');
      expect(content).toContain(';450;"Кофе; ""с собой""";');
    } else {
      const backup = JSON.parse(content);
      expect(backup).toEqual(JSON.parse(await page.locator('#s_out').inputValue()));
      expect(backup.entries).toEqual([
        expect.objectContaining({ type: 'e', amt: 450, date, note }),
      ]);
    }
  });

  for (const [name, device] of [['Android', android], ['iPhone', ios], ['iPad с настольным UA', ipad]]) {
    test(`${name} может поделиться файлом ${format}`, async ({ page }) => {
      const button = await openExport(page, format, device);
      await button.click();
      expect(await page.evaluate(() => window.shareCalls)).toEqual([[{ name: filename, type: shareType }]]);
    });
  }

  for (const [message, support] of [
    ['Web Share API отсутствует', 'missing'],
    ['Web Share API не поддерживает передачу файлов', 'no-files'],
    ['доступен canShare без share', 'no-share'],
  ]) {
    test(`Android скачивает ${format}, если ${message}`, async ({ page }) => {
      const button = await openExport(page, format, android, support);
      expect(await downloadFile(page, button, filename)).toContain('Кофе');
    });
  }
}
