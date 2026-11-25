import { Renderer, states } from './engine.js';
import { rigs } from './rigs.js';

const get = id => document.getElementById(id);
const renderer = new Renderer(get('stage'));
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const stageSelect = get('character');
const slider = get('phase');
const pauseButton = get('pause');
const sequenceButton = get('sequence');
const allowedKeys = new Set(rigs.flatMap(rig => states.map(state => `${rig.id}/${state.id}`)));
const storageKey = 'schitalochka-monster-catalog-review-v1';
const reviewRevision = 2;
const statusLabels = { pending: 'К повторной приёмке', approved: 'Согласовано', revise: 'На правку' };
const buttons = new Map();
const clock = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let reviews = readReviews();
let rig = rigs[0];
let selection = 0;
let elapsed = 0;
let paused = motion.matches;
let sequence = false;
let ready = false;
let request = 0;
let generation = 0;
let lastTime = null;

function checkedSnapshot(data, fallback = 1) {
  const revision = data?.revision ?? fallback;
  if (!Object.hasOwn(statusLabels, data?.status) || typeof data.note !== 'string' ||
      data.note.length > 12000 || !Number.isInteger(revision) || revision < 1 || revision > reviewRevision) {
    throw new Error('Некорректный статус, заметка или редакция.');
  }
  return { revision, status: data.status, note: data.note };
}

function uniqueHistory(entries) {
  return [...new Map(entries.map(entry => [JSON.stringify(entry), entry])).values()];
}

function checkedReviews(value) {
  if (value?.version !== 1 || !value.reviews || Array.isArray(value.reviews) || typeof value.reviews !== 'object') {
    throw new Error('В файле ожидается экспорт каталога версии 1.');
  }
  const accepted = Object.create(null);
  for (const [key, data] of Object.entries(value.reviews)) {
    if (!allowedKeys.has(key) || (data?.history !== undefined && !Array.isArray(data.history))) {
      throw new Error(`Некорректная запись «${key}».`);
    }
    const snapshot = checkedSnapshot(data);
    const history = (data.history || []).map(entry => checkedSnapshot(entry));
    accepted[key] = snapshot.revision < reviewRevision
      ? { revision: reviewRevision, status: 'pending', note: snapshot.note, history: uniqueHistory([...history, snapshot]) }
      : { ...snapshot, history: uniqueHistory(history) };
  }
  return accepted;
}

function mergeReviews(old, incoming) {
  const combined = Object.assign(Object.create(null), old);
  for (const [key, entry] of Object.entries(incoming)) {
    const previous = old[key];
    if (!previous) {
      combined[key] = entry;
      continue;
    }
    const preserveCurrent = entry.status === 'pending' && entry.history.some(item => item.revision < reviewRevision)
      && previous.status !== 'pending';
    const primary = preserveCurrent ? previous : entry;
    const secondary = preserveCurrent ? entry : previous;
    const history = [...previous.history, ...entry.history];
    if (secondary.status !== 'pending' || (secondary.note && secondary.note !== primary.note)) {
      history.push(checkedSnapshot(secondary));
    }
    combined[key] = { ...primary, history: uniqueHistory(history) };
  }
  return combined;
}

function readReviews() {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return checkedReviews(JSON.parse(saved));
  } catch {
    // Invalid or unavailable storage leaves the catalog reviewable in memory.
  }
  return Object.create(null);
}

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ version: 1, reviews }));
    return true;
  } catch {
    get('review-message').textContent = 'Браузер не сохранил замечания. Экспортируйте JSON.';
    return false;
  }
}

function reviewKey(state = states[selection]) {
  return `${rig.id}/${state.id}`;
}

function updateReviews(updateNote = true) {
  const entry = reviews[reviewKey()];
  const approved = Object.values(reviews).filter(review => review.status === 'approved').length;
  get('progress').textContent = `${approved} / ${allowedKeys.size} согласовано`;
  get('review-state').textContent = statusLabels[entry?.status || 'pending'];
  if (updateNote) get('note').value = entry?.note || '';
  const history = entry?.history || [];
  get('review-history').hidden = !history.length;
  get('history-items').replaceChildren(...history.map(item => {
    const li = document.createElement('li');
    const label = item.revision === 1 && item.status === 'pending' ? 'К приёмке' : statusLabels[item.status];
    li.textContent = `Редакция ${item.revision} · ${label}${item.note ? ` · ${item.note}` : ''}`;
    return li;
  }));
  for (const state of states) {
    const button = buttons.get(state.id);
    const status = reviews[reviewKey(state)]?.status || 'pending';
    button.setAttribute('aria-pressed', String(states[selection] === state));
    button.setAttribute('aria-label', `${state.label}. ${statusLabels[status]}`);
    button.lastChild.dataset.mark = status;
    button.lastChild.textContent = status === 'approved' ? '✓' : status === 'revise' ? '!' : '';
  }
}

function setReview(status) {
  const key = reviewKey();
  const note = get('note').value;
  const previous = reviews[key];
  const history = [...(previous?.history || [])];
  if (previous && previous.status !== 'pending' && previous.status !== status) history.push(checkedSnapshot(previous));
  if (status === 'pending' && !note && !history.length) delete reviews[key];
  else reviews[key] = { revision: reviewRevision, status, note, history: uniqueHistory(history) };
  get('review-message').textContent = '';
  persist();
  updateReviews(false);
}

function display() {
  if (!ready) return;
  const state = states[selection];
  const finished = !state.loop && elapsed > state.duration;
  const phase = finished ? ((elapsed - state.duration) % states[0].duration) / states[0].duration
    : Math.min(1, elapsed / state.duration);
  const active = finished ? states[0] : state;
  renderer.draw(rig, active.id, phase);
  const playing = finished ? `${state.label} · снова дыхание` : state.label;
  if (get('playing').textContent !== playing) get('playing').textContent = playing;
  slider.value = finished ? 1000 : Math.round(phase * 1000);
  get('time').textContent = `${clock.format(Math.min(elapsed, state.duration) / 1000)} с`;
  slider.setAttribute('aria-valuetext', get('time').textContent);
}

function stopClock() {
  cancelAnimationFrame(request);
  request = 0;
  lastTime = null;
}

function updatePlayback() {
  pauseButton.textContent = paused ? 'Продолжить' : 'Пауза';
  sequenceButton.setAttribute('aria-pressed', String(sequence));
  sequenceButton.textContent = sequence ? 'Остановить показ' : 'Все подряд';
}

function tick(now) {
  request = 0;
  if (paused || !ready) return;
  if (lastTime !== null) elapsed += Math.min(100, now - lastTime);
  lastTime = now;
  const state = states[selection];
  if (elapsed >= state.duration) {
    if (sequence) {
      const next = selection + 1;
      if (next === states.length) {
        sequence = false;
        updatePlayback();
      }
      setState(next % states.length);
      return;
    }
    if (state.loop) {
      const start = state.loopFrom * state.duration;
      elapsed = start + (elapsed - start) % (state.duration - start);
    } else if (elapsed > state.duration + states[0].duration) {
      elapsed = state.duration + (elapsed - state.duration) % states[0].duration;
    }
  }
  display();
  request = requestAnimationFrame(tick);
}

function refresh() {
  stopClock();
  updatePlayback();
  display();
  if (!paused && ready) request = requestAnimationFrame(tick);
}

function setState(index) {
  selection = index;
  elapsed = 0;
  get('playing').textContent = states[selection].label;
  updateReviews();
  refresh();
}

async function setCharacter(index) {
  const loading = ++generation;
  ready = false;
  sequence = false;
  paused = motion.matches;
  elapsed = 0;
  rig = rigs[index];
  stageSelect.value = rig.id;
  stopClock();
  updatePlayback();
  updateReviews();
  get('name').textContent = rig.name;
  get('playing').textContent = states[selection].label;
  get('anatomy').textContent = `${rig.notes} ${rig.motionRule}`;
  get('flip-source').textContent = `Сальтуха. ${rig.flipSource}.`;
  get('uncertainties').replaceChildren(...rig.review.map(note => {
    const item = document.createElement('li');
    item.textContent = note;
    return item;
  }));
  get('reference-link').href = rig.reference;
  get('reference').src = rig.reference;
  get('reference').alt = `Концепт-лист «${rig.name}»`;
  get('asset-status').textContent = 'Загрузка слоёв…';
  get('stage').getContext('2d').clearRect(0, 0, get('stage').width, get('stage').height);
  try {
    await renderer.load(rig, { releaseOtherRigs: true });
    if (loading !== generation) return;
    ready = true;
    get('asset-status').textContent = '';
    refresh();
  } catch (error) {
    if (loading !== generation) return;
    get('asset-status').textContent = `Не удалось загрузить ресурс ${error.message}`;
  }
}

rigs.forEach(character => stageSelect.add(new Option(character.name, character.id)));
for (const [index, state] of states.entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  const mark = document.createElement('span');
  mark.setAttribute('aria-hidden', 'true');
  button.append(state.label, mark);
  button.addEventListener('click', () => {
    sequence = false;
    paused = motion.matches;
    setState(index);
  });
  get('moves').append(button);
  buttons.set(state.id, button);
}

stageSelect.addEventListener('change', () => setCharacter(stageSelect.selectedIndex));
get('previous').onclick = () => setCharacter((stageSelect.selectedIndex + rigs.length - 1) % rigs.length);
get('next').onclick = () => setCharacter((stageSelect.selectedIndex + 1) % rigs.length);
get('replay').onclick = () => {
  sequence = false;
  paused = false;
  setState(selection);
};
pauseButton.onclick = () => {
  paused = !paused;
  refresh();
};
sequenceButton.onclick = () => {
  sequence = !sequence;
  paused = !sequence;
  if (sequence) setState(0);
  else refresh();
};
slider.oninput = () => {
  paused = true;
  sequence = false;
  elapsed = Number(slider.value) / 1000 * states[selection].duration;
  refresh();
};
get('dark').onchange = event => get('picture').classList.toggle('dark', event.target.checked);
get('guides').onchange = event => {
  renderer.debug = event.target.checked;
  display();
};
motion.addEventListener('change', () => {
  if (!motion.matches) return;
  paused = true;
  sequence = false;
  refresh();
});
window.addEventListener('resize', () => {
  renderer.resize();
  display();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopClock();
  else refresh();
});
get('note').maxLength = 12000;
get('note').oninput = () => setReview(reviews[reviewKey()]?.status || 'pending');
get('approve').onclick = () => setReview('approved');
get('revise').onclick = () => setReview('revise');
get('reset-review').onclick = () => setReview('pending');
get('export').onclick = () => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, reviews }, null, 2)], { type: 'application/json' }));
  link.download = 'monster-review.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
};
get('import').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const imported = checkedReviews(JSON.parse(await file.text()));
    reviews = mergeReviews(reviews, imported);
    const saved = persist();
    updateReviews();
    if (saved) get('review-message').textContent = `Импортировано записей: ${Object.keys(imported).length}.`;
  } catch (error) {
    get('review-message').textContent = `Импорт не выполнен. ${error.message}`;
  } finally {
    event.target.value = '';
  }
};

setCharacter(0);
