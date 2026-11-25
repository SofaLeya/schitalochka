export const states = [
  ['idle', 'Дыхание', 3500, true],
  ['blink', 'Моргание', 800, false],
  ['sway', 'Покачивание', 1800, false],
  ['joy', 'Радость', 1500, false],
  ['jump', 'Прыжок', 1200, false],
  ['flip', 'Сальтуха', 1500, false],
  ['sleep', 'Сон', 5000, true, .16],
  ['happy', 'Счастье', 3500, true],
  ['surprise', 'Удивление', 1600, false],
  ['interest', 'Интерес', 2800, false],
  ['thought', 'Задумчивость', 3400, false],
  ['content', 'Довольство', 3500, true],
  ['determined', 'Решимость', 2200, false]
].map(([id, label, duration, loop, loopFrom = 0]) => ({ id, label, duration, loop, loopFrom }));

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
  const breath = t > 0 && t < 1 ? Math.sin(Math.PI * t) ** 2 : 0;
  const jelly = rigId === 'jelly';
  const emotive = windowed(t, .05, .20, .76, .99);
  const pose = { x: 0, y: 0, rotation: 0, sx: 1, sy: 1, eyes: 0, mouth: 0, gaze: 0, gesture: 0, strength: emotive };
  switch (id) {
    case 'idle':
      pose.sy += (rigId === 'slime' ? .021 : .011) * breath;
      pose.sx += (rigId === 'slime' ? .008 : .003) * breath;
      break;
    case 'blink':
      pose.eyes = windowed(t, .31, .41, .49, .67);
      break;
    case 'sway':
      pose.rotation = 4 * Math.sin(tau * t) * breath;
      pose.x = -2 * Math.sin(tau * t) * breath;
      break;
    case 'joy':
      pose.eyes = emotive;
      pose.mouth = emotive;
      pose.y = jelly ? 0 : -8 * bump(t, .49, .26);
      pose.sy += .030 * bump(t, .46, .24) - .037 * bump(t, .20, .13) - .025 * bump(t, .76, .15);
      pose.sx -= (pose.sy - 1) * .65;
      pose.gesture = emotive * (.6 + .4 * Math.sin(tau * t * 1.5));
      break;
    case 'jump':
    case 'flip': {
      const air = clamp((t - (jelly && id === 'jump' ? .14 : .19)) / (jelly && id === 'jump' ? .58 : .60));
      pose.air = air;
      const lift = air > 0 && air < 1 ? Math.sin(Math.PI * air) : 0;
      pose.y = -(id === 'flip' ? 93 : jelly ? 86 : 77) * lift;
      pose.sy += .035 * bump(t, .25, .14) - .082 * bump(t, .135, .115) - .073 * bump(t, .84, .13);
      pose.sx -= (pose.sy - 1) * .68;
      if (id === 'jump') {
        pose.rotation = !jelly && lift ? -4 * Math.sin(tau * air) : 0;
        pose.eyes = jelly ? windowed(t, .15, .26, .59, .75) : 0;
        pose.gesture = lift;
      }
      break;
    }
    case 'sleep':
      const asleep = clamp((t - .16) / .84);
      const restBreath = Math.sin(Math.PI * asleep) ** 2;
      pose.sy += .014 * restBreath;
      pose.sx += .004 * restBreath;
      break;
    case 'happy':
      pose.eyes = .76 + .24 * breath;
      pose.mouth = .85 + .15 * breath;
      pose.sy += .015 * breath;
      pose.sx += .004 * breath;
      pose.gesture = .36 * breath;
      break;
    case 'surprise':
      pose.sy += .027 * bump(t, .30, .26);
      pose.sx -= .010 * emotive;
      pose.mouth = emotive;
      // Keep the full painted aperture open, with no enlarged duplicate.
      break;
    case 'interest':
      pose.rotation = -4 * emotive;
      pose.gaze = .68 * emotive;
      pose.mouth = emotive;
      break;
    case 'thought':
      pose.rotation = -2 * emotive;
      pose.gaze = emotive;
      pose.mouth = emotive;
      pose.gesture = windowed(t, .13, .31, .72, .94);
      break;
    case 'content':
      pose.eyes = jelly ? 1 : .14 + .09 * breath;
      pose.mouth = jelly ? 1 : .62;
      pose.sy -= .005 + .009 * breath;
      pose.sx += .003 * breath;
      break;
    case 'determined':
      pose.eyes = jelly ? 0 : .28 * emotive;
      pose.rotation = 2 * emotive;
      pose.mouth = jelly ? 0 : emotive;
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

const functions = {
  front: 'передняя', side: 'боковая', support: 'опорная',
  tentacle: 'щупальце', arm: 'рука', leg: 'нога', wing: 'крыло'
};

function layerBounds(asset, transform) {
  if (!asset.outline?.length) return transformedBox(asset.box, transform);
  let bounds = null;
  for (const outline of asset.outline) {
    for (const point of outline) {
      const [x, y] = project(...point, transform);
      bounds = union(bounds, [x, y, x, y]);
    }
  }
  // The polygon follows opaque pixels. Reserve the edge pixel and the
  // antialias fringe without grounding the empty corner of a rotated box.
  const margin = 1.5 * Math.max(Math.hypot(transform[0], transform[1]), Math.hypot(transform[2], transform[3]));
  return [bounds[0] - margin, bounds[1] - margin, bounds[2] + margin, bounds[3] + margin];
}

function tile(atlas, phase) {
  const index = clamp(Math.round(phase * (atlas.tiles.length - 1)), 0, atlas.tiles.length - 1);
  const [sx, sy, x, y, w, h] = atlas.tiles[index];
  return { src: atlas.src, crop: [sx, sy, w, h], box: [x, y, w, h], index };
}

function shiftY(transform, offset) {
  transform[5] += offset;
}

export function transitionPhases(rig, id) {
  if (id === 'flip') {
    const views = rig.turn.angles.slice(1, -1).map(angle => {
      let lo = .075;
      let hi = .925;
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (smooth(mid, .075, .925) < angle / 360) lo = mid;
        else hi = mid;
      }
      return .19 + .60 * (lo + hi) / 2;
    });
    return [.19, .235, ...views, .745, .79];
  }
  if (id === 'sleep') return [.16];
  if (id === 'thought' && rig.ponder) return [.08, .17, .29, .40, .63, .76, .89, .97];
  if (id === 'blink') return [.31, .41, .49, .67];
  return [];
}

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

  async load(rig, { releaseOtherRigs = false } = {}) {
    const assets = [
      rig.neutral, rig.body, rig.turn, rig.rest, rig.ponder,
      ...rig.limbs.flatMap(part => [part.art, part.flex]),
      ...rig.eyes.flatMap(({ blink, interest, thought, content }) => [blink, interest, thought, content]),
      ...rig.mouths.flatMap(({ expressions }) => Object.values(expressions))
    ].filter(Boolean);
    if (releaseOtherRigs) {
      const active = new Set(assets.map(asset => asset.src));
      for (const src of this.images.keys()) {
        if (!active.has(src)) this.images.delete(src);
      }
    }
    await Promise.all(assets.map(({ src }) => {
      if (!this.images.has(src)) {
        const image = new Image();
        const ready = new Promise((resolve, reject) => {
          image.onload = () => resolve(image);
          image.onerror = () => {
            if (this.images.get(src)?.image === image) this.images.delete(src);
            reject(new Error(src));
          };
        });
        this.images.set(src, { image, ready });
        image.src = src;
      }
      return this.images.get(src).ready;
    }));
  }

  geometry(rig, id, t) {
    const pose = motion(id, t, rig.id);
    const [, , width, height] = rig.neutral.box;
    const scale = Math.min(198 / width, 155 / height);
    const base = matrix(pose.x, pose.y, radians(pose.rotation), pose.sx * scale, pose.sy * scale, ...rig.anchor);
    const figure = [];
    const joints = [];
    let face = null;
    const add = (asset, transform) => figure.push({ asset, matrix: transform, alpha: 1 });
    const standing = id !== 'flip' || pose.air <= 0 || pose.air >= 1;

    const angles = rig.turn.angles;
    if (id === 'flip' && !standing) {
      const roll = smooth(pose.air, .075, .925);
      const angle = roll * 360;
      const upper = angles.findIndex(value => value >= angle);
      const segment = clamp(upper - 1, 0, angles.length - 2);
      const segmentPhase = clamp((angle - angles[segment]) / (angles[segment + 1] - angles[segment]));
      const view = tile(rig.turn, (segment + segmentPhase) / (angles.length - 1));
      const unit = scale / rig.turn.pixelsPerUnit;
      const centerY = pose.y - pose.sy * height * scale / 2;
      add(view, matrix(0, centerY, radians(angle), unit * pose.sx, unit * pose.sy, ...rig.turn.anchor));
    } else if (id === 'sleep' && t > 0) {
      const unit = scale / rig.rest.pixelsPerUnit;
      add(tile(rig.rest, smooth(t, 0, .16)), matrix(0, 0, 0, unit * pose.sx, unit * pose.sy, ...rig.rest.anchor));
    } else if (rig.ponder && id === 'thought' && t > .08 && t < .97) {
      const marks = transitionPhases(rig, id);
      const end = marks.findIndex(mark => mark >= t);
      const p = clamp((t - marks[end - 1]) / (marks[end] - marks[end - 1]));
      const unit = scale / rig.ponder.pixelsPerUnit;
      add(tile(rig.ponder, (end - 1 + p) / (marks.length - 1)),
        matrix(0, 0, 0, unit, unit, ...rig.ponder.anchor));
      // Annotate the actual existing P2 through the painted gesture phases.
      const active = windowed(t, .08, .42, .63, .97);
      for (const part of rig.limbs) {
        const [x, y] = part.pivot;
        const [fx, fy] = part.tip;
        const goal = part.id === 'P2' ? [253, 143] : part.tip;
        const tx = lerp(fx, goal[0], active);
        const ty = lerp(fy, goal[1], active);
        joints.push({ part, from: project(x, y, base), to: project(tx, ty, base), visible: true });
      }
    } else {
      const parts = rig.limbs.map(part => {
        const degrees = part.art ? clamp((part.motion[id] || 0) * pose.gesture, ...part.range) : 0;
        const local = matrix(...part.pivot, radians(degrees), 1, 1, ...part.pivot);
        const transform = multiply(base, local);
        return { part, degrees, transform };
      });
      const articulated = parts.some(({ degrees }) => Math.abs(degrees) > .001);
      add(articulated ? rig.body : rig.neutral, base.slice());
      for (const { part, degrees, transform } of parts) {
        const flex = part.flex && Math.abs(degrees) > .001;
        if (articulated && part.art) {
          const progress = .5 + .5 * degrees / Math.max(...part.range.map(Math.abs));
          add(flex ? tile(part.flex, progress) : part.art, transform);
        }
        const bend = part.joint && flex
          ? matrix(...part.joint, radians(degrees * .32), 1, 1, ...part.joint) : null;
        joints.push({
          part, from: project(...part.pivot, base), to: project(...part.tip, bend ? multiply(transform, bend) : transform),
          bend: part.joint ? project(...part.joint, transform) : null, visible: true,
        });
      }
      if (id !== 'sleep') face = { transform: base, pose, id };
    }

    const measure = () => figure.reduce((bounds, { asset, matrix: transform }) =>
      union(bounds, layerBounds(asset, transform)), null);
    let silhouette = measure();
    const groundMotion = pose.y >= -.02;
    const offset = groundMotion ? -silhouette[3] : Math.min(0, -silhouette[3]);
    if (Math.abs(offset) > .001) {
      for (const layer of figure) shiftY(layer.matrix, offset);
      if (face) shiftY(face.transform, offset);
      for (const joint of joints) {
        joint.from[1] += offset;
        joint.to[1] += offset;
        if (joint.bend) joint.bend[1] += offset;
      }
      silhouette = measure();
    }
    const effects = this.effects(rig, id, t, pose, silhouette);
    const shrinking = 1 + pose.y * .0036;
    const shadow = [0, 3, width * scale * .27 * shrinking, 5.7 * shrinking];
    return { figure, joints, face, effects, silhouette, bounds: silhouette, shadow };
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
        const progress = clamp((t - .16) / .84);
        const phase = (progress + 1 - i / 3) % 1;
        text(right - 4 + 32 * phase, top + 16 - 46 * phase, 15 + 12 * phase,
          'z', pigment, Math.sin(Math.PI * phase) * smooth(t, .04, .16));
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

  fit(rig) {
    const key = rig.id;
    if (this.fits.has(key)) return this.fits.get(key);
    let bounds = null;
    for (const state of states) {
      for (let i = 0; i <= 120; i++) bounds = union(bounds, this.geometry(rig, state.id, i / 120).silhouette);
    }
    const [left, top, right, bottom] = bounds;
    const fixed = Math.min(1, (stage.x - 27) / Math.max(1, -left, right),
      (stage.ground - 35) / Math.max(1, -top),
      (stage.height - stage.ground - stage.margin) / Math.max(1, bottom));
    this.fits.set(key, fixed);
    return fixed;
  }

  paintAsset(asset) {
    const { image } = this.images.get(asset.src) ?? {};
    if (!image?.naturalWidth) return;
    if (asset.crop) this.ctx.drawImage(image, ...asset.crop, ...asset.box);
    else this.ctx.drawImage(image, ...asset.box);
  }

  paintFace(rig, face) {
    if (!face) return;
    const { transform, pose, id } = face;
    if (!pose.eyes && !pose.gaze && !pose.mouth) return;
    const { ctx } = this;
    ctx.save();
    ctx.transform(...transform);
    // Each atlas tile already contains one final, masked feature in the
    // neutral coordinate system. There is no secondary translated eye.
    for (const eye of rig.eyes) {
      if (pose.gaze > .01) this.paintAsset(tile(eye[id], pose.gaze));
      if (pose.eyes > .01) this.paintAsset(tile(id === 'content' && eye.content ? eye.content : eye.blink, pose.eyes));
    }
    for (const mouth of rig.mouths) {
      const art = mouth.expressions[id === 'happy' ? 'joy' : id];
      if (art && pose.mouth > .01) this.paintAsset(tile(art, pose.mouth));
    }
    ctx.restore();
  }

  placeEffects(effects, fit) {
    const limits = [(9 - stage.x) / fit, (9 - stage.ground) / fit,
      (stage.width - 9 - stage.x) / fit, (stage.height - 9 - stage.ground) / fit];
    return effects.map(effect => {
      const [l, t, r, b] = effect.bounds;
      if (effect.kind === 'vortex') {
        const rx = Math.min(effect.rx, effect.x - limits[0] - 4, limits[2] - effect.x - 4);
        const ry = Math.min(effect.ry, effect.y - limits[1] - 4, limits[3] - effect.y - 4);
        if (rx <= 0 || ry <= 0) return null;
        return { ...effect, rx, ry, bounds: [effect.x - rx - 3, effect.y - ry - 3,
          effect.x + rx + 3, effect.y + ry + 3] };
      }
      const dx = Math.max(0, limits[0] - l) - Math.max(0, r - limits[2]);
      const dy = Math.max(0, limits[1] - t) - Math.max(0, b - limits[3]);
      return { ...effect, x: effect.x + dx, y: effect.y + dy,
        x2: effect.x2 + dx, y2: effect.y2 + dy, bounds: [l + dx, t + dy, r + dx, b + dy] };
    }).filter(Boolean);
  }

  draw(rig, id, phase) {
    const t = clamp(phase);
    const { canvas, ctx } = this;
    const geometry = this.geometry(rig, id, t);
    const { figure, joints, face, shadow } = geometry;
    const fit = this.fit(rig);
    const effects = this.placeEffects(geometry.effects, fit);
    const drawnBounds = effects.reduce((bounds, effect) => union(bounds, effect.bounds), geometry.bounds);
    ctx.setTransform(canvas.width / stage.width, 0, 0, canvas.height / stage.height, 0, 0);
    ctx.clearRect(0, 0, stage.width, stage.height);
    ctx.save();
    ctx.translate(stage.x, stage.ground);
    ctx.scale(fit, fit);
    ctx.fillStyle = '#35234a40';
    ctx.beginPath();
    ctx.ellipse(...shadow, 0, 0, tau);
    ctx.fill();
    for (const { asset, matrix } of figure) {
      ctx.save();
      ctx.transform(...matrix);
      this.paintAsset(asset);
      ctx.restore();
    }
    this.paintFace(rig, face);
    for (const effect of effects) this.paintEffect(effect);
    if (this.debug) this.paintDebug(drawnBounds, joints, figure, rig, id, face);
    ctx.restore();
    const bounds = drawnBounds.map((value, i) => value * fit + (i % 2 ? stage.ground : stage.x));
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

  paintDebug(bounds, joints, figure, rig, id, face) {
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
    for (const { asset, matrix } of figure) {
      const [x, y, w, h] = asset.box;
      const rectangle = [[[x, y], [x + w, y], [x + w, y + h], [x, y + h]]];
      for (const contour of asset.outline?.length ? asset.outline : rectangle) {
        ctx.beginPath();
        ctx.moveTo(...project(...contour[0], matrix));
        for (const point of contour.slice(1)) ctx.lineTo(...project(...point, matrix));
        ctx.closePath();
        ctx.stroke();
      }
    }
    for (const { from, to, bend, part } of joints) {
      ctx.fillStyle = ctx.strokeStyle = part.art ? '#087ac3' : '#bd7b25';
      ctx.beginPath();
      ctx.moveTo(...from);
      if (bend) ctx.lineTo(...bend);
      ctx.lineTo(...to);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(...from, 2.5, 0, tau);
      ctx.fill();
      if (bend) {
        ctx.beginPath();
        ctx.arc(...bend, 2, 0, tau);
        ctx.fill();
      }
      ctx.fillText(`${part.id} · ${functions[part.function]}`, to[0] + 3, to[1] + 3);
    }
    if (face) {
      ctx.save();
      ctx.transform(...face.transform);
      ctx.strokeStyle = '#f9a530';
      for (const [{ shape: [x, y, rx, ry] }, color] of [
        ...rig.eyes.map(eye => [eye, '#d38d28']),
        ...rig.mouths.map(mouth => [mouth, '#b55ba7'])
      ]) {
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, tau);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#9761ae';
    if (rig.occluded.length) ctx.fillText(`Скрыты: ${rig.occluded.join(', ')}`, -145, 23);
    if (!joints.length && (id === 'flip' || id === 'sleep')) {
      ctx.fillText('Видимость по исходному ракурсу', -145, 36);
    }
    ctx.restore();
  }
}
