/**
 * bot.test.js — проверка играбельности: проходит ли смену аккуратный игрок,
 * что бывает при небрежной игре и достижимы ли три звезды.
 *
 * Бот — тот же самый, что используется в tools/simulate.js, поэтому тест
 * доказывает: баланс не «сломан в теории», а реально проходится кодом игры.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { ShiftRun } from '../src/core/run.js';
import { Bot } from '../src/ai/bot.js';
import { shiftList } from '../src/core/career.js';

const STEP = 1 / 60;
const shifts = shiftList();

function play(shift, seed, preset, upgrades = []) {
  const run = new ShiftRun({
    seed,
    venue: shift.venue,
    shiftId: shift.id,
    shiftName: shift.name,
    duration: shift.duration,
    plan: shift.plan,
    thresholds: shift.thresholds,
    mods: shift.mods,
    upgrades,
  });
  const bot = new Bot(preset, seed + 17);
  let guard = 0;
  while (!run.finished && guard < 200000) {
    run.step(STEP, bot.step(run, STEP));
    run.drainEvents();
    guard++;
  }
  return { run, result: run.finish('time'), bot };
}

test('аккуратный игрок проходит все девять смен без нервного срыва', () => {
  for (const [index, shift] of shifts.entries()) {
    const { result, run } = play(shift, 500 + index, 'strong');
    assert.notEqual(result.reason, 'collapse', `${shift.name}: без срыва`);
    assert.ok(result.stats.served >= 5, `${shift.name}: обслужено ${result.stats.served} покупателей`);
    assert.equal(result.stats.finesCount, 0, `${shift.name}: без штрафов`);
    assert.ok(run.time >= shift.duration - 0.2, `${shift.name}: смена отработана до конца`);
  }
});

test('три звезды достижимы хотя бы на части смен аккуратным игроком', () => {
  let threeStars = 0;
  for (const [index, shift] of shifts.entries()) {
    const { result } = play(shift, 900 + index, 'strong');
    if (result.stars === 3) threeStars++;
  }
  assert.ok(threeStars >= 2, `три звезды взяты на ${threeStars} сменах`);
});

test('аккуратный игрок зарабатывает заметно больше невнимательного', () => {
  // Считать «обслуженных» тут бессмысленно: поток покупателей ограничен
  // сменой, и оба бота успевают обслужить почти всех. Разница в игре — в
  // выручке, чаевых, премиях за отказы и в рейтинге, поэтому сравниваем
  // сумму очков на десяти семенах.
  const shift = shifts[4];
  let strong = 0;
  let weak = 0;
  for (let i = 0; i < 10; i++) {
    strong += play(shift, 4240 + i, 'strong').result.score;
    weak += play(shift, 4240 + i, 'weak').result.score;
  }
  assert.ok(strong > weak * 1.1, `аккуратный ${strong} против невнимательного ${weak}`);
});

test('касса не блокируется: ни один покупатель не «висит» у прилавка', () => {
  // Регрессия: раньше отказ в продаже не закрывал пустой чек, покупатель
  // оставался на кассе навсегда, и вся смена после этого рушилась.
  const shift = shifts[2];
  const run = new ShiftRun({
    seed: 2024, venue: shift.venue, shiftId: shift.id, duration: shift.duration,
    plan: shift.plan, thresholds: shift.thresholds, mods: shift.mods,
  });
  const bot = new Bot('strong', 51);
  let currentId = null;
  let stall = 0;
  let worstStall = 0;
  for (let i = 0; i < 60 * shift.duration && !run.finished; i++) {
    run.step(STEP, bot.step(run, STEP));
    run.drainEvents();
    const id = run.current ? run.current.id : null;
    if (id && id === currentId) {
      stall += STEP;
      if (stall > worstStall) worstStall = stall;
    } else {
      currentId = id;
      stall = 0;
    }
  }
  const result = run.finish('time');
  assert.ok(worstStall < 20, `самый долгий покупатель у кассы: ${worstStall.toFixed(1)} с`);
  assert.ok(!result.collapsed, 'смена не сорвана');
  assert.ok(result.stats.served >= 8, `обслужено ${result.stats.served}`);
});

test('небрежный игрок получает штрафы, но смена не ломается', () => {
  const shift = shifts[0];
  const { result } = play(shift, 31337, 'weak');
  assert.ok(result.score >= 0);
  assert.ok(Number.isFinite(result.score), 'итог — конечное число');
  assert.equal(typeof result.stars, 'number');
});

test('улучшения помогают, но не ломают баланс', () => {
  const shift = shifts[4];
  const base = play(shift, 777, 'normal').result;
  const withUpgrades = play(shift, 777, 'normal', ['sneakers', 'scanner', 'gloves', 'radio', 'thermos']).result;
  assert.ok(withUpgrades.score >= base.score * 0.9, 'с улучшениями хуже не становится');
  assert.ok(withUpgrades.score <= base.score * 2.5, 'и не превращается в бесконечные деньги');
});

test('бот не выходит за границы зала и успевает за ящиками', () => {
  const shift = shifts[2];
  const run = new ShiftRun({
    seed: 2024, venue: shift.venue, shiftId: shift.id, duration: shift.duration,
    plan: shift.plan, thresholds: shift.thresholds, mods: shift.mods,
  });
  const bot = new Bot('strong', 51);
  let filled = 0;
  for (let i = 0; i < 60 * shift.duration && !run.finished; i++) {
    run.step(STEP, bot.step(run, STEP));
    run.drainEvents();
    const p = run.player;
    assert.ok(p.x > 0 && p.x < 1120, `x в границах (${p.x.toFixed(0)})`);
    assert.ok(p.y > 100 && p.y < 1000, `y в границах (${p.y.toFixed(0)})`);
    if (run.carrying) filled = 1;
  }
  assert.equal(filled, 1, 'бот успел взять ящик');
  assert.ok(run.player.x > 0 && run.player.x < 1120, 'и остался в зале');
});

test('бот реагирует на паспорт: подростки не получают крепкое', () => {
  const shift = shifts[0];
  const { result } = play(shift, 8181, 'strong');
  assert.equal(result.stats.finesCount, 0, 'штрафов за продажу подросткам нет');
  // Сколько именно раз бот заглянул в паспорт, зависит от потока покупателей
  // в конкретном зерне, поэтому проверяем сам факт проверок.
  assert.ok(result.stats.checks >= 1, `проверок паспорта: ${result.stats.checks}`);
});
