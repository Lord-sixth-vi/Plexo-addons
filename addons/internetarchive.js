// @name        Internet Archive Movies
// @id          org.plexo.js.internetarchive
// @version     1.1.3
// @login       https://archive.org/account/login
// @icon        https://raw.githubusercontent.com/Lord-sixth-vi/Plexo-addons/main/assets/internetarchive.svg
// @author      Plexo add-ons
// @domains     archive.org
// @category    Movies
// @description Browse and play openly licensed and public-domain films from Internet Archive

var IA = "https://archive.org";
var PAGE_SIZE = 24;
var IA_LOGO = "https://raw.githubusercontent.com/Lord-sixth-vi/Plexo-addons/main/assets/internetarchive.svg";
var IA_FIELDS = ["identifier", "title", "creator", "date", "year", "runtime", "description", "collection", "downloads", "licenseurl", "rights", "publicdate"];

function iaUrl(path) { return IA + path; }
function iaJson(url) {
  var raw = getPage(url);
  try { return JSON.parse(raw); }
  catch (e) { throw new Error("Internet Archive returned invalid data"); }
}
function firstValue(v) {
  if (Array.isArray(v)) return v.length ? String(v[0]) : "";
  return v == null ? "" : String(v);
}
function cleanText(v) {
  return decodeHtml(String(v || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}
function queryUrl(q, page, sort) {
  var fields = IA_FIELDS.slice(0);
  var p = "q=" + encodeURIComponent(q) + "&rows=" + PAGE_SIZE + "&page=" + Math.max(1, page || 1) + "&output=json";
  for (var i = 0; i < fields.length; i++) p += "&fl%5B%5D=" + encodeURIComponent(fields[i]);
  if (sort) p += "&sort%5B%5D=" + encodeURIComponent(sort);
  return iaUrl("/advancedsearch.php?" + p);
}
function movieQuery(extra) {
  return "mediatype:movies AND (collection:feature_films OR collection:prelinger OR collection:opensource_movies)" + (extra ? " AND (" + extra + ")" : "");
}
function searchDocs(q, page, sort) {
  var data = iaJson(queryUrl(q, page, sort));
  if (!data || !data.response || !Array.isArray(data.response.docs)) throw new Error("Internet Archive search is unavailable");
  return data.response.docs;
}
function makeCard(doc) {
  var id = firstValue(doc.identifier);
  var title = cleanText(firstValue(doc.title));
  if (!id || !title) return null;
  var creator = firstValue(doc.creator) || "Internet Archive";
  var creatorUrl = "";
  if (creator) creatorUrl = IA + "/search.php?query=" + encodeURIComponent('creator:"' + creator.replace(/"/g, "") + '" AND mediatype:movies AND collection:opensource_movies');
  var runtime = firstValue(doc.runtime);
  var duration = runtime ? toSeconds(runtime) : 0;
  var description = cleanText(firstValue(doc.description));
  if (!duration && description) {
    var dm = description.match(/(?:runtime|running time|duration)\s*[:\-]?\s*((?:\d+:)?\d{1,2}:\d{2}|\d+\s*(?:min|sec))/i);
    if (dm) duration = toSeconds(dm[1]);
  }
  return {
    id: id,
    url: IA + "/details/" + encodeURIComponent(id),
    title: title,
    thumb: IA + "/services/img/" + encodeURIComponent(id),
    duration: duration,
    creator: creator,
    creatorUrl: creatorUrl
  };
}
function cardsFromDocs(docs) {
  var out = [];
  for (var i = 0; i < docs.length; i++) {
    var c = makeCard(docs[i]);
    if (c) out.push(c);
  }
  return attachExtras(out, "", IA);
}
function home(page) {
  return cardsFromDocs(searchDocs(movieQuery("runtime:[600 TO *]"), page, "downloads desc"));
}
function search(query, page) {
  var term = String(query || "").trim();
  if (!term) return home(page);
  term = term.replace(/[\\+\-!(){}\[\]^"~*?:\/]/g, " ").replace(/\s+/g, " ").trim();
  if (!term) return home(page);
  var phrase = 'title:"' + term + '" OR creator:"' + term + '" OR subject:"' + term + '" OR description:"' + term + '"';
  return cardsFromDocs(searchDocs(movieQuery(phrase), page, "downloads desc"));
}
function browse(url, page) {
  var u = String(url || "");
  var m = u.match(/[?&]query=([^&]+)/);
  if (!m) throw new Error("Channel link is not supported");
  var q = decodeURIComponent(m[1].replace(/\+/g, "%20"));
  return cardsFromDocs(searchDocs(movieQuery(q), page, "date desc"));
}
function isAllowedLicense(meta) {
  var md = (meta && meta.metadata) || {};
  var license = (firstValue(md.licenseurl) + " " + firstValue(md.license) + " " + firstValue(md.rights)).toLowerCase();
  return /creativecommons[.]org\/(?:licenses\/|publicdomain\/)/i.test(license) ||
    /public domain|no known copyright restrictions|copyright free|creative commons/i.test(license) ||
    /opensource_movies|prelinger|feature_films/i.test(firstValue(md.collection));
}
function encodeFilePath(name) {
  return String(name).split("/").map(function(part) { return encodeURIComponent(part); }).join("/");
}
function getStream(url) {
  var m = String(url || "").match(/archive[.]org\/details\/([^/?#]+)/i);
  if (!m) throw new Error("Invalid Internet Archive video link");
  var id = decodeURIComponent(m[1]);
  var meta = iaJson(IA + "/metadata/" + encodeURIComponent(id));
  if (!meta || !meta.metadata) throw new Error("Video unavailable");
  if (!isAllowedLicense(meta)) throw new Error("Licence not confirmed for this video");
  var files = Array.isArray(meta.files) ? meta.files : [];
  var streams = [], dash = [], seen = {};
  for (var i = 0; i < files.length; i++) {
    var f = files[i], name = f && String(f.name || "");
    if (!name || f.private === "true" || f.private === true || f.source === "metadata") continue;
    if (!/[.](mp4|m4v|webm|m3u8|mpd)$/i.test(name)) continue;
    if (/sample|preview|thumb/i.test(name)) continue;
    var ext = (name.match(/[.]([^.]+)$/) || ["","mp4"])[1].toLowerCase();
    var height = parseInt(f.height, 10) || heightOf(name) || 0;
    var width = parseInt(f.width, 10) || 0;
    var q = height || (width >= 3840 ? 2160 : width >= 2560 ? 1440 : width >= 1920 ? 1080 : width >= 1280 ? 720 : width >= 854 ? 480 : 0);
    var label = q ? q + "p" : (String(f.format || "").trim() || ext.toUpperCase());
    var fileUrl = IA + "/download/" + encodeURIComponent(id) + "/" + encodeFilePath(name);
    if (seen[fileUrl]) continue;
    seen[fileUrl] = true;
    var entry = {label: label, url: fileUrl, rank: q, ext: ext};
    if (ext === "mpd") dash.push(entry); else streams.push(entry);
  }
  streams.sort(function(a,b) { return b.rank-a.rank || (a.ext==="mp4" ? -1 : 1); });
  var output = [], labels = {};
  for (var j=0; j<streams.length; j++) {
    var s=streams[j], key=s.label;
    if (labels[key]) key = s.label + " (" + s.ext.toUpperCase() + " " + (labels[s.label]+1) + ")";
    labels[s.label] = (labels[s.label] || 0)+1;
    output.push({label:key,url:s.url});
  }
  if (output.length) {
    // finalizeStreams expands HLS masters and keeps quality options.
    output = finalizeStreams(output);
  }
  for (var k=0;k<dash.length;k++) output.push({label:dash[k].label+" DASH",url:dash[k].url});
  if (!output.length) throw new Error("No playable video files found");
  return output;
}
function getInfo(url) {
  var info = pageInfo(url);
  if (info && info.creator) return info;
  var m = String(url || "").match(/archive\.org\/details\/([^/?#]+)/i);
  if (!m) return { creator: "", creatorUrl: "", actors: [] };
  var meta = iaJson(iaUrl("/metadata/" + encodeURIComponent(decodeURIComponent(m[1]))));
  var md = (meta && meta.metadata) || {};
  var creator = firstValue(md.creator);
  return {
    creator: creator,
    creatorUrl: creator ? IA + "/search.php?query=" + encodeURIComponent('creator:"' + creator.replace(/"/g, "") + '" AND mediatype:movies AND collection:opensource_movies') : "",
    actors: []
  };
}
function getComments(url, page) { return []; }
