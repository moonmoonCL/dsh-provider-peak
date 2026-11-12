<!-- FOR AI AGENTS - Human readability is a side effect, not a goal -->
<!-- Managed by agent: keep sections and order; edit content, not structure -->
<!-- Last updated: 2026-11-12 -->

# AGENTS.md — `test/`

Scope: everything under `test/`. The root [`AGENTS.md`](../AGENTS.md) still applies.

## Overview

Both files run under plain `node --test`. No third-party test framework, no jsdom, no browser: each file fakes whatever the client module needs.

| File | Cases | What it proves |
| --- | --- | --- |
| `policy.test.mjs` | 23 | Schedule math, provider/model classification, holiday handling, tooltip geometry — the pure functions only |
| `render.test.mjs` | 8 | The component's chip label and tooltip content per provider family, and that the tooltip is portaled and hidden until measured |

What they do **not** prove: anything interactive. See "the stub is inert" below.

## Setup

Nothing to install; `client.js` is read from disk and evaluated in-process.

```sh
node --version   # 22 in CI; anything with node:test works
```

## Commands

| Task | Command |
| --- | --- |
| Everything | `npm test` (glob is `test/*.test.mjs` — a file that does not match never runs) |
| One file | `node --test test/policy.test.mjs` |
| Matching cases | `node --test --test-name-pattern="tooltip" test/render.test.mjs` (regex; matches 3 cases) |
| Syntax of the module under test | `node --check client.js` (cannot catch ESM syntax — see root) |

## `policy.test.mjs` — slicing contract

The test does not import `client.js` (it is a browser script). It reads the file as text, slices from `// --- policy logic` to `// --- end policy logic`, and evaluates the slice:

```js
const start = source.indexOf('// --- policy logic');
const end = source.indexOf('// --- end policy logic');
const policy = new Function(`${source.slice(start, end)}\n return { isPeak, ... }`)();
```

Rules that keep this working:

- The two outer markers must stay, in that order, with the end marker last. A third, cosmetic pair (`// --- tooltip geometry (pure) ---` … `// --- end tooltip geometry logic ---`) sits inside the slice; it is a comment, not a boundary.
- The slice must not touch `window`, `document`, timers, or React at definition time — it runs in a bare function scope.
- The export list is the `return { ... }` **inside the `new Function` template at the top of this file**, not anything in `client.js`. A new pure helper stays invisible to every test until it is named there.
- Anything the slice references (`PEAK_WINDOWS`, `HOLIDAY_RANGES`, the policy objects) must live inside the slice too, or evaluation throws `ReferenceError`.

Assertions use fixed UTC instants (`instant('2026-10-19T01:30:00Z')` = Monday 09:30 Beijing), never `Date.now()`.

## `render.test.mjs` — stub wiring

The file fakes the host before importing the module:

1. `globalThis.document` and `globalThis.window` are hand-built; `window.__ModuleLoader__.load` captures `module.factory`.
2. `await import('../client.js')` runs the file; the captured factory is then called with `requireStub`.
3. `requireStub` answers only `react` and `react-dom` and **throws on any other id** — that throw is the guard against adding a dependency.
4. The fake React provides `createElement`, `useState`, `useRef`, `useEffect`, `useLayoutEffect`, `useSyncExternalStore`, `useCallback`, `useId`, `Fragment`.
5. `apply()` gets a context stub: `slots.inject(name, register)` calls `register()` immediately, `slots.register(def, component)` captures the component, `locale.register()` is a no-op.
6. `createPortal` records its container into `portalCalls` instead of mounting — that is how the "portaled to `document.body`" assertion works.

### The stub is inert — it validates output only

Wire these into your expectations before trusting a green run:

- `useState` setters are `() => {}`; `useEffect` / `useLayoutEffect` never run; `useSyncExternalStore` calls `getSnapshot()` inline; `useId` always returns `'test-id'`; the component is invoked as a plain function.
- Therefore hover, focus, Escape, the `place()` measurement, `visibilitychange`, and the rAF follow loop are **never executed** in tests. Interaction and measurement regressions do not show up here.
- There is **no hook-order validation**. A conditional hook, or a hook after an early `return`, passes these tests and crashes real React. Keep every hook unconditional and above the flat-rate early return.
- `Date.now` is patched by the render helper to the case's instant; switching the component to `new Date()` or `performance.now()` silently re-introduces real time.

### Three coupling points

- **Hook order matters.** `statePlan` feeds `useState` values in call order: first `now`, then the open flag, then the measured `placement`. Inserting a `useState` earlier shifts every planned value.
- **Assertions are on locale keys, not translations.** The `t` stub returns the key with params inlined as JSON, so assertions read `peak-hint({"model":"..."})`-style strings. A `DICT` rename breaks them even when the UI is correct — and a broken `NS` does not break them at all, because `locale.register` is stubbed.
- **The store contract is real.** `modelDirectory.getSnapshot()` must return `{ current, groups }` with `groups` an array; `peakPolicyOf` calls `groups.find` and throws on `undefined`.

## Code style

- `node:test` + `node:assert/strict`; one behaviour per `test()` with a sentence-style name.
- Deterministic inputs only: fixed instants, fixed fixtures, no randomness, no network.
- Assert the thing that can regress (label, rate pair, clamp distance), not incidental structure.
- Test names read as facts ("tooltip opens above the chip, left-aligned with it"), so a failure explains itself.

## Security

- Tests never touch the network, spawn processes, or read anything outside the repo.
- Never put a token, cookie, or real account data in a fixture — provider and model ids are the only identifiers needed.
- Never point these tests at a live `dsh web` instance or a real profile directory; the module is exercised through stubs only.

## Examples

Good — a classification case that pins both the chip and the reason:

```js
test('Go DeepSeek model at peak: 高峰 chip with Go rates and no holiday note', () => { ... });
```

Good — geometry case that would catch the old hard-coded width:

```js
test('the clamp uses the measured tooltip width, not an assumed maximum', () => { ... });
```

Bad — anything time-dependent:

```js
assert.equal(isPeak(Date.now(), policy), true);   // flaky by construction
```

Bad — importing the module directly instead of slicing it:

```js
import { isPeak } from '../client.js';            // fails: client.js is a browser script
```

## Adding a case

- Classification or schedule change → add a row to the provider matrix in `policy.test.mjs`; assert chip state and, for Go, the rate pair. A new rate pair also needs a holiday-window case if the model is Go.
- New tooltip field or wording → assert in `render.test.mjs` through the `t` key stub, and cover the unknown/unresolved case.
- Geometry change → extend the `placementOf` cases (left/right clamp, flip below, taller than viewport) and keep the measured-width case.
- Time-horizon change → the tooltip countdown comes from `nextChange`, whose horizon is derived from the longest holiday block. Keep the 2026-02-13/14 case: it is what fails if the horizon shrinks or a longer break is added without a matching case.
- A change that needs a real browser (CSS containment, portal placement against host styles) cannot be asserted here; prove it another way and log it in [`docs/verification.md`](../docs/verification.md).

## Checklist

- [ ] `node --check client.js && npm test` green, output pasted as evidence.
- [ ] No new dev dependency; the `requireStub` throw still guards the module graph.
- [ ] New pure function registered in the `new Function` return list.
- [ ] Fixed instants only, no wall-clock reads.
- [ ] A `DICT` key rename was mirrored in the assertions.
- [ ] Any new hook added to the fake React, and placed unconditionally.

## When stuck

- Slice throws → the marker pair moved, or the sliced code now references something defined outside it.
- `Cannot find module 'react'` → the stub wiring was bypassed; the module must be loaded through `window.__ModuleLoader__`.
- Test passes but the UI is wrong → the assertion is probably on a stub value rather than the component's output; check `statePlan` order, and remember interaction code never runs here.
