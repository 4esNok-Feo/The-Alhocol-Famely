/**
 * hud.js — интерфейс смены: таймер, план, рейтинг, стресс, панель полок,
 * касса с чеком, диалог со скандалистом, подсказки и всплывающие сообщения.
 *
 * Важная часть — кнопки. Каждая кнопка не только рисуется, но и кладёт свой
 * прямоугольник в `this.buttons`, поэтому мышь (и касание) работают по
 * реальным областям, а не по «картинке».
 */

import { ITEM_BY_ID, KEYS_HELP } from '../core/config.js';
import { clamp, formatMoney, formatTime, plural } from '../core/util.js';
import {
  fillRound, fitText, icon, progressBar, strokeRound, text,
} from '../render/draw2d.js';

const COLORS = {
  panel: 'rgba(24,20,28,0.82)',
  panelLight: 'rgba(38,32,44,0.9)',
  stroke: 'rgba(255,255,255,0.12)',
  text: '#f4efe8',
  dim: '#c8c0b8',
  red: '#e0455a',
  green: '#5fc27e',
  amber: '#e8b44a',
  blue: '#6fb3e0',
  gold: '#f7c948',
};

export class Hud {
  constructor() {
    this.t = 0;
    this.buttons = [];
    this.toasts = [];
    this.tip = null;
    this.helpOpen = false;
    this.hoverId = null;
    this.pressedId = null;
    this.flash = null;           // {color, alpha}
    this.compact = false;
    this.lastQueueHint = 0;
  }

  /** Всплывающая плашка: «штраф», «отказ», «проверка» — это лента событий. */
  toast(str, kind = 'info', life = 3.2) {
    this.toasts.push({ str, kind, life, ttl: life });
    if (this.toasts.length > 4) this.toasts.shift();
  }

  update(dt) {
    this.t += dt;
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);
    if (this.flash) {
      this.flash.alpha -= dt * 1.6;
      if (this.flash.alpha <= 0) this.flash = null;
    }
  }

  setTip(str, key = null) {
    this.tip = str ? { str, key } : null;
  }

  /** Разбор событий модели: HUD превращает их в текст, звук трогает игра. */
  handleEvents(events, run) {
    for (const ev of events) {
      switch (ev.type) {
        case 'scan':
          this.toast(`${ev.item} · +${formatMoney(ev.price)} ₽`, 'money', 1.6);
          break;
        case 'sale':
          if (ev.fast) this.toast(`Быстрая касса! Чаевые ${formatMoney(ev.tip)} ₽`, 'good', 2.4);
          else this.toast(`Чек ${formatMoney(ev.total)} ₽ · чаевые ${formatMoney(ev.tip)} ₽`, 'money', 2.2);
          break;
        case 'fine':
          this.toast(`Штраф ${formatMoney(ev.amount)} ₽: продали крепкое младше 18`, 'bad', 4.5);
          this.flash = { color: '#c0273a', alpha: 0.5 };
          break;
        case 'refuse':
          if (ev.good) this.toast(`Отказ в продаже — верно. Премия ${formatMoney(ev.bonus)} ₽`, 'good', 3.4);
          else this.toast('Отказали взрослому покупателю — зря', 'bad', 3);
          break;
        case 'id_minor':
          this.toast(`Паспорт: ${ev.age} ${plural(ev.age, 'год', 'года', 'лет')} — продавать нельзя (X)`, 'bad', 4);
          break;
        case 'id_ok':
          this.toast(`Паспорт в порядке: ${ev.age}`, 'good', 2.2);
          break;
        case 'id_annoyed':
          this.toast('«Мне что, на вид мало?»', 'warn', 2.4);
          break;
        case 'customer_left':
          this.toast(`${ev.name} ушёл из очереди. Рейтинг −8`, 'bad', 3);
          this.flash = { color: '#c0273a', alpha: 0.32 };
          break;
        case 'customer_left_empty':
          this.toast(`${ev.name}: товара на полке нет — ушёл без покупки`, 'bad', 3.4);
          break;
        case 'empty_shelf':
          this.toast('Пустая полка! Срочно ящик со склада', 'bad', 3.6);
          break;
        case 'crate_empty':
          this.toast('Ящиков пока нет — поставка в пути', 'warn', 2.4);
          break;
        case 'wrong_shelf':
          this.toast(`Это ящик не от этой полки — несите к «${shelfTitle(ev.need)}»`, 'warn', 3);
          break;
        case 'inspector':
          this.toast(ev.good
            ? `Тайный покупатель: зал в порядке! Премия 400 ₽`
            : `Тайный покупатель: претензии (зал ${Math.round(ev.fullness * 100)}%). Рейтинг −12`,
          ev.good ? 'good' : 'bad', 5);
          this.flash = { color: ev.good ? '#2f8f4f' : '#c0273a', alpha: 0.3 };
          break;
        case 'dialog_result':
          this.toast(ev.good ? `«${ev.line}» — клиент успокоился` : `«${ev.line}» — стало хуже`, ev.good ? 'good' : 'bad', 3);
          break;
        case 'change_needed':
          this.toast(`Купюра ${formatMoney(ev.note)} ₽ — отдайте сдачу (Enter)`, 'warn', 2.6);
          break;
        case 'change_ok':
          this.toast(`Сдача отдана: +${formatMoney(ev.bonus)} ₽ чаевых`, 'money', 2);
          break;
        case 'phase':
          this.toast(`${ev.name}: покупателей больше!`, 'warn', 4);
          break;
        case 'queue_full':
          this.toast('Очередь полная — люди ждут у входа', 'warn', 2.6);
          break;
        case 'fill':
          this.toast(`Выложено ${ev.units} ед. · на полке ${ev.unitsNow}`, 'good', 1.8);
          break;
        case 'shelf_empty':
          this.toast(`Полка «${ev.title}» опустела`, 'bad', 2.8);
          break;
        default:
          break;
      }
    }
  }

  /**
   * Отрисовка кадра HUD.
   * @returns {Array} нажатые в этом кадре кнопки (id) — их обрабатывает игра
   */
  draw(ctx, run, opts) {
    const { w, h, soundOn = true } = opts;
    this.soundOn = soundOn;
    this.buttons = [];
    const s = clamp(Math.min(w / 1280, h / 720), 0.68, 1.35);
    this.scale = s;
    this.compact = w < 900;
    const snap = run.snapshot();

    this.drawTopBar(ctx, snap, w, h, s);
    this.drawShelfPanel(ctx, run, snap, w, h, s);
    if (snap.atRegister && snap.current) this.drawRegisterPanel(ctx, run, snap, w, h, s);
    else this.drawApproachHints(ctx, run, snap, w, h, s);
    this.drawCarryHint(ctx, run, snap, w, h, s);
    this.drawDialog(ctx, snap, w, h, s);
    this.drawToasts(ctx, w, h, s);
    this.drawTip(ctx, w, h, s);
    if (this.helpOpen) this.drawHelp(ctx, w, h, s);
    if (this.flash) {
      ctx.save();
      ctx.globalAlpha = clamp(this.flash.alpha, 0, 0.7);
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    return this.buttons;
  }

  // ── Верхняя строка: время, план, рейтинг, стресс ─────────────────────
  drawTopBar(ctx, snap, w, h, s) {
    const pad = 12 * s;
    const barH = 54 * s;
    // Панель времени и смены.
    const timePanelW = 232 * s;
    fillRound(ctx, pad, pad, timePanelW, barH, 10 * s, COLORS.panel);
    strokeRound(ctx, pad, pad, timePanelW, barH, 10 * s, COLORS.stroke, 1);
    icon(ctx, 'clock', pad + 22 * s, pad + barH / 2, 26 * s, COLORS.text);
    const timeLeft = snap.timeLeft;
    const urgent = timeLeft < 20;
    text(ctx, formatTime(timeLeft), pad + 44 * s, pad + 30 * s, {
      size: 26 * s, color: urgent ? COLORS.red : COLORS.text, weight: '800', font: 'mono',
    });
    text(ctx, `до конца смены · ${snap.phase.name}`, pad + 44 * s, pad + 46 * s, {
      size: 12 * s, color: COLORS.dim,
    });
    // Кнопки паузы и звука в правом верхнем углу (реальные области).
    const btn = 38 * s;
    this.button(ctx, 'pause', w - pad - btn, pad, btn, btn, () => icon(ctx, 'pause', w - pad - btn / 2, pad + btn / 2, 20 * s, COLORS.text));
    this.button(ctx, 'mute', w - pad - btn * 2 - 8 * s, pad, btn, btn,
      () => text(ctx, this.soundOn ? '♪' : '×', w - pad - btn * 1.5 - 8 * s, pad + btn * 0.68, {
        size: 18 * s, align: 'center', color: COLORS.text, weight: '800',
      }));

    // План и выручка.
    const planW = Math.min(360 * s, w * 0.34);
    const planX = pad + timePanelW + 10 * s;
    fillRound(ctx, planX, pad, planW, barH, 10 * s, COLORS.panel);
    strokeRound(ctx, planX, pad, planW, barH, 10 * s, COLORS.stroke, 1);
    const ratio = clamp(snap.revenue / snap.plan, 0, 1.2);
    text(ctx, 'ПЛАН СМЕНЫ', planX + 12 * s, pad + 18 * s, { size: 11 * s, color: COLORS.dim, weight: '700' });
    text(ctx, `${formatMoney(snap.revenue)} / ${formatMoney(snap.plan)} ₽`, planX + planW - 12 * s, pad + 19 * s, {
      size: 15 * s, align: 'right', color: ratio >= 1 ? COLORS.green : COLORS.text, weight: '800',
    });
    progressBar(ctx, planX + 12 * s, pad + 26 * s, planW - 24 * s, 14 * s, ratio, {
      from: ratio >= 1 ? '#7fe0a0' : '#e8b44a', to: ratio >= 1 ? '#2f8f4f' : '#c98f3a', gloss: true,
    });
    text(ctx, `итог на кассе: ${formatMoney(snap.revenue + snap.tips + snap.bonuses - snap.fines)} ₽`,
      planX + 12 * s, pad + 50 * s, { size: 11 * s, color: COLORS.dim });

    // Рейтинг и стресс (правый край, слева от кнопок).
    const statW = Math.min(250 * s, w * 0.24);
    const statX = w - pad - btn * 2 - 8 * s - statW - 10 * s;
    if (statX > planX + planW + 8 * s) {
      fillRound(ctx, statX, pad, statW, barH, 10 * s, COLORS.panel);
      strokeRound(ctx, statX, pad, statW, barH, 10 * s, COLORS.stroke, 1);
      const r = clamp(snap.rating / 100, 0, 1);
      const st = clamp(snap.stress / 100, 0, 1);
      text(ctx, `РЕЙТИНГ ${Math.round(snap.rating)}`, statX + 12 * s, pad + 16 * s, { size: 11 * s, color: COLORS.dim, weight: '700' });
      progressBar(ctx, statX + 12 * s, pad + 21 * s, statW - 24 * s, 9 * s, r, {
        from: '#8fd3a0', to: '#2f8f4f',
      });
      const collapsing = snap.collapseTimer > 0.4;
      text(ctx, collapsing
        ? `СТРЕСС ${Math.round(snap.stress)}% — РАЗГРЕБИТЕ ОЧЕРЕДЬ!`
        : `СТРЕСС ${Math.round(snap.stress)}%`, statX + 12 * s, pad + 42 * s, {
        size: 11 * s,
        color: collapsing ? '#ffd0d0' : st > 0.7 ? '#ffb4b4' : COLORS.dim,
        weight: '700',
      });
      const blink = snap.collapseTimer > 0.4 ? 0.55 + 0.45 * Math.abs(Math.sin(this.t * 8)) : 1;
      ctx.save();
      ctx.globalAlpha = blink;
      progressBar(ctx, statX + 12 * s, pad + 47 * s, statW - 24 * s, 9 * s, st, {
        from: st > 0.96 ? '#ffd0d0' : st > 0.7 ? '#ff8f8f' : '#e8b44a',
        to: st > 0.96 ? '#ff5b5b' : st > 0.7 ? '#c22f2f' : '#c98f3a',
      });
      ctx.restore();
    }
  }

  // ── Панель полок со склада ───────────────────────────────────────────
  drawShelfPanel(ctx, run, snap, w, h, s) {
    const pad = 12 * s;
    const rowH = 26 * s;
    const defs = snap.shelfDefs;
    const panelW = 232 * s;
    const panelH = 30 * s + defs.length * rowH + 8 * s;
    const x = pad;
    const y = h - pad - panelH;
    fillRound(ctx, x, y, panelW, panelH, 10 * s, COLORS.panel);
    strokeRound(ctx, x, y, panelW, panelH, 10 * s, COLORS.stroke, 1);
    text(ctx, 'ПОЛКИ', x + 12 * s, y + 20 * s, { size: 11 * s, color: COLORS.dim, weight: '700' });
    defs.forEach((def, i) => {
      const st = snap.shelves[def.id];
      const ry = y + 26 * s + i * rowH;
      const carrying = snap.carrying === def.id;
      if (carrying) fillRound(ctx, x + 6 * s, ry - 4 * s, panelW - 12 * s, rowH - 2 * s, 6 * s, 'rgba(247,201,72,0.18)');
      text(ctx, def.short, x + 12 * s, ry + 13 * s, { size: 12 * s, color: COLORS.text, weight: '700' });
      const bw = 74 * s;
      progressBar(ctx, x + panelW - bw - 46 * s, ry + 2 * s, bw, 9 * s, st.units / st.cap, {
        from: st.units === 0 ? '#ff8f8f' : '#a8e0b8',
        to: st.units === 0 ? '#c22f2f' : '#3f9f5f',
      });
      text(ctx, `${st.units}/${st.cap}`, x + panelW - 12 * s, ry + 14 * s, {
        size: 12 * s, align: 'right', color: st.units === 0 ? '#ffb4b4' : COLORS.dim,
      });
      if (carrying) {
        text(ctx, '← несите сюда', x + panelW - 12 * s, ry - 1 * s, { size: 10 * s, align: 'right', color: COLORS.gold });
      }
    });
  }

  // ── Касса: чек текущего покупателя ───────────────────────────────────
  drawRegisterPanel(ctx, run, snap, w, h, s) {
    const c = snap.current;
    const pw = Math.min(420 * s, w * 0.42);
    const rowH = 22 * s;
    // Высоту панели считаем заранее: строка отказа от продажи — часть панели,
    // иначе она наезжала на последние позиции чека.
    const pending = c.basket.some((i) => !i.scanned && !i.removed);
    const restrictedLeft = c.basket.some((i) => !i.scanned && !i.removed && itemOf(i, ITEM_BY_ID).restricted);
    const refuseRow = restrictedLeft ? 34 * s : 0;
    const ph = 118 * s + Math.min(c.basket.length, 5) * rowH
      + (c.idRevealed ? 22 * s : 0) + refuseRow;
    const x = w - pw - 12 * s;
    const y = h - ph - 12 * s;
    fillRound(ctx, x, y, pw, ph, 12 * s, COLORS.panelLight);
    strokeRound(ctx, x, y, pw, ph, 12 * s, 'rgba(255,255,255,0.18)', 1);

    // Клиент и его терпение.
    text(ctx, fitText(ctx, c.name, pw - 24 * s, 15 * s, '800'), x + 12 * s, y + 22 * s, {
      size: 15 * s, color: COLORS.text, weight: '800',
    });
    const patience = clamp(c.patience / c.patienceMax, 0, 1);
    progressBar(ctx, x + 12 * s, y + 28 * s, pw - 24 * s, 8 * s, patience, {
      from: patience > 0.5 ? '#8fd3a0' : '#ffb36b',
      to: patience > 0.5 ? '#2f8f4f' : '#c98f3a',
    });

    // Шапка чека.
    text(ctx, 'ЧЕК', x + 12 * s, y + 58 * s, { size: 11 * s, color: COLORS.dim, weight: '700' });
    text(ctx, `${formatMoney(c.chequeTotal)} ₽ · купюра ${formatMoney(c.payNote)}`, x + pw - 12 * s, y + 58 * s, {
      size: 12 * s, align: 'right', color: c.chequeTotal >= c.payNote ? COLORS.amber : COLORS.text,
    });

    // Позиции чека.
    c.basket.slice(0, 5).forEach((item, i) => {
      const ry = y + 66 * s + i * rowH;
      const done = item.scanned;
      const removed = item.removed;
      ctx.save();
      ctx.globalAlpha = removed ? 0.45 : 1;
      text(ctx, done ? '✓' : removed ? '✕' : '·', x + 14 * s, ry + 12 * s, {
        size: 13 * s, color: done ? COLORS.green : removed ? COLORS.red : COLORS.dim, weight: '800',
      });
      text(ctx, fitText(ctx, item.name, pw - 130 * s, 12 * s), x + 30 * s, ry + 12 * s, {
        size: 12 * s, color: removed ? COLORS.dim : COLORS.text,
      });
      if (item.restricted && !done && !removed) {
        fillRound(ctx, x + pw - 104 * s, ry + 2 * s, 32 * s, 14 * s, 4 * s, 'rgba(224,69,90,0.28)');
        text(ctx, '18+', x + pw - 88 * s, ry + 13 * s, { size: 10 * s, align: 'center', color: '#ffb4b4', weight: '800' });
      }
      text(ctx, `${formatMoney(item.price)} ₽`, x + pw - 14 * s, ry + 12 * s, {
        size: 12 * s, align: 'right', color: COLORS.dim,
      });
      ctx.restore();
    });
    if (c.basket.length > 5) {
      text(ctx, `и ещё ${c.basket.length - 5}…`, x + 30 * s, y + 66 * s + 5 * rowH + 10 * s, { size: 11 * s, color: COLORS.dim });
    }

    // Результат проверки паспорта.
    let cursorY = y + 66 * s + Math.min(c.basket.length, 5) * rowH + 4 * s;
    if (c.idRevealed) {
      fillRound(ctx, x + 12 * s, cursorY, pw - 24 * s, 18 * s, 5 * s, 'rgba(255,255,255,0.10)');
      text(ctx, c.age < 18
        ? `Паспорт: ${c.age} ${plural(c.age, 'год', 'года', 'лет')} — продажа крепкого запрещена`
        : `Паспорт: ${c.age} ${plural(c.age, 'год', 'года', 'лет')} — можно`,
      x + 20 * s, cursorY + 13 * s, {
        size: 11 * s, color: c.age < 18 ? '#ffb4b4' : COLORS.green, weight: '700',
      });
      cursorY += 22 * s;
    }

    // Кнопки действий — кликабельные, с номерами клавиш.
    const bw = (pw - 36 * s) / 3;
    const by = y + ph - 40 * s;
    this.button(ctx, 'scan', x + 12 * s, by, bw, 30 * s, () => {
      const label = pending ? 'Пробить' : 'Чек готов';
      text(ctx, `${label} · Space`, x + 12 * s + bw / 2, by + 20 * s, {
        size: 12 * s, align: 'center', color: pending ? COLORS.text : COLORS.dim, weight: '700',
      });
    }, pending);
    this.button(ctx, 'checkId', x + 12 * s + bw + 6 * s, by, bw, 30 * s, () => {
      const label = c.idChecked ? 'Паспорт ✓' : 'Паспорт';
      text(ctx, `${label} · F`, x + 12 * s + bw * 1.5 + 6 * s, by + 20 * s, {
        size: 12 * s, align: 'center', color: c.idChecked ? COLORS.green : COLORS.text, weight: '700',
      });
    }, !c.idChecked);
    this.button(ctx, 'finish', x + 12 * s + (bw + 6 * s) * 2, by, bw, 30 * s, () => {
      const label = c.changePending ? 'Сдача!' : 'Завершить';
      text(ctx, `${label} · Enter`, x + 12 * s + bw * 2.5 + 12 * s, by + 20 * s, {
        size: 12 * s, align: 'center', color: c.changePending ? COLORS.gold : COLORS.text, weight: '800',
      });
    }, true);

    // Отказ от продажи крепкого — отдельной строкой, когда он уместен.
    if (restrictedLeft) {
      this.button(ctx, 'refuse', x + 12 * s, by - 34 * s, pw - 24 * s, 28 * s, () => {
        text(ctx, 'Отказать в продаже крепкого · X', x + pw / 2, by - 15 * s, {
          size: 12 * s, align: 'center', color: '#ffd0d0', weight: '700',
        });
      }, true);
    }
    // Окно сдачи.
    if (c.changePending) {
      const t = clamp(c.changeTimer / c.changeTimerMax, 0, 1);
      progressBar(ctx, x + 12 * s, y + ph - 6 * s, pw - 24 * s, 5 * s, t, {
        from: COLORS.gold, to: '#c98f3a',
      });
    }
  }

  /** Подсказки, когда Катьме не у кассы. */
  drawApproachHints(ctx, run, snap, w, h, s) {
    const pad = 12 * s;
    const boxW = 300 * s;
    const x = w - boxW - pad;
    const y = h - 116 * s;
    if (snap.queue > 0 || snap.outside > 0 || snap.incoming > 0) {
      const inQueue = snap.queue > 0;
      fillRound(ctx, x, y, boxW, 62 * s, 10 * s,
        inQueue ? 'rgba(192,39,58,0.82)' : 'rgba(146,96,26,0.85)');
      text(ctx, snap.current ? 'Покупатель ждёт на кассе'
        : inQueue ? 'Покупатель встал в очередь' : 'Покупатель идёт к кассе',
      x + boxW / 2, y + 24 * s, { size: 14 * s, align: 'center', color: '#fff', weight: '800' });
      text(ctx, `в очереди: ${snap.queue}${snap.incoming ? ` · на подходе: ${snap.incoming}` : ''}`
        + `${snap.outside ? ` · у входа: ${snap.outside}` : ''} · встаньте за кассу`,
      x + boxW / 2, y + 44 * s, { size: 12 * s, align: 'center', color: '#ffe2e2' });
      return;
    }
    // Никого нет — напоминаем про полки.
    const low = snap.shelfDefs.map((d) => ({ d, st: snap.shelves[d.id] }))
      .filter((r) => r.st.units / r.st.cap < 0.5);
    if (low.length && !snap.carrying) {
      fillRound(ctx, x, y, boxW, 62 * s, 10 * s, COLORS.panel);
      text(ctx, 'Покупателей нет — пополните полки', x + boxW / 2, y + 24 * s, {
        size: 13 * s, align: 'center', color: COLORS.text, weight: '700',
      });
      text(ctx, `низкие: ${low.map((r) => r.d.short).join(', ')} · берите ящик (E)`,
        x + boxW / 2, y + 44 * s, { size: 11 * s, align: 'center', color: COLORS.dim });
    }
  }

  /** Что Катьме несёт в руках. */
  drawCarryHint(ctx, run, snap, w, h, s) {
    if (!snap.carrying) return;
    const def = snap.shelfDefs.find((d) => d.id === snap.carrying);
    const boxW = 300 * s;
    const x = w / 2 - boxW / 2;
    const y = h - 96 * s;
    fillRound(ctx, x, y, boxW, 40 * s, 10 * s, 'rgba(247,201,72,0.92)');
    icon(ctx, 'box', x + 26 * s, y + 20 * s, 22 * s, '#3a2c07');
    text(ctx, `Ящик: ${def.short} — несите к полке «${def.title}»`, x + 46 * s, y + 25 * s, {
      size: 13 * s, color: '#3a2c07', weight: '800',
    });
  }

  // ── Диалог со скандалистом ───────────────────────────────────────────
  drawDialog(ctx, snap, w, h, s) {
    const dl = snap.dialogCustomer;
    if (!dl) return;
    const pw = Math.min(560 * s, w - 40 * s);
    const ph = 168 * s;
    const x = w / 2 - pw / 2;
    const y = h * 0.16;
    fillRound(ctx, x, y, pw, ph, 14 * s, 'rgba(30,24,34,0.94)');
    strokeRound(ctx, x, y, pw, ph, 14 * s, 'rgba(224,69,90,0.55)', 2);
    text(ctx, 'Скандал на кассе', x + 20 * s, y + 26 * s, { size: 12 * s, color: COLORS.amber, weight: '800' });
    text(ctx, dl.line, x + 20 * s, y + 54 * s, {
      size: 18 * s, color: COLORS.text, weight: '800',
    });
    text(ctx, 'Выберите реплику: клавиши 1/2/3 или щелчок', x + pw - 20 * s, y + 26 * s, {
      size: 11 * s, align: 'right', color: COLORS.dim,
    });
    const bw = pw - 40 * s;
    dl.options.forEach((opt, i) => {
      const ry = y + 68 * s + i * 32 * s;
      this.button(ctx, `answer${i + 1}`, x + 20 * s, ry, bw, 28 * s, () => {
        fillRound(ctx, x + 20 * s, ry, bw, 28 * s, 7 * s, 'rgba(255,255,255,0.08)');
        text(ctx, `${i + 1}. ${fitText(ctx, opt, bw - 24 * s, 13 * s)}`, x + 30 * s, ry + 19 * s, {
          size: 13 * s, color: COLORS.text, weight: '600',
        });
      }, true, 'rgba(255,255,255,0.05)');
    });
    progressBar(ctx, x + 20 * s, y + ph - 12 * s, pw - 40 * s, 6 * s, clamp(dl.timer / 9, 0, 1), {
      from: COLORS.red, to: '#7a1c2a',
    });
  }

  // ── Лента событий и подсказки ────────────────────────────────────────
  drawToasts(ctx, w, h, s) {
    const pad = 12 * s;
    const bw = Math.min(360 * s, w * 0.36);
    this.toasts.forEach((t, i) => {
      const y = 84 * s + i * 34 * s;
      const alpha = clamp(t.life / Math.min(0.8, t.ttl), 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      const color = t.kind === 'bad' ? 'rgba(168,31,60,0.92)'
        : t.kind === 'good' ? 'rgba(38,120,72,0.92)'
          : t.kind === 'money' ? 'rgba(150,110,30,0.92)'
            : t.kind === 'warn' ? 'rgba(146,96,26,0.92)' : 'rgba(30,26,36,0.9)';
      fillRound(ctx, w - pad - bw, y, bw, 28 * s, 8 * s, color);
      text(ctx, fitText(ctx, t.str, bw - 20 * s, 12.5 * s), w - pad - 10 * s, y + 19 * s, {
        size: 12.5 * s, align: 'right', color: '#fff', weight: '700',
      });
      ctx.restore();
    });
  }

  drawTip(ctx, w, h, s) {
    if (!this.tip) return;
    const bw = Math.min(620 * s, w - 40 * s);
    const x = w / 2 - bw / 2;
    const y = h - 44 * s;
    ctx.save();
    ctx.globalAlpha = 0.92;
    fillRound(ctx, x, y, bw, 32 * s, 10 * s, 'rgba(18,16,22,0.85)');
    ctx.restore();
    text(ctx, this.tip.str, x + bw / 2, y + 21 * s, {
      size: 13 * s, align: 'center', color: '#f4efe8', weight: '600',
    });
  }

  /** Шпаргалка по клавишам (Q). */
  drawHelp(ctx, w, h, s) {
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = '#0d0b12';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    const pw = Math.min(620 * s, w - 40 * s);
    const ph = 60 * s + KEYS_HELP.length * 26 * s;
    const x = w / 2 - pw / 2;
    const y = h / 2 - ph / 2;
    fillRound(ctx, x, y, pw, ph, 14 * s, COLORS.panelLight);
    strokeRound(ctx, x, y, pw, ph, 14 * s, COLORS.stroke, 1);
    text(ctx, 'Управление', x + 24 * s, y + 34 * s, { size: 20 * s, color: COLORS.text, weight: '800' });
    KEYS_HELP.forEach(([key, desc], i) => {
      const ry = y + 58 * s + i * 26 * s;
      text(ctx, key, x + 24 * s, ry, { size: 13 * s, color: COLORS.gold, weight: '700', font: 'mono' });
      text(ctx, desc, x + 190 * s, ry, { size: 13 * s, color: COLORS.text });
    });
    text(ctx, 'Клавиша Q или Esc — закрыть', x + pw / 2, y + ph - 14 * s, {
      size: 12 * s, align: 'center', color: COLORS.dim,
    });
  }

  /**
   * Кнопка: рисует содержимое и регистрирует область нажатия.
   * Мышь работает по этим областям, клавиатура — по хоткеям игры.
   */
  button(ctx, id, x, y, w, h, paint, enabled = true, bg = 'rgba(255,255,255,0.08)') {
    this.buttons.push({ id, x, y, w, h, enabled });
    const hovered = this.hoverId === id;
    ctx.save();
    ctx.globalAlpha = enabled ? (hovered ? 1 : 0.96) : 0.5;
    fillRound(ctx, x, y, w, h, 7 * (this.scale ?? 1), hovered && enabled ? 'rgba(255,255,255,0.2)' : bg);
    if (hovered && enabled) strokeRound(ctx, x, y, w, h, 7 * (this.scale ?? 1), 'rgba(255,255,255,0.35)', 1);
    paint();
    ctx.restore();
  }

  /** Проверка нажатия мышью по реальной области кнопки. */
  hitTest(px, py) {
    for (const b of this.buttons.slice().reverse()) {
      if (!b.enabled) continue;
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.id;
    }
    return null;
  }

  updateHover(px, py) {
    this.hoverId = this.hitTest(px, py);
    return this.hoverId;
  }
}

function itemOf(basketItem, table) {
  return table[basketItem.id] ?? { restricted: false };
}

function shelfTitle(id) {
  const map = { beer: 'Пиво и сидр', strong: 'Крепкое', snacks: 'Снеки', drinks: 'Вода и энергетики', fresh: 'Хлеб и молочка' };
  return map[id] ?? id;
}

