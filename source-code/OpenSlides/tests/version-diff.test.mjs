import test from 'node:test';
import assert from 'node:assert/strict';
import { diffDecks } from '../src/model/diff.ts';

const textEl = (id, text, props = {}) => ({
  id, type: 'text', x: 0, y: 0, w: 100, h: 50, rotation: 0, opacity: 1,
  html: `<p>${text}</p>`, style: {}, fill: '#fff', padding: 0, autoHeight: true, ...props,
});
const imageEl = (id) => ({
  id, type: 'image', x: 0, y: 0, w: 100, h: 50, rotation: 0, opacity: 1,
  assetId: 'a1', fit: 'cover', radius: 0, filters: {},
});
const slide = (id, elements = [], extra = {}) => ({
  id, layoutId: 'L', elements, notes: '', transition: 'none', ...extra,
});
const deck = (slides, title = 'Deck') => ({ id: 'd1', title, slides });

const statusOf = (d, id) => d.slides.find((s) => s.id === id)?.status;

test('identical decks report no changes', () => {
  const d = deck([slide('s1', [textEl('t1', 'Hello')])]);
  const diff = diffDecks(d, structuredClone(d));
  assert.equal(diff.hasChanges, false);
  assert.equal(diff.summary, 'No changes');
  assert.equal(statusOf(diff, 's1'), 'unchanged');
});

test('detects added and removed slides', () => {
  const from = deck([slide('s1'), slide('s2')]);
  const to = deck([slide('s1'), slide('s3')]);
  const diff = diffDecks(from, to);
  assert.equal(statusOf(diff, 's3'), 'added');
  assert.equal(statusOf(diff, 's2'), 'removed');
  assert.ok(diff.summary.includes('1 added'));
  assert.ok(diff.summary.includes('1 removed'));
});

test('detects a moved slide without content change', () => {
  const from = deck([slide('s1'), slide('s2')]);
  const to = deck([slide('s2'), slide('s1')]);
  const diff = diffDecks(from, to);
  assert.equal(statusOf(diff, 's1'), 'moved');
  assert.equal(statusOf(diff, 's2'), 'moved');
  assert.ok(diff.summary.includes('2 moved'));
});

test('describes a text edit with before and after', () => {
  const from = deck([slide('s1', [textEl('t1', 'Old title')])]);
  const to = deck([slide('s1', [textEl('t1', 'New title')])]);
  const diff = diffDecks(from, to);
  const s = diff.slides.find((x) => x.id === 's1');
  assert.equal(s.status, 'changed');
  assert.equal(s.changes.length, 1);
  assert.match(s.changes[0], /Text changed.*Old title.*New title/);
});

test('detects element add and remove within a slide', () => {
  const from = deck([slide('s1', [textEl('t1', 'A')])]);
  const to = deck([slide('s1', [textEl('t1', 'A'), imageEl('i1')])]);
  const diff = diffDecks(from, to);
  const s = diff.slides.find((x) => x.id === 's1');
  assert.deepEqual(s.changes, ['Image added']);

  const back = diffDecks(to, from);
  assert.deepEqual(back.slides.find((x) => x.id === 's1').changes, ['Image removed']);
});

test('detects notes and title changes', () => {
  const from = deck([slide('s1', [], { notes: 'first' })], 'A');
  const to = deck([slide('s1', [], { notes: 'second' })], 'B');
  const diff = diffDecks(from, to);
  assert.ok(diff.slides.find((x) => x.id === 's1').changes.includes('Notes changed'));
  assert.deepEqual(diff.titleChange, { from: 'A', to: 'B' });
  assert.ok(diff.summary.includes('title changed'));
  assert.equal(diff.hasChanges, true);
});
