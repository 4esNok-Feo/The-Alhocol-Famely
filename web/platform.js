/**
 * platform.js — единственное место, где игра общается с Яндекс Играми.
 *
 * Правила:
 *  • игра полностью работает без SDK (локальный предпросмотр, тесты);
 *  • ни один вызов платформы не может «уронить» игру — всё в try/catch;
 *  • собственный интервал показа рекламы — не чаще, чем раз в 90 секунд,
 *    и только по нажатию «Ещё одна смена» после экрана итогов;
 *  • сохранение всегда сначала локальное, потом облачное.
 *
 * Ключ localStorage: katme.profile.v1 — облачное поле: katme.
 */

import { CLOUD_FIELD, STORAGE_KEY } from '../src/core/career.js';

const AD_COOLDOWN_MS = 90 * 1000;

export class Platform {
  constructor() {
    this.sdk = null;
    this.player = null;
    this.ready = false;
    this.available = false;
    this.lang = 'ru';
    this.lastAdAt = 0;
    this.adInFlight = false;
    this.pauseHandlers = [];
    this.resumeHandlers = [];
    this.adAttempts = 0;
    this.adShows = 0;
    this.cloudDirty = false;
    this.environment = null;
  }

  static get isInYandex() {
    return typeof window !== 'undefined' && typeof window.YaGames !== 'undefined';
  }

  /** Инициализация SDK. Вызывается один раз при старте игры. */
  async init() {
    if (!Platform.isInYandex) {
      this.available = false;
      return { available: false, reason: 'no-sdk' };
    }
    try {
      this.sdk = await window.YaGames.init();
      this.available = true;
      this.environment = this.sdk.environment ?? null;
      this.lang = this.sdk.environment?.i18n?.lang ?? 'ru';
      try {
        this.sdk.features?.LoadingAPI?.ready?.();
      } catch { /* необязательно */ }

      // Пауза платформы (реклама, свёрнутая вкладка, смена аккаунта).
      try {
        if (typeof this.sdk.on === 'function') {
          this.sdk.on('game_api_pause', () => this.pauseHandlers.forEach((f) => f('platform')));
          this.sdk.on('game_api_resume', () => this.resumeHandlers.forEach((f) => f('platform')));
        }
      } catch { /* события не критичны */ }

      try {
        this.player = await this.sdk.getPlayer({ scopes: false });
      } catch (err) {
        console.warn('[platform] игрок недоступен, работаем гостём:', err?.message);
      }
      this.ready = true;
      return { available: true, lang: this.lang, loggedIn: !!this.player };
    } catch (err) {
      console.warn('[platform] SDK не инициализировался:', err?.message);
      this.available = false;
      return { available: false, reason: err?.message };
    }
  }

  onPause(fn) { this.pauseHandlers.push(fn); }
  onResume(fn) { this.resumeHandlers.push(fn); }

  /** Адаптер хранилища для career.loadProfile/saveProfile. */
  get storage() {
    if (typeof localStorage !== 'undefined') {
      return {
        getItem: (k) => localStorage.getItem(k),
        setItem: (k, v) => {
          localStorage.setItem(k, v);
          this.cloudDirty = true;
          this.pushCloudSoon();
        },
        removeItem: (k) => localStorage.removeItem(k),
      };
    }
    const memory = new Map();
    return {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => memory.set(k, v),
      removeItem: (k) => memory.delete(k),
    };
  }

  /** Локальное сохранение прочитано всегда; облако — поверх, с слиянием. */
  async loadCloud() {
    if (!this.player) return null;
    try {
      const data = await this.player.getData([CLOUD_FIELD]);
      return data?.[CLOUD_FIELD] ?? null;
    } catch (err) {
      console.warn('[platform] облако недоступно:', err?.message);
      return null;
    }
  }

  pushCloudSoon() {
    // Облако пишем с задержкой, чтобы не дёргать SDK на каждое изменение.
    if (this._cloudTimer || !this.ready) return;
    this._cloudTimer = setTimeout(() => {
      this._cloudTimer = null;
      this.pushCloud();
    }, 2500);
  }

  async pushCloud(profile) {
    const prof = profile ?? this.currentProfile;
    if (!this.player || !prof) return false;
    try {
      await this.player.setData({ [CLOUD_FIELD]: prof }, true);
      this.cloudDirty = false;
      return true;
    } catch (err) {
      console.warn('[platform] не удалось записать облако:', err?.message);
      return false;
    }
  }

  /** Игровой процесс начался/остановился — подсказка платформе. */
  gameplayStart() {
    try { this.sdk?.features?.GameplayAPI?.start?.(); } catch { /* необязательно */ }
  }

  gameplayStop() {
    try { this.sdk?.features?.GameplayAPI?.stop?.(); } catch { /* необязательно */ }
  }

  /**
   * Полноэкранная реклама. Запрашивается ТОЛЬКО после финиша по кнопке
   * «Ещё одна смена». Возвращает промис, который резолвится в любом случае:
   * платформа может не показать рекламу, и игра обязана продолжиться.
   */
  showFullscreenAd() {
    return new Promise((resolve) => {
      const now = Date.now();
      this.adAttempts++;
      if (!this.available || !this.sdk?.adv) { resolve({ shown: false, reason: 'no-sdk' }); return; }
      if (this.adInFlight) { resolve({ shown: false, reason: 'busy' }); return; }
      if (now - this.lastAdAt < AD_COOLDOWN_MS) { resolve({ shown: false, reason: 'cooldown' }); return; }
      this.adInFlight = true;
      this.lastAdAt = now;
      let settled = false;
      const done = (res) => {
        if (settled) return;
        settled = true;
        this.adInFlight = false;
        this.resumeHandlers.forEach((f) => f('ad'));
        resolve(res);
      };
      // Страховка: если SDK молчит дольше 12 секунд — продолжаем игру.
      const guard = setTimeout(() => done({ shown: false, reason: 'timeout' }), 12000);
      try {
        this.sdk.adv.showFullscreenAdv({
          callbacks: {
            onOpen: () => { this.adShows++; },
            onClose: (wasShown) => { clearTimeout(guard); done({ shown: !!wasShown }); },
            onError: (err) => { clearTimeout(guard); done({ shown: false, reason: err?.message ?? 'error' }); },
          },
        });
      } catch (err) {
        clearTimeout(guard);
        done({ shown: false, reason: err?.message ?? 'throw' });
      }
    });
  }

  /** Осталось ли время до следующего допустимого показа рекламы. */
  get adCooldownLeft() {
    return Math.max(0, AD_COOLDOWN_MS - (Date.now() - this.lastAdAt));
  }

  /** Отладочная информация для страницы проверки. */
  debugInfo() {
    return {
      sdkAvailable: this.available,
      inYandex: Platform.isInYandex,
      loggedIn: !!this.player,
      lang: this.lang,
      adAttempts: this.adAttempts,
      adShows: this.adShows,
      adCooldownMs: Math.round(this.adCooldownLeft),
      storageKey: STORAGE_KEY,
      cloudField: CLOUD_FIELD,
      localStorage: (() => {
        try { return localStorage.getItem(STORAGE_KEY) !== null; } catch { return false; }
      })(),
    };
  }
}

export const platform = new Platform();
