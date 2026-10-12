/**
 * effects.js — всплывающие числа, искры, следы и тряска камеры.
 * Все эффекты живут в мировых координатах и исчезают сами.
 */

import { clamp, makeRng } from '../core/util.js';
import { text } from './draw2d.js';

export class Effects {
  constructor(seed = 7) {
    this.texts = [];
    this.sparks = [];
    this.rings = [];
    this.shake = 0;
    this.rng = makeRng(seed);
    this.maxTexts = 60;
  }

  /** Всплывающая подпись: «+420 ₽», «штраф 1 800 ₽», «спасибо!» и т.п. */
  addText(x, y, str, opts = {}) {
    if (this.texts.length > this.maxTexts) this.texts.shift();
    this.texts.push({
      x, y, str,
      color: opts.color ?? '#ffffff',
      stroke: opts.stroke ?? 'rgba(20,18,25,0.75)',
      size: opts.size ?? 20,
      life: opts.life ?? 1.5,
      ttl: opts.life ?? 1.5,
      vy: opts.vy ?? -46,
      vx: opts.vx ?? this.rng.range(-8, 8),
      weight: opts.weight ?? '700',
    });
  }

  /** Разлёт искр (искры кассы, пыль от бега, снежинки премии). */
  addSparks(x, y, count, opts = {}) {
    for (let i = 0; i < count; i++) {
      const ang = opts.angle !== undefined
        ? opts.angle + this.rng.range(-0.9, 0.9)
        : this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(opts.speedMin ?? 40, opts.speedMax ?? 120);
      this.sparks.push({
        x, y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed - (opts.lift ?? 20),
        life: opts.life ?? 0.6,
        ttl: opts.life ?? 0.6,
        size: this.rng.range(opts.sizeMin ?? 2, opts.sizeMax ?? 4.5),
        color: opts.color ?? '#ffd76a',
        gravity: opts.gravity ?? 120,
      });
    }
  }

  addRing(x, y, opts = {}) {
    this.rings.push({
      x, y,
      radius: opts.radius ?? 10,
      maxRadius: opts.maxRadius ?? 60,
      life: opts.life ?? 0.5,
      ttl: opts.life ?? 0.5,
      color: opts.color ?? 'rgba(255,255,255,0.7)',
      width: opts.width ?? 3,
    });
  }

  addShake(power) {
    this.shake = Math.min(18, this.shake + power);
  }

  update(dt) {
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.x += t.vx * dt;
      t.vy *= 1 - 1.6 * dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);

    for (const s of this.sparks) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += s.gravity * dt;
      s.vx *= 1 - 1.8 * dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);

    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);

    this.shake = Math.max(0, this.shake - dt * 26);
  }

  draw(ctx) {
    ctx.save();
    for (const r of this.rings) {
      const k = 1 - r.life / r.ttl;
      ctx.globalAlpha = clamp(1 - k, 0, 1) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius + (r.maxRadius - r.radius) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const s of this.sparks) {
      const a = clamp(s.life / s.ttl, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (0.4 + a * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const a = clamp(t.life / t.ttl, 0, 1);
      const pop = t.ttl - t.life < 0.12 ? 1 + (0.12 - (t.ttl - t.life)) * 5 : 1;
      ctx.globalAlpha = Math.min(1, a * 1.6);
      text(ctx, t.str, t.x, t.y, {
        size: t.size * pop, weight: t.weight, align: 'center',
        color: t.color, stroke: t.stroke, strokeWidth: 4,
      });
    }
    ctx.restore();
  }
}

export class Camera {
  constructor() {
    this.x = 560;
    this.y = 470;
    this.zoom = 1;
    this.targetZoom = 1;
    this.minZoom = 0.62;
    this.follow = 5.2;
    this.bounds = { x: 0, y: 0, w: 1120, h: 1000 };
  }

  resize(viewW, viewH, world) {
    // Подбираем приближение так, чтобы в кадр попадала приличная часть зала,
    // но персонаж не превращался в точку на широких экранах.
    const z = clamp(Math.min(viewW / 1500, viewH / 900) * 1.35, 0.62, 1.35);
    this.targetZoom = z;
    if (!this._init) { this.zoom = z; this._init = true; }
    if (world) this.bounds = world;
  }

  snapTo(x, y) {
    this.x = x;
    this.y = y;
  }

  update(dt, targetX, targetY, viewW, viewH, shake = 0) {
    // Ведём камеру чуть впереди по направлению движения — так виднее очередь.
    const k = 1 - Math.exp(-this.follow * dt);
    this.x += (targetX - this.x) * k;
    this.y += (targetY - this.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * (1 - Math.exp(-3 * dt));

    const halfW = viewW / 2 / this.zoom;
    const halfH = viewH / 2 / this.zoom;
    const b = this.bounds;
    const minX = b.x + halfW;
    const maxX = b.x + b.w - halfW;
    const minY = b.y + halfH;
    const maxY = b.y + b.h - halfH;
    this.x = minX < maxX ? clamp(this.x, minX, maxX) : b.x + b.w / 2;
    this.y = minY < maxY ? clamp(this.y, minY, maxY) : b.y + b.h / 2;

    if (shake > 0.05) {
      this.x += (Math.random() - 0.5) * shake * 0.5;
      this.y += (Math.random() - 0.5) * shake * 0.5;
    }
  }

  apply(ctx, viewW, viewH) {
    ctx.translate(viewW / 2, viewH / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.x, -this.y);
  }
}
