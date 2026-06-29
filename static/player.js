const pair = document.querySelector("#pair");
const stage = document.querySelector("#stage");
const form = document.querySelector("#pair-form");
const input = document.querySelector("#code");
const fullscreenToggle = document.querySelector("#fullscreen-toggle");

const imageAnimations = ["kenburns-in", "kenburns-out", "pan-left", "pan-right", "float-rise", "cinema-sweep"];
const transitionEffects = ["fade", "slide-left", "slide-right", "slide-up", "slide-down", "zoom-in", "zoom-out", "push", "wipe", "dissolve", "flip", "rotate", "cube", "blur", "crossfade", "split", "circle", "curtain"];
const params = new URLSearchParams(window.location.search);

let code = (params.get("code") || localStorage.getItem("openmarquee-code") || "").trim().toUpperCase();
let manifest = null;
let manifestKey = "";
let index = 0;
let timer = null;
let controlTimer = null;

input.value = code;
if (code) localStorage.setItem("openmarquee-code", code);

form.onsubmit = (event) => {
  event.preventDefault();
  code = input.value.trim().toUpperCase();
  if (code.length !== 6) return;
  localStorage.setItem("openmarquee-code", code);
  sync(true);
};

function buildManifestKey(nextManifest) {
  const items = nextManifest?.items || [];
  return JSON.stringify({
    screen: nextManifest?.screen?.id || "",
    playlist: nextManifest?.screen?.playlist_id || "",
    layout: nextManifest?.layout_mode || "full",
    fit: nextManifest?.fit_mode || "contain",
    transitions: nextManifest?.transition_modes || [nextManifest?.transition_mode || "fade"],
    items: items.map((item) => ({
      filename: item.filename,
      duration: item.duration,
      kind: item.kind,
      url: item.url,
    })),
  });
}

async function sync(first = false) {
  if (!code) return;
  try {
    const response = await fetch(`/api/player/${code}`, { cache: "no-store" });
    if (!response.ok) throw new Error();
    const nextManifest = await response.json();
    const nextKey = buildManifestKey(nextManifest);
    const hadItems = !!manifest?.items?.length;
    const hasItems = !!nextManifest?.items?.length;
    const changed = nextKey !== manifestKey;

    manifest = nextManifest;
    manifestKey = nextKey;

    pair.style.display = "none";
    stage.style.display = "block";
    stage.dataset.fitMode = manifest.fit_mode || "contain";

    if (first || !stage.children.length || changed || (!hadItems && hasItems)) {
      play(0);
    }
  } catch {
    if (first) {
      localStorage.removeItem("openmarquee-code");
      code = "";
      manifest = null;
      manifestKey = "";
      pair.style.display = "grid";
      stage.style.display = "none";
      input.value = "";
      input.placeholder = "INVALID";
    }
  }
}

function currentTransitionEffect() {
  const modes = Array.isArray(manifest?.transition_modes) && manifest.transition_modes.length
    ? manifest.transition_modes
    : [manifest?.transition_mode || "fade"];
  const selected = modes[index % modes.length] || "fade";
  if (selected === "random") return transitionEffects[(index * 5) % transitionEffects.length];
  return selected;
}

function applyTransitionClass(element, effect) {
  [...element.classList].filter((name) => name.startsWith("transition-")).forEach((name) => element.classList.remove(name));
  element.classList.add(`transition-${effect}`);
}

function transitionScene(nextScene) {
  const currentScene = stage.querySelector(".scene.active");
  const effect = currentTransitionEffect();
  applyTransitionClass(nextScene, effect);

  if (!currentScene) {
    stage.replaceChildren(nextScene);
    requestAnimationFrame(() => nextScene.classList.add("active"));
    return;
  }

  applyTransitionClass(currentScene, effect);
  nextScene.classList.remove("active", "scene-exit");
  stage.appendChild(nextScene);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      currentScene.classList.remove("active");
      currentScene.classList.add("scene-exit");
      nextScene.classList.add("active");
    });
  });
  window.setTimeout(() => {
    if (currentScene.parentNode === stage) currentScene.remove();
  }, 1100);
}

function normalizeYouTubeUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    let videoId = "";
    if (url.hostname.includes("youtu.be")) {
      videoId = url.pathname.replace("/", "");
    } else if (url.pathname.startsWith("/shorts/")) {
      videoId = url.pathname.split("/").filter(Boolean)[1] || "";
    } else if (url.pathname.startsWith("/embed/")) {
      videoId = url.pathname.split("/").filter(Boolean)[1] || "";
    } else if (url.hostname.includes("youtube.com")) {
      videoId = url.searchParams.get("v") || url.pathname.split("/").filter(Boolean).pop() || "";
    }
    if (!videoId) return value;
    const origin = encodeURIComponent(window.location.origin);
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=1&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&iv_load_policy=3&origin=${origin}`;
  } catch {
    return value;
  }
}

function fitMode() {
  return manifest?.fit_mode || "contain";
}

function layoutSize() {
  return { full: 1, "split-2": 2, "split-4": 4 }[manifest?.layout_mode || "full"] || 1;
}

function sceneMediaDuration(items) {
  return Math.max(...items.map((item) => Number(item.duration || 10)));
}

function playbackNeedsTimer(items) {
  return !items.some((item) => ["video", "stream", "iptv", "audio", "youtube"].includes(item.kind));
}

function createIdleScene() {
  const scene = document.createElement("section");
  scene.className = "scene scene-idle";
  scene.innerHTML = `
    <div class="message-shell">
      <div class="message-mark"></div>
      <div class="message">
        <strong>Screen connected</strong>
        <span>Assign a playlist from the OpenMarquee dashboard.</span>
      </div>
    </div>
  `;
  return scene;
}

function attemptPlay(mediaElement) {
  const promise = mediaElement.play?.();
  if (promise && typeof promise.catch === "function") promise.catch(() => {});
}

function createImagePanel(item, animationIndex, splitMode = false) {
  const panel = document.createElement("div");
  panel.className = `panel panel-image ${splitMode ? "panel-split" : ""} ${imageAnimations[animationIndex % imageAnimations.length]}`;

  const backdrop = document.createElement("div");
  backdrop.className = "panel-backdrop";
  backdrop.style.backgroundImage = `url("${item.url}")`;

  const fill = document.createElement("div");
  fill.className = "panel-fill";
  fill.style.backgroundImage = `url("${item.url}")`;

  const image = document.createElement("img");
  image.className = "panel-media panel-image-media";
  image.src = item.url;
  image.alt = item.name || "";
  image.dataset.fit = fitMode();

  panel.append(backdrop, fill, image);
  return panel;
}

function createVideoPanel(item) {
  const panel = document.createElement("div");
  panel.className = "panel panel-video";

  const backdrop = document.createElement("video");
  backdrop.className = "panel-backdrop-video";
  backdrop.src = item.url;
  backdrop.autoplay = true;
  backdrop.muted = true;
  backdrop.loop = true;
  backdrop.playsInline = true;

  const video = document.createElement("video");
  video.className = "panel-media panel-video-media";
  video.src = item.url;
  video.autoplay = true;
  video.muted = false;
  video.playsInline = true;
  video.controls = false;
  video.dataset.fit = fitMode();
  video.onended = () => next();
  video.onerror = () => next();

  panel.append(backdrop, video);
  attemptPlay(backdrop);
  attemptPlay(video);
  return panel;
}

function createIframePanel(item) {
  const panel = document.createElement("div");
  panel.className = item.kind === "youtube" ? "panel panel-youtube" : "panel panel-iframe";
  const iframe = document.createElement("iframe");
  iframe.className = `panel-media panel-iframe-media ${item.kind === "youtube" ? "panel-youtube-media" : ""}`;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.loading = "eager";
  iframe.title = item.name || "Embedded media";
  iframe.src = item.kind === "youtube" ? normalizeYouTubeUrl(item.url) : item.url;
  panel.appendChild(iframe);
  return panel;
}

function createAudioPanel(item) {
  const panel = document.createElement("div");
  panel.className = "panel panel-audio";
  panel.innerHTML = `
    <div class="audio-mini">
      <strong>${escapeHtml(item.name || "Audio")}</strong>
      <span>Audio playback</span>
      <div class="audio-bars"><span></span><span></span><span></span><span></span><span></span></div>
    </div>
  `;
  const audio = document.createElement("audio");
  audio.src = item.url;
  audio.autoplay = true;
  audio.onended = () => next();
  audio.onerror = () => next();
  panel.appendChild(audio);
  attemptPlay(audio);
  return panel;
}

async function createRssPanel(item) {
  const response = await fetch(`/api/rss?url=${encodeURIComponent(item.url)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("RSS");
  const feed = await response.json();
  const panel = document.createElement("div");
  panel.className = "panel panel-rss";
  panel.innerHTML = `
    <div class="rss-mini">
      <p>LIVE FEED</p>
      <strong>${escapeHtml(feed.title || item.name || "RSS Feed")}</strong>
      ${(feed.items || []).slice(0, 3).map((entry) => `<span>${escapeHtml(entry.title || "Untitled item")}</span>`).join("")}
    </div>
  `;
  return panel;
}

async function createPanel(item, visualIndex, splitMode) {
  if (item.kind === "image") return createImagePanel(item, visualIndex, splitMode);
  if (item.kind === "video" || item.kind === "stream" || item.kind === "iptv") return createVideoPanel(item);
  if (item.kind === "audio") return createAudioPanel(item);
  if (item.kind === "rss") return createRssPanel(item);
  return createIframePanel(item);
}

async function createFullScene(item, visualIndex) {
  const scene = document.createElement("section");
  scene.className = "scene scene-single";
  scene.appendChild(await createPanel(item, visualIndex, false));
  return scene;
}

async function createSplitScene(items, visualIndex) {
  const scene = document.createElement("section");
  const layout = manifest?.layout_mode || "split-2";
  scene.className = `scene scene-grid ${layout}`;
  const grid = document.createElement("div");
  grid.className = `grid-layout ${layout}`;
  for (let offset = 0; offset < items.length; offset += 1) {
    const panel = await createPanel(items[offset], visualIndex + offset, true);
    grid.appendChild(panel);
  }
  scene.appendChild(grid);
  return scene;
}

async function play(sceneIndex) {
  clearTimeout(timer);
  index = sceneIndex;

  if (!manifest?.items?.length) {
    transitionScene(createIdleScene());
    timer = window.setTimeout(() => sync(false), 8000);
    return;
  }

  const slotCount = layoutSize();
  const items = [];
  for (let offset = 0; offset < slotCount; offset += 1) {
    const item = manifest.items[(index + offset) % manifest.items.length];
    if (item) items.push(item);
  }

  let scene;
  try {
    scene = slotCount === 1 ? await createFullScene(items[0], index) : await createSplitScene(items, index);
  } catch {
    scene = createIdleScene();
  }

  transitionScene(scene);

  if (playbackNeedsTimer(items)) {
    timer = window.setTimeout(next, Math.max(4, sceneMediaDuration(items)) * 1000);
  }
}

function next() {
  if (!manifest?.items?.length) return;
  play((index + layoutSize()) % manifest.items.length);
}

async function requestFullscreenMode() {
  if (document.fullscreenElement) return;
  try {
    await document.documentElement.requestFullscreen();
  } catch {}
}

function hideFullscreenControl() {
  fullscreenToggle.classList.add("hidden");
}

function showFullscreenControl() {
  fullscreenToggle.classList.remove("hidden");
  clearTimeout(controlTimer);
  if (document.fullscreenElement) {
    controlTimer = window.setTimeout(hideFullscreenControl, 1800);
  }
}

fullscreenToggle.onclick = async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen().catch(() => {});
    hideFullscreenControl();
    return;
  }
  await requestFullscreenMode();
  showFullscreenControl();
};

stage.ondblclick = () => requestFullscreenMode();
document.addEventListener("mousemove", showFullscreenControl);
document.addEventListener("touchstart", showFullscreenControl, { passive: true });
document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "f") requestFullscreenMode();
  if (event.key === "Escape") {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    hideFullscreenControl();
  } else {
    showFullscreenControl();
  }
});
document.addEventListener("fullscreenchange", () => {
  fullscreenToggle.innerHTML = document.fullscreenElement
    ? '<i class="fa-solid fa-compress"></i><span>Exit fullscreen</span>'
    : '<i class="fa-solid fa-expand"></i><span>Fullscreen</span>';
  if (document.fullscreenElement) showFullscreenControl();
  else hideFullscreenControl();
});

function escapeHtml(value) {
  const el = document.createElement("div");
  el.textContent = value ?? "";
  return el.innerHTML;
}

showFullscreenControl();
if (code) sync(true);
window.setInterval(() => sync(false), 15000);
