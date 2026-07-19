class_name MarriageContract
extends RefCounted
## 政治联姻：条约式，全年龄

var id: String = ""
var actor_a_id: String = ""
var actor_b_id: String = ""
var faction_a_id: String = ""
var faction_b_id: String = ""
var cost_credits: int = 5000
var relation_bonus: int = 30
var active: bool = true
var month_signed: int = 0


func summary_zh() -> String:
	return "联姻契约 %s：%s × %s（关系+%d，费用 %d）" % [
		id, faction_a_id, faction_b_id, relation_bonus, cost_credits
	]
