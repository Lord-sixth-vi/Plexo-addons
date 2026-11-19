// @name        Internet Archive Movies
// @id          org.plexo.js.internetarchive
// @version     1.0.0
// @author      Plexo add-ons
// @domains     archive.org
// @category    Movies
// @description Browse and play openly licensed and public-domain films from Internet Archive

var IA = "https://archive.org";
var PAGE_SIZE = 24;
var IA_FIELDS = ["identifier", "title", "creator", "date", "year", "runtime", "description", "collection", "downloads", "licenseurl", "rights"];

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
  return "mediatype:movies AND collection:opensource_movies" + (extra ? " AND (" + extra + ")" : "");
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
  var creator = firstValue(doc.creator);
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
  return cardsFromDocs(searchDocs(movieQuery(""), page, "downloads desc"));
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
  return /creativecommons\.org\/(?:licenses\/(?:by|by-sa|by-nc|by-nd)(?:-sa|-nc|-nd)?\/|publicdomain\/(?:zero|mark)\/)/i.test(license) || /public domain|no known copyright restrictions|copyright free/i.test(license);
}
function fileQuality(file) {
  var s = String(file.name || "") + " " + String(file.format || "");
  var h = heightOf(s);
  if (h) return h;
  var m = s.match(/(?:^|[^0-9])(2160|1440|1080|720|576|540|480|360|240)(?:p|[^0-9])/i);
  return m ? parseInt(m[1], 10) : 0;
}
function getStream(url) {
  var m = String(url || "").match(/archive\.org\/details\/([^/?#]+)/i);
  if (!m) throw new Error("Invalid Internet Archive video link");
  var id = decodeURIComponent(m[1]);
  var meta = iaJson(iaUrl("/metadata/" + encodeURIComponent(id)));
  if (!meta || !meta.metadata) throw new Error("Video removed or unavailable");
  if (!isAllowedLicense(meta)) throw new Error("This item has no clear public-domain or Creative Commons licence");
  var files = Array.isArray(meta.files) ? meta.files : [];
  var candidates = [];
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || !f.name || f.source === "metadata" || f.private === "true") continue;
    var name = String(f.name);
    if (!/\.(?:mp4|webm|m3u8|mpd)$/i.test(name)) continue;
    if (/\.(?:torrent|sample)\./i.test(name)) continue;
    var fmt = String(f.format || "").toLowerCase();
    if (/mpeg4|h\.264|webm|mpeg dash|mpeg-dash|hls/i.test(fmt) || /\.(?:mp4|webm|m3u8|mpd)$/i.test(name)) {
      var q = fileQuality(f);
      var formatLabel = String(f.format || "").trim();
      if (formatLabel.length > 28) formatLabel = formatLabel.slice(0, 28);
      candidates.push({ label: q ? q + "p" : (formatLabel || (name.match(/\.mpd$/i) ? "DASH" : (name.match(/\.webm$/i) ? "WebM" : (name.match(/\.m3u8$/i) ? "HLS" : "MP4")))), url: IA + "/download/" + encodeURIComponent(id) + "/" + encodeURIComponent(name), dash: /\.mpd$/i.test(name), q: fileQuality(f) });
    }
  }
  candidates.sort(function (a, b) { return b.q - a.q; });
  var direct = [];
  var dash = [];
  for (var j = 0; j < candidates.length; j++) {
    if (candidates[j].dash) dash.push({ label: candidates[j].label, url: candidates[j].url });
    else direct.push({ label: candidates[j].label, url: candidates[j].url });
  }
  var result = [];
  if (direct.length) result = finalizeStreams(direct);
  else if (dash.length) result = dash;
  else throw new Error("No playable MP4, WebM or HLS file is available");
  for (var k = 0; k < dash.length; k++) result.push(dash[k]);
  return result;
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
