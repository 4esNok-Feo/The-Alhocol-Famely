#!/usr/bin/env node
/**
 * verify_archive.js — проверка ИМЕННО ТОГО архива, который уедет на платформу.
 *
 * Тесты гоняют код из репозитория, а игрок получает распакованный
 * dist/Katme_Yandex.zip. Этот инструмент закрывает разрыв: распаковывает архив
 * во временный каталог, поднимает минимальную заглушку браузера (без SDK
 * платформы — как в локальном предпросмотре), запускает настоящую игру из
 * архива и проигрывает полную смену ботом.
 *
 * Что проверяется:
 *   1. архив распаковывается, index.html и модули на месте;
 *   2. игра стартует без SDK и не падает (диагностика пишется в window.__KATME__);
 *   3. смена доигрывается до экрана итогов, звёзды и очки считаются;
 *   4. прогресс сохраняется в localStorage, профиль читается назад;
 *   5. страница подключает /sdk.js и не тянет ничего извне.
 *
 * Запуск:  node tools/verify_archive.js [--keep]
 * Код возврата: 0 — всё в порядке, 1 — проверка провалена.
 */

import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVE = resolve(ROOT, 'dist/Katme_Yandex.zip');
const KEEP = process.argv.includes('--keep');

const problems = [];
const checks = [];
function check(ok, label, detail = '') {
  checks.push({ ok, label, detail });
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(label);
}

console.log('Проверяем архив для платформы:\n');

// ── 1. Распаковка ───────────────────────────────────────────────────────
if (!existsSync(ARCHIVE)) {
  console.error(`Нет файла ${ARCHIVE}. Сначала: python3 tools/package.py`);
  process.exit(1);
}
const work = mkdtempSync(join(tmpdir(), 'katme-verify-'));
execFileSync('python3', ['-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', ARCHIVE, work]);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p.slice(work.length + 1));
  }
}(work));
console.log(`  распаковано файлов: ${files.length} → ${work}`);

check(existsSync(join(work, 'index.html')), 'index.html в корне архива');
check(files.some((f) => f === 'web/platform.js'), 'слой платформы на месте');
check(files.some((f) => f === 'src/core/run.js'), 'модель смены на месте');
check(!files.some((f) => f.startsWith('tests/') || f.startsWith('tools/')), 'тестов и инструментов нет');

const page = readFileSync(join(work, 'index.html'), 'utf8');
const externals = [...page.matchAll(/(?:src|href)\s*=\s*["'](https?:)?\/\/([^"']+)/g)].map((m) => m[2]);
check(page.includes('/sdk.js'), 'страница подключает /sdk.js');
check(externals.length === 0, 'внешних URL нет', externals.join(', '));

// ── 2. Заглушка браузера ────────────────────────────────────────────────
async function loadCanvasModule() {
  const candidates = [
    '@napi-rs/canvas',
    process.env.KATME_CANVAS,
    '/home/user/.shots-env/node_modules/@napi-rs/canvas/index.js',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return await import(c.startsWith('/') ? pathToFileURL(c).href : c);
    } catch { /* следующий вариант */ }
  }
  throw new Error('Не найден @napi-rs/canvas (npm i --no-save @napi-rs/canvas или KATME_CANVAS=…)');
}

const { createCanvas, GlobalFonts } = await loadCanvasModule();
for (const font of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
  const p = join(work, 'assets/fonts', font);
  if (existsSync(p)) GlobalFonts.registerFromPath(p, 'DejaVu Sans');
}

const W = 1280;
const H = 720;
const canvas = createCanvas(W, H);
canvas.clientWidth = W;
canvas.clientHeight = H;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: W, height: H, right: W, bottom: H });
canvas.style = {};
canvas.addEventListener = () => {};
canvas.removeEventListener = () => {};

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
  addEventListener: () => {},
  removeEventListener: () => {},
  hidden: false,
  getElementById: () => null,
  // Заглушка загрузки шрифтов: boot() проверяет их наличие перед первым кадром.
  fonts: { load: () => Promise.resolve([]), ready: Promise.resolve() },
};
globalThis.localStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
// window.__KATME__ не создаём специально: игра обязана уметь работать и без него.

// ── 3. Настоящая игра из архива ─────────────────────────────────────────
const fromArchive = (rel) => pathToFileURL(join(work, rel)).href;
const { Game } = await import(fromArchive('src/game.js'));
const { platform } = await import(fromArchive('web/platform.js'));
const { Bot } = await import(fromArchive('src/ai/bot.js'));
const { shiftList, loadProfile } = await import(fromArchive('src/core/career.js'));

const shifts = shiftList();
const shift = shifts.find((s) => s.id === 'dom:2') ?? shifts[0];

const game = new Game(canvas, platform);
let bootError = null;
try {
  await game.boot();
} catch (err) {
  bootError = err;
}
check(!bootError, 'игра стартует без SDK', bootError ? bootError.message : 'platform.init() вернул «нет SDK»');
check(platform.available === false, 'игра работает в локальном режиме (без платформы)');

if (!bootError) {
  game.running = false;
  check(game.state === 'menu' || game.state === 'loading', 'после старта открывается меню', `state=${game.state}`);

  game.startShift(shift);
  game.autoBot = new Bot('strong', 5);

  let frames = 0;
  const maxFrames = Math.round(60 * (shift.duration + 25));
  while (frames < maxFrames && game.run && !game.run.finished) {
    game.update(1 / 60, true);
    game.state = 'shift';
    frames++;
  }
  const result = game.run?.result;
  check(!!result, 'смена доигрывается до итогов', result ? `итог ${result.score} ₽` : 'смена не завершилась');
  if (result) {
    check(Number.isFinite(result.score) && result.score > 0, 'очки смены посчитаны', `${result.score} ₽`);
    check(result.stars >= 0 && result.stars <= 3, 'звёзды в диапазоне 0…3', `${result.stars}★`);
    check(result.stats.served >= 5, 'покупатели обслужены', `${result.stats.served} человек`);
    check(!result.collapsed, 'смена не сорвана ботом');
  }

  const saved = loadProfile(platform.storage);
  const rec = saved.shifts?.[shift.id];
  check(!!rec && rec.bestScore > 0, 'прогресс сохранён в localStorage', rec ? `лучший итог ${rec.bestScore} ₽` : 'записи нет');
  check(typeof window.__KATME__ === 'object', 'диагностика пишется в window.__KATME__');
  if (window.__KATME__) {
    check(window.__KATME__.ready === true, 'в диагностике ready = true');
    check(typeof window.__KATME__.version === 'string', 'в диагностике есть версия', window.__KATME__.version);
  }
}

// ── 4. Итог ─────────────────────────────────────────────────────────────
const failed = problems.length;
console.log(`\n${failed === 0 ? '✓ Архив проверен' : '✗ Есть проблемы'}: пройдено ${checks.length - failed} из ${checks.length}.`);
if (failed) console.log(`Провалено: ${problems.join('; ')}`);
if (KEEP) console.log(`Каталог распаковки сохранён: ${work}`);
else rmSync(work, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
