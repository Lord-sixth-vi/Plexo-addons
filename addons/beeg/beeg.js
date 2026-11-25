// @name        Beeg
// @id          org.plexo.js.beeg
// @version     1.1.0
// @author      Plexo add-ons
// @domains     beeg.com, externulls.com, beeg.porn
// @category    18+
// @description 18+ only. Browse, search and stream Beeg, with API and page fallbacks
//
// What it gives Plexo
//   home(page)          newest videos
//   search(q, page)     videos for a search (Beeg searches by tag, channel or model name)
//   browse(url, page)   a channel, model or tag page (the "channel")
//   channel(url)        name, picture, video count and about text of that page
//   getStream(url)      every quality (best first, up to 4K when the video has it) plus Auto
//   getInfo(url)        channel and models of the video that was just opened
//   related(url)        more videos from the same channel / tags
//   shorts(page, q)     short clips for Plexo's Shorts tab
//   comments(url)       Beeg has no comments, so always []
//   search("debug")     test mode: shows what the add-on reads from the site instead of videos
//
// How Beeg works: the site is an app that loads everything from its data server (store.externulls.com).
// The add-on talks to that server directly, so pages load fast and playback starts at once.
//
// Fallbacks
//   1. Data servers: store.externulls.com, then the same data through beeg.com.
//   2. Video links: the file's own quality list, then the clip's list, then any playlist link found.
//   3. Video servers: video.beeg.com, then video.externulls.com.
//   4. Search: the exact tag / channel / model, then a looser match, then the newest videos filtered by title.
//
// Written from how the site is known to work; not tested against the live site.

var SITE = "https://beeg.com";
var API = ["https://store.externulls.com", "https://beeg.com/api/v6"];
var VIDEO_HOSTS = ["https://video.beeg.com/", "https://video.externulls.com/"];
var THUMB_HOST = "https://thumbs.externulls.com/videos/";
var HOME_TAG = "27173";
var PAGE_SIZE = 48;
var __goodApi = (typeof http.recall === "function") ? String(http.recall("api") || "") : "";
var __files = {};

function str(v) { return v == null ? "" : String(v); }

// ---------- Data server with fallback ----------

function api(path) {
  var order = [];
  if (__goodApi) order.push(__goodApi);
  for (var i = 0; i < API.length; i++) if (order.indexOf(API[i]) === -1) order.push(API[i]);
  var errors = [];
  for (var j = 0; j < order.length; j++) {
    try {
      var txt = getPage(order[j] + path, { "Referer": SITE + "/", "Origin": SITE, "Accept": "application/json" });
      var data = JSON.parse(txt);
      if (__goodApi !== order[j] && typeof http.remember === "function") http.remember("api", order[j]);
      __goodApi = order[j];
      return data;
    } catch (e) {
      errors.push(order[j].replace("https://", "") + ": " + (e && e.message ? e.message.slice(0, 60) : "error"));
      if (__goodApi === order[j]) __goodApi = "";
    }
  }
  throw new Error("Beeg couldn't be reached (" + errors.join("; ") + ")");
}

// ---------- Reading a video record ----------

// Records come as {file:{id, fl_duration, data:[{cd_column, cd_value}], hls_resources}, fc_facts:[...], tags:[...]}.
function fileOf(rec) { return (rec && (rec.file || rec)) || {}; }

function dataValue(file, col) {
  var d = file.data || [];
  for (var i = 0; i < d.length; i++) if (d[i] && d[i].cd_column === col) return str(d[i].cd_value);
  return "";
}

function factOf(rec) {
  var f = rec && rec.fc_facts;
  return Array.isArray(f) && f.length ? f[0] : (rec && rec.fact) || {};
}

function idOf(rec) {
  var f = fileOf(rec);
  return str(f.id || rec.fc_file_id || rec.id || "");
}

function videoUrl(id) { return SITE + "/-0" + id; }

function idFromUrl(u) {
  var m = str(u).match(/beeg\.[a-z]+\/(?:video\/)?-?(\d{3,})(?:[?#\/]|$)/i) || str(u).match(/(\d{8,})/);
  return m ? (m[1].replace(/^0+/, "") || m[1]) : "";
}

function thumbOf(rec) {
  var id = idOf(rec);
  var fact = factOf(rec);
  var thumbs = fact.fc_thumbs || rec.fc_thumbs || fileOf(rec).fl_thumbs || [];
  var n = Array.isArray(thumbs) && thumbs.length ? thumbs[0] : 0;
  if (typeof n === "object" && n) n = n.id || n.n || 0;
  return id ? THUMB_HOST + id + "/" + n + ".webp" : "";
}

function ownerTag(rec) {
  var tags = rec.tags || [];
  for (var i = 0; i < tags.length; i++) if (tags[i] && (tags[i].is_owner || tags[i].tg_is_owner)) return tags[i];
  for (var j = 0; j < tags.length; j++) if (tags[j] && /channel|studio|brand|model|person/i.test(str(tags[j].tg_type || tags[j].type))) return tags[j];
  return null;
}

function tagUrl(t) { return SITE + "/" + str(t.tg_slug || t.slug); }

function cardOf(rec) {
  var f = fileOf(rec);
  var id = idOf(rec);
  if (!id) return null;
  var title = dataValue(f, "sf_name") || str(rec.title || f.fl_name || "");
  if (!title) title = "Beeg video " + id;
  var owner = ownerTag(rec);
  var fact = factOf(rec);
  var dur = Number(f.fl_duration || rec.fl_duration || 0);
  if (fact.fc_end && fact.fc_start != null) {
    var clip = Number(fact.fc_end) - Number(fact.fc_start);
    if (clip > 0 && (!dur || clip < dur)) dur = clip;
  }
  return {
    id: id,
    url: videoUrl(id),
    title: decodeHtml(title).trim(),
    thumb: thumbOf(rec),
    duration: dur > 0 ? Math.round(dur) : 0,
    creator: owner ? str(owner.tg_name || owner.name) : "",
    creatorUrl: owner ? tagUrl(owner) : "",
    creatorAvatar: owner && owner.tg_thumb ? absUrl("https://thumbs.externulls.com", str(owner.tg_thumb)) : ""
  };
}

function cardsOf(list) {
  var out = [];
  var seen = {};
  var arr = Array.isArray(list) ? list : (list && (list.items || list.facts || list.data)) || [];
  for (var i = 0; i < arr.length; i++) {
    var c = cardOf(arr[i]);
    if (!c || seen[c.id]) continue;
    seen[c.id] = true;
    out.push(c);
  }
  return out;
}

// ---------- Lists ----------

function offsetOf(page) { return ((page && page > 1 ? page : 1) - 1) * PAGE_SIZE; }

function tagList(slugOrId, page) {
  var key = /^\d+$/.test(str(slugOrId)) ? "id=" + slugOrId : "slug=" + encodeURIComponent(slugOrId);
  return cardsOf(api("/facts/tag?" + key + "&limit=" + PAGE_SIZE + "&offset=" + offsetOf(page)));
}

function home(page) {
  return tagList(HOME_TAG, page);
}

function slugify(q) {
  return str(q).trim().toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function search(query, page) {
  var q = str(query).trim();
  if (!q) return [];
  var p = page && page > 1 ? page : 1;
  if (/^debug\b/i.test(q)) return p > 1 ? [] : debugReport(q.replace(/^debug\s*:?\s*/i, ""));
  // 1. The exact tag / channel / model ("big tits" → big-tits).
  var slug = slugify(q);
  var tries = [slug, slug.replace(/-/g, ""), slug.replace(/s$/, ""), slug.split("-")[0]];
  for (var i = 0; i < tries.length; i++) {
    if (!tries[i] || (i > 0 && tries[i] === tries[i - 1])) continue;
    try {
      var list = tagList(tries[i], p);
      if (list.length) return list;
    } catch (e) {}
  }
  // 2. Beeg's own suggestions for the words.
  try {
    var sug = api("/tag/search?q=" + encodeURIComponent(q) + "&limit=5");
    var tags = Array.isArray(sug) ? sug : (sug && (sug.items || sug.tags)) || [];
    for (var t = 0; t < tags.length; t++) {
      var s = str(tags[t].tg_slug || tags[t].slug);
      if (!s) continue;
      var l2 = tagList(s, p);
      if (l2.length) return l2;
    }
  } catch (e2) {}
  // 3. Newest videos whose title has the words.
  var words = q.toLowerCase().split(/\s+/);
  var out = [];
  for (var pg = (p - 1) * 3 + 1; pg <= p * 3 && out.length < 20; pg++) {
    var h = [];
    try { h = home(pg); } catch (e3) { break; }
    for (var k = 0; k < h.length; k++) {
      var tl = h[k].title.toLowerCase();
      var all = true;
      for (var w = 0; w < words.length; w++) if (tl.indexOf(words[w]) === -1) { all = false; break; }
      if (all) out.push(h[k]);
    }
  }
  return out;
}

function slugFromUrl(url) {
  var path = str(url).replace(/^https?:\/\/[^\/]+/, "").replace(/[?#].*$/, "");
  var seg = path.split("/").filter(function (x) { return x; });
  if (!seg.length) return "";
  var last = seg[seg.length - 1];
  if (/^-?\d{6,}$/.test(last)) return "";
  return decodeURIComponent(last);
}

function browse(url, page) {
  var slug = slugFromUrl(url);
  if (!slug) return home(page);
  var list = tagList(slug, page);
  var ch = null;
  for (var i = 0; i < list.length; i++) {
    if (!list[i].creator) {
      ch = ch || channel(url);
      list[i].creator = ch.name;
      list[i].creatorUrl = ch.url;
      if (ch.avatar) list[i].creatorAvatar = ch.avatar;
    }
  }
  return list;
}

function channel(url) {
  var slug = slugFromUrl(url);
  var out = { name: slug.replace(/[-_]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); }), url: SITE + "/" + slug, avatar: "", banner: "", subscribers: 0, videos: 0, description: "" };
  var info = null;
  var paths = ["/tag/facts/tags?get_original=true&slug=" + encodeURIComponent(slug), "/tag/" + encodeURIComponent(slug)];
  for (var i = 0; i < paths.length && !info; i++) {
    try {
      var d = api(paths[i]);
      info = Array.isArray(d) ? d[0] : (d && (d.tag || d[slug] || d));
    } catch (e) {}
  }
  if (info && typeof info === "object") {
    out.name = str(info.tg_name || info.name || out.name);
    var th = str(info.tg_thumb || info.thumb || info.avatar || "");
    if (th) out.avatar = absUrl("https://thumbs.externulls.com", th);
    var cover = str(info.tg_cover || info.cover || "");
    if (cover) out.banner = absUrl("https://thumbs.externulls.com", cover);
    out.videos = Number(info.tg_facts_count || info.facts_count || info.count || 0) || 0;
    out.subscribers = Number(info.tg_subscribers || info.subscribers || 0) || 0;
    var bio = info.tg_bio || info.bio || info.description || info.tg_description || "";
    out.description = typeof bio === "string" ? textOf(bio).slice(0, 2000) : "";
  }
  // No picture from the data server: use the first video's picture.
  if (!out.avatar) {
    try {
      var first = tagList(slug, 1);
      if (first.length) out.avatar = first[0].thumb;
    } catch (e3) {}
  }
  return out;
}

// ---------- Streams ----------

function fileRecord(url) {
  var id = idFromUrl(url);
  if (!id) throw new Error("Not a Beeg video link");
  if (__files[id]) return __files[id];
  var rec = api("/facts/file/" + id);
  __files[id] = rec;
  return rec;
}

// Every object in the record whose keys look like qualities ("fl_cdn_720", "720", "720p", "hls_720"...).
function deepResources(rec) {
  var found = {};
  var stack = [rec];
  var n = 0;
  while (stack.length && n < 5000) {
    var o = stack.pop();
    n++;
    if (!o || typeof o !== "object") continue;
    var keys = Object.keys(o);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], v = o[k];
      if (typeof v === "string" && v && /(?:^|_)(\d{3,4})p?$/.test(k) && /[\/=]/.test(v)) found[k] = v;
      else if (v && typeof v === "object") stack.push(v);
    }
  }
  return found;
}

function resourcesOf(rec) {
  var f = fileOf(rec);
  var fact = factOf(rec);
  var res = f.hls_resources || fact.hls_resources || rec.hls_resources || null;
  if (!res) {
    var facts = rec.fc_facts || [];
    for (var i = 0; i < facts.length && !res; i++) res = facts[i] && facts[i].hls_resources;
  }
  if (!res || !Object.keys(res).length) res = deepResources(rec);
  return res || {};
}

function getStream(url) {
  var rec = fileRecord(url);
  var res = resourcesOf(rec);
  var headers = { "Referer": SITE + "/", "Origin": SITE };
  var list = [];
  var masters = [];
  var keys = Object.keys(res);
  for (var i = 0; i < keys.length; i++) {
    var path = str(res[keys[i]]);
    if (!path) continue;
    var h = parseInt((keys[i].match(/(\d{3,4})/) || [])[1] || "0", 10);
    var link = /^https?:/.test(path) ? path : VIDEO_HOSTS[0] + path.replace(/^\//, "");
    if (h) list.push({ h: h, url: link });
    else masters.push(link);
  }
  // Fallback: any playlist link inside the record.
  if (!list.length && !masters.length) {
    var raw = JSON.stringify(rec);
    var found = raw.match(/(?:https?:\\?\/\\?\/[^"]+)?[\w\/.,=;:-]*(?:\.m3u8|key=|\/multi=)[^"]*/g) || [];
    found = found.map(function (x) { return x.replace(/\\\//g, "/"); }).filter(function (x) { return x.length > 12; });
    for (var f = 0; f < found.length; f++) {
      var u = /^https?:/.test(found[f]) ? found[f] : VIDEO_HOSTS[0] + found[f].replace(/^\//, "");
      var hh = heightOf(u);
      if (hh) list.push({ h: hh, url: u }); else masters.push(u);
    }
  }
  // A playlist with several qualities inside: open it.
  for (var m = 0; m < masters.length; m++) {
    var vars = [];
    try { vars = hlsVariants(masters[m], headers); } catch (e) {}
    for (var v = 0; v < vars.length; v++) if (vars[v].h) list.push({ h: vars[v].h, url: vars[v].url });
  }
  if (!list.length && !masters.length) throw new Error("No video links found for this video");

  list.sort(function (a, b) { return b.h - a.h; });
  var out = [];
  var seen = {};
  for (var k = 0; k < list.length; k++) {
    if (seen[list[k].h]) continue;
    seen[list[k].h] = true;
    out.push({ label: list[k].h + "p", url: list[k].url, headers: headers });
  }
  // Second video server as a spare copy of the best quality.
  if (out.length && out[0].url.indexOf(VIDEO_HOSTS[0]) === 0) {
    out.push({ label: out[0].label + " (backup server)", url: VIDEO_HOSTS[1] + out[0].url.slice(VIDEO_HOSTS[0].length), headers: headers });
  }
  // Auto: about 720p starts fastest.
  var auto = masters[0] || null;
  if (!auto) for (var a = 0; a < list.length; a++) if (list[a].h <= 720) { auto = list[a].url; break; }
  if (!auto && list.length) auto = list[list.length - 1].url;
  if (auto) out.push({ label: "Auto", url: auto, headers: headers });
  return out;
}

function getInfo(url) {
  var rec = fileRecord(url);
  var info = { creator: "", creatorUrl: "", actors: [] };
  var tags = rec.tags || [];
  var owner = ownerTag(rec);
  if (owner) { info.creator = str(owner.tg_name); info.creatorUrl = tagUrl(owner); }
  for (var i = 0; i < tags.length; i++) {
    var t = tags[i] || {};
    if (t === owner) continue;
    if (/person|model|actor|pornstar/i.test(str(t.tg_type || t.type)) || t.tg_is_person || t.is_person) {
      info.actors.push({ name: str(t.tg_name), url: tagUrl(t) });
    }
  }
  return info;
}

function related(url) {
  var rec = fileRecord(url);
  var id = idOf(rec);
  var owner = ownerTag(rec);
  var tags = (rec.tags || []).slice();
  if (owner) tags.unshift(owner);
  var out = [];
  var seen = {};
  seen[id] = true;
  for (var i = 0; i < tags.length && out.length < 30 && i < 4; i++) {
    var slug = str(tags[i] && tags[i].tg_slug);
    if (!slug) continue;
    var l = [];
    try { l = tagList(slug, 1); } catch (e) {}
    for (var j = 0; j < l.length && out.length < 30; j++) {
      if (seen[l[j].id]) continue;
      seen[l[j].id] = true;
      out.push(l[j]);
    }
  }
  return out;
}

function comments(url) { return []; }

// ---------- Shorts tab ----------

function shorts(page, query) {
  var list = query ? search(query, page) : home(page);
  var s = list.filter(function (v) { return v.duration > 0 && v.duration <= 600; });
  return s.length ? s : list;
}

// ---------- Test mode ----------

function debugReport(target) {
  var lines = [];
  function line(t) { lines.push(str(t).replace(/\s+/g, " ").slice(0, 150)); }
  function keysOf(o) { return o && typeof o === "object" ? Object.keys(o).slice(0, 14).join(",") : typeof o; }
  var raw = null;
  try { raw = api("/facts/tag?id=" + HOME_TAG + "&limit=" + PAGE_SIZE + "&offset=0"); } catch (e) { line("home data failed: " + e.message); }
  line("data server: " + (__goodApi || "none"));
  if (raw) {
    var arr = Array.isArray(raw) ? raw : (raw.items || raw.facts || raw.data || []);
    line("home data: " + (Array.isArray(raw) ? "list of " + raw.length : "object {" + keysOf(raw) + "}"));
    if (arr[0]) {
      line("item keys: " + keysOf(arr[0]));
      line("file keys: " + keysOf(fileOf(arr[0])));
      line("fact keys: " + keysOf(factOf(arr[0])));
      var tg = (arr[0].tags || [])[0];
      line("tag keys: " + keysOf(tg));
      var c = cardOf(arr[0]);
      line("card: " + (c ? c.title + " | " + c.duration + "s | by " + (c.creator || "?") : "NONE"));
      line("thumb: " + (c ? c.thumb : ""));
    }
  }
  var h = [];
  try { h = home(1); } catch (e2) { line("home failed: " + e2.message); }
  line("home: " + h.length + " videos");
  var vurl = target && idFromUrl(target) ? target : (h[0] ? h[0].url : "");
  if (vurl) {
    try {
      var rec = fileRecord(vurl);
      line("VIDEO id " + idFromUrl(vurl) + " record: " + (Array.isArray(rec) ? "list of " + rec.length : "{" + keysOf(rec) + "}"));
      line("file: {" + keysOf(fileOf(rec)) + "}");
      var facts = rec.fc_facts || [];
      line("facts: " + (Array.isArray(facts) ? facts.length + " x {" + keysOf(facts[0]) + "}" : typeof facts));
      var paths = [];
      (function w(o, pth, d) {
        if (!o || typeof o !== "object" || d > 6 || paths.length > 12) return;
        Object.keys(o).forEach(function (k) {
          var v = o[k];
          if (/cdn|hls|res|stream|video|url|src|qual|m3u8/i.test(k)) paths.push(pth + "." + k + "=" + (typeof v === "object" ? "{" + keysOf(v) + "}" : str(v).slice(0, 50)));
          if (v && typeof v === "object") w(v, pth + "." + k, d + 1);
        });
      })(rec, "", 0);
      for (var pp = 0; pp < paths.length; pp++) line("field " + paths[pp]);
      var rawRec = JSON.stringify(rec);
      line("record size " + rawRec.length + ", has m3u8: " + (rawRec.indexOf("m3u8") !== -1) + ", has key=: " + (rawRec.indexOf("key=") !== -1));
      var r = resourcesOf(rec);
      line("quality list: " + (Object.keys(r).join(", ") || "NONE"));
      var k0 = Object.keys(r)[0];
      if (k0) line("first link: " + str(r[k0]).slice(0, 90));
      var st = getStream(vurl);
      line("qualities: " + st.map(function (x) { return x.label; }).join(", "));
      var inf = getInfo(vurl);
      line("getInfo: by " + (inf.creator || "?") + " | models: " + inf.actors.map(function (a) { return a.name; }).join(", "));
      line("related: " + related(vurl).length + " videos");
      if (inf.creatorUrl) {
        var ch = channel(inf.creatorUrl);
        line("CHANNEL " + inf.creatorUrl + ": name=" + ch.name + " videos=" + ch.videos);
        line("channel avatar=" + (ch.avatar || "NONE"));
        line("browse: " + browse(inf.creatorUrl, 1).length + " videos");
      }
    } catch (e3) { line("video failed: " + e3.message); }
  }
  try { line("search 'brunette': " + search("brunette", 1).length + " videos"); } catch (e4) { line("search failed: " + e4.message); }
  var out = [];
  for (var n = 0; n < lines.length; n++) out.push({ id: "debug" + n, url: SITE + "/#debug-" + n, title: (n + 1) + ". " + lines[n], thumb: "", duration: 0, creator: "Test mode" });
  return out;
}
