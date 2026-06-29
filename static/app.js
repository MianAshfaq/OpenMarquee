let state = { media: [], playlists: [], screens: [] };
const selectedScreens = new Set();

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const api = async (url, options = {}) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = "Request failed";
    try {
      detail = (await response.json()).detail || detail;
    } catch {}
    throw new Error(detail);
  }
  return response.json();
};

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2400);
}

function bytes(value) {
  return value > 1048576 ? `${(value / 1048576).toFixed(1)} MB` : `${Math.ceil(value / 1024)} KB`;
}

function escapeHtml(value) {
  const el = document.createElement("div");
  el.textContent = value ?? "";
  return el.innerHTML;
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
  return {
    full: "Full screen",
    "split-2": "Split 2",
    "split-4": "Split 4",
  }[mode] || "Full screen";
}

function fitLabel(mode) {
  return {
    contain: "Show complete",
    cover: "Fill screen",
  }[mode] || "Show complete";
}

function transitionLabel(mode) {
  return {
    none: "No transition",
    fade: "Fade",
    "slide-left": "Slide left",
    "slide-right": "Slide right",
    "slide-up": "Slide up",
    "slide-down": "Slide down",
    "zoom-in": "Zoom in",
    "zoom-out": "Zoom out",
    push: "Push",
    wipe: "Wipe",
    dissolve: "Dissolve",
    flip: "Flip",
    rotate: "Rotate",
    cube: "Cube",
    blur: "Blur",
    crossfade: "Crossfade",
    split: "Split",
    circle: "Circle reveal",
    curtain: "Curtain",
    random: "Random",
  }[mode] || "Fade";
}

function mediaById(mediaId) {
  return state.media.find((item) => item.id === Number(mediaId));
}

function selectedScreenList() {
  return state.screens.filter((screen) => selectedScreens.has(screen.id));
}

function screenPlaylistName(screen) {
  const playlist = state.playlists.find((item) => item.id === screen.playlist_id);
  return playlist ? playlist.name : "No playlist assigned";
}

async function refresh() {
  state = await api("/api/dashboard");
  for (const playlist of state.playlists) {
    playlist.layout_mode = playlist.layout_mode || "full";
    playlist.fit_mode = playlist.fit_mode || "contain";
  }
  for (const id of [...selectedScreens]) {
    if (!state.screens.some((screen) => screen.id === id)) selectedScreens.delete(id);
  }
  render();
}

function screenMeta(screen) {
  const parts = [
    `Pairing code: <strong>${screen.code}</strong>`,
    `Orientation: ${escapeHtml(screen.orientation)}`,
    screen.ip_address ? `IP: ${escapeHtml(screen.ip_address)}` : "IP: Not saved",
    `Playlist: ${escapeHtml(screenPlaylistName(screen))}`,
  ];
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
          <button class="secondary" onclick="assignOne(${screen.id})">Assign playlist</button>
          <button class="secondary" onclick="editScreen(${screen.id})">Edit</button>
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
          <button class="secondary" onclick="assignOne(${screen.id})">Assign</button>
          <button class="secondary" onclick="editScreen(${screen.id})">Edit</button>
          <button class="secondary danger" onclick="deleteScreen(${screen.id})">Delete</button>
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
        <p>${escapeHtml(mediaTypeLabel(media.kind))} · ${media.size ? bytes(media.size) : "Remote source"}</p>
        <button class="secondary danger" onclick="removeMedia(${media.id})">Delete</button>
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
        <p>${escapeHtml(layoutLabel(playlist.layout_mode))} · ${escapeHtml(fitLabel(playlist.fit_mode))}</p>
        <p>${escapeHtml(transitionLabel(playlist.transition_mode || "fade"))}</p>
        <div class="card-actions">
          <button class="secondary" onclick="editPlaylist(${playlist.id})">Edit playlist</button>
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

function screenForm(screen = null) {
  const isEdit = !!screen;
  return `
    <p class="eyebrow">${isEdit ? "EDIT DEVICE" : "NEW DEVICE"}</p>
    <h2>${isEdit ? "Update screen" : "Add a screen"}</h2>
    <div class="field"><label>Screen name</label><input name="name" placeholder="Reception TV" value="${escapeHtml(screen?.name || "")}" required></div>
    <div class="field"><label>IP address</label><input name="ip_address" placeholder="192.168.1.20" value="${escapeHtml(screen?.ip_address || "")}"></div>
    <p class="helper-text">Use the real screen or player IP. OpenMarquee checks network reachability separately from the signage player connection.</p>
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
        <label>Transition</label>
        <select name="transition_mode">
          <option value="none" ${(playlist.transition_mode || "fade") === "none" ? "selected" : ""}>No transition</option>
          <option value="fade" ${(playlist.transition_mode || "fade") === "fade" ? "selected" : ""}>Fade</option>
          <option value="slide-left" ${(playlist.transition_mode || "fade") === "slide-left" ? "selected" : ""}>Slide left</option>
          <option value="slide-right" ${(playlist.transition_mode || "fade") === "slide-right" ? "selected" : ""}>Slide right</option>
          <option value="slide-up" ${(playlist.transition_mode || "fade") === "slide-up" ? "selected" : ""}>Slide up</option>
          <option value="slide-down" ${(playlist.transition_mode || "fade") === "slide-down" ? "selected" : ""}>Slide down</option>
          <option value="zoom-in" ${(playlist.transition_mode || "fade") === "zoom-in" ? "selected" : ""}>Zoom in</option>
          <option value="zoom-out" ${(playlist.transition_mode || "fade") === "zoom-out" ? "selected" : ""}>Zoom out</option>
          <option value="push" ${(playlist.transition_mode || "fade") === "push" ? "selected" : ""}>Push</option>
          <option value="wipe" ${(playlist.transition_mode || "fade") === "wipe" ? "selected" : ""}>Wipe</option>
          <option value="dissolve" ${(playlist.transition_mode || "fade") === "dissolve" ? "selected" : ""}>Dissolve</option>
          <option value="flip" ${(playlist.transition_mode || "fade") === "flip" ? "selected" : ""}>Flip</option>
          <option value="rotate" ${(playlist.transition_mode || "fade") === "rotate" ? "selected" : ""}>Rotate</option>
          <option value="cube" ${(playlist.transition_mode || "fade") === "cube" ? "selected" : ""}>Cube</option>
          <option value="blur" ${(playlist.transition_mode || "fade") === "blur" ? "selected" : ""}>Blur</option>
          <option value="crossfade" ${(playlist.transition_mode || "fade") === "crossfade" ? "selected" : ""}>Crossfade</option>
          <option value="split" ${(playlist.transition_mode || "fade") === "split" ? "selected" : ""}>Split</option>
          <option value="circle" ${(playlist.transition_mode || "fade") === "circle" ? "selected" : ""}>Circle reveal</option>
          <option value="curtain" ${(playlist.transition_mode || "fade") === "curtain" ? "selected" : ""}>Curtain</option>
          <option value="random" ${(playlist.transition_mode || "fade") === "random" ? "selected" : ""}>Random</option>
        </select>
      </div>
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
      existingRows.push({
        media_id: mediaId,
        duration: Math.max(2, Number(formData.get(`duration_${itemIndex}`) || 10)),
      });
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
      if (checkbox.checked && !existing) {
        window.playlistDraft.push({ media_id: mediaId, duration: 10 });
      }
      if (!checkbox.checked && existing) {
        window.playlistDraft = window.playlistDraft.filter((item) => Number(item.media_id) !== mediaId);
      }
      rebuild();
    };
  });
  const applyButton = $("#apply-all-button");
  const applyInput = $("#apply-all-duration");
  if (applyButton && applyInput) {
    applyButton.onclick = () => {
      const nextValue = Math.max(2, Number(applyInput.value || 10));
      $$(".playlist-duration-field input").forEach((inputEl) => {
        inputEl.value = String(nextValue);
      });
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
        <label>Transition</label>
        <select name="transition_mode">
          <option value="none">No transition</option>
          <option value="fade" selected>Fade</option>
          <option value="slide-left">Slide left</option>
          <option value="slide-right">Slide right</option>
          <option value="slide-up">Slide up</option>
          <option value="slide-down">Slide down</option>
          <option value="zoom-in">Zoom in</option>
          <option value="zoom-out">Zoom out</option>
          <option value="push">Push</option>
          <option value="wipe">Wipe</option>
          <option value="dissolve">Dissolve</option>
          <option value="flip">Flip</option>
          <option value="rotate">Rotate</option>
          <option value="cube">Cube</option>
          <option value="blur">Blur</option>
          <option value="crossfade">Crossfade</option>
          <option value="split">Split</option>
          <option value="circle">Circle reveal</option>
          <option value="curtain">Curtain</option>
          <option value="random">Random</option>
        </select>
      </div>
    </div>
    <div class="field"><label>Choose content</label><div class="picker picker-wide">${state.media.map((media) => `<label class="pick"><input type="checkbox" name="media" value="${media.id}"><span>${escapeHtml(media.name)}</span></label>`).join("")}</div></div>
    <div class="field"><label>Default duration (seconds)</label><input name="duration" type="number" min="2" value="10"></div>
    <div class="modal-footer"><button class="secondary" value="cancel">Cancel</button><button class="primary">Create playlist</button></div>
  `, async (formData) => {
    const ids = formData.getAll("media");
    if (!ids.length) throw new Error("Select at least one item");
    const payload = new FormData();
    payload.set("name", formData.get("name"));
    payload.set("layout_mode", formData.get("layout_mode"));
    payload.set("fit_mode", formData.get("fit_mode"));
    payload.set("transition_mode", formData.get("transition_mode"));
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
  if (!screen) return;
  if (!confirm(`Delete ${screen.name}?`)) return;
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
    const payload = new FormData();
    payload.set("name", formData.get("name"));
    payload.set("layout_mode", formData.get("layout_mode"));
    payload.set("fit_mode", formData.get("fit_mode"));
    payload.set("transition_mode", formData.get("transition_mode"));
    payload.set("items", JSON.stringify(items));
    await api(`/api/playlists/${playlistId}`, { method: "PUT", body: payload });
    toast("Playlist updated");
    await refresh();
  });
  bindPlaylistEditor(draftItems);
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

function openBulkAssign(allScreens = false) {
  if (!state.playlists.length) {
    toast("Create a playlist first");
    go("playlists");
    return;
  }
  const targetScreens = allScreens ? state.screens : selectedScreenList();
  if (!targetScreens.length) {
    toast("Select screens first");
    return;
  }
  showModal(`
    <p class="eyebrow">BULK PUBLISH</p>
    <h2>Assign playlist to ${targetScreens.length} screen${targetScreens.length === 1 ? "" : "s"}</h2>
    <div class="stack-note">${targetScreens.map((screen) => escapeHtml(screen.name)).join(" · ")}</div>
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
              <small>${escapeHtml(device.ip_address)} · ${escapeHtml(device.mac_address)}</small>
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

$$(".nav").forEach((item) => {
  item.onclick = () => go(item.dataset.view);
});

$$("[data-go]").forEach((item) => {
  item.onclick = () => go(item.dataset.go);
});

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
$("#select-all").onchange = (event) => {
  if (event.target.checked) state.screens.forEach((screen) => selectedScreens.add(screen.id));
  else selectedScreens.clear();
  render();
};

refresh().catch((error) => toast(error.message));
setInterval(() => refresh().catch(() => {}), 30000);
