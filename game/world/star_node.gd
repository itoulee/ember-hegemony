class_name StarNode
extends RefCounted

var id: String = ""
var display_name: String = ""
var position: Vector2 = Vector2.ZERO
var owner_faction_id: String = ""
var income: int = 10
var defense: float = 1.0
var garrison: float = 50.0


func to_dict() -> Dictionary:
	return {
		"id": id,
		"display_name": display_name,
		"position": [position.x, position.y],
		"owner_faction_id": owner_faction_id,
		"income": income,
		"defense": defense,
		"garrison": garrison,
	}
