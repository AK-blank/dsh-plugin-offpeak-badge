/**
 * DeepSeek peak / off-peak badge — browser half (pre-bundled client module).
 *
 * Shape is the same as the official `@deepseek-ai/dsh-client-ui-*` client plugins:
 * one CJS factory registered through `window.__ModuleLoader__.load({ id, factory })`
 * whose `id` MUST equal the package name (the host uses the package name as the
 * `__DSH_BOOT__` graph row id). `require` may only name platform seed words
 * (react / react-dom / react/jsx-runtime / @deepseek-ai/dsh-client-ui-primitives …)
 * and rows of that same graph.
 *
 * ── Billing rule (the only decision logic in this plugin) ───────────────────
 * Official pricing footnote, zh page
 * (https://api-docs.deepseek.com/zh-cn/quick_start/pricing):
 *   「空闲时段价格为高峰时段价格的一半。北京时间周一至周五（不含中国法定节假日）
 *     9:00 - 12:00、14:00 - 18:00 为高峰时段；其余时段，包括周末及中国法定节假日
 *     全天均为空闲时段。」
 * Official pricing footnote, en page (https://api-docs.deepseek.com/quick_start/pricing):
 *   "Off-peak rates are half of the peak rates. Peak hours are 01:00 - 04:00 and
 *    06:00 - 10:00 UTC, Monday through Friday, excluding Chinese public holidays.
 *    All other hours are off-peak, including weekends and Chinese public holidays
 *    in full."
 * The UTC windows equal the Beijing windows bit for bit; day classification
 * (weekday / weekend / holiday) is always the **Beijing calendar day**.
 *
 * Two consequences worth stating, because they are the usual questions:
 *   1. A weekend shifted into a working day by the holiday-adjustment scheme
 *      (调休上班的周末) is still a weekend, so it is off-peak all day. Chinese
 *      media summarised this as "调休上班的周末、中国法定节假日全天均按空闲时段计费";
 *      that sentence is a news headline, not official wording, but the conclusion
 *      is right — and it needs no extra rule beyond "weekends are off-peak".
 *   2. A statutory holiday that falls on a weekday never enters peak hours
 *      ("excluding Chinese public holidays").
 *
 * ── Calendar data ──────────────────────────────────────────────────────────
 * Statutory holidays and make-up workdays come from the State Council notices
 * (国务院办公厅通知) for 2025 and 2026; every year carries its `source` URL.
 * For years the calendar does not cover (2027's notice is not published yet) the
 * rule degrades to "Monday–Friday are peak-eligible" and the tooltip says so
 * explicitly instead of pretending to know the holidays.
 *
 * Self-test: `node selftest.mjs` (offline; loads this file with stub
 * `window.__ModuleLoader__` / `require`, asserts the rule, the calendar, both
 * dictionaries and the registration contract).
 */

window.__ModuleLoader__.load({
	id: "dsh-plugin-offpeak-badge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const { BrandWordmark, Tag, Tooltip } = require("@deepseek-ai/dsh-client-ui-primitives");

		/** Locale namespace owned by this plugin (both shipped dictionaries). */
		const NS = "offpeak-badge";

		//#region rule and calendar
		/** Beijing time (Asia/Shanghai has been a fixed UTC+8 zone with no DST since 1991). */
		const BEIJING_TIME_ZONE = "Asia/Shanghai";
		const BEIJING_OFFSET_MINUTES = 8 * 60;
		/** Peak windows in Beijing minutes-of-day, half-open: 09:00-12:00 and 14:00-18:00. */
		const PEAK_WINDOWS = [
			[9 * 60, 12 * 60],
			[14 * 60, 18 * 60]
		];
		/** Every window boundary of a day, used to find the next switch. */
		const PEAK_BOUNDARIES = [9 * 60, 12 * 60, 14 * 60, 18 * 60];
		/** Start of the first peak window (09:00), used when searching across days. */
		const PEAK_START_MINUTES = PEAK_WINDOWS[0][0];

		/**
		 * Statutory holidays and make-up working weekends.
		 * `holidays` are the days that never enter peak hours; `workdays` are the
		 * weekend days worked to compensate for a holiday, kept so the tooltip can
		 * explain why such a day is still billed off-peak.
		 */
		const CALENDAR = {
			2025: {
				notice: "国务院办公厅关于2025年部分节假日安排的通知（国办发明电〔2024〕12号）",
				source: "https://www.gov.cn/gongbao/2024/issue_11726/202411/content_6989767.html",
				holidays: [
					"2025-01-01",
					"2025-01-28", "2025-01-29", "2025-01-30", "2025-01-31", "2025-02-01", "2025-02-02", "2025-02-03", "2025-02-04",
					"2025-04-04", "2025-04-05", "2025-04-06",
					"2025-05-01", "2025-05-02", "2025-05-03", "2025-05-04", "2025-05-05",
					"2025-05-31", "2025-06-01", "2025-06-02",
					"2025-10-01", "2025-10-02", "2025-10-03", "2025-10-04", "2025-10-05", "2025-10-06", "2025-10-07", "2025-10-08"
				],
				workdays: ["2025-01-26", "2025-02-08", "2025-04-27", "2025-09-28", "2025-10-11"]
			},
			2026: {
				notice: "国务院办公厅关于2026年部分节假日安排的通知（国办发明电〔2025〕7号）",
				source: "https://www.gov.cn/zhengce/zhengceku/202511/content_7047091.htm",
				holidays: [
					"2026-01-01", "2026-01-02", "2026-01-03",
					"2026-02-15", "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23",
					"2026-04-04", "2026-04-05", "2026-04-06",
					"2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
					"2026-06-19", "2026-06-20", "2026-06-21",
					"2026-09-25", "2026-09-26", "2026-09-27",
					"2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07"
				],
				workdays: ["2026-01-04", "2026-02-14", "2026-02-28", "2026-05-09", "2026-09-20", "2026-10-10"]
			}
		};

		const beijingParts = new Intl.DateTimeFormat("en-US", {
			timeZone: BEIJING_TIME_ZONE,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			weekday: "short",
			hour: "2-digit",
			minute: "2-digit"
		});
		const WEEKDAY_INDEX = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

		/**
		 * Read an absolute instant as Beijing calendar fields.
		 * @param date - any instant.
		 * @returns date (`YYYY-MM-DD`), ISO weekday (1 = Monday), hour, minute and minutes-of-day.
		 */
		function beijingClock(date) {
			const fields = {};
			for (const part of beijingParts.formatToParts(date)) fields[part.type] = part.value;
			const hour = Number(fields.hour);
			const minute = Number(fields.minute);
			return {
				date: fields.year + "-" + fields.month + "-" + fields.day,
				weekday: WEEKDAY_INDEX[fields.weekday],
				hour,
				minute,
				minutes: hour * 60 + minute
			};
		}

		/** Instant of Beijing midnight for a calendar day. @param ymd - `YYYY-MM-DD`. */
		function beijingMidnight(ymd) {
			const [year, month, day] = ymd.split("-").map(Number);
			return Date.UTC(year, month - 1, day, 0, 0, 0) - BEIJING_OFFSET_MINUTES * 60_000;
		}

		/** Calendar-day arithmetic. @param ymd - start day; @param days - offset. */
		function shiftDate(ymd, days) {
			const [year, month, day] = ymd.split("-").map(Number);
			return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
		}

		/** ISO weekday of a Beijing calendar day. @param ymd - `YYYY-MM-DD`. */
		function weekdayOf(ymd) {
			const [year, month, day] = ymd.split("-").map(Number);
			const iso = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
			return iso === 0 ? 7 : iso;
		}

		/** Whether a day can ever be peak: Monday–Friday and (when covered) not a holiday. */
		function isPeakEligibleDate(ymd) {
			const calendar = CALENDAR[Number(ymd.slice(0, 4))];
			if (calendar !== undefined && calendar.holidays.includes(ymd)) return false;
			return weekdayOf(ymd) <= 5;
		}

		/** Whether minutes-of-day falls inside a peak window. @param minutes - 0…1439. */
		function inPeakWindow(minutes) {
			for (const [start, end] of PEAK_WINDOWS) if (minutes >= start && minutes < end) return true;
			return false;
		}

		/**
		 * Full billing status for an instant, in locale-independent codes.
		 * @param date - any instant.
		 * @returns `offPeak`, a `day` code (`holiday` / `makeupWeekend` / `weekend` /
		 * `workday` / `workdayUncovered`), the switch instant and the raw fields.
		 */
		function statusAt(date) {
			const clock = beijingClock(date);
			const year = Number(clock.date.slice(0, 4));
			const calendar = CALENDAR[year];
			const holiday = calendar !== undefined && calendar.holidays.includes(clock.date);
			const makeupWorkday = calendar !== undefined && calendar.workdays.includes(clock.date);
			const weekend = clock.weekday >= 6;
			const peakEligible = !weekend && !holiday;
			const offPeak = !(peakEligible && inPeakWindow(clock.minutes));

			// Next switch: on a peak-eligible day the next window boundary after now is
			// the switch (peak → window end, off-peak → next window start); after 18:00
			// none is left, so walk forward to the next peak-eligible day's 09:00.
			let switchMinutes = null;
			let switchDate = null;
			if (peakEligible) {
				switchDate = clock.date;
				for (const boundary of PEAK_BOUNDARIES) if (boundary > clock.minutes) { switchMinutes = boundary; break; }
			}
			if (switchMinutes === null) {
				for (let offset = 1; offset <= 30; offset += 1) {
					const candidate = shiftDate(clock.date, offset);
					if (isPeakEligibleDate(candidate)) {
						switchDate = candidate;
						switchMinutes = PEAK_START_MINUTES;
						break;
					}
				}
			}
			const switchAt = switchDate === null ? null : new Date(beijingMidnight(switchDate) + switchMinutes * 60_000);

			const day = holiday
				? "holiday"
				: weekend
					? (makeupWorkday ? "makeupWeekend" : "weekend")
					: (calendar === undefined ? "workdayUncovered" : "workday");

			return {
				offPeak,
				day,
				date: clock.date,
				year,
				weekday: clock.weekday,
				minutes: clock.minutes,
				holiday,
				weekend,
				makeupWorkday,
				calendarCovered: calendar !== undefined,
				switchAt,
				nextOffPeak: !offPeak
			};
		}
		//#endregion

		//#region dictionaries
		/**
		 * Shipped dictionaries. Keys are flat with `{name}` placeholders; the locale
		 * service requires every shipped locale in one `register` call, and
		 * `selftest.mjs` asserts that the two key sets and placeholder sets match.
		 */
		const zh = {
			"badge.offPeak": "空闲",
			"badge.peak": "高峰",
			"period.offPeak": "空闲时段",
			"period.peak": "高峰时段",
			"day.holiday": "法定节假日（全天不计高峰）",
			"day.weekend": "周末（全天不计高峰）",
			"day.makeupWeekend": "调休上班的周末（仍是周末，全天不计高峰）",
			"day.workday": "工作日",
			"day.workdayUncovered": "工作日（该年节假日日历尚未覆盖）",
			"tooltip.period": "DeepSeek API：当前为「{period}」，空闲价格为高峰的一半",
			"tooltip.today": "今天 {date} {weekday} · {note}",
			"tooltip.next": "下一次切换：{time} 转为{period}（约 {countdown}后）",
			"tooltip.rule": "规则：北京时间周一至周五 09:00-12:00、14:00-18:00（不含中国法定节假日）为高峰；其余时段，包括周末及中国法定节假日全天，均为空闲时段。",
			"tooltip.calendarCovered": "日历：{year} 年法定节假日与调休上班日取国务院办公厅通知。",
			"tooltip.calendarUncovered": "日历：{year} 年放假通知尚未发布，暂按周一至周五推算。",
			"countdown.minutes": "{n} 分钟",
			"countdown.hours": "{n} 小时",
			"countdown.hoursMinutes": "{h} 小时 {m} 分",
			"countdown.days": "{n} 天",
			"countdown.daysHours": "{d} 天 {h} 小时",
			"weekday.1": "周一",
			"weekday.2": "周二",
			"weekday.3": "周三",
			"weekday.4": "周四",
			"weekday.5": "周五",
			"weekday.6": "周六",
			"weekday.7": "周日",
			"announce.offPeak": "DeepSeek API 当前为空闲时段，{note}，按高峰价的一半计费。",
			"announce.peak": "DeepSeek API 当前为高峰时段，{note}，按高峰价计费。"
		};
		const en = {
			"badge.offPeak": "Idle",
			"badge.peak": "Peak",
			"period.offPeak": "off-peak window",
			"period.peak": "peak window",
			"day.holiday": "statutory holiday (off-peak all day)",
			"day.weekend": "weekend (off-peak all day)",
			"day.makeupWeekend": "make-up work weekend (still a weekend — off-peak all day)",
			"day.workday": "working day",
			"day.workdayUncovered": "working day (no holiday calendar for that year yet)",
			"tooltip.period": "DeepSeek API: currently the {period} — off-peak costs half of peak",
			"tooltip.today": "Today {date} {weekday} · {note}",
			"tooltip.next": "Next switch: {period} at {time} (in {countdown})",
			"tooltip.rule": "Rule: peak hours are 09:00-12:00 and 14:00-18:00 Beijing time, Monday to Friday, excluding Chinese public holidays; every other hour — including weekends and the whole of every public holiday — is off-peak.",
			"tooltip.calendarCovered": "Calendar: {year} statutory holidays and make-up workdays follow the State Council notices.",
			"tooltip.calendarUncovered": "Calendar: the {year} holiday notice is not published yet; Monday to Friday is assumed.",
			"countdown.minutes": "{n} min",
			"countdown.hours": "{n} h",
			"countdown.hoursMinutes": "{h} h {m} min",
			"countdown.days": "{n} d",
			"countdown.daysHours": "{d} d {h} h",
			"weekday.1": "Mon",
			"weekday.2": "Tue",
			"weekday.3": "Wed",
			"weekday.4": "Thu",
			"weekday.5": "Fri",
			"weekday.6": "Sat",
			"weekday.7": "Sun",
			"announce.offPeak": "DeepSeek API is currently off-peak: {note}; billed at half the peak rate.",
			"announce.peak": "DeepSeek API is currently at peak: {note}; billed at the peak rate."
		};
		const DICTIONARIES = { zh, en };
		//#endregion

		//#region text helpers (take the injected translate function)
		/** `MM-DD HH:mm` in Beijing time — numeric only, so it needs no translation. */
		function formatClock(date) {
			const clock = beijingClock(date);
			const pad = (value) => String(value).padStart(2, "0");
			return clock.date.slice(5) + " " + pad(clock.hour) + ":" + pad(clock.minute);
		}

		/** Localised "in 2 h 15 min" fragment. @param t - translate; @param ms - milliseconds. */
		function formatCountdown(t, ms) {
			const totalMinutes = Math.max(1, Math.round(ms / 60_000));
			if (totalMinutes < 60) return t("countdown.minutes", { n: totalMinutes });
			const hours = Math.floor(totalMinutes / 60);
			const minutes = totalMinutes % 60;
			if (hours < 24) {
				return minutes === 0
					? t("countdown.hours", { n: hours })
					: t("countdown.hoursMinutes", { h: hours, m: minutes });
			}
			const days = Math.floor(hours / 24);
			const restHours = hours % 24;
			return restHours === 0
				? t("countdown.days", { n: days })
				: t("countdown.daysHours", { d: days, h: restHours });
		}

		/** Localised short label for the pill. @param t - translate; @param status - status. */
		function badgeLabel(t, status) {
			return t(status.offPeak ? "badge.offPeak" : "badge.peak");
		}

		/** Localised long name of a period. @param t - translate; @param offPeak - which period. */
		function periodLabel(t, offPeak) {
			return t(offPeak ? "period.offPeak" : "period.peak");
		}

		/**
		 * Tooltip text (the Tooltip bubble uses `white-space: pre-line`, so newlines
		 * are preserved).
		 * @param t - translate; @param status - status; @param now - the instant it describes.
		 */
		function tooltipText(t, status, now) {
			const lines = [
				t("tooltip.period", { period: periodLabel(t, status.offPeak) }),
				t("tooltip.today", {
					date: status.date,
					weekday: t("weekday." + status.weekday),
					note: t("day." + status.day)
				})
			];
			if (status.switchAt !== null) {
				lines.push(t("tooltip.next", {
					time: formatClock(status.switchAt),
					period: periodLabel(t, status.nextOffPeak),
					countdown: formatCountdown(t, status.switchAt.getTime() - now.getTime())
				}));
			}
			lines.push(t("tooltip.rule"));
			lines.push(t(status.calendarCovered ? "tooltip.calendarCovered" : "tooltip.calendarUncovered", { year: status.year }));
			return lines.join("\n");
		}

		/** Screen-reader announcement (the brand seat sits inside an aria-hidden subtree). */
		function announcementText(t, status) {
			return t(status.offPeak ? "announce.offPeak" : "announce.peak", { note: t("day." + status.day) });
		}
		//#endregion

		//#region state
		/** Refresh on the minute (window boundaries included) and when the page becomes visible. */
		function useStatus() {
			const [status, setStatus] = React.useState(() => statusAt(new Date()));
			React.useEffect(() => {
				let timer = null;
				const schedule = () => {
					if (timer !== null) window.clearTimeout(timer);
					timer = window.setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
				};
				const tick = () => {
					setStatus(statusAt(new Date()));
					schedule();
				};
				const onVisible = () => { if (document.visibilityState === "visible") tick(); };
				tick();
				document.addEventListener("visibilitychange", onVisible);
				return () => {
					if (timer !== null) window.clearTimeout(timer);
					document.removeEventListener("visibilitychange", onVisible);
				};
			}, []);
			return status;
		}
		//#endregion

		//#region presentation
		/** Brand wordmark height: slightly reduced so the pill fits the brand-row budget. */
		const WORDMARK_SIZE = 22;
		/** Below this brand-row width the pill degrades to a dot (280px sidebar → 256px row). */
		const COMPACT_ROW_WIDTH = 250;
		const VISUALLY_HIDDEN = {
			position: "absolute",
			width: 1,
			height: 1,
			margin: -1,
			padding: 0,
			border: 0,
			overflow: "hidden",
			clipPath: "inset(50%)",
			whiteSpace: "nowrap"
		};
		const DOT = {
			width: 6,
			height: 6,
			borderRadius: "50%",
			cornerShape: "round",
			background: "currentColor"
		};

		/** Watch the sidebar brand row and report whether the pill must degrade to a dot. */
		function useCompactLayout(anchorRef) {
			const [compact, setCompact] = React.useState(false);
			React.useEffect(() => {
				const node = anchorRef.current;
				if (node === null || typeof ResizeObserver !== "function") return;
				const row = node.closest('[class*="_logoRow"]');
				if (row === null) return;
				const measure = () => setCompact(row.getBoundingClientRect().width < COMPACT_ROW_WIDTH);
				measure();
				const observer = new ResizeObserver(measure);
				observer.observe(row);
				return () => observer.disconnect();
			}, [anchorRef]);
			return compact;
		}

		/** The pill itself: green = off-peak, amber = peak, tooltip = the whole story. */
		function OffPeakBadge({ t }) {
			const status = useStatus();
			const anchorRef = React.useRef(null);
			const compact = useCompactLayout(anchorRef);
			const tag = React.createElement(
				Tag,
				{ tone: status.offPeak ? "success" : "warning" },
				compact ? React.createElement("span", { style: DOT }) : badgeLabel(t, status)
			);
			// The whole brand row is the "new session" button: never let a click on the
			// badge fall through to it.
			const stop = (event) => event.stopPropagation();
			const anchor = React.createElement(
				"span",
				{
					ref: anchorRef,
					style: { display: "inline-flex", alignItems: "center", flex: "none", cursor: "default" },
					onClick: stop,
					onMouseDown: stop,
					onPointerDown: stop
				},
				tag
			);
			return React.createElement(
				Tooltip,
				{
					label: () => tooltipText(t, status, new Date()),
					side: "bottom",
					align: "end",
					portal: true,
					delayMs: 120,
					maxWidth: 320
				},
				anchor
			);
		}

		/** Occupant of `sidebar.brand.name`: the official wordmark plus the badge. */
		function BrandNameWithOffPeak({ t }) {
			return React.createElement(
				React.Fragment,
				null,
				React.createElement(BrandWordmark, { size: WORDMARK_SIZE, includeMark: false }),
				React.createElement(OffPeakBadge, { t })
			);
		}

		/**
		 * Collapsed-sidebar dot, drawn into `shell.overlay` (an additive list slot).
		 *
		 * It deliberately does NOT take `sidebar.toggle.badge`: that single slot is held
		 * by the official settings plugin's DesktopUpdateBadge, which also reports a
		 * dropped/reconnecting host connection; a single slot renders only its
		 * lowest-priority registration, so taking it would swallow those signals. The
		 * overlay dot is positioned from the collapse button's viewport rectangle and
		 * follows it with a 1 s poll plus a resize listener.
		 */
		function RailStatusDot({ t }) {
			const status = useStatus();
			const [anchor, setAnchor] = React.useState(null);
			React.useEffect(() => {
				const measure = () => {
					const toggle = document.querySelector('[class*="_toggle"]');
					const rail = toggle === null ? null : toggle.closest('[class*="_collapsed"]');
					if (toggle === null || rail === null) {
						setAnchor(null);
						return;
					}
					const box = toggle.getBoundingClientRect();
					if (box.width === 0) {
						setAnchor(null);
						return;
					}
					const next = { right: window.innerWidth - box.right, bottom: window.innerHeight - box.bottom };
					setAnchor((previous) => previous !== null && previous.right === next.right && previous.bottom === next.bottom ? previous : next);
				};
				measure();
				window.addEventListener("resize", measure);
				const timer = window.setInterval(measure, 1000);
				return () => {
					window.removeEventListener("resize", measure);
					window.clearInterval(timer);
				};
			}, []);
			if (anchor === null) return null;
			const dot = React.createElement("span", {
				style: {
					position: "fixed",
					right: anchor.right + 6,
					bottom: anchor.bottom + 6,
					width: 8,
					height: 8,
					borderRadius: "50%",
					cornerShape: "round",
					pointerEvents: "auto",
					background: status.offPeak ? "var(--dsw-alias-state-success-primary)" : "var(--dsw-alias-state-warn-primary)",
					boxShadow: "0 0 0 1.5px var(--dsw-alias-bg-base)"
				}
			});
			return React.createElement(
				Tooltip,
				{ label: () => tooltipText(t, status, new Date()), side: "right", portal: true, delayMs: 120, maxWidth: 320 },
				dot
			);
		}

		/** Visually hidden live region: the brand seat is inside an aria-hidden subtree. */
		function StatusAnnouncement({ t }) {
			const status = useStatus();
			return React.createElement(
				"span",
				{ role: "status", "aria-live": "polite", style: VISUALLY_HIDDEN },
				announcementText(t, status)
			);
		}
		//#endregion

		/** Required services: the slot registry and the locale registry. */
		const inject = ["slots", "locale"];

		/**
		 * Register the dictionaries and the three seats.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), "offpeak-badge: dictionaries");
			// priority -1: `sidebar.brand.name` is a single slot and only its
			// lowest-priority registration renders, so taking it over is the only way to
			// put the badge next to the official wordmark (which this plugin re-renders).
			ctx.slots.inject("sidebar.brand.name", () => ctx.slots.register(
				{ name: "sidebar.brand.name", priority: -1, locale: NS },
				BrandNameWithOffPeak
			));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register(
				{ name: "shell.overlay", id: "offpeak-badge.rail", priority: 0, locale: NS },
				RailStatusDot
			));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register(
				{ name: "shell.overlay", id: "offpeak-badge.announcement", priority: 0, locale: NS },
				StatusAnnouncement
			));
		}

		exports.apply = apply;
		exports.inject = inject;
		exports.namespace = NS;
		/** Offline self-test entry points (selftest.mjs); not used at runtime. */
		exports.internals = {
			NS,
			CALENDAR,
			PEAK_WINDOWS,
			DICTIONARIES,
			beijingClock,
			beijingMidnight,
			shiftDate,
			weekdayOf,
			isPeakEligibleDate,
			inPeakWindow,
			statusAt,
			formatClock,
			formatCountdown,
			badgeLabel,
			periodLabel,
			tooltipText,
			announcementText,
			BrandNameWithOffPeak,
			OffPeakBadge,
			RailStatusDot,
			StatusAnnouncement
		};
		return module.exports;
	}
});
