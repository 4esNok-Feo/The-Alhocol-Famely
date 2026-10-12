/**
 * config.js — единая точка правды для баланса игры.
 *
 * Здесь нет логики, только данные: размеры зала, скорости, цены, типы
 * покупателей, смены карьеры, косметика и тексты интерфейса.
 * Любой модуль игры читает баланс отсюда, поэтому правка числа в этом файле
 * меняет поведение сразу во всём проекте (и в тестах, и в симуляторе).
 */

/** Логический размер игрового мира в юнитах (1 юнит ≈ 1 пиксель при zoom 1). */
export const WORLD = {
  width: 1120,
  height: 1000,
  // Торговый зал сверху, склад снизу — между ними стена с проёмом.
  shop: { x: 60, y: 210, w: 1000, h: 490 },
  wallThickness: 18,
  backRoom: { x: 60, y: 736, w: 1000, h: 200 },
  doorway: { x: 470, y: 700, w: 150, h: 36 }, // проём между залом и складом
  entrance: { x: 0, y: 360, w: 60, h: 120 }, // вход для покупателей слева
  spawnPoint: { x: -40, y: 420 },
  exitPoint: { x: -60, y: 420 },
};

/** Кассовая зона: где должна стоять Катьме, чтобы обслуживать очередь. */
export const CASHIER = {
  zone: { x: 690, y: 352, w: 300, h: 104 },
  counter: { x: 676, y: 470, w: 330, h: 104 },
  queueSlots: [
    { x: 742, y: 636 },
    { x: 862, y: 636 },
    { x: 972, y: 636 },
  ],
  /** Точка, из которой покупатель подходит к первой свободной позиции. */
  approach: { x: 300, y: 636 },
};

/** Стойки-полки. У каждой — своя группа товаров и точка подхода. */
export const SHELVES = [
  {
    id: 'beer', title: 'Пиво и сидр', short: 'ПИВО', color: '#c79a3f',
    rect: { x: 152, y: 250, w: 118, h: 190 }, stand: { x: 308, y: 345 },
    cap: 12, start: 8,
  },
  {
    id: 'strong', title: 'Крепкое', short: 'КРЕПКОЕ', color: '#8e3a44',
    rect: { x: 152, y: 500, w: 118, h: 180 }, stand: { x: 308, y: 590 },
    cap: 10, start: 7,
  },
  {
    id: 'snacks', title: 'Снеки', short: 'СНЕКИ', color: '#c46a2e',
    rect: { x: 300, y: 228, w: 250, h: 74 }, stand: { x: 425, y: 330 },
    cap: 12, start: 9,
  },
  {
    id: 'drinks', title: 'Вода и энергетики', short: 'НАПИТКИ', color: '#2f8296',
    rect: { x: 640, y: 228, w: 260, h: 74 }, stand: { x: 770, y: 330 },
    cap: 12, start: 8,
  },
  {
    id: 'fresh', title: 'Хлеб и молочка', short: 'СВЕЖЕЕ', color: '#8fb5d6',
    rect: { x: 938, y: 250, w: 118, h: 190 }, stand: { x: 900, y: 345 },
    cap: 12, start: 9, venueOnly: ['street', 'route'],
  },
];

/** Ящики на складе: каждый источник восстанавливается со временем. */
export const CRATE_SOURCES = [
  { shelf: 'beer', x: 150, y: 890, label: 'пиво' },
  { shelf: 'strong', x: 420, y: 890, label: 'крепкое' },
  { shelf: 'snacks', x: 690, y: 890, label: 'снеки' },
  { shelf: 'drinks', x: 930, y: 890, label: 'напитки' },
  { shelf: 'fresh', x: 930, y: 774, label: 'свежее', venueOnly: ['street', 'route'] },
];

export const CRATE = {
  refillSeconds: 9,    // сколько растёт запас ящиков на складе
  stockMax: 3,         // сколько ящиков можно взять «про запас»
  pickSeconds: 0.55,   // время подхвата ящика
  fillSeconds: 1.15,   // время выкладки ящика на полку
  unitsPerCase: 6,     // сколько единиц товара даёт один ящик
  standDistance: 62,   // на каком расстоянии считается «у полки»
};

export const PLAYER = {
  speed: 232,
  carrySpeedMul: 0.72,   // с ящиком в руках Катьме идёт медленнее
  radius: 17,
  accelerate: 1900,
  friction: 1500,
  dashMultiplier: 1.62,  // «второе дыхание» на Shift
  dashDrainPerSec: 34,
  dashRegenPerSec: 16,
  dashMinToStart: 18,
};

/**
 * Товары: цена, группа полки, признак «крепкого» (нужен паспорт) и вес —
 * как часто товар вообще попадает в корзину. Веса заданы по группам так,
 * чтобы средний чек не зависел от числа полок в магазине.
 */
export const ITEMS = [
  { id: 'lager', name: 'Пиво «Солодовое» 0,5 л', shelf: 'beer', price: 89, restricted: true, weight: 22 },
  { id: 'cider', name: 'Сидр «Яблочный» 0,45 л', shelf: 'beer', price: 119, restricted: true, weight: 12 },
  { id: 'vodka', name: 'Водка «Северная» 0,5 л', shelf: 'strong', price: 449, restricted: true, weight: 9 },
  { id: 'tincture', name: 'Настойка «Клюква» 0,5 л', shelf: 'strong', price: 379, restricted: true, weight: 7 },
  { id: 'energy', name: 'Энергетик «Разряд» 0,45 л', shelf: 'drinks', price: 139, restricted: true, weight: 8 },
  { id: 'water', name: 'Вода «Родник» 1,5 л', shelf: 'drinks', price: 45, restricted: false, weight: 9 },
  { id: 'kvass', name: 'Квас «Хлебный» 1 л', shelf: 'drinks', price: 79, restricted: false, weight: 5 },
  { id: 'chips', name: 'Чипсы «Хрусть» 90 г', shelf: 'snacks', price: 99, restricted: false, weight: 10 },
  { id: 'nuts', name: 'Орешки «К морю» 80 г', shelf: 'snacks', price: 84, restricted: false, weight: 8 },
  { id: 'fish', name: 'Сухарики «К пиву» 70 г', shelf: 'snacks', price: 59, restricted: false, weight: 7 },
  { id: 'bread', name: 'Хлеб «Деревенский» 400 г', shelf: 'fresh', price: 54, restricted: false, weight: 8 },
  { id: 'milk', name: 'Молоко 3,2% 0,9 л', shelf: 'fresh', price: 89, restricted: false, weight: 7 },
  { id: 'yogurt', name: 'Йогурт «Ягодный» 290 г', shelf: 'fresh', price: 64, restricted: false, weight: 5 },
  { id: 'cheese', name: 'Сыр «Костромской» 200 г', shelf: 'fresh', price: 219, restricted: false, weight: 5 },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/**
 * Адреса отличаются не только оформлением: у крупных магазинов появляется
 * пятая полка «Свежее», плотнее поток и выше цены. Так смена на трассе
 * действительно сложнее, а не просто «дороже по цифрам».
 */
export const VENUE_PROFILE = {
  dom: { flowMul: 1.0, patienceMul: 1.0, priceMul: 1.0, inspectors: 1 },
  street: { flowMul: 0.92, patienceMul: 0.95, priceMul: 1.03, inspectors: 1 },
  route: { flowMul: 0.84, patienceMul: 0.9, priceMul: 1.05, inspectors: 2 },
};

/** Полки и ящики конкретного адреса. */
export function shelvesFor(venueId) {
  return SHELVES.filter((s) => !s.venueOnly || s.venueOnly.includes(venueId));
}

export function crateSourcesFor(venueId) {
  return CRATE_SOURCES.filter((c) => !c.venueOnly || c.venueOnly.includes(venueId));
}

/** Экономика смены. */
export const ECONOMY = {
  scanSeconds: 0.42,        // время одного «пика» сканера
  baseTip: 0.06,            // доля чека, которую дают за быстрое обслуживание
  quickServeSeconds: 22,    // обслужен быстрее — считается «быстрая касса»
  refuseBonus: 25,          // премия за отказ подростку без паспорта (премия магазина)
  refuseXp: 14,
  fineMinor: 1800,          // штраф за продажу несовершеннолетнему
  fineCheck: 900,           // штраф при проверке (недостача/претензия)
  leaveRatingHit: 8,        // рейтинг за ушедшего покупателя
  leaveStress: 7,
  cleanServeXp: 4,
  saleXp: 3,
  shiftXp: 90,
  rankStep: 2500,           // опыт на одно повышение
  changeWindow: 3.6,        // окно на «отдать сдачу»
  changeBonus: 0.05,        // доля чека за сдачу
};

/** Стресс Катьме: 100 — нервный срыв и конец смены. */
export const STRESS = {
  start: 8,
  perWaitingCustomer: 0.9,   // в секунду за каждого ждущего
  extraPerCustomer: 0.55,     // добавка за каждого следующего в очереди
  soulAuraPerSec: 1.25,       // «Душа компании» болтает и выматывает
  onSale: -3.1,               // успешная продажа успокаивает
  onFill: -1.6,               // выкладка ящика успокаивает
  onLeave: 7,
  onFine: 14,
  quietDecay: 1.15,            // когда никого нет
  phaseBump: 2.5,             // начало новой фазы смены
  collapseGrace: 4.0,         // сколько секунд можно держать стресс на максимуме
  radioPerSec: 0.9,           // с включённым радио стресс падает быстрее
};

export const RATING = {
  start: 82,
  emptyShelfPerCustomer: 5,   // пришёл, а товара нет
  happySale: 1.1,
  perfectServe: 1.8,
  overtimeWait: 2.4,          // за каждого, кто прождал больше половины терпения
  inspectorGood: 9,
  inspectorBad: -12,
};

/**
 * Покупатели. `patience` — секунды ожидания, `items` — диапазон позиций в чеке,
 * `weights` — вероятность появления в фазах смены (утро / час пик / вечер).
 */
export const CUSTOMERS = [
  {
    id: 'regular', title: 'Обычный покупатель', patience: 31, items: [1, 2],
    weights: [34, 30, 25], ageRange: [24, 62], speed: 132,
    palette: { coat: '#4f6b8a', skin: '#e8b98f', hair: '#3b2b22', pants: '#333a45' },
    lines: ['Спасибо, до свидания!', 'Хорошего дня.', 'Мне ещё пакет, пожалуйста.'],
  },
  {
    id: 'teen', title: 'Подозрительный подросток', patience: 27, items: [2, 3],
    weights: [17, 21, 23], ageRange: [15, 21], speed: 158,
    palette: { coat: '#2f7c6f', skin: '#f0c39c', hair: '#20232b', pants: '#2a2f3a' },
    lines: ['«Мне, эм, просто сидр…»', 'Паспорт? А зачем…', 'Да мне уже есть восемнадцать!'],
  },
  {
    id: 'soul', title: 'Душа компании', patience: 47, items: [3, 4],
    weights: [16, 14, 12], ageRange: [28, 58], speed: 112, chatty: true,
    palette: { coat: '#a8503f', skin: '#e6ae83', hair: '#4a3324', pants: '#40352c' },
    lines: ['А помнишь, как в прошлую пятницу…', 'Слушай, а ты с нами на рыбалку?', 'Давай ещё и закуску!'],
  },
  {
    id: 'rusher', title: 'Торопыга', patience: 15, items: [1, 1],
    weights: [16, 18, 20], ageRange: [25, 55], speed: 205,
    palette: { coat: '#3b4d7a', skin: '#eec1a0', hair: '#2b2b30', pants: '#2d3340' },
    lines: ['Быстрее, автобус!', 'Сдачи не надо!', 'Мне только чекушку.'],
  },
  {
    id: 'scandal', title: 'Скандалист', patience: 33, items: [2, 3],
    weights: [9, 10, 12], ageRange: [30, 66], speed: 124, scandal: true,
    palette: { coat: '#7b3b52', skin: '#dfa982', hair: '#5a4530', pants: '#3a2f38' },
    lines: ['А почему ценник другой?!', 'У вас тут всё просрочено!', 'Жалобную книгу давайте!'],
  },
  {
    id: 'inspector', title: 'Тайный покупатель', patience: 14, items: [1, 1],
    weights: [8, 6, 6], ageRange: [30, 50], speed: 150, inspector: true, queueSlot: false,
    palette: { coat: '#4a4a52', skin: '#e3b795', hair: '#8c8c93', pants: '#35353c' },
    lines: ['Я просто посмотрю.', 'Интересно у вас тут…'],
  },
];

export const CUSTOMER_BY_ID = Object.fromEntries(CUSTOMERS.map((c) => [c.id, c]));

/** Диалоги скандалиста: правильная реплика приносит спокойствие и очки. */
export const SCANDAL_DIALOGS = [
  {
    line: 'А почему ценник другой?!',
    options: [
      { text: 'Проверю полку и поправлю ценник', good: true },
      { text: 'Это не я ценник вешал', good: false, hit: 4 },
      { text: 'Так и должно быть', good: false, hit: 6 },
    ],
  },
  {
    line: 'У вас тут всё просрочено!',
    options: [
      { text: 'Обменяю товар или верну деньги', good: true },
      { text: 'Сроки проверяет не кассир', good: false, hit: 4 },
      { text: 'Вы сами просрочили', good: false, hit: 7 },
    ],
  },
  {
    line: 'Жалобную книгу давайте!',
    options: [
      { text: 'Записываю обращение и передам завмагу', good: true },
      { text: 'Книга есть, но не для вас', good: false, hit: 6 },
      { text: 'Куда вы пойдёте с жалобой', good: false, hit: 8 },
    ],
  },
  {
    line: 'Тут очередь, а вы полки ходите!',
    options: [
      { text: 'Простите, уже бегу на кассу', good: true },
      { text: 'Смена одна, идите в другой магазин', good: false, hit: 5 },
      { text: 'Обратитесь к администратору', good: false, hit: 6 },
    ],
  },
];

/**
 * Фазы смены: от спокойного утра к вечернему ажиотажу.
 *
 * Интервалы подобраны по замеру: обслуживание одного покупателя (проверка
 * паспорта, 2–4 позиции в чеке, сдача, завершение) занимает у игрока 6–9
 * секунд, а ещё часть смены уходит на ящики. Поэтому даже в вечерней фазе
 * покупатель приходит не чаще, чем раз в 7–8 секунд: очередь должна
 * разбираться, иначе смена превращается в бесконечный аврал.
 */
export const PHASES = [
  { id: 'morning', name: 'Утро', spawnEvery: 12.0, jitter: 0.3, priceMul: 1.0 },
  { id: 'rush', name: 'Час пик', spawnEvery: 9.8, jitter: 0.26, priceMul: 1.05 },
  { id: 'night', name: 'Вечерняя загрузка', spawnEvery: 8.2, jitter: 0.22, priceMul: 1.1 },
];

/** Версия сборки: используется в диагностике и в документации. */
export const VERSION = '1.0.0';

export const SHIFT = {
  duration: 180,            // секунды смены
  phaseLength: 60,          // длина фазы
  inspectorAt: [54, 128],   // окно, когда заходит тайный покупатель
  inspectorRepeat: 86,
  maxQueue: 3,
};

/** Карьера: три адреса по три смены. */
export const VENUES = [
  {
    id: 'dom', title: '«ВИНОГРАД У ДОМА»', place: 'Кировск, Садовая 12',
    flow: 1.0, targetRefusals: 3,
    brief: 'Малый формат: одна касса, четыре полки, вход слева. План дня — 5 200 ₽.',
    palette: { floor: '#e7d9c4', wall: '#f2e6d6', accent: '#3f7a45' },
  },
  {
    id: 'street', title: '«ВИНОГРАД НА МОСТОВОЙ»', place: 'Вологда, Мостовая 4',
    flow: 0.92, targetRefusals: 5,
    brief: 'Средний формат: две кассы, поток с улицы, вечером приходит проверка.',
    palette: { floor: '#dfd7c8', wall: '#eef0f3', accent: '#4b7a3d' },
  },
  {
    id: 'route', title: '«ВИНОГРАД 24/7 НА ТРАССЕ»', place: 'Трасса М-8, 214 км',
    flow: 0.84, targetRefusals: 7,
    brief: 'Круглосуточный магазин у трассы: ночная смена, дальнобойщики, плотные очереди.',
    palette: { floor: '#d6d2c9', wall: '#e4e8ec', accent: '#6a4a91' },
  },
];

/**
 * Девять смен карьеры — «сердце» прогрессии.
 *
 *   plan        — план по выручке, ₽ (мягкая цель: считается отдельно)
 *   thresholds  — пороги итога смены для 1/2/3 звёзд.
 *                 Выставлены по замерам ботов (tools/simulate.js): сильный
 *                 бот берёт 3★ примерно в половине прогонов, слабый — обычно
 *                 1–2★. Пороги не должны быть недостижимыми: смена «на 3★»
 *                 обязана быть реальной, но требовать почти безошибочной игры.
 *   flowMul     — плотность потока покупателей (меньше — приходят чаще)
 *   priceMul    — наценка смены
 *   basketMul   — размер средней закупки
 *
 * Числа подобраны по прогонам симулятора (node tools/simulate.js): порог
 * трёх звёзд соответствует аккуратной смене внимательного продавца, одна
 * звезда — спокойной смене без провала. Поздние смены дают больше выручки
 * не «потому что так написано», а за счёт плотного потока и крупных чеков.
 */
export const SHIFT_PLAN = [
  { venue: 'dom', index: 0, duration: 150, name: 'Смена 1 · Утро',
    plan: 3400, thresholds: [3400, 4400, 5300], flowMul: 1.12, priceMul: 0.95 },
  { venue: 'dom', index: 1, duration: 180, name: 'Смена 2 · День',
    plan: 4300, thresholds: [4300, 5600, 6600], flowMul: 1.0, priceMul: 1.0 },
  { venue: 'dom', index: 2, duration: 180, name: 'Смена 3 · Вечер',
    plan: 5200, thresholds: [5200, 6800, 8000], flowMul: 0.88, priceMul: 1.06, basketMul: 1.3 },
  { venue: 'street', index: 0, duration: 165, name: 'Смена 1 · Открытие',
    plan: 3700, thresholds: [3700, 4800, 5700], flowMul: 1.1, priceMul: 0.95 },
  { venue: 'street', index: 1, duration: 180, name: 'Смена 2 · Час пик',
    plan: 4400, thresholds: [4400, 5700, 6600], flowMul: 1.0, priceMul: 1.0 },
  { venue: 'street', index: 2, duration: 180, name: 'Смена 3 · Пятница',
    plan: 5100, thresholds: [5100, 6500, 7700], flowMul: 0.88, priceMul: 1.06, basketMul: 1.3 },
  { venue: 'route', index: 0, duration: 165, name: 'Смена 1 · Ночь',
    plan: 3900, thresholds: [3900, 5100, 6000], flowMul: 1.14, priceMul: 0.98 },
  { venue: 'route', index: 1, duration: 180, name: 'Смена 2 · Перед рассветом',
    plan: 4100, thresholds: [4100, 5300, 6200], flowMul: 1.0, priceMul: 1.04 },
  { venue: 'route', index: 2, duration: 180, name: 'Смена 3 · Закрытие',
    plan: 5300, thresholds: [5300, 6900, 7900], flowMul: 0.88, priceMul: 1.08, basketMul: 1.3 },
];
/** Косметика: меняет цвет фартука, бейджа и ленты. Без влияния на баланс. */
export const OUTFITS = [
  { id: 'shift', name: '«Смена»', aprons: ['#2f6b3f'], badge: '#f4d35e', ribbon: '#f2f2f2', stars: 0 },
  { id: 'prazdnik', name: '«Праздник»', aprons: ['#2f8f6f'], badge: '#f4d35e', ribbon: '#ffe9a8', stars: 3 },
  { id: 'kotik', name: '«Котик»', aprons: ['#4a6fae'], badge: '#ffd9e2', ribbon: '#ffffff', stars: 6 },
  { id: 'noch', name: '«Ночная смена»', aprons: ['#3b3f52'], badge: '#8fd3ff', ribbon: '#c9d6ff', stars: 10 },
  { id: 'zavmag', name: '«Завмаг»', aprons: ['#8a5a2b'], badge: '#ffe08a', ribbon: '#f6e9c9', stars: 14 },
  { id: 'legenda', name: '«Легенда сети»', aprons: ['#c0273a', '#f4f4f4'], badge: '#ffd700', ribbon: '#ffe9a8', stars: 18 },
];

/** Звания по опыту (опыт на звание задан в ECONOMY.rankStep). */
export const RANKS = [
  'Стажёр', 'Продавец', 'Старший продавец', 'Завмаг', 'Директор магазина', 'Легенда сети',
];

/** Улучшения покупаются только за выручку внутри смены — это часть тактики. */
export const UPGRADES = [
  { id: 'sneakers', name: 'Кроссовки', desc: '+12% к скорости Катьме', cost: 900, stars: 2 },
  { id: 'scanner', name: 'Сканер 2.0', desc: 'Сканирование на 25% быстрее', cost: 1200, stars: 3 },
  { id: 'radio', name: 'Радио на складе', desc: 'Стресс падает заметно быстрее', cost: 800, stars: 1 },
  { id: 'gloves', name: 'Перчатки', desc: 'Ящик несётся легче, выкладка быстрее', cost: 1100, stars: 4 },
  { id: 'thermos', name: 'Термос', desc: 'Выручка и чаевые +6%', cost: 1400, stars: 6 },
];

export const KEYS_HELP = [
  ['WASD / ← ↑ → ↓', 'Движение Катьме по залу и складу'],
  ['E', 'Взять ящик, встать за кассу, открыть диалог'],
  ['Space', 'Пробить товар по штрихкоду'],
  ['F', 'Проверить паспорт'],
  ['X', 'Убрать «крепкое» из чека'],
  ['Enter', 'Завершить чек / основное действие в меню'],
  ['Shift', 'Второе дыхание: короткий рывок'],
  ['M', 'Весь звук вкл./выкл.'],
  ['Esc', 'Пауза'],
  ['R', 'Начать смену заново'],
];

export const TEXT = {
  title: 'Катьме: Смена',
  subtitle: 'ВИНОГРАД — магазин у дома',
  tagline: 'Расставь товар, отбей очередь и доживи до конца смены.',
};
