// @name        7Movies
// @id          org.plexo.js.7movies
// @version     1.0.1
// @author      Plexo add-ons
// @domains     7movies.ac, 7movies.ws, 7shows.st, image.tmdb.org, embed.vidrift.net, vidrift.net, bigbang.cymru, bigbang.observer, vidly.pro, rousav.tech, johndoesdmc.workers.dev, hakunaymatata.com, googleusercontent.com, r2.cloudflarestorage.com
// @category    Movies
// @description Free movies and TV shows streaming from multiple servers up to 4K (2160p)

var MIRRORS = ["https://7movies.ac", "https://7movies.ws", "https://7shows.st"];
var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};
var M_GEN = { action:28, adventure:12, animation:16, comedy:35, crime:80, documentary:99, drama:18, family:10751, fantasy:14, history:36, horror:27, music:10402, mystery:9648, romance:10749, "science-fiction":878, "tv-movie":10770, thriller:53, war:10752, western:37 };
var T_GEN = { "action-adventure":10759, animation:16, comedy:35, crime:80, documentary:99, drama:18, family:10751, kids:10762, mystery:9648, news:10763, reality:10764, "sci-fi-fantasy":10765, soap:10766, talk:10767, "war-politics":10768, western:37 };

var _origAbs = absUrl;
absUrl = function(b, u) {
  if (u && u.indexOf("http") !== 0 && u.indexOf("//") !== 0 && u.charAt(0) !== "/" && b && b.indexOf(".m3u8") !== -1) {
    return b.substring(0, b.lastIndexOf("/") + 1) + u;
  }
  return _origAbs(b, u);
};

function looksBlocked(h) {
  if (!h || h.length < 15) return true;
  var t = h.trim();
  if (t.charAt(0) === "{" || t.charAt(0) === "[") return false;
  var l = h.toLowerCase();
  return (l.indexOf("attention required!") !== -1 && l.indexOf("cloudflare") !== -1) || l.indexOf("not available in your country") !== -1 || l.indexOf("<title>access denied") !== -1 || l.indexOf("<title>403") !== -1;
}

function fetchAny(path, customH) {
  var h = customH || HEADERS, err, p = path.charAt(0) === "/" ? path : "/" + path;
  for (var i = 0; i < MIRRORS.length; i++) {
    try {
      var body = getPage(MIRRORS[i] + p, h);
      if (looksBlocked(body)) throw new Error("blocked");
      return { base: MIRRORS[i], body: body };
    } catch (e) { err = e; }
  }
  throw new Error("Site unreachable (" + (err && err.message) + ")");
}

function pad2(n) { return n < 10 ? "0" + n : String(n); }

function genreOf(name, mt) {
  var slug = String(name || "").toLowerCase().replace(/\s+(?:movies|tv|shows)$/i, "").replace(/&/g, " ").replace(/\s+/g, "-").trim();
  var map = mt === "tv" ? T_GEN : M_GEN;
  if (map[slug]) return { id: map[slug], slug: slug };
  slug = slug.replace("science-fiction", "sci-fi-fantasy");
  return map[slug] ? { id: map[slug], slug: slug } : null;
}

function mapItems(items, base) {
  var out = [], seen = {};
  if (!Array.isArray(items)) return out;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.id) continue;
    var mt = it.mediaType === "tv" ? "tv" : "movie", title = String(it.title || it.name || "").trim();
    if (!title) continue;
    var url = mt === "tv" ? base + "/tv/" + it.id + "/watch?season=1&episode=1" : base + "/movie/" + it.id;
    if (seen[url]) continue;
    seen[url] = true;
    var thumb = it.poster || it.backdrop || "";
    if (thumb && thumb.charAt(0) === "/") thumb = "https://image.tmdb.org/t/p/w500" + thumb;
    var g = mt === "movie" && it.genre ? genreOf(it.genre, "movie") : null;
    out.push({
      id: mt + "-" + it.id,
      url: url,
      title: it.year ? title + " (" + it.year + ")" : title,
      thumb: thumb,
      duration: 0,
      creator: mt === "tv" ? title : (it.genre || "Movies"),
      creatorUrl: mt === "tv" ? base + "/tv/" + it.id : (g ? base + "/movies/" + g.slug : base + "/movies")
    });
  }
  return out;
}

function home(page) {
  var p = parseInt(page, 10) || 1;
  var res = fetchAny("/api/discover?page=" + p, { "User-Agent": HEADERS["User-Agent"], "Accept": "application/json" });
  var data = JSON.parse(res.body);
  if (!data || !Array.isArray(data.items)) throw new Error("Site layout changed: home");
  return mapItems(data.items, res.base);
}

function search(query, page) {
  var p = parseInt(page, 10) || 1, q = String(query || "").trim();
  if (!q) return [];
  var jh = { "User-Agent": HEADERS["User-Agent"], "Accept": "application/json" };
  if (q.toLowerCase() === "movies") {
    var mRes = fetchAny("/api/discover?type=movie&page=" + p, jh);
    return mapItems(JSON.parse(mRes.body).items || [], mRes.base);
  }
  var isTv = /\btv\b/i.test(q), gm = genreOf(q, isTv ? "tv" : "movie");
  if (gm && /\b(?:movies|tv|shows)\b/i.test(q)) {
    var gRes = fetchAny("/api/discover?type=" + (isTv ? "tv" : "movie") + "&genre=" + gm.id + "&page=" + p, jh);
    var gc = mapItems(JSON.parse(gRes.body).items || [], gRes.base);
    for (var gi = 0; gi < gc.length; gi++) { if (gc[gi].url.indexOf("/movie/") !== -1) gc[gi].creator = q; }
    return gc;
  }
  if (p > 1) return [];
  var res = fetchAny("/api/search?v=5&q=" + encodeURIComponent(q), jh);
  var data = JSON.parse(res.body);
  if (!data || !Array.isArray(data.results)) throw new Error("Site layout changed: search");
  return mapItems(data.results, res.base);
}

function showTitleOf(html) {
  var tm = html.match(/<h1[^>]*>([^<]+)<\/h1>/) || html.match(/<h1[^>]*>[\s\S]*?\balt="([^"]+)"/);
  if (tm) return decodeHtml(tm[1]).trim();
  var ttl = html.match(/<title>([^<]+)<\/title>/);
  return ttl ? decodeHtml(ttl[1]).replace(/\s*(?:\(\d{4}\))?\s*[—\-|]\s*Watch on 7Movies.*$/i, "").trim() : "";
}

function browse(url, page) {
  var p = parseInt(page, 10) || 1, bm = String(url || "").match(/^https?:\/\/[^\/]+/), base = bm ? bm[0] : MIRRORS[0], path = String(url || "").replace(/^https?:\/\/[^\/]+/, "");
  var tvM = path.match(/^\/tv\/(\d+)/);
  if (tvM) {
    var tvId = tvM[1], title = "";
    try {
      var epRes = fetchAny("/api/tv/" + tvId + "/season/" + p, { "User-Agent": HEADERS["User-Agent"], "Accept": "application/json" });
      base = epRes.base;
      var eps = JSON.parse(epRes.body).episodes || [];
      if (!eps.length) return [];
      if (p === 1) { try { title = showTitleOf(getPage(base + "/tv/" + tvId, HEADERS)); } catch (e2) {} }
      var out = [];
      for (var i = 0; i < eps.length; i++) {
        var ep = eps[i];
        if (!ep || !ep.episode_number) continue;
        out.push({
          id: "tv-" + tvId + "-s" + p + "-e" + ep.episode_number,
          url: base + "/tv/" + tvId + "/watch?season=" + p + "&episode=" + ep.episode_number,
          title: "S" + pad2(p) + "E" + pad2(ep.episode_number) + (ep.name ? " · " + ep.name : ""),
          thumb: ep.still_path ? "https://image.tmdb.org/t/p/w780" + ep.still_path : "",
          duration: (parseInt(ep.runtime, 10) || 0) * 60,
          creator: title || ("TV #" + tvId),
          creatorUrl: base + "/tv/" + tvId
        });
      }
      return out;
    } catch (e) { return []; }
  }
  var genM = path.match(/^\/(movies|tv-shows|tv)(?:\/([a-z0-9\-]+))?/i);
  if (genM) {
    var sec = genM[1].toLowerCase(), mt = (sec === "tv-shows" || sec === "tv") ? "tv" : "movie", gObj = genM[2] ? genreOf(genM[2], mt) : null;
    var gRes = fetchAny("/api/discover?type=" + mt + "&page=" + p + (gObj ? "&genre=" + gObj.id : ""), { "User-Agent": HEADERS["User-Agent"], "Accept": "application/json" });
    return mapItems(JSON.parse(gRes.body).items || [], gRes.base);
  }
  if (path.indexOf("/person/") === 0) {
    if (p > 1) return [];
    var pRes = fetchAny(path); base = pRes.base;
    var pc = [], ps = {}, re = /<a\b[^>]*href="(\/(?:movie|tv)\/(\d+))"[^>]*>([\s\S]{0,1200}?)<\/a>/gi, m;
    while ((m = re.exec(pRes.body)) !== null) {
      var isTv = m[1].indexOf("/tv/") === 0, mid = m[2], inner = m[3], cu = isTv ? base + "/tv/" + mid + "/watch?season=1&episode=1" : base + "/movie/" + mid;
      if (ps[cu]) continue;
      var tm = inner.match(/alt="([^"]+)"/) || inner.match(/<strong[^>]*>([^<]+)<\/strong>/) || inner.match(/<h[234][^>]*>([^<]+)<\/h[234]>/);
      var ct = tm ? decodeHtml(tm[1]).trim() : "";
      if (!ct) continue;
      ps[cu] = true;
      pc.push({ id: (isTv ? "tv-" : "movie-") + mid, url: cu, title: ct, thumb: findThumb(inner, base), duration: 0, creator: isTv ? ct : "Movies", creatorUrl: isTv ? base + "/tv/" + mid : base + "/movies" });
    }
    return pc;
  }
  var fRes = fetchAny(withPage(path, p));
  return anchorList(fRes.body, fRes.base, /\/(?:movie|tv)\/\d+/);
}

function parseTarget(url) {
  var s = String(url || ""), mm = s.match(/\/movie\/(\d+)/);
  if (mm) return { type: "movie", id: mm[1], season: 0, episode: 0 };
  var mt = s.match(/\/tv\/(\d+)/);
  if (!mt) return null;
  var sm = s.match(/[?&]season=(\d+)/) || s.match(/\/tv\/\d+\/(\d+)\/(\d+)/), em = s.match(/[?&]episode=(\d+)/);
  return { type: "tv", id: mt[1], season: (sm && parseInt(sm[1], 10)) || 1, episode: (em && parseInt(em[1], 10)) || (sm && sm[2] && parseInt(sm[2], 10)) || 1 };
}

function langCode(n) {
  var s = String(n || "").toLowerCase(), map = { original:"en", english:"en", hindi:"hi", spanish:"es", latin:"es", french:"fr", portuguese:"pt", russian:"ru", german:"de", italian:"it", japanese:"ja", ukrainian:"uk", tamil:"ta", telugu:"te" };
  for (var k in map) { if (s.indexOf(k) !== -1) return map[k]; }
  return "";
}

function inspectHls(url, headers) {
  var info = { ok: false, maxH: 0, demuxed: false, variants: [] };
  try {
    var text = getPage(url, headers || {});
    if (text.indexOf("#EXTM3U") === -1) return info;
    info.ok = true;
    info.demuxed = text.indexOf("#EXT-X-MEDIA:TYPE=AUDIO") !== -1;
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf("#EXT-X-STREAM-INF") !== 0) continue;
      var res = lines[i].match(/RESOLUTION=(\d+)x(\d+)/), next = "";
      for (var j = i + 1; j < lines.length; j++) { if (lines[j] && lines[j].charAt(0) !== "#") { next = lines[j].trim(); break; } }
      var h = 0;
      if (res) {
        var w = parseInt(res[1], 10), vh = parseInt(res[2], 10);
        h = (w >= 3800 || vh >= 2100) ? 2160 : (w >= 2500 || vh >= 1400) ? 1440 : (w >= 1900 || vh >= 1000) ? 1080 : (w >= 1260 || vh >= 700) ? 720 : (w >= 840 || vh >= 460) ? 480 : (vh || 360);
      }
      if (h > info.maxH) info.maxH = h;
      if (next) info.variants.push({ h: h, url: absUrl(url, next) });
    }
  } catch (e) {}
  return info;
}

function getStream(url) {
  var target = parseTarget(url);
  if (!target) return finalizeStreams(anyStreams(getPage(url, HEADERS)));
  var bm = String(url || "").match(/^https?:\/\/[^\/]+/), siteBase = bm ? bm[0] : MIRRORS[0], raw = [], seen = {};
  function push(h, label, sUrl, headers, audio, pri) {
    if (!sUrl || seen[sUrl]) return;
    seen[sUrl] = true;
    var o = { h: h || 0, p: pri || 0, label: label, url: sUrl };
    if (headers) o.headers = headers;
    if (audio) o.audio = audio;
    raw.push(o);
  }

  var ep = target.type === "movie" ? "/embed/movie/" + target.id : "/embed/tv/" + target.id + "/" + target.season + "/" + target.episode;
  var vrHtml = "";
  try { vrHtml = getPage("https://embed.vidrift.net" + ep, { "User-Agent": HEADERS["User-Agent"], "Referer": siteBase + "/" }); } catch (e) {}
  var meta = vrHtml ? jsonAfter(vrHtml, /var\s+embedMeta\s*=\s*/) : null;
  if (meta) {
    if ((meta.unreleased || meta.inCinemas || meta.airsSoon) && !meta.bigbangUrl && !meta.vexonUrl && !meta.evionUrl && (!meta.orionStreams || !meta.orionStreams.length)) {
      throw new Error("This title has not been released yet");
    }
    var vrH = { "Referer": "https://embed.vidrift.net/" };
    var srvs = [{ k:"bigbangUrl", n:"Earth", p:10, l:meta.lang||"en" }, { k:"selfhostUrl", n:"Direct", p:8, l:"en" }, { k:"vexonUrl", n:"Vexon", p:8, l:"en" }, { k:"evionUrl", n:"Evion", p:8, l:"en" }];
    for (var si = 0; si < srvs.length; si++) {
      var su = meta[srvs[si].k];
      if (!su) continue;
      if (su.indexOf(".m3u8") !== -1) {
        var inf = inspectHls(su, vrH);
        if (inf.ok) {
          if (inf.demuxed || inf.variants.length <= 1) {
            push(inf.maxH || 1080, (inf.maxH ? inf.maxH + "p" : "Auto") + " · " + srvs[si].n + " (HLS)", su, null, srvs[si].l, srvs[si].p);
          } else {
            for (var vi = 0; vi < inf.variants.length; vi++) push(inf.variants[vi].h, (inf.variants[vi].h ? inf.variants[vi].h + "p" : "HLS") + " · " + srvs[si].n, inf.variants[vi].url, null, srvs[si].l, srvs[si].p);
            if (srvs[si].k === "bigbangUrl") push(0, "Auto · Earth (HLS)", su, null, srvs[si].l, 1);
          }
        }
      } else {
        var dh = heightOf(su);
        push(dh || 720, (dh ? dh + "p · " : "") + srvs[si].n, su, vrH, "en", srvs[si].p);
      }
    }
    if (Array.isArray(meta.orionStreams)) {
      for (var oi = 0; oi < meta.orionStreams.length; oi++) {
        var os = meta.orionStreams[oi];
        if (!os || !os.url) continue;
        var maxH = 0;
        if (Array.isArray(os.rungs)) {
          for (var ri = 0; ri < os.rungs.length; ri++) {
            var r = os.rungs[ri], rh = r.height || 0;
            if (r.width >= 1900 && rh < 1080) rh = 1080; else if (r.width >= 1260 && rh < 720) rh = 720;
            if (rh > maxH) maxH = rh;
          }
        }
        push(maxH || 720, (maxH ? maxH + "p · " : "") + (os.name || "Orion"), absUrl("https://embed.vidrift.net", os.url), vrH, langCode(os.name), 6);
      }
    }
  }

  var vlPath = target.type === "movie" ? "/movie/" + target.id : "/tv/" + target.id + "/" + target.season + "/" + target.episode;
  try {
    var vlHtml = getPage("https://vidly.pro" + vlPath, { "User-Agent": HEADERS["User-Agent"], "Referer": siteBase + "/" });
    var vlM = vlHtml.replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/&amp;/g, "&").match(/https?:\/\/[^"'\s<>\\]+/g) || [];
    var vlC = [], vlS = {};
    for (var i = 0; i < vlM.length; i++) {
      var c = decodeHtml(vlM[i]);
      if (/\.(?:m3u8|mp4)(?:[?&#]|$)/i.test(c) && !vlS[c]) { vlS[c] = true; vlC.push(c); }
    }
    vlC.sort(function(a, b) { return (/Policy=|Signature=|token=|sig=/i.test(b) ? 1 : 0) - (/Policy=|Signature=|token=|sig=/i.test(a) ? 1 : 0); });
    for (var vc = 0; vc < vlC.length; vc++) {
      if (vlC[vc].indexOf(".m3u8") === -1) continue;
      var vInf = inspectHls(vlC[vc], { "Referer": "https://vidly.pro/" });
      if (vInf.ok) {
        var vh = vInf.maxH || heightOf(vlC[vc]);
        push(vh || 720, (vh ? vh + "p" : "Auto") + " · Vidly (HLS)", vlC[vc], { "Referer": "https://vidly.pro/" }, "en", 7);
        break;
      }
    }
  } catch (e) {}

  try {
    var dlQ = target.type === "movie" ? "/api/downloads?type=movie&id=" + target.id : "/api/downloads?type=tv&id=" + target.id + "&season=" + target.season + "&episode=" + target.episode;
    var dlRes = fetchAny(dlQ, { "User-Agent": HEADERS["User-Agent"], "Referer": siteBase + "/", "Accept": "application/json" });
    var rows = (JSON.parse(dlRes.body) || {}).rows || [], gotQ = {}, gotN = 0;
    for (var ri = 0; ri < rows.length && gotN < 2; ri++) {
      var row = rows[ri];
      if (!row || !row.token) continue;
      var qs = String(row.quality || "").trim(), rq = heightOf(qs), qH = rq || 720;
      if (gotQ[qH]) continue;
      try {
        var fj = JSON.parse(getPage(dlRes.base + "/api/downloads/file?t=" + encodeURIComponent(row.token), { "User-Agent": HEADERS["User-Agent"], "Referer": dlRes.base + "/", "Accept": "application/json" }));
        if (fj && fj.url) {
          gotQ[qH] = true; gotN++;
          push(qH, (rq ? rq + "p" : (qs || "File")) + " · " + (row.source ? row.source.toUpperCase() : "Direct") + " (File" + (row.size ? " · " + row.size : "") + ")", fj.url, null, "", 4);
        }
      } catch (e2) {}
    }
  } catch (e) {}

  if (!raw.length) throw new Error("No playable streams found for this title");
  raw.sort(function(a, b) { return (b.h - a.h) || (b.p - a.p); });
  return raw.map(function(s) {
    var o = { label: s.label, url: s.url };
    if (s.headers) o.headers = s.headers;
    if (s.audio) o.audio = s.audio;
    return o;
  });
}

function getInfo(url) {
  var target = parseTarget(url);
  if (!target) return pageInfo(url);
  var html = "", base = MIRRORS[0];
  try { var res = fetchAny("/" + target.type + "/" + target.id); html = res.body; base = res.base; }
  catch (e) { return { creator: "", creatorUrl: "", actors: [] }; }
  var out = { creator: "", creatorUrl: "", actors: [] };
  if (target.type === "tv") {
    out.creator = showTitleOf(html) || ("TV #" + target.id);
    out.creatorUrl = base + "/tv/" + target.id;
  } else {
    var gm = html.match(/href="(\/movies\/([a-z0-9\-]+))"[^>]*>([^<]+)<\/a>/i);
    out.creator = gm ? decodeHtml(gm[3]).trim() + " movies" : "Movies";
    out.creatorUrl = gm ? base + gm[1] : base + "/movies";
  }
  var cr = /<a\b[^>]*href="(\/person\/\d+)"[^>]*>([\s\S]{0,600}?)<\/a>/gi, cm, seenA = {};
  while ((cm = cr.exec(html)) !== null && out.actors.length < 15) {
    var nm = cm[2].match(/<strong[^>]*>([^<]+)<\/strong>/) || cm[2].match(/alt="([^"]+)"/);
    var actor = nm ? decodeHtml(nm[1]).trim() : textOf(cm[2]);
    if (!actor || seenA[actor.toLowerCase()]) continue;
    seenA[actor.toLowerCase()] = true;
    out.actors.push({ name: actor, url: base + cm[1] });
  }
  return out;
      }
