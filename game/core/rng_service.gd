class_name RngService
extends RefCounted
## 可复现随机：同种子同操作应同结果

var _rng: RandomNumberGenerator = RandomNumberGenerator.new()
var seed_value: int = 0


func setup(p_seed: int) -> void:
	seed_value = p_seed
	_rng.seed = p_seed


func randf() -> float:
	return _rng.randf()


func randf_range(from: float, to: float) -> float:
	return _rng.randf_range(from, to)


func randi_range(from: int, to: int) -> int:
	return _rng.randi_range(from, to)


func chance(p: float) -> bool:
	return _rng.randf() < p
