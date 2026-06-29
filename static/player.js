const pair = document.querySelector("#pair");
const stage = document.querySelector("#stage");
const form = document.querySelector("#pair-form");
const input = document.querySelector("#code");

const imageAnimations = [
  "kenburns-in",
  "kenburns-out",
  "pan-left",
  "pan-right",
  "float-rise",
  "cinema-sweep",
];

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
  }, 1100);
}

function normalizeYouTubeUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    if (url.hostname.includes("youtu.be")) {
      return `https://www.youtube.com/embed/${url.pathname.replace("/", "")}?autoplay=1&mute=1&controls=0&loop=1&playlist=${url.pathname.replace("/", "")}`;
    }
    if (url.hostname.includes("youtube.com")) {
      const videoId = url.searchParams.get("v") || url.pathname.split("/").pop();
      if (videoId) return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}`;
    }
  } catch {}
  return value;
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

function createVideoScene(item) {
  const scene = document.createElement("section");
  scene.className = "scene scene-video";

  const backdrop = document.createElement("video");
  backdrop.className = "scene-backdrop";
  backdrop.src = item.url;
  backdrop.autoplay = true;
  backdrop.muted = true;
  backdrop.loop = true;
  backdrop.playsInline = true;

  const video = document.createElement("video");
  video.className = "scene-media scene-video-media";
  video.src = item.url;
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.onended = next;
  video.onerror = next;

  const glow = document.createElement("div");
  glow.className = "scene-glow";

  scene.append(backdrop, glow, video);
  return scene;
}

function createIframeScene(item) {
  const scene = document.createElement("section");
  scene.className = "scene scene-frame-source";

  const backdrop = document.createElement("div");
  backdrop.className = "scene-backdrop source-backdrop";

  const glow = document.createElement("div");
  glow.className = "scene-glow";

  const frame = document.createElement("div");
  frame.className = "scene-frame source-frame";

  const iframe = document.createElement("iframe");
  iframe.className = "scene-media scene-iframe";
  iframe.referrerPolicy = "no-referrer-when-downgrade";
  iframe.allow = "autoplay; fullscreen";
  iframe.src = item.kind === "youtube" ? normalizeYouTubeUrl(item.url) : item.url;

  frame.appendChild(iframe);
  scene.append(backdrop, glow, frame);
  return scene;
}

function createAudioScene(item) {
  const scene = document.createElement("section");
  scene.className = "scene scene-audio";

  const backdrop = document.createElement("div");
  backdrop.className = "scene-backdrop source-backdrop";

  const glow = document.createElement("div");
  glow.className = "scene-glow";

  const shell = document.createElement("div");
  shell.className = "audio-shell";
  shell.innerHTML = `
    <div class="audio-mark"></div>
    <div class="audio-copy">
      <strong>${item.name}</strong>
      <span>Audio playback</span>
    </div>
    <div class="audio-bars">
      <span></span><span></span><span></span><span></span><span></span>
    </div>
  `;

  const audio = document.createElement("audio");
  audio.className = "audio-player";
  audio.src = item.url;
  audio.autoplay = true;
  audio.onended = next;
  audio.onerror = next;
  shell.appendChild(audio);
  scene.append(backdrop, glow, shell);
  return scene;
}

async function createRssScene(item) {
  const response = await fetch(`/api/rss?url=${encodeURIComponent(item.url)}`, { cache: "no-store" });
  if (!response.ok) throw new Error("RSS");
  const feed = await response.json();
  const rows = (feed.items || []).slice(0, 6).map((entry) => `
    <article class="rss-row">
      <strong>${entry.title || "Untitled item"}</strong>
      <span>${entry.summary || entry.link || ""}</span>
    </article>
  `).join("");

  const scene = document.createElement("section");
  scene.className = "scene scene-rss";
  scene.innerHTML = `
    <div class="scene-backdrop source-backdrop"></div>
    <div class="scene-glow"></div>
    <div class="rss-shell">
      <p>LIVE FEED</p>
      <h1>${feed.title || item.name}</h1>
      <div class="rss-list">${rows || '<article class="rss-row"><strong>No feed items</strong><span>The feed responded without entries.</span></article>'}</div>
    </div>
  `;
  return scene;
}

function createImageScene(item, sceneIndex) {
  const scene = document.createElement("section");
  const animationName = imageAnimations[sceneIndex % imageAnimations.length];
  scene.className = `scene scene-image ${animationName}`;

  const backdrop = document.createElement("div");
  backdrop.className = "scene-backdrop image-backdrop";
  backdrop.style.backgroundImage = `url("${item.url}")`;

  const glow = document.createElement("div");
  glow.className = "scene-glow";

  const frame = document.createElement("div");
  frame.className = "scene-frame";

  const fill = document.createElement("div");
  fill.className = "scene-fill";
  fill.style.backgroundImage = `url("${item.url}")`;

  const image = document.createElement("img");
  image.className = "scene-media scene-image-media";
  image.src = item.url;
  image.alt = "";

  frame.append(fill, image);
  scene.append(backdrop, glow, frame);
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

  const item = manifest.items[index % manifest.items.length];
  let scene;
  if (item.kind === "video" || item.kind === "stream" || item.kind === "iptv") {
    scene = createVideoScene(item);
  } else if (item.kind === "image") {
    scene = createImageScene(item, index);
  } else if (item.kind === "audio") {
    scene = createAudioScene(item);
  } else if (item.kind === "rss") {
    try {
      scene = await createRssScene(item);
    } catch {
      scene = createIdleScene();
    }
  } else {
    scene = createIframeScene(item);
  }

  transitionScene(scene);

  if (!["video", "stream", "iptv", "audio"].includes(item.kind)) {
    timer = window.setTimeout(next, Math.max(4, Number(item.duration || 10)) * 1000);
  }
}

function next() {
  play((index + 1) % manifest.items.length);
}

if (code) sync(true);
window.setInterval(() => sync(false), 15000);
