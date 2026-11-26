import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface CustomSelectProps {
  ariaLabel: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  size?: 'xs' | 'sm' | 'md';
  direction?: 'down' | 'up';
  align?: 'left' | 'right';
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  icon?: React.ReactNode;
  title?: string;
  onFocus?: () => void;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  placeholder = '请选择',
  size = 'md',
  direction = 'down',
  align = 'left',
  className = '',
  triggerClassName = '',
  menuClassName = '',
  icon,
  title,
  onFocus,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open]);

  const sizeStyles =
    size === 'xs'
      ? 'h-7 px-2 text-[12px] rounded-lg gap-1'
      : size === 'sm'
        ? 'h-8 px-2.5 text-[12.5px] rounded-lg gap-1.5'
        : 'h-9 px-3 text-[13px] rounded-xl gap-2';

  return (
    <div ref={rootRef} className={`relative inline-flex items-center ${className}`} title={title}>
      {/* Visual Trigger */}
      <div
        aria-hidden="true"
        className={`w-full inline-flex items-center justify-between border transition-all duration-150 ${sizeStyles} ${
          disabled
            ? 'bg-slate-50 border-slate-200/70 text-slate-400 cursor-not-allowed'
            : open
              ? 'bg-white border-blue-500 ring-2 ring-blue-500/15 text-[#1f2329] shadow-2xs'
              : 'bg-white border-slate-200/90 hover:border-slate-300 text-[#1f2329] shadow-2xs'
        } ${triggerClassName}`}
      >
        <span className="inline-flex items-center gap-1.5 min-w-0 flex-1">
          {icon && <span className="shrink-0 flex items-center">{icon}</span>}
          <span className={`truncate ${!selected ? 'text-slate-400' : 'font-medium'}`}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </div>

      {/* Real <select> synced for accessibility & Playwright/C# automation; mousedown opens custom menu */}
      <select
        ref={selectRef}
        aria-label={ariaLabel}
        disabled={disabled}
        value={value}
        onFocus={onFocus}
        onMouseDown={(e) => {
          if (disabled) return;
          e.preventDefault();
          onFocus?.();
          setOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault();
            onFocus?.();
            setOpen((prev) => !prev);
          }
        }}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(false);
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {/* Bespoke Animated Popover Menu */}
      {open && !disabled && (
        <div
          role="listbox"
          aria-label={`${ariaLabel}选项`}
          className={`animate-surface-in absolute z-[80] min-w-full w-max max-w-[280px] max-h-64 overflow-y-auto bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-xl shadow-[0_14px_34px_-8px_rgba(15,23,42,0.18)] p-1.5 ${
            direction === 'up' ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${align === 'right' ? 'right-0' : 'left-0'} ${menuClassName}`}
        >
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[12.5px] flex items-center justify-between gap-2 transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-[#1f2329] hover:bg-slate-100/80'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate">{opt.label}</div>
                  {opt.description && (
                    <div className="text-[11px] text-slate-400 truncate">{opt.description}</div>
                  )}
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
