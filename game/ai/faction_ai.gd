class_name FactionAI
extends RefCounted
## 非玩家势力：征兵、占无主、对弱势邻星施压

const PLAYER_FAC := "fac_ember"


func process_world(state: Node, rng: RngService) -> void:
	for fid in state.factions:
		if fid == PLAYER_FAC:
			continue
		var fac: Faction = state.factions[fid]
		_process_faction(state, fac, rng)


func _process_faction(state: Node, fac: Faction, rng: RngService) -> void:
	_recruit(state, fac, rng)
	_claim_empty(state, fac, rng)
	_maybe_attack(state, fac, rng)


func _recruit(state: Node, fac: Faction, rng: RngService) -> void:
	if fac.credits < 2000:
		return
	if fac.manpower >= 160.0:
		return
	if not rng.chance(0.65):
		return
	var spend := mini(1500, fac.credits / 3)
	if spend < 500:
		return
	fac.credits -= spend
	var gain := float(spend) / 80.0
	fac.manpower += gain
	state.log_zh("【AI】%s 征召舰队，兵力+%.0f。" % [fac.display_name, gain])


func _claim_empty(state: Node, fac: Faction, rng: RngService) -> void:
	if not rng.chance(0.5):
		return
	var owned: Array = state.star_map.nodes_of_faction(fac.id)
	if owned.is_empty():
		return
	var candidates: Array = []
	for n in owned:
		for nid in state.star_map.neighbors(n.id):
			var m: StarNode = state.star_map.get_node(nid)
			if m and m.owner_faction_id == "":
				candidates.append(m)
	if candidates.is_empty():
		return
	var target: StarNode = candidates[rng.randi_range(0, candidates.size() - 1)]
	target.owner_faction_id = fac.id
	target.garrison = maxf(12.0, fac.manpower * 0.12)
	state.log_zh("【AI】%s 投下信标，控制 %s。" % [fac.display_name, target.display_name])


func _maybe_attack(state: Node, fac: Faction, rng: RngService) -> void:
	if fac.manpower < 40.0:
		return
	if not rng.chance(0.45):
		return
	var targets: Array = []
	for n in state.star_map.nodes_of_faction(fac.id):
		for nid in state.star_map.neighbors(n.id):
			var m: StarNode = state.star_map.get_node(nid)
			if m == null or m.owner_faction_id == "" or m.owner_faction_id == fac.id:
				continue
			# 不攻联姻盟友
			if fac.is_marriage_ally(m.owner_faction_id):
				continue
			var rel := fac.relation_to(m.owner_faction_id)
			var power := fac.manpower * 0.35
			if power < m.garrison * m.defense * 0.85 and rel > -10:
				continue
			targets.append(m)
	if targets.is_empty():
		return
	# 优先打玩家与弱驻军
	targets.sort_custom(func(a: StarNode, b: StarNode) -> bool:
		var sa := 0 if a.owner_faction_id == PLAYER_FAC else 1
		var sb := 0 if b.owner_faction_id == PLAYER_FAC else 1
		if sa != sb:
			return sa < sb
		return a.garrison < b.garrison
	)
	var target: StarNode = targets[0]
	var defender: Faction = state.get_faction(target.owner_faction_id)
	if defender == null:
		return

	var ctx := BattleContext.new()
	ctx.attacker_faction_id = fac.id
	ctx.defender_faction_id = defender.id
	ctx.attacker_power = fac.manpower * 0.4
	ctx.defender_power = target.garrison
	ctx.attacker_commander_name = fac.display_name + "分舰队"
	ctx.defender_commander_name = "驻防"
	ctx.location_node_id = target.id
	ctx.terrain_mod = target.defense

	# AI 永远用战报解析，不进交互战棋
	var resolver := ReportBattleResolver.new()
	var result := resolver.resolve(ctx, rng)
	state.apply_battle_result_public(result, target, fac, defender)
	state.log_zh("【AI】%s 对 %s 发动攻势。" % [fac.display_name, target.display_name])
