import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameDay, isSameMonth, isToday,
} from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props {
  entryDate: string;
  anchorRef: React.RefObject<HTMLElement | null>;
  onSelect: (newDate: Date) => void;
  onClose: () => void;
}

function getCalendarDays(month: Date): Date[] {
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const end   = endOfWeek(endOfMonth(month),     { weekStartsOn: 1 });
  const days: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

export default function EntryDatePicker({ entryDate, anchorRef, onSelect, onClose }: Props) {
  const current = parseISO(entryDate);
  const [viewMonth, setViewMonth] = useState(startOfMonth(current));
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const pickerRef = useRef<HTMLDivElement>(null);

  // Position below the anchor button
  useEffect(() => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left + r.width / 2 });
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [onClose, anchorRef]);

  const days = getCalendarDays(viewMonth);

  return createPortal(
    <div
      ref={pickerRef}
      className="fixed z-[9999] bg-sidebar border border-border rounded-xl shadow-2xl p-3 w-64"
      style={{ top: pos.top, left: pos.left, transform: 'translateX(-50%)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => setViewMonth(m => subMonths(m, 1))}
          className="p-1 rounded text-secondary hover:text-primary hover:bg-white/5"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-sm font-medium text-primary">
          {format(viewMonth, 'MMMM yyyy', { locale: de })}
        </span>
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={() => setViewMonth(m => addMonths(m, 1))}
          className="p-1 rounded text-secondary hover:text-primary hover:bg-white/5"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
          <div key={d} className="text-center text-xs text-secondary/50 py-0.5">{d}</div>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const isSelected = isSameDay(day, current);
          const isCurrentMonth = isSameMonth(day, viewMonth);
          const isTodays = isToday(day);
          return (
            <button
              key={i}
              onPointerDown={e => e.stopPropagation()}
              onClick={() => { onSelect(day); onClose(); }}
              className={`
                w-8 h-8 mx-auto flex items-center justify-center text-xs rounded-full transition-colors
                ${isSelected
                  ? 'bg-accent text-white font-semibold'
                  : isTodays
                  ? 'border border-accent text-accent'
                  : isCurrentMonth
                  ? 'text-secondary hover:bg-white/10 hover:text-primary'
                  : 'text-secondary/30'}
              `}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
