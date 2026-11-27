// @name        Pornhub
// @id          org.plexo.js.pornhub
// @version     1.4.0
// @author      Plexo add-ons
// @domains     pornhub.org, pornhub.com, pornhub.net, phncdn.com, phprcdn.com
// @category    18+
// @description 18+ only. Browse, search and stream Pornhub through pornhub.org, with automatic mirror fallback
//
// What it gives Plexo
//   home(page)          recommended / hottest videos
//   search(q, page)     search results
//   browse(url, page)   a model, channel, pornstar or user page (the "channel")
//   channel(url)        name, picture, banner, subscribers, video count and about text of that page
//   getStream(url)      every quality (best first, up to 4K when the video has it) plus Auto
//   getInfo(url)        uploader, pornstars with photos, tags and Moments (the site's timestamps)
//   categories()        every category with its picture and video count
//   shorts(page, q)     short clips for Plexo's Shorts tab (pick the add-on in Settings → Shorts → Shorts from)
//   related(url)        the "Related videos" under the video
//   comments(url)       the first page of comments (ready for when Plexo shows add-on comments)
//   search("debug")     test mode: shows what the add-on reads from the site instead of videos
//
// Fallbacks
//   1. Mirrors: pornhub.org first, then pornhub.com, pornhub.net and country mirrors.
//      The first mirror that answers with a real page is kept for the rest of the session.
//   2. Video links: the player's quality list, then the scrambled "media_N" links some regions get,
//      then any plain mp4/m3u8 link in the page.
//   3. Lists: the site's video tiles, then a plain scan of every video link in the page.
//
// Written from how the site is known to work; not tested against the live site.
// If it stops working after a site change, only this file needs fixing.

var MIRRORS = [
  "https://www.pornhub.org",
  "https://www.pornhub.com",
  "https://www.pornhub.net",
  "https://rt.pornhub.com",
  "https://de.pornhub.com",
  "https://es.pornhub.com",
  "https://fr.pornhub.org"
];
var COOKIE = "accessAgeDisclaimerPH=1; accessAgeDisclaimerUK=1; age_verified=1; accessPH=1; platform=pc; cookiesBannerSeen=1";
var __goodMirror = (typeof http.recall === "function") ? String(http.recall("mirror") || "") : "";
var __videoPages = {};

// ---------- Fetching with mirror fallback ----------

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
  if (s.length < 800) return true;
  var head = s.slice(0, 12000);
  if (/cf-chl|challenge-platform|verify you are human|Just a moment/i.test(head)) return true;
  if (/not available in your (country|region)|blocked in your (country|region)|court order|Department of Telecommunications|verify your age with|age verification (is )?required|ageVerificationWall/i.test(head)) return true;
  return false;
}

function fetchAny(u, extra) {
  var path = pathOf(u);
  var order = [];
  if (__goodMirror) order.push(__goodMirror);
  var h = hostOf(u);
  if (h && MIRRORS.indexOf(h) !== -1 && order.indexOf(h) === -1) order.push(h);
  for (var i = 0; i < MIRRORS.length; i++) if (order.indexOf(MIRRORS[i]) === -1) order.push(MIRRORS[i]);
  var errors = [];
  for (var j = 0; j < order.length; j++) {
    var target = order[j] + path;
    try {
      var headers = { "Cookie": COOKIE, "Referer": order[j] + "/" };
      if (extra) for (var k in extra) headers[k] = extra[k];
      var html = getPage(target, headers);
      if (looksBlocked(html)) throw new Error("blocked");
      if (__goodMirror !== order[j] && typeof http.remember === "function") http.remember("mirror", order[j]);
      __goodMirror = order[j];
      return { base: order[j], url: target, html: html };
    } catch (e) {
      errors.push(order[j].replace("https://", "") + ": " + (e && e.message ? e.message : "error"));
      if (__goodMirror === order[j]) {
        __goodMirror = "";
        if (typeof http.remember === "function") http.remember("mirror", "");
      }
    }
  }
  throw new Error("Pornhub couldn't be reached on any mirror (" + errors.slice(0, 3).join("; ") + ")");
}

// ---------- Video tiles ----------

function isVideoUrl(u) { return /view_video\.php\?viewkey=[\w-]+/i.test(str(u)); }

function viewkeyOf(u) {
  var m = str(u).match(/viewkey=([\w-]+)/i);
  return m ? m[1] : "";
}

function canonical(base, href) {
  var k = viewkeyOf(href);
  return k ? base + "/view_video.php?viewkey=" + k : absUrl(base, href);
}

// One tile: <li class="pcVideoListItem ..." data-video-vkey="..."> ... </li>
function tileFrom(chunk, base) {
  var a = chunk.match(/<a\b[^>]*href="([^"]*view_video\.php\?viewkey=[^"]+)"[^>]*>/i);
  if (!a) return null;
  var url = canonical(base, decodeHtml(a[1]));
  var title = attr(a[0], "title") || attr(a[0], "data-title");
  var img = (chunk.match(/<img\b[^>]*>/i) || [""])[0];
  if (!title) title = attr(img, "alt") || attr(img, "title");
  if (!title) {
    var t = chunk.match(/class="[^"]*title[^"]*"[^>]*>\s*<a[^>]*>([^<]+)</i);
    title = t ? decodeHtml(t[1]) : "";
  }
  title = str(title).trim();
  if (!title) return null;
  var thumb = phThumb(chunk, img);
  var dm = chunk.match(/<var class="duration">\s*([\d:]+)\s*</i) || chunk.match(/class="duration"[^>]*>\s*([\d:]+)\s*</i);
  var preview = attr(img, "data-mediabook") || attr(img, "data-previewvideo") || previewIn(chunk, base);
  var up = chunk.match(/<div class="usernameWrap[^"]*"[^>]*>[\s\S]{0,400}?<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  var creator = "", creatorUrl = "";
  if (up) { creator = textOf(up[2]); creatorUrl = absUrl(base, decodeHtml(up[1])); }
  else {
    var c = creatorIn(chunk, base);
    creator = c.name; creatorUrl = c.url;
  }
  var views = chunk.match(/class="views"[^>]*>\s*<var>([^<]+)<\/var>/i);
  return {
    id: viewkeyOf(url) || url,
    url: url,
    title: decodeHtml(title),
    thumb: thumb ? absUrl(base, thumb) : "",
    duration: dm ? toSeconds(dm[1]) : 0,
    creator: creator,
    creatorUrl: creatorUrl,
    preview: /\.(mp4|webm)/i.test(preview) ? absUrl(base, decodeHtml(preview)) : "",
    views: views ? textOf(views[1]) : ""
  };
}

// The tile's picture. Pornhub keeps the real link in different attributes on desktop and phone pages,
// sometimes on a <source>/<picture> or a background style, while "src" is often a blank placeholder.
function phThumb(chunk, img) {
  var names = ["data-mediumthumb", "data-thumb_url", "data-image", "data-src", "data-original", "data-poster", "data-path", "src"];
  var imgs = [img].concat(chunk.match(/<img\b[^>]*>/gi) || []);
  for (var n = 0; n < names.length; n++) {
    for (var i = 0; i < imgs.length; i++) {
      var v = decodeHtml(attr(imgs[i], names[n]));
      if (/^(https?:)?\/\//.test(v) && !/blank|placeholder|spacer|\.gif(\?|$)|data:image/i.test(v)) return absUrl("https://ei.phncdn.com", v);
    }
  }
  var set = chunk.match(/srcset="([^"\s,]+)/i);
  if (set && /^(https?:)?\/\//.test(set[1])) return absUrl("https://ei.phncdn.com", decodeHtml(set[1]));
  var any = chunk.replace(/\\\//g, "/").match(/https?:\/\/[a-z0-9.-]*phncdn\.com\/[^"'\s)<>]+?\.(?:jpe?g|webp|png)[^"'\s)<>]*/i);
  return any ? decodeHtml(any[0]) : "";
}

// Video tiles of a page. scope = the part of the page to read (e.g. only "Related videos").
function tilesFrom(html, base, skipUrl) {
  var out = [];
  var seen = {};
  if (skipUrl) seen[viewkeyOf(skipUrl)] = true;
  var parts = html.split(/<li\b[^>]*class="[^"]*(?:pcVideoListItem|videoBox|videoblock)[^"]*"/i);
  for (var i = 1; i < parts.length; i++) {
    var t = tileFrom(parts[i].slice(0, 6000), base);
    if (!t) continue;
    var k = viewkeyOf(t.url);
    if (seen[k]) continue;
    seen[k] = true;
    out.push(t);
  }
  if (out.length < 4) {
    // Fallback: every video link in the page.
    var plain = anchorList(html, base, /view_video\.php\?viewkey=/i);
    for (var j = 0; j < plain.length; j++) {
      var url = canonical(base, plain[j].url);
      var key = viewkeyOf(url);
      if (!key || seen[key]) continue;
      seen[key] = true;
      plain[j].url = url;
      plain[j].id = key;
      out.push(plain[j]);
    }
    attachExtras(out, html, base);
  }
  return out;
}

// Only the main list of a page, not the "recommended" strips around it.
function mainSection(html) {
  var ids = ["videoCategory", "videoSearchResult", "mostRecentVideosSection", "moreData", "modelMostRecentVideosSection", "showAllChanelVideos", "pornstarsVideoSection", "videosTab", "hottestVideosSection", "singleFeedSection"];
  for (var i = 0; i < ids.length; i++) {
    var at = html.indexOf('id="' + ids[i] + '"');
    if (at !== -1) return html.slice(at);
  }
  return html;
}

// ---------- Lists ----------

function home(page) {
  var p = page && page > 1 ? page : 1;
  var res = fetchAny(p === 1 ? "/video" : "/video?page=" + p);
  var list = tilesFrom(mainSection(res.html), res.base);
  if (!list.length) {
    res = fetchAny(p === 1 ? "/" : "/?page=" + p);
    list = tilesFrom(res.html, res.base);
  }
  return list;
}

function search(query, page) {
  var q = str(query).trim();
  if (!q) return [];
  var p = page && page > 1 ? page : 1;
  if (/^debug\b/i.test(q)) return p > 1 ? [] : debugReport(q.replace(/^debug\s*:?\s*/i, ""));
  var res = fetchAny("/video/search?search=" + encodeURIComponent(q).replace(/%20/g, "+") + (p > 1 ? "&page=" + p : ""));
  return tilesFrom(mainSection(res.html), res.base);
}

// Model / pornstar / channel / user pages: their video list lives under /videos.
function videosPath(url) {
  var path = pathOf(url).replace(/[?#].*$/, "").replace(/\/$/, "");
  var m = path.match(/^\/(model|pornstar|channels|users|user)\/([^\/]+)/i);
  // Other pages (categories like /video?c=29, tag searches) keep their query, minus any page number.
  if (!m) return pathOf(url).replace(/#.*$/, "").replace(/([?&])page=\d+&?/, "$1").replace(/[?&]$/, "");
  var kind = m[1].toLowerCase();
  if (kind === "users" || kind === "user") return "/users/" + m[2] + "/videos/public";
  return "/" + kind + "/" + m[2] + "/videos";
}

function browse(url, page) {
  var p = page && page > 1 ? page : 1;
  var path = videosPath(url);
  var res;
  // Category links already carry a query (/video?c=29), so the page number joins with "&".
  var joiner = path.indexOf("?") !== -1 ? "&" : "?";
  try { res = fetchAny(path + (p > 1 ? joiner + "page=" + p : "")); }
  catch (e) { if (p > 1) return []; res = fetchAny(url); }
  var list = tilesFrom(mainSection(res.html), res.base);
  var ch = channelFrom(res.html, res.base, url);
  for (var i = 0; i < list.length; i++) {
    if (!list[i].creator && ch.name) { list[i].creator = ch.name; list[i].creatorUrl = ch.url; }
    if (ch.avatar && list[i].creator === ch.name) list[i].creatorAvatar = ch.avatar;
  }
  return list;
}

// ---------- Channel header ----------

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

// "12.3K Subscribers", "Subscribers 12,345", <span class="big">12K</span><div class="title">Subscribers</div>
function countNear(html, word) {
  var re1 = new RegExp('>\\s*([\\d.,]+\\s*[KkMm]?)\\s*<[^>]*>\\s*(?:<[^>]*>\\s*)*' + word, "i");
  var re2 = new RegExp(word + '\\s*:?\\s*(?:<[^>]*>\\s*)*([\\d.,]+\\s*[KkMm]?)\\s*<', "i");
  var re3 = new RegExp('([\\d.,]+\\s*[KkMm]?)\\s+' + word, "i");
  var m = html.match(re1) || html.match(re2) || textOf(html).match(re3);
  return m ? num(m[1]) : 0;
}

function channelFrom(html, base, url) {
  var out = { name: "", url: absUrl(base, pathOf(url).replace(/\/videos.*$/, "")), avatar: "", banner: "", subscribers: 0, videos: 0, description: "" };
  var h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  var name = h1 ? textOf(h1[1]) : "";
  if (!name) name = textOf(metaOf(html, "og:title")).replace(/\s*[|\-–]\s*Pornhub.*$/i, "").replace(/['’]s\s+(?:Porn\s+)?Videos.*$/i, "").replace(/\s+(?:Porn\s+)?Videos.*$/i, "");
  if (!name) {
    var seg = pathOf(url).split("/");
    name = decodeURIComponent(seg[2] || "").replace(/[-_]+/g, " ");
  }
  out.name = name.replace(/\s+Verified.*$/i, "").trim();

  var av = html.match(/<img\b[^>]*id="getAvatar"[^>]*>/i) || html.match(/<img\b[^>]*class="[^"]*(?:avatar|profilePic|thumbImage)[^"]*"[^>]*>/i);
  if (av) out.avatar = absUrl(base, attr(av[0], "src") || attr(av[0], "data-src"));
  if (!out.avatar) {
    var og = metaOf(html, "og:image");
    if (og && !/\/videos\/|\/thumbs\//i.test(og)) out.avatar = absUrl(base, og);
  }
  var cover = html.match(/<img\b[^>]*id="coverPicture\w*"[^>]*>/i) || html.match(/<img\b[^>]*class="[^"]*cover[^"]*"[^>]*>/i);
  if (cover) out.banner = absUrl(base, attr(cover[0], "src") || attr(cover[0], "data-src"));
  if (!out.banner) {
    var bg = html.match(/id="coverPicture\w*"[^>]*style="[^"]*url\((?:&quot;|'|")?([^)"'&]+)/i);
    if (bg) out.banner = absUrl(base, bg[1]);
  }
  out.subscribers = countNear(html, "Subscribers");
  out.videos = countNear(html, "Videos");
  var about = html.match(/<(?:div|section)\b[^>]*class="[^"]*(?:aboutMeSection|bio|about)[^"]*"[^>]*>([\s\S]{0,4000}?)<\/(?:div|section)>/i);
  var aboutText = about ? textOf(about[1]).replace(/^About\s+\S+\s*/i, "") : "";
  out.description = (aboutText || textOf(metaOf(html, "og:description") || metaOf(html, "description"))).slice(0, 2000);
  if (out.avatar && !/^https?:/.test(out.avatar)) out.avatar = "";
  if (out.banner && !/^https?:/.test(out.banner)) out.banner = "";
  return out;
}

function channel(url) {
  var res = fetchAny(pathOf(url).replace(/\/videos.*$/, ""));
  return channelFrom(res.html, res.base, url);
}

// ---------- Streams ----------

// Some regions get the links split into string pieces:  var ra="https://"; ... var media_0 = ra + rb + ...;
function scrambledMedia(html) {
  var out = [];
  var flat = html.replace(/\/\*[\s\S]*?\*\//g, "");
  var vars = {};
  var re = /var\s+([A-Za-z_$][\w$]*)\s*=\s*((?:"[^"]*"|'[^']*')(?:\s*\+\s*(?:"[^"]*"|'[^']*'))*)\s*;/g;
  var m;
  while ((m = re.exec(flat)) !== null) {
    var parts = m[2].match(/"[^"]*"|'[^']*'/g) || [];
    vars[m[1]] = parts.map(function (p) { return p.slice(1, -1); }).join("");
  }
  var mre = /var\s+(media_\d+|quality_\d+p)\s*=\s*([^;]+);/g;
  while ((m = mre.exec(flat)) !== null) {
    var pieces = m[2].split("+");
    var s = "";
    var ok = true;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i].trim();
      if (!p) continue;
      if (/^["']/.test(p)) s += p.slice(1, -1);
      else if (vars.hasOwnProperty(p)) s += vars[p];
      else { ok = false; break; }
    }
    if (ok && /^https?:\/\//.test(s)) out.push(s);
  }
  return out;
}

function flashvarsOf(html) {
  return jsonAfter(html, /var\s+flashvars_\d+\s*=\s*/) || jsonAfter(html, /flashvars\s*=\s*/) || null;
}

function getStream(url) {
  var res = fetchAny(url);
  __videoPages[url] = res;
  __pages[url] = res.html;
  var headers = { "Referer": res.base + "/", "Origin": res.base, "Cookie": COOKIE };
  var cands = [];

  // 1. The player's quality list (mp4 list comes from a second small request).
  var fv = flashvarsOf(res.html);
  var defs = fv && fv.mediaDefinitions;
  if (Array.isArray(defs)) {
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i] || {};
      if (!d.videoUrl) continue;
      var link = absUrl(res.base, str(d.videoUrl));
      var fmt = str(d.format).toLowerCase();
      if (d.remote || /get_media/.test(link)) {
        // The mp4 list costs one more request before playback can start; only fetch it when the
        // page gave no HLS qualities.
        var hasHls = false;
        for (var hh = 0; hh < defs.length; hh++) if (defs[hh] && str(defs[hh].format).toLowerCase() === "hls" && defs[hh].videoUrl) hasHls = true;
        if (hasHls) continue;
        try {
          var list = JSON.parse(getPage(link, headers));
          for (var j = 0; j < list.length; j++) {
            var q = parseInt(Array.isArray(list[j].quality) ? list[j].quality[0] : list[j].quality, 10) || heightOf(list[j].videoUrl);
            if (list[j].videoUrl) cands.push({ h: q, url: absUrl(res.base, list[j].videoUrl), hls: str(list[j].format) === "hls" });
          }
        } catch (e) {}
      } else {
        var qq = parseInt(Array.isArray(d.quality) ? d.quality[0] : d.quality, 10) || heightOf(link);
        cands.push({ h: qq, url: link, hls: fmt === "hls" || link.indexOf(".m3u8") !== -1 });
      }
    }
  }
  // 2. Scrambled links.
  if (!cands.length) {
    var sm = scrambledMedia(res.html);
    for (var s = 0; s < sm.length; s++) cands.push({ h: heightOf(sm[s]), url: sm[s], hls: sm[s].indexOf(".m3u8") !== -1 });
  }
  // 3. Any plain link in the page.
  if (!cands.length) {
    var any = findMediaUrls(res.html);
    for (var a = 0; a < any.length; a++) if (!/preview|thumb|mediabook/i.test(any[a])) cands.push({ h: heightOf(any[a]), url: any[a], hls: any[a].indexOf(".m3u8") !== -1 });
  }
  if (!cands.length) throw new Error("No video links found (removed, private, premium-only or age-check page)");

  // HLS playlists that hold several qualities: open them so every quality (up to 4K) is listed.
  var expanded = [];
  for (var c = 0; c < cands.length; c++) {
    expanded.push(cands[c]);
    if (cands[c].hls && !cands[c].h) {
      var vars = [];
      try { vars = hlsVariants(cands[c].url, headers); } catch (e2) {}
      for (var v = 0; v < vars.length; v++) if (vars[v].h) expanded.push({ h: vars[v].h, url: vars[v].url, hls: true });
    }
  }

  // One entry per height, a direct mp4 beats HLS of the same height; best first.
  expanded.sort(function (x, y) { return y.h - x.h || (x.hls ? 1 : 0) - (y.hls ? 1 : 0); });
  var out = [];
  var seenH = {};
  for (var e = 0; e < expanded.length; e++) {
    var it = expanded[e];
    if (!it.h || seenH[it.h]) continue;
    seenH[it.h] = true;
    out.push({ label: it.h + "p", url: it.url, headers: headers });
  }
  // Auto: an HLS stream around 720p starts fastest; the menu still has every quality.
  var hlsList = expanded.filter(function (x) { return x.hls; });
  var autoPick = null;
  for (var z = 0; z < hlsList.length; z++) if (!hlsList[z].h) { autoPick = hlsList[z]; break; }
  if (!autoPick) for (var y = 0; y < hlsList.length; y++) if (hlsList[y].h && hlsList[y].h <= 720) { autoPick = hlsList[y]; break; }
  if (!autoPick && hlsList.length) autoPick = hlsList[hlsList.length - 1];
  if (autoPick) out.push({ label: "Auto", url: autoPick.url, headers: headers });
  if (!out.length) out = cands.map(function (x) { return { label: x.hls ? "Auto" : "MP4", url: x.url, headers: headers }; });
  return out;
}

function getInfo(url) {
  var res = __videoPages[url] || fetchAny(url);
  __pages[url] = res.html;
  var info = { creator: "", creatorUrl: "", actors: [] };
  var up = res.html.match(/class="[^"]*(?:video-detailed-info|userInfo|usernameWrap)[^"]*"[\s\S]{0,1500}?<a\b[^>]*href="(\/(?:model|channels|users|pornstar)\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
  if (up) { info.creator = textOf(up[2]); info.creatorUrl = absUrl(res.base, decodeHtml(up[1])); }
  info.actors = castOf(res.html, res.base);
  info.tags = tagsOf(res.html);
  info.moments = momentsOf(res.html);
  if (!info.creator) {
    var p = pageInfo(url);
    info.creator = p.creator; info.creatorUrl = p.creatorUrl;
  }
  return info;
}

function related(url) {
  var res = __videoPages[url] || fetchAny(url);
  var at = res.html.search(/id="(?:relatedVideosCenter|relatedVideosListing|recommendedVideosSection|relatedVideos)"/i);
  var part = at !== -1 ? res.html.slice(at) : res.html;
  return tilesFrom(part, res.base, url).slice(0, 40);
}

// First page of comments, newest site order: [{author, avatar, text, likes, time}]
function comments(url) {
  var res = __videoPages[url] || fetchAny(url);
  var out = [];
  var blocks = res.html.split(/<div\b[^>]*class="[^"]*\bcommentBlock\b[^"]*"/i);
  for (var i = 1; i < blocks.length && out.length < 50; i++) {
    var b = blocks[i].slice(0, 5000);
    var msg = b.match(/class="[^"]*commentMessage[^"]*"[^>]*>\s*(?:<span[^>]*>)?([\s\S]*?)<\/(?:span|div)>/i);
    if (!msg) continue;
    var text = textOf(msg[1]);
    if (!text) continue;
    var au = b.match(/class="[^"]*usernameLink[^"]*"[^>]*>([\s\S]*?)<\/a>/i) || b.match(/class="[^"]*usernameWrap[^"]*"[\s\S]{0,300}?<a[^>]*>([\s\S]*?)<\/a>/i);
    var img = (b.match(/<img\b[^>]*>/i) || [""])[0];
    var likes = b.match(/class="[^"]*voteTotal[^"]*"[^>]*>\s*([-\d]+)/i);
    var date = b.match(/class="[^"]*date[^"]*"[^>]*>\s*([^<]+)</i);
    out.push({
      author: au ? textOf(au[1]) : "User",
      avatar: absUrl(res.base, attr(img, "data-src") || attr(img, "src")),
      text: text,
      likes: likes ? parseInt(likes[1], 10) || 0 : 0,
      time: date ? textOf(date[1]) : ""
    });
  }
  return out;
}

// ---------- Test mode ----------
// Search "debug" (tests the first home video and its channel) or "debug: <video or channel link>".

function debugReport(target) {
  var lines = [];
  function line(t) { lines.push(str(t).replace(/\s+/g, " ").slice(0, 150)); }
  var videoUrl = "", channelUrl = "";
  if (!target) {
    var h = [];
    try { h = home(1); } catch (e) { line("home failed: " + e.message); }
    line("home: " + h.length + " videos, mirror " + (__goodMirror || "none"));
    if (h.length) {
      line("first card: " + h[0].title + " | thumb " + (h[0].thumb ? h[0].thumb.slice(0, 80) : "NO") + " | " + h[0].duration + "s | by " + (h[0].creator || "?"));
      videoUrl = h[0].url;
      for (var i = 0; i < h.length; i++) if (h[i].creatorUrl) { channelUrl = h[i].creatorUrl; break; }
    }
  } else if (isVideoUrl(target)) videoUrl = target;
  else channelUrl = target;

  if (videoUrl) {
    var res = null;
    try { res = fetchAny(videoUrl); __videoPages[videoUrl] = res; } catch (e) { line("VIDEO could not load: " + e.message); }
    if (res) {
      line("VIDEO: " + res.url + " (" + res.html.length + " chars)");
      var fv = flashvarsOf(res.html);
      line("player data: " + (fv ? "found, " + (Array.isArray(fv.mediaDefinitions) ? fv.mediaDefinitions.length + " media entries" : "NO mediaDefinitions") : "NOT FOUND"));
      if (fv && Array.isArray(fv.mediaDefinitions)) {
        for (var d = 0; d < fv.mediaDefinitions.length && d < 8; d++) {
          var md = fv.mediaDefinitions[d] || {};
          line("media " + d + ": " + md.format + " q=" + JSON.stringify(md.quality) + " remote=" + !!md.remote + " " + str(md.videoUrl).slice(0, 60));
        }
      }
      line("scrambled links: " + scrambledMedia(res.html).length + ", plain links: " + findMediaUrls(res.html).length);
      var st = [];
      try { st = getStream(videoUrl); } catch (e) { line("getStream failed: " + e.message); }
      line("qualities: " + (st.map(function (x) { return x.label; }).join(", ") || "none"));
      try { var inf = getInfo(videoUrl); line("getInfo: by " + (inf.creator || "?") + " | stars: " + inf.actors.map(function (a) { return a.name; }).join(", ")); if (!channelUrl) channelUrl = inf.creatorUrl; } catch (e) { line("getInfo failed: " + e.message); }
      try { line("related: " + related(videoUrl).length + " videos"); } catch (e) { line("related failed: " + e.message); }
      try { var cm = comments(videoUrl); line("comments: " + cm.length + (cm.length ? " e.g. " + cm[0].author + ": " + cm[0].text.slice(0, 50) : "")); } catch (e) { line("comments failed: " + e.message); }
    }
  }
  if (channelUrl) {
    try {
      var ch = channel(channelUrl);
      line("CHANNEL: " + channelUrl);
      line("channel(): name=" + ch.name + " subs=" + ch.subscribers + " videos=" + ch.videos);
      line("channel(): avatar=" + (ch.avatar || "NONE"));
      line("channel(): banner=" + (ch.banner || "NONE"));
      line("channel(): about=" + (ch.description || "NONE").slice(0, 80));
      line("browse: " + browse(channelUrl, 1).length + " videos");
    } catch (e) { line("CHANNEL failed: " + e.message); }
  }
  var out = [];
  for (var n = 0; n < lines.length; n++) out.push({ id: "debug" + n, url: "https://www.pornhub.org/#debug-" + n, title: (n + 1) + ". " + lines[n], thumb: "", duration: 0, creator: "Test mode" });
  return out;
}

// ---------- Shorts tab ----------
// Short clips for Plexo's Shorts tab: Pornhub's "Shorties" when available,
// otherwise videos under 10 minutes.

function shortOnly(list) {
  var s = list.filter(function (v) { return v.duration > 0 && v.duration <= 600; });
  return s.length ? s : list;
}

function shorts(page, query) {
  var p = page && page > 1 ? page : 1;
  if (query) {
    try {
      var r = fetchAny("/video/search?search=" + encodeURIComponent(query).replace(/%20/g, "+") + "&max_duration=10" + (p > 1 ? "&page=" + p : ""));
      var rl = tilesFrom(mainSection(r.html), r.base);
      if (rl.length) return shortOnly(rl);
    } catch (e0) {}
    return shortOnly(search(query, p));
  }
  if (p === 1) {
    try {
      var s = fetchAny("/shorties");
      var sl = tilesFrom(s.html, s.base);
      if (sl.length >= 4) return sl;
    } catch (e) {}
  }
  try {
    var res = fetchAny("/video?max_duration=10" + (p > 1 ? "&page=" + p : ""));
    var list = tilesFrom(mainSection(res.html), res.base);
    if (list.length) return shortOnly(list);
  } catch (e2) {}
  return shortOnly(home(p));
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


// ---------- Cast, tags, Moments, categories (add-on 1.4.0) ----------

// The picture inside (or right next to) a link: avatars sit in an <img> inside the pornstar link.
function imgNear(html, at, len) {
  var part = html.slice(at, at + (len || 900));
  var img = part.match(/<img\b[^>]*>/i);
  if (!img) return "";
  var names = ["data-src", "data-thumb_url", "data-image", "data-original", "src"];
  for (var n = 0; n < names.length; n++) {
    var v = decodeHtml(attr(img[0], names[n]));
    if (/^(https?:)?\/\//.test(v) && !/blank|placeholder|spacer|\.gif(\?|$)|data:image/i.test(v)) return absUrl("https://ei.phncdn.com", v);
  }
  return "";
}

// Pornstars and models in the video, with their photo: [{name, url, avatar}].
function castOf(html, base) {
  var out = [];
  var seen = {};
  // The cast box first, else anywhere in the page.
  var start = html.search(/class="[^"]*(?:pornstarsWrapper|pornstar_container|js-pornstarsWrapper)[^"]*"/i);
  var area = start !== -1 ? html.slice(start, start + 12000) : html;
  var re = /<a\b[^>]*href="([^"]*\/(?:pornstar|model)\/[^"#?\/]+)[^"]*"[^>]*>/gi;
  var m;
  while ((m = re.exec(area)) !== null && out.length < 16) {
    var tag = m[0];
    var href = m[1];
    var inner = area.slice(m.index, m.index + 900);
    var close = inner.indexOf("</a>");
    var body = close !== -1 ? inner.slice(0, close) : inner;
    var name = attr(tag, "data-mxptext") || attr(tag, "title") || attr(tag, "data-title");
    if (!name) {
      var alt = body.match(/<img\b[^>]*alt="([^"]+)"/i);
      name = alt ? decodeHtml(alt[1]) : textOf(body);
    }
    name = str(name).replace(/\s*\(?\d[\d.,kKmM]*\s*(?:videos?|subscribers?|views?)?\)?\s*$/i, "").replace(/\s+/g, " ").trim();
    if (!name || name.length > 50 || /^(?:pornstars?|models?|more|all|view|see|subscribe)\b/i.test(name)) continue;
    var key = name.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push({ name: name, url: absUrl(base, decodeHtml(href)), avatar: imgNear(area, m.index, close !== -1 ? close : 900) });
  }
  return out;
}

// The video's tags and categories, as plain words: ["Amateur", "POV", ...].
function tagsOf(html) {
  var out = [];
  var seen = {};
  var boxes = ["categoriesWrapper", "tagsWrapper", "video-info-row"];
  for (var b = 0; b < boxes.length; b++) {
    var at = html.indexOf(boxes[b]);
    if (at === -1) continue;
    var area = html.slice(at, at + 6000);
    var re = /<a\b[^>]*href="([^"]*(?:\/categories\/|\/video\?c=|\/video\/search\?search=|\/tags?\/)[^"]*)"[^>]*>([\s\S]{0,160}?)<\/a>/gi;
    var m;
    while ((m = re.exec(area)) !== null && out.length < 24) {
      var t = textOf(m[2]).replace(/^#/, "").trim();
      if (!t || t.length > 40 || /^(?:\+|more|suggest|edit)/i.test(t)) continue;
      var k = t.toLowerCase();
      if (seen[k]) continue;
      seen[k] = true;
      out.push(t);
    }
  }
  return out;
}

// The site's timestamps ("action tags"): "Missionary:123,Doggystyle:456" -> [{t: 123, label}].
function momentsOf(html) {
  var raw = "";
  var fv = flashvarsOf(html);
  if (fv && fv.actionTags) raw = str(fv.actionTags);
  if (!raw) {
    var m = html.match(/"actionTags"\s*:\s*"([^"]*)"/);
    if (m) raw = m[1];
  }
  var out = [];
  if (!raw) return out;
  var parts = raw.split(",");
  for (var i = 0; i < parts.length; i++) {
    var bits = parts[i].split(":");
    if (bits.length < 2) continue;
    var sec = parseInt(bits[bits.length - 1], 10);
    var label = decodeHtml(bits.slice(0, bits.length - 1).join(":")).trim();
    if (!label || isNaN(sec) || sec < 0) continue;
    out.push({ t: sec, label: label });
  }
  out.sort(function (a, b) { return a.t - b.t; });
  return out;
}

// Every category with its picture and video count: [{name, url, thumb, count}].
function categories() {
  var res = fetchAny("/categories");
  var html = res.html;
  var out = [];
  var seen = {};
  var chunks = html.split(/<li\b/i);
  for (var i = 1; i < chunks.length; i++) {
    var c = chunks[i].slice(0, 3000);
    var a = c.match(/<a\b[^>]*href="([^"]*(?:\/video\?c=\d+|\/categories\/[a-z0-9-]+)[^"]*)"[^>]*>/i);
    if (!a) continue;
    var href = decodeHtml(a[1]);
    var img = (c.match(/<img\b[^>]*>/i) || [""])[0];
    if (!img) continue;
    var name =
      attr(a[0], "data-mxptext") || attr(a[0], "title") || attr(img, "alt") ||
      textOf((c.match(/<(?:strong|span)[^>]*class="[^"]*(?:title|categoryTitleWrapper|category-title)[^"]*"[^>]*>([\s\S]*?)<\/(?:strong|span)>/i) || ["", ""])[1]);
    name = str(name).replace(/\s+/g, " ").trim();
    if (!name || name.length > 40) continue;
    var url = absUrl(res.base, href);
    var key = url.replace(/[?&]page=\d+/, "");
    if (seen[key]) continue;
    seen[key] = true;
    var thumb = phThumb(c, img);
    var cnt = c.match(/class="[^"]*videoCount[^"]*"[^>]*>([\s\S]{0,80}?)</i) || c.match(/([\d][\d,.]*[KkMm]?)\s*Videos/i);
    out.push({ name: name, url: url, thumb: thumb, count: cnt ? num(textOf(cnt[1])) : 0 });
  }
  // Most popular first when the page gave counts.
  if (out.length && out.some(function (x) { return x.count > 0; })) out.sort(function (a, b) { return b.count - a.count; });
  return out.slice(0, 200);
}
