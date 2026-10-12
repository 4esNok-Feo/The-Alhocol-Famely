/**
 * util.js — мелкие утилиты: детерминированный генератор случайных чисел,
 * геометрия, форматирование русских чисел и подписи для единиц времени.
 *
 * Генератор обязателен: и симулятор, и тесты должны воспроизводить одну и ту
 * же смену по одному и тому же зерну.
 */

/** mulberry32 — быстрый детерминированный PRNG с 32-битным состоянием. */
export function makeRng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (min, max) => Math.floor(rng() * (max - min + 1)) + min;
  rng.range = (min, max) => min + rng() * (max - min);
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  /** Взвешенный выбор: weights — массив чисел той же длины, что items. */
  rng.weighted = (items, weights) => {
    let total = 0;
    for (const w of weights) total += w;
    let r = rng() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };
  /** Перемешивание Фишера — Йетса, чтобы реплики не повторялись по кругу. */
  rng.shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  return rng;
}

export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

/** Внутри ли точка прямоугольника (rect в формате {x,y,w,h}). */
export function inRect(px, py, rect) {
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

export function rectCenter(rect) {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * Разрешение столкновений круга с прямоугольником: двигаем игрока наружу по
 * оси наименьшего проникновения. Возвращает исправленную позицию.
 */
export function resolveCircleRect(px, py, radius, rect) {
  const cx = clamp(px, rect.x, rect.x + rect.w);
  const cy = clamp(py, rect.y, rect.y + rect.h);
  const dx = px - cx;
  const dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > radius * radius) return { x: px, y: py, hit: false };

  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const push = radius - d;
    return { x: px + (dx / d) * push, y: py + (dy / d) * push, hit: true };
  }
  // Центр внутри прямоугольника — выталкиваем по ближайшей стороне.
  const left = px - rect.x;
  const right = rect.x + rect.w - px;
  const top = py - rect.y;
  const bottom = rect.y + rect.h - py;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: rect.x - radius, y: py, hit: true };
  if (m === right) return { x: rect.x + rect.w + radius, y: py, hit: true };
  if (m === top) return { x: px, y: rect.y - radius, hit: true };
  return { x: px, y: rect.y + rect.h + radius, hit: true };
}

/** Плавное сближение (экспоненциальное), удобно для счётчиков интерфейса. */
export function approach(current, target, rate, dt) {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** 12345 → «12 345»: узкий неразрывный пробел как разделитель разрядов. */
export function formatMoney(value) {
  const n = Math.round(value);
  const sign = n < 0 ? '−' : '';
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function formatTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Русские окончания: 1 звезда, 2 звезды, 5 звёзд. */
export function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export const starsWord = (n) => plural(n, 'звезда', 'звезды', 'звёзд');
export const rubWord = (n) => plural(n, 'рубль', 'рубля', 'рублей');
export const trickWord = (n) => plural(n, 'позиция', 'позиции', 'позиций');

/** Глубокая копия простых структур (для снимков состояния в тестах). */
export function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepClone(v);
    return out;
  }
  return value;
}
