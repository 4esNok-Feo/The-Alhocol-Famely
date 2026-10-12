/**
 * game.js — «дирижёр»: состояния игры, ввод, камера, звук, сохранения,
 * реклама платформы и связь между моделью смены, интерфейсом и отрисовкой.
 *
 * Модель (ShiftRun) ничего не знает про браузер, интерфейс — про механику,
 * платформа — про то и другое. Здесь они соединяются.
 */

import {
  CASHIER, SHIFT, TEXT, VENUES, VERSION,
} from './core/config.js';
import {
  applyResult, buyUpgrade, defaultProfile, loadProfile, mergeProfiles, outfitById,
  saveProfile, setOutfit, shiftList, shiftUnlocked, unlockedOutfits,
} from './core/career.js';
import { Bot } from './ai/bot.js';
import { InputManager } from './core/input.js';
import { ShiftRun } from './core/run.js';
import { formatMoney, formatTime } from './core/util.js';
import { AudioEngine } from './audio/audio.js';
import { Camera, Effects } from './render/effects.js';
import { WorldRenderer } from './render/world.js';
import { Hud } from './ui/hud.js';
import { Screens } from './ui/screens.js';

const STEP = 1 / 60;

export class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} platform  экземпляр web/platform.js
   */
  constructor(canvas, platform) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.platform = platform;
    this.input = new InputManager();
    this.audio = new AudioEngine();
    this.world = new WorldRenderer();
    this.camera = new Camera();
    this.effects = new Effects(11);
    this.hud = new Hud();
    this.screens = new Screens();

    this.state = 'loading';
    this.stateTime = 0;
    this.profile = defaultProfile();
    this.run = null;
    this.shift = null;
    this.result = null;
    this.reward = null;
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this.paused = false;
    this.quality = 'high';
    this.frameSkip = 0;
    this.errors = [];
    this.dpr = 1;
    this.adPending = false;
    this.blurFlag = false;
    this.clickPending = null;
    this.log = [];
  }

  /**
   * Ждёт загрузку шрифтов из assets/fonts, чтобы первый кадр не мигал
   * системной кириллицей. Ошибка или долгая загрузка не должны мешать игре:
   * через полторы секунды стартуем с тем, что есть.
   */
  async waitForFonts(timeoutMs = 1500) {
    const fonts = typeof document !== 'undefined' ? document.fonts : null;
    if (!fonts || typeof fonts.load !== 'function') return false;
    const load = Promise.all([
      fonts.load('400 16px "DejaVu Sans"'),
      fonts.load('800 16px "DejaVu Sans"'),
    ]).then(() => true).catch(() => false);
    const timer = new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs));
    return Promise.race([load, timer]);
  }

  async boot() {
    try {
      this.canvas.addEventListener('webglcontextlost', () => this.fail('Потерян графический контекст'));
      this.fontsReady = await this.waitForFonts();
      const res = await this.platform.init();
      this.profile = loadProfile(this.platform.storage);
      this.quality = this.profile.settings.quality ?? 'high';
      this.audio.setSfx(this.profile.settings.sfx !== false);
      this.audio.setMusic(this.profile.settings.music !== false);
      this.audio.enabledMusic = this.profile.settings.music !== false;

      // Облако: подтягиваем и объединяем без отката прогресса.
      const cloud = await this.platform.loadCloud();
      if (cloud) {
        const merged = mergeProfiles(this.profile, cloud);
        if (JSON.stringify(merged) !== JSON.stringify(this.profile)) {
          this.profile = merged;
          this.save('cloud-merge');
        }
      }
      this.platform.currentProfile = this.profile;

      this.platform.onPause(() => this.onPlatformPause());
      this.platform.onResume(() => this.onPlatformResume());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.onPlatformPause();
        else this.onPlatformResume();
      });

      this.input.attach();
      this.input.target = window;
      this.bindPointer();

      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.setState('menu');
      this.startLoop();
      // Диагностика для страницы: есть она не всегда (например, при встраивании
      // игры на чужую страницу), поэтому пишем бережно.
      this.patchDiagnostics({ ready: true, state: this.state });
      return res;
    } catch (err) {
      this.fail(err?.message ?? 'Ошибка запуска');
      throw err;
    }
  }

  /**
   * Дописать поля в window.__KATME__ (страница может её не создать — игру
   * встраивают и на своей странице). Версия пишется всегда.
   */
  patchDiagnostics(fields) {
    try {
      if (typeof window === 'undefined') return;
      window.__KATME__ = window.__KATME__ ?? {};
      if (!window.__KATME__.version) window.__KATME__.version = VERSION;
      Object.assign(window.__KATME__, fields);
    } catch { /* диагностика не критична */ }
  }

  fail(message) {
    this.errors.push(message);
    this.state = 'error';
    this.stateMessage = message;
    this.patchDiagnostics({ lastError: message, state: 'error' });
  }

  save(reason = 'auto') {
    this.profile.updatedAt = Date.now();
    saveProfile(this.profile, this.platform.storage);
    this.platform.currentProfile = this.profile;
    this.log.push({ t: Date.now(), what: 'save', reason });
    if (this.log.length > 40) this.log.shift();
  }

  setState(name, data = {}) {
    this.state = name;
    this.stateTime = 0;
    Object.assign(this, data);
    this.screens.starAnim = 0;
    if (name === 'results') this.audio.play('star');
    this.hud.setTip(null);
  }

  // ── Ввод и указатель ────────────────────────────────────────────────
  bindPointer() {
    const toCanvas = (ev) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * this.viewW;
      const y = ((ev.clientY - rect.top) / rect.height) * this.viewH;
      return { x, y };
    };
    this.canvas.addEventListener('mousemove', (ev) => {
      const p = toCanvas(ev);
      this.pointerX = p.x; this.pointerY = p.y;
      this.screens.updateHover(p.x, p.y);
      this.hud.updateHover(p.x, p.y);
    });
    this.canvas.addEventListener('mousedown', (ev) => {
      const p = toCanvas(ev);
      this.pointerX = p.x; this.pointerY = p.y;
      this.pointerDown = true;
    });
    const up = (ev) => {
      if (!this.pointerDown) return;
      this.pointerDown = false;
      const p = toCanvas(ev);
      this.pointerClick = { x: p.x, y: p.y };
    };
    this.canvas.addEventListener('mouseup', up);
    this.canvas.addEventListener('mouseleave', () => { this.pointerDown = false; });
    this.canvas.addEventListener('touchstart', (ev) => {
      const t = ev.touches[0];
      if (!t) return;
      const p = toCanvas(t);
      this.pointerX = p.x; this.pointerY = p.y;
      this.screens.updateHover(p.x, p.y);
      this.pointerClick = { x: p.x, y: p.y };
      ev.preventDefault();
    }, { passive: false });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.camera.resize(w, h, { x: 0, y: 130, w: 1120, h: 880 });
  }

  startLoop() {
    this.running = true;
    this.lastTime = performance.now();
    const frame = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.25, (now - this.lastTime) / 1000);
      this.lastTime = now;
      try {
        this.update(dt);
        this.render();
      } catch (err) {
        this.fail(err?.message ?? String(err));
        console.error(err);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  onPlatformPause() {
    if (this.state === 'shift' && !this.run?.finished) {
      this.blurFlag = true;
      this.setState('pause', { snapshot: this.run.snapshot() });
    }
    this.platform.gameplayStop();
  }

  onPlatformResume() {
    if (this.state === 'pause' && this.blurFlag) {
      // Возвращаемся в игру только если пауза была автоматической.
      this.blurFlag = false;
      this.setState('shift', { snapshot: null });
      this.platform.gameplayStart();
    }
  }

  // ── Обновление ──────────────────────────────────────────────────────
  /**
   * @param {number} dt шаг времени
   * @param {boolean} modelOnly режим ускоренного прогона: считаем только модель
   *   (используется инструментом снимков и автотестами смен)
   */
  update(dt, modelOnly = false) {
    this.stateTime += dt;
    if (!modelOnly) {
      this.hud.update(dt);
      this.screens.update(dt);
    }
    this.effects.update(dt);
    this.audio.resume?.();

    if (this.state === 'shift') {
      this.updateShift(dt, modelOnly);
    } else if (this.state === 'results') {
      // Фон смены продолжает жить, но медленнее — «витрина».
    } else {
      this.updateIdleScene(dt);
    }
    this.handleHotkeys();
    this.input.clearFrame();
    // Клик прилетает между кадрами (mouseup/touchstart), а кнопки живут в
    // render(): поэтому клик перекладываем в clickPending, а «почтовый ящик»
    // чистим. Раньше здесь стоял pointerClick = null — из-за этого ни одна
    // кнопка на канвасе не срабатывала, хотя подсвечивалась при наведении.
    this.clickPending = this.pointerClick;
    this.pointerClick = null;
  }

  /**
   * Демонстрационная смена за меню: за прилавком работает бот, а игрок видит
   * живой магазин вместо статичной картинки. Тот же код, что и в смене.
   */
  updateIdleScene(dt) {
    if (!this.demoRun || this.demoRun.finished) {
      const shift = shiftList()[Math.floor(Math.random() * 3)];
      this.demoRun = new ShiftRun({
        seed: (Math.random() * 1e9) >>> 0,
        venue: shift.venue, shiftId: shift.id, duration: 300,
        plan: shift.plan, thresholds: shift.thresholds, mods: shift.mods,
      });
      this.demoBot = new Bot('strong', (Math.random() * 1e6) | 0);
      this.demoCamera = null;
    }
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= STEP && steps < 5) {
      this.demoRun.step(STEP, this.demoBot.step(this.demoRun, STEP));
      this.demoRun.drainEvents();
      this.accumulator -= STEP;
      steps++;
    }
    if (steps === 5) this.accumulator = 0;
    const p = this.demoRun.player;
    this.camera.update(dt, p.x, p.y, this.viewW, this.viewH, 0);
  }

  updateShift(dt, modelOnly = false) {
    const run = this.run;
    if (!run) return;
    // Смена всегда считает фиксированным шагом — так она детерминирована.
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= STEP && steps < 5) {
      let input;
      if (this.autoBot) {
        // Автопилот: бот принимает те же решения, что и человек, — режим
        // используется тестами и съёмкой экранов.
        input = this.autoBot.step(run, STEP);
      } else {
        const mv = this.input.moveVector();
        input = { dx: mv.dx, dy: mv.dy, dash: this.input.held('dash') };
      }
      run.step(STEP, input);
      this.accumulator -= STEP;
      steps++;
    }
    if (steps === 5) this.accumulator = 0;

    const events = run.drainEvents();
    if (!modelOnly) {
      this.hud.handleEvents(events, run);
      this.applyEventFeedback(events, run);
      this.setContextTip(run);
    }

    // Камера ведёт Катьме и чуть смещается в сторону кассы, если там очередь.
    const p = run.player;
    const focus = run.queue.length > 0 || run.outside > 0
      ? { x: (p.x + CASHIER.zone.x + CASHIER.zone.w / 2) / 2, y: (p.y + 470) / 2 }
      : { x: p.x, y: p.y };
    this.camera.update(dt, focus.x, focus.y, this.viewW, this.viewH, run.stress > 70 ? 1.6 : 0);

    if (run.finished) this.finishShift();
  }

  applyEventFeedback(events, run) {
    const p = run.player;
    for (const ev of events) {
      switch (ev.type) {
        case 'scan': this.audio.play('scan'); break;
        case 'sale':
          this.audio.play('cash');
          this.effects.addText(p.x + 10, p.y - 60, `+${formatMoney(ev.total)} ₽`, { color: '#ffe9a8' });
          if (ev.tip) this.effects.addText(p.x + 10, p.y - 84, `чаевые ${formatMoney(ev.tip)} ₽`, { size: 15, color: '#a8e0b8' });
          this.effects.addSparks(p.x, p.y - 40, 10, { color: '#ffd76a' });
          break;
        case 'fill':
          this.audio.play('fill');
          this.effects.addText(p.x, p.y - 50, `+${ev.units} ед.`, { size: 16, color: '#cfe9d8' });
          this.effects.addSparks(p.x, p.y - 20, 6, { color: '#dcc39a' });
          break;
        case 'pickup':
          this.audio.play('pickup');
          break;
        case 'fine':
          this.audio.play('fine');
          this.effects.addText(p.x, p.y - 70, `−${formatMoney(ev.amount)} ₽`, { color: '#ff9b9b', size: 24 });
          this.effects.addShake(9);
          break;
        case 'refuse':
          this.audio.play(ev.good ? 'good' : 'error');
          this.effects.addText(p.x, p.y - 70, ev.good ? `+${formatMoney(ev.bonus)} ₽ премия` : 'зря отказали',
            { color: ev.good ? '#a8e0b8' : '#ffb4b4' });
          break;
        case 'customer_left':
          this.audio.play('error');
          break;
        case 'id_minor':
          this.audio.play('error');
          this.effects.addText(p.x, p.y - 90, 'НЕТ 18!', { color: '#ff9b9b', size: 22 });
          break;
        case 'dialog':
          this.audio.play('dialog');
          break;
        case 'dialog_result':
          this.audio.play(ev.good ? 'good' : 'error');
          break;
        case 'inspector':
          this.audio.play('inspector');
          break;
        case 'phase':
          this.audio.play('beep');
          break;
        case 'change_ok':
          this.audio.play('coin');
          break;
        case 'change_needed':
          this.audio.play('beep');
          break;
        case 'customer_in':
          this.audio.play('door');
          break;
        case 'crate_arrived':
          break;
        default:
          break;
      }
    }
  }

  /** Контекстная подсказка внизу экрана — вместо отдельного обучения. */
  setContextTip(run) {
    const snap = run.snapshot();
    let tip = null;
    if (snap.current) {
      const c = snap.current;
      const pending = c.pending > 0;
      if (c.changePending) tip = 'Отдайте сдачу: Enter (окно ограничено)';
      else if (pending && c.looksYoung && !c.idChecked && c.basket.some((i) => i.restricted && !i.scanned)) {
        tip = 'Выглядит молодо — проверьте паспорт (F)';
      } else if (pending) tip = 'Пробивайте товар: Space · паспорт: F · отказать в крепком: X';
      else tip = 'Чек собран — завершите продажу: Enter';
    } else if (snap.queue > 0 || snap.outside > 0 || snap.incoming > 0) {
      tip = 'К кассе идёт покупатель — встретьте его у прилавка';
    } else if (snap.carrying) {
      const def = snap.shelfDefs.find((d) => d.id === snap.carrying);
      tip = `Ящик «${def.short}»: несите к полке «${def.title}» и нажмите E`;
    } else if (snap.shelfDefs.some((d) => snap.shelves[d.id].units / snap.shelves[d.id].cap < 0.45)) {
      tip = 'Полки пустеют — возьмите ящик на складе (E)';
    } else if (snap.timeLeft < 30) {
      tip = 'Смена заканчивается — успевайте закрыть очередь';
    }
    this.hud.setTip(tip);
  }

  handleHotkeys() {
    const inp = this.input;

    // Общие для всех экранов клавиши.
    if (inp.pressed('mute')) this.toggleSound();
    if (inp.pressed('pause')) this.onEscape();
    if (inp.pressed('stock')) this.hud.helpOpen = !this.hud.helpOpen;

    switch (this.state) {
      case 'menu':
        if (inp.pressed('confirm')) this.setState('career');
        break;
      case 'career':
        if (inp.pressed('pause')) this.setState('menu');
        break;
      case 'brief':
        if (inp.pressed('confirm')) this.startShift(this.shift);
        break;
      case 'equipment':
      case 'goals':
      case 'help':
        if (inp.pressed('pause')) this.setState('menu');
        break;
      case 'pause':
        if (inp.pressed('confirm')) this.setState('shift');
        if (inp.pressed('restart')) this.startShift(this.shift);
        break;
      case 'results':
        if (inp.pressed('confirm')) this.requestRetry();
        if (inp.pressed('pause')) this.setState('career');
        break;
      case 'shift':
        if (inp.pressed('restart')) { this.startShift(this.shift); return; }
        this.handleShiftKeys();
        break;
      default:
        break;
    }
  }

  handleShiftKeys() {
    const run = this.run;
    if (!run || run.finished) return;
    const inp = this.input;
    if (inp.pressed('answer1')) run.answerDialog(0);
    if (inp.pressed('answer2')) run.answerDialog(1);
    if (inp.pressed('answer3')) run.answerDialog(2);
    if (inp.pressed('action')) {
      run.pressAction();
      if (run.atRegister) this.audio.play('ui');
    }
    if (inp.pressed('scan')) { if (!run.pressScan()) this.audio.play('error'); }
    if (inp.pressed('checkId')) run.pressCheckId();
    if (inp.pressed('refuse')) run.pressRefuse();
    if (inp.pressed('finish')) run.pressEnter();
  }

  onEscape() {
    if (this.hud.helpOpen) { this.hud.helpOpen = false; return; }
    if (this.state === 'shift') {
      this.setState('pause', { snapshot: this.run?.snapshot() ?? null });
    } else if (this.state === 'pause') {
      this.setState('shift', { snapshot: null });
    } else if (['career', 'equipment', 'goals', 'help'].includes(this.state)) {
      this.setState('menu');
    }
  }

  toggleSound() {
    const on = !(this.profile.settings.sfx || this.profile.settings.music);
    this.profile.settings.sfx = on;
    this.profile.settings.music = on;
    this.audio.setSfx(on);
    this.audio.setMusic(on);
    if (on) this.audio.startMusic();
    else this.audio.stopMusic();
    this.hud.toast(on ? 'Звук включён' : 'Звук выключен', 'info', 1.6);
    this.save('sound');
  }

  toggleQuality() {
    this.quality = this.quality === 'high' ? 'light' : 'high';
    this.profile.settings.quality = this.quality;
    this.save('quality');
  }

  // ── Смена ───────────────────────────────────────────────────────────
  openBrief(shift) {
    if (!shiftUnlocked(this.profile, shiftList().findIndex((s) => s.id === shift.id))) return;
    this.setState('brief', {
      shift,
      shelfCount: (shift.venue.id === 'dom' ? 4 : 5),
      record: this.profile.shifts[shift.id] ?? null,
    });
  }

  startShift(shift) {
    if (!shift) return;
    this.shift = shift;
    this.run = new ShiftRun({
      seed: (Date.now() ^ (Math.random() * 1e9)) >>> 0,
      venue: shift.venue,
      shiftId: shift.id,
      shiftName: `${shift.venue.title} · ${shift.name}`,
      duration: shift.duration,
      plan: shift.plan,
      thresholds: shift.thresholds,
      mods: shift.mods,
      upgrades: this.profile.upgrades,
    });
    this.effects = new Effects((Math.random() * 1e6) | 0);
    this.camera.snapTo(this.run.player.x, this.run.player.y);
    this.profile.lastShift = shift.venue.id;
    this.setState('shift', { shift, result: null, reward: null });
    this.audio.startMusic();
    this.platform.gameplayStart();
    this.save('shift-start');
  }

  finishShift() {
    const result = this.run.result ?? this.run.finish('time');
    const before = new Set(unlockedOutfits(this.profile).map((o) => o.id));
    const reward = applyResult(this.profile, result);
    const newOutfits = unlockedOutfits(this.profile)
      .filter((o) => !before.has(o.id))
      .map((o) => ({ id: o.id, name: o.name }));
    this.save('shift-end');
    this.platform.gameplayStop();
    this.setState('results', { result, shift: this.shift, reward: { ...reward, newOutfits } });
  }

  /** «Ещё одна смена»: сначала честно пробуем рекламу, потом играем. */
  async requestRetry() {
    if (this.adPending) return;
    this.adPending = true;
    try {
      const res = await this.platform.showFullscreenAd();
      this.log.push({ t: Date.now(), what: 'ad', res });
    } catch (err) {
      this.log.push({ t: Date.now(), what: 'ad-error', err: err?.message });
    } finally {
      this.adPending = false;
      if (this.shift) this.startShift(this.shift);
    }
  }

  /**
   * Обработка кликов по кнопкам интерфейса. Клик одноразовый: он приходит из
   * update() (clickPending) и тратится здесь, чтобы одно нажатие не сработало
   * дважды, если render() вызовут несколько раз за кадр.
   */
  handleButtons(buttons) {
    const click = this.clickPending;
    if (!click) return;
    this.clickPending = null;
    const { x, y } = click;
    // Кнопки рисуются «сверху вниз», поэтому проверяем в обратном порядке:
    // верхняя и самая свежая получает клик первой.
    for (const b of buttons.slice().reverse()) {
      if (!b.enabled) continue;
      if (x < b.x || x > b.x + b.w || y < b.y || y > b.y + b.h) continue;
      this.activate(b.id);
      return;
    }
  }

  activate(id) {
    if (!id) return;
    this.audio.play('ui');
    if (id.startsWith('goto:')) {
      const target = id.slice(5);
      this.setState(target === 'help' ? 'help' : target);
      return;
    }
    if (id.startsWith('play:')) {
      const shift = shiftList().find((s) => s.id === id.slice(5));
      if (shift) this.startShift(shift);
      return;
    }
    if (id.startsWith('start:') || id.startsWith('brief:')) { return; }
    switch (id) {
      case 'pause': this.setState('pause', { snapshot: this.run?.snapshot() }); break;
      case 'mute': this.toggleSound(); break;
      case 'resume': this.setState('shift', { snapshot: null }); break;
      case 'restart': this.startShift(this.shift); break;
      case 'reload': window.location.reload(); break;
      case 'scan':
        // Пока идёт «пик» сканера, повторное нажатие — не ошибка, а нетерпение.
        if (!this.run?.pressScan() && !this.run?.busy) this.audio.play('error');
        break;
      case 'checkId': this.run?.pressCheckId(); break;
      case 'refuse': this.run?.pressRefuse(); break;
      case 'finish': this.run?.pressEnter(); break;
      case 'answer1': this.run?.answerDialog(0); break;
      case 'answer2': this.run?.answerDialog(1); break;
      case 'answer3': this.run?.answerDialog(2); break;
      case 'toggleSound': this.toggleSound(); break;
      case 'toggleQuality': this.toggleQuality(); break;
      default: break;
    }
    if (id.startsWith('outfit:')) {
      const ok = setOutfit(this.profile, id.slice(7));
      if (ok) this.save('outfit');
      return;
    }
    if (id.startsWith('upgrade:')) {
      const res = buyUpgrade(this.profile, id.slice(8));
      if (res.ok) this.save('upgrade');
      return;
    }
  }

  // ── Отрисовка ───────────────────────────────────────────────────────
  render() {
    const ctx = this.ctx;
    const w = this.viewW;
    const h = this.viewH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#2a2433');
    bg.addColorStop(1, '#161320');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (this.state === 'error') {
      const buttons = this.screens.draw(ctx, 'error', { message: this.stateMessage }, w, h);
      this.handleButtons(buttons);
      return;
    }

    const inShift = this.state === 'shift' || this.state === 'pause' || this.state === 'results';
    if (inShift && this.run) {
      if (this.state === 'results') {
        // Итоги: мир уходит в мягкий фон, чтобы цифры читались.
        ctx.save();
        ctx.globalAlpha = 0.28;
        this.renderWorld(ctx, w, h, this.run, false);
        ctx.restore();
        ctx.fillStyle = 'rgba(16,13,20,0.62)';
        ctx.fillRect(0, 0, w, h);
      } else {
        this.renderWorld(ctx, w, h, this.run, true);
      }
    } else if (this.demoRun) {
      // Живой фон меню: за прилавком работает бот. Размытие не используем —
      // затемнения достаточно, а слабые машины не тратят кадр на фильтр.
      this.renderWorld(ctx, w, h, this.demoRun, false);
      ctx.fillStyle = 'rgba(12,10,16,0.76)';
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.1, w / 2, h * 0.5, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.5)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    if (this.state === 'shift' || this.state === 'pause') {
      if (this.quality === 'high') this.renderLighting(ctx, w, h);
      const soundOn = this.audio.enabledSfx || this.audio.enabledMusic;
      const buttons = this.hud.draw(ctx, this.run, { w, h, soundOn });
      if (this.state === 'shift') { this.handleButtons(buttons); return; }
      if (this.quality === 'high') { /* на паузе интерфейс замирает под окном */ }
    }

    const stateData = this.screenData();
    const buttons = this.screens.draw(ctx, this.state === 'loading' ? 'loading' : this.state, stateData, w, h);
    this.handleButtons(buttons);
  }

  screenData() {
    return {
      profile: this.profile,
      shift: this.shift,
      result: this.result,
      reward: this.reward,
      snapshot: this.snapshot,
      soundOn: this.audio.enabledSfx || this.audio.enabledMusic,
      quality: this.quality,
      message: this.stateMessage,
      shelfCount: this.shift?.venue.id === 'dom' ? 4 : 5,
      record: this.shift ? this.profile.shifts[this.shift.id] : null,
    };
  }

  /** Мир рисуется под камерой; интерфейс — в экранных координатах. */
  renderWorld(ctx, w, h, run, withEffects = true) {
    const venue = VENUES.find((v) => v.id === run.venueId) ?? VENUES[0];
    ctx.save();
    this.camera.apply(ctx, w, h);
    this.world.draw(ctx, run, {
      dt: STEP,
      palette: { ...venue.palette, wall: venue.palette.wall },
      outfit: outfitById(this.profile.outfit),
      night: venue.id === 'route' && this.quality === 'high',
    });
    if (withEffects && this.quality === 'high') this.effects.draw(ctx);
    ctx.restore();
  }

  /** Ночное освещение трассы: затемнение с «окнами» света. */
  renderLighting(ctx, w, h) {
    const venueId = this.run?.venueId;
    if (venueId !== 'route') return;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(120,130,175,1)';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35;
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.45);
    g.addColorStop(0, 'rgba(255,240,200,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

export { STEP, TEXT, SHIFT };
