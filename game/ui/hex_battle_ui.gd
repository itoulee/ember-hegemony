extends Control
## 六角战棋最小关 UI

@onready var board_draw: Control = %BoardDraw
@onready var info_label: Label = %InfoLabel
@onready var log_label: RichTextLabel = %LogLabel

var board: HexBattleBoard = HexBattleBoard.new()
var origin := Vector2(90, 80)


func _ready() -> void:
	var ctx: BattleContext = GameState.pending_hex_context
	if ctx == null:
		# 独立测试兜底
		ctx = BattleContext.new()
		ctx.location_node_id = "test"
		ctx.attacker_faction_id = "fac_ember"
		ctx.defender_faction_id = "fac_cold"
		ctx.attacker_power = 100.0
		ctx.defender_power = 80.0
	board.setup_from_context(ctx)
	_refresh()
	_append_logs()


func _refresh() -> void:
	var phase := "你的回合" if board.player_team_turn else "敌方回合"
	if board.finished:
		phase = "已结束"
	var sel := "无"
	if board.selected_id != "":
		var u := board.get_unit(board.selected_id)
		if u:
			sel = "%s HP%.0f/%0.f" % [u.display_name, u.hp, u.max_hp]
	info_label.text = "六角战棋　%s\n选中：%s\n操作：点己方→点邻格移动/点邻敌攻击\n点「结束己方回合」让敌军行动" % [phase, sel]
	board_draw.queue_redraw()


func _append_logs() -> void:
	log_label.clear()
	for line in board.log_lines:
		log_label.append_text(line + "\n")


func _on_board_draw() -> void:
	# 由 BoardDraw 脚本调用 / 或在 board_draw 上画
	pass


func _process(_dt: float) -> void:
	pass


func on_board_gui_draw() -> void:
	pass


func _on_end_turn_pressed() -> void:
	if board.finished:
		return
	var before := board.log_lines.size()
	board.end_player_turn()
	for i in range(before, board.log_lines.size()):
		log_label.append_text(board.log_lines[i] + "\n")
	_refresh()
	if board.finished:
		_finish()


func _on_flee_pressed() -> void:
	# 撤退 = 进攻失败
	if board.finished:
		_finish()
		return
	board.finished = true
	board.result = BattleResult.new()
	board.result.resolver_id = "hex_tactics"
	board.result.attacker_won = false
	board.result.location_node_id = board.context.location_node_id if board.context else ""
	board.result.attacker_faction_id = board.context.attacker_faction_id if board.context else ""
	board.result.defender_faction_id = board.context.defender_faction_id if board.context else ""
	board.result.attacker_losses = 30.0
	board.result.defender_losses = 5.0
	board.result.log_lines = board.log_lines.duplicate()
	board.result.log_lines.append("进攻方撤退。")
	_finish()


func _finish() -> void:
	if board.result:
		GameState.complete_hex_battle(board.result)
	get_tree().change_scene_to_file("res://scenes/main.tscn")


func handle_board_click(local_pos: Vector2) -> void:
	if board.finished:
		if board.result:
			_finish()
		return
	var cell := HexMath.pixel_to_hex(local_pos, origin, HexBattleBoard.W, HexBattleBoard.H)
	if cell.x < 0:
		return
	var before := board.log_lines.size()
	board.try_click_cell(cell.x, cell.y)
	for i in range(before, board.log_lines.size()):
		log_label.append_text(board.log_lines[i] + "\n")
	_refresh()
	if board.finished:
		await get_tree().create_timer(0.6).timeout
		_finish()


func draw_board(canvas: Control) -> void:
	var w := HexBattleBoard.W
	var h := HexBattleBoard.H
	for r in range(h):
		for c in range(w):
			var p := HexMath.to_pixel(c, r, origin)
			_draw_hex(canvas, p, HexMath.SIZE * 0.95, Color(0.18, 0.22, 0.3))
	for u in board.units:
		var hu: HexUnit = u
		if not hu.alive():
			continue
		var p := HexMath.to_pixel(hu.col, hu.row, origin)
		var col := Color(0.95, 0.55, 0.2) if hu.team == 0 else Color(0.35, 0.55, 0.95)
		if hu.id == board.selected_id:
			canvas.draw_circle(p, HexMath.SIZE * 0.75, Color(1, 1, 1, 0.25))
		canvas.draw_circle(p, HexMath.SIZE * 0.45, col)
		var ratio := hu.hp / hu.max_hp
		canvas.draw_line(p + Vector2(-16, 20), p + Vector2(-16 + 32 * ratio, 20), Color(0.3, 0.9, 0.4), 3.0)
		canvas.draw_string(ThemeDB.fallback_font, p + Vector2(-20, -22), hu.display_name.substr(0, 4), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color.WHITE)


func _draw_hex(canvas: Control, center: Vector2, size: float, color: Color) -> void:
	var pts := PackedVector2Array()
	for i in range(6):
		var ang := deg_to_rad(60.0 * float(i) - 30.0)
		pts.append(center + Vector2(cos(ang), sin(ang)) * size)
	canvas.draw_colored_polygon(pts, color)
	for i in range(6):
		canvas.draw_line(pts[i], pts[(i + 1) % 6], Color(0.4, 0.5, 0.6), 1.5)
