import test from "node:test";
import assert from "node:assert/strict";
import { cleanMany, cleanUrl } from "../lib/cleaner.js";

test("removes generic tracking parameters and keeps search queries", () => {
  const result = cleanUrl("https://example.com/search?q=privacy&utm_source=email&fbclid=123");
  assert.equal(result.url, "https://example.com/search?q=privacy");
  assert.equal(result.removedCount, 2);
});

test("keeps YouTube video data and drops share tracking", () => {
  const result = cleanUrl("https://www.youtube.com/watch?v=wAUK9hVgmNI&si=secret&t=20&feature=shared");
  assert.equal(result.url, "https://www.youtube.com/watch?v=wAUK9hVgmNI&t=20");
});

test("can shorten YouTube and retain timestamp", () => {
  const result = cleanUrl("https://youtube.com/watch?v=abc123&t=42&si=tracking", { shortenYouTube: true });
  assert.equal(result.url, "https://youtu.be/abc123?t=42");
});

test("unwraps known Facebook redirects", () => {
  const target = encodeURIComponent("https://example.com/article?utm_campaign=social");
  const result = cleanUrl(`https://l.facebook.com/l.php?u=${target}&h=secret`);
  assert.equal(result.url, "https://example.com/article");
  assert.ok(result.changes.includes("Unwrapped redirect"));
});

test("shortens Amazon product URLs", () => {
  const result = cleanUrl("https://www.amazon.co.uk/Very-Long-Product-Name/dp/B0ABC12345/ref=something?psc=1&utm_source=x");
  assert.equal(result.url, "https://amazon.co.uk/dp/B0ABC12345");
});

test("preserves anchors by default", () => {
  const result = cleanUrl("https://example.com/docs?utm_source=x#installation");
  assert.equal(result.url, "https://example.com/docs#installation");
});

test("keeps user-defined parameters", () => {
  const result = cleanUrl("https://example.com/view?id=42&utm_source=x", { customKeepParams: ["utm_source"] });
  assert.equal(result.url, "https://example.com/view?id=42&utm_source=x");
});

test("keeps user-defined parameters after a site conversion", () => {
  const result = cleanUrl("https://youtube.com/watch?v=abc123&t=42&lang=fr&si=tracking", {
    shortenYouTube: true,
    customKeepParams: ["lang"],
  });
  assert.equal(result.url, "https://youtu.be/abc123?t=42&lang=fr");
});

test("bulk mode reports invalid lines without losing them", () => {
  const results = cleanMany("https://example.com/?utm_source=x\nnot a link");
  assert.equal(results[0].url, "https://example.com/");
  assert.equal(results[1].ok, false);
  assert.equal(results[1].url, "not a link");
});

test("preserves unfamiliar functional parameters while removing known tracking", () => {
  const input = "https://www.seikoboutique.co.uk/?aws_filter=1&aws_id=1&awscat=Form%3A1+Filter%3AAll&post_type=product&s=145th&type_aws=true&utm_source=chatgpt.com";
  const result = cleanUrl(input);
  assert.equal(
    result.url,
    "https://www.seikoboutique.co.uk/?aws_filter=1&aws_id=1&awscat=Form%3A1+Filter%3AAll&post_type=product&s=145th&type_aws=true",
  );
  assert.deepEqual(result.removedParams, ["utm_source"]);
});

test("strict mode retains the original aggressive behavior", () => {
  const result = cleanUrl("https://example.com/filter?colour=blue&q=watches&utm_source=email", { strictMode: true });
  assert.equal(result.url, "https://example.com/filter?q=watches");
});
