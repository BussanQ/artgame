# 本地存档与战报

存档格式 `schema: 32`，规则版本随 `RULES.version` 保存。代码位于 `src/engine/persistence.ts`；基础验证为 `tests/persistence.test.ts`，增量迁移由对应版本模块验证。

历史 singleplayer-0.12：schema 10 顺序迁移至 11，准备阶段升级 fleet；战斗、结算、终局及历史报告保留原 combatVersion，下一回合才切换。不改变金币、生命、商店、棋子、装备或卡池。轰炸机初始能量、引导冷却及四空军闪避按保存版本结算。`tests/fleet-balance.test.ts` 验证迁移及旧 airsea 完整快照，详见 [0.12 说明](fleet-balance.md)。

历史 singleplayer-0.13：schema 11 → 12 仅补入藤妖、骨龙、树妖卡池及规则版本；所有阶段保留 combatVersion、既有商店、资源、棋子和历史战报。新增兵种沿用 fleet 战斗版本，原 32 棋子战斗行为不变；残魂是战斗临时状态，不进入持久阵容。四阶段迁移和旧 fleet 完整快照由 tests/immortality.test.ts 验证。

历史 singleplayer-0.14：schema 12 → 13 补入三枚灵能棋子的卡池，保留所有阶段的 combatVersion、经济、阵容和历史。仍沿用 fleet；旧 35 棋子中只有真人具备灵能，不能单独激活新羁绊，旧回放不会获得反伤。四阶段迁移验证见 tests/psychic.test.ts。

历史 singleplayer-0.15：schema 13 → 14 仅补六枚新棋子的卡池，所有阶段保持经济、商店、阵容与历史。沿用 fleet；旧 38 棋子中只有骨龙新增猛禽，单独不能激活，原阵容战斗不变。声波、减速、吞噬次数与蓄力为战斗临时状态，通过同一确定性模拟恢复，不写回持久棋子。tests/wild.test.ts 覆盖四阶段迁移。

历史 singleplayer-0.16：schema 14 → 15 不改变卡池、经济、商店、阵容或历史；准备阶段进入 metamorph，进行中的战斗、结算和终局保留原 combatVersion，下一轮再升级。血鹰形态与连击只存在于战斗快照，由保存的版本确定性重建。旧 fleet 血鹰继续使用突袭吸血。四阶段迁移及完整/快速/Worker 一致性见 tests/metamorphosis.test.ts。

历史 singleplayer-0.17：schema 15 → 16 仅补不死鸟卡池 15 份，保留所有阶段的战斗版本、资源、阵容、商店与历史；仍使用 metamorph。火种、孵化计时和引导由战斗重建，均不写回持久棋子。schema 14 → 15 的中间版本保持字面值，不能直接跳至最新 schema。必要迁移和旧回放回归见 tests/phoenix.test.ts、tests/metamorphosis.test.ts。

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

## schema 7 / singleplayer-0.8

schema 6 继续迁移到 7：准备阶段切换到 summons；在途战斗、结算、终局及历史报告保持原战斗版本，下一轮再切换。幼狼是临时战斗单位，不写入持久阵容或卡池，回放时按保存版本重建。四代旧规则完整快照一致，迁移与资源边界见 `tests/summons.test.ts` 和 [召唤说明](summons.md)。

## schema 8 / singleplayer-0.9

schema 7 补入真人与须弥鲨的卡池，准备阶段切换 legions，在途、结果、终局及历史版本保持原样，下一轮再升级。新增召唤物仍不进入持久阵容。三阶段迁移与旧回放验证见 `tests/legions.test.ts` 和 [召唤职业说明](legions.md)。

## schema 9 / singleplayer-0.10

schema 8 补入四种异虫卡池，准备阶段升级 brood，在途及历史规则保留。异虫 Piece.copies 记录实际合成份数，出售与淘汰按此返还；验证存档时同步校验份数区间及共享卡池守恒。详见 insects.md。

## schema 10 / singleplayer-0.11

schema 9 补六种空海卡池，准备阶段升级 airsea，在途及历史规则保留，下一回合切换。闪避使用局部确定性随机，完整/快速/恢复模拟一致。迁移不改现有金币、库存、棋子或战报；三阶段覆盖见 tests/airsea.test.ts。

历史 singleplayer-0.18：schema 16 → 17 仅补幻鲸卡池 10 份，所有阶段保留战斗版本、金币、商店、棋子、装备、历史和播放状态。旧 schema 15 必须先按字面版本 0.17 升至 16，再进入本迁移。新兵种沿用 metamorph，不改变旧 45 棋子的战斗算法。见 tests/whale.test.ts。

## schema 18 / 规则 0.19

schema17/0.18仅补军医共享卡池45份；保留资源、阵容、商店和回放版本。schema16先升级到字面0.18再继续迁移，旧存档不能跳过中间卡池补充。master仅修改显示名称，ID不变。

## schema19 / 规则0.20

schema18/0.19增量补火焰兵30份和投弹手15份；combatVersion保持metamorph，旧三步兵阵容不变。新六步兵档仅新棋子加入后可达。四阶段迁移与回放一致通过定向验证。

## schema20 / 规则0.21

schema19/0.20仅补motorcycle共享卡池25份，保留旧战斗版本及所有资源/商店/战报；schema18先升级至字面0.20。准备/战斗/结算/终局迁移与战斗恢复见motorcycle.test.ts。

## schema21 / 规则0.22

递增收入只修改结算公式，schema20迁移仅更新版本元信息。当前金币、历史收益、回放、卡池和商店均保留；新的基础奖励从下一个未结算回合起生效，不补发过去回合。旧准备/战斗/结算/终局四阶段及上版卡池迁移已验证，详见[economy-growth.md](economy-growth.md)。

## schema22 / 规则0.23

准备阶段切换infantry战斗版本；在途战斗、结算、终局和历史报告保留原版本，下一轮准备才切换。20组旧版本完整帧哈希不变，四阶段迁移保留资源和播放状态，见[步兵编队](infantry-formation.md)。

## schema23 / 规则0.24

schema22/0.23仅补铁狗45份卡池；保留所有阶段资源、combatVersion、商店、阵容、战报与播放状态。前一步的中间规则固定为0.23。四阶段与旧回放验证见[铁狗](irondog.md)。

## schema 24 / singleplayer-0.25

schema23 / 0.24迁移至24：仅在缺少该键时补入特种兵25份共享卡池，并更新规则标记；准备、战斗、结算、终局均保留combatVersion、资源、商店、棋子、装备、战报和播放状态。schema22→23固定写入0.24后继续顺序迁移。锁定的目标UID、瞄准进度与伤害快照由确定性回放重建；不写入持久阵容。四阶段迁移、进行中回放逐帧一致和真实付费升星见 `tests/specialist.test.ts` 与[特种兵说明](specialist.md)。

## schema 25 / singleplayer-0.26

schema24 / 0.25仅补入缺失的鸟骑兵45份卡池和新规则标记。四个阶段的战斗版本、资源、商店、棋子、历史和播放状态均保留；schema23先迁至固定0.25，再继续升级。普通射击计数、强化箭目标与蓄力状态由确定性模拟恢复，不写入持久阵容。四阶段迁移与进行中回放一致见 `tests/birdrider.test.ts`。

## schema 26 / singleplayer-0.27

schema25/0.26→26仅在缺少铁猿时新增30份卡池，保持原商店、资源、阵容、战报、战斗版本与播放状态。上一步固定写入0.26再顺序迁移；战斗瞬态由确定性引擎恢复。四阶段迁移与旧回放验证见 tests/ironape.test.ts。

## schema 28 / singleplayer-0.29

从0.28升级时，准备阶段使用 `armored`；battle/result/finished保留原版本，到下一次准备切换。经济、卡池、棋子、AI风格、播放位置和历史保持。0.22迁移中间边界固定为 `infantry`。校验器接受新版本的当前局与历史记录，新增11组覆盖54种棋子的0.28完整逐帧冻结样本，详见[装甲与爆破](armor-blast.md)。

## schema 27 / singleplayer-0.28

新局AI保存可选 `Player.aiProfile` 字符串标识，包含8种已知风格；玩家本人不接受该字段，损坏/未知标识拒绝载入。schema26/0.27→27只更新封套，不为旧对手重分配、不消耗随机数、不动资源、商店、历史或播放状态；缺少字段时仍按原座位解析。旧铁猿迁移固定写入0.27后顺序升级。四阶段完整状态保持及Worker一致性见 tests/ai-doctrines.test.ts。

## schema 29 / singleplayer-0.30

从schema28/0.29迁移仅补缺失的15份四费铁鸡卡池，不改变经济、AI风格、战斗版本、棋子、商店、装备、历史战报或播放位置。上一阶段迁移固定写入0.29后再继续。prepare/battle/result/finished均有精确相等验证，战斗中恢复逐帧相同。新增11组0.29 `armored` 回放冻结，覆盖之前54种棋子。见[铁鸡](ironrooster.md)。

## schema 30 / singleplayer-0.31

新局保存 `bannedSeries`，恰好 3 个不重复的已知种族。准备、战斗、结算、终局和 Worker 恢复均保留禁用；刷新与下一轮不重新抽取。禁用棋子的卡池、商店、持有份数必须合计为零，历史玩家/PvP阵容也不能含禁用棋子；PvE守军不受限制。

schema29 / singleplayer-0.30 顺序迁移只升级存档封套，Game 和历史回放原样保留。没有 `bannedSeries` 的旧比赛继续完整卡池，只有新开比赛才应用随机禁用。12组旧战斗快照、四阶段迁移及损坏禁用字段由 `tests/rotation.test.ts` 验证，见[系列禁用](species-rotation.md)。

## schema 31 / singleplayer-0.32

schema30只补缺失斧奴卡池：傀儡被禁用时为0，允许招募时为45份。保留禁用、资源、商店、持有棋子、AI风格、历史与播放位置，不重新抽取禁用。上一步迁移固定写入0.31再顺序升级；八类阶段/禁用组合及战斗恢复见 `tests/axethrall.test.ts` 和[斧奴说明](axethrall.md)。

## schema 32 / singleplayer-0.33

schema31只补缺失剑奴卡池：傀儡禁用为0，允许招募为30份。保留禁用结果、资源、商店、阵容、装备、历史与回放位置，战斗版本继续armored。上一步固定迁移到0.32后顺序升级。八种阶段/禁用组合及恢复战斗一致性见 `tests/swordthrall.test.ts`。
