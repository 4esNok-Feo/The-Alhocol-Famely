#!/usr/bin/env node
/**
 * shoot.js — снимки настоящих экранов игры без браузера.
 *
 * Как это работает: поднимается минимальная заглушка браузера (canvas,
 * window, document, localStorage), затем запускается НАСТОЯЩАЯ игра из
 * src/game.js и рисует кадры в canvas из @napi-rs/canvas. То есть снимки
 * в docs/screenshots сделаны тем же кодом, что работает у игрока.
 *
 * Запуск:
 *   npm i            # один раз: @napi-rs/canvas идёт как devDependency
 *   node tools/shoot.js
 *
 * Переменная KATME_CANVAS позволяет указать путь к модулю canvas вручную.
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'docs/screenshots');
const W = 1280;
const H = 720;

// ── 1. Загружаем canvas (обычный импорт или явный путь) ─────────────────
async function loadCanvasModule() {
  const candidates = [
    '@napi-rs/canvas',
    process.env.KATME_CANVAS,
    '/home/user/.shots-env/node_modules/@napi-rs/canvas/index.js',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      const mod = await import(c.startsWith('/') ? `file://${c}` : c);
      return mod;
    } catch { /* пробуем следующий вариант */ }
  }
  throw new Error(
    'Не найден @napi-rs/canvas. Установите его (npm i --no-save @napi-rs/canvas) '
    + 'или задайте KATME_CANVAS=/путь/к/@napi-rs/canvas/index.js',
  );
}

const { createCanvas, GlobalFonts } = await loadCanvasModule();

for (const font of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
  const p = resolve(ROOT, 'assets/fonts', font);
  if (existsSync(p)) GlobalFonts.registerFromPath(p, 'DejaVu Sans');
}

// ── 2. Заглушка браузерного окружения ──────────────────────────────────
const canvas = createCanvas(W, H);
canvas.clientWidth = W;
canvas.clientHeight = H;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H });
canvas.style = {};
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};

const listeners = new Map();
const storage = new Map();
globalThis.window = {
  innerWidth: W,
  innerHeight: H,
  devicePixelRatio: 1,
  addEventListener: () => {},
  removeEventListener: () => {},
  requestAnimationFrame: () => 0,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  location: { reload: () => {} },
};
globalThis.document = {
  addEventListener: (name, fn) => listeners.set(name, fn),
  removeEventListener: () => {},
  hidden: false,
  getElementById: () => null,
};
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.window.__KATME__ = { ready: false };

// ── 3. Настоящая игра ──────────────────────────────────────────────────
const { Game } = await import('../src/game.js');
const { platform } = await import('../web/platform.js');
const { Bot } = await import('../src/ai/bot.js');
const { shiftList, defaultProfile, applyResult } = await import('../src/core/career.js');

mkdirSync(OUT, { recursive: true });
const shots = [];

const game = new Game(canvas, platform);
await game.boot();
game.running = false;             // кадры двигаем вручную — детерминированно

function frame(dt = 1 / 60, count = 1) {
  for (let i = 0; i < count; i++) {
    game.update(dt);
    game.render();
  }
}

/**
 * Прогон смены без отрисовки: считаем только модель и эффекты.
 * Отрисовка нужна лишь в момент снимка — иначе инструмент работает минуты.
 */
function simulate(seconds) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (!game.run || game.run.finished) return;
    game.update(1 / 60, true);
  }
}

function shot(name, note) {
  const buf = canvas.toBuffer('image/png');
  writeFileSync(resolve(OUT, `${name}.png`), buf);
  shots.push({ name, note, bytes: buf.length });
  console.log(`  ✓ docs/screenshots/${name}.png — ${note} (${(buf.length / 1024).toFixed(0)} КБ)`);
}

// ── 4. Сценарии съёмки ─────────────────────────────────────────────────
console.log('Снимаем экраны игры:');

// Меню.
game.setState('menu');
frame(1 / 60, 26);
shot('menu', 'главное меню');

// Карьера.
game.setState('career');
frame(1 / 60, 20);
shot('career', 'экран карьеры: три адреса, девять смен');

// Цели.
game.setState('goals');
frame(1 / 60, 10);
shot('goals', 'постоянные цели карьеры');

// Экипировка.
game.setState('equipment');
frame(1 / 60, 10);
shot('equipment', 'комплекты формы и улучшения');

// Брифинг первой смены.
const shifts = shiftList();
game.openBrief(shifts[0]);
frame(1 / 60, 10);
shot('brief', 'брифинг перед сменой');

// Смена: играет бот, снимаем несколько характерных моментов.
game.startShift(shifts[2]);       // вечерняя смена: плотный поток
game.autoBot = new Bot('strong', 2024);
let captured = { queue: false, carrying: false, dialog: false, register: false };
for (let i = 0; i < 60 * 180 * 1.1; i++) {
  simulate(1 / 60);
  const snap = game.run?.snapshot();
  if (!snap) break;
  if (!captured.carrying && snap.carrying && game.run.stats.fills > 0) {
    game.effects.addText(game.run.player.x, game.run.player.y - 70, '+6 ед.', { color: '#cfe9d8' });
    frame(1 / 60, 1);
    shot('shift-refill', 'склад и выкладка ящиков');
    captured.carrying = true;
  }
  if (!captured.queue && snap.queue >= 2) {
    game.render();
    shot('shift-queue', 'очередь на кассе');
    captured.queue = true;
  }
  if (!captured.dialog && snap.dialogCustomer) {
    game.render();
    shot('shift-dialog', 'диалог со скандалистом');
    captured.dialog = true;
  }
  if (!captured.register && snap.current && snap.current.basket.length >= 2 && !snap.current.idChecked) {
    game.render();
    shot('shift-register', 'касса: чек покупателя и проверка паспорта');
    captured.register = true;
  }
  if (game.state !== 'shift') break;
}
game.autoBot = null;

// Итоги смены.
if (game.state !== 'results') {
  // Если смена ещё идёт — аккуратно её закрываем, чтобы снять экран итогов.
  game.run.time = game.run.duration;
  frame(1 / 60, 2);
}
frame(1 / 60, 30);
shot('results', 'сводка смены со звёздами и разбором');

// Пауза.
game.setState('pause', { snapshot: game.run?.snapshot() ?? null });
frame(1 / 60, 10);
shot('pause', 'пауза');

// Прокачанная карьера — для наглядности прогрессии.
const rich = defaultProfile();
rich.stars = 15;
rich.xp = 9200;
rich.wallet = 2100;
rich.upgrades = ['radio', 'scanner'];
for (const s of shifts.slice(0, 7)) {
  rich.shifts[s.id] = { stars: 3, bestScore: s.thresholds[2] + 400, bestRevenue: s.plan + 300, bestRating: 96, clean: true, attempts: 3 };
}
game.profile = rich;
game.setState('career');
frame(1 / 60, 20);
shot('career-progress', 'карьера с прогрессом и открытыми звёздами');

game.profile = rich;
game.setState('equipment');
frame(1 / 60, 10);
shot('equipment-progress', 'открытые комплекты формы и улучшения');

console.log(`\nГотово: ${shots.length} снимков в docs/screenshots/`);
console.log(`Всего байт: ${shots.reduce((a, s) => a + s.bytes, 0)}`);
