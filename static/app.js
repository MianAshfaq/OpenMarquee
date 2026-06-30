const state = {
  media: [],
  folders: [],
  playlists: [],
  screens: [],
  logs: [],
  reports: {},
  settings: { selected_profiles: [], profiles_configured: false },
  activeFolderId: "all",
  auth: { authenticated: false, username: "", mfa_enabled: false },
};
const selectedScreens = new Set();
const ADMIN_IDLE_MS = 10 * 60 * 1000;
let lastAdminActivity = Date.now();
let lastSessionTouch = Date.now();
let logoutInProgress = false;
const liveShare = {
  selected: new Set(),
  stream: null,
  socket: null,
  sessionId: "",
  peers: new Map(),
  filePresentation: false,
  presentationScreenIds: [],
  active: false,
};
const industryProfiles = [
  ["retail", "Retail"],
  ["hospital", "Hospital"],
  ["office", "Office"],
  ["education", "Education"],
  ["hotel", "Hotel"],
  ["restaurant", "Restaurant"],
  ["government", "Government"],
  ["warehouse", "Warehouse"],
  ["transport", "Transport"],
  ["events", "Events"],
];
const textAnimationOptions = [
  ["fade", "Fade"],
  ["slide-up", "Slide up"],
  ["slide-left", "Slide left"],
  ["zoom", "Zoom"],
  ["ticker", "Ticker"],
  ["pulse", "Pulse"],
  ["glow", "Glow"],
  ["spotlight", "Spotlight"],
  ["bounce", "Bounce"],
  ["flip-in", "Flip in"],
  ["drift", "Drift"],
  ["reveal", "Reveal"],
  ["none", "None"],
];
const textThemeOptions = [
  ["midnight", "Midnight"],
  ["emerald", "Emerald"],
  ["sunset", "Sunset"],
  ["royal", "Royal"],
  ["mono", "Mono"],
  ["aurora", "Aurora"],
  ["velvet", "Velvet"],
  ["sunrise", "Sunrise"],
];
const textFontOptions = [
  ["clean", "Clean Sans"],
  ["display", "Display Bold"],
  ["editorial", "Editorial Serif"],
  ["condensed", "Condensed"],
  ["rounded", "Rounded"],
  ["mono", "Mono"],
  ["arabic-ui", "Arabic UI"],
  ["urdu-nastaliq", "Urdu Nastaliq"],
];
const textPresets = {
  retail: { name: "Retail Spotlight", badge: "Limited offer", text: "Weekend flash sale", body: "Up to 40% off selected collections. Visit today before 9 PM.", animation: "glow", theme: "sunrise", font_family: "display", font_scale: "110", accent: "#ffe082", background: "", foreground: "", align: "center", text_case: "none" },
  corporate: { name: "Corporate Welcome", badge: "Welcome", text: "Innovation starts here", body: "Meeting begins at 10:30 AM in the executive boardroom.", animation: "reveal", theme: "royal", font_family: "clean", font_scale: "100", accent: "#7bd6ff", background: "", foreground: "", align: "left", text_case: "none" },
  event: { name: "Event Countdown", badge: "Live today", text: "Main stage opens in 15 minutes", body: "Please take your seats and keep the aisles clear for the opening sequence.", animation: "spotlight", theme: "aurora", font_family: "display", font_scale: "108", accent: "#c7ff6b", background: "", foreground: "", align: "center", text_case: "uppercase" },
  urgent: { name: "Urgent Notice", badge: "Alert", text: "Temporary access change", body: "Use the south entrance until maintenance is complete on level 2.", animation: "bounce", theme: "velvet", font_family: "condensed", font_scale: "102", accent: "#ff9f6f", background: "", foreground: "", align: "center", text_case: "uppercase" },
};

const transitionOptions = [
  ["none", "No transition"],
  ["fade", "Fade"],
  ["slide-left", "Slide left"],
  ["slide-right", "Slide right"],
  ["slide-up", "Slide up"],
  ["slide-down", "Slide down"],
  ["zoom-in", "Zoom in"],
  ["zoom-out", "Zoom out"],
  ["push", "Push"],
  ["wipe", "Wipe"],
  ["dissolve", "Dissolve"],
  ["flip", "Flip"],
  ["rotate", "Rotate"],
  ["cube", "Cube"],
  ["blur", "Blur"],
  ["crossfade", "Crossfade"],
  ["split", "Split"],
  ["circle", "Circle reveal"],
  ["curtain", "Curtain"],
  ["random", "Random"],
];
const brandOptions = [
  ["unknown", "Unknown"],
  ["samsung", "Samsung"],
  ["lg", "LG"],
  ["sony", "Sony"],
  ["hisense", "Hisense"],
  ["tcl", "TCL"],
  ["philips", "Philips"],
  ["panasonic", "Panasonic"],
  ["sharp", "Sharp"],
  ["vizio", "Vizio"],
  ["android-tv", "Android TV"],
  ["google-tv", "Google TV"],
  ["amazon-fire-tv", "Amazon Fire TV"],
  ["raspberry-pi", "Raspberry Pi"],
  ["windows", "Windows"],
  ["chromeos", "ChromeOS"],
  ["other", "Other"],
];
const runtimeOptions = [
  ["browser", "Web browser"],
  ["android-tv-app", "Android TV app"],
  ["fire-tv-app", "Fire TV app"],
  ["raspberry-pi-kiosk", "Raspberry Pi kiosk"],
  ["samsung-tizen", "Samsung Tizen"],
  ["lg-webos", "LG webOS"],
  ["windows-kiosk", "Windows kiosk"],
  ["chromeos-kiosk", "ChromeOS kiosk"],
];

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

async function api(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    if (response.status === 401) {
      setAuthState({ ...state.auth, authenticated: false });
    }
    let detail = "Request failed";
    try {
      detail = (await response.json()).detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return response.json();
}

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {}
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (copied) return true;
  showModal(`
    <p class="eyebrow">MANUAL COPY</p>
    <h2>Copy this value</h2>
    <div class="field"><input id="manual-copy-value" value="${escapeHtml(value)}" readonly></div>
    <div class="modal-footer">${modalCancelButton("Close")}</div>
  `, async () => {}, (dialog) => {
    const field = dialog.querySelector("#manual-copy-value");
    field.focus();
    field.select();
  });
  return false;
}

function escapeHtml(value) {
  const el = document.createElement("div");
  el.textContent = value ?? "";
  return el.innerHTML;
}

function bytes(value) {
  return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`;
}

function mediaTypeLabel(kind) {
  return {
    image: "Image / GIF",
    video: "Video",
    pdf: "PDF",
    html: "HTML",
    audio: "Audio",
    countdown: "Countdown",
    webpage: "Web page",
    dashboard: "Dashboard URL",
    youtube: "YouTube",
    rss: "RSS feed",
    stream: "Live stream",
    iptv: "IPTV",
    powerpoint: "PowerPoint URL",
    excel: "Excel chart URL",
  }[kind] || kind;
}

function layoutLabel(mode) {
  return { full: "Full screen", "split-2": "Split 2", "split-4": "Split 4" }[mode] || "Full screen";
}

function fitLabel(mode) {
  return { contain: "Show complete", cover: "Fill screen" }[mode] || "Show complete";
}

function transitionLabel(mode) {
  return Object.fromEntries(transitionOptions)[mode] || "Fade";
}

function transitionSummary(playlist) {
  const modes = playlist.transition_modes?.length ? playlist.transition_modes : [playlist.transition_mode || "fade"];
  if (modes.length === 1) return transitionLabel(modes[0]);
  return `${transitionLabel(modes[0])} + ${modes.length - 1} more`;
}

function screenBrandLabel(value) {
  return Object.fromEntries(brandOptions)[value] || "Unknown";
}

function screenRuntimeLabel(value) {
  return Object.fromEntries(runtimeOptions)[value] || "Web browser";
}

function profileLabel(value) {
  return Object.fromEntries(industryProfiles)[value] || "General";
}

function folderLabel(folderId) {
  if (!folderId) return "Unfiled";
  const folder = state.folders.find((item) => item.id === Number(folderId));
  return folder ? folder.name : "Folder";
}

function formatLogTime(value) {
  if (!value) return "";
  return new Date(Number(value) * 1000).toLocaleString();
}

function mediaById(mediaId) {
  return state.media.find((item) => item.id === Number(mediaId));
}

function selectedScreenList() {
  return state.screens.filter((screen) => selectedScreens.has(screen.id));
}

function screenPlaylistName(screen) {
  const playlist = state.playlists.find((item) => item.id === screen.playlist_id);
  return playlist ? playlist.name : "Playback stopped";
}

function playerUrl(screen) {
  const origin = window.location.origin;
  return `${origin}/player?code=${encodeURIComponent(screen.code)}`;
}

function setAuthState(session) {
  state.auth = { ...state.auth, ...session };
  document.body.classList.toggle("authenticated", !!state.auth.authenticated);
  $("#auth-username").value = state.auth.authenticated ? (state.auth.username || "") : "";
  $("#auth-otp-row").style.display = state.auth.mfa_enabled ? "grid" : "none";
  $("#session-user").textContent = state.auth.username || "admin";
  $("#mfa-state").textContent = state.auth.mfa_enabled ? "MFA on" : "MFA off";
  $("#bootstrap-note").textContent = "Sign in with your administrator account.";
}

function markAdminActivity() {
  lastAdminActivity = Date.now();
  if (!state.auth.authenticated || Date.now() - lastSessionTouch < 45000) return;
  lastSessionTouch = Date.now();
  fetch("/api/auth/touch", { method: "POST" }).catch(() => {});
}

async function logoutAdmin(reason = "Signed out") {
  if (logoutInProgress) return;
  logoutInProgress = true;
  try {
    if (liveShare.active) await stopLiveShare(false);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAuthState({ authenticated: false, username: "", mfa_enabled: state.auth.mfa_enabled });
    toast(reason);
  } finally {
    logoutInProgress = false;
  }
}

async function checkSession() {
  const session = await api("/api/auth/session");
  setAuthState(session);
  if (session.authenticated) await refresh();
}

async function refresh(passive = false) {
  if (!state.auth.authenticated) return;
  const next = await api("/api/dashboard", passive ? { headers: { "X-OpenMarquee-Passive": "1" } } : {});
  state.media = next.media || [];
  state.folders = next.folders || [];
  state.playlists = (next.playlists || []).map((playlist) => ({
    ...playlist,
    layout_mode: playlist.layout_mode || "full",
    fit_mode: playlist.fit_mode || "contain",
    transition_modes: Array.isArray(playlist.transition_modes)
      ? playlist.transition_modes
      : (() => {
          try {
            return JSON.parse(playlist.transition_modes || "[]");
          } catch {
            return [playlist.transition_mode || "fade"];
          }
        })(),
  }));
  state.screens = next.screens || [];
  state.logs = next.logs || [];
  state.reports = next.reports || {};
  state.settings = next.settings || { selected_profiles: [], profiles_configured: false };
  for (const id of [...selectedScreens]) {
    if (!state.screens.some((screen) => screen.id === id)) selectedScreens.delete(id);
  }
  render();
  loadLocalDisplays().catch(() => {});
  if (state.auth.authenticated && !state.settings.profiles_configured) {
    openProfileSetup();
  }
}

function screenMeta(screen) {
  const connected = Number(screen.connected_instances || 0);
  const pairingState = screen.paired_at
    ? "Reusable code - open on multiple browsers"
    : `Expires in ${Math.max(1, Math.ceil(Number(screen.pairing_expires_in || 0) / 60))} min until first pairing`;
  const rows = [
    ["fa-fingerprint", "Pairing", `<button class="pairing-code" data-action="copy-pairing-code" data-screen-id="${screen.id}" aria-label="Copy pairing code ${screen.code}" data-tooltip="Copy pairing code" title="Copy pairing code">${screen.code}</button>`],
    ["fa-layer-group", "Players", `${connected} connected ${connected > 1 ? '<span class="shared-tag">Shared</span>' : ""}`],
    ["fa-circle-info", "Access", escapeHtml(pairingState)],
    ["fa-photo-film", "Playlist", escapeHtml(screenPlaylistName(screen))],
    ["fa-tv", "Device", `${escapeHtml(screenBrandLabel(screen.brand || "unknown"))}${screen.model ? ` ${escapeHtml(screen.model)}` : ""}`],
    ["fa-microchip", "Runtime", escapeHtml(screenRuntimeLabel(screen.runtime || "browser"))],
    ["fa-network-wired", "Network", screen.ip_address ? escapeHtml(screen.ip_address) : "No IP saved"],
  ];
  if (screen.profile) rows.push(["fa-briefcase", "Profile", escapeHtml(profileLabel(screen.profile))]);
  if (screen.notes) rows.push(["fa-note-sticky", "Notes", escapeHtml(screen.notes)]);
  return `<div class="screen-meta">${rows.map(([icon, label, value]) => `
    <div class="meta-row"><i class="fa-solid ${icon}"></i><span>${label}</span><strong>${value}</strong></div>
  `).join("")}</div>`;
}

function iconAction(action, idName, id, icon, label, danger = false) {
  return `<button class="icon-action ${danger ? "danger" : ""}" data-action="${action}" data-${idName}="${id}" aria-label="${escapeHtml(label)}" data-tooltip="${escapeHtml(label)}" title="${escapeHtml(label)}"><i class="fa-solid ${icon}"></i></button>`;
}

function networkBadgeClass(screen) {
  if (screen.network_status === "reachable") return "network-ok";
  if (screen.network_status === "invalid_ip") return "network-warn";
  return "offline";
}

function overviewScreenCard(screen) {
  return `
    <article class="card ${screen.online ? "card-live" : ""}">
      <div class="card-body">
        <div class="badge-row">
          <span class="badge ${screen.online ? "online" : "offline"}">${escapeHtml(screen.player_status_label)}</span>
          <span class="badge ${networkBadgeClass(screen)}">${escapeHtml(screen.network_status_label)}</span>
        </div>
        <h3>${escapeHtml(screen.name)}</h3>
        ${screenMeta(screen)}
        <div class="card-actions">
          ${iconAction("assign-screen", "screen-id", screen.id, "fa-photo-film", "Assign playlist")}
          ${iconAction("stop-screen", "screen-id", screen.id, "fa-stop", "Stop playback")}
          ${iconAction("copy-pairing-code", "screen-id", screen.id, "fa-fingerprint", "Copy pairing code")}
          ${iconAction("copy-player-link", "screen-id", screen.id, "fa-link", "Copy shared player link")}
        </div>
      </div>
    </article>
  `;
}

function fleetScreenCard(screen) {
  return `
    <article class="card ${screen.online ? "card-live" : ""}">
      <div class="card-body">
        <label class="screen-select">
          <input type="checkbox" data-screen-select="${screen.id}" ${selectedScreens.has(screen.id) ? "checked" : ""}>
          <span>Select</span>
        </label>
        <div class="badge-row">
          <span class="badge ${screen.online ? "online" : "offline"}">${escapeHtml(screen.player_status_label)}</span>
          <span class="badge ${networkBadgeClass(screen)}">${escapeHtml(screen.network_status_label)}</span>
        </div>
        <h3>${escapeHtml(screen.name)}</h3>
        ${screenMeta(screen)}
        <div class="card-actions">
          ${iconAction("assign-screen", "screen-id", screen.id, "fa-play", "Publish playlist")}
          ${iconAction("stop-screen", "screen-id", screen.id, "fa-stop", "Stop playback")}
          ${iconAction("copy-pairing-code", "screen-id", screen.id, "fa-fingerprint", "Copy pairing code")}
          ${iconAction("copy-player-link", "screen-id", screen.id, "fa-link", "Copy shared player link")}
          ${iconAction("regen-code", "screen-id", screen.id, "fa-rotate", "Generate new pairing code")}
          ${iconAction("edit-screen", "screen-id", screen.id, "fa-pen", "Edit screen")}
          ${iconAction("delete-screen", "screen-id", screen.id, "fa-trash", "Delete screen", true)}
        </div>
      </div>
    </article>
  `;
}

function mediaCard(media) {
  const mediaUrl = media.source_url || `/media/${media.filename}`;
  const textPreview = media.metadata?.body || media.metadata?.text || "";
  const preview = media.kind === "video"
    ? `<video src="${escapeHtml(mediaUrl)}" muted></video>`
    : media.kind === "image"
      ? `<img src="${escapeHtml(mediaUrl)}" alt="">`
      : media.kind === "countdown"
        ? `<div class="media-type-tile text-preview-tile"><small>${escapeHtml(media.metadata?.badge || "Countdown")}</small><strong>${escapeHtml(media.metadata?.message || media.name)}</strong><span>${escapeHtml(media.metadata?.target_at || "")}</span></div>`
      : media.kind === "text"
        ? `<div class="media-type-tile text-preview-tile"><small>${escapeHtml(media.metadata?.badge || "Text signage")}</small><strong>${escapeHtml(media.metadata?.text || media.name)}</strong><span>${escapeHtml(textPreview.slice(0, 110))}</span></div>`
        : `<div class="media-type-tile"><strong>${escapeHtml(mediaTypeLabel(media.kind))}</strong><span>${media.source_url ? "URL source" : "Uploaded asset"}</span></div>`;
  const editable = ["text", "countdown"].includes(media.kind);

  return `
    <article class="card">
      <div class="media-preview">${preview}</div>
      <div class="card-body">
        <div class="badge-row"><span class="badge"><i class="fa-solid fa-folder"></i><span>${escapeHtml(folderLabel(media.folder_id))}</span></span></div>
        <h3>${escapeHtml(media.name)}</h3>
        <p>${escapeHtml(mediaTypeLabel(media.kind))} - ${media.size ? bytes(media.size) : "Remote source"}</p>
        <div class="card-actions">
          ${editable ? iconAction("edit-media", "media-id", media.id, "fa-pen", "Edit media") : ""}
          ${iconAction("rename-media", "media-id", media.id, "fa-i-cursor", "Rename media")}
          ${iconAction("move-media", "media-id", media.id, "fa-folder-open", "Move to folder")}
          ${iconAction("delete-media", "media-id", media.id, "fa-trash", "Delete media", true)}
        </div>
      </div>
    </article>
  `;
}

function playlistCard(playlist) {
  const duration = playlist.items.reduce((total, item) => total + Number(item.duration || 10), 0);
  return `
    <article class="card">
      <div class="card-body">
        <span class="badge">${playlist.items.length} items</span>
        <h3>${escapeHtml(playlist.name)}</h3>
        <p>${duration} seconds per loop</p>
        <p>${escapeHtml(layoutLabel(playlist.layout_mode))} - ${escapeHtml(fitLabel(playlist.fit_mode))}</p>
        <p>${escapeHtml(transitionSummary(playlist))}</p>
        <div class="card-actions">
          ${iconAction("edit-playlist", "playlist-id", playlist.id, "fa-pen", "Edit playlist")}
          ${iconAction("delete-playlist", "playlist-id", playlist.id, "fa-trash", "Delete playlist", true)}
        </div>
      </div>
    </article>
  `;
}

function renderSelectionState() {
  const count = selectedScreens.size;
  $("#selected-count").textContent = count ? `${count} selected` : "No screens selected";
  $("#select-all").checked = !!state.screens.length && count === state.screens.length;
}

function renderFolders() {
  const folderCounts = new Map();
  for (const media of state.media) {
    const key = String(media.folder_id || 0);
    folderCounts.set(key, (folderCounts.get(key) || 0) + 1);
  }
  const items = [
    { id: "all", name: "All media", count: state.media.length, icon: "fa-layer-group" },
    { id: "0", name: "Unfiled", count: folderCounts.get("0") || 0, icon: "fa-inbox" },
    ...state.folders.map((folder) => ({ id: String(folder.id), name: folder.name, count: folderCounts.get(String(folder.id)) || 0, icon: "fa-folder" })),
  ];
  $("#folder-bar").innerHTML = items.map((item) => `
    <button class="folder-chip ${String(state.activeFolderId) === String(item.id) ? "active" : ""}" data-folder-filter="${item.id}">
      <i class="fa-solid ${item.icon}"></i>
      <span>${escapeHtml(item.name)}</span>
      <strong>${item.count}</strong>
    </button>
  `).join("");
}

function reportCard(title, value, note, icon) {
  return `
    <article>
      <span><i class="fa-solid ${icon}"></i> ${escapeHtml(title)}</span>
      <strong>${escapeHtml(String(value))}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

function activityRow(entry) {
  return `
    <article class="log-row">
      <div>
        <strong>${escapeHtml(entry.action.replaceAll("_", " "))}</strong>
        <p>${escapeHtml(entry.target_type)}${entry.target_name ? ` - ${escapeHtml(entry.target_name)}` : ""}</p>
      </div>
      <div class="log-meta">
        <span>${escapeHtml(entry.actor)}</span>
        <small>${escapeHtml(formatLogTime(entry.created_at))}</small>
      </div>
    </article>
  `;
}

function highlightCard(title, body, note) {
  return `
    <article class="highlight-card">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(body)}</p>
      <span>${escapeHtml(note)}</span>
    </article>
  `;
}

function helpCard(title, body, note) {
  return highlightCard(title, body, note);
}

function render() {
  $("#screen-count").textContent = state.screens.length;
  $("#online-count").textContent = `${state.screens.filter((screen) => screen.online).length} online now`;
  $("#media-count").textContent = state.media.length;
  $("#playlist-count").textContent = state.playlists.length;
  const liveInstances = state.reports?.pairing?.live_instances || 0;
  const activeCodes = state.reports?.pairing?.active_codes || 0;
  const selectedProfiles = state.settings.selected_profiles || [];
  $("#live-instance-count").textContent = String(liveInstances);
  $("#active-code-count").textContent = `${activeCodes} active codes`;
  const filteredMedia = state.activeFolderId === "all"
    ? state.media
    : state.media.filter((media) => String(media.folder_id || 0) === String(state.activeFolderId));
  const reportCards = [
    reportCard("Assigned screens", state.reports?.playback?.assigned_screens || 0, "Currently receiving a playlist", "tower-broadcast"),
    reportCard("Reachable devices", state.reports?.devices?.reachable || 0, "Responding on the network", "wifi"),
    reportCard("Text assets", state.reports?.content?.text_assets || 0, "Text signage ready to publish", "font"),
    reportCard("Live viewers", liveInstances, "Browsers or player apps currently using pairing codes", "display"),
    reportCard("Failed logins", state.reports?.security?.failed_logins || 0, "Recent blocked or invalid attempts", "triangle-exclamation"),
  ];
  const highlights = [
    highlightCard("Ready to publish", `${state.playlists.length} playlist${state.playlists.length === 1 ? "" : "s"} available`, state.playlists.length ? "Open Playlists to update transitions, timing, countdown behavior, and layouts." : "Add media first, then build the first playlist."),
    highlightCard("Fleet health", `${state.screens.filter((screen) => screen.online).length} player${state.screens.filter((screen) => screen.online).length === 1 ? "" : "s"} connected live`, state.screens.length ? `Active pairing codes: ${activeCodes}. Shared codes in use: ${state.reports?.pairing?.shared_codes || 0}.` : "No screens added yet. Start from the Screens tab."),
    highlightCard("Content mix", `${state.media.length} asset${state.media.length === 1 ? "" : "s"} in the library`, `${state.folders.length} folder${state.folders.length === 1 ? "" : "s"}, ${state.reports?.content?.text_assets || 0} text ads, and ${state.reports?.content?.countdowns || 0} countdown item${(state.reports?.content?.countdowns || 0) === 1 ? "" : "s"} ready.`),
    highlightCard("Deployment mode", state.reports?.network?.lan_ready ? "LAN and Wi-Fi playback ready" : "Network setup needed", "Local media, playlists, and pairing work without internet. Remote URLs such as YouTube and dashboards still need internet access."),
    highlightCard("Industry profiles", selectedProfiles.length ? selectedProfiles.map(profileLabel).join(", ") : "No profile chosen yet", "Use deployment profiles to tune signage for retail, hospital, office, events, and other environments."),
    highlightCard("Pairing visibility", `${liveInstances} live player session${liveInstances === 1 ? "" : "s"}`, "OpenMarquee now tracks how many browser or player instances are actively using each pairing code."),
  ];
  const helpCards = [
    helpCard("1. How do I add a screen?", "Open Screens, then choose Add screen for manual entry or Discover to find visible devices on your local network. Save the screen, then use the pairing code on the player screen or player app.", "Best production flow: run the player on Android TV, Raspberry Pi, or a kiosk browser and keep that device paired."),
    helpCard("2. How does content reach the LCD?", "The LCD itself does not receive files directly by IP. A paired player device opens OpenMarquee, checks the assigned playlist, and automatically streams or loads the content for that screen.", "This is why the player status matters more than simple network ping. A screen can answer ping and still be disconnected from playback."),
    helpCard("2b. Can one pairing code open on multiple browsers?", "Yes. After the first successful pairing, the screen code becomes reusable. Open the player on another browser, device, or tab and enter the same six-character code. Every connected player receives the same playlist and live broadcasts.", "Each browser tab now receives its own player identity. The screen card shows the live player count and marks shared codes when more than one player is connected."),
    helpCard("3. How do I publish media?", "Upload images, videos, PDFs, audio, or add URLs from the Media Library. Then create a playlist, set durations, choose transitions, and publish that playlist to one screen, selected screens, or all screens.", "Use split layouts only when you intentionally want multiple items visible at the same time. Full screen stays the default."),
    helpCard("4. How do text ads work?", "Choose Add text in the Media Library, select a preset, then customize headline, supporting copy, animation, font style, colors, alignment, and folder. Saved text ads can also be edited later from the library.", "Text slides are ideal for promotions, meeting notices, Arabic and Urdu welcome screens, safety alerts, and branded campaigns."),
    helpCard("4b. How do countdowns work?", "Use Add countdown to set a future date and time. The player will show a live countdown and automatically continue to the next playlist item after the timer completes.", "Countdowns work well for store openings, prayer room notices, launches, meetings, and event starts."),
    helpCard("5. What happens if there is no media?", "OpenMarquee now shows an animated branded idle scene instead of a blank or static empty screen. This keeps the display polished while waiting for content assignment.", "Once a playlist is assigned, the player swaps automatically on the next sync."),
    helpCard("6. Why might a YouTube video not play?", "Some YouTube owners disable embedding. OpenMarquee converts supported links into autoplay embed URLs, but if the owner blocks embedding the player will skip or fail instead of bypassing that restriction.", "For guaranteed playback, upload the MP4 directly or use a video source you control."),
    helpCard("7. How do I stop playback?", "Go to Screens and press Stop on one screen, selected screens, or all screens. The player will return to the branded idle scene after the next refresh.", "Use Activity to confirm the stop action was logged."),
    helpCard("8. How does offline or LAN mode work?", "If the server, player, and screens are on the same LAN or Wi-Fi, local uploads, text ads, countdowns, playlists, and pairing continue to work without internet. Internet is only required for remote web URLs such as YouTube, dashboards, or cloud pages.", "For strong offline performance, prefer uploaded images, video, PDF, audio, and text assets over external URLs."),
    helpCard("9. How do deployment profiles work?", "At first sign-in you can choose one or more deployment profiles such as retail, hospital, office, hotel, or events. Each screen can then be assigned one profile to match its content style and operating context.", "This makes it easier to organize different LCD fleets under one server without mixing use cases."),
    helpCard("10. How do I keep the system secure?", "Use a strong admin password, enable MFA, deploy behind HTTPS and Nginx, and keep the player devices managed. Only authenticated admins can change playlists, screens, and security settings.", "Reports and Activity help you track failed logins, pairing changes, content actions, and operator behavior."),
    helpCard("11. How do I share my screen live?", "Open Live Share, select one or more destination players, then choose Entire display, Application window, or Browser tab. Connected Windows monitors are shown on the page and selected securely in the browser picker. The playlist resumes automatically when sharing stops.", "Use localhost on the server computer or HTTPS remotely. For sound, enable Share system audio in Chrome or Edge; browser-tab audio is usually the most reliable."),
    helpCard("12. How do I present a local PowerPoint or document?", "In Live Share, select destination screens and choose Present local file. PowerPoint, Word, and Excel files are converted to PDF by Microsoft Office or LibreOffice, then published directly. PDF pages and presentation slides advance automatically.", "Images, videos, audio, PDF, and HTML are also accepted directly. The uploaded file remains in the Media Library for reuse."),
    helpCard("13. How do folders and media names work?", "Open Media Library to rename any media item. Use the folder-management icon beside Add folder to rename or delete folders. Deleting a folder never deletes its media; those items move safely to Unfiled.", "Media deletion remains a separate confirmed action and also removes stale references from playlists."),
    helpCard("14. When does the administrator sign out?", "The Admin Panel signs out after 10 minutes without keyboard, mouse, or touch activity. Passive dashboard updates do not keep the session alive. Active live sharing is stopped before an inactivity logout.", "This rule is enforced by both the browser and server session record."),
    helpCard("15. How do I shut down OpenMarquee?", "Only a signed-in administrator can use the power icon in the header. Confirming shutdown stops live sharing, notifies connected players, closes the local service, and displays a safe offline message.", "The computer itself remains on. Start OpenMarquee again from its Desktop shortcut."),
    helpCard("16. Where are the Windows downloads?", "Compiled installers are attached to the GitHub Releases page, not stored in the source-code folders. Use the latest Setup EXE for installation or the portable ZIP for an extracted copy.", "The installer requires acceptance of the Terms and Conditions. Verify downloads with SHA256SUMS.txt. SmartScreen reputation requires a recognized code-signing certificate."),
  ];

  $("#overview-screens").innerHTML = state.screens.map(overviewScreenCard).join("") || '<p class="empty">No screens paired yet.</p>';
  $("#screen-grid").innerHTML = state.screens.map(fleetScreenCard).join("") || '<p class="empty">No screens added yet. Start with manual entry or network discovery.</p>';
  $("#media-grid").innerHTML = filteredMedia.map(mediaCard).join("") || '<p class="empty">Your library is ready for its first asset or live source.</p>';
  $("#playlist-grid").innerHTML = state.playlists.map(playlistCard).join("") || '<p class="empty">Create a playlist after uploading media or adding a source.</p>';
  $("#overview-reports").innerHTML = reportCards.join("");
  $("#overview-highlights").innerHTML = highlights.join("");
  $("#help-grid").innerHTML = helpCards.join("");
  $("#report-grid").innerHTML = reportCards.join("");
  $("#activity-log-list").innerHTML = state.logs.map(activityRow).join("") || '<p class="empty">No activity yet.</p>';
  $("#log-list").innerHTML = state.logs.map(activityRow).join("") || '<p class="empty">No activity yet.</p>';
  renderLiveTargets();
  renderFolders();
  renderSelectionState();
}

function go(view) {
  $$(".nav").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  $$(".view").forEach((item) => item.classList.toggle("active-view", item.id === view));
  $("#page-title").textContent = {
    overview: "Digital signage at a glance",
    library: "Your content library",
    playlists: "Playlist programming",
    screens: "Your screen fleet",
    "live-share": "Broadcast your screen live",
    activity: "Recent activity and audit trail",
    help: "FAQ and full usage guide",
    reports: "Operations and security reports",
  }[view];
}

function modalCancelButton(label = "Cancel") {
  return `<button class="secondary" data-modal-close type="button">${escapeHtml(label)}</button>`;
}

async function showModal(html, onSubmit, onOpen = null) {
  const dialog = $("#modal");
  const form = dialog.querySelector("form");
  const topClose = dialog.querySelector(".modal-close");
  if (topClose) topClose.style.display = "";
  const cleanup = () => {
    $("#modal-body").innerHTML = "";
    window.playlistDraft = [];
  };
  $("#modal-body").innerHTML = html;
  dialog.onclose = cleanup;
  dialog.querySelectorAll("[data-modal-close]").forEach((button) => {
    button.onclick = () => dialog.close("cancel");
  });
  dialog.showModal();
  if (typeof onOpen === "function") onOpen(dialog);
  form.onsubmit = async (event) => {
    event.preventDefault();
    try {
      await onSubmit(new FormData(event.target));
      dialog.close();
    } catch (error) {
      toast(error.message);
    }
  };
}

function playlistOptions(selected = "") {
  return state.playlists.map((playlist) => `<option value="${playlist.id}" ${String(playlist.id) === String(selected) ? "selected" : ""}>${escapeHtml(playlist.name)}</option>`).join("");
}

function optionMarkup(options, selectedValue) {
  return options.map(([value, label]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
}

function folderSelectOptions(selectedValue = 0, includeAll = false) {
  const base = includeAll ? '<option value="0">Unfiled</option>' : '<option value="0">No folder</option>';
  return `${base}${state.folders.map((folder) => `<option value="${folder.id}" ${Number(selectedValue) === Number(folder.id) ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}`;
}

function profileSelectOptions(selectedValue = "") {
  return `<option value="">General</option>${industryProfiles.map(([value, label]) => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}`;
}

function transitionPickerMarkup(selectedModes = ["fade"]) {
  const selected = new Set(selectedModes.length ? selectedModes : ["fade"]);
  return `
    <div class="transition-picker">
      ${transitionOptions.map(([value, label]) => `
        <label class="transition-pick">
          <input type="checkbox" name="transition_pick" value="${value}" ${selected.has(value) ? "checked" : ""}>
          <span>${escapeHtml(label)}</span>
        </label>
      `).join("")}
    </div>
    <p class="helper-text">Choose one transition or several. If you pick more than one, OpenMarquee rotates through them across the playlist.</p>
  `;
}

function screenForm(screen = null) {
  const isEdit = !!screen;
  return `
    <p class="eyebrow">${isEdit ? "EDIT DEVICE" : "NEW DEVICE"}</p>
    <h2>${isEdit ? "Update screen" : "Add a screen"}</h2>
    <div class="field"><label>Screen name</label><input name="name" placeholder="Reception TV" value="${escapeHtml(screen?.name || "")}" required></div>
    <div class="playlist-config-grid">
      <div class="field">
        <label>Brand</label>
        <select name="brand">${optionMarkup(brandOptions, screen?.brand || "unknown")}</select>
      </div>
      <div class="field">
        <label>Model</label>
        <input name="model" placeholder="QM65B / Bravia / Pi 5" value="${escapeHtml(screen?.model || "")}">
      </div>
      <div class="field">
        <label>Runtime</label>
        <select name="runtime">${optionMarkup(runtimeOptions, screen?.runtime || "browser")}</select>
      </div>
    </div>
    <div class="field"><label>Industry profile</label><select name="profile">${profileSelectOptions(screen?.profile || "")}</select></div>
    <div class="field"><label>IP address</label><input name="ip_address" placeholder="192.168.1.20" value="${escapeHtml(screen?.ip_address || "")}"></div>
    <p class="helper-text">IP reachability and player connection are separate. The best production setup is a managed player app or kiosk runtime on the screen device.</p>
    <div class="field"><label>Orientation</label><select name="orientation"><option value="landscape" ${screen?.orientation !== "portrait" ? "selected" : ""}>Landscape</option><option value="portrait" ${screen?.orientation === "portrait" ? "selected" : ""}>Portrait</option></select></div>
    <div class="field"><label>Notes</label><input name="notes" placeholder="Lobby Samsung panel" value="${escapeHtml(screen?.notes || "")}"></div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">${isEdit ? "Save changes" : "Create screen"}</button></div>
  `;
}

function buildPlaylistRows(selectedItems) {
  return selectedItems.map((item, itemIndex) => {
    const media = mediaById(item.media_id);
    return `
      <div class="playlist-item-row" data-item-index="${itemIndex}">
        <div class="playlist-item-copy">
          <strong>${escapeHtml(media?.name || `Media ${item.media_id}`)}</strong>
          <small>${escapeHtml(mediaTypeLabel(media?.kind || "media item"))}</small>
        </div>
        <div class="playlist-row-actions">
          <label class="playlist-duration-field">
            <span>Seconds</span>
            <input type="number" min="2" name="duration_${itemIndex}" value="${Number(item.duration || 10)}">
          </label>
          <button class="secondary danger" type="button" data-remove-playlist-row="${itemIndex}">Remove</button>
        </div>
        <input type="hidden" name="media_id_${itemIndex}" value="${Number(item.media_id)}">
      </div>
    `;
  }).join("");
}

function playlistEditorMarkup(playlist, selectedItems) {
  const selectedIds = new Set(selectedItems.map((item) => Number(item.media_id)));
  return `
    <p class="eyebrow">PLAYLIST BUILDER</p>
    <h2>Edit playlist</h2>
    <div class="field"><label>Playlist name</label><input name="name" value="${escapeHtml(playlist.name)}" required></div>
    <div class="playlist-config-grid">
      <div class="field">
        <label>Layout</label>
        <select name="layout_mode">
          <option value="full" ${playlist.layout_mode === "full" ? "selected" : ""}>Full screen</option>
          <option value="split-2" ${playlist.layout_mode === "split-2" ? "selected" : ""}>Split screen 2</option>
          <option value="split-4" ${playlist.layout_mode === "split-4" ? "selected" : ""}>Split screen 4</option>
        </select>
      </div>
      <div class="field">
        <label>Fit mode</label>
        <select name="fit_mode">
          <option value="contain" ${playlist.fit_mode === "contain" ? "selected" : ""}>Show complete image</option>
          <option value="cover" ${playlist.fit_mode === "cover" ? "selected" : ""}>Fill more of the screen</option>
        </select>
      </div>
      <div class="field">
        <label>Primary transition</label>
        <select name="transition_mode">${transitionOptions.map(([value, label]) => `<option value="${value}" ${value === (playlist.transition_mode || "fade") ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>
      </div>
    </div>
    <div class="field">
      <label>Transition rotation</label>
      ${transitionPickerMarkup(playlist.transition_modes || [playlist.transition_mode || "fade"])}
    </div>
    <div class="playlist-tools">
      <label class="playlist-apply-all">
        <span>Set all items to</span>
        <input type="number" min="2" id="apply-all-duration" value="10">
        <span>seconds</span>
      </label>
      <button class="secondary" type="button" id="apply-all-button">Apply to all</button>
    </div>
    <div class="field">
      <label>Items in playlist</label>
      <div class="playlist-item-list" id="playlist-item-list">${buildPlaylistRows(selectedItems)}</div>
    </div>
    <div class="field">
      <label>Add or remove media</label>
      <div class="picker picker-wide">
        ${state.media.map((media) => `
          <label class="pick">
            <input type="checkbox" name="media_pick" value="${media.id}" ${selectedIds.has(media.id) ? "checked" : ""}>
            <span>${escapeHtml(media.name)}</span>
          </label>
        `).join("")}
      </div>
    </div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Save playlist</button></div>
  `;
}

function collectSelectedPlaylistItems(playlist, formData) {
  const selectedIds = new Set(formData.getAll("media_pick").map((value) => Number(value)));
  const existingRows = [];
  let itemIndex = 0;
  while (formData.has(`media_id_${itemIndex}`)) {
    const mediaId = Number(formData.get(`media_id_${itemIndex}`));
    if (selectedIds.has(mediaId)) {
      existingRows.push({ media_id: mediaId, duration: Math.max(2, Number(formData.get(`duration_${itemIndex}`) || 10)) });
      selectedIds.delete(mediaId);
    }
    itemIndex += 1;
  }
  const newRows = [...selectedIds].map((mediaId) => {
    const original = playlist.items.find((item) => Number(item.media_id) === Number(mediaId));
    return { media_id: mediaId, duration: Math.max(2, Number(original?.duration || 10)) };
  });
  return [...existingRows, ...newRows];
}

function collectTransitionModes(formData) {
  const selected = formData.getAll("transition_pick").map(String);
  if (selected.length) return selected;
  return [String(formData.get("transition_mode") || "fade")];
}

function bindPlaylistEditor(selectedItems) {
  window.playlistDraft = selectedItems.map((item) => ({ ...item }));
  const rebuild = () => {
    const list = $("#playlist-item-list");
    if (list) list.innerHTML = buildPlaylistRows(window.playlistDraft);
    $$("[data-remove-playlist-row]").forEach((button) => {
      button.onclick = () => {
        const rowIndex = Number(button.dataset.removePlaylistRow);
        const removed = window.playlistDraft.splice(rowIndex, 1)[0];
        const checkbox = $(`input[name="media_pick"][value="${removed.media_id}"]`);
        if (checkbox) checkbox.checked = false;
        rebuild();
      };
    });
  };
  $$(".pick input[name='media_pick']").forEach((checkbox) => {
    checkbox.onchange = () => {
      const mediaId = Number(checkbox.value);
      const existing = window.playlistDraft.find((item) => Number(item.media_id) === mediaId);
      if (checkbox.checked && !existing) window.playlistDraft.push({ media_id: mediaId, duration: 10 });
      if (!checkbox.checked && existing) window.playlistDraft = window.playlistDraft.filter((item) => Number(item.media_id) !== mediaId);
      rebuild();
    };
  });
  rebuild();
  const applyButton = $("#apply-all-button");
  const applyInput = $("#apply-all-duration");
  if (applyButton && applyInput) {
    applyButton.onclick = () => {
      const nextValue = Math.max(2, Number(applyInput.value || 10));
      $$(".playlist-duration-field input").forEach((inputEl) => { inputEl.value = String(nextValue); });
    };
  }
}

function openCreateScreen() {
  showModal(screenForm(), async (formData) => {
    const result = await api("/api/screens", { method: "POST", body: formData });
    toast(`Screen created. Pairing code ${result.code}`);
    await refresh();
  });
}

function openPlaylistBuilder() {
  if (!state.media.length) {
    toast("Add media or a source first");
    go("library");
    return;
  }
  showModal(`
    <p class="eyebrow">NEW PLAYLIST</p>
    <h2>Build a playlist</h2>
    <div class="field"><label>Playlist name</label><input name="name" placeholder="Morning announcements" required></div>
    <div class="playlist-config-grid">
      <div class="field">
        <label>Layout</label>
        <select name="layout_mode">
          <option value="full">Full screen</option>
          <option value="split-2">Split screen 2</option>
          <option value="split-4">Split screen 4</option>
        </select>
      </div>
      <div class="field">
        <label>Fit mode</label>
        <select name="fit_mode">
          <option value="contain">Show complete image</option>
          <option value="cover">Fill more of the screen</option>
        </select>
      </div>
      <div class="field">
        <label>Primary transition</label>
        <select name="transition_mode">${transitionOptions.map(([value, label]) => `<option value="${value}" ${value === "fade" ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>
      </div>
    </div>
    <div class="field">
      <label>Transition rotation</label>
      ${transitionPickerMarkup(["fade"])}
    </div>
    <div class="field"><label>Choose content</label><div class="picker picker-wide">${state.media.map((media) => `<label class="pick"><input type="checkbox" name="media" value="${media.id}"><span>${escapeHtml(media.name)}</span></label>`).join("")}</div></div>
    <div class="field"><label>Default duration (seconds)</label><input name="duration" type="number" min="2" value="10"></div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Create playlist</button></div>
  `, async (formData) => {
    const ids = formData.getAll("media");
    if (!ids.length) throw new Error("Select at least one item");
    const transitionModes = collectTransitionModes(formData);
    const payload = new FormData();
    payload.set("name", formData.get("name"));
    payload.set("layout_mode", formData.get("layout_mode"));
    payload.set("fit_mode", formData.get("fit_mode"));
    payload.set("transition_mode", formData.get("transition_mode"));
    payload.set("transition_modes", JSON.stringify(transitionModes));
    payload.set("items", JSON.stringify(ids.map((id) => ({ media_id: Number(id), duration: Number(formData.get("duration")) }))));
    await api("/api/playlists", { method: "POST", body: payload });
    toast("Playlist created");
    await refresh();
  });
}

function openSourceBuilder() {
  showModal(`
    <p class="eyebrow">NEW SOURCE</p>
    <h2>Add a web or stream source</h2>
    <div class="field"><label>Display name</label><input name="name" placeholder="Reception dashboard" required></div>
    <div class="field"><label>Source type</label><select name="kind">
      <option value="webpage">Web Page</option>
      <option value="dashboard">Dashboard URL</option>
      <option value="youtube">YouTube</option>
      <option value="rss">RSS Feed</option>
      <option value="stream">Live Stream</option>
      <option value="iptv">IPTV</option>
      <option value="powerpoint">PowerPoint URL</option>
      <option value="excel">Excel Chart URL</option>
      <option value="pdf">PDF URL</option>
      <option value="audio">Audio URL</option>
      <option value="html">Hosted HTML</option>
    </select></div>
    <div class="field"><label>Folder</label><select name="folder_id">${folderSelectOptions(state.activeFolderId === "all" ? 0 : Number(state.activeFolderId || 0), true)}</select></div>
    <div class="field"><label>URL</label><input name="source_url" placeholder="https://..." required></div>
    <div class="playlist-config-grid">
      <div class="field"><label>Page count for PDF or PowerPoint</label><input name="page_count" type="number" min="1" value="1"></div>
      <div class="field"><label>Seconds per page</label><input name="slide_interval" type="number" min="2" value="10"></div>
    </div>
    <p class="helper-text">Use direct or embeddable links for dashboards, widgets, live channels, presentations, and web content.</p>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Add source</button></div>
  `, async (formData) => {
    await api("/api/library/url", { method: "POST", body: formData });
    toast("Source added");
    await refresh();
  });
}

function openFolderBuilder() {
  showModal(`
    <p class="eyebrow">MEDIA ORGANIZATION</p>
    <h2>Create folder</h2>
    <div class="field"><label>Folder name</label><input name="name" placeholder="Retail campaign" required></div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Create folder</button></div>
  `, async (formData) => {
    await api("/api/folders", { method: "POST", body: formData });
    toast("Folder created");
    await refresh();
  });
}

function openFolderManager() {
  showModal(`
    <p class="eyebrow">MEDIA ORGANIZATION</p>
    <h2>Manage folders</h2>
    <p class="modal-copy">Rename folders here. Deleting a folder keeps its media and moves those files to Unfiled.</p>
    <div class="folder-manager-list">
      ${state.folders.length ? state.folders.map((folder) => `
        <div class="folder-manager-row">
          <i class="fa-solid fa-folder"></i>
          <input name="folder_${folder.id}" value="${escapeHtml(folder.name)}" aria-label="Folder name">
          <button type="button" class="icon-action danger" data-delete-folder="${folder.id}" aria-label="Delete ${escapeHtml(folder.name)}" title="Delete folder"><i class="fa-solid fa-trash"></i></button>
        </div>
      `).join("") : '<p class="empty">No custom folders yet.</p>'}
    </div>
    <div class="modal-footer">${modalCancelButton()}${state.folders.length ? '<button class="primary">Save names</button>' : ""}</div>
  `, async (formData) => {
    for (const folder of state.folders) {
      const name = String(formData.get(`folder_${folder.id}`) || "").trim();
      if (name && name !== folder.name) {
        const payload = new FormData();
        payload.set("name", name);
        await api(`/api/folders/${folder.id}`, { method: "PUT", body: payload });
      }
    }
    toast("Folder names updated");
    await refresh();
  }, (dialog) => {
    dialog.querySelectorAll("[data-delete-folder]").forEach((button) => {
      button.onclick = async () => {
        const folderId = Number(button.dataset.deleteFolder);
        const folder = state.folders.find((item) => item.id === folderId);
        if (!folder || !confirm(`Delete folder ${folder.name}? Media will move to Unfiled.`)) return;
        await api(`/api/folders/${folderId}`, { method: "DELETE" });
        if (String(state.activeFolderId) === String(folderId)) state.activeFolderId = "all";
        dialog.close();
        toast("Folder deleted; media moved to Unfiled");
        await refresh();
      };
    });
  });
}

function richTextFormMarkup(existing = null) {
  const media = existing || { metadata: {} };
  return `
    <p class="eyebrow">TEXT SIGNAGE</p>
    <h2>${existing ? "Edit animated text campaign" : "Create animated text campaign"}</h2>
    <div class="text-preset-grid">
      <button class="preset-card" data-text-preset="retail" type="button"><strong>Retail</strong><span>Bold offer signage</span></button>
      <button class="preset-card" data-text-preset="corporate" type="button"><strong>Corporate</strong><span>Elegant announcements</span></button>
      <button class="preset-card" data-text-preset="event" type="button"><strong>Event</strong><span>Stage and countdown screens</span></button>
      <button class="preset-card" data-text-preset="urgent" type="button"><strong>Alert</strong><span>High-visibility notices</span></button>
    </div>
    <div class="playlist-config-grid">
      <div class="field"><label>Slide name</label><input name="name" placeholder="Weekend offer" value="${escapeHtml(media.name || "")}"></div>
      <div class="field"><label>Badge</label><input name="badge" placeholder="Limited offer" value="${escapeHtml(media.metadata?.badge || "")}"></div>
      <div class="field"><label>Folder</label><select name="folder_id">${folderSelectOptions(existing ? Number(media.folder_id || 0) : (state.activeFolderId === "all" ? 0 : Number(state.activeFolderId || 0)), true)}</select></div>
    </div>
    <div class="field"><label>Main headline</label><input name="text" placeholder="Grand opening this Friday" value="${escapeHtml(media.metadata?.text || "")}" required></div>
    <div class="field"><label>Supporting text</label><textarea name="body" rows="4" placeholder="Add the longer message, price details, event timing, or campaign copy.">${escapeHtml(media.metadata?.body || "")}</textarea></div>
    <div class="playlist-config-grid">
      <div class="field"><label>Animation</label><select name="animation">${optionMarkup(textAnimationOptions, media.metadata?.animation || "glow")}</select></div>
      <div class="field"><label>Theme</label><select name="theme">${optionMarkup(textThemeOptions, media.metadata?.theme || "sunrise")}</select></div>
      <div class="field"><label>Font style</label><select name="font_family">${optionMarkup(textFontOptions, media.metadata?.font_family || "display")}</select></div>
    </div>
    <div class="playlist-config-grid">
      <div class="field"><label>Background</label><input name="background" type="color" value="${escapeHtml(media.metadata?.background || "#13261f")}"></div>
      <div class="field"><label>Text color</label><input name="foreground" type="color" value="${escapeHtml(media.metadata?.foreground || "#ffffff")}"></div>
      <div class="field"><label>Accent color</label><input name="accent" type="color" value="${escapeHtml(media.metadata?.accent || "#ffe082")}"></div>
    </div>
    <div class="playlist-config-grid">
      <div class="field"><label>Alignment</label><select name="align"><option value="center" ${(media.metadata?.align || "center") === "center" ? "selected" : ""}>Center</option><option value="left" ${(media.metadata?.align || "") === "left" ? "selected" : ""}>Left</option><option value="right" ${(media.metadata?.align || "") === "right" ? "selected" : ""}>Right</option></select></div>
      <div class="field"><label>Headline size</label><input name="font_scale" type="number" min="70" max="160" value="${Number(media.metadata?.font_scale || 110)}"></div>
      <div class="field"><label>Case style</label><select name="text_case"><option value="none" ${(media.metadata?.text_case || "none") === "none" ? "selected" : ""}>Normal</option><option value="uppercase" ${(media.metadata?.text_case || "") === "uppercase" ? "selected" : ""}>Uppercase</option><option value="title" ${(media.metadata?.text_case || "") === "title" ? "selected" : ""}>Title case</option></select></div>
    </div>
    <p class="helper-text">Use a preset for a fast start, then tune animation, font style, colors, and alignment for the screen. Arabic and Urdu messages are supported through dedicated font styles.</p>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">${existing ? "Save text slide" : "Create text slide"}</button></div>
  `;
}

function bindTextPresets() {
  $$("[data-text-preset]").forEach((button) => {
    button.onclick = () => {
      const preset = textPresets[button.dataset.textPreset];
      if (!preset) return;
      Object.entries(preset).forEach(([key, value]) => {
        const field = document.querySelector(`#modal [name="${key}"]`);
        if (field) field.value = value;
      });
    };
  });
}

function openTextBuilder(existing = null) {
  showModal(richTextFormMarkup(existing), async (formData) => {
    await api(existing ? `/api/media/${existing.id}/rich` : "/api/library/text", { method: existing ? "PUT" : "POST", body: formData });
    toast(existing ? "Text slide updated" : "Text slide created");
    await refresh();
  }, bindTextPresets);
}

function openCountdownBuilder(existing = null) {
  const media = existing || { metadata: {} };
  showModal(`
    <p class="eyebrow">LIVE COUNTDOWN</p>
    <h2>${existing ? "Edit countdown" : "Create countdown"}</h2>
    <div class="playlist-config-grid">
      <div class="field"><label>Countdown name</label><input name="name" placeholder="Store opening" value="${escapeHtml(media.name || "")}" required></div>
      <div class="field"><label>Badge</label><input name="badge" placeholder="Live countdown" value="${escapeHtml(media.metadata?.badge || "Live countdown")}"></div>
      <div class="field"><label>Folder</label><select name="folder_id">${folderSelectOptions(existing ? Number(media.folder_id || 0) : (state.activeFolderId === "all" ? 0 : Number(state.activeFolderId || 0)), true)}</select></div>
    </div>
    <div class="playlist-config-grid">
      <div class="field"><label>Target date and time</label><input name="target_at" type="datetime-local" value="${escapeHtml(media.metadata?.target_at || "")}" required></div>
      <div class="field"><label>Theme</label><select name="theme">${optionMarkup(textThemeOptions, media.metadata?.theme || "royal")}</select></div>
      <div class="field"><label>Style</label><select name="style"><option value="flip" ${(media.metadata?.style || "flip") === "flip" ? "selected" : ""}>Flip clock</option><option value="hero" ${(media.metadata?.style || "") === "hero" ? "selected" : ""}>Hero digits</option><option value="capsule" ${(media.metadata?.style || "") === "capsule" ? "selected" : ""}>Capsule board</option></select></div>
    </div>
    <div class="field"><label>Before start message</label><input name="message" placeholder="The event is about to begin" value="${escapeHtml(media.metadata?.message || "")}"></div>
    <div class="field"><label>After finish message</label><input name="complete_message" placeholder="Starting now" value="${escapeHtml(media.metadata?.complete_message || "")}"></div>
    <div class="playlist-config-grid">
      <div class="field"><label>Background</label><input name="background" type="color" value="${escapeHtml(media.metadata?.background || "#13261f")}"></div>
      <div class="field"><label>Text color</label><input name="foreground" type="color" value="${escapeHtml(media.metadata?.foreground || "#ffffff")}"></div>
      <div class="field"><label>Accent color</label><input name="accent" type="color" value="${escapeHtml(media.metadata?.accent || "#7bd6ff")}"></div>
    </div>
    <p class="helper-text">When the countdown reaches zero, OpenMarquee automatically advances to the next playlist item.</p>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">${existing ? "Save countdown" : "Create countdown"}</button></div>
  `, async (formData) => {
    await api(existing ? `/api/media/${existing.id}/rich` : "/api/library/countdown", { method: existing ? "PUT" : "POST", body: formData });
    toast(existing ? "Countdown updated" : "Countdown created");
    await refresh();
  });
}

function openProfileSetup() {
  if (document.querySelector("#modal[open]")) return;
  const selected = new Set(state.settings.selected_profiles || []);
  showModal(`
    <p class="eyebrow">DEPLOYMENT SETUP</p>
    <h2>Choose your signage environment</h2>
    <p class="helper-text">Select one or more industry profiles. You can change these later and assign different profiles to different screens.</p>
    <div class="profile-pick-grid">
      ${industryProfiles.map(([value, label]) => `
        <label class="profile-pick">
          <input type="checkbox" name="profile_pick" value="${value}" ${selected.has(value) ? "checked" : ""}>
          <span><strong>${escapeHtml(label)}</strong><span>${escapeHtml(`Templates and defaults for ${label.toLowerCase()} signage`)}</span></span>
        </label>
      `).join("")}
    </div>
    <div class="modal-footer"><button class="primary">Save profiles</button></div>
  `, async (formData) => {
    const profiles = formData.getAll("profile_pick").map(String);
    const payload = new FormData();
    payload.set("profiles", JSON.stringify(profiles));
    await api("/api/settings/profiles", { method: "POST", body: payload });
    toast("Deployment profiles saved");
    await refresh();
  }, () => {
    const closeButton = document.querySelector("#modal [data-modal-close]");
    if (closeButton) closeButton.style.display = "none";
  });
}

window.editScreen = async (screenId) => {
  const screen = state.screens.find((item) => item.id === screenId);
  if (!screen) return;
  showModal(screenForm(screen), async (formData) => {
    await api(`/api/screens/${screenId}`, { method: "PUT", body: formData });
    toast("Screen updated");
    await refresh();
  });
};

window.deleteScreen = async (screenId) => {
  const screen = state.screens.find((item) => item.id === screenId);
  if (!screen || !confirm(`Delete ${screen.name}?`)) return;
  await api(`/api/screens/${screenId}`, { method: "DELETE" });
  selectedScreens.delete(screenId);
  toast("Screen removed");
  await refresh();
};

window.editPlaylist = async (playlistId) => {
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist) return;
  const draftItems = playlist.items.map((item) => ({ ...item }));
  showModal(playlistEditorMarkup(playlist, draftItems), async (formData) => {
    const items = collectSelectedPlaylistItems(playlist, formData);
    if (!items.length) throw new Error("Playlist needs at least one item");
    const transitionModes = collectTransitionModes(formData);
    const payload = new FormData();
    payload.set("name", formData.get("name"));
    payload.set("layout_mode", formData.get("layout_mode"));
    payload.set("fit_mode", formData.get("fit_mode"));
    payload.set("transition_mode", formData.get("transition_mode"));
    payload.set("transition_modes", JSON.stringify(transitionModes));
    payload.set("items", JSON.stringify(items));
    await api(`/api/playlists/${playlistId}`, { method: "PUT", body: payload });
    toast("Playlist updated");
    await refresh();
  });
  bindPlaylistEditor(draftItems);
};

window.deletePlaylist = async (playlistId) => {
  const playlist = state.playlists.find((item) => item.id === playlistId);
  if (!playlist || !confirm(`Delete playlist ${playlist.name}?`)) return;
  await api(`/api/playlists/${playlistId}`, { method: "DELETE" });
  toast("Playlist deleted");
  await refresh();
};

window.assignOne = async (screenId) => {
  if (!state.playlists.length) {
    toast("Create a playlist first");
    go("playlists");
    return;
  }
  showModal(`
    <p class="eyebrow">PUBLISH</p>
    <h2>Assign playlist</h2>
    <div class="field"><label>Playlist</label><select name="playlist_id">${playlistOptions()}</select></div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Publish</button></div>
  `, async (formData) => {
    await api(`/api/screens/${screenId}/assign`, { method: "POST", body: formData });
    toast("Playlist published");
    await refresh();
  });
};

window.stopOne = async (screenId) => {
  await api(`/api/screens/${screenId}/stop`, { method: "POST" });
  toast("Playback stopped");
  await refresh();
};

window.copyPlayerLink = async (screenId) => {
  const screen = state.screens.find((item) => item.id === screenId);
  if (!screen) return;
  if (await copyText(playerUrl(screen))) toast("Player link copied");
};

window.copyPairingCode = async (screenId) => {
  const screen = state.screens.find((item) => item.id === screenId);
  if (!screen) return;
  if (await copyText(screen.code)) toast(`Pairing code ${screen.code} copied - reuse it in additional browsers`);
};

window.regeneratePairingCode = async (screenId) => {
  const result = await api(`/api/screens/${screenId}/regenerate-code`, { method: "POST" });
  toast(`New pairing code ${result.code}`);
  await refresh();
};

function openBulkAssign(allScreens = false) {
  if (!state.playlists.length) {
    toast("Create a playlist first");
    go("playlists");
    return;
  }
  const targetScreens = allScreens ? state.screens : selectedScreenList();
  if (!targetScreens.length) return toast("Select screens first");
  showModal(`
    <p class="eyebrow">BULK PUBLISH</p>
    <h2>Assign playlist to ${targetScreens.length} screen${targetScreens.length === 1 ? "" : "s"}</h2>
    <div class="stack-note">${targetScreens.map((screen) => escapeHtml(screen.name)).join(" - ")}</div>
    <div class="field"><label>Playlist</label><select name="playlist_id">${playlistOptions()}</select></div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Publish</button></div>
  `, async (formData) => {
    await api("/api/screens/assign-many", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screen_ids: targetScreens.map((screen) => screen.id), playlist_id: Number(formData.get("playlist_id")) }),
    });
    toast(`Playlist published to ${targetScreens.length} screen${targetScreens.length === 1 ? "" : "s"}`);
    await refresh();
  });
}

function openBulkStop(allScreens = false) {
  const targetScreens = allScreens ? state.screens : selectedScreenList();
  if (!targetScreens.length) return toast("Select screens first");
  showModal(`
    <p class="eyebrow">STOP PLAYBACK</p>
    <h2>Stop ${targetScreens.length} screen${targetScreens.length === 1 ? "" : "s"}</h2>
    <div class="stack-note">${targetScreens.map((screen) => escapeHtml(screen.name)).join(" - ")}</div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Stop now</button></div>
  `, async () => {
    await api("/api/screens/stop-many", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screen_ids: targetScreens.map((screen) => screen.id) }),
    });
    toast(`Playback stopped on ${targetScreens.length} screen${targetScreens.length === 1 ? "" : "s"}`);
    await refresh();
  });
}

async function openDiscovery() {
  $("#discover-screens").disabled = true;
  try {
    const result = await api("/api/network/discover");
    const devices = result.devices || [];
    showModal(`
      <p class="eyebrow">NETWORK DISCOVERY</p>
      <h2>Visible devices on this network</h2>
      <p class="modal-copy">OpenMarquee lists devices your computer can currently see through the local ARP table. Add the ones you want to manage.</p>
      <div class="discover-list">
        ${devices.length ? devices.map((device) => `
          <label class="discover-row">
            <input type="checkbox" name="device" value="${escapeHtml(device.ip_address)}|${escapeHtml(device.hostname || "")}">
            <span>
              <strong>${escapeHtml(device.hostname || "Unknown device")}</strong>
              <small>${escapeHtml(device.ip_address)} - ${escapeHtml(device.mac_address)}</small>
            </span>
            <em>${device.already_added ? "Already added" : "Available"}</em>
          </label>
        `).join("") : '<p class="empty">No visible devices were found. You can still add screens manually by name or IP.</p>'}
      </div>
      <div class="modal-footer">${modalCancelButton("Close")}<button class="primary">Add selected</button></div>
    `, async (formData) => {
      const selections = formData.getAll("device").map((value) => String(value).split("|"));
      const available = selections.filter(([ip]) => !state.screens.some((screen) => screen.ip_address === ip));
      if (!available.length) throw new Error("Select at least one new device");
      for (const [ip, hostname] of available) {
        const payload = new FormData();
        payload.set("name", hostname || `Screen ${ip}`);
        payload.set("ip_address", ip);
        payload.set("orientation", "landscape");
        payload.set("brand", "unknown");
        payload.set("runtime", "browser");
        payload.set("notes", "Added from network discovery");
        await api("/api/screens", { method: "POST", body: payload });
      }
      toast(`${available.length} screen${available.length === 1 ? "" : "s"} added`);
      await refresh();
    });
  } finally {
    $("#discover-screens").disabled = false;
  }
}

function renderLiveTargets() {
  const list = $("#live-screen-list");
  if (!list) return;
  const validIds = new Set(state.screens.map((screen) => screen.id));
  [...liveShare.selected].forEach((screenId) => {
    if (!validIds.has(screenId)) liveShare.selected.delete(screenId);
  });
  list.innerHTML = state.screens.map((screen) => `
    <label class="live-target">
      <input type="checkbox" data-live-screen="${screen.id}" ${liveShare.selected.has(screen.id) ? "checked" : ""} ${liveShare.active ? "disabled" : ""}>
      <span><strong>${escapeHtml(screen.name)}</strong><small>${escapeHtml(screen.brand || "Unknown brand")} - ${escapeHtml(screen.ip_address || "Player link")}</small></span>
      <em>${screen.online ? "Player online" : "Player offline"}</em>
    </label>
  `).join("") || '<p class="empty">Add and pair a screen before starting a live share.</p>';
}

async function loadLocalDisplays() {
  const container = $("#local-display-list");
  if (!container || !state.auth.authenticated) return;
  const result = await api("/api/local/displays");
  const displays = result.displays || [];
  container.innerHTML = displays.length ? displays.map((display, index) => `
    <span class="local-display-chip">
      <strong>${display.primary ? "Primary" : `Display ${index + 1}`} - ${escapeHtml(display.device || "Connected screen")}</strong>
      <span>${Number(display.width || 0)} x ${Number(display.height || 0)}${display.primary ? " - Main display" : ""}</span>
    </span>
  `).join("") : '<span>Display names will appear in the browser sharing picker.</span>';
}

function setLiveShareUi(active, message = "Ready") {
  liveShare.active = active;
  $("#stop-live-share").disabled = !active;
  $("#live-select-all").disabled = active;
  $$(".share-source").forEach((button) => { button.disabled = active; });
  $("#live-share-status").textContent = message;
  $("#live-share-status").className = `badge ${active ? "online" : ""}`;
  const showStream = active && !liveShare.filePresentation;
  $("#live-share-preview").style.display = showStream ? "block" : "none";
  $("#live-preview-empty").style.display = showStream ? "none" : "grid";
  renderLiveTargets();
}

function liveSocketUrl(path) {
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}${path}`;
}

function sendLiveSignal(message) {
  if (liveShare.socket?.readyState === WebSocket.OPEN) liveShare.socket.send(JSON.stringify(message));
}

function updateLiveViewerCount() {
  const connected = [...liveShare.peers.values()].filter((peer) => ["connected", "completed"].includes(peer.connectionState)).length;
  $("#live-viewer-count").textContent = `${connected} viewer${connected === 1 ? "" : "s"}`;
}

async function createLiveSender(screenId, instanceId) {
  if (!liveShare.stream) return;
  const key = `${screenId}:${instanceId}`;
  liveShare.peers.get(key)?.close();
  const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  peer.pendingCandidates = [];
  liveShare.peers.set(key, peer);
  liveShare.stream.getTracks().forEach((track) => peer.addTrack(track, liveShare.stream));
  peer.onicecandidate = (event) => {
    if (event.candidate) sendLiveSignal({ type: "ice", screen_id: screenId, instance_id: instanceId, candidate: event.candidate });
  };
  peer.onconnectionstatechange = () => {
    updateLiveViewerCount();
    if (peer.connectionState === "disconnected") {
      window.clearTimeout(peer.recoveryTimer);
      peer.recoveryTimer = window.setTimeout(() => {
        if (liveShare.stream && liveShare.peers.get(key) === peer && peer.connectionState === "disconnected") createLiveSender(screenId, instanceId).catch(() => {});
      }, 4000);
    }
    if (peer.connectionState === "failed") {
      if (liveShare.peers.get(key) === peer) liveShare.peers.delete(key);
      if (liveShare.stream) window.setTimeout(() => createLiveSender(screenId, instanceId).catch(() => {}), 800);
    }
    if (peer.connectionState === "closed" && liveShare.peers.get(key) === peer) liveShare.peers.delete(key);
  };
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  sendLiveSignal({ type: "offer", screen_id: screenId, instance_id: instanceId, description: peer.localDescription });
}

function connectLiveAdminSocket() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(liveSocketUrl("/ws/live/admin"));
    liveShare.socket = socket;
    const timeout = window.setTimeout(() => reject(new Error("Live connection timed out")), 8000);
    socket.onmessage = async (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "registered") {
        window.clearTimeout(timeout);
        liveShare.sessionId = message.session_id;
        resolve();
      } else if (message.type === "player-ready") {
        await createLiveSender(message.screen_id, message.instance_id);
      } else if (message.type === "answer") {
        const peer = liveShare.peers.get(`${message.screen_id}:${message.instance_id}`);
        if (peer && message.description) {
          await peer.setRemoteDescription(message.description);
          for (const candidate of peer.pendingCandidates.splice(0)) await peer.addIceCandidate(candidate).catch(() => {});
        }
      } else if (message.type === "ice") {
        const peer = liveShare.peers.get(`${message.screen_id}:${message.instance_id}`);
        if (peer && message.candidate) {
          if (peer.remoteDescription) await peer.addIceCandidate(message.candidate).catch(() => {});
          else peer.pendingCandidates.push(message.candidate);
        }
      } else if (message.type === "player-left") {
        const key = `${message.screen_id}:${message.instance_id}`;
        liveShare.peers.get(key)?.close();
        liveShare.peers.delete(key);
        updateLiveViewerCount();
      } else if (message.type === "player-error") {
        toast(`Player could not start the live feed: ${message.detail || "unknown playback error"}`);
      }
    };
    socket.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Could not open the live-share connection"));
    };
    socket.onclose = () => {
      if (liveShare.stream) stopLiveShare(false);
    };
  });
}

async function startLiveShare(displaySurface = "monitor") {
  if (!liveShare.selected.size) throw new Error("Select at least one target screen");
  if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("Screen sharing requires HTTPS or localhost in a supported browser");
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { displaySurface, frameRate: { ideal: 30, max: 60 } },
    audio: true,
  });
  liveShare.stream = stream;
  $("#live-share-preview").srcObject = stream;
  const videoTrack = stream.getVideoTracks()[0];
  videoTrack.addEventListener("ended", () => stopLiveShare());
  videoTrack.addEventListener("mute", () => {
    if (liveShare.active) setLiveShareUi(true, "Source paused by the operating system");
  });
  videoTrack.addEventListener("unmute", () => {
    if (liveShare.active) setLiveShareUi(true, stream.getAudioTracks().length ? "Live with audio" : "Live - no audio selected");
  });
  try {
    await connectLiveAdminSocket();
    sendLiveSignal({ type: "live-start", screen_ids: [...liveShare.selected] });
    const sourceLabel = { monitor: "display", window: "window", browser: "browser tab" }[displaySurface] || "screen";
    setLiveShareUi(true, stream.getAudioTracks().length ? `Live ${sourceLabel} with audio` : `Live ${sourceLabel} - no audio selected`);
    toast(`Live share started for ${liveShare.selected.size} screen${liveShare.selected.size === 1 ? "" : "s"}`);
  } catch (error) {
    await stopLiveShare(false);
    throw error;
  }
}

async function stopLiveShare(notify = true) {
  if (liveShare.filePresentation && liveShare.presentationScreenIds.length) {
    await api("/api/screens/stop-presentation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ screen_ids: liveShare.presentationScreenIds }),
    }).catch(() => {});
  }
  sendLiveSignal({ type: "live-stop" });
  liveShare.peers.forEach((peer) => peer.close());
  liveShare.peers.clear();
  liveShare.stream?.getTracks().forEach((track) => track.stop());
  liveShare.stream = null;
  if (liveShare.socket) {
    const socket = liveShare.socket;
    liveShare.socket = null;
    socket.close();
  }
  $("#live-share-preview").srcObject = null;
  liveShare.sessionId = "";
  liveShare.filePresentation = false;
  liveShare.presentationScreenIds = [];
  $("#live-preview-empty strong").textContent = "Your live preview appears here";
  updateLiveViewerCount();
  setLiveShareUi(false, "Ready");
  if (notify) toast("Live share stopped; playlists resumed");
}

async function presentLocalFile(file) {
  if (!file) return;
  if (!liveShare.selected.size) throw new Error("Select at least one destination screen");
  const screenIds = [...liveShare.selected];
  setLiveShareUi(true, "Uploading presentation...");
  try {
    const upload = new FormData();
    upload.append("file", file);
    const media = await api("/api/media", { method: "POST", body: upload });
    await api("/api/screens/present-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ media_id: media.id, screen_ids: screenIds }),
    });
    liveShare.filePresentation = true;
    liveShare.presentationScreenIds = screenIds;
    $("#live-preview-empty strong").textContent = file.name;
    setLiveShareUi(true, `Presenting ${file.name}`);
    toast(`Presenting on ${screenIds.length} screen${screenIds.length === 1 ? "" : "s"}`);
    await refresh();
  } catch (error) {
    liveShare.filePresentation = false;
    liveShare.presentationScreenIds = [];
    setLiveShareUi(false, "Ready");
    throw error;
  }
}

async function openPasswordModal() {
  await showModal(`
    <p class="eyebrow">SECURITY</p>
    <h2>Change admin password</h2>
    <div class="field"><label>Current password</label><input name="current_password" type="password" required></div>
    <div class="field"><label>New password</label><input name="new_password" type="password" minlength="8" required></div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Save password</button></div>
  `, async (formData) => {
    await api("/api/auth/password", { method: "POST", body: formData });
    toast("Password updated");
    const session = await api("/api/auth/session");
    setAuthState(session);
  });
}

function openShutdownModal() {
  showModal(`
    <p class="eyebrow">ADMIN CONTROL</p>
    <h2>Shut down OpenMarquee?</h2>
    <p class="modal-copy">This stops live sharing, closes player connections, and shuts down the local OpenMarquee service. It does not shut down this computer. Start it again from the Desktop shortcut.</p>
    <div class="stack-note"><i class="fa-solid fa-triangle-exclamation"></i> Only an authenticated administrator can perform this action.</div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary danger-solid"><i class="fa-solid fa-power-off"></i><span>Stop and shut down</span></button></div>
  `, async () => {
    await api("/api/system/shutdown", { method: "POST" });
    $("#modal").close();
    $("#shutdown-overlay").hidden = false;
  });
}

async function openMfaModal() {
  if (state.auth.mfa_enabled) {
    await showModal(`
      <p class="eyebrow">SECURITY</p>
      <h2>Disable MFA</h2>
      <div class="field"><label>Admin password</label><input name="password" type="password" required></div>
      <div class="field"><label>Current MFA code</label><input name="otp" inputmode="numeric" maxlength="6" required></div>
      <p class="helper-text">MFA codes rotate every 10 seconds.</p>
      <div class="modal-footer">${modalCancelButton()}<button class="primary">Disable MFA</button></div>
    `, async (formData) => {
      await api("/api/auth/mfa/disable", { method: "POST", body: formData });
      toast("MFA disabled");
      setAuthState(await api("/api/auth/session"));
    });
    return;
  }

  const setup = await api("/api/auth/mfa/setup", { method: "POST" });
  await showModal(`
    <p class="eyebrow">SECURITY</p>
    <h2>Enable MFA</h2>
    <div class="field"><label>Authenticator secret</label><input value="${escapeHtml(setup.secret)}" readonly></div>
    <div class="field"><label>OTP URI</label><input value="${escapeHtml(setup.uri)}" readonly></div>
    <div class="field"><label>First MFA code</label><input name="otp" inputmode="numeric" maxlength="6" required></div>
    <p class="helper-text">Add the secret to Google Authenticator, Microsoft Authenticator, 1Password, or another TOTP app. Codes rotate every ${setup.period_seconds} seconds.</p>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Enable MFA</button></div>
  `, async (formData) => {
    await api("/api/auth/mfa/enable", { method: "POST", body: formData });
    toast("MFA enabled");
    setAuthState(await api("/api/auth/session"));
  });
}

window.toggleScreenSelection = (screenId, checked) => {
  if (checked) selectedScreens.add(screenId);
  else selectedScreens.delete(screenId);
  renderSelectionState();
};

window.removeMedia = async (mediaId) => {
  if (!confirm("Delete this media file?")) return;
  await api(`/api/media/${mediaId}`, { method: "DELETE" });
  await refresh();
};

window.editMedia = async (mediaId) => {
  const media = state.media.find((item) => item.id === mediaId);
  if (!media) return;
  if (media.kind === "text") return openTextBuilder(media);
  if (media.kind === "countdown") return openCountdownBuilder(media);
};

window.renameMedia = async (mediaId) => {
  const media = state.media.find((item) => item.id === mediaId);
  if (!media) return;
  showModal(`
    <p class="eyebrow">MEDIA DETAILS</p>
    <h2>Rename media</h2>
    <div class="field"><label>Display name</label><input name="name" value="${escapeHtml(media.name)}" required></div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Save name</button></div>
  `, async (formData) => {
    await api(`/api/media/${mediaId}/name`, { method: "PUT", body: formData });
    toast("Media renamed");
    await refresh();
  });
};

window.moveMedia = async (mediaId) => {
  const media = state.media.find((item) => item.id === mediaId);
  if (!media) return;
  showModal(`
    <p class="eyebrow">MEDIA ORGANIZATION</p>
    <h2>Move media</h2>
    <div class="field"><label>Folder</label><select name="folder_id">${folderSelectOptions(media.folder_id || 0, true)}</select></div>
    <div class="modal-footer">${modalCancelButton()}<button class="primary">Save folder</button></div>
  `, async (formData) => {
    await api(`/api/media/${mediaId}/folder`, { method: "PUT", body: formData });
    toast("Media moved");
    await refresh();
  });
};

$$(".nav").forEach((item) => { item.onclick = () => go(item.dataset.view); });
$$("[data-go]").forEach((item) => { item.onclick = () => go(item.dataset.go); });
document.addEventListener("click", async (event) => {
  const liveTarget = event.target.closest("[data-live-screen]");
  if (liveTarget) {
    const screenId = Number(liveTarget.dataset.liveScreen);
    if (liveTarget.checked) liveShare.selected.add(screenId);
    else liveShare.selected.delete(screenId);
    return;
  }
  const folderFilter = event.target.closest("[data-folder-filter]");
  if (folderFilter) {
    state.activeFolderId = folderFilter.dataset.folderFilter;
    render();
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const screenId = Number(button.dataset.screenId || 0);
  const playlistId = Number(button.dataset.playlistId || 0);
  const mediaId = Number(button.dataset.mediaId || 0);
  try {
    if (button.dataset.action === "assign-screen" && screenId) await window.assignOne(screenId);
    if (button.dataset.action === "stop-screen" && screenId) await window.stopOne(screenId);
    if (button.dataset.action === "copy-player-link" && screenId) await window.copyPlayerLink(screenId);
    if (button.dataset.action === "copy-pairing-code" && screenId) await window.copyPairingCode(screenId);
    if (button.dataset.action === "regen-code" && screenId) await window.regeneratePairingCode(screenId);
    if (button.dataset.action === "edit-screen" && screenId) await window.editScreen(screenId);
    if (button.dataset.action === "delete-screen" && screenId) await window.deleteScreen(screenId);
    if (button.dataset.action === "edit-media" && mediaId) await window.editMedia(mediaId);
    if (button.dataset.action === "rename-media" && mediaId) await window.renameMedia(mediaId);
    if (button.dataset.action === "delete-media" && mediaId) await window.removeMedia(mediaId);
    if (button.dataset.action === "move-media" && mediaId) await window.moveMedia(mediaId);
    if (button.dataset.action === "edit-playlist" && playlistId) await window.editPlaylist(playlistId);
    if (button.dataset.action === "delete-playlist" && playlistId) await window.deletePlaylist(playlistId);
  } catch (error) {
    toast(error.message);
  }
});

document.addEventListener("change", (event) => {
  const selector = event.target.closest("[data-screen-select]");
  if (!selector) return;
  window.toggleScreenSelection(Number(selector.dataset.screenSelect), selector.checked);
});

$("#auth-form").onsubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  try {
    await api("/api/auth/login", { method: "POST", body: formData });
    $("#auth-form").reset();
    lastAdminActivity = Date.now();
    lastSessionTouch = Date.now();
    await checkSession();
    toast("Signed in");
  } catch (error) {
    toast(error.message);
  }
};

$("#logout-button").onclick = () => logoutAdmin("Signed out");

$("#change-password").onclick = () => openPasswordModal();
$("#mfa-button").onclick = () => openMfaModal();
$("#shutdown-software").onclick = openShutdownModal;

$("#file-input").onchange = async (event) => {
  for (const file of event.target.files) {
    const formData = new FormData();
    if (state.activeFolderId !== "all") formData.append("folder_id", String(Number(state.activeFolderId) || 0));
    formData.append("file", file);
    try {
      await api("/api/media", { method: "POST", body: formData });
      toast(`${file.name} uploaded`);
    } catch (error) {
      toast(error.message);
    }
  }
  event.target.value = "";
  await refresh();
};

$("#new-screen").onclick = openCreateScreen;
$("#new-playlist").onclick = openPlaylistBuilder;
$("#new-source").onclick = openSourceBuilder;
$("#new-folder").onclick = openFolderBuilder;
$("#manage-folders").onclick = openFolderManager;
$("#new-text").onclick = openTextBuilder;
$("#new-countdown").onclick = () => openCountdownBuilder();
$("#discover-screens").onclick = openDiscovery;
$("#assign-selected").onclick = () => openBulkAssign(false);
$("#assign-all").onclick = () => openBulkAssign(true);
$("#stop-selected").onclick = () => openBulkStop(false);
$("#stop-all").onclick = () => openBulkStop(true);
$("#live-select-all").onclick = () => {
  const allSelected = state.screens.length > 0 && state.screens.every((screen) => liveShare.selected.has(screen.id));
  liveShare.selected.clear();
  if (!allSelected) state.screens.forEach((screen) => liveShare.selected.add(screen.id));
  renderLiveTargets();
};
$$('[data-share-surface]').forEach((button) => {
  button.onclick = () => startLiveShare(button.dataset.shareSurface).catch((error) => toast(error.message));
});
$("#present-local-file").onclick = () => {
  if (!liveShare.selected.size) return toast("Select at least one destination screen");
  $("#live-file-input").click();
};
$("#live-file-input").onchange = async (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  try {
    await presentLocalFile(file);
  } catch (error) {
    toast(error.message);
  }
};
$("#open-localhost").onclick = () => {
  const port = location.port ? `:${location.port}` : "";
  location.href = `${location.protocol}//localhost${port}${location.pathname}${location.search}${location.hash}`;
};
$("#stop-live-share").onclick = () => stopLiveShare();
$("#select-all").onchange = (event) => {
  if (event.target.checked) state.screens.forEach((screen) => selectedScreens.add(screen.id));
  else selectedScreens.clear();
  render();
};

checkSession().catch((error) => toast(error.message)).finally(() => {
  document.body.classList.remove("app-loading");
});
$("#live-secure-note").hidden = window.isSecureContext || ["localhost", "127.0.0.1", "::1"].includes(location.hostname);
["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
  document.addEventListener(eventName, markAdminActivity, { passive: true });
});
setInterval(() => {
  if (!state.auth.authenticated) return;
  const idleMs = Date.now() - lastAdminActivity;
  if (idleMs >= ADMIN_IDLE_MS) {
    logoutAdmin("Signed out after 10 minutes of inactivity");
    return;
  }
  refresh(idleMs > 60000).catch(() => {});
}, 30000);
