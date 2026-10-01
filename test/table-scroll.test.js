import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { filterRankingRows, captureTableScrollPosition, restoreTableScrollPosition } from '../ux-utils.js';
import { directionFor } from '../i18n.js';
import { applyTableColumns } from '../detail-ui.js';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('function renderTable()'), source.indexOf('function renderPlayerCardsNameOnly()'));
const rule = selector => css.slice(css.indexOf(selector + '{') + selector.length + 1).split('}')[0];

test('sticky names use a stable LTR scroller with the original Arabic column order', () => {
  assert.match(rule('.tablewrap'), /overflow:auto/);
  assert.match(rule('.tablewrap'), /direction:ltr/);
  assert.match(rule('[dir="rtl"] .table'), /direction:rtl/);
  assert.match(css, /\.table th:nth-child\(2\),\.table td:nth-child\(2\)\{[^}]*position:sticky;left:0/);
  assert.match(css, /\[dir="rtl"\] \.table th:nth-child\(2\),\[dir="rtl"\] \.table td:nth-child\(2\)\{left:auto;right:0/);
  assert.doesNotMatch(css, /\.table(?:\s|\{|\.)[^}]*will-change/);
});

test('table scroll starts beside names, preserves offset and resets correctly in both languages', () => {
  for (const direction of ['rtl', 'ltr']) {
    const wrap = { clientWidth: 300, scrollWidth: 1100, scrollLeft: 0, dataset: {} };
    assert.equal(captureTableScrollPosition(wrap), null);
    restoreTableScrollPosition(wrap, direction);
    assert.equal(wrap.scrollLeft, direction === 'rtl' ? 800 : 0);
    wrap.scrollLeft = direction === 'rtl' ? 600 : 200;
    const previous = captureTableScrollPosition(wrap);
    assert.deepEqual(previous, { direction, offset: 200 });
    wrap.scrollWidth = 1300;
    restoreTableScrollPosition(wrap, direction, previous);
    assert.equal(wrap.scrollLeft, direction === 'rtl' ? 800 : 200);
    restoreTableScrollPosition(wrap, direction);
    assert.equal(wrap.scrollLeft, direction === 'rtl' ? 1000 : 0);
    restoreTableScrollPosition(wrap, direction === 'rtl' ? 'ltr' : 'rtl', previous);
    assert.equal(wrap.scrollLeft, direction === 'rtl' ? 0 : 1000);
    wrap.scrollWidth = 400;
    restoreTableScrollPosition(wrap, direction, previous);
    assert.equal(wrap.scrollLeft, direction === 'rtl' ? 0 : 100);
    wrap.scrollWidth = 300;
    restoreTableScrollPosition(wrap, direction, previous);
    assert.equal(wrap.scrollLeft, 0);
  }
});

test('table scroll ignores hidden tables and clamps Safari overscroll at either edge', () => {
  const wrap = { clientWidth: 0, scrollWidth: 0, scrollLeft: 0, dataset: {} };
  restoreTableScrollPosition(wrap, 'rtl');
  assert.equal(captureTableScrollPosition(wrap), null);
  assert.deepEqual(wrap.dataset, {});
  wrap.clientWidth = 300; wrap.scrollWidth = 1100;
  restoreTableScrollPosition(wrap, 'rtl');
  wrap.scrollLeft = 820;
  assert.equal(captureTableScrollPosition(wrap).offset, 0);
  wrap.scrollLeft = -20;
  assert.equal(captureTableScrollPosition(wrap).offset, 800);
  assert.doesNotThrow(() => restoreTableScrollPosition(null, 'rtl'));
});

test('table renderer retains each name, safe profile link and stat when sorting or filtering', () => {
  const rows = Array.from({ length: 65 }, (_, i) => ({ id: `p-${i}`, name: `Player <${i}>`, displayRank: i + 1,
    matches: 30, wins: 20, goals: 12, winPct: 2 / 3, gpm: .4, curStreak: 3, bestStreak: 5,
    votingPoints: 51, motmAwards: 2, monthAwards: 1 }));
  for (const sort of ['name', 'goals', 'winPct', 'motmAwards', 'votingPoints']) {
    for (const query of ['', 'Player <4>', 'no-match']) {
      const body = { innerHTML: '', closest: () => null };
      const controls = { tableBody: body, tableSort: { value: sort }, tableSearch: { value: query }, tableSearchCount: {}, tableScope: {} };
      runInNewContext(renderer + '\nrenderTable();', {
        $: id => controls[id], renderRankingShortcuts() {}, filterRankingRows,
        captureTableScrollPosition, restoreTableScrollPosition, applyTableColumns, directionFor, language: 'ar',
        rankingRows: () => ({ rows, complete: true, awardSort: ['motmAwards', 'votingPoints'].includes(sort) }),
        t: key => key, esc: value => String(value).replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
        fmtPct: () => '67%', fmt2: () => '0.40', communityEnabled: true, AWARD_SORT_KEYS: []
      });
      const expected = query === '' ? 65 : query === 'Player <4>' ? 1 : 0;
      assert.equal((body.innerHTML.match(/class="inline-player-link table-player-link"/g) || []).length, expected);
      assert.equal((body.innerHTML.match(/data-sort-key="name"/g) || []).length, expected);
      assert.doesNotMatch(body.innerHTML, /Player <\d/);
      if (expected) {
        for (const key of ['goals', 'matches', 'wins', 'winPct', 'gpm', 'curStreak', 'bestStreak', 'votingPoints', 'motmAwards', 'monthAwards'])
          assert.equal((body.innerHTML.match(new RegExp(`data-sort-key="${key}"`, 'g')) || []).length, expected);
      } else assert.match(body.innerHTML, /noSearchPlayers/);
    }
  }
});
