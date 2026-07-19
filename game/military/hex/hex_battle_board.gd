class_name HexBattleBoard
extends RefCounted
## 最小六角战：移动 / 攻击 / 敌方 AI

const W := 7
const H := 5

var units: Array = [] ## HexUnit
var context: BattleContext
var selected_id: String = ""
var player_team_turn: bool = true ## true=攻方
var finished: bool = false
var result: BattleResult = null
var log_lines: PackedStringArray = PackedStringArray()


func setup_from_context(ctx: BattleContext) -> void:
	context = ctx
	units.clear()
	finished = false
	result = null
	selected_id = ""
	player_team_turn = true
	log_lines = PackedStringArray()

	var atk_hp := maxf(ctx.attacker_power / 3.0, 40.0)
	var def_hp := maxf(ctx.defender_power / 3.0, 35.0)
	var atk_dmg := 22.0 + ctx.attacker_power * 0.04
	var def_dmg := 20.0 + ctx.defender_power * 0.035

	_add_unit("a0", 0, "突击舰-1", 1, 1, atk_hp, atk_dmg)
	_add_unit("a1", 0, "突击舰-2", 1, 3, atk_hp, atk_dmg)
	_add_unit("a2", 0, "火力舰", 0, 2, atk_hp * 1.1, atk_dmg * 1.15)

	_add_unit("d0", 1, "防御哨-1", 5, 1, def_hp, def_dmg)
	_add_unit("d1", 1, "防御哨-2", 5, 3, def_hp, def_dmg)
	_add_unit("d2", 1, "轨道炮台", 6, 2, def_hp * 1.2, def_dmg * 1.1)

	log_lines.append("六角战棋开始：%s" % ctx.location_node_id)


func _add_unit(id: String, team: int, name: String, c: int, r: int, hp: float, atk: float) -> void:
	var u := HexUnit.new()
	u.id = id
	u.team = team
	u.display_name = name
	u.col = c
	u.row = r
	u.hp = hp
	u.max_hp = hp
	u.atk = atk
	units.append(u)


func get_unit_at(col: int, row: int) -> HexUnit:
	for u in units:
		var hu: HexUnit = u
		if hu.alive() and hu.col == col and hu.row == row:
			return hu
	return null


func get_unit(id: String) -> HexUnit:
	for u in units:
		var hu: HexUnit = u
		if hu.id == id:
			return hu
	return null


func select_unit(id: String) -> void:
	if finished:
		return
	var u := get_unit(id)
	if u == null or not u.alive():
		return
	if u.team != 0 or not player_team_turn:
		return
	selected_id = id


func try_click_cell(col: int, row: int) -> void:
	if finished or not player_team_turn:
		return
	if not HexMath.in_bounds(col, row, W, H):
		return
	var occ := get_unit_at(col, row)
	if selected_id == "":
		if occ and occ.team == 0:
			selected_id = occ.id
		return

	var sel := get_unit(selected_id)
	if sel == null or not sel.alive():
		selected_id = ""
		return

	if occ and occ.id == sel.id:
		return

	if occ and occ.team == 1:
		_try_attack(sel, occ)
		return

	if occ == null:
		_try_move(sel, col, row)


func _try_move(u: HexUnit, col: int, row: int) -> bool:
	if u.moved or u.attacked:
		log_lines.append("%s 本回合无法再移动。" % u.display_name)
		return false
	if not HexMath.is_neighbor(u.col, u.row, col, row):
		log_lines.append("只能移动到相邻六角。")
		return false
	if get_unit_at(col, row) != null:
		return false
	u.col = col
	u.row = row
	u.moved = true
	log_lines.append("%s 移动至 (%d,%d)" % [u.display_name, col, row])
	return true


func _try_attack(attacker: HexUnit, defender: HexUnit) -> bool:
	if attacker.attacked:
		log_lines.append("%s 已攻击过。" % attacker.display_name)
		return false
	if not HexMath.is_neighbor(attacker.col, attacker.row, defender.col, defender.row):
		log_lines.append("目标不在攻击距离（需相邻）。")
		return false
	defender.hp = maxf(0.0, defender.hp - attacker.atk)
	attacker.attacked = true
	attacker.moved = true
	log_lines.append("%s 攻击 %s，伤害 %.0f（剩余 HP %.0f）" % [
		attacker.display_name, defender.display_name, attacker.atk, defender.hp
	])
	if not defender.alive():
		log_lines.append("%s 被摧毁。" % defender.display_name)
	_check_end()
	return true


func end_player_turn() -> void:
	if finished or not player_team_turn:
		return
	selected_id = ""
	player_team_turn = false
	_enemy_turn()
	if not finished:
		player_team_turn = true
		for u in units:
			var hu: HexUnit = u
			if hu.team == 0 and hu.alive():
				hu.reset_turn()


func _enemy_turn() -> void:
	for u in units:
		var hu: HexUnit = u
		if hu.team == 1 and hu.alive():
			hu.reset_turn()

	for u in units:
		var enemy: HexUnit = u
		if enemy.team != 1 or not enemy.alive() or finished:
			continue
		var target := _nearest_enemy(enemy, 0)
		if target == null:
			continue
		if HexMath.is_neighbor(enemy.col, enemy.row, target.col, target.row):
			target.hp = maxf(0.0, target.hp - enemy.atk)
			enemy.attacked = true
			log_lines.append("敌方 %s 攻击 %s，伤害 %.0f" % [enemy.display_name, target.display_name, enemy.atk])
			if not target.alive():
				log_lines.append("%s 被摧毁。" % target.display_name)
			_check_end()
			continue
		# 朝目标走近一格
		var step := _step_toward(enemy, target)
		if step != Vector2i(-1, -1):
			enemy.col = step.x
			enemy.row = step.y
			enemy.moved = true
			log_lines.append("敌方 %s 机动至 (%d,%d)" % [enemy.display_name, enemy.col, enemy.row])
			if HexMath.is_neighbor(enemy.col, enemy.row, target.col, target.row) and not enemy.attacked:
				target.hp = maxf(0.0, target.hp - enemy.atk)
				enemy.attacked = true
				log_lines.append("敌方 %s 接敌攻击 %s" % [enemy.display_name, target.display_name])
				if not target.alive():
					log_lines.append("%s 被摧毁。" % target.display_name)
				_check_end()


func _nearest_enemy(from: HexUnit, team: int) -> HexUnit:
	var best: HexUnit = null
	var best_d := 9999
	for u in units:
		var hu: HexUnit = u
		if not hu.alive() or hu.team != team:
			continue
		var d := absi(hu.col - from.col) + absi(hu.row - from.row)
		if d < best_d:
			best_d = d
			best = hu
	return best


func _step_toward(from: HexUnit, target: HexUnit) -> Vector2i:
	var best := Vector2i(-1, -1)
	var best_d := 9999
	for n in HexMath.neighbors(from.col, from.row):
		var c: int = n[0]
		var r: int = n[1]
		if not HexMath.in_bounds(c, r, W, H):
			continue
		if get_unit_at(c, r) != null:
			continue
		var d := absi(c - target.col) + absi(r - target.row)
		if d < best_d:
			best_d = d
			best = Vector2i(c, r)
	return best


func _check_end() -> void:
	var atk_alive := 0
	var def_alive := 0
	var atk_hp := 0.0
	var def_hp := 0.0
	var atk_max := 0.0
	var def_max := 0.0
	for u in units:
		var hu: HexUnit = u
		if hu.team == 0:
			atk_max += hu.max_hp
			if hu.alive():
				atk_alive += 1
				atk_hp += hu.hp
		else:
			def_max += hu.max_hp
			if hu.alive():
				def_alive += 1
				def_hp += hu.hp
	if def_alive == 0 or atk_alive == 0:
		finished = true
		result = BattleResult.new()
		result.resolver_id = "hex_tactics"
		result.location_node_id = context.location_node_id if context else ""
		result.attacker_faction_id = context.attacker_faction_id if context else ""
		result.defender_faction_id = context.defender_faction_id if context else ""
		result.attacker_won = def_alive == 0 and atk_alive > 0
		result.attacker_losses = atk_max - atk_hp
		result.defender_losses = def_max - def_hp
		result.captives = 1 if result.attacker_won else 0
		result.log_lines = log_lines.duplicate()
		if result.attacker_won:
			result.log_lines.append("战棋结论：进攻方胜利。")
		else:
			result.log_lines.append("战棋结论：防守方胜利。")
