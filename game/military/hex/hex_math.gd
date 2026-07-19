class_name HexMath
extends RefCounted
## 平顶六角：offset 奇数行 (col, row)

const SIZE := 36.0


static func neighbors(col: int, row: int) -> Array:
	## 返回 [[c,r], ...]
	var odd := row % 2 == 1
	var dirs: Array
	if odd:
		dirs = [[+1, 0], [0, -1], [-1, -1], [-1, 0], [-1, +1], [0, +1]]
	else:
		dirs = [[+1, 0], [+1, -1], [0, -1], [-1, 0], [0, +1], [+1, +1]]
	var out: Array = []
	for d in dirs:
		out.append([col + d[0], row + d[1]])
	return out


static func in_bounds(col: int, row: int, w: int, h: int) -> bool:
	return col >= 0 and row >= 0 and col < w and row < h


static func is_neighbor(c1: int, r1: int, c2: int, r2: int) -> bool:
	for n in neighbors(c1, r1):
		if n[0] == c2 and n[1] == r2:
			return true
	return false


static func to_pixel(col: int, row: int, origin: Vector2 = Vector2(80, 70)) -> Vector2:
	var x := SIZE * 1.5 * float(col)
	var y := SIZE * sqrt(3.0) * (float(row) + 0.5 * float(col % 2))
	# 使用 odd-r：行偏移
	x = SIZE * sqrt(3.0) * (float(col) + 0.5 * float(row % 2))
	y = SIZE * 1.5 * float(row)
	return origin + Vector2(x, y)


static func pixel_to_hex(pos: Vector2, origin: Vector2, w: int, h: int) -> Vector2i:
	var best := Vector2i(-1, -1)
	var best_d := 1e12
	for r in range(h):
		for c in range(w):
			var p := to_pixel(c, r, origin)
			var d := pos.distance_squared_to(p)
			if d < best_d:
				best_d = d
				best = Vector2i(c, r)
	if best_d > SIZE * SIZE * 0.85:
		return Vector2i(-1, -1)
	return best
