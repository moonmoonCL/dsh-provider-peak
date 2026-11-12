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
