const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");
const source = readFileSync(`${__dirname}/../content.js`, "utf8");

function setup({ path = "/watch?v=first", theater = false, ready = true, fullscreen = false } = {}) {
  const listeners = new Map();
  const timers = new Map();
  let sequence = 0;
  let now = 0;
  let clicks = 0;
  class Element {
    closest(selector) { return selector === ".ytp-size-button" ? this : null; }
  }
  const button = new Element();
  Object.assign(button, {
    disabled: false,
    getAttribute: () => null,
    getClientRects: () => ready ? [1] : [],
    click: () => { clicks++; theater = true; },
  });
  const player = { querySelector: () => button, classList: { contains: () => false } };
  const watch = {
    hidden: false,
    querySelector: () => ready ? player : null,
    getAttribute: () => null,
    hasAttribute: (name) => name === "theater" && theater,
  };
  const on = (name, fn) => {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  };
  const location = { href: `https://www.youtube.com${path}` };
  const document = { querySelector: () => watch, fullscreenElement: fullscreen, addEventListener: on };
  vm.runInNewContext(source, {
    document, window: { addEventListener: on }, location, URL, Element,
    Date: { now: () => now },
    setInterval: (fn) => { timers.set(++sequence, fn); return sequence; },
    clearInterval: (id) => timers.delete(id),
  });
  return {
    get clicks() { return clicks; },
    get pending() { return timers.size; },
    tick(ms = 200) { now += ms; for (const fn of [...timers.values()]) fn(); },
    ready() { ready = true; },
    normal() { theater = false; },
    exitFullscreen() { document.fullscreenElement = false; },
    emit(name, event = {}) { for (const fn of listeners.get(name) || []) fn(event); },
    manualClick() { this.emit("click", { isTrusted: true, target: button }); },
    navigate(path) {
      this.emit("yt-navigate-start");
      location.href = `https://www.youtube.com${path}`;
      theater = false;
      this.emit("yt-navigate-finish");
    },
  };
}

test("direct watch URL switches once and respects a later manual change", () => {
  const page = setup();
  assert.equal(page.clicks, 1);
  page.normal();
  page.emit("yt-navigate-finish");
  page.tick();
  assert.equal(page.clicks, 1);
  assert.equal(page.pending, 0);
});

test("existing theater mode is never toggled off", () => {
  const page = setup({ theater: true });
  assert.equal(page.clicks, 0);
  assert.equal(page.pending, 0);
});

test("waits for a delayed player", () => {
  const page = setup({ ready: false });
  assert.equal(page.clicks, 0);
  page.ready();
  page.tick();
  assert.equal(page.clicks, 1);
});

test("homepage and Shorts are ignored; SPA navigation and back are handled", () => {
  const page = setup({ path: "/" });
  assert.equal(page.pending, 0);
  page.navigate("/watch?v=one");
  page.navigate("/watch?v=two");
  assert.equal(page.clicks, 2);
  page.navigate("/shorts/three");
  assert.equal(page.pending, 0);
  assert.equal(page.clicks, 2);
  page.navigate("/watch?v=one");
  assert.equal(page.clicks, 3);
});

test("does not interrupt fullscreen; switches after leaving fullscreen", () => {
  const page = setup({ fullscreen: true });
  page.tick();
  assert.equal(page.clicks, 0);
  page.exitFullscreen();
  page.tick();
  assert.equal(page.clicks, 1);
});

test("manual click or T key while loading cancels automatic switching", () => {
  for (const method of ["click", "key"]) {
    const page = setup({ ready: false });
    if (method === "click") page.manualClick();
    else page.emit("keydown", { isTrusted: true, target: null, key: "t" });
    page.ready();
    page.tick();
    assert.equal(page.clicks, 0);
    assert.equal(page.pending, 0);
    page.navigate("/watch?v=next");
    assert.equal(page.clicks, 1);
  }
});

test("polling is bounded and stopped when leaving the page", () => {
  const page = setup({ ready: false });
  page.tick(20001);
  assert.equal(page.pending, 0);
  page.navigate("/watch?v=next");
  assert.equal(page.pending, 1);
  page.emit("pagehide");
  assert.equal(page.pending, 0);
});

test("manifest references existing scripts and requests no extra permissions", () => {
  const manifest = JSON.parse(readFileSync(`${__dirname}/../manifest.json`, "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.permissions, undefined);
  for (const script of manifest.content_scripts.flatMap((entry) => entry.js)) {
    assert.ok(readFileSync(`${__dirname}/../${script}`, "utf8").length);
  }
});
