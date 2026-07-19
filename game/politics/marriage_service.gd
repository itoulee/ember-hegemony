class_name MarriageService
extends RefCounted
## 最小联姻：发起/接受 → 改外交与 marriage_ally


func can_propose(a: Actor, b: Actor, fa: Faction) -> String:
	if a == null or b == null:
		return "对象无效"
	if a.id == b.id:
		return "不能与自己联姻"
	if a.spouse_actor_id != "" or b.spouse_actor_id != "":
		return "一方已有联姻"
	if a.faction_id == b.faction_id:
		return "同势力无需联姻（Phase0）"
	if a.faction_id == "" or b.faction_id == "":
		return "需要双方有势力归属"
	if fa.credits < 5000:
		return "信用点不足 5000"
	return ""


func propose_and_accept(
	a: Actor,
	b: Actor,
	fa: Faction,
	fb: Faction,
	month: int
) -> MarriageContract:
	var err := can_propose(a, b, fa)
	if err != "":
		push_warning(err)
		return null

	fa.credits -= 5000
	var c := MarriageContract.new()
	c.id = "mc_%s_%s" % [a.id, b.id]
	c.actor_a_id = a.id
	c.actor_b_id = b.id
	c.faction_a_id = fa.id
	c.faction_b_id = fb.id
	c.month_signed = month
	c.cost_credits = 5000
	c.relation_bonus = 30
	c.active = true

	a.spouse_actor_id = b.id
	b.spouse_actor_id = a.id

	fa.set_relation(fb.id, fa.relation_to(fb.id) + c.relation_bonus)
	fb.set_relation(fa.id, fb.relation_to(fa.id) + c.relation_bonus)

	if not fa.is_marriage_ally(fb.id):
		fa.marriage_ally_ids.append(fb.id)
	if not fb.is_marriage_ally(fa.id):
		fb.marriage_ally_ids.append(fa.id)

	return c
