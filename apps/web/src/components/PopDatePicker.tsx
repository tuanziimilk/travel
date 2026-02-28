import { useEffect, useMemo, useRef, useState } from "react";

type PopDatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

const weekNames = ["一", "二", "三", "四", "五", "六", "日"];

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateString(value: string) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthLabel(date: Date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function PopDatePicker({ value, onChange, placeholder = "选择日期" }: PopDatePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selectedDate = parseDateString(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(selectedDate ?? new Date());

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (selectedDate) {
      setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  }, [value]);

  const monthDays = useMemo(() => {
    const firstDay = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const firstWeekday = (firstDay.getDay() + 6) % 7;
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstWeekday);

    return Array.from({ length: 42 }).map((_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [viewMonth]);

  const showValue = selectedDate ? toDateString(selectedDate) : placeholder;
  const today = new Date();
  const todayString = toDateString(today);

  function prevMonth() {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function nextMonth() {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  function selectDate(date: Date) {
    onChange(toDateString(date));
    setOpen(false);
  }

  return (
    <div className="date-pop" ref={rootRef}>
      <button className="date-pop-trigger" type="button" onClick={() => setOpen((prev) => !prev)}>
        <span>{showValue}</span>
        <span className="date-pop-arrow">▼</span>
      </button>

      {open && (
        <div className="date-pop-panel">
          <div className="date-pop-header">
            <span className="date-pop-title">{monthLabel(viewMonth)}</span>
            <div className="date-pop-nav">
              <button type="button" onClick={prevMonth} aria-label="上个月">
                ↑
              </button>
              <button type="button" onClick={nextMonth} aria-label="下个月">
                ↓
              </button>
            </div>
          </div>

          <div className="date-pop-weekdays">
            {weekNames.map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>

          <div className="date-pop-grid">
            {monthDays.map((date) => {
              const dateString = toDateString(date);
              const inMonth = date.getMonth() === viewMonth.getMonth();
              const selected = value === dateString;
              const isToday = dateString === todayString;
              return (
                <button
                  key={dateString}
                  type="button"
                  className={`date-cell ${inMonth ? "" : "muted"} ${selected ? "selected" : ""} ${isToday ? "today" : ""}`}
                  onClick={() => selectDate(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="date-pop-footer">
            <button
              type="button"
              className="clear"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              清除
            </button>
            <button
              type="button"
              className="today-btn"
              onClick={() => {
                onChange(todayString);
                setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                setOpen(false);
              }}
            >
              今天
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

