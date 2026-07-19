class_name StarMap
extends RefCounted

var nodes: Dictionary = {} ## id -> StarNode
var edges: Array = [] ## [id_a, id_b]


func clear() -> void:
	nodes.clear()
	edges.clear()


func add_node(n: StarNode) -> void:
	nodes[n.id] = n


func add_edge(a: String, b: String) -> void:
	edges.append([a, b])


func get_node(id: String) -> StarNode:
	return nodes.get(id) as StarNode


func neighbors(id: String) -> PackedStringArray:
	var out: PackedStringArray = PackedStringArray()
	for e in edges:
		if e[0] == id:
			out.append(e[1])
		elif e[1] == id:
			out.append(e[0])
	return out


func is_adjacent(a: String, b: String) -> bool:
	return b in neighbors(a)


func nodes_of_faction(faction_id: String) -> Array:
	var list: Array = []
	for id in nodes:
		var n: StarNode = nodes[id]
		if n.owner_faction_id == faction_id:
			list.append(n)
	return list
