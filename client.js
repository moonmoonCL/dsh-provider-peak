/**
 * Client half of dsh-provider-peak.
 *
 * Shows a compact chip in the composer tool row (`conversation.input.left`)
 * that tells, at a glance, whether the selected model is currently billed at
 * peak or off-peak rates. The chip stays short ("高峰" / "空闲"); the native
 * tooltip carries the details (provider, model, rates, next switch, rule).
 *
 * The tooltip is portaled to `document.body` and pinned in viewport
 * coordinates. It cannot be a plain `position: fixed` child of the composer:
 * the composer seat is composited (`will-change: transform`) while a
 * conversation is active, which silently turns that seat into the containing
 * block for fixed descendants, and the conversation view clips its overflow.
 * Portaling also keeps the position independent of any later reflow, which is
 * why the tooltip re-measures the chip while it is open instead of trusting a
 * snapshot taken at hover time.
 *
 * Two provider families publish a peak/off-peak split, and both use the same
 * two windows:
 *   - DeepSeek's own API (deepseek-official / deepseek-account, or a route
 *     that names itself DeepSeek). Every model, with the Chinese statutory
 *     holiday exemption.
 *   - OpenCode Go (`opencode-go`), but only for its two DeepSeek models; Go
 *     mirrors DeepSeek's windows and rates without a holiday exemption.
 *
 * Billing rule, from both pricing pages (api-docs.deepseek.com and
 * opencode.ai/docs/console/go):
 *   Peak: Beijing time (UTC+8), Monday through Friday, 09:00-12:00 and
 *         14:00-18:00.
 *   Off-peak: every other instant, billed at half of the peak rate.
 *   Holidays: DeepSeek's own API bills Chinese statutory holidays as
 *         off-peak; OpenCode Go has no such exemption, so a weekday holiday
 *         stays at peak rates.
 *
 * The holiday table is data, not logic: refresh it when the State Council
 * publishes the next year's arrangement.
 */

window.__ModuleLoader__.load({
  id: 'dsh-provider-peak',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /**
     * `react-dom` is a platform module of the DSH client shell — the composer
     * itself portals its menus with it. The tooltip needs it to escape the
     * composer subtree; without it the tooltip still renders, just in place.
     */
    const createPortal = (() => {
      try {
        const dom = require('react-dom');
        return typeof dom.createPortal === 'function' ? dom.createPortal : null;
      } catch {
        return null;
      }
    })();

    /** Locale namespace owned by this plugin. */
    const NS = 'dsh-provider-peak';
    /** Recompute cadence: the visible text changes at most once a minute. */
    const TICK_MS = 30 * 1000;
    /**
     * Re-anchor cadence while the tooltip is open. A reflow (the window, a
     * side panel, or the model picker changing width) fires neither `resize`
     * nor `scroll`, so an open tooltip also samples its anchor on a frame
     * timer — ten times a second is enough to stay glued without costing a
     * layout per frame.
     */
    const FOLLOW_MS = 100;

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

    // OpenCode Go (opencode.ai/docs/console/go) publishes the same windows and
    // a 2x peak multiplier, but no holiday exemption. Only two of its models
    // carry a peak/off-peak split; the rest of the catalog is flat-rate, and
    // the pay-as-you-go Console provider (`opencode`) bills DeepSeek flat too,
    // so both stay out of the badge.
    const OPENCODE_GO_PROVIDER_IDS = new Set(['opencode-go']);
    const OPENCODE_GO_PROVIDER_NAME = /^opencode\s+go$/i;
    const OPENCODE_GO_PEAK_MODELS = new Set(['deepseek-v4.1-flash', 'deepseek-v4-pro']);
    const OPENCODE_GO_PEAK_MODEL_NAME = /^deepseek\s+v4(?:\.1\s+flash|\s+pro)(?:\s+[0-9][0-9.]*)?$/i;

    // Peak rates per million tokens, as published on the Go pricing table.
    // Input/output pairs only; the cache-read rate is a fixed fraction and is
    // not worth a row in the tooltip.
    const OPENCODE_GO_RATES = {
      'deepseek-v4.1-flash': { peak: [0.3, 1.2], offPeak: [0.15, 0.6] },
      'deepseek-v4-pro': { peak: [1.32, 3.96], offPeak: [0.66, 1.98] },
    };

    /**
     * One billing policy: which provider family, whether Chinese statutory
     * holidays count as off-peak, and the locale keys for its copy.
     */
    const DEEPSEEK_POLICY = Object.freeze({
      id: 'deepseek',
      holidaysExempt: true,
      apiKey: 'api.deepseek',
      rulesKey: 'rules.deepseek',
    });
    const OPENCODE_GO_POLICY = Object.freeze({
      id: 'opencode-go',
      holidaysExempt: false,
      apiKey: 'api.opencodeGo',
      rulesKey: 'rules.opencodeGo',
    });

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

    /** True when `ms` falls inside a billed peak window under `policy`. */
    function isPeak(ms, policy = DEEPSEEK_POLICY) {
      const local = beijing(ms);
      if (local.weekday === 0 || local.weekday === 6) return false;
      if (
        policy.holidaysExempt &&
        HOLIDAYS.has(dateKey(local.year, local.month, local.day))
      ) {
        return false;
      }
      return PEAK_WINDOWS.some(
        ([start, end]) => local.minutes >= start && local.minutes < end,
      );
    }

    /** First instant after `now` whose peak/off-peak state differs, or null. */
    function nextChange(now, policy = DEEPSEEK_POLICY) {
      const current = isPeak(now, policy);
      const base = beijing(now);
      for (let day = 0; day <= 8; day += 1) {
        for (const minutes of BOUNDARY_MINUTES) {
          const at =
            Date.UTC(base.year, base.month - 1, base.day + day, 0, minutes) -
            BEIJING_OFFSET_MS;
          if (at > now && isPeak(at, policy) !== current) return at;
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

    /** Catalog display name for the selected model, falling back to its id. */
    function modelNameOf(groups, selection) {
      const group = groups.find((candidate) => candidate.id === selection.provider);
      const model =
        group === undefined
          ? undefined
          : group.models.find((candidate) => candidate.id === selection.model);
      return model === undefined ? selection.model : model.name;
    }

    /** The model id without a leading `<provider>/` qualifier, lowercased. */
    function bareModelId(provider, model) {
      const id = String(model).toLowerCase();
      const prefix = `${String(provider).toLowerCase()}/`;
      return id.startsWith(prefix) ? id.slice(prefix.length) : id;
    }

    /** Catalog entry for the selection, when the directory knows it. */
    function modelEntryOf(groups, selection) {
      const group = groups.find((candidate) => candidate.id === selection.provider);
      return group === undefined
        ? undefined
        : group.models.find((candidate) => candidate.id === selection.model);
    }

    /** Provider family whose prices split into peak and off-peak, or null. */
    function sourcePolicyOf(provider, groups) {
      if (DEEPSEEK_PROVIDER_IDS.has(provider)) return DEEPSEEK_POLICY;
      if (OPENCODE_GO_PROVIDER_IDS.has(provider)) return OPENCODE_GO_POLICY;
      const group = groups.find((candidate) => candidate.id === provider);
      const name = group === undefined ? '' : String(group.name).trim();
      if (DEEPSEEK_PROVIDER_NAME.test(name)) return DEEPSEEK_POLICY;
      if (OPENCODE_GO_PROVIDER_NAME.test(name)) return OPENCODE_GO_POLICY;
      return null;
    }

    /**
     * True when the model is one of the two DeepSeek models that Go bills with
     * a peak/off-peak split. The id decides; the catalog name is a fallback
     * for a renamed id and must not swallow the flat-rate `-free` variant.
     */
    function isOpencodeGoPeakModel(groups, selection) {
      const bare = bareModelId(selection.provider, selection.model);
      if (OPENCODE_GO_PEAK_MODELS.has(bare)) return true;
      const entry = modelEntryOf(groups, selection);
      return (
        entry !== undefined &&
        OPENCODE_GO_PEAK_MODEL_NAME.test(String(entry.name).trim())
      );
    }

    /**
     * The peak policy that governs the selection, or null when its provider is
     * flat-rate: other providers, Go's non-DeepSeek models, and the flat-price
     * Console (`opencode`) DeepSeek models all answer null.
     */
    function peakPolicyOf(selection, groups) {
      const policy = sourcePolicyOf(selection.provider, groups);
      if (policy === null) return null;
      if (policy === DEEPSEEK_POLICY) return policy;
      return isOpencodeGoPeakModel(groups, selection) ? policy : null;
    }

    /** Published input/output rates for a Go peak model, or null. */
    function ratesOf(selection) {
      const bare = bareModelId(selection.provider, selection.model);
      return OPENCODE_GO_RATES[bare] === undefined ? null : OPENCODE_GO_RATES[bare];
    }

    /** Two-decimal money label for tooltip rates. */
    function money(value) {
      return value.toFixed(2);
    }

    // --- tooltip geometry (pure) ---

    /** Smallest distance the tooltip keeps from a viewport edge. */
    const VIEWPORT_MARGIN = 12;
    /** Gap between the chip and the tooltip. */
    const ANCHOR_GAP = 8;

    function clampBetween(value, min, max) {
      return Math.min(Math.max(value, min), Math.max(min, max));
    }

    /**
     * Viewport coordinates for a tooltip anchored to `anchor`.
     *
     * `anchor` and `viewport` are rects in viewport space (the shape
     * `getBoundingClientRect` and `window.innerWidth`/`innerHeight` provide);
     * `tip` carries the tooltip's measured size. The tooltip opens above the
     * chip when it fits — the composer sits at the bottom of the window — and
     * flips below when the top edge is too close; either way both axes are
     * clamped so a short window or a wide tooltip never ends up off-screen.
     */
    function placementOf(anchor, tip, viewport) {
      const margin = VIEWPORT_MARGIN;
      const width = Math.max(0, Math.min(tip.width, viewport.width - margin * 2));
      const height = Math.max(0, Math.min(tip.height, viewport.height - margin * 2));
      const left = clampBetween(anchor.left, margin, viewport.width - margin - width);
      const roomAbove = anchor.top - ANCHOR_GAP - margin;
      const roomBelow =
        viewport.height - margin - (anchor.bottom + ANCHOR_GAP);
      const side = roomAbove >= height || roomAbove >= roomBelow ? 'top' : 'bottom';
      const top = clampBetween(
        side === 'top' ? anchor.top - ANCHOR_GAP - height : anchor.bottom + ANCHOR_GAP,
        margin,
        viewport.height - margin - height,
      );
      return { left, top, side };
    }

    // --- end tooltip geometry logic ---

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
        'price.split':
          '每百万 tokens：高峰 输入 {peakIn} / 输出 {peakOut}，空闲 输入 {offIn} / 输出 {offOut}',
        'next.toPeak': '距离进入高峰还有 {gap}（{when}，北京时间）',
        'next.toIdle': '距离进入空闲还有 {gap}（{when}，北京时间）',
        'gap.minutes': '{minutes} 分钟',
        'gap.hours': '{hours} 小时',
        'gap.hoursMinutes': '{hours} 小时 {minutes} 分钟',
        'when.today': '今天 {time}',
        'when.tomorrow': '明天 {time}',
        'when.date': '{month} 月 {day} 日 {time}',
        'rules.deepseek':
          '高峰：周一至周五 09:00–12:00、14:00–18:00（北京时间，不含中国法定节假日）；其余时间为空闲。',
        'rules.opencodeGo':
          '高峰：周一至周五 09:00–12:00、14:00–18:00（北京时间）；周末与其余时间为空闲。官方未设中国法定节假日豁免，落在工作日的假期仍按高峰计价。',
        'go.limit':
          'Go 订阅按该价格从月限额扣减：高峰时同样用量的消耗是空闲时的 2 倍。',
        holidays: '法定节假日数据：{year} 年国务院办公厅安排',
        'unknown.detail': '无法确定当前模型的 provider，暂不判断峰谷时段。',
        'api.deepseek': 'DeepSeek API',
        'api.opencodeGo': 'OpenCode Go',
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
        'price.split':
          'Per 1M tokens: peak in {peakIn} / out {peakOut}; off-peak in {offIn} / out {offOut}',
        'next.toPeak': 'Peak starts in {gap} ({when}, Beijing time)',
        'next.toIdle': 'Off-peak starts in {gap} ({when}, Beijing time)',
        'gap.minutes': '{minutes} min',
        'gap.hours': '{hours} h',
        'gap.hoursMinutes': '{hours} h {minutes} min',
        'when.today': 'today {time}',
        'when.tomorrow': 'tomorrow {time}',
        'when.date': '{month}/{day} {time}',
        'rules.deepseek':
          'Peak: Mon–Fri 09:00–12:00 and 14:00–18:00 Beijing time, excluding Chinese public holidays; all other hours are off-peak.',
        'rules.opencodeGo':
          'Peak: Mon–Fri 09:00–12:00 and 14:00–18:00 Beijing time; weekends and all other hours are off-peak. No Chinese public-holiday exemption, so a weekday holiday is still billed at peak rates.',
        'go.limit':
          'Go charges these rates against the monthly limit, so peak usage burns twice the allowance of the same volume off-peak.',
        holidays: 'Public-holiday data: {year} State Council schedule',
        'unknown.detail':
          "The current model's provider is unknown, so peak-hour status is unavailable.",
        'api.deepseek': 'DeepSeek API',
        'api.opencodeGo': 'OpenCode Go',
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
     * Render `node` at the end of the document, outside the composer.
     *
     * The composer seat becomes the containing block for fixed descendants as
     * soon as it is composited for the sticky header (`will-change`), and the
     * conversation view clips its overflow, so a fixed tooltip inside the tree
     * would be placed against the seat and cropped. Portaling removes both
     * couplings: `placementOf` already works in viewport coordinates.
     */
    function atDocumentLevel(node) {
      if (createPortal === null || document.body === null) return node;
      return createPortal(node, document.body);
    }

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
      const tipRef = React.useRef(null);

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

      /** Measure the chip and the tooltip, then pin the tooltip to the chip. */
      const place = React.useCallback(() => {
        const chip = chipRef.current;
        const tip = tipRef.current;
        if (chip === null || tip === null) return;
        const anchor = chip.getBoundingClientRect();
        const box = tip.getBoundingClientRect();
        const next = placementOf(anchor, box, {
          width: window.innerWidth,
          height: window.innerHeight,
        });
        setPlacement((previous) =>
          previous !== null &&
          previous.left === next.left &&
          previous.top === next.top &&
          previous.side === next.side
            ? previous
            : next,
        );
      }, []);

      // Measure before the first paint: the tooltip mounts hidden at the
      // origin, so it must never be painted at the origin.
      React.useLayoutEffect(() => {
        if (open) place();
      }, [open, place]);

      // Keep the tooltip glued to the chip while it is open. Scrolling and
      // resizing reposition it instead of dismissing it, and the frame timer
      // covers the reflows that fire neither event — the window, the side
      // panels, and the model picker all move the chip without moving the
      // window.
      React.useEffect(() => {
        if (!open) return undefined;
        const follow = () => place();
        window.addEventListener('resize', follow);
        window.addEventListener('scroll', follow, true);
        let frame = 0;
        let last = 0;
        const sample = (time) => {
          frame = window.requestAnimationFrame(sample);
          if (time - last < FOLLOW_MS) return;
          last = time;
          place();
        };
        frame = window.requestAnimationFrame(sample);
        return () => {
          window.removeEventListener('resize', follow);
          window.removeEventListener('scroll', follow, true);
          window.cancelAnimationFrame(frame);
        };
      }, [open, place]);

      const show = React.useCallback(() => {
        setPlacement(null);
        setOpen(true);
      }, []);
      const hide = React.useCallback(() => setOpen(false), []);

      const current = state.current;
      const policy = current === null ? null : peakPolicyOf(current, state.groups);

      // Flat-rate routes (other providers, Go's non-DeepSeek models, the
      // Console pay-as-you-go DeepSeek models) have nothing to report.
      if (current !== null && policy === null) {
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
        headline = t('state.unknown');
        rows = [t('unknown.detail')];
        notes = [];
      } else {
        const peak = isPeak(now, policy);
        chipState = peak ? 'peak' : 'idle';
        label = t(peak ? 'peak' : 'idle');
        headline = `${t(policy.apiKey)} · ${t(peak ? 'state.peak' : 'state.idle')}`;
        rows = [
          t('model.line', { model: modelNameOf(state.groups, current) }),
        ];
        const rates = policy === OPENCODE_GO_POLICY ? ratesOf(current) : null;
        if (rates !== null) {
          rows.push(
            t('price.split', {
              peakIn: money(rates.peak[0]),
              peakOut: money(rates.peak[1]),
              offIn: money(rates.offPeak[0]),
              offOut: money(rates.offPeak[1]),
            }),
          );
        }
        rows.push(t(peak ? 'price.peak' : 'price.idle'));
        const target = nextChange(now, policy);
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
        notes = [t(policy.rulesKey)];
        if (policy.holidaysExempt) {
          notes.push(t('holidays', { year: HOLIDAY_COVERAGE }));
        }
        if (policy === OPENCODE_GO_POLICY) notes.push(t('go.limit'));
      }
      const srDetail = [headline, ...rows, ...notes].join('\n');

      // Mounted hidden until measured: the first frame exists only so the
      // layout effect above can read the tooltip's real size.
      const tooltip =
        open === false
          ? null
          : h(
              'div',
              {
                key: 'tooltip',
                ref: tipRef,
                className: 'dsh-provider-peak__tooltip',
                'data-side': placement === null ? undefined : placement.side,
                'aria-hidden': true,
                style: {
                  left: `${placement === null ? 0 : placement.left}px`,
                  top: `${placement === null ? 0 : placement.top}px`,
                  visibility: placement === null ? 'hidden' : 'visible',
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
            );

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
        tooltip === null ? null : atDocumentLevel(tooltip),
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
