const ORS_API_KEY = Deno.env.get('ORS_API_KEY') || '';
const DEFAULT_ALLOWED_ORIGIN = 'https://yoshiokayuta2-lgtm.github.io';

function allowedOrigin(req: Request) {
  const origin = req.headers.get('origin') || '';
  if (origin === DEFAULT_ALLOWED_ORIGIN) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return DEFAULT_ALLOWED_ORIGIN;
}
function cors(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  };
}
function json(req: Request, body: unknown, status=200) { return new Response(JSON.stringify(body), { status, headers: cors(req) }); }
function finite(v: unknown) { const n=Number(v); return Number.isFinite(n)?n:null; }
function haversine(a:{lat:number,lng:number},b:{lat:number,lng:number}){const R=6371000,p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180;const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function pointAt(origin:{lat:number,lng:number}, bearingDeg:number, distanceM:number){const R=6371000,br=bearingDeg*Math.PI/180,d=distanceM/R,lat1=origin.lat*Math.PI/180,lon1=origin.lng*Math.PI/180;const lat2=Math.asin(Math.sin(lat1)*Math.cos(d)+Math.cos(lat1)*Math.sin(d)*Math.cos(br));const lon2=lon1+Math.atan2(Math.sin(br)*Math.sin(d)*Math.cos(lat1),Math.cos(d)-Math.sin(lat1)*Math.sin(lat2));return {lat:lat2*180/Math.PI,lng:((lon2*180/Math.PI+540)%360)-180};}
function directionName(b:number){const names=['北','北東','東','南東','南','南西','西','北西'];return names[Math.round((((b%360)+360)%360)/45)%8];}
async function reverseLabel(point:{lat:number,lng:number},fallback:string){try{const url=new URL('https://api.openrouteservice.org/geocode/reverse');url.searchParams.set('point.lon',String(point.lng));url.searchParams.set('point.lat',String(point.lat));url.searchParams.set('size','1');const res=await fetch(url,{headers:{Authorization:ORS_API_KEY}});const data=await res.json().catch(()=>({}));const p=data?.features?.[0]?.properties||{};return String(p.name||p.locality||p.county||p.region||p.label||fallback);}catch{return fallback}}

async function geocode(text:string){
  const url=new URL('https://api.openrouteservice.org/geocode/search');url.searchParams.set('text',text);url.searchParams.set('size','1');url.searchParams.set('boundary.country','JP');
  const res=await fetch(url,{headers:{Authorization:ORS_API_KEY}});const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.error?.message||`目的地検索に失敗しました（HTTP ${res.status}）`);
  const f=data?.features?.[0], c=f?.geometry?.coordinates;if(!Array.isArray(c)||c.length<2)throw new Error('目的地を地図上で見つけられませんでした。地名や住所を詳しくしてください。');
  return {lng:Number(c[0]),lat:Number(c[1]),label:String(f?.properties?.label||f?.properties?.name||text)};
}
function extra(extras:any,names:string[]){for(const n of names)if(extras?.[n])return extras[n];return null;}
function summaryAmount(ex:any, values:number[]){const s=ex?.summary;if(!Array.isArray(s))return 0;return s.filter((x:any)=>values.includes(Number(x.value))).reduce((a:number,x:any)=>a+Number(x.amount||0),0);}
function downsample<T>(arr:T[],max=1400){if(arr.length<=max)return arr;const out:T[]=[];const step=(arr.length-1)/(max-1);for(let i=0;i<max;i++)out.push(arr[Math.min(arr.length-1,Math.round(i*step))]);return out;}
function makeProfiles(coords:any[]){
  const pts=coords.map((c:any[])=>({lng:Number(c[0]),lat:Number(c[1]),ele:Number.isFinite(Number(c[2]))?Number(c[2]):null}));let total=0;const prof:any[]=[];for(let i=0;i<pts.length;i++){if(i)total+=haversine(pts[i-1],pts[i]);prof.push({km:total/1000,ele:pts[i].ele??(prof[i-1]?.ele??0)});}const sparse=downsample(prof,500);
  let maxGrade=0;const grades:any[]=[];for(let i=1;i<sparse.length;i++){const a=sparse[Math.max(0,i-2)],b=sparse[i],d=(b.km-a.km)*1000;const g=d>20?(b.ele-a.ele)/d*100:0;if(Number.isFinite(g)){maxGrade=Math.max(maxGrade,g);grades.push({...b,grade:g});}}
  const climbs:any[]=[];let cur:any=null;for(const p of grades){if(p.grade>=2.5){if(!cur)cur={startKm:Math.max(0,p.km-.15),endKm:p.km,gainM:0,maxGrade:p.grade,samples:[]};cur.endKm=p.km;cur.maxGrade=Math.max(cur.maxGrade,p.grade);cur.samples.push(p);}else if(cur){finish(cur);cur=null}}if(cur)finish(cur);
  function finish(c:any){const d=c.endKm-c.startKm;if(d<.25)return;const first=c.samples[0],last=c.samples[c.samples.length-1];c.gainM=Math.max(0,last.ele-first.ele);c.distanceKm=d;c.avgGrade=d>0?c.gainM/(d*1000)*100:0;if(c.avgGrade>=2.3)climbs.push(c)}
  climbs.sort((a,b)=>(b.gainM+b.maxGrade*8)-(a.gainM+a.maxGrade*8));return {route:downsample(pts,1400),elevationProfile:sparse,maxGrade,climbs:climbs.slice(0,10)};
}
function extractManeuvers(feature:any){
  const coords=Array.isArray(feature?.geometry?.coordinates)?feature.geometry.coordinates:[];
  if(!coords.length)return [];
  const cum=[0];
  for(let i=1;i<coords.length;i++)cum[i]=cum[i-1]+haversine({lat:Number(coords[i-1][1]),lng:Number(coords[i-1][0])},{lat:Number(coords[i][1]),lng:Number(coords[i][0])});
  const out:any[]=[];const segments=Array.isArray(feature?.properties?.segments)?feature.properties.segments:[];
  for(const segment of segments){
    const steps=Array.isArray(segment?.steps)?segment.steps:[];
    for(const step of steps){
      const type=Number(step?.type);if(!Number.isFinite(type)||type===11)continue;
      const wp=Array.isArray(step?.way_points)?step.way_points:[];
      const rawIndex=type===10?Number(wp[1]??coords.length-1):Number(wp[0]??0);
      const idx=Math.max(0,Math.min(coords.length-1,Number.isFinite(rawIndex)?Math.round(rawIndex):0));
      const c=coords[idx];if(!Array.isArray(c)||c.length<2)continue;
      out.push({
        type,
        progressM:Math.round(cum[idx]||0),
        routeIndex:idx,
        lat:Number(c[1]),lng:Number(c[0]),
        name:String(step?.name||'').trim(),
        instruction:String(step?.instruction||'').trim(),
      });
    }
  }
  const dedup:any[]=[];const seen=new Set<string>();
  for(const m of out){const key=`${m.type}|${m.progressM}|${m.name}`;if(seen.has(key))continue;seen.add(key);dedup.push(m);}
  return dedup;
}
function metrics(feature:any){
  const props=feature?.properties||{}, summary=props.summary||{}, extras=props.extras||{};const wt=extra(extras,['waytypes','waytype']),sf=extra(extras,['surface','surfaces']),suit=extra(extras,['suitability']);
  const cyclewayPct=summaryAmount(wt,[6]);const pavedPct=summaryAmount(sf,[1,3,4,14]);const stateRoadPct=summaryAmount(wt,[1]);const suitabilityPct=summaryAmount(suit,[8,9,10]);const profile=makeProfiles(feature?.geometry?.coordinates||[]);const maneuvers=extractManeuvers(feature);
  return {distanceM:Number(summary.distance||0),durationS:Number(summary.duration||0),ascentM:Number(summary.ascent||0),descentM:Number(summary.descent||0),cyclewayPct,pavedPct,stateRoadPct,suitabilityPct,maneuvers,...profile};
}

const PLACE_CATEGORIES: Record<string, { label: string; clauses: string[]; orsIds: number[]; fallback: string }> = {
  cafe: {
    label: 'カフェ・パン', fallback: 'カフェ・パン', orsIds:[564,426,435,448,450],
    clauses: ['["amenity"="cafe"]','["shop"="bakery"]','["shop"="confectionery"]','["shop"="coffee"]'],
  },
  food: {
    label: 'グルメ', fallback: '飲食店', orsIds:[570,566,567,568],
    clauses: ['["amenity"="restaurant"]','["amenity"="fast_food"]','["amenity"="food_court"]','["amenity"="ice_cream"]'],
  },
  convenience: {
    label: 'コンビニ', fallback: 'コンビニ', orsIds:[451],
    clauses: ['["shop"="convenience"]'],
  },
  onsen: {
    label: '温泉', fallback: '温浴施設', orsIds:[285,286,306],
    clauses: ['["amenity"="public_bath"]','["leisure"="spa"]','["natural"="hot_spring"]','["amenity"="sauna"]'],
  },
  scenery: {
    label: '景色・公園', fallback: '景色・公園', orsIds:[627,280,272,279,335,622],
    clauses: ['["tourism"="viewpoint"]','["tourism"="attraction"]','["natural"="peak"]','["natural"="waterfall"]','["leisure"="park"]','["leisure"="garden"]'],
  },
  station: {
    label: '駅', fallback: '駅', orsIds:[604,597,610],
    clauses: ['["railway"="station"]','["railway"="halt"]','["public_transport"="station"]','["building"="train_station"]'],
  },
  bicycle: {
    label: '自転車店', fallback: '自転車関連', orsIds:[429,585,584],
    clauses: ['["shop"="bicycle"]','["amenity"="bicycle_repair_station"]','["amenity"="bicycle_rental"]'],
  },
};

function addressFromTags(tags: Record<string,string>, fallback='') {
  if (tags['addr:full']) return tags['addr:full'];
  const parts = [tags['addr:province'] || tags['addr:state'], tags['addr:city'], tags['addr:town'], tags['addr:suburb'], tags['addr:quarter'], tags['addr:neighbourhood'], tags['addr:street'], tags['addr:housenumber']].filter(Boolean);
  return parts.join(' ') || tags.operator || tags.brand || fallback;
}
function elementPoint(el:any){
  const lat=finite(el?.lat ?? el?.center?.lat), lng=finite(el?.lon ?? el?.center?.lon);
  return lat===null||lng===null?null:{lat,lng};
}
function placeName(tags:Record<string,string>, fallback:string){
  return String(tags['name:ja']||tags.name||tags.brand||tags.operator||tags.ref||fallback);
}
function overpassStatements(clauses:string[], spatial:string){
  return clauses.map(cl=>`nwr${cl}${spatial};`).join('');
}
function orsPoiName(tags:Record<string,string>, fallback:string){
  return String(tags['name:ja']||tags.name||tags.brand||tags.operator||tags.ref||fallback);
}
async function searchOrsPois(origin:{lat:number,lng:number}, def:{label:string;fallback:string;orsIds:number[]}, radiusM:number){
  if(!ORS_API_KEY || !def.orsIds.length)return [];
  const buffer=Math.min(2000,Math.max(250,Math.round(radiusM)));
  const body={
    request:'pois',
    geometry:{geojson:{type:'Point',coordinates:[origin.lng,origin.lat]},buffer},
    limit:200,
    sortby:'distance',
    filters:{category_ids:def.orsIds},
  };
  try{
    const res=await fetch('https://api.openrouteservice.org/pois',{method:'POST',headers:{Authorization:ORS_API_KEY,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(body)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok)return [];
    const features=Array.isArray(data?.features)?data.features:[];
    const out:any[]=[];
    for(const f of features){
      const c=f?.geometry?.coordinates;if(!Array.isArray(c)||c.length<2)continue;
      const lng=finite(c[0]),lat=finite(c[1]);if(lat===null||lng===null)continue;
      const tags=(f?.properties?.osm_tags||{}) as Record<string,string>;
      const name=orsPoiName(tags,def.fallback);
      const distanceM=finite(f?.properties?.distance)??haversine(origin,{lat,lng});
      out.push({id:`ors-${f?.properties?.osm_type||'x'}-${f?.properties?.osm_id||`${lat}-${lng}`}`,name,lat,lng,distanceM:Math.round(distanceM),address:addressFromTags(tags,def.label),osmType:f?.properties?.osm_type||null,osmId:f?.properties?.osm_id||null,source:'ors-poi'});
    }
    return out;
  }catch{return []}
}
function mergePlaces(...groups:any[][]){
  const seenOsm=new Set<string>(), seenPos=new Set<string>(), out:any[]=[];
  for(const group of groups)for(const p of group){
    const osm=p.osmId?String(p.osmId):'';const pos=`${String(p.name||'').toLowerCase()}|${Number(p.lat).toFixed(5)}|${Number(p.lng).toFixed(5)}`;
    if((osm&&seenOsm.has(osm))||seenPos.has(pos))continue;
    if(osm)seenOsm.add(osm);seenPos.add(pos);out.push(p);
  }
  out.sort((a,b)=>Number(a.distanceM||0)-Number(b.distanceM||0));return out;
}
function bboxFor(origin:{lat:number,lng:number}, radiusM:number){
  const latDelta=radiusM/111320;
  const cos=Math.max(.2,Math.cos(origin.lat*Math.PI/180));
  const lngDelta=radiusM/(111320*cos);
  return {
    south:origin.lat-latDelta, west:origin.lng-lngDelta,
    north:origin.lat+latDelta, east:origin.lng+lngDelta,
  };
}
async function fetchOverpass(query:string, requireElements=false){
  const endpoints=[
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  let lastError=''; let lastEmpty:any=null;
  for(const endpoint of endpoints){
    try{
      const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','Accept':'application/json','User-Agent':'YOSHI-RIDE/1.3 personal cycling app'},body:'data='+encodeURIComponent(query)});
      if(!res.ok){lastError=`${endpoint}: HTTP ${res.status}`;continue;}
      const data=await res.json().catch(()=>null);
      if(!data){lastError=`${endpoint}: JSON parse error`;continue;}
      const remark=String(data?.remark||'').trim();
      if(remark){lastError=`${endpoint}: ${remark}`;continue;}
      const elements=Array.isArray(data?.elements)?data.elements:[];
      if(requireElements && elements.length===0){lastEmpty={...data,_endpoint:endpoint};continue;}
      return {...data,_endpoint:endpoint};
    }catch(e){lastError=`${endpoint}: ${e instanceof Error?e.message:String(e)}`}
  }
  if(lastEmpty)return lastEmpty;
  throw new Error(`周辺スポット検索に接続できませんでした: ${lastError||'Overpass API error'}`);
}
function normalizePlaces(data:any, origin:{lat:number,lng:number}, radius:number, def:{label:string;fallback:string}){
  const elements=Array.isArray(data?.elements)?data.elements:[];const seen=new Set<string>();const places:any[]=[];
  for(const el of elements){
    const point=elementPoint(el);if(!point)continue;
    const tags=(el?.tags||{}) as Record<string,string>;
    const name=placeName(tags,def.fallback);
    const key=`${name}|${point.lat.toFixed(5)}|${point.lng.toFixed(5)}`;
    if(seen.has(key))continue;seen.add(key);
    const distanceM=haversine(origin,point);if(distanceM>radius*1.08)continue;
    places.push({id:`${el.type||'osm'}-${el.id||key}`,name,lat:point.lat,lng:point.lng,distanceM:Math.round(distanceM),address:addressFromTags(tags,def.label),osmType:el.type||null,osmId:el.id||null});
  }
  places.sort((a,b)=>a.distanceM-b.distanceM);return places;
}
async function searchPlaces(origin:{lat:number,lng:number},category:string,radiusM:number){
  const def=PLACE_CATEGORIES[category];if(!def)throw new Error('未対応のジャンルです。');
  const radius=Math.min(30000,Math.max(1000,Math.round(radiusM||5000)));

  // ORS POI: 公開APIの制限に合わせ、まず現在地2km以内を高信頼で取得。
  const orsPlaces=await searchOrsPois(origin,def,Math.min(radius,2000));

  // Overpass: 選択した検索半径全体をカバー。失敗してもORSの近距離結果は残す。
  let osmPlaces:any[]=[]; let strategy='around'; let endpoint=''; let wideSearchOk=false;
  try{
    const around=`(around:${radius},${origin.lat.toFixed(6)},${origin.lng.toFixed(6)})`;
    const aroundQuery=`[out:json][timeout:18];(${overpassStatements(def.clauses,around)});out tags center qt 250;`;
    const aroundData=await fetchOverpass(aroundQuery,true);
    osmPlaces=normalizePlaces(aroundData,origin,radius,def);
    endpoint=String(aroundData?._endpoint||''); wideSearchOk=true;

    if(!osmPlaces.length){
      const b=bboxFor(origin,radius);
      const bbox=`(${b.south.toFixed(6)},${b.west.toFixed(6)},${b.north.toFixed(6)},${b.east.toFixed(6)})`;
      const bboxQuery=`[out:json][timeout:18];(${overpassStatements(def.clauses,bbox)});out tags center qt 300;`;
      const bboxData=await fetchOverpass(bboxQuery,true);
      osmPlaces=normalizePlaces(bboxData,origin,radius,def);
      strategy='bbox';endpoint=String(bboxData?._endpoint||endpoint);wideSearchOk=true;
    }
  }catch(e){
    console.warn('Overpass fallback failed',e);
  }

  const places=mergePlaces(orsPlaces,osmPlaces).filter(p=>Number(p.distanceM||0)<=radius*1.08).slice(0,60);
  if(!places.length && !wideSearchOk && !orsPlaces.length)throw new Error('周辺スポット検索に接続できませんでした。少し時間をおいて再試行してください。');
  return {category,categoryLabel:def.label,radiusM:radius,places,searchMeta:{strategy,endpoint,orsCount:orsPlaces.length,osmCount:osmPlaces.length,wideSearchOk}};
}

async function recommendationRoute(origin:{lat:number,lng:number}, destination:{lat:number,lng:number}, purpose:string){
  const requestBody:any={coordinates:[[origin.lng,origin.lat],[destination.lng,destination.lat]],elevation:true,instructions:true,instructions_format:'text',preference:'recommended',extra_info:['steepness','waytype','surface','suitability'],options:{avoid_features:['steps','ferries','fords']}};
  if(purpose==='training')requestBody.options.profile_params={weightings:{steepness_difficulty:3}};
  const res=await fetch('https://api.openrouteservice.org/v2/directions/cycling-road/geojson',{method:'POST',headers:{Authorization:ORS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(requestBody)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data?.error?.message||`HTTP ${res.status}`);
  const f=data?.features?.[0];if(!f)throw new Error('ルート候補なし');return metrics(f);
}
async function recommendCourses(origin:{lat:number,lng:number}, minutesValue:number, purposeValue:string){
  const minutes=Math.min(180,Math.max(20,Math.round(minutesValue||60)));
  const purpose=purposeValue==='training'?'training':'leisure';
  const targetS=minutes*60;
  const speedKmh=purpose==='training'?17:22;
  const detourFactor=purpose==='training'?.62:.70;
  const radialM=Math.max(4000,speedKmh*1000*(minutes/60)*detourFactor);
  const bearings=[10,70,130,190,250,310];
  const attempts=await Promise.allSettled(bearings.map(async bearing=>{
    const destination=pointAt(origin,bearing,radialM);
    const m=await recommendationRoute(origin,destination,purpose);
    const timeFit=Math.abs(m.durationS-targetS)/targetS;
    const km=Math.max(1,m.distanceM/1000);
    const ascentPerKm=m.ascentM/km;
    const climbGain=(m.climbs||[]).reduce((sum:number,c:any)=>sum+Number(c.gainM||0),0);
    const score=purpose==='training'
      ? timeFit*95-m.ascentM*.075-m.maxGrade*2.4-climbGain*.035
      : timeFit*110-m.cyclewayPct*.55-m.pavedPct*.10+ascentPerKm*.11+m.maxGrade*.55;
    return {bearing,destination,m,timeFit,score};
  }));
  let routes=attempts.filter((x:any)=>x.status==='fulfilled').map((x:any)=>x.value);
  if(!routes.length)throw new Error('周辺におすすめコースを作れませんでした。時間を変えて再試行してください。');
  const reasonable=routes.filter((x:any)=>x.m.durationS>=targetS*.48&&x.m.durationS<=targetS*1.75);if(reasonable.length>=2)routes=reasonable;
  routes.sort((a:any,b:any)=>a.score-b.score);const picked=routes.slice(0,3);
  const candidates=[];
  for(let i=0;i<picked.length;i++){const x=picked[i];const dir=directionName(x.bearing);const area=await reverseLabel(x.destination,`${dir}方面`);const label=area.includes(dir)?area:`${area}・${dir}方面`;const m=x.m;const reason=purpose==='training'?`片道${minutes}分目安 / 獲得${Math.round(m.ascentM)}m・最大${m.maxGrade.toFixed(1)}%`:`片道${minutes}分目安 / cycleway ${Math.round(m.cyclewayPct)}%・舗装 ${Math.round(m.pavedPct)}%`;candidates.push({destination:{lat:x.destination.lat,lng:x.destination.lng,label},summary:{distanceM:Math.round(m.distanceM),durationS:Math.round(m.durationS),ascentM:Math.round(m.ascentM),descentM:Math.round(m.descentM),maxGrade:Number(m.maxGrade.toFixed(1)),cyclewayPct:Number(m.cyclewayPct.toFixed(1)),pavedPct:Number(m.pavedPct.toFixed(1))},route:downsample(m.route,900),elevationProfile:downsample(m.elevationProfile,320),climbs:(m.climbs||[]).slice(0,8),maneuvers:(m.maneuvers||[]),selection:{mode:purpose==='training'?'hill':'cycleway',purpose,minutes,reason,candidateCount:routes.length}});}
  return {purpose,minutes,targetDurationS:targetS,candidates};
}

function selectCandidate(features:any[],mode:string){
  const candidates=features.map((f,i)=>({feature:f,index:i,m:metrics(f)}));if(!candidates.length)throw new Error('ルート候補を取得できませんでした。');
  let best=candidates[0], reason='おすすめ';
  if(mode==='cycleway'){
    best=[...candidates].sort((a,b)=>((b.m.cyclewayPct*12+b.m.pavedPct*1.5+b.m.suitabilityPct*.7-b.m.stateRoadPct*1.3)-(a.m.cyclewayPct*12+a.m.pavedPct*1.5+a.m.suitabilityPct*.7-a.m.stateRoadPct*1.3)))[0];reason=`候補${candidates.length}本からcycleway比率を優先`;
  }else if(mode==='hill'){
    best=[...candidates].sort((a,b)=>((b.m.ascentM*.7+b.m.maxGrade*24+b.m.climbs.reduce((s:number,c:any)=>s+c.gainM,0)*.35)-(a.m.ascentM*.7+a.m.maxGrade*24+a.m.climbs.reduce((s:number,c:any)=>s+c.gainM,0)*.35)))[0];reason=`候補${candidates.length}本から獲得標高・急坂を優先`;
  }
  return {best,candidates,reason};
}

Deno.serve(async (req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});if(req.method!=='POST')return json(req,{error:'POSTのみ利用できます。'},405);
  try{
    const body=await req.json();const originLat=finite(body?.origin?.lat),originLng=finite(body?.origin?.lng);if(originLat===null||originLng===null)throw new Error('現在地が取得できません。');
    if(body?.action==='places'){const result=await searchPlaces({lat:originLat,lng:originLng},String(body?.category||''),Number(body?.radiusM||5000));return json(req,result);}
    if(!ORS_API_KEY)throw new Error('Supabase Secret「ORS_API_KEY」が未設定です。');
    if(body?.action==='recommend'){const result=await recommendCourses({lat:originLat,lng:originLng},Number(body?.minutes||60),String(body?.purpose||'leisure'));return json(req,result);}
    let destination:any;const dl=finite(body?.destination?.lat),dg=finite(body?.destination?.lng);if(dl!==null&&dg!==null)destination={lat:dl,lng:dg,label:String(body?.destination?.label||'地図で指定')};else{const text=String(body?.destination?.text||'').trim();if(!text)throw new Error('目的地を入力してください。');destination=await geocode(text)}
    const mode=['balanced','cycleway','hill'].includes(body?.mode)?body.mode:'balanced';const hillLevel=Math.min(3,Math.max(1,Math.round(Number(body?.hillLevel||2))));const beeline=haversine({lat:originLat,lng:originLng},destination);const useAlternatives=mode!=='balanced'&&beeline<65000;
    const requestBody:any={coordinates:[[originLng,originLat],[destination.lng,destination.lat]],elevation:true,instructions:true,instructions_format:'text',preference:'recommended',extra_info:['steepness','waytype','surface','suitability'],options:{avoid_features:['steps','ferries','fords']}};
    if(mode==='hill')requestBody.options.profile_params={weightings:{steepness_difficulty:hillLevel}};
    if(useAlternatives)requestBody.alternative_routes={target_count:3,share_factor:.72,weight_factor:1.9};
    const routeRes=await fetch('https://api.openrouteservice.org/v2/directions/cycling-road/geojson',{method:'POST',headers:{Authorization:ORS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(requestBody)});const routeJson=await routeRes.json().catch(()=>({}));
    if(!routeRes.ok){const detail=routeJson?.error?.message||routeJson?.error||`HTTP ${routeRes.status}`;throw new Error(`自転車ルートを計算できませんでした: ${detail}`)}
    const features=routeJson?.features||[];const selected=selectCandidate(features,mode);const m=selected.best.m;const fallbackNote=mode!=='balanced'&&!useAlternatives?'（長距離のため代替ルート比較なし）':'';
    return json(req,{destination,summary:{distanceM:Math.round(m.distanceM),durationS:Math.round(m.durationS),ascentM:Math.round(m.ascentM),descentM:Math.round(m.descentM),maxGrade:Number(m.maxGrade.toFixed(1)),cyclewayPct:Number(m.cyclewayPct.toFixed(1)),pavedPct:Number(m.pavedPct.toFixed(1))},route:m.route,elevationProfile:m.elevationProfile,climbs:m.climbs,maneuvers:m.maneuvers,selection:{mode,hillLevel,candidateCount:selected.candidates.length,reason:selected.reason+fallbackNote},calculatedAt:new Date().toISOString()});
  }catch(error){console.error(error);return json(req,{error:error instanceof Error?error.message:'ルート計算に失敗しました。'},500)}
});
