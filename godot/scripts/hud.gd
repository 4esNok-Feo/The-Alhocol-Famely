## hud.gd — интерфейс Godot-версии: таймер, план, рейтинг, стресс, полки,
## касса с чеком, подсказки и экраны меню/итогов.
##
## Всё рисуется кодом на Control, поэтому шрифт берётся системный (Godot
## подставляет свой fallback). Кнопки мыши здесь не нужны: управление
## полностью клавиатурное, как и в браузерной версии.
extends Control

const Cfg := preload("res://scripts/config.gd")

var game: Node = null

func _draw() -> void:
	if game == null:
		return
	match game.state:
		game.State.MENU: _draw_menu()
		game.State.CAREER: _draw_career()
		game.State.BRIEF: _draw_brief()
		game.State.SHIFT: _draw_shift()
		game.State.PAUSE: _draw_pause()
		game.State.RESULTS: _draw_results()

func _font() -> Font:
	return ThemeDB.fallback_font

func _text(pos: Vector2, str: String, size: int = 16, color: Color = Color("#f6f1e9"),
		align: int = HORIZONTAL_ALIGNMENT_LEFT, width: float = -1.0) -> void:
	draw_string(_font(), pos, str, align, width if width > 0.0 else -1.0, size, color)

func _panel(rect: Rect2, color: Color = Color(24.0 / 255.0, 20.0 / 255.0, 28.0 / 255.0, 0.84)) -> void:
	draw_rect(rect, color)
	draw_rect(rect, Color(1, 1, 1, 0.12), false, 1.0)

func _bar(rect: Rect2, ratio: float, from: Color, to: Color) -> void:
	draw_rect(rect, Color(0, 0, 0, 0.25))
	var w := rect.size.x * clampf(ratio, 0.0, 1.0)
	if w > 0.5:
		draw_rect(Rect2(rect.position, Vector2(w, rect.size.y)), from.lerp(to, clampf(ratio, 0.0, 1.0)))

func _rub(value: int) -> String:
	return str(value) + " ₽"

# ── Экран смены ─────────────────────────────────────────────────────────
func _draw_shift() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color(0, 0, 0, 0.0))
	var run = game.run
	if run == null:
		return
	var snap: Dictionary = run.snapshot()
	# Верхняя панель.
	_panel(Rect2(12, 12, 232, 54))
	_text(Vector2(26, 46), "%d:%02d" % [int(snap["time_left"]) / 60, int(snap["time_left"]) % 60], 24)
	_text(Vector2(118, 46), "· " + str(snap["phase"]), 13, Color("#bfb6ae"))
	_panel(Rect2(254, 12, 360, 54))
	_text(Vector2(268, 32), "ПЛАН СМЕНЫ", 11, Color("#bfb6ae"))
	_text(Vector2(600, 32), "%s / %s" % [_rub(snap["revenue"]), _rub(snap["plan"])], 15,
		Color("#f6f1e9"), HORIZONTAL_ALIGNMENT_RIGHT)
	_bar(Rect2(268, 40, 336, 12), float(snap["revenue"]) / maxf(1.0, float(snap["plan"])),
		Color("#e8b44a"), Color("#c98f3a"))
	_panel(Rect2(size.x - 262, 12, 250, 54))
	_text(Vector2(size.x - 250, 30), "РЕЙТИНГ %d" % int(snap["rating"]), 11, Color("#bfb6ae"))
	_bar(Rect2(size.x - 250, 35, 226, 8), float(snap["rating"]) / 100.0, Color("#8fd3a0"), Color("#2f8f4f"))
	_text(Vector2(size.x - 250, 58), "СТРЕСС %d%%" % int(snap["stress"]), 11,
		Color("#ffb4b4") if snap["stress"] > 70 else Color("#bfb6ae"))
	_bar(Rect2(size.x - 250, 62, 226, 8), float(snap["stress"]) / 100.0, Color("#e8b44a"), Color("#c22f2f"))

	# Панель полок.
	var shelf_y := size.y - 40.0 - float(run.shelves.size()) * 24.0
	_panel(Rect2(12, shelf_y, 232, float(run.shelves.size()) * 24.0 + 26.0))
	_text(Vector2(24, shelf_y + 20), "ПОЛКИ", 11, Color("#bfb6ae"))
	var i := 0
	for id in run.shelves:
		var shelf: Dictionary = run.shelves[id]
		var y := shelf_y + 30.0 + i * 24.0
		var label: String = shelf["def"]["short"]
		if snap["carrying"] == id:
			label += " ←"
		_text(Vector2(24, y + 14), label, 12)
		_bar(Rect2(140, y + 4, 70, 9), float(shelf["units"]) / float(shelf["cap"]),
			Color("#a8e0b8"), Color("#3f9f5f"))
		_text(Vector2(238, y + 14), "%d/%d" % [shelf["units"], shelf["cap"]], 12,
			Color("#bfb6ae"), HORIZONTAL_ALIGNMENT_RIGHT)
		i += 1

	# Касса: чек текущего покупателя.
	var c: Dictionary = snap["current"]
	if snap["at_register"] and not c.is_empty():
		var pw := 420.0
		var ph := 130.0 + float(c["basket"].size()) * 20.0
		var px := size.x - pw - 12.0
		var py := size.y - ph - 12.0
		_panel(Rect2(px, py, pw, ph))
		_text(Vector2(px + 14, py + 24), c["title"], 15)
		_bar(Rect2(px + 14, py + 30, pw - 28, 8),
			float(c["patience"]) / maxf(1.0, float(c["patience_max"])), Color("#8fd3a0"), Color("#c22f2f"))
		_text(Vector2(px + 14, py + 60), "ЧЕК", 11, Color("#bfb6ae"))
		_text(Vector2(px + pw - 14, py + 60), _rub(c["cheque_total"]) + " · купюра " + _rub(c["pay_note"]),
			12, Color("#f6f1e9"), HORIZONTAL_ALIGNMENT_RIGHT)
		var row := 0
		for item in c["basket"]:
			var iy := py + 78.0 + row * 20.0
			var mark := "✓" if item["scanned"] else ("✕" if item["removed"] else "·")
			var item_def: Dictionary = Cfg.item_by_id(item["id"])
			_text(Vector2(px + 16, iy), mark, 13)
			_text(Vector2(px + 32, iy), item_def["name"], 12)
			if item_def["restricted"] and not item["scanned"]:
				_text(Vector2(px + pw - 110, iy), "18+", 11, Color("#ffb4b4"))
			_text(Vector2(px + pw - 16, iy), _rub(item["price"]), 12,
				Color("#bfb6ae"), HORIZONTAL_ALIGNMENT_RIGHT)
			row += 1
		if c["id_checked"]:
			var verdict := "Паспорт: %d — продажа крепкого запрещена" % c["age"] if c["age"] < 18 \
				else "Паспорт: %d — можно" % c["age"]
			_text(Vector2(px + 16, py + 84.0 + row * 20.0), verdict, 11,
				Color("#ffb4b4") if c["age"] < 18 else Color("#7fd6a2"))
		# Подсказки действий.
		_text(Vector2(px + 14, py + ph - 12),
			"Space — пробить · F — паспорт · X — отказать · Enter — завершить",
			11, Color("#c8c0b8"))
	elif snap["queue"] > 0:
		var box := Rect2(size.x - 320, size.y - 92, 308, 56)
		draw_rect(box, Color(192.0 / 255.0, 39.0 / 255.0, 58.0 / 255.0, 0.85))
		_text(box.position + Vector2(box.size.x / 2, 26), "Покупатели ждут — встаньте за кассу", 14,
			Color.WHITE, HORIZONTAL_ALIGNMENT_CENTER, box.size.x)
		_text(box.position + Vector2(box.size.x / 2, 46), "в очереди: %d · у входа: %d" % [snap["queue"], snap["outside"]],
			12, Color("#ffe2e2"), HORIZONTAL_ALIGNMENT_CENTER, box.size.x)
	else:
		_text(Vector2(size.x / 2, size.y - 30),
			"Свободная минута: возьмите ящик на складе (E) и пополните полки",
			13, Color(240, 235, 228, 0.8), HORIZONTAL_ALIGNMENT_CENTER, size.x)

# ── Меню и мета-экраны ──────────────────────────────────────────────────
func _draw_menu() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.06, 0.05, 0.09, 0.86))
	var sign_rect := Rect2(size.x / 2 - 300, 60, 600, 84)
	draw_rect(sign_rect, Color("#f6efe4"))
	draw_rect(sign_rect, Color("#3f7a45"), false, 4.0)
	_text(Vector2(size.x / 2, 118), "ВИНОГРАД", 38, Color("#3f7a45"), HORIZONTAL_ALIGNMENT_CENTER, 600)
	var card := Rect2(size.x / 2 - 260, 170, 520, 300)
	_panel(card, Color(26.0 / 255.0, 22.0 / 255.0, 32.0 / 255.0, 0.9))
	_text(Vector2(size.x / 2, 220), "Катьме: Смена", 32, Color("#f6f1e9"), HORIZONTAL_ALIGNMENT_CENTER, 520)
	_text(Vector2(size.x / 2, 248), "Расставь товар, отбей очередь и доживи до конца смены.",
		14, Color("#bfb6ae"), HORIZONTAL_ALIGNMENT_CENTER, 520)
	for i in Cfg.SHIFT_PLAN.size():
		var shift: Dictionary = Cfg.SHIFT_PLAN[i]
		var y := 300.0 + i * 22.0
		_text(Vector2(size.x / 2 - 230, y), "%s — план %s" % [shift["name"], _rub(shift["plan"])], 13,
			Color("#f6f1e9"))
	_text(Vector2(size.x / 2, 520), "Enter — начать смену с текущего адреса · Esc — выход",
		13, Color(240, 235, 228, 0.8), HORIZONTAL_ALIGNMENT_CENTER, 600)

func _draw_career() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.06, 0.05, 0.09, 0.82))
	_text(Vector2(22, 40), "Карьера", 26)
	_text(Vector2(22, 62), "Выберите смену: W/S или Enter — начать, Esc — в меню", 12, Color("#bfb6ae"))
	for i in Cfg.SHIFT_PLAN.size():
		var shift: Dictionary = Cfg.SHIFT_PLAN[i]
		var y := 100.0 + i * 52.0
		var rect := Rect2(22, y, size.x - 44, 44)
		var selected: bool = i == game.shift_index
		draw_rect(rect, Color(247.0 / 255.0, 201.0 / 255.0, 72.0 / 255.0, 0.16) if selected else Color(1, 1, 1, 0.05))
		var venue: Dictionary = Cfg.VENUES[shift["venue"]]
		_text(Vector2(38, y + 28), "%s · %s" % [venue["title"], shift["name"]], 15)
		_text(Vector2(size.x - 38, y + 28), "план %s · пороги %s" % [_rub(shift["plan"]),
			", ".join(shift["thresholds"].map(func(t): return str(t)))], 12,
			Color("#bfb6ae"), HORIZONTAL_ALIGNMENT_RIGHT)

func _draw_brief() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.05, 0.04, 0.08, 0.88))
	var shift: Dictionary = game.current_shift()
	var venue: Dictionary = Cfg.VENUES[shift["venue"]]
	_text(Vector2(size.x / 2, 150), venue["title"], 28, Color("#f6f1e9"), HORIZONTAL_ALIGNMENT_CENTER, size.x)
	_text(Vector2(size.x / 2, 182), "%s · %s" % [shift["name"], venue["place"]], 14,
		Color("#bfb6ae"), HORIZONTAL_ALIGNMENT_CENTER, size.x)
	_text(Vector2(size.x / 2, 250), "План: %s · пороги: %s" % [_rub(shift["plan"]),
		" / ".join(shift["thresholds"].map(func(t): return str(t)))], 16,
		Color("#f7c948"), HORIZONTAL_ALIGNMENT_CENTER, size.x)
	_text(Vector2(size.x / 2, 288), "Длительность: %d с · полок: %d" % [int(shift["duration"]),
		Cfg.shelves_for(shift["venue"]).size()], 14, Color("#f6f1e9"), HORIZONTAL_ALIGNMENT_CENTER, size.x)
	_text(Vector2(size.x / 2, 350), "Enter — начать смену · Esc — назад", 15,
		Color(240, 235, 228, 0.85), HORIZONTAL_ALIGNMENT_CENTER, size.x)

func _draw_pause() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.05, 0.04, 0.08, 0.7))
	_text(Vector2(size.x / 2, size.y / 2 - 20), "Пауза", 30, Color("#f6f1e9"), HORIZONTAL_ALIGNMENT_CENTER, size.x)
	_text(Vector2(size.x / 2, size.y / 2 + 16), "Esc — продолжить · R — начать смену заново",
		15, Color("#bfb6ae"), HORIZONTAL_ALIGNMENT_CENTER, size.x)

func _draw_results() -> void:
	var size := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.05, 0.04, 0.08, 0.86))
	var r: Dictionary = game.last_result
	if r.is_empty():
		return
	var collapsed: bool = r.get("collapsed", false)
	_text(Vector2(size.x / 2, 90), "Смена сорвалась" if collapsed else "Смена закрыта",
		30, Color("#ff9b9b") if collapsed else Color("#f6f1e9"), HORIZONTAL_ALIGNMENT_CENTER, size.x)
	# Звёзды.
	for i in 3:
		var x := size.x / 2 + (i - 1) * 46.0
		draw_circle(Vector2(x, 150), 16, Color("#f7c948") if i < int(r["stars"]) else Color(1, 1, 1, 0.16))
	_text(Vector2(size.x / 2, 230), _rub(int(r["score"])), 44, Color("#f7c948"),
		HORIZONTAL_ALIGNMENT_CENTER, size.x)
	var rows := [
		["Выручка", _rub(int(r["revenue"]))],
		["Чаевые", _rub(int(r["tips"]))],
		["Премии", _rub(int(r["bonuses"]))],
		["Штрафы", "−" + _rub(int(r["fines"]))],
		["Обслужено", str(r["stats"]["served"])],
		["Ушли", str(r["stats"]["lost"])],
		["Проверок паспорта", str(r["stats"]["checks"])],
		["Отказов подросткам", str(r["stats"]["minors_refused"])],
		["Рейтинг", "%d / 100" % int(r["rating"])],
		["Стресс в конце", "%d%%" % int(r["stress"])],
		["Опыт", "+%d" % int(r["xp"])],
	]
	for i in rows.size():
		var y := 290.0 + i * 26.0
		_text(Vector2(size.x / 2 - 200, y), rows[i][0], 14, Color("#bfb6ae"))
		_text(Vector2(size.x / 2 + 200, y), rows[i][1], 14, Color("#f6f1e9"), HORIZONTAL_ALIGNMENT_RIGHT)
	_text(Vector2(size.x / 2, size.y - 40), "Enter — ещё одна смена · Esc — карьера", 14,
		Color(240, 235, 228, 0.8), HORIZONTAL_ALIGNMENT_CENTER, size.x)
