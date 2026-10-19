# DeepSeek 峰谷提示（dsh-provider-peak）

DSH（DeepSeek Harness）Web 插件。在会话输入框工具栏常驻一枚小徽章，显示 DeepSeek API 当前按**高峰**还是**空闲**价计费；徽章跟随当前选中的模型，只有模型属于 DeepSeek 的 provider 时才出现。

- `● 空闲`（绿点）：空闲时段，价格为高峰价的 5 折
- `● 高峰`（黄点）：高峰时段，按标准价计费
- 悬停查看：当前模型、距下次切换多久、切换时刻（北京时间）、计费规则、节假日数据覆盖年份
- 选中 Xiaomi 等其他 provider：徽章自动隐藏
- 模型信息尚未解析或加载失败：灰色 `未知`
- 中英双语，跟随界面语言；零依赖、免构建，装上即用

## 安装

### 插件页（推荐）

1. 打开 DSH Web。
2. 进入 **设置 → 插件**，在安装框粘贴仓库地址：

   ```text
   https://github.com/moonmoonCL/dsh-provider-peak
   ```

3. 安装后刷新页面。

### 命令行

```sh
dsh plugin --profile <profile> add https://github.com/moonmoonCL/dsh-provider-peak
```

`desktop` 配置档由 Electron 独占，只能走界面。安装后刷新页面。

### 本地开发

```sh
git clone https://github.com/moonmoonCL/dsh-provider-peak
dsh plugin --profile web add /path/to/dsh-provider-peak
```

目录安装是 `link:`，改完 `client.js` 刷新页面即可，不必重装。

## 峰谷规则

| 时段 | 北京时间 | 价格 |
| --- | --- | --- |
| 高峰 | 周一至周五 09:00–12:00、14:00–18:00（不含中国法定节假日） | 标准价 |
| 空闲 | 其余全部时间，含周末与法定节假日全天 | 高峰价的 50% |

规则与价格以 [DeepSeek 官方价格页](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) 为准（核对于 2026-10-18）。

## 哪些 provider 会显示

| 选中的 provider | 徽章 |
| --- | --- |
| `deepseek-official` / `deepseek-account`（内置 DeepSeek） | `高峰` / `空闲` |
| 名称为 `DeepSeek` 的 provider（如 pi-ai 里配置、指向 api.deepseek.com 的 `deepseek` 路由） | `高峰` / `空闲` |
| 其他 provider（`xiaomi-token-plan-cn`、名称不是 DeepSeek 的第三方中转等） | 隐藏 |
| 模型信息尚未解析 / 加载失败 | `未知` |

判定逻辑在 `client.js` 的 `DEEPSEEK_PROVIDER_IDS` 与 `DEEPSEEK_PROVIDER_NAME`。

## 法定节假日

内置 2026 年国务院办公厅公布的 7 段假期（元旦、春节、清明、劳动节、端午、中秋、国庆），落在工作日的假期会让当天全天空闲。2027 年安排通常在 2026 年 11 月公布，届时更新 `client.js`：

```js
const HOLIDAY_RANGES = [/* ... */];
const HOLIDAY_COVERAGE = '2026';
```

节假日数据未覆盖的年份仍按“周一至周五 + 两个高峰窗口”判断，不会报错，只是不识别新年份的假期。

## 自定义

| 想改什么 | 位置 |
| --- | --- |
| provider 白名单 | `client.js` 的 `DEEPSEEK_PROVIDER_IDS` / `DEEPSEEK_PROVIDER_NAME` |
| 高峰窗口 | `client.js` 的 `PEAK_WINDOWS` |
| 节假日 | `client.js` 的 `HOLIDAY_RANGES` / `HOLIDAY_COVERAGE` |
| 文案 | `client.js` 的 `DICT`（zh / en）；插件卡标题在 `locale/*.json` |

修改后刷新页面（目录安装）或重新安装（GitHub 安装）。

## 结构

| 文件 | 作用 |
| --- | --- |
| `client.js` | 全部浏览器端逻辑：槽位注册、locale 文案、选中模型读取、峰谷计算与徽章渲染 |
| `index.js` | Host 端空插件（渲染全部在 Client） |
| `cordis.patch.yml` | 安装时插入的插件行 |
| `locale/{zh,en}.json` | 插件管理页的标题与描述 |
| `test/policy.test.mjs` | 峰谷与 provider 判定的单元测试 |
| `docs/verification.md` | 验证记录与限制 |
| `icon.svg` | 插件图标 |

## 开发与测试

```sh
node --check client.js
npm test
```

测试使用 `node:test`，从 `client.js` 的 `// --- policy logic` 标记块中取出纯函数执行，不依赖浏览器。

## 兼容性

- 在 DSH `0.2.0-rc.2` 上开发与验证。
- 使用 Harness 自带能力：`conversation.input.left` 槽位、`ctx.modelDirectories` 服务、`ctx.locale`、`--dsw-alias-*` 主题 token。
- 只引用主题 token，深浅色主题都跟随宿主；没有引用任何 Harness Client 包。
- DSH 若调整槽位名、模型目录服务或 locale API，需要跟着更新。

## 验证状态

见 [docs/verification.md](docs/verification.md)：逻辑单测、安装与实时槽位注册已覆盖；视觉外观在无浏览器控制的环境下未截图验证。

## License

[MIT](LICENSE)
