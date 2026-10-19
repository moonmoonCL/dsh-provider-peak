import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const start = source.indexOf('// --- policy logic');
const end = source.indexOf('// --- end policy logic');
assert.ok(start >= 0 && end > start, 'client.js must keep the policy logic markers');

const policy = new Function(
  `${source.slice(start, end)}\n` +
    'return { isPeak, nextChange, describeGap, describeWhen, isDeepSeekProvider, modelNameOf };',
)();

const instant = (iso) => Date.parse(iso);
const asIso = (ms) => (ms === null ? null : new Date(ms).toISOString());

const providers = [
  { id: 'deepseek-official', name: 'DeepSeek' },
  { id: 'deepseek-account', name: 'DeepSeek Account' },
  { id: 'deepseek', name: 'deepseek' },
  { id: 'xiaomi-token-plan-cn', name: 'xiaomi-token-plan-cn' },
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'deepseek-via-openrouter', name: 'DeepSeek via OpenRouter' },
];

test('weekday peak windows, with the lunch break off-peak', () => {
  assert.equal(policy.isPeak(instant('2026-10-19T01:30:00Z')), true, 'Mon 09:30 Beijing');
  assert.equal(policy.isPeak(instant('2026-10-19T04:30:00Z')), false, 'Mon 12:30 Beijing');
  assert.equal(policy.isPeak(instant('2026-10-19T06:30:00Z')), true, 'Mon 14:30 Beijing');
  assert.equal(policy.isPeak(instant('2026-10-19T10:30:00Z')), false, 'Mon 18:30 Beijing');
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

test('Chinese statutory holidays are off-peak all day', () => {
  assert.equal(policy.isPeak(instant('2026-10-02T02:00:00Z')), false, 'National Day Fri 10:00');
  assert.equal(policy.isPeak(instant('2026-10-08T02:00:00Z')), true, 'first workday after it');
  assert.equal(policy.isPeak(instant('2026-09-30T02:00:00Z')), true, 'day before National Day');
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

test('only DeepSeek provider routes qualify', () => {
  assert.equal(policy.isDeepSeekProvider('deepseek-official', providers), true);
  assert.equal(policy.isDeepSeekProvider('deepseek-account', providers), true);
  assert.equal(policy.isDeepSeekProvider('deepseek', providers), true, 'pi-ai route named deepseek');
  assert.equal(policy.isDeepSeekProvider('xiaomi-token-plan-cn', providers), false);
  assert.equal(policy.isDeepSeekProvider('openrouter', providers), false);
  assert.equal(policy.isDeepSeekProvider('deepseek-via-openrouter', providers), false);
});

test('model names fall back to the model id', () => {
  const groups = [
    {
      id: 'deepseek-official',
      name: 'DeepSeek',
      models: [{ id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash' }],
    },
  ];
  assert.equal(
    policy.modelNameOf(groups, { provider: 'deepseek-official', model: 'deepseek-flash' }),
    'DeepSeek V4.1 Flash',
  );
  assert.equal(
    policy.modelNameOf(groups, { provider: 'deepseek-official', model: 'retired-model' }),
    'retired-model',
  );
  assert.equal(
    policy.modelNameOf(groups, { provider: 'missing', model: 'whatever' }),
    'whatever',
  );
});
