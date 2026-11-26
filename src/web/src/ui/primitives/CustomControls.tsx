import React from 'react';
import { Check } from 'lucide-react';

interface CustomSwitchProps {
  ariaLabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const CustomSwitch: React.FC<CustomSwitchProps> = ({
  ariaLabel,
  checked,
  onChange,
  disabled = false,
}) => {
  return (
    <span className="relative inline-flex items-center shrink-0">
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
      />
      <span
        aria-hidden="true"
        className={`w-10 h-[22px] rounded-full p-0.5 transition-all duration-200 flex items-center peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/40 ${
          disabled ? 'opacity-50' : ''
        } ${checked ? 'bg-blue-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.1)]' : 'bg-slate-200'}`}
      >
        <span
          className={`w-[18px] h-[18px] rounded-full bg-white shadow-sm transform transition-transform duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            checked ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </span>
    </span>
  );
};

interface CustomCheckboxProps {
  ariaLabel?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const CustomCheckbox: React.FC<CustomCheckboxProps> = ({
  ariaLabel,
  checked,
  onChange,
  disabled = false,
}) => {
  return (
    <span className="relative inline-flex items-center justify-center shrink-0">
      <input
        type="checkbox"
        aria-label={ariaLabel}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
      />
      <span
        aria-hidden="true"
        className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500/40 ${
          checked
            ? 'bg-blue-600 border-blue-600 text-white shadow-2xs'
            : 'bg-white border-slate-300 hover:border-slate-400'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <Check
          className={`w-3 h-3 stroke-[2.75] transition-transform duration-150 ${
            checked ? 'scale-100' : 'scale-0'
          }`}
        />
      </span>
    </span>
  );
};

interface CustomColorSwatchProps {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  title?: string;
}

export const CustomColorSwatch: React.FC<CustomColorSwatchProps> = ({
  ariaLabel,
  value,
  onChange,
  size = 'sm',
  title = '选择颜色',
}) => {
  const dim = size === 'sm' ? 'w-5 h-5' : 'w-7 h-7';
  return (
    <span
      className={`relative inline-flex items-center justify-center ${dim} rounded-full ring-2 ring-white shadow-sm border border-black/15 cursor-pointer hover:scale-105 transition-transform shrink-0`}
      style={{ backgroundColor: value }}
      title={title}
    >
      <input
        type="color"
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer rounded-full"
      />
    </span>
  );
};
