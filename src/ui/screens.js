/**
 * screens.js — все экраны вокруг смены: меню, карьера, сводка смены,
 * экипировка, цели, пауза и справка.
 *
 * Экраны возвращают список нажатых кнопок (id вида `goto:career`,
 * `start:dom:0`), а решения принимает игра — так интерфейс остаётся
 * «тупым» и предсказуемым.
 */

import { KEYS_HELP, OUTFITS, TEXT, UPGRADES, VENUES } from '../core/config.js';
import {
  careerGoals, goalProgress, outfitById, rankFor, shiftList, shiftUnlocked,
  totalStars, unlockedOutfits,
} from '../core/career.js';
import { clamp, formatMoney, formatTime, starsWord } from '../core/util.js';
import {
  fillRound, fitText, grapes, progressBar, star, strokeRound, text,
} from '../render/draw2d.js';

const C = {
  ink: '#221c26',
  paper: '#f6efe4',
  card: 'rgba(26,22,32,0.86)',
  cardLight: 'rgba(255,255,255,0.94)',
  stroke: 'rgba(255,255,255,0.14)',
  red: '#c0273a',
  /** Цвет вымышленной сети «ВИНОГРАД»: виноградная зелень вместо красного. */
  brand: '#3f7a45',
  text: '#f6f1e9',
  dim: '#bfb6ae',
  gold: '#f7c948',
  green: '#5fc27e',
};

export class Screens {
  constructor() {
    this.buttons = [];
    this.hoverId = null;
    this.scale = 1;
    this.anim = 0;
    this.starAnim = 0;
    this.scroll = { career: 0, goals: 0, equipment: 0 };
  }

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

  update(dt) {
    this.anim += dt;
    this.starAnim = Math.min(1, this.starAnim + dt * 1.6);
  }

  /** Рисует экран по его имени. Возвращает список кнопок кадра. */
  draw(ctx, name, state, w, h) {
    this.buttons = [];
    this.ctx = ctx;
    const s = clamp(Math.min(w / 1280, h / 720), 0.66, 1.35);
    this.scale = s;
    const paint = {
      menu: () => this.drawMenu(ctx, state, w, h, s),
      career: () => this.drawCareer(ctx, state, w, h, s),
      brief: () => this.drawBrief(ctx, state, w, h, s),
      results: () => this.drawResults(ctx, state, w, h, s),
      equipment: () => this.drawEquipment(ctx, state, w, h, s),
      goals: () => this.drawGoals(ctx, state, w, h, s),
      pause: () => this.drawPause(ctx, state, w, h, s),
      help: () => this.drawHelp(ctx, state, w, h, s),
      loading: () => this.drawLoading(ctx, state, w, h, s),
      error: () => this.drawError(ctx, state, w, h, s),
    };
    (paint[name] ?? paint.menu)();
    return this.buttons;
  }

  // ── Общие детали ─────────────────────────────────────────────────────
  card(ctx, x, y, w, h, opts = {}) {
    fillRound(ctx, x, y, w, h, opts.r ?? 14, opts.bg ?? C.card);
    strokeRound(ctx, x, y, w, h, opts.r ?? 14, opts.stroke ?? C.stroke, 1);
  }

  btn(ctx, id, x, y, w, h, label, opts = {}) {
    const s = this.scale;
    const enabled = opts.enabled !== false;
    const hovered = this.hoverId === id && enabled;
    this.buttons.push({ id, x, y, w, h, enabled });
    const bg = opts.kind === 'primary'
      ? (hovered ? '#e0455a' : C.red)
      : opts.kind === 'gold'
        ? (hovered ? 'rgba(247,201,72,0.3)' : 'rgba(247,201,72,0.18)')
        : (hovered ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)');
    fillRound(ctx, x, y, w, h, 10, bg);
    if (opts.kind === 'gold') strokeRound(ctx, x, y, w, h, 10, 'rgba(247,201,72,0.5)', 1.5);
    if (opts.kind !== 'primary' && opts.kind !== 'gold') {
      strokeRound(ctx, x, y, w, h, 10, enabled ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)', 1);
    }
    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.45;
    text(ctx, label, x + w / 2, y + h / 2 + 6 * s, {
      size: (opts.size ?? 16) * s, align: 'center', color: opts.color ?? C.text,
      weight: opts.weight ?? '700',
    });
    if (opts.note) {
      text(ctx, opts.note, x + w / 2, y + h - 8 * s, { size: 11 * s, align: 'center', color: C.dim });
    }
    ctx.restore();
  }

  stars(ctx, count, max, cx, cy, r, s) {
    for (let i = 0; i < max; i++) {
      const x = cx + (i - (max - 1) / 2) * r * 2.6;
      const filled = i < count;
      if (filled && this.starAnim < 1 && count > 0) {
        const k = clamp(this.starAnim * 1.4 - i * 0.2, 0, 1);
        ctx.save();
        ctx.globalAlpha = k;
        star(ctx, x, cy, r * (0.6 + 0.4 * k), C.gold, '#8a6a12');
        ctx.restore();
      } else {
        star(ctx, x, cy, filled ? r : r * 0.86,
          filled ? C.gold : 'rgba(255,255,255,0.16)',
          filled ? '#8a6a12' : 'rgba(0,0,0,0.35)');
      }
    }
  }

  header(ctx, title, subtitle, w, h, s, profile) {
    const pad = 22 * s;
    fillRound(ctx, 0, 0, w, 64 * s, 0, 'rgba(14,12,18,0.72)');
    text(ctx, title, pad, 38 * s, { size: 26 * s, color: C.text, weight: '800' });
    if (subtitle) text(ctx, subtitle, pad + 2 * s, 56 * s, { size: 12 * s, color: C.dim });
    if (profile) {
      const rank = rankFor(profile.xp);
      const right = w - pad;
      text(ctx, `★ ${profile.stars} · ${formatMoney(profile.wallet)} ₽ · ${rank.name}`, right, 32 * s, {
        size: 15 * s, align: 'right', color: C.gold, weight: '700',
      });
      const next = rank.next;
      if (next) {
        progressBar(ctx, right - 200 * s, 40 * s, 200 * s, 8 * s, (profile.xp % 2500) / 2500, {
          from: '#8fd3a0', to: '#2f8f4f',
        });
        text(ctx, `до следующего звания ${formatMoney(next - profile.xp)} опыта`, right, 60 * s, {
          size: 11 * s, align: 'right', color: C.dim,
        });
      }
    }
  }

  // ── Главное меню ─────────────────────────────────────────────────────
  drawMenu(ctx, state, w, h, s) {
    const { profile } = state;
    const cx = w / 2;
    const cardW = Math.min(520 * s, w - 40 * s);
    const x = cx - cardW / 2;
    const y = h * 0.12;

    // Вывеска магазина.
    const signW = Math.min(620 * s, w - 60 * s);
    const sx = cx - signW / 2;
    fillRound(ctx, sx, y - 74 * s, signW, 84 * s, 12 * s, '#f6efe4');
    strokeRound(ctx, sx, y - 74 * s, signW, 84 * s, 12 * s, C.brand, 4);
    // Гроздь винограда слева от названия — знак сети.
    grapes(ctx, sx + 34 * s, y - 32 * s, 11 * s);
    text(ctx, 'ВИНОГРАД', cx + 12 * s, y - 30 * s, {
      size: 40 * s, align: 'center', color: C.brand, weight: '800',
    });
    text(ctx, 'магазин у дома · круглосуточно', cx, y - 8 * s, {
      size: 13 * s, align: 'center', color: '#6d5f58', weight: '700',
    });

    this.card(ctx, x, y + 32 * s, cardW, 330 * s);
    text(ctx, TEXT.title, cx, y + 76 * s, { size: 34 * s, align: 'center', color: C.text, weight: '800' });
    text(ctx, TEXT.tagline, cx, y + 100 * s, { size: 13 * s, align: 'center', color: C.dim });

    const bw = cardW - 60 * s;
    const bx = x + 30 * s;
    let by = y + 122 * s;
    this.btn(ctx, 'goto:career', bx, by, bw, 52 * s, 'Работать смену', { kind: 'primary', size: 19 });
    by += 62 * s;
    this.btn(ctx, 'goto:equipment', bx, by, bw / 2 - 5 * s, 44 * s, 'Экипировка');
    this.btn(ctx, 'goto:goals', bx + bw / 2 + 5 * s, by, bw / 2 - 5 * s, 44 * s, 'Цели');
    by += 52 * s;
    this.btn(ctx, 'goto:help', bx, by, bw / 2 - 5 * s, 44 * s, 'Управление');
    this.btn(ctx, 'toggleSound', bx + bw / 2 + 5 * s, by, bw / 2 - 5 * s, 44 * s,
      state.soundOn ? 'Звук: вкл.' : 'Звук: выкл.', { kind: state.soundOn ? 'normal' : 'gold' });
    by += 56 * s;

    // Прогресс карьеры строкой.
    const totalPossible = shiftList().length * 3;
    const pct = profile.stars / totalPossible;
    text(ctx, `Карьера: ${profile.stars} из ${totalPossible} ${starsWord(totalPossible)}`, bx, by, {
      size: 13 * s, color: C.dim,
    });
    progressBar(ctx, bx, by + 8 * s, bw, 10 * s, pct, { from: C.gold, to: '#c98f3a', gloss: true });
    const nextOutfit = OUTFITS.find((o) => profile.stars < o.stars);
    if (nextOutfit) {
      text(ctx, `Следующий комплект «${nextOutfit.name}» — на ${nextOutfit.stars} звёздах`, bx, by + 32 * s, {
        size: 12 * s, color: C.dim,
      });
    }

    // Подпись внизу.
    text(ctx, 'Смена длится 2–3 минуты. Прогресс сохраняется автоматически.',
      cx, h - 40 * s, { size: 12 * s, align: 'center', color: 'rgba(240,235,228,0.75)' });
    text(ctx, 'Мышь нужна только для кнопок — всё игровое делается с клавиатуры.',
      cx, h - 22 * s, { size: 12 * s, align: 'center', color: 'rgba(240,235,228,0.6)' });
  }

  // ── Карьера ──────────────────────────────────────────────────────────
  drawCareer(ctx, state, w, h, s) {
    const { profile } = state;
    this.header(ctx, 'Карьера', 'Три адреса, девять смен. Каждая следующая смена открывается после предыдущей.', w, h, s, profile);
    const pad = 22 * s;
    const colW = Math.min(400 * s, (w - pad * 4) / 3);
    const top = 92 * s;
    const shifts = shiftList();
    this.careerRects = [];

    VENUES.forEach((venue, vi) => {
      const x = pad + vi * (colW + pad);
      const y = top;
      const colH = h - top - 96 * s;
      this.card(ctx, x, y, colW, colH, { bg: 'rgba(22,19,27,0.82)' });
      // Шапка колонки в цвете адреса.
      fillRound(ctx, x, y, colW, 62 * s, 14, venue.palette.accent);
      text(ctx, fitText(ctx, venue.title, colW - 28 * s, 15.5 * s, '800'), x + 14 * s, y + 28 * s, {
        size: 15.5 * s, color: '#fff', weight: '800',
      });
      text(ctx, fitText(ctx, venue.place, colW - 28 * s, 11 * s), x + 14 * s, y + 48 * s, {
        size: 11 * s, color: 'rgba(255,255,255,0.85)',
      });

      const venueShifts = shifts.filter((sh) => sh.venue.id === venue.id);
      let cy = y + 76 * s;
      const cardH = 112 * s;
      venueShifts.forEach((sh, si) => {
        const globalIndex = shifts.indexOf(sh);
        const rec = profile.shifts[sh.id];
        const unlocked = shiftUnlocked(profile, globalIndex);
        const isNext = unlocked && (!rec || rec.stars < 3);
        fillRound(ctx, x + 10 * s, cy, colW - 20 * s, cardH, 10,
          isNext ? 'rgba(247,201,72,0.13)' : 'rgba(255,255,255,0.05)');
        if (isNext) strokeRound(ctx, x + 10 * s, cy, colW - 20 * s, cardH, 10, 'rgba(247,201,72,0.45)', 1.5);
        text(ctx, fitText(ctx, sh.name, colW - 60 * s, 15 * s, '700'), x + 22 * s, cy + 26 * s, {
          size: 15 * s, color: C.text, weight: '700',
        });
        text(ctx, `план ${formatMoney(sh.plan)} ₽ · ${formatTime(sh.duration)}`, x + 22 * s, cy + 44 * s, {
          size: 11.5 * s, color: C.dim,
        });
        this.stars(ctx, rec?.stars ?? 0, 3, x + 46 * s, cy + 70 * s, 11 * s, s);
        const best = rec ? `рекорд ${formatMoney(rec.bestScore)} ₽` : 'ещё не пройдена';
        text(ctx, best, x + 92 * s, cy + 74 * s, { size: 11.5 * s, color: C.dim });

        const bw = colW - 44 * s;
        this.btn(ctx, `start:${sh.id}`, x + 22 * s, cy + cardH - 34 * s, bw, 26 * s,
          unlocked ? (rec ? 'Повторить смену' : 'Начать смену') : 'Закрыто',
          { enabled: unlocked, size: 12.5, weight: '700' });
        cy += cardH + 10 * s;
      });

      // Показатели адреса.
      const doneStars = venueShifts.reduce((a, sh) => a + (profile.shifts[sh.id]?.stars ?? 0), 0);
      text(ctx, `Звёзды адреса: ${doneStars} из 9`, x + 14 * s, y + colH - 16 * s, {
        size: 12 * s, color: C.dim,
      });
    });

    this.btn(ctx, 'goto:menu', pad, h - 58 * s, 150 * s, 40 * s, 'В меню');
    this.btn(ctx, 'goto:equipment', pad + 160 * s, h - 58 * s, 170 * s, 40 * s, 'Экипировка');
    this.btn(ctx, 'goto:goals', pad + 340 * s, h - 58 * s, 150 * s, 40 * s, 'Цели');
  }

  // ── Брифинг перед сменой ─────────────────────────────────────────────
  drawBrief(ctx, state, w, h, s) {
    const { profile, shift } = state;
    const cx = w / 2;
    const cw = Math.min(640 * s, w - 40 * s);
    const x = cx - cw / 2;
    const y = h * 0.1;
    const ch = Math.min(470 * s, h - y - 30 * s);
    this.card(ctx, x, y, cw, ch, { bg: 'rgba(24,20,30,0.92)' });
    text(ctx, shift.venue.title, cx, y + 40 * s, { size: 22 * s, align: 'center', color: C.text, weight: '800' });
    text(ctx, `${shift.name} · ${shift.venue.place}`, cx, y + 62 * s, { size: 13 * s, align: 'center', color: C.dim });
    fillRound(ctx, x + 20 * s, y + 78 * s, cw - 40 * s, 3, 2, 'rgba(255,255,255,0.12)');

    let cy = y + 108 * s;
    const row = (label, value, color = C.text) => {
      text(ctx, label, x + 30 * s, cy, { size: 14 * s, color: C.dim });
      text(ctx, value, x + cw - 30 * s, cy, { size: 15 * s, align: 'right', color, weight: '700' });
      cy += 26 * s;
    };
    row('Длительность смены', formatTime(shift.duration));
    row('План по выручке', `${formatMoney(shift.plan)} ₽`, C.gold);
    row('Пороги звёзд', shift.thresholds.map((t) => formatMoney(t)).join(' / '));
    row('Полок в зале', String(state.shelfCount));
    row('Проверок от сети', shift.venue.id === 'route' ? 'две' : 'одна');
    if (state.record) {
      row('Ваш рекорд', `${formatMoney(state.record.bestScore)} ₽ · ${state.record.stars} ★`, C.gold);
    }
    cy += 6 * s;
    text(ctx, shift.brief, x + 30 * s, cy, { size: 12.5 * s, color: C.dim });
    cy += 24 * s;
    text(ctx, 'Цель смены: обслужить очередь, не пустить пустые полки и не продать', x + 30 * s, cy, { size: 12.5 * s, color: C.dim });
    text(ctx, 'крепкое младше 18 лет. Проверка паспорта — клавиша F, отказ — X.', x + 30 * s, cy + 17 * s, { size: 12.5 * s, color: C.dim });

    const bw = (cw - 80 * s) / 2;
    this.btn(ctx, `play:${shift.id}`, x + 30 * s, y + ch - 62 * s, bw, 46 * s, 'Начать смену', { kind: 'primary', size: 17 });
    this.btn(ctx, 'goto:career', x + 50 * s + bw, y + ch - 62 * s, bw, 46 * s, 'Назад к карьере');
    text(ctx, 'Enter — начать, Esc — назад', cx, y + ch - 8 * s, { size: 11 * s, align: 'center', color: 'rgba(240,235,228,0.5)' });
  }

  // ── Итоги смены ──────────────────────────────────────────────────────
  drawResults(ctx, state, w, h, s) {
    const { result, reward, profile, shift } = state;
    const cx = w / 2;
    const cw = Math.min(720 * s, w - 36 * s);
    const x = cx - cw / 2;
    const y = 24 * s;
    const ch = h - 48 * s;
    this.card(ctx, x, y, cw, ch, { bg: 'rgba(22,19,27,0.94)' });

    const failed = result.collapsed;
    text(ctx, failed ? 'Смена сорвалась' : 'Смена закрыта', cx, y + 42 * s, {
      size: 28 * s, align: 'center', color: failed ? '#ff9b9b' : C.text, weight: '800',
    });
    text(ctx, failed
      ? 'Стресс дошёл до предела — Катьме ушла пить чай. Заезд можно повторить.'
      : `${shift.venue.title} · ${shift.name}`, cx, y + 66 * s, {
      size: 13 * s, align: 'center', color: C.dim,
    });

    this.stars(ctx, result.stars, 3, cx, y + 108 * s, 22 * s, s);

    // Итог смены крупно.
    text(ctx, `${formatMoney(result.score)} ₽`, cx, y + 168 * s, {
      size: 44 * s, align: 'center', color: C.gold, weight: '800',
    });
    text(ctx, 'итог смены', cx, y + 188 * s, { size: 12 * s, align: 'center', color: C.dim });
    const planOk = result.planMet;
    fillRound(ctx, cx - 110 * s, y + 200 * s, 220 * s, 26 * s, 8,
      planOk ? 'rgba(47,143,79,0.85)' : 'rgba(146,96,26,0.85)');
    text(ctx, planOk
      ? `План выполнен: ${formatMoney(result.revenue)} / ${formatMoney(result.plan)} ₽`
      : `План не выполнен: ${formatMoney(result.revenue)} / ${formatMoney(result.plan)} ₽`,
    cx, y + 218 * s, { size: 12.5 * s, align: 'center', color: '#fff', weight: '700' });

    // Разбор по строкам в две колонки.
    const colW = (cw - 60 * s) / 2;
    const lx = x + 30 * s;
    const rx = x + 30 * s + colW + 20 * s;
    let ly = y + 250 * s;
    let ry = y + 250 * s;
    const line = (side, label, value, color = C.text) => {
      const px = side === 'l' ? lx : rx;
      const py = side === 'l' ? ly : ry;
      text(ctx, label, px, py, { size: 13 * s, color: C.dim });
      text(ctx, value, px + colW, py, { size: 13 * s, align: 'right', color, weight: '700' });
      if (side === 'l') ly += 22 * s; else ry += 22 * s;
    };
    line('l', 'Выручка', `${formatMoney(result.revenue)} ₽`, C.text);
    line('l', 'Чаевые', `${formatMoney(result.tips)} ₽`, C.text);
    line('l', 'Премии', `${formatMoney(result.bonuses)} ₽`, C.text);
    line('l', 'Штрафы', `−${formatMoney(result.fines)} ₽`, result.fines ? '#ff9b9b' : C.dim);
    line('l', 'Бонус рейтинга', `${formatMoney(result.ratingBonus)} ₽`, C.text);
    line('l', 'Чистая смена', `${formatMoney(result.cleanBonus)} ₽`, C.text);
    line('r', 'Обслужено покупателей', String(result.stats.served));
    line('r', 'Ушли из очереди', String(result.stats.lost), result.stats.lost ? '#ff9b9b' : C.dim);
    line('r', 'Проверок паспорта', String(result.stats.checks));
    line('r', 'Отказов подросткам', String(result.stats.minorsRefused), C.green);
    line('r', 'Штрафов', String(result.stats.finesCount), result.stats.finesCount ? '#ff9b9b' : C.dim);
    line('r', 'Серия без ошибок', String(result.stats.bestStreak));
    line('l', 'Рейтинг магазина', `${result.rating} / 100`);
    line('r', 'Стресс в конце', `${result.stress}%`, result.stress > 70 ? '#ffb36b' : C.dim);

    // Награды.
    let ay = Math.max(ly, ry) + 6 * s;
    fillRound(ctx, lx, ay, cw - 60 * s, 30 * s, 8, 'rgba(255,255,255,0.07)');
    text(ctx, `Опыт: +${reward.xp}${reward.rankUp ? ` · новое звание: ${reward.rankUp}` : ''} · `
      + `премия: +${formatMoney(reward.wallet)} ₽${reward.gainStars ? ` · новых звёзд: ${reward.gainStars}` : ''}`,
    lx + 12 * s, ay + 20 * s, { size: 12.5 * s, color: C.text, weight: '700' });
    ay += 36 * s;
    if (reward.newGoalIds.length) {
      const names = careerGoals().filter((g) => reward.newGoalIds.includes(g.id)).map((g) => g.short);
      text(ctx, `Новая цель карьеры: ${fitText(ctx, names.join(' · '), cw - 60 * s, 12.5 * s)}`,
        lx, ay, { size: 12.5 * s, color: C.gold, weight: '700' });
      ay += 22 * s;
    }
    if (reward.newOutfits.length) {
      text(ctx, `Открыт комплект: ${reward.newOutfits.map((o) => `«${o.name}»`).join(', ')}`,
        lx, ay, { size: 12.5 * s, color: C.green, weight: '700' });
      ay += 22 * s;
    }

    // Кнопки.
    const bw = (cw - 100 * s) / 3;
    const by = y + ch - 62 * s;
    this.btn(ctx, `play:${shift.id}`, x + 30 * s, by, bw, 46 * s, 'Ещё одна смена', { kind: 'primary', size: 15 });
    this.btn(ctx, 'goto:career', x + 40 * s + bw, by, bw, 46 * s, 'Карьера', { size: 15 });
    this.btn(ctx, 'goto:menu', x + 50 * s + bw * 2, by, bw, 46 * s, 'В меню', { size: 15 });
    text(ctx, 'Enter — ещё одна смена · Esc — карьера', cx, by - 8 * s, {
      size: 11 * s, align: 'center', color: 'rgba(240,235,228,0.55)',
    });
  }

  // ── Экипировка ───────────────────────────────────────────────────────
  drawEquipment(ctx, state, w, h, s) {
    const { profile } = state;
    this.header(ctx, 'Экипировка', 'Комплекты открываются за звёзды карьеры, улучшения покупаются на премию. Скорость и деньги одинаковы у всех — влияют только улучшения из списка справа.', w, h, s, profile);
    const pad = 22 * s;
    const top = 92 * s;
    const leftW = Math.min(560 * s, w * 0.52);
    this.card(ctx, pad, top, leftW, h - top - 84 * s, { bg: 'rgba(22,19,27,0.82)' });
    text(ctx, 'КОМПЛЕКТЫ ФОРМЫ', pad + 20 * s, top + 30 * s, { size: 13 * s, color: C.dim, weight: '800' });
    const unlocked = new Set(unlockedOutfits(profile).map((o) => o.id));
    const rowH = 62 * s;
    OUTFITS.forEach((o, i) => {
      const ry = top + 48 * s + i * rowH;
      const isUnlocked = unlocked.has(o.id);
      const selected = profile.outfit === o.id;
      fillRound(ctx, pad + 14 * s, ry, leftW - 28 * s, rowH - 10 * s, 10,
        selected ? 'rgba(247,201,72,0.16)' : 'rgba(255,255,255,0.05)');
      if (selected) strokeRound(ctx, pad + 14 * s, ry, leftW - 28 * s, rowH - 10 * s, 10, 'rgba(247,201,72,0.5)', 1.5);
      // Превью формы: фартук и бейдж.
      fillRound(ctx, pad + 26 * s, ry + 10 * s, 34 * s, 34 * s, 8, o.aprons[0]);
      fillRound(ctx, pad + 30 * s, ry + 14 * s, 12 * s, 12 * s, 3, o.badge);
      text(ctx, `«${o.name}»`, pad + 74 * s, ry + 24 * s, { size: 15 * s, color: C.text, weight: '700' });
      text(ctx, isUnlocked ? (selected ? 'надето' : 'доступно') : `нужно ${o.stars} ${starsWord(o.stars)}`,
        pad + 74 * s, ry + 42 * s, { size: 12 * s, color: isUnlocked ? C.green : C.dim });
      const bw = 150 * s;
      if (isUnlocked && !selected) {
        this.btn(ctx, `outfit:${o.id}`, pad + leftW - bw - 26 * s, ry + 12 * s, bw, 30 * s, 'Надеть', { size: 12.5 });
      } else if (!isUnlocked) {
        this.btn(ctx, `outfit:${o.id}`, pad + leftW - bw - 26 * s, ry + 12 * s, bw, 30 * s, 'Закрыто', { enabled: false, size: 12.5 });
      }
    });

    // Улучшения.
    const rx = pad + leftW + pad;
    const rw = w - rx - pad;
    this.card(ctx, rx, top, rw, h - top - 84 * s, { bg: 'rgba(22,19,27,0.82)' });
    text(ctx, 'УЛУЧШЕНИЯ ЗА ПРЕМИЮ', rx + 20 * s, top + 30 * s, { size: 13 * s, color: C.dim, weight: '800' });
    text(ctx, `Премия: ${formatMoney(profile.wallet)} ₽`, rx + rw - 20 * s, top + 30 * s, {
      size: 14 * s, align: 'right', color: C.gold, weight: '800',
    });
    UPGRADES.forEach((u, i) => {
      const ry = top + 50 * s + i * 74 * s;
      const owned = profile.upgrades.includes(u.id);
      const unlockedU = profile.stars >= u.stars;
      fillRound(ctx, rx + 14 * s, ry, rw - 28 * s, 64 * s, 10, 'rgba(255,255,255,0.05)');
      text(ctx, u.name, rx + 28 * s, ry + 26 * s, { size: 15 * s, color: C.text, weight: '700' });
      text(ctx, u.desc, rx + 28 * s, ry + 45 * s, { size: 12 * s, color: C.dim });
      const bw = 160 * s;
      const bx = rx + rw - bw - 26 * s;
      if (owned) {
        this.btn(ctx, `upgrade:${u.id}`, bx, ry + 16 * s, bw, 32 * s, 'Куплено', { enabled: false, size: 12.5 });
      } else if (!unlockedU) {
        this.btn(ctx, `upgrade:${u.id}`, bx, ry + 16 * s, bw, 32 * s,
          `Нужно ${u.stars} ★`, { enabled: false, size: 12.5 });
      } else {
        const can = profile.wallet >= u.cost;
        this.btn(ctx, `upgrade:${u.id}`, bx, ry + 16 * s, bw, 32 * s,
          `${formatMoney(u.cost)} ₽`, { kind: can ? 'gold' : 'normal', enabled: can, size: 13 });
      }
    });
    text(ctx, 'Улучшения действуют во всех сменах и сбрасываются только вместе с сохранением.',
      rx + 20 * s, top + 50 * s + UPGRADES.length * 74 * s + 16 * s, { size: 11.5 * s, color: C.dim });

    this.btn(ctx, 'goto:menu', pad, h - 58 * s, 150 * s, 40 * s, 'В меню');
    this.btn(ctx, 'goto:career', pad + 160 * s, h - 58 * s, 170 * s, 40 * s, 'К карьере');
  }

  // ── Цели ─────────────────────────────────────────────────────────────
  drawGoals(ctx, state, w, h, s) {
    const { profile } = state;
    const list = goalProgress(profile);
    const done = list.filter((g) => g.done).length;
    this.header(ctx, 'Постоянные цели', `${done} из ${list.length} выполнено · за цели дают опыт и премию`, w, h, s, profile);
    const pad = 22 * s;
    const top = 92 * s;
    const cw = Math.min(1080 * s, w - pad * 2);
    const x = w / 2 - cw / 2;
    const colW = (cw - 20 * s) / 2;
    const rowH = 54 * s;
    list.forEach((g, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const gx = x + col * (colW + 20 * s);
      const gy = top + row * (rowH + 8 * s);
      if (gy + rowH > h - 80 * s) return;
      fillRound(ctx, gx, gy, colW, rowH, 9, g.done ? 'rgba(47,143,79,0.22)' : 'rgba(255,255,255,0.05)');
      if (g.done) strokeRound(ctx, gx, gy, colW, rowH, 9, 'rgba(95,194,126,0.5)', 1.5);
      const label = g.kind === 'shift' ? g.title : g.short;
      text(ctx, fitText(ctx, label, colW - 150 * s, 12.5 * s), gx + 14 * s, gy + 22 * s, {
        size: 12.5 * s, color: C.text, weight: '700',
      });
      const pct = clamp(g.progress / g.target, 0, 1);
      progressBar(ctx, gx + 14 * s, gy + 30 * s, colW - 130 * s, 9 * s, pct, {
        from: g.done ? '#7fe0a0' : C.gold, to: g.done ? '#2f8f4f' : '#c98f3a',
      });
      text(ctx, g.kind === 'shift' ? '' : `${formatMoney(Math.round(g.progress))} / ${formatMoney(g.target)}`,
        gx + 14 * s, gy + 50 * s, { size: 10.5 * s, color: C.dim });
      const rewardStr = `+${g.reward.xp} опыта, +${formatMoney(g.reward.wallet)} ₽`;
      text(ctx, g.done ? '✓ готово' : rewardStr, gx + colW - 14 * s, gy + 30 * s, {
        size: 11 * s, align: 'right', color: g.done ? C.green : C.dim, weight: g.done ? '800' : '600',
      });
    });
    this.btn(ctx, 'goto:menu', pad, h - 58 * s, 150 * s, 40 * s, 'В меню');
    this.btn(ctx, 'goto:career', pad + 160 * s, h - 58 * s, 170 * s, 40 * s, 'К карьере');
  }

  // ── Пауза ────────────────────────────────────────────────────────────
  drawPause(ctx, state, w, h, s) {
    ctx.save();
    ctx.globalAlpha = 0.68;
    ctx.fillStyle = '#0d0b12';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    const cw = Math.min(560 * s, w - 40 * s);
    const ch = Math.min(430 * s, h - 40 * s);
    const x = w / 2 - cw / 2;
    const y = h / 2 - ch / 2;
    this.card(ctx, x, y, cw, ch, { bg: 'rgba(24,20,30,0.96)' });
    text(ctx, 'Пауза', x + cw / 2, y + 44 * s, { size: 26 * s, align: 'center', color: C.text, weight: '800' });
    const snap = state.snapshot;
    if (snap) {
      text(ctx, `Осталось ${formatTime(snap.timeLeft)} · выручка ${formatMoney(snap.revenue)} ₽ · `
        + `в очереди ${snap.queue}`, x + cw / 2, y + 68 * s, {
        size: 12.5 * s, align: 'center', color: C.dim,
      });
    }
    const bw = cw - 80 * s;
    let by = y + 96 * s;
    this.btn(ctx, 'resume', x + 40 * s, by, bw, 48 * s, 'Продолжить смену', { kind: 'primary', size: 17 });
    by += 58 * s;
    this.btn(ctx, 'restart', x + 40 * s, by, bw, 42 * s, 'Начать смену заново');
    by += 52 * s;
    this.btn(ctx, 'goto:career', x + 40 * s, by, bw, 42 * s, 'Выйти в карьеру');
    by += 52 * s;
    this.btn(ctx, 'goto:menu', x + 40 * s, by, bw, 42 * s, 'В главное меню');
    text(ctx, 'Esc — продолжить · R — заново', x + cw / 2, y + ch - 16 * s, {
      size: 11 * s, align: 'center', color: 'rgba(240,235,228,0.5)',
    });
  }

  drawHelp(ctx, state, w, h, s) {
    const cx = w / 2;
    const cw = Math.min(720 * s, w - 40 * s);
    const ch = Math.min(460 * s, h - 40 * s);
    const x = cx - cw / 2;
    const y = h / 2 - ch / 2;
    this.card(ctx, x, y, cw, ch, { bg: 'rgba(24,20,30,0.96)' });
    text(ctx, 'Управление', cx, y + 44 * s, { size: 26 * s, align: 'center', color: C.text, weight: '800' });
    KEYS_HELP.forEach(([key, desc], i) => {
      const ry = y + 86 * s + i * 30 * s;
      fillRound(ctx, x + 30 * s, ry - 18 * s, 190 * s, 26 * s, 6, 'rgba(255,255,255,0.08)');
      text(ctx, key, x + 38 * s, ry, { size: 13.5 * s, color: C.gold, weight: '700', font: 'mono' });
      text(ctx, desc, x + 240 * s, ry, { size: 13.5 * s, color: C.text });
    });
    text(ctx, 'Клавиши физические: русская раскладка не мешает игре.', cx, y + ch - 62 * s, {
      size: 12 * s, align: 'center', color: C.dim,
    });
    this.btn(ctx, 'goto:menu', cx - 100 * s, y + ch - 46 * s, 200 * s, 38 * s, 'Понятно');
  }

  drawLoading(ctx, state, w, h, s) {
    text(ctx, TEXT.title, w / 2, h / 2 - 20 * s, { size: 30 * s, align: 'center', color: C.text, weight: '800' });
    text(ctx, state.message ?? 'Готовим смену…', w / 2, h / 2 + 12 * s, {
      size: 14 * s, align: 'center', color: C.dim,
    });
    const t = (this.anim % 2) / 2;
    progressBar(ctx, w / 2 - 150 * s, h / 2 + 30 * s, 300 * s, 8 * s, t, { from: C.gold, to: '#c98f3a' });
  }

  drawError(ctx, state, w, h, s) {
    const cx = w / 2;
    const cw = Math.min(600 * s, w - 40 * s);
    const ch = 240 * s;
    const x = cx - cw / 2;
    const y = h / 2 - ch / 2;
    this.card(ctx, x, y, cw, ch, { bg: 'rgba(60,20,28,0.95)' });
    text(ctx, 'Не удалось запустить игру', cx, y + 48 * s, { size: 20 * s, align: 'center', color: '#ffd9d9', weight: '800' });
    text(ctx, state.message ?? 'Неизвестная ошибка', cx, y + 78 * s, {
      size: 12.5 * s, align: 'center', color: '#ffbcbc',
    });
    text(ctx, 'Проверьте, что браузер поддерживает WebGL и включено аппаратное ускорение.', cx, y + 110 * s, {
      size: 12 * s, align: 'center', color: 'rgba(255,235,235,0.8)',
    });
    this.btn(ctx, 'reload', cx - 110 * s, y + ch - 70 * s, 220 * s, 44 * s, 'Перезагрузить страницу', { kind: 'primary' });
  }
}
