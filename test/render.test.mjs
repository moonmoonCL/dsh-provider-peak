/**
 * Rendering-level checks: runs the real client module against a tiny React
 * stub, so the chip's label and tooltip text are asserted for each provider
 * family instead of only the pure policy functions.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Values handed to the component's `useState` calls, in call order, so a test
 * can render the tooltip-open branch without a live React runtime.
 */
let statePlan = [];

const fakeReact = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props ?? {}), children },
  }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  useState: (init) => {
    const planned = statePlan.shift();
    const value =
      planned !== undefined
        ? planned.value
        : typeof init === 'function'
          ? init()
          : init;
    return [value, () => {}];
  },
  useRef: (init) => ({ current: init }),
  useEffect: () => {},
  useLayoutEffect: () => {},
  useCallback: (fn) => fn,
  useId: () => 'test-id',
};

/** Portals are recorded instead of appended, so tests can inspect them. */
const portalCalls = [];
const fakeReactDom = {
  createPortal: (children, container) => {
    portalCalls.push({ container });
    return { type: 'portal', props: { container, children: [children] } };
  },
};

const requireStub = (id) => {
  if (id === 'react') return fakeReact;
  if (id === 'react-dom') return fakeReactDom;
  throw new Error(`unexpected require: ${id}`);
};

let factory;
globalThis.document = {
  body: { nodeType: 1 },
  visibilityState: 'visible',
  addEventListener() {},
  removeEventListener() {},
};
globalThis.window = {
  __ModuleLoader__: {
    load: (module) => {
      factory = module.factory;
    },
  },
  innerWidth: 1200,
  innerHeight: 800,
  requestAnimationFrame() {},
  cancelAnimationFrame() {},
  addEventListener() {},
  removeEventListener() {},
};

await import('../client.js');

let Badge;
factory(requireStub).apply({
  effect(create) {
    create();
  },
  locale: { register() {} },
  slots: {
    inject(_name, register) {
      register();
    },
    register(_definition, component) {
      Badge = component;
    },
  },
  modelDirectories: {},
});

assert.ok(typeof Badge === 'function', 'the slot must register a component');

/** Locale stub: keys stay visible and params are inlined for assertions. */
const t = (key, params) =>
  params === undefined ? key : `${key}(${JSON.stringify(params)})`;

const groups = [
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    models: [
      { id: 'opencode-go/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash 1017' },
      { id: 'opencode-go/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
      { id: 'opencode-go/glm-5.3', name: 'GLM-5.3' },
    ],
  },
  {
    id: 'opencode',
    name: 'Personal / OpenCode',
    models: [{ id: 'opencode/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }],
  },
  {
    id: 'deepseek-official',
    name: 'DeepSeek',
    models: [{ id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' }],
  },
];

const directory = (current) => ({
  subscribe() {},
  getSnapshot: () => ({ current, groups, status: 'ready' }),
});

/**
 * Render with the component's state pre-set: `now`, then `open`, then the
 * `placement` the layout effect would have produced.
 */
function renderWith(plan, current, iso) {
  const realNow = Date.now;
  Date.now = () => Date.parse(iso);
  statePlan = plan;
  try {
    return Badge({ t, modelDirectory: directory(current) });
  } finally {
    statePlan = [];
    Date.now = realNow;
  }
}

function render(current, iso) {
  const realNow = Date.now;
  Date.now = () => Date.parse(iso);
  try {
    return Badge({ t, modelDirectory: directory(current) });
  } finally {
    Date.now = realNow;
  }
}

/** Depth-first search of the element tree. */
function findAll(node, predicate, found = []) {
  if (node === null || node === undefined || typeof node !== 'object') return found;
  if (predicate(node)) found.push(node);
  for (const child of node.props?.children ?? []) findAll(child, predicate, found);
  return found;
}

function chipOf(tree) {
  const chips = findAll(
    tree,
    (node) => node.props?.className === 'dsh-provider-peak',
  );
  assert.equal(chips.length, 1, 'exactly one chip');
  const [chip] = chips;
  const detail = findAll(
    tree,
    (node) => node.props?.id === 'test-id',
  ).map((node) => node.props.children);
  return {
    state: chip.props['data-state'],
    label: findAll(
      chip,
      (node) => node.props?.className === 'dsh-provider-peak__label',
    )[0].props.children[0],
    detail: detail.join(' '),
  };
}

const PEAK = '2026-11-12T06:30:00Z'; // Thu 14:30 Beijing
const OFF_PEAK = '2026-11-12T04:30:00Z'; // Thu 12:30 Beijing, lunch break

test('Go DeepSeek model at peak: 高峰 chip with Go rates and no holiday note', () => {
  const chip = chipOf(render({ provider: 'opencode-go', model: 'opencode-go/deepseek-v4.1-flash' }, PEAK));
  assert.equal(chip.state, 'peak');
  assert.equal(chip.label, 'peak');
  assert.match(chip.detail, /api\.opencodeGo/);
  assert.match(chip.detail, /state\.peak/);
  assert.match(chip.detail, /price\.split/);
  assert.match(chip.detail, /"peakIn":"0\.30"/);
  assert.match(chip.detail, /"offOut":"0\.60"/);
  assert.match(chip.detail, /price\.peak/);
  assert.match(chip.detail, /next\.toIdle/);
  assert.match(chip.detail, /rules\.opencodeGo/);
  assert.match(chip.detail, /go\.limit/);
  assert.doesNotMatch(chip.detail, /holidays/, 'Go has no holiday exemption');
});

test('Go DeepSeek model off-peak: 空闲 chip', () => {
  const chip = chipOf(render({ provider: 'opencode-go', model: 'opencode-go/deepseek-v4-pro' }, OFF_PEAK));
  assert.equal(chip.state, 'idle');
  assert.equal(chip.label, 'idle');
  assert.match(chip.detail, /price\.idle/);
  assert.match(chip.detail, /next\.toPeak/);
  assert.match(chip.detail, /"peakIn":"1\.32"/);
});

test('DeepSeek route keeps its holiday note and rules', () => {
  const chip = chipOf(render({ provider: 'deepseek-official', model: 'deepseek-flash' }, PEAK));
  assert.equal(chip.state, 'peak');
  assert.match(chip.detail, /api\.deepseek/);
  assert.match(chip.detail, /rules\.deepseek/);
  assert.match(chip.detail, /holidays/);
  assert.doesNotMatch(chip.detail, /price\.split/, 'no Go rate table here');
  assert.doesNotMatch(chip.detail, /go\.limit/);
});

test('flat-rate routes render no chip at all', () => {
  assert.equal(
    render({ provider: 'opencode-go', model: 'opencode-go/glm-5.3' }, PEAK),
    null,
    'GLM-5.3 on Go is flat-rate',
  );
  assert.equal(
    render({ provider: 'opencode', model: 'opencode/deepseek-v4.1-flash' }, PEAK),
    null,
    'Console pay-as-you-go bills DeepSeek flat',
  );
});

test('an unresolved selection renders the neutral 未知 chip', () => {
  const chip = chipOf(render(null, PEAK));
  assert.equal(chip.state, 'unknown');
  assert.equal(chip.label, 'unknown');
  assert.match(chip.detail, /unknown\.detail/);
});

test('the tooltip is portaled out of the composer, hidden until measured', () => {
  portalCalls.length = 0;
  const tree = render(
    { provider: 'opencode-go', model: 'opencode-go/deepseek-v4.1-flash' },
    PEAK,
  );
  // Closed: no tooltip at all — the details live in the visually hidden text.
  assert.equal(
    findAll(tree, (node) => node.props?.className === 'dsh-provider-peak__tooltip').length,
    0,
  );
  assert.equal(portalCalls.length, 0, 'nothing is portaled while closed');
});

test('the open tooltip is portaled to the document, hidden until measured', () => {
  portalCalls.length = 0;
  const tree = renderWith(
    [undefined, { value: true }, { value: null }],
    { provider: 'opencode-go', model: 'opencode-go/deepseek-v4.1-flash' },
    PEAK,
  );
  assert.equal(portalCalls.length, 1, 'the tooltip is portaled exactly once');
  assert.equal(portalCalls[0].container, globalThis.document.body);

  const [tooltip] = findAll(
    tree,
    (node) => node.props?.className === 'dsh-provider-peak__tooltip',
  );
  assert.ok(tooltip, 'the tooltip is rendered while open');
  assert.equal(tooltip.props.style.visibility, 'hidden', 'hidden before measuring');
  assert.equal(tooltip.props.style.left, '0px');
  assert.equal(tooltip.props.style.top, '0px');

  const [chip] = findAll(
    tree,
    (node) => node.props?.className === 'dsh-provider-peak',
  );
  assert.equal(
    findAll(chip, (node) => node.props?.className === 'dsh-provider-peak__tooltip').length,
    0,
    'the tooltip is not nested inside the chip',
  );
});

test('a measured tooltip is placed from the placement result', () => {
  const tree = renderWith(
    [undefined, { value: true }, { value: { left: 321, top: 210, side: 'top' } }],
    { provider: 'opencode-go', model: 'opencode-go/deepseek-v4.1-flash' },
    PEAK,
  );
  const [tooltip] = findAll(
    tree,
    (node) => node.props?.className === 'dsh-provider-peak__tooltip',
  );
  assert.equal(tooltip.props.style.visibility, 'visible');
  assert.equal(tooltip.props.style.left, '321px');
  assert.equal(tooltip.props.style.top, '210px');
  assert.equal(tooltip.props['data-side'], 'top');
});
