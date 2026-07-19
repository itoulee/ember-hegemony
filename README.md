# 星域制霸：余烬（Ember Hegemony）

类似《雷神天制霸》核心体验的**开源**回合制硬科幻星域策略 SLG 原型。

## 外网直接游玩

| | |
|--|--|
| **在线试玩（点开即玩）** | **https://itoulee.github.io/ember-hegemony/** |
| 源码 | https://github.com/itoulee/ember-hegemony |

> 浏览器 **HTML5 试玩版**（`web/`），与 Godot 原型同玩法：星图、AI、事件、联姻、战报/六角战棋。  
> 推送 `master` 后 Actions 自动部署到 GitHub Pages。若 404，等 1–2 分钟或看 [Actions](https://github.com/itoulee/ember-hegemony/actions)。  
> 桌面/手机浏览器均可；无需安装。

- **引擎**：Godot 4（GL Compatibility，适配网页）  
- **语言**：简体中文 UI / 文案  
- **许可证**：[MIT](LICENSE)  
- **战斗**：快速战报 + 可玩六角战棋最小关  

## 本地运行

1. 安装 [Godot 4.3+](https://godotengine.org/)（标准版）  
2. 打开 `game/project.godot`  
3. F5 运行  

Web 本机导出：`项目 → 导出 → Web`（预设已写在 `game/export_presets.cfg`，**线程关闭**以兼容静态托管）。

## Phase 0.5 已实现

- 10 节点星图：航行 / 占无主 / 进攻  
- 回合 AP；身份：执政官 / 航官  
- **势力 AI**（征兵、扩张、进攻）  
- **事件表** `game/data/events.json`  
- 政治联姻最小版  
- 战报解析 **或** 六角战棋  
- 统一 `BattleContext` / `BattleResult`  
- **CI → GitHub Pages 在线玩**  

## 后续扩展建议（摘要）

完整版见 **[docs/ROADMAP.md](docs/ROADMAP.md)**。

**优先推荐：**

1. **存档三槽** — 网页长局必备  
2. **10 分钟教程剧本** — 降低跳失  
3. **事件扩到 30+** — 只改 JSON，最易贡献  
4. **战棋地形 + 远程单位** — 拉开与纯战报差异  
5. **小屏 UI** — 照顾手机点开链接的玩家  

**中期：** 流民/海盗身份、科技树、外交同盟、政变、30+ 星图、模组 JSON。  
**长期：** 多剧本、角色线、成就图鉴、可选 i18n。

## 设计文档

- [雷神分析](docs/raizin7-analysis.md)  
- [游戏计划](docs/game-plan.md)  
- [Phase 说明](docs/PHASE0.md)  
- [扩展路线图](docs/ROADMAP.md)  

## 目录

```
ember-hegemony/
├── LICENSE / README / CONTRIBUTING
├── .github/workflows/deploy-web.yml   # Pages 自动部署
├── game/                              # Godot 工程
│   ├── export_presets.cfg             # Web 导出
│   ├── data/events.json
│   ├── ai/ content/ core/ military/ …
└── docs/
```

## 贡献

欢迎 Issue / PR。请保持：

- 玩家可见文案为**简体中文**  
- 战略层只通过 `BattleResult` 改写舰队  
- 新内容优先表驱动（`game/data/`）  

## 状态

Phase 0.5 可玩原型 + 网页部署流水线。非完整商业成品。
