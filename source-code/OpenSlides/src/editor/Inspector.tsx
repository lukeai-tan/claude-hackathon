import { useRef } from 'react';
import { BarChart3, ImageUp, Link2, Minus, Plus, RotateCcw } from 'lucide-react';
import { checkpoint, currentSlide, mutate, useEditor, type Panel } from '../store/editor';
import { changeLayout, editElements, editSelected, fileToAsset, addAsset, replaceImage, resetToLayout } from '../store/actions';
import type { AnimEffect, AnimTrigger, Animation, Background, ShapeKind, SlideElement, Transition } from '../model/types';
import { ColorPicker, Field, NumberField, Section, Select, Slider, Toggle } from './ui';
import { useResolvedSelection } from './ContextBar';
import { LayoutPicker } from './SlidePanel';
import { DesignPanel } from './DesignPanel';
import { CheckPanel } from './CheckPanel';
import { OutlinePanel } from './OutlinePanel';
import { SHAPE_LABELS } from '../render/shapes';
import { useIssues } from '../doctor/checks';
import { useMemo } from 'react';

const TABS: { id: Panel; label: string }[] = [
  { id: 'selection', label: 'Edit' },
  { id: 'slide', label: 'Slide' },
  { id: 'design', label: 'Design' },
  { id: 'check', label: 'Check' },
  { id: 'outline', label: 'Outline' },
];

export function Inspector() {
  const panel = useEditor((s) => s.panel);
  const count = useIssues().length;
  return (
    <aside className="inspector">
      <nav className="insp-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={panel === t.id} className={panel === t.id ? 'on' : ''} onClick={() => useEditor.setState({ panel: t.id })}>
            {t.label}
            {t.id === 'check' && count > 0 && <span className="count">{count}</span>}
          </button>
        ))}
      </nav>
      <div className="insp-body">
        {panel === 'selection' && <SelectionPanel />}
        {panel === 'slide' && <SlideSettings />}
        {panel === 'design' && <DesignPanel />}
        {panel === 'check' && <CheckPanel />}
        {panel === 'outline' && <OutlinePanel />}
      </div>
    </aside>
  );
}

const geom = { touches: ['geom' as const] };

function SelectionPanel() {
  const els = useResolvedSelection();
  const target = useEditor((s) => s.target);
  if (!els.length) {
    return (
      <div className="insp-empty">
        <p>Select something on the slide to edit it here.</p>
        <p className="muted small">Shift-click or drag a box to select several items. Press ? for keyboard shortcuts.</p>
      </div>
    );
  }
  const el = els[0];
  const ids = els.map((e) => e.id);
  const single = els.length === 1;
  const linked = single && el.ph && (el.ph.geom || el.ph.style);
  const detached = single && el.ph && (!el.ph.geom || !el.ph.style);
  return (
    <div>
      {single && el.ph && target.kind === 'slide' && (
        <div className={`ph-note${linked ? '' : ' off'}`}>
          <Link2 size={14} />
          <span>{el.ph.geom && el.ph.style ? 'Follows the layout. Edit the layout to change every slide.' : el.ph.geom ? 'Position follows the layout; style is set on this slide.' : el.ph.style ? 'Style follows the layout; position is set on this slide.' : 'Placeholder overridden on this slide.'}</span>
          {detached && (
            <button className="btn small ghost" onClick={() => resetToLayout(ids)} title="Use the layout’s position and style again">
              <RotateCcw size={13} /> Reset
            </button>
          )}
        </div>
      )}
      <Section title={single ? typeLabel(el) : `${els.length} items`}>
        {single && (
          <div className="grid2">
            <NumberField label="X" value={el.x} onChange={(v) => editElements(ids, (e) => void (e.x = v), geom)} />
            <NumberField label="Y" value={el.y} onChange={(v) => editElements(ids, (e) => void (e.y = v), geom)} />
            <NumberField label="W" value={el.w} min={2} onChange={(v) => editElements(ids, (e) => void (e.w = v), geom)} />
            <NumberField label="H" value={el.h} min={2} onChange={(v) => editElements(ids, (e) => { e.h = v; if (e.type === 'text') e.autoHeight = false; }, geom)} />
            <NumberField label="Rotate" value={el.rotation} suffix="°" onChange={(v) => editElements(ids, (e) => void (e.rotation = v), geom)} />
          </div>
        )}
        <Field label="Opacity">
          <Slider value={el.opacity} min={0} max={1} step={0.01} onStart={checkpoint} onChange={(v) => editSelected((e) => void (e.opacity = v), { history: false })} />
          <span className="val">{Math.round(el.opacity * 100)}%</span>
        </Field>
      </Section>
      {single && el.type === 'text' && <TextSettings el={el} />}
      {single && el.type === 'shape' && <ShapeSettings el={el} />}
      {single && el.type === 'image' && <ImageSettings el={el} />}
      {single && el.type === 'chart' && <ChartSettings el={el} />}
      {single && el.type === 'table' && <TableSettings el={el} />}
      {target.kind === 'slide' && <AnimationSettings els={els} />}
    </div>
  );
}

function typeLabel(el: SlideElement) {
  return { text: 'Text box', shape: 'Shape', image: 'Image', chart: 'Chart', table: 'Table' }[el.type];
}

function TextSettings({ el }: { el: Extract<SlideElement, { type: 'text' }> }) {
  const style = { touches: ['style' as const] };
  return (
    <Section title="Text box">
      <Field label="Fill">
        <ColorPicker value={el.fill} onChange={(c) => editSelected((e) => { if (e.type === 'text') e.fill = c; }, style)} />
      </Field>
      <Field label="Vertical">
        <Select
          value={el.style.valign}
          options={[
            { value: 'top', label: 'Top' },
            { value: 'middle', label: 'Middle' },
            { value: 'bottom', label: 'Bottom' },
          ]}
          onChange={(v) => editSelected((e) => { if (e.type === 'text') e.style.valign = v; }, style)}
        />
      </Field>
      <div className="grid2">
        <NumberField label="Line" value={el.style.lineHeight} step={0.05} min={0.7} max={3} onChange={(v) => editSelected((e) => { if (e.type === 'text') e.style.lineHeight = v; }, style)} />
        <NumberField label="Spacing" value={el.style.letterSpacing} step={0.01} min={-0.2} max={1} suffix="em" onChange={(v) => editSelected((e) => { if (e.type === 'text') e.style.letterSpacing = v; }, style)} />
        <NumberField label="Padding" value={el.padding} min={0} max={200} onChange={(v) => editSelected((e) => { if (e.type === 'text') e.padding = v; }, style)} />
      </div>
      <Toggle label="Grow height to fit text" checked={el.autoHeight} onChange={(v) => editSelected((e) => { if (e.type === 'text') e.autoHeight = v; }, style)} />
    </Section>
  );
}

const SHAPES: ShapeKind[] = ['rect', 'roundRect', 'ellipse', 'triangle', 'diamond', 'hexagon', 'chevron', 'star', 'line', 'arrow'];

function ShapeSettings({ el }: { el: Extract<SlideElement, { type: 'shape' }> }) {
  const isLine = el.shape === 'line' || el.shape === 'arrow';
  return (
    <Section title="Shape">
      <Field label="Shape">
        <Select value={el.shape} options={SHAPES.map((s) => ({ value: s, label: SHAPE_LABELS[s] }))} onChange={(v) => editSelected((e) => { if (e.type === 'shape') e.shape = v; })} />
      </Field>
      {!isLine && (
        <Field label="Fill">
          <ColorPicker value={el.fill} onChange={(c) => editSelected((e) => { if (e.type === 'shape') e.fill = c; })} />
        </Field>
      )}
      <Field label={isLine ? 'Colour' : 'Outline'}>
        <ColorPicker value={el.stroke} onChange={(c) => editSelected((e) => { if (e.type === 'shape') { e.stroke = c; if (e.strokeWidth === 0 && c !== 'transparent') e.strokeWidth = 4; } })} />
      </Field>
      <div className="grid2">
        <NumberField label="Weight" value={el.strokeWidth} min={0} max={80} onChange={(v) => editSelected((e) => { if (e.type === 'shape') e.strokeWidth = v; })} />
        {el.shape === 'roundRect' && <NumberField label="Corner" value={el.radius} min={0} onChange={(v) => editSelected((e) => { if (e.type === 'shape') e.radius = v; })} />}
      </div>
    </Section>
  );
}

function ImageSettings({ el }: { el: Extract<SlideElement, { type: 'image' }> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isLogo = el.assetId === 'theme:logo';
  const f = el.filters;
  const setFilter = (k: keyof typeof f, v: number) => editSelected((e) => { if (e.type === 'image') e.filters[k] = v; }, { history: false });
  return (
    <Section title="Image">
      {isLogo ? (
        <p className="muted small">This shows the brand logo. Set it in Design.</p>
      ) : (
        <button className="btn full" onClick={() => fileRef.current?.click()}>
          <ImageUp size={15} /> {el.assetId ? 'Replace image' : 'Choose an image'}
        </button>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) replaceImage(el.id, file); e.target.value = ''; }} />
      <Field label="Fit">
        <Select value={el.fit} options={[{ value: 'cover', label: 'Fill the frame (crop)' }, { value: 'contain', label: 'Fit inside the frame' }]} onChange={(v) => editSelected((e) => { if (e.type === 'image') e.fit = v; }, { touches: ['style'] })} />
      </Field>
      <NumberField label="Corner radius" value={el.radius} min={0} onChange={(v) => editSelected((e) => { if (e.type === 'image') e.radius = v; }, { touches: ['style'] })} />
      <Field label="Brightness">
        <Slider value={f.brightness} min={0.3} max={1.7} step={0.01} onStart={checkpoint} onChange={(v) => setFilter('brightness', v)} />
      </Field>
      <Field label="Contrast">
        <Slider value={f.contrast} min={0.3} max={1.7} step={0.01} onStart={checkpoint} onChange={(v) => setFilter('contrast', v)} />
      </Field>
      <Field label="Saturation">
        <Slider value={f.saturate} min={0} max={2} step={0.01} onStart={checkpoint} onChange={(v) => setFilter('saturate', v)} />
      </Field>
      <Field label="Greyscale">
        <Slider value={f.grayscale} min={0} max={1} step={0.01} onStart={checkpoint} onChange={(v) => setFilter('grayscale', v)} />
      </Field>
      <AltText el={el} />
    </Section>
  );
}

function AltText({ el }: { el: SlideElement }) {
  return (
    <label className="alt-field">
      <span className="field-label">Alt text</span>
      <textarea
        id={`alt-${el.id}`}
        rows={2}
        placeholder="Describe this for people using screen readers"
        defaultValue={el.alt ?? ''}
        key={el.id}
        onKeyDown={(e) => e.stopPropagation()}
        onBlur={(e) => {
          const v = e.target.value;
          if (v !== (el.alt ?? '')) editSelected((x) => void (x.alt = v));
        }}
      />
    </label>
  );
}

function ChartSettings({ el }: { el: Extract<SlideElement, { type: 'chart' }> }) {
  const upd = (fn: (e: Extract<SlideElement, { type: 'chart' }>) => void) => editSelected((e) => { if (e.type === 'chart') fn(e as any); });
  return (
    <Section title="Chart">
      <button className="btn full" onClick={() => useEditor.setState({ dialog: 'chart', chartEditId: el.id })}>
        <BarChart3 size={15} /> Edit data
      </button>
      <Field label="Type">
        <Select
          value={el.chartType}
          options={[
            { value: 'column', label: 'Column' },
            { value: 'bar', label: 'Bar' },
            { value: 'line', label: 'Line' },
            { value: 'area', label: 'Area' },
            { value: 'pie', label: 'Pie' },
            { value: 'doughnut', label: 'Doughnut' },
          ]}
          onChange={(v) => upd((e) => void (e.chartType = v))}
        />
      </Field>
      <label className="alt-field">
        <span className="field-label">Title</span>
        <input className="text-input" key={el.id} defaultValue={el.title} onKeyDown={(e) => e.stopPropagation()} onBlur={(e) => e.target.value !== el.title && upd((x) => void (x.title = e.target.value))} />
      </label>
      <Toggle label="Legend" checked={el.showLegend} onChange={(v) => upd((e) => void (e.showLegend = v))} />
      <Toggle label="Value labels" checked={el.showValues} onChange={(v) => upd((e) => void (e.showValues = v))} />
      <Toggle label="Gridlines" checked={el.showGrid} onChange={(v) => upd((e) => void (e.showGrid = v))} />
      <NumberField label="Text size" value={el.fontSize} min={8} max={80} onChange={(v) => upd((e) => void (e.fontSize = v))} />
      <Field label="Text">
        <ColorPicker value={el.textColor} allowTransparent={false} onChange={(c) => upd((e) => void (e.textColor = c))} />
      </Field>
      <AltText el={el} />
    </Section>
  );
}

function TableSettings({ el }: { el: Extract<SlideElement, { type: 'table' }> }) {
  const upd = (fn: (e: Extract<SlideElement, { type: 'table' }>) => void) => editSelected((e) => { if (e.type === 'table') fn(e as any); });
  const cols = Math.max(1, ...el.rows.map((r) => r.length));
  return (
    <Section title="Table">
      <div className="grid2">
        <div className="stepper-field">
          <span>Rows {el.rows.length}</span>
          <button aria-label="Remove row" disabled={el.rows.length <= 1} onClick={() => upd((e) => void e.rows.pop())}>
            <Minus size={13} />
          </button>
          <button aria-label="Add row" onClick={() => upd((e) => void e.rows.push(Array(cols).fill('')))}>
            <Plus size={13} />
          </button>
        </div>
        <div className="stepper-field">
          <span>Columns {cols}</span>
          <button aria-label="Remove column" disabled={cols <= 1} onClick={() => upd((e) => e.rows.forEach((r) => r.length >= cols && r.pop()))}>
            <Minus size={13} />
          </button>
          <button aria-label="Add column" onClick={() => upd((e) => e.rows.forEach((r) => { while (r.length < cols) r.push(''); r.push(''); }))}>
            <Plus size={13} />
          </button>
        </div>
      </div>
      <Toggle label="Header row" checked={el.headerRow} onChange={(v) => upd((e) => void (e.headerRow = v))} />
      <Toggle label="Banded rows" checked={el.style.stripe} onChange={(v) => upd((e) => void (e.style.stripe = v))} />
      <NumberField label="Text size" value={el.style.fontSize} min={8} max={120} onChange={(v) => upd((e) => void (e.style.fontSize = v))} />
      <Field label="Header">
        <ColorPicker value={el.style.headerFill} onChange={(c) => upd((e) => void (e.style.headerFill = c))} />
      </Field>
      <Field label="Header text">
        <ColorPicker value={el.style.headerColor} allowTransparent={false} onChange={(c) => upd((e) => void (e.style.headerColor = c))} />
      </Field>
      <Field label="Bands">
        <ColorPicker value={el.style.stripeFill} onChange={(c) => upd((e) => void (e.style.stripeFill = c))} />
      </Field>
      <Field label="Borders">
        <ColorPicker value={el.style.borderColor} onChange={(c) => upd((e) => void (e.style.borderColor = c))} />
      </Field>
      <Field label="Text">
        <ColorPicker value={el.style.color} allowTransparent={false} onChange={(c) => upd((e) => void (e.style.color = c))} />
      </Field>
    </Section>
  );
}

const EFFECTS: { value: AnimEffect; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade in' },
  { value: 'fly-up', label: 'Rise up' },
  { value: 'fly-left', label: 'Slide in from right' },
  { value: 'zoom', label: 'Zoom in' },
  { value: 'wipe', label: 'Wipe' },
];

function AnimationSettings({ els }: { els: SlideElement[] }) {
  const a = els[0].anim;
  const effect = a?.effect ?? 'none';
  const slide = currentSlide();
  const set = (patch: Partial<Animation>) =>
    editSelected((e) => {
      const maxOrder = Math.max(0, ...(slide?.elements ?? []).map((x) => x.anim?.order ?? 0));
      const cur: Animation = e.anim ?? { effect: 'fade', trigger: 'click', duration: 500, delay: 0, order: maxOrder + 1 };
      e.anim = { ...cur, ...patch };
    });
  return (
    <Section title="Animation">
      <Field label="Entrance">
        <Select value={effect} options={EFFECTS} onChange={(v) => set({ effect: v })} />
      </Field>
      {effect !== 'none' && a && (
        <>
          <Field label="Start">
            <Select<AnimTrigger>
              value={a.trigger}
              options={[
                { value: 'click', label: 'On click' },
                { value: 'with-previous', label: 'With previous' },
                { value: 'after-previous', label: 'After previous' },
              ]}
              onChange={(v) => set({ trigger: v })}
            />
          </Field>
          <div className="grid2">
            <NumberField label="Length" value={a.duration} step={50} min={100} max={5000} suffix="ms" onChange={(v) => set({ duration: v })} />
            <NumberField label="Delay" value={a.delay} step={50} min={0} max={10000} suffix="ms" onChange={(v) => set({ delay: v })} />
            <NumberField label="Order" value={a.order} min={0} max={99} onChange={(v) => set({ order: v })} />
          </div>
          <p className="muted small">Plays in OpenSlides’s slideshow. PowerPoint export keeps the layout but not animations.</p>
        </>
      )}
    </Section>
  );
}

function SlideSettings() {
  const deck = useEditor((s) => s.deck)!;
  const target = useEditor((s) => s.target);
  const slide = currentSlide();
  const bgRef = useRef<HTMLInputElement>(null);
  if (target.kind === 'layout') {
    const layout = deck.layouts.find((l) => l.id === target.layoutId)!;
    return (
      <div>
        <Section title={`Layout: ${layout.name}`}>
          <BackgroundEditor
            value={layout.background}
            inherited={false}
            onChange={(bg) =>
              mutate((d) => {
                const l = d.layouts.find((x) => x.id === layout.id);
                if (l && bg) l.background = bg;
              })
            }
            bgRef={bgRef}
          />
        </Section>
      </div>
    );
  }
  if (!slide) return null;
  const setSlide = (fn: (s: any) => void) =>
    mutate((d) => {
      const s = d.slides.find((x) => x.id === slide.id);
      if (s) fn(s);
    });
  return (
    <div>
      <Section title="Layout">
        <LayoutPicker current={slide.layoutId} onPick={(id) => changeLayout(slide.id, id)} />
      </Section>
      <Section title="Background">
        <BackgroundEditor
          value={slide.background ?? deck.layouts.find((l) => l.id === slide.layoutId)?.background ?? { kind: 'solid', color: 'theme:background' }}
          inherited={!slide.background}
          onChange={(bg) => setSlide((s) => (bg ? (s.background = bg) : delete s.background))}
          bgRef={bgRef}
        />
      </Section>
      <Section title="Slideshow">
        <Field label="Transition">
          <Select<Transition>
            value={slide.transition}
            options={[
              { value: 'none', label: 'None' },
              { value: 'fade', label: 'Fade' },
              { value: 'slide', label: 'Push' },
              { value: 'zoom', label: 'Zoom' },
            ]}
            onChange={(v) => setSlide((s) => void (s.transition = v))}
          />
        </Field>
        <button className="btn small ghost" onClick={() => mutate((d) => d.slides.forEach((s) => void (s.transition = slide.transition)))}>
          Apply to all slides
        </button>
        <Toggle label="Skip this slide when presenting" checked={!!slide.hidden} onChange={(v) => setSlide((s) => void (s.hidden = v))} />
      </Section>
    </div>
  );
}

function BackgroundEditor({ value, inherited, onChange, bgRef }: { value: Background; inherited: boolean; onChange: (bg: Background | null) => void; bgRef: React.RefObject<HTMLInputElement | null> }) {
  return (
    <div>
      {inherited ? <p className="muted small">Using the layout’s background.</p> : null}
      <div className="seg">
        {(['solid', 'gradient', 'image'] as const).map((k) => (
          <button
            key={k}
            className={value.kind === k ? 'on' : ''}
            onClick={() => {
              if (k === 'solid') onChange({ kind: 'solid', color: value.kind === 'gradient' ? value.from : 'theme:background' });
              if (k === 'gradient') onChange({ kind: 'gradient', from: 'theme:primary', to: 'theme:secondary', angle: 135 });
              if (k === 'image') bgRef.current?.click();
            }}
          >
            {k === 'solid' ? 'Colour' : k === 'gradient' ? 'Gradient' : 'Image'}
          </button>
        ))}
      </div>
      {value.kind === 'solid' && (
        <Field label="Colour">
          <ColorPicker value={value.color} allowTransparent={false} onChange={(c) => onChange({ kind: 'solid', color: c })} />
        </Field>
      )}
      {value.kind === 'gradient' && (
        <>
          <Field label="From">
            <ColorPicker value={value.from} allowTransparent={false} onChange={(c) => onChange({ ...value, from: c })} />
          </Field>
          <Field label="To">
            <ColorPicker value={value.to} allowTransparent={false} onChange={(c) => onChange({ ...value, to: c })} />
          </Field>
          <NumberField label="Angle" value={value.angle} suffix="°" onChange={(v) => onChange({ ...value, angle: v })} />
        </>
      )}
      {value.kind === 'image' && (
        <Field label="Darken">
          <Slider value={value.dim} min={0} max={0.8} step={0.05} onChange={(v) => onChange({ ...value, dim: v })} />
        </Field>
      )}
      {!inherited && (
        <button className="btn small ghost" onClick={() => onChange(null)}>
          Use layout background
        </button>
      )}
      <input
        ref={bgRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          const asset = await fileToAsset(f);
          const id = addAsset(asset);
          onChange({ kind: 'image', assetId: id, dim: 0.25 });
        }}
      />
    </div>
  );
}
