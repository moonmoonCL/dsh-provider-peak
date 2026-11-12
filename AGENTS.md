<!-- FOR AI AGENTS - Human readability is a side effect, not a goal -->
<!-- Managed by agent: keep sections and order; edit content, not structure -->
<!-- Last updated: 2026-11-12 -->

# AGENTS.md

**Precedence:** the **closest `AGENTS.md`** to the files you're changing wins. Root holds global defaults only.

## What this is

A DSH (DeepSeek Harness) Web **client** plugin: one badge in the session composer toolbar showing whether the selected model is billed at peak or off-peak rates. All browser-side logic lives in one file, no build step, zero runtime dependencies. The Host half (`index.js`) is an empty `apply()`.

## Commands

| Task | Command | ~Time | Notes |
| --- | --- | --- | --- |
| Syntax check | `node --check client.js` | <1s | also `node --check index.js`; both run in CI. **Cannot catch ESM syntax — see below** |
| Test (all) | `npm test` | <1s | 30 `node:test` cases, no browser |
| Test (one file) | `node --test test/policy.test.mjs` | <1s | 22 cases |
| Test (matching cases) | `node --test --test-name-pattern="tooltip" test/render.test.mjs` | <1s | regex over case names, not a single case |
| Package preview | `npm pack --dry-run` | ~1s | expect 13 files / ~229 kB, no tarball written |
| Publish | `npm publish` | ~5s | `publishConfig` pins `registry.npmjs.org`; see the staging note below |

CI (`.github/workflows/test.yml`) runs only the two `node --check` calls and `npm test`. If a change cannot be verified by those, prove it another way and record how in `docs/verification.md`.

`npm test` is `node --test test/*.test.mjs`: a new test file that does not match that glob is silently never run.

## File map

| File | Role |
| --- | --- |
| `client.js` | Everything browser-side: module registration, peak policy, tooltip geometry, `DICT` copy, CSS, component, slot registration |
| `index.js` | Host stub: `export function apply() {}` |
| `cordis.patch.yml` | Bundle patch that inserts the plugin row on install; its `id` must match the slot id in `client.js` |
| `locale/{zh,en}.json` | Plugin-manager card title and description |
| `test/policy.test.mjs` | Slices the pure block out of `client.js` and exercises it |
| `test/render.test.mjs` | Renders the real component against stubbed React/ReactDOM |
| `docs/verification.md` | Verification log — **Chinese**, append a new dated `##` section; older counts in it are stale |
| `docs/images/{badge,tooltip}.png` | README screenshots |
| `README.md` / `README.en.md` | User-facing docs, must stay in step with each other |
| `icon.svg` | Plugin icon |

## Hard constraints

### The client module is a classic browser script, not ESM

`client.js` contains **no `import` and no `export`**. It is loaded as a plain script that registers a factory:

```js
window.__ModuleLoader__.load({
  id: 'dsh-provider-peak',
  factory(require) { const React = require('react'); ... },
});
```

Inside the factory only `require('react')` and `require('react-dom')` are available, plus what the file defines itself.

**The trap:** `package.json` sets `"type": "module"`, so `node --check client.js` parses the file as ESM and happily accepts a stray `import`/`export` — verified. Such a change passes CI and `npm test` but the browser script fails to parse, the factory never registers, and the plugin silently disappears. Do not add module syntax; if you must load something else, add it to the factory's `require` stub in `test/render.test.mjs` too (it throws on unknown ids).

### The tooltip is portaled, with an intentional in-place fallback

An active session gives the composer seat `will-change: transform`, which makes it the containing block for `position: fixed` descendants, and the session view clips overflow. A tooltip inside that subtree drifts by the panel offset and gets cropped, so the tooltip is a `createPortal` child of `document.body`, mounted `visibility: hidden`, placed in `useLayoutEffect` from measured sizes, then shown. While open it re-measures on `resize`/`scroll` plus a 100 ms frame sample, because reflows (sidebar, width handle) fire neither event.

`atDocumentLevel()` deliberately returns the node unportaled when `react-dom` or `document.body` is unavailable. Keep that fallback; do not "simplify" it into a hard dependency.

### Tests slice one marker pair out of `client.js`

`test/policy.test.mjs` reads `client.js` as text, takes everything from `// --- policy logic` up to `// --- end policy logic`, and evaluates it with `new Function`. That span currently runs from the policy constants through the tooltip geometry helpers, and contains a **third, cosmetic marker pair** (`// --- tooltip geometry (pure) ---` … `// --- end tooltip geometry logic ---`) that is a comment only, not a boundary.

Consequences:

- Never rename or remove the two outer markers, and keep the closing one last.
- Everything a test needs must sit between them: moving it below `// --- end policy logic` makes the slice throw `ReferenceError` at load time.
- The sliced region must not touch `window`, `document`, timers, or React at definition time.
- The tests' export list is the `return { ... }` inside the `new Function` template at the top of `test/policy.test.mjs`, not anything in `client.js`. A new pure helper is invisible to tests until it is named there.

### No runtime dependencies, no build step

`react` and `react-dom` arrive as Harness platform seeds; there is no third-party test framework (only `node:test`) and no bundler. Style only through host `--dsw-*` tokens — `--dsw-alias-*` for color, `--dsw-radius-*` / `--dsw-elevation-*` for shape and shadow — each with a literal fallback; add no hard-coded colors.

### Identifiers must agree in three places

`NS = 'dsh-provider-peak'` (used for `ctx.locale.register(NS, DICT)` and the slot's `locale`), the slot `id`, and the row `id` in `cordis.patch.yml` all have to match. The render tests stub the locale, so breaking any of them leaves 30 green tests and a UI that prints raw keys.

The component also declares `order: 12`, which positions it in the tool row; nothing tests that.

### Copy lives in two places, pricing data in one

`DICT` (in `client.js`) holds in-UI strings; `locale/{zh,en}.json` holds the plugin-card text. Every key needs both `zh` and `en`. Pricing and schedule data:

| What | Where |
| --- | --- |
| Peak windows | `PEAK_WINDOWS` |
| Holiday table and its coverage year | `HOLIDAY_RANGES`, `HOLIDAY_COVERAGE` |
| Go per-model rates | `OPENCODE_GO_RATES` |
| Provider detection | `DEEPSEEK_PROVIDER_IDS` / `DEEPSEEK_PROVIDER_NAME`, `OPENCODE_GO_PROVIDER_IDS` / `OPENCODE_GO_PROVIDER_NAME` |
| Which Go models split by time | `OPENCODE_GO_PEAK_MODELS`, name fallback `OPENCODE_GO_PEAK_MODEL_NAME` |

Two frozen policy objects (`DEEPSEEK_POLICY`, `OPENCODE_GO_POLICY`) carry the difference as `holidaysExempt`: a weekday inside a Chinese public holiday is off-peak all day for DeepSeek's own API, and still peak for OpenCode Go. A new family gets its own policy object, not a branch on provider id.

Three silent-miss traps live here:

- **Rates vs models.** Adding a model to `OPENCODE_GO_PEAK_MODELS` without adding it to `OPENCODE_GO_RATES` keeps the badge but silently drops the per-million price row (`ratesOf` returns `null`). No test covers the new pair.
- **`nextChange` only scans 8 days** while the 2026 Spring Festival block is 9 days long. From 2026-02-13/14 it returns `null`, and the tooltip silently omits the "time until the next switch" row. Verified against the current code; extend the horizon or add a February case when touching holidays.
- **`HOLIDAY_COVERAGE` is display-only.** A new year's table without bumping it shows the wrong coverage year in the tooltip, and nothing fails.

### Never restart the user's `dsh web` server

It is the process serving the GUI the user is talking to. Client-side changes reach the browser by refreshing the page (the `web` profile here is configured with `patchReload: live`). To install or update a plugin, edit the profile, not the running server.

## Workflow

1. Read the nearest `AGENTS.md` (this file, then [`test/`](./test/AGENTS.md) when touching tests).
2. Edit `client.js` surgically, keeping the file's order: header comment → policy + geometry (inside the marker pair) → `DICT` → CSS → component → registration.
3. Run `node --check client.js` and `npm test`; add a case for every new branch. Neither can prove a browser-only behaviour — see the ESM trap above.
4. Update `docs/verification.md` when the evidence came from outside the unit tests (real CSS, headless browser, a live install). It is written in Chinese; add a new dated section rather than editing old numbers.
5. Mirror any user-visible change in both READMEs, and in both `locale` files if the card changed.
6. If you add a file that must ship (a locale file, an asset), add it to `package.json` `files` **and** `exports`; otherwise the published tarball and the runtime import map disagree.

## Publishing and local install

| Goal | Command |
| --- | --- |
| Normal release | bump `version` → commit → `npm publish` |
| Accounts/policies that stage publishes | `npm stage publish`, then `npm stage list` → `npm stage approve <stage-id>` (approve needs 2FA; a staged first publish also creates the `0.0.0-stage` placeholder) |
| Align the tag | point `vX.Y.Z` at the commit whose tree was published, not at a later docs commit |
| Update the local install | `dsh plugin --profile web add dsh-provider-peak@latest` |
| Track `main` instead of releases | `dsh plugin --profile web add "github:moonmoonCL/dsh-provider-peak"` |
| Dev loop | `dsh plugin --profile web add /abs/path/to/repo` (a `link:`; edit and refresh) |
| Check installed version | `node -e "console.log(require('$HOME/.dsh/profiles/web/node_modules/dsh-provider-peak/package.json').version)"` |

`dsh plugin` forwards its arguments verbatim to pnpm inside `~/.dsh/profiles/<name>`. `publishConfig` keeps publishes on the public registry even when the machine default is a read-only mirror (npmmirror); `npm deprecate` does **not** honour `publishConfig` and needs `--registry=https://registry.npmjs.org` plus a web auth flow.

## Distribution status

Perishable — update when it changes, and never duplicate it into the READMEs. Published as `dsh-provider-peak` on npm (`npm view dsh-provider-peak version` beats trusting a note here). The dshopen.org index takes a submission issue on `polang233/dsh-plugin-index`, and a listing badge only works once listed. dsh-plugin.market and dshbase crawl the GitHub `dsh-plugin` topic; a direct submission there is also possible.

## Boundaries

### Always do

- Run `node --check client.js` and `npm test` before committing; paste the output when claiming it works.
- Keep `README.md` and `README.en.md` in step, and both locale files in step.
- Use conventional commits (`fix:`, `feat:`, `docs:`, `chore:`), messages in English like the existing history, one logical change per commit.
- Record non-unit-test evidence in `docs/verification.md` with the date and the method.

### Ask first

- Adding any dependency or build step.
- Changing the slot name (`conversation.input.left`), the slot id, or the injected services. Services are declared in **three** places: `client.js`'s `inject: [...]`, `package.json`'s `dsh.client.inject` (platform package names), and the context stub in `test/render.test.mjs`.
- Changing peak/off-peak rules, rates, or the holiday table — they follow published pricing.
- Anything that restarts or reconfigures the user's running DSH.

### Never do

- Commit secrets, tokens, or the contents of `~/.npmrc`.
- Publish while the working tree is dirty with unrelated changes.
- Change `publishConfig` away from the public registry.
- `git push --force` a branch; re-pointing a release tag is the only expected force-push.

## Terminology

| Term | Means |
| --- | --- |
| chip / badge | The tool-row element: `● 高峰` (amber) or `● 空闲` (green) |
| tooltip | The portaled detail panel that opens on hover or keyboard focus |
| peak window | Mon–Fri 09:00–12:00 and 14:00–18:00 Beijing time |
| split / flat rate | Whether **that model's** price depends on the time of day. It is per model, not per provider: `opencode-go` splits for its two DeepSeek models and is flat for the rest, which then show no badge |
| DSH | DeepSeek Harness, the host application |

## Index of scoped AGENTS.md

Agents: when you read or edit files in a listed directory, load its `AGENTS.md` first. It overrides this root file.

| Directory | Covers |
| --- | --- |
| [`test/`](./test/AGENTS.md) | Test harness internals: policy slicing, React stubs, adding cases |
