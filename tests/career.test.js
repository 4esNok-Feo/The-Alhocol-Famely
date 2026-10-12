/**
 * career.test.js — прогрессия, сохранения и слияние облака.
 *
 * Ключевые обещания, которые проверяются здесь:
 *  • звёзды никогда не откатываются и не начисляются второй раз;
 *  • смена доступна только после предыдущей;
 *  • старое сохранение не ломает игру (миграция);
 *  • объединение устройств не суммирует повторные награды;
 *  • косметика и улучшения не влияют на скорость и деньги.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyResult, availableUpgrades, buyUpgrade, careerGoals, defaultProfile,
  evaluateGoals, goalProgress, loadProfile, mergeProfiles, migrate, outfitById,
  rankFor, saveProfile, setOutfit, shiftList, shiftUnlocked, toCloudPayload,
  totalStars, unlockedOutfits, STORAGE_KEY,
} from '../src/core/career.js';
import { ECONOMY, OUTFITS, UPGRADES } from '../src/core/config.js';

const shifts = shiftList();

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _data: data,
  };
}

function fakeResult(shift, overrides = {}) {
  return {
    shiftId: shift.id,
    venueId: shift.venue.id,
    shiftName: shift.name,
    reason: 'time',
    timeUsed: shift.duration,
    duration: shift.duration,
    revenue: shift.plan,
    tips: 100,
    bonuses: 0,
    fines: 0,
    ratingBonus: 100,
    cleanBonus: 600,
    score: shift.thresholds[0] + 10,
    stars: 1,
    planMet: true,
    plan: shift.plan,
    thresholds: shift.thresholds,
    rating: 80,
    stress: 20,
    clean: true,
    collapsed: false,
    stats: {
      served: 10, lost: 0, checks: 2, minorsRefused: 1, finesCount: 0, scans: 30,
      crates: 4, fills: 4, unitsSold: 30, maxQueue: 2, cleanServes: 10, cleanStreak: 10,
      bestStreak: 10, emptyShelfMisses: 0, dialogs: 1, dialogsGood: 1, changeOk: 2,
      changeMiss: 0, inspectors: 1,
    },
    xp: 150,
    ...overrides,
  };
}

test('пустое сохранение даёт корректный профиль по умолчанию', () => {
  const profile = loadProfile(fakeStorage());
  assert.equal(profile.stars, 0);
  assert.equal(profile.xp, 0);
  assert.equal(profile.outfit, OUTFITS[0].id);
  assert.deepEqual(profile.shifts, {});
  assert.equal(rankFor(profile.xp).name, 'Стажёр');
});

test('сохранение и загрузка не теряют прогресс', () => {
  const storage = fakeStorage();
  const profile = defaultProfile();
  applyResult(profile, fakeResult(shifts[0]));
  assert.equal(saveProfile(profile, storage), true);
  assert.ok(storage._data.has(STORAGE_KEY));
  const restored = loadProfile(storage);
  assert.equal(restored.stars, profile.stars);
  assert.equal(restored.xp, profile.xp);
  assert.equal(restored.shifts[shifts[0].id].stars, 1);
});

test('повреждённое сохранение не ломает игру', () => {
  const storage = fakeStorage({ [STORAGE_KEY]: '{не json' });
  const profile = loadProfile(storage);
  assert.equal(profile.stars, 0);
  assert.ok(profile.settings);
});

test('миграция старого профиля добавляет новые поля', () => {
  const legacy = {
    // Сохранение «первой версии»: только счётчик монет и один рекорд.
    wallet: 700,
    shifts: { 'dom:0': { bestScore: 4200 } },
    outfit: 'неизвестный-комплект',
  };
  const profile = migrate(legacy);
  assert.equal(profile.version, 1);
  assert.equal(profile.wallet, 700);
  assert.equal(profile.shifts['dom:0'].bestScore, 4200);
  assert.equal(profile.shifts['dom:0'].stars, 0);
  assert.ok(profile.settings.sfx !== undefined);
  assert.equal(profile.outfit, OUTFITS[0].id, 'неизвестный комплект откатывается');
  assert.deepEqual(profile.counters.goals, 0);
});

test('звёзды начисляются один раз и только растут', () => {
  const profile = defaultProfile();
  const shift = shifts[0];
  const first = applyResult(profile, fakeResult(shift, { stars: 1 }));
  assert.equal(first.gainStars, 1);
  assert.equal(profile.stars, 1);
  // Повторный проход с теми же звёздами не даёт новых.
  const second = applyResult(profile, fakeResult(shift, { stars: 1 }));
  assert.equal(second.gainStars, 0);
  assert.equal(profile.stars, 1);
  // Улучшение результата добавляет разницу.
  const third = applyResult(profile, fakeResult(shift, { stars: 3 }));
  assert.equal(third.gainStars, 2);
  assert.equal(profile.stars, 3);
  assert.equal(totalStars(profile), 3);
});

test('смена открывается только после предыдущей', () => {
  const profile = defaultProfile();
  assert.equal(shiftUnlocked(profile, 0), true);
  assert.equal(shiftUnlocked(profile, 1), false);
  applyResult(profile, fakeResult(shifts[0], { stars: 1 }));
  assert.equal(shiftUnlocked(profile, 1), true);
  assert.equal(shiftUnlocked(profile, 2), false);
});

test('опыт повышает звание не чаще, чем раз в шаг', () => {
  const profile = defaultProfile();
  profile.xp = ECONOMY.rankStep * 2 - 10;
  const reward = applyResult(profile, fakeResult(shifts[0], { xp: 400, stars: 3 }));
  assert.ok(reward.rankUp, 'звание повысилось');
  assert.equal(rankFor(profile.xp).name, reward.rankUp);
  assert.ok(rankFor(profile.xp).index >= 2);
});

test('цели карьеры: их 18, и они помечаются один раз', () => {
  const goals = careerGoals();
  assert.equal(goals.length, 18);
  const profile = defaultProfile();
  const newGoals = evaluateGoals(profile);
  assert.equal(newGoals.length, 0, 'с пустым профилем целей нет');
  applyResult(profile, fakeResult(shifts[0], { stars: 2 }));
  const after = evaluateGoals(profile);
  assert.deepEqual(after, [], 'повторно цели не выдаются');
  assert.ok(profile.goals[`shift:${shifts[0].venue.id}:0`]);
  assert.ok(profile.wallet > 0, 'за цель начислена премия');
});

test('прогресс целей считается по рекордам, а не по факту захода', () => {
  const profile = defaultProfile();
  const progress = goalProgress(profile);
  const cashGoal = progress.find((g) => g.id.startsWith('cash:'));
  assert.equal(cashGoal.progress, 0);
  profile.shifts['dom:0'] = { stars: 3, bestScore: 5000, bestRevenue: 4000, bestRating: 90, clean: true, attempts: 2 };
  const after = goalProgress(profile).find((g) => g.id.startsWith('cash:dom'));
  assert.equal(after.progress, 4000);
  assert.ok(after.target > 4000);
});

test('улучшения покупаются за премию и только по звёздам', () => {
  const profile = defaultProfile();
  profile.wallet = 100000;
  const sneakers = UPGRADES.find((u) => u.id === 'sneakers');
  assert.equal(buyUpgrade(profile, 'sneakers').reason, 'stars', 'без звёзд нельзя');
  profile.stars = 12;
  const buy = buyUpgrade(profile, 'sneakers');
  assert.equal(buy.ok, true);
  assert.equal(profile.wallet, 100000 - sneakers.cost);
  assert.equal(buyUpgrade(profile, 'sneakers').reason, 'owned');
  // Список для интерфейса отражает состояние.
  const list = availableUpgrades(profile);
  assert.equal(list.find((u) => u.id === 'sneakers').bought, true);
});

test('косметика открывается звёздами и не влияет на экономику', () => {
  const profile = defaultProfile();
  assert.equal(setOutfit(profile, 'legenda'), false, 'закрытый комплект не надеть');
  profile.stars = 18;
  const unlocked = unlockedOutfits(profile).map((o) => o.id);
  assert.equal(unlocked.length, OUTFITS.length, 'на 18 звёздах открыты все комплекты');
  assert.equal(setOutfit(profile, 'legenda'), true);
  assert.equal(outfitById(profile.outfit).id, 'legenda');
  // Ни один комплект не описывает бонусов к скорости/деньгам.
  for (const o of OUTFITS) {
    assert.deepEqual(Object.keys(o).sort(), ['aprons', 'badge', 'id', 'name', 'ribbon', 'stars']);
  }
});

test('слияние облака и локального профиля не откатывает прогресс', () => {
  const local = defaultProfile();
  const cloud = defaultProfile();
  applyResult(local, fakeResult(shifts[0], { stars: 3, xp: 500 }));
  local.wallet = 900;
  applyResult(cloud, fakeResult(shifts[1], { stars: 1, xp: 900 }));
  cloud.wallet = 1200;

  const merged = mergeProfiles(local, cloud);
  assert.equal(merged.stars, totalStars(merged));
  assert.equal(merged.shifts[shifts[0].id].stars, 3, 'лучший результат первой смены остался');
  assert.equal(merged.shifts[shifts[1].id].stars, 1, 'прогресс второго устройства учтён');
  assert.equal(merged.xp, Math.max(local.xp, cloud.xp));
  assert.equal(merged.wallet, Math.max(local.wallet, cloud.wallet));
});

test('слияние защищает от повторных наград за одну смену', () => {
  const a = defaultProfile();
  const b = defaultProfile();
  applyResult(a, fakeResult(shifts[0], { stars: 2, xp: 300 }));
  applyResult(b, fakeResult(shifts[0], { stars: 2, xp: 300 }));
  const merged = mergeProfiles(a, b);
  // Звёзды и опыт не суммируются: иначе одна смена оплачивалась бы дважды.
  assert.equal(merged.stars, 2);
  assert.equal(merged.xp, Math.max(a.xp, b.xp));
  assert.equal(merged.counters.shifts, Math.max(a.counters.shifts, b.counters.shifts));
  assert.equal(merged.shifts[shifts[0].id].attempts, Math.max(
    a.shifts[shifts[0].id].attempts, b.shifts[shifts[0].id].attempts,
  ));
});

test('облачная нагрузка — обычный JSON без внутренних ссылок', () => {
  const profile = defaultProfile();
  applyResult(profile, fakeResult(shifts[0]));
  const payload = toCloudPayload(profile);
  assert.equal(typeof payload, 'object');
  assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload);
  assert.ok(payload.settings);
});
