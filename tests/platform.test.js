/**
 * platform.test.js — поведение в отсутствие SDK и корректность сохранений.
 *
 * Главное правило: игра обязана полностью работать без Яндекс SDK, а реклама
 * не может «повесить» смену ни при ошибке, ни при отказе платформы.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// Заглушка localStorage: платформа читает его через адаптер.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { Platform } = await import('../web/platform.js');
const { loadProfile, saveProfile, defaultProfile, STORAGE_KEY } = await import('../src/core/career.js');

test('без SDK игра работает: init возвращает доступность = false', async () => {
  const platform = new Platform();
  const res = await platform.init();
  assert.equal(res.available, false);
  assert.equal(platform.ready, false);
  assert.equal(platform.player, null);
});

test('адаптер хранилища пишет и читает профиль', () => {
  const platform = new Platform();
  store.clear();
  const profile = defaultProfile();
  profile.xp = 1234;
  assert.equal(saveProfile(profile, platform.storage), true);
  assert.ok(store.has(STORAGE_KEY), 'запись попала в localStorage');
  const restored = loadProfile(platform.storage);
  assert.equal(restored.xp, 1234);
});

test('реклама без SDK не показывается и не блокирует игру', async () => {
  const platform = new Platform();
  await platform.init();
  const res = await platform.showFullscreenAd();
  assert.equal(res.shown, false);
  assert.equal(res.reason, 'no-sdk');
  assert.equal(platform.adAttempts, 1);
  assert.equal(platform.adShows, 0);
});

test('свой интервал между показами — не меньше 90 секунд', async () => {
  const platform = new Platform();
  // Имитируем доступный SDK с одной «успешной» рекламой.
  platform.available = true;
  platform.ready = true;
  let shows = 0;
  platform.sdk = {
    adv: {
      showFullscreenAdv: ({ callbacks }) => {
        shows++;
        callbacks.onOpen();
        callbacks.onClose(true);
      },
    },
  };
  const first = await platform.showFullscreenAd();
  assert.equal(first.shown, true);
  assert.equal(shows, 1);
  const second = await platform.showFullscreenAd();
  assert.equal(second.shown, false);
  assert.equal(second.reason, 'cooldown');
  assert.equal(shows, 1, 'второй раз реклама не запрашивается');
  assert.ok(platform.adCooldownLeft > 80 * 1000);
});

test('ошибка SDK в рекламе не мешает продолжить заезд', async () => {
  const platform = new Platform();
  platform.available = true;
  platform.ready = true;
  platform.sdk = {
    adv: {
      showFullscreenAdv: ({ callbacks }) => callbacks.onError(new Error('нет рекламы')),
    },
  };
  const res = await platform.showFullscreenAd();
  assert.equal(res.shown, false);
  assert.equal(platform.adInFlight, false, 'флаг сброшен — следующий заезд доступен');
});

test('исключение внутри SDK тоже перехватывается', async () => {
  const platform = new Platform();
  platform.available = true;
  platform.ready = true;
  platform.lastAdAt = 0;
  platform.sdk = {
    adv: {
      showFullscreenAdv: () => { throw new Error('внезапно'); },
    },
  };
  const res = await platform.showFullscreenAd();
  assert.equal(res.shown, false);
  assert.equal(res.reason, 'внезапно');
});

test('отладочная информация содержит ключи сохранения', async () => {
  const platform = new Platform();
  await platform.init();
  const info = platform.debugInfo();
  assert.equal(info.storageKey, STORAGE_KEY);
  assert.equal(info.cloudField, 'katme');
  assert.equal(info.inYandex, false);
  assert.equal(info.sdkAvailable, false);
});

test('пауза и продолжение платформы дергают обработчики', async () => {
  const platform = new Platform();
  let paused = 0;
  let resumed = 0;
  platform.onPause(() => { paused++; });
  platform.onResume(() => { resumed++; });
  platform.pauseHandlers.forEach((f) => f('test'));
  platform.resumeHandlers.forEach((f) => f('test'));
  assert.equal(paused, 1);
  assert.equal(resumed, 1);
});
