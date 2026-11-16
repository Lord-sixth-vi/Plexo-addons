// @name animepahe
// @id org.plexo.js.animepahe
// @version 1.1.0
// @domains animepahe.pw, animepahe.si, animepahe.com, animepahe.org, animepahe.ru, kwik.cx, kwik.si, kwik.pm
// @category Anime
// @description Anime from animepahe: sub and dub, 360p to 1080p, full episode lists
//
// How it works
//   home()        latest aired episodes
//   search(q)     anime series; tapping one plays episode 1
//   browse(url)   a series page (the "channel"): every episode, 30 per page
//   getStream()   every quality and audio language, best first
//   getInfo()     series name + link, shown as the video's channel
//
// Ready for Plexo Phase 13 (ignored by older Plexo versions):
//   episodes(url, page)  episode list with season/episode numbers
//   related(url)         next episodes first, then recommended series
//   comments(url)        animepahe has no comments, so always []
//
// Streams come from kwik and need the header  Referer: https://kwik.cx/
// Each stream entry carries it in "headers" for the player.
//
// animepahe and kwik sit behind Cloudflare's browser check. Plexo (from the version with
// "Pass site security checks") gets through it with its built-in browser; this add-on only
// needs plain requests.
//
// Written from how the site is known to work, not tested against the live site.
// If it stops working after a site change, only this file needs fixing.

var DOMAINS = ["https://animepahe.pw", "https://animepahe.si", "https://animepahe.com", "https://animepahe.org", "https://animepahe.ru"];
var BASE = DOMAINS[0];
var KWIK_REFERER = "https://kwik.cx/";
var PER_PAGE = 30;

// The site's bot shield lets requests through when this cookie is present (any value).
function randomId(n) {
  var c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  var s = "";
  for (var i = 0; i < n; i++) s += c.charAt(Math.floor(Math.random() * c.length));
  return s;
}
var COOKIE = "__ddg2_=" + randomId(16);

function siteHeaders() {
  return { "Cookie": COOKIE, "Referer": BASE + "/", "X-Requested-With": "XMLHttpRequest" };
}

function isBlockPage(body) {
  return /ddos-guard|cf-browser-verification|challenge-platform|Just a moment|cf_chl_opt/i.test(String(body || "").slice(0, 4000));
}

var CHECK_MSG = "animepahe is behind a security check. In Plexo turn on Settings > Add-ons > Pass site security checks, then try again.";

function fetchFrom(b, path) {
  return http.getH(b + path, JSON.stringify({ "Cookie": COOKIE, "Referer": b + "/", "X-Requested-With": "XMLHttpRequest" }));
}

// GET a page on animepahe, trying the mirror domains until one answers properly.
// accept(body) decides whether an answer is the real thing (not a check or a parked page).
var __baseFound = false;
function siteTry(path, accept) {
  var tries = __baseFound ? [BASE].concat(DOMAINS.filter(function (d) { return d !== BASE; })) : DOMAINS;
  var lastErr = null;
  for (var i = 0; i < tries.length; i++) {
    var b = tries[i];
    try {
      var body = fetchFrom(b, path);
      if (isBlockPage(body)) { lastErr = new Error(CHECK_MSG); continue; }
      var ok = accept(body);
      if (ok === undefined || ok === false) { lastErr = new Error("animepahe sent an unexpected answer from " + b.replace("https://", "")); continue; }
      BASE = b;
      __baseFound = true;
      if (body.length > 4000) __pages[b + path] = body;
      return { body: body, value: ok };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("animepahe could not be reached");
}

function site(path) {
  return siteTry(path, function (body) { return String(body || "").length > 100 ? true : false; }).body;
}

// JSON may arrive wrapped (when read through the browser), so take the outermost {...}.
function parseJson(body) {
  var t = String(body || "").trim();
  var a = t.indexOf("{"), z = t.lastIndexOf("}");
  if (a < 0 || z <= a) return undefined;
  try { return JSON.parse(t.slice(a, z + 1)); } catch (e) { return undefined; }
}

function api(query) {
  return siteTry("/api?" + query, parseJson).value;
}

function enc(q) { return encodeURIComponent(q); }

// ---- URLs ----

function animeUrl(animeSession) { return BASE + "/anime/" + animeSession; }
function playUrl(animeSession, epSession) { return BASE + "/play/" + animeSession + "/" + epSession; }

function parseUrl(url) {
  var m = String(url || "").match(/\/(anime|play)\/([A-Za-z0-9-]+)(?:\/([A-Za-z0-9-]+))?/);
  if (!m) return null;
  return { kind: m[1], anime: m[2], ep: m[3] || "" };
}

function epNumber(e) {
  var n = e.episode;
  if (e.episode2 && e.episode2 !== 0 && e.episode2 !== "0") n = n + "-" + e.episode2;
  return String(n);
}

// ---- Series info ----

var __titles = {};
function animeTitle(animeSession) {
  if (__titles[animeSession]) return __titles[animeSession];
  var t = "";
  try {
    var html = site("/anime/" + animeSession);
    var m = html.match(/<h1[^>]*>\s*<span[^>]*>([^<]+)<\/span>/) ||
      html.match(/<meta property="og:title" content="([^"]+)"/) ||
      html.match(/<title>([^<]+?)\s*(?:::|-)\s*animepahe/i);
    if (m) t = decodeHtml(m[1]).trim();
  } catch (e) {}
  __titles[animeSession] = t || "animepahe";
  return __titles[animeSession];
}

// One page of a series' episode list (oldest first).
function releasePage(animeSession, page) {
  var r = api("m=release&id=" + enc(animeSession) + "&sort=episode_asc&page=" + (page || 1));
  return { data: r.data || [], lastPage: r.last_page || 1, total: r.total || 0 };
}

function episodeItem(animeSession, title, e) {
  var label = "Episode " + epNumber(e) + (e.title ? " · " + e.title : "");
  if (e.filler) label += " (filler)";
  return {
    id: e.session,
    title: title + " · " + label,
    thumb: e.snapshot || "",
    url: playUrl(animeSession, e.session),
    duration: e.duration || "",
    creator: title,
    creatorUrl: animeUrl(animeSession),
    episode: e.episode,
    audio: e.audio || ""
  };
}

// ---- Feeds ----

function home(page) {
  var r = api("m=airing&page=" + (page || 1));
  var out = [];
  var list = r.data || [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (!a.anime_session || !a.session) continue;
    out.push({
      id: a.session,
      title: a.anime_title + " · Episode " + a.episode,
      thumb: a.snapshot || "",
      url: playUrl(a.anime_session, a.session),
      creator: a.anime_title,
      creatorUrl: animeUrl(a.anime_session)
    });
  }
  if (out.length === 0) throw new Error("No new episodes found (or the site changed)");
  return out;
}

function search(query, page) {
  var q = (query || "").trim();
  if (!q) return home(page);
  if (page && page > 1) return [];
  var r = api("m=search&q=" + enc(q));
  var out = [];
  var list = r.data || [];
  for (var i = 0; i < list.length; i++) {
    var a = list[i];
    if (!a.session) continue;
    var extra = [a.type, a.year, a.episodes ? a.episodes + " eps" : "", a.status].filter(function (x) { return x; }).join(" · ");
    out.push({
      id: a.session,
      title: a.title + (extra ? "  (" + extra + ")" : ""),
      thumb: a.poster || "",
      url: animeUrl(a.session),
      creator: a.title,
      creatorUrl: animeUrl(a.session)
    });
  }
  return out;
}

// A series page = its "channel": all episodes, page by page.
function browse(url, page) {
  var p = parseUrl(url);
  if (!p) return [];
  var title = animeTitle(p.anime);
  var r = releasePage(p.anime, page || 1);
  if ((page || 1) > r.lastPage) return [];
  return r.data.map(function (e) { return episodeItem(p.anime, title, e); });
}

// ---- Playback ----

// Undo the "eval(function(p,a,c,k,e,d)...)" packing kwik uses, without running the site's code.
function unbase(word, radix) {
  var alpha = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (radix <= 36) return parseInt(word, radix);
  var n = 0;
  for (var i = 0; i < word.length; i++) n = n * radix + alpha.indexOf(word.charAt(i));
  return n;
}

function unpack(script) {
  var m = script.match(/}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\.split\('\|'\)/);
  if (!m) return "";
  var payload = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  var radix = parseInt(m[2], 10);
  var count = parseInt(m[3], 10);
  var words = m[4].split("|");
  if (words.length !== count) { /* still try */ }
  return payload.replace(/\b\w+\b/g, function (w) {
    var i = unbase(w, radix);
    return (i >= 0 && i < words.length && words[i]) ? words[i] : w;
  });
}

// One kwik embed page -> its m3u8 link.
function kwikSource(embedUrl) {
  var html = http.getH(embedUrl, JSON.stringify({ "Referer": BASE + "/" }));
  var scripts = html.match(/eval\(function\(p,a,c,k,e,d\)[\s\S]*?\.split\('\|'\)[^)]*\)\)/g) || [];
  for (var i = 0; i < scripts.length; i++) {
    var code = unpack(scripts[i]);
    var s = code.match(/source\s*=\s*['"]([^'"]+\.m3u8[^'"]*)['"]/) || code.match(/['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/);
    if (s) return s[1];
  }
  var plain = findMediaUrls(html);
  return plain.length ? plain[0] : "";
}

// Episode 1 of a series (used when a series itself is tapped).
function firstEpisodeUrl(animeSession) {
  var r = releasePage(animeSession, 1);
  if (!r.data.length) throw new Error("This series has no episodes yet");
  return playUrl(animeSession, r.data[0].session);
}

function audioName(code) {
  var c = String(code || "").toLowerCase();
  if (c === "jpn" || c === "ja" || c === "jp") return "Japanese";
  if (c === "eng" || c === "en") return "English";
  if (c === "chi" || c === "zh") return "Chinese";
  if (c === "kor" || c === "ko") return "Korean";
  if (c === "spa" || c === "es") return "Spanish";
  return c ? c.toUpperCase() : "Japanese";
}

function getStream(url) {
  var p = parseUrl(url);
  if (!p) throw new Error("Not an animepahe link");
  var pageUrl = p.kind === "anime" ? firstEpisodeUrl(p.anime) : url;
  var pp = parseUrl(pageUrl);
  var html = site("/play/" + pp.anime + "/" + pp.ep);
  __pages[url] = html;
  __pages[pageUrl] = html;

  var buttons = html.match(/<button\b[^>]*data-src="[^"]*kwik[^"]*"[^>]*>/g) || [];
  var opts = [];
  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    opts.push({
      src: attr(b, "data-src"),
      res: parseInt(attr(b, "data-resolution"), 10) || 0,
      audio: attr(b, "data-audio") || "jpn",
      fansub: attr(b, "data-fansub"),
      av1: attr(b, "data-av1") === "1"
    });
  }
  if (opts.length === 0) throw new Error("No video sources on this episode (removed or the site changed)");

  // Japanese (subbed) first, then dubs; highest resolution first; skip AV1 when a normal copy exists.
  opts.sort(function (a, b) {
    var ja = a.audio === "jpn" ? 0 : 1, jb = b.audio === "jpn" ? 0 : 1;
    return ja - jb || b.res - a.res || (a.av1 ? 1 : 0) - (b.av1 ? 1 : 0);
  });

  var out = [];
  var seen = {};
  for (var k = 0; k < opts.length; k++) {
    var o = opts[k];
    var lang = audioName(o.audio);
    var key = o.res + "|" + lang;
    if (seen[key]) continue;
    var m3u8 = "";
    try { m3u8 = kwikSource(o.src); } catch (e) {}
    if (!m3u8) continue;
    seen[key] = true;
    var label = (o.res ? o.res + "p" : "Auto") + (lang === "Japanese" ? "" : " · " + lang + " dub");
    out.push({
      label: label,
      url: m3u8,
      audio: lang,
      headers: { "Referer": KWIK_REFERER, "Origin": "https://kwik.cx" }
    });
  }
  if (out.length === 0) throw new Error("Could not unlock the video link from kwik (the site may have changed)");
  return out;
}

// Channel (= the series) of the episode being watched.
function getInfo(url) {
  var p = parseUrl(url);
  if (!p) return { creator: "", creatorUrl: "", actors: [] };
  var html = __pages[url] || "";
  var t = "";
  var m = html.match(/<title>\s*([^<]+?)\s+Ep\.?\s*[\d.-]+/i) || html.match(/<a[^>]+href="\/anime\/[^"]+"[^>]*title="([^"]+)"/);
  if (m) t = decodeHtml(m[1]).trim();
  if (!t) t = animeTitle(p.anime);
  return { creator: t, creatorUrl: animeUrl(p.anime), actors: [] };
}

// ---- Phase 13 hooks ----

// Every episode with its number, for "Next episodes", pre-loading and series downloads.
function episodes(url, page) {
  return browse(url, page);
}

// Next episodes first, then series the site recommends.
function related(url) {
  var p = parseUrl(url);
  if (!p) return [];
  var title = animeTitle(p.anime);
  var out = [];

  if (p.kind === "play") {
    // Find the current episode, then take the ones after it.
    var found = -1;
    var list = [];
    for (var page = 1; page <= 20; page++) {
      var r = releasePage(p.anime, page);
      list = list.concat(r.data);
      if (found < 0) {
        for (var i = 0; i < list.length; i++) if (list[i].session === p.ep) { found = i; break; }
      }
      if (found >= 0 && list.length - found > 10) break;
      if (page >= r.lastPage) break;
    }
    if (found >= 0) {
      for (var j = found + 1; j < list.length && out.length < 10; j++) {
        var it = episodeItem(p.anime, title, list[j]);
        it.nextEpisode = true;
        out.push(it);
      }
    }
  }

  // Related / recommended series from the series page.
  try {
    var html = site("/anime/" + p.anime);
    var re = /<a\b[^>]*href="\/anime\/([A-Za-z0-9-]+)"[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    var seen = {};
    seen[p.anime] = true;
    var m;
    while ((m = re.exec(html)) !== null && out.length < 40) {
      if (seen[m[1]]) continue;
      seen[m[1]] = true;
      var img = (m[3].match(/data-src="([^"]+)"/) || m[3].match(/src="([^"]+)"/) || [])[1] || "";
      out.push({
        id: m[1],
        title: decodeHtml(m[2]),
        thumb: img,
        url: animeUrl(m[1]),
        creator: decodeHtml(m[2]),
        creatorUrl: animeUrl(m[1])
      });
    }
  } catch (e) {}
  return out;
}

function comments(url) {
  return [];
}
