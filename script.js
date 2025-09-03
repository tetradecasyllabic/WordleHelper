// Wordle Helper + Simulation
const RAW_URL = "words.txt";

let allWords = [];
let possibleWords = [];
const MAX_CANDIDATES = 120;

const guessInputEl = el("guessInput");
const addRowBtn = el("addRowBtn");
const applyBtn = el("applyBtn");
const resetBtn = el("resetBtn");
const statusEl = el("status");
const boardEl = el("board");
const suggestionsEl = el("suggestions");
const computingEl = el("computing");
const possibleCountEl = el("possibleCount");
const minGuessesEl = el("minGuesses");
const expectedAfterEl = el("expectedAfter");
const sortSelect = el("sortSelect");

const simTargetEl = el("simTarget");
const simStartEl = el("simStart");
const runSimBtn = el("runSimBtn");
const simResultEl = el("simResult");

const batchStartEl = el("batchStart");
const runBatchBtn = el("runBatchBtn");
const batchResultEl = el("batchResult");

document.addEventListener("DOMContentLoaded", init);
addRowBtn.addEventListener("click", onAddRow);
applyBtn.addEventListener("click", onApplyFeedback);
resetBtn.addEventListener("click", resetAll);
guessInputEl.addEventListener("keydown", (e) => { if(e.key==="Enter") onAddRow(); });
runSimBtn.addEventListener("click", singleWordSimulation);
runBatchBtn.addEventListener("click", batchSimulation);

function el(id){ return document.getElementById(id); }

async function init(){
  setStatus("Loading words...");
  try {
    const r = await fetch(RAW_URL, {cache:"no-cache"});
    const txt = await r.text();
    allWords = txt.split(/\r?\n/).map(s=>s.trim().toLowerCase()).filter(Boolean);
    possibleWords = [...allWords];
    setStatus(`Loaded ${allWords.length} words.`);
    updateStatsAndSuggestions();
  } catch(err){
    console.error(err);
    setStatus("Failed to load words. Check words.txt and CORS.");
  }
}

function setStatus(s){ statusEl.textContent = s; }

/* ---------- BOARD ---------- */
function onAddRow(){
  const guess = guessInputEl.value.trim().toLowerCase();
  if(!/^[a-z]{5}$/.test(guess)){ alert("Type a 5-letter word."); return; }
  const row = document.createElement("div");
  row.className="row";
  row.dataset.guess = guess;
  for(let i=0;i<5;i++){
    const tile=document.createElement("div");
    tile.className="tile state-0";
    tile.textContent=guess[i].toUpperCase();
    tile.dataset.state="0"; tile.dataset.pos=i;
    tile.addEventListener("click",()=>cycleTileState(tile));
    row.appendChild(tile);
  }
  boardEl.appendChild(row);
  guessInputEl.value="";
}

function cycleTileState(tile){
  let s=parseInt(tile.dataset.state||"0");
  s=(s+1)%3;
  tile.dataset.state=s;
  tile.classList.remove("state-0","state-1","state-2");
  tile.classList.add(`state-${s}`);
}

/* ---------- Feedback ---------- */
function onApplyFeedback(){
  const row=boardEl.querySelector(".row:last-child");
  if(!row){ alert("Add a guess first."); return; }
  const guess=row.dataset.guess;
  const states=Array.from(row.querySelectorAll(".tile")).map(t=>parseInt(t.dataset.state||"0"));
  const pattern=states.join("");
  possibleWords=possibleWords.filter(sol=>getPattern(guess,sol)===pattern);
  setStatus(`Applied feedback for ${guess.toUpperCase()}. Remaining: ${possibleWords.length}`);
  updateStatsAndSuggestions();
}

function resetAll(){
  possibleWords=[...allWords];
  boardEl.innerHTML="";
  suggestionsEl.innerHTML="";
  setStatus(`Reset — ${possibleWords.length} words loaded.`);
  updateStatsAndSuggestions();
}

/* ---------- Pattern ---------- */
function getPattern(guess, solution){
  const g=guess.split(""); const s=solution.split("");
  const pattern=[0,0,0,0,0]; const used=[false, false, false, false, false];
  for(let i=0;i<5;i++){ if(g[i]===s[i]){ pattern[i]=2; used[i]=true; } }
  for(let i=0;i<5;i++){ if(pattern[i]===2) continue;
    for(let j=0;j<5;j++){ if(!used[j] && g[i]===s[j]){ pattern[i]=1; used[j]=true; break; } } }
  return pattern.join("");
}

/* ---------- Suggestions ---------- */
let lastSuggestionResults=[];
async function updateStatsAndSuggestions(){
  possibleCountEl.textContent=possibleWords.length;
  const bitsPerGuess=Math.log2(243);
  const minG=Math.ceil(Math.log2(Math.max(1,possibleWords.length))/bitsPerGuess);
  minGuessesEl.textContent=minG===0?"0 (solved)":minG;
  await computeAndShowSuggestions();
}

async function computeAndShowSuggestions(){
  suggestionsEl.innerHTML=""; computingEl.classList.remove("hidden");
  await sleep(20);
  const freq={}; for(const w of possibleWords){ const seen=new Set(); for(const c of w){ if(!seen.has(c)){ freq[c]=(freq[c]||0)+1; seen.add(c); } } }
  function baseScore(word){ let seen=new Set(),score=0; for(const c of word){ if(!seen.has(c)){ score+=freq[c]||0; seen.add(c); } } return score; }
  let scored=allWords.map(w=>({w,s:baseScore(w)}));
  scored.sort((a,b)=>b.s-a.s);
  let K=Math.min(MAX_CANDIDATES,scored.length);
  let topKWords=scored.slice(0,K).map(x=>x.w);
  let candidatePool=topKWords.slice();
  if(possibleWords.length<=80){ const combined=new Set(candidatePool.concat(possibleWords)); candidatePool=Array.from(combined); }
  const N=possibleWords.length||1; const results=[];
  for(let idx=0;idx<candidatePool.length;idx++){
    const candidate=candidatePool[idx]; const counts=new Map();
    for(const sol of possibleWords){ const pat=getPattern(candidate,sol); counts.set(pat,(counts.get(pat)||0)+1); }
    let sumSq=0; for(const c of counts.values()) sumSq+=c*c;
    const expectedRemaining=sumSq/N;
    let entropy=0; for(const c of counts.values()){ const p=c/N; entropy-=(p*(Math.log2(p)||0)); }
    results.push({word:candidate,expectedRemaining,entropy,baseScore:baseScore(candidate)});
    if(idx%40===0) await sleep(0);
  }
  results.sort((a,b)=>{ if(a.expectedRemaining!==b.expectedRemaining) return a.expectedRemaining-b.expectedRemaining; return b.entropy-a.entropy; });
  lastSuggestionResults=results;
  const top10=results.slice(0,10);
  expectedAfterEl.textContent=top10.length?Math.round(top10[0].expectedRemaining):"—";
  suggestionsEl.innerHTML="";
  for(const r of top10){
    const li=document.createElement("li");
    const left=document.createElement("div"); left.className="sugg-left";
    const wd=document.createElement("div"); wd.className="sugg-word"; wd.textContent=r.word.toUpperCase();
    const meta=document.createElement("div"); meta.className="sugg-meta"; meta.innerHTML=`exp: <strong>${r.expectedRemaining.toFixed(1)}</strong> • entropy: ${r.entropy.toFixed(2)} • score: ${r.baseScore}`;
    left.appendChild(wd); left.appendChild(meta);
    const useBtn=document.createElement("button"); useBtn.className="useBtn"; useBtn.textContent="Use";
    useBtn.addEventListener("click",()=>{ guessInputEl.value=r.word; guessInputEl.focus(); });
    li.appendChild(left); li.appendChild(useBtn);
    suggestionsEl.appendChild(li);
  }
  computingEl.classList.add("hidden");
}

/* ---------- Simulation ---------- */
function patternToEmojis(pat){ return pat.split("").map(d=>d==="2"?"🟩":d==="1"?"🟨":"⬛").join(""); }
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function singleWordSimulation(){
  const target=simTargetEl.value.trim().toLowerCase();
  let guess=simStartEl.value.trim().toLowerCase();
  if(!allWords.includes(target)){ alert("Target word not in dictionary"); return; }
  if(!allWords.includes(guess)){ alert("Starting guess not in dictionary"); return; }
  let possible=[...allWords];
  let moves=0; let log=[];
  while(guess!==target && moves<10){
    moves++;
    const pattern=getPattern(guess,target);
    log.push(`${moves}: ${guess.toUpperCase()} → ${patternToEmojis(pattern)}`);
    possible=possible.filter(w=>getPattern(guess,w)===pattern);
    // recompute top suggestion
    const topSuggestion=possible.length>0?possible[0]:target;
    guess=topSuggestion;
  }
  if(guess===target){ moves++; log.push(`${moves}: ${guess.toUpperCase()} → 🟩🟩🟩🟩🟩`); }
  simResultEl.innerHTML=log.join("<br>")+"<br><strong>Total moves: "+moves+"</strong>";
}

async function batchSimulation(){
  const start= batchStartEl.value.trim().toLowerCase();
  if(!allWords.includes(start)){ alert("Starting word not in dictionary"); return; }
  let totalMoves=0;
  for(let i=0;i<100;i++){
    const target=allWords[Math.floor(Math.random()*allWords.length)];
    let guess=start;
    let moves=0; let possible=[...allWords];
    while(guess!==target && moves<10){
      moves++;
      const pattern=getPattern(guess,target);
      possible=possible.filter(w=>getPattern(guess,w)===pattern);
      guess=possible.length>0?possible[0]:target;
    }
    if(guess===target){ moves++; }
    if(moves>6) moves=7;
    totalMoves+=moves;
  }
  batchResultEl.innerHTML=`Average moves over 100 simulations: ${(totalMoves/100).toFixed(2)}`;
}
