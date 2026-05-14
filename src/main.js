const els = {
  stage: document.querySelector("#stage"),
  backgroundVideo: document.querySelector("#backgroundVideo"),
  backgroundImage: document.querySelector("#backgroundImage"),
  visualCanvas: document.querySelector("#visualCanvas"),
  panel: document.querySelector("#controlPanel"),
  showPanel: document.querySelector("#showPanel"),
  togglePanel: document.querySelector("#togglePanel"),
  songTitle: document.querySelector("#songTitle"),
  artistName: document.querySelector("#artistName"),
  syncQQMusic: document.querySelector("#syncQQMusic"),
  followQQMusic: document.querySelector("#followQQMusic"),
  autoLyrics: document.querySelector("#autoLyrics"),
  searchAigeci: document.querySelector("#searchAigeci"),
  syncStatus: document.querySelector("#syncStatus"),
  lrcFile: document.querySelector("#lrcFile"),
  lrcInput: document.querySelector("#lrcInput"),
  songMeta: document.querySelector("#songMeta"),
  lyricSwitcher: document.querySelector("#lyricSwitcher"),
  lyricSlots: [...document.querySelectorAll("[data-lyric-slot]")],
  currentLineLive: document.querySelector("#currentLineLive"),
  lineStack: document.querySelector("#lineStack"),
  emptyState: document.querySelector("#emptyState"),
  emptyTitle: document.querySelector("#emptyTitle"),
  emptyHint: document.querySelector("#emptyHint"),
  statusBox: document.querySelector("#statusBox"),
  statusPill: document.querySelector("#statusPill"),
  remoteUrl: document.querySelector("#remoteUrl"),
  copyRemoteUrl: document.querySelector("#copyRemoteUrl"),
  playPause: document.querySelector("#playPause"),
  fullscreen: document.querySelector("#fullscreen"),
  presentationMode: document.querySelector("#presentationMode"),
  reset: document.querySelector("#reset"),
  backgroundMode: document.querySelector("#backgroundMode"),
  videoFile: document.querySelector("#videoFile"),
  visualStyle: document.querySelector("#visualStyle"),
  lyricEffect: document.querySelector("#lyricEffect"),
  fontStyle: document.querySelector("#fontStyle"),
  karaokeColor: document.querySelector("#karaokeColor"),
  visualIntensity: document.querySelector("#visualIntensity"),
  visualIntensityValue: document.querySelector("#visualIntensityValue"),
  backgroundBrightness: document.querySelector("#backgroundBrightness"),
  backgroundBrightnessValue: document.querySelector("#backgroundBrightnessValue"),
  backgroundBlur: document.querySelector("#backgroundBlur"),
  backgroundBlurValue: document.querySelector("#backgroundBlurValue"),
  backgroundDim: document.querySelector("#backgroundDim"),
  backgroundDimValue: document.querySelector("#backgroundDimValue"),
  lyricStroke: document.querySelector("#lyricStroke"),
  lyricStrokeValue: document.querySelector("#lyricStrokeValue"),
  lyricShadow: document.querySelector("#lyricShadow"),
  lyricShadowValue: document.querySelector("#lyricShadowValue"),
  fontSize: document.querySelector("#fontSize"),
  lyricY: document.querySelector("#lyricY"),
  lyricYValue: document.querySelector("#lyricYValue"),
  offset: document.querySelector("#offset"),
  offsetValue: document.querySelector("#offsetValue"),
  lyricsEarlier: document.querySelector("#lyricsEarlier"),
  lyricsLater: document.querySelector("#lyricsLater")
};

let lines = [];
let startedAt = 0;
let pausedAt = 0;
let playing = false;
let activeIndex = 0;
let renderedLineIndex = -1;
let activeLyricSlot = 0;
let lyricSlotClearTimerId = 0;
let frameId = 0;
let followQQMusic = false;
let followTimerId = 0;
let followPlaybackRate = 1;
let currentTrack = null;
let lastLyricsKey = "";
let lyricsLoading = false;
let visualFrameId = 0;
let lastVisualTime = 0;
let lyricPulse = 0;
let whaleBreachAt = 0;
let fireworkBursts = [];
let starField = [];
let rainDrops = [];
let whaleGlints = [];
let backgroundMediaUrl = "";
let startupDone = false;
let lyricsSaveTimerId = 0;
let presentationModeEnabled = false;
let panelHideTimerId = 0;
let emptyStateKind = "waiting";

const LYRICS_CACHE_STORAGE_KEY = "lyric-veil:lrc-cache:v1";
const UI_SETTINGS_STORAGE_KEY = "lyric-veil:ui-settings:v1";
const MAX_LYRICS_CACHE_ENTRIES = 240;
const VIDEO_BACKGROUND_META_KEY = "lyric-veil:video-background-meta:v1";
const VIDEO_DB_NAME = "lyric-veil-assets";
const VIDEO_DB_VERSION = 1;
const VIDEO_STORE_NAME = "videos";
const VIDEO_BACKGROUND_ID = "background-video";

const visualCtx = els.visualCanvas.getContext("2d");

function setStatus(kind, text, label = "") {
  if (els.statusBox) {
    els.statusBox.dataset.statusKind = kind;
  }
  if (els.statusPill) {
    const defaultLabels = {
      idle: "待命",
      loading: "处理中",
      success: "已完成",
      warning: "注意",
      error: "失败"
    };
    els.statusPill.textContent = label || defaultLabels[kind] || defaultLabels.idle;
  }
  els.syncStatus.textContent = text;
}

function setStageCssVar(name, value) {
  document.documentElement.style.setProperty(name, value);
}

function setPlaybackVisualState() {
  const hasTrack = Boolean((currentTrack?.title || els.songTitle.value || "").trim());
  els.stage.dataset.playback = playing || followQQMusic ? "playing" : "idle";
  els.stage.dataset.hasTrack = hasTrack ? "true" : "false";
}

function setEmptyState(kind, title, hint) {
  emptyStateKind = kind;
  if (!els.emptyState) return;
  els.emptyState.dataset.kind = kind;
  els.emptyTitle.textContent = title;
  els.emptyHint.textContent = hint;
}

function hasPlaceholderLyrics() {
  return /把歌词放到这里|一行一行浮现|像光落在安静的房间/.test(els.lrcInput.value);
}

function updateEmptyState() {
  if (!els.emptyState) return;

  const hasUsableLines = lines.some((line) => line.text?.trim()) && !hasPlaceholderLyrics();
  const hasTrack = Boolean((currentTrack?.title || els.songTitle.value || "").trim() && els.songTitle.value !== "未命名歌曲");
  const shouldShow = lyricsLoading || !hasTrack || !hasUsableLines;
  els.stage.dataset.empty = shouldShow ? "true" : "false";

  if (lyricsLoading) {
    setEmptyState("loading", "正在匹配歌词", "优先查找本地歌词，找不到再尝试在线来源。");
  } else if (!hasTrack) {
    setEmptyState("waiting", "等待 QQ 音乐", "播放一首歌，歌词舞台会自动跟随。");
  } else if (!hasUsableLines) {
    setEmptyState("lyrics", "还没有可用歌词", "点击 LRC 自动匹配，或导入本地 .lrc 文件。");
  } else {
    emptyStateKind = "ready";
  }

  setPlaybackVisualState();
}

async function loadNetworkAccessInfo() {
  if (!els.remoteUrl) return;

  try {
    const response = await fetch("/api/network");
    const info = await response.json();
    const url = info?.preferred?.url || info?.local || window.location.origin;
    els.remoteUrl.textContent = url;
    els.remoteUrl.dataset.url = url;
    if (els.copyRemoteUrl) {
      els.copyRemoteUrl.disabled = false;
    }
  } catch {
    const fallback = window.location.origin;
    els.remoteUrl.textContent = fallback;
    els.remoteUrl.dataset.url = fallback;
  }
}

async function copyRemoteAccessUrl() {
  const url = els.remoteUrl?.dataset.url || els.remoteUrl?.textContent?.trim();
  if (!url || !els.copyRemoteUrl) return;

  try {
    await navigator.clipboard.writeText(url);
    els.copyRemoteUrl.textContent = "已复制";
    setStatus("success", `已复制投屏访问地址：${url}`, "投屏");
  } catch {
    window.prompt("复制这个地址到手机浏览器打开：", url);
  } finally {
    window.setTimeout(() => {
      els.copyRemoteUrl.textContent = "复制";
    }, 1400);
  }
}

function ensureGhostLine() {
  let ghostLine = els.lineStack.querySelector(".ghost-line");
  if (!ghostLine) {
    ghostLine = document.createElement("p");
    ghostLine.className = "ghost-line empty";
    ghostLine.textContent = " ";
    els.lineStack.appendChild(ghostLine);
  }
  return ghostLine;
}

function updateNextLinePreview(index = activeIndex) {
  const nextText = lines[index + 1]?.text || "";
  if (els.lineStack.dataset.text === nextText) return;
  els.lineStack.dataset.text = nextText;
  const ghostLine = ensureGhostLine();
  ghostLine.textContent = nextText || " ";
  ghostLine.classList.toggle("empty", !nextText);
}

function readUiSettings() {
  try {
    return JSON.parse(localStorage.getItem(UI_SETTINGS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveUiSettings() {
  const settings = {
    lyricEffect: els.lyricEffect.value,
    fontStyle: els.fontStyle.value,
    visualIntensity: els.visualIntensity.value,
    backgroundBrightness: els.backgroundBrightness.value,
    backgroundBlur: els.backgroundBlur.value,
    backgroundDim: els.backgroundDim.value,
    karaokeColor: els.karaokeColor.value,
    lyricStroke: els.lyricStroke.value,
    lyricShadow: els.lyricShadow.value,
    fontSize: els.fontSize.value,
    lyricY: els.lyricY.value,
    offset: els.offset.value,
    visualStyle: els.visualStyle.value,
    backgroundMode: els.backgroundMode.value
  };
  localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function applyUiSettings() {
  const settings = readUiSettings();
  const pairs = [
    ["lyricEffect", els.lyricEffect],
    ["fontStyle", els.fontStyle],
    ["visualIntensity", els.visualIntensity],
    ["backgroundBrightness", els.backgroundBrightness],
    ["backgroundBlur", els.backgroundBlur],
    ["backgroundDim", els.backgroundDim],
    ["karaokeColor", els.karaokeColor],
    ["lyricStroke", els.lyricStroke],
    ["lyricShadow", els.lyricShadow],
    ["fontSize", els.fontSize],
    ["lyricY", els.lyricY],
    ["offset", els.offset],
    ["visualStyle", els.visualStyle],
    ["backgroundMode", els.backgroundMode]
  ];

  for (const [key, el] of pairs) {
    if (settings[key] !== undefined) {
      el.value = String(settings[key]);
    }
  }
}

function applyPreset(name) {
  const presets = {
    clear: {
      backgroundBrightness: "108",
      backgroundBlur: "0",
      backgroundDim: "10",
      karaokeColor: "gold",
      lyricStroke: "1.0",
      lyricShadow: "84",
      lyricEffect: "fade",
      fontStyle: "cinema",
      lyricY: "-8"
    },
    stage: {
      backgroundBrightness: "78",
      backgroundBlur: "4",
      backgroundDim: "38",
      karaokeColor: "gold",
      lyricStroke: "1.4",
      lyricShadow: "100",
      lyricEffect: "typewriter",
      fontStyle: "modern",
      lyricY: "-6"
    },
    soft: {
      backgroundBrightness: "96",
      backgroundBlur: "10",
      backgroundDim: "24",
      karaokeColor: "cyan",
      lyricStroke: "0.5",
      lyricShadow: "68",
      lyricEffect: "rise",
      fontStyle: "soft",
      lyricY: "-10"
    }
  };

  const preset = presets[name];
  if (!preset) return;

  Object.entries(preset).forEach(([key, value]) => {
    if (els[key]) {
      els[key].value = value;
    }
  });

  syncLyricEffect();
  syncFontStyle();
  syncVisualIntensityValue();
  syncBackgroundBrightnessValue();
  syncBackgroundBlurValue();
  syncBackgroundDimValue();
  syncKaraokeColor();
  syncLyricStrokeValue();
  syncLyricShadowValue();
  syncLyricYValue();
  document.documentElement.style.setProperty("--lyric-size", `${els.fontSize.value}px`);
  fitCurrentLine();
  saveUiSettings();
  setStatus("success", `Preset applied: ${name}.`, "Preset");
}

function openAssetDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VIDEO_DB_NAME, VIDEO_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VIDEO_STORE_NAME)) {
        db.createObjectStore(VIDEO_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地视频存储。"));
  });
}

async function withVideoStore(mode, action) {
  const db = await openAssetDb();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(VIDEO_STORE_NAME, mode);
      const store = transaction.objectStore(VIDEO_STORE_NAME);
      const request = action(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("本地视频存储操作失败。"));
      transaction.onerror = () => reject(transaction.error || new Error("本地视频存储事务失败。"));
    });
  } finally {
    db.close();
  }
}

function saveVideoMeta(file) {
  localStorage.setItem(VIDEO_BACKGROUND_META_KEY, JSON.stringify({
    name: file.name,
    type: file.type,
    size: file.size,
    updatedAt: Date.now()
  }));
}

function readVideoMeta() {
  try {
    return JSON.parse(localStorage.getItem(VIDEO_BACKGROUND_META_KEY) || "null");
  } catch {
    return null;
  }
}

async function saveBackgroundVideo(file) {
  await withVideoStore("readwrite", (store) => store.put({
    id: VIDEO_BACKGROUND_ID,
    file,
    name: file.name,
    type: file.type,
    size: file.size,
    updatedAt: Date.now()
  }));
  saveVideoMeta(file);
}

async function getSavedBackgroundVideo() {
  return withVideoStore("readonly", (store) => store.get(VIDEO_BACKGROUND_ID));
}

function isGifFile(file) {
  return file?.type === "image/gif" || /\.gif$/i.test(file?.name || "");
}

function clearBackgroundMedia() {
  els.backgroundVideo.pause();
  els.backgroundVideo.removeAttribute("src");
  els.backgroundVideo.load();
  els.backgroundImage.removeAttribute("src");
}

function setBackgroundMediaFile(file) {
  if (backgroundMediaUrl) URL.revokeObjectURL(backgroundMediaUrl);
  backgroundMediaUrl = URL.createObjectURL(file);
  clearBackgroundMedia();

  if (isGifFile(file)) {
    els.backgroundImage.src = backgroundMediaUrl;
  } else {
    els.backgroundVideo.src = backgroundMediaUrl;
  }

  els.backgroundMode.value = "video";
  syncBackgroundMode();
}

async function restoreBackgroundVideo() {
  const meta = readVideoMeta();
  if (!meta) return;

  try {
    const saved = await getSavedBackgroundVideo();
    if (!saved?.file) return;
    setBackgroundMediaFile(saved.file);
    els.syncStatus.textContent = `已恢复上次视频背景：${saved.name || meta.name || "本地视频"}`;
  } catch {
    els.syncStatus.textContent = "上次的视频背景没有恢复成功，请重新导入一次。";
  }
}

function normalizeCachePart(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isCacheableTrack(title) {
  const normalizedTitle = normalizeCachePart(title);
  return normalizedTitle && normalizedTitle !== "未命名歌曲";
}

function lyricsCacheKey(title, artist) {
  return `${normalizeCachePart(title)}::${normalizeCachePart(artist)}`;
}

function readLyricsCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(LYRICS_CACHE_STORAGE_KEY) || "{}");
    return cache && typeof cache === "object" && cache.entries ? cache : { version: 1, entries: {} };
  } catch {
    return { version: 1, entries: {} };
  }
}

function writeLyricsCache(cache) {
  try {
    const entries = Object.entries(cache.entries || {})
      .sort(([, a], [, b]) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))
      .slice(0, MAX_LYRICS_CACHE_ENTRIES);
    localStorage.setItem(LYRICS_CACHE_STORAGE_KEY, JSON.stringify({ version: 1, entries: Object.fromEntries(entries) }));
    return true;
  } catch {
    return false;
  }
}

function rememberLyrics({ title, artist, lyrics, source = "手动记录" }) {
  const cleanLyrics = String(lyrics || "").trim();
  if (!isCacheableTrack(title) || !cleanLyrics) return false;

  const cache = readLyricsCache();
  const key = lyricsCacheKey(title, artist);
  cache.entries[key] = {
    title: String(title || "").trim(),
    artist: String(artist || "").trim(),
    titleKey: normalizeCachePart(title),
    artistKey: normalizeCachePart(artist),
    lyrics: cleanLyrics,
    source,
    updatedAt: Date.now()
  };

  return writeLyricsCache(cache);
}

function rememberLyricsWithLookupAlias({ title, artist, lookupTitle, lookupArtist, lyrics, source }) {
  const saved = rememberLyrics({ title, artist, lyrics, source });
  const shouldSaveAlias = lyricsCacheKey(title, artist) !== lyricsCacheKey(lookupTitle, lookupArtist);
  if (shouldSaveAlias) {
    rememberLyrics({ title: lookupTitle, artist: lookupArtist, lyrics, source });
  }
  return saved;
}

function findCachedLyrics(title, artist) {
  if (!isCacheableTrack(title)) return null;

  const cache = readLyricsCache();
  const exact = cache.entries[lyricsCacheKey(title, artist)];
  if (exact?.lyrics) return exact;

  const titleKey = normalizeCachePart(title);
  const sameTitle = Object.values(cache.entries || {}).filter((entry) => entry.titleKey === titleKey && entry.lyrics);
  if (sameTitle.length === 1) return sameTitle[0];
  return null;
}

function useCachedLyrics(title, artist) {
  const cached = findCachedLyrics(title, artist);
  if (!cached) return false;

  els.lrcInput.value = cached.lyrics;
  loadLyrics();
  return cached;
}

function scheduleRememberCurrentLyrics(source = "手动编辑") {
  window.clearTimeout(lyricsSaveTimerId);
  lyricsSaveTimerId = window.setTimeout(() => {
    const title = (currentTrack?.title || els.songTitle.value).trim();
    const artist = (currentTrack?.artist || els.artistName.value).trim();
    rememberLyrics({ title, artist, lyrics: els.lrcInput.value, source });
  }, 700);
}

function parseLrc(text) {
  const parsed = [];
  const pattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]\s*(.*)/g;

  for (const row of text.split("\n")) {
    pattern.lastIndex = 0;
    const match = pattern.exec(row);
    if (!match) continue;

    const minutes = Number(match[1]);
    const seconds = Number(match[2]);
    const ms = Number((match[3] || "0").padEnd(3, "0"));
    const textValue = match[4].trim();
    parsed.push({ time: minutes * 60_000 + seconds * 1000 + ms, text: textValue || " " });
  }

  if (!parsed.length) {
    return text
      .split("\n")
      .map((textValue, index) => ({ time: index * 4500, text: textValue.trim() }))
      .filter((line) => line.text);
  }

  return parsed.sort((a, b) => a.time - b.time);
}

function syncMeta() {
  const title = els.songTitle.value.trim() || "未命名歌曲";
  const artist = els.artistName.value.trim() || "正在播放";
  if (els.songMeta.dataset.title === title && els.songMeta.dataset.artist === artist) return;

  els.songMeta.dataset.title = title;
  els.songMeta.dataset.artist = artist;
  els.songMeta.replaceChildren();
  els.songMeta.classList.remove("reveal");

  const titleEl = document.createElement("span");
  titleEl.className = "meta-title";
  titleEl.textContent = title;

  const artistEl = document.createElement("span");
  artistEl.className = "meta-artist";
  artistEl.textContent = artist;

  els.songMeta.append(titleEl, artistEl);
  void els.songMeta.offsetWidth;
  els.songMeta.classList.add("reveal");
}

function fitCurrentLine() {
  const defaultSize = Number(els.fontSize.value);
  for (const slot of els.lyricSlots) {
    if (slot.textContent) fitLyricSlot(slot, defaultSize);
  }
}

function fitLyricSlot(slot, defaultSize = Number(els.fontSize.value)) {
  let size = defaultSize;
  const minSize = 28;
  const maxHeightFactor = 2.46;

  slot.style.fontSize = `${size}px`;
  while (
    (slot.scrollWidth > slot.clientWidth || slot.scrollHeight > size * maxHeightFactor) &&
    size > minSize
  ) {
    size -= 2;
    slot.style.fontSize = `${size}px`;
  }
}

function appendLyricUnits(target, text, options = {}) {
  const effect = els.lyricEffect?.value || "char";
  const animate = options.animate !== false;

  if (effect === "fade") {
    const span = document.createElement("span");
    span.className = "lyric-char";
    span.textContent = text;
    if (!animate) {
      span.classList.add("no-animate");
    }
    target.appendChild(span);
    return;
  }

  const units = effect === "word"
    ? text.match(/\S+\s*/g) || [text]
    : [...text];

  units.forEach((unit, index) => {
    const span = document.createElement("span");
    span.className = "lyric-char";
    if (animate) {
      const delayStep = effect === "word" ? 70 : effect === "typewriter" ? 34 : 18;
      span.style.setProperty("--char-delay", `${Math.min(index * delayStep, 520)}ms`);
    } else {
      span.classList.add("no-animate");
    }
    span.textContent = effect === "char"
      ? (unit === " " ? "\u00a0" : unit)
      : unit.replace(/ /g, "\u00a0");
    target.appendChild(span);
  });
}

function splitLyricRows(text) {
  const value = String(text || "");
  const chars = [...value];
  if (chars.length <= 18) return [value];

  const middle = Math.floor(chars.length / 2);
  const candidates = [];
  for (let i = 1; i < chars.length - 1; i += 1) {
    if (/[\s,，、。.!！？?]/.test(chars[i])) {
      candidates.push(i + 1);
    }
  }

  const splitAt = candidates.length
    ? candidates.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0]
    : middle;
  const first = chars.slice(0, splitAt).join("").trim();
  const second = chars.slice(splitAt).join("").trim();
  return second ? [first, second] : [value];
}

function appendLyricRows(target, rows, options = {}) {
  rows.forEach((rowText, rowIndex) => {
    const row = document.createElement("span");
    row.className = options.sweep ? "lyric-sweep-row" : "lyric-row";
    row.dataset.rowIndex = String(rowIndex);
    appendLyricUnits(row, rowText, options);
    target.appendChild(row);
  });
}

function renderLyricText(slot, text) {
  slot.textContent = "";
  const rows = slot.classList.contains("current-line") ? splitLyricRows(text) : [text];
  const baseLayer = document.createElement("span");
  baseLayer.className = "lyric-layer lyric-base";
  appendLyricRows(baseLayer, rows);
  slot.appendChild(baseLayer);

  if (slot.classList.contains("current-line")) {
    const sweepLayer = document.createElement("span");
    sweepLayer.className = "lyric-layer lyric-sweep";
    appendLyricRows(sweepLayer, rows, { animate: false, sweep: true });
    slot.appendChild(sweepLayer);
  }
}

function setKaraokeProgress(index = activeIndex, now = currentTime()) {
  const slot = els.lyricSlots[activeLyricSlot];
  if (!slot) return;

  const currentLine = lines[index];
  const nextLine = lines[index + 1];
  let progress = 0;

  if (currentLine && nextLine && nextLine.time > currentLine.time) {
    progress = (now - currentLine.time) / (nextLine.time - currentLine.time);
  } else if (currentLine && now >= currentLine.time) {
    progress = 1;
  }

  progress = Math.max(0, Math.min(progress, 1));
  const rounded = Math.round(progress * 1000) / 1000;
  if (slot.dataset.karaokeProgress === String(rounded)) return;
  slot.dataset.karaokeProgress = String(rounded);
  const sweepRows = [...slot.querySelectorAll(".lyric-sweep-row")];
  const rowCount = Math.max(1, sweepRows.length);
  sweepRows.forEach((row, rowIndex) => {
    const rowStart = rowIndex / rowCount;
    const rowEnd = (rowIndex + 1) / rowCount;
    const rowProgress = Math.max(0, Math.min((rounded - rowStart) / (rowEnd - rowStart), 1));
    row.style.setProperty("--row-progress", `${(rowProgress * 100).toFixed(1)}%`);
  });
}

function setLine(index) {
  const current = lines[index]?.text || "把歌词放到这里";

  const slot = els.lyricSlots[activeLyricSlot];
  renderLyricText(slot, current);
  els.currentLineLive.textContent = current;
  fitLyricSlot(slot);
  updateNextLinePreview(index);
  activeIndex = index;
  slot.dataset.karaokeProgress = "0";
  slot.querySelectorAll(".lyric-sweep-row").forEach((row) => row.style.setProperty("--row-progress", "0%"));
  setKaraokeProgress(index);
  renderedLineIndex = index;
}

function renderLine(index) {
  const nextActiveIndex = Math.max(0, Math.min(index, lines.length - 1));
  const currentSlot = els.lyricSlots[activeLyricSlot];
  if (nextActiveIndex === renderedLineIndex && currentSlot?.textContent.trim()) {
    updateNextLinePreview(nextActiveIndex);
    setKaraokeProgress(nextActiveIndex);
    return;
  }

  window.clearTimeout(lyricSlotClearTimerId);
  activeIndex = nextActiveIndex;
  const outgoingSlot = els.lyricSlots[activeLyricSlot];
  activeLyricSlot = 1 - activeLyricSlot;
  const incomingSlot = els.lyricSlots[activeLyricSlot];
  const incomingText = lines[activeIndex]?.text || "把歌词放到这里";

  renderLyricText(incomingSlot, incomingText);
  outgoingSlot.dataset.karaokeProgress = "0";
  incomingSlot.dataset.karaokeProgress = "0";
  outgoingSlot.querySelectorAll(".lyric-sweep-row").forEach((row) => row.style.setProperty("--row-progress", "0%"));
  incomingSlot.querySelectorAll(".lyric-sweep-row").forEach((row) => row.style.setProperty("--row-progress", "0%"));
  els.currentLineLive.textContent = incomingText;
  fitLyricSlot(incomingSlot);
  incomingSlot.classList.remove("exit", "active");
  incomingSlot.classList.add("enter");
  void incomingSlot.offsetWidth;
  outgoingSlot.classList.remove("active", "enter");
  outgoingSlot.classList.add("exit");
  incomingSlot.classList.remove("enter");
  incomingSlot.classList.add("active");
  const slotToClear = outgoingSlot;
  lyricSlotClearTimerId = window.setTimeout(() => {
    if (slotToClear === els.lyricSlots[activeLyricSlot]) return;
    slotToClear.classList.remove("exit", "enter", "active");
    slotToClear.textContent = "";
  }, 620);
  updateNextLinePreview(activeIndex);
  setKaraokeProgress(activeIndex);
  renderedLineIndex = activeIndex;

  lyricPulse = 1;
  if (els.visualStyle.value === "whale" && performance.now() - whaleBreachAt > 9000) {
    whaleBreachAt = performance.now();
  }
  if (els.visualStyle.value === "fireworks") {
    addFirework();
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function offsetMs() {
  return Number(els.offset.value);
}

function playbackTime() {
  if (followQQMusic) {
    const liveDelta = playing ? (performance.now() - startedAt) * followPlaybackRate : 0;
    return pausedAt + liveDelta;
  }
  if (!playing) return pausedAt;
  return performance.now() - startedAt;
}

function currentTime() {
  return playbackTime() + offsetMs();
}

function tick() {
  const now = currentTime();
  const nextIndex = lines.findIndex((line, index) => {
    const next = lines[index + 1];
    return now >= line.time && (!next || now < next.time);
  });

  if (nextIndex >= 0) {
    if (nextIndex !== activeIndex) renderLine(nextIndex);
    setKaraokeProgress(nextIndex, now);
  }
  frameId = requestAnimationFrame(tick);
}

function visualIntensity() {
  return Number(els.visualIntensity.value) / 100;
}

function resizeVisualCanvas() {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(window.innerWidth * pixelRatio);
  const height = Math.floor(window.innerHeight * pixelRatio);

  if (els.visualCanvas.width === width && els.visualCanvas.height === height) return;
  els.visualCanvas.width = width;
  els.visualCanvas.height = height;
  visualCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  createParticles();
}

function createParticles() {
  whaleGlints = Array.from({ length: 150 }, () => ({
    x: Math.random() * window.innerWidth,
    y: window.innerHeight * (0.54 + Math.random() * 0.36),
    size: 0.8 + Math.random() * 2.6,
    alpha: 0.16 + Math.random() * 0.3,
    drift: 0.2 + Math.random() * 0.8
  }));
  starField = Array.from({ length: 140 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    r: 0.4 + Math.random() * 1.8,
    speed: 0.04 + Math.random() * 0.18,
    alpha: 0.2 + Math.random() * 0.8
  }));
  rainDrops = Array.from({ length: 95 }, () => ({
    x: Math.random() * window.innerWidth,
    y: Math.random() * window.innerHeight,
    length: 18 + Math.random() * 70,
    speed: 0.5 + Math.random() * 1.9,
    alpha: 0.12 + Math.random() * 0.32
  }));
}

function drawVisual(time = 0) {
  if (els.backgroundMode.value === "video") {
    visualFrameId = requestAnimationFrame(drawVisual);
    return;
  }

  resizeVisualCanvas();
  const delta = Math.min(time - lastVisualTime || 16, 48);
  lastVisualTime = time;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const intensity = visualIntensity();
  const motion = (playing || followQQMusic ? 1 : 0.24) * intensity;

  visualCtx.clearRect(0, 0, width, height);

  if (els.visualStyle.value === "whale") {
    const cameraBob = playing || followQQMusic ? Math.sin(time / 2400) * 2.2 : 0.5;
    visualCtx.save();
    visualCtx.translate(0, cameraBob);
    drawWhale(width, height, time, motion);
    visualCtx.restore();
  }
  if (els.visualStyle.value === "fireworks") drawFireworks(width, height, delta, motion);
  if (els.visualStyle.value === "aurora") drawAurora(width, height, time, motion);
  if (els.visualStyle.value === "stars") drawStars(width, height, delta, motion);
  if (els.visualStyle.value === "rain") drawRain(width, height, delta, motion);

  drawReadabilityVeil(width, height);

  lyricPulse = Math.max(0, lyricPulse - delta / 900);
  visualFrameId = requestAnimationFrame(drawVisual);
}

function drawReadabilityVeil(width, height) {
  const isBrightScene = els.visualStyle.value === "whale";
  const vignette = visualCtx.createRadialGradient(
    width / 2,
    height * 0.48,
    height * 0.12,
    width / 2,
    height * 0.48,
    Math.max(width, height) * 0.72
  );
  vignette.addColorStop(0, isBrightScene ? "rgba(8, 12, 18, 0.08)" : "rgba(4, 5, 8, 0.05)");
  vignette.addColorStop(0.56, isBrightScene ? "rgba(8, 12, 18, 0.22)" : "rgba(4, 5, 8, 0.18)");
  vignette.addColorStop(1, isBrightScene ? "rgba(8, 12, 18, 0.72)" : "rgba(4, 5, 8, 0.68)");
  visualCtx.fillStyle = vignette;
  visualCtx.fillRect(0, 0, width, height);

  const lyricBand = visualCtx.createLinearGradient(0, 0, 0, height);
  lyricBand.addColorStop(0, isBrightScene ? "rgba(7, 11, 18, 0.16)" : "rgba(0, 0, 0, 0.18)");
  lyricBand.addColorStop(0.36, isBrightScene ? "rgba(7, 11, 18, 0.06)" : "rgba(0, 0, 0, 0.02)");
  lyricBand.addColorStop(0.52, isBrightScene ? "rgba(7, 11, 18, 0.28)" : "rgba(0, 0, 0, 0.22)");
  lyricBand.addColorStop(0.66, isBrightScene ? "rgba(7, 11, 18, 0.08)" : "rgba(0, 0, 0, 0.04)");
  lyricBand.addColorStop(1, isBrightScene ? "rgba(7, 11, 18, 0.42)" : "rgba(0, 0, 0, 0.38)");
  visualCtx.fillStyle = lyricBand;
  visualCtx.fillRect(0, 0, width, height);
}

function drawSceneSky(width, height, top, middle, bottom) {
  const gradient = visualCtx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(0.52, middle);
  gradient.addColorStop(1, bottom);
  visualCtx.fillStyle = gradient;
  visualCtx.fillRect(0, 0, width, height);
}

function drawWhale(width, height, time, motion) {
  drawSceneSky(width, height, "#b6e0f2", "#71bbdc", "#d7eef7");

  const horizon = height * 0.48;
  const seaY = height * 0.56;
  const pulse = lyricPulse * 32 * motion;
  const breach = Math.max(0, 1 - (time - whaleBreachAt) / 4200);
  const arc = Math.sin(breach * Math.PI);
  const whaleX = width * (0.58 + ((time / 42000) % 0.18));
  const whaleY = seaY - arc * height * 0.44;

  const sunX = width * 0.22;
  const sunY = height * 0.16;
  const sunGlow = visualCtx.createRadialGradient(sunX, sunY, 0, sunX, sunY, width * 0.28);
  sunGlow.addColorStop(0, "rgba(255, 246, 214, 0.42)");
  sunGlow.addColorStop(0.15, "rgba(255, 246, 214, 0.22)");
  sunGlow.addColorStop(0.5, "rgba(255, 244, 211, 0.08)");
  sunGlow.addColorStop(1, "rgba(255, 244, 211, 0)");
  visualCtx.fillStyle = sunGlow;
  visualCtx.fillRect(0, 0, width, height);
  visualCtx.fillStyle = "rgba(255, 249, 229, 0.92)";
  visualCtx.beginPath();
  visualCtx.arc(sunX, sunY, Math.max(34, width * 0.03), 0, Math.PI * 2);
  visualCtx.fill();

  const cloudBands = [
    { x: width * 0.18, y: height * 0.16, w: width * 0.2, h: height * 0.05, a: 0.22 },
    { x: width * 0.46, y: height * 0.12, w: width * 0.17, h: height * 0.04, a: 0.18 },
    { x: width * 0.7, y: height * 0.24, w: width * 0.22, h: height * 0.05, a: 0.16 }
  ];
  for (const cloud of cloudBands) {
    const cloudGlow = visualCtx.createRadialGradient(cloud.x, cloud.y, 0, cloud.x, cloud.y, cloud.w);
    cloudGlow.addColorStop(0, `rgba(255, 255, 255, ${cloud.a})`);
    cloudGlow.addColorStop(1, "rgba(255, 255, 255, 0)");
    visualCtx.fillStyle = cloudGlow;
    visualCtx.fillRect(cloud.x - cloud.w, cloud.y - cloud.h, cloud.w * 2, cloud.h * 2);
  }

  visualCtx.fillStyle = "rgba(44, 94, 109, 0.3)";
  visualCtx.beginPath();
  visualCtx.moveTo(0, horizon + 12);
  visualCtx.lineTo(width * 0.18, horizon - 18);
  visualCtx.lineTo(width * 0.31, horizon + 8);
  visualCtx.lineTo(width * 0.44, horizon - 10);
  visualCtx.lineTo(width * 0.62, horizon + 14);
  visualCtx.lineTo(width, horizon - 6);
  visualCtx.lineTo(width, horizon + 70);
  visualCtx.lineTo(0, horizon + 70);
  visualCtx.closePath();
  visualCtx.fill();

  for (let i = 0; i < 18; i += 1) {
    const x = (i * 173 + time * 0.006) % width;
    const y = height * (0.08 + (i % 7) * 0.045);
    visualCtx.fillStyle = `rgba(255, 255, 255, ${0.22 + (i % 3) * 0.08})`;
    visualCtx.beginPath();
    visualCtx.arc(x, y, 0.8 + (i % 4) * 0.38, 0, Math.PI * 2);
    visualCtx.fill();
  }

  const fog = visualCtx.createLinearGradient(0, horizon - 80, 0, horizon + 60);
  fog.addColorStop(0, "rgba(228, 243, 248, 0)");
  fog.addColorStop(0.52, "rgba(228, 243, 248, 0.22)");
  fog.addColorStop(1, "rgba(228, 243, 248, 0)");
  visualCtx.fillStyle = fog;
  visualCtx.fillRect(0, horizon - 80, width, 150);

  const sea = visualCtx.createLinearGradient(0, seaY - 70, 0, height);
  sea.addColorStop(0, "#48b9d5");
  sea.addColorStop(0.42, "#1f83ab");
  sea.addColorStop(1, "#0d486c");
  visualCtx.fillStyle = sea;
  visualCtx.beginPath();
  visualCtx.moveTo(0, seaY);
  for (let x = 0; x <= width; x += 44) {
    const wave = Math.sin(x / 95 + time / 1100) * 9 + Math.cos(x / 160 - time / 1800) * 8;
    visualCtx.lineTo(x, seaY + wave * motion);
  }
  visualCtx.lineTo(width, height);
  visualCtx.lineTo(0, height);
  visualCtx.closePath();
  visualCtx.fill();

  whaleGlints.forEach((glint) => {
    const flicker = 0.55 + 0.45 * Math.sin(time / 380 + glint.x * 0.06 + glint.y * 0.02);
    const waveLift = Math.sin(glint.x / 90 + time / 1150) * 5;
    const glintX = (glint.x + time * 0.012 * glint.drift) % width;
    const glintY = glint.y + waveLift;
    if (glintY < seaY - 6) return;
    visualCtx.fillStyle = `rgba(255, 250, 230, ${glint.alpha * flicker})`;
    visualCtx.fillRect(glintX, glintY, glint.size * 2.6, glint.size);
  });

  const sunPath = visualCtx.createLinearGradient(sunX - width * 0.24, seaY - 10, sunX + width * 0.24, height);
  sunPath.addColorStop(0, "rgba(255, 247, 214, 0)");
  sunPath.addColorStop(0.48, `rgba(255, 247, 214, ${0.18 + lyricPulse * 0.06})`);
  sunPath.addColorStop(1, "rgba(255, 247, 214, 0)");
  visualCtx.fillStyle = sunPath;
  visualCtx.beginPath();
  visualCtx.moveTo(sunX - width * 0.08, seaY - 10);
  visualCtx.lineTo(sunX + width * 0.1, seaY - 6);
  visualCtx.lineTo(sunX + width * 0.24, height);
  visualCtx.lineTo(sunX - width * 0.24, height);
  visualCtx.closePath();
  visualCtx.fill();

  for (let i = 0; i < 10; i += 1) {
    visualCtx.beginPath();
    visualCtx.strokeStyle = `rgba(226, 247, 252, ${0.12 + i * 0.022})`;
    visualCtx.lineWidth = i % 3 === 0 ? 2 : 1;
    const y = seaY + i * (height * 0.045) + Math.sin(time / 1200 + i) * 9;
    visualCtx.moveTo(0, y);
    for (let x = 0; x <= width; x += 52) {
      visualCtx.lineTo(x, y + Math.sin(x / 120 + time / 1450 + i) * (10 + pulse / 10));
    }
    visualCtx.stroke();
  }

  for (let i = 0; i < 3; i += 1) {
    visualCtx.beginPath();
    visualCtx.strokeStyle = `rgba(228, 243, 246, ${0.16 + i * 0.08})`;
    visualCtx.lineWidth = 8 + i * 6;
    const crestY = height * (0.82 + i * 0.06);
    visualCtx.moveTo(-20, crestY);
    for (let x = 0; x <= width + 20; x += 48) {
      visualCtx.lineTo(
        x,
        crestY + Math.sin(x / 80 + time / 980 + i) * (18 + i * 8) * (0.6 + motion)
      );
    }
    visualCtx.stroke();
  }

  visualCtx.save();
  visualCtx.translate(whaleX, whaleY);
  visualCtx.rotate(-0.2 + arc * 0.95);
  visualCtx.fillStyle = "rgba(94, 121, 133, 0.96)";
  visualCtx.beginPath();
  visualCtx.ellipse(0, 0, 118 + pulse, 34 + pulse / 7, 0, 0, Math.PI * 2);
  visualCtx.fill();
  visualCtx.fillStyle = "rgba(58, 82, 92, 0.9)";
  visualCtx.beginPath();
  visualCtx.ellipse(14, -5, 96 + pulse * 0.5, 22, 0.05, Math.PI * 1.05, Math.PI * 1.95);
  visualCtx.fill();
  visualCtx.beginPath();
  visualCtx.moveTo(-100, -4);
  visualCtx.lineTo(-176, -56 - pulse);
  visualCtx.lineTo(-146, 2);
  visualCtx.lineTo(-186, 52 + pulse);
  visualCtx.closePath();
  visualCtx.fill();
  visualCtx.fillStyle = "rgba(118, 148, 161, 0.88)";
  visualCtx.beginPath();
  visualCtx.moveTo(12, 22);
  visualCtx.lineTo(70, 72 + pulse);
  visualCtx.lineTo(42, 12);
  visualCtx.closePath();
  visualCtx.fill();
  visualCtx.strokeStyle = "rgba(247, 252, 255, 0.68)";
  visualCtx.lineWidth = 3;
  visualCtx.beginPath();
  visualCtx.ellipse(24, -12, 72 + pulse * 0.2, 18, -0.16, Math.PI * 1.12, Math.PI * 1.9);
  visualCtx.stroke();
  visualCtx.restore();

  if (breach > 0) {
    visualCtx.strokeStyle = `rgba(242, 250, 252, ${0.54 * breach})`;
    visualCtx.lineWidth = 2.5;
    visualCtx.beginPath();
    visualCtx.arc(whaleX, seaY + 10, 120 + arc * 105, Math.PI * 1.04, Math.PI * 1.92);
    visualCtx.stroke();
    visualCtx.strokeStyle = `rgba(255, 255, 255, ${0.34 * breach})`;
    visualCtx.lineWidth = 7;
    visualCtx.beginPath();
    visualCtx.arc(whaleX, seaY + 8, 86 + arc * 42, Math.PI * 1.08, Math.PI * 1.9);
    visualCtx.stroke();
    for (let i = 0; i < 24; i += 1) {
      const angle = Math.PI * (1.05 + Math.random() * 0.9);
      const distance = (40 + Math.random() * 150) * arc;
      visualCtx.fillStyle = `rgba(242, 250, 252, ${0.34 * breach})`;
      visualCtx.beginPath();
      visualCtx.arc(whaleX + Math.cos(angle) * distance, seaY + Math.sin(angle) * distance, 1.2 + Math.random() * 2.4, 0, Math.PI * 2);
      visualCtx.fill();
    }
  }

  const foregroundShadow = visualCtx.createLinearGradient(0, height * 0.72, 0, height);
  foregroundShadow.addColorStop(0, "rgba(11, 52, 73, 0)");
  foregroundShadow.addColorStop(1, "rgba(8, 41, 61, 0.66)");
  visualCtx.fillStyle = foregroundShadow;
  visualCtx.fillRect(0, height * 0.72, width, height * 0.28);
}

function addFirework() {
  const x = window.innerWidth * (0.18 + Math.random() * 0.64);
  const y = window.innerHeight * (0.16 + Math.random() * 0.36);
  const colors = ["217, 201, 155", "134, 196, 204", "238, 166, 148", "236, 231, 218"];
  fireworkBursts.push({
    x,
    y,
    age: 0,
    particles: Array.from({ length: 34 }, (_, index) => {
      const angle = (Math.PI * 2 * index) / 34 + Math.random() * 0.18;
      return {
        angle,
        speed: 1.2 + Math.random() * 3.4,
        color: colors[Math.floor(Math.random() * colors.length)]
      };
    })
  });
  fireworkBursts = fireworkBursts.slice(-7);
}

function drawFireworks(width, height, delta, motion) {
  drawSceneSky(width, height, "#070716", "#11122c", "#161a24");

  const waterY = height * 0.68;
  const cityGradient = visualCtx.createLinearGradient(0, waterY - 140, 0, waterY + 20);
  cityGradient.addColorStop(0, "rgba(9, 10, 18, 0)");
  cityGradient.addColorStop(1, "rgba(9, 10, 18, 0.9)");
  visualCtx.fillStyle = cityGradient;
  visualCtx.fillRect(0, waterY - 160, width, 190);

  for (let i = 0; i < 34; i += 1) {
    const buildingWidth = width / 34;
    const x = i * buildingWidth;
    const buildingHeight = 38 + ((i * 29) % 105);
    visualCtx.fillStyle = i % 5 === 0 ? "rgba(19, 23, 36, 0.92)" : "rgba(10, 13, 26, 0.94)";
    visualCtx.fillRect(x, waterY - buildingHeight, buildingWidth * 0.82, buildingHeight);
    if (i % 3 === 0) {
      visualCtx.fillStyle = "rgba(217, 201, 155, 0.35)";
      visualCtx.fillRect(x + buildingWidth * 0.22, waterY - buildingHeight + 16, 3, 18);
    }
  }

  const water = visualCtx.createLinearGradient(0, waterY, 0, height);
  water.addColorStop(0, "rgba(18, 33, 48, 0.88)");
  water.addColorStop(1, "rgba(4, 8, 16, 0.98)");
  visualCtx.fillStyle = water;
  visualCtx.fillRect(0, waterY, width, height - waterY);
  for (let i = 0; i < 14; i += 1) {
    visualCtx.strokeStyle = `rgba(217, 201, 155, ${0.035 + i * 0.004})`;
    visualCtx.lineWidth = 1;
    visualCtx.beginPath();
    const y = waterY + 12 + i * 20;
    visualCtx.moveTo(0, y);
    for (let x = 0; x <= width; x += 58) {
      visualCtx.lineTo(x, y + Math.sin(x / 92 + timeFromDelta(delta) + i) * 5 * motion);
    }
    visualCtx.stroke();
  }

  if (Math.random() < 0.012 * motion) addFirework();
  fireworkBursts.forEach((burst) => {
    burst.age += delta;
    const life = Math.max(0, 1 - burst.age / 1800);
    burst.particles.forEach((particle) => {
      const distance = particle.speed * burst.age * 0.08 * motion;
      const x = burst.x + Math.cos(particle.angle) * distance;
      const y = burst.y + Math.sin(particle.angle) * distance + burst.age * 0.018;
      visualCtx.fillStyle = `rgba(${particle.color}, ${life * 0.58})`;
      visualCtx.beginPath();
      visualCtx.arc(x, y, 1.4 + life * 2.8, 0, Math.PI * 2);
      visualCtx.fill();
    });

    const reflection = visualCtx.createRadialGradient(burst.x, waterY + 30, 0, burst.x, waterY + 30, width * 0.18);
    reflection.addColorStop(0, `rgba(217, 201, 155, ${life * 0.18})`);
    reflection.addColorStop(1, "rgba(217, 201, 155, 0)");
    visualCtx.fillStyle = reflection;
    visualCtx.fillRect(burst.x - width * 0.2, waterY, width * 0.4, height - waterY);
  });
  fireworkBursts = fireworkBursts.filter((burst) => burst.age < 1800);

  const glow = visualCtx.createRadialGradient(width / 2, height * 0.42, 0, width / 2, height * 0.42, width * 0.7);
  glow.addColorStop(0, `rgba(217, 201, 155, ${0.07 + lyricPulse * 0.08})`);
  glow.addColorStop(1, "rgba(217, 201, 155, 0)");
  visualCtx.fillStyle = glow;
  visualCtx.fillRect(0, 0, width, height);
}

function drawAurora(width, height, time, motion) {
  drawSceneSky(width, height, "#050812", "#101b2b", "#203238");

  for (let i = 0; i < 80; i += 1) {
    const x = (i * 97 + time * 0.004) % width;
    const y = height * (0.05 + ((i * 17) % 34) / 100);
    visualCtx.fillStyle = `rgba(236, 245, 242, ${0.1 + (i % 5) * 0.035})`;
    visualCtx.beginPath();
    visualCtx.arc(x, y, 0.6 + (i % 4) * 0.28, 0, Math.PI * 2);
    visualCtx.fill();
  }

  visualCtx.globalCompositeOperation = "screen";
  for (let band = 0; band < 4; band += 1) {
    visualCtx.beginPath();
    const yBase = height * (0.18 + band * 0.13);
    visualCtx.moveTo(0, yBase);
    for (let x = 0; x <= width; x += 28) {
      const wave = Math.sin(x / 150 + time / (1300 + band * 240)) * 40;
      const slow = Math.cos(x / 260 - time / 2500 + band) * 26;
      visualCtx.lineTo(x, yBase + (wave + slow) * motion);
    }
    visualCtx.lineTo(width, height * 0.74);
    visualCtx.lineTo(0, height * 0.68);
    visualCtx.closePath();
    visualCtx.fillStyle = band % 2
      ? `rgba(92, 188, 164, ${0.12 + lyricPulse * 0.04})`
      : `rgba(134, 162, 220, ${0.11 + lyricPulse * 0.04})`;
    visualCtx.fill();
  }
  visualCtx.globalCompositeOperation = "source-over";

  const groundY = height * 0.72;
  const ground = visualCtx.createLinearGradient(0, groundY, 0, height);
  ground.addColorStop(0, "rgba(172, 199, 202, 0.34)");
  ground.addColorStop(0.45, "rgba(53, 79, 89, 0.62)");
  ground.addColorStop(1, "rgba(8, 12, 18, 0.94)");
  visualCtx.fillStyle = ground;
  visualCtx.beginPath();
  visualCtx.moveTo(0, groundY);
  for (let x = 0; x <= width; x += 90) {
    visualCtx.lineTo(x, groundY + Math.sin(x / 180) * 18 + Math.cos(x / 260) * 12);
  }
  visualCtx.lineTo(width, height);
  visualCtx.lineTo(0, height);
  visualCtx.closePath();
  visualCtx.fill();

  visualCtx.strokeStyle = "rgba(236, 245, 242, 0.18)";
  for (let i = 0; i < 9; i += 1) {
    const y = groundY + 38 + i * 28;
    visualCtx.beginPath();
    visualCtx.moveTo(width * 0.18, y);
    visualCtx.lineTo(width * (0.5 + i * 0.018), height);
    visualCtx.stroke();
  }
}

function drawStars(width, height, delta, motion) {
  drawSceneSky(width, height, "#02030a", "#090b19", "#050611");

  const galaxy = visualCtx.createLinearGradient(width * 0.18, height, width * 0.82, 0);
  galaxy.addColorStop(0, "rgba(92, 121, 184, 0)");
  galaxy.addColorStop(0.45, "rgba(121, 151, 210, 0.15)");
  galaxy.addColorStop(0.52, "rgba(217, 201, 155, 0.12)");
  galaxy.addColorStop(1, "rgba(92, 121, 184, 0)");
  visualCtx.fillStyle = galaxy;
  visualCtx.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  starField.forEach((star) => {
    star.y += star.speed * delta * motion;
    star.x += Math.sin((star.y + performance.now() / 40) / 90) * 0.08 * delta * motion;
    if (star.y > height + 10) {
      star.y = -10;
      star.x = Math.random() * width;
    }
    const dx = (star.x - centerX) * 0.003;
    const dy = (star.y - centerY) * 0.003;
    visualCtx.strokeStyle = `rgba(236, 231, 218, ${star.alpha * (0.35 + lyricPulse * 0.35)})`;
    visualCtx.lineWidth = star.r;
    visualCtx.beginPath();
    visualCtx.moveTo(star.x, star.y);
    visualCtx.lineTo(star.x + dx * delta * motion, star.y + dy * delta * motion);
    visualCtx.stroke();
  });

  const planetGlow = visualCtx.createRadialGradient(width * 0.78, height * 0.26, 0, width * 0.78, height * 0.26, width * 0.18);
  planetGlow.addColorStop(0, "rgba(134, 196, 204, 0.18)");
  planetGlow.addColorStop(1, "rgba(134, 196, 204, 0)");
  visualCtx.fillStyle = planetGlow;
  visualCtx.fillRect(0, 0, width, height);
  visualCtx.fillStyle = "rgba(40, 76, 94, 0.62)";
  visualCtx.beginPath();
  visualCtx.arc(width * 0.78, height * 0.26, width * 0.05, 0, Math.PI * 2);
  visualCtx.fill();
}

function drawRain(width, height, delta, motion) {
  drawSceneSky(width, height, "#071018", "#111c22", "#07090c");

  const windowX = width * 0.12;
  const windowY = height * 0.09;
  const windowW = width * 0.76;
  const windowH = height * 0.78;
  visualCtx.fillStyle = "rgba(5, 8, 10, 0.38)";
  visualCtx.fillRect(windowX, windowY, windowW, windowH);

  const cityY = height * 0.58;
  for (let i = 0; i < 26; i += 1) {
    const x = windowX + i * (windowW / 26);
    const h = 40 + ((i * 43) % 150);
    visualCtx.fillStyle = "rgba(10, 16, 22, 0.58)";
    visualCtx.fillRect(x, cityY - h, windowW / 30, h);
    if (i % 4 === 0) {
      visualCtx.fillStyle = "rgba(217, 201, 155, 0.25)";
      visualCtx.fillRect(x + 4, cityY - h + 22, 4, 30);
    }
  }

  const mist = visualCtx.createLinearGradient(0, 0, 0, height);
  mist.addColorStop(0, "rgba(55, 72, 82, 0.14)");
  mist.addColorStop(0.62, "rgba(88, 107, 116, 0.08)");
  mist.addColorStop(1, "rgba(9, 10, 13, 0.38)");
  visualCtx.fillStyle = mist;
  visualCtx.fillRect(0, 0, width, height);

  rainDrops.forEach((drop) => {
    drop.y += drop.speed * delta * motion;
    drop.x += 0.05 * delta * motion;
    if (drop.y > height + drop.length) {
      drop.y = -drop.length;
      drop.x = Math.random() * width;
    }
    visualCtx.strokeStyle = `rgba(188, 221, 231, ${drop.alpha + lyricPulse * 0.12})`;
    visualCtx.lineWidth = 1;
    visualCtx.beginPath();
    visualCtx.moveTo(drop.x, drop.y);
    visualCtx.lineTo(drop.x - 14, drop.y + drop.length);
    visualCtx.stroke();
  });

  visualCtx.strokeStyle = "rgba(236, 231, 218, 0.16)";
  visualCtx.lineWidth = 2;
  visualCtx.strokeRect(windowX, windowY, windowW, windowH);
  visualCtx.beginPath();
  visualCtx.moveTo(width * 0.5, windowY);
  visualCtx.lineTo(width * 0.5, windowY + windowH);
  visualCtx.moveTo(windowX, windowY + windowH * 0.52);
  visualCtx.lineTo(windowX + windowW, windowY + windowH * 0.52);
  visualCtx.stroke();
}

function timeFromDelta(delta) {
  return performance.now() / 1000 + delta / 1000;
}

function loadLyrics() {
  lines = parseLrc(els.lrcInput.value);
  activeIndex = 0;
  renderedLineIndex = -1;
  renderLine(0);
  syncMeta();
  updateEmptyState();
}

function play() {
  if (!lines.length) loadLyrics();
  followQQMusic = false;
  window.clearInterval(followTimerId);
  els.followQQMusic?.classList.remove("active");
  if (els.followQQMusic) {
    els.followQQMusic.textContent = "跟随播放";
  }
  startedAt = performance.now() - pausedAt;
  playing = true;
  els.playPause.textContent = "暂停";
  setPlaybackVisualState();
  cancelAnimationFrame(frameId);
  tick();
}

function pause() {
  pausedAt = playbackTime();
  playing = false;
  els.playPause.textContent = "播放";
  setPlaybackVisualState();
  cancelAnimationFrame(frameId);
}

function reset() {
  pause();
  pausedAt = 0;
  renderLine(0);
}

function togglePanel(collapsed) {
  els.panel.classList.toggle("collapsed", collapsed);
  els.showPanel.classList.toggle("visible", collapsed);
}

async function syncQQMusic() {
  setStatus("loading", "Reading current track information...", "Reading");
  els.syncStatus.textContent = "Reading QQ Music now-playing info...";

  try {
    const response = await fetch("/api/now-playing");
    const track = await response.json();

    if (track.title) {
      applyTrack(track);
      updateEmptyState();
      setStatus("success", `Detected track: ${track.title}${track.artist ? ` / ${track.artist}` : ""}`, "Detected");
      return;
    }

    setStatus("warning", track.message || "No active track was detected.", "No Track");
    els.syncStatus.textContent = track.message || "No active track was detected.";
  } catch (error) {
    setStatus("error", `Read track failed: ${error.message}`, "Failed");
    els.syncStatus.textContent = `Read track failed: ${error.message}`;
  }
}

function applyTrack(track) {
  const previousKey = trackKey(currentTrack);
  const nextKey = trackKey(track);
  els.songTitle.value = track.title;
  els.artistName.value = track.artist || "QQ Music";
  currentTrack = track;
  syncMeta();
  const cachedLyrics = nextKey !== previousKey ? useCachedLyrics(track.title, track.artist || "QQ Music") : false;

  if (typeof track.elapsed === "number") {
    pausedAt = track.elapsed * 1000;
    startedAt = performance.now();
    followPlaybackRate = typeof track.playbackRate === "number" && track.playbackRate > 0
      ? track.playbackRate
      : 1;
    playing = track.playing !== false;
    setPlaybackVisualState();
    const index = findLineIndex(currentTime());
    if (index >= 0 && index !== renderedLineIndex) renderLine(index);
  }

  const progress = typeof track.elapsed === "number" && typeof track.duration === "number"
    ? ` | ${formatClock(track.elapsed)} / ${formatClock(track.duration)}`
    : "";
  const state = track.playing === false ? "Paused" : "Playing";
  const cacheHint = cachedLyrics ? " | Cached lyrics loaded" : "";
  setStatus("success", `${state}: ${track.raw || track.title}${progress}${cacheHint}`, followQQMusic ? "Following" : "Synced");
  updateEmptyState();

  if (followQQMusic && nextKey !== previousKey && !cachedLyrics) {
    fetchLyricsForCurrentTrack(track);
  }
}

function findLineIndex(now) {
  return lines.findIndex((line, index) => {
    const next = lines[index + 1];
    return now >= line.time && (!next || now < next.time);
  });
}

function formatClock(secondsValue) {
  const seconds = Math.max(0, Math.floor(secondsValue));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function syncOffsetValue() {
  const seconds = Number(els.offset.value) / 1000;
  els.offsetValue.textContent = `${seconds > 0 ? "+" : ""}${seconds.toFixed(2)}s`;

  const index = findLineIndex(currentTime());
  if (index >= 0 && index !== renderedLineIndex) {
    renderLine(index);
  }
}

function adjustLyricsOffset(delta) {
  const min = Number(els.offset.min);
  const max = Number(els.offset.max);
  const next = Math.max(min, Math.min(max, Number(els.offset.value) + delta));
  els.offset.value = String(next);
  syncOffsetValue();

  const index = findLineIndex(currentTime());
  if (index >= 0) renderLine(index);
}

function syncVisualIntensityValue() {
  els.visualIntensityValue.textContent = `${els.visualIntensity.value}%`;
}

function syncBackgroundBrightnessValue() {
  els.backgroundBrightnessValue.textContent = `${els.backgroundBrightness.value}%`;
  setStageCssVar("--background-brightness", `${Number(els.backgroundBrightness.value) / 100}`);
}

function syncBackgroundBlurValue() {
  els.backgroundBlurValue.textContent = `${els.backgroundBlur.value}px`;
  setStageCssVar("--background-blur", `${els.backgroundBlur.value}px`);
}

function syncBackgroundDimValue() {
  els.backgroundDimValue.textContent = `${els.backgroundDim.value}%`;
  setStageCssVar("--background-dim", `${Number(els.backgroundDim.value) / 100}`);
}

function syncLyricStrokeValue() {
  els.lyricStrokeValue.textContent = `${Number(els.lyricStroke.value).toFixed(1)}px`;
  setStageCssVar("--lyric-stroke", `${els.lyricStroke.value}px`);
}

function syncLyricShadowValue() {
  els.lyricShadowValue.textContent = `${els.lyricShadow.value}%`;
  setStageCssVar("--lyric-shadow-strength", `${Number(els.lyricShadow.value) / 100}`);
}

function syncLyricYValue() {
  const value = Number(els.lyricY.value);
  els.lyricYValue.textContent = `${value > 0 ? "+" : ""}${value}vh`;
  setStageCssVar("--lyric-y", `${value}vh`);
}

function syncKaraokeColor() {
  const palettes = {
    gold: ["#ffd978", "rgba(255, 216, 120, 0.3)"],
    cyan: ["#7de8ff", "rgba(125, 232, 255, 0.28)"],
    rose: ["#ff8bbd", "rgba(255, 139, 189, 0.28)"],
    green: ["#9cffb5", "rgba(156, 255, 181, 0.26)"],
    white: ["#fff8ea", "rgba(255, 248, 234, 0.24)"]
  };
  const [color, glow] = palettes[els.karaokeColor.value] || palettes.gold;
  setStageCssVar("--karaoke-color", color);
  setStageCssVar("--karaoke-glow", glow);
}

function hidePanelForStage() {
  els.stage.classList.add("panel-hidden");
}

function showPanelForStage() {
  els.stage.classList.remove("panel-hidden");
}

function scheduleAutoHidePanel(delay = 1800) {
  window.clearTimeout(panelHideTimerId);
  if (!presentationModeEnabled && !document.fullscreenElement) return;
  showPanelForStage();
  panelHideTimerId = window.setTimeout(() => {
    hidePanelForStage();
  }, delay);
}

function setPresentationMode(enabled) {
  presentationModeEnabled = enabled;
  els.stage.classList.toggle("presentation-mode", enabled);
  els.presentationMode.classList.toggle("active", enabled);
  els.presentationMode.textContent = enabled ? "退出" : "演出";
  if (enabled) {
    scheduleAutoHidePanel(1200);
    setStatus("success", "演出模式已开启。鼠标静止后面板会自动隐藏。", "演出");
    return;
  }

  window.clearTimeout(panelHideTimerId);
  showPanelForStage();
  setStatus("idle", "演出模式已关闭。", "待命");
}

function syncSceneMode() {
  els.stage.dataset.scene = els.visualStyle.value;
}

function syncLyricEffect() {
  els.stage.dataset.lyricEffect = els.lyricEffect.value;
  if (renderedLineIndex >= 0) {
    const currentIndex = activeIndex;
    renderedLineIndex = -1;
    renderLine(currentIndex);
  }
}

function syncFontStyle() {
  els.stage.dataset.fontStyle = els.fontStyle.value;
  if (renderedLineIndex >= 0) {
    fitCurrentLine();
  }
}

function syncBackgroundMode() {
  els.stage.dataset.backgroundMode = els.backgroundMode.value;
  if (els.backgroundMode.value === "video") {
    if (els.backgroundVideo.getAttribute("src")) {
      els.backgroundVideo.play().catch(() => {});
    }
    return;
  }
}

async function pollQQMusic() {
  if (!followQQMusic) return;

  try {
    const response = await fetch("/api/now-playing");
    const track = await response.json();
    if (track.title) {
      applyTrack(track);
      return;
    }
    setStatus("warning", track.message || "No active track was detected.", "Follow");
  } catch (error) {
    setStatus("error", `Follow failed: ${error.message}`, "Follow");
    els.syncStatus.textContent = `Follow failed: ${error.message}`;
  }
}

function trackKey(track) {
  if (!track) return "";
  return `${track.title || ""}::${track.artist || ""}`.trim().toLowerCase();
}

function openAigeciSearch() {
  const title = (currentTrack?.title || els.songTitle.value).trim();

  if (!title) {
    setStatus("warning", "Read a track before opening lyric search.", "Lyrics");
    return;
  }

  const url = `https://www.aigeci.com/search?author=${encodeURIComponent(title)}`;
  window.open(url, "_blank", "noopener,noreferrer");
  setStatus("idle", `Opened lyric search for ${title}.`, "Lyrics");
}

function countDecodeArtifacts(content) {
  return (String(content || "").match(/�/g) || []).length;
}

async function readLyricsFile(file) {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder("utf-8").decode(buffer);
  if (!countDecodeArtifacts(utf8Text)) {
    return utf8Text;
  }

  try {
    const gb18030Text = new TextDecoder("gb18030").decode(buffer);
    if (countDecodeArtifacts(gb18030Text) <= countDecodeArtifacts(utf8Text)) {
      return gb18030Text;
    }
  } catch {}

  return utf8Text;
}

async function fetchLyricsForCurrentTrack(track = currentTrack) {
  if (lyricsLoading) return;

  const title = (track?.title || els.songTitle.value).trim();
  const artist = (track?.artist || els.artistName.value).trim();
  const duration = Number(track?.duration || 0);
  const key = `${title}::${artist}::${Math.round(duration || 0)}`.toLowerCase();

  if (!title) {
    setStatus("warning", "Read a track or enter a title before searching lyrics.", "Lyrics");
    return;
  }

  lyricsLoading = true;
  updateEmptyState();
  lastLyricsKey = key;
  els.autoLyrics.classList.add("active");

  const cachedLyrics = useCachedLyrics(title, artist);
  if (cachedLyrics) {
    if (typeof track?.elapsed === "number") {
      pausedAt = track.elapsed * 1000;
      const index = findLineIndex(currentTime());
      if (index >= 0) renderLine(index);
    }
    setStatus("success", `Loaded cached lyrics for ${cachedLyrics.title}${cachedLyrics.artist ? ` / ${cachedLyrics.artist}` : ""}.`, "Lyrics");
    lyricsLoading = false;
    els.autoLyrics.classList.remove("active");
    return;
  }

  setStatus("loading", `Searching lyrics for ${title}${artist ? ` / ${artist}` : ""}...`, "Lyrics");

  try {
    const params = new URLSearchParams({ track: title });
    if (artist) params.set("artist", artist);
    if (duration) params.set("duration", String(duration));

    const response = await fetch(`/api/lyrics?${params}`);
    const result = await response.json();

    if (!result.found) {
      setStatus("warning", result.message || "No matching lyrics were found.", "Lyrics");
      return;
    }

    if (result.syncedLyrics) {
      els.lrcInput.value = result.syncedLyrics;
      loadLyrics();
      rememberLyricsWithLookupAlias({
        title: result.title || title,
        artist: result.artist || artist,
        lookupTitle: title,
        lookupArtist: artist,
        lyrics: result.syncedLyrics,
        source: result.source || "Auto Search"
      });
      if (typeof track?.elapsed === "number") {
        pausedAt = track.elapsed * 1000;
        const index = findLineIndex(currentTime());
        if (index >= 0) renderLine(index);
      }
      setStatus("success", `Synced lyrics loaded: ${result.title}${result.artist ? ` / ${result.artist}` : ""}.`, "Lyrics");
      return;
    }

    if (result.plainLyrics) {
      els.lrcInput.value = result.plainLyrics;
      loadLyrics();
      rememberLyricsWithLookupAlias({
        title: result.title || title,
        artist: result.artist || artist,
        lookupTitle: title,
        lookupArtist: artist,
        lyrics: result.plainLyrics,
        source: result.source || "Auto Search"
      });
      setStatus("warning", `Plain lyrics loaded without time tags: ${result.title}${result.artist ? ` / ${result.artist}` : ""}.`, "Lyrics");
      return;
    }

    setStatus("warning", "A track match was found, but no usable lyrics were returned.", "Lyrics");
  } catch (error) {
    lastLyricsKey = "";
    setStatus("error", `Lyrics search failed: ${error.message}`, "Lyrics");
  } finally {
    lyricsLoading = false;
    els.autoLyrics.classList.remove("active");
    updateEmptyState();
  }
}

async function autoStartPlaybackFlow() {
  if (startupDone) return;
  startupDone = true;

  if (!followQQMusic) toggleQQFollow();
  await syncQQMusic();

  const readyTrack = currentTrack?.title ? currentTrack : null;
  if (readyTrack) {
    await fetchLyricsForCurrentTrack(readyTrack);
  }
}

function toggleQQFollow() {
  if (!followQQMusic) pause();

  followQQMusic = !followQQMusic;
  setPlaybackVisualState();
  els.followQQMusic?.classList.toggle("active", followQQMusic);
  if (els.followQQMusic) {
    els.followQQMusic.textContent = followQQMusic ? "Stop Following" : "Follow";
  }

  if (followQQMusic) {
    if (!lines.length) loadLyrics();
    playing = false;
    setStatus("loading", "Following QQ Music playback...", "Following");
    pollQQMusic();
    followTimerId = window.setInterval(pollQQMusic, 1000);
    cancelAnimationFrame(frameId);
    tick();
    return;
  }

  setStatus("idle", "Follow mode stopped.", "Idle");
  window.clearInterval(followTimerId);
  playing = false;
  setPlaybackVisualState();
  cancelAnimationFrame(frameId);
}

async function importLrcFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  els.lrcInput.value = await readLyricsFile(file);
  loadLyrics();
  rememberLyrics({
    title: currentTrack?.title || els.songTitle.value,
    artist: currentTrack?.artist || els.artistName.value,
    lyrics: els.lrcInput.value,
    source: `Local file: ${file.name}`
  });
  setStatus("success", `Imported local LRC: ${file.name}`, "Lyrics");
}

async function importVideoFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  setStatus("loading", `Importing background: ${file.name}`, "Background");
  setBackgroundMediaFile(file);

  try {
    await saveBackgroundVideo(file);
    if (!isGifFile(file)) {
      await els.backgroundVideo.play();
    }
    setStatus("success", `Background ready: ${file.name}`, "Background");
  } catch (error) {
    setStatus("error", `Background import failed: ${error.message}`, "Background");
  }
}

els.playPause.addEventListener("click", () => (playing ? pause() : play()));
els.syncQQMusic.addEventListener("click", syncQQMusic);
els.followQQMusic.addEventListener("click", toggleQQFollow);
els.autoLyrics.addEventListener("click", () => fetchLyricsForCurrentTrack());
els.searchAigeci.addEventListener("click", openAigeciSearch);
els.lrcFile.addEventListener("change", importLrcFile);
els.videoFile.addEventListener("change", importVideoFile);
els.presentationMode.addEventListener("click", () => setPresentationMode(!presentationModeEnabled));
els.reset.addEventListener("click", reset);
els.fullscreen.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    els.stage.requestFullscreen();
    scheduleAutoHidePanel(1200);
  } else {
    document.exitFullscreen();
  }
});

els.togglePanel.addEventListener("click", () => togglePanel(true));
els.showPanel.addEventListener("click", () => togglePanel(false));
els.copyRemoteUrl?.addEventListener("click", copyRemoteAccessUrl);
document.querySelectorAll("[data-preset]").forEach((button) => {
  button.addEventListener("click", () => applyPreset(button.dataset.preset));
});
els.lrcInput.addEventListener("input", () => {
  loadLyrics();
  scheduleRememberCurrentLyrics();
});
els.songTitle.addEventListener("input", () => {
  syncMeta();
  scheduleRememberCurrentLyrics("手动记录");
});
els.artistName.addEventListener("input", () => {
  syncMeta();
  scheduleRememberCurrentLyrics("手动记录");
});
els.fontSize.addEventListener("input", () => {
  document.documentElement.style.setProperty("--lyric-size", `${els.fontSize.value}px`);
  fitCurrentLine();
});
els.offset.addEventListener("input", syncOffsetValue);
els.lyricsEarlier.addEventListener("click", () => adjustLyricsOffset(300));
els.lyricsLater.addEventListener("click", () => adjustLyricsOffset(-300));
els.visualIntensity.addEventListener("input", syncVisualIntensityValue);
els.lyricEffect.addEventListener("change", syncLyricEffect);
els.fontStyle.addEventListener("change", syncFontStyle);
els.backgroundBrightness.addEventListener("input", syncBackgroundBrightnessValue);
els.backgroundBlur.addEventListener("input", syncBackgroundBlurValue);
els.backgroundDim.addEventListener("input", syncBackgroundDimValue);
els.karaokeColor.addEventListener("change", syncKaraokeColor);
els.lyricStroke.addEventListener("input", syncLyricStrokeValue);
els.lyricShadow.addEventListener("input", syncLyricShadowValue);
els.lyricY.addEventListener("input", syncLyricYValue);
els.backgroundMode.addEventListener("change", syncBackgroundMode);
els.visualStyle.addEventListener("change", () => {
  fireworkBursts = [];
  lyricPulse = 1;
  syncSceneMode();
});
els.stage.addEventListener("mousemove", () => scheduleAutoHidePanel(1800));
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement) {
    scheduleAutoHidePanel(1200);
    return;
  }
  window.clearTimeout(panelHideTimerId);
  showPanelForStage();
});
window.addEventListener("resize", () => {
  resizeVisualCanvas();
  fitCurrentLine();
});

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" && event.target === document.body) {
    event.preventDefault();
    playing ? pause() : play();
  }
  if (event.key.toLowerCase() === "f") {
    toggleQQFollow();
  }
  if (event.key.toLowerCase() === "p") {
    setPresentationMode(!presentationModeEnabled);
  }
  if (event.key === "Escape") togglePanel(false);
});

[
  els.lyricEffect,
  els.fontStyle,
  els.visualIntensity,
  els.backgroundBrightness,
  els.backgroundBlur,
  els.backgroundDim,
  els.karaokeColor,
  els.lyricStroke,
  els.lyricShadow,
  els.lyricY,
  els.fontSize,
  els.offset,
  els.visualStyle,
  els.backgroundMode
].forEach((el) => {
  el.addEventListener("change", saveUiSettings);
  el.addEventListener("input", saveUiSettings);
});

applyUiSettings();
loadNetworkAccessInfo();
loadLyrics();
syncOffsetValue();
syncVisualIntensityValue();
syncLyricEffect();
syncFontStyle();
syncBackgroundBrightnessValue();
syncBackgroundBlurValue();
syncBackgroundDimValue();
syncKaraokeColor();
syncLyricStrokeValue();
syncLyricShadowValue();
syncLyricYValue();
syncSceneMode();
syncBackgroundMode();
updateEmptyState();
restoreBackgroundVideo();
createParticles();
drawVisual();
autoStartPlaybackFlow();
setStatus("idle", "Ready. Read a track, follow playback, or import lyrics/background.", "Ready");
