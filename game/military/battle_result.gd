class_name BattleResult
extends RefCounted
## 战斗唯一输出：战略层只应用本结构

var attacker_won: bool = false
var attacker_losses: float = 0.0
var defender_losses: float = 0.0
var captives: int = 0
var log_lines: PackedStringArray = PackedStringArray()
var location_node_id: String = ""
var attacker_faction_id: String = ""
var defender_faction_id: String = ""
var resolver_id: String = "report"


func summary_zh() -> String:
	var side := "进攻方" if attacker_won else "防守方"
	return "交战于 %s：%s胜利。攻损 %.0f / 守损 %.0f。俘虏 %d。" % [
		location_node_id, side, attacker_losses, defender_losses, captives
	]
