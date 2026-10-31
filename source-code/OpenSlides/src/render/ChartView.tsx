import type { ReactNode } from 'react';
import type { ChartElement, Theme } from '../model/types';
import { chartPalette, fontStack, resolveColor, resolveFont } from '../model/theme';

export function niceScale(min: number, max: number, ticks = 5) {
  if (min === max) {
    max = min + 1;
  }
  const range = max - min;
  const rough = range / ticks;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const n = rough / pow;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const values: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) values.push(+v.toFixed(10));
  return { lo, hi, step, values };
}

export function formatNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${+(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${+(v / 1e3).toFixed(1)}k`;
  return `${+v.toFixed(2)}`;
}

export function chartColors(el: ChartElement, theme: Theme): string[] {
  const base = chartPalette(theme);
  return base.map((c, i) => (el.colors[i] ? resolveColor(el.colors[i], theme) : c));
}

export function ChartView({ el, theme }: { el: ChartElement; theme: Theme }) {
  const W = el.w;
  const H = el.h;
  const fs = el.fontSize;
  const font = fontStack(resolveFont(el.fontFamily, theme));
  const textColor = resolveColor(el.textColor, theme);
  const gridColor = resolveColor('theme:muted', theme);
  const colors = chartColors(el, theme);
  const { labels, series } = el.data;
  const isPie = el.chartType === 'pie' || el.chartType === 'doughnut';
  const titleH = el.title ? fs * 1.8 : 0;
  const legendItems = isPie ? labels : series.map((s) => s.name);
  const showLegend = el.showLegend && (isPie || series.length > 1);
  const legendH = showLegend ? fs * 2 : 0;

  const legend = showLegend ? (
    <g transform={`translate(0, ${H - legendH + fs * 0.5})`}>
      {(() => {
        let x = 0;
        const items = legendItems.map((name, i) => {
          const w = fs * 1.3 + name.length * fs * 0.58 + fs * 1.2;
          const node = (
            <g key={i} transform={`translate(${x}, 0)`}>
              <rect width={fs * 0.9} height={fs * 0.9} rx={fs * 0.2} fill={colors[i % colors.length]} />
              <text x={fs * 1.3} y={fs * 0.78} fontSize={fs * 0.9} fill={textColor}>
                {name}
              </text>
            </g>
          );
          x += w;
          return node;
        });
        const total = x - fs * 1.2;
        return <g transform={`translate(${Math.max(0, (W - total) / 2)}, 0)`}>{items}</g>;
      })()}
    </g>
  ) : null;

  const title = el.title ? (
    <text x={W / 2} y={fs * 1.2} textAnchor="middle" fontSize={fs * 1.05} fontWeight={700} fill={textColor}>
      {el.title}
    </text>
  ) : null;

  let body: ReactNode = null;

  if (isPie) {
    const values = (series[0]?.values ?? []).map((v) => Math.max(0, v || 0));
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2;
    const cy = titleH + (H - titleH - legendH) / 2;
    const r = Math.max(10, Math.min(W, H - titleH - legendH) / 2 - fs * 0.5);
    const inner = el.chartType === 'doughnut' ? r * 0.56 : 0;
    let a0 = -Math.PI / 2;
    body = (
      <g>
        {values.map((v, i) => {
          const frac = v / total;
          const a1 = a0 + frac * Math.PI * 2;
          const large = a1 - a0 > Math.PI ? 1 : 0;
          const p = (ang: number, rad: number) => `${cx + Math.cos(ang) * rad},${cy + Math.sin(ang) * rad}`;
          const d =
            frac >= 0.9999
              ? inner
                ? `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} M ${cx + inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx - inner} ${cy} A ${inner} ${inner} 0 1 0 ${cx + inner} ${cy} Z`
                : `M ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} Z`
              : inner
                ? `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, inner)} A ${inner} ${inner} 0 ${large} 0 ${p(a0, inner)} Z`
                : `M ${cx} ${cy} L ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} Z`;
          const mid = (a0 + a1) / 2;
          const lr = inner ? (r + inner) / 2 : r * 0.62;
          const label =
            el.showValues && frac > 0.04 ? (
              <text x={cx + Math.cos(mid) * lr} y={cy + Math.sin(mid) * lr + fs * 0.35} textAnchor="middle" fontSize={fs * 0.9} fontWeight={700} fill="#fff">
                {Math.round(frac * 100)}%
              </text>
            ) : null;
          a0 = a1;
          return (
            <g key={i}>
              <path d={d} fill={colors[i % colors.length]} stroke={resolveColor('theme:background', theme)} strokeWidth={Math.max(1, fs * 0.08)} fillRule="evenodd" />
              {label}
            </g>
          );
        })}
      </g>
    );
  } else {
    const all = series.flatMap((s) => s.values.map((v) => v || 0));
    const minV = Math.min(0, ...all);
    const maxV = Math.max(0, ...all, 1);
    const scale = niceScale(minV, maxV);
    const horizontal = el.chartType === 'bar';
    const valueLabelW = Math.max(...scale.values.map((v) => formatNumber(v).length)) * fs * 0.6 + fs * 0.8;
    const catLabelW = horizontal ? Math.min(W * 0.3, Math.max(...labels.map((l) => l.length), 1) * fs * 0.58 + fs * 0.8) : 0;
    const left = horizontal ? catLabelW : valueLabelW;
    const top = titleH + fs * 0.6;
    const bottom = H - legendH - fs * 1.8;
    const right = W - fs * 0.6;
    const plotW = Math.max(10, right - left);
    const plotH = Math.max(10, bottom - top);
    const n = Math.max(1, labels.length);
    const vpos = (v: number) => (horizontal ? left + ((v - scale.lo) / (scale.hi - scale.lo)) * plotW : bottom - ((v - scale.lo) / (scale.hi - scale.lo)) * plotH);
    const slot = (horizontal ? plotH : plotW) / n;

    const grid = (
      <g>
        {scale.values.map((v, i) => {
          const p = vpos(v);
          return (
            <g key={i}>
              {el.showGrid && (horizontal ? <line x1={p} x2={p} y1={top} y2={bottom} stroke={gridColor} strokeOpacity={0.25} strokeWidth={1.5} /> : <line x1={left} x2={right} y1={p} y2={p} stroke={gridColor} strokeOpacity={0.25} strokeWidth={1.5} />)}
              {horizontal ? (
                <text x={p} y={bottom + fs * 1.2} textAnchor="middle" fontSize={fs * 0.8} fill={textColor} fillOpacity={0.75}>
                  {formatNumber(v)}
                </text>
              ) : (
                <text x={left - fs * 0.4} y={p + fs * 0.3} textAnchor="end" fontSize={fs * 0.8} fill={textColor} fillOpacity={0.75}>
                  {formatNumber(v)}
                </text>
              )}
            </g>
          );
        })}
        {labels.map((l, i) =>
          horizontal ? (
            <text key={i} x={left - fs * 0.4} y={top + slot * (i + 0.5) + fs * 0.3} textAnchor="end" fontSize={fs * 0.85} fill={textColor}>
              {l}
            </text>
          ) : (
            <text key={i} x={left + slot * (i + 0.5)} y={bottom + fs * 1.2} textAnchor="middle" fontSize={fs * 0.85} fill={textColor}>
              {l}
            </text>
          ),
        )}
        {horizontal ? <line x1={vpos(0)} x2={vpos(0)} y1={top} y2={bottom} stroke={textColor} strokeOpacity={0.5} strokeWidth={2} /> : <line x1={left} x2={right} y1={vpos(0)} y2={vpos(0)} stroke={textColor} strokeOpacity={0.5} strokeWidth={2} />}
      </g>
    );

    if (el.chartType === 'column' || el.chartType === 'bar') {
      const k = series.length || 1;
      const groupW = slot * 0.72;
      const barW = groupW / k;
      body = (
        <g>
          {grid}
          {series.map((s, si) =>
            labels.map((_, li) => {
              const v = s.values[li] || 0;
              const a = vpos(0);
              const b = vpos(v);
              const off = slot * li + (slot - groupW) / 2 + barW * si;
              const rad = Math.min(barW * 0.18, fs * 0.3);
              return horizontal ? (
                <g key={`${si}-${li}`}>
                  <rect x={Math.min(a, b)} y={top + off} width={Math.abs(b - a)} height={barW * 0.9} rx={rad} fill={colors[si % colors.length]} />
                  {el.showValues && (
                    <text x={Math.max(a, b) + fs * 0.3} y={top + off + barW * 0.45 + fs * 0.3} fontSize={fs * 0.8} fill={textColor}>
                      {formatNumber(v)}
                    </text>
                  )}
                </g>
              ) : (
                <g key={`${si}-${li}`}>
                  <rect x={left + off} y={Math.min(a, b)} width={barW * 0.9} height={Math.abs(b - a)} rx={rad} fill={colors[si % colors.length]} />
                  {el.showValues && (
                    <text x={left + off + barW * 0.45} y={Math.min(a, b) - fs * 0.35} textAnchor="middle" fontSize={fs * 0.8} fill={textColor}>
                      {formatNumber(v)}
                    </text>
                  )}
                </g>
              );
            }),
          )}
        </g>
      );
    } else {
      body = (
        <g>
          {grid}
          {series.map((s, si) => {
            const pts = labels.map((_, li) => [left + slot * (li + 0.5), vpos(s.values[li] || 0)] as const);
            const color = colors[si % colors.length];
            const line = pts.map((p) => p.join(',')).join(' ');
            return (
              <g key={si}>
                {el.chartType === 'area' && pts.length > 0 && (
                  <polygon points={`${pts[0][0]},${vpos(0)} ${line} ${pts[pts.length - 1][0]},${vpos(0)}`} fill={color} fillOpacity={0.22} />
                )}
                <polyline points={line} fill="none" stroke={color} strokeWidth={Math.max(2, fs * 0.16)} strokeLinejoin="round" strokeLinecap="round" />
                {pts.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(3, fs * 0.2)} fill={color} />
                ))}
                {el.showValues &&
                  pts.map((p, i) => (
                    <text key={`v${i}`} x={p[0]} y={p[1] - fs * 0.55} textAnchor="middle" fontSize={fs * 0.75} fill={textColor}>
                      {formatNumber(s.values[i] || 0)}
                    </text>
                  ))}
              </g>
            );
          })}
        </g>
      );
    }
  }

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} style={{ fontFamily: font, overflow: 'visible' }} role="img" aria-label={el.title || el.alt || 'Chart'}>
      {title}
      {body}
      {legend}
    </svg>
  );
}
