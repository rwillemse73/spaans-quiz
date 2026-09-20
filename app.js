
const WORDS_URL = "spaans_engels_test_100.json";
const SESSION_SIZE = 15;
const STORAGE_KEY = "spaansQuiz_v1";

let words = [];
let state = loadState();
let session = [];
let currentIndex = 0;
let current = null;
let score = 0;

const $ = id => document.getElementById(id);
const norm = s => String(s).toLowerCase().trim();

async function init(){
  const res = await fetch(WORDS_URL);
  const data = await res.json();
  words = data.words;
  // Zorg dat alle woorden bestaan in de lokale status.
  reconcileState();
  updateHome();
}

function loadState(){
  try{
    const x = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(x && Array.isArray(x.active) && Array.isArray(x.review) && Array.isArray(x.learned))
      return x;
  }catch(e){}
  return {active:[], review:[], learned:[], cycle:0, totalCorrect:0, totalWrong:0};
}

function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function reconcileState(){
  const ids = new Set(words.map(w=>w.id));
  if(!state.active.length && !state.review.length && !state.learned.length){
    state.active = [...ids];
    saveState();
    return;
  }
  state.active = state.active.filter(id=>ids.has(id));
  state.review = state.review.filter(id=>ids.has(id));
  state.learned = state.learned.filter(id=>ids.has(id));
  // Nieuwe woorden die later aan de dataset zijn toegevoegd.
  const known = new Set([...state.active,...state.review,...state.learned]);
  ids.forEach(id=>{if(!known.has(id)) state.active.push(id)});
  saveState();
}

function shuffle(a){
  a=[...a];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}

function pickSession(){
  // Review krijgt voorrang. Daarna vullen we aan met nieuwe actieve woorden.
  const reviewIds = shuffle(state.review);
  const reviewTake = Math.min(reviewIds.length, SESSION_SIZE);
  const chosenReview = reviewIds.slice(0,reviewTake);
  const reviewSet = new Set(chosenReview);

  const activeCandidates = shuffle(state.active.filter(id=>!reviewSet.has(id)));
  const need = SESSION_SIZE - chosenReview.length;
  const chosenActive = activeCandidates.slice(0, need);

  return shuffle([...chosenReview,...chosenActive]).map(id=>words.find(w=>w.id===id)).filter(Boolean);
}

function startSession(){
  if(state.active.length===0 && state.review.length===0){
    state.active = words.map(w=>w.id);
    state.learned = [];
    state.cycle++;
    saveState();
  }
  session = pickSession();
  if(!session.length) return;
  currentIndex=0; score=0;
  $("home").classList.add("hidden");
  $("done").classList.add("hidden");
  $("quiz").classList.remove("hidden");
  showQuestion();
}

function englishOf(w){ return w.english[0]; }

function makeOptions(target){
  const correct = englishOf(target);
  const sameType = words.filter(w=>w.id!==target.id && w.wordType===target.wordType);
  const broad = words.filter(w=>w.id!==target.id);
  // Eerst dezelfde woordsoort, daarna andere woorden. Altijd unieke vertalingen.
  let pool = shuffle([...sameType,...broad]);
  const out = [correct], seen = new Set([norm(correct)]);
  for(const w of pool){
    const answer=englishOf(w);
    const n=norm(answer);
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

function answerQuestion(button, answer){
  const buttons=[...document.querySelectorAll(".option")];
  buttons.forEach(b=>{b.disabled=true;b.classList.add("disabled")});
  const correct=norm(answer)===norm(englishOf(current));
  const correctButton=buttons.find(b=>norm(b.textContent)===norm(englishOf(current)));

  if(correct){
    button.classList.add("correct");
    $("feedback").textContent="✓ Goed!";
    $("feedback").className="feedback good";
    score++; state.totalCorrect++;
    // Goed = uit review én actieve lijst halen, naar learned.
    state.review=state.review.filter(id=>id!==current.id);
    state.active=state.active.filter(id=>id!==current.id);
    if(!state.learned.includes(current.id)) state.learned.push(current.id);
  }else{
    button.classList.add("wrong");
    if(correctButton) correctButton.classList.add("correct");
    $("feedback").textContent=`✗ Niet goed — ${englishOf(current)}`;
    $("feedback").className="feedback bad";
    state.totalWrong++;
    // Fout = blijft actief en wordt toegevoegd aan review.
    if(!state.review.includes(current.id)) state.review.push(current.id);
  }
  saveState();
  $("nextBtn").classList.remove("hidden");
}

function nextQuestion(){
  currentIndex++;
  if(currentIndex>=session.length){
    if(state.active.length===0 && state.review.length===0){
      state.active=words.map(w=>w.id);
      state.learned=[];
      state.cycle++;
      saveState();
    }
    $("quiz").classList.add("hidden");
    $("done").classList.remove("hidden");
    $("doneText").textContent=`Deze ronde: ${score} van ${session.length} goed. Fouten: ${session.length-score}.`;
    updateHome();
  }else showQuestion();
}

function updateHome(){
  $("activeCount").textContent=state.active.length;
  $("reviewCount").textContent=state.review.length;
  $("cycleCount").textContent=state.learned.length;
}

function returnHome(){
  saveState();
  $("quiz").classList.add("hidden");
  $("done").classList.add("hidden");
  $("home").classList.remove("hidden");
  updateHome();
}

function saveAndExit(){
  // Alles wordt al na ieder antwoord opgeslagen; deze knop maakt dat expliciet
  // en brengt de gebruiker veilig terug naar het hoofdmenu.
  saveState();
  returnHome();
}

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
$("resetBtn").onclick=resetAll;

init().catch(err=>{
  console.error(err);
  $("home").innerHTML="<h2>Woordenlijst kon niet worden geladen</h2><p>Zorg dat index.html en spaans_engels_test_100.json in dezelfde map staan.</p>";
});
