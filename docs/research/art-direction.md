# 美术参考与制作规范

## 已找到的美术入口

[yang qi917 作品集（S08）](https://yangqi917.artstation.com/)中有以下明确标题，可作为继续采集的定位锚点：

- `RED TIDES_ UI design sketch`：UI 设计草图。
- `RED TIDES_ Art book_01` 与 `RED TIDES # Art book cover`：画册相关作品。
- `RED TIDES_CG_ Storyboards`：CG 分镜。
- `RED TIDES_story card_012` 等：故事卡插画。
- `RED TIDES_ Minion`、`RED TIDES_Iron Dog`：角色/单位作品。

这些条目属于整个赤潮项目，目前未逐张确认与自走棋版本的对应关系，也未下载原始资产。[S07 实机评测](https://games.sina.cn/wm/2019-05-06/detail-ihvhiqax6883923.d.html)可作为棋盘、图鉴、羁绊和伤害列表的 UI 对照来源。

## 当前原型的原创视觉方案

采用暗色科幻战术桌面：蓝灰金属底色、青绿己方标识、赭红敌方标识、金色经济信息。棋盘是视觉焦点；左右信息面板提供人口经济、羁绊与排名；底部固定逻辑位置展示备战席与商店。当前棋子使用字符徽记和 CSS 几何表现，未使用原画冒充游戏可用模型。

- 背景 `#11191e`；面板 `#192329`；己方 `#83bdb7`；敌方 `#db694f`；金币 `#dfbc7c`。
- 字体 Noto Sans SC / Rajdhani；在线字体不可达时回退系统字体。
- 棋子必须同时有名称、阵营、星级与血条，不能仅依赖颜色区分。
- 桌面三栏布局；窄屏将棋盘前置，商店允许横向滚动。
- 战斗伤害列表和技能闪光用于观察反馈，后续再增加弹道、受击、死亡和音效。

## 后续资源规范

拟定路径：`public/assets/units/{id}/`，内容包括 `portrait.webp`、动画图集、图集描述与授权/来源条目。2D 方案先用 256px 头像和统一 128px 透明动画帧；状态包含 idle/move/attack/cast/hit/death。相机、角色脚底锚点、阵营底座和尺寸需要统一。

若追求原作 3D 观感，需另立 Three.js/glTF 渲染里程碑，制作模型、骨骼动画、材质与 LOD。不要在逻辑引擎中引入渲染对象。美术进入正式构建前记录作者、来源和使用许可；公开展示作品链接不等于拥有贴图/模型资源文件。
