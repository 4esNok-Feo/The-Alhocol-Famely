/**
 * run.test.js — механические тесты модели смены.
 *
 * Проверяем не «картинку», а правила игры: штрафы за продажу подростку,
 * премию за отказ, окно сдачи, рост и спад стресса, пустые полки, границы
 * очереди, детерминированность и корректность итогов смены.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ShiftRun } from '../src/core/run.js';
import { CASHIER, CUSTOMERS, ITEM_BY_ID, PHASES, SHIFT } from '../src/core/config.js';
import { shiftList } from '../src/core/career.js';

const shift = shiftList()[0];
const STEP = 1 / 60;

function makeRun(overrides = {}) {
  return new ShiftRun({
    seed: 1234,
    venue: shift.venue,
    shiftId: shift.id,
    shiftName: shift.name,
    duration: shift.duration,
    plan: shift.plan,
    thresholds: shift.thresholds,
    mods: shift.mods,
    ...overrides,
  });
}

/** Ставит Катьме за кассу и убирает занятость, чтобы можно было действовать. */
function toRegister(run) {
  run.player.x = CASHIER.zone.x + CASHIER.zone.w / 2;
  run.player.y = CASHIER.zone.y + CASHIER.zone.h / 2;
  run.busy = 0;
}

/** Собирает покупателя вручную: так тест не зависит от случайностей. */
function injectCustomer(run, { age = 30, items = ['lager'], patience = 30, payNote = 500 } = {}) {
  const basket = items.map((id) => ({ id, price: ITEM_BY_ID[id].price, scanned: false, removed: false }));
  const def = CUSTOMERS.find((c) => c.id === 'regular');
  const customer = {
    id: `t${run.customers.length + 1}`,
    def, age, looksYoung: age < 26, basket,
    slot: run.reserved, state: 'queue',
    x: CASHIER.queueSlots[0].x, y: CASHIER.queueSlots[0].y,
    targetX: 0, targetY: 0, waypoint: 99,
    patience, patienceMax: patience, waitTime: 0,
    idChecked: false, idRevealed: false,
    chequeTotal: 0, scanProgress: 0, payNote,
    changePending: false, changeTimer: 0, changeTimerMax: 3.6,
    dialog: null, dialogTimer: 0, dialogResult: null,
    chatTimer: 5, line: null, lineTimer: 0, bob: 0, speed: 60,
  };
  run.customers.push(customer);
  return customer;
}

test('смена завершается по таймеру и возвращает итог с полями', () => {
  const run = makeRun({ duration: 12 });
  for (let i = 0; i < 60 * 14 && !run.finished; i++) run.step(STEP, { dx: 0, dy: 0 });
  const result = run.result;
  assert.equal(result.reason, 'time');
  assert.equal(typeof result.score, 'number');
  assert.ok(result.stars >= 0 && result.stars <= 3);
  assert.ok(result.stats, 'статистика присутствует');
  assert.ok(result.xp > 0, 'опыт начисляется даже за пустую смену');
});

test('нервный срыв завершает смену раньше времени', () => {
  const run = makeRun({ duration: 180 });
  run.stress = 99.5;
  injectCustomer(run, { items: ['lager', 'vodka'] });
  // Стресс растёт, пока в очереди есть покупатель: срыв наступает за секунды.
  for (let i = 0; i < 60 * 5 && !run.finished; i++) run.step(STEP, { dx: 0, dy: 0 });
  assert.equal(run.stressCollapse, true);
  assert.equal(run.result.reason, 'collapse');
  assert.equal(run.result.collapsed, true);
  assert.ok(run.result.timeUsed < 180, 'смена закончилась раньше таймера');
});

test('продажа крепкого подростку без проверки даёт штраф', () => {
  const run = makeRun();
  toRegister(run);
  injectCustomer(run, { age: 16, items: ['lager'], patience: 40 });
  run.pressCheckId();
  run.busy = 0;
  const ok = run.pressScan();
  assert.equal(ok, false, 'скан отменяется');
  assert.equal(run.fines, 1800);
  assert.equal(run.stats.finesCount, 1);
  assert.equal(run.result ?? null, null);
  const warning = run.events.find((e) => e.type === 'fine');
  assert.ok(warning, 'событие штрафа отправлено интерфейсу');
});

test('отказ в продаже крепкого подростку даёт премию и не портит рейтинг', () => {
  const run = makeRun();
  toRegister(run);
  const before = run.rating;
  injectCustomer(run, { age: 17, items: ['lager', 'chips'], patience: 40 });
  run.pressRefuse();
  assert.equal(run.bonuses, 25);
  assert.equal(run.stats.minorsRefused, 1);
  assert.ok(run.rating > before, 'рейтинг растёт');
  // Крепкое вернулось на полку.
  assert.ok(run.shelves.beer.units > 0);
  assert.ok(run.events.some((e) => e.type === 'refuse' && e.good));
});

test('отказ взрослому покупателю снижает рейтинг', () => {
  const run = makeRun();
  toRegister(run);
  const before = run.rating;
  injectCustomer(run, { age: 44, items: ['vodka'], patience: 40 });
  run.pressRefuse();
  assert.equal(run.bonuses, 0);
  assert.ok(run.rating < before);
});

test('сдача считается только внутри окна, затем чек закрывается', () => {
  const run = makeRun();
  toRegister(run);
  const c = injectCustomer(run, { age: 40, items: ['chips'], patience: 40, payNote: 1000 });
  run.pressScan();
  run.busy = 0;
  assert.equal(c.changePending, true, 'крупная купюра включает окно сдачи');
  const tipsBefore = run.tips;
  run.pressEnter();
  assert.equal(run.stats.served, 1);
  assert.ok(run.tips > tipsBefore, 'чаевые за сдачу начислены');
  assert.equal(run.stats.changeOk, 1);
});

test('очередь не превышает трёх человек, остальные ждут у входа', () => {
  const run = makeRun({ duration: 200 });
  for (let i = 0; i < 60 * 90; i++) {
    run.step(STEP, { dx: 0, dy: 0 });
    run.drainEvents();
    assert.ok(run.queue.length <= SHIFT.maxQueue, 'в очереди максимум три человека');
  }
  assert.ok(run.outside >= 0);
});

test('пустая полка: покупатель уходит без покупки и рейтинг падает', () => {
  const run = makeRun();
  for (const id of Object.keys(run.shelves)) run.shelves[id].units = 0;
  const before = run.rating;
  const created = run.spawnCustomer('regular');
  assert.equal(created, null, 'покупка не состоялась');
  assert.ok(run.rating < before, 'рейтинг снизился');
  assert.ok(run.events.some((e) => e.type === 'empty_shelf'));
});

test('ящики на складе восстанавливаются со временем', () => {
  const run = makeRun();
  const src = run.sources[0];
  src.stock = 0;
  src.timer = 0;
  for (let i = 0; i < 60 * 12; i++) run.step(STEP, { dx: 0, dy: 0 });
  assert.ok(src.stock >= 1, 'за смену появляется новый ящик');
});

test('взятие ящика и выкладка на «свою» полку пополняют её', () => {
  const run = makeRun();
  run.player.x = run.sources[0].x;
  run.player.y = run.sources[0].y - 20;
  const shelfDef = run.shelfDefs.find((s) => s.id === run.sources[0].shelf);
  run.shelves[shelfDef.id].units = 2;
  assert.equal(run.pressAction(), true, 'ящик взят');
  assert.equal(run.carrying, shelfDef.id);
  run.busy = 0;
  run.player.x = shelfDef.stand.x;
  run.player.y = shelfDef.stand.y;
  assert.equal(run.pressAction(), true, 'товар выложен');
  assert.equal(run.carrying, null);
  assert.equal(run.shelves[shelfDef.id].units, 8, '6 единиц из ящика добавились');
  assert.equal(run.stats.fills, 1);
});

test('стресс растёт от очереди и падает в тишине', () => {
  const run = makeRun();
  injectCustomer(run, { patience: 60 });
  injectCustomer(run, { patience: 60 });
  const start = run.stress;
  for (let i = 0; i < 60 * 5; i++) run.step(STEP, { dx: 0, dy: 0 });
  const peak = run.stress;
  assert.ok(peak > start, 'в очереди стресс растёт');
  run.customers = [];
  for (let i = 0; i < 60 * 5; i++) run.step(STEP, { dx: 0, dy: 0 });
  assert.ok(run.stress < peak, 'без покупателей стресс падает');
});

test('фазы смены меняются и учащают поток', () => {
  const run = makeRun({ duration: 200 });
  assert.equal(run.phaseIndex, 0);
  run.time = 61;
  run.stepPhase();
  assert.equal(run.phaseIndex, 1);
  run.time = 121;
  run.stepPhase();
  assert.equal(run.phaseIndex, 2);
  assert.ok(PHASES[2].spawnEvery < PHASES[0].spawnEvery, 'вечером поток плотнее');
});

test('крышка тревоги не теряет паспорт: проверка показывает возраст', () => {
  const run = makeRun();
  toRegister(run);
  injectCustomer(run, { age: 19, items: ['cider'], patience: 40 });
  run.pressCheckId();
  const snap = run.snapshot();
  assert.equal(snap.current.idRevealed, true);
  assert.equal(snap.current.age, 19);
  assert.ok(run.events.some((e) => e.type === 'id_ok'));
});

test('одна и та же смена с одним зерном воспроизводится до рубля', () => {
  const script = [];
  for (let i = 0; i < 60 * 40; i++) {
    script.push({
      dx: Math.sin(i / 30) > 0 ? 1 : -1,
      dy: Math.cos(i / 45) > 0 ? 1 : 0,
      dash: i % 240 < 60,
    });
  }
  const play = () => {
    const run = makeRun({ seed: 777, duration: 180 });
    for (const input of script) {
      run.step(STEP, input);
      run.drainEvents();
    }
    return run.finish('time');
  };
  const a = play();
  const b = play();
  assert.deepEqual(a, b, 'два прогона совпадают полностью');
});

test('разные зёрна дают разные смены', () => {
  // Сравниваем состав покупателей: без действий игрока выручки нет ни там,
  // ни там, а вот поток людей от зерна зависит.
  const flow = (seed) => {
    const run = makeRun({ seed, duration: 90 });
    for (let i = 0; i < 60 * 90; i++) {
      run.step(STEP, { dx: 0, dy: 0 });
      run.drainEvents();
    }
    return run.customers.map((c) => `${c.def.id}:${c.age}:${c.basket.length}`).join('|');
  };
  assert.notEqual(flow(1), flow(9999));
});

test('пороги звёзд: звезда даётся ровно по порогам итога', () => {
  // Итог = выручка + чаевые + премии − штрафы + бонус рейтинга + чистая смена.
  // Обнуляем бонусы, чтобы проверить именно пороги.
  const run = makeRun({ thresholds: [1000, 2000, 3000] });
  run.revenue = 2500;
  run.rating = 60;               // бонус рейтинга = 0
  run.stats.lost = 1;            // «чистой смены» нет
  const result = run.finish('time');
  assert.equal(result.score, 2500);
  assert.equal(result.stars, 2);
  assert.equal(result.ratingBonus, 0);
  assert.equal(result.cleanBonus, 0);
});

test('план по выручке считается отдельно от порогов', () => {
  const run = makeRun({ plan: 100000, thresholds: [1, 2, 3] });
  run.revenue = 500;
  const result = run.finish('time');
  assert.equal(result.planMet, false);
  assert.equal(result.stars, 3, 'звёзды всё равно по своим порогам');
});

test('снимок состояния содержит всё, что нужно интерфейсу', () => {
  const run = makeRun();
  injectCustomer(run, { items: ['vodka', 'chips'] });
  const snap = run.snapshot();
  for (const key of ['time', 'timeLeft', 'phase', 'rating', 'stress', 'revenue', 'plan',
    'queue', 'carrying', 'shelves', 'sources', 'shelfDefs', 'current']) {
    assert.ok(key in snap, `поле ${key} есть в снимке`);
  }
  assert.ok(snap.current.basket.length > 0);
  assert.ok(Array.isArray(snap.shelfDefs));
});

test('требование паспорта не даёт продать крепкое подростку после отказа', () => {
  const run = makeRun();
  toRegister(run);
  const c = injectCustomer(run, { age: 16, items: ['lager', 'chips'], patience: 40 });
  run.pressCheckId();
  run.busy = 0;
  run.pressRefuse();
  run.busy = 0;
  // Сканируем только безалкогольное и закрываем чек.
  while (run.pressScan()) run.busy = 0;
  run.pressEnter();
  assert.equal(run.stats.served, 1);
  assert.equal(run.fines, 0, 'штрафа нет: крепкое убрано из чека');
  assert.ok(c.basket.every((i) => i.removed || ITEM_BY_ID[i.id].price > 0));
});

test('отказ в продаже закрывает пустой чек и освобождает кассу', () => {
  // Регрессия: раньше после отказа покупатель с одним «крепким» в корзине
  // оставался на кассе навсегда и блокировал смену.
  const run = makeRun();
  toRegister(run);
  const c = injectCustomer(run, { age: 17, items: ['vodka'], payNote: 1000 });
  assert.equal(run.current, c, 'покупатель уже у кассы (slot 0)');

  assert.ok(run.pressCheckId(), 'паспорт проверен');
  run.busy = 0; // проверка паспорта занимает время
  assert.ok(run.pressRefuse(), 'отказ принят');

  assert.notEqual(run.current, c, 'покупатель ушёл с кассы сам, без Enter');
  assert.equal(c.state, 'leaving');
  assert.equal(run.stats.minorsRefused, 1, 'отказ засчитан');
  assert.ok(run.bonuses > 0, 'премия за отказ начислена');
  assert.equal(run.queue.length, 0, 'очередь пуста');
});

test('отказ не закрывает чек, если в нём остались обычные товары', () => {
  const run = makeRun();
  toRegister(run);
  const c = injectCustomer(run, { age: 17, items: ['vodka', 'chips'], payNote: 1000 });
  run.pressCheckId();
  run.busy = 0;
  run.pressRefuse();
  assert.equal(run.current, c, 'покупатель ещё в чеке');
  assert.equal(c.basket.filter((i) => i.removed).length, 1, 'убрано только «крепкое»');

  const snack = c.basket.find((i) => i.id === 'chips');
  snack.scanned = true;
  c.chequeTotal = snack.price;
  run.busy = 0;
  assert.ok(run.pressEnter(), 'чек закрывается Enter');
  assert.equal(c.state, 'leaving');
  assert.ok(run.revenue > 0, 'выручка по остатку чека начислена');
});

test('итоги смены содержат всё, что показывает экран результатов', () => {
  // Экран результатов читает поля result.stats.* напрямую: если поле исчезнет,
  // игрок увидит «undefined» вместо числа.
  const run = makeRun({ duration: 30 });
  toRegister(run);
  injectCustomer(run, { items: ['chips'], payNote: 500 });
  for (let i = 0; i < 60 * 12 && !run.finished; i++) {
    if (run.current && run.atRegister) run.pressScan() || run.pressEnter();
    run.busy = 0;
    run.step(STEP, { dx: 0, dy: 0, dash: false });
    run.drainEvents();
  }
  const result = run.finish('time');
  for (const key of ['served', 'lost', 'checks', 'minorsRefused', 'finesCount', 'bestStreak', 'scans', 'crates', 'fills']) {
    assert.equal(typeof result.stats[key], 'number', `result.stats.${key} — число`);
    assert.ok(Number.isFinite(result.stats[key]), `result.stats.${key} конечно`);
  }
  for (const key of ['score', 'revenue', 'tips', 'bonuses', 'fines', 'rating', 'stress', 'xp']) {
    assert.equal(typeof result[key], 'number', `result.${key} — число`);
  }
  assert.ok(Array.isArray(result.thresholds) && result.thresholds.length === 3, 'три порога звёзд');
});

test('у больших магазинов на одну полку и один склад больше', () => {
  // Пятая полка («свежее») есть только в street/route — и ящик к ней тоже,
  // иначе полку нельзя было бы пополнить.
  const big = shiftList().find((s) => s.venue.id === 'street');
  const bigRun = makeRun({ venue: big.venue, shiftId: big.id, mods: big.mods });
  assert.equal(bigRun.shelfDefs.length, 5);
  assert.equal(bigRun.sources.length, 5);
  assert.ok(bigRun.sources.some((c) => c.shelf === 'fresh'), 'склад для «свежего» на месте');

  const small = makeRun();
  assert.equal(small.shelfDefs.length, 4, 'в «дом» четыре полки');
  assert.equal(small.sources.length, 4);
});

test('каждой полке соответствует свой ящик на складе', () => {
  for (const shift of shiftList()) {
    const run = makeRun({ venue: shift.venue, shiftId: shift.id, mods: shift.mods });
    for (const shelf of run.shelfDefs) {
      assert.ok(run.sources.some((c) => c.shelf === shelf.id), `${shift.id}: склад для «${shelf.id}»`);
    }
  }
});
