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
      const { Renderer, states, stage, transitionPhases } = await import('/monster-catalog/engine.js');
      const canvas = document.createElement('canvas');
      const renderer = new Renderer(canvas);
      const fps = 14;
      // This hook lives in the capture page and calls the same renderer as the catalog.
      window.captureMonster = async (character, animation) => {
        const rig = rigs[character];
        const state = states[animation];
        await renderer.load(rig);
        const records = [];
        function clearBorder() {
          const { ctx } = renderer;
          const { width, height } = canvas;
          return [[0, 0, width, 1], [0, height - 1, width, 1], [0, 0, 1, height], [width - 1, 0, 1, height]]
            .every(rect => ctx.getImageData(...rect).data.every((value, index) => index % 4 !== 3 || value === 0));
        }
        function render(phase, name = state.id, checkpoint = false) {
          const drawn = renderer.draw(rig, name, phase);
          if (checkpoint) {
            const geometry = renderer.geometry(rig, name, phase);
            const [l, t, r, b] = drawn.bounds;
            records.push({
              fit: drawn.fit,
              fits: l >= 8 && t >= 8 && r <= stage.width - 8 && b <= stage.height - 8 && clearBorder(),
              ground: geometry.silhouette[3] <= .01,
              single: name !== 'flip' || geometry.figure.length === 1,
              visibleJoints: geometry.joints.length,
            });
          }
          return canvas.toDataURL('image/png').split(',')[1];
        }
        canvas.width = stage.width;
        canvas.height = stage.height;
        const even = Array.from({ length: 21 }, (_, i) => i * 500);
        const key = transitionPhases(rig, state.id).map(phase => Math.round(phase * 10000));
        const edges = key.flatMap(phase => [phase - 22, phase, phase + 22]);
        const phases = [...new Set([...even, ...edges])].sort((a, b) => a - b);
        const checkpoints = phases.map(phase => [phase, render(phase / 10000, state.id, true)]);
        const settled = render(state.loopFrom);
        const rawEnd = checkpoints.at(-1)[1];
        const target = state.loop ? settled : render(0, 'idle');
        const results = {
          id: rig.id, state: state.id, frames: checkpoints.length, fit: records[0].fit,
          withinStage: records.every(record => record.fits),
          ground: records.every(record => record.ground),
          single: records.every(record => record.single),
          changes: new Set(checkpoints.map(([, png]) => png)).size,
          boundary: rawEnd === target,
          jointsInNeutral: rig.limbs.length,
          maxInPose: Math.max(...records.map(record => record.visibleJoints)),
          hidden: rig.occluded,
          animatedSamples: 0,
        };
        canvas.width = 180;
        canvas.height = Math.round(180 * stage.height / stage.width);
        const count = Math.max(2, Math.ceil(state.duration / 1000 * fps));
        const frames = Array.from({ length: count }, (_, i) => render(i / count));
        if (!state.loop) {
          for (let i = 0; i < 5; i++) frames.push(render(i / fps / 3.5, 'idle'));
        } else if (state.loopFrom) {
          // End the loop sample at the settled pose. The interactive view
          // keeps breathing in bed after its one-time entrance.
          frames.push(render(1));
        }
        results.animatedSamples = frames.length;
        return { checkpoints, frames, results };
      };
      return { characters: rigs.map(({ id, name }) => ({ id, name })), states, fps };
    });

    const results = [];
    for (const [index, rig] of manifest.characters.entries()) {
      for (const [selection, state] of manifest.states.entries()) {
        const folder = path.join(output, 'frames', rig.id, state.id);
        const loop = path.join(output, '.gif-frames', rig.id, state.id);
        await fs.mkdir(folder, { recursive: true });
        await fs.mkdir(loop, { recursive: true });
        const data = await page.evaluate(([character, animation]) => window.captureMonster(character, animation), [index, selection]);
        results.push(data.results);
        await Promise.all([
          ...data.checkpoints.map(([phase, png]) => fs.writeFile(path.join(folder, `${phase}.png`), Buffer.from(png, 'base64'))),
          ...data.frames.map((png, i) => fs.writeFile(path.join(loop, `${String(i).padStart(3, '0')}.png`), Buffer.from(png, 'base64')))
        ]);
      }
      process.stdout.write(`${index + 1}/${manifest.characters.length} ${rig.name}\n`);
    }
    if (errors.length) throw new Error(errors.join('\n'));
    await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ ...manifest, results }, null, 2));
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
