class_name HexUnit
extends RefCounted

var id: String = ""
var team: int = 0 ## 0 攻方 1 守方
var display_name: String = ""
var col: int = 0
var row: int = 0
var hp: float = 100.0
var max_hp: float = 100.0
var atk: float = 28.0
var moved: bool = false
var attacked: bool = false


func alive() -> bool:
	return hp > 0.0


func reset_turn() -> void:
	moved = false
	attacked = false
