extends Control
## 简易星域图画布

const NODE_R := 18.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP


func _draw() -> void:
	var sm: StarMap = GameState.star_map
	# 航道
	for e in sm.edges:
		var a: StarNode = sm.get_node(e[0])
		var b: StarNode = sm.get_node(e[1])
		if a == null or b == null:
			continue
		draw_line(a.position, b.position, Color(0.35, 0.45, 0.55, 0.85), 2.0)

	var player: Actor = GameState.get_player()
	for id in sm.nodes:
		var n: StarNode = sm.nodes[id]
		var col := Color(0.5, 0.5, 0.55)
		if n.owner_faction_id != "":
			var f: Faction = GameState.get_faction(n.owner_faction_id)
			if f:
				col = f.color
		var r := NODE_R
		if n.id == GameState.selected_node_id:
			draw_circle(n.position, r + 6.0, Color(1, 1, 1, 0.25))
		draw_circle(n.position, r, col.darkened(0.2))
		draw_arc(n.position, r, 0, TAU, 32, col.lightened(0.3), 2.0)
		draw_string(ThemeDB.fallback_font, n.position + Vector2(-28, -24), n.display_name, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.9, 0.92, 0.95))
		if player and player.location_node_id == n.id:
			draw_circle(n.position, 6.0, Color(1.0, 0.9, 0.3))


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			_try_select(mb.position)


func _try_select(pos: Vector2) -> void:
	var best_id := ""
	var best_d := 99999.0
	for id in GameState.star_map.nodes:
		var n: StarNode = GameState.star_map.nodes[id]
		var d := pos.distance_to(n.position)
		if d < NODE_R + 8.0 and d < best_d:
			best_d = d
			best_id = id
	if best_id != "":
		GameState.select_node(best_id)
