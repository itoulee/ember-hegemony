class_name EventRuntime
extends RefCounted
## 表驱动事件：条件 / 权重抽选 / 选项效果

var defs: Array = []
var _fired_once: Dictionary = {} ## id -> true
var pending: Dictionary = {} ## 当前待选事件 def 拷贝，空则无


func load_from_path(path: String = "res://data/events.json") -> void:
	defs.clear()
	if not FileAccess.file_exists(path):
		push_warning("事件表不存在: %s" % path)
		return
	var f := FileAccess.open(path, FileAccess.READ)
	var raw := f.get_as_text()
	var data = JSON.parse_string(raw)
	if typeof(data) != TYPE_DICTIONARY:
		push_warning("事件表 JSON 无效")
		return
	defs = data.get("events", [])


func reset_run() -> void:
	_fired_once.clear()
	pending = {}


func has_pending() -> bool:
	return not pending.is_empty()


func clear_pending() -> void:
	pending = {}


## 回合结束时尝试抽 0~1 个需玩家选择的事件
func try_roll_player_event(state: Node, rng: RngService) -> bool:
	if has_pending():
		return true
	var pool: Array = []
	var weights: Array = []
	for def in defs:
		if not _eligible(def, state):
			continue
		pool.append(def)
		weights.append(float(def.get("weight", 1)))
	if pool.is_empty():
		return false
	# 约 55% 概率本回合出事件，避免刷屏
	if not rng.chance(0.55):
		return false
	var def: Dictionary = _weighted_pick(pool, weights, rng)
	pending = def.duplicate(true)
	if bool(def.get("once", false)):
		_fired_once[str(def.get("id", ""))] = true
	state.log_zh("【事件】%s" % str(def.get("title", "未知")))
	EventBus.event_pending.emit(pending)
	return true


func _eligible(def: Dictionary, state: Node) -> bool:
	var id := str(def.get("id", ""))
	if bool(def.get("once", false)) and _fired_once.get(id, false):
		return false
	if state.month < int(def.get("min_month", 1)):
		return false
	for c in def.get("conditions", []):
		if not _check_condition(c, state):
			return false
	return true


func _check_condition(c: Dictionary, state: Node) -> bool:
	var t := str(c.get("type", ""))
	var p = state.get_player()
	var f = state.player_faction()
	match t:
		"player_credits_gte":
			return f != null and f.credits >= int(c.get("value", 0))
		"player_credits_lte":
			return f != null and f.credits <= int(c.get("value", 0))
		"player_manpower_lte":
			return f != null and f.manpower <= float(c.get("value", 0))
		"player_manpower_gte":
			return f != null and f.manpower >= float(c.get("value", 0))
		"has_spouse":
			return p != null and p.spouse_actor_id != ""
		"not_married_to":
			return p == null or p.spouse_actor_id != str(c.get("actor", ""))
		"node_owner":
			var n = state.star_map.get_node(str(c.get("node", "")))
			if n == null:
				return false
			return n.owner_faction_id == str(c.get("faction", ""))
		_:
			return true


func _weighted_pick(pool: Array, weights: Array, rng: RngService) -> Dictionary:
	var total := 0.0
	for w in weights:
		total += float(w)
	var r := rng.randf() * total
	var acc := 0.0
	for i in range(pool.size()):
		acc += float(weights[i])
		if r <= acc:
			return pool[i]
	return pool[pool.size() - 1]


func apply_choice(choice_id: String, state: Node, rng: RngService) -> void:
	if pending.is_empty():
		return
	var choices: Array = pending.get("choices", [])
	var chosen: Dictionary = {}
	for ch in choices:
		if str(ch.get("id", "")) == choice_id:
			chosen = ch
			break
	if chosen.is_empty() and choices.size() > 0:
		chosen = choices[0]
	for eff in chosen.get("effects", []):
		_apply_effect(eff, state, rng)
	clear_pending()
	EventBus.event_cleared.emit()
	EventBus.world_changed.emit()


func _apply_effect(eff: Dictionary, state: Node, rng: RngService) -> void:
	var t := str(eff.get("type", ""))
	var f = state.player_faction()
	var p = state.get_player()
	match t:
		"add_credits":
			if f:
				f.credits = maxi(0, f.credits + int(eff.get("value", 0)))
		"add_manpower":
			if f:
				f.manpower = maxf(5.0, f.manpower + float(eff.get("value", 0)))
		"random_credits":
			if f:
				var gain := rng.randi_range(int(eff.get("min", 0)), int(eff.get("max", 0)))
				f.credits = maxi(0, f.credits + gain)
				state.log_zh("随机收益：%d 信用点" % gain)
		"add_relation":
			if f:
				var other := str(eff.get("faction", ""))
				f.set_relation(other, f.relation_to(other) + int(eff.get("value", 0)))
				var fo = state.get_faction(other)
				if fo:
					fo.set_relation(f.id, fo.relation_to(f.id) + int(eff.get("value", 0)))
		"log":
			state.log_zh(str(eff.get("text", "")))
		"try_claim_node":
			_try_claim(str(eff.get("node", "")), state)
		_:
			state.log_zh("未知效果类型：%s" % t)


func _try_claim(node_id: String, state: Node) -> void:
	var p = state.get_player()
	var f = state.player_faction()
	var n = state.star_map.get_node(node_id)
	if p == null or f == null or n == null:
		return
	if n.owner_faction_id != "":
		state.log_zh("节点已被占据，信标无效。")
		return
	if not state.star_map.is_adjacent(p.location_node_id, node_id) and p.location_node_id != node_id:
		state.log_zh("你未邻接该节点，信标无法定着。")
		return
	n.owner_faction_id = f.id
	n.garrison = maxf(15.0, f.manpower * 0.15)
	state.log_zh("成功登记节点：%s" % n.display_name)
