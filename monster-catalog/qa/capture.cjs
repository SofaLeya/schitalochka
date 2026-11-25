const { chromium } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');

async function capture(baseURL, output) {
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  try {
    const page = await browser.newPage({ reducedMotion: 'reduce', viewport: { width: 1440, height: 970 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('/monster-catalog/', baseURL).href);
    await page.waitForFunction(() => document.querySelectorAll('#character option').length === 19 && !document.querySelector('#asset-status').textContent);
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'catalog-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 800 });
    await page.locator('#dark').check();
    await page.locator('#guides').check();
    await page.screenshot({ path: path.join(output, 'catalog-mobile.png'), fullPage: true });

    const manifest = await page.evaluate(async () => {
      const { rigs } = await import('/monster-catalog/rigs.js');
      const { Renderer, states, stage } = await import('/monster-catalog/engine.js');
      const canvas = document.createElement('canvas');
      const renderer = new Renderer(canvas);
      const base = {
        blink: [.31, .45], sway: [.25, .72], joy: [.28, .49], jump: [.28, .49],
        flip: [.37, .50, .65], surprise: [.22, .45], thought: [.30, .58]
      };
      const fps = 14;
      // This hook lives in the capture page and calls the same renderer as the catalog.
      window.captureMonster = async (character, animation) => {
        const rig = rigs[character];
        const state = states[animation];
        await renderer.load(rig);
        function render(phase, name = state.id) {
          renderer.draw(rig, name, phase);
          return canvas.toDataURL('image/png').split(',')[1];
        }
        canvas.width = stage.width;
        canvas.height = stage.height;
        const phases = [...new Set([0, ...(base[state.id] || [.25, .72]), .5, 1])].sort((a, b) => a - b);
        const checkpoints = phases.map(phase => [phase, render(phase)]);
        canvas.width = 180;
        canvas.height = Math.round(180 * stage.height / stage.width);
        const count = Math.max(2, Math.ceil(state.duration / 1000 * fps));
        const frames = Array.from({ length: count }, (_, i) => render(i / count));
        if (!state.loop) {
          for (let i = 0; i < 5; i++) frames.push(render(i / fps / 3.5, 'idle'));
        }
        return { checkpoints, frames };
      };
      return { characters: rigs.map(({ id, name }) => ({ id, name })), states, fps };
    });

    for (const [index, rig] of manifest.characters.entries()) {
      for (const [selection, state] of manifest.states.entries()) {
        const folder = path.join(output, 'frames', rig.id, state.id);
        const loop = path.join(output, '.gif-frames', rig.id, state.id);
        await fs.mkdir(folder, { recursive: true });
        await fs.mkdir(loop, { recursive: true });
        const data = await page.evaluate(([character, animation]) => window.captureMonster(character, animation), [index, selection]);
        await Promise.all([
          ...data.checkpoints.map(([phase, png]) => fs.writeFile(path.join(folder, `${Math.round(1000 * phase)}.png`), Buffer.from(png, 'base64'))),
          ...data.frames.map((png, i) => fs.writeFile(path.join(loop, `${String(i).padStart(3, '0')}.png`), Buffer.from(png, 'base64')))
        ]);
      }
      process.stdout.write(`${index + 1}/${manifest.characters.length} ${rig.name}\n`);
    }
    if (errors.length) throw new Error(errors.join('\n'));
    await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2));
  } finally {
    await browser.close();
  }
}

const [baseURL, output] = process.argv.slice(2);
if (!baseURL || !output) throw new Error('node monster-catalog/qa/capture.cjs <URL> <папка>');
capture(baseURL, output).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
