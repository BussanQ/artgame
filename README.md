# 赤潮 · 战术演习

[0.33 剑奴狂舞花绽](docs/design/swordthrall.md)：新增二费傀儡先锋、移动旋转伤害、技能免伤与免控、双刀动作和独立ImageGen形象。当前57种棋子（22近战/35远程），四月历史名单还缺6项。

[0.32 斧奴飞斧](docs/design/axethrall.md)：新增一费傀儡刺杀、独立ImageGen形象、斜劈与旋转飞斧、六对六演示，兼容每局禁用与旧存档。当前56种棋子（21近战/35远程），四月历史名单还缺7项。

[0.31 每局随机禁用](docs/design/species-rotation.md)：系统开局随机禁用 3 个种族系列，玩家与 AI 共用过滤后的卡池，整局固定；可查看关联棋子、受影响羁绊及同费单卡占比。旧存档保持原卡池，新开比赛生效。

[0.30 铁鸡战术协同](docs/design/ironrooster.md)：新增四费装甲刺杀、范围攻防强化、双炮交替射击与 ImageGen 形象，图鉴、AI、卡池和旧存档迁移已接入。

[0.29 装甲再生与六爆破](docs/design/armor-blast.md)：装甲2/4种恢复15/50生命每秒，爆破3/6种降低20/60个百分点法术减伤（最低−25%）。加入八对八演示、自疗统计，旧战报保留原规则。

0.28已完成[装甲爆破AI与对手风格分配](docs/design/ai-doctrines.md)。0.28时新局从8种风格中选择7种（0.31改为从禁用后可用风格中分配，允许重复），排行榜和侦察显示各自偏好，刷新和后续回合保持；旧存档保留原策略。22类羁绊，包含[铁猿蓄力震爆](docs/design/ironape.md)与独立ImageGen形象。

已接入[特种兵锁定狙击](docs/design/specialist.md)、[铁狗分段震荡](docs/design/irondog.md)、[摩托三连发](docs/design/motorcycle.md)、[步兵2/4/6减甲](docs/design/infantry-formation.md)与[逐轮递增金币](docs/design/economy-growth.md)。旧回放保留原规则；历史字段与单机设计的区别见[史料数据](docs/research/historical-tables.md)。

TypeScript + Vite 网页自走棋开发框架和单机原型。参考《战争艺术：赤潮》公开自走棋资料，使用独立原型数值、ImageGen 生成棋子形象与 2.5D 战场表现。

## 运行

推荐 Node.js 22.12+ 或 24。

```sh
npm install
npm run dev
```

浏览器打开终端输出的本地地址（默认 http://127.0.0.1:5173）。

```sh
npm run test:axethrall # 飞斧、动作、禁用与迁移的必要模块
npm run test:rotation # 随机禁用、共享卡池、招募、迁移与Worker
npm run survey:rotation # 36局配对经济采样
npm run build       # TypeScript 检查 + 生产构建
npm run preview     # 预览 dist
npm run test:ai-doctrines # 对手分配、策略持久化、旧存档与Worker
npm run test:ironape # 蓄力震爆、护甲成长、迁移与旧回放
npm run test:birdrider # 攻击计数、强化普攻、中断、迁移与旧回放
npm run test:specialist # 锁定狙击、目标失效、中断、迁移与旧回放
npm run test:irondog # 分段震荡、护甲成长、迁移与独立动作
npm run test:infantry-formation # 步兵减甲、召唤继承、迁移与旧回放
npm run test:engine # 仅必要引擎模块测试
npm run test:recruitment # 购买投影、合成与备战边界的必要模块
npm run test:visual # 仅必要表现层模块测试
npm run test:abilities # 仅技能结算模块测试
npm run test:persistence # 仅存档恢复模块测试
npm run test:equipment # 仅野怪与装备模块测试
npm run test:strategy # 仅羁绊与 AI 模块测试
npm run test:campaign # 仅完整单机循环与整局总结模块测试
npm run test:roster   # 仅新兵种技能、状态与扩展卡池迁移测试
npm run test:preferences # 仅显示设置、绘制限帧与后台结算延时测试
npm run test:motorcycle # 三连发、转火、冷却、迁移与表现
npm run test:phoenix # 喷火、化蛋重生、版本兼容与表现
npm run test:metamorph # 血鹰变身、独立连击、旧回放和迁移
npm run test:wild # 猛禽、陆行者、迁移与独立攻击表现
npm run test:psychic # 灵能反伤、供能、技能、迁移及表现
npm run test:immortal # 仅不朽生命周期、技能、迁移与旧回放回归
npm run test:fleet # 仅备战、选阵与空海版本回归
npm run audit:airsea -- final # 固定阵容诊断与两局经济流程
```

## 操作

购买棋子 → 点击备战棋子 → 点击棋盘下半区部署 → 开始战斗 → 胜负特效与自动结算 → 自动进入下一回合准备阶段。终局停留在最终战报。点击场上棋子后可换位、撤回或出售；悬停备战棋子可查看属性与动作信息。通常三枚同星同名棋子自动升星，异虫 2/4 种羁绊可降低合成数量（包含备战席），购买经验提高人口，锁定商店保留下一轮卡牌。

已实现 8 人本地演习（7 AI）、共享卡池、57 种棋子、22 类羁绊与多档效果、经济、升星、自动战斗与排名。本局自动保存在浏览器本地，刷新可恢复；“本局战报”支持查看收益和历史回放。已实现 57 种独立技能，包含护盾、治疗、控制、范围伤害、贯穿与突袭；数值采用单机自主平衡。已加入 8 个野怪关卡、战后装备选择、6 种基础装备与 10 种成装，支持穿戴、卸下、合成和 AI 使用。原作全量棋子、在线多人和原作美术尚未实现。

资料与开发方案从 [docs/README.md](docs/README.md) 开始。当前实际规则与原作差异见 [原型规则](docs/design/prototype-rules.md)。本项目没有部署远程服务。

## 视觉升级

已生成并接入 57 个独立透明棋子形象及云海遗迹背景；战场采用 2.5D Canvas 绘制，支持移动插值、弹道、挥击、技能光效、伤害飘字和死亡淡出。顶部「观看战斗演示」可直接观看十对十演示；可暂停或切换速度。

21 种近战单位拥有不同的攻击动作；35 种远程单位拥有独立动作；初始四种分别采用三连点射、蓄力狙击、抛射轰击与聚能轨道炮，包含独立后坐动作及命中特效。实现说明见 [兵种动作与交互](docs/design/melee-and-bench.md)。

新增验证命令：`npm run test:visual`。美术说明及完整提示词见 [视觉重制说明](docs/design/visual-remake.md)。这是 AI 重制形象与精灵动画，未使用原作 3D 模型。

单机模式扩展进展见 [实施清单](docs/design/single-player-plan.md)，技能规则见 [技能系统](docs/design/skills.md)。图鉴支持按费用、羁绊筛选和查看星级属性。

野怪战后需选择一件装备再进入下一回合；装备工坊可免费穿戴/卸下，每枚最多 3 件。规则与存档迁移见 [野怪与装备](docs/design/encounters-and-equipment.md)。

首轮可选择休闲/标准/挑战难度；AI 具有不同构筑偏好并使用正常经济。战场情报支持侦察，推荐布阵可辅助选阵与站位，商店显示等级概率。[羁绊与 AI 规则](docs/design/strategy-and-ai.md)。

招募前可查看升星结果、备战占用、持有星级和利息变化，手机商店为两列布局；图鉴支持能力关键词搜索、攻击方式筛选、属性排序和一键重置。[操作说明与验证](docs/design/recruitment-and-codex.md)。

终局显示整局总结、胜负统计、最终阵容与装备、回合历程和结束时排名；支持逐轮回放，刷新可恢复。[统计口径与长局验证](docs/design/match-summary.md)。

新增马骑兵、蜻蜓骑兵、暗影刀、玄龟、落箭虎、牛魔、灵鱼、长生鹿，以及骑兵和支援羁绊。[兵种扩充、资料差异和生成资产](docs/design/roster-expansion.md)。

## 显示设置与手机操作

支持精细/均衡/省电三档画质、伤害数字、减少动态效果与后台暂停，设置独立保存。商店和备战席提供详情按钮；“精确布阵”支持点选部署、交换及方向键导航。手机底部可直达战场、招募、装备、升级。[实现与验证范围](docs/design/settings-and-mobile.md)。

## 战术难度与阵型

新增抱团布阵，可与分散推荐布阵切换。休闲 AI 只靠自然经验升级；挑战 AI 会比较当前可见对手下的阵容与站位，不获得额外金币或战斗属性。[难度设计与采样验证](docs/design/tactical-difficulty.md)。定向检查：`npm run test:tactics`。

## 0.6 平衡与守军情报

降低三步兵与四狙击叠加收益、调整最终守军，保留旧战斗及历史回放规则。野怪轮次提供可展开的真实开战属性。[对照数据与验证范围](docs/design/balance-06.md)。

## 战斗音效

已加入兵器、施法、招募/升星、部署和胜负提示音；设置支持音量、静音和试听，后台自动静音。[实现与验证范围](docs/design/audio.md)。

## 后台战斗计算

开战、AI 准备、历史回放和刷新恢复在 Worker 中计算，支持取消和失败重试；只有玩家战斗保留完整展示帧。[事务边界、性能对照与验证](docs/design/background-computation.md)。

## 0.7 兵种触发机制

马骑兵单次冲锋、玄龟衰减护甲、落箭虎按攻击次数释放箭雨，灵鱼具备邻近友军保护下的隐蔽与反隐。保留旧战斗和历史回放规则。[规则差异与验证](docs/design/signature-skills.md)。

战场与本局战报新增“战斗分析”，可比较双方所有棋子的伤害、承伤、治疗、护盾及不同时间点贡献。[统计口径与验证](docs/design/battle-analysis.md)。

0.8 加入鬼狼召唤：幼狼有独立形象、血条和攻击，可继续作战至被击杀或回合结束，不占人口与卡池；旧回放保留突袭技能。[规则、生成资产与完整对局验证](docs/design/summons.md)。

牛魔施法时切换为 ImageGen 巨牛形态，配合连续冲锋与落地震击，并修复召唤物同帧出生、阵亡时的绘制异常。[表现与验证](docs/design/bull-transformation.md)。

0.9 新增真人、须弥鲨与两类傀儡召唤物，形成三召唤构筑；加入团队法术保护、傀儡攻击羁绊、独立动作和召唤阵容演示。[规则、资产与 42 局采样](docs/design/legions.md)。

0.10 新增四种异虫、两枚升星、阵亡爆炸、魅惑和异能压制；顶部可观看异虫阵容演示。[规则与验证](docs/design/insects.md)，必要模块命令 `npm run test:insects`。

## 空海舰队（0.11）

新增维修机、轰炸机、幽灵机、方舟、空蟹、电蛟，接入飞行、闪避、对空、命中回能和可打断的蓄力/引导。顶部“空海阵容演示”可直接体验；详见 [空海设计与验证](docs/design/airsea.md)。新增必要模块命令：`npm run test:airsea`。
