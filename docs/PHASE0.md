# Phase 0.5 说明

## 如何玩

1. Godot 4 打开 `game/project.godot`，F5。
2. 点击星图节点选中。
3. **航行 / 进攻 / 登记无主 / 联姻 / 结束回合**。
4. **结束回合**：收税 → **势力 AI** → 新星月 → **随机事件**（约 55%）。
5. 有事件时须先点选项，再行动。
6. **六角战棋**：点「六角战棋」后进攻敌星，进入 7×5 战场；消灭对方或被全灭/撤退结算。

## 系统

### 事件表

- 数据：`game/data/events.json`
- 运行时：`content/event_runtime.gd`
- 条件：信用点、兵力、联姻、节点归属等
- 效果：加减资源、关系、占星、日志

### 势力 AI

- `ai/faction_ai.gd`
- 征兵、占无主邻星、对弱势/敌对邻星发动**战报**进攻
- 不攻击联姻盟友；优先威胁玩家弱星

### 六角战棋

- 交互：`scenes/hex_battle.tscn` + `HexBattleBoard`
- 同步自动（测试/回退）：`HexTacticsBattleResolver`
- 输出仍为 `BattleResult`，战略层只应用结果

## 架构约束

- 战略层只应用 `BattleResult`
- 新事件优先改 JSON，不改代码

## 已知限制

- 无存档
- AI 无外交议和
- 战棋无地形/兵种树
