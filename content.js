(() => {
  "use strict";

  const POLL_MS = 200;
  const MAX_WAIT_MS = 20000;
  let currentVideo = null;
  let timer = null;
  let finished = false;
  let deadline = 0;

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  function respectManualChoice() {
    finished = true;
    stop();
  }

  function attempt() {
    if (Date.now() >= deadline) {
      stop();
      return;
    }
    if (finished || document.fullscreenElement) return;

    const watch = document.querySelector("ytd-watch-flexy");
    const player = watch?.querySelector("#movie_player");
    const button = player?.querySelector(".ytp-size-button");
    // Navigation can briefly leave the previous video's player in the DOM.
    const renderedVideo = watch?.getAttribute("video-id");
    if (renderedVideo && renderedVideo !== currentVideo) return;
    if (!watch || watch.hidden || !player || !button) return;
    if (watch.hasAttribute("theater")) {
      respectManualChoice();
      return;
    }
    if (watch.hasAttribute("fullscreen") || player.classList.contains("ytp-fullscreen")) return;
    if (button.disabled || button.getAttribute("aria-disabled") === "true") return;
    if (button.getClientRects().length === 0) return;

    // Use YouTube's own control. Never toggle again on this video, so a
    // subsequent manual change back to the default view remains intact.
    respectManualChoice();
    button.click();
  }

  function navigate() {
    const url = new URL(location.href);
    const video = url.pathname === "/watch" ? url.searchParams.get("v") : null;
    if (video === currentVideo && (finished || timer !== null)) return;
    stop();
    currentVideo = video;
    finished = false;
    if (!video) return;
    deadline = Date.now() + MAX_WAIT_MS;
    timer = setInterval(attempt, POLL_MS);
    attempt();
  }

  document.addEventListener("yt-navigate-start", stop);
  document.addEventListener("yt-navigate-finish", navigate);
  window.addEventListener("popstate", navigate);
  window.addEventListener("pagehide", stop);
  window.addEventListener("pageshow", navigate);

  document.addEventListener("click", (event) => {
    if (event.isTrusted && event.target instanceof Element &&
        event.target.closest(".ytp-size-button")) respectManualChoice();
  }, true);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const editing = target instanceof Element &&
      target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
    if (event.isTrusted && !editing && !event.ctrlKey && !event.metaKey &&
        !event.altKey && event.key.toLowerCase() === "t") respectManualChoice();
  }, true);

  navigate();
})();
