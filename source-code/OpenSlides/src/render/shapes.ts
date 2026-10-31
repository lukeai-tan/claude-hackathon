import type { ShapeKind } from '../model/types';

/** SVG path for a shape filling a w x h box. Lines and arrows are handled separately. */
export function shapePath(kind: ShapeKind, w: number, h: number, radius: number): string {
  switch (kind) {
    case 'rect':
      return `M0 0 H${w} V${h} H0 Z`;
    case 'roundRect': {
      const r = Math.max(0, Math.min(radius, w / 2, h / 2));
      return `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z`;
    }
    case 'ellipse':
      return `M${w / 2} 0 A${w / 2} ${h / 2} 0 1 1 ${w / 2} ${h} A${w / 2} ${h / 2} 0 1 1 ${w / 2} 0 Z`;
    case 'triangle':
      return `M${w / 2} 0 L${w} ${h} L0 ${h} Z`;
    case 'diamond':
      return `M${w / 2} 0 L${w} ${h / 2} L${w / 2} ${h} L0 ${h / 2} Z`;
    case 'hexagon':
      return `M${w * 0.25} 0 H${w * 0.75} L${w} ${h / 2} L${w * 0.75} ${h} H${w * 0.25} L0 ${h / 2} Z`;
    case 'chevron':
      return `M0 0 H${w * 0.7} L${w} ${h / 2} L${w * 0.7} ${h} H0 L${w * 0.3} ${h / 2} Z`;
    case 'star': {
      const cx = w / 2;
      const cy = h / 2;
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 1 : 0.42;
        pts.push(`${cx + Math.cos(a) * (w / 2) * r} ${cy + Math.sin(a) * (h / 2) * r}`);
      }
      return `M${pts.join(' L')} Z`;
    }
    default:
      return `M0 0 H${w} V${h} H0 Z`;
  }
}

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  roundRect: 'Rounded rectangle',
  ellipse: 'Ellipse',
  triangle: 'Triangle',
  diamond: 'Diamond',
  hexagon: 'Hexagon',
  chevron: 'Chevron',
  star: 'Star',
  line: 'Line',
  arrow: 'Arrow',
};
