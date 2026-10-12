## config.gd — баланс Godot-версии.
##
## Числа синхронизированы с браузерной версией (src/core/config.js), чтобы
## правка баланса в одном месте оставалась осмысленной. Здесь только данные,
## без логики: вся механика — в run_model.gd.
extends RefCounted
class_name KatmeConfig

const WORLD_SIZE := Vector2(1120, 1000)
const SHOP_RECT := Rect2(60, 210, 1000, 490)
const BACK_ROOM_RECT := Rect2(60, 736, 1000, 200)
const DOORWAY_RECT := Rect2(470, 700, 150, 36)

const PLAYER := {
	"speed": 232.0,
	"carry_speed_mul": 0.72,
	"radius": 17.0,
	"spawn": Vector2(780, 300),
}

## Полки: id, подпись, цвет, прямоугольник, точка подхода, ёмкость, наличие.
const SHELVES := [
	{"id": "beer", "title": "Пиво и сидр", "short": "ПИВО", "color": Color("#c79a3f"),
	 "rect": Rect2(152, 250, 118, 190), "stand": Vector2(308, 345), "cap": 12, "start": 8, "venues": ["dom", "street", "route"]},
	{"id": "strong", "title": "Крепкое", "short": "КРЕПКОЕ", "color": Color("#8e3a44"),
	 "rect": Rect2(152, 500, 118, 180), "stand": Vector2(308, 590), "cap": 10, "start": 7, "venues": ["dom", "street", "route"]},
	{"id": "snacks", "title": "Снеки", "short": "СНЕКИ", "color": Color("#c46a2e"),
	 "rect": Rect2(300, 228, 250, 74), "stand": Vector2(425, 330), "cap": 12, "start": 9, "venues": ["dom", "street", "route"]},
	{"id": "drinks", "title": "Вода и энергетики", "short": "НАПИТКИ", "color": Color("#2f8296"),
	 "rect": Rect2(640, 228, 260, 74), "stand": Vector2(770, 330), "cap": 12, "start": 8, "venues": ["dom", "street", "route"]},
	{"id": "fresh", "title": "Хлеб и молочка", "short": "СВЕЖЕЕ", "color": Color("#8fb5d6"),
	 "rect": Rect2(938, 250, 118, 190), "stand": Vector2(900, 345), "cap": 12, "start": 9, "venues": ["street", "route"]},
]

const CRATE_SOURCES := [
	{"shelf": "beer", "pos": Vector2(150, 890), "label": "пиво", "venues": ["dom", "street", "route"]},
	{"shelf": "strong", "pos": Vector2(420, 890), "label": "крепкое", "venues": ["dom", "street", "route"]},
	{"shelf": "snacks", "pos": Vector2(690, 890), "label": "снеки", "venues": ["dom", "street", "route"]},
	{"shelf": "drinks", "pos": Vector2(930, 890), "label": "напитки", "venues": ["dom", "street", "route"]},
	{"shelf": "fresh", "pos": Vector2(930, 774), "label": "свежее", "venues": ["street", "route"]},
]

const CRATE := {
	"refill_seconds": 9.0,
	"stock_max": 3,
	"pick_seconds": 0.55,
	"fill_seconds": 1.15,
	"units_per_case": 6,
	"stand_distance": 62.0,
}

const CASHIER_ZONE := Rect2(690, 352, 300, 104)
const CASHIER_COUNTER := Rect2(676, 470, 330, 104)
const QUEUE_SLOTS := [Vector2(742, 636), Vector2(862, 636), Vector2(972, 636)]

## Товары: id, название, полка, цена, крепкое (нужен паспорт), вес выбора.
const ITEMS := [
	{"id": "lager", "name": "Пиво «Солодовое» 0,5 л", "shelf": "beer", "price": 89, "restricted": true, "weight": 22},
	{"id": "cider", "name": "Сидр «Яблочный» 0,45 л", "shelf": "beer", "price": 119, "restricted": true, "weight": 12},
	{"id": "vodka", "name": "Водка «Северная» 0,5 л", "shelf": "strong", "price": 449, "restricted": true, "weight": 9},
	{"id": "tincture", "name": "Настойка «Клюква» 0,5 л", "shelf": "strong", "price": 379, "restricted": true, "weight": 7},
	{"id": "energy", "name": "Энергетик «Разряд» 0,45 л", "shelf": "drinks", "price": 139, "restricted": true, "weight": 8},
	{"id": "water", "name": "Вода «Родник» 1,5 л", "shelf": "drinks", "price": 45, "restricted": false, "weight": 9},
	{"id": "kvass", "name": "Квас «Хлебный» 1 л", "shelf": "drinks", "price": 79, "restricted": false, "weight": 5},
	{"id": "chips", "name": "Чипсы «Хрусть» 90 г", "shelf": "snacks", "price": 99, "restricted": false, "weight": 10},
	{"id": "nuts", "name": "Орешки «К морю» 80 г", "shelf": "snacks", "price": 84, "restricted": false, "weight": 8},
	{"id": "fish", "name": "Сухарики «К пиву» 70 г", "shelf": "snacks", "price": 59, "restricted": false, "weight": 7},
	{"id": "bread", "name": "Хлеб «Деревенский» 400 г", "shelf": "fresh", "price": 54, "restricted": false, "weight": 8},
	{"id": "milk", "name": "Молоко 3,2% 0,9 л", "shelf": "fresh", "price": 89, "restricted": false, "weight": 7},
	{"id": "yogurt", "name": "Йогурт «Ягодный» 290 г", "shelf": "fresh", "price": 64, "restricted": false, "weight": 5},
	{"id": "cheese", "name": "Сыр «Костромской» 200 г", "shelf": "fresh", "price": 219, "restricted": false, "weight": 5},
]

const ECONOMY := {
	"scan_seconds": 0.42,
	"base_tip": 0.06,
	"quick_serve_seconds": 22.0,
	"refuse_bonus": 25,
	"fine_minor": 1800,
	"leave_rating_hit": 8.0,
	"change_window": 3.6,
	"change_bonus": 0.05,
}

const STRESS := {
	"start": 8.0,
	"per_waiting_customer": 0.9,
	"extra_per_customer": 0.55,
	"quiet_decay": 1.15,
	"on_sale": -3.1,
	"on_fill": -1.6,
	"on_leave": 7.0,
	"on_fine": 14.0,
}

const RATING := {
	"start": 82.0,
	"empty_shelf_hit": 5.0,
	"happy_sale": 1.1,
	"perfect_serve": 1.8,
}

## Покупатели: интервал, терпение, размер чека, вес по фазам.
const CUSTOMERS := [
	{"id": "regular", "title": "Обычный покупатель", "patience": 31.0, "items": [1, 2],
	 "weights": [34, 30, 25], "age": [24, 62], "speed": 62.0, "restricted_chance": 0.45},
	{"id": "teen", "title": "Подозрительный подросток", "patience": 27.0, "items": [2, 3],
	 "weights": [17, 21, 23], "age": [15, 21], "speed": 74.0, "restricted_chance": 0.5},
	{"id": "soul", "title": "Душа компании", "patience": 47.0, "items": [3, 4],
	 "weights": [16, 14, 12], "age": [28, 58], "speed": 52.0, "restricted_chance": 0.4},
	{"id": "rusher", "title": "Торопыга", "patience": 15.0, "items": [1, 1],
	 "weights": [16, 18, 20], "age": [25, 55], "speed": 96.0, "restricted_chance": 0.6},
	{"id": "scandal", "title": "Скандалист", "patience": 33.0, "items": [2, 3],
	 "weights": [9, 10, 12], "age": [30, 66], "speed": 58.0, "restricted_chance": 0.3},
]

const PHASES := [
	{"name": "Утро", "spawn_every": 7.6, "price_mul": 1.0},
	{"name": "Час пик", "spawn_every": 5.4, "price_mul": 1.05},
	{"name": "Вечерняя загрузка", "spawn_every": 4.6, "price_mul": 1.1},
]

const SHIFT := {
	"duration": 180.0,
	"phase_length": 60.0,
	"max_queue": 3,
}

## Девять смен карьеры (совпадают с браузерной версией).
const SHIFT_PLAN := [
	{"venue": "dom", "index": 0, "duration": 150.0, "name": "Смена 1 · Утро",
	 "plan": 3300, "thresholds": [3300, 4200, 5200], "flow_mul": 1.12, "price_mul": 0.95},
	{"venue": "dom", "index": 1, "duration": 180.0, "name": "Смена 2 · День",
	 "plan": 4100, "thresholds": [3900, 4900, 5900], "flow_mul": 1.0, "price_mul": 1.0},
	{"venue": "dom", "index": 2, "duration": 180.0, "name": "Смена 3 · Вечер",
	 "plan": 6100, "thresholds": [5400, 6800, 8200], "flow_mul": 0.88, "price_mul": 1.06, "basket_mul": 1.3},
	{"venue": "street", "index": 0, "duration": 165.0, "name": "Смена 1 · Открытие",
	 "plan": 3600, "thresholds": [4100, 5200, 6300], "flow_mul": 1.1, "price_mul": 0.95},
	{"venue": "street", "index": 1, "duration": 180.0, "name": "Смена 2 · Час пик",
	 "plan": 4800, "thresholds": [4800, 6000, 7200], "flow_mul": 1.0, "price_mul": 1.0},
	{"venue": "street", "index": 2, "duration": 180.0, "name": "Смена 3 · Пятница",
	 "plan": 6300, "thresholds": [5600, 7000, 8400], "flow_mul": 0.88, "price_mul": 1.06, "basket_mul": 1.3},
	{"venue": "route", "index": 0, "duration": 165.0, "name": "Смена 1 · Ночь",
	 "plan": 3600, "thresholds": [4900, 6000, 7100], "flow_mul": 1.14, "price_mul": 0.98},
	{"venue": "route", "index": 1, "duration": 180.0, "name": "Смена 2 · Перед рассветом",
	 "plan": 5900, "thresholds": [5800, 7300, 8800], "flow_mul": 1.0, "price_mul": 1.04},
	{"venue": "route", "index": 2, "duration": 180.0, "name": "Смена 3 · Закрытие",
	 "plan": 6600, "thresholds": [5900, 7400, 8900], "flow_mul": 0.88, "price_mul": 1.08, "basket_mul": 1.3},
]

const VENUES := {
	"dom": {"title": "«АЛОЕ&БЕЛОЕ У ДОМА»", "place": "Кировск, Садовая 12", "accent": Color("#c0273a"), "floor": Color("#e7d9c4"), "flow_mul": 1.0, "patience_mul": 1.0},
	"street": {"title": "«АЛОЕ&БЕЛОЕ НА МОСТОВОЙ»", "place": "Вологда, Мостовая 4", "accent": Color("#b3541e"), "floor": Color("#dfd7c8"), "flow_mul": 0.92, "patience_mul": 0.95},
	"route": {"title": "«АЛОЕ&БЕЛОЕ 24/7 НА ТРАССЕ»", "place": "Трасса М-8, 214 км", "accent": Color("#2c5f8a"), "floor": Color("#d6d2c9"), "flow_mul": 0.84, "patience_mul": 0.9},
}

const RANKS := ["Стажёр", "Продавец", "Старший продавец", "Завмаг", "Директор магазина", "Легенда сети"]

## Готовые списки полок/источников для адреса.
static func shelves_for(venue: String) -> Array:
	var out := []
	for shelf in SHELVES:
		if venue in shelf["venues"]:
			out.append(shelf)
	return out

static func sources_for(venue: String) -> Array:
	var out := []
	for src in CRATE_SOURCES:
		if venue in src["venues"]:
			out.append(src)
	return out

static func item_by_id(id: String) -> Dictionary:
	for item in ITEMS:
		if item["id"] == id:
			return item
	return {}
