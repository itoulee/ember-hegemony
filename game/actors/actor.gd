class_name Actor
extends RefCounted

enum Identity { MAGISTRATE, OFFICER, CIVILIAN, RAIDER }

var id: String = ""
var display_name: String = ""
var identity: Identity = Identity.OFFICER
var faction_id: String = ""
var location_node_id: String = ""
var rank: int = 1 ## 航官品阶 1-9
var command: int = 50
var intellect: int = 50
var negotiate: int = 50
var melee: int = 50
var charm: int = 50
var spouse_actor_id: String = ""


func identity_zh() -> String:
	match identity:
		Identity.MAGISTRATE:
			return "执政官"
		Identity.OFFICER:
			return "航官"
		Identity.CIVILIAN:
			return "流民"
		Identity.RAIDER:
			return "掠航者"
	return "未知"


static func identity_from_zh(s: String) -> Identity:
	match s:
		"执政官":
			return Identity.MAGISTRATE
		"航官":
			return Identity.OFFICER
		"流民":
			return Identity.CIVILIAN
		"掠航者":
			return Identity.RAIDER
	return Identity.OFFICER
