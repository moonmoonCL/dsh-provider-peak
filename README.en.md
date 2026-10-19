# DeepSeek peak-hours badge (dsh-provider-peak)

*[中文](README.md) · English*

A DSH (DeepSeek Harness) Web plugin. It renders a compact badge in the session composer toolbar showing whether the DeepSeek API is currently billed at **peak** or **off-peak** rates. The badge follows the model selected in the current Session and only appears when that model belongs to a DeepSeek provider.

- `● Off-peak` (green): off-peak hours, half of the peak rate
- `● Peak` (amber): peak hours, standard rate
- Hover for the current model, time until the next switch, the switch instant (Beijing time), the rule, and the holiday-data coverage
- Selecting another provider (e.g. Xiaomi) hides the badge
- An unresolved model selection renders a neutral `Unknown` chip
- Bilingual (Chinese / English), follows the UI locale; zero dependencies, no build step

## Install

### Plugin page (recommended)

1. Open DSH Web.
2. Go to **Settings → Plugins** and paste:

   ```text
   https://github.com/moonmoonCL/dsh-provider-peak
   ```

3. Refresh the page after installation.

### CLI

```sh
dsh plugin --profile <profile> add https://github.com/moonmoonCL/dsh-provider-peak
```

The `desktop` profile is managed by Electron and only accepts the UI path. Refresh the page after installation.

### Local development

```sh
git clone https://github.com/moonmoonCL/dsh-provider-peak
dsh plugin --profile web add /path/to/dsh-provider-peak
```

A directory install is a `link:`: edit `client.js`, refresh the page, and no reinstall is needed.

## Billing rule

| Period | Beijing time | Price |
| --- | --- | --- |
| Peak | Mon–Fri 09:00–12:00 and 14:00–18:00, excluding Chinese public holidays | standard |
| Off-peak | every other instant, including weekends and holidays in full | 50% of peak |

Source: [DeepSeek API Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing) (checked 2026-10-18).

## Which providers show the badge

| Selected provider | Badge |
| --- | --- |
| `deepseek-official` / `deepseek-account` (bundled DeepSeek) | `Peak` / `Off-peak` |
| A provider named `DeepSeek` (e.g. a pi-ai route pointing at api.deepseek.com) | `Peak` / `Off-peak` |
| Any other provider (e.g. `xiaomi-token-plan-cn`, third-party gateways) | hidden |
| Model information unresolved / failed to load | `Unknown` |

The rule lives in `DEEPSEEK_PROVIDER_IDS` and `DEEPSEEK_PROVIDER_NAME` in `client.js`.

## Chinese public holidays

The 2026 State Council schedule ships with the plugin (seven holiday periods). A weekday that falls inside one of them is off-peak for the whole day. When the 2027 schedule is published (usually November), update:

```js
const HOLIDAY_RANGES = [/* ... */];
const HOLIDAY_COVERAGE = '2026';
```

Years outside the table fall back to the weekday/window rule only; nothing breaks.

## Customize

| Change | Where |
| --- | --- |
| Provider allowlist | `DEEPSEEK_PROVIDER_IDS` / `DEEPSEEK_PROVIDER_NAME` in `client.js` |
| Peak windows | `PEAK_WINDOWS` in `client.js` |
| Holidays | `HOLIDAY_RANGES` / `HOLIDAY_COVERAGE` in `client.js` |
| Wording | `DICT` (zh / en) in `client.js`; plugin-card text in `locale/*.json` |

Refresh the page (directory install) or reinstall (GitHub install) after editing.

## Layout

| File | Purpose |
| --- | --- |
| `client.js` | All browser-side logic: slot registration, locale dictionaries, model lookup, schedule computation, badge rendering |
| `index.js` | Empty Host plugin (all rendering is client-side) |
| `cordis.patch.yml` | Plugin row inserted on install |
| `locale/{zh,en}.json` | Plugin-manager title and description |
| `test/policy.test.mjs` | Schedule and provider-classification tests |
| `docs/verification.md` | Verification record and limits |
| `icon.svg` | Plugin icon |

## Develop and test

```sh
node --check client.js
npm test
```

Tests use `node:test` and extract the pure functions from the `// --- policy logic` block in `client.js`; no browser is needed.

## Compatibility

- Developed and verified on DSH `0.2.0-rc.2`.
- Uses built-in Harness surfaces: the `conversation.input.left` slot, the `ctx.modelDirectories` service, `ctx.locale`, and `--dsw-alias-*` theme tokens.
- Only theme tokens are referenced, so light and dark themes follow the host; no Harness Client package is imported.
- A changed slot name, model-directory service, or locale API in DSH requires a matching update here.

## Verification

See [docs/verification.md](docs/verification.md). Unit tests, directory and GitHub installation, and the live slot registration were verified; visual appearance has not been captured as a screenshot in a browser-controlled environment.

## License

[MIT](LICENSE)
