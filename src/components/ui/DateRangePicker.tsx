import { useState, useEffect, useRef } from 'react';
import {
  format, parseISO, addMonths, subMonths, startOfMonth, endOfMonth,
  startOfWeek, endOfWeek, addDays, isSameDay, isSameMonth, isToday,
  startOfYear, endOfYear, subYears, startOfDay, endOfDay,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  from: string; // yyyy-MM-dd
  to: string;   // yyyy-MM-dd
  onChange: (from: string, to: string) => void;
}

const QUICK: { label: string; get: () => { from: Date; to: Date } }[] = [
  { label: 'Heute',                 get: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }) },
  { label: 'Gestern',               get: () => { const d = addDays(new Date(), -1); return { from: startOfDay(d), to: endOfDay(d) }; } },
  { label: 'Diese Woche',           get: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
  { label: 'Letzte Woche',          get: () => { const s = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -7); return { from: s, to: addDays(s, 6) }; } },
  { label: 'Die letzten zwei Wochen', get: () => { const s = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -7); return { from: s, to: endOfWeek(new Date(), { weekStartsOn: 1 }) }; } },
  { label: 'Diesen Monat',          get: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: 'Letzten Monat',         get: () => { const d = addMonths(new Date(), -1); return { from: startOfMonth(d), to: endOfMonth(d) }; } },
  { label: 'Dieses Jahr',           get: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
  { label: 'Letztes Jahr',          get: () => { const d = subYears(new Date(), 1); return { from: startOfYear(d), to: endOfYear(d) }; } },
];

function getCalendarWeeks(month: Date): Date[][] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const weeks: Date[][] = [];
  let cur = start;
  while (cur <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) { week.push(cur); cur = addDays(cur, 1); }
    weeks.push(week);
  }
  return weeks;
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd');

export default function DateRangePicker({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<1 | 2>(1); // 1 = picking start, 2 = picking end
  const [tempFrom, setTempFrom] = useState<Date>(parseISO(from));
  const [tempTo, setTempTo] = useState<Date>(parseISO(to));
  const [hovered, setHovered] = useState<Date | null>(null);
  const [viewMonth, setViewMonth] = useState<Date>(startOfMonth(parseISO(from)));
  const [activeQuick, setActiveQuick] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync internal state when external props change
  useEffect(() => {
    setTempFrom(parseISO(from));
    setTempTo(parseISO(to));
    setViewMonth(startOfMonth(parseISO(from)));
  }, [from, to]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPhase(1);
      }
    };
    // Use pointerdown so synthetic .click() calls don't accidentally close the picker
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [open]);

  const applyQuick = (label: string, range: { from: Date; to: Date }) => {
    setActiveQuick(label);
    setTempFrom(range.from);
    setTempTo(range.to);
    setViewMonth(startOfMonth(range.from));
    onChange(fmt(range.from), fmt(range.to));
    setOpen(false);
    setPhase(1);
  };

  const handleDayClick = (day: Date) => {
    if (phase === 1) {
      setTempFrom(day);
      setTempTo(day);
      setPhase(2);
      setActiveQuick(null);
    } else {
      if (day < tempFrom) {
        // Clicked before start → restart with new start
        setTempFrom(day);
        setTempTo(day);
        setPhase(2);
      } else {
        setTempTo(day);
        onChange(fmt(tempFrom), fmt(day));
        setActiveQuick(null);
        setOpen(false);
        setPhase(1);
        setHovered(null);
      }
    }
  };

  const effectiveTo = phase === 2 && hovered ? (hovered >= tempFrom ? hovered : tempFrom) : tempTo;

  const dayClass = (day: Date) => {
    const isStart = isSameDay(day, tempFrom);
    const isEnd = isSameDay(day, effectiveTo);
    const inRange = day > tempFrom && day < effectiveTo;
    const outside = phase === 1
      ? !isSameMonth(day, viewMonth) && !isSameMonth(day, addMonths(viewMonth, 1))
      : false;

    let base = 'w-8 h-8 flex items-center justify-center text-xs rounded-full mx-auto cursor-pointer select-none transition-colors ';

    if (isStart || isEnd) {
      base += 'bg-accent text-white font-semibold ';
    } else if (inRange) {
      base += 'bg-accent/20 text-primary rounded-none ';
    } else if (isToday(day)) {
      base += 'border border-accent text-accent ';
    } else {
      base += outside ? 'text-secondary/30 ' : 'text-secondary hover:bg-white/10 ';
    }
    return base;
  };

  const wrapClass = (day: Date) => {
    const isStart = isSameDay(day, tempFrom);
    const isEnd = isSameDay(day, effectiveTo);
    const inRange = day > tempFrom && day < effectiveTo;
    let base = 'flex-1 py-0.5 ';
    if (inRange) base += 'bg-accent/10 ';
    if (isStart && !isSameDay(tempFrom, effectiveTo)) base += 'bg-gradient-to-r from-transparent to-accent/10 ';
    if (isEnd && !isSameDay(tempFrom, effectiveTo)) base += 'bg-gradient-to-l from-transparent to-accent/10 ';
    return base;
  };

  const renderMonth = (month: Date) => {
    const weeks = getCalendarWeeks(month);
    return (
      <div className="flex-1 min-w-0">
        <p className="text-center text-sm font-medium text-primary mb-3">
          {format(month, 'MMMM yyyy', { locale: de })}
        </p>
        <div className="grid grid-cols-7 mb-1">
          {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
            <div key={d} className="text-center text-xs text-secondary/60 font-medium py-1">{d}</div>
          ))}
        </div>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7">
            {week.map((day, di) => (
              <div
                key={di}
                className={wrapClass(day)}
                onMouseEnter={() => phase === 2 && setHovered(day)}
                onMouseLeave={() => phase === 2 && setHovered(null)}
                onClick={() => handleDayClick(day)}
              >
                <div className={dayClass(day)}>
                  {format(day, 'd')}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  const displayFrom = format(parseISO(from), 'dd.MM.yyyy');
  const displayTo = format(parseISO(to), 'dd.MM.yyyy');

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger */}
      <button
        onClick={() => { setOpen(v => !v); setPhase(1); }}
        className="flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-lg text-sm text-primary hover:border-accent transition-colors"
      >
        <Calendar size={15} className="text-secondary" />
        <span className="font-mono tabular-nums">{displayFrom} – {displayTo}</span>
      </button>

      {/* Popover */}
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 bg-sidebar border border-border rounded-xl shadow-2xl flex"
          style={{ minWidth: 640 }}>

          {/* Quick options */}
          <div className="w-44 border-r border-border py-2 flex-shrink-0">
            {QUICK.map(q => (
              <button
                key={q.label}
                onClick={() => applyQuick(q.label, q.get())}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  activeQuick === q.label
                    ? 'text-accent bg-accent/10 font-medium'
                    : 'text-secondary hover:text-primary hover:bg-white/5'
                }`}
              >
                {q.label}
              </button>
            ))}
          </div>

          {/* Calendar */}
          <div className="flex-1 p-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setViewMonth(m => subMonths(m, 1))}
                className="p-1 rounded text-secondary hover:text-primary hover:bg-white/5"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setViewMonth(m => addMonths(m, 1))}
                className="p-1 rounded text-secondary hover:text-primary hover:bg-white/5"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Two months */}
            <div className="flex gap-6">
              {renderMonth(viewMonth)}
              <div className="w-px bg-border flex-shrink-0" />
              {renderMonth(addMonths(viewMonth, 1))}
            </div>

            {/* Hint when picking second date */}
            {phase === 2 && (
              <p className="text-xs text-secondary mt-3 text-center">
                Enddatum wählen – oder Startdatum neu setzen
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
