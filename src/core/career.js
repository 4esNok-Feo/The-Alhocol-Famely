/**
 * career.js — профиль игрока: звёзды, опыт, звания, кошель «премии»,
 * улучшения, косметика, постоянные цели и слияние сохранений.
 *
 * Ключ локального хранилища — `katme.profile.v1`, облачное поле SDK — `katme`.
 * Слияние сделано «без отката»: опыт, счётчики и кошелёк берутся по максимуму,
 * лучший счёт — максимум, звёзды — объединение, потому что они выдаются один
 * раз и навсегда.
 */

import { ECONOMY, OUTFITS, RANKS, SHIFT_PLAN, UPGRADES, VENUES } from './config.js';
import { clamp, deepClone } from './util.js';

export const STORAGE_KEY = 'katme.profile.v1';
export const CLOUD_FIELD = 'katme';
export const PROFILE_VERSION = 1;

/** Полный список постоянных целей карьеры (18 штук). */
export function careerGoals() {
  const goals = [];
  for (const s of SHIFT_PLAN) {
    const venue = VENUES.find((v) => v.id === s.venue);
    goals.push({
      id: `shift:${s.venue}:${s.index}`,
      kind: 'shift',
      short: `${venue.title} · ${s.name}`,
      title: `Пройти «${s.name}» в ${venue.title}`,
      reward: { xp: 60, wallet: 120 },
    });
  }
  for (const v of VENUES) {
    goals.push({
      id: `venue:${v.id}`,
      kind: 'venue',
      short: `Адрес «${v.title}» — все три смены`,
      title: `Освоить ${v.title}: три смены минимум на одну звезду`,
      reward: { xp: 220, wallet: 400 },
    });
  }
  for (const v of VENUES) {
    const plans = SHIFT_PLAN.filter((s) => s.venue === v.id).reduce((a, s) => a + s.plan, 0);
    const need = Math.round(plans * 0.95 / 100) * 100;
    goals.push({
      id: `cash:${v.id}`,
      kind: 'cash',
      short: `Касса «${v.title}»: ${need} ₽ суммарно`,
      title: `Сумма лучших выручек адреса ${v.title} — ${need} ₽`,
      target: need,
      reward: { xp: 260, wallet: 500 },
    });
  }
  goals.push({
    id: 'all-venues', kind: 'meta', short: 'Все три адреса освоены',
    title: 'Освоить все три адреса сети',
    reward: { xp: 400, wallet: 800 },
  });
  goals.push({
    id: 'clean-nine', kind: 'meta', short: 'Девять смен без штрафов и ушедших',
    title: 'Провести девять смен без штрафов и ушедших покупателей',
    target: 9, reward: { xp: 450, wallet: 900 },
  });
  goals.push({
    id: 'refuse-25', kind: 'meta', short: 'Отказать 25 подросткам без паспорта',
    title: 'Отказать в продаже крепкого 25 несовершеннолетним',
    target: 25, reward: { xp: 380, wallet: 700 },
  });
  return goals;
}

export function defaultProfile() {
  return {
    version: PROFILE_VERSION,
    stars: 0,
    xp: 0,
    wallet: 0,
    shifts: {},
    counters: { shifts: 0, cleanShifts: 0, refusals: 0, fines: 0, served: 0, bestStreak: 0, goals: 0 },
    goals: {},
    upgrades: [],
    outfit: OUTFITS[0].id,
    settings: { sfx: true, music: true, quality: 'high' },
    lastShift: SHIFT_PLAN[0].venue,
    updatedAt: 0,
  };
}

/** Приведение любого (в том числе старого) сохранения к актуальной схеме. */
export function migrate(raw) {
  const base = defaultProfile();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  out.version = PROFILE_VERSION;
  out.settings = { ...base.settings, ...(raw.settings ?? {}) };
  out.counters = { ...base.counters, ...(raw.counters ?? {}) };
  out.shifts = {};
  for (const [id, val] of Object.entries(raw.shifts ?? {})) {
    if (!val || typeof val !== 'object') continue;
    out.shifts[id] = {
      stars: clamp(Math.round(val.stars ?? 0), 0, 3),
      bestScore: Math.max(0, Math.round(val.bestScore ?? 0)),
      bestRevenue: Math.max(0, Math.round(val.bestRevenue ?? 0)),
      bestRating: clamp(Math.round(val.bestRating ?? 0), 0, 100),
      clean: !!val.clean,
      attempts: Math.max(0, Math.round(val.attempts ?? 0)),
    };
  }
  out.upgrades = [...new Set((raw.upgrades ?? []).filter((u) => UPGRADES.some((x) => x.id === u)))];
  out.outfit = OUTFITS.some((o) => o.id === raw.outfit) ? raw.outfit : OUTFITS[0].id;
  out.goals = { ...(raw.goals ?? {}) };
  out.stars = totalStars(out);
  return out;
}

/** Сумма звёзд = сумма лучших результатов по всем сменам. */
export function totalStars(profile) {
  return Object.values(profile.shifts ?? {}).reduce((acc, s) => acc + clamp(s.stars ?? 0, 0, 3), 0);
}

export function rankFor(xp) {
  const idx = clamp(Math.floor(xp / ECONOMY.rankStep), 0, RANKS.length - 1);
  return { index: idx, name: RANKS[idx], next: idx + 1 < RANKS.length ? (idx + 1) * ECONOMY.rankStep : null };
}

export function unlockedOutfits(profile) {
  return OUTFITS.filter((o) => profile.stars >= o.stars);
}

export function nextOutfit(profile) {
  return OUTFITS.find((o) => profile.stars < o.stars) ?? null;
}

export function availableUpgrades(profile) {
  return UPGRADES.map((u) => ({
    ...u,
    unlocked: profile.stars >= u.stars,
    bought: profile.upgrades.includes(u.id),
    affordable: profile.wallet >= u.cost,
  }));
}

/** Смена доступна, если предыдущая пройдена хотя бы на одну звезду. */
export function shiftUnlocked(profile, index) {
  if (index === 0) return true;
  const prev = SHIFT_PLAN[index - 1];
  const rec = profile.shifts[`${prev.venue}:${prev.index}`];
  return !!rec && rec.stars >= 1;
}

export function shiftId(shift) {
  return `${shift.venue}:${shift.index}`;
}

/** Полное описание смены с учётом плана и порогов адреса. */
export function describeShift(shift) {
  const venue = VENUES.find((v) => v.id === shift.venue);
  return {
    id: shiftId(shift),
    venue,
    index: shift.index,
    name: shift.name,
    duration: shift.duration,
    plan: shift.plan,
    thresholds: shift.thresholds.slice(),
    mods: { flowMul: shift.flowMul, priceMul: shift.priceMul, basketMul: shift.basketMul ?? 1 },
    brief: venue.brief,
  };
}

/** Пять случайных звёзд смены (для сид-подбора и стабильности тестов). */
export function shiftList() {
  return SHIFT_PLAN.map(describeShift);
}

// ─────────────────────────────────────────────────────────────────────────
// Применение результата смены
// ─────────────────────────────────────────────────────────────────────────

/**
 * Записывает итог смены в профиль: звёзды только растут, рекорды — максимум,
 * кошелёк и опыт прибавляются, цели и открытия пересчитываются.
 * @returns {{gainStars:number, newGoalIds:string[], xp:number, wallet:number,
 *            rankUp:string|null, unlocked:string[], prevStars:number}}
 */
export function applyResult(profile, result, opts = {}) {
  const prevStars = profile.stars;
  const id = result.shiftId;
  const rec = profile.shifts[id] ?? { stars: 0, bestScore: 0, bestRevenue: 0, bestRating: 0, clean: false, attempts: 0 };
  const gainStars = Math.max(0, result.stars - rec.stars);

  profile.shifts[id] = {
    stars: Math.max(rec.stars, result.stars),
    bestScore: Math.max(rec.bestScore, result.score),
    bestRevenue: Math.max(rec.bestRevenue, result.revenue),
    bestRating: Math.max(rec.bestRating, result.rating),
    clean: rec.clean || result.clean,
    attempts: rec.attempts + 1,
  };
  profile.stars = totalStars(profile);

  profile.counters.shifts += 1;
  profile.counters.served += result.stats.served;
  profile.counters.refusals += result.stats.minorsRefused;
  profile.counters.fines += result.stats.finesCount;
  profile.counters.bestStreak = Math.max(profile.counters.bestStreak, result.stats.bestStreak);
  if (result.clean) profile.counters.cleanShifts += 1;

  // Опыт: итог смены плюс премия за каждую новую звезду.
  const xp = result.xp + gainStars * 40;
  profile.xp += xp;

  // Кошелёк «премии»: 400 ₽ за звезду смены плюс процент от выручки.
  const wallet = Math.round(gainStars * 400 + Math.max(0, result.score) * 0.06);
  profile.wallet += wallet;

  const rankBefore = rankFor(profile.xp - xp).index;
  const rankAfter = rankFor(profile.xp);
  const rankUp = rankAfter.index > rankBefore ? rankAfter.name : null;

  const newGoalIds = evaluateGoals(profile, result);
  for (const gid of newGoalIds) {
    const goal = careerGoals().find((g) => g.id === gid);
    if (!goal) continue;
    profile.xp += goal.reward.xp;
    profile.wallet += goal.reward.wallet;
  }
  profile.counters.goals = Object.keys(profile.goals).length;

  const unlocked = unlockedOutfits(profile).map((o) => o.id);
  profile.updatedAt = opts.now ?? Date.now();

  return { gainStars, newGoalIds, xp, wallet, rankUp, unlocked, prevStars };
}

/** Проверяет цели и помечает новые. Уже отмеченные не считаются повторно. */
export function evaluateGoals(profile, result = null) {
  const done = [];
  const mark = (id) => { if (!profile.goals[id]) { profile.goals[id] = 1; done.push(id); } };

  for (const s of SHIFT_PLAN) {
    const rec = profile.shifts[shiftId(s)];
    if (rec && rec.stars >= 1) mark(`shift:${s.venue}:${s.index}`);
  }
  for (const v of VENUES) {
    const shifts = SHIFT_PLAN.filter((s) => s.venue === v.id);
    const all = shifts.every((s) => (profile.shifts[shiftId(s)]?.stars ?? 0) >= 1);
    if (all) mark(`venue:${v.id}`);
    const sum = shifts.reduce((acc, s) => acc + (profile.shifts[shiftId(s)]?.bestRevenue ?? 0), 0);
    const need = Math.round(SHIFT_PLAN.filter((s) => s.venue === v.id)
      .reduce((a, s) => a + s.plan, 0) * 0.95 / 100) * 100;
    if (sum >= need) mark(`cash:${v.id}`);
  }
  if (VENUES.every((v) => profile.goals[`venue:${v.id}`])) mark('all-venues');
  if (profile.counters.cleanShifts >= 9) mark('clean-nine');
  if (profile.counters.refusals >= 25) mark('refuse-25');
  if (result) profile.counters.goals = Object.keys(profile.goals).length;
  return done;
}

export function buyUpgrade(profile, id) {
  const up = UPGRADES.find((u) => u.id === id);
  if (!up) return { ok: false, reason: 'unknown' };
  if (profile.upgrades.includes(id)) return { ok: false, reason: 'owned' };
  if (profile.stars < up.stars) return { ok: false, reason: 'stars' };
  if (profile.wallet < up.cost) return { ok: false, reason: 'money' };
  profile.wallet -= up.cost;
  profile.upgrades.push(id);
  return { ok: true, upgrade: up };
}

export function setOutfit(profile, id) {
  const outfit = OUTFITS.find((o) => o.id === id);
  if (!outfit || profile.stars < outfit.stars) return false;
  profile.outfit = id;
  return true;
}

export function outfitById(id) {
  return OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
}

// ─────────────────────────────────────────────────────────────────────────
// Сохранение, загрузка, слияние
// ─────────────────────────────────────────────────────────────────────────

/**
 * Загружает профиль через адаптер хранилища.
 * @param {{getItem(f:string):string|null}} storage
 */
export function loadProfile(storage) {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY);
    if (!raw) return defaultProfile();
    return migrate(JSON.parse(raw));
  } catch (err) {
    console.warn('[career] сохранение повреждено, начинаем заново:', err?.message);
    return defaultProfile();
  }
}

export function saveProfile(profile, storage) {
  try {
    storage?.setItem?.(STORAGE_KEY, JSON.stringify(profile));
    return true;
  } catch (err) {
    console.warn('[career] не удалось сохранить профиль:', err?.message);
    return false;
  }
}

/**
 * Слияние двух профилей без отката прогресса:
 * опыт/кошелёк/счётчики — максимум, звёзды и цели — объединение,
 * лучшие счёты — максимум, чистая смена — «или», счётчики опыта — максимум.
 * Так повторные награды за одну и ту же смену не суммируются.
 */
export function mergeProfiles(a, b) {
  const left = migrate(a);
  const right = migrate(b);
  const out = migrate(left);
  out.xp = Math.max(left.xp, right.xp);
  out.wallet = Math.max(left.wallet, right.wallet);
  out.counters = {
    shifts: Math.max(left.counters.shifts, right.counters.shifts),
    cleanShifts: Math.max(left.counters.cleanShifts, right.counters.cleanShifts),
    refusals: Math.max(left.counters.refusals, right.counters.refusals),
    fines: Math.max(left.counters.fines, right.counters.fines),
    served: Math.max(left.counters.served, right.counters.served),
    bestStreak: Math.max(left.counters.bestStreak, right.counters.bestStreak),
    goals: 0,
  };
  for (const [id, v] of Object.entries(right.shifts)) {
    const cur = out.shifts[id];
    if (!cur) { out.shifts[id] = deepClone(v); continue; }
    out.shifts[id] = {
      stars: Math.max(cur.stars, v.stars),
      bestScore: Math.max(cur.bestScore, v.bestScore),
      bestRevenue: Math.max(cur.bestRevenue, v.bestRevenue),
      bestRating: Math.max(cur.bestRating, v.bestRating),
      clean: cur.clean || v.clean,
      attempts: Math.max(cur.attempts, v.attempts),
    };
  }
  out.goals = { ...right.goals, ...left.goals };
  out.upgrades = [...new Set([...left.upgrades, ...right.upgrades])];
  out.stars = totalStars(out);
  out.counters.goals = Object.keys(out.goals).length;
  out.settings = { ...right.settings, ...left.settings };
  out.updatedAt = Math.max(left.updatedAt, right.updatedAt);
  // Косметика: если выбранное не открыто по объединённым звёздам — откатываем.
  const allowed = new Set(unlockedOutfits(out).map((o) => o.id));
  out.outfit = allowed.has(left.outfit) ? left.outfit : OUTFITS[0].id;
  return out;
}

/** Безопасное сохранение профиля, каким его видит облако платформы. */
export function toCloudPayload(profile) {
  return JSON.parse(JSON.stringify(profile));
}

export function goalProgress(profile) {
  const list = careerGoals();
  const shifts = profile.shifts ?? {};
  return list.map((g) => {
    const done = !!profile.goals[g.id];
    let progress = done ? 1 : 0;
    let target = 1;
    if (g.kind === 'shift') {
      const [, venue, idx] = g.id.split(':');
      const rec = shifts[`${venue}:${idx}`];
      progress = rec && rec.stars >= 1 ? 1 : 0;
    } else if (g.kind === 'venue') {
      const venue = g.id.split(':')[1];
      const items = SHIFT_PLAN.filter((s) => s.venue === venue);
      target = items.length;
      progress = items.filter((s) => (shifts[shiftId(s)]?.stars ?? 0) >= 1).length;
    } else if (g.kind === 'cash') {
      const venue = g.id.split(':')[1];
      target = g.target;
      progress = SHIFT_PLAN.filter((s) => s.venue === venue)
        .reduce((acc, s) => acc + (shifts[shiftId(s)]?.bestRevenue ?? 0), 0);
    } else if (g.id === 'clean-nine') {
      target = 9; progress = profile.counters.cleanShifts;
    } else if (g.id === 'refuse-25') {
      target = 25; progress = profile.counters.refusals;
    } else if (g.id === 'all-venues') {
      target = VENUES.length;
      progress = VENUES.filter((v) => profile.goals[`venue:${v.id}`]).length;
    }
    return { ...g, done, progress: Math.min(progress, target), target };
  });
}
