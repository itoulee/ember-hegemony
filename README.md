# 星域制霸：余烬（Ember Hegemony）

类似《雷神天制霸》核心体验的**开源**回合制硬科幻星域策略 SLG 原型。

- **引擎**：Godot 4  
- **语言**：简体中文 UI / 文案  
- **许可证**：[MIT](LICENSE)  
- **战斗**：v1 快速战报；架构预留六角战棋（`game/military/hex/`）

## 设计文档

- 原作分析：仓库外或见用户 `docs/superpowers/specs/2026-07-18-raizin7-analysis.md`
- 游戏计划：`docs/superpowers/plans/2026-07-18-star-hegemony-game-plan.md`（若从 monorepo 拷贝）

本仓库 `docs/` 放工程级说明。

## 环境

1. 安装 [Godot 4.3+](https://godotengine.org/)（标准版即可）
2. 用 Godot 打开 `game/project.godot`
3. 按 F5 运行主场景

## Phase 0.5 已实现

- 10 节点星图、航行 / 占无主 / 进攻
- 回合 AP；身份执政官 / 航官
- **势力 AI**（征兵、扩张、进攻）
- **事件表** `data/events.json` + 选项结算
- 政治联姻最小版
- 战斗：`ReportBattleResolver` **或** 可玩 **六角战棋最小关**
- 统一 `BattleContext` / `BattleResult`

## 目录

```
ember-hegemony/
├── LICENSE
├── README.md
├── game/                 # Godot 工程
│   ├── project.godot
│   ├── core/             # 回合、RNG、总线
│   ├── world/            # 星图、势力
│   ├── actors/           # 角色、身份
│   ├── politics/         # 联姻
│   ├── military/         # 战斗解析
│   │   └── hex/          # 战棋预留
│   ├── ui/
│   ├── data/
│   └── scenes/
├── docs/
└── tools/
```

## 贡献

欢迎 Issue / PR。请保持：

- 玩家可见文案为**简体中文**
- 战略层只通过 `BattleResult` 改写舰队状态
- 新内容优先表驱动（`game/data/`）

## 状态

Phase 0 可玩骨架。非完整游戏。
