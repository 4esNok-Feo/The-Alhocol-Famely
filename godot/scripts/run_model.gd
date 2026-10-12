## run_model.gd — модель смены на GDScript.
##
## Полный аналог браузерной src/core/run.js: та же логика, те же числа из
## config.gd. Модель ничего не рисует и не знает про узлы сцены — её можно
## запускать и в тестах, и в headless-режиме Godot.
##
## Отличия от браузерной версии (осознанные, ради компактности прототипа):
##  • покупатели не ходят по залу, а «подходят» по таймеру и встают в очередь;
##  • нет диалога со скандалистом — вместо него у покупателя просто ниже терпение;
##  • нет ночного освещения и частиц — это дело отрисовки, а не модели;
##  • нет тайного покупателя — зал оценивается методом fullness() (можно вызвать
##    из game.gd в момент проверки).
extends RefCounted
class_name KatmeRun

const Cfg := preload("res://scripts/config.gd")

var venue_id := "dom"
var shift_name := "Смена"
var duration := Cfg.SHIFT["duration"]
var plan := 3300
var thresholds := [3300, 4200, 5200]
var flow_mul := 1.0
var price_mul := 1.0
var basket_mul := 1.0

var time := 0.0
var phase_index := 0
var revenue := 0
var tips := 0
var fines := 0
var bonuses := 0
var rating: float = Cfg.RATING["start"]
var stress: float = Cfg.STRESS["start"]
var finished := false
var collapsed := false
var result := {}

var player_pos: Vector2 = Cfg.PLAYER["spawn"]
var player_vel := Vector2.ZERO
var carrying := ""            ## id полки, ящик которой несёт Катьме
var busy := 0.0
var busy_label := ""

var shelves := {}             ## id -> {"units": int, "cap": int, "def": Dictionary}
var sources := []             ## [{"shelf", "pos", "stock", "timer", "label"}]
var customers := []           ## [{"type", "age", "basket", "patience", ...}]
var outside := 0
var spawn_timer := 3.0
var queue_spots := [0, 1, 2]

var rng := RandomNumberGenerator.new()
var events: Array[Dictionary] = []
var stats := {
	"served": 0, "lost": 0, "checks": 0, "minors_refused": 0, "fine_count": 0,
	"scans": 0, "crates": 0, "fills": 0, "units_sold": 0, "max_queue": 0,
}
var mods := {"speed_mul": 1.0, "scan_mul": 1.0, "fill_mul": 1.0, "stress_mul": 1.0, "money_mul": 1.0}

func _init(shift: Dictionary = {}, upgrades: Array = [], seed_value: int = 12345) -> void:
	if shift.is_empty():
		shift = Cfg.SHIFT_PLAN[0]
	venue_id = shift.get("venue", "dom")
	shift_name = shift.get("name", "Смена")
	duration = shift.get("duration", Cfg.SHIFT["duration"])
	plan = shift.get("plan", 3300)
	thresholds = shift.get("thresholds", [3300, 4200, 5200])
	flow_mul = shift.get("flow_mul", 1.0)
	price_mul = shift.get("price_mul", 1.0)
	basket_mul = shift.get("basket_mul", 1.0)
	var venue: Dictionary = Cfg.VENUES.get(venue_id, {})
	flow_mul *= venue.get("flow_mul", 1.0)
	price_mul *= venue.get("price_mul", 1.0)
	if upgrades.has("sneakers"):
		mods["speed_mul"] = 1.12
	if upgrades.has("scanner"):
		mods["scan_mul"] = 0.75
	if upgrades.has("gloves"):
		mods["fill_mul"] = 0.82
	if upgrades.has("radio"):
		mods["stress_mul"] = 1.55
	if upgrades.has("thermos"):
		mods["money_mul"] = 1.06
	rng.seed = seed_value

	for shelf in Cfg.shelves_for(venue_id):
		shelves[shelf["id"]] = {"units": shelf["start"], "cap": shelf["cap"], "def": shelf}
	for src in Cfg.sources_for(venue_id):
		sources.append({"shelf": src["shelf"], "pos": src["pos"], "label": src["label"], "stock": 1, "timer": 0.0})

func shelf_defs() -> Array:
	var out := []
	for id in shelves:
		out.append(shelves[id]["def"])
	return out

func emit_event(type: String, data: Dictionary = {}) -> void:
	var ev := {"type": type, "t": time}
	ev.merge(data, true)
	events.append(ev)

func drain_events() -> Array[Dictionary]:
	var out := events
	events = []
	return out

# ── Основной шаг ─────────────────────────────────────────────────────────
func step(delta: float, move_dir: Vector2, dashing: bool) -> void:
	if finished:
		return
	time += delta

	var new_phase := clampi(int(time / Cfg.SHIFT["phase_length"]), 0, Cfg.PHASES.size() - 1)
	if new_phase != phase_index:
		phase_index = new_phase
		stress = clampf(stress + 2.5, 0.0, 100.0)
		emit_event("phase", {"name": phase().get("name", "")})

	_step_player(delta, move_dir, dashing)
	_step_sources(delta)
	_step_spawn(delta)
	_step_customers(delta)
	_step_stress(delta)

	if time >= duration:
		finish("time")
	elif stress >= 100.0:
		collapsed = true
		finish("collapse")

func phase() -> Dictionary:
	return Cfg.PHASES[clampi(phase_index, 0, Cfg.PHASES.size() - 1)]

func _step_player(delta: float, move_dir: Vector2, dashing: bool) -> void:
	if busy > 0.0:
		busy = maxf(0.0, busy - delta)
		player_vel = Vector2.ZERO
		return
	var speed: float = Cfg.PLAYER["speed"] * mods["speed_mul"]
	if carrying != "":
		speed *= Cfg.PLAYER["carry_speed_mul"]
	var dir := move_dir.normalized() if move_dir.length() > 0.01 else Vector2.ZERO
	var target := dir * speed
	player_vel = player_vel.lerp(target, clampf(delta * 9.0, 0.0, 1.0))
	player_pos += player_vel * delta
	_clamp_to_room()

func _clamp_to_room() -> void:
	# Простое удержание Катьме внутри зала и склада с «коридором» в проёме.
	var r: float = Cfg.PLAYER["radius"]
	var x := clampf(player_pos.x, Cfg.SHOP_RECT.position.x + r, Cfg.SHOP_RECT.end.x - r)
	var y := clampf(player_pos.y, Cfg.SHOP_RECT.position.y + r, Cfg.BACK_ROOM_RECT.end.y)
	var in_doorway := absf(x - (Cfg.DOORWAY_RECT.position.x + Cfg.DOORWAY_RECT.size.x * 0.5)) < Cfg.DOORWAY_RECT.size.x * 0.5 - r
	if not in_doorway:
		# Между залом и складом проходим только через проём.
		if y > Cfg.SHOP_RECT.end.y - 40.0 and player_pos.y < Cfg.BACK_ROOM_RECT.position.y:
			y = Cfg.SHOP_RECT.end.y - 40.0
	player_pos = Vector2(x, y)

func _step_sources(delta: float) -> void:
	for src in sources:
		if src["stock"] < Cfg.CRATE["stock_max"]:
			src["timer"] += delta
			if src["timer"] >= Cfg.CRATE["refill_seconds"]:
				src["timer"] = 0.0
				src["stock"] += 1
				emit_event("crate_arrived", {"shelf": src["shelf"]})

func _step_spawn(delta: float) -> void:
	spawn_timer -= delta
	if spawn_timer > 0.0:
		return
	var jitter := rng.randf_range(0.78, 1.22)
	spawn_timer = phase()["spawn_every"] * jitter * flow_mul
	# У входа ждут максимум трое — дальше «очередь полная».
	if (queue_size() + outside) >= Cfg.SHIFT["max_queue"]:
		outside += 1
		emit_event("queue_full", {})
		return
	spawn_customer()

func queue_size() -> int:
	return customers.size()

func spawn_customer() -> Dictionary:
	var weights := []
	for c in Cfg.CUSTOMERS:
		weights.append(c["weights"][clampi(phase_index, 0, 2)])
	var def: Dictionary = _weighted(Cfg.CUSTOMERS, weights)
	var age := rng.randi_range(def["age"][0], def["age"][1])
	var count := maxi(1, int(round(rng.randi_range(def["items"][0], def["items"][1]) * basket_mul)))
	var basket := []
	var wants_restricted := false
	for i in count:
		var pool := Cfg.ITEMS
		var item: Dictionary = _weighted(pool, pool.map(func(it): return it["weight"]))
		# Если на полке пусто — покупатель уходит без покупки.
		var shelf: Dictionary = shelves.get(item["shelf"], {})
		if shelf.is_empty() or shelf["units"] <= 0:
			rating = clampf(rating - Cfg.RATING["empty_shelf_hit"], 0.0, 100.0)
			stats["lost"] += 1
			emit_event("empty_shelf", {"name": def["title"], "shelf": item["shelf"]})
			return {}
		shelf["units"] -= 1
		basket.append({"id": item["id"], "price": item["price"], "scanned": false, "removed": false})
		if item["restricted"]:
			wants_restricted = true

	var customer := {
		"type": def["id"], "title": def["title"],
		"age": age, "looks_young": age < 26,
		"basket": basket, "wants_restricted": wants_restricted,
		"patience": def["patience"] * Cfg.VENUES[venue_id]["patience_mul"] * rng.randf_range(0.92, 1.12),
		"patience_max": def["patience"] * Cfg.VENUES[venue_id]["patience_mul"],
		"wait_time": 0.0, "id_checked": false, "cheque_total": 0,
		"pay_note": 500 if basket.size() < 3 else 1000,
		"change_pending": false, "change_timer": 0.0,
	}
	customers.append(customer)
	emit_event("customer_in", {"name": def["title"], "type": def["id"]})
	return customer

func _step_customers(delta: float) -> void:
	var i := 1
	for c in customers:
		c["wait_time"] += delta
		# Первый в очереди теряет терпение быстрее — очередь надо разбирать.
		var rate := 1.0 if i == 1 else 0.55
		c["patience"] -= delta * rate
		if c["change_pending"]:
			c["change_timer"] -= delta
			if c["change_timer"] <= 0.0:
				c["change_pending"] = false
				emit_event("change_missed", {})
		if c["patience"] <= 0.0:
			_customer_left(c)
		i += 1

func _customer_left(c: Dictionary) -> void:
	customers.erase(c)
	rating = clampf(rating - Cfg.ECONOMY["leave_rating_hit"], 0.0, 100.0)
	stress = clampf(stress + Cfg.STRESS["on_leave"], 0.0, 100.0)
	stats["lost"] += 1
	emit_event("customer_left", {"name": c["title"]})

func _step_stress(delta: float) -> void:
	var count := customers.size()
	if count > 0:
		var base: float = Cfg.STRESS["per_waiting_customer"] + Cfg.STRESS["extra_per_customer"] * (count - 1)
		stress = clampf(stress + base * delta, 0.0, 100.0)
	else:
		stress = clampf(stress - Cfg.STRESS["quiet_decay"] * mods["stress_mul"] * delta, 0.0, 100.0)
	stats["max_queue"] = maxi(stats["max_queue"], count)

# ── Действия игрока ──────────────────────────────────────────────────────
func at_register() -> bool:
	return Cfg.CASHIER_ZONE.has_point(player_pos) and busy <= 0.0

func current_customer() -> Dictionary:
	if customers.is_empty():
		return {}
	return customers[0]

func near_shelf() -> Dictionary:
	for def in shelf_defs():
		if player_pos.distance_to(def["stand"]) <= Cfg.CRATE["stand_distance"]:
			return def
	return {}

func near_source() -> Dictionary:
	for src in sources:
		if player_pos.distance_to(src["pos"]) <= 74.0:
			return src
	return {}

func press_action() -> bool:
	if finished or busy > 0.0:
		return false
	if at_register() and not current_customer().is_empty():
		return true
	if carrying != "":
		var shelf := near_shelf()
		if shelf.is_empty():
			emit_event("blocked", {"reason": "no_shelf"})
			return false
		if shelf["id"] != carrying:
			emit_event("wrong_shelf", {"need": carrying, "got": shelf["id"]})
			return false
		busy = Cfg.CRATE["fill_seconds"] * mods["fill_mul"]
		busy_label = "fill"
		var state: Dictionary = shelves[shelf["id"]]
		state["units"] = mini(state["cap"], state["units"] + Cfg.CRATE["units_per_case"])
		stats["fills"] += 1
		carrying = ""
		stress = clampf(stress + Cfg.STRESS["on_fill"], 0.0, 100.0)
		emit_event("fill", {"shelf": shelf["id"], "units_now": state["units"]})
		return true
	var src := near_source()
	if not src.is_empty():
		if src["stock"] <= 0:
			emit_event("crate_empty", {"shelf": src["shelf"]})
			return false
		src["stock"] -= 1
		src["timer"] = 0.0
		carrying = src["shelf"]
		stats["crates"] += 1
		busy = Cfg.CRATE["pick_seconds"]
		busy_label = "pick"
		emit_event("pickup", {"shelf": src["shelf"]})
		return true
	emit_event("blocked", {"reason": "nothing"})
	return false

func press_scan() -> bool:
	if finished or busy > 0.0 or not at_register():
		return false
	var c := current_customer()
	if c.is_empty():
		return false
	for item in c["basket"]:
		if item["scanned"] or item["removed"]:
			continue
		var def: Dictionary = Cfg.item_by_id(item["id"])
		# Продажа крепкого подростку без проверки — штраф.
		if def["restricted"] and c["id_checked"] and c["age"] < 18:
			register_fine(c)
			return false
		item["scanned"] = true
		c["cheque_total"] += item["price"]
		stats["scans"] += 1
		stats["units_sold"] += 1
		busy = Cfg.ECONOMY["scan_seconds"] * mods["scan_mul"]
		busy_label = "scan"
		emit_event("scan", {"item": def["name"], "price": item["price"], "total": c["cheque_total"]})
		if _nothing_pending(c) and c["cheque_total"] < c["pay_note"] - 100:
			c["change_pending"] = true
			c["change_timer"] = Cfg.ECONOMY["change_window"]
			emit_event("change_needed", {"note": c["pay_note"]})
		return true
	return false

func press_check_id() -> bool:
	if finished or busy > 0.0 or not at_register():
		return false
	var c := current_customer()
	if c.is_empty() or c["id_checked"]:
		return false
	c["id_checked"] = true
	stats["checks"] += 1
	busy = 0.45
	busy_label = "check"
	if c["age"] < 18:
		emit_event("id_minor", {"age": c["age"]})
	else:
		emit_event("id_ok", {"age": c["age"]})
	return true

func press_refuse() -> bool:
	if finished or busy > 0.0 or not at_register():
		return false
	var c := current_customer()
	if c.is_empty():
		return false
	var removed := false
	for item in c["basket"]:
		var def: Dictionary = Cfg.item_by_id(item["id"])
		if def["restricted"] and not item["removed"]:
			item["removed"] = true
			removed = true
			var state: Dictionary = shelves.get(def["shelf"], {})
			if not state.is_empty():
				state["units"] = mini(state["cap"], state["units"] + 1)
	if not removed:
		return false
	if c["age"] < 18:
		bonuses += Cfg.ECONOMY["refuse_bonus"]
		stats["minors_refused"] += 1
		rating = clampf(rating + 1.4, 0.0, 100.0)
		emit_event("refuse", {"good": true, "age": c["age"]})
	else:
		rating = clampf(rating - 2.0, 0.0, 100.0)
		emit_event("refuse", {"good": false, "age": c["age"]})
	return true

func press_enter() -> bool:
	if finished or not at_register():
		return false
	var c := current_customer()
	if c.is_empty() or not _nothing_pending(c):
		emit_event("not_ready", {})
		return false
	if c["change_pending"]:
		c["change_pending"] = false
		tips += int(round(c["cheque_total"] * Cfg.ECONOMY["change_bonus"]))
		emit_event("change_ok", {})
	complete_sale(c)
	return true

func _nothing_pending(c: Dictionary) -> bool:
	for item in c["basket"]:
		if not item["scanned"] and not item["removed"]:
			return false
	return true

func complete_sale(c: Dictionary) -> void:
	var total := int(round(c["cheque_total"] * phase()["price_mul"] * price_mul * mods["money_mul"]))
	revenue += total
	var fast := c["wait_time"] < Cfg.ECONOMY["quick_serve_seconds"]
	var tip := int(round(total * Cfg.ECONOMY["base_tip"] * (1.8 if fast else 0.7)))
	tips += tip
	stats["served"] += 1
	rating = clampf(rating + (Cfg.RATING["perfect_serve"] if fast else Cfg.RATING["happy_sale"]), 0.0, 100.0)
	stress = clampf(stress + Cfg.STRESS["on_sale"], 0.0, 100.0)
	# Если подростку всё же ушло крепкое — штраф.
	if c["age"] < 18:
		for item in c["basket"]:
			var def: Dictionary = Cfg.item_by_id(item["id"])
			if item["scanned"] and def["restricted"]:
				register_fine(c)
				break
	customers.erase(c)
	emit_event("sale", {"total": total, "tip": tip, "fast": fast, "name": c["title"]})

func register_fine(c: Dictionary) -> void:
	fines += Cfg.ECONOMY["fine_minor"]
	stats["fine_count"] += 1
	rating = clampf(rating - 14.0, 0.0, 100.0)
	stress = clampf(stress + Cfg.STRESS["on_fine"], 0.0, 100.0)
	emit_event("fine", {"amount": Cfg.ECONOMY["fine_minor"], "name": c["title"]})

# ── Итог смены ───────────────────────────────────────────────────────────
func finish(reason: String = "time") -> Dictionary:
	if finished and not result.is_empty():
		return result
	finished = true
	var rating_bonus := int(round(maxf(0.0, rating - 60.0) * 4.0))
	var clean_bonus := 600 if (stats["lost"] == 0 and stats["fine_count"] == 0) else 0
	var score := revenue + tips + bonuses - fines + rating_bonus + clean_bonus
	var stars := 0
	for t in thresholds:
		if score >= t:
			stars += 1
	result = {
		"shift": "%s:%d" % [venue_id, 0],
		"name": shift_name,
		"reason": reason,
		"time_used": time,
		"revenue": revenue,
		"tips": tips,
		"bonuses": bonuses,
		"fines": fines,
		"rating_bonus": rating_bonus,
		"clean_bonus": clean_bonus,
		"score": score,
		"stars": stars,
		"plan": plan,
		"plan_met": revenue >= plan,
		"rating": int(round(rating)),
		"stress": int(round(stress)),
		"clean": stats["fine_count"] == 0 and stats["lost"] == 0,
		"collapsed": reason == "collapse",
		"stats": stats.duplicate(),
	}
	result["xp"] = 90 + stats["served"] * 3 + stats["minors_refused"] * 14 + stars * 40
	emit_event("shift_end", {})
	return result

# ── Вспомогательное ──────────────────────────────────────────────────────
func _weighted(items: Array, weights: Array) -> Dictionary:
	var total := 0.0
	for w in weights:
		total += float(w)
	var r := rng.randf() * total
	for i in items.size():
		r -= float(weights[i])
		if r <= 0.0:
			return items[i]
	return items[items.size() - 1]

## Средняя заполненность полок — используется проверкой качества зала.
func fullness() -> float:
	if shelves.is_empty():
		return 0.0
	var acc := 0.0
	for id in shelves:
		acc += float(shelves[id]["units"]) / float(shelves[id]["cap"])
	return acc / float(shelves.size())

## Снимок состояния для интерфейса (аналог snapshot() в браузерной версии).
func snapshot() -> Dictionary:
	var c := current_customer()
	var shelf_view := {}
	for id in shelves:
		shelf_view[id] = {"units": shelves[id]["units"], "cap": shelves[id]["cap"]}
	return {
		"time": time,
		"time_left": maxf(0.0, duration - time),
		"phase": phase().get("name", ""),
		"revenue": revenue,
		"tips": tips,
		"fines": fines,
		"bonuses": bonuses,
		"plan": plan,
		"rating": rating,
		"stress": stress,
		"queue": customers.size(),
		"outside": outside,
		"carrying": carrying,
		"at_register": at_register(),
		"shelves": shelf_view,
		"current": c,
	}
