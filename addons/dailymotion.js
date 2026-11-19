// @name        Dailymotion (Experimental)
// @id          org.plexo.js.dailymotion
// @version     0.1.0
// @author      Plexo add-ons
// @domains     dailymotion.com, www.dailymotion.com, api.dailymotion.com, geo.dailymotion.com, dmcdn.net
// @category    Video
// @description Experimental public video browsing and stream extraction; playback unverified
// @login       https://www.dailymotion.com/signin

var DM_API = 'https://api.dailymotion.com';
var DM_SITE = 'https://www.dailymotion.com';
var DM_FIELDS = 'id,title,url,duration,thumbnail_720_url,thumbnail_480_url,thumbnail_url,owner,owner.screenname,owner.username,owner.url';
function dmJson(url) { try { return JSON.parse(getPage(url)); } catch (e) { throw new Error('Dailymotion API unavailable'); } }
function dmVideoId(url) { var m = String(url||'').match(/(?:video\/|dai[.]ly\/)([a-zA-Z0-9]+)/); return m ? m[1] : ''; }
function dmCard(v) {
  if (!v || !v.id || !v.title) return null;
  var o = v.owner && typeof v.owner === 'object' ? v.owner : {};
  var ownerId = o.username || (typeof v.owner === 'string' ? v.owner : '');
  var creator = o.screenname || ownerId || 'Dailymotion';
  return { id:String(v.id), url:DM_SITE+'/video/'+v.id, title:decodeHtml(String(v.title)),
    thumb:v.thumbnail_720_url || v.thumbnail_480_url || v.thumbnail_url || '',
    duration:toSeconds(v.duration), creator:creator,
    creatorUrl:ownerId ? DM_SITE+'/'+encodeURIComponent(ownerId) : '' };
}
function dmList(path, page) {
  var sep = path.indexOf('?') >= 0 ? '&' : '?';
  var data = dmJson(DM_API+path+sep+'fields='+encodeURIComponent(DM_FIELDS)+'&limit=30&page='+Math.max(1,page||1));
  if (!data || !Array.isArray(data.list)) throw new Error('Dailymotion listing unavailable');
  var result=[]; for(var i=0;i<data.list.length;i++){var c=dmCard(data.list[i]);if(c)result.push(c);}
  return result;
}
function home(page) { return dmList('/videos?sort=trending',page); }
function search(query,page) {
  var q=String(query||'').trim(); if(!q)return home(page);
  return dmList('/videos?search='+encodeURIComponent(q)+'&sort=relevance',page);
}
function browse(url,page) {
  var u=String(url||'');
  var m=u.match(/dailymotion[.]com\/(?:user\/)?([a-zA-Z0-9_-]+)(?:[/?#]|$)/);
  if(!m || /^(?:video|playlist|search|embed|signin)$/i.test(m[1]))throw new Error('Unsupported channel URL');
  return dmList('/user/'+encodeURIComponent(m[1])+'/videos?sort=recent',page);
}
function dmOwner(v) {
  var o=v.owner && typeof v.owner==='object' ? v.owner : {};
  var name=o.screenname||o.username||'';
  var username=o.username||'';
  return {creator:name,creatorUrl:username?DM_SITE+'/'+encodeURIComponent(username):'',actors:[]};
}
function getInfo(url) {
  var id=dmVideoId(url);if(!id)return {creator:'',creatorUrl:'',actors:[]};
  try{return dmOwner(dmJson(DM_API+'/video/'+id+'?fields='+encodeURIComponent('owner,owner.screenname,owner.username')));}
  catch(e){return {creator:'',creatorUrl:'',actors:[]};}
}
function dmCandidates(value, out, seen, depth) {
  if(depth>6 || !value)return;
  if(typeof value==='string') {
    var u=value.replace(/\\u0026/g,'&').replace(/\\\//g,'/');
    if(/^https?:\/\//.test(u) && /[.](?:m3u8|mp4)(?:[?#]|$)/i.test(u) && !seen[u]) {
      seen[u]=true;out.push({label:heightOf(u)?heightOf(u)+'p':(/[.]m3u8/i.test(u)?'HLS':'MP4'),url:u});
    }
    return;
  }
  if(Array.isArray(value)){for(var i=0;i<value.length;i++)dmCandidates(value[i],out,seen,depth+1);return;}
  if(typeof value==='object'){
    if(value.url)dmCandidates(value.url,out,seen,depth+1);
    for(var k in value)if(Object.prototype.hasOwnProperty.call(value,k) && k!=='url')dmCandidates(value[k],out,seen,depth+1);
  }
}
function getStream(url) {
  var id=dmVideoId(url);if(!id)throw new Error('Invalid Dailymotion video link');
  var html='';try{html=getPage(DM_SITE+'/video/'+id);}catch(e){}
  var candidates=[],seen={};
  // Only accept media links exposed by public pages; no DRM, keys or token bypass.
  var config=jsonAfter(html, /(?:__PLAYER_CONFIG__|__NEXT_DATA__|__INITIAL_STATE__)\s*[:=]\s*/);
  if(config)dmCandidates(config,candidates,seen,0);
  var embedded=jsonAfter(html, /<script[^>]*type="application\/ld\+json"[^>]*>/);
  if(embedded)dmCandidates(embedded,candidates,seen,0);
  try {var fallback=anyStreams(html);for(var j=0;j<fallback.length;j++)dmCandidates(fallback[j].url,candidates,seen,0);}catch(e2){}
  if(!candidates.length)throw new Error('No public playable stream exposed; use Dailymotion official player');
  try {return finalizeStreams(candidates);}catch(e3){throw new Error('Public streams unavailable or blocked');}
}
function getComments(url,page){return [];}
