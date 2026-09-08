import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderScheduler } from '../ux-utils.js';

function harness(withFrames = true) {
  const frames = new Map(), timers = new Map();
  let id = 0, renders = 0;
  const schedule = createRenderScheduler(() => { renders++; }, {
    requestFrame: withFrames ? callback => { const key = ++id; frames.set(key,callback); return key; } : null,
    cancelFrame: key => frames.delete(key),
    setTimer: (callback,delay) => { assert.equal(delay,100); const key = ++id; timers.set(key,callback); return key; },
    clearTimer: key => timers.delete(key)
  });
  return { schedule,frames,timers,count:() => renders };
}
test('a burst of snapshots coalesces to one frame and cancels the fallback', () => {
  const h = harness(); h.schedule(); h.schedule(); h.schedule();
  assert.equal(h.frames.size,1); assert.equal(h.timers.size,1);
  [...h.frames.values()][0]();
  assert.equal(h.count(),1); assert.equal(h.timers.size,0);
});
test('a suspended animation frame cannot leave updated data permanently queued', () => {
  const h = harness(); h.schedule();
  const staleFrame = [...h.frames.values()][0];
  [...h.timers.values()][0]();
  assert.equal(h.count(),1); assert.equal(h.frames.size,0);
  h.schedule(); staleFrame();
  assert.equal(h.count(),1);
  [...h.frames.values()][0]();
  assert.equal(h.count(),2);
});
test('timer-only environments still render once and accept later updates', () => {
  const h = harness(false); h.schedule(); h.schedule();
  [...h.timers.values()][0](); assert.equal(h.count(),1);
  h.schedule(); [...h.timers.values()][0](); assert.equal(h.count(),2);
});
