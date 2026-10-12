/**
 * input.test.js — нажатия мышью по кнопкам интерфейса.
 *
 * Регрессия, из-за которой этот файл появился: клики приходили между кадрами,
 * а update() очищал их до отрисовки. Кнопки чека («Пробить», «Паспорт»,
 * «Завершить») подсвечивались при наведении, но не срабатывали — ни одна
 * кнопка на канвасе не работала вообще. Проверяем весь путь целиком:
 * клик → update() → handleButtons() → действие в модели смены.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../src/game.js';
import { ShiftRun } from '../src/core/run.js';
import { shiftList } from '../src/core/career.js';
import { CASHIER, ITEM_BY_ID } from '../src/core/config.js';

const STEP = 1 / 60;

/** Канва-заглушка: игре достаточно getContext и размеров. */
function fakeCanvas() {
  return {
    clientWidth: 1280,
    clientHeight: 720,
    getContext: () => ({}),
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
  };
}

/** Игра без браузера: платформа и звук заменены заглушками. */
function makeGame() {
  const platform = {
    init: async () => ({ available: false, reason: 'no-sdk' }),
    loadCloud: async () => null,
    onPause: () => {}, onResume: () => {},
    gameplayStart: () => {}, gameplayStop: () => {},
    showFullscreenAd: async () => ({ shown: false }),
    currentProfile: null,
    storage: { get: () => null, set: () => {} },
  };
  const game = new Game(fakeCanvas(), platform);
  game.audio.play = () => {};
  return game;
}

function makeRun() {
  const shift = shiftList()[0];
  return new ShiftRun({
    seed: 7,
    venue: shift.venue,
    shiftId: shift.id,
    duration: 60,
    plan: shift.plan,
    thresholds: shift.thresholds,
    mods: shift.mods,
  });
}

/** Ставит Катьме за кассу и подкладывает покупателя с чеком. */
function withCustomer(game) {
  const run = makeRun();
  run.player.x = CASHIER.zone.x + CASHIER.zone.w / 2;
  run.player.y = CASHIER.zone.y + CASHIER.zone.h / 2;
  run.busy = 0;
  const items = ['chips', 'lager'];
  run.customers.push({
    id: 't1',
    def: { id: 'regular', title: 'Покупатель', inspector: false },
    age: 30, looksYoung: false,
    basket: items.map((id) => ({ id, price: ITEM_BY_ID[id].price, scanned: false, removed: false })),
    slot: 0, state: 'queue',
    x: CASHIER.queueSlots[0].x, y: CASHIER.queueSlots[0].y,
    patience: 30, patienceMax: 30, waitTime: 0,
    idChecked: false, idRevealed: false, chequeTotal: 0,
    payNote: 500, changePending: false, changeTimer: 0, changeTimerMax: 3.6,
    dialog: null, line: null, lineTimer: 0, bob: 0, speed: 60,
  });
  game.run = run;
  game.state = 'shift';
  return { run, customer: run.customers[0] };
}

/** Кнопка в том виде, в каком её отдаёт HUD. */
const button = (id, x, y, w = 60, h = 20, enabled = true) => ({ id, x, y, w, h, enabled });

test('клик по кнопке доходит до игры после кадра обновления', () => {
  const game = makeGame();
  const { run } = withCustomer(game);

  let scans = 0;
  const original = run.pressScan.bind(run);
  run.pressScan = (...args) => { scans++; return original(...args); };

  game.pointerClick = { x: 100, y: 100 };
  game.update(STEP, true);                     // клик пришёл между кадрами
  game.handleButtons([button('scan', 80, 80)]); // отрисовка отдаёт кнопки

  assert.equal(scans, 1, 'pressScan вызван ровно один раз');
  assert.equal(run.stats.scans, 1, 'товар действительно пробит');
});

test('один клик срабатывает один раз, даже если кадров отрисовки несколько', () => {
  const game = makeGame();
  const { run } = withCustomer(game);

  let scans = 0;
  const original = run.pressScan.bind(run);
  run.pressScan = (...args) => { scans++; return original(...args); };

  game.pointerClick = { x: 100, y: 100 };
  game.update(STEP, true);
  game.handleButtons([button('scan', 80, 80)]);
  game.handleButtons([button('scan', 80, 80)]);
  game.handleButtons([button('scan', 80, 80)]);

  assert.equal(scans, 1, 'клик одноразовый');
});

test('кнопки чека вызывают свои действия модели', () => {
  const cases = [
    ['scan', 'pressScan'],
    ['checkId', 'pressCheckId'],
    ['refuse', 'pressRefuse'],
    ['finish', 'pressEnter'],
  ];
  for (const [id, method] of cases) {
    const game = makeGame();
    const { run } = withCustomer(game);
    let calls = 0;
    const original = run[method].bind(run);
    run[method] = (...args) => { calls++; return original(...args); };

    game.pointerClick = { x: 100, y: 100 };
    game.update(STEP, true);
    game.handleButtons([button(id, 80, 80)]);

    assert.equal(calls, 1, `кнопка «${id}» зовёт ${method}`);
  }
});

test('клик мимо кнопок и по выключенной кнопке ничего не делает', () => {
  const game = makeGame();
  const { run } = withCustomer(game);

  let scans = 0;
  const original = run.pressScan.bind(run);
  run.pressScan = (...args) => { scans++; return original(...args); };

  game.pointerClick = { x: 500, y: 500 };
  game.update(STEP, true);
  game.handleButtons([button('scan', 80, 80)]);
  assert.equal(scans, 0, 'мимо кнопки — тишина');

  game.pointerClick = { x: 100, y: 100 };
  game.update(STEP, true);
  game.handleButtons([button('scan', 80, 80, 60, 20, false)]);
  assert.equal(scans, 0, 'выключенная кнопка не срабатывает');
});

test('верхняя кнопка получает клик первой при наложении', () => {
  const game = makeGame();
  const { run } = withCustomer(game);
  const pressed = [];
  run.pressScan = () => { pressed.push('scan'); return true; };
  run.pressEnter = () => { pressed.push('finish'); return true; };

  game.pointerClick = { x: 100, y: 100 };
  game.update(STEP, true);
  // 'finish' нарисован позже, значит лежит сверху.
  game.handleButtons([button('scan', 80, 80), button('finish', 80, 80)]);

  assert.deepEqual(pressed, ['finish']);
});

test('кнопка паузы переключает состояние игры', () => {
  const game = makeGame();
  withCustomer(game);
  game.pointerClick = { x: 100, y: 100 };
  game.update(STEP, true);
  game.handleButtons([button('pause', 80, 80)]);
  assert.equal(game.state, 'pause', 'игра встала на паузу по клику');
});
