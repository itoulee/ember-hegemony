# 外网游玩说明

## 主链接（点开即玩）

**https://itoulee.github.io/ember-hegemony/**

- 实现：仓库 `web/`（纯 HTML/CSS/JS，无插件）
- 玩法对齐 Godot Phase 0.5：星图、AI、事件表、联姻、战报/六角战棋
- 桌面 Godot 工程仍在 `game/`，供完整引擎开发

该地址由 GitHub Actions 工作流 `Deploy Web Play` 在每次推送到 `master`/`main` 后更新。

## 手动触发部署

1. 打开 https://github.com/itoulee/ember-hegemony/actions  
2. 选择 **Deploy Web Play** → **Run workflow**  
3. 等待绿色勾后刷新 Pages 链接  

## 首次启用 GitHub Pages

若 404：

1. 仓库 **Settings → Pages**  
2. Build and deployment 来源选 **GitHub Actions**  
3. 再跑一次 workflow  

（使用 `actions/deploy-pages` 时一般会在首次成功部署后自动就绪。）

## 镜像建议（可选）

| 平台 | 用途 |
|------|------|
| itch.io HTML5 | 国内/国际另一入口，可写更友好封面 |
| Cloudflare Pages | 若 GitHub 访问慢时可绑同一 `build/web` |

## 浏览器

- 推荐桌面 Chromium 系 / Firefox  
- 需启用 WebAssembly  
- 无线程导出，不依赖 SharedArrayBuffer 跨域头  
