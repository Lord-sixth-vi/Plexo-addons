// @name Beeg
// @id org.plexo.js.beeg
// @version 1.0.0
// @domains beeg.com, externulls.com
// @category 18+
// @description Stream from beeg.com: newest videos, channels, models and tags, HD qualities (adults only, 18+)
//
// Beeg's pages are an app that loads everything from its data feed (store.externulls.com),
// so this add-on reads that feed directly. If it stops working after a site change, only
// this file needs fixing.

var SITE = "https://beeg.com";
var API = "https://store.externulls.com";
var VIDEO = "https://video.beeg.com/";
var THUMBS = "https://thumbs.externulls.com/videos/";
var PER_PAGE = 48;
var HDR = { Referer: SITE + "/", Origin: SITE };

function api(path) {
  var text = getPage(API + path, HDR);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("Beeg sent something unexpected (the site may have changed)");
  }
}

function fileField(file, column) {
  if (!file) return "";
  if (file.stuff && file.stuff[column]) return String(file.stuff[column]);
  var data = file.data || [];
  for (var i = 0; i < data.length; i++) {
    if (data[i] && data[i].cd_column === column && data[i].cd_value) return String(data[i].cd_value);
  }
  return "";
}

function ownerTag(tags) {
  tags = tags || [];
  for (var i = 0; i < tags.length; i++) if (tags[i] && tags[i].is_owner) return tags[i];
  return null;
}

function slugUrl(slug) {
  return SITE + "/" + encodeURIComponent(slug);
}

function firstFact(v) {
  var facts = v.fc_facts || [];
  var best = null;
  for (var i = 0; i < facts.length; i++) {
    if (!best || (facts[i].id && facts[i].id < best.id)) best = facts[i];
  }
  return best || {};
}

function card(v) {
  var file = v.file || {};
  if (!file.id) return null;
  var title = fileField(file, "sf_name");
  var owner = ownerTag(v.tags);
  if (!title) title = owner ? owner.tg_name : "Beeg video";
  var facts = v.fc_facts || [];
  var fact = facts[0] || {};
  var thumbs = fact.fc_thumbs || [];
  var url = SITE + "/-" + file.id;
  // A single clip cut out of a longer film: keep its start and end, like Beeg's own links.
  if (facts.length === 1 && fact.fc_start != null && fact.fc_end != null) {
    url += "?t=" + fact.fc_start + "-" + fact.fc_end;
  }
  var duration = file.fl_duration || 0;
  if (fact.fc_start != null && fact.fc_end != null && fact.fc_end > fact.fc_start) duration = fact.fc_end - fact.fc_start;
  return {
    id: String(file.id) + (fact.fc_start != null ? "_" + fact.fc_start : ""),
    url: url,
    title: title,
    thumb: thumbs.length ? THUMBS + file.id + "/" + thumbs[0] + ".webp?size=480x270" : "",
    duration: duration,
    creator: owner ? owner.tg_name : undefined,
    creatorUrl: owner && owner.tg_slug ? slugUrl(owner.tg_slug) : undefined
  };
}

function cards(list) {
  var out = [];
  var seen = {};
  if (!Array.isArray(list)) return out;
  for (var i = 0; i < list.length; i++) {
    var c = card(list[i] || {});
    if (c && !seen[c.id]) { seen[c.id] = true; out.push(c); }
  }
  return out;
}

function offset(page) {
  return ((page || 1) - 1) * PER_PAGE;
}

function bySlug(slug, page) {
  return cards(api("/facts/tag?slug=" + encodeURIComponent(slug) + "&get_original=true&limit=" + PER_PAGE + "&offset=" + offset(page)));
}

// ---------------------------------------------------------------- lists

function home(page) {
  page = page || 1;
  if (page > 100) return [];
  var out = cards(api("/facts/tag?id=27173&limit=" + PER_PAGE + "&offset=" + offset(page)));
  if (out.length === 0 && page === 1) throw new Error("No videos found (the site may have changed)");
  return out;
}

// Beeg has no word search: its search is by tag, channel or model name. So try the words as a
// tag in the ways Beeg writes them ("Big Tits", "big-tits", "Brazzers").
function search(query, page) {
  var q = (query || "").trim();
  if (!q) return home(page);
  var words = q.split(/\s+/);
  var title = words.map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
  var tries = [words.join("-"), title.join("-"), words.join("-").toLowerCase(), words.join("")];
  var tried = {};
  for (var i = 0; i < tries.length; i++) {
    if (tried[tries[i]]) continue;
    tried[tries[i]] = true;
    try {
      var out = bySlug(tries[i], page);
      if (out.length) return out;
    } catch (e) {}
  }
  return [];
}

// Channel, model or tag page: https://beeg.com/<slug>
function browse(url, page) {
  var m = String(url).match(/beeg\.com\/([^\/?#]+)/);
  if (!m || /^-?\d+$/.test(m[1])) return [];
  return bySlug(decodeURIComponent(m[1]), page || 1);
}

// ---------------------------------------------------------------- streams

var lastInfo = null;

function videoUrl(path) {
  path = String(path || "").trim().replace(/^"|"$/g, "").replace(/\\\//g, "/");
  if (!path) return "";
  if (path.indexOf("http") === 0) return path;
  return VIDEO + path.replace(/^\/+/, "");
}

function getStream(url) {
  var m = String(url).match(/beeg\.com\/(?:video\/)?-?(\d+)/);
  if (!m) throw new Error("Not a Beeg video link");
  var id = m[1];
  var t = String(url).match(/[?&]t=(\d+)-(\d+)/);
  var out = [];
  var seen = {};
  function add(label, h, u) {
    if (!u || seen[u]) return;
    seen[u] = true;
    out.push({ label: label, h: h, url: u, headers: { Referer: SITE + "/", Origin: SITE } });
  }

  // Every quality from the video's details.
  lastInfo = null;
  try {
    lastInfo = api("/facts/file/" + id);
    var res = (lastInfo.file && lastInfo.file.hls_resources) || firstFact(lastInfo).hls_resources || {};
    var multi = "";
    for (var k in res) {
      if (!res[k]) continue;
      var q = k.match(/(\d{3,4})/);
      if (k.indexOf("multi") !== -1 || !q) { multi = multi || res[k]; continue; }
      add(q[1] + "p", parseInt(q[1], 10), videoUrl(res[k]));
    }
    if (multi) add("Auto", 0, videoUrl(multi));
  } catch (e) {}

  // Beeg's own player link (also the only way for clips cut from longer films).
  try {
    var key = getPage(API + "/video/play_url/" + id + (t ? "?fc_start=" + t[1] + "&fc_end=" + t[2] : ""), HDR);
    var u = videoUrl(key);
    if (u.indexOf("http") === 0 && u.length < 2000) {
      if (t) { out = []; seen = {}; }
      add(t ? "Auto" : "Auto (player)", 0, u);
    }
  } catch (e) {}

  if (out.length === 0) throw new Error("No video links found (removed, or the site changed)");
  out.sort(function (a, b) { return b.h - a.h; });
  return out.map(function (s) { return { label: s.label, url: s.url, headers: s.headers }; });
}

function getInfo(url) {
  var info = lastInfo;
  if (!info) {
    var m = String(url).match(/beeg\.com\/(?:video\/)?-?(\d+)/);
    if (m) { try { info = api("/facts/file/" + m[1]); } catch (e) {} }
  }
  var out = { creator: "", creatorUrl: "", actors: [] };
  if (!info) return out;
  var tags = info.tags || [];
  var owner = ownerTag(tags);
  if (owner) { out.creator = owner.tg_name; out.creatorUrl = slugUrl(owner.tg_slug); }
  for (var i = 0; i < tags.length; i++) {
    var tg = tags[i] || {};
    var type = String(tg.tg_type || tg.type || "").toLowerCase();
    if (tg === owner || type.indexOf("person") === -1 || !tg.tg_slug) continue;
    out.actors.push({ name: tg.tg_name, url: slugUrl(tg.tg_slug) });
  }
  return out;
}
