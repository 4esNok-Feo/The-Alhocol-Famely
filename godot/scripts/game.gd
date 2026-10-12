## game.gd — игровой узел: ввод, состояния, камера, связь модели и отрисовки.
##
## Держит один экземпляр KatmeRun, читает ввод (физические клавиши из
## project.godot — раскладка не мешает), обновляет модель фиксированным шагом
## и передаёт её в world.gd / hud.gd.
extends Node2D

const Cfg := preload("res://scripts/config.gd")
const RunModel := preload("res://scripts/run_model.gd")

const STEP := 1.0 / 60.0

enum State { MENU, CAREER, BRIEF, SHIFT, PAUSE, RESULTS }

var state: int = State.MENU
var run: KatmeRun = null
var shift_index := 0
var accumulator := 0.0
var paused := false
var last_result := {}

# Камера (простое слежение, без Camera2D — сдвигаем мир вручную).
var camera_pos := Vector2(560, 470)
var camera_zoom := 1.0

@onready var world: Node2D = $World
@onready var hud: Control = $HUD

func _ready() -> void:
	randomize()
	world.set("game", self)
	hud.set("game", self)
	queue_redraw()

func current_shift() -> Dictionary:
	return Cfg.SHIFT_PLAN[clampi(shift_index, 0, Cfg.SHIFT_PLAN.size() - 1)]

func start_shift(index: int) -> void:
	shift_index = clampi(index, 0, Cfg.SHIFT_PLAN.size() - 1)
	run = RunModel.new(current_shift(), [], randi())
	state = State.SHIFT
	last_result = {}
	accumulator = 0.0
	camera_pos = run.player_pos

func _process(delta: float) -> void:
	match state:
		State.MENU, State.CAREER, State.BRIEF, State.RESULTS:
			_process_meta(delta)
		State.SHIFT:
			_process_shift(delta)
		State.PAUSE:
			pass
	world.queue_redraw()
	hud.queue_redraw()

func _process_meta(_delta: float) -> void:
	if Input.is_action_just_pressed("finish_sale"):
		match state:
			State.MENU: state = State.CAREER
			State.CAREER: start_shift(shift_index)
			State.BRIEF: start_shift(shift_index)
			State.RESULTS: state = State.CAREER
	if Input.is_action_just_pressed("pause"):
		state = State.MENU

func _process_shift(delta: float) -> void:
	if run == null:
		return
	if Input.is_action_just_pressed("pause"):
		state = State.PAUSE
		return
	if Input.is_action_just_pressed("restart"):
		start_shift(shift_index)
		return
	# Обработка «нажатий-действий» — один раз на кадр.
	if Input.is_action_just_pressed("action"):
		run.press_action()
	if Input.is_action_just_pressed("scan"):
		run.press_scan()
	if Input.is_action_just_pressed("check_id"):
		run.press_check_id()
	if Input.is_action_just_pressed("refuse"):
		run.press_refuse()
	if Input.is_action_just_pressed("finish_sale"):
		run.press_enter()

	var dir := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	accumulator += delta
	var guard := 0
	while accumulator >= STEP and guard < 5:
		run.step(STEP, dir, Input.is_action_pressed("run"))
		accumulator -= STEP
		guard += 1
	if guard >= 5:
		accumulator = 0.0
	run.drain_events()

	# Камера мягко догоняет Катьме.
	camera_pos = camera_pos.lerp(run.player_pos, clampf(delta * 5.0, 0.0, 1.0))

	if run.finished:
		last_result = run.result if not run.result.is_empty() else run.finish("time")
		state = State.RESULTS
