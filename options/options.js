import { DEFAULT_SETTINGS } from "../lib/cleaner.js";
import { clearHistory } from "../lib/history.js";

const booleanKeys = [
  "fixBluesky", "fixTwitter", "shortenYouTube", "convertYouTubeShorts",
  "convertYouTubeMusic", "preserveHash", "historyEnabled", "strictMode",
];
const form = document.querySelector("#settingsForm");
const status = document.querySelector("#saveStatus");
let saveTimer;

init();

async function init() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  render(settings);
  form.addEventListener("input", scheduleSave);
  document.querySelector("#resetButton").addEventListener("click", resetSettings);
  document.querySelector("#clearHistory").addEventListener("click", async (event) => {
    await clearHistory();
    const button = event.currentTarget;
    button.textContent = "Recent links cleared";
    setTimeout(() => { button.textContent = "Clear recent links"; }, 1300);
  });
}

function render(settings) {
  for (const key of booleanKeys) document.querySelector(`#${key}`).checked = Boolean(settings[key]);
  document.querySelector("#amazonId").value = settings.amazonId || "";
  document.querySelector("#customKeepParams").value = (settings.customKeepParams || []).join(", ");
}

function scheduleSave() {
  clearTimeout(saveTimer);
  status.textContent = "Saving…";
  status.classList.remove("saved");
  saveTimer = setTimeout(saveSettings, 250);
}

async function saveSettings() {
  const settings = {};
  for (const key of booleanKeys) settings[key] = document.querySelector(`#${key}`).checked;
  settings.amazonId = document.querySelector("#amazonId").value.trim();
  settings.customKeepParams = document.querySelector("#customKeepParams").value
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  await chrome.storage.sync.set(settings);
  status.textContent = "Saved";
  status.classList.add("saved");
  setTimeout(() => {
    status.textContent = "Changes save automatically";
    status.classList.remove("saved");
  }, 1400);
}

async function resetSettings() {
  await chrome.storage.sync.set(DEFAULT_SETTINGS);
  render(DEFAULT_SETTINGS);
  status.textContent = "Defaults restored";
  status.classList.add("saved");
}
