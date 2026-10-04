import { cleanUrl, loadSettings } from "./lib/cleaner.js";
import { addHistory } from "./lib/history.js";

const OFFSCREEN_PATH = "offscreen/offscreen.html";
let creatingOffscreenDocument = null;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "copy-clean-link",
      title: "Copy clean link",
      contexts: ["link"],
    });
    chrome.contextMenus.create({
      id: "copy-clean-page",
      title: "Copy clean page URL",
      contexts: ["page"],
    });
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!["copy-clean-link", "copy-clean-page"].includes(info.menuItemId)) return;
  const input = info.menuItemId === "copy-clean-link" ? info.linkUrl : info.pageUrl;
  if (!input) return showBadge(tab?.id, "!", "#ef4444");
  await cleanCopyAndRemember(input, tab?.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "clean-and-copy") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) await cleanCopyAndRemember(tab.url, tab.id);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "copy-text") return false;
  copyText(message.text)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function cleanCopyAndRemember(input, tabId) {
  try {
    const settings = await loadSettings();
    const result = cleanUrl(input, settings);
    await copyText(result.url);
    await addHistory(result.input, result.url, settings);
    showBadge(tabId, "✓", "#16a34a");
  } catch {
    showBadge(tabId, "!", "#ef4444");
  }
}

async function hasOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_PATH);
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [offscreenUrl],
    });
    return contexts.length > 0;
  }
  const matchedClients = await self.clients.matchAll();
  return matchedClients.some((client) => client.url === offscreenUrl);
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = chrome.offscreen.createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["CLIPBOARD"],
      justification: "Copy a cleaned URL after a context-menu or keyboard-shortcut action.",
    }).finally(() => {
      creatingOffscreenDocument = null;
    });
  }
  await creatingOffscreenDocument;
}

async function copyText(text) {
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "write-clipboard",
    text,
  });
  if (!response?.ok) throw new Error(response?.error || "Couldn't copy the link.");
}

function showBadge(tabId, text, color) {
  if (!tabId) return;
  chrome.action.setBadgeBackgroundColor({ tabId, color });
  chrome.action.setBadgeText({ tabId, text });
  setTimeout(() => {
    Promise.resolve(chrome.action.setBadgeText({ tabId, text: "" })).catch(() => {});
  }, 1800);
}
