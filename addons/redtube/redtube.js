// @name        RedTube
// @id          org.plexo.js.redtube
// @version     1.0.0
// @author      Plexo add-ons
// @domains     redtube.com, redtube.net, rdtcdn.com
// @category    18+
// @description 18+ only. Browse, search and stream RedTube, with mirror and player fallbacks
//
// What it gives Plexo: home, search, channels / pornstars / users (with header), every quality up to 4K
// with Auto, uploader and pornstars, related videos, Shorts tab, and test mode (search "debug").
//
// Fallbacks
//   1. Mirrors: www.redtube.com, then redtube.net and the regional mirrors. The working one is remembered.
//   2. Video links: the player's quality list (mediaDefinition), opening its extra mp4 list when needed,
//      then any plain mp4/m3u8 link in the page.
//   3. Lists: the site's video tiles, then a plain scan of video links.
//
// Written from how the site is known to work (yt-dlp's RedTube extractor as a guide); not tested live.

var SITE_NAME = "RedTube";
var MIRRORS = ["https://www.redtube.com", "https://www.redtube.net", "https://de.redtube.com", "https://es.redtube.com", "https://fr.redtube.com"];
var COOKIE = "age_verified=1; platform=pc; accessAgeDisclaimerRT=1";

// /123456  (also /123456?... or embed.redtube.com/?id=123456)
function videoKey(u) {
  var s = str(u);
  var m = s.match(/redtube\.[a-z]+\/(\d{3,})(?:[\/?#]|$)/i) || s.match(/^\/(\d{3,})(?:[\/?#]|$)/) || s.match(/[?&]id=(\d{3,})/);
  return m ? m[1] : "";
}

var TILE_SPLIT = /<li\b[^>]*class="[^"]*(?:videoblock_list|video_block|thumbnail-card|tm_video_block)[^"]*"/i;
var VIDEO_HREF = /^(?:https?:\/\/[^\/]*redtube\.[a-z]+)?\/\d{3,}(?:[\/?#]|$)/i;

function pageSuffix(path, p) {
  if (p <= 1) return path;
  return path + (path.indexOf("?") === -1 ? "?" : "&") + "page=" + p;
}

function home(page) {
  var p = page && page > 1 ? page : 1;
  var res = fetchAny(pageSuffix("/", p));
  var list = tilesSplit(res.html, res.base, TILE_SPLIT, VIDEO_HREF);
  if (!list.length) { res = fetchAny(pageSuffix("/newest", p)); list = tilesSplit(res.html, res.base, TILE_SPLIT, VIDEO_HREF); }
  return list;
}

function search(query, page) {
  var q = str(query).trim();
  if (!q) return [];
  var p = page && page > 1 ? page : 1;
  if (/^debug\b/i.test(q)) return p > 1 ? [] : debugReport(q.replace(/^debug\s*:?\s*/i, ""));
  var res = fetchAny(pageSuffix("/?search=" + encodeURIComponent(q).replace(/%20/g, "+"), p));
  return tilesSplit(res.html, res.base, TILE_SPLIT, VIDEO_HREF);
}

function browse(url, page) {
  var p = page && page > 1 ? page : 1;
  var res;
  try { res = fetchAny(pageSuffix(pathOf(url).replace(/[?#].*$/, ""), p)); } catch (e) { if (p > 1) return []; throw e; }
  var list = tilesSplit(res.html, res.base, TILE_SPLIT, VIDEO_HREF);
  var ch = null;
  for (var k = 0; k < list.length; k++) {
    if (!list[k].creator) {
      ch = ch || channelGeneric(res.html, res.base, url);
      list[k].creator = ch.name; list[k].creatorUrl = ch.url;
      if (ch.avatar) list[k].creatorAvatar = ch.avatar;
    }
  }
  return list;
}

function channel(url) {
  var res = fetchAny(pathOf(url).replace(/[?#].*$/, ""));
  return channelGeneric(res.html, res.base, url);
}

function getStream(url) {
  var res = fetchAny(url);
  __videoPages[url] = res;
  __pages[url] = res.html;
  var headers = { "Referer": res.url, "Origin": res.base, "Cookie": COOKIE };
  var cands = mediaCands(mediaDefsIn(res.html), res.base, headers);
  if (!cands.length) {
    var any = findMediaUrls(res.html);
    for (var i = 0; i < any.length; i++) if (!/thumb|preview|mediabook/i.test(any[i])) cands.push({ h: heightOf(any[i]), url: any[i], hls: any[i].indexOf(".m3u8") !== -1 });
  }
  if (!cands.length) throw new Error("No video links found (removed, private or premium-only)");
  return buildStreams(cands, headers);
}

function getInfo(url) {
  var res = __videoPages[url] || fetchAny(url);
  var info = { creator: "", creatorUrl: "", actors: [] };
  var up = res.html.match(/class="[^"]*(?:video-infobox-link|video_provider|channel-link|author)[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
           res.html.match(/<a\b[^>]*href="(\/(?:channels|users|amateur)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (up) { info.creator = textOf(up[2]); info.creatorUrl = absUrl(res.base, decodeHtml(up[1])); }
  var stars = linkMatches(res.html, "pornstar", 15);
  var seen = {};
  for (var i = 0; i < stars.length; i++) {
    var k = stars[i].name.toLowerCase();
    if (seen[k] || /^pornstars?$/.test(k)) continue;
    seen[k] = true;
    info.actors.push({ name: stars[i].name, url: absUrl(res.base, stars[i].href) });
  }
  return info;
}

function related(url) {
  var res = __videoPages[url] || fetchAny(url);
  var at = res.html.search(/id="(?:related_videos|relatedVideos|related-videos|recommended)[^"]*"/i);
  return tilesSplit(at !== -1 ? res.html.slice(at) : res.html, res.base, TILE_SPLIT, VIDEO_HREF, url).slice(0, 40);
}

function comments(url) { return []; }

// ---------- Tiles and players shared by Aylo-built sites (YouPorn, RedTube) ----------

// Splits a list page into tiles at `splitRe` and reads each one.
function tilesSplit(html, base, splitRe, hrefRe, skipUrl) {
  var out = [];
  var seen = {};
  if (skipUrl) seen[videoKey(skipUrl)] = true;
  var parts = html.split(splitRe);
  for (var i = 1; i < parts.length; i++) {
    var chunk = parts[i].slice(0, 6000);
    var a = null, re = /<a\b[^>]*href="([^"]+)"[^>]*>/gi, m;
    while ((m = re.exec(chunk)) !== null) if (hrefRe.test(m[1]) && videoKey(m[1])) { a = m; break; }
    if (!a) continue;
    var key = videoKey(a[1]);
    if (seen[key]) continue;
    var imgs = chunk.match(/<img\b[^>]*>/gi) || [];
    var thumb = "";
    var names = ["data-original", "data-thumb_url", "data-o_thumb", "data-mediumthumb", "data-src", "data-path", "src"];
    for (var n = 0; n < names.length && !thumb; n++) for (var k = 0; k < imgs.length && !thumb; k++) {
      var v = decodeHtml(attr(imgs[k], names[n]));
      if (/^(https?:)?\/\//.test(v) && !/blank|placeholder|spacer|\.gif(\?|$)|data:image|avatar/i.test(v)) thumb = v;
    }
    if (!thumb) thumb = findThumb(chunk, base);
    var title = attr(a[0], "title") || attr(a[0], "data-title");
    if (!title) {
      var same = chunk.match(new RegExp('<a\\b[^>]*href="' + a[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*title="([^"]+)"', "i")) ||
                 chunk.match(/<a\b[^>]*title="([^"]+)"[^>]*>/i);
      if (same) title = same[1];
    }
    if (!title) { var t = chunk.match(/class="[^"]*(?:title|video_title|video-title-text|video-box-title)[^"]*"[^>]*>\s*(?:<a[^>]*>)?\s*([^<]{3,})</i); title = t ? t[1] : ""; }
    if (!title && imgs[0]) title = attr(imgs[0], "alt");
    title = decodeHtml(str(title)).trim();
    if (!title) continue;
    var dm = chunk.match(/class="[^"]*duration[^"]*"[^>]*>\s*(?:<[^>]+>\s*)*((?:\d{1,2}:)?\d{1,2}:\d{2})/i) || chunk.match(/>\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*</);
    var c = creatorIn(chunk, base);
    seen[key] = true;
    out.push({
      id: key,
      url: absUrl(base, decodeHtml(a[1])),
      title: title,
      thumb: thumb ? absUrl(base, thumb) : "",
      duration: dm ? toSeconds(dm[1]) : 0,
      creator: c.name,
      creatorUrl: c.url,
      preview: previewIn(chunk, base)
    });
  }
  if (out.length < 4) {
    var more = tilesGeneric(html, base, hrefRe, skipUrl);
    for (var j = 0; j < more.length; j++) if (!seen[more[j].id]) { seen[more[j].id] = true; out.push(more[j]); }
  }
  return out;
}

// [{format, videoUrl, quality, remote}] → stream candidates; "remote" / get_media entries hold the real list.
function mediaCands(defs, base, headers) {
  var cands = [];
  if (!Array.isArray(defs)) return cands;
  for (var i = 0; i < defs.length; i++) {
    var d = defs[i] || {};
    var link = str(d.videoUrl || d.url).replace(/\\\//g, "/");
    if (!link) continue;
    link = absUrl(base, link);
    var fmt = str(d.format).toLowerCase();
    var q = parseInt(Array.isArray(d.quality) ? d.quality[0] : d.quality, 10) || heightOf(link);
    if (d.remote || /get_media|\/media\/(?:mp4|hls)/.test(link)) {
      try {
        var list = JSON.parse(getPage(link, headers));
        for (var j = 0; j < list.length; j++) {
          var it = list[j] || {};
          var u = str(it.videoUrl).replace(/\\\//g, "/");
          if (!u) continue;
          var qq = parseInt(Array.isArray(it.quality) ? it.quality[0] : it.quality, 10) || heightOf(u);
          cands.push({ h: qq, url: absUrl(base, u), hls: str(it.format).toLowerCase() === "hls" || u.indexOf(".m3u8") !== -1 });
        }
      } catch (e) {}
    } else {
      cands.push({ h: q, url: link, hls: fmt === "hls" || link.indexOf(".m3u8") !== -1 });
    }
  }
  return cands;
}

function mediaDefsIn(html) {
  return jsonAfter(html, /["']?mediaDefinitions?["']?\s*:\s*/) || null;
}
// ---------- Shared add-on core (same in every Plexo-addons site file) ----------

var __goodMirror = (typeof http.recall === "function") ? String(http.recall("mirror") || "") : "";
var __videoPages = {};

function str(v) { return v == null ? "" : String(v); }

function pathOf(u) {
  var s = str(u);
  if (s.indexOf("http") === 0) return s.replace(/^https?:\/\/[^\/]+/, "") || "/";
  return s.charAt(0) === "/" ? s : "/" + s;
}

function hostOf(u) {
  var m = str(u).match(/^(https?:\/\/[^\/]+)/);
  return m ? m[1] : "";
}

function looksBlocked(html) {
  var s = str(html);
  if (s.length < 600) return true;
  var head = s.slice(0, 12000);
  if (/cf-chl|challenge-platform|verify you are human|Just a moment\.\.\./i.test(head)) return true;
  if (/not available in your (country|region)|blocked in your (country|region)|court order|Department of Telecommunications|age verification (is )?required/i.test(head)) return true;
  return false;
}

// Loads a page from the first mirror that answers; the working mirror is remembered.
function fetchAny(u, extra, raw) {
  var path = pathOf(u);
  var order = [];
  if (__goodMirror && MIRRORS.indexOf(__goodMirror) !== -1) order.push(__goodMirror);
  var h = hostOf(u);
  if (h && MIRRORS.indexOf(h) !== -1 && order.indexOf(h) === -1) order.push(h);
  for (var i = 0; i < MIRRORS.length; i++) if (order.indexOf(MIRRORS[i]) === -1) order.push(MIRRORS[i]);
  var errors = [];
  for (var j = 0; j < order.length; j++) {
    var target = order[j] + path;
    try {
      var headers = { "Referer": order[j] + "/" };
      if (typeof COOKIE === "string" && COOKIE) headers["Cookie"] = COOKIE;
      if (extra) for (var k in extra) headers[k] = extra[k];
      var html = getPage(target, headers);
      if (!raw && looksBlocked(html)) throw new Error("blocked");
      if (__goodMirror !== order[j] && typeof http.remember === "function") http.remember("mirror", order[j]);
      __goodMirror = order[j];
      return { base: order[j], url: target, html: html };
    } catch (e) {
      errors.push(order[j].replace("https://", "") + ": " + (e && e.message ? e.message.slice(0, 50) : "error"));
      if (__goodMirror === order[j]) {
        __goodMirror = "";
        if (typeof http.remember === "function") http.remember("mirror", "");
      }
    }
  }
  throw new Error(SITE_NAME + " couldn't be reached on any mirror (" + errors.slice(0, 3).join("; ") + ")");
}

function num(v) {
  if (typeof v === "number") return v;
  var s = str(v).replace(/,/g, "").trim();
  var m = s.match(/([\d.]+)\s*([kKmMbB])?/);
  if (!m) return 0;
  var mul = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase()] || 1;
  return Math.round(parseFloat(m[1]) * mul);
}

function metaOf(html, prop) {
  var re = new RegExp('<meta[^>]+(?:property|name)="' + prop + '"[^>]*>', "i");
  return attr((html.match(re) || [""])[0], "content");
}

function countNear(html, word) {
  var re1 = new RegExp('>\\s*([\\d.,]+\\s*[KkMm]?)\\s*<[^>]*>\\s*(?:<[^>]*>\\s*)*' + word, "i");
  var re2 = new RegExp(word + '\\s*:?\\s*(?:<[^>]*>\\s*)*([\\d.,]+\\s*[KkMm]?)\\s*<', "i");
  var re3 = new RegExp('([\\d.,]+\\s*[KkMm]?)\\s+' + word, "i");
  var m = html.match(re1) || html.match(re2) || textOf(html.slice(0, 300000)).match(re3);
  return m ? num(m[1]) : 0;
}

// Tiles of a list page: every link to a video with its picture, title and length,
// plus the uploader and preview clip found next to it.
function tilesGeneric(html, base, hrefRe, skipUrl) {
  var list = anchorList(html, base, hrefRe);
  var out = [];
  var seen = {};
  if (skipUrl) seen[videoKey(skipUrl)] = true;
  for (var i = 0; i < list.length; i++) {
    var k = videoKey(list[i].url);
    if (!k || seen[k]) continue;
    seen[k] = true;
    list[i].id = k;
    list[i].title = decodeHtml(list[i].title).trim();
    out.push(list[i]);
  }
  return attachExtras(out, html, base);
}

// Name, picture, banner, counts and about text of a channel / model / user page.
function channelGeneric(html, base, url) {
  var out = { name: "", url: absUrl(base, pathOf(url).replace(/\/(?:videos?|uploads?)(?:\/.*)?$/, "")), avatar: "", banner: "", subscribers: 0, videos: 0, description: "" };
  var h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<h2\b[^>]*class="[^"]*(?:name|title)[^"]*"[^>]*>([\s\S]*?)<\/h2>/i);
  var name = h1 ? textOf(h1[1]) : "";
  if (!name) name = textOf(metaOf(html, "og:title"));
  name = name.replace(/\s*[|\-–]\s*[^|\-–]*$/i, "").replace(/['’]s?\s+(?:Porn\s+|Free\s+)?(?:Videos?|Profile|Channel).*$/i, "").replace(/\s+(?:Porn\s+|Free\s+)?Videos?\b.*$/i, "").trim();
  if (!name) {
    var seg = pathOf(url).split("/").filter(function (x) { return x; });
    name = decodeURIComponent(seg[1] || seg[0] || "").replace(/[-_+]+/g, " ");
  }
  out.name = name;
  var av = html.match(/<img\b[^>]*(?:id|class)="[^"]*(?:avatar|profile-?pic|profilePic|model-?pic|channel-?logo|pornstar-?pic|getAvatar|thumbImage)[^"]*"[^>]*>/i) ||
           html.match(/<div\b[^>]*class="[^"]*(?:avatar|profile-?pic|channel-?logo)[^"]*"[^>]*>\s*(?:<a[^>]*>\s*)?<img\b[^>]*>/i);
  if (av) {
    var img = (av[0].match(/<img\b[^>]*>/i) || [av[0]])[0];
    out.avatar = absUrl(base, decodeHtml(attr(img, "data-src") || attr(img, "src")));
  }
  if (!out.avatar) {
    var og = metaOf(html, "og:image");
    if (og && !/\/videos?\/|thumbs?\d*\/|\/frames?\//i.test(og)) out.avatar = absUrl(base, og);
  }
  var cv = html.match(/<img\b[^>]*(?:id|class)="[^"]*(?:cover|banner)[^"]*"[^>]*>/i);
  if (cv) out.banner = absUrl(base, decodeHtml(attr(cv[0], "data-src") || attr(cv[0], "src")));
  if (!out.banner) {
    var bg = html.match(/class="[^"]*(?:cover|banner)[^"]*"[^>]*style="[^"]*url\((?:&quot;|'|")?([^)"'&]+)/i);
    if (bg) out.banner = absUrl(base, bg[1]);
  }
  out.subscribers = countNear(html, "(?:Subscribers|Followers)");
  out.videos = countNear(html, "Videos");
  var about = html.match(/<(?:div|p|section)\b[^>]*class="[^"]*(?:about|bio|description)[^"]*"[^>]*>([\s\S]{0,4000}?)<\/(?:div|p|section)>/i);
  var at = about ? textOf(about[1]) : "";
  out.description = (at.length > 10 ? at : textOf(metaOf(html, "og:description") || metaOf(html, "description"))).slice(0, 2000);
  if (!/^https?:/.test(out.avatar)) out.avatar = "";
  if (!/^https?:/.test(out.banner)) out.banner = "";
  return out;
}

// cands: [{h, url, hls}] → Plexo's quality list: best first, every height once, then Auto (~720p HLS, fast start).
function buildStreams(cands, headers) {
  var expanded = [];
  for (var c = 0; c < cands.length; c++) {
    if (!cands[c] || !cands[c].url) continue;
    expanded.push(cands[c]);
    if (cands[c].hls && !cands[c].h) {
      var vars = [];
      try { vars = hlsVariants(cands[c].url, headers); } catch (e) {}
      for (var v = 0; v < vars.length; v++) if (vars[v].h) expanded.push({ h: vars[v].h, url: vars[v].url, hls: true, fromMaster: true });
    }
  }
  expanded.sort(function (x, y) { return (y.h || 0) - (x.h || 0) || (x.hls ? 1 : 0) - (y.hls ? 1 : 0); });
  var out = [];
  var seenH = {};
  for (var e2 = 0; e2 < expanded.length; e2++) {
    var it = expanded[e2];
    if (!it.h || seenH[it.h]) continue;
    seenH[it.h] = true;
    out.push({ label: it.h + "p", url: it.url, headers: headers });
  }
  var auto = null;
  for (var a = 0; a < expanded.length && !auto; a++) if (expanded[a].hls && !expanded[a].h) auto = expanded[a];
  if (!auto) for (var b = 0; b < expanded.length && !auto; b++) if (expanded[b].h && expanded[b].h <= 720 && (expanded[b].hls || !expanded[b].fromMaster)) auto = expanded[b];
  if (!auto && expanded.length) auto = expanded[expanded.length - 1];
  if (auto) out.push({ label: "Auto", url: auto.url, headers: headers });
  return out;
}

function shortOnly(list) {
  var s = list.filter(function (v) { return v.duration > 0 && v.duration <= 600; });
  return s.length ? s : list;
}

// Shorts tab: short clips from the normal lists.
function shorts(page, query) {
  return shortOnly(query ? search(query, page) : home(page));
}

// ---------- Test mode: search "debug" or "debug: <video or channel link>" ----------

function debugReport(target) {
  var lines = [];
  function line(t) {
    var s = str(t).replace(/\s+/g, " ");
    for (var c = 0; c < s.length && c < 400; c += 38) lines.push((c ? "  …" : "") + s.slice(c, c + 38));
  }
  var videoUrl = "", channelUrl = "";
  if (!target) {
    var h = [];
    try { h = home(1); } catch (e) { line("home failed: " + e.message); }
    line("home: " + h.length + " videos, mirror " + (__goodMirror || "none"));
    if (h.length) {
      line("first: " + h[0].title.slice(0, 40) + " | " + h[0].duration + "s | by " + (h[0].creator || "?"));
      line("thumb: " + (h[0].thumb || "NONE"));
      videoUrl = h[0].url;
      for (var i = 0; i < h.length; i++) if (h[i].creatorUrl) { channelUrl = h[i].creatorUrl; break; }
    }
  } else if (videoKey(target)) videoUrl = target;
  else channelUrl = target;
  if (videoUrl) {
    line("VIDEO " + videoUrl);
    try { var st = getStream(videoUrl); line("qualities: " + st.map(function (x) { return x.label; }).join(", ")); line("first link: " + (st[0] ? st[0].url : "")); }
    catch (e) { line("getStream failed: " + e.message); }
    try { var inf = getInfo(videoUrl); line("by " + (inf.creator || "?") + " | cast: " + inf.actors.map(function (a) { return a.name; }).join(", ")); if (!channelUrl) channelUrl = inf.creatorUrl; }
    catch (e) { line("getInfo failed: " + e.message); }
    try { line("related: " + related(videoUrl).length + " videos"); } catch (e) { line("related failed: " + e.message); }
    try { var cm = comments(videoUrl); line("comments: " + cm.length + (cm[0] ? " e.g. " + cm[0].author + ": " + cm[0].text.slice(0, 40) : "")); } catch (e) { line("comments failed: " + e.message); }
  }
  if (channelUrl) {
    try {
      var ch = channel(channelUrl);
      line("CHANNEL " + channelUrl);
      line("name=" + ch.name + " subs=" + ch.subscribers + " videos=" + ch.videos);
      line("avatar=" + (ch.avatar || "NONE"));
      line("browse: " + browse(channelUrl, 1).length + " videos");
    } catch (e) { line("channel failed: " + e.message); }
  }
  try { line("search 'amateur': " + search("amateur", 1).length + " videos"); } catch (e) { line("search failed: " + e.message); }
  var out = [];
  for (var n = 0; n < lines.length; n++) out.push({ id: "debug" + n, url: MIRRORS[0] + "/#debug-" + n, title: (n + 1) + ". " + lines[n], thumb: "", duration: 0, creator: "Test mode" });
  return out;
}

// Qualities inside an HLS playlist. (Replaces the app's built-in version, which pointed links written
// relative to the playlist, like "720p.m3u8", at the site's root instead of the playlist's folder.)
function hlsVariants(masterUrl, headers) {
  var out = [];
  var text;
  try { text = getPage(masterUrl, headers); } catch (e) { return out; }
  if (text.indexOf("#EXT-X-STREAM-INF") === -1) return out;
  var dir = String(masterUrl).replace(/[?#].*$/, "").replace(/\/[^\/]*$/, "/");
  var query = (String(masterUrl).match(/\?[^#]*/) || [""])[0];
  var lines = text.split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (l.indexOf("#EXT-X-STREAM-INF") !== 0) continue;
    var res = l.match(/RESOLUTION=(\d+)x(\d+)/);
    var bw = l.match(/BANDWIDTH=(\d+)/);
    var next = "";
    for (var j = i + 1; j < lines.length; j++) {
      if (lines[j] && lines[j].charAt(0) !== "#") { next = lines[j].trim(); break; }
    }
    if (!next) continue;
    var url;
    if (/^https?:\/\//.test(next)) url = next;
    else if (next.indexOf("//") === 0) url = "https:" + next;
    else if (next.charAt(0) === "/") url = String(masterUrl).match(/^https?:\/\/[^\/]+/)[0] + next;
    else url = dir + next + (next.indexOf("?") === -1 && query && /token|hash|validfrom|expires|sign|key=/i.test(query) ? query : "");
    var h = res ? Math.min(parseInt(res[1], 10), parseInt(res[2], 10)) : 0;
    out.push({ h: h, bw: bw ? parseInt(bw[1], 10) : 0, url: url });
  }
  return out;
}
