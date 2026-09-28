import React from 'react';

export interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  description?: string;
  title?: string;
  id?: string;
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  size = 'md',
  label,
  description,
  title,
  id,
  className = '',
}) => {
  const isSm = size === 'sm';
  const trackWidth = isSm ? 'w-9' : 'w-11';
  const trackHeight = isSm ? 'h-5' : 'h-6';
  const knobSize = isSm ? 'w-3.5 h-3.5' : 'w-4.5 h-4.5';
  const knobOffset = isSm ? (checked ? 18 : 2) : (checked ? 22 : 3);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      onChange(!checked);
    }
  };

  return (
    <div
      className={`inline-flex items-center gap-2.5 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
      onClick={disabled ? undefined : handleClick}
      title={title}
    >
      {(label || description) && (
        <div className="flex flex-col select-none">
          {label && <span className="text-xs font-semibold text-ink whitespace-nowrap">{label}</span>}
          {description && <span className="text-[11px] text-ink-muted leading-tight whitespace-nowrap">{description}</span>}
        </div>
      )}

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        id={id}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={`relative inline-flex ${trackWidth} ${trackHeight} shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
          checked ? 'bg-[#006d41] hover:bg-[#005a36]' : 'bg-slate-300 hover:bg-slate-400'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          dir="ltr"
          style={{ left: `${knobOffset}px` }}
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${knobSize} rounded-full bg-white shadow-sm ring-0 transition-all duration-200 ease-in-out`}
        />
      </button>
    </div>
  );
};

export default ToggleSwitch;
