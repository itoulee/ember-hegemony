class_name BattleSession
extends RefCounted
## 战略层入口：可切换 resolver

enum ResolverKind { REPORT, HEX }

var kind: ResolverKind = ResolverKind.REPORT


func set_kind(k: ResolverKind) -> void:
	kind = k


func is_interactive_hex() -> bool:
	return kind == ResolverKind.HEX


func run(context: BattleContext, rng: RngService) -> BattleResult:
	## 非交互路径（AI / 战报）
	var resolver: BattleResolver
	match kind:
		ResolverKind.HEX:
			# 若误走同步路径，用完整战棋自动 AI 双方（仍返回 BattleResult）
			resolver = HexTacticsBattleResolver.new()
		_:
			resolver = ReportBattleResolver.new()
	return resolver.resolve(context, rng)
