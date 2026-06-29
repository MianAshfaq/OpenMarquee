const pair = document.querySelector("#pair");
const stage = document.querySelector("#stage");
const form = document.querySelector("#pair-form");
const input = document.querySelector("#code");

const imageAnimations = ["kenburns-in", "kenburns-out", "pan-left", "pan-right", "float-rise", "cinema-sweep"];

let code = localStorage.getItem("openmarquee-code") || "";
let manifest = null;
let manifestKey = "";
let index = 0;
let timer = null;

input.value = code;

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

function transitionScene(nextScene) {
  const currentScene = stage.querySelector(".scene.active");
  if (!currentScene) {
    nextScene.classList.add("active");
    stage.replaceChildren(nextScene);
    return;
  }
  currentScene.classList.remove("active");
  currentScene.classList.add("scene-exit");
  nextScene.classList.add("active");
  stage.appendChild(nextScene);
  window.setTimeout(() => {
    if (currentScene.parentNode === stage) currentScene.remove();
  }, 900);
}

function normalizeYouTubeUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}`;
    }
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v") || url.pathname.split("/").pop();
      if (id) return `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&controls=0&loop=1&playlist=${id}`;
    }
  } catch {}
  return value;
}

function fitMode() {
  return manifest?.fit_mode || "contain";
}

function layoutSize() {
  return { full: 1, "split-2": 2, "split-4": 4 }[manifest?.layout_mode || "full"] || 1;
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
  image.alt = "";
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
  video.muted = true;
  video.playsInline = true;
  video.dataset.fit = fitMode();

  panel.append(backdrop, video);
  return panel;
}

function createIframePanel(item) {
  const panel = document.createElement("div");
  panel.className = "panel panel-iframe";
  const iframe = document.createElement("iframe");
  iframe.className = "panel-media panel-iframe-media";
  iframe.allow = "autoplay; fullscreen";
  iframe.referrerPolicy = "no-referrer-when-downgrade";
  iframe.src = item.kind === "youtube" ? normalizeYouTubeUrl(item.url) : item.url;
  panel.appendChild(iframe);
  return panel;
}

function createAudioPanel(item) {
  const panel = document.createElement("div");
  panel.className = "panel panel-audio";
  panel.innerHTML = `
    <div class="audio-mini">
      <strong>${item.name}</strong>
      <span>Audio</span>
      <div class="audio-bars"><span></span><span></span><span></span><span></span><span></span></div>
    </div>
  `;
  const audio = document.createElement("audio");
  audio.src = item.url;
  audio.autoplay = true;
  audio.onended = next;
  audio.onerror = next;
  panel.appendChild(audio);
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
      <strong>${feed.title || item.name}</strong>
      ${(feed.items || []).slice(0, 3).map((entry) => `<span>${entry.title || "Untitled item"}</span>`).join("")}
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

  const sceneDuration = Math.max(...items.map((item) => Number(item.duration || 10)));
  if (!items.some((item) => ["video", "stream", "iptv", "audio"].includes(item.kind))) {
    timer = window.setTimeout(next, Math.max(4, sceneDuration) * 1000);
  }
}

function next() {
  play((index + layoutSize()) % manifest.items.length);
}

if (code) sync(true);
window.setInterval(() => sync(false), 15000);
