extends Node
## 全局可玩状态：星图、势力、玩家、回合

const DEFAULT_AP_OFFICER := 2
const DEFAULT_AP_MAGISTRATE := 3

var rng: RngService = RngService.new()
var star_map: StarMap = StarMap.new()
var factions: Dictionary = {} ## id -> Faction
var actors: Dictionary = {} ## id -> Actor
var marriages: Array = [] ## MarriageContract
var marriage_service: MarriageService = MarriageService.new()
var battle_session: BattleSession = BattleSession.new()
var event_runtime: EventRuntime = EventRuntime.new()
var faction_ai: FactionAI = FactionAI.new()

var month: int = 1
var player_actor_id: String = "player"
var ap: int = DEFAULT_AP_MAGISTRATE
var selected_node_id: String = ""
var log_buffer: PackedStringArray = PackedStringArray()
## 交互战棋上下文（切场景期间保持）
var pending_hex_context: BattleContext = null
var pending_hex_node_id: String = ""


func _ready() -> void:
	event_runtime.load_from_path("res://data/events.json")
	new_game(20260718)


func new_game(p_seed: int = 0) -> void:
	if p_seed == 0:
		p_seed = int(Time.get_unix_time_from_system())
	rng.setup(p_seed)
	month = 1
	factions.clear()
	actors.clear()
	marriages.clear()
	star_map.clear()
	log_buffer = PackedStringArray()
	pending_hex_context = null
	pending_hex_node_id = ""
	event_runtime.reset_run()
	if event_runtime.defs.is_empty():
		event_runtime.load_from_path("res://data/events.json")
	_build_prototype_world()
	var player: Actor = actors[player_actor_id]
	_refresh_ap_for_identity(player.identity)
	selected_node_id = player.location_node_id
	log_zh("新周目开始。种子=%d。身份：%s。" % [p_seed, player.identity_zh()])
	log_zh("提示：结束回合将触发势力 AI 与随机事件；战棋模式可打六角最小关。")
	EventBus.world_changed.emit()


func _build_prototype_world() -> void:
	# 势力
	var player_fac := _make_faction("fac_ember", "余烬航阀", Color(0.95, 0.55, 0.2), 12000)
	var rival := _make_faction("fac_cold", "冷环合议", Color(0.35, 0.55, 0.95), 10000)
	var neutral := _make_faction("fac_free", "自由港盟", Color(0.45, 0.75, 0.5), 8000)
	factions[player_fac.id] = player_fac
	factions[rival.id] = rival
	factions[neutral.id] = neutral
	player_fac.set_relation(rival.id, -20)
	rival.set_relation(player_fac.id, -20)
	player_fac.set_relation(neutral.id, 10)
	neutral.set_relation(player_fac.id, 10)
	rival.set_relation(neutral.id, 0)
	neutral.set_relation(rival.id, 0)

	# 10 节点环+内
	var layout := [
		["n0", "余烬港", Vector2(640, 360), "fac_ember", 20, 80.0],
		["n1", "灰轨一号", Vector2(480, 280), "fac_ember", 12, 40.0],
		["n2", "正交矿带", Vector2(800, 280), "fac_ember", 15, 45.0],
		["n3", "冷环主星", Vector2(400, 420), "fac_cold", 18, 90.0],
		["n4", "窃听站", Vector2(320, 300), "fac_cold", 10, 55.0],
		["n5", "裂隙门", Vector2(880, 420), "fac_cold", 11, 50.0],
		["n6", "自由港", Vector2(640, 520), "fac_free", 16, 60.0],
		["n7", "中继残骸", Vector2(520, 480), "fac_free", 8, 30.0],
		["n8", "无主岩", Vector2(760, 480), "", 5, 20.0],
		["n9", "密钥库", Vector2(640, 200), "fac_cold", 14, 70.0],
	]
	for row in layout:
		var n := StarNode.new()
		n.id = row[0]
		n.display_name = row[1]
		n.position = row[2]
		n.owner_faction_id = row[3]
		n.income = row[4]
		n.garrison = row[5]
		n.defense = 1.0 + float(row[5]) / 200.0
		star_map.add_node(n)

	var edge_list := [
		["n0", "n1"], ["n0", "n2"], ["n0", "n6"], ["n0", "n9"],
		["n1", "n4"], ["n1", "n3"], ["n2", "n5"], ["n2", "n9"],
		["n3", "n4"], ["n3", "n7"], ["n5", "n8"], ["n6", "n7"],
		["n6", "n8"], ["n7", "n3"], ["n9", "n4"],
	]
	for e in edge_list:
		star_map.add_edge(e[0], e[1])

	# 角色
	var player := Actor.new()
	player.id = "player"
	player.display_name = "你"
	player.identity = Actor.Identity.MAGISTRATE
	player.faction_id = "fac_ember"
	player.location_node_id = "n0"
	player.rank = 9
	player.command = 70
	player.charm = 60
	actors[player.id] = player
	player_fac.leader_actor_id = player.id
	player_fac.manpower = 120.0

	var officer := Actor.new()
	officer.id = "act_lia"
	officer.display_name = "莉娅·科塔"
	officer.identity = Actor.Identity.OFFICER
	officer.faction_id = "fac_ember"
	officer.location_node_id = "n0"
	officer.rank = 5
	officer.negotiate = 65
	officer.charm = 70
	actors[officer.id] = officer

	var rival_lead := Actor.new()
	rival_lead.id = "act_vorn"
	rival_lead.display_name = "沃恩执政"
	rival_lead.identity = Actor.Identity.MAGISTRATE
	rival_lead.faction_id = "fac_cold"
	rival_lead.location_node_id = "n3"
	rival_lead.rank = 9
	rival_lead.command = 68
	actors[rival_lead.id] = rival_lead
	rival.leader_actor_id = rival_lead.id
	rival.manpower = 110.0

	var free_lead := Actor.new()
	free_lead.id = "act_mira"
	free_lead.display_name = "米拉港主"
	free_lead.identity = Actor.Identity.MAGISTRATE
	free_lead.faction_id = "fac_free"
	free_lead.location_node_id = "n6"
	free_lead.rank = 8
	free_lead.charm = 75
	free_lead.negotiate = 72
	actors[free_lead.id] = free_lead
	neutral.leader_actor_id = free_lead.id


func _make_faction(id: String, name: String, color: Color, credits: int) -> Faction:
	var f := Faction.new()
	f.id = id
	f.display_name = name
	f.color = color
	f.credits = credits
	return f


func get_player() -> Actor:
	return actors.get(player_actor_id) as Actor


func get_faction(id: String) -> Faction:
	return factions.get(id) as Faction


func player_faction() -> Faction:
	var p := get_player()
	if p == null:
		return null
	return get_faction(p.faction_id)


func log_zh(text: String) -> void:
	var line := "[星月%d] %s" % [month, text]
	log_buffer.append(line)
	if log_buffer.size() > 200:
		log_buffer = log_buffer.slice(log_buffer.size() - 200)
	EventBus.log_message.emit(line)


func _refresh_ap_for_identity(identity: Actor.Identity) -> void:
	if identity == Actor.Identity.MAGISTRATE:
		ap = DEFAULT_AP_MAGISTRATE
	else:
		ap = DEFAULT_AP_OFFICER


func try_spend_ap(cost: int = 1) -> bool:
	if ap < cost:
		log_zh("行动点不足。")
		return false
	ap -= cost
	return true


func end_turn() -> void:
	if event_runtime.has_pending():
		log_zh("请先处理当前事件选项。")
		return
	_collect_income()
	# 非玩家势力 AI（在进入新月前结算「本月末」行动）
	faction_ai.process_world(self, rng)
	month += 1
	var p := get_player()
	if p:
		_refresh_ap_for_identity(p.identity)
	log_zh("结束回合。进入星月 %d。收入已结算，AI 已行动。" % month)
	event_runtime.try_roll_player_event(self, rng)
	EventBus.turn_ended.emit(month)
	EventBus.turn_started.emit(month)
	EventBus.world_changed.emit()


func _collect_income() -> void:
	for fid in factions:
		var f: Faction = factions[fid]
		var total := 0
		for n in star_map.nodes_of_faction(fid):
			total += n.income
		f.credits += total


func set_player_identity(identity: Actor.Identity) -> void:
	var p := get_player()
	if p == null:
		return
	p.identity = identity
	if identity == Actor.Identity.MAGISTRATE:
		p.rank = 9
		log_zh("身份切换为执政官（演示）。国令 AP=3。")
	else:
		p.rank = 5
		log_zh("身份切换为航官（演示）。AP=2。")
	_refresh_ap_for_identity(identity)
	EventBus.world_changed.emit()


func select_node(node_id: String) -> void:
	if not star_map.nodes.has(node_id):
		return
	selected_node_id = node_id
	EventBus.world_changed.emit()


func move_player_to(node_id: String) -> void:
	if event_runtime.has_pending():
		log_zh("请先处理当前事件选项。")
		return
	var p := get_player()
	if p == null:
		return
	if not star_map.is_adjacent(p.location_node_id, node_id):
		log_zh("目标不在相邻航道上。")
		return
	if not try_spend_ap(1):
		return
	p.location_node_id = node_id
	selected_node_id = node_id
	log_zh("航行至 %s。" % star_map.get_node(node_id).display_name)
	EventBus.world_changed.emit()


func declare_war_on_selected() -> void:
	if event_runtime.has_pending():
		log_zh("请先处理当前事件选项。")
		return
	var p := get_player()
	var n := star_map.get_node(selected_node_id)
	if p == null or n == null:
		return
	if n.owner_faction_id == "" or n.owner_faction_id == p.faction_id:
		log_zh("无法对无主或己方节点发动进攻。可先移动到邻接敌星再战。")
		return
	if not star_map.is_adjacent(p.location_node_id, n.id) and p.location_node_id != n.id:
		log_zh("必须位于目标或其邻接节点。")
		return
	if not try_spend_ap(1):
		return

	var fa := player_faction()
	var fb := get_faction(n.owner_faction_id)
	if fa == null or fb == null:
		return

	var ctx := BattleContext.new()
	ctx.attacker_faction_id = fa.id
	ctx.defender_faction_id = fb.id
	ctx.attacker_power = fa.manpower * (1.0 + float(p.command) / 100.0)
	ctx.defender_power = n.garrison
	ctx.attacker_commander_name = p.display_name
	ctx.defender_commander_name = "驻防司令部"
	ctx.location_node_id = n.id
	ctx.terrain_mod = n.defense
	ctx.attacker_units = [{"hull": 100, "weapon": 40, "mobility": 30}]
	ctx.defender_units = [{"hull": 80, "weapon": 35, "mobility": 20}]

	if battle_session.is_interactive_hex():
		pending_hex_context = ctx
		pending_hex_node_id = n.id
		log_zh("进入六角战棋：%s" % n.display_name)
		EventBus.hex_battle_starting.emit()
		# 由主场景切换；若无树则同步自动战棋
		var tree := get_tree()
		if tree:
			tree.change_scene_to_file("res://scenes/hex_battle.tscn")
		else:
			var result_auto := battle_session.run(ctx, rng)
			apply_battle_result_public(result_auto, n, fa, fb)
			EventBus.battle_resolved.emit(result_auto)
			EventBus.world_changed.emit()
		return

	var result := battle_session.run(ctx, rng)
	apply_battle_result_public(result, n, fa, fb)
	EventBus.battle_resolved.emit(result)
	EventBus.world_changed.emit()


func complete_hex_battle(result: BattleResult) -> void:
	var n := star_map.get_node(pending_hex_node_id)
	var fa := player_faction()
	var fb_id := result.defender_faction_id
	var fb := get_faction(fb_id)
	if n == null or fa == null or fb == null:
		log_zh("战棋结算上下文丢失。")
		pending_hex_context = null
		pending_hex_node_id = ""
		return
	apply_battle_result_public(result, n, fa, fb)
	EventBus.battle_resolved.emit(result)
	pending_hex_context = null
	pending_hex_node_id = ""
	EventBus.world_changed.emit()


func apply_battle_result_public(result: BattleResult, node: StarNode, fa: Faction, fb: Faction) -> void:
	_apply_battle_result(result, node, fa, fb)


func _apply_battle_result(result: BattleResult, node: StarNode, fa: Faction, fb: Faction) -> void:
	for line in result.log_lines:
		log_zh(line)
	fa.manpower = maxf(10.0, fa.manpower - result.attacker_losses * 0.15)
	node.garrison = maxf(0.0, node.garrison - result.defender_losses)
	if result.attacker_won:
		var old_owner := node.owner_faction_id
		node.owner_faction_id = fa.id
		node.garrison = maxf(20.0, fa.manpower * 0.25)
		fa.set_relation(fb.id, fa.relation_to(fb.id) - 15)
		fb.set_relation(fa.id, fb.relation_to(fa.id) - 15)
		# 防守方失去节点时略损兵力
		if old_owner == fb.id:
			fb.manpower = maxf(10.0, fb.manpower - result.defender_losses * 0.1)
		log_zh("占领节点 %s。%s" % [node.display_name, result.summary_zh()])
	else:
		log_zh("进攻失败。%s" % result.summary_zh())


func resolve_event_choice(choice_id: String) -> void:
	event_runtime.apply_choice(choice_id, self, rng)


func claim_empty_selected() -> void:
	if event_runtime.has_pending():
		log_zh("请先处理当前事件选项。")
		return
	var p := get_player()
	var n := star_map.get_node(selected_node_id)
	var f := player_faction()
	if p == null or n == null or f == null:
		return
	if n.owner_faction_id != "":
		log_zh("节点非无主。")
		return
	if not star_map.is_adjacent(p.location_node_id, n.id) and p.location_node_id != n.id:
		log_zh("需位于目标或邻接节点。")
		return
	if not try_spend_ap(1):
		return
	n.owner_faction_id = f.id
	n.garrison = maxf(15.0, f.manpower * 0.15)
	log_zh("登记无主节点：%s" % n.display_name)
	EventBus.world_changed.emit()


func try_marriage_with_free_port() -> void:
	if event_runtime.has_pending():
		log_zh("请先处理当前事件选项。")
		return
	var p := get_player()
	var partner := actors.get("act_mira") as Actor
	var fa := player_faction()
	var fb := get_faction("fac_free")
	if p == null or partner == null or fa == null or fb == null:
		return
	var err := marriage_service.can_propose(p, partner, fa)
	if err != "":
		log_zh("联姻失败：%s" % err)
		return
	if not try_spend_ap(1):
		return
	var contract := marriage_service.propose_and_accept(p, partner, fa, fb, month)
	if contract == null:
		log_zh("联姻未成立。")
		return
	marriages.append(contract)
	log_zh("政治联姻成立：%s。获得航道互信与关系加成。" % contract.summary_zh())
	EventBus.marriage_changed.emit()
	EventBus.world_changed.emit()


func status_block_zh() -> String:
	var p := get_player()
	var f := player_faction()
	if p == null or f == null:
		return ""
	var spouse := "无"
	if p.spouse_actor_id != "":
		var s: Actor = actors.get(p.spouse_actor_id)
		if s:
			spouse = s.display_name
	var loc := star_map.get_node(p.location_node_id)
	var loc_name := loc.display_name if loc else p.location_node_id
	var mode := "战报" if battle_session.kind == BattleSession.ResolverKind.REPORT else "六角战棋"
	var ev := "无"
	if event_runtime.has_pending():
		ev = str(event_runtime.pending.get("title", "待选"))
	return "\n".join([
		"星月 %d　AP %d　模式：%s" % [month, ap, mode],
		"身份：%s　品阶 %d" % [p.identity_zh(), p.rank],
		"势力：%s" % f.display_name,
		"信用点：%d　兵力：%.0f" % [f.credits, f.manpower],
		"位置：%s" % loc_name,
		"联姻对象：%s" % spouse,
		"事件：%s" % ev,
		"选中：%s" % selected_node_id,
	])
