## world.gd — отрисовка зала, полок, склада, покупателей и Катьме.
##
## Вся графика — процедурная (draw_rect / draw_circle / draw_string):
## в проекте нет ни одной картинки, кроме иконки. Геометрия берётся из
## config.gd, поэтому полки и зоны совпадают с моделью смены.
extends Node2D

const Cfg := preload("res://scripts/config.gd")

var game: Node = null
var t := 0.0

func _process(delta: float) -> void:
	t += delta

func _draw() -> void:
	if game == null or game.run == null:
		return
	var run = game.run
	var venue: Dictionary = Cfg.VENUES.get(run.venue_id, {})
	var offset := Vector2(get_viewport_rect().size.x / 2.0, get_viewport_rect().size.y / 2.0) - game.camera_pos

	# ── Пол зала и склада
	draw_rect(Rect2(Cfg.SHOP_RECT.position + offset, Cfg.SHOP_RECT.size), venue.get("floor", Color("#e7d9c4")))
	var tile := 48.0
	var cols := int(Cfg.SHOP_RECT.size.x / tile) + 1
	var rows := int(Cfg.SHOP_RECT.size.y / tile) + 1
	for ry in rows:
		for cx in cols:
			if (cx + ry) % 2 == 1:
				var r := Rect2(Cfg.SHOP_RECT.position + Vector2(cx * tile, ry * tile) + offset,
					Vector2(minf(tile, Cfg.SHOP_RECT.end.x - (Cfg.SHOP_RECT.position.x + cx * tile)),
							minf(tile, Cfg.SHOP_RECT.end.y - (Cfg.SHOP_RECT.position.y + ry * tile))))
				if r.size.x > 0.0 and r.size.y > 0.0:
					draw_rect(r, Color(1, 1, 1, 0.28))
	draw_rect(Rect2(Cfg.BACK_ROOM_RECT.position + offset, Cfg.BACK_ROOM_RECT.size), Color("#c9c6bd"))

	# ── Стены и вход
	var wall_color := Color("#f2e6d6")
	var wt := 18.0
	draw_rect(Rect2(Cfg.SHOP_RECT.position + Vector2(-wt, -wt) + offset,
		Vector2(Cfg.SHOP_RECT.size.x + wt * 2, wt)), wall_color)
	draw_rect(Rect2(Cfg.SHOP_RECT.position + Vector2(-wt, -wt) + offset,
		Vector2(wt, Cfg.SHOP_RECT.size.y + 40)), wall_color)
	draw_rect(Rect2(Cfg.SHOP_RECT.position + Vector2(Cfg.SHOP_RECT.size.x, -wt) + offset,
		Vector2(wt, Cfg.SHOP_RECT.size.y + 40)), wall_color)
	draw_rect(Rect2(Cfg.BACK_ROOM_RECT.end + Vector2(-Cfg.BACK_ROOM_RECT.size.x - wt, 0) + offset,
		Vector2(Cfg.BACK_ROOM_RECT.size.x + wt * 2, wt)), wall_color)
	# Красная полоса сети над северной стеной.
	draw_rect(Rect2(Cfg.SHOP_RECT.position + Vector2(-wt, -6) + offset,
		Vector2(Cfg.SHOP_RECT.size.x + wt * 2, 8)), Color("#c0273a"))

	# ── Полки и товар
	for id in run.shelves:
		var shelf: Dictionary = run.shelves[id]
		var def: Dictionary = shelf["def"]
		var rect: Rect2 = def["rect"]
		draw_rect(Rect2(rect.position + offset - Vector2(4, 4), rect.size + Vector2(8, 8)), Color("#8d6a4a"))
		draw_rect(Rect2(rect.position + offset, rect.size), Color("#a8815c"))
		var inner := Rect2(rect.position + offset + Vector2(6, 6), rect.size - Vector2(12, 12))
		draw_rect(inner, Color("#5f442e"))
		# Товар: пропорционально заполненности.
		var slots := 12
		var filled := int(round(float(shelf["units"]) / float(shelf["cap"]) * slots))
		for i in slots:
			if i >= filled:
				break
			var cx := i % 4
			var cy := int(i / 4)
			draw_rect(Rect2(inner.position + Vector2(8 + cx * 24, 8 + cy * 26), Vector2(16, 24)),
				def["color"])
		# Полоса заполненности и подпись.
		var bar := Rect2(rect.position + offset + Vector2(4, rect.size.y + 8), Vector2(rect.size.x - 8, 10))
		draw_rect(bar, Color(0, 0, 0, 0.25))
		draw_rect(Rect2(bar.position, Vector2(bar.size.x * float(shelf["units"]) / float(shelf["cap"]), bar.size.y)),
			Color("#7fd6a2") if shelf["units"] > 0 else Color("#e05a5a"))
		draw_string(ThemeDB.fallback_font, rect.position + offset + Vector2(rect.size.x * 0.5 - 34, -12),
			def["short"], HORIZONTAL_ALIGNMENT_CENTER, 80, 13, Color("#ffe9c9"))
		if shelf["units"] <= 2:
			draw_circle(rect.position + offset + Vector2(rect.size.x + 22, 16), 13, Color("#d63b3b"))
			draw_string(ThemeDB.fallback_font, rect.position + offset + Vector2(rect.size.x + 14, 22),
				"!", HORIZONTAL_ALIGNMENT_CENTER, 16, 18, Color.WHITE)

	# ── Склад: ящики
	for src in run.sources:
		var pos: Vector2 = src["pos"] + offset
		draw_rect(Rect2(pos - Vector2(62, 30), Vector2(124, 74)), Color(120, 96, 70, 0.35))
		for i in src["stock"]:
			var bx := pos + Vector2(-50 + i * 56, -24)
			draw_rect(Rect2(bx, Vector2(52, 40)), Color("#c68c4e"))
			draw_rect(Rect2(bx + Vector2(4, 4), Vector2(44, 12)), Color("#e0a866"))
		draw_string(ThemeDB.fallback_font, pos + Vector2(-46, 34), "ящиков: %d" % src["stock"],
			HORIZONTAL_ALIGNMENT_CENTER, 92, 12, Color("#4a3c2a"))

	# ── Прилавок и касса
	draw_rect(Rect2(Cfg.CASHIER_COUNTER.position + offset, Cfg.CASHIER_COUNTER.size), Color("#b98b62"))
	draw_rect(Rect2(Cfg.CASHIER_COUNTER.position + offset + Vector2(6, 6),
		Cfg.CASHIER_COUNTER.size - Vector2(12, 26)), Color("#d8b189"))
	draw_rect(Rect2(Cfg.CASHIER_COUNTER.position + offset + Vector2(24, 12), Vector2(94, 62)), Color("#41474f"))
	draw_rect(Rect2(Cfg.CASHIER_COUNTER.position + offset + Vector2(32, 20), Vector2(78, 22)), Color("#7fd6a2"))
	var reg_plate := Rect2(Cfg.CASHIER_COUNTER.position + Vector2(Cfg.CASHIER_COUNTER.size.x - 120, -26) + offset,
		Vector2(110, 28))
	draw_rect(reg_plate, Color("#c0273a"))
	draw_string(ThemeDB.fallback_font, reg_plate.position + Vector2(55, 19), "КАССА",
		HORIZONTAL_ALIGNMENT_CENTER, 110, 16, Color("#fff5f2"))

	# ── Покупатели в очереди
	for i in run.customers.size():
		var c: Dictionary = run.customers[i]
		var slot: Vector2 = Cfg.QUEUE_SLOTS[mini(i, Cfg.QUEUE_SLOTS.size() - 1)] + offset
		draw_circle(slot + Vector2(0, -6), 17, Color("#4f6b8a"))
		draw_circle(slot + Vector2(0, -30), 12, Color("#e8b98f"))
		# Кольцо терпения.
		var ratio: float = clampf(c["patience"] / maxf(1.0, c["patience_max"]), 0.0, 1.0)
		var color := Color("#7fd6a2") if ratio > 0.5 else (Color("#e8c25a") if ratio > 0.25 else Color("#e05a5a"))
		draw_arc(slot + Vector2(0, -52), 17.0, -PI / 2, -PI / 2 + TAU * ratio, 24, color, 4.0)
		draw_string(ThemeDB.fallback_font, slot + Vector2(-60, -66), c["title"],
			HORIZONTAL_ALIGNMENT_CENTER, 120, 11, Color("#f4efe8"))

	# ── Катьме
	var p: Vector2 = run.player_pos + offset
	draw_circle(p + Vector2(0, 14), 12, Color(0, 0, 0, 0.25))
	draw_rect(Rect2(p + Vector2(-16, -12), Vector2(32, 34)), Color("#f5f1ea"))
	draw_rect(Rect2(p + Vector2(-13, -8), Vector2(26, 26)), Color("#b8352f"))
	draw_circle(p + Vector2(0, -24), 12, Color("#f6cda6"))
	draw_rect(Rect2(p + Vector2(-12, -36), Vector2(24, 10)), Color("#b8542b"))
	if run.carrying != "":
		draw_rect(Rect2(p + Vector2(-26, -68), Vector2(52, 34)), Color("#c68c4e"))
		draw_string(ThemeDB.fallback_font, p + Vector2(-26, -44), run.carrying.to_upper(),
			HORIZONTAL_ALIGNMENT_CENTER, 52, 11, Color("#432c12"))
