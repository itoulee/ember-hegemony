# 星域制霸：余烬（Ember Hegemony）

开源回合制硬科幻星域策略 SLG（类雷神天制霸核心循环）。

## 外网直接游玩

### **https://itoulee.github.io/ember-hegemony/**

| | |
|--|--|
| 版本 | **P0 + P1** 网页试玩 |
| 源码 | https://github.com/itoulee/ember-hegemony |

推送 `master` 后 Actions 自动部署。桌面 Chrome / 手机浏览器均可。

## P0 + P1 功能

**P0：** 三槽存档、新手教程、30+ 事件（冷却）、战棋地形/远程、战前选战报或战棋、小屏缩放拖拽  

**P1：** 四身份（执政/航官/流民/掠航）、科技树与合研、外交同盟从属索贡联姻、政变、AI v2、36 星图、JSON 模组  

详见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 怎么玩（网页）

1. 首次进入为**教程**（跟顶部黄条操作）  
2. **系统**页：存读档、沙盒开局（选身份）、加载模组  
3. **外交 / 科技 / 身份**页：中后期系统  
4. 进攻时可选**自动战报**或**六角战棋**  

## 本地

- **网页**：用浏览器打开 `web/index.html`（事件表建议用本地静态服务器，否则 fallback 少量事件）  
  `npx serve web` 或 VS Code Live Server  
- **Godot 4**：打开 `game/project.godot`（引擎原型，功能以网页为准正在追平）

## 目录

```
web/                 # 在线试玩（主交付）
  data/events.json   # 事件表
  data/tech.json     # 科技树
  data/mods/         # 模组示例
  game.js
game/                # Godot 4 工程
docs/                # 设计与路线图
```

## 许可证

[MIT](LICENSE)

## 状态

P0+P1 可玩。P2 未开始。
