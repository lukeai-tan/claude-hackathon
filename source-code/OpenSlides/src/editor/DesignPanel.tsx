import { useRef } from 'react';
import { ImageUp, Scaling, Trash2 } from 'lucide-react';
import { checkpoint, useEditor } from '../store/editor';
import { applyThemePreset, setLogo, setThemeColor, setThemeFont } from '../store/actions';
import { COLOR_LABELS, FONTS, THEME_PRESETS, fontStack } from '../model/theme';
import { THEME_COLOR_KEYS } from '../model/types';
import { SIZE_PRESETS } from '../model/factory';
import { Section } from './ui';

export function DesignPanel({ hideThemes = false }: { hideThemes?: boolean }) {
  const deck = useEditor((s) => s.deck)!;
  const theme = deck.theme;
  const logoRef = useRef<HTMLInputElement>(null);
  const sizeLabel = SIZE_PRESETS.find((p) => p.id === deck.size.preset)?.label ?? `${deck.size.w} × ${deck.size.h}`;
  const logo = theme.logoAssetId ? deck.assets[theme.logoAssetId] : undefined;

  return (
    <div>
      {!hideThemes && <Section title="Themes">
        <p className="muted small">A theme sets the brand colours and fonts. Everything that uses them updates at once.</p>
        <div className="theme-grid">
          {THEME_PRESETS.map((t) => (
            <button key={t.id} className={`theme-card${theme.id === t.id ? ' on' : ''}`} onClick={() => applyThemePreset(t)} style={{ background: t.colors.background, color: t.colors.text }}>
              <span className="tc-title" style={{ fontFamily: fontStack(t.fonts.heading) }}>
                Aa
              </span>
              <span className="tc-dots">
                {[t.colors.primary, t.colors.secondary, t.colors.accent].map((c, i) => (
                  <i key={i} style={{ background: c }} />
                ))}
              </span>
              <span className="tc-name" style={{ fontFamily: fontStack(t.fonts.body) }}>
                {t.name}
              </span>
            </button>
          ))}
        </div>
      </Section>}

      <Section title="Brand colours">
        <div className="brand-colors">
          {THEME_COLOR_KEYS.map((k) => (
            <label key={k} className="brand-color">
              <input
                type="color"
                value={theme.colors[k]}
                onFocus={checkpoint}
                onChange={(e) => setThemeColor(k, e.target.value, false)}
                aria-label={COLOR_LABELS[k]}
              />
              <span>{COLOR_LABELS[k]}</span>
              <code>{theme.colors[k].toUpperCase()}</code>
            </label>
          ))}
        </div>
      </Section>

      <Section title="Brand fonts">
        {(['heading', 'body'] as const).map((role) => (
          <label key={role} className="field">
            <span className="field-label">{role === 'heading' ? 'Headings' : 'Body'}</span>
            <select className="select" value={theme.fonts[role]} onChange={(e) => setThemeFont(role, e.target.value)} style={{ fontFamily: fontStack(theme.fonts[role]) }}>
              {FONTS.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </Section>

      <Section title="Logo">
        <p className="muted small">Shown on title and content layouts. Replace it once and every slide updates.</p>
        {logo ? (
          <div className="logo-row">
            <img src={logo.dataUrl} alt="Brand logo" />
            <button className="btn small ghost" onClick={() => logoRef.current?.click()}>
              Replace
            </button>
            <button className="icon-btn danger" aria-label="Remove logo" title="Remove logo" onClick={() => setLogo(null)}>
              <Trash2 size={15} />
            </button>
          </div>
        ) : (
          <button className="btn full" onClick={() => logoRef.current?.click()}>
            <ImageUp size={15} /> Add a logo
          </button>
        )}
        <input
          ref={logoRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setLogo(f);
            e.target.value = '';
          }}
        />
      </Section>

      <Section title="Slide size">
        <p className="small">
          {sizeLabel} <span className="muted">({deck.size.w} × {deck.size.h})</span>
        </p>
        <button className="btn full" onClick={() => useEditor.setState({ dialog: 'resize' })}>
          <Scaling size={15} /> Resize for another format
        </button>
      </Section>
    </div>
  );
}
