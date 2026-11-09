// Self-contained presentation mode. No API server, database, guest session or credentials.
const colors = ['#D9A7C7','#8C7BA8'];
export const demoMoods = [
  {id:1,name:'Calm',emoji:'🌿',color:'#78A99A',description:'Soft, unhurried sounds'},
  {id:2,name:'Happy',emoji:'☀️',color:'#E9B95D',description:'Bright and uplifting'},
  {id:3,name:'Sad',emoji:'🌧️',color:'#7D91B8',description:'Gentle and reflective'},
  {id:4,name:'Romantic',emoji:'♡',color:'#D98BA7',description:'Warm and intimate'},
  {id:5,name:'Energetic',emoji:'⚡',color:'#E58B58',description:'Bold, high-energy sounds'},
  {id:6,name:'Focused',emoji:'◉',color:'#8C9DB8',description:'Steady sounds for focus'},
  {id:7,name:'Nostalgic',emoji:'✦',color:'#B49ACB',description:'A familiar, wistful feeling'},
  {id:8,name:'Dreamy',emoji:'☾',color:'#9D8BC7',description:'Airy and atmospheric'},
];
const names = [
  ['Afterglow','Mira Vale','Calm',82,86],['Paper Skies','Aarav Sen','Dreamy',74,92],
  ['City Lights','The Northbound','Energetic',91,65],['Blue Hour','Nila','Sad',35,88],
  ['Golden Days','Mira Vale','Happy',94,78],['Soft Landing','Aarav Sen','Focused',48,72],
  ['Little Forever','Nila','Romantic',63,95],['Old Photographs','The Northbound','Nostalgic',42,89],
  ['Open Roads','Mira Vale','Energetic',88,54],['Quiet Rooms','Aarav Sen','Calm',28,97],
  ['Somewhere Soon','Nila','Dreamy',67,84],['New Morning','The Northbound','Happy',96,70],
];
export const demoSongs = names.map((n,i)=>({
  id:i+1,title:n[0],durationSec:176+i*13,artist:{id:i%4+1,name:n[1]},
  album:{id:i+1,title:'LOOP Sessions'},cover:colors,coverColor1:colors[0],coverColor2:colors[1],
  playback:{playable:true,type:'GENERATED_SKETCH',source:'MUSE_SKETCH',demo:true},
  moods:[{id:demoMoods.find(m=>m.name===n[2]).id,name:n[2],color:demoMoods.find(m=>m.name===n[2]).color}],
  reasons:[{text:'Matches your selected mood'}],liked:false,myRating:null,
}));
export const demoGenres = ['Indie Pop','Ambient','Alternative','Electronic','Acoustic','Film Score','R&B','Lo-fi'].map((name,i)=>({id:i+1,name,color:['#C99AB2','#9A9ACB','#D2A46F'][i%3],songs:18+i*7,plays:900-i*53}));
export const demoContexts = [
  {code:'STUDY',name:'Study',emoji:'📚'},{code:'WORKOUT',name:'Workout',emoji:'⚡'},
  {code:'RELAX',name:'Relax',emoji:'🌿'},{code:'NIGHT',name:'Late night',emoji:'☾'},
  {code:'TRAVEL',name:'Road trip',emoji:'↗'},
];
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem('loop.demo.'+k))??d}catch{return d}};
const write=(k,v)=>{try{localStorage.setItem('loop.demo.'+k,JSON.stringify(v))}catch{}};
let playId=1;
const all=()=>demoSongs.map(s=>({...s,liked:read('likes',[]).includes(s.id)}));
const result=(songs=all())=>({songs,batchId:1,title:'Made for this moment',subtitle:'A little mix, just for you'});
export function demoRequest(method,path,body){
  const p=path.split('?')[0], q=new URLSearchParams(path.split('?')[1]||'');
  const user={id:1,username:'demo',displayName:'Demo Listener',email:'demo@loop.local',roleName:'Listener',role:'LISTENER',permissions:[],incognito:false,regionCode:'IN'};
  if(p==='/auth/session'||p==='/auth/me')return Promise.resolve({authenticated:true,...user,session:{id:'demo-session',expiresAt:null}});
  if(p==='/auth/logout'||p==='/auth/logout-all')return Promise.resolve({ok:true});
  if(p==='/moods')return Promise.resolve(demoMoods);
  if(p==='/genres')return Promise.resolve(demoGenres);
  if(p==='/contexts')return Promise.resolve(demoContexts);
  if(p==='/languages')return Promise.resolve([{id:1,name:'Telugu',code:'te'},{id:2,name:'Hindi',code:'hi'},{id:3,name:'English',code:'en'}]);
  if(p==='/regions')return Promise.resolve([{code:'IN',name:'India'}]);
  if(p==='/songs'||p==='/trending')return Promise.resolve(result(all()));
  if(p==='/recommendations/daily'||p==='/recommendations/discovery'||p==='/recommendations/regional'||p==='/recommendations/recovery'||p==='/recommendations/similar')return Promise.resolve(result(all().slice(0,8)));
  if(p==='/recommendations/mood'){
    const chosen=(body?.moodIds||[]).map(id=>demoMoods.find(m=>m.id===id)).filter(Boolean);
    const term=(body?.text||'').toLowerCase();
    const picks=all().filter(s=>!chosen.length&&!term||chosen.some(m=>s.moods.some(x=>x.id===m.id))||s.title.toLowerCase().includes(term)||s.moods[0].name.toLowerCase().includes(term));
    const moods=chosen.length?chosen:[demoMoods.find(m=>m.name==='Calm')];
    return Promise.resolve({...result(picks.length?picks:all().slice(0,5)),interpretation:{moods:moods.map(m=>({...m,confidence:0.9})),summary:'A sound shaped around your mood'},explanation:'Demo recommendations based on the selected mood.'});
  }
  if(p==='/recommendations/parse')return Promise.resolve({moods:[demoMoods[0]],confidence:0.8});
  if(p==='/worlds/current')return Promise.resolve({world:{id:1,title:'Your quiet corner',description:'A changing little world of sounds picked for you.',theme:'calm',songCount:12},songs:all().slice(0,6)});
  if(p==='/history')return Promise.resolve(read('history',[]));
  if(p==='/likes')return Promise.resolve(all().filter(s=>s.liked));
  if(p==='/me/dismissals'||p==='/me/sessions')return Promise.resolve([]);
  if(p==='/me/onboarding')return Promise.resolve({languages:[{id:1,name:'Telugu'}],genres:demoGenres,moods:demoMoods});
  if(p==='/playlists'&&method==='POST'){const lists=read('playlists',[]),item={id:Date.now(),name:body.name,songCount:0,kind:'MANUAL',covers:[],songs:[],totalDurationSec:0};write('playlists',[item,...lists]);return Promise.resolve(item);}
  if(p==='/playlists')return Promise.resolve(read('playlists',[]));
  if(p==='/playlists/smart')return Promise.resolve(['ENERGY_BOOST','CALM_MIX','LATE_NIGHT','STUDY','ROAD_TRIP','MOST_REPLAYED','DISCOVERY','REGIONAL'].map(type=>({type,name:type.replaceAll('_',' ').toLowerCase(),blurb:'A demo mix built around your listening'})));
  if(p.startsWith('/playlists/smart/'))return Promise.resolve(result(all().slice(0,6)));
  if(p==='/playback/start')return Promise.resolve({playId:playId++,private:false,isReplay:false,media:{demo:true,label:'Demo sketch',type:'GENERATED_SKETCH'}});
  if(p.startsWith('/playback/')||p==='/playback/private')return Promise.resolve({ok:true,private:false});
  if(p==='/insights/profile')return Promise.resolve({days:30,totalPlays:18,totalMinutes:52,topMoods:demoMoods.slice(0,3),activity:[]});
  if(p==='/insights/activity')return Promise.resolve([]);
  if(p==='/insights/journey')return Promise.resolve([]);
  if(p==='/insights/preferences')return Promise.resolve({signals:[],summary:'Your demo listening profile'});
  if(p==='/incognito')return Promise.resolve({active:false});
  if(p==='/search') {const term=(q.get('q')||'').toLowerCase();return Promise.resolve({songs:all().filter(s=>(s.title+' '+s.artist.name+' '+s.moods[0].name).toLowerCase().includes(term))});}
  if(/^\/songs\/\d+$/.test(p))return Promise.resolve(all().find(s=>s.id===Number(p.split('/').pop()))||all()[0]);
  if(/^\/songs\/\d+\/(like|rating)$/.test(p)){
    const id=Number(p.split('/')[2]);if(p.endsWith('/like'))write('likes',body?.liked?[...new Set([...read('likes',[]),id])]:read('likes',[]).filter(x=>x!==id));return Promise.resolve({ok:true});
  }
  if(/^\/playlists\/\d+$/.test(p)){const id=Number(p.split('/')[2]);const item=read('playlists',[]).find(x=>x.id===id);return Promise.resolve(item||{id,name:'Demo playlist',kind:'MANUAL',songCount:0,songs:[],totalDurationSec:0});}
  if(/^\/playlists\/\d+\/songs$/.test(p))return Promise.resolve({ok:true});
  if(p==='/worlds/current/regenerate'||p==='/worlds/current/rollback')return Promise.resolve({ok:true,world:{id:1,title:'Your quiet corner',theme:'calm',description:'Your demo world'}});
  if(p.startsWith('/admin/'))return Promise.resolve({});
  return Promise.resolve({});
}
