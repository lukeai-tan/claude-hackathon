/** Deliberately small SVG vocabulary: no scripts, CSS, images, links or animation. */
const TAGS = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'title', 'desc']);
const ATTRS = new Set(['xmlns', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'fill-rule', 'clip-rule', 'opacity', 'fill-opacity', 'stroke-opacity', 'transform', 'id', 'offset', 'stop-color', 'stop-opacity', 'gradientTransform', 'gradientUnits', 'fx', 'fy', 'fr']);
export function safeSvg(source: string): { svg: string; w: number; h: number } {
  if (typeof source !== 'string' || source.length > 150_000 || /<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('The graphic is too large or contains unsupported markup. Try a simpler prompt.');
  const doc = new DOMParser().parseFromString(source.trim(), 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('Claudia returned an invalid SVG. Try generating again.');
  const nodes = [root, ...Array.from(root.querySelectorAll('*'))];
  if (nodes.length > 600) throw new Error('The graphic has too many shapes. Try a simpler prompt.');
  for (const node of nodes) {
    if (!TAGS.has(node.localName) || (node.namespaceURI && node.namespaceURI !== 'http://www.w3.org/2000/svg')) throw new Error('The graphic contains unsupported SVG content.');
    for (const attr of Array.from(node.attributes)) {
      if (!ATTRS.has(attr.name)) throw new Error(`Unsupported SVG attribute: ${attr.name}`);
      if (attr.name === 'xmlns') {
        if (attr.value !== 'http://www.w3.org/2000/svg') throw new Error('Invalid SVG namespace.');
      } else if (/url\s*\(/i.test(attr.value)) {
        if (!/^url\(#[a-zA-Z][\w-]*\)$/.test(attr.value)) throw new Error('External SVG references are not allowed.');
      } else if (/https?:|javascript:|data:|@import|expression\s*\(/i.test(attr.value)) throw new Error('External content is not allowed in a graphic.');
    }
  }
  const box = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] < 1 || box[3] < 1 || box[2] > 4096 || box[3] > 4096) throw new Error('The graphic needs a valid viewBox up to 4096 × 4096.');
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', String(box[2]));
  root.setAttribute('height', String(box[3]));
  return { svg: new XMLSerializer().serializeToString(root), w: box[2], h: box[3] };
}
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
