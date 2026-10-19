# 验证记录

## 环境

- 日期：2026-10-18
- DSH：`0.2.0-rc.2`，`web` profile（macOS）
- 安装方式：目录 `link:` 安装，插件由 Harness 的 HMR 直接加载

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
| 实时槽位注册 | 客户端 Inspect 查询 `conversation.input.left`，存在 occupant `dsh-provider-peak`（order 11，active） | 通过 |

## 未验证 / 限制

- **视觉未截图**：本环境没有浏览器控制能力，无法目测徽章尺寸、颜色与浅色/深色主题下的对比度；注册与模块加载已由实时 Inspect 确认。
- **未在第二台机器或新 profile 上从 GitHub URL 端到端启动**：发布后如做了这一步，会补充在下方“发布后验证”。
- **未覆盖其他 DSH 版本**：只在 `0.2.0-rc.2` 上验证。

## 手工验证方法

1. 安装后刷新页面，打开任意会话。
2. 选中 DeepSeek 模型：输入框工具栏出现 `空闲` 或 `高峰`，悬停可看到模型、倒计时、切换时刻与规则。
3. 切换到 Xiaomi 等 provider：徽章消失；切回 DeepSeek：恢复显示。
4. 断网或模型目录加载失败时：徽章显示灰色 `未知`。
5. 本地跑 `npm test` 复核规则计算。
