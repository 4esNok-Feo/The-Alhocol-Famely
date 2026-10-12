/**
 * run.js — «модель смены»: вся игровая механика без единой строчки рисования.
 *
 * Класс ShiftRun полностью детерминирован: одинаковое зерно + одинаковая
 * последовательность ввода дают одинаковый результат. Поэтому его гоняют
 * в Node-тестах, в симуляторе баланса и, собственно, в браузере — как и
 * run_model.gd в проекте-предшественнике.
 *
 * Единицы измерения: юниты мира (≈пиксели), секунды, рубли.
 */

import {
  CASHIER, CRATE, CRATE_SOURCES, CUSTOMERS, CUSTOMER_BY_ID, ECONOMY, ITEMS,
  ITEM_BY_ID, PHASES, PLAYER, RATING, SHELVES, SHIFT, STRESS, WORLD, SCANDAL_DIALOGS,
  VENUE_PROFILE, crateSourcesFor, shelvesFor,
} from './config.js';

const DEFAULT_PROFILE = { flowMul: 1, patienceMul: 1, priceMul: 1, inspectors: 1 };
import { clamp, dist, dist2, inRect, makeRng, resolveCircleRect } from './util.js';

/** Типы покупателей, которым нужен паспорт при покупке «крепкого». */
const YOUNG_LOOK_AGE = 26;

export class ShiftRun {
  /**
   * @param {object} opts
   * @param {number} opts.seed            зерно генератора
   * @param {object} opts.shift           описание смены из config.SHIFT_PLAN + venue
   * @param {number} opts.duration        длительность смены в секундах
   * @param {number} opts.plan            план по выручке, ₽
   * @param {number[]} opts.thresholds    пороги итога для 1/2/3 звёзд
   * @param {string[]} opts.upgrades      купленные улучшения (см. config.UPGRADES)
   */
  constructor(opts) {
    const venue = opts.venue ?? {};
    this.shiftId = opts.shiftId ?? `${venue.id ?? 'dom'}-0`;
    this.venueId = venue.id ?? 'dom';
    this.shiftName = opts.shiftName ?? 'Смена';
    this.duration = opts.duration ?? SHIFT.duration;
    this.plan = Math.round(opts.plan ?? 5000);
    this.thresholds = opts.thresholds ?? [4200, 6300, 8600];
    this.seed = opts.seed ?? 1;
    this.upgrades = new Set(opts.upgrades ?? []);
    this.rng = makeRng(this.seed);
    /** Адрес и конкретная смена меняют плотность потока, терпение и цены. */
    const venueProfile = VENUE_PROFILE[this.venueId] ?? DEFAULT_PROFILE;
    const shiftMods = opts.mods ?? { flowMul: 1, priceMul: 1 };
    this.profile = {
      ...venueProfile,
      flowMul: venueProfile.flowMul * (shiftMods.flowMul ?? 1),
      priceMul: venueProfile.priceMul * (shiftMods.priceMul ?? 1),
      basketMul: shiftMods.basketMul ?? 1,
    };
    /** Набор полок и точек склада зависит от адреса (у крупных +1 полка). */
    this.shelfDefs = shelvesFor(this.venueId);
    this.sourceDefs = crateSourcesFor(this.venueId);

    // ── Итоговые ресурсы смены ───────────────────────────────────────────
    this.time = 0;
    this.phaseIndex = 0;
    this.rating = RATING.start;
    this.stress = STRESS.start;
    this.revenue = 0;
    this.tips = 0;
    this.fines = 0;
    this.bonuses = 0;
    this.stressCollapse = false;
    /** Сколько секунд стресс держится на максимуме (окно на «разгреб очереди»). */
    this.collapseTimer = 0;
    this.finished = false;

    // ── Полки и склад ────────────────────────────────────────────────────
    this.shelves = {};
    for (const s of this.shelfDefs) {
      this.shelves[s.id] = { def: s, units: s.start, cap: s.cap };
    }
    this.sources = this.sourceDefs.map((c) => ({ ...c, stock: 1, timer: 0 }));
    this.carrying = null;       // id полки того ящика, который несёт Катьме
    this.busy = 0;              // таймер «занята делом» (взять/выложить)
    this.busyLabel = '';

    // ── Катьме ───────────────────────────────────────────────────────────
    this.player = {
      x: 780, y: 300, vx: 0, vy: 0, facing: 1, dash: 100, walkPhase: 0, moving: false,
    };

    // ── Покупатели ───────────────────────────────────────────────────────
    this.customers = [];
    this.outside = 0;           // сколько ждёт у входа, когда очередь полна
    this.spawnTimer = this.rng.range(2.0, 4.0);
    this.nextInspectorAt = this.rng.range(SHIFT.inspectorAt[0], SHIFT.inspectorAt[1]);
    this.inspectorsDone = 0;
    this.seenLines = [];

    // ── Статистика для экрана итогов ─────────────────────────────────────
    this.stats = {
      served: 0, lost: 0, checks: 0, minorsRefused: 0, finesCount: 0,
      scans: 0, crates: 0, fills: 0, unitsSold: 0, maxQueue: 0,
      cleanServes: 0, cleanStreak: 0, bestStreak: 0, emptyShelfMisses: 0,
      dialogs: 0, dialogsGood: 0, changeOk: 0, changeMiss: 0, inspectors: 0,
    };

    // ── Лента событий: её читают интерфейс, звук и тесты ─────────────────
    this.events = [];

    // Модификаторы улучшений.
    this.mods = {
      speedMul: this.upgrades.has('sneakers') ? 1.12 : 1,
      scanMul: this.upgrades.has('scanner') ? 0.75 : 1,
      fillMul: this.upgrades.has('gloves') ? 0.82 : 1,
      stressMul: this.upgrades.has('radio') ? 1.55 : 1,
      moneyMul: this.upgrades.has('thermos') ? 1.06 : 1,
    };

    this.emit('shift_start', { name: this.shiftName, plan: this.plan });
  }

  emit(type, data = {}) {
    const ev = { type, t: this.time, ...data };
    this.events.push(ev);
    return ev;
  }

  /** Забрать накопленные события (интерфейс вызывает раз в кадр). */
  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  get phase() {
    return PHASES[Math.min(this.phaseIndex, PHASES.length - 1)];
  }

  get queue() {
    return this.customers.filter((c) => c.state === 'queue' || c.state === 'serving');
  }

  /**
   * Занятые места в очереди: считаются и те, кто ещё идёт к кассе.
   * Без этого несколько покупателей получали одно и то же место.
   */
  get reserved() {
    return this.customers.filter(
      (c) => c.slot >= 0 && c.state !== 'leaving' && c.state !== 'gone',
    ).length;
  }

  /** Текущий обслуживаемый покупатель — первый в очереди, он же у кассы. */
  get current() {
    const q = this.queue.sort((a, b) => a.slot - b.slot);
    const first = q.find((c) => c.slot === 0);
    if (!first || first.state !== 'queue') return null;
    return first;
  }

  /** Стоит ли Катьме за кассой. */
  get atRegister() {
    return inRect(this.player.x, this.player.y, CASHIER.zone) && this.busy <= 0;
  }

  /** Ближайшая полка, у которой можно выкладывать товар, либо null. */
  nearShelf(maxDist = CRATE.standDistance) {
    let best = null;
    let bestD = maxDist;
    for (const s of this.shelfDefs) {
      const d = dist(this.player.x, this.player.y, s.stand.x, s.stand.y);
      if (d <= bestD) { best = s; bestD = d; }
    }
    return best;
  }

  /** Источник ящиков рядом с Катьме. */
  nearSource() {
    for (const src of this.sources) {
      if (dist(this.player.x, this.player.y, src.x, src.y) <= 74) return src;
    }
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Главный шаг симуляции
  // ─────────────────────────────────────────────────────────────────────

  /**
   * @param {number} dt    шаг в секундах (игра режет его на куски ≤ 1/30)
   * @param {object} input {dx, dy, dash} — удержание движения и рывка
   */
  step(dt, input = {}) {
    if (this.finished) return;
    this.time += dt;

    this.stepPhase();
    this.stepPlayer(dt, input);
    this.stepSources(dt);
    this.stepSpawn(dt);
    this.stepCustomers(dt);
    this.stepStress(dt);

    if (this.time >= this.duration) this.finish('time');
    else if (this.collapseTimer >= STRESS.collapseGrace) {
      this.stressCollapse = true;
      this.finish('collapse');
    }
  }

  stepPhase() {
    const idx = Math.min(Math.floor(this.time / SHIFT.phaseLength), PHASES.length - 1);
    if (idx !== this.phaseIndex) {
      this.phaseIndex = idx;
      this.stress = clamp(this.stress + STRESS.phaseBump, 0, 100);
      this.emit('phase', { name: this.phase.name, index: idx });
    }
  }

  stepPlayer(dt, input) {
    const p = this.player;
    if (this.busy > 0) {
      this.busy -= dt;
      p.vx = 0; p.vy = 0; p.moving = false;
      if (this.busy <= 0) {
        this.busy = 0;
        this.emit('busy_done', { label: this.busyLabel });
      }
      return;
    }

    let dx = input.dx ?? 0;
    let dy = input.dy ?? 0;
    const len = Math.hypot(dx, dy);
    if (len > 0) { dx /= len; dy /= len; }

    const dashing = !!input.dash && p.dash > 0 && len > 0;
    if (dashing) p.dash = clamp(p.dash - PLAYER.dashDrainPerSec * dt, 0, 100);
    else p.dash = clamp(p.dash + PLAYER.dashRegenPerSec * dt, 0, 100);

    let speed = PLAYER.speed * this.mods.speedMul;
    if (this.carrying) speed *= PLAYER.carrySpeedMul;
    if (dashing) speed *= PLAYER.dashMultiplier;

    const targetVx = dx * speed;
    const targetVy = dy * speed;
    const rate = len > 0 ? PLAYER.accelerate : PLAYER.friction;
    const k = 1 - Math.exp(-(rate / speed) * dt * 0.06 * speed / 60);
    p.vx += (targetVx - p.vx) * Math.min(1, k * 3.2);
    p.vy += (targetVy - p.vy) * Math.min(1, k * 3.2);

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (Math.abs(p.vx) > 6) p.facing = p.vx > 0 ? 1 : -1;
    p.moving = len > 0 && Math.hypot(p.vx, p.vy) > 24;
    if (p.moving) p.walkPhase += dt * (p.moving ? 9 : 0);

    this.collidePlayer();
  }

  /** Столкновения Катьме: стены зала, стена со проёмом, полки, прилавок. */
  collidePlayer() {
    const p = this.player;
    const r = PLAYER.radius;
    const shop = WORLD.shop;
    const wt = WORLD.wallThickness;
    const doorway = WORLD.doorway;

    // Границы торгового зала (вход слева оставляем проходимым только логически:
    // Катьме за прилавок покупателей не выходит).
    const walls = [
      { x: shop.x - wt, y: shop.y - wt, w: shop.w + wt * 2, h: wt }, // север
      { x: shop.x - wt, y: shop.y - wt, w: wt, h: shop.h + 40 },     // запад (вход занят)
      { x: shop.x + shop.w, y: shop.y - wt, w: wt, h: shop.h + 40 },  // восток
      // Южная стена зала с проёмом на склад:
      { x: shop.x - wt, y: shop.y + shop.h, w: doorway.x - shop.x, h: wt },
      { x: doorway.x + doorway.w, y: shop.y + shop.h, w: shop.x + shop.w - (doorway.x + doorway.w), h: wt },
      // Склад по периметру:
      { x: WORLD.backRoom.x - wt, y: WORLD.backRoom.y + WORLD.backRoom.h, w: WORLD.backRoom.w + wt * 2, h: wt },
      { x: WORLD.backRoom.x - wt, y: WORLD.backRoom.y, w: wt, h: WORLD.backRoom.h },
      { x: WORLD.backRoom.x + WORLD.backRoom.w, y: WORLD.backRoom.y, w: wt, h: WORLD.backRoom.h },
      // Прилавок:
      CASHIER.counter,
    ];
    const slide = (rect) => {
      const res = resolveCircleRect(p.x, p.y, r, rect);
      if (!res.hit) return;
      // Гасим только нормальную составляющую скорости — игрок скользит вдоль
      // стены, а не залипает в углу проёма.
      const nx = res.x - p.x;
      const ny = res.y - p.y;
      const len = Math.hypot(nx, ny);
      if (len > 1e-6) {
        const ux = nx / len;
        const uy = ny / len;
        const dot = p.vx * ux + p.vy * uy;
        if (dot < 0) { p.vx -= dot * ux; p.vy -= dot * uy; }
      }
      p.x = res.x;
      p.y = res.y;
    };
    for (const w of walls) slide(w);
    for (const s of this.shelfDefs) slide(s.rect);
  }

  stepSources(dt) {
    for (const src of this.sources) {
      if (src.stock < CRATE.stockMax) {
        src.timer += dt;
        if (src.timer >= CRATE.refillSeconds) {
          src.timer = 0;
          src.stock++;
          this.emit('crate_arrived', { shelf: src.shelf });
        }
      }
    }
  }

  stepSpawn(dt) {
    this.spawnTimer -= dt;

    // Тайный покупатель приходит по своему расписанию, не вставая в очередь.
    if (this.time >= this.nextInspectorAt
        && this.inspectorsDone < this.profile.inspectors
        && !this.customers.some((c) => c.def.inspector)) {
      this.spawnCustomer('inspector');
      this.nextInspectorAt = this.time + SHIFT.inspectorRepeat;
      this.inspectorsDone++;
    }

    if (this.spawnTimer > 0) return;
    const phase = this.phase;
    const jitter = 1 + this.rng.range(-phase.jitter, phase.jitter);
    this.spawnTimer = phase.spawnEvery * jitter * this.profile.flowMul;

    if (this.outside > 0) {
      // У входа уже ждут — пускаем следующего, как только место освободилось.
      if (this.reserved < SHIFT.maxQueue) { this.outside--; this.spawnCustomer(); }
      return;
    }
    if (this.reserved >= SHIFT.maxQueue) { this.outside++; this.emit('queue_full', { outside: this.outside }); return; }
    this.spawnCustomer();
  }

  /**
   * Создаёт покупателя. Его «корзина» формируется из реальных полок: если
   * товара на полке нет, покупатель уходит без покупки и роняет рейтинг —
   * именно поэтому выкладка ящиков так важна.
   */
  spawnCustomer(forceType = null) {
    const def = forceType
      ? CUSTOMER_BY_ID[forceType]
      : this.rng.weighted(CUSTOMERS, CUSTOMERS.map((c) => c.weights[this.phaseIndex]));

    const age = this.rng.int(def.ageRange[0], def.ageRange[1]);
    const looksYoung = age < YOUNG_LOOK_AGE;
    const basket = [];
    let emptyShelf = false;

    // Вечером покупатели закупаются крупнее — так у поздних смен выше потолок.
    const wantedCount = Math.max(1, Math.round(
      this.rng.int(def.items[0], def.items[1]) * this.profile.basketMul,
    ));
    for (let i = 0; i < wantedCount; i++) {
      // Взрослым чаще достаётся «крепкое», подросткам — сидр и энергетики.
      const available = ITEMS.filter((it) => !!this.shelves[it.shelf]);
      const pool = def.inspector
        ? available.filter((it) => !it.restricted)
        : (age < 18
          ? available.filter((it) => it.price < 200)
          : available);
      const item = this.rng.weighted(pool, pool.map((it) => it.weight ?? 5));
      const shelf = this.shelves[item.shelf];
      if (shelf.units <= 0) { emptyShelf = true; continue; }
      shelf.units -= 1;
      basket.push({ id: item.id, price: item.price, scanned: false, removed: false });
    }

    if (basket.length === 0 || emptyShelf) {
      if (emptyShelf && !def.inspector) {
        this.rating = clamp(this.rating - RATING.emptyShelfPerCustomer, 0, 100);
        this.stats.emptyShelfMisses++;
        this.emit('empty_shelf', { name: def.title, shelf: 'beer' });
      }
      if (basket.length === 0 && !def.inspector) {
        // Совсем без покупки: покупатель только заходит, высказывает претензию
        // и уходит — выручки нет, рейтинг уже пострадал.
        this.stats.lost++;
        this.outside = Math.max(0, this.outside);
        this.emit('customer_left_empty', { name: def.title });
        return null;
      }
    }

    const slot = def.queueSlot === false ? -1 : Math.min(this.reserved, SHIFT.maxQueue - 1);
    const customer = {
      id: `c${this.customers.length + 1}`,
      def,
      age,
      looksYoung,
      basket,
      slot: slot < 0 ? -1 : Math.min(slot, SHIFT.maxQueue - 1),
      state: 'walking',
      x: WORLD.spawnPoint.x,
      y: this.rng.range(WORLD.spawnPoint.y - 40, WORLD.spawnPoint.y + 40),
      targetX: WORLD.spawnPoint.x,
      targetY: WORLD.spawnPoint.y,
      waypoint: 0,
      patience: def.patience * this.profile.patienceMul * this.rng.range(0.92, 1.12),
      patienceMax: def.patience * this.profile.patienceMul,
      waitTime: 0,
      idChecked: false,
      idRevealed: false,
      chequeTotal: 0,
      scanProgress: 0,
      payNote: this.rollNote(basket),
      changePending: false,
      changeTimer: 0,
      changeTimerMax: ECONOMY.changeWindow,
      dialog: null,
      dialogTimer: 0,
      dialogResult: null,
      chatTimer: this.rng.range(3, 7),
      line: null,
      lineTimer: 0,
      bob: this.rng.range(0, Math.PI * 2),
      speed: def.speed,
    };
    if (def.scandal) {
      customer.dialog = this.rng.pick(SCANDAL_DIALOGS);
      for (const opt of customer.dialog.options) opt.picked = false;
    }
    this.customers.push(customer);
    this.emit('customer_in', { id: customer.id, name: def.title, type: def.id });
    return customer;
  }

  /** Крупная купюра — признак того, что придётся отдавать сдачу. */
  rollNote(basket) {
    const total = basket.reduce((s, i) => s + i.price, 0);
    if (total < 200) return 500;
    if (total < 700) return this.rng() < 0.6 ? 1000 : 500;
    return this.rng() < 0.5 ? 5000 : 1000;
  }

  stepCustomers(dt) {
    for (const c of this.customers) {
      const def = c.def;
      // Ходьба: покупатель идёт по маршруту вход → зал → место в очереди.
      if (c.state === 'walking' || c.state === 'leaving') {
        const path = c.state === 'walking' ? this.pathToQueue(c) : [{ x: WORLD.exitPoint.x, y: c.y }];
        const wp = path[Math.min(c.waypoint, path.length - 1)];
        const d = dist(c.x, c.y, wp.x, wp.y);
        if (d < 8) {
          c.waypoint++;
          if (c.waypoint >= path.length && c.state === 'walking') {
            if (c.slot < 0) { c.state = 'patrol'; c.patrolTimer = 9 + this.rng() * 3; }
            else { c.state = 'queue'; this.emit('customer_ready', { name: def.title }); }
          }
          if (c.waypoint >= path.length && c.state === 'leaving') { c.state = 'gone'; }
        } else {
          const step = Math.min(c.speed * dt, d);
          c.x += ((wp.x - c.x) / d) * step;
          c.y += ((wp.y - c.y) / d) * step;
        }
        c.bob += dt * 7;
      }

      // Тайный покупатель обходит зал и оценивает обстановку.
      if (c.state === 'patrol') {
        c.patrolTimer -= dt;
        c.x += Math.cos(c.bob * 0.6) * 14 * dt;
        c.y += Math.sin(c.bob * 0.5) * 18 * dt;
        if (c.patrolTimer <= 0) this.finishInspector(c);
      }

      // Ожидание в очереди: тикает терпение, растёт усталость.
      if (c.state === 'queue') {
        c.waitTime += dt;
        if (c.slot === 0) {
          c.patience -= dt;
          // Скандалист при подходе к кассе заводит разговор.
          if (c.dialog && !c.dialogResult && c.waitTime > 1.4) {
            c.dialogTimer += dt;
            if (c.dialogTimer > 9) {
              this.resolveDialog(c, null);
            }
          }
          if (c.patience <= 0) this.customerLeaves(c);
        } else {
          // Очередь: ожидание тоже расходует терпение, но медленнее.
          c.patience -= dt * 0.55;
          if (c.patience <= 0) this.customerLeaves(c);
        }
      }

      // Реплики покупателей — просто атмосфера, но их видно в интерфейсе.
      c.lineTimer -= dt;
      if (c.lineTimer <= 0 && c.line) { c.line = null; }
      if (def.chatty) {
        c.chatTimer -= dt;
        if (c.chatTimer <= 0) {
          c.chatTimer = this.rng.range(4.5, 8);
          c.line = this.pickLine(def);
          c.lineTimer = 3.2;
        }
      }
    }

    // Убираем ушедших и подтягиваем очередь вперёд.
    const before = this.customers.length;
    this.customers = this.customers.filter((c) => c.state !== 'gone');
    if (this.customers.length !== before) this.reflowQueue();
    this.reflowQueue();
  }

  /** Маршрут от входа до места в очереди (или до зоны проверяющего). */
  pathToQueue(c) {
    if (c.def.inspector) {
      return [
        { x: 60, y: 420 }, { x: 330, y: 420 }, { x: 330, y: 330 },
        { x: 620, y: 330 },
      ];
    }
    const slot = CASHIER.queueSlots[c.slot] ?? CASHIER.queueSlots[0];
    return [
      { x: 60, y: c.y },
      { x: CASHIER.approach.x, y: c.y },
      { x: CASHIER.approach.x, y: CASHIER.approach.y },
      { x: slot.x, y: slot.y },
    ];
  }

  /** Точка, куда должен встать продавец за кассой (зона из config.RATING). */
  get registerSpot() {
    return { x: CASHIER.zone.x + CASHIER.zone.w / 2, y: CASHIER.zone.y + CASHIER.zone.h / 2 };
  }

  reflowQueue() {
    const q = this.queue.sort((a, b) => a.slot - b.slot);
    q.forEach((c, i) => {
      if (c.slot !== i) {
        c.slot = i;
        c.waypoint = this.pathToQueue(c).length - 1; // последняя точка = новое место
      }
    });
    while (this.outside > 0 && this.reserved < SHIFT.maxQueue) {
      this.outside--;
      this.spawnCustomer();
    }
  }

  pickLine(def) {
    const pool = def.lines ?? ['…'];
    if (pool.length <= 1) return pool[0];
    let line = this.rng.pick(pool);
    if (line === this.seenLines[this.seenLines.length - 1]) line = this.rng.pick(pool);
    this.seenLines.push(line);
    if (this.seenLines.length > 12) this.seenLines.shift();
    return line;
  }

  customerLeaves(c) {
    c.state = 'leaving';
    c.waypoint = 0;
    c.line = 'Ну и обслуживание!';
    c.lineTimer = 3;
    this.rating = clamp(this.rating - ECONOMY.leaveRatingHit, 0, 100);
    this.stress = clamp(this.stress + STRESS.onLeave, 0, 100);
    this.stats.lost++;
    this.stats.cleanStreak = 0;
    if (c.basket.some((i) => i.removed === false)) this.stats.unitsSold += 0;
    this.emit('customer_left', { name: c.def.title, patienceLeft: c.patience });
    if (c === this.current) this.emit('register_clear');
  }

  stepStress(dt) {
    const q = this.queue;
    // Шкала стресса на максимуме — это ещё не проигрыш: даём несколько секунд,
    // чтобы разобрать очередь. Так срыв не случается «в один кадр», а игрок
    // успевает понять, что происходит, и спасти смену.
    if (this.stress >= 96) this.collapseTimer += dt;
    else this.collapseTimer = Math.max(0, this.collapseTimer - dt * 2);
    if (q.length > 0) {
      const base = STRESS.perWaitingCustomer + STRESS.extraPerCustomer * (q.length - 1);
      const chatty = q.filter((c) => c.def.chatty).length * STRESS.soulAuraPerSec;
      this.stress = clamp(this.stress + (base + chatty) * dt, 0, 100);
    } else {
      this.stress = clamp(this.stress - STRESS.quietDecay * this.mods.stressMul * dt, 0, 100);
    }
    if (this.stats.maxQueue < q.length) this.stats.maxQueue = q.length;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Действия игрока
  // ─────────────────────────────────────────────────────────────────────

  /** Клавиша E — контекстное действие. */
  pressAction() {
    if (this.finished) return false;
    if (this.busy > 0) return false;

    // 1) У кассы: подать чек / начать обслуживание.
    if (this.atRegister && this.current) {
      this.emit('at_register', { id: this.current.id });
      return true;
    }
    // 2) С ящиком у подходящей полки — выкладываем товар.
    if (this.carrying) {
      const shelf = this.nearShelf();
      if (!shelf) { this.emit('blocked', { reason: 'no_shelf' }); return false; }
      if (shelf.id !== this.carrying) {
        this.emit('wrong_shelf', { need: this.carrying, got: shelf.id });
        return false;
      }
      this.busyLabel = 'fill';
      this.busy = CRATE.fillSeconds * this.mods.fillMul;
      const shelfState = this.shelves[shelf.id];
      const placed = Math.min(CRATE.unitsPerCase, shelfState.cap - shelfState.units);
      shelfState.units += placed;
      this.stats.fills++;
      this.carrying = null;
      this.stress = clamp(this.stress + STRESS.onFill, 0, 100);
      this.emit('fill', { shelf: shelf.id, units: placed, unitsNow: shelfState.units });
      return true;
    }
    // 3) На складе — берём ящик.
    const src = this.nearSource();
    if (src) {
      if (src.stock <= 0) { this.emit('crate_empty', { shelf: src.shelf }); return false; }
      src.stock--;
      src.timer = 0;
      this.carrying = src.shelf;
      this.stats.crates++;
      this.busyLabel = 'pick';
      this.busy = CRATE.pickSeconds;
      this.emit('pickup', { shelf: src.shelf, label: src.label });
      return true;
    }
    this.emit('blocked', { reason: 'nothing' });
    return false;
  }

  /** Space — пробить следующую позицию в чеке. */
  pressScan() {
    if (this.finished || this.busy > 0 || !this.atRegister) return false;
    const c = this.current;
    if (!c) return false;
    const item = c.basket.find((i) => !i.scanned && !i.removed);
    if (!item) { this.emit('scan_none', { id: c.id }); return false; }

    const def = ITEM_BY_ID[item.id];
    // Продажа «крепкого» несовершеннолетнему без проверки — это и есть штраф.
    if (def.restricted && c.idChecked && c.age < 18) {
      this.registerFine(c, 'minor');
      return false;
    }
    item.scanned = true;
    c.chequeTotal += item.price;
    this.stats.scans++;
    this.stats.unitsSold++;
    this.busy = ECONOMY.scanSeconds * this.mods.scanMul;
    this.busyLabel = 'scan';
    this.emit('scan', { item: def.name, price: item.price, total: c.chequeTotal });

    if (!c.basket.some((i) => !i.scanned && !i.removed)) this.openChangeIfNeeded(c);
    return true;
  }

  /** F — проверить паспорт. */
  pressCheckId() {
    if (this.finished || this.busy > 0 || !this.atRegister) return false;
    const c = this.current;
    if (!c) return false;
    if (c.idChecked) { this.emit('id_again'); return false; }
    c.idChecked = true;
    c.idRevealed = true;
    this.stats.checks++;
    this.busy = 0.45;
    this.busyLabel = 'check';

    if (c.age < 18) {
      this.emit('id_minor', { age: c.age, name: c.def.title });
    } else if (c.age < YOUNG_LOOK_AGE) {
      this.emit('id_ok', { age: c.age });
      this.rating = clamp(this.rating + 0.8, 0, 100);
    } else {
      // Взрослого проверять невежливо — он обижается.
      this.rating = clamp(this.rating - 0.35, 0, 100);
      this.emit('id_annoyed', { age: c.age });
    }
    return true;
  }

  /** X — убрать «крепкое» из чека (минимальная реакция на несовершеннолетнего). */
  pressRemoveRestricted() {
    if (this.finished || this.busy > 0 || !this.atRegister) return false;
    const c = this.current;
    if (!c) return false;
    const item = [...c.basket].reverse().find((i) => !i.scanned && !i.removed && ITEM_BY_ID[i.id].restricted);
    if (!item) { this.emit('remove_none'); return false; }
    item.removed = true;
    // Товар возвращается на полку — это честно и понятно игроку.
    this.shelves[ITEM_BY_ID[item.id].shelf].units = Math.min(
      this.shelves[ITEM_BY_ID[item.id].shelf].cap,
      this.shelves[ITEM_BY_ID[item.id].shelf].units + 1,
    );
    this.emit('remove_item', { item: ITEM_BY_ID[item.id].name });
    if (!this.closeEmptyCheque(c)) this.openChangeIfNeeded(c);
    return true;
  }

  /**
   * Если в чеке не осталось ни одной продаваемой позиции (всё «крепкое»
   * убрали или отказали), покупатель просто уходит: не нужно жать Enter,
   * чтобы освободить кассу. Иначе игрок может «застрять» у прилавка.
   * Возвращает true, если покупателя уже проводили.
   */
  closeEmptyCheque(c) {
    const left = c.basket.some((i) => !i.scanned && !i.removed);
    if (left || c.chequeTotal > 0) return false;
    c.state = 'leaving';
    c.waypoint = 0;
    c.line = this.pickLine(c.def);
    c.lineTimer = 2.2;
    this.stats.turnedAway = (this.stats.turnedAway || 0) + 1;
    this.emit('turned_away', { id: c.id, name: c.def.title });
    return true;
  }

  /** Ctrl/«отказ» — отказать в продаже крепкого (используется вместе с X). */
  pressRefuse() {
    if (this.finished || this.busy > 0 || !this.atRegister) return false;
    const c = this.current;
    if (!c) return false;
    const restricted = c.basket.filter((i) => ITEM_BY_ID[i.id].restricted && !i.removed);
    if (!restricted.length) { this.emit('refuse_none'); return false; }
    for (const item of restricted) {
      item.removed = true;
      const shelf = this.shelves[ITEM_BY_ID[item.id].shelf];
      shelf.units = Math.min(shelf.cap, shelf.units + 1);
    }
    const legit = c.age < 18;
    if (legit) {
      this.bonuses += ECONOMY.refuseBonus;
      this.stats.minorsRefused++;
      this.rating = clamp(this.rating + 1.4, 0, 100);
      this.emit('refuse', { good: true, age: c.age, bonus: ECONOMY.refuseBonus });
    } else {
      this.rating = clamp(this.rating - 2, 0, 100);
      this.emit('refuse', { good: false, age: c.age, bonus: 0 });
    }
    // Если после отказа в чеке ничего не осталось — покупатель уходит сам.
    this.closeEmptyCheque(c);
    return true;
  }

  /** Enter — завершить чек (при необходимости сначала отдать сдачу). */
  pressEnter() {
    if (this.finished) return false;
    const c = this.current;
    if (!c || !this.atRegister) return false;
    if (c.basket.some((i) => !i.scanned && !i.removed)) {
      this.emit('not_ready', { left: c.basket.filter((i) => !i.scanned && !i.removed).length });
      return false;
    }
    if (c.changePending) {
      c.changePending = false;
      const bonus = Math.round(c.chequeTotal * ECONOMY.changeBonus);
      this.tips += bonus;
      this.stats.changeOk++;
      this.emit('change_ok', { bonus });
    }
    this.completeSale(c);
    return true;
  }

  openChangeIfNeeded(c) {
    if (c.payNote > c.chequeTotal + 100) {
      c.changePending = true;
      c.changeTimer = c.changeTimerMax;
      this.emit('change_needed', { note: c.payNote, total: c.chequeTotal });
    }
  }

  /**
   * Диалог со скандалистом: 1/2/3 (или клик по варианту).
   * @param {number|null} index индекс выбранной реплики, null — время вышло
   */
  answerDialog(index) {
    if (this.finished) return false;
    const c = this.queue.find((x) => x.dialog && !x.dialogResult);
    if (!c) return false;
    this.resolveDialog(c, index);
    return true;
  }

  resolveDialog(c, index) {
    const dialog = c.dialog;
    const option = index === null ? null : dialog.options[index];
    const good = !!option?.good;
    c.dialogResult = good ? 'good' : 'bad';
    this.stats.dialogs++;
    if (good) {
      this.stats.dialogsGood++;
      this.rating = clamp(this.rating + 2.2, 0, 100);
      this.stress = clamp(this.stress - 2.5, 0, 100);
      this.emit('dialog_result', { good: true, line: option.text });
    } else {
      const hit = option?.hit ?? 5;
      this.rating = clamp(this.rating - hit, 0, 100);
      this.stress = clamp(this.stress + 5, 0, 100);
      this.emit('dialog_result', { good: false, line: option?.text ?? 'Молчание' });
    }
  }

  /** Завершение чека: деньги, чаевые, рейтинг, стресс, опыт-статистика. */
  completeSale(c) {
    const total = Math.round(c.chequeTotal * this.phase.priceMul * this.profile.priceMul * this.mods.moneyMul);
    this.revenue += total;
    const fast = c.waitTime < ECONOMY.quickServeSeconds;
    const tip = Math.round(total * ECONOMY.baseTip * (fast ? 1.8 : 0.7));
    this.tips += tip;
    this.stats.served++;
    this.stats.cleanServes++;
    this.stats.cleanStreak++;
    if (this.stats.cleanStreak > this.stats.bestStreak) this.stats.bestStreak = this.stats.cleanStreak;
    this.rating = clamp(this.rating + (fast ? RATING.perfectServe : RATING.happySale), 0, 100);
    this.stress = clamp(this.stress + STRESS.onSale, 0, 100);

    // Проверка на несовершеннолетнего: если «крепкое» ушло в чек — штраф.
    if (c.age < 18) {
      const soldRestricted = c.basket.some((i) => i.scanned && ITEM_BY_ID[i.id].restricted);
      if (soldRestricted) this.registerFine(c, 'minor');
    }

    c.state = 'leaving';
    c.waypoint = 0;
    c.line = c.def.inspector ? '…' : this.pickLine(c.def);
    c.lineTimer = 2.5;
    this.emit('sale', { total, tip, fast, id: c.id, name: c.def.title });

    // Полки: проданное уже списано при входе покупателя, поэтому здесь только
    // предупреждение, если полка совсем опустела.
    for (const s of this.shelfDefs) {
      if (this.shelves[s.id].units === 0) this.emit('shelf_empty', { shelf: s.id, title: s.short });
    }
    return true;
  }

  registerFine(c, reason) {
    this.fines += ECONOMY.fineMinor;
    this.stats.finesCount++;
    this.stats.cleanStreak = 0;
    this.rating = clamp(this.rating - 14, 0, 100);
    this.stress = clamp(this.stress + STRESS.onFine, 0, 100);
    this.emit('fine', { reason, amount: ECONOMY.fineMinor, name: c.def.title });
  }

  /** Тайный покупатель завершил обход: оценка зала. */
  finishInspector(c) {
    c.state = 'leaving';
    c.waypoint = 0;
    const fullness = this.shelfDefs.reduce(
      (acc, s) => acc + this.shelves[s.id].units / this.shelves[s.id].cap, 0,
    ) / this.shelfDefs.length;
    const queueOk = this.queue.length <= 1;
    const clean = this.stats.finesCount === 0;
    const good = fullness >= 0.33 && queueOk && clean;
    this.stats.inspectors++;
    if (good) {
      this.rating = clamp(this.rating + RATING.inspectorGood, 0, 100);
      this.bonuses += 400;
      this.emit('inspector', { good: true, fullness, queue: this.queue.length });
    } else {
      this.rating = clamp(this.rating + RATING.inspectorBad, 0, 100);
      this.emit('inspector', { good: false, fullness, queue: this.queue.length, clean });
    }
  }

  /** Итог смены. Вызывается по таймеру или при нервном срыве. */
  finish(reason = 'time') {
    if (this.finished) return this.result;
    this.finished = true;
    const ratingBonus = Math.round(Math.max(0, this.rating - 60) * 4);
    const cleanBonus = (this.stats.lost === 0 && this.stats.finesCount === 0) ? 600 : 0;
    const score = Math.round(
      this.revenue + this.tips + this.bonuses - this.fines + ratingBonus + cleanBonus,
    );
    const cleanShifts = this.stats.lost === 0 && this.stats.finesCount === 0;
    let stars = 0;
    for (const t of this.thresholds) if (score >= t) stars++;

    this.result = {
      shiftId: this.shiftId,
      venueId: this.venueId,
      shiftName: this.shiftName,
      reason,
      timeUsed: Math.round(this.time * 10) / 10,
      duration: this.duration,
      revenue: Math.round(this.revenue),
      tips: Math.round(this.tips),
      bonuses: Math.round(this.bonuses),
      fines: Math.round(this.fines),
      ratingBonus,
      cleanBonus,
      score,
      stars,
      planMet: this.revenue >= this.plan,
      plan: this.plan,
      thresholds: this.thresholds,
      rating: Math.round(this.rating),
      stress: Math.round(this.stress),
      clean: cleanShifts,
      collapsed: reason === 'collapse',
      stats: { ...this.stats },
      xp: this.computeXp(stars),
    };
    this.emit('shift_end', this.result);
    return this.result;
  }

  computeXp(stars) {
    const s = this.stats;
    return Math.round(
      ECONOMY.shiftXp
      + s.served * ECONOMY.saleXp
      + s.cleanServes * ECONOMY.cleanServeXp
      + s.minorsRefused * ECONOMY.refuseXp
      + stars * 40
      + (this.result?.planMet ? 60 : 0),
    );
  }

  /** Снимок для интерфейса: HUD читает только это. */
  snapshot() {
    const c = this.current;
    return {
      time: this.time,
      timeLeft: Math.max(0, this.duration - this.time),
      phase: this.phase,
      phaseIndex: this.phaseIndex,
      rating: this.rating,
      stress: this.stress,
      revenue: this.revenue,
      tips: this.tips,
      fines: this.fines,
      bonuses: this.bonuses,
      plan: this.plan,
      queue: this.queue.length,
      /** Покупатели, которые идут к кассе, но ещё не встали в очередь. */
      incoming: Math.max(0, this.reserved - this.queue.length),
      outside: this.outside,
      collapseTimer: this.collapseTimer,
      collapseLimit: STRESS.collapseGrace,
      carrying: this.carrying,
      busy: this.busy,
      busyLabel: this.busyLabel,
      atRegister: this.atRegister,
      dash: this.player.dash,
      venue: this.venueId,
      shelfDefs: this.shelfDefs,
      shelves: Object.fromEntries(
        this.shelfDefs.map((s) => [s.id, { units: this.shelves[s.id].units, cap: s.cap, title: s.title }]),
      ),
      sources: this.sources.map((s) => ({ shelf: s.shelf, stock: s.stock, label: s.label })),
      current: c ? {
        id: c.id,
        name: c.def.title,
        type: c.def.id,
        patience: c.patience,
        patienceMax: c.patienceMax,
        age: c.age,
        looksYoung: c.looksYoung,
        idChecked: c.idChecked,
        idRevealed: c.idRevealed,
        chequeTotal: c.chequeTotal,
        payNote: c.payNote,
        changePending: c.changePending,
        changeTimer: c.changeTimer,
        changeTimerMax: c.changeTimerMax,
        basket: c.basket.map((i) => ({ ...i, name: ITEM_BY_ID[i.id].name, restricted: ITEM_BY_ID[i.id].restricted })),
        scannedCount: c.basket.filter((i) => i.scanned).length,
        pending: c.basket.filter((i) => !i.scanned && !i.removed).length,
        dialog: c.dialog && !c.dialogResult ? {
          line: c.dialog.line,
          options: c.dialog.options.map((o) => o.text),
          timer: 9 - c.dialogTimer,
        } : null,
        dialogResult: c.dialogResult,
      } : null,
      dialogCustomer: (() => {
        const d = this.customers.find((x) => x.dialog && !x.dialogResult && x.state === 'queue');
        if (!d) return null;
        return {
          id: d.id, name: d.def.title, line: d.dialog.line,
          options: d.dialog.options.map((o) => o.text),
          timer: 9 - d.dialogTimer, atSlot: d.slot,
        };
      })(),
    };
  }
}

export { SHELVES, CASHIER, CRATE_SOURCES, shelvesFor, crateSourcesFor };
