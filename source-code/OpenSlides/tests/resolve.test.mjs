import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTokens } from '../src/model/resolve.ts';

test('title tokens preserve literal dollar sequences in deck titles', () => {
  for (const title of ['Budget $& forecast', 'Budget $$ forecast', 'Budget $` forecast', "Budget $' forecast"]) {
    assert.equal(
      applyTokens('<p>{{title}}</p><p>{{title}} — {{n}}/{{total}}</p>', { title, n: 2, total: 5 }),
      `<p>${title}</p><p>${title} — 2/5</p>`,
    );
  }
});
