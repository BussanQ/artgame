# 本地存档与战报

存档格式 `schema: 6`，规则版本随 `RULES.version` 保存。代码位于 `src/engine/persistence.ts`；必要验证为 `tests/persistence.test.ts`。

## 保存与恢复

- 保存当前 Game：随机种子、共享卡池、全部玩家、商店、阵容、经济、阶段、回合和历史战报。另存倍速、暂停状态及战斗播放时间。Game 也保存待选战利品、库存与棋子装备；奖励未领取时不能跳到下一轮。
- 准备阶段的购买、换位、刷新、锁店、买经验、出售等操作后保存。战斗每秒保存检查点，暂停/倍速切换、页面隐藏或离开时也保存。
- 不保存逐帧战斗数据。战斗阶段的 Game 已包含 AI 完成准备后的状态；恢复时调用 `resumeRound`，重新计算确定性回放和防守结果，不重跑 AI 购买、升级或刷新。
- 结算一次性保存 phase、经济变化与历史记录。`settle` 校验回合、随机状态和已结算记录；旧结果不能结算新一轮。恢复 `result` 阶段只展示战果并进入准备；恢复 `finished` 停留终局。
- 本局战报记录每轮对手、胜负、生命损失、收入和两侧参战阵容。准备阶段或终局可观看历史回放，演示不会更新本局战果或经济。

## 校验与回退

- 校验已知棋子、合法星级、唯一 UID、落点不重叠、人口/备战上限、经验与经济范围、阶段与历史连续性、终局条件。
- 每种棋子的「卡池剩余 + 商店占用 + 已购买份数」必须等于总份数，历史快照不参与卡池计数。
- 单份存档限 750,000 字符。损坏主存档尝试上一份有效备份；损坏原文写入 recovery 键，再保存恢复结果或新局。
- 不兼容 schema/规则版本不会被自动覆盖；界面显示暂不保存，用户确认“重新开始”后才能替换，原文仍保留。
- 存储被禁用或写满时保留内存中的对局，显示保存不可用；写入失败不清空原检查点。
- 检测到另一标签页更新时，旧页停止回放/自动推进并禁用游戏修改；点击“载入最新存档”恢复。写入前比较上次读取的完整原文，避免已检测到的新进度被旧状态覆盖。

## 存储键

- `red-tides.singleplayer.save`：当前原子检查点。
- `red-tides.singleplayer.save.backup`：上一份有效检查点。
- `red-tides.singleplayer.save.recovery`：被替换的损坏或不兼容原文。

存档仅保存在当前站点来源的浏览器本地，不进行云同步；清理该站点数据会清除存档。历史回放依赖当前规则版本；升级规则应新增迁移或保留不兼容提示，不能静默按新规则覆盖旧结果。

已加入 schema 1 / singleplayer-0.2 的兼容迁移，保留进行中的旧 PvP 对手；详见 [野怪与装备](encounters-and-equipment.md)。

当前新增 combatVersion 和 difficulty，历史回放按记录的战斗版本计算；schema 2 兼容迁移见 [策略系统](strategy-and-ai.md)。

历史 schema 4 为 8 种新增棋子补入卡池，接续旧 schema 1–3；保留原商店、阵容和战斗。迁移边界见 [兵种扩充](roster-expansion.md)。

## schema 5 / singleplayer-0.6

schema 4 顺序迁移到 5：准备阶段进入 balanced 规则；战斗、结算、终局保留原 combatVersion，历史报告不改写。下一轮开始才进入 balanced。tactics 保留 0.5 羁绊和最终野怪配置，legacy 仍保留更早的战斗逻辑。模块验证覆盖战斗逐帧一致、历史回放一致、下一轮切换和资源原样保留，见 `tests/balance-migration.test.ts`。

## schema 6 / singleplayer-0.7

schema 5 继续迁移到 6：准备阶段切换到 signature；进行中的战斗、结算、终局及历史报告保留原 combatVersion，下一轮再切换。legacy、tactics、balanced 三代战斗逻辑均保留。`tests/triggers.test.ts` 覆盖迁移边界及旧版本完整战斗快照哈希。
