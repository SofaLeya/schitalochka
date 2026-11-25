export const states = [
  ['idle', 'Дыхание', 3500, true],
  ['blink', 'Моргание', 800, false],
  ['sway', 'Покачивание', 1800, false],
  ['joy', 'Радость', 1500, false],
  ['jump', 'Прыжок', 1200, false],
  ['flip', 'Сальтуха', 1500, false],
  ['sleep', 'Сон', 5000, true],
  ['happy', 'Счастье', 3500, true],
  ['surprise', 'Удивление', 1600, false],
  ['interest', 'Интерес', 2800, false],
  ['thought', 'Задумчивость', 3400, false],
  ['content', 'Довольство', 3500, true],
  ['determined', 'Решимость', 2200, false]
].map(([id, label, duration, loop]) => ({ id, label, duration, loop }));

export const stage = { width: 360, height: 348, x: 180, ground: 302, margin: 12 };
const tau = 2 * Math.PI;
const radians = degrees => degrees * Math.PI / 180;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(value, max));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (value, start, end) => {
  const x = clamp((value - start) / (end - start));
  return x * x * (3 - 2 * x);
};
const windowed = (t, a, b, c, d) => smooth(t, a, b) * (1 - smooth(t, c, d));
const bump = (t, at, width) => Math.max(0, 1 - ((t - at) / width) ** 2) ** 2;

function motion(id, t, rigId) {
  const breath = Math.sin(Math.PI * t) ** 2;
  const jelly = rigId === 'jelly';
  const emotive = windowed(t, .05, .20, .76, .99);
  const pose = { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, eyes: 0, mouth: 0, gaze: 0, gesture: 0, strength: emotive };
  switch (id) {
    case 'idle':
      pose.sy += .028 * breath;
      pose.sx += .009 * breath;
      break;
    case 'blink':
      pose.eyes = windowed(t, .31, .41, .49, .67);
      break;
    case 'sway':
      pose.rotation = 7 * Math.sin(tau * t) * breath;
      pose.x = -4 * Math.sin(tau * t) * breath;
      break;
    case 'joy':
      pose.eyes = emotive;
      pose.mouth = emotive;
      pose.y = jelly ? 0 : -19 * bump(t, .49, .26);
      pose.sy += .075 * bump(t, .46, .24) - .065 * bump(t, .20, .13) - .055 * bump(t, .76, .15);
      pose.sx -= (pose.sy - 1) * .65;
      pose.gesture = emotive * Math.sin(tau * t * 1.5);
      break;
    case 'jump':
    case 'flip': {
      const air = clamp((t - (jelly && id === 'jump' ? .14 : .19)) / (jelly && id === 'jump' ? .58 : .60));
      pose.air = air;
      pose.y = -(id === 'flip' ? 101 : jelly ? 87 : 79) * Math.sin(Math.PI * air);
      pose.sy += .08 * bump(t, .25, .14) - .16 * bump(t, .135, .115) - .13 * bump(t, .84, .13);
      pose.sx -= (pose.sy - 1) * .68;
      if (id === 'jump') {
        pose.rotation = (jelly ? 0 : -4) * Math.sin(tau * air);
        pose.eyes = jelly ? windowed(t, .15, .26, .59, .75) : 0;
        pose.gesture = Math.sin(Math.PI * air);
      }
      break;
    }
    case 'sleep':
      pose.sy += .031 * breath;
      pose.sx += .012 * breath;
      break;
    case 'happy':
      pose.eyes = 1;
      pose.mouth = 1;
      pose.sy += .028 * breath;
      pose.sx += .012 * breath;
      pose.gesture = .36 * breath;
      break;
    case 'surprise':
      pose.sy += .072 * bump(t, .30, .26);
      pose.sx -= .025 * emotive;
      pose.mouth = emotive;
      pose.wide = emotive;
      break;
    case 'interest':
      pose.rotation = -6 * emotive;
      pose.gaze = .68 * emotive;
      pose.mouth = jelly ? emotive : 0;
      break;
    case 'thought':
      pose.rotation = -3 * emotive;
      pose.gaze = emotive;
      pose.mouth = emotive;
      pose.gesture = windowed(t, .13, .31, .72, .94);
      break;
    case 'content':
      pose.eyes = 1;
      pose.mouth = 1;
      pose.sy -= .015 + .014 * breath;
      pose.sx += .015 * breath;
      break;
    case 'determined':
      pose.eyes = .75 * emotive;
      pose.rotation = 2.5 * emotive;
      pose.mouth = emotive;
      break;
  }
  return pose;
}

function project(x, y, transform) {
  const [a, b, c, d, e, f] = transform;
  return [x * a + y * c + e, x * b + y * d + f];
}

function matrix(x, y, rotation, sx, sy, px = 0, py = 0) {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return [c * sx, s * sx, -s * sy, c * sy, x - px * c * sx + py * s * sy, y - px * s * sx - py * c * sy];
}

function multiply(outer, inner) {
  const [a, b, c, d, e, f] = outer;
  const [g, h, i, j, k, l] = inner;
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}

function union(a, b) {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

function transformedBox([x, y, w, h], transform) {
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].reduce((bounds, point) => {
    const [px, py] = project(...point, transform);
    return union(bounds, [px, py, px, py]);
  }, null);
}

const inks = {
  plant: '#142134', jelly: '#20190f', horn: '#2e1027', 'one-eye': '#191224',
  puff: '#2c183b', tongue: '#603425', duck: '#553214', slime: '#263407',
  frog: '#28360d', mouse: '#38242e', rat: '#352136', cat: '#4d241b',
  skeleton: '#271c21', skeletoness: '#28182e'
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.images = new Map();
    this.fits = new Map();
    this.debug = false;
    this.resize();
  }

  resize() {
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.canvas.width = stage.width * ratio;
    this.canvas.height = stage.height * ratio;
  }

  async load(rig) {
    const assets = [
      rig.neutral, rig.body, ...Object.values(rig.views),
      ...rig.limbs.map(part => part.art),
      ...rig.eyes.flatMap(eye => [eye.cover, eye.closed, eye.art]),
      ...rig.mouths.flatMap(mouth => [mouth.cover, mouth.joy, mouth.surprise, mouth.interest, mouth.content])
    ].filter(Boolean);
    await Promise.all(assets.map(({ src }) => {
      if (!this.images.has(src)) {
        const image = new Image();
        const ready = new Promise((resolve, reject) => {
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error(src));
        });
        this.images.set(src, { image, ready });
        image.src = src;
      }
      return this.images.get(src).ready;
    }));
  }

  geometry(rig, id, t) {
    const pose = motion(id, t, rig.id);
    const [, , w, h] = rig.neutral.box;
    const scale = Math.min(198 / w, 155 / h);
    const transform = matrix(pose.x, pose.y, radians(pose.rotation), pose.sx * scale, pose.sy * scale, ...rig.anchor);
    const figure = [];
    const joints = [];
    let bounds = null;
    let face = null;

    const add = (asset, matrix, alpha = 1) => {
      if (alpha <= 0) return;
      const rect = transformedBox(asset.box, matrix);
      bounds = union(bounds, rect);
      figure.push({ asset, matrix, alpha });
    };

    const turn = id === 'flip' ? pose.air : 0;
    const views = id === 'flip' && turn > 0 && turn < 1;
    const amount = views ? windowed(turn, .12, .27, .72, .87) : 0;
    if (id === 'sleep') {
      const asset = rig.views.sleep;
      const [x, y, aw, ah] = asset.box;
      const sleepScale = Math.min(w * scale * 1.015 / aw, h * scale * .98 / ah);
      add(asset, matrix(0, 0, 0, sleepScale * pose.sx, sleepScale * pose.sy * (rig.id === 'jelly' ? .80 : 1), x + aw / 2, y + ah));
    } else {
      const jellyThought = rig.id === 'jelly' && id === 'thought';
      const activeLimbs = rig.limbs.map((part, index) => {
        const [lo, hi] = part.range;
        const sign = part.pivot[0] < rig.anchor[0] ? -1 : 1;
        const rhythm = rig.gestures.includes(id) ? pose.gesture * sign * (index < 2 ? 1 : -.38) : 0;
        const angle = jellyThought ? (part.id === 'P2' ? lo * pose.gesture : 0)
          : clamp(rhythm * (rig.id === 'duck' ? 14 : 5), lo, hi);
        return { part, angle: part.art ? angle : 0 };
      });
      const thoughtPhases = [.10, .18, .29, .45, .70, .82, .90, 1];
      const thoughtIndex = jellyThought && thoughtPhases.findIndex(phase => t < phase);
      const reference = jellyThought && thoughtIndex > 0 && thoughtIndex < 7
        ? rig.views[`thought${thoughtIndex}`] : null;
      const articulated = activeLimbs.some(({ angle }) => Math.abs(angle) > .01);
      const neutralOpacity = 1 - amount;
      if (reference) {
        add(reference, transform);
      } else if (articulated && neutralOpacity === 1 && !jellyThought) {
        add(rig.body, transform);
        for (const { part, angle } of activeLimbs) {
          if (!part.art) continue;
          const local = matrix(...part.pivot, radians(angle), 1, 1, ...part.pivot);
          add(part.art, multiply(transform, local));
        }
      } else {
        const tilt = views ? 24 * Math.sin(tau * turn) : 0;
        const center = h * .48;
        const tilted = matrix(pose.x, pose.y - center * scale, radians(tilt), scale, scale,
          rig.anchor[0], rig.anchor[1] - center);
        add(rig.neutral, tilt ? tilted : transform, neutralOpacity);
      }
      if (amount > 0) {
        // Use the two drawn angles through the airborne phase. A small
        // interpolation around each angle bridges the source poses.
        const blend = smooth(turn, .46, .54);
        const shift = (turn - .5) * 18;
        for (const [name, opacity, tilt] of [['flip1', 1 - blend, lerp(-19, 15, turn)], ['flip2', blend, lerp(-14, 21, turn)]]) {
          const asset = rig.views[name];
          const [x, y, aw, ah] = asset.box;
          const viewScale = Math.min(w * scale * .94 / aw, h * scale * 1.03 / ah);
          add(asset, matrix(shift, pose.y - h * scale * .44, radians(tilt), viewScale, viewScale, x + aw / 2, y + ah / 2), amount * opacity);
        }
      } else {
        face = reference ? null : { transform, pose, id };
        for (const { part, angle } of activeLimbs) {
          const local = matrix(...part.pivot, radians(angle), 1, 1, ...part.pivot);
          joints.push({
            from: project(...part.pivot, transform),
            to: project(...part.tip, multiply(transform, local)),
            id: part.id,
            layered: Boolean(part.art)
          });
        }
      }
    }
    const effects = this.effects(rig, id, t, pose, bounds);
    const shrinking = 1 + pose.y * .0036;
    const shadow = [0, 2, 49 * shrinking, 5.7 * shrinking];
    bounds = union(bounds, [-shadow[2], shadow[1] - shadow[3], shadow[2], shadow[1] + shadow[3]]);
    for (const effect of effects) bounds = union(bounds, effect.bounds);
    return { figure, joints, face, effects, bounds, shadow };
  }

  effects(rig, id, t, pose, figure) {
    const effects = [];
    const [left, top, right, bottom] = figure;
    const dot = (x, y, r, color, alpha) => effects.push({ kind: 'dot', x, y, r, color, alpha, bounds: [x - r, y - r, x + r, y + r] });
    const text = (x, y, size, value, color, alpha) => effects.push({ kind: 'text', x, y, size, value, color, alpha, bounds: [x - 2, y - size - 2, x + size + 2, y + size * .3] });
    const line = (x, y, x2, y2, color, alpha, width = 3) => effects.push({
      kind: 'line', x, y, x2, y2, color, alpha, width,
      bounds: [Math.min(x, x2) - width, Math.min(y, y2) - width, Math.max(x, x2) + width, Math.max(y, y2) + width]
    });
    const pigment = '#b371df';
    if (id === 'flip' && t > .34 && t < .63) {
      const x = (left + right) / 2;
      const y = (top + bottom) / 2;
      const rx = (right - left) * .71 + 8;
      const ry = (bottom - top) * .71 + 8;
      effects.push({
        kind: 'vortex', x, y, rx, ry, angle: t * tau * 2.45,
        alpha: windowed(t, .34, .39, .57, .63),
        bounds: [x - rx - 3, y - ry - 3, x + rx + 3, y + ry + 3]
      });
    }
    if (id === 'surprise' || id === 'interest') {
      text(right + 9, top + 8, 37, id === 'surprise' ? '!' : '?', id === 'surprise' ? '#ba6306' : pigment, pose.strength);
    }
    if (id === 'thought') {
      for (let i = 0; i < 3; i++) {
        dot(right + 12 + i * 15, top + 13 - i * 12, 4 + 1.2 * i, pigment, windowed(t, .13 + i * .12, .22 + i * .12, .79, .97));
      }
    }
    if (id === 'sleep') {
      for (let i = 0; i < 3; i++) {
        const phase = (t + 1 - i / 3) % 1;
        text(right - 4 + 32 * phase, top + 16 - 46 * phase, 15 + 12 * phase, 'z', pigment, Math.sin(Math.PI * phase));
      }
    }
    if (rig.id === 'tongue' && ['joy', 'happy', 'jump'].includes(id)) {
      const alpha = id === 'happy' ? .55 + .45 * Math.sin(Math.PI * t) ** 2 : windowed(t, .14, .28, .68, .90);
      for (let i = 0; i < 3; i++) {
        const x = left - 8 - i * 8;
        const y = top + 15 + i * 10;
        line(x, y, x - 6 - i, y - 12 + i * 5, '#c98416', alpha);
      }
    } else if (id === 'joy' || id === 'happy') {
      const alpha = id === 'joy' ? pose.strength : .32 + .50 * Math.sin(Math.PI * t) ** 2;
      for (const [x, y] of [[left - 12, top + 18], [right + 12, top + 32]]) {
        line(x - 5, y, x + 5, y, '#b87909', alpha, 2);
        line(x, y - 5, x, y + 5, '#b87909', alpha, 2);
      }
    }
    return effects.filter(effect => effect.alpha > .001);
  }

  fit(rig, id) {
    const key = rig.id + '/' + id;
    if (this.fits.has(key)) return this.fits.get(key);
    let bounds = null;
    for (let i = 0; i <= 160; i++) bounds = union(bounds, this.geometry(rig, id, i / 160).bounds);
    const [left, top, right, bottom] = bounds;
    const fixed = Math.min(1, (stage.x - stage.margin) / Math.max(1, -left, right),
      (stage.ground - stage.margin) / Math.max(1, -top),
      (stage.height - stage.ground - stage.margin) / Math.max(1, bottom));
    this.fits.set(key, fixed);
    return fixed;
  }

  paintAsset(asset, alpha = 1, dx = 0, dy = 0) {
    const entry = this.images.get(asset.src);
    if (!entry?.image.naturalWidth || alpha <= 0) return;
    const [x, y, w, h] = asset.box;
    this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(entry.image, x + dx, y + dy, w, h);
    this.ctx.globalAlpha = 1;
  }

  paintFace(rig, face) {
    if (!face) return;
    const { ctx } = this;
    const { transform, pose, id } = face;
    if (!pose.eyes && !pose.gaze && !pose.mouth) return;
    ctx.save();
    ctx.transform(...transform);
    const ink = inks[rig.id] || '#301329';
    for (const [i, eye] of rig.eyes.entries()) {
      const [x, y, rx, ry] = eye.shape;
      if (pose.gaze > .01) {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, tau);
        ctx.clip();
        this.paintAsset(eye.cover, Math.min(1, pose.gaze * 3));
        this.paintAsset(eye.art, Math.min(1, pose.gaze * 3), rx * .035 * pose.gaze, -ry * .10 * pose.gaze);
        ctx.restore();
      }
      if (pose.wide > .01 && rig.id !== 'jelly') {
        const scale = 1 + .08 * pose.wide;
        ctx.save();
        ctx.translate(x, y - ry * .02 * pose.wide);
        ctx.scale(1.01, scale);
        ctx.translate(-x, -y);
        this.paintAsset(eye.art);
        ctx.restore();
      }
      if (pose.eyes <= .01) continue;
      if (id === 'determined') {
        // Preserve the painted iris and specular highlights under a soft squint.
        const amount = pose.eyes;
        this.paintAsset(eye.cover, Math.min(1, amount * 2.4));
        ctx.save();
        ctx.translate(x, y + ry * .08 * amount);
        ctx.scale(1, 1 - (i % 2 ? .22 : .30) * amount);
        ctx.translate(-x, -y);
        this.paintAsset(eye.art);
        ctx.restore();
        continue;
      }
      this.paintAsset(eye.closed, pose.eyes);
    }
    for (const mouth of rig.mouths) {
      if (pose.mouth <= .01) continue;
      const expressive = id === 'happy' ? 'joy' : id;
      if (mouth[expressive]) {
        this.paintAsset(mouth[expressive], pose.mouth);
        continue;
      }
      if (rig.id === 'duck' || (rig.id === 'tongue' && id === 'content')) continue;
      const hornJoy = rig.id === 'horn' && ['joy', 'happy'].includes(id);
      if (!['surprise', 'content', 'determined', 'thought'].includes(id) && !hornJoy) continue;
      const [x, y, rx, ry] = mouth.shape;
      this.paintAsset(mouth.cover, pose.mouth);
      ctx.globalAlpha = pose.mouth;
      ctx.strokeStyle = ctx.fillStyle = ink;
      ctx.lineWidth = clamp(rx * .14, 2, 4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (id === 'surprise' || hornJoy) {
        ctx.ellipse(x, y, rx * .29, ry * .46, 0, 0, tau);
        ctx.fill();
        ctx.fillStyle = '#ee9194';
        ctx.beginPath();
        ctx.ellipse(x, y + ry * .25, rx * .16, ry * .12, 0, 0, tau);
        ctx.fill();
      } else {
        const asymmetry = id === 'determined' ? -.35 : -.08;
        ctx.moveTo(x - rx * .45, y);
        ctx.quadraticCurveTo(x + rx * .11, y + ry * .47, x + rx * .52, y + ry * asymmetry);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  draw(rig, id, phase) {
    const t = clamp(phase);
    const { canvas, ctx } = this;
    const geometry = this.geometry(rig, id, t);
    const { figure, effects, joints, face, shadow } = geometry;
    const fit = this.fit(rig, id);
    ctx.setTransform(canvas.width / stage.width, 0, 0, canvas.height / stage.height, 0, 0);
    ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.save();
    ctx.translate(stage.x, stage.ground);
    ctx.scale(fit, fit);
    ctx.fillStyle = '#35234a40';
    ctx.beginPath();
    ctx.ellipse(...shadow, 0, 0, tau);
    ctx.fill();
    for (const { asset, matrix, alpha } of figure) {
      ctx.save();
      ctx.transform(...matrix);
      this.paintAsset(asset, alpha);
      ctx.restore();
    }
    this.paintFace(rig, face);
    for (const effect of effects) this.paintEffect(effect);
    if (this.debug) this.paintDebug(geometry.bounds, joints, figure);
    ctx.restore();
    const bounds = geometry.bounds.map((value, i) => value * fit + (i % 2 ? stage.ground : stage.x));
    return { bounds, fit };
  }

  paintEffect(effect) {
    const { ctx } = this;
    const { kind, x, y, color, alpha } = effect;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = ctx.strokeStyle = color || '#b971e9';
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (kind === 'text') {
      ctx.font = `800 ${effect.size}px system-ui, sans-serif`;
      ctx.fillText(effect.value, x, y);
    } else if (kind === 'dot') {
      ctx.arc(x, y, effect.r, 0, tau);
      ctx.fill();
    } else if (kind === 'line') {
      ctx.lineWidth = effect.width;
      ctx.moveTo(x, y);
      ctx.lineTo(effect.x2, effect.y2);
      ctx.stroke();
    } else {
      ctx.lineWidth = 2.6;
      for (const start of [effect.angle, effect.angle + Math.PI]) {
        ctx.beginPath();
        ctx.ellipse(x, y, effect.rx, effect.ry, 0, start, start + 1.72);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  paintDebug(bounds, joints, figure) {
    const { ctx } = this;
    const [l, t, r, b] = bounds;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#e25699';
    ctx.strokeRect(l, t, r - l, b - t);
    ctx.setLineDash([]);
    ctx.strokeStyle = '#9a66be';
    ctx.beginPath();
    ctx.moveTo(-145, 0);
    ctx.lineTo(145, 0);
    ctx.stroke();
    ctx.font = '10px system-ui';
    ctx.strokeStyle = '#19a59a';
    for (const { asset, matrix, alpha } of figure) {
      if (alpha < .4) continue;
      for (const contour of asset.outline || []) {
        ctx.beginPath();
        ctx.moveTo(...project(...contour[0], matrix));
        for (const point of contour.slice(1)) ctx.lineTo(...project(...point, matrix));
        ctx.closePath();
        ctx.stroke();
      }
    }
    for (const { from, to, id, layered } of joints) {
      ctx.fillStyle = ctx.strokeStyle = layered ? '#087ac3' : '#bd7b25';
      ctx.beginPath();
      ctx.moveTo(...from);
      ctx.lineTo(...to);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(...from, 2.5, 0, tau);
      ctx.fill();
      ctx.fillText(id, to[0] + 3, to[1] + 3);
    }
    ctx.restore();
  }
}
