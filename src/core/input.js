/**
 * input.js — ввод с клавиатуры и мыши.
 *
 * Используются ФИЗИЧЕСКИЕ коды клавиш (event.code), поэтому переключение
 * русской/английской раскладки не меняет управление. Мышь нужна только для
 * кнопок меню и подсказок — все игровые действия доступны с клавиатуры.
 */

const MOVE_MAP = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

const ACTION_MAP = {
  action: ['KeyE'],        // взять ящик / выложить товар / встать за кассу
  scan: ['Space'],         // пробить позицию
  checkId: ['KeyF'],       // проверить паспорт
  refuse: ['KeyX'],        // отказать в продаже крепкого
  finish: ['Enter', 'NumpadEnter'],
  dash: ['ShiftLeft', 'ShiftRight'],
  pause: ['Escape'],
  restart: ['KeyR'],
  mute: ['KeyM'],
  answer1: ['Digit1', 'Numpad1'],
  answer2: ['Digit2', 'Numpad2'],
  answer3: ['Digit3', 'Numpad3'],
  confirm: ['Enter', 'NumpadEnter'],
  stock: ['KeyQ'],         // «Что происходит?» — подсказка-шпаргалка
};

/** Все коды, которые мы перехватываем (чтобы не скроллилась страница). */
const CAPTURED = new Set([
  ...Object.values(MOVE_MAP).flat(), ...Object.values(ACTION_MAP).flat(),
]);

export class InputManager {
  constructor(target = typeof window !== 'undefined' ? window : null) {
    this.target = target;
    this.heldCodes = new Set();
    this.pressedCodes = new Set();
    this.releasedCodes = new Set();
    this.pointer = { x: 0, y: 0, down: false, clicked: false, clickedAt: 0 };
    this.anyKeyThisFrame = false;
    this._bound = false;
    this._handlers = {};
    this.touch = false;
  }

  attach() {
    if (!this.target || this._bound) return;
    this._bound = true;
    const h = this._handlers;
    h.keydown = (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.heldCodes.add(e.code);
      this.pressedCodes.add(e.code);
      this.anyKeyThisFrame = true;
    };
    h.keyup = (e) => {
      if (CAPTURED.has(e.code)) e.preventDefault();
      this.heldCodes.delete(e.code);
      this.releasedCodes.add(e.code);
    };
    h.blur = () => { this.heldCodes.clear(); };
    h.contextmenu = (e) => e.preventDefault();
    this.target.addEventListener('keydown', h.keydown, { passive: false });
    this.target.addEventListener('keyup', h.keyup, { passive: false });
    this.target.addEventListener('blur', h.blur);
    this.target.addEventListener('contextmenu', h.contextmenu);
  }

  detach() {
    if (!this.target || !this._bound) return;
    const h = this._handlers;
    this.target.removeEventListener('keydown', h.keydown);
    this.target.removeEventListener('keyup', h.keyup);
    this.target.removeEventListener('blur', h.blur);
    this.target.removeEventListener('contextmenu', h.contextmenu);
    this._bound = false;
  }

  /** Обновление курсора/касания: игра сама сообщает координаты в юнитах HUD. */
  setPointer(x, y, down = false, clicked = false) {
    this.pointer.x = x;
    this.pointer.y = y;
    if (clicked && !this.pointer.down && down) this.pointer.clickedAt = 1;
    this.pointer.down = down;
    if (clicked) this.pointer.clicked = true;
  }

  /** Одно из действий было нажато в этом кадре? */
  pressed(name) {
    const codes = ACTION_MAP[name] ?? [name];
    return codes.some((c) => this.pressedCodes.has(c));
  }

  released(name) {
    const codes = ACTION_MAP[name] ?? [name];
    return codes.some((c) => this.releasedCodes.has(c));
  }

  held(name) {
    const codes = ACTION_MAP[name] ?? [name];
    return codes.some((c) => this.heldCodes.has(c));
  }

  /** Вектор движения: нормализуется вызывающей стороной. */
  moveVector() {
    const axis = (dirs) => (this.held(dirs[0]) ? 1 : 0) - (this.held(dirs[1]) ? 1 : 0);
    const dx = (this.held(MOVE_MAP.right[0]) || this.held(MOVE_MAP.right[1]) ? 1 : 0)
      - (this.held(MOVE_MAP.left[0]) || this.held(MOVE_MAP.left[1]) ? 1 : 0);
    const dy = (this.held(MOVE_MAP.down[0]) || this.held(MOVE_MAP.down[1]) ? 1 : 0)
      - (this.held(MOVE_MAP.up[0]) || this.held(MOVE_MAP.up[1]) ? 1 : 0);
    return { dx, dy };
  }

  /** Любая клавиша/клик в этом кадре — для экранов «нажмите любую клавишу». */
  get anyInput() {
    return this.pressedCodes.size > 0 || this.pointer.clicked;
  }

  clearFrame() {
    this.pressedCodes.clear();
    this.releasedCodes.clear();
    this.pointer.clicked = false;
    this.anyKeyThisFrame = false;
  }

  /** Горячая подсказка для интерфейса: какие клавиши сейчас нажаты. */
  describeHeld() {
    return [...this.heldCodes].join('+');
  }
}

export { ACTION_MAP, MOVE_MAP };
