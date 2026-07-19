class_name HexTacticsBattleResolver
extends BattleResolver
## 同步战棋解析：双方 AI 自动打完（供无 UI / 测试）
## 玩家交互战棋走 scenes/hex_battle.tscn + HexBattleBoard


func resolver_id() -> String:
	return "hex_tactics_auto"


func resolve(context: BattleContext, rng: RngService) -> BattleResult:
	var board := HexBattleBoard.new()
	board.setup_from_context(context)
	var guard := 0
	while not board.finished and guard < 80:
		guard += 1
		# 攻方简易 AI，再 end_player_turn 跑守方
		_auto_team(board, 0, rng)
		if board.finished:
			break
		board.end_player_turn()
	if board.result == null:
		var report := ReportBattleResolver.new()
		var r := report.resolve(context, rng)
		r.resolver_id = resolver_id()
		r.log_lines.insert(0, "【战棋自动】超时，回退战报")
		return r
	board.result.resolver_id = resolver_id()
	return board.result


func _auto_team(board: HexBattleBoard, team: int, rng: RngService) -> void:
	for u in board.units:
		var hu: HexUnit = u
		if hu.team != team or not hu.alive() or board.finished:
			continue
		hu.reset_turn()
		var foe_team := 1 if team == 0 else 0
		var target := board._nearest_enemy(hu, foe_team)
		if target == null:
			continue
		if HexMath.is_neighbor(hu.col, hu.row, target.col, target.row):
			board._try_attack(hu, target)
			continue
		var step := board._step_toward(hu, target)
		if step != Vector2i(-1, -1):
			board._try_move(hu, step.x, step.y)
			if target.alive() and HexMath.is_neighbor(hu.col, hu.row, target.col, target.row):
				board._try_attack(hu, target)
		elif rng.chance(0.1):
			pass
