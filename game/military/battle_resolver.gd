class_name BattleResolver
extends RefCounted
## 战斗解析接口基类（GDScript 无 interface，用约定 + 虚方法）


func resolver_id() -> String:
	return "base"


func resolve(_context: BattleContext, _rng: RngService) -> BattleResult:
	push_error("BattleResolver.resolve 必须由子类实现")
	return BattleResult.new()
