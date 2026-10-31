import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { useEditor } from '../store/editor';
import { COLOR_LABELS, isThemeRef, resolveColor, toHex } from '../model/theme';
import { THEME_COLOR_KEYS } from '../model/types';

export function Popover({
  trigger,
  children,
  align = 'left',
  className = '',
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className={`popover-anchor ${className}`} ref={ref}>
      {trigger(open, () => setOpen((o) => !o))}
      {open && <div className={`popover ${align}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = 1,
  min,
  max,
  suffix,
  width,
}: {
  label?: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  width?: number;
}) {
  const [text, setText] = useState(String(round(value)));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(String(round(value)));
  }, [value]);
  const commit = (raw: string) => {
    let v = parseFloat(raw);
    if (Number.isNaN(v)) {
      setText(String(round(value)));
      return;
    }
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    setText(String(round(v)));
    if (v !== value) onChange(v);
  };
  return (
    <label className="num-field" style={{ width }}>
      {label && <span className="num-label">{label}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={text}
        onFocus={(e) => {
          focused.current = true;
          e.currentTarget.select();
        }}
        onBlur={(e) => {
          focused.current = false;
          commit(e.currentTarget.value);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(e.currentTarget.value);
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
            commit(String((parseFloat(e.currentTarget.value) || 0) + d));
          }
          e.stopPropagation();
        }}
      />
      {suffix && <span className="num-suffix">{suffix}</span>}
    </label>
  );
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="field-body">{children}</div>
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="insp-section">
      <div className="insp-head">
        <h3>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span>{label}</span>
    </label>
  );
}

export function Select<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <select className="select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Slider({ value, min, max, step, onChange, onStart }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; onStart?: () => void }) {
  return (
    <input
      className="slider"
      type="range"
      value={value}
      min={min}
      max={max}
      step={step}
      onPointerDown={onStart}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => onChange(parseFloat(e.target.value))}
    />
  );
}

/** Color picker offering brand colors (theme references) first, then any custom color. */
export function ColorPicker({
  value,
  onChange,
  allowTransparent = true,
  label = 'Colour',
  keepEditing = false,
}: {
  value: string;
  onChange: (v: string) => void;
  allowTransparent?: boolean;
  label?: string;
  keepEditing?: boolean;
}) {
  const theme = useEditor((s) => s.deck?.theme);
  if (!theme) return null;
  const shown = resolveColor(value, theme);
  const hex = toHex(shown) ?? '#000000';
  return (
    <Popover
      trigger={(_, toggle) => (
        <button
          className="swatch-btn"
          title={label}
          aria-label={label}
          onMouseDown={(e) => keepEditing && e.preventDefault()}
          onClick={toggle}
        >
          <span className={`swatch${value === 'transparent' ? ' none' : ''}`} style={{ background: value === 'transparent' ? undefined : shown }} />
          <span className="swatch-name">{value === 'transparent' ? 'None' : isThemeRef(value) ? COLOR_LABELS[value.slice(6) as keyof typeof COLOR_LABELS] : hex.toUpperCase()}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="color-pop" data-keep-editing={keepEditing ? '' : undefined}>
          <div className="pop-label">Brand colours</div>
          <div className="swatch-grid">
            {THEME_COLOR_KEYS.map((k) => {
              const ref = `theme:${k}`;
              return (
                <button
                  key={k}
                  className={`swatch big${value === ref ? ' on' : ''}`}
                  style={{ background: theme.colors[k] }}
                  title={`${COLOR_LABELS[k]} (follows the brand kit)`}
                  aria-label={COLOR_LABELS[k]}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(ref);
                    close();
                  }}
                >
                  {value === ref && <Check size={12} />}
                </button>
              );
            })}
            {allowTransparent && (
              <button
                className={`swatch big none${value === 'transparent' ? ' on' : ''}`}
                title="No colour"
                aria-label="No colour"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange('transparent');
                  close();
                }}
              />
            )}
          </div>
          <div className="pop-label">Custom</div>
          <div className="custom-color">
            <input type="color" value={hex} onChange={(e) => onChange(e.target.value)} aria-label="Pick a custom colour" />
            <HexInput value={hex} onChange={onChange} />
          </div>
        </div>
      )}
    </Popover>
  );
}

function HexInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [t, setT] = useState(value);
  useEffect(() => setT(value), [value]);
  return (
    <input
      className="hex-input"
      value={t}
      aria-label="Hex colour"
      onChange={(e) => setT(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          const h = toHex(t.startsWith('#') ? t : `#${t}`);
          if (h) onChange(h);
        }
      }}
      onBlur={() => {
        const h = toHex(t.startsWith('#') ? t : `#${t}`);
        if (h && h !== value) onChange(h);
      }}
    />
  );
}

export function IconButton({ title, onClick, children, active, disabled, danger, keepEditing }: { title: string; onClick: () => void; children: ReactNode; active?: boolean; disabled?: boolean; danger?: boolean; keepEditing?: boolean }) {
  return (
    <button
      className={`icon-btn${active ? ' on' : ''}${danger ? ' danger' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => keepEditing && e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
