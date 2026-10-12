/**
 * brand.test.js — имя магазина, знак сети и образ героини.
 *
 * Два повода для этих тестов:
 *  1) сеть в игре вымышленная, и её название не должно совпадать с реальными
 *     торговыми сетями — иначе будут вопросы у модерации;
 *  2) Катьме — продавщица, и по картинке это должно быть видно: хвост, фартук
 *     со знаком сети. Проверяем это не «на глаз», а по цветам на спрайте.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { VENUES } from '../src/core/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('магазин называется «ВИНОГРАД» во всех адресах', () => {
  assert.equal(VENUES.length, 3);
  for (const venue of VENUES) {
    assert.ok(venue.title.includes('ВИНОГРАД'), `${venue.id}: «${venue.title}»`);
  }
});

test('названия магазина и знака нет в текстах карточки и документах', () => {
  // Цвет вымышленного бренда — зелёный, знак — гроздь винограда.
  const files = [
    'README.md', 'docs/YANDEX_UPLOAD.md', 'promo/TEXTS.md', 'LICENSE.txt',
    'index.html', 'web/shell.html', 'package.json',
  ];
  for (const rel of files) {
    if (!existsSync(join(ROOT, rel))) continue;
    const text = readFileSync(join(ROOT, rel), 'utf8');
    assert.ok(!/Красное\s*&\s*Белое|Красное и Белое/i.test(text), `${rel}: нет реальной сети`);
    assert.ok(!/АЛОЕ/i.test(text), `${rel}: старое название не осталось`);
  }
});

test('ни в одном исходнике не осталось старого названия сети', () => {
  const scan = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (name === 'node_modules' || name === '.git' || name === 'screenshots' || name === 'dist') continue;
      // Сам этот файл содержит искомое название в шаблоне проверки.
      if (name === 'brand.test.js') continue;
      if (statSync(p).isDirectory()) { scan(p); continue; }
      if (!/\.(js|gd|html|json|md|py|txt|svg|tscn|godot)$/.test(name)) continue;
      const text = readFileSync(p, 'utf8');
      assert.ok(!/АЛОЕ/i.test(text), `${p}: старое название`);
    }
  };
  for (const dir of ['src', 'web', 'tools', 'tests', 'godot']) scan(join(ROOT, dir));
});

test('Катьме нарисована как девушка: хвост, фартук сети и знак-гроздь', async (t) => {
  // Спрайт рисуем настоящим кодом игры в canvas и смотрим цвета пикселей:
  // так тест поймает и «потерянный» хвост, и слетевший на другой цвет фартук.
  let canvasMod = null;
  for (const candidate of ['@napi-rs/canvas', process.env.KATME_CANVAS,
    '/home/user/shots-env/node_modules/@napi-rs/canvas/index.js',
    '/home/user/.shots-env/node_modules/@napi-rs/canvas/index.js']) {
    if (!candidate) continue;
    try {
      canvasMod = await import(candidate.startsWith('/') ? `file://${candidate}` : candidate);
      break;
    } catch { /* пробуем следующий путь */ }
  }
  if (!canvasMod) {
    t.skip('нет @napi-rs/canvas — проверка спрайта пропущена');
    return;
  }

  const { createCanvas } = canvasMod;
  const { WorldRenderer } = await import('../src/render/world.js');

  const W = 200;
  const H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const renderer = new WorldRenderer();
  const run = {
    carrying: null,
    player: { x: 100, y: 140, vx: 0, vy: 0, facing: 1, walkPhase: 0, moving: false, dash: 100 },
    shelfDefs: [],
  };
  renderer.lastRun = run;
  renderer.drawPlayer(ctx, run, { aprons: ['#2f6b3f'], badge: '#f4d35e' });

  const data = ctx.getImageData(0, 0, W, H).data;
  const has = (r, g, b, tol = 26) => {
    for (let i = 0; i < data.length; i += 4) {
      if (Math.abs(data[i] - r) <= tol && Math.abs(data[i + 1] - g) <= tol && Math.abs(data[i + 2] - b) <= tol) return true;
    }
    return false;
  };

  assert.ok(has(0xb8, 0x54, 0x2b), 'рыжие волосы на месте');
  assert.ok(has(0xa8, 0x4a, 0x25), 'хвост другого тона виден');
  assert.ok(has(0x2f, 0x6b, 0x3f), 'фартук сети');
  assert.ok(has(0x6a, 0x4a, 0x91), 'знак-гроздь на фартуке');
  assert.ok(has(0xf6, 0xcd, 0xa6), 'лицо');
  assert.ok(has(0x33, 0x30, 0x3a), 'глаза');
  assert.ok(has(0xf4, 0xd3, 0x5e), 'резинка на хвосте');
  assert.ok(has(0xe8, 0x8a, 0x86, 60), 'румянец');
});
