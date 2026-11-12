import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const start = source.indexOf('// --- policy logic');
const end = source.indexOf('// --- end policy logic');
assert.ok(start >= 0 && end > start, 'client.js must keep the policy logic markers');

const policy = new Function(
  `${source.slice(start, end)}\n` +
    'return { isPeak, nextChange, describeGap, describeWhen, peakPolicyOf, ' +
    'ratesOf, money, modelNameOf, placementOf, VIEWPORT_MARGIN, ANCHOR_GAP, ' +
    'DEEPSEEK_POLICY, OPENCODE_GO_POLICY };',
)();

const instant = (iso) => Date.parse(iso);
const asIso = (ms) => (ms === null ? null : new Date(ms).toISOString());

const deepseek = policy.DEEPSEEK_POLICY;
const go = policy.OPENCODE_GO_POLICY;

const providers = [
  { id: 'deepseek-official', name: 'DeepSeek', models: [] },
  { id: 'deepseek-account', name: 'DeepSeek Account', models: [] },
  { id: 'deepseek', name: 'deepseek', models: [] },
  { id: 'opencode-go', name: 'OpenCode Go', models: [] },
  { id: 'opencode', name: 'Personal / OpenCode', models: [] },
  { id: 'xiaomi-token-plan-cn', name: 'xiaomi-token-plan-cn', models: [] },
  { id: 'openrouter', name: 'OpenRouter', models: [] },
  { id: 'deepseek-via-openrouter', name: 'DeepSeek via OpenRouter', models: [] },
];

const selection = (provider, model) => ({ provider, model });

test('weekday peak windows, with the lunch break off-peak', () => {
  assert.equal(policy.isPeak(instant('2026-10-19T01:30:00Z'), deepseek), true, 'Mon 09:30 Beijing');
  assert.equal(policy.isPeak(instant('2026-10-19T04:30:00Z'), deepseek), false, 'Mon 12:30 Beijing');
  assert.equal(policy.isPeak(instant('2026-10-19T06:30:00Z'), deepseek), true, 'Mon 14:30 Beijing');
  assert.equal(policy.isPeak(instant('2026-10-19T10:30:00Z'), deepseek), false, 'Mon 18:30 Beijing');
});

test('peak windows switch on the exact minute', () => {
  assert.equal(policy.isPeak(instant('2026-10-19T00:59:59Z')), false, '08:59:59 Beijing');
  assert.equal(policy.isPeak(instant('2026-10-19T01:00:00Z')), true, '09:00:00 Beijing');
  assert.equal(
    asIso(policy.nextChange(instant('2026-10-19T00:59:59Z'))),
    '2026-10-19T01:00:00.000Z',
  );
});

test('weekends are off-peak all day', () => {
  assert.equal(policy.isPeak(instant('2026-10-24T02:00:00Z')), false, 'Sat 10:00 Beijing');
  assert.equal(policy.isPeak(instant('2026-10-18T15:11:00Z')), false, 'Sun 23:11 Beijing');
});

test('DeepSeek route: Chinese statutory holidays are off-peak all day', () => {
  assert.equal(
    policy.isPeak(instant('2026-10-02T02:00:00Z'), deepseek),
    false,
    'National Day Fri 10:00',
  );
  assert.equal(
    policy.isPeak(instant('2026-10-08T02:00:00Z'), deepseek),
    true,
    'first workday after it',
  );
  assert.equal(
    policy.isPeak(instant('2026-09-30T02:00:00Z'), deepseek),
    true,
    'day before National Day',
  );
});

test('OpenCode Go: same windows, no holiday exemption', () => {
  assert.equal(
    policy.isPeak(instant('2026-10-02T02:00:00Z'), go),
    true,
    'National Day Fri 10:00 is still peak on Go',
  );
  assert.equal(
    policy.isPeak(instant('2026-10-02T04:30:00Z'), go),
    false,
    'National Day 12:30 sits in the lunch break',
  );
  assert.equal(
    policy.isPeak(instant('2026-09-30T02:00:00Z'), go),
    true,
    'weekday morning is peak on both routes',
  );
});

test('next switch crosses the lunch break and the weekend', () => {
  assert.equal(
    asIso(policy.nextChange(instant('2026-10-19T01:30:00Z'))),
    '2026-10-19T04:00:00.000Z',
    '09:30 peak ends at 12:00',
  );
  assert.equal(
    asIso(policy.nextChange(instant('2026-10-19T04:30:00Z'))),
    '2026-10-19T06:00:00.000Z',
    'lunch break ends at 14:00',
  );
  assert.equal(
    asIso(policy.nextChange(instant('2026-10-23T10:30:00Z'))),
    '2026-10-26T01:00:00.000Z',
    'Friday 18:30 waits for Monday 09:00',
  );
  assert.equal(
    asIso(policy.nextChange(instant('2026-10-23T10:30:00Z'), go)),
    '2026-10-26T01:00:00.000Z',
    'Go shares the weekend gap',
  );
});

test('DeepSeek holiday boundary drives the next switch', () => {
  // 2026-09-30 16:00 Beijing is still a normal workday peak: it ends at 18:00
  // that same evening on both routes.
  assert.equal(
    asIso(policy.nextChange(instant('2026-09-30T08:00:00Z'), deepseek)),
    '2026-09-30T10:00:00.000Z',
  );
  // From 18:30 that evening the two routes diverge: DeepSeek skips National
  // Day and resumes on the 8th, Go resumes at 09:00 on the 1st (a holiday).
  assert.equal(
    asIso(policy.nextChange(instant('2026-09-30T10:30:00Z'), deepseek)),
    '2026-10-08T01:00:00.000Z',
  );
  assert.equal(
    asIso(policy.nextChange(instant('2026-09-30T10:30:00Z'), go)),
    '2026-10-01T01:00:00.000Z',
  );
});

test('the countdown survives a break longer than a week', () => {
  // Spring Festival 2026 runs 9 days (02-15..02-23). A fixed 8-day scan
  // returned null here, which drops the countdown row from the tooltip.
  assert.equal(
    asIso(policy.nextChange(instant('2026-02-13T10:30:00Z'), deepseek)),
    '2026-02-24T01:00:00.000Z',
    'Friday 18:30 before the break waits for the first workday after it',
  );
  assert.equal(
    asIso(policy.nextChange(instant('2026-02-14T02:00:00Z'), deepseek)),
    '2026-02-24T01:00:00.000Z',
    'a Saturday inside the break still finds the far side',
  );
  assert.equal(
    asIso(policy.nextChange(instant('2026-02-13T10:30:00Z'), go)),
    '2026-02-16T01:00:00.000Z',
    'Go has no holiday exemption, so it resumes inside the break',
  );
});

test('remaining-time and switch-time descriptions', () => {
  const now = instant('2026-10-18T15:11:00Z');
  const next = policy.nextChange(now);
  assert.deepEqual(policy.describeGap(next - now), {
    key: 'gap.hoursMinutes',
    params: { hours: 9, minutes: 49 },
  });
  assert.deepEqual(policy.describeWhen(next, now), {
    key: 'when.tomorrow',
    params: { time: '09:00' },
  });
});

test('DeepSeek routes always carry the DeepSeek policy', () => {
  for (const provider of ['deepseek-official', 'deepseek-account', 'deepseek']) {
    assert.equal(
      policy.peakPolicyOf(selection(provider, 'deepseek-flash'), providers),
      deepseek,
      provider,
    );
  }
});

test('OpenCode Go only reports its two DeepSeek models', () => {
  assert.equal(
    policy.peakPolicyOf(selection('opencode-go', 'deepseek-v4.1-flash'), providers),
    go,
    'bare id',
  );
  assert.equal(
    policy.peakPolicyOf(
      selection('opencode-go', 'opencode-go/deepseek-v4.1-flash'),
      providers,
    ),
    go,
    'prefixed id, as the catalog lists it',
  );
  assert.equal(
    policy.peakPolicyOf(selection('opencode-go', 'opencode-go/deepseek-v4-pro'), providers),
    go,
  );
  assert.equal(
    policy.peakPolicyOf(selection('opencode-go', 'opencode-go/glm-5.3'), providers),
    null,
    'flat-rate Go model',
  );
  assert.equal(
    policy.peakPolicyOf(
      selection('opencode-go', 'opencode-go/deepseek-v4.1-flash-free'),
      providers,
    ),
    null,
    'the free variant is not peak-priced',
  );
});

test('the flat-price Console provider stays out', () => {
  assert.equal(
    policy.peakPolicyOf(selection('opencode', 'opencode/deepseek-v4.1-flash'), providers),
    null,
    'pay-as-you-go Console bills DeepSeek flat',
  );
  assert.equal(
    policy.peakPolicyOf(selection('opencode', 'opencode/gpt-6.1-sol'), providers),
    null,
  );
});

test('other providers stay out', () => {
  for (const provider of [
    'xiaomi-token-plan-cn',
    'openrouter',
    'deepseek-via-openrouter',
  ]) {
    assert.equal(
      policy.peakPolicyOf(selection(provider, 'deepseek-v4.1-flash'), providers),
      null,
      provider,
    );
  }
});

test('an unknown provider id is screened out, not guessed', () => {
  assert.equal(
    policy.peakPolicyOf(selection('acme-gateway', 'deepseek-v4.1-flash'), providers),
    null,
  );
});

test('Go rates are published per model', () => {
  assert.deepEqual(policy.ratesOf(selection('opencode-go', 'deepseek-v4.1-flash')), {
    peak: [0.3, 1.2],
    offPeak: [0.15, 0.6],
  });
  assert.deepEqual(policy.ratesOf(selection('opencode-go', 'opencode-go/deepseek-v4-pro')), {
    peak: [1.32, 3.96],
    offPeak: [0.66, 1.98],
  });
  assert.equal(policy.ratesOf(selection('opencode-go', 'deepseek-v4.1-flash-x')), null);
  assert.equal(policy.money(0.3), '0.30');
  assert.equal(policy.money(1.98), '1.98');
});

test('model names fall back to the model id', () => {
  const groups = [
    {
      id: 'opencode-go',
      name: 'OpenCode Go',
      models: [
        { id: 'opencode-go/deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash 1017' },
      ],
    },
  ];
  assert.equal(
    policy.modelNameOf(groups, {
      provider: 'opencode-go',
      model: 'opencode-go/deepseek-v4.1-flash',
    }),
    'DeepSeek V4.1 Flash 1017',
  );
  assert.equal(
    policy.modelNameOf(groups, { provider: 'opencode-go', model: 'retired-model' }),
    'retired-model',
  );
  assert.equal(
    policy.modelNameOf(groups, { provider: 'missing', model: 'whatever' }),
    'whatever',
  );
});

test('a renamed id falls back to the catalog name, but not to the free variant', () => {
  const groups = [
    {
      id: 'opencode-go',
      name: 'OpenCode Go',
      models: [
        { id: 'deepseek-v4.1-flash-preview', name: 'DeepSeek V4.1 Flash 1017' },
        { id: 'deepseek-v41-flash-free', name: 'DeepSeek V4.1 Flash Free' },
      ],
    },
  ];
  assert.equal(
    policy.peakPolicyOf(selection('opencode-go', 'deepseek-v4.1-flash-preview'), groups),
    go,
  );
  assert.equal(
    policy.peakPolicyOf(selection('opencode-go', 'deepseek-v41-flash-free'), groups),
    null,
  );
});

// --- tooltip geometry -------------------------------------------------------

/** A chip rect, built from its top-left corner; the chip is 55x28. */
const chipAt = (left, top) => ({
  left,
  top,
  right: left + 55,
  bottom: top + 28,
  width: 55,
  height: 28,
});

const viewportOf = (width, height) => ({ width, height });

test('tooltip opens above the chip, left-aligned with it', () => {
  const placement = policy.placementOf(
    chipAt(300, 600),
    { width: 360, height: 200 },
    viewportOf(1200, 800),
  );
  assert.deepEqual(placement, { left: 300, top: 600 - 8 - 200, side: 'top' });
});

test('tooltip keeps the chip gap and stays inside the viewport edges', () => {
  const narrow = policy.placementOf(
    chipAt(2, 600),
    { width: 360, height: 200 },
    viewportOf(1200, 800),
  );
  assert.equal(narrow.left, policy.VIEWPORT_MARGIN, 'left edge margin');

  const wide = policy.placementOf(
    chipAt(1000, 600),
    { width: 360, height: 200 },
    viewportOf(1200, 800),
  );
  assert.equal(wide.left, 1200 - 12 - 360, 'right edge margin');

  const nearBottom = policy.placementOf(
    chipAt(300, 100),
    { width: 200, height: 200 },
    viewportOf(1200, 200),
  );
  assert.equal(nearBottom.top, policy.VIEWPORT_MARGIN, 'top edge margin');
});

test('the clamp uses the measured tooltip width, not an assumed maximum', () => {
  // A 300px tooltip hugging the right edge has 88px of slack, not 28px: the
  // old code reserved a fixed 360px and pushed the box needlessly left.
  const placement = policy.placementOf(
    chipAt(600, 400),
    { width: 300, height: 100 },
    viewportOf(700, 600),
  );
  assert.equal(placement.left, 700 - 12 - 300);
});

test('tooltip flips below the chip when the top edge is too close', () => {
  const placement = policy.placementOf(
    chipAt(300, 100),
    { width: 360, height: 300 },
    viewportOf(1200, 800),
  );
  assert.equal(placement.side, 'bottom');
  assert.equal(placement.top, 100 + 28 + 8);
});

test('a tooltip taller than the window is clamped, never pushed off-screen', () => {
  const placement = policy.placementOf(
    chipAt(300, 260),
    { width: 360, height: 480 },
    viewportOf(1200, 300),
  );
  assert.equal(placement.top, policy.VIEWPORT_MARGIN);
  assert.equal(placement.left, 300);
});

test('a tooltip wider than the window is narrowed to the margins', () => {
  const placement = policy.placementOf(
    chipAt(10, 200),
    { width: 900, height: 100 },
    viewportOf(320, 600),
  );
  assert.equal(placement.left, policy.VIEWPORT_MARGIN);
  assert.equal(placement.top, 200 - 8 - 100);
});
