import { cleanMany, cleanUrl, loadSettings } from "../lib/cleaner.js";
import { addHistory, clearHistory, getHistory } from "../lib/history.js";

const $ = (selector) => document.querySelector(selector);
const elements = {
  singlePanel: $("#singlePanel"), bulkPanel: $("#bulkPanel"), input: $("#inputUrl"),
  output: $("#outputUrl"), summary: $("#resultSummary"), changes: $("#changeList"),
  error: $("#errorMessage"), copy: $("#copyButton"), open: $("#openButton"),
  replace: $("#replaceButton"), paste: $("#pasteButton"), useTab: $("#useTabButton"),
  bulkInput: $("#bulkInput"), bulkCopy: $("#bulkCopyButton"), bulkCount: $("#bulkCount"),
  bulkRemoved: $("#bulkRemoved"), historyPanel: $("#historyPanel"), historyList: $("#historyList"),
  historyButton: $("#historyButton"), clearHistory: $("#clearHistoryButton"),
};

let settings;
let activeTab;
let currentResult = null;
let bulkResults = [];

init();

async function init() {
  settings = await loadSettings();
  [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  bindEvents();
  if (activeTab?.url?.startsWith("http")) {
    elements.input.value = activeTab.url;
    renderSingle();
  } else {
    showError("This browser page doesn't have a cleanable web link. Paste one instead.");
  }
}

function bindEvents() {
  elements.input.addEventListener("input", renderSingle);
  elements.bulkInput.addEventListener("input", renderBulk);
  elements.copy.addEventListener("click", copySingle);
  elements.open.addEventListener("click", openSingle);
  elements.replace.addEventListener("click", replaceSingle);
  elements.paste.addEventListener("click", () => pasteInto(elements.input, renderSingle));
  $("#bulkPasteButton").addEventListener("click", () => pasteInto(elements.bulkInput, renderBulk));
  elements.useTab.addEventListener("click", () => {
    if (!activeTab?.url?.startsWith("http")) return showError("The active tab isn't a web page.");
    elements.input.value = activeTab.url;
    renderSingle();
  });
  $("#settingsButton").addEventListener("click", () => chrome.runtime.openOptionsPage());
  elements.historyButton.addEventListener("click", toggleHistory);
  elements.clearHistory.addEventListener("click", async () => {
    await clearHistory();
    await renderHistory();
  });
  for (const button of document.querySelectorAll(".mode-button")) {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  }
}

function setMode(mode) {
  for (const button of document.querySelectorAll(".mode-button")) {
    button.classList.toggle("active", button.dataset.mode === mode);
  }
  elements.singlePanel.hidden = mode !== "single";
  elements.bulkPanel.hidden = mode !== "bulk";
  elements.historyPanel.hidden = true;
  if (mode === "bulk") elements.bulkInput.focus();
}

function renderSingle() {
  resetError();
  const value = elements.input.value.trim();
  if (!value) {
    currentResult = null;
    elements.output.textContent = "Your cleaned link will appear here.";
    elements.summary.textContent = "Ready";
    elements.summary.className = "summary-chip";
    elements.changes.replaceChildren();
    setSingleActions(false);
    return;
  }

  try {
    currentResult = cleanUrl(value, settings);
    elements.output.textContent = currentResult.url;
    elements.summary.textContent = currentResult.changed ? "Cleaned" : "Already clean";
    elements.summary.className = `summary-chip${currentResult.changed ? " changed" : ""}`;
    elements.changes.replaceChildren(...currentResult.changes.map(changeTag));
    setSingleActions(true);
  } catch (error) {
    currentResult = null;
    setSingleActions(false);
    showError(error.message);
  }
}

function renderBulk() {
  bulkResults = cleanMany(elements.bulkInput.value, settings);
  const valid = bulkResults.filter((result) => result.ok);
  const removed = valid.reduce((sum, result) => sum + result.removedCount, 0);
  const invalid = bulkResults.length - valid.length;
  elements.bulkCount.textContent = `${valid.length} ${valid.length === 1 ? "link" : "links"}${invalid ? ` · ${invalid} skipped` : ""}`;
  elements.bulkRemoved.textContent = `${removed} ${removed === 1 ? "parameter" : "parameters"} removed`;
  elements.bulkCopy.disabled = valid.length === 0;
}

function changeTag(text) {
  const tag = document.createElement("span");
  tag.className = "change-tag";
  tag.textContent = text;
  return tag;
}

function setSingleActions(enabled) {
  elements.copy.disabled = !enabled;
  elements.open.disabled = !enabled;
  elements.replace.disabled = !enabled || !activeTab?.id;
}

async function copySingle() {
  if (!currentResult) return;
  await copyText(currentResult.url);
  await remember(currentResult);
  flashButton(elements.copy, "Copied");
  await renderHistoryIfOpen();
}

async function openSingle() {
  if (!currentResult) return;
  await remember(currentResult);
  await chrome.tabs.create({ url: currentResult.url });
}

async function replaceSingle() {
  if (!currentResult || !activeTab?.id) return;
  await remember(currentResult);
  await chrome.tabs.update(activeTab.id, { url: currentResult.url });
  window.close();
}

elements.bulkCopy.addEventListener("click", async () => {
  const valid = bulkResults.filter((result) => result.ok);
  if (!valid.length) return;
  await copyText(valid.map((result) => result.url).join("\n"));
  for (const result of valid) await remember(result);
  flashButton(elements.bulkCopy, `Copied ${valid.length}`);
});

async function pasteInto(field, render) {
  resetError();
  try {
    field.value = await navigator.clipboard.readText();
    render();
    field.focus();
  } catch {
    showError("Chrome couldn't read the clipboard. Paste with Ctrl/Cmd + V.");
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const response = await chrome.runtime.sendMessage({ type: "copy-text", text });
    if (!response?.ok) throw new Error(response?.error || "Couldn't copy the link.");
  }
}

async function remember(result) {
  await addHistory(result.input, result.url, settings);
}

function flashButton(button, label) {
  const span = button.querySelector("span");
  const original = span.textContent;
  button.classList.add("success");
  span.textContent = label;
  setTimeout(() => {
    button.classList.remove("success");
    span.textContent = original;
  }, 1300);
}

function showError(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function resetError() {
  elements.error.hidden = true;
  elements.error.textContent = "";
}

async function toggleHistory() {
  elements.historyPanel.hidden = !elements.historyPanel.hidden;
  if (!elements.historyPanel.hidden) await renderHistory();
}

async function renderHistoryIfOpen() {
  if (!elements.historyPanel.hidden) await renderHistory();
}

async function renderHistory() {
  const history = await getHistory();
  if (!history.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No cleaned links yet.";
    elements.historyList.replaceChildren(empty);
    return;
  }

  const items = history.map((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "history-item";
    const domain = document.createElement("span");
    domain.className = "history-domain";
    try { domain.textContent = new URL(item.output).hostname; }
    catch { domain.textContent = "Cleaned link"; }
    const url = document.createElement("span");
    url.className = "history-url";
    url.textContent = item.output;
    button.append(domain, url);
    button.addEventListener("click", async () => {
      await copyText(item.output);
      domain.textContent = "Copied";
      setTimeout(() => {
        try { domain.textContent = new URL(item.output).hostname; }
        catch { domain.textContent = "Cleaned link"; }
      }, 900);
    });
    return button;
  });
  elements.historyList.replaceChildren(...items);
}
