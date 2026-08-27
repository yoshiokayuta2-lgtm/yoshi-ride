(() => {
'use strict';

const CONFIG = {
  functionUrl: 'https://sxugznyvbojkfshevpcs.supabase.co/functions/v1/cycle-route',
  build: '1.4.0',
};

const $ = (id) => document.getElementById(id);
const els = {
  tabs:[...document.querySelectorAll('.tab')], views:{route:$('routeView'),ride:$('rideView'),log:$('logView')}, gpsBadge:$('gpsBadge'), installBtn:$('installBtn'),
  destination:$('destinationInput'), destinationHint:$('destinationHint'), locateBtn:$('locateBtn'), mapPickBtn:$('mapPickBtn'), homeStatus:$('homeStatus'), homeUseBtn:$('homeUseBtn'), homeCurrentBtn:$('homeCurrentBtn'), homeMapBtn:$('homeMapBtn'), homeClearBtn:$('homeClearBtn'), placeRadius:$('placeRadius'), placeCategories:[...document.querySelectorAll('.category-chip')], placeMessage:$('placeMessage'), placeResults:$('placeResults'), recommendMinutes:$('recommendMinutes'), recommendPurpose:[...document.querySelectorAll('.purpose-card')], recommendBtn:$('recommendBtn'), recommendMessage:$('recommendMessage'), recommendResults:$('recommendResults'), modeCards:[...document.querySelectorAll('.mode-card')], hillSettings:$('hillSettings'), hillLevel:$('hillLevel'), hillLevelLabel:$('hillLevelLabel'), routeBtn:$('routeBtn'), routeMessage:$('routeMessage'), routeResult:$('routeResult'),
  statDistance:$('statDistance'), statDuration:$('statDuration'), statAscent:$('statAscent'), statGrade:$('statGrade'), cyclewayPct:$('cyclewayPct'), pavedPct:$('pavedPct'), routeReason:$('routeReason'), routeTitle:$('routeTitle'), elevationChart:$('elevationChart'), climbsList:$('climbsList'), fitRouteBtn:$('fitRouteBtn'), useRouteBtn:$('useRouteBtn'),
  wakeBadge:$('wakeBadge'), rideStateTitle:$('rideStateTitle'), liveSpeed:$('liveSpeed'), liveDistance:$('liveDistance'), liveDuration:$('liveDuration'), liveAvgSpeed:$('liveAvgSpeed'), liveAscent:$('liveAscent'), liveMaxSpeed:$('liveMaxSpeed'), rideDestination:$('rideDestination'), rideRemaining:$('rideRemaining'), rideArrival:$('rideArrival'), rideRouteState:$('rideRouteState'), rideUpcomingGrade:$('rideUpcomingGrade'), rideNextClimb:$('rideNextClimb'), startRideBtn:$('startRideBtn'), pauseRideBtn:$('pauseRideBtn'), finishRideBtn:$('finishRideBtn'), centerRideBtn:$('centerRideBtn'), plannedRouteLabel:$('plannedRouteLabel'),
  sumRides:$('sumRides'), sumDistance:$('sumDistance'), sumAscent:$('sumAscent'), sumTime:$('sumTime'), exportAllBtn:$('exportAllBtn'), importAllInput:$('importAllInput'), ridesList:$('ridesList'), emptyLog:$('emptyLog'),
  modal:$('rideDetailModal'), modalTitle:$('modalTitle'), modalStats:$('modalStats'), exportGpxBtn:$('exportGpxBtn'), deleteRideBtn:$('deleteRideBtn'), toast:$('toast')
};

const state = {
  mode:'balanced', hillLevel:2, currentPosition:null, destinationPoint:null, mapPick:false, homePick:false, homePoint:null, routeData:null, plannedRoute:null, planProgress:null, recommendPurpose:'leisure', recommendations:[], selectedCategory:null, placeResults:[],
  installPrompt:null, routeMap:null, rideMap:null, historyMap:null, routeLayers:[], placeMarkers:null, rideTrackLayer:null, ridePlannedLayer:null, rideCurrentMarker:null, rideDestinationMarker:null, historyLayer:null,
  ride:{status:'ready',watchId:null,startTs:0,pauseStarted:0,pausedMs:0,points:[],distanceM:0,ascentM:0,maxSpeedKmh:0,lastAccepted:null,timer:null,wakeLock:null},
  modalRide:null,
};

function showToast(text){ els.toast.textContent=text; els.toast.classList.add('show'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>els.toast.classList.remove('show'),2600); }
function setMessage(text,type=''){ els.routeMessage.textContent=text||''; els.routeMessage.className='message'+(type?' '+type:''); }
function pad2(n){return String(n).padStart(2,'0')}
function fmtDuration(sec){ sec=Math.max(0,Math.round(sec)); const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60; return `${pad2(h)}:${pad2(m)}:${pad2(s)}`; }
function fmtEta(sec){ const m=Math.max(1,Math.round(sec/60)); if(m<60)return `${m}分`; const h=Math.floor(m/60),r=m%60;return r?`${h}時間${r}分`:`${h}時間`; }
function escapeHtml(s){ return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function haversine(a,b){const R=6371000, p1=a.lat*Math.PI/180,p2=b.lat*Math.PI/180,dp=(b.lat-a.lat)*Math.PI/180,dl=(b.lng-a.lng)*Math.PI/180;const x=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function bearing(a,b){const y=Math.sin((b.lng-a.lng)*Math.PI/180)*Math.cos(b.lat*Math.PI/180);const x=Math.cos(a.lat*Math.PI/180)*Math.sin(b.lat*Math.PI/180)-Math.sin(a.lat*Math.PI/180)*Math.cos(b.lat*Math.PI/180)*Math.cos((b.lng-a.lng)*Math.PI/180);return (Math.atan2(y,x)*180/Math.PI+360)%360;}

function switchTab(name){
  els.tabs.forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  Object.entries(els.views).forEach(([k,v])=>v.classList.toggle('active',k===name));
  if(name==='route'&&state.routeMap)setTimeout(()=>state.routeMap.invalidateSize(),60);
  if(name==='ride'){
    if(state.rideMap)setTimeout(()=>{state.rideMap.invalidateSize({animate:false});syncRideMapView();},120);
    if(state.ride.status==='ready')startPositionWatch();
    updatePlanNavigation(state.currentPosition);
  }else if(state.ride.status==='ready')stopPositionWatch();
  if(name==='log')renderRideLog();
}
els.tabs.forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.tab)));

function initMaps(){
  if(!window.L){setMessage('地図ライブラリを読み込めませんでした。ネット接続を確認してください。','error');return}
  const base=(map,preferCyclo=false)=>{
    const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'});
    const cyclo=L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',{maxZoom:20,attribution:'CyclOSM © OpenStreetMap contributors'});
    (preferCyclo?cyclo:osm).addTo(map); L.control.layers({'OSM':osm,'CyclOSM':cyclo},null,{position:'topright'}).addTo(map);
  };
  state.routeMap=L.map('routeMap',{zoomControl:true}).setView([35.423,136.76],10); base(state.routeMap,true);
  state.placeMarkers=L.layerGroup().addTo(state.routeMap);
  state.rideMap=L.map('rideMap',{zoomControl:true}).setView([35.423,136.76],11); base(state.rideMap);
  state.historyMap=L.map('historyMap',{zoomControl:true}).setView([35.423,136.76],11); base(state.historyMap);
  state.routeMap.on('click',e=>{
    if(state.homePick){saveHome({lat:e.latlng.lat,lng:e.latlng.lng});state.homePick=false;els.homeMapBtn.textContent='地図で登録';document.querySelector('.home-shortcut')?.classList.remove('picking');showToast('この地点を自宅に登録しました');return;}
    if(!state.mapPick)return;state.destinationPoint={lat:e.latlng.lat,lng:e.latlng.lng,label:'地図で指定'};els.destination.value='地図で指定';state.mapPick=false;els.mapPickBtn.classList.remove('active');els.mapPickBtn.textContent='地図で指定';els.destinationHint.textContent='地図上の目的地を設定しました。';els.destinationHint.classList.remove('active');clearPlaceSelection();drawDestinationMarker();
  });
}

let routeDestinationMarker=null, routeOriginMarker=null, homeMarker=null;
function drawDestinationMarker(){if(!state.routeMap||!state.destinationPoint)return;if(routeDestinationMarker)routeDestinationMarker.remove();routeDestinationMarker=L.circleMarker([state.destinationPoint.lat,state.destinationPoint.lng],{radius:8,weight:3,color:'#e54646',fillColor:'#fff',fillOpacity:1}).addTo(state.routeMap);}
function drawOriginMarker(){if(!state.routeMap||!state.currentPosition)return;if(routeOriginMarker)routeOriginMarker.remove();routeOriginMarker=L.circleMarker([state.currentPosition.lat,state.currentPosition.lng],{radius:8,weight:3,color:'#173b64',fillColor:'#fff',fillOpacity:1}).addTo(state.routeMap);}
function drawHomeMarker(){if(homeMarker){homeMarker.remove();homeMarker=null}if(!state.routeMap||!state.homePoint)return;homeMarker=L.circleMarker([state.homePoint.lat,state.homePoint.lng],{radius:7,weight:3,color:'#2f8e62',fillColor:'#fff',fillOpacity:1}).bindTooltip('自宅',{direction:'top'}).addTo(state.routeMap);}
const HOME_KEY='yoshiRideHomeV1', PLAN_KEY='yoshiRideActivePlanV1';
function updateHomeUI(){const ok=!!state.homePoint;els.homeUseBtn.disabled=!ok;els.homeClearBtn.hidden=!ok;els.homeStatus.textContent=ok?'登録済み ・ この端末だけに保存':'未登録 ・ 位置はこの端末だけに保存します';drawHomeMarker();}
function loadHome(){try{const raw=localStorage.getItem(HOME_KEY);if(!raw)return;const h=JSON.parse(raw);if(Number.isFinite(Number(h?.lat))&&Number.isFinite(Number(h?.lng)))state.homePoint={lat:Number(h.lat),lng:Number(h.lng),label:'自宅'};}catch{}updateHomeUI();}
function saveHome(point){state.homePoint={lat:Number(point.lat),lng:Number(point.lng),label:'自宅'};try{localStorage.setItem(HOME_KEY,JSON.stringify(state.homePoint))}catch{}updateHomeUI();}
function clearHome(){state.homePoint=null;try{localStorage.removeItem(HOME_KEY)}catch{}updateHomeUI();}

async function getCurrentPosition(show=true){
  if(!navigator.geolocation){throw new Error('この端末では位置情報を利用できません。')}
  if(show)els.gpsBadge.textContent='GPS …';
  return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(pos=>{
    const p={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy,altitude:pos.coords.altitude};state.currentPosition=p;els.gpsBadge.textContent=`GPS ±${Math.round(p.accuracy)}m`;els.gpsBadge.classList.add('ok');drawOriginMarker();if(state.routeMap&&!state.routeData)state.routeMap.setView([p.lat,p.lng],13);resolve(p);
  },err=>{els.gpsBadge.textContent='GPS OFF';els.gpsBadge.classList.remove('ok');reject(new Error(err.code===1?'位置情報の利用を許可してください。':'現在地を取得できませんでした。'));},{enableHighAccuracy:true,timeout:15000,maximumAge:4000}));
}

els.locateBtn.addEventListener('click',()=>getCurrentPosition().then(()=>{showToast('現在地を更新しました');if(state.selectedCategory)searchNearbyPlaces(state.selectedCategory)}).catch(e=>setMessage(e.message,'error')));
els.mapPickBtn.addEventListener('click',()=>{state.mapPick=!state.mapPick;els.mapPickBtn.classList.toggle('active',state.mapPick);els.mapPickBtn.textContent=state.mapPick?'地図をタップ':'地図で指定';els.destinationHint.textContent=state.mapPick?'地図上の行きたい地点をタップしてください。':'下の地図をタップして目的地を指定することもできます。';els.destinationHint.classList.toggle('active',state.mapPick);if(state.mapPick&&state.routeMap){state.routeMap.getContainer().scrollIntoView({behavior:'smooth',block:'center'});}});
els.destination.addEventListener('input',()=>{if(els.destination.value!=='地図で指定'){state.destinationPoint=null;clearPlaceSelection();}});
els.homeUseBtn.addEventListener('click',()=>{if(!state.homePoint)return;selectPlace({id:'home',name:'自宅',lat:state.homePoint.lat,lng:state.homePoint.lng});showToast('自宅を目的地に設定しました');});
els.homeCurrentBtn.addEventListener('click',async()=>{try{const p=await getCurrentPosition();saveHome(p);showToast('現在地を自宅に登録しました')}catch(e){setMessage(e.message,'error')}});
els.homeMapBtn.addEventListener('click',()=>{state.homePick=!state.homePick;state.mapPick=false;els.mapPickBtn.classList.remove('active');els.mapPickBtn.textContent='地図で指定';els.homeMapBtn.textContent=state.homePick?'地図をタップ':'地図で登録';document.querySelector('.home-shortcut')?.classList.toggle('picking',state.homePick);if(state.homePick&&state.routeMap)state.routeMap.getContainer().scrollIntoView({behavior:'smooth',block:'center'});});
els.homeClearBtn.addEventListener('click',()=>{if(confirm('この端末に登録した自宅を解除しますか？')){clearHome();showToast('自宅登録を解除しました')}});

function setPlaceMessage(text,type=''){els.placeMessage.textContent=text||'';els.placeMessage.className='place-message'+(type?' '+type:'');}
function clearPlaceSelection(){els.placeResults.querySelectorAll('.place-result.selected').forEach(x=>x.classList.remove('selected'));}
function clearPlaceMarkers(){if(state.placeMarkers)state.placeMarkers.clearLayers();}
function selectPlace(place){state.routeData=null;state.routeLayers.forEach(l=>l.remove());state.routeLayers=[];els.routeResult.hidden=true;els.routeTitle.textContent='地図から選ぶ';els.fitRouteBtn.textContent='現在地';state.destinationPoint={lat:Number(place.lat),lng:Number(place.lng),label:place.name};els.destination.value=place.name;state.mapPick=false;els.mapPickBtn.classList.remove('active');els.mapPickBtn.textContent='地図で指定';els.destinationHint.textContent=`${place.name} を目的地に設定しました。`;els.destinationHint.classList.remove('active');clearPlaceSelection();const card=els.placeResults.querySelector(`[data-place-id="${CSS.escape(String(place.id))}"]`);if(card)card.classList.add('selected');drawDestinationMarker();if(state.routeMap)state.routeMap.setView([place.lat,place.lng],15);}
function renderPlaces(places,categoryLabel){state.placeResults=places;els.placeResults.hidden=false;clearPlaceMarkers();if(!places.length){els.placeResults.innerHTML='<div class="place-empty">この範囲では候補が見つかりませんでした。検索範囲を広げてみてください。</div>';return;}els.placeResults.innerHTML=places.map(p=>`<button type="button" class="place-result" data-place-id="${escapeHtml(p.id)}"><span class="place-distance">${(Number(p.distanceM||0)/1000).toFixed(1)} km</span><span class="place-copy"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.address||categoryLabel||'')}</small></span><span class="place-arrow">›</span></button>`).join('');els.placeResults.querySelectorAll('.place-result').forEach(btn=>btn.addEventListener('click',()=>{const p=places.find(x=>String(x.id)===btn.dataset.placeId);if(p)selectPlace(p)}));
  const bounds=[];if(state.currentPosition)bounds.push([state.currentPosition.lat,state.currentPosition.lng]);for(const p of places.slice(0,30)){const marker=L.circleMarker([p.lat,p.lng],{radius:6,weight:2,color:'#3974af',fillColor:'#fff',fillOpacity:1}).bindTooltip(p.name,{direction:'top'});marker.on('click',()=>selectPlace(p));state.placeMarkers.addLayer(marker);bounds.push([p.lat,p.lng]);}if(state.routeMap&&bounds.length>1)state.routeMap.fitBounds(L.latLngBounds(bounds).pad(.08));}
async function searchNearbyPlaces(category){state.selectedCategory=category;els.placeCategories.forEach(b=>b.classList.toggle('active',b.dataset.category===category));setPlaceMessage('現在地周辺を検索中…');els.placeResults.hidden=true;try{const origin=state.currentPosition||await getCurrentPosition(false);const radiusM=Number(els.placeRadius.value||5000);const res=await fetch(CONFIG.functionUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'places',origin:{lat:origin.lat,lng:origin.lng},category,radiusM})});let data={};try{data=await res.json()}catch{}if(!res.ok)throw new Error(data.error||`周辺検索に失敗しました（HTTP ${res.status}）`);renderPlaces(data.places||[],data.categoryLabel||'');const count=(data.places||[]).length;const strategy=data.searchMeta?.strategy==='bbox'?'再検索済み':'';setPlaceMessage(`${data.categoryLabel||'周辺スポット'}：${count}件${strategy?'・'+strategy:''}`,count?'success':'');}catch(e){setPlaceMessage(e.message||'周辺検索に失敗しました。','error');els.placeResults.hidden=true;}}
els.placeCategories.forEach(btn=>btn.addEventListener('click',()=>searchNearbyPlaces(btn.dataset.category)));
els.placeRadius.addEventListener('change',()=>{if(state.selectedCategory)searchNearbyPlaces(state.selectedCategory)});

function setRecommendMessage(text,type=''){els.recommendMessage.textContent=text||'';els.recommendMessage.className='place-message'+(type?' '+type:'');}
els.recommendPurpose.forEach(card=>card.addEventListener('click',()=>{state.recommendPurpose=card.dataset.purpose;els.recommendPurpose.forEach(c=>{const active=c===card;c.classList.toggle('active',active);c.setAttribute('aria-checked',active?'true':'false')});}));
function renderRecommendations(items){state.recommendations=items||[];els.recommendResults.hidden=false;if(!items?.length){els.recommendResults.innerHTML='<div class="place-empty">おすすめ候補を作れませんでした。時間を変えて再試行してください。</div>';return;}els.recommendResults.innerHTML=items.map((r,i)=>`<button type="button" class="recommend-card" data-rec="${i}"><span class="recommend-rank">${i+1}</span><span class="recommend-copy"><strong>${escapeHtml(r.destination?.label||`候補 ${i+1}`)}</strong><small>${escapeHtml(r.selection?.reason||'おすすめ')} ・ ${(Number(r.summary?.distanceM||0)/1000).toFixed(1)}km / ${fmtEta(r.summary?.durationS||0)}</small></span><span class="recommend-metrics"><strong>${Math.round(r.summary?.ascentM||0)}m UP</strong><small>MAX ${Number(r.summary?.maxGrade||0).toFixed(1)}%</small></span></button>`).join('');els.recommendResults.querySelectorAll('.recommend-card').forEach(btn=>btn.addEventListener('click',()=>{const r=state.recommendations[Number(btn.dataset.rec)];if(!r)return;state.routeData=r;state.destinationPoint=r.destination;els.destination.value=r.destination?.label||'おすすめコース';renderRoute(r);setPlannedRoute(r,false);setMessage('おすすめコースを選択しました。RIDEにも反映済みです。','success');}));}
async function findRecommendations(){els.recommendBtn.disabled=true;els.recommendBtn.textContent='コースを比較中…';els.recommendResults.hidden=true;setRecommendMessage('周囲の方向を比較して、時間に近いルートを探しています…');try{const origin=state.currentPosition||await getCurrentPosition(false);const res=await fetch(CONFIG.functionUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'recommend',origin:{lat:origin.lat,lng:origin.lng},minutes:Number(els.recommendMinutes.value||60),purpose:state.recommendPurpose})});let data={};try{data=await res.json()}catch{}if(!res.ok)throw new Error(data.error||`おすすめ作成に失敗しました（HTTP ${res.status}）`);renderRecommendations(data.candidates||[]);setRecommendMessage(`${state.recommendPurpose==='training'?'トレーニング':'娯楽'}向け：${(data.candidates||[]).length}コース`,(data.candidates||[]).length?'success':'');}catch(e){setRecommendMessage(e.message||'おすすめコースを作れませんでした。','error');els.recommendResults.hidden=true;}finally{els.recommendBtn.disabled=false;els.recommendBtn.textContent='おすすめコースを作る';}}
els.recommendBtn.addEventListener('click',findRecommendations);

els.modeCards.forEach(card=>card.addEventListener('click',()=>{
  state.mode=card.dataset.mode;els.modeCards.forEach(c=>{const active=c===card;c.classList.toggle('active',active);c.setAttribute('aria-checked',active?'true':'false')});els.hillSettings.hidden=state.mode!=='hill';
}));
els.hillLevel.addEventListener('input',()=>{state.hillLevel=Number(els.hillLevel.value);els.hillLevelLabel.textContent=['','MODERATE','HARD','EXTREME'][state.hillLevel]});

async function calculateRoute(){
  setMessage('');els.routeBtn.disabled=true;els.routeBtn.textContent='ルートを計算中…';
  try{
    const origin=state.currentPosition||await getCurrentPosition(false);
    let destination;
    if(state.destinationPoint)destination={...state.destinationPoint};
    else {const text=els.destination.value.trim();if(!text)throw new Error('目的地を入力するか、地図で指定してください。');destination={text,label:text};}
    const res=await fetch(CONFIG.functionUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({origin:{lat:origin.lat,lng:origin.lng},destination,mode:state.mode,hillLevel:state.hillLevel})});
    let data={};try{data=await res.json()}catch{}
    if(!res.ok)throw new Error(data.error||`ルート計算に失敗しました（HTTP ${res.status}）`);
    state.routeData=data;state.destinationPoint=data.destination;els.destination.value=data.destination.label||els.destination.value;renderRoute(data);setPlannedRoute(data,false);setMessage('ルートを作成しました。RIDEにも反映済みです。','success');
  }catch(e){setMessage(e.message||'ルート計算に失敗しました。','error')}
  finally{els.routeBtn.disabled=false;els.routeBtn.textContent='この条件でルートを探す';}
}
els.routeBtn.addEventListener('click',calculateRoute);

function gradeColor(g){const a=Math.abs(g);if(a<1)return '#74889b';if(a<4)return '#3e8c6a';if(a<7)return '#d19b31';if(a<10)return '#d86542';return '#9a3c4d';}
function renderRoute(data){
  clearPlaceMarkers();els.fitRouteBtn.textContent='全体表示';els.routeResult.hidden=false;const s=data.summary||{};els.statDistance.textContent=((s.distanceM||0)/1000).toFixed(1);els.statDuration.textContent=fmtEta(s.durationS||0);els.statAscent.textContent=Math.round(s.ascentM||0);els.statGrade.textContent=(s.maxGrade||0).toFixed(1);els.cyclewayPct.textContent=`${Math.round(s.cyclewayPct||0)}%`;els.pavedPct.textContent=`${Math.round(s.pavedPct||0)}%`;els.routeReason.textContent=data.selection?.reason||'おすすめ';els.routeTitle.textContent=data.destination?.label?`→ ${data.destination.label}`:'ルート';
  drawRouteMap(data.route||[]);renderElevation(data.elevationProfile||[]);renderClimbs(data.climbs||[]);setTimeout(()=>els.routeResult.scrollIntoView({behavior:'smooth',block:'start'}),80);
}
function drawRouteMap(points){if(!state.routeMap||!points.length)return;state.routeLayers.forEach(l=>l.remove());state.routeLayers=[];if(routeDestinationMarker){routeDestinationMarker.remove();routeDestinationMarker=null}drawOriginMarker();
  const group=[];for(let i=0;i<points.length-1;i+=4){const chunk=points.slice(i,Math.min(points.length,i+5));if(chunk.length<2)continue;const a=chunk[0],b=chunk[chunk.length-1];const d=haversine(a,b);const g=d>2&&Number.isFinite(a.ele)&&Number.isFinite(b.ele)?((b.ele-a.ele)/d*100):0;const line=L.polyline(chunk.map(p=>[p.lat,p.lng]),{color:gradeColor(g),weight:6,opacity:.88,lineCap:'round'}).addTo(state.routeMap);state.routeLayers.push(line);group.push(...chunk.map(p=>[p.lat,p.lng]));}
  const last=points[points.length-1];state.destinationPoint={lat:last.lat,lng:last.lng,label:state.routeData?.destination?.label||'目的地'};drawDestinationMarker();const bounds=L.latLngBounds(points.map(p=>[p.lat,p.lng]));state.routeMap.fitBounds(bounds.pad(.08));}
els.fitRouteBtn.addEventListener('click',()=>{if(state.routeData?.route?.length){state.routeMap.fitBounds(L.latLngBounds(state.routeData.route.map(p=>[p.lat,p.lng])).pad(.08));return;}if(state.currentPosition)state.routeMap.setView([state.currentPosition.lat,state.currentPosition.lng],14);else getCurrentPosition().catch(e=>setMessage(e.message,'error'));});

function renderElevation(profile){
  if(!profile.length){els.elevationChart.innerHTML='<div class="no-climbs">標高データを取得できませんでした。</div>';return}
  const W=900,H=250,P={l:46,r:16,t:14,b:34};const maxX=Math.max(...profile.map(p=>p.km),1),minY=Math.min(...profile.map(p=>p.ele)),maxY=Math.max(...profile.map(p=>p.ele)),span=Math.max(30,maxY-minY);const y0=minY-span*.12,y1=maxY+span*.12;const x=v=>P.l+(v/maxX)*(W-P.l-P.r);const y=v=>P.t+(1-(v-y0)/(y1-y0))*(H-P.t-P.b);
  let path='';profile.forEach((p,i)=>path+=(i?'L':'M')+x(p.km).toFixed(1)+','+y(p.ele).toFixed(1));const area=path+`L${x(maxX)},${y(y0)}L${x(0)},${y(y0)}Z`;
  const ticks=[];for(let i=0;i<=4;i++){const km=maxX*i/4;ticks.push(`<line x1="${x(km)}" x2="${x(km)}" y1="${P.t}" y2="${H-P.b}" stroke="#e6ecef"/><text x="${x(km)}" y="${H-10}" text-anchor="middle" font-size="10" fill="#7e8e9c">${km.toFixed(maxX<20?1:0)} km</text>`)}for(let i=0;i<=3;i++){const v=y0+(y1-y0)*i/3;ticks.push(`<line x1="${P.l}" x2="${W-P.r}" y1="${y(v)}" y2="${y(v)}" stroke="#eef2f4"/><text x="${P.l-8}" y="${y(v)+3}" text-anchor="end" font-size="10" fill="#7e8e9c">${Math.round(v)}m</text>`)}
  els.elevationChart.innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="標高グラフ"><defs><linearGradient id="fillGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dfe8ef"/><stop offset="1" stop-color="#f7f9fa"/></linearGradient></defs>${ticks.join('')}<path d="${area}" fill="url(#fillGrad)"/><path d="${path}" fill="none" stroke="#193d65" stroke-width="3" stroke-linejoin="round"/></svg>`;
}
function renderClimbs(climbs){if(!climbs.length){els.climbsList.innerHTML='<div class="no-climbs">まとまった上り区間は検出されませんでした。</div>';return}els.climbsList.innerHTML=climbs.slice(0,8).map((c,i)=>`<div class="climb-item"><div class="climb-km"><strong>${c.startKm.toFixed(1)}</strong><span>km地点</span></div><div class="climb-main"><strong>CLIMB ${i+1} ・ ${(c.distanceKm).toFixed(1)} km</strong><small>獲得 ${Math.round(c.gainM)}m / 最大 ${(c.maxGrade).toFixed(1)}%</small></div><div class="climb-grade"><strong>${c.avgGrade.toFixed(1)}%</strong><small>平均斜度</small></div></div>`).join('');}

function preparePlanProgress(){const pts=state.plannedRoute?.route||[];if(pts.length<2){state.planProgress=null;return}const cum=[0];for(let i=1;i<pts.length;i++)cum[i]=cum[i-1]+haversine(pts[i-1],pts[i]);state.planProgress={cum,totalM:cum[cum.length-1],lastIndex:0};}
function persistPlannedRoute(){try{if(state.plannedRoute)localStorage.setItem(PLAN_KEY,JSON.stringify(state.plannedRoute));else localStorage.removeItem(PLAN_KEY)}catch{}}
function setPlannedRoute(data,goRide=false){state.plannedRoute=data||null;preparePlanProgress();persistPlannedRoute();els.plannedRouteLabel.textContent=data?`→ ${data.destination?.label||'目的地'}`:'フリーライド';els.rideDestination.textContent=data?.destination?.label||'フリーライド';drawPlannedRouteOnRideMap();updatePlanNavigation(state.currentPosition);if(goRide)switchTab('ride');}
function restorePlannedRoute(){try{const raw=localStorage.getItem(PLAN_KEY);if(!raw)return;const d=JSON.parse(raw);if(Array.isArray(d?.route)&&d.route.length>1)setPlannedRoute(d,false)}catch{}}
els.useRouteBtn.addEventListener('click',()=>{if(!state.routeData)return;setPlannedRoute(state.routeData,true);showToast('RIDEモードにルートをセットしました');});
function validRideRoutePoints(){return (state.plannedRoute?.route||[]).map(p=>({lat:Number(p?.lat),lng:Number(p?.lng),ele:Number(p?.ele)})).filter(p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180);}
function syncRideMapView(opts={}){
  if(!state.rideMap)return;
  const preferCurrent=!!opts.preferCurrent;
  const current=state.currentPosition&&Number.isFinite(Number(state.currentPosition.lat))&&Number.isFinite(Number(state.currentPosition.lng))?state.currentPosition:null;
  const pts=validRideRoutePoints();
  if(preferCurrent&&current){state.rideMap.setView([current.lat,current.lng],16,{animate:false});return;}
  const coords=pts.map(p=>[p.lat,p.lng]);
  if(current)coords.push([current.lat,current.lng]);
  if(coords.length>1){const bounds=L.latLngBounds(coords);if(bounds.isValid()){state.rideMap.fitBounds(bounds.pad(.08),{animate:false,maxZoom:15});return;}}
  if(current){state.rideMap.setView([current.lat,current.lng],15,{animate:false});return;}
  const dest=state.plannedRoute?.destination;
  if(Number.isFinite(Number(dest?.lat))&&Number.isFinite(Number(dest?.lng))){state.rideMap.setView([Number(dest.lat),Number(dest.lng)],14,{animate:false});return;}
  state.rideMap.setView([35.423,136.76],11,{animate:false});
}
function drawPlannedRouteOnRideMap(){
  if(!state.rideMap)return;
  if(state.ridePlannedLayer){state.ridePlannedLayer.remove();state.ridePlannedLayer=null}
  if(state.rideDestinationMarker){state.rideDestinationMarker.remove();state.rideDestinationMarker=null}
  const pts=validRideRoutePoints();
  if(pts.length>1)state.ridePlannedLayer=L.polyline(pts.map(p=>[p.lat,p.lng]),{color:'#7fa0bd',weight:6,opacity:.82,lineCap:'round'}).addTo(state.rideMap);
  const dest=state.plannedRoute?.destination||pts[pts.length-1];
  if(Number.isFinite(Number(dest?.lat))&&Number.isFinite(Number(dest?.lng)))state.rideDestinationMarker=L.circleMarker([Number(dest.lat),Number(dest.lng)],{radius:7,weight:3,color:'#e54646',fillColor:'#fff',fillOpacity:1}).bindTooltip(state.plannedRoute?.destination?.label||'目的地',{direction:'top'}).addTo(state.rideMap);
  if(document.getElementById('rideView')?.classList.contains('active'))setTimeout(()=>{state.rideMap.invalidateSize({animate:false});syncRideMapView();},80);
}
function clockTimeFromNow(seconds){const d=new Date(Date.now()+Math.max(0,seconds)*1000);return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;}
function updatePlanNavigation(p){const plan=state.plannedRoute,prog=state.planProgress;if(!plan||!prog||!p){els.rideDestination.textContent=plan?.destination?.label||'フリーライド';els.rideRemaining.textContent='-- km';els.rideArrival.textContent='--:--';els.rideRouteState.textContent=plan?'GPS待機中':'ルート未設定';els.rideRouteState.classList.remove('offroute');els.rideUpcomingGrade.textContent='-- %';els.rideNextClimb.textContent='ルートを設定すると表示します';return;}const pts=plan.route||[];let bestI=0,bestD=Infinity;const last=prog.lastIndex||0;const lo=Math.max(0,last-120),hi=Math.min(pts.length,last+260);for(let i=lo;i<hi;i++){const d=haversine(p,pts[i]);if(d<bestD){bestD=d;bestI=i}}if(bestD>800){for(let i=0;i<pts.length;i+=4){const d=haversine(p,pts[i]);if(d<bestD){bestD=d;bestI=i}}}prog.lastIndex=bestI;const progressM=prog.cum[bestI]||0,remainingM=Math.max(0,prog.totalM-progressM);els.rideDestination.textContent=plan.destination?.label||'目的地';els.rideRemaining.textContent=`${(remainingM/1000).toFixed(1)} km`;let speedMps=0;if(state.ride.status!=='ready'){const elapsed=currentElapsed();if(elapsed>60&&state.ride.distanceM>300)speedMps=state.ride.distanceM/elapsed;}let remainS=speedMps>2?remainingM/speedMps:Number(plan.summary?.durationS||0)*(remainingM/Math.max(1,prog.totalM));els.rideArrival.textContent=clockTimeFromNow(remainS);const off=bestD>140;els.rideRouteState.textContent=off?`ルートから約 ${Math.round(bestD)}m 離れています`:`ROUTE ON ・ ${Math.round(progressM/100)/10}km地点`;els.rideRouteState.classList.toggle('offroute',off);let ahead=bestI;while(ahead<pts.length-1&&(prog.cum[ahead]-progressM)<150)ahead++;const a=pts[bestI],b=pts[ahead];const dist=Math.max(1,(prog.cum[ahead]||progressM)-progressM);const grade=Number.isFinite(a?.ele)&&Number.isFinite(b?.ele)?((b.ele-a.ele)/dist*100):0;els.rideUpcomingGrade.textContent=`${grade.toFixed(1)} %`;const climbs=plan.climbs||[];const next=climbs.filter(c=>Number(c.endKm)*1000>=progressM).sort((x,y)=>Number(x.startKm)-Number(y.startKm))[0];if(next){const toStart=Math.max(0,Number(next.startKm)*1000-progressM);els.rideNextClimb.textContent=toStart<150?`${Number(next.distanceKm).toFixed(1)}km / 平均 ${Number(next.avgGrade).toFixed(1)}% / MAX ${Number(next.maxGrade).toFixed(1)}%`:`${(toStart/1000).toFixed(1)}km先 ・ ${Number(next.distanceKm).toFixed(1)}km / 平均 ${Number(next.avgGrade).toFixed(1)}%`;}else els.rideNextClimb.textContent='この先にまとまった上りはありません';}

async function acquireWakeLock(){try{if('wakeLock'in navigator){state.ride.wakeLock=await navigator.wakeLock.request('screen');els.wakeBadge.textContent='画面常時ON';els.wakeBadge.classList.add('on');state.ride.wakeLock.addEventListener('release',()=>{els.wakeBadge.textContent='画面常時ON --';els.wakeBadge.classList.remove('on')});}else{els.wakeBadge.textContent='常時ON非対応'}}catch{els.wakeBadge.textContent='画面常時ON失敗'}}
async function releaseWakeLock(){try{await state.ride.wakeLock?.release()}catch{}state.ride.wakeLock=null;}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&state.ride.status==='recording')acquireWakeLock()});

function startPositionWatch(){
  if(state.ride.watchId!==null)navigator.geolocation.clearWatch(state.ride.watchId);
  state.ride.watchId=navigator.geolocation.watchPosition(onRidePosition,err=>showToast(err.code===1?'位置情報を許可してください':'GPSを取得できません'),{enableHighAccuracy:true,timeout:15000,maximumAge:1000});
}
function stopPositionWatch(){if(state.ride.watchId!==null){navigator.geolocation.clearWatch(state.ride.watchId);state.ride.watchId=null}}
function onRidePosition(pos){
  const c=pos.coords;const p={lat:c.latitude,lng:c.longitude,accuracy:c.accuracy,alt:Number.isFinite(c.altitude)?c.altitude:null,speed:Number.isFinite(c.speed)?c.speed:null,ts:pos.timestamp};state.currentPosition={lat:p.lat,lng:p.lng,accuracy:p.accuracy,altitude:p.alt};els.gpsBadge.textContent=`GPS ±${Math.round(p.accuracy)}m`;els.gpsBadge.classList.add('ok');
  if(state.rideMap){if(state.rideCurrentMarker)state.rideCurrentMarker.setLatLng([p.lat,p.lng]);else state.rideCurrentMarker=L.circleMarker([p.lat,p.lng],{radius:8,color:'#102f53',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(state.rideMap)}
  updatePlanNavigation(p);if(state.ride.status!=='recording'){if(Number.isFinite(p.speed)&&p.speed>=0)els.liveSpeed.textContent=Math.min(p.speed*3.6,99.9).toFixed(1);return;}if(p.accuracy>90)return;const last=state.ride.lastAccepted;if(last){const d=haversine(last,p),dt=(p.ts-last.ts)/1000;const calcSpeed=dt>0?d/dt:0;if(calcSpeed>25)return;if(d<2&&dt<5)return;state.ride.distanceM+=d;let kmh=Number.isFinite(p.speed)&&p.speed>=0?p.speed*3.6:calcSpeed*3.6;if(kmh<80)state.ride.maxSpeedKmh=Math.max(state.ride.maxSpeedKmh,kmh);if(Number.isFinite(last.alt)&&Number.isFinite(p.alt)){const rise=p.alt-last.alt;if(rise>2&&rise<25)state.ride.ascentM+=rise;}}
  state.ride.points.push(p);state.ride.lastAccepted=p;updateLiveRide(p);drawLiveTrack();
}
function updateLiveRide(p){const last=state.ride.points.length>1?state.ride.points[state.ride.points.length-2]:null;let kmh=0;if(Number.isFinite(p.speed)&&p.speed>=0)kmh=p.speed*3.6;else if(last){const dt=(p.ts-last.ts)/1000;if(dt>0)kmh=haversine(last,p)/dt*3.6}const elapsed=currentElapsed();const avg=elapsed>0?state.ride.distanceM/1000/(elapsed/3600):0;els.liveSpeed.textContent=Math.min(kmh,99.9).toFixed(1);els.liveDistance.textContent=`${(state.ride.distanceM/1000).toFixed(2)} km`;els.liveAvgSpeed.textContent=`${Math.min(avg,99.9).toFixed(1)} km/h`;els.liveAscent.textContent=`${Math.round(state.ride.ascentM)} m`;els.liveMaxSpeed.textContent=`${state.ride.maxSpeedKmh.toFixed(1)} km/h`;updatePlanNavigation(p);}
function drawLiveTrack(){if(!state.rideMap)return;const pts=state.ride.points;if(state.rideTrackLayer)state.rideTrackLayer.remove();if(pts.length>1)state.rideTrackLayer=L.polyline(pts.map(p=>[p.lat,p.lng]),{color:'#e24444',weight:6,opacity:.9}).addTo(state.rideMap);}
function currentElapsed(){if(!state.ride.startTs)return 0;const now=state.ride.status==='paused'?state.ride.pauseStarted:Date.now();return Math.max(0,(now-state.ride.startTs-state.ride.pausedMs)/1000)}
function tickRide(){els.liveDuration.textContent=fmtDuration(currentElapsed());if(state.currentPosition)updatePlanNavigation(state.currentPosition)}
function resetRideState(){stopPositionWatch();clearInterval(state.ride.timer);releaseWakeLock();state.ride={status:'ready',watchId:null,startTs:0,pauseStarted:0,pausedMs:0,points:[],distanceM:0,ascentM:0,maxSpeedKmh:0,lastAccepted:null,timer:null,wakeLock:null};els.liveSpeed.textContent='0.0';els.liveDistance.textContent='0.00 km';els.liveDuration.textContent='00:00:00';els.liveAvgSpeed.textContent='0.0 km/h';els.liveAscent.textContent='0 m';els.liveMaxSpeed.textContent='0.0 km/h';els.rideStateTitle.textContent='READY';els.startRideBtn.textContent='START';els.startRideBtn.disabled=false;els.pauseRideBtn.disabled=true;els.pauseRideBtn.textContent='PAUSE';els.finishRideBtn.disabled=true;if(state.rideTrackLayer){state.rideTrackLayer.remove();state.rideTrackLayer=null}updatePlanNavigation(state.currentPosition)}

els.startRideBtn.addEventListener('click',async()=>{
  if(state.ride.status==='paused'){state.ride.pausedMs+=Date.now()-state.ride.pauseStarted;state.ride.pauseStarted=0;state.ride.status='recording';els.rideStateTitle.textContent='RIDING';els.startRideBtn.disabled=true;els.pauseRideBtn.disabled=false;els.pauseRideBtn.textContent='PAUSE';startPositionWatch();acquireWakeLock();return}
  if(state.ride.status!=='ready')return;
  try{await getCurrentPosition(false)}catch(e){showToast(e.message);return}
  state.ride.status='recording';state.ride.startTs=Date.now();state.ride.points=[];state.ride.distanceM=0;state.ride.ascentM=0;state.ride.maxSpeedKmh=0;state.ride.lastAccepted=null;els.rideStateTitle.textContent='RIDING';els.startRideBtn.disabled=true;els.pauseRideBtn.disabled=false;els.finishRideBtn.disabled=false;state.ride.timer=setInterval(tickRide,1000);tickRide();startPositionWatch();acquireWakeLock();if(state.rideMap){state.rideMap.invalidateSize({animate:false});syncRideMapView({preferCurrent:true});}showToast('走行記録を開始しました');
});
els.pauseRideBtn.addEventListener('click',()=>{if(state.ride.status!=='recording')return;state.ride.status='paused';state.ride.pauseStarted=Date.now();stopPositionWatch();releaseWakeLock();els.rideStateTitle.textContent='PAUSED';els.startRideBtn.disabled=false;els.startRideBtn.textContent='RESUME';els.pauseRideBtn.disabled=true;showToast('一時停止しました');});
els.finishRideBtn.addEventListener('click',async()=>{if(!['recording','paused'].includes(state.ride.status))return;if(!confirm('走行を終了して記録を保存しますか？'))return;const elapsed=currentElapsed();stopPositionWatch();clearInterval(state.ride.timer);await releaseWakeLock();const ride={id:`ride_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,startedAt:new Date(state.ride.startTs).toISOString(),endedAt:new Date().toISOString(),durationS:Math.round(elapsed),distanceM:Math.round(state.ride.distanceM),ascentM:Math.round(state.ride.ascentM),maxSpeedKmh:Number(state.ride.maxSpeedKmh.toFixed(1)),avgSpeedKmh:elapsed>0?Number((state.ride.distanceM/1000/(elapsed/3600)).toFixed(1)):0,points:state.ride.points,plannedDestination:state.plannedRoute?.destination?.label||null,plannedMode:state.plannedRoute?.selection?.mode||null};await RideDB.put(ride);resetRideState();setPlannedRoute(null,false);showToast('走行記録を保存しました');switchTab('log');});
els.centerRideBtn.addEventListener('click',()=>{if(state.rideMap){state.rideMap.invalidateSize({animate:false});syncRideMapView({preferCurrent:true});}});

const RideDB={
  db:null,
  async open(){if(this.db)return this.db;this.db=await new Promise((resolve,reject)=>{const req=indexedDB.open('yoshiRideDB',1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('rides'))db.createObjectStore('rides',{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return this.db},
  async all(){const db=await this.open();return new Promise((resolve,reject)=>{const req=db.transaction('rides','readonly').objectStore('rides').getAll();req.onsuccess=()=>resolve(req.result.sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt)));req.onerror=()=>reject(req.error)})},
  async put(r){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('rides','readwrite');tx.objectStore('rides').put(r);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})},
  async delete(id){const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('rides','readwrite');tx.objectStore('rides').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
};

async function renderRideLog(){const rides=await RideDB.all();els.emptyLog.hidden=rides.length>0;els.sumRides.textContent=rides.length;els.sumDistance.textContent=`${(rides.reduce((s,r)=>s+(r.distanceM||0),0)/1000).toFixed(0)} km`;els.sumAscent.textContent=`${Math.round(rides.reduce((s,r)=>s+(r.ascentM||0),0))} m`;els.sumTime.textContent=`${(rides.reduce((s,r)=>s+(r.durationS||0),0)/3600).toFixed(1)} h`;els.ridesList.innerHTML=rides.map(r=>{const d=new Date(r.startedAt);return `<article class="ride-card" data-id="${r.id}" tabindex="0"><div class="ride-date"><strong>${d.getDate()}</strong><span>${d.getFullYear()}.${pad2(d.getMonth()+1)}</span></div><div class="ride-info"><strong>${(r.distanceM/1000).toFixed(1)} km ・ ${Math.round(r.ascentM||0)}m UP</strong><small>${fmtDuration(r.durationS)} / AVG ${Number(r.avgSpeedKmh||0).toFixed(1)} km/h${r.plannedDestination?` / → ${escapeHtml(r.plannedDestination)}`:''}</small></div><span class="ride-arrow">›</span></article>`}).join('');[...els.ridesList.querySelectorAll('.ride-card')].forEach(card=>{const open=()=>openRideDetail(card.dataset.id);card.addEventListener('click',open);card.addEventListener('keydown',e=>{if(e.key==='Enter')open()})});}
async function openRideDetail(id){const rides=await RideDB.all();const r=rides.find(x=>x.id===id);if(!r)return;state.modalRide=r;const d=new Date(r.startedAt);els.modalTitle.textContent=`${d.getFullYear()}.${pad2(d.getMonth()+1)}.${pad2(d.getDate())} RIDE`;els.modalStats.innerHTML=`<div><span>距離</span><strong>${(r.distanceM/1000).toFixed(1)} km</strong></div><div><span>時間</span><strong>${fmtDuration(r.durationS)}</strong></div><div><span>獲得標高</span><strong>${Math.round(r.ascentM||0)} m</strong></div><div><span>平均速度</span><strong>${Number(r.avgSpeedKmh||0).toFixed(1)} km/h</strong></div>`;els.modal.hidden=false;setTimeout(()=>{state.historyMap.invalidateSize();if(state.historyLayer){state.historyLayer.remove();state.historyLayer=null}if(r.points?.length>1){state.historyLayer=L.polyline(r.points.map(p=>[p.lat,p.lng]),{color:'#e24444',weight:6,opacity:.9}).addTo(state.historyMap);state.historyMap.fitBounds(state.historyLayer.getBounds().pad(.08))}},80);}
document.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',()=>{els.modal.hidden=true;state.modalRide=null}));
els.deleteRideBtn.addEventListener('click',async()=>{if(!state.modalRide)return;if(!confirm('この走行記録を削除しますか？'))return;await RideDB.delete(state.modalRide.id);els.modal.hidden=true;state.modalRide=null;renderRideLog();showToast('記録を削除しました')});
function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}
els.exportGpxBtn.addEventListener('click',()=>{const r=state.modalRide;if(!r)return;const pts=(r.points||[]).map(p=>`<trkpt lat="${p.lat}" lon="${p.lng}">${Number.isFinite(p.alt)?`<ele>${p.alt.toFixed(1)}</ele>`:''}<time>${new Date(p.ts).toISOString()}</time></trkpt>`).join('');const xml=`<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="YOSHI RIDE" xmlns="http://www.topografix.com/GPX/1/1"><metadata><time>${r.startedAt}</time></metadata><trk><name>YOSHI RIDE ${r.startedAt.slice(0,10)}</name><trkseg>${pts}</trkseg></trk></gpx>`;downloadBlob(new Blob([xml],{type:'application/gpx+xml'}),`yoshi-ride-${r.startedAt.slice(0,10)}.gpx`)});
els.exportAllBtn.addEventListener('click',async()=>{const rides=await RideDB.all();downloadBlob(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),rides},null,2)],{type:'application/json'}),`yoshi-ride-backup-${new Date().toISOString().slice(0,10)}.json`)});
els.importAllInput.addEventListener('change',async()=>{const f=els.importAllInput.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.rides))throw new Error('形式が違います');for(const r of data.rides)if(r?.id&&Array.isArray(r.points))await RideDB.put(r);showToast(`${data.rides.length}件を復元しました`);renderRideLog()}catch(e){showToast(`復元失敗: ${e.message}`)}finally{els.importAllInput.value=''}});

window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.installPrompt=e;els.installBtn.hidden=false});els.installBtn.addEventListener('click',async()=>{if(!state.installPrompt)return;state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;els.installBtn.hidden=true});

async function registerSW(){if('serviceWorker'in navigator)try{await navigator.serviceWorker.register('./service-worker.js?v=140')}catch{}}

async function boot(){initMaps();loadHome();restorePlannedRoute();registerSW();RideDB.open().catch(()=>{});renderRideLog();getCurrentPosition(false).then(()=>{drawHomeMarker();updatePlanNavigation(state.currentPosition)}).catch(()=>{});console.info(`YOSHI RIDE v${CONFIG.build}`)}
boot();
})();
