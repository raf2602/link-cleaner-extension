export const HISTORY_KEY = "cleanHistory";
export const HISTORY_LIMIT = 20;

export async function addHistory(input, output, settings = {}) {
  if (settings.historyEnabled === false || input === output) return;
  const { [HISTORY_KEY]: existing = [] } = await chrome.storage.local.get(HISTORY_KEY);
  const history = [
    { input, output, cleanedAt: Date.now() },
    ...existing.filter((item) => item.output !== output),
  ].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
}

export async function getHistory() {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  return history;
}

export async function clearHistory() {
  await chrome.storage.local.remove(HISTORY_KEY);
}
