class_name BattleContext
extends RefCounted
## 战斗唯一输入（可序列化思路；战报与战棋共用）

var attacker_faction_id: String = ""
var defender_faction_id: String = ""
var attacker_power: float = 0.0
var defender_power: float = 0.0
var attacker_commander_name: String = ""
var defender_commander_name: String = ""
var location_node_id: String = ""
var terrain_mod: float = 1.0
var seed_offset: int = 0

## 战棋预留：单位明细（战报可只读聚合）
var attacker_units: Array = []
var defender_units: Array = []


func to_dict() -> Dictionary:
	return {
		"attacker_faction_id": attacker_faction_id,
		"defender_faction_id": defender_faction_id,
		"attacker_power": attacker_power,
		"defender_power": defender_power,
		"attacker_commander_name": attacker_commander_name,
		"defender_commander_name": defender_commander_name,
		"location_node_id": location_node_id,
		"terrain_mod": terrain_mod,
		"seed_offset": seed_offset,
		"attacker_units": attacker_units,
		"defender_units": defender_units,
	}


static func from_dict(d: Dictionary) -> BattleContext:
	var c := BattleContext.new()
	c.attacker_faction_id = str(d.get("attacker_faction_id", ""))
	c.defender_faction_id = str(d.get("defender_faction_id", ""))
	c.attacker_power = float(d.get("attacker_power", 0.0))
	c.defender_power = float(d.get("defender_power", 0.0))
	c.attacker_commander_name = str(d.get("attacker_commander_name", ""))
	c.defender_commander_name = str(d.get("defender_commander_name", ""))
	c.location_node_id = str(d.get("location_node_id", ""))
	c.terrain_mod = float(d.get("terrain_mod", 1.0))
	c.seed_offset = int(d.get("seed_offset", 0))
	c.attacker_units = d.get("attacker_units", [])
	c.defender_units = d.get("defender_units", [])
	return c
