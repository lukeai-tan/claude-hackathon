import { THEME_PRESETS } from './theme';
import {
  SIZE_PRESETS,
  bullets,
  makeChart,
  makeDeck,
  makeShape,
  makeSlide,
  makeTable,
  makeText,
  paragraphs,
  type LayoutVariant,
} from './factory';
import type { Deck, PlaceholderKind, Slide, SlideElement } from './types';

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  themeId: string;
  sizeId: string;
  variant: LayoutVariant;
}

export const TEMPLATES: TemplateInfo[] = [
  { id: 'blank', name: 'Blank deck', description: 'One title slide and the full layout set.', themeId: 'mat', sizeId: '16:9', variant: 'bar' },
  { id: 'marketing', name: 'Marketing plan', description: 'Audience, campaign, channels and measures.', themeId: 'cobalt', sizeId: '16:9', variant: 'block' },
  { id: 'creative', name: 'Creative studio', description: 'A bold portfolio with a project story.', themeId: 'neon', sizeId: '16:9', variant: 'minimal' },
  { id: 'nature', name: 'Nature & impact', description: 'A calm story about a better future.', themeId: 'botanic', sizeId: '16:9', variant: 'minimal' },
  { id: 'team', name: 'Group project', description: 'Context, approach, responsibilities and next steps.', themeId: 'aurora', sizeId: '16:9', variant: 'bar' },
  { id: 'proposal', name: 'Business proposal', description: 'Scope, timeline, investment and outcomes.', themeId: 'ocean', sizeId: '16:9', variant: 'block' },
  { id: 'thesis', name: 'Thesis defence', description: 'Research question, method and contribution.', themeId: 'paper', sizeId: '16:9', variant: 'minimal' },
  { id: 'pitch', name: 'Startup pitch', description: 'Problem, traction chart, big number and ask.', themeId: 'studio', sizeId: '16:9', variant: 'block' },
  { id: 'lecture', name: 'Lecture', description: 'Objectives, comparison table and an exercise.', themeId: 'campus', sizeId: '16:9', variant: 'bar' },
  { id: 'report', name: 'Research update', description: 'Trend chart, findings table and next steps.', themeId: 'editorial', sizeId: '16:9', variant: 'minimal' },
  { id: 'launch', name: 'Product launch', description: 'Dark theme with image layout and a share chart.', themeId: 'ink', sizeId: '16:9', variant: 'bar' },
  { id: 'social', name: 'Square post', description: 'A 1:1 slide for social media.', themeId: 'botanic', sizeId: '1:1', variant: 'block' },
];

type Content = Partial<Record<PlaceholderKind, string>>;

export function createFromTemplate(templateId: string, title?: string): Deck {
  const info = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  const theme = THEME_PRESETS.find((t) => t.id === info.themeId) ?? THEME_PRESETS[0];
  const size = SIZE_PRESETS.find((s) => s.id === info.sizeId) ?? SIZE_PRESETS[0];
  const deck = makeDeck(title ?? info.name, theme, { w: size.w, h: size.h, preset: size.id }, info.variant);
  const W = size.w;
  const H = size.h;
  const u = Math.min(W, H) / 1080;
  const m = Math.round(Math.min(W, H) * 0.08);
  const layout = (id: string) => deck.layouts.find((l) => l.id === id)!;
  const add = (layoutId: string, content: Content, extra: SlideElement[] = [], notes = ''): Slide => {
    const s = makeSlide(layout(layoutId), content);
    s.elements.push(...extra);
    s.notes = notes;
    deck.slides.push(s);
    return s;
  };
  const p = (t: string) => paragraphs(t);
  const contentY = m * 0.55 + 28 * u + 150 * u + 30 * u;
  const contentH = H - contentY - m - 20 * u;

  const stories: Record<string, { headline:string; subtitle:string; points:string[] }> = {
    marketing: {headline:'Make your next move.',subtitle:'Marketing plan / Strategy, story, momentum',points:['Who we want to reach','What we want them to remember','How we will measure progress']},
    creative: {headline:'Creative\nsolutions.',subtitle:'Selected work / Ideas made visible',points:['The brief and its constraints','The idea behind the design','What we learned along the way']},
    nature: {headline:'A future\nworth growing.',subtitle:'Nature & impact / Small changes, shared progress',points:['The challenge we see','The change we can make','The evidence we need']},
    team: {headline:'Better,\ntogether.',subtitle:'Group project / One team, a shared direction',points:['Our goal and why it matters','Our approach and responsibilities','What comes next']},
    proposal: {headline:'Let’s build\nwhat’s next.',subtitle:'Business proposal / A clear path forward',points:['The opportunity and expected outcomes','Scope, milestones and ownership','Investment and next steps']},
    thesis: {headline:'A new\nperspective.',subtitle:'Thesis defence / Research, evidence, contribution',points:['The research question','Method, findings and limitations','Contribution and future work']},
  };
  const story=stories[info.id];
  if(story){
    const cover=add('blank',{});
    cover.elements.push(
      makeShape('ellipse',W*.69,-H*.18,H*.72,H*.72,{fill:'theme:secondary',opacity:.3}),
      makeShape('ellipse',W*.81,H*.32,H*.4,H*.4,{fill:'theme:accent',opacity:.8}),
      makeText(m,H*.12,W*.7,48*u,p(info.name.toUpperCase()),{fontSize:22*u,letterSpacing:.15,color:'theme:muted'}),
      makeText(m,H*.3,W*.72,H*.43,p(story.headline),{fontFamily:'theme:heading',fontSize:116*u,bold:true,lineHeight:1.02},{autoHeight:false}),
      makeText(m,H*.82,W*.75,65*u,p(story.subtitle),{fontSize:26*u,color:'theme:muted'}),
    );
    add('title-content',{title:p('The story so far'),body:bullets(story.points)});
    add('two-content',{title:p('Our approach'),body:bullets(['Add your first finding or proposal','Support it with evidence']),body2:bullets(['Explain the next step','Name an owner and a date'])});
    add('section',{title:p('Let’s begin.'),subtitle:p('Your next step starts here.')});
    return deck;
  }

  switch (info.id) {
    case 'blank':
      add('title', {});
      break;

    case 'pitch':
      deck.title = title ?? 'Lumen pitch';
      add('title', { title: p('Lumen'), subtitle: p('Solar lanterns for night markets. Seed round, 2026.') }, [], 'Open with the one-line story: who is in the dark, and why now.');
      add('title-content', {
        title: p('Night markets still run on diesel'),
        body: bullets(['Generators are loud, smoky and cost stalls money every night', 'Grid hook-ups take months and most stalls are temporary', 'Existing solar lights are too dim to sell under']),
      }, [], 'Replace these with findings from your own interviews.');
      add('big-number', { number: p('68%'), caption: p('of stalls in our pilot survey said lighting cost was their biggest nightly expense (sample figure)') });
      add('two-content', {
        title: p('How it works'),
        body: bullets(['Lantern charges on the stall roof by day', 'Swappable battery lasts a 7-hour market']),
        body2: bullets(['Stalls rent by the week through the app', 'We collect and service batteries overnight']),
      });
      add('title-only', { title: p('Traction') }, [
        makeChart('column', m, contentY, W - 2 * m, contentH, {
          data: { labels: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct'], series: [{ name: 'Stalls renting', values: [12, 30, 55, 96, 140] }] },
          showLegend: false,
          showValues: true,
          title: 'Stalls renting per month (sample data)',
        }),
      ]);
      add('quote', { body: p('We stopped paying for diesel in the first week.'), caption: p('Stall owner, pilot market (sample quote)') });
      add('section', { title: p('Raising $400k'), subtitle: p('To reach 2,000 stalls across five markets by end of 2027.') });
      break;

    case 'lecture':
      deck.title = title ?? 'Linked lists';
      add('title', { title: p('Linked lists'), subtitle: p('Data structures, week 3') });
      add('title-content', {
        title: p('By the end of today you can'),
        body: bullets(['Explain how a singly linked list stores data', 'Compare linked lists with arrays for common operations', 'Implement insert and delete in under 20 lines']),
      });
      add('two-content', {
        title: p('Two ways to store a sequence'),
        body: `<p><b>Array</b></p>${bullets(['One contiguous block of memory', 'Index in constant time', 'Inserting in the middle shifts everything'])}`,
        body2: `<p><b>Linked list</b></p>${bullets(['Nodes scattered across memory', 'Each node points to the next', 'Insert anywhere once you hold the node'])}`,
      });
      add('title-only', { title: p('Cost of common operations') }, [
        makeTable(
          [
            ['Operation', 'Array', 'Linked list'],
            ['Read item i', 'O(1)', 'O(n)'],
            ['Insert at front', 'O(n)', 'O(1)'],
            ['Insert after a known node', 'O(n)', 'O(1)'],
            ['Search for a value', 'O(n)', 'O(n)'],
          ],
          m,
          contentY,
          W - 2 * m,
          contentH * 0.8,
        ),
      ]);
      add('section', { title: p('Exercise'), subtitle: p('Reverse a linked list in place. 10 minutes, in pairs.') }, [], 'Walk the room. Common bug: losing the reference to the rest of the list.');
      add('title-content', {
        title: p('Summary'),
        body: bullets(['Arrays win on random access', 'Linked lists win on cheap inserts and deletes', 'Pick the structure from the operations you do most']),
      });
      break;

    case 'report':
      deck.title = title ?? 'Research update';
      add('title', { title: p('Quarterly research update'), subtitle: p('Field trials, July to September') });
      add('big-number', { number: p('3.2×'), caption: p('faster sample processing after the new protocol (sample figure)') });
      add('title-only', { title: p('Throughput by month') }, [
        makeChart('line', m, contentY, W - 2 * m, contentH, {
          data: {
            labels: ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'],
            series: [
              { name: 'Old protocol', values: [40, 42, 41, 43, 44, 42] },
              { name: 'New protocol', values: [40, 41, 70, 96, 118, 134] },
            ],
          },
          title: 'Samples per week (sample data)',
        }),
      ]);
      add('title-only', { title: p('What we found') }, [
        makeTable(
          [
            ['Finding', 'Confidence', 'Next step'],
            ['Throughput gain holds across sites', 'High', 'Roll out to site C'],
            ['Error rate unchanged', 'Medium', 'Extend sample to 500'],
            ['Cost per sample down', 'Low', 'Audit supplier invoices'],
          ],
          m,
          contentY,
          W - 2 * m,
          contentH * 0.7,
        ),
      ]);
      add('quote', { body: p('The protocol change paid for itself in the first month.'), caption: p('Lab lead (sample quote)') });
      add('title-content', { title: p('Next steps'), body: bullets(['Replicate at a third site', 'Publish the protocol internally', 'Review again in January']) });
      break;

    case 'launch':
      deck.title = title ?? 'Launch plan';
      add('title', { title: p('Orbit 2'), subtitle: p('Launch plan for the November release') });
      add('image-right', { title: p('Built for the commute'), body: bullets(['Folds to the size of a notebook', 'Charges in 40 minutes', 'Ships in three colours']) }, [], 'Drop a product photo into the image placeholder.');
      add('title-only', { title: p('Where pre-orders come from') }, [
        makeChart('doughnut', m, contentY, W - 2 * m, contentH, {
          data: { labels: ['Newsletter', 'Social', 'Retail partners', 'Press'], series: [{ name: 'Share', values: [42, 27, 19, 12] }] },
          showValues: true,
          title: 'Share of pre-orders (sample data)',
        }),
      ]);
      add('two-content', { title: p('Launch week'), body: bullets(['Mon: press embargo lifts', 'Tue: newsletter and social']), body2: bullets(['Thu: retail partners go live', 'Fri: first review round-up']) });
      add('section', { title: p('Questions'), subtitle: p('Owner: launch team') });
      break;

    case 'social': {
      deck.title = title ?? 'Square post';
      const s = add('blank', {});
      s.elements.push(
        makeShape('ellipse', W * 0.6, H * 0.08, W * 0.3, W * 0.3, { fill: 'theme:accent', name: 'Sun' }),
        makeText(m, H * 0.46, W - 2 * m, 300 * u, p('Plant swap this Saturday'), { fontFamily: 'theme:heading', fontSize: Math.round(110 * u), bold: true, lineHeight: 1.05 }),
        makeText(m, H * 0.46 + 330 * u, W - 2 * m, 120 * u, p('Bring a cutting, take a cutting. 10am to 1pm, community garden.'), { fontSize: Math.round(40 * u), color: 'theme:muted' }),
      );
      break;
    }
  }
  return deck;
}
