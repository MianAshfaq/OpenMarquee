const state = { media: [], playlists: [], screens: [], auth: { authenticated: false, username: "admin", mfa_enabled: false, bootstrap_path: null } };
const selectedScreens = new Set();

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
  $("#auth-username").value = state.auth.username || "admin";
  $("#auth-otp-row").style.display = state.auth.mfa_enabled ? "grid" : "none";
  $("#session-user").textContent = state.auth.username || "admin";
  $("#mfa-state").textContent = state.auth.mfa_enabled ? "MFA on" : "MFA off";
  $("#bootstrap-note").innerHTML = state.auth.bootstrap_path
    ? `Default login is <strong>admin</strong> / <strong>admin@123</strong>. Bootstrap file: <code>${escapeHtml(state.auth.bootstrap_path)}</code>`
    : "Default login is <strong>admin</strong> / <strong>admin@123</strong> until you change it.";
}

async function checkSession() {
  const session = await api("/api/auth/session");
  setAuthState(session);
  if (session.authenticated) await refresh();
}

async function refresh() {
  if (!state.auth.authenticated) return;
  const next = await api("/api/dashboard");
  state.media = next.media || [];
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
  for (const id of [...selectedScreens]) {
    if (!state.screens.some((screen) => screen.id === id)) selectedScreens.delete(id);
  }
  render();
}

function screenMeta(screen) {
  const parts = [
    `Pairing code: <strong>${screen.code}</strong>`,
    `Brand: ${escapeHtml(screenBrandLabel(screen.brand || "unknown"))}`,
    screen.model ? `Model: ${escapeHtml(screen.model)}` : null,
    `Runtime: ${escapeHtml(screenRuntimeLabel(screen.runtime || "browser"))}`,
    `Orientation: ${escapeHtml(screen.orientation)}`,
    screen.ip_address ? `IP: ${escapeHtml(screen.ip_address)}` : "IP: Not saved",
    `Playlist: ${escapeHtml(screenPlaylistName(screen))}`,
  ].filter(Boolean);
  if (screen.notes) parts.push(`Notes: ${escapeHtml(screen.notes)}`);
  return parts.join("<br>");
}

function networkBadgeClass(screen) {
  if (screen.network_status === "reachable") return "network-ok";
  if (screen.network_status === "invalid_ip") return "network-warn";
  return "offline";
}

function overviewScreenCard(screen) {
  return `
    <article class="card">
      <div class="card-body">
        <div class="badge-row">
          <span class="badge ${screen.online ? "online" : "offline"}">${escapeHtml(screen.player_status_label)}</span>
          <span class="badge ${networkBadgeClass(screen)}">${escapeHtml(screen.network_status_label)}</span>
        </div>
        <h3>${escapeHtml(screen.name)}</h3>
        <p>${screenMeta(screen)}</p>
        <div class="card-actions">
          <button class="secondary" onclick="assignOne(${screen.id})"><i class="fa-solid fa-photo-film"></i><span>Assign</span></button>
          <button class="secondary" onclick="stopOne(${screen.id})"><i class="fa-solid fa-stop"></i><span>Stop</span></button>
          <button class="secondary" onclick="copyPlayerLink(${screen.id})"><i class="fa-solid fa-link"></i><span>Player link</span></button>
        </div>
      </div>
    </article>
  `;
}

function fleetScreenCard(screen) {
  return `
    <article class="card">
      <div class="card-body">
        <label class="screen-select">
          <input type="checkbox" ${selectedScreens.has(screen.id) ? "checked" : ""} onchange="toggleScreenSelection(${screen.id}, this.checked)">
          <span>Select</span>
        </label>
        <div class="badge-row">
          <span class="badge ${screen.online ? "online" : "offline"}">${escapeHtml(screen.player_status_label)}</span>
          <span class="badge ${networkBadgeClass(screen)}">${escapeHtml(screen.network_status_label)}</span>
        </div>
        <h3>${escapeHtml(screen.name)}</h3>
        <p>${screenMeta(screen)}</p>
        <div class="card-actions">
          <button class="secondary" onclick="assignOne(${screen.id})"><i class="fa-solid fa-play"></i><span>Publish</span></button>
          <button class="secondary" onclick="stopOne(${screen.id})"><i class="fa-solid fa-stop"></i><span>Stop</span></button>
          <button class="secondary" onclick="copyPlayerLink(${screen.id})"><i class="fa-solid fa-link"></i><span>Link</span></button>
          <button class="secondary" onclick="editScreen(${screen.id})"><i class="fa-solid fa-pen"></i><span>Edit</span></button>
          <button class="secondary danger" onclick="deleteScreen(${screen.id})"><i class="fa-solid fa-trash"></i><span>Delete</span></button>
        </div>
      </div>
    </article>
  `;
}

function mediaCard(media) {
  const mediaUrl = media.source_url || `/media/${media.filename}`;
  const preview = media.kind === "video"
    ? `<video src="${escapeHtml(mediaUrl)}" muted></video>`
    : media.kind === "image"
      ? `<img src="${escapeHtml(mediaUrl)}" alt="">`
      : `<div class="media-type-tile"><strong>${escapeHtml(mediaTypeLabel(media.kind))}</strong><span>${media.source_url ? "URL source" : "Uploaded asset"}</span></div>`;

  return `
    <article class="card">
      <div class="media-preview">${preview}</div>
      <div class="card-body">
        <h3>${escapeHtml(media.name)}</h3>
        <p>${escapeHtml(mediaTypeLabel(media.kind))} - ${media.size ? bytes(media.size) : "Remote source"}</p>
        <button class="secondary danger" onclick="removeMedia(${media.id})"><i class="fa-solid fa-trash"></i><span>Delete</span></button>
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
          <button class="secondary" onclick="editPlaylist(${playlist.id})"><i class="fa-solid fa-pen"></i><span>Edit</span></button>
          <button class="secondary danger" onclick="deletePlaylist(${playlist.id})"><i class="fa-solid fa-trash"></i><span>Delete</span></button>
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

function render() {
  $("#screen-count").textContent = state.screens.length;
  $("#online-count").textContent = `${state.screens.filter((screen) => screen.online).length} online now`;
  $("#media-count").textContent = state.media.length;
  $("#playlist-count").textContent = state.playlists.length;

  $("#overview-screens").innerHTML = state.screens.map(overviewScreenCard).join("") || '<p class="empty">No screens paired yet.</p>';
  $("#screen-grid").innerHTML = state.screens.map(fleetScreenCard).join("") || '<p class="empty">No screens added yet. Start with manual entry or network discovery.</p>';
  $("#media-grid").innerHTML = state.media.map(mediaCard).join("") || '<p class="empty">Your library is ready for its first asset or live source.</p>';
  $("#playlist-grid").innerHTML = state.playlists.map(playlistCard).join("") || '<p class="empty">Create a playlist after uploading media or adding a source.</p>';
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
  }[view];
}

async function showModal(html, onSubmit) {
  const dialog = $("#modal");
  $("#modal-body").innerHTML = html;
  dialog.showModal();
  dialog.querySelector("form").onsubmit = async (event) => {
    if (event.submitter?.value === "cancel") return;
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
    <div class="field"><label>IP address</label><input name="ip_address" placeholder="192.168.1.20" value="${escapeHtml(screen?.ip_address || "")}"></div>
    <p class="helper-text">IP reachability and player connection are separate. The best production setup is a managed player app or kiosk runtime on the screen device.</p>
    <div class="field"><label>Orientation</label><select name="orientation"><option value="landscape" ${screen?.orientation !== "portrait" ? "selected" : ""}>Landscape</option><option value="portrait" ${screen?.orientation === "portrait" ? "selected" : ""}>Portrait</option></select></div>
    <div class="field"><label>Notes</label><input name="notes" placeholder="Lobby Samsung panel" value="${escapeHtml(screen?.notes || "")}"></div>
    <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">${isEdit ? "Save changes" : "Create screen"}</button></div>
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
          <button class="secondary danger" type="button" onclick="removePlaylistRow(${itemIndex})">Remove</button>
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
    <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">Save playlist</button></div>
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
  };
  window.removePlaylistRow = (rowIndex) => {
    const removed = window.playlistDraft.splice(rowIndex, 1)[0];
    const checkbox = $(`input[name="media_pick"][value="${removed.media_id}"]`);
    if (checkbox) checkbox.checked = false;
    rebuild();
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
    <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">Create playlist</button></div>
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
    <div class="field"><label>URL</label><input name="source_url" placeholder="https://..." required></div>
    <p class="helper-text">Use direct or embeddable links for dashboards, widgets, live channels, presentations, and web content.</p>
    <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">Add source</button></div>
  `, async (formData) => {
    await api("/api/library/url", { method: "POST", body: formData });
    toast("Source added");
    await refresh();
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
    <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">Publish</button></div>
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
  await navigator.clipboard.writeText(playerUrl(screen));
  toast("Player link copied");
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
    <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">Publish</button></div>
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
    <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">Stop now</button></div>
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
      <div class="modal-footer"><button class="secondary" value="cancel">Close</button><button class="primary">Add selected</button></div>
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

async function openPasswordModal() {
  await showModal(`
    <p class="eyebrow">SECURITY</p>
    <h2>Change admin password</h2>
    <div class="field"><label>Current password</label><input name="current_password" type="password" required></div>
    <div class="field"><label>New password</label><input name="new_password" type="password" minlength="8" required></div>
    <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">Save password</button></div>
  `, async (formData) => {
    await api("/api/auth/password", { method: "POST", body: formData });
    toast("Password updated");
    const session = await api("/api/auth/session");
    setAuthState(session);
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
      <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">Disable MFA</button></div>
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
    <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">Enable MFA</button></div>
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

$$(".nav").forEach((item) => { item.onclick = () => go(item.dataset.view); });
$$("[data-go]").forEach((item) => { item.onclick = () => go(item.dataset.go); });

$("#auth-form").onsubmit = async (event) => {
  event.preventDefault();
  const formData = new FormData(event.target);
  try {
    await api("/api/auth/login", { method: "POST", body: formData });
    $("#auth-form").reset();
    await checkSession();
    toast("Signed in");
  } catch (error) {
    toast(error.message);
  }
};

$("#logout-button").onclick = async () => {
  await api("/api/auth/logout", { method: "POST" });
  setAuthState({ authenticated: false, username: state.auth.username, mfa_enabled: state.auth.mfa_enabled, bootstrap_path: state.auth.bootstrap_path });
  toast("Signed out");
};

$("#change-password").onclick = () => openPasswordModal();
$("#mfa-button").onclick = () => openMfaModal();

$("#file-input").onchange = async (event) => {
  for (const file of event.target.files) {
    const formData = new FormData();
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
$("#discover-screens").onclick = openDiscovery;
$("#assign-selected").onclick = () => openBulkAssign(false);
$("#assign-all").onclick = () => openBulkAssign(true);
$("#stop-selected").onclick = () => openBulkStop(false);
$("#stop-all").onclick = () => openBulkStop(true);
$("#select-all").onchange = (event) => {
  if (event.target.checked) state.screens.forEach((screen) => selectedScreens.add(screen.id));
  else selectedScreens.clear();
  render();
};

checkSession().catch((error) => toast(error.message));
setInterval(() => refresh().catch(() => {}), 30000);
