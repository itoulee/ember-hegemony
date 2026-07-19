extends Control

var battle_ui: Control


func _ready() -> void:
	battle_ui = owner as Control
	if battle_ui == null:
		battle_ui = get_parent().get_parent()
	mouse_filter = Control.MOUSE_FILTER_STOP


func _draw() -> void:
	if battle_ui and battle_ui.has_method("draw_board"):
		battle_ui.draw_board(self)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			if battle_ui and battle_ui.has_method("handle_board_click"):
				battle_ui.handle_board_click(mb.position)
