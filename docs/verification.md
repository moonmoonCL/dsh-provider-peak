# 验证记录

## 环境

- 日期：2026-10-18 ～ 2026-10-19
- DSH：`0.2.0-rc.2`，`web` profile（macOS）
- 安装方式：目录 `link:` 安装（开发期）→ GitHub 安装（发布后）

## 已验证

| 项目 | 方法 | 结果 |
| --- | --- | --- |
| JS 语法 | `node --check client.js`、`node --check index.js` | 通过 |
| 包结构 | 检查 `dsh.bundle.patch`、`dsh.client`、`exports`、`files` 与 `locale/*.json` | 通过 |
| 峰谷规则 | `npm test`（8 项） | 通过 |
| 高峰窗口 | 周一 09:30 / 12:30 / 14:30 / 18:30（北京时间）分别判定为 高峰 / 空闲 / 高峰 / 空闲 | 通过 |
| 精确边界 | 08:59:59 空闲、09:00:00 高峰，下次切换落在 09:00 | 通过 |
| 周末 | 周六 10:00、周日 23:11 全天空闲 | 通过 |
| 法定节假日 | 2026-10-02（国庆）10:00 空闲；节前工作日 09-30 高峰；节后 10-08 恢复高峰 | 通过 |
| 跨午休 / 跨周末 | 下次切换分别落在 12:00、14:00、下周一 09:00 | 通过 |
| 倒计时与切换时刻 | 周日 23:11 → `9 小时 49 分钟`、`明天 09:00` | 通过 |
| provider 判定 | `deepseek-official`、`deepseek-account`、pi-ai 的 `deepseek` → 显示；`xiaomi-token-plan-cn`、`openrouter`、`DeepSeek via OpenRouter` → 隐藏 | 通过 |
| 安装与激活 | Harness 安装返回 `application: applied`，无警告 | 通过 |
| 实时槽位注册 | 客户端 Inspect 查询 `conversation.input.left`，存在 occupant `dsh-provider-peak`（active） | 通过 |

## 发布后验证（2026-10-19）

| 项目 | 方法 | 结果 |
| --- | --- | --- |
| 仓库创建 | `gh repo create moonmoonCL/dsh-provider-peak --public --source=. --push` | 成功 |
| GitHub 安装 | 在 `web` profile 中用插件安装器安装 `https://github.com/moonmoonCL/dsh-provider-peak` | `+ dsh-provider-peak github:moonmoonCL/dsh-provider-peak`，`application: applied` |
| 安装内容 | 检查 `node_modules/dsh-provider-peak` | `client.js`、`index.js`、`cordis.patch.yml`、`icon.svg`、`locale/`、`docs/`、README、LICENSE 齐全 |
| profile 记录 | 检查 profile 的 `package.json` 与插件列表 | 依赖为 `github:moonmoonCL/dsh-provider-peak`，插件行 `dsh-provider-peak` 已启用 |
| 实时注册（GitHub 安装版） | 客户端 Inspect 查询 `conversation.input.left` | occupant `dsh-provider-peak`，active |
| hover 修复后重装 | 重新从 GitHub 安装 `v1.1.1`，Inspect 查询槽位 | occupant order 变为 12，说明新模块已加载 |

## 未验证 / 限制

- **视觉未截图**：本环境没有浏览器控制能力，无法目测徽章尺寸、颜色、hover 底色/浮层与浅色/深色主题下的对比度；注册与模块加载已由实时 Inspect 确认。
- **未覆盖其他 DSH 版本**：只在 `0.2.0-rc.2` 上验证。
- **未在干净机器上从零安装**：GitHub 安装是在已有 DSH 安装的 profile 上完成的；`modelDirectories` 等依赖由 Harness 自带。

## 手工验证方法

1. 安装后刷新页面，打开任意会话。
2. 选中 DeepSeek 模型：输入框工具栏出现 `空闲` 或 `高峰`。
3. 悬停或用 Tab 聚焦徽章：徽章出现底色与焦点环，并弹出详情浮层；移开鼠标、失焦或按 Esc 关闭。
4. 切换到 Xiaomi 等 provider：徽章消失；切回 DeepSeek：恢复显示。
5. 断网或模型目录加载失败时：徽章显示灰色 `未知`。
6. 本地跑 `npm test` 复核规则计算。

## OpenCode Go 适配（2026-11-12）

| 项目 | 方法 | 结果 |
| --- | --- | --- |
| 官方价格核对 | 抓取 [OpenCode Go 用量限额表](https://opencode.ai/docs/console/go/) 与 [Console 价格表](https://opencode.ai/docs/console/models/) | Go 只有 `DeepSeek V4.1 Flash`、`DeepSeek V4 Pro` 分峰谷（0.15/0.60 ↔ 0.30/1.20；0.66/1.98 ↔ 1.32/3.96），其余单一价；Console 按量付费的 DeepSeek 是单一价 |
| 窗口一致性 | 对比两张价格页的峰时定义 | 均为 UTC 01:00–04:00、06:00–10:00 周一至周五 = 北京时间 09:00–12:00、14:00–18:00 |
| 节假日差异 | 对比两张价格页脚注 | DeepSeek 官方排除中国法定节假日；Go 未设豁免，工作日假期仍按高峰 |
| 策略分层 | `npm test`（`test/policy.test.mjs`，16 项） | 通过：默认 DeepSeek 策略、Go 策略、节假日分叉、跨周末切换、四个 provider/模型组合、Go 单价表 |
| 组件渲染 | `npm test`（`test/render.test.mjs`，5 项，假 React 跑真实组件） | 通过：`opencode-go` + `deepseek-v4.1-flash` 高峰/空闲分别渲染 `高峰`/`空闲`，浮层含 Go 单价、规则与额度提示且不含节假日行；GLM-5.3 与 Console DeepSeek 不渲染；未知选择渲染 `未知` |
| 语法 | `node --check client.js`、`node --check index.js` | 通过 |

限制：

- 未在真实浏览器里目测新浮层（本环境无浏览器控制）；渲染断言覆盖的是标签与文本内容，不含尺寸与配色。
- 未能把改动装进运行中的 `web` profile（profile 目录在会话工作区之外，写入被沙箱拒绝）。要在界面上看到新徽章，需按下面任一方式更新安装。
- Go 的峰时判定沿用北京时间整点窗口；跨 04:00/10:00 UTC 边界的请求按哪一端计价，官方未公开。

## 浮层错位修复（2026-11-12）

### 现象

同一枚徽章，悬停弹出的详情浮层有时贴着徽章（正确），有时跑到窗口右侧、离徽章几百像素（错误）。两张截图都是 2 倍像素密度（徽章圆点 7 CSS px → 14 设备 px），即 CSS 视口分别是 670×312 与 865×295。

### 定位过程

| 步骤 | 方法 | 结论 |
| --- | --- | --- |
| 量截图 | 无头 Chrome 解码 JPEG，按颜色取包围盒 | 错误图的浮层 x=298、宽 360、右边缘距窗口右沿 12px——正好等于旧代码的右边界夹取 `innerWidth - 360 - 12`（670−372=298）；竖直方向与徽章的间距仍是 8px |
| 查宿主 CSS | 读 `dsh-client-ui-conversation/lib/client.js` 的 `css$4` | 会话激活时 `.wSkVaW_composerSeat` 带 `will-change: transform`（还会 `position: sticky`），`.wSkVaW_root[data-phase=active]` 是 `overflow: hidden` |
| 验证包含块 | 无头 Chrome 最小用例：`#outer{will-change:transform}` 内的 `position:fixed` 子元素 | 确认被劫持：`left:10px` 的子元素渲染在 `outer.left + 10`；`contain: layout`、`backdrop-filter`、`transform` 同样成立；`container-type: inline-size` 不成立 |
| 复现旧行为 | 用宿主真实 `css$4`/`css$1` + 插件 CSS 搭出输入框，面板左边距 300px 模拟侧栏 | 旧代码：徽章 x=476、浮层 x=776，**偏移量正好等于面板偏移 300px**，且浮层右边缘 1136 > 视口 980，被推出窗口外；面板改成 40px 后旧代码仍差 203px（因为它只在悬停那一刻量一次） |
| 同一用例跑新代码 | 同上 | 两次都是 `dx=0`、间距 8px、完全在窗口内 |

根因两条，叠在一起就是"有时对有时错"：

1. **坐标系错**：浮层是输入框子树里的 `position: fixed`。会话一旦进入激活态，输入框所在的 `composerSeat` 因为 `will-change: transform` 成为 fixed 后代的包含块，但代码用的是视口坐标（`getBoundingClientRect` + `window.innerWidth`），于是浮层被整体平移了"面板距窗口左沿"的距离；同时会话视图 `overflow: hidden` 会把浮层裁掉。面板恰好在视口原点时（例如单栏铺满、无侧栏）偏移为 0，看起来就是"对"的。
2. **测量是一次性的**：`show()` 只在悬停那一刻量一次徽章位置，之后窗口/侧栏/宽度手柄引起的回流既不发 `resize` 也不发 `scroll`，浮层就停在旧位置；夹取用的还是"假设浮层正好 360px 宽"，不是实测宽度。

### 修复

`client.js`：

- 浮层改用 `react-dom` 的 `createPortal` 挂到 `document.body`（`react-dom` 是 Harness 平台种子模块，输入框自己的菜单也用它），坐标系回到视口，不再被包含块劫持，也不会被会话视图裁剪。
- 新增纯函数 `placementOf(anchor, tip, viewport)`：按实测的浮层尺寸夹取，12px 边距、8px 间距，上方放不下就翻到下方，窗口比浮层还矮时也保证留在窗口内。
- 打开时先以 `visibility: hidden` 挂载，在 `useLayoutEffect` 里量完再显示，首帧不会闪到左上角。
- 打开期间持续跟随：`resize` / `scroll` 立即重算，另有 100ms 的帧定时采样，覆盖不触发这两个事件的回流；`placement` 未变化时不触发重渲染。
- 顺带修掉：旧代码在 `scroll`/`resize` 时直接关闭浮层，现在改为跟着走。

### 验证

| 项目 | 方法 | 结果 |
| --- | --- | --- |
| 单元测试 | `npm test`（30 项，其中浮层几何 6 项、浮层渲染 2 项） | 通过 |
| 定位几何 | `test/policy.test.mjs` 覆盖：贴左/贴右夹取、翻到下方、超高夹取、超宽收窄、按实测宽度而非 360 固定值夹取 | 通过 |
| 渲染结构 | `test/render.test.mjs`：浮层只 portal 到 `document.body` 一次、测量前 `visibility: hidden`、不在徽章子树里、测量后套用 `left/top/side` | 通过 |
| 真实 CSS 复现 | 无头 Chrome（157）+ 宿主真实 `css$4` / `css$1`，面板偏移 300px 与回流到 40px 两种场景 | 旧代码偏差 300px / 203px 且溢出窗口；新代码两次都 `dx=0`、间距 8px、完全在窗口内 |
| 截图对照 | `?mode=old` / `?mode=new` 同页面对照 | 旧：浮层在窗口右侧被裁；新：浮层正上方贴住徽章 |

限制：

- 未在真实 Harness 会话里用鼠标复现（没有 `dsh web` 的登录 cookie），对照是在能跑宿主真实 CSS 的本地页面里做的；几何与包含块机制是同一套浏览器行为。
- 帧定时采样带来每 100ms 两次 `getBoundingClientRect`，只在浮层打开期间运行。

## 春节倒计时消失（2026-11-12）

### 现象

2026 年春节假期是 9 天（02-15 至 02-23），而 `nextChange` 只往后扫 8 天。节前的周五 18:30 起，它返回 `null`，浮层的「距下次切换还有 …」整行静默消失；单元测试全绿，因为没有任何用例覆盖 2 月。

### 根因

`client.js` 的扫描视界是写死的：

```js
for (let day = 0; day <= 8; day += 1) {
```

国庆（10-01 至 10-07）只跨 7 天，正好落在视界内，所以这个上限一直没被打破。

### 修复

视界改为由假期表推导，不再写死：

```js
const LONGEST_BREAK_DAYS = HOLIDAY_RANGES.reduce(/* 最长区间天数 */);
const NEXT_CHANGE_HORIZON_DAYS = LONGEST_BREAK_DAYS + 8;   // 2026 表：9 + 8 = 17
```

假期表变长时视界自动跟随；没有假期表时回落到 8 天。

### 验证

| 项目 | 方法 | 结果 |
| --- | --- | --- |
| 复现 | 用旧代码跑 `nextChange` | `2026-02-13T10:30Z`（周五 18:30）→ `null`；`2026-02-16T02:00Z` → `2026-02-24T01:00Z`，正好卡在第 8 天 |
| 修复后 | 同上 | 02-13、02-14 → DeepSeek `2026-02-24T01:00Z`（假期后第一个工作日）；Go `2026-02-16T01:00Z`（不豁免，假期内照常高峰） |
| 回归测试 | `test/policy.test.mjs` 新增「the countdown survives a break longer than a week」 | 通过（31 项） |
| 测试有效性 | 把 `/tmp` 副本的视界改回 8 天再跑 | 该用例失败（22 过 / 1 挂），确认它能抓住这个回归 |
| 未回归 | 国庆边界、周末跨越、午休边界用例 | 全部保持通过 |

限制：

- 视界推导只保证「比最长假期更远」，不是无限：若某年出现超过「最长区间 + 8 天」仍无边界的情况，仍会返回 `null`。当前规则下不会发生（最长假期 9 天，节后 1–3 天内必有工作日）。

## 视觉升级：chip 与 tooltip 的动效与排版（2026-11-13）

改动只落在 `client.js` 的 `CSS` 常量与 tooltip 的一个 `data-state` 属性，无逻辑变化。

### 改动内容

- chip：hover/打开态按状态着色（空闲绿 / 高峰琥珀 / 未知中性），过渡 0.16s `cubic-bezier(0.2,0,0,1)`；圆点增 0.3s 颜色过渡与 0.5px 光学居中；高峰圆点 2.4s 呼吸光环。
- tooltip：进入动画 0.16s 淡入 + 4px 位移（按 `data-side` 分方向）；标题行加状态色圆点（经 `data-state` 属性传递，因 tooltip portal 到 `document.body`，祖先选择器不可用）；价格/时间数字 `font-variant-numeric: tabular-nums`；行高 19px、注释区 17px（适配中文）。
- `prefers-reduced-motion: reduce` 下关闭全部动画。

### 验证

| 项目 | 方法 | 结果 |
| --- | --- | --- |
| 语法 / 单测 | `node --check client.js && npm test` | 31 项全部通过 |
| 真实渲染 | 提取真实 `CSS` 构建静态预览页（本会话可视化目录），Chromium 截图后由视觉模型评审两轮 | 圆点居中、行高、层级、内边距通过；评审报告的「文字截断」经 `scrollHeight === clientHeight`（226/226、184/184）证伪，为演示页布局重叠的错觉 |
| portal 后状态色 | 评审第一轮发现 `tipHead::before` 用祖先选择器取不到状态 → 改为 tooltip 自带 `data-state` | 预览页确认标题圆点颜色随状态变化 |
| reduced-motion | CSS 媒体查询静态审查 | 动画全部禁用 |

限制：

- 未在真实 DSH 宿主里验证（不改运行中的 `dsh web`）；token 回退值用接近宿主暗色的模拟值代表。生产环境以宿主 `--dsw-*` 实际取值为准。

## Tooltip 灰底修正：挂到宿主真实弹层 token（2026-11-13）

用户在真实宿主（浅色主题）反馈 tooltip「灰不拉几」。取证与修正：

### 取证

读取宿主主题包 `@deepseek-ai/dsh-client-ui-theme/lib/client.js` 的真实定义（本机 `/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/...`）：

| token | 浅色值 | 暗色值 | 结论 |
| --- | --- | --- | --- |
| `--dsw-alias-bg-overlay` | neutral-bluish-150 = `#e9ecf2`（灰） | neutral-bluish-700 | 原选错了：不是弹层用的色，「灰」的来源 |
| `--dsw-alias-bg-layer-3` | neutral-bluish-00 = `#fff` | neutral-bluish-800 = `#353638` | 宿主弹层（菜单/浮层）实际用的分层表面 |
| `--dsw-alias-label-primary` | `#0f1115` | `#f9fafb` | 正文原来全挂 secondary（700/`#61666b`），偏灰 |
| `--dsw-alias-label-secondary` | `#61666b` | `#cfd3d6` | 适合注释区，不适合正文数据行 |

宿主 UI 包（conversation 等）的弹层样式确实引用 `bg-layer-1/3`，不用 `bg-overlay`。

### 修正（client.js 仅 CSS 常量）

- tooltip 背景：`var(--dsw-alias-bg-layer-3, var(--dsw-alias-bg-overlay))`——老宿主无 layer-3 时回落 overlay
- tooltip 正文：`label-primary`；注释区固定 `label-secondary` 并去掉 0.88 透明度
- tooltip 描边：`border-l2`（浅色 `#0000001a`），白底下轮廓更清楚

### 验证

| 项目 | 方法 | 结果 |
| --- | --- | --- |
| 语法 / 单测 | `node --check client.js && npm test` | 31 项全部通过 |
| 视觉 | 演示页改挂宿主真实 token 值（含 layer-3），Chromium 截图复查 | 浅色 tooltip 白底 + primary 正文，与宿主弹层观感一致；暗色为 800 层面 |
| 中途失误 | CSS 注释里写了反引号截断模板字符串 | `node --check` 抓住，已修复——确认该检查的必要性 |

限制：

- `bg-layer-3` 名字来自当前宿主版本的实现，非公开契约；已用 `var()` 回落链保证老版本不劣化。宿主若改 token 名，回落到 overlay 行为（灰但可用）。
