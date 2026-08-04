# SECONDS — 项目状态与协作交接

> 最后更新：2026-08-04
> 用途：这是 Codex 与 Claude Code 共同参考的**现状记录**。设计意图看 `DESIGN.md`；本文件只记录已经实现和已验证的内容。

## 项目概览

`SECONDS` 是一个 2D 灰盒动作速通原型。唯一货币是时间：游戏计时、受击惩罚、商店购买、捷径和修复都会计入最终成绩。

总成绩：`游戏时间 + 受击惩罚 + 消费 - 击杀返还`。

技术栈：TypeScript、Vite、Vitest；构建产物为单个自包含 HTML 文件（`dist/index.html`）。

## 模组与进化系统 v3（进行中，里程碑 1/5 已完成）

`DESIGN.md` 已从「13 个平铺强化」的 v2 重写为「开局三选一模组 + 每个强化只有基础/
进化两阶段」的 v3。实施按 5 个里程碑推进，见对应的实施计划。**当前完成到里程碑 1**
（框架 + 通用强化池）；模组专属强化（飞刃/掠影/蓄势各 3 个 + 6 进化）排在里程碑 2–4，
地图新约束/Boss 输出窗口/HUD·结算改版排在里程碑 5。

**里程碑 1 已实现：**

- 开局流程：标题页填 seed → **模组选择页**（飞刃/掠影/蓄势，三选一，不计时，选定后
  不可更改）→ 地图。`SceneContext.startRun(seed, module)` 签名已改，`toModuleSelect`
  新增。
- 三个模组的**基础能力**从选中那一刻起就生效，不需要拿任何强化：飞刃（挥砍带刃弹，
  `dmg×0.40`）、掠影（冲刺穿人 `dmg×0.85`）、蓄势（左键变蓄力键，0.60s 蓄满，
  `dmg×2.2` 全向斩，蓄力中移速 ×0.72）。数值集中在 `src/game/config.ts` 的
  `MODULES`，写入 Stats 的逻辑在 `src/game/modules.ts`。
- 强化模型重写（`src/game/upgrades.ts`）：`Upgrade.module: ModuleId|'universal'`；
  `Evolution.branch: 'a'|'b'`，`Run.evolved: Map<UpgradeId, 'a'|'b'>`。**分支保留
  直到被选中**——未进化的强化两条分支都可能反复出现在奖励/商店里，选中一条后整个
  强化才完成进化、两条分支才一起永久离场（v2「展示即淘汰」已废除）。
- 4 个通用强化（疾风/利刃/韧体/精算）+ 8 条进化已按 DESIGN.md §6 的数值实现。模组
  专属的 9 个强化（飞刃/掠影/蓄势各 3 个）**还没实现**——`UPGRADES` 数组目前只有
  这 4 个通用强化，`UpgradeId` 联合类型（`src/i18n/strings.ts`）会在后续里程碑逐个
  扩展。
- 奖励/商店生成规则重写（新文件 `src/game/rewards.ts`）：战斗房 3 选 1（2 模组专属
  + 1 通用，35% 概率换成进化）、精英房 3 选 1（尽量多给进化，没有可进化强化就退化
  成 3 个模组专属）、商店 4 槽（模组基础/模组基础或进化/通用或进化/随机折扣）。
  防无效选项 6 条规则（DESIGN.md §2.4）在这个文件里集中实现。**注意**：M1 阶段模组
  专属强化池是空的，所以商店位置 1/2 和精英房的"模组专属"分支会经常抽不到东西，
  这是预期状态，会随 M2–M4 加入专属强化自然消失。
- 伤害标签打底：`World.damageEnemy(e, damage, tag)` 新增 `DamageTag`
  参数（`MELEE|BLADE|DASH|CHARGE|EXPLOSION|AFTEREFFECT`），写入
  `Enemy.lastHitTag`。M1 阶段没有任何机制消费这个标签，只是为 M2（刃印识别 BLADE）
  和 M4（震荡识别 CHARGE）打地基。
- 精算的「高额结算」进化（精英房清空额外返还）在 `CombatScene` 里按房型触发一次，
  不随击杀次数重复结算。
- 删除的旧机制：处决（`exec`）、时停（`dashSlow`/`applySlow`/`World.slow`）、反击
  （`counterDmg`/`Player.counter`/`HIT.riposteWindow`）—— 对应 DESIGN.md §7 的
  「删除的旧强化」表。`FEEL.slowScale` 常量保留，只作为 Timeline 不变式测试的通用
  减速倍率，和已删除的时停机制无关。
- 8 层分支地图，首层战斗、倒数第二层休整、最终 Boss（v2 遗留，本次未改）。
- 房间类型：普通战斗、精英、商店、时间修复站、捷径门、Boss（v2 遗留）。
- 战斗：移动、鼠标瞄准、近战、冲刺无敌、受击硬直、连击税、墙体碰撞（v2 遗留）。
- 敌人：冲锋兵、射手、重甲、医疗兵；两阶段 Boss（冲锋反向折返、弹幕缺口轮转、震波
  由外向内回收，回收动作结束后短暂露出高伤害破绽）（v2 遗留）。
- 全局 seed：地图、房间、敌人出生点、强化/进化抽取和 Boss 招式均可复现。
- 中英文 UI 与本地语言记忆；`src/i18n/strings.ts` 已加 `modules`/`moduleSelect`
  两个新词典分区。
- 暂停为全遮挡式暂停；地图、模组选择页除外的其余决策界面正常计时。
- 走表规则：玩家能操作或作决定时时间才计入成绩。房间清空后的 0.45s 过场（纯动画）
  停表；顿帧期间账本按世界速度（×0.12）打折。受击僵直不停表（惩罚本身）。场景通过
  `Scene.timeScale` 报价，App 主循环按它缩放走表；`tests/timeAccounting.test.ts`
  钉住这两条规则和两个反例。
- 精英房数值：重甲数量 `1+floor(层数/3)`，血量倍率 ×1.2；`tests/eliteBalance.test.ts`
  钉住，不受本次模组重构影响。

## 已验证

2026-08-04 已执行并通过：

```text
npm test       # 12 个测试文件，109 项测试全部通过
npx tsc --noEmit  # 类型检查通过
bash tests/run.sh  # 推送闸门（类型检查 + 测试 + 生产构建）全部通过
```

现有自动化覆盖：定价一致性、随机性/seed 可复现、游戏时间轴、地图约束、医疗兵行为、
精英房数量护栏、Boss 回收阶段、**强化/进化模型（分支保留直到被选中、精英房不重复
抽同一强化的两条分支、35% 战斗房进化替换概率、模组基础能力生效）**、战斗循环（三
模组各跑一遍 fuzz）、走表规则、i18n、启动冒烟测试（含模组选择页流程）。

手动验证：`bash tests/run.sh` 内建的 jsdom 冒烟测试已经把「标题页填 seed → 选模组
→ 进地图 → 打战斗房 → 领奖励 → 逛商店 → 打 Boss → 结算页」整条链路走了一遍并断言
DOM 状态，覆盖了比单纯类型检查更贴近真实交互的路径；没有额外用浏览器手动点过。

## 发布约定

- 每次完成并验证代码或文档改动后，必须提交并推送到 GitHub 的 `main` 分支；不要只保留本地改动。
- 每次改动完，都要在这份文件里更新对应内容，让 Codex 和 Claude Code 看到的现状是一致的。
- `tests/` 已经**整个进仓库**，以后新增测试文件正常 `git add` 即可；CI
  （`.github/workflows/deploy.yml`）跑的就是 `bash tests/run.sh` 本地闸门那一整套。

## 关键文件索引

| 目的 | 文件 |
| --- | --- |
| 目标玩法规格（v3） | `DESIGN.md` |
| 当前协作状态 | `PROJECT_STATUS.md` |
| 全部数值配置（含 `MODULES`/`PRICES`/`REWARDS`） | `src/game/config.ts` |
| 模组基础能力 | `src/game/modules.ts` |
| 强化/进化数据与 computeStats | `src/game/upgrades.ts` |
| 奖励/商店生成规则 | `src/game/rewards.ts` |
| 一局状态、seed 分流、进化归属 | `src/game/run.ts` |
| 时间账本与总成绩 | `src/game/ledger.ts` |
| 地图生成和路线约束 | `src/game/map.ts` |
| 房间敌人编排 | `src/game/room.ts` |
| 战斗世界与受击/伤害（含 DamageTag） | `src/game/world.ts` |
| 各场景流转（含模组选择页） | `src/scenes/` |
| 测试 | `tests/` |
