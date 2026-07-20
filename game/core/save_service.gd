class_name SaveService
extends RefCounted
## 简易 JSON 存档（对齐网页导出思路）

const SAVE_DIR := "user://saves"


func ensure_dir() -> void:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)


func slot_path(i: int) -> String:
	return "%s/slot_%d.json" % [SAVE_DIR, i]


func save_dict(path: String, data: Dictionary) -> Error:
	ensure_dir()
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return FileAccess.get_open_error()
	f.store_string(JSON.stringify(data, "\t"))
	return OK


func load_dict(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var raw := f.get_as_text()
	var data = JSON.parse_string(raw)
	if typeof(data) != TYPE_DICTIONARY:
		return {}
	return data


func save_slot(i: int, data: Dictionary) -> Error:
	return save_dict(slot_path(i), data)


func load_slot(i: int) -> Dictionary:
	return load_dict(slot_path(i))
