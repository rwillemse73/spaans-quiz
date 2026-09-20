const APP_VERSION = "0.0.3";

const WORDS_URL = "spaans_engels_test_100.json";
const SESSION_SIZE = 15;
const STORAGE_KEY = "spaansQuiz_v1";
const DIFFICULTY_THRESHOLD = 3;

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

async function init(){
  const res = await fetch(WORDS_URL);
  const data = await res.json();
  words = data.words;
  reconcileState();
  updateHome();
}

function defaultState(){
  return {
    active:[], review:[], learned:[], cycle:1,
    totalCorrect:0, totalWrong:0,
    cycleStartedAt:null, cycleDays:[], cycleWrong:0,
    wordStats:{}, history:[]
  };
}

function loadState(){
  const fresh = defaultState();
  try{
    const x = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(x && Array.isArray(x.active) && Array.isArray(x.review) && Array.isArray(x.learned)){
      Object.assign(fresh, x);
      if(!Array.isArray(fresh.history)) fresh.history=[];
      if(!Array.isArray(fresh.cycleDays)) fresh.cycleDays=[];
      if(!fresh.wordStats || typeof fresh.wordStats!=="object") fresh.wordStats={};
      return fresh;
    }
  }catch(e){}
  return fresh;
}

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function reconcileState(){
  const ids = new Set(words.map(w=>w.id));
  if(!Array.isArray(state.history)) state.history=[];
  if(!state.wordStats || typeof state.wordStats!=="object") state.wordStats={};
  if(!Array.isArray(state.cycleDays)) state.cycleDays=[];
  if(typeof state.cycleWrong!=="number") state.cycleWrong=0;
  if(!state.cycleStartedAt) state.cycleStartedAt=null;
  if(typeof state.cycle!=="number" || state.cycle<1) state.cycle=1;
  if(typeof state.totalWrong!=="number") state.totalWrong=0;
  if(typeof state.totalCorrect!=="number") state.totalCorrect=0;

  if(!state.active.length && !state.review.length && !state.learned.length){
    state.active=[...ids];
    saveState();
    return;
  }
  state.active=state.active.filter(id=>ids.has(id));
  state.review=state.review.filter(id=>ids.has(id));
  state.learned=state.learned.filter(id=>ids.has(id));
  const known=new Set([...state.active,...state.review,...state.learned]);
  ids.forEach(id=>{if(!known.has(id)) state.active.push(id)});
  saveState();
}

function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}

function pickSession(){
  const reviewIds=shuffle(state.review);
  const chosenReview=reviewIds.slice(0,Math.min(reviewIds.length,SESSION_SIZE));
  const reviewSet=new Set(chosenReview);
  const activeCandidates=shuffle(state.active.filter(id=>!reviewSet.has(id)));
  const need=SESSION_SIZE-chosenReview.length;
  const chosenActive=activeCandidates.slice(0,need);
  return shuffle([...chosenReview,...chosenActive])
    .map(id=>words.find(w=>w.id===id)).filter(Boolean);
}

function startNewCycle(){
  state.active=words.map(w=>w.id);
  state.review=[];
  state.learned=[];
  state.cycleStartedAt=today();
  state.cycleDays=[];
  state.cycleWrong=0;
  saveState();
}

function startSession(){
  practiceMode = false;
  if(state.active.length===0 && state.review.length===0) startNewCycle();
  if(!state.cycleStartedAt) state.cycleStartedAt=today();
  session=pickSession();
  if(!session.length) return;
  $("quizMode").textContent="";
  currentIndex=0; score=0;
  $("home").classList.add("hidden");
  $("results").classList.add("hidden");
  $("difficult").classList.add("hidden");
  $("done").classList.add("hidden");
  $("quiz").classList.remove("hidden");
  showQuestion();
}

function englishOf(w){ return w.english[0]; }

function makeOptions(target){
  const correct=englishOf(target);
  const sameType=words.filter(w=>w.id!==target.id && w.wordType===target.wordType);
  const broad=words.filter(w=>w.id!==target.id);
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
  if(/\bv-/.test(t) || /\bv\b/.test(t)) return "werkwoord";
  if(/\bnf\b|\bnm\b|\bnc\b/.test(t)) return "zelfstandig naamwoord";
  return "";
}

function markStudyDay(){
  const d=today();
  if(!state.cycleDays.includes(d)) state.cycleDays.push(d);
}

function answerQuestion(button,answer){
  const buttons=[...document.querySelectorAll(".option")];
  buttons.forEach(b=>{b.disabled=true;b.classList.add("disabled")});
  markStudyDay();
  const correct=norm(answer)===norm(englishOf(current));
  const correctButton=buttons.find(b=>norm(b.textContent)===norm(englishOf(current)));
  const stat=state.wordStats[current.id] || {wrong:0,correct:0};

  if(correct){
    button.classList.add("correct");
    $("feedback").textContent="✓ Goed!";
    $("feedback").className="feedback good";
    score++; state.totalCorrect++; stat.correct++;
    if(!practiceMode){
      state.review=state.review.filter(id=>id!==current.id);
      state.active=state.active.filter(id=>id!==current.id);
      if(!state.learned.includes(current.id)) state.learned.push(current.id);
    }
  }else{
    button.classList.add("wrong");
    if(correctButton) correctButton.classList.add("correct");
    $("feedback").textContent=`✗ Niet goed — ${englishOf(current)}`;
    $("feedback").className="feedback bad";
    state.totalWrong++; stat.wrong++;
    if(!practiceMode){
      state.cycleWrong++;
      if(!state.review.includes(current.id)) state.review.push(current.id);
    }
  }
  state.wordStats[current.id]=stat;
  saveState();
  $("nextBtn").classList.remove("hidden");
}
function completeCycle(){
  const finished=today();
  const start=state.cycleStartedAt || finished;
  state.history.push({
    set:state.cycle,
    words:words.length,
    startDate:start,
    endDate:finished,
    studyDays:state.cycleDays.length,
    wrong:state.cycleWrong
  });
  state.active=words.map(w=>w.id);
  state.review=[];
  state.learned=[];
  state.cycle++;
  state.cycleStartedAt=null;
  state.cycleDays=[];
  state.cycleWrong=0;
  saveState();
}

function nextQuestion(){
  currentIndex++;
  if(currentIndex>=session.length){
    const completed=state.active.length===0 && state.review.length===0;
    if(completed) completeCycle();
    $("quiz").classList.add("hidden");
    $("done").classList.remove("hidden");
    $("doneText").textContent=completed
      ? `Set voltooid! ${words.length} woorden gedaan. Fouten in deze set: ${state.history[state.history.length-1].wrong}.`
      : `Deze sessie: ${score} van ${session.length} goed.`;
    updateHome();
  }else showQuestion();
}

function updateHome(){
  $("activeCount").textContent=state.active.length;
  $("reviewCount").textContent=state.review.length;
  $("totalWrong").textContent=state.totalWrong;
  $("difficultCount").textContent=getDifficultWords().length;
}

function getDifficultWords(){
  return words.map(w=>({word:w,stats:state.wordStats[w.id]||{wrong:0,correct:0}}))
    .filter(x=>x.stats.wrong>=DIFFICULTY_THRESHOLD)
    .sort((a,b)=>b.stats.wrong-a.stats.wrong);
}

function startDifficultPractice(){
  const list=getDifficultWords().map(x=>x.word);
  if(!list.length){
    alert("Er zijn nog geen moeilijke woorden met 3 of meer fouten.");
    return;
  }
  practiceMode=true;
  session=shuffle(list).slice(0,SESSION_SIZE);
  currentIndex=0; score=0;
  $("home").classList.add("hidden");
  $("results").classList.add("hidden");
  $("difficult").classList.add("hidden");
  $("done").classList.add("hidden");
  $("quiz").classList.remove("hidden");
  $("quizMode").textContent="Moeilijke woorden oefenen";
  showQuestion();
}

function showResults(){
  $("home").classList.add("hidden");
  $("quiz").classList.add("hidden");
  $("done").classList.add("hidden");
  $("difficult").classList.add("hidden");
  $("results").classList.remove("hidden");
  const body=$("resultsBody"); body.innerHTML="";
  if(!state.history.length){
    body.innerHTML='<tr><td colspan="6" class="empty">Nog geen volledige set afgerond.</td></tr>';
  }else{
    [...state.history].reverse().forEach(h=>{
      const tr=document.createElement("tr");
      const cells=[h.set,h.words,formatDate(h.startDate),formatDate(h.endDate),h.studyDays,h.wrong];
      cells.forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td)});
      body.appendChild(tr);
    });
  }
}

function showDifficult(){
  $("home").classList.add("hidden");
  $("quiz").classList.add("hidden");
  $("done").classList.add("hidden");
  $("results").classList.add("hidden");
  $("difficult").classList.remove("hidden");
  const body=$("difficultBody"); body.innerHTML="";
  const list=getDifficultWords();
  if(!list.length){
    body.innerHTML='<tr><td colspan="3" class="empty">Nog geen woorden met 3 of meer fouten.</td></tr>';
    return;
  }
  list.forEach(x=>{
    const tr=document.createElement("tr");
    [x.word.spanish,x.word.english[0],x.stats.wrong].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.appendChild(td)});
    body.appendChild(tr);
  });
}

function returnHome(){
  practiceMode=false;
  saveState();
  $("quiz").classList.add("hidden");
  $("done").classList.add("hidden");
  $("results").classList.add("hidden");
  $("difficult").classList.add("hidden");
  $("home").classList.remove("hidden");
  updateHome();
}

function saveAndExit(){ saveState(); returnHome(); }

function resetAll(){
  if(!confirm("Alle voortgang wissen en opnieuw beginnen?")) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

$("startBtn").onclick=startSession;
$("againBtn").onclick=()=>{ $("done").classList.add("hidden"); startSession(); };
$("homeBtn").onclick=returnHome;
$("saveExitBtn").onclick=saveAndExit;
$("nextBtn").onclick=nextQuestion;
$("resultsBtn").onclick=showResults;
$("difficultBtn").onclick=showDifficult;
$("difficultPracticeBtn").onclick=startDifficultPractice;
$("resultsHomeBtn").onclick=returnHome;
$("difficultHomeBtn").onclick=returnHome;
$("resetBtn").onclick=resetAll;

init().catch(err=>{
  console.error(err);
  $("home").innerHTML="<h2>Woordenlijst kon niet worden geladen</h2><p>Zorg dat index.html en spaans_engels_test_100.json in dezelfde map staan.</p>";
});
