'use client';

import { Menu, X } from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

type DotUnit = 'day' | 'week' | 'month';
type RowUnit = 'week' | 'month' | 'year';

type DotItem = {
  date: Date;
  iso: string;
  label: string;
};

type CalendarRow = {
  cells: (DotItem | null)[];
  key: string;
  label: string;
};

const DAY_MS = 86_400_000;
const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const unitRank = { day: 0, week: 1, month: 2, year: 3 } as const;

function columnLabelsFor(dotUnit: DotUnit, rowUnit: RowUnit) {
  if (dotUnit === 'day' && rowUnit === 'week') return weekdays;
  if (dotUnit === 'week' && rowUnit === 'month') {
    return Array.from({ length: 5 }, (_, index) => `Week ${index + 1}`);
  }
  if (dotUnit === 'month' && rowUnit === 'year') {
    return Array.from({ length: 12 }, (_, month) =>
      new Date(2026, month, 1).toLocaleDateString(undefined, { month: 'short' })
    );
  }
  return [];
}

function toISO(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayISO() {
  return toISO(new Date());
}

function parseDate(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

function isDate(value: string | null): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const parsed = parseDate(value);
  return !Number.isNaN(parsed.getTime()) && toISO(parsed) === value;
}

function addDays(iso: string, amount: number) {
  const date = parseDate(iso);
  date.setDate(date.getDate() + amount);
  return toISO(date);
}

function calendarDays(start: string, end: string) {
  if (!start || !end || start > end) return [];
  const dates: Date[] = [];
  const cursor = parseDate(start);
  const last = parseDate(end);
  while (cursor <= last) {
    dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function startOf(date: Date, unit: DotUnit | RowUnit) {
  const result = new Date(date);
  if (unit === 'week') result.setDate(result.getDate() - result.getDay());
  if (unit === 'month') result.setDate(1);
  if (unit === 'year') result.setMonth(0, 1);
  return result;
}

function endOf(date: Date, unit: DotUnit | RowUnit) {
  const result = startOf(date, unit);
  if (unit === 'day') return result;
  if (unit === 'week') result.setDate(result.getDate() + 6);
  if (unit === 'month') result.setMonth(result.getMonth() + 1, 0);
  if (unit === 'year') result.setFullYear(result.getFullYear() + 1, 0, 0);
  return result;
}

function dateLabel(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dotLabel(date: Date, unit: DotUnit) {
  if (unit === 'day') {
    return date.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });
  }
  if (unit === 'month') {
    return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return `Week of ${dateLabel(date)} through ${dateLabel(endOf(date, 'week'))}`;
}

function rowLabel(date: Date, unit: RowUnit) {
  if (unit === 'year') return date.getFullYear().toString();
  if (unit === 'month') {
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }
  const end = endOf(date, 'week');
  const startText = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endText = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${startText} – ${endText}`;
}

function dayOfYear(date: Date) {
  return Math.round(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 1)) / DAY_MS
  );
}

function columnsFor(dotUnit: DotUnit, rowUnit: RowUnit) {
  if (dotUnit === rowUnit) return 1;
  if (dotUnit === 'day' && rowUnit === 'week') return 7;
  if (dotUnit === 'day' && rowUnit === 'month') return 31;
  if (dotUnit === 'day' && rowUnit === 'year') return 366;
  if (dotUnit === 'week' && rowUnit === 'month') return 5;
  if (dotUnit === 'week' && rowUnit === 'year') return 53;
  if (dotUnit === 'month' && rowUnit === 'year') return 12;
  return 1;
}

function positionInRow(date: Date, dotUnit: DotUnit, rowUnit: RowUnit) {
  if (dotUnit === rowUnit) return 0;
  if (dotUnit === 'day' && rowUnit === 'week') return date.getDay();
  if (dotUnit === 'day' && rowUnit === 'month') return date.getDate() - 1;
  if (dotUnit === 'day' && rowUnit === 'year') return dayOfYear(date);
  if (dotUnit === 'week' && rowUnit === 'month') {
    const monday = new Date(date);
    monday.setDate(monday.getDate() + 1);
    return Math.floor((monday.getDate() - 1) / 7);
  }
  if (dotUnit === 'week' && rowUnit === 'year') return Math.floor(dayOfYear(date) / 7);
  if (dotUnit === 'month' && rowUnit === 'year') return date.getMonth();
  return 0;
}

function buildRows(days: Date[], dotUnit: DotUnit, rowUnit: RowUnit) {
  const columns = columnsFor(dotUnit, rowUnit);
  const uniqueDots = new Map<string, Date>();
  for (const day of days) {
    const anchor = startOf(day, dotUnit);
    uniqueDots.set(toISO(anchor), anchor);
  }

  const rowMap = new Map<string, CalendarRow>();
  for (const [iso, date] of uniqueDots) {
    const rowReference = new Date(date);
    if (dotUnit === 'week' && rowUnit === 'month') {
      rowReference.setDate(rowReference.getDate() + 1);
    }
    const rowDate = startOf(rowReference, rowUnit);
    const rowKey = toISO(rowDate);
    const row = rowMap.get(rowKey) ?? {
      cells: Array<DotItem | null>(columns).fill(null),
      key: rowKey,
      label: rowLabel(rowDate, rowUnit)
    };
    row.cells[positionInRow(date, dotUnit, rowUnit)] = {
      date,
      iso,
      label: dotLabel(date, dotUnit)
    };
    rowMap.set(rowKey, row);
  }
  return [...rowMap.values()];
}

function normalizeRow(dotUnit: DotUnit, rowUnit: RowUnit): RowUnit {
  if (unitRank[rowUnit] >= unitRank[dotUnit]) return rowUnit;
  return dotUnit === 'month' ? 'month' : 'week';
}

function readDotUnit(value: string | null): DotUnit {
  return value === 'week' || value === 'month' ? value : 'day';
}

function readRowUnit(value: string | null): RowUnit {
  return value === 'month' || value === 'year' ? value : 'week';
}

function clampScale(value: string | null, fallback: number) {
  if (value === null || value.trim() === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(160, Math.max(50, Math.round(number))) : fallback;
}

function clampDotSize(value: string | null, fallback: number) {
  if (value === null || value.trim() === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(5, Math.round(number))) : fallback;
}

function writeRange(start: string, end: string) {
  const url = new URL(window.location.href);
  url.searchParams.set('start', start);
  url.searchParams.set('end', end);
  window.history.replaceState(window.history.state, '', url);
}

function writeDisplay(
  horizontal: number,
  vertical: number,
  dotSize: number,
  showWeekdays: boolean,
  showRowRanges: boolean,
  dotUnit: DotUnit,
  rowUnit: RowUnit
) {
  const url = new URL(window.location.href);
  url.searchParams.set('x', String(horizontal));
  url.searchParams.set('y', String(vertical));
  url.searchParams.set('size', String(dotSize));
  url.searchParams.set('weekdays', showWeekdays ? '1' : '0');
  url.searchParams.set('weeks', showRowRanges ? '1' : '0');
  url.searchParams.set('dot', dotUnit);
  url.searchParams.set('row', rowUnit);
  window.history.replaceState(window.history.state, '', url);
}

function readSelected(value: string | null) {
  return new Set((value ?? '').split(',').filter((date) => isDate(date)));
}

function writeSelected(selected: Set<string>) {
  const url = new URL(window.location.href);
  const dates = [...selected].sort();
  if (dates.length) url.searchParams.set('selected', dates.join(','));
  else url.searchParams.delete('selected');
  window.history.replaceState(window.history.state, '', url);
}

export function DotCalendar() {
  const today = useMemo(() => todayISO(), []);
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(() => addDays(today, 89));
  const [menuOpen, setMenuOpen] = useState(false);
  const [horizontal, setHorizontal] = useState(100);
  const [vertical, setVertical] = useState(100);
  const [dotSize, setDotSize] = useState(10);
  const [showWeekdays, setShowWeekdays] = useState(false);
  const [showRowRanges, setShowRowRanges] = useState(false);
  const [dotUnit, setDotUnit] = useState<DotUnit>('day');
  const [rowUnit, setRowUnit] = useState<RowUnit>('week');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const readUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const nextStart = isDate(params.get('start')) ? params.get('start')! : today;
      const nextEnd = isDate(params.get('end')) ? params.get('end')! : addDays(nextStart, 89);
      const nextHorizontal = clampScale(params.get('x'), 100);
      const nextVertical = clampScale(params.get('y'), 100);
      const nextDotSize = clampDotSize(params.get('size'), 10);
      const nextShowWeekdays = params.get('weekdays') === '1';
      const nextShowRowRanges = params.get('weeks') === '1';
      const nextDotUnit = readDotUnit(params.get('dot'));
      const nextRowUnit = normalizeRow(nextDotUnit, readRowUnit(params.get('row')));
      const nextSelected = readSelected(params.get('selected'));

      setStart(nextStart);
      setEnd(nextEnd);
      setHorizontal(nextHorizontal);
      setVertical(nextVertical);
      setDotSize(nextDotSize);
      setShowWeekdays(nextShowWeekdays);
      setShowRowRanges(nextShowRowRanges);
      setDotUnit(nextDotUnit);
      setRowUnit(nextRowUnit);
      setSelected(nextSelected);
      writeRange(nextStart, nextEnd);
      writeDisplay(
        nextHorizontal,
        nextVertical,
        nextDotSize,
        nextShowWeekdays,
        nextShowRowRanges,
        nextDotUnit,
        nextRowUnit
      );
      writeSelected(nextSelected);
    };

    readUrl();
    window.addEventListener('popstate', readUrl);
    return () => window.removeEventListener('popstate', readUrl);
  }, [today]);

  const days = useMemo(() => calendarDays(start, end), [start, end]);
  const invalid = !isDate(start) || !isDate(end) || start > end;
  const columns = columnsFor(dotUnit, rowUnit);
  const rows = useMemo(() => buildRows(days, dotUnit, rowUnit), [days, dotUnit, rowUnit]);
  const dotCount = rows.reduce(
    (total, row) => total + row.cells.reduce((count, cell) => count + (cell ? 1 : 0), 0),
    0
  );
  const todayDot = toISO(startOf(parseDate(today), dotUnit));
  const columnLabels = columnLabelsFor(dotUnit, rowUnit);
  const canShowColumnLabels = columnLabels.length > 0;

  const changeStart = (value: string) => {
    setStart(value);
    if (isDate(value)) writeRange(value, end);
  };

  const changeEnd = (value: string) => {
    setEnd(value);
    if (isDate(value)) writeRange(start, value);
  };

  const setPreset = (count: number) => {
    const nextStart = todayISO();
    const nextEnd = addDays(nextStart, count - 1);
    setStart(nextStart);
    setEnd(nextEnd);
    writeRange(nextStart, nextEnd);
  };

  const updateDisplay = (next: {
    horizontal?: number;
    vertical?: number;
    dotSize?: number;
    showWeekdays?: boolean;
    showRowRanges?: boolean;
    dotUnit?: DotUnit;
    rowUnit?: RowUnit;
  }) => {
    const nextHorizontal = next.horizontal ?? horizontal;
    const nextVertical = next.vertical ?? vertical;
    const nextDotSize = next.dotSize ?? dotSize;
    const nextShowWeekdays = next.showWeekdays ?? showWeekdays;
    const nextShowRowRanges = next.showRowRanges ?? showRowRanges;
    const nextDotUnit = next.dotUnit ?? dotUnit;
    const nextRowUnit = normalizeRow(nextDotUnit, next.rowUnit ?? rowUnit);
    setHorizontal(nextHorizontal);
    setVertical(nextVertical);
    setDotSize(nextDotSize);
    setShowWeekdays(nextShowWeekdays);
    setShowRowRanges(nextShowRowRanges);
    setDotUnit(nextDotUnit);
    setRowUnit(nextRowUnit);
    writeDisplay(
      nextHorizontal,
      nextVertical,
      nextDotSize,
      nextShowWeekdays,
      nextShowRowRanges,
      nextDotUnit,
      nextRowUnit
    );
  };

  const toggleDate = (date: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      writeSelected(next);
      return next;
    });
  };

  const clearSelected = () => {
    const next = new Set<string>();
    setSelected(next);
    writeSelected(next);
  };

  const formattedStart = days[0] ? dateLabel(days[0]) : '';
  const formattedEnd = days.at(-1) ? dateLabel(days.at(-1)!) : '';
  const unitName = dotCount === 1 ? dotUnit : `${dotUnit}s`;

  return (
    <div className="dot-tool">
      <button
        aria-expanded={menuOpen}
        aria-label={menuOpen ? 'Close calendar menu' : 'Open calendar menu'}
        className="solar-menu-button"
        onClick={() => setMenuOpen((open) => !open)}
        type="button"
      >
        {menuOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {menuOpen && (
        <aside className="dot-menu-panel">
          <section>
            <span className="dot-menu-heading">Date range</span>
            <label className="dot-date-control">
              <span>Start</span>
              <input type="date" value={start} onChange={(event) => changeStart(event.target.value)} />
            </label>
            <label className="dot-date-control">
              <span>End</span>
              <input type="date" value={end} onChange={(event) => changeEnd(event.target.value)} />
            </label>
            {invalid && <p className="dot-menu-error">The end date must follow the start date.</p>}
          </section>

          <section>
            <span className="dot-menu-heading">From today</span>
            <div className="dot-preset-grid">
              <button type="button" onClick={() => setPreset(30)}>30 days</button>
              <button type="button" onClick={() => setPreset(90)}>90 days</button>
              <button type="button" onClick={() => setPreset(180)}>180 days</button>
              <button type="button" onClick={() => setPreset(365)}>1 year</button>
            </div>
          </section>

          <section>
            <span className="dot-menu-heading">Structure</span>
            <label className="dot-select-control">
              <span>Each dot represents</span>
              <select value={dotUnit} onChange={(event) => updateDisplay({ dotUnit: event.target.value as DotUnit })}>
                <option value="day">One day</option>
                <option value="week">One week</option>
                <option value="month">One month</option>
              </select>
            </label>
            <label className="dot-select-control">
              <span>Each row represents</span>
              <select value={rowUnit} onChange={(event) => updateDisplay({ rowUnit: event.target.value as RowUnit })}>
                <option disabled={unitRank.week < unitRank[dotUnit]} value="week">One week</option>
                <option disabled={unitRank.month < unitRank[dotUnit]} value="month">One month</option>
                <option value="year">One year</option>
              </select>
            </label>
          </section>

          <section>
            <span className="dot-menu-heading">Layout</span>
            <label className="dot-range-control">
              <span>Horizontal spacing</span><output>{horizontal}%</output>
              <input aria-label="Horizontal spacing" max="160" min="50" onChange={(event) => updateDisplay({ horizontal: Number(event.target.value) })} type="range" value={horizontal} />
            </label>
            <label className="dot-range-control">
              <span>Vertical spacing</span><output>{vertical}%</output>
              <input aria-label="Vertical spacing" max="160" min="50" onChange={(event) => updateDisplay({ vertical: Number(event.target.value) })} type="range" value={vertical} />
            </label>
            <label className="dot-range-control">
              <span>Dot size</span><output>{dotSize}%</output>
              <input aria-label="Dot size" max="100" min="5" onChange={(event) => updateDisplay({ dotSize: Number(event.target.value) })} type="range" value={dotSize} />
            </label>
            <label className={`dot-toggle${canShowColumnLabels ? '' : ' is-disabled'}`}>
              <input checked={showWeekdays && canShowColumnLabels} disabled={!canShowColumnLabels} onChange={(event) => updateDisplay({ showWeekdays: event.target.checked })} type="checkbox" />
              <span>Column labels</span>
            </label>
            <label className="dot-toggle">
              <input checked={showRowRanges} onChange={(event) => updateDisplay({ showRowRanges: event.target.checked })} type="checkbox" />
              <span>Row date ranges</span>
            </label>
          </section>

          <section>
            <span className="dot-menu-heading">Share</span>
            <p className="dot-menu-note">The layout and marked dots are stored in this page&apos;s URL. Copy the link to share this view.</p>
          </section>

          {selected.size > 0 && (
            <section>
              <span className="dot-menu-heading">Marked dots</span>
              <button className="dot-clear-button" onClick={clearSelected} type="button">
                Clear {selected.size.toLocaleString()} {selected.size === 1 ? 'dot' : 'dots'}
              </button>
            </section>
          )}
        </aside>
      )}

      <main className={`dot-stage${menuOpen ? ' is-menu-open' : ''}`}>
        <header className="dot-stage-header">
          <h1>{invalid ? 'Choose a valid range' : `${dotCount.toLocaleString()} ${unitName}`}</h1>
          {!invalid && <p>{formattedStart} — {formattedEnd}</p>}
        </header>

        {!invalid && (
          <div className="dot-field-wrap">
            <div
              className={`dot-field${showRowRanges ? ' has-week-ranges' : ''}`}
              style={(() => {
                const fieldWidth = 640 * horizontal / 100;
                const rowHeight = (640 / 7) * vertical / 100;
                const columnWidth = fieldWidth / columns;
                const smallestSpacing = Math.min(columnWidth, rowHeight);
                const requestedCircleSize = smallestSpacing * dotSize / 100;
                const morphProgress = Math.min(1, Math.max(0, (dotSize - 55) / 45));
                const easedMorph = morphProgress * morphProgress * (3 - 2 * morphProgress);
                const fill = Math.min(dotSize / 100, 0.94);
                const rectangleWidth = columnWidth * fill;
                const rectangleHeight = rowHeight * fill;
                const renderedWidth = requestedCircleSize + (rectangleWidth - requestedCircleSize) * easedMorph;
                const renderedHeight = requestedCircleSize + (rectangleHeight - requestedCircleSize) * easedMorph;
                const radiusRatio = 0.5 - 0.26 * easedMorph;
                const todayInset = Math.min(14, Math.max(2, Math.min(renderedWidth, renderedHeight) * 0.16));
                return {
                  '--dot-columns': columns,
                  '--dot-field-width': `${Math.round(fieldWidth)}px`,
                  '--dot-row-height': `${Math.round(rowHeight)}px`,
                  '--dot-width': `${renderedWidth.toFixed(1)}px`,
                  '--dot-height': `${renderedHeight.toFixed(1)}px`,
                  '--dot-radius': `${(Math.min(renderedWidth, renderedHeight) * radiusRatio).toFixed(1)}px`,
                  '--dot-hover-scale': `${(1.35 - 0.35 * easedMorph).toFixed(3)}`,
                  '--today-inset': `${todayInset.toFixed(1)}px`
                } as CSSProperties;
              })()}
            >
              {showWeekdays && canShowColumnLabels && (
                <div className="dot-field-heading" aria-hidden="true">
                  {showRowRanges && <span />}
                  <div className="dot-column-labels">
                    {columnLabels.map((label) => <span key={label}>{label}</span>)}
                  </div>
                </div>
              )}
              <div className="dot-calendar-rows" role="grid" aria-label={`${dotCount} ${unitName}`}>
                {rows.map((row) => (
                  <div className="dot-week-row" key={row.key} role="row">
                    {showRowRanges && <span className="dot-week-range">{row.label}</span>}
                    <div className="dot-week-dots">
                      {row.cells.map((item, index) => {
                        if (!item) return <span className="dot-gridcell" key={`empty-${index}`} role="gridcell" />;
                        const isToday = item.iso === todayDot;
                        const isSelected = selected.has(item.iso);
                        return (
                          <span className="dot-gridcell" key={item.iso} role="gridcell">
                            <button
                              aria-label={`${isSelected ? 'Unmark' : 'Mark'} ${item.label}${isToday ? ', contains today' : ''}`}
                              aria-pressed={isSelected}
                              className={`dot-cell${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}`}
                              onClick={() => toggleDate(item.iso)}
                              title={item.label}
                              type="button"
                            >
                              <span className="calendar-dot" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
