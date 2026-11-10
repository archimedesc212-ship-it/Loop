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
export const demoSongs = names.map((n, i) => {
  const mood = demoMoods.find((item) => item.name === n[2]) || demoMoods[0];
  return {
    id: i + 1,
    title: n[0],
    durationSec: 176 + i * 13,
    releaseYear: 2024,
    explicit: false,
    artist: { id: i % 4 + 1, name: n[1] },
    album: { id: i + 1, title: 'LOOP Sessions' },
    language: { id: 1, name: 'Telugu' },
    genre: { id: 1, name: 'Indie Pop', color: '#C99AB2' },
    cover: colors,
    coverColor1: colors[0],
    coverColor2: colors[1],
    playback: { playable: true, type: 'GENERATED_SKETCH', source: 'MUSE_SKETCH', demo: true },
    moods: [mood.name],
    moodsDetailed: [{ id: mood.id, name: mood.name, emoji: mood.emoji, color: mood.color, confidence: 0.9 }],
    credits: [],
    genres: [{ id: 1, name: 'Indie Pop', color: '#C99AB2' }],
    reasons: [{ text: 'Matches your selected mood' }],
    liked: false,
    myRating: null,
  };
});
export const demoGenres = ['Indie Pop','Ambient','Alternative','Electronic','Acoustic','Film Score','R&B','Lo-fi'].map((name,i)=>({id:i+1,name,color:['#C99AB2','#9A9ACB','#D2A46F'][i%3],songs:18+i*7,plays:900-i*53}));
export const demoContexts = [
  {code:'STUDY',name:'Study',emoji:'📚'},{code:'WORKOUT',name:'Workout',emoji:'⚡'},
  {code:'RELAX',name:'Relax',emoji:'🌿'},{code:'NIGHT',name:'Late night',emoji:'☾'},
  {code:'TRAVEL',name:'Road trip',emoji:'↗'},
];
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem('loop.demo.'+k))??d}catch{return d}};
const write=(k,v)=>{try{localStorage.setItem('loop.demo.'+k,JSON.stringify(v))}catch{/* demo persistence is optional */}};
let playId=1;
const all=()=>demoSongs.map(s=>({...s,liked:read('likes',[]).includes(s.id)}));
const result=(songs=all())=>({songs,batchId:1,title:'Made for this moment',subtitle:'A little mix, just for you'});

const withSongDetails = (song) => ({
  ...song,
  features: { energy: 0.62, valence: 0.58, danceability: 0.54, acousticness: 0.42, instrumentalness: 0.18, speechiness: 0.04, tempo: 112, keyName: 'C major', loudness: -8, analysisVersion: 'demo-1' },
  stats: null,
  credits: Array.isArray(song.credits) ? song.credits : [],
  genres: Array.isArray(song.genres) ? song.genres : [],
  moodsDetailed: Array.isArray(song.moodsDetailed) ? song.moodsDetailed : [],
  segments: [], analyses: [], provenance: [], mergedDuplicates: [], videoLinks: [],
});
const artistsFor = (songs) => [...new Map(songs.map((song) => [song.artist.id, song.artist])).values()].map((artist) => ({ ...artist, type: 'ARTIST' }));
const demoWorld = () => {
  const songs = all().slice(0, 6).map(withSongDetails);
  return {
    world: {
      id: 1, title: 'Your quiet corner', description: 'A changing little world of sounds picked for you.',
      theme: 'calm', songCount: songs.length, totalDurationSec: songs.reduce((sum, song) => sum + song.durationSec, 0),
      archetype: { name: 'QUIET CORNER' }, version: 1, batchId: 1, feedback: null,
      weekStart: '2026-11-09T00:00:00.000Z', generatedAt: '2026-11-10T00:00:00.000Z', expiresAt: '2026-11-16T23:59:59.000Z',
      signals: { topMoods: [{ mood: 'Calm', blended: 0.82 }], language: { name: 'Telugu', source: 'settings' }, archetypeScores: [{ archetype: 'QUIET CORNER', score: 0.82 }, { archetype: 'OPEN ROAD', score: 0.56 }], regionalTrendingMoods: [], feedback: [] },
    },
    songs,
    versions: [{ id: 1, version: 1, title: 'Your quiet corner', generatedAt: '2026-11-10T00:00:00.000Z', status: 'ACTIVE' }],
    history: [],
  };
};

export function demoRequest(method,path,body){
  const p=path.split('?')[0], q=new URLSearchParams(path.split('?')[1]||'');
  const user={id:1,username:'demo',displayName:'Demo Listener',email:'demo@loop.local',roleName:'Listener',role:'LISTENER',onboarded:true,permissions:[],incognito:false,regionCode:'IN',region:{code:'IN',name:'India'},languages:[{id:1,name:'Telugu',nativeName:'Telugu'}],contentFilter:'OFF',listeningHabit:'MIXED'};
  if(p==='/auth/session'||p==='/auth/me')return Promise.resolve({authenticated:true,...user,session:{id:'demo-session',expiresAt:null}});
  if(p==='/auth/logout'||p==='/auth/logout-all')return Promise.resolve({ok:true});
  if(p==='/moods')return Promise.resolve(demoMoods);
  if(p==='/genres')return Promise.resolve(demoGenres);
  if(p==='/contexts')return Promise.resolve(demoContexts);
  if(p==='/languages')return Promise.resolve([{id:1,name:'Telugu',code:'te'},{id:2,name:'Hindi',code:'hi'},{id:3,name:'English',code:'en'}]);
  if(p==='/regions')return Promise.resolve([{code:'IN',name:'India'}]);
  if(p==='/songs'||p==='/trending')return Promise.resolve(result(all()));
  if(p==='/recommendations/daily'||p==='/recommendations/discovery'||p==='/recommendations/regional'||p==='/recommendations/similar')return Promise.resolve(result(all().slice(0,8)));
  if(p==='/recommendations/recovery')return Promise.resolve({title:'A gentle lift',subtitle:'A demo mood-recovery mix',stages:[{batchId:1,title:'Settle in',interpretation:{summary:[{label:'Mood',value:'Calm'},{label:'Energy',value:'Gentle'}]},songs:all().slice(0,3)},{batchId:2,title:'Find your rhythm',interpretation:{summary:[{label:'Mood',value:'Dreamy'},{label:'Energy',value:'Steady'}]},songs:all().slice(3,6)},{batchId:3,title:'Lift up',interpretation:{summary:[{label:'Mood',value:'Happy'},{label:'Energy',value:'Bright'}]},songs:all().slice(6,9)}]});
  if(p.startsWith('/recommendations/context/')||/^\/recommendations\/batches\/\d+$/.test(p))return Promise.resolve(result(all().slice(0,8)));
  if(p==='/recommendations/mood'){
    const chosen=(body?.moodIds||[]).map(id=>demoMoods.find(m=>m.id===id)).filter(Boolean);
    const term=(body?.text||'').toLowerCase();
    const picks = all().filter((song) => (
      (!chosen.length && !term)
      || chosen.some((mood) => song.moods.includes(mood.name))
      || song.title.toLowerCase().includes(term)
      || (Array.isArray(song.moods) ? song.moods : []).some((mood) => String(mood?.name || mood).toLowerCase().includes(term))
    ));
    const moods=chosen.length?chosen:[demoMoods.find(m=>m.name==='Calm')];
    return Promise.resolve({...result(picks.length?picks:all().slice(0,5)),interpretation:{moods:moods.map(m=>({...m,confidence:0.9})),summary:'A sound shaped around your mood'},explanation:'Demo recommendations based on the selected mood.'});
  }
  if(p==='/recommendations/parse')return Promise.resolve({moods:[demoMoods[0]],confidence:0.8});
  if(p==='/worlds/current')return Promise.resolve(demoWorld());
  if(p==='/history')return Promise.resolve(read('history',[]));
  if(p==='/likes')return Promise.resolve(all().filter(s=>s.liked));
  if(p==='/me/dismissals'||p==='/me/sessions')return Promise.resolve([]);
  if(p==='/me/onboarding')return Promise.resolve({languages:[{id:1,name:'Telugu',nativeName:'Telugu'},{id:2,name:'Hindi',nativeName:'Hindi'},{id:3,name:'English',nativeName:'English'}],regions:[{code:'IN',name:'India'}],genres:demoGenres,moods:demoMoods});
  if(p==='/me/settings'&&method==='PATCH'){const ids=body?.languageIds||[1];const names={1:'Telugu',2:'Hindi',3:'English'};const languages=ids.map(id=>({id,name:names[id]||'English',nativeName:names[id]||'English'}));return Promise.resolve({...user,...body,languages,region:body?.regionCode?{code:body.regionCode,name:'India'}:null});}
  if(p==='/playlists'&&method==='POST'){const lists=read('playlists',[]),item={id:Date.now(),name:body.name,songCount:0,kind:'MANUAL',covers:[],songs:[],totalDurationSec:0};write('playlists',[item,...lists]);return Promise.resolve(item);}
  if(p==='/playlists')return Promise.resolve(read('playlists',[]));
  if(p==='/playlists/smart')return Promise.resolve(['ENERGY_BOOST','CALM_MIX','LATE_NIGHT','STUDY','ROAD_TRIP','MOST_REPLAYED','DISCOVERY','REGIONAL'].map(type=>({type,name:type.replaceAll('_',' ').toLowerCase(),blurb:'A demo mix built around your listening'})));
  if(p.startsWith('/playlists/smart/'))return Promise.resolve(result(all().slice(0,6)));
  if(p==='/playback/start')return Promise.resolve({playId:playId++,private:false,isReplay:false,media:{demo:true,label:'Demo sketch',type:'GENERATED_SKETCH'}});
  if(p.startsWith('/playback/')||p==='/playback/private')return Promise.resolve({ok:true,private:false});
  if(p==='/insights/profile')return Promise.resolve({days:30,headline:null,longTerm:[],recentTrend:null,streak:{current:0,longest:0},mostReplayed:null,mostSkipped:null});
  if(p==='/insights/activity')return Promise.resolve({daily:[],genres:[],heatmap:[],languages:[],contexts:[]});
  if(p==='/insights/journey')return Promise.resolve({distribution:[],transitions:[],trends:[],sessionArcs:[]});
  if(p==='/insights/preferences')return Promise.resolve({signals:[],summary:'Your demo listening profile',model:null,evidence:{behaviourShare:0,onboardingShare:100,completedPlays:0,neededForFullConfidence:10},genres:[],artists:[],moods:[]});
  if(p==='/incognito'){if(method==='POST')write('incognito',true);if(method==='DELETE')write('incognito',false);return Promise.resolve({active:read('incognito',false),startedAt:read('incognito',false)?new Date().toISOString():null,secondsLeft:7200,events:0,memory:[],recentSongs:[],purged:{events:0,lists:0}});}
  if (p === '/search') {
    const term = (q.get('q') || '').toLowerCase();
    return Promise.resolve({
      songs: all().filter((song) => (
        `${song.title} ${song.artist.name} ${song.moods.join(' ')}`.toLowerCase().includes(term)
      )),
    });
  }
  if(/^\/songs\/\d+$/.test(p)){const song=all().find(s=>s.id===Number(p.split('/').pop()))||all()[0];return Promise.resolve(withSongDetails(song));}
  if(/^\/songs\/\d+\/(like|rating)$/.test(p)){
    const id=Number(p.split('/')[2]);if(p.endsWith('/like'))write('likes',body?.liked?[...new Set([...read('likes',[]),id])]:read('likes',[]).filter(x=>x!==id));return Promise.resolve({ok:true});
  }
  if(/^\/playlists\/\d+$/.test(p)){const id=Number(p.split('/')[2]);const item=read('playlists',[]).find(x=>x.id===id);return Promise.resolve(item||{id,name:'Demo playlist',kind:'MANUAL',songCount:0,songs:[],totalDurationSec:0});}
  if(/^\/playlists\/\d+\/songs$/.test(p))return Promise.resolve({ok:true,songCount:1});
  if(p==='/worlds/current/regenerate'||p==='/worlds/current/rollback')return Promise.resolve({...demoWorld(),ok:true});

  if(/^\/artists\/\d+\/artwork$/.test(p)||/^\/albums\/\d+\/artwork$/.test(p))return Promise.resolve({});
  if(/^\/artists\/\d+$/.test(p)){
    const id=Number(p.split('/').pop());
    const songs=all().filter((song)=>song.artist.id===id).map(withSongDetails);
    const artists=artistsFor(all());
    const artist=artists.find((item)=>item.id===id)||{id,name:'Demo artist'};
    return Promise.resolve({id,name:artist.name,type:'ARTIST',language:'Telugu',region:'India',formedYear:2022,bio:'An independent artist from the LOOP demo catalogue.',aliases:[],songs,popularity:{plays30d:0,listeners30d:0,rank:null}});
  }
  if(/^\/albums\/\d+$/.test(p)){
    const id=Number(p.split('/').pop());
    const songs=all().filter((song)=>song.album?.id===id).map(withSongDetails);
    const artists=artistsFor(songs);
    const first=songs[0]||all()[0];
    return Promise.resolve({id,title:first.album?.title||'LOOP Sessions',type:'ALBUM',film:null,filmId:null,releaseYear:2024,language:'Telugu',artists,songs,cover:first.cover||colors});
  }
  if(/^\/films\/\d+$/.test(p)){
    const id=Number(p.split('/').pop());
    return Promise.resolve({id,title:'A LOOP Short Story',releaseYear:2024,language:{id:1,name:'Telugu'},composers:[],songs:[],albums:[],external:null});
  }
  if(/^\/languages\/\d+$/.test(p)){
    const id=Number(p.split('/').pop());
    const language={id,name:id===2?'Hindi':id===3?'English':'Telugu',iso:id===2?'hi':id===3?'en':'te',nativeName:id===1?'Telugu':id===2?'Hindi':'English',script:'Latin'};
    const songs=all().map(withSongDetails);
    return Promise.resolve({...language,regions:[],totalSongs:songs.length,artists:artistsFor(songs),films:[],songs});
  }
  if(p.startsWith('/admin/'))return Promise.resolve({});
  return Promise.resolve({});
}
