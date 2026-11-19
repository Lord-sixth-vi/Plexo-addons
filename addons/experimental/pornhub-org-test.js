// @name        Pornhub.org OTT Test (Experimental)
// @id          org.plexo.js.pornhub_org_test
// @version     0.1.0
// @author      Plexo add-ons
// @domains     pornhub.org, www.pornhub.org
// @category    18+
// @description Experimental public-page listing and playback; not verified

var PH_BASE="https://www.pornhub.org";
function phPath(url){
  var m=String(url||"").match(/^https?:\/\/(?:www\.)?pornhub\.org(\/[^#]*)/i);
  if(!m)throw new Error("Unsupported pornhub.org URL");
  return m[1];
}
function phFetch(path){
  var html=getPage(PH_BASE+path);
  if(!html||html.length<500)throw new Error("pornhub.org returned no usable page");
  if(/captcha|access denied|verify you are human/i.test(html.slice(0,2000)))throw new Error("Site requires browser verification");
  return html;
}
function phClean(value){return decodeHtml(String(value||"").replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim());}
function phCards(html){
  var out=[],seen={},re=/<a\b[^>]*href=["']([^"']*view_video\.php\?viewkey=[^"'&\s]+[^"']*)["'][^>]*>/gi,m;
  while((m=re.exec(html))&&out.length<30){
    var url=absUrl(PH_BASE,m[1]);
    if(seen[url])continue;
    var chunk=html.slice(Math.max(0,m.index-150),Math.min(html.length,m.index+1200));
    var img=(chunk.match(/<img\b[^>]*>/i)||[""])[0];
    var title=attr(m[0],"title")||attr(img,"alt")||attr(img,"title");
    if(!title)continue;
    seen[url]=true;
    var dm=chunk.match(/\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/);
    out.push({id:url,url:url,title:phClean(title),thumb:findThumb(chunk,PH_BASE),duration:dm?toSeconds(dm[0]):0,creator:"",creatorUrl:""});
  }
  return out;
}
function home(page){return phCards(phFetch("/video?o=tr"+(page>1?"&page="+page:"")));}
function search(query,page){return phCards(phFetch("/video/search?search="+encodeURIComponent(query||"")+(page>1?"&page="+page:"")));}
function browse(url,page){var path=phPath(url);return phCards(phFetch(path+(page>1?(path.indexOf("?")>=0?"&":"?")+"page="+page:"")));}
function getStream(url){
  var html=phFetch(phPath(url)),out=[],seen={};
  var m=html.match(/(?:mediaDefinitions|media_definitions)\s*[:=]\s*(\[[\s\S]*?\])/i);
  if(m){
    try{
      var defs=JSON.parse(m[1]);
      for(var i=0;i<defs.length;i++){
        var d=defs[i],u=d&&d.videoUrl;
        if(typeof u!=="string"||!/^https?:\/\//.test(u)||!/[.](?:mp4|m3u8)(?:[?#]|$)/i.test(u)||seen[u])continue;
        if(/preview|trailer|thumb|sample/i.test(u))continue;
        seen[u]=true;
        out.push({label:d.quality?String(d.quality)+"p":"Auto",url:u,headers:{Referer:PH_BASE+"/"}});
      }
    }catch(e){}
  }
  if(!out.length)throw new Error("No full-length player sources identified; refusing preview clips");
  return out;
}
function getInfo(url){return {creator:"",creatorUrl:"",actors:[]};}
function getComments(url,page){return [];}
function getFeatured(page){return home(page);}
function getHomeSections(page){return [{id:"trending",title:"Trending",items:home(page)}];}
function getRecommendations(url,page){return [];}
function getChannel(url){return {name:"",url:url,description:"",avatar:"",banner:""};}
function getPlaylists(url,page){return [];}
function getCategories(){return [];}
function getFilters(){return [];}
