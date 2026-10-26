# PROJECT_HANDOVER.md — Christmas Village 项目交接文档

> 本文档面向「没有参与过前期开发的 AI 或开发者」，目标是让其能完整接手本项目。

## v2.0.0 最终版 Snapshot（2026-10-23，当前版本）

- **核心变化**：结局三重门控（真实日期 2026-12-25 + 共享任务 + 树全亮，`game.js` 的 `endingUnlocked/daysToChristmas`）；真实时间种植（`GROW`：花 30 分/树 6 小时，`world.garden.p1..p6 = {kind, plantedAt}`，离线生长、transaction 防重复收获）；资源体系（`world.res = {wood, seeds, flowers, materials}`，树阶段消耗见 `TREE_COST`，工坊配方见 `RECIPES`）；4 个室内（`World.interiors = {cabin, cafe, greenhouse, workshop}`，`World.getInterior(id)`）；回忆册（`game.js openBook` + `memories.js window.MemoryArt` 16 幅像素插画）；WebAudio 合成音乐（`game.js` 内 `Snd` 模块）；`?dev=1` 测试模式。
- **共享数据模型**：`rooms/{code}/world = { res, garden, quest:{step,talked,visited,found}, cocoa:{lastDay,count}, daily:{day}, crafted, treeStage, ended }`——全部经 `backend.worldTransact(fn)`（app.js 两个后端都实现了；Firebase 需要规则放行 world 节点，未放行时 game.js 自动降级 localStorage 并提示）。
- **室内同步**：`pos.indoor` 由 0/1 改为 0 或室内 id 字符串（cabin/cafe/greenhouse/workshop）。
- **修复**：Julie 头发图层（背面长发画在躯干之后）；横屏面板溢出（.panel max-height + 滚动、photo-img max-height 56vh、矮屏媒体查询）。
- **用户唯一手动步骤**：Firebase 规则更新（含 world 节点），见 README「安全规则」一节。

## 项目概述

- **项目名**：Omo's Christmas Village（我们两个人的圣诞小镇）
- **性质**：送给妻子 Julie 的私人双人圣诞网页游戏（iPhone 横屏游玩，PWA 安装）
- **当前阶段**：Stage 2 第一可玩版（v0.2.0-stage2-playable1）已开发，待真机验收
- **下一阶段**：Stage 3 美术与个性化润色

## Stage 2 Snapshot（v0.2.0-stage2-playable1，2026-10-23）

- **新增文件**：`sprites.js`（程序化像素角色/）、`world.js`（1500x1100 地图/建筑/NPC/碰撞）、`game.js`（主循环/移动/同步/交互/面板）
- **重写文件**：`index.html`（游戏界面）、`style.css`（游戏 HUD/摇杆/面板）
- **修改文件**：`app.js`（新增 setPos/setWave 同步接口，render 改为喂 Game.onData，enterGame 调 Game.enter）
- **玩法**：可走动的小镇地图、Charles/Julie 双人实时位置同步（150ms 节流）、4 个 NPC 对话、4 栋建筑交互、圣诞树 4 阶段（复用 Stage 1）、3 套服装实时同步、打招呼挥手、虚拟摇杆 + WASD
- **git 检查点**：Checkpoint 2（地图精灵）→ 3（游戏循环+UI）→ 4（接线可玩 v0.2.0-stage2-playable1 tag）
- **回退方式**：`git checkout v1.0.0-stage1-stable` 或见 RESTORE_STAGE1.md

## Stage 1 Stable Snapshot

Status:
Stable / Accepted

Version:
v1.0.0-stage1-stable

Date:
2026-10-23

Production URL:
https://1165891454-debug.github.io/christmas-village/

说明：

这是 Stage 2 开始之前的稳定版本。

如果 Stage 2 出现严重问题，可以恢复到此版本继续使用。

## 技术架构

- **形态**：纯静态站点（无构建步骤、无框架、无 npm 依赖）
- **同步方案**：Firebase Realtime Database（区域 asia-southeast1 新加坡）
- **身份方案**：Firebase 匿名认证（signInAnonymously，无需注册）
- **托管**：GitHub Pages（仓库 `1165891454-debug/christmas-village`，main 分支根目录）
- **SDK**：Firebase compat 版 10.14.1，已本地化到 `vendor/`（不依赖 CDN）

## 文件清单与职责

| 文件 | 职责 |
|---|---|
| `index.html` | 唯一页面，包含全部界面场景（配置引导/大厅/游戏/满员接管） |
| `style.css` | 全部样式（深色主题、横竖屏自适应、安全区域、飘雪动画） |
| `app.js` | 核心逻辑：后端抽象（Firebase/本地演示双实现）、房间创建/加入、槽位认领与接管、实时同步、断线处理、视图渲染 |
| `firebase-config.js` | Firebase Web 配置（公开客户端配置，非机密） |
| `manifest.webmanifest` | PWA 配置（standalone、横屏、图标） |
| `vendor/firebase-*-compat.js` | Firebase App/Auth/Database SDK（本地化） |
| `icons/` | PWA 图标（192/512） |
| `firebase.json` / `.firebaserc` / `deploy.bat` | Firebase Hosting 备用部署（当前未使用，实测 web.app 域名在用户网络不可达） |
| `README-双手机测试步骤.md` | 配置、部署、测试指南 |

## Firebase 环境记录（只读快照，2026-10-23）

- **Project ID**：`christmas-ce6c0`（控制台显示名 Christmas）
- **套餐**：Spark 免费层（无到期，未绑卡）
- **Authentication**：已启用 Anonymous（匿名）提供商；无其他登录方式
- **Realtime Database**：已创建，区域 asia-southeast1
  - databaseURL：`https://christmas-ce6c0-default-rtdb.asia-southeast1.firebasedatabase.app`
- **Database Rules**：已发布自定义规则（全文见 `README-双手机测试步骤.md`「安全规则」一节）。要点：
  - 所有读写要求 `auth != null`（匿名登录后即可）
  - 房间 ID 为 10 位随机码，知道链接者可读写该房间
  - `slots/a`、`slots/b` 任何登录者可写（支持满员接管）
  - `tree`/`log`/`presence` 仅限当前占用槽位的 uid 写入
- **数据库结构**（`rooms/{roomId}` 节点）：

```json
{
  "slots": {
    "a": { "uid": "<匿名uid>", "device": "<可选localStorage id>", "joinedAt": 1698..., "outfit": "winter|santa|home" },
    "b": { "...同上": "" }
  },
  "presence": { "a": true, "b": true },
  "tree": { "stage": 0, "updatedBy": "a|b", "updatedAt": 1698... },
  "log": { "<pushId>": { "slot": "a|b", "what": "描述", "at": 1698... } }
}
```

- **数据导出**：模型简单、可随时在 Firebase 控制台手动导出 JSON（Realtime Database → 右上 ⋮ → Export JSON）。自动导出在本环境不可用（无服务账号凭据）。

## 账号与凭据说明

- 代码仓库中**没有任何服务端密钥/私钥/密码**。`firebase-config.js` 的 apiKey 是 Firebase Web 应用的公开客户端标识（官方设计即放前端）。
- GitHub 账号（1165891454-debug）与 Firebase 账号均由用户 Charles 本人在浏览器登录，本项目无其凭据。
- 部署更新方式：用户在 GitHub 网页端手动上传文件（Add file → Upload files）。

## 已知行为与设计取舍

1. **满员接管**：房间两个槽位被占时，新访客（含链接持有者本人换设备/清缓存/无痕模式）可用「以玩家 A / 玩家 B 进入」按钮接管槽位，保留原服装。接管会顶掉原占用者（用户知情同意；Stage 2 可加二次确认）。
2. **安全边界**：「链接即钥匙」——知道邀请链接者可操作游戏；不知道链接者完全无法访问。用户已确认接受。
3. **本地演示模式**：未配置 Firebase 时页面提供「本地演示预览」（localStorage 模拟，仅单机），页面有明确标注。
4. **网络实测记录（2026-10-23）**：Firebase 各域名、github.io 可达；web.app、dash.cloudflare.com、edgeone.cool 预览不可达/受限——因此选定 GitHub Pages。

## 验收状态

见 `STAGE1-CHECKLIST.md`。核心结论：创建/加入/双端同步/接管已在真机（iPhone + 电脑）验证通过；刷新恢复与断线恢复标记为 ⚠️（机制已实现、用户未逐项确认）。
