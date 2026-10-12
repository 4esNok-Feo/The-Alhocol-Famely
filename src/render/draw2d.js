/**
 * draw2d.js — примитивы рисования поверх Canvas 2D.
 *
 * Стиль игры — «уютный 2D-изометрия сверху»: тёплые тона, мягкие тени,
 * аккуратные скругления. Ни одной внешней картинки: всё рисуется кодом,
 * поэтому игра весит десятки килобайт и мгновенно грузится.
 */

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function fillRound(ctx, x, y, w, h, r, color) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

export function strokeRound(ctx, x, y, w, h, r, color, width = 2) {
  roundRect(ctx, x, y, w, h, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Мягкая эллиптическая тень под объектом. */
export function shadow(ctx, x, y, rx, ry, alpha = 0.18) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#1b1b22';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Тень с размытием (в браузерах без filter остаётся обычная). */
export function softShadow(ctx, x, y, rx, ry, alpha = 0.22) {
  ctx.save();
  if (typeof ctx.filter === 'string') ctx.filter = 'blur(6px)';
  shadow(ctx, x, y, rx, ry, alpha);
  ctx.restore();
}

export function vgrad(ctx, x, y, w, h, top, bottom) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}

export function text(ctx, str, x, y, opts = {}) {
  const {
    size = 16, weight = '600', align = 'left', baseline = 'alphabetic',
    color = '#2b2b33', stroke = null, strokeWidth = 3, font = 'system',
    letterSpacing = 0,
  } = opts;
  ctx.save();
  ctx.font = `${weight} ${size}px ${fontFamily(font)}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  if (letterSpacing && 'letterSpacing' in ctx) ctx.letterSpacing = `${letterSpacing}px`;
  if (stroke) {
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

const FONT_FAMILIES = {
  system: '"DejaVu Sans", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  display: '"DejaVu Sans", "Segoe UI Semibold", Roboto, Arial, sans-serif',
  mono: '"DejaVu Sans Mono", "SFMono-Regular", Consolas, monospace',
};

export function fontFamily(kind) {
  return FONT_FAMILIES[kind] ?? FONT_FAMILIES.system;
}

export function measure(ctx, str, size = 16, weight = '600', font = 'system') {
  ctx.save();
  ctx.font = `${weight} ${size}px ${fontFamily(font)}`;
  const w = ctx.measureText(str).width;
  ctx.restore();
  return w;
}

/** Обрезка текста по ширине с многоточием. */
export function fitText(ctx, str, maxWidth, size, weight = '600', font = 'system') {
  ctx.save();
  ctx.font = `${weight} ${size}px ${fontFamily(font)}`;
  if (ctx.measureText(str).width <= maxWidth) { ctx.restore(); return str; }
  let out = str;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
  ctx.restore();
  return `${out}…`;
}

/** Текст по центру нескольких строк. */
export function paragraph(ctx, lines, x, y, lineHeight, opts = {}) {
  lines.forEach((line, i) => text(ctx, line, x, y + i * lineHeight, opts));
}

export function star(ctx, cx, cy, r, color = '#f7c948', strokeColor = '#8a6a12') {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = cx + Math.cos(ang) * rad;
    const py = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.16);
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.restore();
}

/**
 * Знак вымышленной сети «ВИНОГРАД» — гроздь винограда, нарисованная кодом.
 * Используется на вывеске в меню, на фартуке Катьме и в промо-материалах.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x  центр ягод (не включая листок)
 * @param {number} y  верх грозди
 * @param {number} r  радиус одной ягоды
 */
export function grapes(ctx, x, y, r) {
  ctx.save();
  const berries = [
    [-1, 0], [1, 0],
    [-1.6, 1.1], [0, 1.15], [1.6, 1.1],
    [-0.8, 2.2], [0.8, 2.2],
    [0, 3.1],
  ];
  for (const [bx, by] of berries) {
    ctx.beginPath();
    ctx.arc(x + bx * r, y + by * r, r * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = '#6a4a91';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + bx * r - r * 0.2, y + by * r - r * 0.25, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fill();
  }
  // Хвостик и листок.
  ctx.strokeStyle = '#5f7a3a';
  ctx.lineWidth = Math.max(1, r * 0.28);
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.5);
  ctx.lineTo(x + r * 0.1, y - r * 1.5);
  ctx.stroke();
  ctx.fillStyle = '#4f8a45';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.85, y - r * 1.15, r * 0.8, r * 0.42, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function progressBar(ctx, x, y, w, h, ratio, colors) {
  const r = Math.min(h / 2, 8);
  fillRound(ctx, x, y, w, h, r, colors.track ?? 'rgba(0,0,0,0.18)');
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped > 0.001) {
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, colors.from ?? '#61c46a');
    g.addColorStop(1, colors.to ?? '#2f8f4f');
    fillRound(ctx, x, y, Math.max(h, w * clamped), h, r, g);
  }
  if (colors.gloss) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    fillRound(ctx, x + 1, y + 1, Math.max(h, w * clamped) - 2, h * 0.42, r * 0.8, '#ffffff');
    ctx.restore();
  }
}

/** Иконки интерфейса рисуются векторно — они не зависят от шрифтов. */
export function icon(ctx, name, cx, cy, size, color = '#2b2b33') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, size * 0.11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = size / 2;
  switch (name) {
    case 'clock':
      ctx.beginPath(); ctx.arc(0, 0, s * 0.92, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -s * 0.5); ctx.lineTo(0, 0); ctx.lineTo(s * 0.42, s * 0.22); ctx.stroke();
      break;
    case 'coin':
      ctx.beginPath(); ctx.arc(0, 0, s * 0.9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.45); ctx.lineTo(s * 0.2, -s * 0.45); ctx.moveTo(0, -s * 0.45); ctx.lineTo(0, s * 0.45);
      ctx.moveTo(-s * 0.28, s * 0.45); ctx.lineTo(s * 0.28, s * 0.45); ctx.stroke();
      break;
    case 'star':
      star(ctx, 0, 0, s, color, 'rgba(0,0,0,0.25)');
      break;
    case 'cart':
      ctx.beginPath();
      ctx.moveTo(-s * 0.8, -s * 0.6); ctx.lineTo(-s * 0.45, -s * 0.6); ctx.lineTo(-s * 0.1, s * 0.15);
      ctx.lineTo(s * 0.75, s * 0.15); ctx.lineTo(s * 0.9, -s * 0.35); ctx.lineTo(-s * 0.3, -s * 0.35);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * 0.05, s * 0.6, s * 0.14, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(s * 0.6, s * 0.6, s * 0.14, 0, Math.PI * 2); ctx.fill();
      break;
    case 'box':
      ctx.beginPath(); ctx.rect(-s * 0.8, -s * 0.5, s * 1.6, s * 1.15); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.8, -s * 0.1); ctx.lineTo(s * 0.8, -s * 0.1); ctx.stroke();
      break;
    case 'heart':
      ctx.beginPath();
      ctx.moveTo(0, s * 0.85);
      ctx.bezierCurveTo(-s * 1.5, -s * 0.35, -s * 0.45, -s * 1.25, 0, -s * 0.35);
      ctx.bezierCurveTo(s * 0.45, -s * 1.25, s * 1.5, -s * 0.35, 0, s * 0.85);
      ctx.fill();
      break;
    case 'bolt':
      ctx.beginPath();
      ctx.moveTo(-s * 0.25, -s); ctx.lineTo(s * 0.35, -s * 0.1); ctx.lineTo(-s * 0.05, -s * 0.1);
      ctx.lineTo(s * 0.2, s); ctx.lineTo(-s * 0.4, s * 0.05); ctx.lineTo(s * 0.02, s * 0.05);
      ctx.closePath(); ctx.fill();
      break;
    case 'pause':
      fillRound(ctx, -s * 0.55, -s * 0.8, s * 0.4, s * 1.6, 2, color);
      fillRound(ctx, s * 0.15, -s * 0.8, s * 0.4, s * 1.6, 2, color);
      break;
    case 'play':
      ctx.beginPath(); ctx.moveTo(-s * 0.45, -s * 0.75); ctx.lineTo(s * 0.75, 0); ctx.lineTo(-s * 0.45, s * 0.75);
      ctx.closePath(); ctx.fill();
      break;
    case 'check':
      ctx.beginPath(); ctx.moveTo(-s * 0.75, 0); ctx.lineTo(-s * 0.15, s * 0.6); ctx.lineTo(s * 0.8, -s * 0.6); ctx.stroke();
      break;
    case 'lock':
      ctx.beginPath(); ctx.rect(-s * 0.7, -s * 0.1, s * 1.4, s * 1.05); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, -s * 0.1, s * 0.45, Math.PI, 0); ctx.stroke();
      break;
    case 'idcard':
      ctx.beginPath(); ctx.rect(-s * 0.85, -s * 0.6, s * 1.7, s * 1.2); ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * 0.4, -s * 0.16, s * 0.2, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-s * 0.75, s * 0.4); ctx.lineTo(-s * 0.05, s * 0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s * 0.15, -s * 0.2); ctx.lineTo(s * 0.65, -s * 0.2);
      ctx.moveTo(s * 0.15, s * 0.15); ctx.lineTo(s * 0.65, s * 0.15); ctx.stroke();
      break;
    default:
      ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

/** Виньетка по краям кадра — добавляет уюта и фокуса. */
export function vignette(ctx, w, h, strength = 0.28) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(12,10,16,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Вспышка на весь экран (штраф, срыв, звезда). */
export function flash(ctx, w, h, color, alpha) {
  if (alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(0.85, alpha);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
