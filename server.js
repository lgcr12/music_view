const http = require("http");
const https = require("https");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");

const PORT = Number(process.env.PORT || 5173);
const ROOT = __dirname;
const NOW_PLAYING_SOURCE = path.join(ROOT, "scripts", "now-playing.m");
const NOW_PLAYING_BIN = path.join(ROOT, "scripts", "now-playing");
const WINDOWS_GSMTC_SOURCE = path.join(ROOT, "scripts", "windows-now-playing-gsmtc.cs");
const WINDOWS_GSMTC_BIN = path.join(ROOT, "scripts", "windows-now-playing-gsmtc.exe");
const WINDOWS_NOW_PLAYING_SCRIPT = path.join(ROOT, "scripts", "windows-now-playing.ps1");
const WINDOWS_CSC = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
const WINDOWS_RUNTIME_DLL = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.dll";
const WINDOWS_RUNTIME_WINRT_DLL = "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\System.Runtime.WindowsRuntime.dll";
const WINDOWS_WINMD = "C:\\Program Files (x86)\\Windows Kits\\10\\UnionMetadata\\10.0.26100.0\\Windows.winmd";
const LRCLIB_BASE_URL = "https://lrclib.net/api";
const LYRICS_OVH_BASE_URL = "https://api.lyrics.ovh/v1";
const LOCAL_LYRICS_DIR = "E:\\播放\\歌词";
const USER_AGENT = "LyricVeil/1.0 (local lyrics overlay)";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function runOsaScript(script) {
  return new Promise((resolve) => {
    execFile("osascript", ["-e", script], { timeout: 3000 }, (error, stdout) => {
      if (error) {
        resolve("");
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 5000 }, (error, stdout) => {
      resolve(error ? "" : stdout.trim());
    });
  });
}

function getNetworkAccessInfo() {
  const urls = [];
  const interfaces = os.networkInterfaces();

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses || []) {
      if (address.family !== "IPv4" || address.internal) continue;
      if (address.address.startsWith("169.254.")) continue;
      urls.push({
        name,
        address: address.address,
        url: `http://${address.address}:${PORT}`
      });
    }
  }

  const preferred = urls.find((item) => /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(item.address)) || urls[0] || null;
  return {
    port: PORT,
    local: `http://localhost:${PORT}`,
    preferred,
    urls
  };
}

function runCommandDetailed(command, args, timeout = 5000) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout ? stdout.trim() : "",
        stderr: stderr ? stderr.trim() : "",
        error
      });
    });
  });
}

async function ensureNowPlayingTool() {
  try {
    await fs.access(NOW_PLAYING_BIN);
    return true;
  } catch {
    const output = await runCommand("clang", [
      "-framework",
      "Foundation",
      "-F/System/Library/PrivateFrameworks",
      "-framework",
      "MediaRemote",
      NOW_PLAYING_SOURCE,
      "-o",
      NOW_PLAYING_BIN
    ]);
    return output !== null;
  }
}

async function ensureWindowsGsmtcTool() {
  try {
    await fs.access(WINDOWS_GSMTC_BIN);
    return true;
  } catch {}

  const compile = await runCommandDetailed(WINDOWS_CSC, [
    "/nologo",
    "/target:exe",
    `/out:${WINDOWS_GSMTC_BIN}`,
    `/reference:${WINDOWS_RUNTIME_DLL}`,
    `/reference:${WINDOWS_RUNTIME_WINRT_DLL}`,
    `/reference:${WINDOWS_WINMD}`,
    WINDOWS_GSMTC_SOURCE
  ], 15000);

  return compile.ok;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function currentElapsed(baseElapsed, timestamp, playbackRate, duration) {
  if (baseElapsed === null) return null;
  if (!playbackRate || playbackRate <= 0 || !timestamp) return baseElapsed;

  const adjusted = baseElapsed + (Date.now() / 1000 - timestamp) * playbackRate;
  if (duration) return Math.max(0, Math.min(adjusted, duration));
  return Math.max(0, adjusted);
}

async function getMediaRemoteNowPlaying() {
  const ready = await ensureNowPlayingTool();
  if (!ready) return null;

  const raw = await runCommand(NOW_PLAYING_BIN, []);
  if (!raw) return null;

  try {
    const info = JSON.parse(raw);
    const title = info.kMRMediaRemoteNowPlayingInfoTitle || "";
    const artist = info.kMRMediaRemoteNowPlayingInfoArtist || "";
    if (!title && !artist) return null;

    const elapsed = numberOrNull(info.kMRMediaRemoteNowPlayingInfoElapsedTime);
    const duration = numberOrNull(info.kMRMediaRemoteNowPlayingInfoDuration);
    const playbackRate = numberOrNull(info.kMRMediaRemoteNowPlayingInfoPlaybackRate);
    const timestamp = numberOrNull(info.kMRMediaRemoteNowPlayingInfoTimestamp);
    const adjustedElapsed = currentElapsed(elapsed, timestamp, playbackRate, duration);

    return {
      title,
      artist,
      elapsed: adjustedElapsed,
      rawElapsed: elapsed,
      duration,
      playbackRate,
      timestamp,
      playing: playbackRate > 0,
      raw: artist ? `${title}, ${artist}` : title,
      source: "MediaRemote"
    };
  } catch {
    return null;
  }
}

function parseTrack(raw) {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return null;

  if (normalized.includes(",") && !normalized.includes(" - ")) {
    const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { title: parts[0], artist: parts.slice(1).join(", "), raw: normalized };
    }
  }

  const separators = [" - ", " — ", " – ", "｜", "|"];
  for (const separator of separators) {
    if (!normalized.includes(separator)) continue;
    const parts = normalized.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return { title: parts[0], artist: parts.slice(1).join(separator), raw: normalized };
    }
  }

  return { title: normalized, artist: "QQ 音乐", raw: normalized };
}

async function getMacNowPlaying() {
  const mediaRemote = await getMediaRemoteNowPlaying();
  if (mediaRemote) return mediaRemote;

  const scripts = [
    'tell application "System Events" to tell process "QQMusic" to get value of every static text of window 1',
    'tell application "System Events" to tell process "QQMusic" to get name of front window',
    'tell application "System Events" to tell process "QQ??" to get name of front window',
    'tell application "System Events" to get name of every process whose background only is false'
  ];

  for (const script of scripts.slice(0, 3)) {
    const raw = await runOsaScript(script);
    const parsed = parseTrack(raw);
    if (parsed) return { ...parsed, source: "QQ Music accessibility" };
  }

  const processes = await runOsaScript(scripts[3]);
  return {
    title: "",
    artist: "",
    raw: processes,
    source: "System Events",
    message: "Unable to read the current QQ Music track on macOS. Confirm QQ Music is playing and system automation access is allowed."
  };
}

async function getWindowsNowPlaying() {
  const ready = await ensureWindowsGsmtcTool();
  if (ready) {
    const gsmtcResult = await runCommandDetailed(WINDOWS_GSMTC_BIN, [], 8000);
    if (gsmtcResult.ok && gsmtcResult.stdout) {
      try {
        const info = JSON.parse(gsmtcResult.stdout);
        const title = info?.titleBase64
          ? Buffer.from(info.titleBase64, "base64").toString("utf8")
          : "";
        const artist = info?.artistBase64
          ? Buffer.from(info.artistBase64, "base64").toString("utf8")
          : "";
        if (info?.found && (title || artist)) {
          return {
            title,
            artist,
            raw: artist ? `${title} - ${artist}` : title,
            elapsed: numberOrNull(info.elapsed),
            duration: numberOrNull(info.duration),
            playing: info.playbackStatus === "Playing",
            playbackRate: info.playbackStatus === "Playing" ? 1 : 0,
            source: `GSMTC (${info.sourceApp || "Windows"})`
          };
        }
      } catch {}
    }
  }

  const result = await runCommandDetailed("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    WINDOWS_NOW_PLAYING_SCRIPT
  ], 8000);

  if (!result.ok || !result.stdout) {
    return {
      title: "",
      artist: "",
      raw: "",
      source: "Windows fallback",
      message: "QQ Music detection failed on Windows. Enter the song title and artist manually, then use Auto LRC."
    };
  }

  try {
    const info = JSON.parse(result.stdout);
    const raw = info?.rawBase64
      ? Buffer.from(info.rawBase64, "base64").toString("utf8")
      : "";

    if (!info?.found || !raw) {
      return {
        title: "",
        artist: "",
        raw: "",
        source: "Windows fallback",
        message: info?.message || "QQ Music is open, but the current track was not detected."
      };
    }

    const parsed = parseTrack(raw);
    if (!parsed) {
      return {
        title: "",
        artist: "",
        raw,
        source: "Windows fallback",
        message: "A QQ Music window was found, but its title could not be parsed into track and artist."
      };
    }

    return {
      ...parsed,
      playing: true,
      source: "QQ Music window title"
    };
  } catch {
    return {
      title: "",
      artist: "",
      raw: "",
      source: "Windows fallback",
      message: "QQ Music detection returned an unexpected response on Windows."
    };
  }
}

async function getCrossPlatformNowPlaying() {
  if (process.platform === "darwin") {
    return getMacNowPlaying();
  }

  if (process.platform === "win32") {
    return getWindowsNowPlaying();
  }

  return {
    title: "",
    artist: "",
    raw: "",
    source: "Unsupported platform",
    message: `Automatic now-playing is not supported on ${process.platform}. Enter the song title and artist manually, then use Auto LRC.`
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": USER_AGENT } }, (response) => {
      let body = "";

      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`LRCLIB returned ${response.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("LRCLIB returned invalid JSON"));
        }
      });
    });

    request.setTimeout(8000, () => {
      request.destroy(new Error("LRCLIB request timed out"));
    });
    request.on("error", reject);
  });
}

function buildLrcLibUrl(endpoint, params) {
  const url = new URL(`${LRCLIB_BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== "" && value !== null && value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function normalizeLyricResult(result) {
  return {
    found: true,
    id: result.id,
    title: result.trackName || "",
    artist: result.artistName || "",
    album: result.albumName || "",
    duration: result.duration || null,
    syncedLyrics: result.syncedLyrics || "",
    plainLyrics: result.plainLyrics || "",
    instrumental: Boolean(result.instrumental),
    source: "LRCLIB"
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeSearchString(value) {
  return String(value || "")
    .replace(/[【】[\]（）()]/g, " ")
    .replace(/[|｜/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripVersionTags(value) {
  return normalizeSearchString(value)
    .replace(/\b(?:live|ver\.?|version|mv|demo|伴奏|纯音乐|inst\.?|instrumental|cover|remix|edit|remaster(?:ed)?)\b/gi, " ")
    .replace(/\s+-\s+.*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeBracketedText(value) {
  return normalizeSearchString(value)
    .replace(/[\(\[（【][^\)\]）】]*[\)\]）】]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildTitleVariants(title) {
  const normalized = normalizeSearchString(title);
  const withoutBrackets = removeBracketedText(title);
  const withoutVersion = stripVersionTags(title);
  const simplifiedDash = normalized.split(" - ")[0]?.trim();

  return unique([
    normalized,
    withoutBrackets,
    withoutVersion,
    stripVersionTags(withoutBrackets),
    simplifiedDash
  ]).filter((value) => value.length >= 2);
}

function buildArtistVariants(artist) {
  const normalized = normalizeSearchString(artist);
  const parts = normalized
    .split(/,|&|、|\/| feat\.? | featuring | x | X /i)
    .map((value) => value.trim())
    .filter(Boolean);

  return unique([
    normalized,
    parts[0],
    parts.slice(0, 2).join(", ")
  ]).filter((value) => value && value !== "QQ 音乐");
}

function buildBroadSearchQueries(title, artist) {
  const titleVariants = buildTitleVariants(title);
  const artistVariants = buildArtistVariants(artist);
  const queries = [];

  for (const titleVariant of titleVariants) {
    queries.push(titleVariant);
    for (const artistVariant of artistVariants.slice(0, 2)) {
      queries.push(`${titleVariant} ${artistVariant}`.trim());
    }
  }

  return unique(queries).slice(0, 8);
}

function scoreTextMatch(source, target) {
  if (!source || !target) return 0;
  if (source === target) return 35;
  if (source.includes(target) || target.includes(source)) return 22;

  const sourceTokens = new Set(source.split(/\s+/).filter(Boolean));
  const targetTokens = target.split(/\s+/).filter(Boolean);
  let overlap = 0;
  for (const token of targetTokens) {
    if (sourceTokens.has(token)) overlap += 1;
  }
  return overlap * 6;
}

function scoreLyricResult(result, title, artist, duration) {
  const resultTitle = normalizeSearchString(result.trackName).toLowerCase();
  const resultArtist = normalizeSearchString(result.artistName).toLowerCase();
  const normalizedTitle = normalizeSearchString(title).toLowerCase();
  const normalizedArtist = normalizeSearchString(artist).toLowerCase();
  let score = 0;

  if (result.syncedLyrics) score += 40;
  if (result.plainLyrics) score += 10;
  score += scoreTextMatch(resultTitle, normalizedTitle);
  score += scoreTextMatch(resultArtist, normalizedArtist);
  if (duration && result.duration) {
    score += Math.max(0, 20 - Math.abs(Number(result.duration) - Number(duration)));
  }

  return score;
}

function stripLocalLyricsPrefix(fileName) {
  return String(fileName || "")
    .replace(/\.lrc$/i, "")
    .replace(/^爱歌词\s*aigeci\.com\s*-\s*/i, "")
    .replace(/^酷歌词\s*kugeci\.com[_\s-]*/i, "")
    .trim();
}

function splitLocalLyricsNameParts(fileName) {
  const cleaned = stripLocalLyricsPrefix(fileName)
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const dashParts = cleaned
    .split(/\s*-\s*/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (dashParts.length >= 2) {
    return {
      artist: dashParts.slice(0, -1).join(" "),
      title: dashParts[dashParts.length - 1]
    };
  }

  return {
    artist: "",
    title: cleaned
  };
}

function scoreLocalLyricsFile(fileName, title, artist) {
  const normalizedName = normalizeSearchString(stripLocalLyricsPrefix(fileName)).toLowerCase();
  const titleVariants = buildTitleVariants(title).map((value) => value.toLowerCase());
  const artistVariants = buildArtistVariants(artist).map((value) => value.toLowerCase());
  const combinedVariants = unique([
    ...titleVariants.map((value) => `${value} ${artistVariants[0] || ""}`.trim()),
    ...titleVariants.map((value) => `${artistVariants[0] || ""} ${value}`.trim())
  ]).filter(Boolean);
  const parts = splitLocalLyricsNameParts(fileName);
  const parsedTitle = normalizeSearchString(parts.title).toLowerCase();
  const parsedArtist = normalizeSearchString(parts.artist).toLowerCase();
  let score = 0;

  for (const titleVariant of titleVariants) {
    score += scoreTextMatch(normalizedName, titleVariant);
    score += scoreTextMatch(parsedTitle, titleVariant) * 1.6;
  }

  for (const artistVariant of artistVariants) {
    score += scoreTextMatch(normalizedName, artistVariant) * 0.6;
    score += scoreTextMatch(parsedArtist, artistVariant) * 1.2;
  }

  for (const combinedVariant of combinedVariants) {
    if (normalizedName === combinedVariant) score += 60;
    else if (normalizedName.includes(combinedVariant)) score += 36;
  }

  if (parsedTitle && titleVariants.includes(parsedTitle)) score += 42;
  if (parsedArtist && artistVariants.includes(parsedArtist)) score += 20;
  return score;
}

function hasLrcTimeTags(content) {
  return /^\s*\[(\d{1,2}):(\d{2})(?:[.:]\d{1,3})?\]/m.test(String(content || ""));
}

function countDecodeArtifacts(content) {
  return (String(content || "").match(/�/g) || []).length;
}

function decodeLyricsBuffer(buffer) {
  const utf8Text = buffer.toString("utf8");
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

async function searchLocalLyrics({ title, artist }) {
  let entries;
  try {
    entries = await fs.readdir(LOCAL_LYRICS_DIR, { withFileTypes: true });
  } catch {
    return null;
  }

  const lrcFiles = entries
    .filter((entry) => entry.isFile() && /\.lrc$/i.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      score: scoreLocalLyricsFile(entry.name, title, artist)
    }))
    .filter((entry) => entry.score >= 26)
    .sort((a, b) => b.score - a.score);

  const best = lrcFiles[0];
  if (!best) return null;

  const filePath = path.join(LOCAL_LYRICS_DIR, best.name);
  let content = "";
  try {
    const buffer = await fs.readFile(filePath);
    content = decodeLyricsBuffer(buffer);
  } catch {
    return null;
  }

  const lyrics = String(content || "").replace(/^\uFEFF/, "").trim();
  if (!lyrics) return null;

  const parts = splitLocalLyricsNameParts(best.name);
  return {
    found: true,
    title: parts.title || title,
    artist: parts.artist || artist,
    duration: null,
    syncedLyrics: hasLrcTimeTags(lyrics) ? lyrics : "",
    plainLyrics: hasLrcTimeTags(lyrics) ? "" : lyrics,
    instrumental: false,
    source: "Local Folder",
    fileName: best.name,
    filePath
  };
}

async function searchLyricsCandidates({ title, artist, duration }) {
  const titleVariants = buildTitleVariants(title);
  const artistVariants = buildArtistVariants(artist);
  const attempts = [];

  for (const titleVariant of titleVariants) {
    attempts.push({ track_name: titleVariant, artist_name: artistVariants[0], duration });
    attempts.push({ track_name: titleVariant, artist_name: artistVariants[1], duration });
    attempts.push({ track_name: titleVariant, artist_name: "", duration });
  }

  const seen = new Set();
  const dedupedAttempts = attempts.filter((attempt) => {
    const key = JSON.stringify([
      attempt.track_name || "",
      attempt.artist_name || "",
      attempt.duration || 0
    ]);
    if (seen.has(key) || !attempt.track_name) return false;
    seen.add(key);
    return true;
  });

  const collected = [];

  for (const attempt of dedupedAttempts) {
    try {
      const exact = await fetchJson(buildLrcLibUrl("/get", {
        track_name: attempt.track_name,
        artist_name: attempt.artist_name,
        duration: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : undefined
      }));
      collected.push(exact);
      continue;
    } catch {}

    try {
      const search = await fetchJson(buildLrcLibUrl("/search", {
        track_name: attempt.track_name,
        artist_name: attempt.artist_name
      }));
      if (Array.isArray(search)) {
        collected.push(...search);
      }
    } catch {}
  }

  for (const query of buildBroadSearchQueries(title, artist)) {
    try {
      const search = await fetchJson(buildLrcLibUrl("/search", { q: query }));
      if (Array.isArray(search)) {
        collected.push(...search);
      }
    } catch {}
  }

  const byId = new Map();
  for (const item of collected) {
    const id = item.id || `${item.trackName}-${item.artistName}-${item.duration}`;
    if (!byId.has(id)) byId.set(id, item);
  }

  return [...byId.values()];
}

async function searchLyricsOvh({ title, artist }) {
  const titleVariants = buildTitleVariants(title);
  const artistVariants = buildArtistVariants(artist);

  for (const artistVariant of artistVariants) {
    for (const titleVariant of titleVariants) {
      try {
        const result = await fetchJson(
          `${LYRICS_OVH_BASE_URL}/${encodeURIComponent(artistVariant)}/${encodeURIComponent(titleVariant)}`
        );
        if (result?.lyrics) {
          return {
            found: true,
            title: titleVariant,
            artist: artistVariant,
            duration: null,
            syncedLyrics: "",
            plainLyrics: result.lyrics,
            instrumental: false,
            source: "lyrics.ovh"
          };
        }
      } catch {}
    }
  }

  return null;
}

async function getLyrics(url) {
  const title = url.searchParams.get("track") || url.searchParams.get("title") || "";
  const artist = url.searchParams.get("artist") || "";
  const duration = Number(url.searchParams.get("duration") || 0);

  if (!title.trim()) {
    return { found: false, message: "缺少歌曲名，无法自动搜索歌词。" };
  }

  const localLyrics = await searchLocalLyrics({ title, artist });
  if (localLyrics) return localLyrics;

  const candidates = await searchLyricsCandidates({ title, artist, duration });
  if (!candidates.length) {
    const lyricsOvh = await searchLyricsOvh({ title, artist });
    if (lyricsOvh) return lyricsOvh;

    return {
      found: false,
      source: "LRCLIB",
      message: "没有在 LRCLIB 宽松搜索或 lyrics.ovh 找到匹配歌词。可以试试改短歌名、去掉版本名，或手动导入 LRC。"
    };
  }

  const best = candidates
    .slice()
    .sort((a, b) => scoreLyricResult(b, title, artist, duration) - scoreLyricResult(a, title, artist, duration))[0];
  return normalizeLyricResult(best);
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/now-playing" && req.method === "GET") {
    sendJson(res, 200, await getCrossPlatformNowPlaying());
    return;
  }

  if (url.pathname === "/api/network" && req.method === "GET") {
    sendJson(res, 200, getNetworkAccessInfo());
    return;
  }

  if (url.pathname === "/api/lyrics" && req.method === "GET") {
    sendJson(res, 200, await getLyrics(url));
    return;
  }

  await serveStatic(req, res);
}

http.createServer((req, res) => {
  route(req, res).catch((error) => sendJson(res, 500, { error: error.message }));
}).listen(PORT, () => {
  console.log(`Lyric Veil is running at http://localhost:${PORT}`);
});
