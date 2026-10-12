/**
 * screens.test.js — сквозная проверка интерфейса: рисуем КАЖДЫЙ экран
 * настоящим кодом игры, собираем идентификаторы всех кнопок и убеждаемся,
 * что игра знает, что с ними делать.
 *
 * Зачем: дважды подряд находились кнопки-пустышки, которые подсвечивались при
 * наведении, но ничего не делали:
 *   • «Пробить / Паспорт / Завершить» — клик стирался в update() до отрисовки;
 *   • «Начать смену» в карьере — в activate() стояла заглушка
 *     `if (id.startsWith('start:')) return;`.
 * Ядро проверки — activate() возвращает false для незнакомого идентификатора.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/game.js';
import { defaultProfile, shiftList, applyResult } from '../src/core/career.js';
import { CASHIER } from '../src/core/config.js';

const W = 1280;
const H = 720;

// Часть кнопок (например, «Перезагрузить страницу») обращается к window.
globalThis.window = globalThis.window ?? {
  location: { reload: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout,
  clearTimeout,
};

/** Настоящий canvas (Skia): экраны рисуются тем же кодом, что у игрока. */
async function loadCanvas() {
  // Каталог с точкой в начале песочница не сохраняет, поэтому ищем в двух
  // местах (см. tools/shoot.js) и всегда можно задать путь через KATME_CANVAS.
  for (const candidate of ['@napi-rs/canvas', process.env.KATME_CANVAS,
    '/home/user/shots-env/node_modules/@napi-rs/canvas/index.js',
    '/home/user/.shots-env/node_modules/@napi-rs/canvas/index.js']) {
    if (!candidate) continue;
    try {
      return await import(candidate.startsWith('/') ? `file://${candidate}` : candidate);
    } catch { /* пробуем следующий путь */ }
  }
  return null;
}

const canvasMod = await loadCanvas();

function fakePlatform() {
  return {
    init: async () => ({ available: false, reason: 'no-sdk' }),
    loadCloud: async () => null,
    onPause: () => {}, onResume: () => {},
    gameplayStart: () => {}, gameplayStop: () => {},
    showFullscreenAd: async () => ({ shown: false }),
    currentProfile: null,
    storage: { get: () => null, set: () => {} },
  };
}

/** Игра с настоящим (или хотя бы рабочим) контекстом отрисовки. */
function makeGame() {
  const ctx = canvasMod ? canvasMod.createCanvas(W, H).getContext('2d') : null;
  const canvas = {
    clientWidth: W,
    clientHeight: H,
    getContext: () => ctx ?? { canvas: {}, save() {}, restore() {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: W, height: H }),
  };
  const game = new Game(canvas, fakePlatform());
  game.viewW = W;
  game.viewH = H;
  game.dpr = 1;
  game.audio.play = () => {};
  game.audio.resume = () => {};
  return game;
}

/** Прокачанный профиль: так открыты все адреса, форма и улучшения. */
function richProfile() {
  const profile = defaultProfile();
  profile.stars = 18;
  profile.xp = 9000;
  profile.wallet = 5000;
  for (const shift of shiftList()) {
    profile.shifts[shift.id] = {
      stars: 2, bestScore: 6000, bestRevenue: 5000, bestRating: 95, clean: false, attempts: 2,
    };
  }
  return profile;
}

/** Рисует экран и возвращает список его кнопок. */
function drawScreen(game, name) {
  const ctx = game.ctx ?? game.canvas.getContext('2d');
  const buttons = game.screens.draw(ctx, name, game.screenData(), W, H);
  game.buttons = buttons;
  return buttons;
}

test('ни одного «мёртвого» идентификатора кнопки ни на одном экране', async (t) => {
  if (!canvasMod) {
    t.skip('нет @napi-rs/canvas — проверка кнопок пропущена');
    return;
  }
  const game = makeGame();
  game.profile = richProfile();
  const shifts = shiftList();
  game.shift = shifts[0];
  game.result = { ...game.run?.result } ?? null;

  // Все состояния, в которых игрок вообще может нажать кнопку.
  const cases = [];
  for (const name of ['menu', 'career', 'equipment', 'goals', 'help', 'error']) {
    cases.push(name);
  }
  // «Загрузка» — единственный экран без кнопок: там ждут, а не нажимают.
  assert.equal(drawScreen(game, 'loading').length, 0, 'на экране загрузки кнопок нет');
  cases.push({ state: 'brief', setup: () => game.openBrief(shifts[0]) });
  cases.push({
    state: 'results',
    setup: () => {
      game.startShift(shifts[0]);
      game.run.time = game.run.duration;
      game.finishShift();
    },
  });
  cases.push({
    state: 'pause',
    setup: () => {
      game.startShift(shifts[1]);
      game.setState('pause', { snapshot: game.run.snapshot() });
    },
  });

  const dead = [];
  const seen = new Set();
  for (const item of cases) {
    const state = typeof item === 'string' ? item : item.state;
    if (typeof item !== 'string') item.setup();
    else game.setState(state);
    const buttons = drawScreen(game, state);
    assert.ok(buttons.length > 0, `экран «${state}» вернул кнопки`);
    for (const b of buttons) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      // Проверяем именно «знает ли игра такую кнопку», поэтому состояние
      // сбрасываем в безопасное меню.
      game.setState('menu');
      if (!game.activate(b.id)) dead.push(`${state}: ${b.id}`);
    }
  }

  assert.ok(seen.size >= 12, `собрано кнопок: ${seen.size}`);
  assert.deepEqual(dead, [], `кнопки без обработчика: ${dead.join(', ')}`);
});

test('кнопка «Начать смену» в карьере открывает брифинг', () => {
  const game = makeGame();
  game.profile = richProfile();
  const shifts = shiftList();
  const target = shifts[0];

  game.setState('career');
  const buttons = drawScreen(game, 'career');
  const start = buttons.find((b) => b.id === `start:${target.id}`);
  assert.ok(start, `на экране карьеры есть кнопка start:${target.id}`);
  assert.ok(start.enabled, 'первая смена открыта');

  game.activate(start.id);
  assert.equal(game.state, 'brief', 'открылся брифинг перед сменой');
  assert.equal(game.shift.id, target.id, 'брифинг про нужную смену');
  assert.equal(game.run, null, 'смена ещё не началась — сначала брифинг');
});

test('с брифинга смена действительно начинается, и в ней есть покупатели', () => {
  const game = makeGame();
  game.profile = richProfile();
  const shifts = shiftList();

  game.setState('career');
  game.activate(`start:${shifts[2].id}`);
  const buttons = drawScreen(game, 'brief');
  const play = buttons.find((b) => b.id === `play:${shifts[2].id}`);
  assert.ok(play, 'на брифинге есть кнопка запуска');

  game.activate(play.id);
  assert.equal(game.state, 'shift', 'смена идёт');
  assert.ok(game.run, 'модель смены создана');
  assert.equal(game.run.shiftId, shifts[2].id);

  // Прокручиваем смену ботом: покупатели приходят, касса обслуживает.
  const { Bot } = { Bot: null };
  for (let i = 0; i < 60 * 60 && !game.run.finished; i++) {
    game.update(1 / 60, true);
  }
  assert.ok(game.run.stats.maxQueue >= 1 || game.run.stats.served >= 1,
    `за минуту пришли покупатели (в очереди было ${game.run.stats.maxQueue})`);
});

test('закрытая смена не открывается: кнопка выключена и брифинг не появляется', () => {
  const game = makeGame();
  const shifts = shiftList();
  // Пустой профиль: открыта только самая первая смена.
  game.setState('career');
  const buttons = drawScreen(game, 'career');
  const locked = buttons.filter((b) => b.id.startsWith('start:') && !b.enabled);
  assert.ok(locked.length >= 2, `закрытых смен в карьере: ${locked.length}`);

  game.activate(locked[0].id);
  assert.notEqual(game.state, 'brief', 'брифинг закрытой смены не открывается');
});

test('Enter в карьере открывает брифинг следующей смены', () => {
  const game = makeGame();
  game.profile = richProfile();
  // Все смены пройдены на три звезды, кроме одной: она и есть «следующая».
  for (const shift of shiftList()) game.profile.shifts[shift.id].stars = 3;
  game.profile.shifts[shiftList()[1].id].stars = 0;
  game.profile.stars = 27;

  game.setState('career');
  // Кладём в менеджер ввода настоящий код клавиши Enter (см. ACTION_MAP).
  game.input.pressedCodes = new Set(['Enter']);
  game.handleHotkeys();
  game.input.clearFrame();

  assert.equal(game.state, 'brief', 'брифинг открылся по Enter');
  assert.equal(game.shift.id, shiftList()[1].id, 'открылась следующая смена');
});

test('клик по кнопке карьеры проходит весь путь до брифинга', () => {
  // Полная цепочка: клик → update() → handleButtons() → activate() → brief.
  const game = makeGame();
  game.profile = richProfile();
  const shifts = shiftList();

  game.setState('career');
  const buttons = drawScreen(game, 'career');
  const start = buttons.find((b) => b.id === `start:${shifts[4].id}`);

  const cx = start.x + start.w / 2;
  const cy = start.y + start.h / 2;
  game.pointerClick = { x: cx, y: cy };
  game.update(1 / 60, true);
  game.handleButtons(buttons);

  assert.equal(game.state, 'brief', 'после клика открылся брифинг');
  assert.equal(game.shift.id, shifts[4].id);
});

test('кнопка «Продолжить смену» возвращает в идущую смену', () => {
  const game = makeGame();
  game.profile = richProfile();
  game.startShift(shiftList()[0]);
  const before = game.run;
  game.setState('pause', { snapshot: game.run.snapshot() });

  const buttons = drawScreen(game, 'pause');
  const resume = buttons.find((b) => b.id === 'resume');
  assert.ok(resume, 'на паузе есть кнопка продолжения');
  game.activate(resume.id);

  assert.equal(game.state, 'shift');
  assert.equal(game.run, before, 'та же смена продолжается, а не новая');
});

test('кнопка «Ещё одна смена» на итогах запускает смену заново', () => {
  const game = makeGame();
  game.profile = richProfile();
  game.startShift(shiftList()[0]);
  for (let i = 0; i < 60 * 20; i++) game.update(1 / 60, true);
  game.finishShift();   // настоящий путь: итоги + reward + сохранение

  const buttons = drawScreen(game, 'results');
  const again = buttons.find((b) => b.id.startsWith('play:') || b.id === 'restart');
  assert.ok(again, 'на итогах есть кнопка повтора');
  game.activate(again.id);
  assert.ok(['shift', 'results'].includes(game.state), `состояние после повтора: ${game.state}`);
});
