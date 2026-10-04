export const DEFAULT_SETTINGS = Object.freeze({
  fixBluesky: false,
  fixTwitter: false,
  shortenYouTube: false,
  convertYouTubeShorts: false,
  convertYouTubeMusic: false,
  amazonId: "",
  preserveHash: true,
  customKeepParams: [],
  historyEnabled: true,
  strictMode: false,
});

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

const AMAZON_HOSTS = new Set([
  "amazon.com.au", "amazon.com.be", "amazon.com.br", "amazon.ca",
  "amazon.cn", "amazon.eg", "amazon.fr", "amazon.de", "amazon.in",
  "amazon.ie", "amazon.it", "amazon.co.jp", "amazon.com.mx", "amazon.nl",
  "amazon.pl", "amazon.sa", "amazon.sg", "amazon.co.za", "amazon.es",
  "amazon.se", "amazon.com.tr", "amazon.ae", "amazon.co.uk", "amazon.com",
]);

function settingsWithDefaults(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    customKeepParams: Array.isArray(settings.customKeepParams)
      ? settings.customKeepParams
      : DEFAULT_SETTINGS.customKeepParams,
  };
}

function parseUrl(value) {
  if (value instanceof URL) return new URL(value.href);
  if (typeof value !== "string") throw new TypeError("Enter a link to clean.");

  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a link to clean.");

  let candidate = trimmed;
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate) && /^[^\s/]+\.[^\s]+/.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("That doesn't look like a valid link.");
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error("Only http and https links can be cleaned.");
  }
  return parsed;
}

function unwrapKnownRedirect(url) {
  let current = new URL(url.href);
  let wasUnwrapped = false;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const host = current.hostname.toLowerCase();
    let destination = null;

    if (["l.facebook.com", "lm.facebook.com"].includes(host)) {
      destination = current.searchParams.get("u");
    } else if (host === "href.li") {
      destination = current.href.includes("?") ? current.href.slice(current.href.indexOf("?") + 1) : null;
    } else if (host === "www.google.com" && current.pathname === "/url") {
      destination = current.searchParams.get("url") || current.searchParams.get("q");
    } else if (host === "cts.businesswire.com") {
      destination = current.searchParams.get("url");
    }

    if (!destination) break;

    try {
      const next = new URL(decodeURIComponent(destination));
      if (!['http:', 'https:'].includes(next.protocol)) break;
      current = next;
      wasUnwrapped = true;
    } catch {
      try {
        const next = new URL(destination);
        if (!['http:', 'https:'].includes(next.protocol)) break;
        current = next;
        wasUnwrapped = true;
      } catch {
        break;
      }
    }
  }

  return { url: current, wasUnwrapped };
}

function appendAll(target, source, key) {
  if (!key || target.searchParams.has(key)) return;
  for (const value of source.searchParams.getAll(key)) {
    target.searchParams.append(key, value);
  }
}

const TRACKING_PARAMETER_NAMES = new Set([
  "_ga", "_gl", "_hsenc", "_hsmi", "_kx",
  "dclid", "epik", "fbclid", "gad_campaignid", "gad_source", "gbraid",
  "gclid", "gclsrc", "hsctatracking", "irclickid", "li_fat_id",
  "mc_cid", "mc_eid", "mkt_tok", "msclkid", "oly_anon_id", "oly_enc_id",
  "rb_clickid", "s_cid", "sc_cid", "srsltid", "ttclid", "twclid",
  "vero_conv", "vero_id", "wbraid", "wickedid", "yclid", "zanpid",
]);

const TRACKING_PARAMETER_PREFIXES = ["utm_", "hsa_", "mtm_", "pk_"];

function isTrackingParameter(key, source) {
  const normalized = key.toLowerCase();
  if (TRACKING_PARAMETER_NAMES.has(normalized)) return true;
  if (TRACKING_PARAMETER_PREFIXES.some((prefix) => normalized.startsWith(prefix))) return true;

  const host = source.hostname.toLowerCase();
  const bareHost = host.replace(/^www\./, "");
  if (YOUTUBE_HOSTS.has(host) && ["si", "feature"].includes(normalized)) return true;
  if (["twitter.com", "www.twitter.com", "x.com", "www.x.com"].includes(host)
      && source.pathname.includes("/status/") && ["s", "t"].includes(normalized)) return true;
  if (["instagram.com", "www.instagram.com"].includes(host) && ["igsh", "igshid"].includes(normalized)) return true;
  if (["facebook.com", "www.facebook.com", "m.facebook.com"].includes(host) && normalized === "mibextid") return true;
  if (AMAZON_HOSTS.has(bareHost)
      && /\/(?:dp|product|d)\//i.test(source.pathname)
      && ["qid", "ref", "ref_", "sr", "psc", "sprefix", "crid"].includes(normalized)) return true;
  if (bareHost === "tiktok.com" && [
    "_d", "_r", "sec_user_id", "share_app_id", "share_item_id",
    "social_share_type", "timestamp", "user_id",
  ].includes(normalized)) return true;
  return false;
}

function copyInitialParameters(target, source, settings) {
  const customKeep = new Set(settings.customKeepParams.map((key) => String(key).trim()).filter(Boolean));
  for (const [key, value] of source.searchParams) {
    const keep = customKeep.has(key)
      || (settings.strictMode ? key === "q" : !isTrackingParameter(key, source));
    if (keep) target.searchParams.append(key, value);
  }
}

function youtubeVideoId(url) {
  if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null;
  if (url.searchParams.has("v")) return url.searchParams.get("v");
  const match = url.pathname.match(/^\/(?:shorts|embed)\/([^/?#]+)/);
  return match?.[1] || null;
}

function applyYouTubeRules(source, target, settings) {
  const videoId = youtubeVideoId(source);
  const isShort = source.pathname.startsWith("/shorts/");
  const isVideoPage = Boolean(videoId) && (
    source.hostname === "youtu.be" ||
    source.pathname === "/watch" ||
    source.pathname.startsWith("/shorts/") ||
    source.pathname.startsWith("/embed/")
  );

  appendAll(target, source, "v");
  appendAll(target, source, "t");
  appendAll(target, source, "list");
  appendAll(target, source, "index");

  if (isShort && settings.convertYouTubeShorts && videoId) {
    target.href = `https://youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    appendAll(target, source, "t");
    appendAll(target, source, "list");
    appendAll(target, source, "index");
  }

  if (source.hostname === "music.youtube.com" && settings.convertYouTubeMusic) {
    target.hostname = "youtube.com";
  }

  if (isVideoPage && settings.shortenYouTube && videoId) {
    const shortened = new URL(`https://youtu.be/${encodeURIComponent(videoId)}`);
    appendAll(shortened, source, "t");
    appendAll(shortened, source, "list");
    appendAll(shortened, source, "index");
    target.href = shortened.href;
  }
}

function applySiteRules(source, target, settings) {
  const host = source.hostname.toLowerCase();
  const bareHost = host.replace(/^www\./, "");

  if (host === "play.google.com") {
    appendAll(target, source, "id");
  } else if (host === "www.macys.com") {
    appendAll(target, source, "ID");
  } else if (YOUTUBE_HOSTS.has(host)) {
    applyYouTubeRules(source, target, settings);
  } else if (host === "www.facebook.com" && source.pathname.includes("story.php")) {
    appendAll(target, source, "story_fbid");
    appendAll(target, source, "id");
  } else if (AMAZON_HOSTS.has(bareHost)) {
    const productMatch = source.pathname.match(/\/(?:dp|product|d)\/([A-Z0-9]{5,})/i);
    if (productMatch) {
      target.hostname = bareHost;
      target.pathname = `/dp/${productMatch[1]}`;
    }
    if (settings.amazonId.trim()) target.searchParams.set("tag", settings.amazonId.trim());
  } else if (host === "www.lenovo.com") {
    appendAll(target, source, "bundleId");
  } else if (host === "www.bestbuy.com" && source.pathname.includes(".p")) {
    const productMatch = source.pathname.match(/\/(\d+)\.p/);
    if (productMatch) target.pathname = `/site/${productMatch[1]}.p`;
  } else if (host === "www.xiaohongshu.com") {
    appendAll(target, source, "xsec_token");
  } else if (host === "weatherkit.apple.com") {
    for (const key of ["lang", "party", "ids"]) appendAll(target, source, key);
  } else if (host === "www.webtoons.com") {
    appendAll(target, source, "title_no");
    appendAll(target, source, "episode_no");
  } else if (host === "www.walmart.com" && source.pathname.includes("/ip/")) {
    const productMatch = source.pathname.match(/\/ip\/.*\/(\d+)/);
    if (productMatch) target.pathname = `/ip/${productMatch[1]}`;
  } else if (host === "www.reddit.com" && source.pathname.includes("media")) {
    appendAll(target, source, "url");
  }

  if (settings.fixTwitter && ["twitter.com", "www.twitter.com", "x.com", "www.x.com"].includes(host)) {
    target.hostname = "fxtwitter.com";
  }
  if (settings.fixBluesky && host === "bsky.app" && source.pathname.includes("/post/")) {
    target.hostname = "fxbsky.app";
  }
}

function parameterStats(source, target) {
  const remaining = new Map();
  for (const [key, value] of target.searchParams) {
    const fingerprint = `${key}\u0000${value}`;
    remaining.set(fingerprint, (remaining.get(fingerprint) || 0) + 1);
  }

  const removedParams = [];
  for (const [key, value] of source.searchParams) {
    const fingerprint = `${key}\u0000${value}`;
    const count = remaining.get(fingerprint) || 0;
    if (count > 0) remaining.set(fingerprint, count - 1);
    else removedParams.push(key);
  }

  return { removedParams, removedCount: removedParams.length };
}

export function cleanUrl(input, suppliedSettings = {}) {
  const settings = settingsWithDefaults(suppliedSettings);
  const original = parseUrl(input);
  const { url: source, wasUnwrapped } = unwrapKnownRedirect(original);
  const target = new URL(`${source.origin}${source.pathname}`);

  copyInitialParameters(target, source, settings);
  applySiteRules(source, target, settings);
  for (const key of settings.customKeepParams) {
    appendAll(target, source, String(key).trim());
  }
  if (settings.preserveHash) target.hash = source.hash;

  const stats = parameterStats(source, target);
  const changes = [];
  if (wasUnwrapped) changes.push("Unwrapped redirect");
  if (stats.removedCount) {
    const qualifier = settings.strictMode ? "" : "tracking ";
    changes.push(`Removed ${stats.removedCount} ${qualifier}${stats.removedCount === 1 ? "parameter" : "parameters"}`);
  }
  if (source.hostname !== target.hostname) changes.push("Changed domain");
  if (source.pathname !== target.pathname) changes.push("Shortened path");
  if (!settings.preserveHash && source.hash) changes.push("Removed page anchor");
  if (!changes.length) changes.push("Already clean");

  return {
    input: original.href,
    url: target.href,
    changed: original.href !== target.href,
    removedParams: stats.removedParams,
    removedCount: stats.removedCount,
    changes,
  };
}

export function cleanMany(input, settings = {}) {
  const lines = String(input).split(/\r?\n/);
  const results = [];

  for (const line of lines) {
    const value = line.trim();
    if (!value) continue;
    try {
      results.push({ ok: true, source: value, ...cleanUrl(value, settings) });
    } catch (error) {
      results.push({ ok: false, source: value, url: value, error: error.message });
    }
  }

  return results;
}

export async function loadSettings() {
  if (typeof chrome === "undefined" || !chrome.storage?.sync) return { ...DEFAULT_SETTINGS };
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return settingsWithDefaults(stored);
}
