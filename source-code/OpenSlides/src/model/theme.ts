import type { Background, ColorRef, FontRef, Theme, ThemeColorKey } from './types';
import type { CSSProperties } from 'react';

/** Fonts bundled with the app (served locally, so they work offline and in exports). */
export const FONTS: { name: string; category: 'sans' | 'serif' | 'display' | 'mono' }[] = [
  { name: 'Instrument Sans', category: 'sans' },
  { name: 'Inter', category: 'sans' },
  { name: 'Montserrat', category: 'sans' },
  { name: 'Poppins', category: 'sans' },
  { name: 'Space Grotesk', category: 'sans' },
  { name: 'Bricolage Grotesque', category: 'display' },
  { name: 'DM Serif Display', category: 'display' },
  { name: 'Playfair Display', category: 'serif' },
  { name: 'Fraunces', category: 'serif' },
  { name: 'Lora', category: 'serif' },
  { name: 'Source Serif 4', category: 'serif' },
  { name: 'JetBrains Mono', category: 'mono' },
  { name: 'DejaVu Sans', category: 'sans' },
  { name: 'DejaVu Serif', category: 'serif' },
  { name: 'DejaVu Sans Mono', category: 'mono' },
  { name: 'Latin Modern Roman Caps', category: 'display' },
  { name: 'Latin Modern Roman Dunhill', category: 'display' },
  { name: 'Latin Modern Mono Caps', category: 'mono' },
  { name: 'Latin Modern Sans Demi Cond', category: 'sans' },
];

export const THEME_PRESETS: Theme[] = [
  {
    id: 'mat',
    name: 'Cutting mat',
    colors: {
      background: '#f7f7f2',
      surface: '#e6ebe2',
      text: '#1d2621',
      muted: '#5e6b63',
      primary: '#2f4a3f',
      secondary: '#7fa38d',
      accent: '#e8c547',
    },
    fonts: { heading: 'Bricolage Grotesque', body: 'Instrument Sans' },
  },
  {
    id: 'ink',
    name: 'Night ink',
    colors: {
      background: '#14171f',
      surface: '#222836',
      text: '#f2f2ee',
      muted: '#9aa3b5',
      primary: '#7aa2ff',
      secondary: '#4ed1b0',
      accent: '#ff8a65',
    },
    fonts: { heading: 'Space Grotesk', body: 'Inter' },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    colors: {
      background: '#ffffff',
      surface: '#f1ede4',
      text: '#1a1a1a',
      muted: '#6b6b6b',
      primary: '#b3261e',
      secondary: '#1f4e79',
      accent: '#d9a441',
    },
    fonts: { heading: 'DM Serif Display', body: 'Source Serif 4' },
  },
  {
    id: 'campus',
    name: 'Campus',
    colors: {
      background: '#f4f8ff',
      surface: '#dde8fa',
      text: '#0e1b33',
      muted: '#51607a',
      primary: '#003d7c',
      secondary: '#ef7c00',
      accent: '#00a39b',
    },
    fonts: { heading: 'Montserrat', body: 'Inter' },
  },
  {
    id: 'studio',
    name: 'Studio',
    colors: {
      background: '#fff6ee',
      surface: '#ffe3d1',
      text: '#2b1b17',
      muted: '#7a5c52',
      primary: '#d9431f',
      secondary: '#2b1b17',
      accent: '#ffc93c',
    },
    fonts: { heading: 'Poppins', body: 'Poppins' },
  },
  {
    id: 'graphite',
    name: 'Graphite',
    colors: {
      background: '#ededed',
      surface: '#ffffff',
      text: '#111111',
      muted: '#6b6b6b',
      primary: '#111111',
      secondary: '#5c5c5c',
      accent: '#3a86ff',
    },
    fonts: { heading: 'Inter', body: 'Inter' },
  },
  {
    id: 'botanic',
    name: 'Botanic',
    colors: {
      background: '#f1f5ee',
      surface: '#dce7d3',
      text: '#1e2b1f',
      muted: '#5b6e5c',
      primary: '#3e6b48',
      secondary: '#a3b18a',
      accent: '#c9733a',
    },
    fonts: { heading: 'Fraunces', body: 'Lora' },
  },
  {
    id: 'terminal',
    name: 'Terminal',
    colors: {
      background: '#0d1117',
      surface: '#161b22',
      text: '#e6edf3',
      muted: '#8b949e',
      primary: '#3fb950',
      secondary: '#58a6ff',
      accent: '#d29922',
    },
    fonts: { heading: 'JetBrains Mono', body: 'Inter' },
  },
  {"id": "aurora", "name": "Aurora", "colors": {"background": "#f5f1ff", "surface": "#e8defc", "text": "#251a44", "muted": "#6d6186", "primary": "#7654cc", "secondary": "#31aaa6", "accent": "#efb85a"}, "fonts": {"heading": "Space Grotesk", "body": "Inter"}},
  {"id": "cobalt", "name": "Cobalt", "colors": {"background": "#09182e", "surface": "#152a48", "text": "#f7faff", "muted": "#a1b3ce", "primary": "#5a93ff", "secondary": "#56d2d8", "accent": "#ffbc7a"}, "fonts": {"heading": "Montserrat", "body": "Inter"}},
  {"id": "sorbet", "name": "Sorbet", "colors": {"background": "#fff5f1", "surface": "#fce2d8", "text": "#512f38", "muted": "#8b626b", "primary": "#d94e70", "secondary": "#f4a36f", "accent": "#8456b1"}, "fonts": {"heading": "Poppins", "body": "Instrument Sans"}},
  {"id": "paper", "name": "Paper & ink", "colors": {"background": "#fbf8ef", "surface": "#ece5d6", "text": "#262520", "muted": "#726c5b", "primary": "#313d35", "secondary": "#9eaa81", "accent": "#bc784e"}, "fonts": {"heading": "DM Serif Display", "body": "Lora"}},
  {"id": "neon", "name": "Neon lab", "colors": {"background": "#15121e", "surface": "#282238", "text": "#f9f4ff", "muted": "#b7a9cf", "primary": "#c6f56b", "secondary": "#b594ff", "accent": "#ff8bc4"}, "fonts": {"heading": "Space Grotesk", "body": "Inter"}},
  {"id": "ocean", "name": "Ocean", "colors": {"background": "#edf9fc", "surface": "#d6eef4", "text": "#173b4a", "muted": "#557b89", "primary": "#137d9d", "secondary": "#2db8ab", "accent": "#f2bb61"}, "fonts": {"heading": "Instrument Sans", "body": "Inter"}},
  {"id": "terracotta", "name": "Terracotta", "colors": {"background": "#faf0e5", "surface": "#edd6bf", "text": "#51362d", "muted": "#856656", "primary": "#b55437", "secondary": "#758c65", "accent": "#d7a74c"}, "fonts": {"heading": "Fraunces", "body": "Lora"}},
  {"id": "candy", "name": "Candy shop", "colors": {"background": "#fff2fc", "surface": "#f6dcef", "text": "#422b50", "muted": "#816c8b", "primary": "#9c55bd", "secondary": "#40a8b7", "accent": "#ffb35e"}, "fonts": {"heading": "Bricolage Grotesque", "body": "Poppins"}},
  {"id": "slate", "name": "Slate", "colors": {"background": "#f1f4f6", "surface": "#dee5eb", "text": "#273541", "muted": "#6a7a88", "primary": "#3c6481", "secondary": "#6f9d9b", "accent": "#b78d58"}, "fonts": {"heading": "Inter", "body": "Source Serif 4"}},
  {"id": "lemon", "name": "Lemon press", "colors": {"background": "#fcfce8", "surface": "#eeefbd", "text": "#30351d", "muted": "#747948", "primary": "#536b30", "secondary": "#d0cb41", "accent": "#d78651"}, "fonts": {"heading": "Bricolage Grotesque", "body": "Instrument Sans"}},
  {"id": "rose", "name": "Rose journal", "colors": {"background": "#fcf3f3", "surface": "#f0dfe1", "text": "#4c3338", "muted": "#876b71", "primary": "#b2677a", "secondary": "#9a8bac", "accent": "#c49a69"}, "fonts": {"heading": "Playfair Display", "body": "Source Serif 4"}},
  {"id": "mono", "name": "Mono type", "colors": {"background": "#ffffff", "surface": "#efefef", "text": "#111111", "muted": "#666666", "primary": "#252525", "secondary": "#888888", "accent": "#ded5c5"}, "fonts": {"heading": "JetBrains Mono", "body": "Inter"}},
];

export const COLOR_LABELS: Record<ThemeColorKey, string> = {
  background: 'Background',
  surface: 'Surface',
  text: 'Text',
  muted: 'Muted text',
  primary: 'Primary',
  secondary: 'Secondary',
  accent: 'Accent',
};

export function isThemeRef(ref: string | undefined): boolean {
  return !!ref && ref.startsWith('theme:');
}

export function resolveColor(ref: ColorRef | undefined, theme: Theme): string {
  if (!ref) return 'transparent';
  if (ref.startsWith('theme:')) {
    const key = ref.slice(6) as ThemeColorKey;
    return theme.colors[key] ?? '#000000';
  }
  return ref;
}

export function resolveFont(ref: FontRef | undefined, theme: Theme): string {
  if (!ref) return theme.fonts.body;
  if (ref === 'theme:heading') return theme.fonts.heading;
  if (ref === 'theme:body') return theme.fonts.body;
  return ref;
}

export function fontStack(name: string): string {
  const f = FONTS.find((x) => x.name === name);
  const fallback = f?.category === 'serif' || f?.category === 'display' ? 'Georgia, serif' : f?.category === 'mono' ? 'monospace' : 'system-ui, sans-serif';
  return `"${name}", ${fallback}`;
}

export function chartPalette(theme: Theme): string[] {
  const c = theme.colors;
  return [c.primary, c.accent, c.secondary, c.muted, mix(c.primary, '#ffffff', 0.45), mix(c.accent, '#000000', 0.25)];
}

export function backgroundCss(bg: Background, theme: Theme, assetUrl: (id: string) => string | undefined): CSSProperties {
  if (bg.kind === 'solid') return { background: resolveColor(bg.color, theme) };
  if (bg.kind === 'gradient') {
    return {
      background: `linear-gradient(${bg.angle}deg, ${resolveColor(bg.from, theme)}, ${resolveColor(bg.to, theme)})`,
    };
  }
  const url = assetUrl(bg.assetId);
  const dim = Math.max(0, Math.min(0.9, bg.dim));
  return {
    backgroundColor: '#000',
    backgroundImage: url
      ? `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${url}")`
      : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

/** Representative flat color for a background (used for contrast checks). */
export function backgroundColor(bg: Background, theme: Theme): string | null {
  if (bg.kind === 'solid') return resolveColor(bg.color, theme);
  if (bg.kind === 'gradient') return mix(resolveColor(bg.from, theme), resolveColor(bg.to, theme), 0.5);
  return null;
}

// ---------- color math ----------

export function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  if (!x || !y) return a;
  return rgbToHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
}

export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Normalises CSS colors like rgb(1, 2, 3) to hex where possible. */
export function toHex(color: string): string | null {
  if (color.startsWith('#')) return hexToRgb(color) ? color : null;
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (m) return rgbToHex(+m[1], +m[2], +m[3]);
  return null;
}
