#!/usr/bin/env node
/**
 * make_promo.js — обложка, иконка и тексты карточки для консоли разработчика.
 *
 * Картинки собираются кодом на том же canvas-модуле, что и снимки экранов:
 * никаких внешних ассетов и картинок из других игр. Обложка — настоящий
 * кадр игры с заголовком, иконка — та же эмблема, что в assets/icon.svg.
 *
 * Запуск:
 *   npm i && node tools/make_promo.js
 * Результат:
 *   promo/cover.png       800×470  — обложка карточки
 *   promo/icon.png        512×512  — иконка игры
 *   promo/icon-256.png    уменьшенная копия
 *   promo/screenshots/*   копии снимков для карточки
 *   promo/TEXTS.md        готовые тексты описания
 */

import { mkdirSync, writeFileSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'promo');
const SHOTS = resolve(ROOT, 'docs/screenshots');

async function loadCanvas() {
  const candidates = [
    '@napi-rs/canvas',
    process.env.KATME_CANVAS,
    '/home/user/.shots-env/node_modules/@napi-rs/canvas/index.js',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return await import(c.startsWith('/') ? `file://${c}` : c);
    } catch { /* следующий вариант */ }
  }
  throw new Error('Нужен @napi-rs/canvas: npm i --no-save @napi-rs/canvas');
}

const { createCanvas, loadImage, GlobalFonts } = await loadCanvas();
for (const font of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
  const p = resolve(ROOT, 'assets/fonts', font);
  if (existsSync(p)) GlobalFonts.registerFromPath(p, 'DejaVu Sans');
}

const FONT = '"DejaVu Sans", "Segoe UI", Roboto, Arial, sans-serif';
const BRAND = 'ВИНОГРАД';
// Цвет вымышленной сети — виноградная зелень (у реальных сетей красный,
// поэтому бренд игры никого не повторяет).
const BRAND_GREEN = '#3f7a45';
const GRAPE = '#6a4a91';
const TITLE = 'Катьме: Смена';
const SUBTITLE = 'магазин у дома · смена за сменой';

mkdirSync(resolve(OUT, 'screenshots'), { recursive: true });

/** Разбор скруглённого прямоугольника — нужен и обложке, и иконке. */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Иконка по мотивам assets/icon.svg: полка, «18+» и Катьме за кассой. */
/**
 * Гроздь винограда — знак вымышленной сети «ВИНОГРАД». Та же форма, что и в
 * игре (src/render/draw2d.js → grapes), но нарисованная для больших картинок.
 */
function grapesAt(ctx, x, y, r) {
  const berries = [
    [-1, 0], [1, 0],
    [-1.6, 1.1], [0, 1.15], [1.6, 1.1],
    [-0.8, 2.2], [0.8, 2.2],
    [0, 3.1],
  ];
  for (const [bx, by] of berries) {
    ctx.beginPath();
    ctx.arc(x + bx * r, y + by * r, r * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = GRAPE;
    ctx.fill();
  }
  ctx.strokeStyle = '#5f7a3a';
  ctx.lineWidth = Math.max(1, r * 0.3);
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.5);
  ctx.lineTo(x + r * 0.1, y - r * 1.6);
  ctx.stroke();
  ctx.fillStyle = '#4f8a45';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.9, y - r * 1.2, r * 0.85, r * 0.45, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawIcon(ctx, size) {
  const k = size / 512;
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#f6efe4');
  g.addColorStop(1, '#e2d3c2');
  ctx.fillStyle = g;
  roundRect(ctx, 0, 0, size, size, 96 * k);
  ctx.fill();

  ctx.fillStyle = BRAND_GREEN;
  ctx.fillRect(0, 70 * k, size, 46 * k);
  ctx.fillStyle = '#f6efe4';
  ctx.font = `bold ${34 * k}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(BRAND, size / 2, 94 * k);

  // Две полки с бутылками.
  const rows = [
    { y: 176, items: ['#c79a3f', '#2f8296', '#c46a2e', '#8e3a44', '#8fb5d6', '#c79a3f'] },
    { y: 292, items: ['#c46a2e', '#8e3a44', '#c79a3f'] },
  ];
  for (const row of rows) {
    ctx.fillStyle = '#8d6a4a';
    roundRect(ctx, 70 * k, (row.y + 44) * k, 372 * k, 26 * k, 8 * k);
    ctx.fill();
    row.items.forEach((color, i) => {
      const x = (86 + i * 46) * k;
      ctx.fillStyle = color;
      roundRect(ctx, x, row.y * k, 32 * k, 44 * k, 6 * k);
      ctx.fill();
    });
  }

  // Плашка «18+» — главная фишка механики.
  ctx.fillStyle = BRAND_GREEN;
  roundRect(ctx, 300 * k, 226 * k, 132 * k, 52 * k, 10 * k);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${36 * k}px ${FONT}`;
  ctx.fillText('18+', 366 * k, 254 * k);

  // Знак сети — гроздь винограда над прилавком.
  grapesAt(ctx, 300 * k, 168 * k, 13 * k);

  // Катьме за кассой.
  ctx.fillStyle = '#d8b189';
  roundRect(ctx, 150 * k, 392 * k, 212 * k, 64 * k, 12 * k);
  ctx.fill();
  ctx.fillStyle = '#b98b62';
  roundRect(ctx, 150 * k, 392 * k, 212 * k, 26 * k, 10 * k);
  ctx.fill();

  // Хвост волос — крепится к голове и уходит вниз-влево.
  ctx.save();
  ctx.translate(228 * k, 274 * k);
  ctx.rotate(0.22);
  ctx.fillStyle = '#a84a25';
  roundRect(ctx, -8 * k, 0, 16 * k, 58 * k, 8 * k);
  ctx.fill();
  ctx.fillStyle = '#f4d35e';
  roundRect(ctx, -5 * k, -2 * k, 10 * k, 8 * k, 4 * k);
  ctx.fill();
  ctx.restore();
  // Фартук сети.
  ctx.fillStyle = BRAND_GREEN;
  roundRect(ctx, 226 * k, 300 * k, 60 * k, 76 * k, 20 * k);
  ctx.fill();
  // Знак сети на фартуке — небольшой, у уголка кармана.
  grapesAt(ctx, 240 * k, 330 * k, 5 * k);
  ctx.fillStyle = '#f5f1ea';
  roundRect(ctx, 238 * k, 330 * k, 36 * k, 34 * k, 10 * k);
  ctx.fill();
  ctx.fillStyle = '#fcdfbd';
  ctx.beginPath();
  ctx.arc(256 * k, 286 * k, 30 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b8542b';
  ctx.beginPath();
  ctx.arc(256 * k, 278 * k, 30 * k, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#33303a';
  ctx.beginPath();
  ctx.arc(246 * k, 290 * k, 4 * k, 0, Math.PI * 2);
  ctx.arc(266 * k, 290 * k, 4 * k, 0, Math.PI * 2);
  ctx.fill();
  // Ресницы — короткие штрихи у внешних уголков глаз.
  ctx.strokeStyle = '#3a2a22';
  ctx.lineWidth = 1.4 * k;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(241 * k, 287 * k); ctx.lineTo(238.5 * k, 283.5 * k);
  ctx.moveTo(271 * k, 287 * k); ctx.lineTo(273.5 * k, 283.5 * k);
  ctx.stroke();
  // Улыбка.
  ctx.strokeStyle = '#a8554a';
  ctx.lineWidth = 1.4 * k;
  ctx.beginPath();
  ctx.arc(256 * k, 297 * k, 5 * k, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = 'rgba(232,138,134,0.55)';
  ctx.beginPath();
  ctx.arc(238 * k, 298 * k, 6 * k, 0, Math.PI * 2);
  ctx.arc(274 * k, 298 * k, 6 * k, 0, Math.PI * 2);
  ctx.fill();

  // Звезда — прогрессия карьеры.
  ctx.save();
  ctx.translate(408 * k, 412 * k);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const r = (i % 2 === 0 ? 34 : 15) * k;
    const x = Math.cos(ang) * r;
    const y = Math.sin(ang) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = '#f7c948';
  ctx.fill();
  ctx.lineWidth = 4 * k;
  ctx.strokeStyle = '#8a6a12';
  ctx.stroke();
  ctx.restore();
}

/** Обложка 800×470: настоящий кадр игры + заголовок. */
async function makeCover() {
  const W = 800;
  const H = 470;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const source = ['shift-queue.png', 'shift-register.png', 'menu.png']
    .map((n) => resolve(SHOTS, n))
    .find((p) => existsSync(p));
  if (source) {
    const img = await loadImage(source);
    const ratio = Math.max(W / img.width, H / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  } else {
    ctx.fillStyle = '#2a2433';
    ctx.fillRect(0, 0, W, H);
  }
  // Затемнение снизу вверх — чтобы текст читался поверх кадра.
  const shade = ctx.createLinearGradient(0, H, 0, 0);
  shade.addColorStop(0, 'rgba(10,7,14,0.97)');
  shade.addColorStop(0.45, 'rgba(10,7,14,0.82)');
  shade.addColorStop(0.75, 'rgba(10,7,14,0.45)');
  shade.addColorStop(1, 'rgba(10,7,14,0.28)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);

  // Шапка в фирменном цвете: знак сети и название.
  ctx.fillStyle = BRAND_GREEN;
  ctx.fillRect(0, 0, W, 92);
  ctx.fillStyle = '#f6efe4';
  ctx.font = `bold 44px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(BRAND, W / 2 + 26, 48);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  grapesAt(ctx, W / 2 - 138, 22, 9);

  ctx.textAlign = 'left';
  const shout = (str, x, y, font, fill, outline = 5) => {
    ctx.font = font;
    ctx.lineWidth = outline;
    ctx.strokeStyle = 'rgba(10,7,14,0.92)';
    ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  };
  shout(TITLE, 40, 196, `bold 54px ${FONT}`, '#ffffff');
  shout(SUBTITLE, 42, 246, `bold 24px ${FONT}`, '#f7c948', 4);
  shout('Полки, касса и паспорта в одной смене', 42, 300, `20px ${FONT}`, '#ece6e0', 4);
  shout('Три адреса · девять смен · 18 целей карьеры', 42, 330, `20px ${FONT}`, '#ece6e0', 4);

  // Три звезды прогрессии.
  for (let i = 0; i < 3; i++) {
    const cx = W - 236 + i * 74;
    const cy = H - 74;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const ang = (Math.PI / 5) * k - Math.PI / 2;
      const r = k % 2 === 0 ? 30 : 13;
      const x = Math.cos(ang) * r;
      const y = Math.sin(ang) * r;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#f7c948';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#8a6a12';
    ctx.stroke();
    ctx.restore();
  }

  writeFileSync(resolve(OUT, 'cover.png'), canvas.toBuffer('image/png'));
  console.log('  ✓ promo/cover.png — обложка 800×470');
}

function makeIcons() {
  for (const size of [512, 256]) {
    const canvas = createCanvas(size, size);
    drawIcon(canvas.getContext('2d'), size);
    const name = size === 512 ? 'icon.png' : `icon-${size}.png`;
    writeFileSync(resolve(OUT, name), canvas.toBuffer('image/png'));
    console.log(`  ✓ promo/${name} — иконка ${size}×${size}`);
  }
}

const TEXTS = `# Тексты карточки для консоли разработчика

## Название

${TITLE}

## Короткое описание (до 70 символов)

Расставь товар, отбей очередь и проверь паспорта за три минуты.

## Полное описание

Вы — Катьме, продавец магазина «ВИНОГРАД» у дома. Смена длится две-три минуты,
и за это время нужно успеть всё сразу: выложить товар из ящиков на полки, разобрать
очередь на кассе и не продать крепкое младше 18 лет.

- Две работы на одной смене: склад и касса. Пустые полки — покупатели уходят,
  длинная очередь — растёт стресс.
- Проверка паспорта: клавиша F. За верный отказ платят премию, за продажу
  подростку приходит штраф 1 800 ₽.
- Скандалы на кассе: выбирайте верную реплику, чтобы не потерять рейтинг магазина.
- Тайный покупатель ходит по залу и оценивает порядок.
- Три адреса и девять смен: от тихого магазина на Садовой до круглосуточной точки
  на трассе.
- Шесть комплектов формы открываются за звёзды, пять улучшений покупаются за премию.
- 18 постоянных целей карьеры и звания от «Стажёра» до «Легенды сети».
- Управление одной рукой с клавиатуры: WASD, E, Space, F, X, Enter.

## Как играть

WASD или стрелки — движение Катьме. E — взять ящик, выложить товар или встать за
кассу. Space — пробить товар. F — проверить паспорт. X — убрать крепкое из чека.
Enter — завершить чек. Shift — второе дыхание. Esc — пауза. Клавиши физические:
русская раскладка не мешает.

## Категории

Аркады, Симуляторы, Казуальные игры

## Теги

симулятор работы, касса, магазин, аркада, тайм-менеджмент, для одного игрока,
с клавиатуры, короткие сессии, прогрессия, юмор

## Возрастной рейтинг

18+ (в игре продаётся алкоголь; продажа несовершеннолетним запрещена — это часть правил)

## Что важно знать модератору

- Все названия магазинов и товаров вымышлены; совпадения с реальными сетями и
  брендами случайны — игра не изображает конкретную торговую сеть.
- Реклама запрашивается только после финиша и только по нажатию «Ещё одна смена»,
  собственный интервал — не меньше 90 секунд.
- Покупок, rewarded-рекламы и передачи данных третьим лицам нет.
- Регистрация и авторизация не запрашиваются: игра работает гостем. Прогресс
  хранится в localStorage, а при доступном SDK — в облако платформы.
- Внешних библиотек, CDN, PWA и service worker нет.
`;

function makeTexts() {
  writeFileSync(resolve(OUT, 'TEXTS.md'), TEXTS, { encoding: 'utf-8' });
  console.log('  ✓ promo/TEXTS.md — тексты карточки');
}

function copyScreenshots() {
  if (!existsSync(SHOTS)) return 0;
  let n = 0;
  for (const file of readdirSync(SHOTS).filter((f) => f.endsWith('.png'))) {
    copyFileSync(resolve(SHOTS, file), resolve(OUT, 'screenshots', file));
    n++;
  }
  console.log(`  ✓ promo/screenshots/ — ${n} снимков для карточки`);
  return n;
}

const only = process.argv[2]?.replace('--only=', '');
console.log('Собираем материалы для карточки:');
if (!only || only === 'cover') await makeCover();
if (!only || only === 'icon') makeIcons();
if (!only || only === 'texts') makeTexts();
copyScreenshots();
console.log('\nГотово. Материалы лежат в promo/.');
