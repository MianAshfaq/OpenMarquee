const pair = document.querySelector("#pair");
const stage = document.querySelector("#stage");
const form = document.querySelector("#pair-form");
const input = document.querySelector("#code");
const fullscreenToggle = document.querySelector("#fullscreen-toggle");
const playerBoot = document.querySelector("#player-boot");
const bootRecoveryTimer = window.setTimeout(() => {
  document.body.classList.remove("player-loading");
  playerBoot.style.display = "none";
  pair.style.display = "grid";
  stage.style.display = "none";
}, 10000);

function readStorage(storageName, key) {
  try {
    const storage = globalThis[storageName];
    return storage?.getItem(key) || "";
  } catch {
    return "";
  }
}

function writeStorage(storageName, key, value) {
  try {
    const storage = globalThis[storageName];
    storage?.setItem(key, value);
  } catch {}
}

function removeStorage(storageName, key) {
  try {
    const storage = globalThis[storageName];
    storage?.removeItem(key);
  } catch {}
}

function createInstanceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    return [...values].map((value) => value.toString(16).padStart(8, "0")).join("-");
  }
  return `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function finishPlayerBoot(showPairing = false) {
  window.clearTimeout(bootRecoveryTimer);
  document.body.classList.remove("player-loading");
  playerBoot.style.display = "none";
  pair.style.display = showPairing ? "grid" : "none";
  stage.style.display = showPairing ? "none" : "block";
}

const imageAnimations = ["kenburns-in", "kenburns-out", "pan-left", "pan-right", "float-rise", "cinema-sweep"];
const transitionEffects = ["fade", "slide-left", "slide-right", "slide-up", "slide-down", "zoom-in", "zoom-out", "push", "wipe", "dissolve", "flip", "rotate", "cube", "blur", "crossfade", "split", "circle", "curtain"];
const params = new URLSearchParams(window.location.search);
const textThemes = {
  midnight: { background: "linear-gradient(135deg,#09110d 0%,#13261f 100%)", foreground: "#ffffff" },
  emerald: { background: "linear-gradient(135deg,#0d2f23 0%,#1f6b4f 100%)", foreground: "#efffe8" },
  sunset: { background: "linear-gradient(135deg,#4a1f1b 0%,#c86d3a 100%)", foreground: "#fff7ef" },
  royal: { background: "linear-gradient(135deg,#1d2448 0%,#4062c9 100%)", foreground: "#f6f8ff" },
  mono: { background: "linear-gradient(135deg,#111111 0%,#444444 100%)", foreground: "#fafafa" },
  aurora: { background: "linear-gradient(140deg,#06161c 0%,#12474d 46%,#5b46c8 100%)", foreground: "#f7fffe" },
  velvet: { background: "linear-gradient(140deg,#240c18 0%,#6a2141 55%,#cf6938 100%)", foreground: "#fff7f2" },
  sunrise: { background: "linear-gradient(135deg,#2b1725 0%,#c95b48 52%,#ffb347 100%)", foreground: "#fffdf7" },
};
const textFontStacks = {
  clean: '"Segoe UI", Arial, sans-serif',
  display: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
  editorial: 'Georgia, "Times New Roman", serif',
  condensed: '"Arial Narrow", "Roboto Condensed", Arial, sans-serif',
  rounded: '"Trebuchet MS", "Segoe UI", Arial, sans-serif',
  mono: '"Cascadia Mono", Consolas, monospace',
  "arabic-ui": '"Segoe UI", Tahoma, Arial, sans-serif',
  "urdu-nastaliq": '"Noto Nastaliq Urdu", "Segoe UI", Tahoma, serif',
};

let code = (params.get("code") || readStorage("localStorage", "openmarquee-code") || "").trim().toUpperCase();
let manifest = null;
let manifestKey = "";
let index = 0;
let timer = null;
let controlTimer = null;
let liveSocket = null;
let livePeer = null;
let liveSessionId = "";
let liveActive = false;
let liveReconnectTimer = null;
let livePlaybackWatchdog = null;
let liveLastVideoTime = -1;
const instanceId = readStorage("sessionStorage", "openmarquee-instance") || createInstanceId();
writeStorage("sessionStorage", "openmarquee-instance", instanceId);

input.value = code;
if (code) writeStorage("localStorage", "openmarquee-code", code);

form.onsubmit = (event) => {
  event.preventDefault();
  code = input.value.trim().toUpperCase();
  if (code.length !== 6) return;
  writeStorage("localStorage", "openmarquee-code", code);
  if (liveSocket) {
    const previousSocket = liveSocket;
    liveSocket = null;
    previousSocket.close();
  }
  connectLiveSocket();
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
    const response = await fetch(`/api/player/${code}?instance=${encodeURIComponent(instanceId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error();
    const nextManifest = await response.json();
    const nextKey = buildManifestKey(nextManifest);
    const hadItems = !!manifest?.items?.length;
    const hasItems = !!nextManifest?.items?.length;
    const changed = nextKey !== manifestKey;

    manifest = nextManifest;
    manifestKey = nextKey;

    finishPlayerBoot(false);
    stage.dataset.fitMode = manifest.fit_mode || "contain";

    if (first || !stage.children.length || changed || (!hadItems && hasItems)) {
      play(0);
    }
  } catch {
    if (first) {
      removeStorage("localStorage", "openmarquee-code");
      code = "";
      manifest = null;
      manifestKey = "";
      finishPlayerBoot(true);
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

function cleanupScene(scene) {
  if (!scene) return;
  scene.querySelectorAll("[data-timer-id]").forEach((node) => {
    window.clearInterval(Number(node.dataset.timerId));
  });
}

function transitionScene(nextScene) {
  const currentScene = stage.querySelector(".scene.active");
  const effect = currentTransitionEffect();
  applyTransitionClass(nextScene, effect);

  if (!currentScene) {
    stage.querySelectorAll(".scene").forEach((scene) => cleanupScene(scene));
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
    if (currentScene.parentNode === stage) {
      cleanupScene(currentScene);
      currentScene.remove();
    }
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
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=0&controls=1&loop=1&playlist=${videoId}&playsinline=1&rel=0&modestbranding=1&enablejsapi=1&iv_load_policy=3&origin=${origin}`;
  } catch {
    return value;
  }
}

function normalizePowerPointUrl(value, slideIndex = 1) {
  try {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(value)}&wdSlideIndex=${slideIndex}`;
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
  return Math.max(...items.map((item) => {
    const duration = Number(item.duration || 10);
    if (["pdf", "powerpoint"].includes(item.kind)) {
      return duration * Math.max(1, Number(item.metadata?.page_count || 1));
    }
    return duration;
  }));
}

function playbackNeedsTimer(items) {
  return !items.some((item) => ["video", "stream", "iptv", "audio", "countdown"].includes(item.kind));
}

function createIdleScene() {
  const scene = document.createElement("section");
  scene.className = "scene scene-idle";
  scene.innerHTML = `
    <div class="message-shell idle-brand-shell">
      <div class="idle-orbit idle-orbit-one"></div>
      <div class="idle-orbit idle-orbit-two"></div>
      <div class="message-mark idle-mark"><img src="/static/logo.svg" alt="OpenMarquee"></div>
      <div class="message">
        <strong>Screen connected</strong>
        <span>Assign a playlist from the OpenMarquee dashboard.</span>
        <small>Animated standby mode keeps the screen polished until media is published.</small>
      </div>
    </div>
  `;
  return scene;
}

function attemptPlay(mediaElement) {
  const promise = mediaElement.play?.();
  if (promise && typeof promise.catch === "function") promise.catch(() => {});
}

function attemptVideoPlayback(video) {
  const promise = video.play();
  if (!promise?.catch) return;
  promise.catch(() => {
    video.muted = true;
    video.play().catch(() => {});
  });
}

function liveSocketUrl() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${location.host}/ws/live/player?code=${encodeURIComponent(code)}&instance=${encodeURIComponent(instanceId)}`;
}

function sendPlayerSignal(message) {
  if (liveSocket?.readyState === WebSocket.OPEN) liveSocket.send(JSON.stringify(message));
}

function stopLivePlayback() {
  liveActive = false;
  liveSessionId = "";
  window.clearInterval(livePlaybackWatchdog);
  livePlaybackWatchdog = null;
  liveLastVideoTime = -1;
  livePeer?.close();
  livePeer = null;
  sync(true);
}

function showLiveStream(stream) {
  clearTimeout(timer);
  liveActive = true;
  let scene = stage.querySelector(".scene-live");
  if (!scene) {
    scene = document.createElement("section");
    scene.className = "scene scene-single scene-live active";
    scene.innerHTML = `
      <video class="live-stream-video" autoplay muted playsinline></video>
      <audio class="live-stream-audio" autoplay></audio>
      <div class="live-playback-notice" hidden></div>
    `;
    stage.querySelectorAll(".scene").forEach((oldScene) => cleanupScene(oldScene));
    stage.replaceChildren(scene);
  }

  const video = scene.querySelector(".live-stream-video");
  const audio = scene.querySelector(".live-stream-audio");
  const notice = scene.querySelector(".live-playback-notice");
  video.muted = true;
  video.playsInline = true;
  video.disablePictureInPicture = true;
  if (video.srcObject !== stream) video.srcObject = stream;
  if (audio.srcObject !== stream) audio.srcObject = stream;

  const resumeVideo = () => {
    const playPromise = video.play();
    if (playPromise?.catch) playPromise.catch(() => {});
  };
  const resumeAudio = () => {
    if (!stream.getAudioTracks().length) return;
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {
        notice.hidden = false;
        notice.dataset.noticeType = "audio";
        notice.textContent = "Live picture is playing. Press any key or click once to enable sound.";
        const unlock = () => {
          audio.play().then(() => {
            if (notice.dataset.noticeType === "audio") notice.hidden = true;
          }).catch(() => {});
        };
        document.addEventListener("pointerdown", unlock, { once: true });
        document.addEventListener("keydown", unlock, { once: true });
      });
    }
  };
  video.onloadedmetadata = resumeVideo;
  stream.getVideoTracks().forEach((track) => {
    track.onmute = () => {
      notice.hidden = false;
      notice.dataset.noticeType = "source";
      notice.textContent = "The shared source is temporarily paused. Keep the shared window visible or share the entire display.";
    };
    track.onunmute = () => {
      if (notice.dataset.noticeType === "source") notice.hidden = true;
      resumeVideo();
    };
  });
  resumeVideo();
  resumeAudio();

  window.clearInterval(livePlaybackWatchdog);
  livePlaybackWatchdog = window.setInterval(() => {
    if (!liveActive || !stream.active) return;
    const currentTime = Number(video.currentTime || 0);
    if (video.paused || (currentTime === liveLastVideoTime && stream.getVideoTracks().some((track) => track.readyState === "live" && !track.muted))) {
      resumeVideo();
    }
    liveLastVideoTime = currentTime;
  }, 3000);
}

async function receiveLiveOffer(message) {
  livePeer?.close();
  const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  peer.pendingCandidates = [];
  peer.liveStream = new MediaStream();
  livePeer = peer;
  peer.onicecandidate = (event) => {
    if (event.candidate) sendPlayerSignal({ type: "ice", candidate: event.candidate });
  };
  peer.ontrack = (event) => {
    const incomingTracks = event.streams[0]?.getTracks?.() || [event.track];
    incomingTracks.forEach((track) => {
      if (!peer.liveStream.getTracks().some((existing) => existing.id === track.id)) peer.liveStream.addTrack(track);
    });
    showLiveStream(peer.liveStream);
  };
  peer.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(peer.connectionState) && livePeer === peer && liveActive) stopLivePlayback();
  };
  await peer.setRemoteDescription(message.description);
  for (const candidate of peer.pendingCandidates.splice(0)) await peer.addIceCandidate(candidate).catch(() => {});
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  sendPlayerSignal({ type: "answer", description: peer.localDescription });
}

function connectLiveSocket() {
  window.clearTimeout(liveReconnectTimer);
  if (!code || liveSocket?.readyState === WebSocket.OPEN || liveSocket?.readyState === WebSocket.CONNECTING) return;
  const socket = new WebSocket(liveSocketUrl());
  liveSocket = socket;
  socket.onmessage = async (event) => {
    const message = JSON.parse(event.data);
    try {
      if (message.type === "live-start") {
        liveSessionId = message.session_id;
      } else if (message.type === "offer" && message.session_id === liveSessionId) {
        await receiveLiveOffer(message);
      } else if (message.type === "ice" && message.session_id === liveSessionId && livePeer && message.candidate) {
        if (livePeer.remoteDescription) await livePeer.addIceCandidate(message.candidate).catch(() => {});
        else livePeer.pendingCandidates.push(message.candidate);
      } else if (message.type === "live-stop") {
        stopLivePlayback();
      } else if (message.type === "manifest-refresh" && !liveActive) {
        await sync(true);
      }
    } catch (error) {
      sendPlayerSignal({ type: "player-error", detail: String(error?.message || error) });
    }
  };
  socket.onclose = () => {
    if (liveSocket === socket) liveSocket = null;
    if (liveActive) stopLivePlayback();
    liveReconnectTimer = window.setTimeout(connectLiveSocket, 3000);
  };
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
  attemptVideoPlayback(video);
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
  if (item.kind === "youtube") {
    const note = document.createElement("div");
    note.className = "youtube-note";
    note.textContent = "If the video owner blocks embedding, OpenMarquee will skip to the next item automatically.";
    panel.appendChild(note);
  }
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

function createDocumentPanel(item) {
  const panel = document.createElement("div");
  panel.className = item.kind === "powerpoint" ? "panel panel-youtube" : "panel panel-iframe";
  const iframe = document.createElement("iframe");
  iframe.className = "panel-media panel-iframe-media";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.loading = "eager";
  iframe.title = item.name || "Document";
  const metadata = item.metadata || {};
  const pageCount = Math.max(1, Number(metadata.page_count || 1));
  const intervalMs = Math.max(2, Number(metadata.slide_interval || item.duration || 10)) * 1000;
  let pageIndex = 1;
  const setSrc = () => {
    iframe.src = item.kind === "powerpoint"
      ? normalizePowerPointUrl(item.url, pageIndex)
      : `${item.url}#page=${pageIndex}&view=FitH`;
  };
  setSrc();
  panel.appendChild(iframe);
  if (pageCount > 1) {
    const timerId = window.setInterval(() => {
      pageIndex = pageIndex >= pageCount ? 1 : pageIndex + 1;
      setSrc();
    }, intervalMs);
    panel.dataset.timerId = String(timerId);
  }
  return panel;
}

function countdownParts(targetAt) {
  const target = new Date(targetAt).getTime();
  const remainingMs = Math.max(0, target - Date.now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { remainingMs, days, hours, minutes, seconds };
}

function createCountdownPanel(item) {
  const metadata = item.metadata || {};
  const theme = textThemes[metadata.theme] || textThemes.royal;
  const panel = document.createElement("div");
  panel.className = `panel panel-text countdown-style-${metadata.style || "flip"}`;
  panel.style.background = metadata.background || theme.background;
  panel.style.color = metadata.foreground || theme.foreground;
  panel.style.setProperty("--accent", metadata.accent || "#7bd6ff");
  panel.innerHTML = `
    <div class="text-stage countdown-stage">
      <div class="text-copy countdown-copy">
        <span class="text-badge">${escapeHtml(metadata.badge || "Live countdown")}</span>
        <strong>${escapeHtml(item.name || "Countdown")}</strong>
        <h2>${escapeHtml(metadata.message || "Starting soon")}</h2>
        <div class="countdown-grid">
          <div class="countdown-cell"><em data-countdown-days>00</em><span>Days</span></div>
          <div class="countdown-cell"><em data-countdown-hours>00</em><span>Hours</span></div>
          <div class="countdown-cell"><em data-countdown-minutes>00</em><span>Minutes</span></div>
          <div class="countdown-cell"><em data-countdown-seconds>00</em><span>Seconds</span></div>
        </div>
        <p data-countdown-status>${escapeHtml(metadata.target_at || "")}</p>
      </div>
    </div>
  `;
  const days = panel.querySelector("[data-countdown-days]");
  const hours = panel.querySelector("[data-countdown-hours]");
  const minutes = panel.querySelector("[data-countdown-minutes]");
  const seconds = panel.querySelector("[data-countdown-seconds]");
  const status = panel.querySelector("[data-countdown-status]");
  const tick = () => {
    const parts = countdownParts(metadata.target_at);
    days.textContent = String(parts.days).padStart(2, "0");
    hours.textContent = String(parts.hours).padStart(2, "0");
    minutes.textContent = String(parts.minutes).padStart(2, "0");
    seconds.textContent = String(parts.seconds).padStart(2, "0");
    if (parts.remainingMs <= 0) {
      status.textContent = metadata.complete_message || "Starting now";
      window.clearInterval(intervalId);
      window.setTimeout(() => next(), 1200);
    }
  };
  const intervalId = window.setInterval(tick, 1000);
  tick();
  panel.dataset.timerId = String(intervalId);
  return panel;
}

async function createPanel(item, visualIndex, splitMode) {
  if (item.kind === "image") return createImagePanel(item, visualIndex, splitMode);
  if (item.kind === "video" || item.kind === "stream" || item.kind === "iptv") return createVideoPanel(item);
  if (item.kind === "audio") return createAudioPanel(item);
  if (item.kind === "rss") return createRssPanel(item);
  if (item.kind === "pdf" || item.kind === "powerpoint") return createDocumentPanel(item);
  if (item.kind === "text") return createTextPanel(item);
  if (item.kind === "countdown") return createCountdownPanel(item);
  return createIframePanel(item);
}

function createTextPanel(item) {
  const metadata = item.metadata || {};
  const theme = textThemes[metadata.theme] || textThemes.midnight;
  const panel = document.createElement("div");
  panel.className = `panel panel-text text-animation-${metadata.animation || "fade"}`;
  panel.style.background = metadata.background || theme.background;
  panel.style.color = metadata.foreground || theme.foreground;
  panel.style.setProperty("--accent", metadata.accent || "#ffe082");
  panel.style.setProperty("--headline-scale", `${Number(metadata.font_scale || 100) / 100}`);
  panel.style.setProperty("--text-font", textFontStacks[metadata.font_family] || textFontStacks.clean);
  panel.dataset.textCase = metadata.text_case || "none";
  panel.dir = "auto";
  const badge = metadata.badge ? `<span class="text-badge">${escapeHtml(metadata.badge)}</span>` : "";
  const body = metadata.body ? `<p>${escapeHtml(metadata.body)}</p>` : "";
  panel.innerHTML = `
    <div class="text-stage text-align-${metadata.align || "center"}">
      <div class="text-copy">
        ${badge}
        <strong>${escapeHtml(item.name || "Text slide")}</strong>
        <h2>${escapeHtml(metadata.text || "")}</h2>
        ${body}
      </div>
    </div>
  `;
  return panel;
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
  if (liveActive) return;
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
if (code) {
  connectLiveSocket();
  sync(true);
}
else {
  finishPlayerBoot(true);
}
window.setInterval(() => sync(false), 15000);
