#!/usr/bin/env node
/**
 * simulate.js — прогон смен без браузера: проверка баланса и достижимости звёзд.
 *
 * Запуск:
 *   node tools/simulate.js                 # все девять смен, бот «normal»
 *   node tools/simulate.js --bot strong    # внимательный продавец
 *   node tools/simulate.js --bot weak      # слабый игрок
 *   node tools/simulate.js --runs 20       # по 20 прогонов на смену
 *   node tools/simulate.js --shift dom:0 --verbose
 */

import { ShiftRun } from '../src/core/run.js';
import { Bot, BOT_PRESETS } from '../src/ai/bot.js';
import { shiftList, shiftUnlocked, defaultProfile } from '../src/core/career.js';
import { formatMoney } from '../src/core/util.js';
import { SHIFT } from '../src/core/config.js';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const hasFlag = (name) => args.includes(`--${name}`);

const botName = getArg('bot', 'normal');
const runs = parseInt(getArg('runs', '3'), 10);
const verbose = hasFlag('verbose');
const only = getArg('shift', null);
const dt = 1 / 60;

function simulateShift(shift, seed, preset) {
  const run = new ShiftRun({
    seed,
    venue: shift.venue,
    shiftId: shift.id,
    shiftName: shift.name,
    duration: shift.duration,
    plan: shift.plan,
    thresholds: shift.thresholds,
    mods: shift.mods,
    upgrades: [],
  });
  const bot = new Bot(preset, seed + 17);
  let guard = 0;
  while (!run.finished && guard < 200000) {
    const input = bot.step(run, dt);
    run.step(dt, input);
    run.drainEvents();
    guard++;
  }
  return { result: run.finish('time'), bot, run };
}

const shifts = shiftList().filter((s) => !only || s.id === only);
const profile = defaultProfile();
let totalScore = 0;
let totalStars = 0;
const rows = [];

for (const shift of shifts) {
  const unlocked = shiftUnlocked(profile, shifts.indexOf(shift));
  const results = [];
  for (let i = 0; i < runs; i++) {
    const { result, bot, run } = simulateShift(shift, 1000 + i * 37, botName);
    results.push(result);
    if (verbose && i === 0) {
      console.log(`\n── ${shift.venue.title} · ${shift.name} (сид ${1000}) ──`);
      console.log(`  План: ${shift.plan} ₽ · пороги: ${shift.thresholds.join(' / ')} ₽`);
      console.log(`  итог ${formatMoney(result.score)} ₽ · выручка ${formatMoney(result.revenue)} ₽ · чаевые ${result.tips}`);
      console.log(`  рейтинг ${result.rating} · стресс ${result.stress} · обслужено ${result.stats.served} · ушли ${result.stats.lost}`);
      console.log(`  паспортов ${result.stats.checks} · отказов ${result.stats.minorsRefused} · штрафов ${result.stats.finesCount} · ящиков ${result.stats.crates}`);
      console.log(`  ошибки бота: ${bot.mistakes}`);
    }
  }
  const avg = (f) => results.reduce((a, r) => a + f(r), 0) / results.length;
  const score = Math.round(avg((r) => r.score));
  const stars = avg((r) => r.stars);
  const planRate = results.filter((r) => r.planMet).length / results.length;
  const lost = avg((r) => r.stats.lost);
  const fines = avg((r) => r.stats.finesCount);
  totalScore += score;
  totalStars += stars;
  rows.push({
    shift: `${shift.venue.title.replace(/«|»/g, '')} · ${shift.name}`,
    unlocked,
    score, stars, plan: shift.plan, planRate, lost, fines,
    revenue: Math.round(avg((r) => r.revenue)),
    stress: Math.round(avg((r) => r.stress)),
  });
  profile.shifts[shift.id] = { stars: Math.max(1, Math.round(stars)), bestScore: score, bestRevenue: Math.round(avg((r) => r.revenue)), bestRating: 80, clean: false, attempts: runs };
}

const pad = (s, n) => { const str = String(s); return (str.length > n - 1 ? str.slice(0, n - 2) + '…' : str).padEnd(n); };
console.log(`\nБот: ${botName} (${JSON.stringify(BOT_PRESETS[botName] ?? {})}), прогонов на смену: ${runs}`);
console.log('─'.repeat(112));
console.log(`${pad('Смена', 40)}${pad('план', 8)}${pad('вып.', 7)}${pad('выручка', 10)}${pad('итог', 9)}${pad('★', 6)}${pad('ушли', 7)}${pad('штраф', 7)}стресс`);
// «вып.» — доля прогонов, в которых план по выручке выполнен.
console.log('─'.repeat(112));
for (const r of rows) {
  console.log(
    `${pad(r.unlocked ? r.shift : `${r.shift} (закрыто)`, 46)}`
    + `${pad(r.plan, 8)}${pad(`${Math.round(r.planRate * 100)}%`, 7)}${pad(r.revenue, 10)}${pad(r.score, 9)}`
    + `${pad(r.stars.toFixed(2), 6)}${pad(r.lost.toFixed(1), 7)}${pad(r.fines.toFixed(1), 7)}${r.stress}`,
  );
}
console.log('─'.repeat(112));
console.log(`Средний итог: ${formatMoney(totalScore / rows.length)} ₽ · средние звёзды: ${(totalStars / rows.length).toFixed(2)} из 3`);
console.log(`Длительность смены по умолчанию: ${SHIFT.duration} с.`);
