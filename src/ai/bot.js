/**
 * bot.js — «автоматическая Катьме»: простая, но осмысленная стратегия игры.
 *
 * Зачем это в проекте: бот нужен, чтобы (1) прогонять смены в Node без
 * браузера и проверять баланс, (2) покрывать механику автоматическими
 * тестами, (3) доказать, что все три звезды достижимы одной рукой и
 * клавиатурой. Бот принимает те же решения, что и человек: сначала касса,
 * если очередь растёт, потом полки.
 */

import {
  CASHIER, CRATE, CRATE_SOURCES, ITEM_BY_ID, RATING, SHELVES, WORLD,
} from '../core/config.js';
import { dist } from '../core/util.js';

const DOORWAY = { x: WORLD.doorway.x + WORLD.doorway.w / 2, y: WORLD.doorway.y + WORLD.doorway.h / 2 };
const REGISTER_SPOT = { x: CASHIER.zone.x + CASHIER.zone.w / 2, y: CASHIER.zone.y + CASHIER.zone.h / 2 };
/** Точка обхода слева от прилавка: без неё персонаж упирается в стойку. */
const COUNTER_LEFT = { x: CASHIER.counter.x - 46, y: CASHIER.zone.y + CASHIER.zone.h / 2 };

export const BOT_PRESETS = {
  /**
   * Внимательный продавец: проверяет паспорт только у тех, кто выглядит молодо
   * (игра показывает это подсказкой «18+?»), держит полки и не бросает кассу
   * при живой очереди.
   */
  strong: { reaction: 0.14, refillThreshold: 0.5, mistake: 0.0, checkAll: false, panicQueue: 1 },
  /** Обычный игрок: иногда забывает про паспорт, полки подтягивает не сразу. */
  normal: { reaction: 0.26, refillThreshold: 0.38, mistake: 0.22, checkAll: false, panicQueue: 2 },
  /** Слабый игрок: медленные руки, полки почти не трогает. */
  weak: { reaction: 0.42, refillThreshold: 0.2, mistake: 0.5, checkAll: false, panicQueue: 3 },
  /** Перестраховщик: проверяет паспорт у каждого — теряет время на кассе. */
  paranoid: { reaction: 0.2, refillThreshold: 0.45, mistake: 0.0, checkAll: true, panicQueue: 2 },
};

export class Bot {
  constructor(preset = 'normal', seed = 3) {
    const cfg = typeof preset === 'string' ? { ...BOT_PRESETS[preset] ?? BOT_PRESETS.normal } : { ...preset };
    this.cfg = cfg;
    this.cooldown = 0;
    this.mistakes = 0;
    this.history = [];
    this.seed = seed;
    this._rng = ((s) => () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    })(seed || 1);
    this.debug = [];
  }

  /** Один шаг: возвращает объект ввода и вызывает действия у модели. */
  step(run, dt) {
    const cfg = this.cfg;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const p = run.player;
    const queue = run.queue.length;
    // «reserved» включает покупателей, которые ещё идут к кассе: без этого
    // легко уйти на склад за ящиком прямо перед приходом человека.
    const incoming = run.reserved - run.queue.length;
    const current = run.current;

    // 1) Диалог со скандалистом — отвечаем, пока не кончилось время.
    const dlg = run.customers.find((c) => c.dialog && !c.dialogResult && c.state === 'queue');
    if (dlg && this.cooldown <= 0) {
      const goodIndex = dlg.dialog.options.findIndex((o) => o.good);
      const misclick = this._rng() < cfg.mistake * 0.5;
      const idx = misclick ? (goodIndex + 1) % dlg.dialog.options.length : goodIndex;
      run.answerDialog(idx);
      this.cooldown = cfg.reaction * 2;
      return { dx: 0, dy: 0, dash: false };
    }

    // 2) Обслуживание: если покупатель на кассе — идём за кассу и работаем.
    if (current) {
      if (!run.atRegister) return this.moveTo(run, REGISTER_SPOT, dt);
      if (this.cooldown <= 0) this.serve(run);
      return { dx: 0, dy: 0, dash: false };
    }

    // 3) Покупатель идёт к кассе — Катьме ждёт его у прилавка, а не бежит
    //    в подсобку: очередь собирается быстрее, чем кажется.
    if (queue > 0 || incoming > 0) return this.moveTo(run, REGISTER_SPOT, dt);

    // 4) Свободное время: пополняем самую пустую полку, но только если никто
    //    не идёт к кассе и не ждёт у входа.
    if (run.outside > 0 || run.reserved > 0) return this.moveTo(run, REGISTER_SPOT, dt);
    const emptiest = this.emptiestShelf(run);
    if (emptiest && emptiest.ratio < cfg.refillThreshold) {
      if (run.carrying === emptiest.id) {
        return this.moveTo(run, emptiest.stand, dt, 70);
      }
      if (run.carrying) {
        // Уже несём другой ящик — сначала выложим его на «свою» полку.
        const own = run.shelfDefs.find((s) => s.id === run.carrying);
        if (own) return this.moveTo(run, own.stand, dt, 70);
      }
      const src = run.sources.find((s) => s.shelf === emptiest.id);
      if (src && src.stock > 0) {
        return this.moveTo(run, { x: src.x, y: src.y - 10 }, dt, 74);
      }
      // Ящик ещё не подвезли — идём к другой полке, где ящик есть.
      const alt = run.sources.filter((s) => s.stock > 0)
        .map((s) => ({ s, shelf: run.shelves[s.shelf] }))
        .sort((a, b) => (a.shelf.units / a.shelf.def.cap) - (b.shelf.units / b.shelf.def.cap))[0];
      if (alt) return this.moveTo(run, { x: alt.s.x, y: alt.s.y - 10 }, dt, 74);
      return this.moveTo(run, REGISTER_SPOT, dt);
    }
    return this.moveTo(run, REGISTER_SPOT, dt);
  }

  /** Решения на кассе: паспорт → отказ → сканирование → чек. */
  serve(run) {
    const cfg = this.cfg;
    const c = run.current;
    if (!c) return;
    const restrictedPending = c.basket.some((i) => !i.scanned && !i.removed && ITEM_BY_ID[i.id].restricted);
    const hasRestricted = c.basket.some((i) => ITEM_BY_ID[i.id].restricted);
    const pending = c.basket.some((i) => !i.scanned && !i.removed);

    // Отказываем только пока есть непроданное «крепкое»: иначе бот
    // бесконечно жмёт «отказ» и касса не освобождается.
    if (c.idChecked && c.age < 18 && restrictedPending) {
      if (run.pressRefuse()) this.cooldown = cfg.reaction;
      else this.cooldown = 0.1;
      return;
    }
    if (!c.idChecked && hasRestricted && (c.looksYoung || cfg.checkAll)) {
      const skip = this._rng() < cfg.mistake;
      if (!skip) {
        run.pressCheckId();
        this.cooldown = cfg.reaction + 0.3;
        return;
      }
      this.mistakes++;
    }
    if (pending) {
      if (restrictedPending && c.idChecked && c.age < 18) { run.pressRefuse(); this.cooldown = cfg.reaction; return; }
      run.pressScan();
      this.cooldown = cfg.reaction + 0.25;
      return;
    }
    run.pressEnter();
    this.cooldown = cfg.reaction + 0.15;
  }

  emptiestShelf(run) {
    let best = null;
    for (const s of run.shelfDefs) {
      const st = run.shelves[s.id];
      const ratio = st.units / st.cap;
      if (!best || ratio < best.ratio) best = { ...s, ratio };
    }
    return best;
  }

  /**
   * Идём к точке. Бот обходит два препятствия: стену между залом и складом
   * (через проём) и прилавок (через левый торец). Это же подсказка живым
   * игрокам: за кассу заходят слева.
   */
  moveTo(run, target, dt, stopAt = 16) {
    const p = run.player;
    const d = dist(p.x, p.y, target.x, target.y);
    if (d < stopAt) {
      if (run.busy <= 0 && this.cooldown <= 0) {
        const acted = run.pressAction();
        this.cooldown = acted ? this.cfg.reaction + 0.15 : 0.2;
      }
      return { dx: 0, dy: 0, dash: false };
    }
    const inBackRoom = (y) => y > WORLD.backRoom.y - 10;
    let aim = target;
    if (inBackRoom(p.y) !== inBackRoom(target.y)) {
      // Сначала выравниваемся по створу проёма, потом идём сквозь него.
      if (Math.abs(p.x - DOORWAY.x) > 16) aim = { x: DOORWAY.x, y: p.y };
      else if (dist(p.x, p.y, DOORWAY.x, DOORWAY.y) < 90) aim = target;
      else aim = DOORWAY;
    } else if (this.crossesCounter(p, target)) {
      aim = COUNTER_LEFT;
    }
    let dx = aim.x - p.x;
    let dy = aim.y - p.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len; dy /= len;
    const far = dist(p.x, p.y, target.x, target.y) > 150;
    return { dx, dy, dash: far && run.player.dash > 25 };
  }

  /** Пересекает ли отрезок «игрок → цель» прямоугольник прилавка. */
  crossesCounter(p, target) {
    const c = CASHIER.counter;
    const pad = 24;
    const left = c.x - pad;
    const right = c.x + c.w + pad;
    const top = c.y - pad;
    const bottom = c.y + c.h + pad;
    if (p.y > bottom && target.y < top) {
      return p.x > left - 60 && p.x < right;
    }
    if (p.y < top && target.y > bottom) return p.x > left && p.x < right;
    return false;
  }
}

export { DOORWAY, REGISTER_SPOT, RATING, CRATE, CASHIER, CRATE_SOURCES };
