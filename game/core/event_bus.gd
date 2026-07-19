extends Node
## 全局事件总线

signal turn_started(month: int)
signal turn_ended(month: int)
signal log_message(text: String)
signal world_changed()
signal battle_resolved(result: BattleResult)
signal marriage_changed()
signal event_pending(def: Dictionary)
signal event_cleared()
signal hex_battle_starting()
