class_name HexGrid
extends RefCounted
## 六角网格尺寸描述（逻辑见 HexMath / HexBattleBoard）

var width: int = 7
var height: int = 5


func setup(p_width: int, p_height: int) -> void:
	width = p_width
	height = p_height


func is_stub() -> bool:
	return false


func cell_count() -> int:
	return width * height
