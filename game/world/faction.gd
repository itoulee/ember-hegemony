class_name Faction
extends RefCounted

var id: String = ""
var display_name: String = ""
var color: Color = Color.WHITE
var credits: int = 0
var manpower: float = 100.0
var leader_actor_id: String = ""
## 外交：faction_id -> 关系值 -100..100
var relations: Dictionary = {}
## 联姻带来的稳定同盟加成
var marriage_ally_ids: PackedStringArray = PackedStringArray()


func relation_to(other_id: String) -> int:
	return int(relations.get(other_id, 0))


func set_relation(other_id: String, value: int) -> void:
	relations[other_id] = clampi(value, -100, 100)


func is_marriage_ally(other_id: String) -> bool:
	for x in marriage_ally_ids:
		if x == other_id:
			return true
	return false
