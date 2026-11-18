// @name        7Movies
// @id          org.plexo.js.7movies
// @version     1.0.0
// @author      Plexo add-ons
// @domains     7movies.ac, 7movies.ws, 7shows.st, image.tmdb.org, embed.vidrift.net, vidrift.net, bigbang.cymru, bigbang.observer, vidly.pro, rousav.tech, johndoesdmc.workers.dev, hakunaymatata.com, googleusercontent.com, r2.cloudflarestorage.com
// @category    Movies
// @description Free movies and TV shows streaming from multiple servers up to 4K (2160p)

var MIRRORS = [
  "https://7movies.ac",
  "https://7movies.ws",
  "https://7shows.st"
];

var HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
};

var MOVIE_GENRES = [
  { id: 28, slug: "action", name: "Action" },
  { id: 12, slug: "adventure", name: "Adventure" },
  { id: 16, slug: "animation", name: "Animation" },
  { id: 35, slug: "comedy", name: "Comedy" },
  { id: 80, slug: "crime", name: "Crime" },
  { id: 99, slug: "documentary", name: "Documentary" },
  { id: 18, slug: "drama", name: "Drama" },
  { id: 10751, slug: "family", name: "Family" },
  { id: 14, slug: "fantasy", name: "Fantasy" },
  { id: 36, slug: "history", name: "History" },
  { id: 27, slug: "horror", name: "Horror" },
  { id: 10402, slug: "music", name: "Music" },
  { id: 9648, slug: "mystery", name: "Mystery" },
  { id: 10749, slug: "romance", name: "Romance" },
  { id: 878, slug: "science-fiction", name: "Science Fiction" },
  { id: 10770, slug: "tv-movie", name: "TV Movie" },
  { id: 53, slug: "thriller", name: "Thriller" },
  { id: 10752, slug: "war", name: "War" },
  { id: 37, slug: "western", name: "Western" }
];

var TV_GENRES = [
  { id: 10759, slug: "action-adventure", name: "Action & Adventure" },
  { id: 16, slug: "animation", name: "Animation" },
  { id: 35, slug: "comedy", name: "Comedy" },
  { id: 80, slug: "crime", name: "Crime" },
  { id: 99, slug: "documentary", name: "Documentary" },
  { id: 18, slug: "drama", name: "Drama" },
  { id: 10751, slug: "family", name: "Family" },
  { id: 10762, slug: "kids", name: "Kids" },
  { id: 9648, slug: "mystery", name: "Mystery" },
  { id: 10763, slug: "news", name: "News" },
  { id: 10764, slug: "reality", name: "Reality" },
  { id: 10765, slug: "sci-fi-fantasy", name: "Sci-Fi & Fantasy" },
  { id: 10766, slug: "soap", name: "Soap" },
  { id: 10767, slug: "talk", name: "Talk" },
  { id: 10768, slug: "war-politics", name: "War & Politics" },
  { id: 37, slug: "western", name: "Western" }
];

// Preserve relative directory paths in HLS playlists (including .m3u8.png manifests)
var _origAbsUrl = absUrl;
absUrl = function(base, u) {
  if (u && u.indexOf("http") !== 0 && u.indexOf("//") !== 0 && u.charAt(0) !== "/" && base && base.indexOf(".m3u8") !== -1) {
    return base.substring(0, base.lastIndexOf("/") + 1) + u;
  }
  return _origAbsUrl(base, u);
};

function looksBlocked(html) {
  if (!html || html.length < 15) return true;
  var t = html.trim();
  if (t.charAt(0) === "{" || t.charAt(0) === "[") return false;
  var low = html.toLowerCase();
  if (low.indexOf("attention required!") !== -1 && low.indexOf("cloudflare") !== -1) return true;
  if (low.indexOf("not available in your country") !== -1) return true;
  if (low.indexOf("<title>access denied") !== -1 || low.indexOf("<title>403") !== -1) return true;
  return false;
}

function fetchAny(path, customHeaders) {
  var h = customHeaders || HEADERS;
  var lastErr;
  var cleanPath = path.charAt(0) === "/" ? path : "/" + path;
  for (var i = 0; i < MIRRORS.length; i++) {
    try {
      var fullUrl = MIRRORS[i] + cleanPath;
      var body = getPage(fullUrl, h);
      if (looksBlocked(body)) throw new Error("blocked page");
      return { base: MIRRORS[i], body: body };
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error("Site unreachable from your region (" + (lastErr && lastErr.message) + ")");
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

function genreSlugByName(name, mediaType) {
  var low = String(name || "").toLowerCase().replace(/\s+(?:movies|tv|shows)$/i, "").trim();
  var list = mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
  for (var i = 0; i < list.length; i++) {
    if (list[i].name.toLowerCase() === low || list[i].slug === low) return list[i];
  }
  return null;
}

function genreBySlug(slug, mediaType) {
  var list = mediaType === "tv" ? TV_GENRES : MOVIE_GENRES;
  for (var i = 0; i < list.length; i++) {
    if (list[i].slug === slug) return list[i];
  }
  return null;
}

function mapApiItems(items, base) {
  var out = [];
  var seen = {};
  if (!Array.isArray(items)) return out;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!it || !it.id) continue;
    var mt = it.mediaType === "tv" ? "tv" : "movie";
    var title = String(it.title || it.name || "").trim();
    if (!title) continue;

    var url = mt === "tv"
      ? base + "/tv/" + it.id + "/watch?season=1&episode=1"
      : base + "/movie/" + it.id;

    if (seen[url]) continue;
    seen[url] = true;

    var thumb = it.poster || it.backdrop || "";
    if (thumb && thumb.charAt(0) === "/") {
      thumb = "https://image.tmdb.org/t/p/w500" + thumb;
    }

    var creator = "";
    var creatorUrl = "";
    if (mt === "tv") {
      creator = title;
      creatorUrl = base + "/tv/" + it.id;
    } else if (it.genre) {
      creator = it.genre;
      var g = genreSlugByName(it.genre, "movie");
      creatorUrl = g ? base + "/movies/" + g.slug : base + "/movies";
    } else {
      creator = "Movies";
      creatorUrl = base + "/movies";
    }

    out.push({
      id: mt + "-" + it.id,
      url: url,
      title: it.year ? title + " (" + it.year + ")" : title,
      thumb: thumb,
      duration: 0,
      creator: creator,
      creatorUrl: creatorUrl
    });
  }
  return out;
}

// 1. Home feed (Movies & TV Shows)
function home(page) {
  var p = parseInt(page, 10) || 1;
  var res = fetchAny("/api/discover?page=" + p, {
    "User-Agent": HEADERS["User-Agent"],
    "Accept": "application/json"
  });
  var data = null;
  try { data = JSON.parse(res.body); } catch (e) {}
  if (!data || !Array.isArray(data.items)) {
    throw new Error("Site layout changed: home");
  }
  return mapApiItems(data.items, res.base);
}

// 2. Search movies & TV shows (and genre/channel names for subscriptions)
function search(query, page) {
  var p = parseInt(page, 10) || 1;
  var qRaw = String(query || "").trim();
  if (!qRaw) return [];

  // Check if query matches a genre name (e.g. "Action movies") or generic "Movies"
  if (qRaw.toLowerCase() === "movies") {
    var mRes = fetchAny("/api/discover?type=movie&page=" + p, {
      "User-Agent": HEADERS["User-Agent"],
      "Accept": "application/json"
    });
    try {
      var mData = JSON.parse(mRes.body);
      return mapApiItems(mData.items || [], mRes.base);
    } catch (e) {}
  }

  var isTvGenre = /\btv\b/i.test(qRaw);
  var genreMatch = genreSlugByName(qRaw, isTvGenre ? "tv" : "movie");
  if (genreMatch && /\b(?:movies|tv|shows)\b/i.test(qRaw)) {
    var gRes = fetchAny("/api/discover?type=" + (isTvGenre ? "tv" : "movie") + "&genre=" + genreMatch.id + "&page=" + p, {
      "User-Agent": HEADERS["User-Agent"],
      "Accept": "application/json"
    });
    try {
      var gData = JSON.parse(gRes.body);
      var gCards = mapApiItems(gData.items || [], gRes.base);
      for (var gi = 0; gi < gCards.length; gi++) {
        if (gCards[gi].url.indexOf("/movie/") !== -1) {
          gCards[gi].creator = qRaw;
        }
      }
      return gCards;
    } catch (e) {}
  }

  // /api/search?v=5 returns all top matches on page 1 without pagination
  if (p > 1) return [];

  var res = fetchAny("/api/search?v=5&q=" + encodeURIComponent(qRaw), {
    "User-Agent": HEADERS["User-Agent"],
    "Accept": "application/json"
  });
  var data = null;
  try { data = JSON.parse(res.body); } catch (e) {}
  if (!data || !Array.isArray(data.results)) {
    throw new Error("Site layout changed: search");
  }
  return mapApiItems(data.results, res.base);
}

// 3. Browse TV episodes, actor filmography, or genre listings
function browse(url, page) {
  var p = parseInt(page, 10) || 1;
  var baseMatch = String(url || "").match(/^https?:\/\/[^\/]+/);
  var base = baseMatch ? baseMatch[0] : MIRRORS[0];
  var path = String(url || "").replace(/^https?:\/\/[^\/]+/, "");

  // Case A: TV show -> list episodes by season (page 1 = Season 1, page 2 = Season 2...)
  var tvMatch = path.match(/^\/tv\/(\d+)/);
  if (tvMatch) {
    var tvId = tvMatch[1];
    var showTitle = "";
    try {
      var epRes = fetchAny("/api/tv/" + tvId + "/season/" + p, {
        "User-Agent": HEADERS["User-Agent"],
        "Accept": "application/json"
      });
      var epData = JSON.parse(epRes.body);
      base = epRes.base;
      var episodes = epData && Array.isArray(epData.episodes) ? epData.episodes : [];
      if (episodes.length === 0) return [];

      // Try to read show title from TV detail page on page 1 for clean creator field
      if (p === 1) {
        try {
          var tvHtml = getPage(base + "/tv/" + tvId, HEADERS);
          var tm = tvHtml.match(/<h1[^>]*>([^<]+)<\/h1>/) || tvHtml.match(/<h1[^>]*>[\s\S]*?\balt="([^"]+)"/);
          if (tm) {
            showTitle = decodeHtml(tm[1]).trim();
          } else {
            var ttl = tvHtml.match(/<title>([^<]+)<\/title>/);
            if (ttl) {
              showTitle = decodeHtml(ttl[1]).replace(/\s*(?:\(\d{4}\))?\s*[—\-|]\s*Watch on 7Movies.*$/i, "").trim();
            }
          }
        } catch (e2) {}
      }

      var epCards = [];
      for (var i = 0; i < episodes.length; i++) {
        var ep = episodes[i];
        if (!ep || !ep.episode_number) continue;
        var epNum = ep.episode_number;
        var epTitle = "S" + pad2(p) + "E" + pad2(epNum) + (ep.name ? " · " + ep.name : "");
        var epThumb = ep.still_path ? "https://image.tmdb.org/t/p/w780" + ep.still_path : "";
        epCards.push({
          id: "tv-" + tvId + "-s" + p + "-e" + epNum,
          url: base + "/tv/" + tvId + "/watch?season=" + p + "&episode=" + epNum,
          title: epTitle,
          thumb: epThumb,
          duration: (parseInt(ep.runtime, 10) || 0) * 60,
          creator: showTitle || ("TV #" + tvId),
          creatorUrl: base + "/tv/" + tvId
        });
      }
      return epCards;
    } catch (e) {
      return [];
    }
  }

  // Case B: Genre catalog (/movies/<slug> or /tv-shows/<slug> or /movies or /tv)
  var genMatch = path.match(/^\/(movies|tv-shows|tv)(?:\/([a-z0-9\-]+))?/i);
  if (genMatch) {
    var sec = genMatch[1].toLowerCase();
    var mt = (sec === "tv-shows" || sec === "tv") ? "tv" : "movie";
    var slug = genMatch[2] || "";
    var apiPath = "/api/discover?type=" + mt + "&page=" + p;
    if (slug) {
      var gObj = genreBySlug(slug, mt);
      if (gObj) apiPath += "&genre=" + gObj.id;
    }
    var gRes = fetchAny(apiPath, {
      "User-Agent": HEADERS["User-Agent"],
      "Accept": "application/json"
    });
    var gData = null;
    try { gData = JSON.parse(gRes.body); } catch (e) {}
    return gData && Array.isArray(gData.items) ? mapApiItems(gData.items, gRes.base) : [];
  }

  // Case C: Person / Actor filmography (/person/<id>)
  if (path.indexOf("/person/") === 0) {
    if (p > 1) return [];
    var pRes = fetchAny(path);
    var pHtml = pRes.body;
    base = pRes.base;
    var pCards = [];
    var pSeen = {};
    var re = /<a\b[^>]*href="(\/(?:movie|tv)\/(\d+))"[^>]*>([\s\S]{0,1200}?)<\/a>/gi;
    var m;
    while ((m = re.exec(pHtml)) !== null) {
      var href = m[1];
      var mid = m[2];
      var inner = m[3];
      var isTv = href.indexOf("/tv/") === 0;
      var cardUrl = isTv ? base + "/tv/" + mid + "/watch?season=1&episode=1" : base + "/movie/" + mid;
      if (pSeen[cardUrl]) continue;
      var tMatch = inner.match(/alt="([^"]+)"/) || inner.match(/<strong[^>]*>([^<]+)<\/strong>/) || inner.match(/<h[234][^>]*>([^<]+)<\/h[234]>/);
      var cTitle = tMatch ? decodeHtml(tMatch[1]).trim() : "";
      if (!cTitle) continue;
      pSeen[cardUrl] = true;
      pCards.push({
        id: (isTv ? "tv-" : "movie-") + mid,
        url: cardUrl,
        title: cTitle,
        thumb: findThumb(inner, base),
        duration: 0,
        creator: isTv ? cTitle : "Movies",
        creatorUrl: isTv ? base + "/tv/" + mid : base + "/movies"
      });
    }
    return pCards;
  }

  // Fallback
  var fRes = fetchAny(withPage(path, p));
  return anchorList(fRes.body, fRes.base, /\/(?:movie|tv)\/\d+/);
}

// Helper: parse media target from 7movies url
function parseTarget(url) {
  var s = String(url || "");
  var mMovie = s.match(/\/movie\/(\d+)/);
  if (mMovie) return { type: "movie", id: mMovie[1], season: 0, episode: 0 };
  var mTv = s.match(/\/tv\/(\d+)/);
  if (mTv) {
    var sm = s.match(/[?&]season=(\d+)/) || s.match(/\/tv\/\d+\/(\d+)\/(\d+)/);
    var em = s.match(/[?&]episode=(\d+)/);
    var season = sm ? parseInt(sm[1], 10) : 1;
    var episode = em ? parseInt(em[1], 10) : (sm && sm[2] ? parseInt(sm[2], 10) : 1);
    return { type: "tv", id: mTv[1], season: season || 1, episode: episode || 1 };
  }
  return null;
}

function langCodeFromName(name) {
  var low = String(name || "").toLowerCase();
  if (low.indexOf("original") !== -1 || low.indexOf("english") !== -1) return "en";
  if (low.indexOf("hindi") !== -1) return "hi";
  if (low.indexOf("spanish") !== -1 || low.indexOf("latin") !== -1) return "es";
  if (low.indexOf("french") !== -1) return "fr";
  if (low.indexOf("portuguese") !== -1) return "pt";
  if (low.indexOf("russian") !== -1) return "ru";
  if (low.indexOf("german") !== -1) return "de";
  if (low.indexOf("italian") !== -1) return "it";
  if (low.indexOf("japanese") !== -1) return "ja";
  if (low.indexOf("ukrainian") !== -1) return "uk";
  if (low.indexOf("tamil") !== -1) return "ta";
  if (low.indexOf("telugu") !== -1) return "te";
  return "";
}

function inspectHlsMaster(masterUrl, headers) {
  var info = { ok: false, maxH: 0, demuxed: false, variants: [] };
  try {
    var text = getPage(masterUrl, headers || {});
    if (text.indexOf("#EXTM3U") === -1) return info;
    info.ok = true;
    info.demuxed = text.indexOf("#EXT-X-MEDIA:TYPE=AUDIO") !== -1;
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
      var h = 0;
      if (res) {
        var w = parseInt(res[1], 10);
        var vh = parseInt(res[2], 10);
        // Normalize widescreen aspect ratios (e.g. 3840x1600 -> 2160p, 1920x800 -> 1080p)
        if (w >= 3800 || vh >= 2100) h = 2160;
        else if (w >= 2500 || vh >= 1400) h = 1440;
        else if (w >= 1900 || vh >= 1000) h = 1080;
        else if (w >= 1260 || vh >= 700) h = 720;
        else if (w >= 840 || vh >= 460) h = 480;
        else h = vh || 360;
      }
      if (h > info.maxH) info.maxH = h;
      if (next) {
        info.variants.push({
          h: h,
          bw: bw ? parseInt(bw[1], 10) : 0,
          url: absUrl(masterUrl, next)
        });
      }
    }
  } catch (e) {}
  return info;
}

// 4. Multi-server stream & download resolver
function getStream(url) {
  var target = parseTarget(url);
  if (!target) {
    return finalizeStreams(anyStreams(getPage(url, HEADERS)));
  }

  var baseMatch = String(url || "").match(/^https?:\/\/[^\/]+/);
  var siteBase = baseMatch ? baseMatch[0] : MIRRORS[0];
  var rawStreams = [];
  var seenUrl = {};

  function pushStream(height, label, streamUrl, headers, audio, priority) {
    if (!streamUrl || seenUrl[streamUrl]) return;
    seenUrl[streamUrl] = true;
    var entry = {
      h: height || 0,
      p: priority || 0,
      label: label,
      url: streamUrl
    };
    if (headers) entry.headers = headers;
    if (audio) entry.audio = audio;
    rawStreams.push(entry);
  }

  // Server Group 1: Vidrift (Earth / BigBang 4K, Vexon / Evion Direct, Selfhost, Orion Multi-Audio)
  var embedPath = target.type === "movie"
    ? "/embed/movie/" + target.id
    : "/embed/tv/" + target.id + "/" + target.season + "/" + target.episode;
  var vidriftUrl = "https://embed.vidrift.net" + embedPath;
  var vidriftHeaders = {
    "User-Agent": HEADERS["User-Agent"],
    "Referer": siteBase + "/"
  };

  var vrHtml = "";
  try {
    vrHtml = getPage(vidriftUrl, vidriftHeaders);
  } catch (e) {}

  var embedMeta = vrHtml ? jsonAfter(vrHtml, /var\s+embedMeta\s*=\s*/) : null;
  if (embedMeta) {
    if (embedMeta.unreleased || embedMeta.inCinemas || embedMeta.airsSoon) {
      if (!embedMeta.bigbangUrl && !embedMeta.vexonUrl && !embedMeta.evionUrl && (!embedMeta.orionStreams || !embedMeta.orionStreams.length)) {
        throw new Error("This title has not been released yet");
      }
    }

    var vrPlayHeaders = { "Referer": "https://embed.vidrift.net/" };

    // A) BigBang / Earth server (up to 2160p 4K)
    if (embedMeta.bigbangUrl) {
      var bbInfo = inspectHlsMaster(embedMeta.bigbangUrl, vrPlayHeaders);
      if (bbInfo.ok) {
        if (bbInfo.demuxed || bbInfo.variants.length <= 1) {
          var bbLabel = (bbInfo.maxH ? bbInfo.maxH + "p" : "Auto") + " · Earth (HLS)";
          pushStream(bbInfo.maxH || 1080, bbLabel, embedMeta.bigbangUrl, null, embedMeta.lang || "en", 10);
        } else {
          for (var bi = 0; bi < bbInfo.variants.length; bi++) {
            var bv = bbInfo.variants[bi];
            pushStream(bv.h, (bv.h ? bv.h + "p" : "HLS") + " · Earth", bv.url, null, embedMeta.lang || "en", 10);
          }
          pushStream(0, "Auto · Earth (HLS)", embedMeta.bigbangUrl, null, embedMeta.lang || "en", 1);
        }
      }
    }

    // B) Vexon / Evion / Selfhost Direct servers
    var directCands = [
      { key: "selfhostUrl", name: "Direct" },
      { key: "vexonUrl", name: "Vexon" },
      { key: "evionUrl", name: "Evion" }
    ];
    for (var di = 0; di < directCands.length; di++) {
      var dUrl = embedMeta[directCands[di].key];
      if (!dUrl) continue;
      if (dUrl.indexOf(".m3u8") !== -1) {
        var dInfo = inspectHlsMaster(dUrl, vrPlayHeaders);
        if (dInfo.ok) {
          if (dInfo.demuxed || dInfo.variants.length <= 1) {
            pushStream(dInfo.maxH || 1080, (dInfo.maxH ? dInfo.maxH + "p" : "Auto") + " · " + directCands[di].name + " (HLS)", dUrl, null, "en", 8);
          } else {
            for (var dv = 0; dv < dInfo.variants.length; dv++) {
              pushStream(dInfo.variants[dv].h, (dInfo.variants[dv].h ? dInfo.variants[dv].h + "p" : "HLS") + " · " + directCands[di].name, dInfo.variants[dv].url, null, "en", 8);
            }
          }
        }
      } else {
        var dh = heightOf(dUrl);
        pushStream(dh || 720, (dh ? dh + "p · " : "") + directCands[di].name, dUrl, vrPlayHeaders, "en", 8);
      }
    }

    // C) Orion multi-audio streams (Original, Hindi, Spanish, French, etc.)
    if (Array.isArray(embedMeta.orionStreams)) {
      for (var oi = 0; oi < embedMeta.orionStreams.length; oi++) {
        var os = embedMeta.orionStreams[oi];
        if (!os || !os.url) continue;
        var oUrl = absUrl("https://embed.vidrift.net", os.url);
        var maxRungH = 0;
        if (Array.isArray(os.rungs)) {
          for (var ri = 0; ri < os.rungs.length; ri++) {
            var r = os.rungs[ri];
            var rh = r.height || 0;
            if (r.width >= 1900 && rh < 1080) rh = 1080;
            else if (r.width >= 1260 && rh < 720) rh = 720;
            if (rh > maxRungH) maxRungH = rh;
          }
        }
        var oLabel = (maxRungH ? maxRungH + "p · " : "") + (os.name || "Orion");
        var oLang = langCodeFr
