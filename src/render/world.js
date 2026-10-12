/**
 * world.js — рисование зала, склада, полок, покупателей и Катьме.
 *
 * Вся геометрия возникает из данных config.js: если подвинуть полку в
 * конфигурации, она переедет и на картинке, и в физике. Картинок-ассетов нет —
 * только Canvas 2D, поэтому игра мгновенно грузится на слабых машинах.
 */

import {
  CASHIER, ITEMS, ITEM_BY_ID, WORLD,
} from '../core/config.js';
import { clamp } from '../core/util.js';
import {
  fillRound, fontFamily, grapes, icon, paragraph, progressBar, roundRect, shadow,
  softShadow, strokeRound, text, vgrad,
} from './draw2d.js';

const FLOOR_TILE = 48;

export class WorldRenderer {
  constructor() {
    this.t = 0;
    this.lightCanvas = null;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx  контекст с уже применённой камерой
   * @param {import('../core/run.js').ShiftRun} run
   * @param {object} opts {palette, outfit, dt, night}
   */
  draw(ctx, run, opts = {}) {
    this.lastRun = run;
    const palette = opts.palette ?? {};
    const outfit = opts.outfit ?? { aprons: ['#b8352f'], badge: '#f4d35e' };
    this.t += opts.dt ?? 0.016;

    this.drawFloor(ctx, palette);
    this.drawWalls(ctx, palette);
    this.drawShopProps(ctx, palette, run);
    this.drawShelves(ctx, run);
    this.drawCrates(ctx, run, palette);
    this.drawPeople(ctx, run, outfit);
    return palette;
  }

  // ── Пол, стены, вход ────────────────────────────────────────────────
  drawFloor(ctx, palette) {
    const shop = WORLD.shop;
    // Торговый зал: светлая плитка в шахматку.
    ctx.save();
    ctx.beginPath();
    ctx.rect(shop.x, shop.y, shop.w, shop.h);
    ctx.clip();
    ctx.fillStyle = palette.floor ?? '#e7d9c4';
    ctx.fillRect(shop.x, shop.y, shop.w, shop.h);
    const cols = Math.ceil(shop.w / FLOOR_TILE);
    const rows = Math.ceil(shop.h / FLOOR_TILE);
    for (let ry = 0; ry < rows; ry++) {
      for (let cx = 0; cx < cols; cx++) {
        if ((cx + ry) % 2 === 0) continue;
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.fillRect(shop.x + cx * FLOOR_TILE, shop.y + ry * FLOOR_TILE, FLOOR_TILE, FLOOR_TILE);
      }
    }
    // Полосы «протоптанных» дорожек от входа к кассе — уютная деталь.
    const wearH = 96;
    const g = ctx.createLinearGradient(0, 0, 0, 0);
    g.addColorStop(0, 'rgba(120,96,70,0.14)');
    g.addColorStop(1, 'rgba(120,96,70,0.0)');
    ctx.fillStyle = 'rgba(126,100,74,0.13)';
    ctx.fillRect(shop.x + 20, CASHIER.queueSlots[0].y - wearH / 2, shop.w - 60, wearH);
    ctx.fillStyle = 'rgba(126,100,74,0.09)';
    ctx.fillRect(shop.x + 20, CASHIER.queueSlots[0].y - wearH, 220, wearH);
    ctx.restore();

    // Склад: бетон с разметкой.
    const back = WORLD.backRoom;
    ctx.fillStyle = '#c9c6bd';
    ctx.fillRect(back.x, back.y, back.w, back.h);
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#8f8c84';
    ctx.lineWidth = 2;
    ctx.setLineDash([26, 20]);
    ctx.beginPath();
    ctx.moveTo(back.x + 30, back.y + back.h - 34);
    ctx.lineTo(back.x + back.w - 30, back.y + back.h - 34);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.10;
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = i % 2 ? '#ffffff' : '#6f6c66';
      ctx.fillRect(back.x + 14 + i * 38, back.y + 12, 20, back.h - 24);
    }
    ctx.restore();
  }

  /** Полупрозрачный оттенок цвета бренда для коврика и мелочей. */
  tint(hex, alpha = 0.5) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
    if (!m) return `rgba(63,122,69,${alpha})`;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  drawWalls(ctx, palette) {
    const wall = palette.wall ?? '#f2e6d6';
    const shop = WORLD.shop;
    const wt = WORLD.wallThickness;
    const doorway = WORLD.doorway;
    ctx.save();
    // Стены зала рисуем толстой линией с «плинтусом».
    const rects = [
      { x: shop.x - wt, y: shop.y - wt, w: shop.w + wt * 2, h: wt },
      { x: shop.x - wt, y: shop.y - wt, w: wt, h: shop.h + 40 },
      { x: shop.x + shop.w, y: shop.y - wt, w: wt, h: shop.h + 40 },
      { x: shop.x - wt, y: shop.y + shop.h, w: doorway.x - shop.x + wt, h: wt },
      { x: doorway.x + doorway.w, y: shop.y + shop.h, w: shop.x + shop.w - doorway.x - doorway.w + wt, h: wt },
      { x: WORLD.backRoom.x - wt, y: WORLD.backRoom.y + WORLD.backRoom.h, w: WORLD.backRoom.w + wt * 2, h: wt },
      { x: WORLD.backRoom.x - wt, y: WORLD.backRoom.y, w: wt, h: WORLD.backRoom.h },
      { x: WORLD.backRoom.x + WORLD.backRoom.w, y: WORLD.backRoom.y, w: wt, h: WORLD.backRoom.h },
    ];
    for (const r of rects) {
      ctx.fillStyle = wall;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.fillRect(r.x, r.y + r.h - 5, r.w, 5);
    }
    // Зелено-виноградная полоса сети «ВИНОГРАД» вдоль северной стены.
    ctx.fillStyle = palette.accent ?? '#3f7a45';
    ctx.fillRect(shop.x - wt, shop.y - 6, shop.w + wt * 2, 8);
    ctx.restore();

    // Вход: стеклянная дверь в стене, красный коврик и полосатый навес.
    const ent = WORLD.entrance;
    ctx.save();
    fillRound(ctx, ent.x + 18, ent.y + 6, 30, ent.h - 12, 4, '#3c4a55');
    fillRound(ctx, ent.x + 24, ent.y + 14, 18, ent.h - 28, 3, 'rgba(190,214,224,0.55)');
    text(ctx, 'ОТКРЫТО', ent.x + 33, ent.y + ent.h / 2 + 5, {
      size: 10, align: 'center', color: '#eaf6ff', weight: '700',
    });
    // Коврик «добро пожаловать» — правее двери, у самой полосы входа.
    fillRound(ctx, 84, ent.y + 22, 56, ent.h - 44, 8, this.tint(palette.accent, 0.5));
    text(ctx, 'ДОБРО', 112, ent.y + 52, { size: 12, align: 'center', color: '#ffe9e2', weight: '700' });
    text(ctx, 'ПОЖАЛОВАТЬ', 112, ent.y + 68, { size: 9, align: 'center', color: '#ffe9e2', weight: '700' });
    // Козырёк с полосатым навесом над входом.
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#f4f4f4' : (palette.accent ?? '#3f7a45');
      ctx.fillRect(ent.x + 6, ent.y - 4 + i * 4, 62, 4);
    }
    // Стопка корзин у входа — «берите корзинку».
    for (let i = 0; i < 3; i++) {
      fillRound(ctx, 70 + i * 3, 620 + i * 13, 48, 17, 5, i % 2 ? (palette.accent ?? '#3f7a45') : '#8a9099');
    }
    ctx.restore();
  }

  /** Прилавок, касса, лампа, растения, ценники, чайник — антураж зала. */
  drawShopProps(ctx, palette, run) {
    const counter = CASHIER.counter;
    // Прилавок.
    softShadow(ctx, counter.x + counter.w / 2, counter.y + counter.h - 2, counter.w * 0.5, 16, 0.25);
    fillRound(ctx, counter.x, counter.y, counter.w, counter.h, 12, '#b98b62');
    fillRound(ctx, counter.x + 6, counter.y + 6, counter.w - 12, counter.h - 26, 9, '#d8b189');
    ctx.save();
    ctx.globalAlpha = 0.35;
    fillRound(ctx, counter.x + 6, counter.y + counter.h - 22, counter.w - 12, 16, 6, '#8d6544');
    ctx.restore();

    // Кассовый аппарат слева на прилавке.
    const reg = { x: counter.x + 20, y: counter.y + 12, w: 94, h: 62 };
    fillRound(ctx, reg.x, reg.y, reg.w, reg.h, 8, '#41474f');
    fillRound(ctx, reg.x + 8, reg.y + 8, reg.w - 16, 22, 5, '#7fd6a2');
    ctx.save();
    ctx.globalAlpha = 0.55;
    fillRound(ctx, reg.x + 12, reg.y + 12, 26, 14, 3, '#0f2919');
    ctx.restore();
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        fillRound(ctx, reg.x + 12 + j * 24, reg.y + 36 + i * 8, 18, 5, 2, '#c8ccd2');
      }
    }
    // Сканер штрихкода.
    fillRound(ctx, reg.x + reg.w + 8, reg.y + 30, 34, 20, 6, '#5b6470');
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 3);
    fillRound(ctx, reg.x + reg.w + 14, reg.y + 34, 22, 6, 3, '#ff5b5b');
    ctx.restore();

    // Табличка «КАССА» — в цвете сети.
    fillRound(ctx, counter.x + counter.w - 120, counter.y - 26, 110, 28, 8, palette.accent ?? '#3f7a45');
    text(ctx, 'КАССА', counter.x + counter.w - 65, counter.y - 6, {
      size: 17, align: 'center', color: '#fff5f2', weight: '800',
    });

    // Покупательская корзина: тёмная сетка с товаром и красной кромкой.
    const b = { x: counter.x + counter.w - 118, y: counter.y + 22, w: 104, h: 56 };
    fillRound(ctx, b.x + 8, b.y + 14, b.w - 16, b.h - 16, 8, '#5f6870');
    ctx.save();
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 5; i++) fillRound(ctx, b.x + 14 + i * 18, b.y + 18, 6, b.h - 24, 3, '#2f353b');
    ctx.restore();
    // Товар в корзине.
    fillRound(ctx, b.x + 14, b.y + 4, 18, 22, 4, '#c79a3f');
    fillRound(ctx, b.x + 36, b.y + 8, 20, 18, 4, '#2f8296');
    fillRound(ctx, b.x + 60, b.y + 2, 16, 24, 4, '#c46a2e');
    // Кромка и ручка.
    fillRound(ctx, b.x + 6, b.y + 10, b.w - 12, 8, 4, palette.accent ?? '#3f7a45');
    ctx.save();
    ctx.strokeStyle = palette.accent ?? '#3f7a45';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(b.x + b.w / 2, b.y + 8, 18, Math.PI, 0);
    ctx.stroke();
    ctx.restore();

    // Чайник и кружка — «рабочее место продавца», правее сканера.
    fillRound(ctx, counter.x + 158, counter.y + 26, 44, 42, 10, '#e8e8ec');
    fillRound(ctx, counter.x + 164, counter.y + 20, 32, 14, 6, '#c9c9d2');
    fillRound(ctx, counter.x + 210, counter.y + 40, 24, 26, 6, '#f2f2f6');
    fillRound(ctx, counter.x + 214, counter.y + 36, 16, 8, 4, '#dcdce4');

    // Лампа под потолком (в зале их три).
    for (const lx of [260, 610, 950]) {
      const flicker = 0.86 + 0.14 * Math.sin(this.t * 2 + lx);
      ctx.save();
      ctx.globalAlpha = 0.35 * flicker;
      const g = ctx.createRadialGradient(lx, 420, 10, lx, 420, 250);
      g.addColorStop(0, '#fff4d0');
      g.addColorStop(1, 'rgba(255,244,208,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(lx, 420, 250, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      fillRound(ctx, lx - 34, 236, 68, 12, 6, '#fdf6e3');
    }

    // Растение у входа и стеллаж с мелочью.
    this.drawPlant(ctx, 700, 640);
    this.drawPlant(ctx, 1000, 330);
    // Наклейка-предупреждение на прилавке: «крепкое — только 18+».
    fillRound(ctx, counter.x + 8, counter.y + counter.h - 26, 168, 22, 6, 'rgba(192,39,58,0.92)');
    text(ctx, 'крепкое — только 18+', counter.x + 92, counter.y + counter.h - 11, {
      size: 12, align: 'center', color: '#fff0ee', weight: '800',
    });
    // Огнетушитель и коробки у стены.
    fillRound(ctx, 1010, 620, 30, 54, 8, '#c0392b');
    fillRound(ctx, 1016, 606, 18, 12, 4, '#8e2a1f');
  }

  drawPlant(ctx, x, y) {
    fillRound(ctx, x - 18, y + 10, 36, 26, 6, '#a6603c');
    ctx.save();
    ctx.fillStyle = '#3f7a45';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + this.t * 0.2;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 12, y + Math.sin(a) * 8 - 6, 15, 8, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#4f9a52';
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 16, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawPoster(ctx, x, y, w, big, small) {
    fillRound(ctx, x, y, w, 34, 6, 'rgba(255,255,255,0.92)');
    strokeRound(ctx, x, y, w, 34, 6, 'rgba(192,39,58,0.5)', 2);
    text(ctx, big, x + 12, y + 24, { size: 18, color: '#c0273a', weight: '800' });
    text(ctx, small, x + w - 12, y + 23, { size: 13, align: 'right', color: '#4a4a55' });
  }

  // ── Полки и товар ───────────────────────────────────────────────────
  drawShelves(ctx, run) {
    for (const shelf of run.shelfDefs) {
      const state = run.shelves[shelf.id];
      const r = shelf.rect;
      const empty = state.units === 0;
      softShadow(ctx, r.x + r.w / 2, r.y + r.h, r.w * 0.5, 12, 0.22);
      fillRound(ctx, r.x - 4, r.y - 4, r.w + 8, r.h + 8, 10, '#8d6a4a');
      fillRound(ctx, r.x, r.y, r.w, r.h, 8, '#a8815c');
      // Внутренность полки — тёмная ниша.
      fillRound(ctx, r.x + 6, r.y + 6, r.w - 12, r.h - 12, 6, '#5f442e');

      // Товар: ряды «бутылок» пропорционально заполненности.
      const cols = Math.max(1, Math.floor((r.w - 16) / 24));
      const rows = Math.max(1, Math.floor((r.h - 16) / 30));
      const slots = cols * rows;
      const filled = Math.round((state.units / state.cap) * slots);
      const border = empty ? 'rgba(230,80,80,0.9)' : 'rgba(255,255,255,0.14)';
      ctx.save();
      ctx.strokeStyle = border;
      ctx.lineWidth = 2;
      if (empty) {
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(this.t * 5);
        strokeRound(ctx, r.x - 2, r.y - 2, r.w + 4, r.h + 4, 10, border, 4);
      }
      ctx.restore();
      for (let i = 0; i < filled; i++) {
        const cx = i % cols;
        const cy = Math.floor(i / cols);
        const gx = r.x + 10 + cx * 24;
        const gy = r.y + 10 + cy * 30;
        fillRound(ctx, gx, gy, 16, 24, 4, shelf.color);
        ctx.save();
        ctx.globalAlpha = 0.35;
        fillRound(ctx, gx + 3, gy + 4, 4, 16, 2, '#ffffff');
        ctx.restore();
      }

      // Подпись с названием группы.
      const label = shelf.short;
      const lw = label.length * 8.4 + 20;
      fillRound(ctx, r.x + r.w / 2 - lw / 2, r.y - 22, lw, 22, 6, 'rgba(38,32,40,0.82)');
      text(ctx, label, r.x + r.w / 2, r.y - 6, {
        size: 13, align: 'center', color: '#ffe9c9', weight: '700',
      });

      // Индикатор заполненности у полки.
      const bx = r.x + 4;
      const by = r.y + r.h + 8;
      progressBar(ctx, bx, by, r.w - 8, 10, state.units / state.cap, {
        from: empty ? '#ff6b6b' : '#7fd6a2',
        to: empty ? '#c22f2f' : '#2f8f4f',
        track: 'rgba(0,0,0,0.25)',
        gloss: true,
      });
      text(ctx, `${state.units}/${state.cap}`, bx + r.w - 12, by + 24, {
        size: 12, align: 'right', color: '#40372f', weight: '700',
      });

      // Когда товара мало — рядом с полкой висит «!» (сбоку, чтобы не уходить
      // под верхнюю панель интерфейса).
      if (state.units <= 2) {
        const bob = Math.sin(this.t * 4) * 3;
        const bx = Math.min(r.x + r.w + 22, WORLD.shop.x + WORLD.shop.w - 30);
        const by = r.y + 16 + bob;
        fillRound(ctx, bx - 13, by - 15, 26, 30, 8, state.units === 0 ? '#d63b3b' : '#e8a13a');
        text(ctx, '!', bx, by + 6, { size: 20, align: 'center', color: '#fff', weight: '800' });
        if (state.units === 0) {
          text(ctx, 'полка пуста', bx, by + 30, {
            size: 11, align: 'center', color: '#fff', stroke: 'rgba(90,20,30,0.9)', strokeWidth: 3, weight: '700',
          });
        }
      }
    }
  }

  // ── Склад: ящики ────────────────────────────────────────────────────
  drawCrates(ctx, run, palette) {
    for (const stock of run.sources) {
      const src = stock;
      const shelf = run.shelfDefs.find((s) => s.id === src.shelf);
      const isCarryingTarget = run.carrying === src.shelf;
      // Паллета.
      fillRound(ctx, src.x - 62, src.y - 30, 124, 74, 8, 'rgba(120,96,70,0.35)');
      for (let i = 0; i < (stock?.stock ?? 0); i++) {
        const bx = src.x - 50 + i * 56;
        const by = src.y - 24;
        fillRound(ctx, bx, by, 52, 40, 6, '#c68c4e');
        fillRound(ctx, bx + 4, by + 4, 44, 12, 4, '#e0a866');
        ctx.save();
        ctx.globalAlpha = 0.5;
        fillRound(ctx, bx + 4, by + 20, 44, 6, 3, 'rgba(90,60,30,0.5)');
        ctx.restore();
        text(ctx, shelf.short.slice(0, 6), bx + 26, by + 32, {
          size: 10, align: 'center', color: '#4a3418', weight: '700',
        });
      }
      if ((stock?.stock ?? 0) === 0) {
        text(ctx, 'ждём поставку…', src.x, src.y + 34, {
          size: 12, align: 'center', color: '#5c554a', weight: '600',
        });
        // Немного прозрачной полосы обратно не хватает — показываем прогресс.
        progressBar(ctx, src.x - 46, src.y + 42, 92, 8, stock ? stock.timer / 11 : 0, {
          from: '#e8c27a', to: '#c98f3a', track: 'rgba(0,0,0,0.18)',
        });
      } else {
        text(ctx, `ящиков: ${stock.stock}`, src.x, src.y + 34, {
          size: 12, align: 'center', color: '#4a3c2a', weight: '700',
        });
      }
      if (isCarryingTarget) {
        ctx.save();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 6);
        strokeRound(ctx, src.x - 62, src.y - 30, 124, 74, 8, '#ffd76a', 3);
        ctx.restore();
      }
    }
    text(ctx, 'СКЛАД', WORLD.backRoom.x + 300, WORLD.backRoom.y + 34, {
      size: 20, color: '#5d574c', weight: '800',
    });
    text(ctx, 'Возьмите ящик (E) и отнесите к своей полке', WORLD.backRoom.x + 392, WORLD.backRoom.y + 34, {
      size: 14, color: '#6d675c',
    });
  }

  // ── Покупатели и Катьме ─────────────────────────────────────────────
  drawPeople(ctx, run, outfit) {
    const list = run.customers
      .filter((c) => c.state !== 'gone')
      .map((c) => ({ y: c.y, kind: 'customer', ref: c }));
    list.push({ y: run.player.y, kind: 'player' });
    list.sort((a, b) => a.y - b.y);
    for (const item of list) {
      if (item.kind === 'player') this.drawPlayer(ctx, run, outfit);
      else this.drawCustomer(ctx, run, item.ref);
    }
  }

  /**
   * Катьме — продавщица: длинные волосы с хвостом на резинке, чёлка, ресницы,
   * румянец, платье с фартуком сети и бейдж. Хвост и подол покачиваются при
   * ходьбе, поэтому по силуэту сразу видно, что это девушка, а не «человек
   * вообще».
   */
  drawPlayer(ctx, run, outfit) {
    const p = run.player;
    const t = p.walkPhase;
    const bob = p.moving ? Math.abs(Math.sin(t)) * 2.5 : 0;
    const stride = p.moving ? Math.sin(t) * 7 : 0;
    const swing = p.moving ? Math.sin(t) * 3.2 : 0;   // покачивание хвоста
    const facing = p.facing ?? 1;
    shadow(ctx, p.x, p.y + 14, 20, 9, 0.28);

    // ── Ноги: светлые колготки и кроссовки ────────────────────────────
    const legY = p.y + 4;
    for (const side of [-1, 1]) {
      const lx = p.x + side * 7 + stride * side;
      fillRound(ctx, lx - 4.5, legY, 9, 17, 4.5, '#e8d8cf');
      fillRound(ctx, lx - 5.5, legY + 14, 11, 7, 3, '#f4f1ea');
      fillRound(ctx, lx - 5.5, legY + 18, 11, 4, 2, '#c9c4bd');
    }

    // ── Платье: трапеция с подолом, который качается при шаге ─────────
    const hem = 15 + (p.moving ? Math.abs(Math.sin(t)) * 1.6 : 0);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p.x - 12, p.y - 12);
    ctx.lineTo(p.x + 12, p.y - 12);
    ctx.lineTo(p.x + hem, p.y + 12 + bob * 0.2);
    ctx.lineTo(p.x - hem, p.y + 12 + bob * 0.2);
    ctx.closePath();
    ctx.fillStyle = '#4e5a86';            // тёмно-синее платье под фартуком
    ctx.fill();
    ctx.restore();

    // ── Фартук сети: нагрудник, пояс и подол ─────────────────────────
    const apron = outfit.aprons[p.moving ? Math.floor(t * 2) % outfit.aprons.length : 0];
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p.x - 9, p.y - 13);
    ctx.lineTo(p.x + 9, p.y - 13);
    ctx.lineTo(p.x + 13, p.y + 11 + bob * 0.2);
    ctx.lineTo(p.x - 13, p.y + 11 + bob * 0.2);
    ctx.closePath();
    ctx.fillStyle = apron;
    ctx.fill();
    ctx.restore();
    // Пояс фартука и карман.
    fillRound(ctx, p.x - 13, p.y + 2, 26, 4, 2, 'rgba(0,0,0,0.16)');
    fillRound(ctx, p.x + 1, p.y + 5, 10, 6, 2, 'rgba(255,255,255,0.22)');
    // Знак сети на нагруднике.
    grapes(ctx, p.x - 1, p.y - 5, 2.6);
    // Бейдж с именем — маленькая карточка на груди.
    fillRound(ctx, p.x + 6, p.y - 11, 6, 5, 1.2, '#ffffff');
    fillRound(ctx, p.x + 7, p.y - 10, 3.4, 2, 0.8, outfit.badge);

    // ── Руки ─────────────────────────────────────────────────────────
    for (const side of [-1, 1]) {
      const hx = p.x + side * 15 + (p.moving ? Math.sin(t + side) * 3 : 0);
      fillRound(ctx, hx - 3.5, p.y - 2 - bob * 0.4, 7, 15, 3.5, '#f2c69f');
      // Манжеты фартука.
      fillRound(ctx, hx - 4, p.y - 4 - bob * 0.4, 8, 4, 2, apron);
    }

    // ── Голова: лицо, чёлка, длинные волосы и хвост ──────────────────
    const headY = p.y - 32 - bob;
    // Хвост на резинке — выносим наружу силуэта, иначе он прячется за головой.
    ctx.save();
    ctx.translate(p.x - facing * 12, headY + 1);
    ctx.rotate(-facing * (0.5 + swing * 0.05));
    fillRound(ctx, -4.5, 0, 9, 27, 4.5, '#a84a25');
    fillRound(ctx, -5.5, 23, 11, 9, 4.5, '#b8542b');   // кончик хвоста
    ctx.restore();
    // Резинка.
    fillRound(ctx, p.x - facing * 14 - 3, headY - 1, 8, 6, 3, '#f4d35e');
    // Волосы сзади — «шапка» длинных волос, спускается до плеч.
    fillRound(ctx, p.x - 12, headY - 6, 24, 30, 11, '#b8542b');
    // Лицо.
    fillRound(ctx, p.x - 10.5, headY, 21, 21, 9, '#f6cda6');
    // Чёлка: два «крыла» и пробор, волосы закрывают лоб до бровей.
    fillRound(ctx, p.x - 12, headY - 4, 24, 10, 7, '#b8542b');
    fillRound(ctx, p.x - 12, headY + 1, 5.5, 12, 3.5, '#a84a25');
    fillRound(ctx, p.x + 6.5, headY + 1, 5.5, 12, 3.5, '#a84a25');
    fillRound(ctx, p.x - 2, headY - 5, 4.5, 7, 2.5, '#a84a25');

    // Глаза с ресницами, румянец и улыбка.
    const ex = facing > 0 ? 2.6 : -2.6;
    for (const side of [-1, 1]) {
      const eyeX = p.x + ex + side * 4.2;
      const eyeY = headY + 12.5;
      fillRound(ctx, eyeX - 1.6, eyeY - 2, 3.2, 4.4, 1.6, '#33303a');
      fillRound(ctx, eyeX - 1, eyeY - 2.6, 2, 2, 1, 'rgba(255,255,255,0.85)');
      // Ресницы — короткие штрихи по верхнему краю глаза.
      ctx.save();
      ctx.strokeStyle = '#3a2a22';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(eyeX - 2.6, eyeY - 2.4);
      ctx.lineTo(eyeX - 3.6, eyeY - 4);
      ctx.moveTo(eyeX + 2.6, eyeY - 2.4);
      ctx.lineTo(eyeX + 3.6, eyeY - 4);
      ctx.stroke();
      ctx.restore();
    }
    // Румянец.
    ctx.save();
    ctx.globalAlpha = 0.45;
    fillRound(ctx, p.x - 9, headY + 15, 5, 3.2, 1.6, '#e88a86');
    fillRound(ctx, p.x + 4, headY + 15, 5, 3.2, 1.6, '#e88a86');
    ctx.restore();
    // Улыбка.
    ctx.save();
    ctx.strokeStyle = '#a8554a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(p.x + ex * 0.4, headY + 15.5, 3.4, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.restore();

    // Ящик в руках — виден над головой, слегка покачивается.
    if (run.carrying) {
      const shelf = this.lastRun.shelfDefs.find((s) => s.id === run.carrying);
      const by = p.y - 68 - bob + Math.sin(this.t * 5) * 2;
      fillRound(ctx, p.x - 26, by, 52, 34, 6, '#c68c4e');
      fillRound(ctx, p.x - 22, by + 4, 44, 10, 4, '#e0a866');
      text(ctx, shelf.short.slice(0, 7), p.x, by + 26, {
        size: 12, align: 'center', color: '#432c12', weight: '800',
      });
      // Стрелочка к целевой полке.
      const target = this.lastRun.shelfDefs.find((s) => s.id === run.carrying);
      const ang = Math.atan2(target.stand.y - p.y, target.stand.x - p.x);
      ctx.save();
      ctx.translate(p.x + Math.cos(ang) * 44, by + 16 + Math.sin(ang) * 16);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(255,215,106,0.9)';
      ctx.beginPath();
      ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // Индикатор бега (Shift).
    if (p.dash < 100) {
      progressBar(ctx, p.x - 22, p.y + 26, 44, 6, p.dash / 100, {
        from: '#8fd3ff', to: '#2f7fae', track: 'rgba(0,0,0,0.25)',
      });
    }
  }

  drawCustomer(ctx, run, c) {
    const pal = c.def.palette;
    const moving = c.state === 'walking' || c.state === 'leaving';
    const bob = moving ? Math.abs(Math.sin(c.bob)) * 2 : 0;
    const stride = moving ? Math.sin(c.bob) * 6 : 0;

    shadow(ctx, c.x, c.y + 14, 18, 8, 0.26);
    for (const side of [-1, 1]) {
      const lx = c.x + side * 7 + stride * side;
      fillRound(ctx, lx - 4.5, c.y + 6, 9, 17, 4, pal.pants);
    }
    fillRound(ctx, c.x - 15, c.y - 12, 30, 32, 11, pal.coat);
    // Руки.
    for (const side of [-1, 1]) {
      fillRound(ctx, c.x + side * 15 - 3.5, c.y + 2 - bob * 0.4, 7, 15, 3.5, pal.skin);
    }
    // Голова.
    fillRound(ctx, c.x - 10, c.y - 32 - bob, 20, 21, 8, pal.skin);
    fillRound(ctx, c.x - 11, c.y - 34 - bob, 22, 10, 7, pal.hair);
    if (c.def.id === 'inspector') {
      fillRound(ctx, c.x - 12, c.y - 34 - bob, 24, 6, 3, '#2f2f36');
      fillRound(ctx, c.x - 6, c.y - 26 - bob, 12, 4, 2, 'rgba(255,255,255,0.5)');
    }
    const ex = 0;
    for (const side of [-1, 1]) {
      fillRound(ctx, c.x + ex + side * 4 - 1.3, c.y - 25 - bob, 2.6, 3.6, 1.3, '#33303a');
    }
    // Пакет с покупками в руке.
    if (c.basket.length > 0 && c.state !== 'leaving') {
      fillRound(ctx, c.x + 18, c.y + 8, 14, 18, 4, 'rgba(240,240,245,0.95)');
      fillRound(ctx, c.x + 21, c.y + 4, 8, 6, 3, 'rgba(200,200,210,0.9)');
    }

    // Кольцо терпения над головой.
    if (c.state === 'queue') {
      const ratio = clamp(c.patience / c.patienceMax, 0, 1);
      const color = ratio > 0.5 ? '#7fd6a2' : ratio > 0.25 ? '#e8c25a' : '#e05a5a';
      ctx.save();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,18,25,0.35)';
      ctx.beginPath();
      ctx.arc(c.x, c.y - 52, 17, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(c.x, c.y - 52, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
      ctx.restore();
      if (c.slot === 0) {
        text(ctx, 'касса', c.x, c.y - 74, {
          size: 12, align: 'center', color: '#fff', stroke: 'rgba(20,18,25,0.7)', weight: '700',
        });
      }
    }
    // «!» над тем, кто теряет терпение.
    if (c.state === 'queue' && c.patience / c.patienceMax < 0.3) {
      const jitter = Math.sin(this.t * 12) * 2;
      fillRound(ctx, c.x - 12 + jitter, c.y - 92, 24, 26, 7, '#d63b3b');
      text(ctx, '!', c.x + jitter, c.y - 73, { size: 19, align: 'center', color: '#fff', weight: '800' });
    }
    // Реплика в облачке.
    if (c.line && c.lineTimer > 0) {
      const w = Math.max(120, c.line.length * 8.2);
      const bx = c.x - w / 2;
      const by = c.y - 118;
      fillRound(ctx, bx, by, w, 32, 10, 'rgba(255,255,255,0.94)');
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(c.x - 8, by + 32);
      ctx.lineTo(c.x + 4, by + 32);
      ctx.lineTo(c.x - 2, by + 44);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.fill();
      ctx.restore();
      text(ctx, c.line, c.x, by + 21, {
        size: 13, align: 'center', color: '#39333d', weight: '600',
      });
    }
  }
}

export { ITEMS, ITEM_BY_ID };
