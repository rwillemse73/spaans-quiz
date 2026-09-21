const APP_VERSION = "0.0.4";
const SESSION_SIZE = 30;
const STORAGE_KEY = "spaansQuiz_v2";
const DIFFICULTY_THRESHOLD = 3;

const DATASETS = [
  { id:"test100", name:"Normale woorden – 100", shortName:"Normale woorden 100", url:"spaans_engels_test_100.json", type:"words" },
  { id:"complete4850", name:"Normale woorden – 4.850", shortName:"Normale woorden 4.850", url:"productie/spaans_engels_compleet_4850.json", type:"words" },
  { id:"expressions101", name:"Spaanse uitdrukkingen – 101", shortName:"Spaanse uitdrukkingen", url:"spaans_uitdrukkingen_101.json", type:"expressions" }
];

let words = [];
let state = loadState();
let session = [];
let currentIndex = 0;
let current = null;
let score = 0;
let practiceMode = false;

const $ = id => document.getElementById(id);
const norm = s => String(s).toLowerCase().trim();
const today = () => new Date().toISOString().slice(0,10);
const formatDate = s => {
  if(!s) return "-";
  const [y,m,d] = s.slice(0,10).split("-");
  return `${d}-${m}-${y}`;
};

function currentDataset(){ return DATASETS.find(d=>d.id===state.activeDataset) || DATASETS[0]; }

function defaultDatasetState(){
  return {
    active:[], review:[], deferred:{}, learned:[], cycle:1,
    totalCorrect:0, totalWrong:0,
    cycleStartedAt:null, cycleDays:[], cycleWrong:0,
    sessionNumber:0, wordStats:{}, history:[]
  };
}

function defaultAppState(){
  return { version:2, activeDataset:"test100", datasets:{} };
}

function normalizeDatasetState(x){
  const fresh=defaultDatasetState();
  if(x && typeof x==="object") Object.assign(fresh,x);
  if(!Array.isArray(fresh.active)) fresh.active=[];
  if(!Array.isArray(fresh.review)) fresh.review=[];
  if(!fresh.deferred || typeof fresh.deferred!=="object") fresh.deferred={};
  if(!Array.isArray(fresh.learned)) fresh.learned=[];
  if(!Array.isArray(fresh.cycleDays)) fresh.cycleDays=[];
  if(!Array.isArray(fresh.history)) fresh.history=[];
  if(!fresh.wordStats || typeof fresh.wordStats!=="object") fresh.wordStats={};
  if(typeof fresh.cycle!=="number" || fresh.cycle<1) fresh.cycle=1;
  if(typeof fresh.totalWrong!=="number") fresh.totalWrong=0;
  if(typeof fresh.totalCorrect!=="number") fresh.totalCorrect=0;
  if(typeof fresh.cycleWrong!=="number") fresh.cycleWrong=0;
  if(typeof fresh.sessionNumber!=="number") fresh.sessionNumber=0;
  return fresh;
}

function loadState(){
  const fresh=defaultAppState();
  try{
    const raw=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(raw && raw.datasets){
      fresh.activeDataset=raw.activeDataset || "test100";
      Object.keys(raw.datasets).forEach(id=>fresh.datasets[id]=normalizeDatasetState(raw.datasets[id]));
      return fresh;
    }
  }catch(e){}

  // Migrate the previous 0.0.3 state into the 100-word test dataset.
  try{
    const old=JSON.parse(localStorage.getItem("spaansQuiz_v1"));
    if(old){ fresh.datasets.test100=normalizeDatasetState(old); }
  }catch(e){}
  return fresh;
}

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function datasetState(){
  if(!state.datasets[state.activeDataset]) state.datasets[state.activeDataset]=defaultDatasetState();
  return state.datasets[state.activeDataset];
}

async function loadDataset(datasetId){
  const dataset=DATASETS.find(d=>d.id===datasetId);
  if(!dataset) return;
  const res=await fetch(dataset.url);
  if(!res.ok) throw new Error(`Dataset ${dataset.url} niet gevonden`);
  const data=await res.json();
  words=Array.isArray(data.words)?data.words:[];
  if(!words.length) throw new Error("Dataset bevat geen woorden");
  state.activeDataset=dataset.id;
  state.datasets[dataset.id]=normalizeDatasetState(state.datasets[dataset.id]);
  reconcileState();
  saveState();
  updateHome();
  updateDatasetLabel();
}

async function init(){
  await loadDataset(state.activeDataset || "test100");
}

function reconcileState(){
  const s=datasetState();
  const ids=new Set(words.map(w=>w.id));
  s.active=s.active.filter(id=>ids.has(id));
  s.review=s.review.filter(id=>ids.has(id));
  s.learned=s.learned.filter(id=>ids.has(id));
  Object.keys(s.deferred).forEach(id=>{ if(!ids.has(Number(id)) && !ids.has(id)) delete s.deferred[id]; });
  const known=new Set([...s.active,...s.review,...s.learned]);
  if(!s.active.length && !s.review.length && !s.learned.length){
    s.active=[...ids];
  }else{
    ids.forEach(id=>{if(!known.has(id)) s.active.push(id)});
  }
  if(!s.cycleStartedAt && (s.active.length || s.review.length)) s.cycleStartedAt=today();
}

function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function dueReviewIds(){
  const s=datasetState();
  return s.review.filter(id=>(s.deferred[id]||0)<=s.sessionNumber);
}

function pickSession(){
  const s=datasetState();
  const due=shuffle(dueReviewIds());
  const chosenReview=due.slice(0,Math.min(due.length,SESSION_SIZE));
  const chosenReviewSet=new Set(chosenReview);
  const activeCandidates=shuffle(s.active.filter(id=>!chosenReviewSet.has(id) && !s.deferred[id]));
  const need=SESSION_SIZE-chosenReview.length;
  const chosenActive=activeCandidates.slice(0,Math.max(0,need));
  return shuffle([...chosenReview,...chosenActive]).map(id=>words.find(w=>String(w.id)===String(id))).filter(Boolean);
}

function startNewCycle(){
  const s=datasetState();
  s.active=words.map(w=>w.id);
  s.review=[];
  s.deferred={};
  s.learned=[];
  s.cycleStartedAt=today();
  s.cycleDays=[];
  s.cycleWrong=0;
  s.sessionNumber=0;
  saveState();
}

function startSession(){
  practiceMode=false;
  const s=datasetState();
  if(s.active.length===0 && s.review.length===0) startNewCycle();
  if(!s.cycleStartedAt) s.cycleStartedAt=today();
  s.sessionNumber++;
  session=pickSession();
  if(!session.length){
    s.sessionNumber--;
    saveState();
    alert("Er zijn op dit moment geen woorden beschikbaar. De uitgestelde fouten komen na drie sessies terug.");
    return;
  }
  session.forEach(w=>{ if(s.deferred[w.id]) delete s.deferred[w.id]; });
  s.review=s.review.filter(id=>!session.some(w=>String(w.id)===String(id)));
  saveState();
  currentIndex=0; score=0;
  showOnly("quiz");
  $("quizMode").textContent=currentDataset().shortName;
  showQuestion();
}

function englishOf(w){ return w.english[0]; }

function makeOptions(target){
  const correct=englishOf(target);
  const sameType=words.filter(w=>String(w.id)!==String(target.id) && w.wordType===target.wordType);
  const broad=words.filter(w=>String(w.id)!==String(target.id));
  const pool=shuffle([...sameType,...broad]);
  const out=[correct],seen=new Set([norm(correct)]);
  for(const w of pool){
    const answer=englishOf(w), n=norm(answer);
    if(!answer || seen.has(n)) continue;
    out.push(answer); seen.add(n);
    if(out.length===5) break;
  }
  return shuffle(out);
}

function showQuestion(){
  current=session[currentIndex];
  $("progress").textContent=`${currentIndex+1} / ${session.length}`;
  $("score").textContent=`Goed: ${score}`;
  $("word").textContent=current.spanish;
  $("type").textContent=prettyType(current.wordType);
  $("feedback").textContent="";
  $("feedback").className="feedback";
  $("nextBtn").classList.add("hidden");
  const box=$("options"); box.innerHTML="";
  makeOptions(current).forEach(answer=>{
    const b=document.createElement("button");
    b.className="option"; b.textContent=answer;
    b.onclick=()=>answerQuestion(b,answer);
    box.appendChild(b);
  });
}

function prettyType(t){
  if(t==="expression") return "uitdrukking";
  if(/\bv-/.test(t) || /\bv\b/.test(t)) return "werkwoord";
  if(/\bnf\b|\bnm\b|\bnc\b/.test(t)) return "zelfstandig naamwoord";
  return "";
}

function markStudyDay(){
  const s=datasetState(), d=today();
  if(!s.cycleDays.includes(d)) s.cycleDays.push(d);
}

function answerQuestion(button,answer){
  const s=datasetState();
  const buttons=[...document.querySelectorAll(".option")];
  buttons.forEach(b=>{b.disabled=true;b.classList.add("disabled")});
  markStudyDay();
  const correct=norm(answer)===norm(englishOf(current));
  const correctButton=buttons.find(b=>norm(b.textContent)===norm(englishOf(current)));
  const stat=s.wordStats[current.id] || {wrong:0,correct:0};

  if(correct){
    button.classList.add("correct");
    $("feedback").textContent="✓ Goed!";
    $("feedback").className="feedback good";
    score++; s.totalCorrect++; stat.correct++;
    if(!practiceMode){
      s.review=s.review.filter(id=>String(id)!==String(current.id));
      delete s.deferred[current.id];
      s.active=s.active.filter(id=>String(id)!==String(current.id));
      if(!s.learned.some(id=>String(id)===String(current.id))) s.learned.push(current.id);
    }
  }else{
    button.classList.add("wrong");
    if(correctButton) correctButton.classList.add("correct");
    $("feedback").textContent=`✗ Niet goed — ${englishOf(current)}`;
    $("feedback").className="feedback bad";
    s.totalWrong++; stat.wrong++;
    if(!practiceMode){
      s.cycleWrong++;
      if(!s.review.some(id=>String(id)===String(current.id))) s.review.push(current.id);
      // Three complete sessions later.
      s.deferred[current.id]=s.sessionNumber+3;
    }
  }
  s.wordStats[current.id]=stat;
  saveState();
  $("nextBtn").classList.remove("hidden");
}

function completeCycle(){
  const s=datasetState();
  const finished=today();
  const start=s.cycleStartedAt || finished;
  s.history.push({
    set:s.cycle,
    words:words.length,
    startDate:start,
    endDate:finished,
    studyDays:s.cycleDays.length,
    wrong:s.cycleWrong
  });
  s.active=words.map(w=>w.id);
  s.review=[];
  s.deferred={};
  s.learned=[];
  s.cycle++;
  s.cycleStartedAt=null;
  s.cycleDays=[];
  s.cycleWrong=0;
  s.sessionNumber=0;
  saveState();
}

function nextQuestion(){
  currentIndex++;
  if(currentIndex>=session.length){
    const s=datasetState();
    const completed=s.active.length===0 && s.review.length===0 && Object.keys(s.deferred).length===0;
    if(completed) completeCycle();
    showOnly("done");
    $("doneText").textContent=completed
      ? `Set voltooid! ${words.length} ${currentDataset().type==="expressions"?"uitdrukkingen":"woorden"} gedaan. Fouten in deze set: ${s.history[s.history.length-1].wrong}.`
      : `Deze sessie: ${score} van ${session.length} goed.`;
    updateHome();
  }else showQuestion();
}

function updateHome(){
  const s=datasetState();
  $("activeCount").textContent=s.active.length;
  $("reviewCount").textContent=s.review.length;
  $("totalWrong").textContent=s.totalWrong;
  $("difficultCount").textContent=getDifficultWords().length;
  updateDatasetLabel();
}

function getDifficultWords(){
  const s=datasetState();
  return words.map(w=>({word:w,stats:s.wordStats[w.id]||{wrong:0,correct:0}}))
    .filter(x=>x.stats.wrong>=DIFFICULTY_THRESHOLD)
    .sort((a,b)=>b.stats.wrong-a.stats.wrong);
}

function startDifficultPractice(){
  const list=getDifficultWords().map(x=>x.word);
  if(!list.length){ alert("Er zijn nog geen moeilijke woorden met 3 of meer fouten."); return; }
  practiceMode=true;
  session=shuffle(list).slice(0,SESSION_SIZE);
  currentIndex=0; score=0;
  showOnly("quiz");
  $("quizMode").textContent="Moeilijke woorden oefenen";
  showQuestion();
}

function showResults(){
  showOnly("results");
  const s=datasetState();
  const body=$("resultsBody"); body.innerHTML="";
  if(!s.history.length){
    body.innerHTML='<tr><td colspan="6" class="empty">Nog geen volledige set afgerond.</td></tr>';
  }else{
    [...s.history].reverse().forEach(h=>{
      const tr=document.createElement("tr");
      [h.set,h.words,formatDate(h.startDate),formatDate(h.endDate),h.studyDays,h.wrong].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td)});
      body.appendChild(tr);
    });
  }
}

function showDifficult(){
  showOnly("difficult");
  const body=$("difficultBody"); body.innerHTML="";
  const list=getDifficultWords();
  if(!list.length){ body.innerHTML='<tr><td colspan="3" class="empty">Nog geen woorden met 3 of meer fouten.</td></tr>'; return; }
  list.forEach(x=>{
    const tr=document.createElement("tr");
    [x.word.spanish,x.word.english[0],x.stats.wrong].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td)});
    body.appendChild(tr);
  });
}

function showOnly(id){
  ["home","quiz","done","results","difficult","datasets"].forEach(x=>$(x).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function showDatasets(){
  showOnly("datasets");
  const list=$("datasetList"); list.innerHTML="";
  DATASETS.forEach(d=>{
    const b=document.createElement("button");
    b.className="datasetBtn" + (d.id===state.activeDataset ? " selected" : "");
    b.innerHTML=`<strong>${d.name}</strong><span>${d.type==="expressions"?"Uitdrukkingen":"Woordenlijst"}</span>`;
    b.onclick=async()=>{
      try{
        await loadDataset(d.id);
        showOnly("home");
      }catch(e){ alert(`Deze lijst kon niet worden geladen: ${e.message}`); }
    };
    list.appendChild(b);
  });
}

function updateDatasetLabel(){
  const d=currentDataset();
  if($("currentDataset")) $("currentDataset").textContent=d.name;
  if($("subText")) $("subText").textContent=`30 woorden per sessie · versie ${APP_VERSION}`;
}

function returnHome(){
  practiceMode=false;
  saveState();
  showOnly("home");
  updateHome();
}

function saveAndExit(){ saveState(); returnHome(); }

function resetAll(){
  if(!confirm("Alle voortgang van alle datasets wissen en opnieuw beginnen?")) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem("spaansQuiz_v1");
  location.reload();
}

$("startBtn").onclick=startSession;
$("againBtn").onclick=()=>{ showOnly("home"); startSession(); };
$("homeBtn").onclick=returnHome;
$("saveExitBtn").onclick=saveAndExit;
$("nextBtn").onclick=nextQuestion;
$("resultsBtn").onclick=showResults;
$("difficultBtn").onclick=showDifficult;
$("difficultPracticeBtn").onclick=startDifficultPractice;
$("resultsHomeBtn").onclick=returnHome;
$("difficultHomeBtn").onclick=returnHome;
$("resetBtn").onclick=resetAll;
$("datasetBtn").onclick=showDatasets;
$("datasetsHomeBtn").onclick=returnHome;

init().catch(err=>{
  console.error(err);
  $("home").innerHTML=`<h2>Woordenlijst kon niet worden geladen</h2><p>${err.message}</p>`;
});
