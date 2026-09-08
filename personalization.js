export const PINNED_PLAYER_KEY = "futbolista-pinned-player";

export function readPinnedPlayer(storage) {
  try {
    const value = storage.getItem(PINNED_PLAYER_KEY);
    return typeof value === "string" ? value.trim() || null : null;
  } catch {
    return null;
  }
}

export function writePinnedPlayer(storage, playerId) {
  if (playerId !== null && typeof playerId !== "string") return false;
  const value = playerId?.trim() || null;
  try {
    if (value === null) {
      storage.removeItem(PINNED_PLAYER_KEY);
      return storage.getItem(PINNED_PLAYER_KEY) === null;
    }
    storage.setItem(PINNED_PLAYER_KEY, value);
    return storage.getItem(PINNED_PLAYER_KEY) === value;
  } catch {
    return false;
  }
}
