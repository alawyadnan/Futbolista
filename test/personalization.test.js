import test from "node:test";
import assert from "node:assert/strict";
import { PINNED_PLAYER_KEY, readPinnedPlayer, writePinnedPlayer } from "../personalization.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const accessedKeys = [];
  return {
    values,
    accessedKeys,
    getItem(key) { accessedKeys.push(key); return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { accessedKeys.push(key); values.set(key, value); },
    removeItem(key) { accessedKeys.push(key); values.delete(key); }
  };
}

test("pinned player persists as one trimmed opaque string", () => {
  const storage = memoryStorage();
  assert.equal(readPinnedPlayer(storage), null);
  assert.equal(writePinnedPlayer(storage, "  player/id:أ  "), true);
  assert.equal(storage.values.get(PINNED_PLAYER_KEY), "player/id:أ");
  assert.equal(readPinnedPlayer(storage), "player/id:أ");
  assert.equal(writePinnedPlayer(storage, "0"), true);
  assert.equal(readPinnedPlayer(storage), "0");
});

test("null and empty strings remove an existing pin", () => {
  for (const value of [null, "", "   \n "]) {
    const storage = memoryStorage({ [PINNED_PLAYER_KEY]: "player-a" });
    assert.equal(writePinnedPlayer(storage, value), true);
    assert.equal(storage.values.has(PINNED_PLAYER_KEY), false);
    assert.equal(readPinnedPlayer(storage), null);
  }
});

test("invalid non-string write inputs do not replace or clear a saved player", () => {
  for (const value of [undefined, 0, 12, false, true, [], {}, new String("player-b")]) {
    const storage = memoryStorage({ [PINNED_PLAYER_KEY]: "player-a" });
    assert.equal(writePinnedPlayer(storage, value), false);
    assert.equal(storage.values.get(PINNED_PLAYER_KEY), "player-a");
    assert.deepEqual(storage.accessedKeys, []);
  }
});

test("read trims valid stored IDs and ignores empty or non-string values", () => {
  assert.equal(readPinnedPlayer(memoryStorage({ [PINNED_PLAYER_KEY]: "  player-a  " })), "player-a");
  for (const value of ["", "  ", null, undefined, 12, false, {}]) {
    assert.equal(readPinnedPlayer(memoryStorage({ [PINNED_PLAYER_KEY]: value })), null);
  }
  assert.equal(readPinnedPlayer(memoryStorage({ [PINNED_PLAYER_KEY]: "null" })), "null");
  assert.equal(readPinnedPlayer(memoryStorage({ [PINNED_PLAYER_KEY]: '{"id":"a"}' })), '{"id":"a"}');
});

test("missing or blocked storage fails gracefully", () => {
  const blocked = {
    getItem() { throw new Error("blocked"); },
    setItem() { throw new Error("blocked"); },
    removeItem() { throw new Error("blocked"); }
  };
  for (const storage of [undefined, null, {}, blocked]) {
    assert.equal(readPinnedPlayer(storage), null);
    assert.equal(writePinnedPlayer(storage, "player-a"), false);
    assert.equal(writePinnedPlayer(storage, null), false);
  }
});

test("writes report success only when persistence can be verified", () => {
  const ignoredWrites = memoryStorage({ [PINNED_PLAYER_KEY]: "player-a" });
  ignoredWrites.setItem = () => {};
  ignoredWrites.removeItem = () => {};
  assert.equal(writePinnedPlayer(ignoredWrites, "player-b"), false);
  assert.equal(writePinnedPlayer(ignoredWrites, null), false);

  const unreadable = memoryStorage();
  unreadable.getItem = () => { throw new Error("unreadable"); };
  assert.equal(writePinnedPlayer(unreadable, "player-b"), false);
  assert.equal(writePinnedPlayer(unreadable, null), false);
});

test("pin operations access only their own storage key", () => {
  const storage = memoryStorage({ theme: "dark", language: "ar" });
  writePinnedPlayer(storage, "player-a");
  readPinnedPlayer(storage);
  writePinnedPlayer(storage, null);
  assert.deepEqual([...storage.values.entries()], [["theme", "dark"], ["language", "ar"]]);
  assert.equal(storage.accessedKeys.every(key => key === PINNED_PLAYER_KEY), true);
});
