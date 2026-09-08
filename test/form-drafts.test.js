import test from 'node:test';
import assert from 'node:assert/strict';
import { renderWithFormDraft } from '../ux-utils.js';

function fixture({ dirty = true, focused = false, id = 'profileEditForm' } = {}) {
  const input = value => ({ id: 'displayName', name: 'displayName', value, selectionStart: 2, selectionEnd: 4,
    focus() { this.focused = true; }, setSelectionRange(start,end) { this.selection = [start,end]; } });
  const makeForm = value => {
    const elements = [input(value)];
    elements.namedItem = name => elements.find(field => field.name === name);
    return { id, elements, dataset: {}, contains: field => elements.includes(field) };
  };
  const original = makeForm('Unsaved name');
  if (dirty) original.dataset.dirty = 'true';
  let current = original;
  const root = { querySelector: () => current, ownerDocument: {activeElement: focused ? original.elements[0] : null} };
  return { root, render: () => { current = makeForm('Saved name'); }, current: () => current };
}

test('background rendering preserves dirty values even after the input loses focus', () => {
  const state = fixture();
  renderWithFormDraft(state.root, state.render);
  assert.equal(state.current().elements[0].value, 'Unsaved name');
  assert.equal(state.current().dataset.dirty, 'true');
});
test('focused form restores focus and caret for a language change', () => {
  const state = fixture({dirty:false,focused:true});
  renderWithFormDraft(state.root, state.render);
  assert.equal(state.current().elements[0].focused, true);
  assert.deepEqual(state.current().elements[0].selection, [2,4]);
});
test('clean inactive form adopts updated server presentation', () => {
  const state = fixture({dirty:false});
  renderWithFormDraft(state.root, state.render);
  assert.equal(state.current().elements[0].value, 'Saved name');
});
test('account transitions discard previous account drafts and passwords', () => {
  const state = fixture({id:'communityAuthForm',focused:true});
  renderWithFormDraft(state.root, state.render, false);
  assert.equal(state.current().elements[0].value, 'Saved name');
  assert.equal(state.current().elements[0].focused, undefined);
});
test('a changed or absent form never receives the previous form values', () => {
  const state = fixture();
  renderWithFormDraft(state.root, () => { state.render(); state.current().id = 'linkPlayerForm'; });
  assert.equal(state.current().elements[0].value, 'Saved name');
  let rendered = false;
  renderWithFormDraft(null, () => { rendered = true; });
  assert.equal(rendered, true);
});
