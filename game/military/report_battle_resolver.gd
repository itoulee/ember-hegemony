class_name ReportBattleResolver
extends BattleResolver
## v1 快速战报解析器

const RESOLVER_ID := "report"


func resolve(context: BattleContext, rng: RngService) -> BattleResult:
	var result := BattleResult.new()
	result.resolver_id = RESOLVER_ID
	result.location_node_id = context.location_node_id
	result.attacker_faction_id = context.attacker_faction_id
	result.defender_faction_id = context.defender_faction_id

	var atk := maxf(context.attacker_power, 1.0)
	var def := maxf(context.defender_power * context.terrain_mod, 1.0)

	result.log_lines.append("【战报】坐标 %s" % context.location_node_id)
	result.log_lines.append("进攻：%s 有效战力 %.0f（司令 %s）" % [
		context.attacker_faction_id, atk, context.attacker_commander_name
	])
	result.log_lines.append("防守：%s 有效战力 %.0f（司令 %s）地形×%.2f" % [
		context.defender_faction_id, def, context.defender_commander_name, context.terrain_mod
	])

	var waves := 3 + rng.randi_range(0, 2)
	var atk_hp := atk
	var def_hp := def
	for w in range(waves):
		var atk_hit := atk_hp * rng.randf_range(0.12, 0.28)
		var def_hit := def_hp * rng.randf_range(0.10, 0.26)
		def_hp = maxf(0.0, def_hp - atk_hit)
		atk_hp = maxf(0.0, atk_hp - def_hit)
		result.log_lines.append("第 %d 波：攻方打击 %.0f，守方还击 %.0f" % [w + 1, atk_hit, def_hit])
		if def_hp <= 0.0 or atk_hp <= 0.0:
			break

	result.attacker_losses = atk - atk_hp
	result.defender_losses = def - def_hp
	result.attacker_won = def_hp <= 0.0 or (atk_hp / atk) > (def_hp / def)

	if result.attacker_won:
		result.captives = rng.randi_range(0, 3)
		result.log_lines.append("结论：进攻方控制战场。")
	else:
		result.log_lines.append("结论：防守方守住节点。")

	return result
