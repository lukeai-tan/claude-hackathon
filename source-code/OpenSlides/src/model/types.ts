// Core document model for an OpenSlides deck.
//
// Colors and fonts can be literal values ('#1d2621', 'Inter') or theme
// references ('theme:primary', 'theme:heading'). Theme references are what
// make the brand kit propagate: change the theme and every slide follows.

export type ColorRef = string;
export type FontRef = string;

export interface ThemeColors {
  background: string;
  surface: string;
  text: string;
  muted: string;
  primary: string;
  secondary: string;
  accent: string;
}
export type ThemeColorKey = keyof ThemeColors;
export const THEME_COLOR_KEYS: ThemeColorKey[] = [
  'background',
  'surface',
  'text',
  'muted',
  'primary',
  'secondary',
  'accent',
];

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
  fonts: { heading: string; body: string };
  logoAssetId?: string;
}

export type Background =
  | { kind: 'solid'; color: ColorRef }
  | { kind: 'gradient'; from: ColorRef; to: ColorRef; angle: number }
  | { kind: 'image'; assetId: string; dim: number };

export type AnimEffect = 'none' | 'fade' | 'fly-up' | 'fly-left' | 'zoom' | 'wipe';
export type AnimTrigger = 'click' | 'with-previous' | 'after-previous';

export interface Animation {
  effect: AnimEffect;
  trigger: AnimTrigger;
  duration: number; // ms
  delay: number; // ms
  order: number;
}

/** Links a slide element to a placeholder on its layout (slide master). */
export interface PlaceholderLink {
  ref: string; // layout element id
  geom: boolean; // true = position and size follow the layout
  style: boolean; // true = text style follows the layout
}

export type PlaceholderKind = 'title' | 'subtitle' | 'body' | 'body2' | 'image' | 'number' | 'caption';

export interface TextStyle {
  fontFamily: FontRef;
  fontSize: number; // px in slide space
  color: ColorRef;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  valign: 'top' | 'middle' | 'bottom';
  lineHeight: number;
  letterSpacing: number; // em
}

interface BaseElement {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  locked?: boolean;
  groupId?: string;
  name?: string;
  alt?: string;
  anim?: Animation;
  ph?: PlaceholderLink;
  /** Only on layout elements: marks this element as a placeholder. */
  placeholder?: PlaceholderKind;
  /** Only on layout placeholders: hint shown in the editor. */
  prompt?: string;
}

export interface TextElement extends BaseElement {
  type: 'text';
  html: string;
  style: TextStyle;
  fill: ColorRef;
  padding: number;
  autoHeight: boolean;
}

export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'line'
  | 'arrow'
  | 'star'
  | 'chevron'
  | 'hexagon';

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: ShapeKind;
  fill: ColorRef;
  stroke: ColorRef;
  strokeWidth: number;
  radius: number;
}

export interface ImageFilters {
  brightness: number; // 1 = unchanged
  contrast: number;
  saturate: number;
  grayscale: number; // 0..1
}

export interface ImageElement extends BaseElement {
  type: 'image';
  assetId: string; // '' = empty placeholder, 'theme:logo' = brand logo
  fit: 'cover' | 'contain';
  radius: number;
  filters: ImageFilters;
}

export type ChartType = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut';

export interface ChartSeries {
  name: string;
  values: number[];
}

export interface ChartData {
  labels: string[];
  series: ChartSeries[];
}

export interface ChartElement extends BaseElement {
  type: 'chart';
  chartType: ChartType;
  data: ChartData;
  title: string;
  showLegend: boolean;
  showValues: boolean;
  showGrid: boolean;
  colors: ColorRef[];
  fontFamily: FontRef;
  fontSize: number;
  textColor: ColorRef;
}

export interface TableStyle {
  fontFamily: FontRef;
  fontSize: number;
  color: ColorRef;
  headerFill: ColorRef;
  headerColor: ColorRef;
  borderColor: ColorRef;
  stripe: boolean;
  stripeFill: ColorRef;
  fill: ColorRef;
}

export interface TableElement extends BaseElement {
  type: 'table';
  rows: string[][];
  headerRow: boolean;
  style: TableStyle;
}

export type SlideElement = TextElement | ShapeElement | ImageElement | ChartElement | TableElement;
export type ElementType = SlideElement['type'];

export type Transition = 'none' | 'fade' | 'slide' | 'zoom';

export interface Slide {
  id: string;
  layoutId: string;
  elements: SlideElement[];
  background?: Background; // overrides the layout background
  notes: string;
  transition: Transition;
  hidden?: boolean;
}

export interface Layout {
  id: string;
  name: string;
  background: Background;
  elements: SlideElement[];
}

export interface Asset {
  id: string;
  dataUrl: string;
  w: number;
  h: number;
  name: string;
}

export interface DeckSize {
  w: number;
  h: number;
  preset: string;
}

export interface Deck {
  id: string;
  title: string;
  version: 1;
  size: DeckSize;
  theme: Theme;
  layouts: Layout[];
  slides: Slide[];
  assets: Record<string, Asset>;
  createdAt: number;
  updatedAt: number;
}

export type EditTarget = { kind: 'slide' } | { kind: 'layout'; layoutId: string };
