/**
 * Client half of dsh-provider-peak.
 *
 * Shows a compact chip in the composer tool row (`conversation.input.left`)
 * that tells, at a glance, whether the DeepSeek API is currently billed at
 * peak or off-peak rates. The chip stays short ("高峰" / "空闲"); the native
 * tooltip carries the details (model, next switch, rule, holiday coverage).
 *
 * The chip only appears when the Session's selected model belongs to a
 * DeepSeek provider. Selecting another provider hides it; an unresolved
 * selection renders a neutral "未知" chip instead of guessing.
 *
 * Billing rule, from the official pricing page (api-docs.deepseek.com):
 *   Peak: Beijing time (UTC+8), Monday through Friday, 09:00-12:00 and
 *         14:00-18:00, excluding Chinese statutory holidays.
 *   Off-peak: every other instant (weekends and holidays in full), billed at
 *         half of the peak rate.
 *
 * The holiday table is data, not logic: refresh it when the State Council
 * publishes the next year's arrangement.
 */

window.__ModuleLoader__.load({
  id: 'dsh-provider-peak',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-provider-peak';
    /** Recompute cadence: the visible text changes at most once a minute. */
    const TICK_MS = 30 * 1000;

    // --- policy logic (pure; kept free of React so tests can extract it) ---

    // Beijing time is a fixed UTC+8 offset: China observes no daylight saving.
    const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
    const MINUTE_MS = 60 * 1000;
    const DAY_MS = 24 * 60 * 60 * 1000;

    // Peak windows as [start, end) in minutes after Beijing midnight.
    const PEAK_WINDOWS = [
      [9 * 60, 12 * 60],
      [14 * 60, 18 * 60],
    ];

    // Every instant where the peak/off-peak answer can change, in minutes after
    // Beijing midnight: midnight flips weekends and holidays on or off.
    const BOUNDARY_MINUTES = PEAK_WINDOWS.reduce(
      (minutes, [start, end]) => minutes.concat(start, end),
      [0],
    );

    // Chinese statutory holiday periods, inclusive, in Beijing time:
    // 国务院办公厅关于 2026 年部分节假日安排的通知 (国办发明电〔2025〕7号).
    const HOLIDAY_RANGES = [
      ['2026-01-01', '2026-01-03'], // 元旦
      ['2026-02-15', '2026-02-23'], // 春节
      ['2026-04-04', '2026-04-06'], // 清明节
      ['2026-05-01', '2026-05-05'], // 劳动节
      ['2026-06-19', '2026-06-21'], // 端午节
      ['2026-09-25', '2026-09-27'], // 中秋节
      ['2026-10-01', '2026-10-07'], // 国庆节
    ];
    const HOLIDAY_COVERAGE = '2026';

    // Provider routes that serve DeepSeek's own API: the two built-in routes
    // (official key and DeepSeek account) plus a user-configured route that
    // names itself DeepSeek, such as a pi-ai profile pointing at
    // api.deepseek.com. Third-party providers that happen to resell DeepSeek
    // models keep their own name and stay excluded.
    const DEEPSEEK_PROVIDER_IDS = new Set(['deepseek-official', 'deepseek-account']);
    const DEEPSEEK_PROVIDER_NAME = /^deepseek(?:\s+(?:official|account))?$/i;

    function pad2(value) {
      return String(value).padStart(2, '0');
    }

    function dateKey(year, month, day) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }

    function expandHolidays(ranges) {
      const days = new Set();
      for (const [from, to] of ranges) {
        const start = Date.parse(`${from}T00:00:00Z`);
        const end = Date.parse(`${to}T00:00:00Z`);
        for (let at = start; at <= end; at += DAY_MS) {
          const date = new Date(at);
          days.add(dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
        }
      }
      return days;
    }

    const HOLIDAYS = expandHolidays(HOLIDAY_RANGES);

    /** Beijing wall-clock fields for one instant. */
    function beijing(ms) {
      const date = new Date(ms + BEIJING_OFFSET_MS);
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        weekday: date.getUTCDay(),
        minutes: date.getUTCHours() * 60 + date.getUTCMinutes(),
      };
    }

    /** Whole days since the epoch on the Beijing calendar. */
    function beijingDay(ms) {
      return Math.floor((ms + BEIJING_OFFSET_MS) / DAY_MS);
    }

    /** True when `ms` falls inside a billed peak window. */
    function isPeak(ms) {
      const local = beijing(ms);
      if (local.weekday === 0 || local.weekday === 6) return false;
      if (HOLIDAYS.has(dateKey(local.year, local.month, local.day))) return false;
      return PEAK_WINDOWS.some(
        ([start, end]) => local.minutes >= start && local.minutes < end,
      );
    }

    /** First instant after `now` whose peak/off-peak state differs, or null. */
    function nextChange(now) {
      const current = isPeak(now);
      const base = beijing(now);
      for (let day = 0; day <= 8; day += 1) {
        for (const minutes of BOUNDARY_MINUTES) {
          const at =
            Date.UTC(base.year, base.month - 1, base.day + day, 0, minutes) -
            BEIJING_OFFSET_MS;
          if (at > now && isPeak(at) !== current) return at;
        }
      }
      return null;
    }

    /** Locale key + params for the remaining time until a switch. */
    function describeGap(ms) {
      const totalMinutes = Math.max(1, Math.ceil(ms / MINUTE_MS));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      if (hours === 0) return { key: 'gap.minutes', params: { minutes } };
      if (minutes === 0) return { key: 'gap.hours', params: { hours } };
      return { key: 'gap.hoursMinutes', params: { hours, minutes } };
    }

    /** Locale key + params for the switch instant, in Beijing wall-clock time. */
    function describeWhen(at, now) {
      const local = beijing(at);
      const time = `${pad2(Math.floor(local.minutes / 60))}:${pad2(local.minutes % 60)}`;
      const dayDelta = beijingDay(at) - beijingDay(now);
      if (dayDelta === 0) return { key: 'when.today', params: { time } };
      if (dayDelta === 1) return { key: 'when.tomorrow', params: { time } };
      return {
        key: 'when.date',
        params: { month: local.month, day: local.day, time },
      };
    }

    /** True when the selected provider route serves DeepSeek's own API. */
    function isDeepSeekProvider(provider, groups) {
      if (DEEPSEEK_PROVIDER_IDS.has(provider)) return true;
      const group = groups.find((candidate) => candidate.id === provider);
      return group !== undefined && DEEPSEEK_PROVIDER_NAME.test(group.name.trim());
    }

    /** Catalog display name for the selected model, falling back to its id. */
    function modelNameOf(groups, selection) {
      const group = groups.find((candidate) => candidate.id === selection.provider);
      const model =
        group === undefined
          ? undefined
          : group.models.find((candidate) => candidate.id === selection.model);
      return model === undefined ? selection.model : model.name;
    }

    // --- end policy logic ---

    const DICT = {
      zh: {
        peak: '高峰',
        idle: '空闲',
        unknown: '未知',
        'state.peak': '高峰时段',
        'state.idle': '空闲时段',
        'state.unknown': '未知状态',
        'model.line': '模型：{model}',
        'price.peak': '当前按高峰价计费',
        'price.idle': '当前为空闲价（高峰价的 5 折）',
        'next.toPeak': '距离进入高峰还有 {gap}（{when}，北京时间）',
        'next.toIdle': '距离进入空闲还有 {gap}（{when}，北京时间）',
        'gap.minutes': '{minutes} 分钟',
        'gap.hours': '{hours} 小时',
        'gap.hoursMinutes': '{hours} 小时 {minutes} 分钟',
        'when.today': '今天 {time}',
        'when.tomorrow': '明天 {time}',
        'when.date': '{month} 月 {day} 日 {time}',
        rules:
          '高峰：周一至周五 09:00–12:00、14:00–18:00（北京时间，不含中国法定节假日）；其余时间为空闲。',
        holidays: '法定节假日数据：{year} 年国务院办公厅安排',
        'unknown.detail': '无法确定当前模型的 provider，暂不判断峰谷时段。',
        api: 'DeepSeek API',
      },
      en: {
        peak: 'Peak',
        idle: 'Off-peak',
        unknown: 'Unknown',
        'state.peak': 'Peak hours',
        'state.idle': 'Off-peak hours',
        'state.unknown': 'Unknown status',
        'model.line': 'Model: {model}',
        'price.peak': 'Billed at peak rates',
        'price.idle': 'Off-peak rate (half of peak)',
        'next.toPeak': 'Peak starts in {gap} ({when}, Beijing time)',
        'next.toIdle': 'Off-peak starts in {gap} ({when}, Beijing time)',
        'gap.minutes': '{minutes} min',
        'gap.hours': '{hours} h',
        'gap.hoursMinutes': '{hours} h {minutes} min',
        'when.today': 'today {time}',
        'when.tomorrow': 'tomorrow {time}',
        'when.date': '{month}/{day} {time}',
        rules:
          'Peak: Mon–Fri 09:00–12:00 and 14:00–18:00 Beijing time, excluding Chinese public holidays; all other hours are off-peak.',
        holidays: 'Public-holiday data: {year} State Council schedule',
        'unknown.detail':
          "The current model's provider is unknown, so peak-hour status is unavailable.",
        api: 'DeepSeek API',
      },
    };

    const CSS = `
.dsh-provider-peak {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border-radius: var(--dsw-radius-sm, 6px);
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  cursor: default;
  user-select: none;
  transition: background-color 0.12s ease;
}
.dsh-provider-peak:hover,
.dsh-provider-peak:focus-visible,
.dsh-provider-peak[data-open='true'] {
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 9%, transparent);
}
.dsh-provider-peak:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dsh-provider-peak__tooltip {
  position: fixed;
  z-index: 1200;
  box-sizing: border-box;
  width: max-content;
  max-width: min(360px, calc(100vw - 24px));
  padding: 10px 12px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-overlay);
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgb(0 0 0 / 0.18));
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  white-space: normal;
  pointer-events: none;
}
.dsh-provider-peak__tipHead {
  color: var(--dsw-alias-label-primary);
  font-weight: 600;
}
.dsh-provider-peak__tipRow {
  margin-top: 2px;
}
.dsh-provider-peak__tipNotes {
  margin-top: 8px;
  padding-top: 7px;
  border-top: 0.5px solid var(--dsw-alias-border-l1);
  font-size: 11px;
  line-height: 16px;
}
.dsh-provider-peak__dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-state-success-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-success-primary) 18%, transparent);
}
.dsh-provider-peak[data-state='peak'] .dsh-provider-peak__dot {
  background: var(--dsw-alias-state-warn-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-warn-primary) 18%, transparent);
}
.dsh-provider-peak[data-state='unknown'] .dsh-provider-peak__dot {
  background: var(--dsw-alias-state-idle-primary);
  box-shadow: none;
}
.dsh-provider-peak__detail {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}
`;

    /**
     * Compact peak/off-peak chip. Model identity comes from the Session's
     * shared model directory; the clock is read locally with a slow tick and
     * a refresh on tab focus. Hovering or focusing the chip opens a positioned
     * tooltip, and the chip itself gains a hover/focus surface.
     */
    function PeakBadge({ t, modelDirectory }) {
      const state = React.useSyncExternalStore(
        React.useCallback(
          (callback) => modelDirectory.subscribe(callback),
          [modelDirectory],
        ),
        React.useCallback(() => modelDirectory.getSnapshot(), [modelDirectory]),
      );
      const [now, setNow] = React.useState(() => Date.now());
      const [open, setOpen] = React.useState(false);
      const [placement, setPlacement] = React.useState(null);
      const detailId = React.useId();
      const chipRef = React.useRef(null);

      React.useEffect(() => {
        const refresh = () => setNow(Date.now());
        const timer = setInterval(refresh, TICK_MS);
        const onVisibility = () => {
          if (document.visibilityState === 'visible') refresh();
        };
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
          clearInterval(timer);
          document.removeEventListener('visibilitychange', onVisibility);
        };
      }, []);

      const show = React.useCallback(() => {
        const chip = chipRef.current;
        if (chip === null) return;
        const rect = chip.getBoundingClientRect();
        const maxWidth = Math.min(360, window.innerWidth - 24);
        setPlacement({
          left: Math.max(12, Math.min(rect.left, window.innerWidth - maxWidth - 12)),
          bottom: window.innerHeight - rect.top + 8,
        });
        setOpen(true);
      }, []);
      const hide = React.useCallback(() => setOpen(false), []);

      React.useEffect(() => {
        if (!open) return undefined;
        const close = () => setOpen(false);
        window.addEventListener('resize', close);
        window.addEventListener('scroll', close, true);
        return () => {
          window.removeEventListener('resize', close);
          window.removeEventListener('scroll', close, true);
        };
      }, [open]);

      const current = state.current;
      const provider = current === null ? null : current.provider;

      // Other providers do not bill DeepSeek's peak/off-peak rates: stay out.
      if (provider !== null && !isDeepSeekProvider(provider, state.groups)) {
        return null;
      }

      let chipState;
      let label;
      let headline;
      let rows;
      let notes;
      if (current === null) {
        chipState = 'unknown';
        label = t('unknown');
        headline = `${t('api')} · ${t('state.unknown')}`;
        rows = [t('unknown.detail')];
        notes = [];
      } else {
        const peak = isPeak(now);
        chipState = peak ? 'peak' : 'idle';
        label = t(peak ? 'peak' : 'idle');
        headline = `${t('api')} · ${t(peak ? 'state.peak' : 'state.idle')}`;
        rows = [
          t('model.line', { model: modelNameOf(state.groups, current) }),
          t(peak ? 'price.peak' : 'price.idle'),
        ];
        const target = nextChange(now);
        if (target !== null) {
          const gap = describeGap(target - now);
          const when = describeWhen(target, now);
          rows.push(
            t(peak ? 'next.toIdle' : 'next.toPeak', {
              gap: t(gap.key, gap.params),
              when: t(when.key, when.params),
            }),
          );
        }
        notes = [t('rules'), t('holidays', { year: HOLIDAY_COVERAGE })];
      }
      const srDetail = [headline, ...rows, ...notes].join('\n');

      return h(
        React.Fragment,
        null,
        h('style', { key: 'style', 'data-plugin-css': NS }, CSS),
        h(
          'span',
          {
            key: 'badge',
            ref: chipRef,
            className: 'dsh-provider-peak',
            'data-state': chipState,
            'data-open': open ? 'true' : undefined,
            tabIndex: 0,
            'aria-describedby': detailId,
            onMouseEnter: show,
            onMouseLeave: hide,
            onFocus: show,
            onBlur: hide,
            onKeyDown: (event) => {
              if (event.key === 'Escape') setOpen(false);
            },
          },
          h('span', { className: 'dsh-provider-peak__dot', 'aria-hidden': true }),
          h('span', { className: 'dsh-provider-peak__label' }, label),
          h(
            'span',
            { id: detailId, className: 'dsh-provider-peak__detail' },
            srDetail.replace(/\n/g, ' '),
          ),
        ),
        open && placement !== null
          ? h(
              'div',
              {
                key: 'tooltip',
                className: 'dsh-provider-peak__tooltip',
                'aria-hidden': true,
                style: {
                  left: `${placement.left}px`,
                  bottom: `${placement.bottom}px`,
                },
              },
              [
                h(
                  'div',
                  { key: 'head', className: 'dsh-provider-peak__tipHead' },
                  headline,
                ),
                ...rows.map((row, index) =>
                  h(
                    'div',
                    { key: `row-${index}`, className: 'dsh-provider-peak__tipRow' },
                    row,
                  ),
                ),
                notes.length === 0
                  ? null
                  : h(
                      'div',
                      { key: 'notes', className: 'dsh-provider-peak__tipNotes' },
                      notes.map((note, index) =>
                        h('div', { key: `note-${index}` }, note),
                      ),
                    ),
              ],
            )
          : null,
      );
    }

    return {
      inject: ['slots', 'locale', 'modelDirectories'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, DICT),
          'dsh-provider-peak: dictionaries',
        );
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'dsh-provider-peak',
              order: 12,
              locale: NS,
              inject: (sessionId) => ({
                modelDirectory: ctx.modelDirectories.directoryFor(sessionId).store,
              }),
            },
            PeakBadge,
          ),
        );
      },
    };
  },
});
