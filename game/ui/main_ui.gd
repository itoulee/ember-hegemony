extends Control
## 主界面：星图 + 状态 + 日志 + 行动 + 事件

@onready var map_draw: Control = %MapDraw
@onready var status_label: Label = %StatusLabel
@onready var log_label: RichTextLabel = %LogLabel
@onready var selected_label: Label = %SelectedLabel
@onready var event_box: VBoxContainer = %EventBox
@onready var event_title: Label = %EventTitle
@onready var event_text: Label = %EventText
@onready var event_choices: VBoxContainer = %EventChoices


func _ready() -> void:
	EventBus.log_message.connect(_on_log)
	EventBus.world_changed.connect(_refresh)
	EventBus.battle_resolved.connect(_on_battle)
	EventBus.event_pending.connect(_on_event_pending)
	EventBus.event_cleared.connect(_on_event_cleared)
	_refresh()
	_sync_event_panel()
	for line in GameState.log_buffer:
		log_label.append_text(line + "\n")


func _refresh() -> void:
	status_label.text = GameState.status_block_zh()
	var n: StarNode = GameState.star_map.get_node(GameState.selected_node_id)
	if n:
		var owner_name := "无主"
		if n.owner_faction_id != "":
			var f: Faction = GameState.get_faction(n.owner_faction_id)
			if f:
				owner_name = f.display_name
		selected_label.text = "选中节点：%s（%s）\n所属：%s\n驻军：%.0f　收入：%d　防御×%.2f" % [
			n.display_name, n.id, owner_name, n.garrison, n.income, n.defense
		]
	else:
		selected_label.text = "未选中节点"
	map_draw.queue_redraw()
	_sync_event_panel()


func _sync_event_panel() -> void:
	if GameState.event_runtime.has_pending():
		_show_event(GameState.event_runtime.pending)
	else:
		event_box.visible = false


func _show_event(def: Dictionary) -> void:
	event_box.visible = true
	event_title.text = "事件：%s" % str(def.get("title", ""))
	event_text.text = str(def.get("text", ""))
	for c in event_choices.get_children():
		c.queue_free()
	for ch in def.get("choices", []):
		var btn := Button.new()
		var cid := str(ch.get("id", ""))
		btn.text = str(ch.get("text", cid))
		btn.pressed.connect(_on_choice.bind(cid))
		event_choices.add_child(btn)


func _on_event_pending(def: Dictionary) -> void:
	_show_event(def)
	_refresh()


func _on_event_cleared() -> void:
	event_box.visible = false
	_refresh()


func _on_choice(choice_id: String) -> void:
	GameState.resolve_event_choice(choice_id)
	_refresh()


func _on_log(text: String) -> void:
	log_label.append_text(text + "\n")


func _on_battle(_result: BattleResult) -> void:
	_refresh()


func _on_end_turn_pressed() -> void:
	GameState.end_turn()
	_refresh()


func _on_move_pressed() -> void:
	GameState.move_player_to(GameState.selected_node_id)
	_refresh()


func _on_attack_pressed() -> void:
	GameState.declare_war_on_selected()
	# 战棋会切场景；战报则刷新
	_refresh()


func _on_claim_pressed() -> void:
	GameState.claim_empty_selected()
	_refresh()


func _on_marriage_pressed() -> void:
	GameState.try_marriage_with_free_port()
	_refresh()


func _on_identity_magistrate() -> void:
	GameState.set_player_identity(Actor.Identity.MAGISTRATE)
	_refresh()


func _on_identity_officer() -> void:
	GameState.set_player_identity(Actor.Identity.OFFICER)
	_refresh()


func _on_new_game_pressed() -> void:
	log_label.clear()
	GameState.new_game()
	_refresh()
	for line in GameState.log_buffer:
		log_label.append_text(line + "\n")


func _on_resolver_report() -> void:
	GameState.battle_session.set_kind(BattleSession.ResolverKind.REPORT)
	GameState.log_zh("战斗解析器：快速战报")
	_refresh()


func _on_resolver_hex() -> void:
	GameState.battle_session.set_kind(BattleSession.ResolverKind.HEX)
	GameState.log_zh("战斗解析器：六角战棋（进攻将进入战场）")
	_refresh()


func _on_save1_pressed() -> void:
	GameState.save_slot(1)
	_refresh()


func _on_save2_pressed() -> void:
	GameState.save_slot(2)
	_refresh()


func _on_load1_pressed() -> void:
	GameState.load_slot_meta(1)
	_refresh()


func _on_load2_pressed() -> void:
	GameState.load_slot_meta(2)
	_refresh()
