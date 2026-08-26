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
function metrics(feature:any){
  const props=feature?.properties||{}, summary=props.summary||{}, extras=props.extras||{};const wt=extra(extras,['waytypes','waytype']),sf=extra(extras,['surface','surfaces']),suit=extra(extras,['suitability']);
  const cyclewayPct=summaryAmount(wt,[6]);const pavedPct=summaryAmount(sf,[1,3,4,14]);const stateRoadPct=summaryAmount(wt,[1]);const suitabilityPct=summaryAmount(suit,[8,9,10]);const profile=makeProfiles(feature?.geometry?.coordinates||[]);
  return {distanceM:Number(summary.distance||0),durationS:Number(summary.duration||0),ascentM:Number(summary.ascent||0),descentM:Number(summary.descent||0),cyclewayPct,pavedPct,stateRoadPct,suitabilityPct,...profile};
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
    if(!ORS_API_KEY)throw new Error('Supabase Secret「ORS_API_KEY」が未設定です。');
    const body=await req.json();const originLat=finite(body?.origin?.lat),originLng=finite(body?.origin?.lng);if(originLat===null||originLng===null)throw new Error('現在地が取得できません。');
    let destination:any;const dl=finite(body?.destination?.lat),dg=finite(body?.destination?.lng);if(dl!==null&&dg!==null)destination={lat:dl,lng:dg,label:String(body?.destination?.label||'地図で指定')};else{const text=String(body?.destination?.text||'').trim();if(!text)throw new Error('目的地を入力してください。');destination=await geocode(text)}
    const mode=['balanced','cycleway','hill'].includes(body?.mode)?body.mode:'balanced';const hillLevel=Math.min(3,Math.max(1,Math.round(Number(body?.hillLevel||2))));const beeline=haversine({lat:originLat,lng:originLng},destination);const useAlternatives=mode!=='balanced'&&beeline<65000;
    const requestBody:any={coordinates:[[originLng,originLat],[destination.lng,destination.lat]],elevation:true,instructions:false,preference:'recommended',extra_info:['steepness','waytype','surface','suitability'],options:{avoid_features:['steps','ferries','fords']}};
    if(mode==='hill')requestBody.options.profile_params={weightings:{steepness_difficulty:hillLevel}};
    if(useAlternatives)requestBody.alternative_routes={target_count:3,share_factor:.72,weight_factor:1.9};
    const routeRes=await fetch('https://api.openrouteservice.org/v2/directions/cycling-road/geojson',{method:'POST',headers:{Authorization:ORS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(requestBody)});const routeJson=await routeRes.json().catch(()=>({}));
    if(!routeRes.ok){const detail=routeJson?.error?.message||routeJson?.error||`HTTP ${routeRes.status}`;throw new Error(`自転車ルートを計算できませんでした: ${detail}`)}
    const features=routeJson?.features||[];const selected=selectCandidate(features,mode);const m=selected.best.m;const fallbackNote=mode!=='balanced'&&!useAlternatives?'（長距離のため代替ルート比較なし）':'';
    return json(req,{destination,summary:{distanceM:Math.round(m.distanceM),durationS:Math.round(m.durationS),ascentM:Math.round(m.ascentM),descentM:Math.round(m.descentM),maxGrade:Number(m.maxGrade.toFixed(1)),cyclewayPct:Number(m.cyclewayPct.toFixed(1)),pavedPct:Number(m.pavedPct.toFixed(1))},route:m.route,elevationProfile:m.elevationProfile,climbs:m.climbs,selection:{mode,hillLevel,candidateCount:selected.candidates.length,reason:selected.reason+fallbackNote},calculatedAt:new Date().toISOString()});
  }catch(error){console.error(error);return json(req,{error:error instanceof Error?error.message:'ルート計算に失敗しました。'},500)}
});
