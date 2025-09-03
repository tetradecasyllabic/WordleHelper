const RAW_URL = "words.txt";
let allWords = [], possibleWords = [];
const MAX_CANDIDATES = 120;

const guessInput = () => document.getElementById("guessInput");
const addRowBtn = document.getElementById("addRowBtn");
const applyBtn = document.getElementById("applyBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const boardEl = document.getElementById("board");
const suggestionsEl = document.getElementById("suggestions");
const computingEl = document.getElementById("computing");
const possibleCountEl = document.getElementById("possibleCount");
const minGuessesEl = document.getElementById("minGuesses");
const expectedAfterEl = document.getElementById("expectedAfter");

const simTargetEl = document.getElementById("simTarget");
const simStartEl = document.getElementById("simStart");
const runSimBtn = document.getElementById("runSimBtn");
const simResultEl = document.getElementById("simResult");
const batchStartEl = document.getElementById("batchStart");
const batchSpeedEl = document.getElementById("batchSpeed");
const runBatchBtn = document.getElementById("runBatchBtn");
const batchResultEl = document.getElementById("batchResult");

document.addEventListener("DOMContentLoaded", init);
addRowBtn.addEventListener("click", onAddRow);
applyBtn.addEventListener("click", onApplyFeedback);
resetBtn.addEventListener("click", resetAll);
guessInput().addEventListener("keydown", e=>{if(e.key==="Enter") onAddRow();});
runSimBtn.addEventListener("click", singleWordSimulation);
runBatchBtn.addEventListener("click", batchSimulation);

async function init(){
  setStatus("Loading words...");
  try{
    const r = await fetch(RAW_URL,{cache:"no-cache"});
    const txt = await r.text();
    allWords = txt.split(/\r?\n/).map(s=>s.trim().toLowerCase()).filter(Boolean);
    possibleWords = [...allWords];
    setStatus(`Loaded ${allWords.length} words.`);
    updateStatsAndSuggestions();
  }catch(err){
    console.error(err);
    setStatus("Failed to load words.");
  }
}

function setStatus(s){ statusEl.textContent = s; }

/* --- BOARD --- */
function onAddRow(){
  const guess = guessInput().value.trim().toLowerCase();
  if(!/^[a-z]{5}$/.test(guess)){ alert("Type a 5-letter word"); return; }
  const row=document.createElement("div"); row.className="row"; row.dataset.guess=guess;
  for(let i=0;i<5;i++){
    const tile=document.createElement("div"); tile.className="tile state-0";
    tile.textContent=guess[i].toUpperCase(); tile.dataset.state="0"; tile.dataset.pos=i;
    tile.addEventListener("click",()=>cycleTileState(tile));
    row.appendChild(tile);
  }
  boardEl.appendChild(row);
  guessInput().value="";
}

function cycleTileState(tile){
  let s=parseInt(tile.dataset.state||"0");
  s=(s+1)%3;
  tile.dataset.state=s;
  tile.classList.remove("state-0","state-1","state-2");
  tile.classList.add(`state-${s}`);
}

/* --- FEEDBACK --- */
function onApplyFeedback(){
  const row=boardEl.querySelector(".row:last-child");
  if(!row){ alert("Add a guess first"); return; }
  const guess=row.dataset.guess;
  const states=Array.from(row.querySelectorAll(".tile")).map(t=>parseInt(t.dataset.state||"0"));
  const pattern=states.join("");
  possibleWords = possibleWords.filter(sol=>getPattern(guess,sol)===pattern);
  setStatus(`Applied feedback for ${guess.toUpperCase()}. Remaining: ${possibleWords.length}`);
  updateStatsAndSuggestions();
}

function resetAll(){
  possibleWords = [...allWords];
  boardEl.innerHTML=""; suggestionsEl.innerHTML="";
  setStatus(`Reset — ${possibleWords.length} words loaded.`);
  updateStatsAndSuggestions();
}

/* --- PATTERN --- */
function getPattern(guess,solution){
  const g=guess.split(""), s=solution.split("");
  const pattern=[0,0,0,0,0], used=[false,false,false,false,false];
  for(let i=0;i<5;i++){ if(g[i]===s[i]){ pattern[i]=2; used[i]=true; } }
  for(let i=0;i<5;i++){ if(pattern[i]===2) continue;
    for(let j=0;j<5;j++){ if(!used[j] && g[i]===s[j]){ pattern[i]=1; used[j]=true; break; } } }
  return pattern.join("");
}

/* --- SUGGESTIONS --- */
let lastSuggestionResults=[];
async function updateStatsAndSuggestions(){
  possibleCountEl.textContent = possibleWords.length;
  const bits = Math.log2(243);
  const minG = Math.ceil(Math.log2(Math.max(1,possibleWords.length))/bits);
  minGuessesEl.textContent = minG===0?"0 (solved)":minG;
  await computeAndShowSuggestions();
}

async function computeAndShowSuggestions(){
  suggestionsEl.innerHTML=""; computingEl.classList.remove("hidden"); await sleep(20);
  const freq={};
  for(const w of possibleWords){ const seen=new Set();
    for(const c of w){ if(!seen.has(c)){ freq[c]=(freq[c]||0)+1; seen.add(c); } } }

  function baseScore(word){ let seen=new Set(),score=0; for(const c of word){ if(!seen.has(c)){ score+=freq[c]||0; seen.add(c); } } return score; }

  let scored = allWords.map(w=>({w,s:baseScore(w)}));
  scored.sort((a,b)=>b.s - a.s);
  let K = Math.min(MAX_CANDIDATES, scored.length);
  let topKWords = scored.slice(0,K).map(x=>x.w);
  let candidatePool = topKWords.slice();
  if(possibleWords.length<=80){ const combined=new Set(candidatePool.concat(possibleWords)); candidatePool=Array.from(combined); }

  const N = possibleWords.length||1; const results=[];
  for(let idx=0; idx<candidatePool.length; idx++){
    const candidate = candidatePool[idx]; const counts = new Map();
    for(const sol of possibleWords){ const pat = getPattern(candidate,sol); counts.set(pat,(counts.get(pat)||0)+1); }
    let sumSq = 0; for(const c of counts.values()) sumSq+=c*c;
    let expectedRemaining=sumSq/N;
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
    const meta=document.createElement("div"); meta.className="sugg-meta";
    meta.innerHTML=`exp: <strong>${r.expectedRemaining.toFixed(1)}</strong> • entropy: ${r.entropy.toFixed(2)} • score: ${r.baseScore}`;
    left.appendChild(wd); left.appendChild(meta);
    const useBtn=document.createElement("button"); useBtn.className="useBtn"; useBtn.textContent="Use";
    useBtn.addEventListener("click",()=>{ guessInput().value=r.word; guessInput().focus(); });
    li.appendChild(left); li.appendChild(useBtn);
    suggestionsEl.appendChild(li);
  }
  computingEl.classList.add("hidden");
}

/* --- SIMULATION --- */
function patternToEmojis(pat){ return pat.split("").map(d=>d==="2"?"🟩":d==="1"?"🟨":"⬛").join(""); }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function randomTop3(arr){ const top3=arr.slice(0,3); if(top3.length===0) return arr[0]; return top3[Math.floor(Math.random()*top3.length)]; }

async function singleWordSimulation(){
  const target=simTargetEl.value.trim().toLowerCase();
  let guess=simStartEl.value.trim().toLowerCase();
  if(!allWords.includes(target)||!allWords.includes(guess)){ alert("Words not in dictionary"); return; }
  let possible=[...allWords]; let moves=0;
  simResultEl.textContent="";
  while(guess!==target && moves<20){
    moves++;
    const pat=getPattern(guess,target);
    simResultEl.textContent=`Move ${moves}: ${guess.toUpperCase()} → ${patternToEmojis(pat)}`;
    await sleep(200);
    possible=possible.filter(w=>getPattern(guess,w)===pat);
    if(possible.length===0) break;
    guess=(moves>=3)?possible[0]:randomTop3(possible);
  }
  simResultEl.textContent+=`\nSolved in ${moves>6?7:moves} moves! ✅`;
}

async function batchSimulation(){
  const start=batchStartEl.value.trim().toLowerCase(), speed=parseInt(batchSpeedEl.value)||200;
  const sims=20, movesArr=[];
  batchResultEl.textContent="";
  for(let i=0;i<sims;i++){
    let target=allWords[Math.floor(Math.random()*allWords.length)];
    let guess=start, possible=[...allWords], moves=0;
    batchResultEl.textContent+=`Game ${i+1}, target=${target.toUpperCase()}\n`;
    while(guess!==target && moves<20){
      moves++;
      const pat=getPattern(guess,target);
      batchResultEl.textContent+=`  Move ${moves}: ${guess.toUpperCase()} → ${patternToEmojis(pat)}\n`;
      await sleep(speed);
      possible=possible.filter(w=>getPattern(guess,w)===pat);
      if(possible.length===0) break;
      guess=(moves>=3)?possible[0]:randomTop3(possible);
    }
    movesArr.push(moves>6?7:moves);
    batchResultEl.textContent+=`Solved in ${moves>6?7:moves} moves ✅\n\n`;
    await sleep(speed);
  }
  const avg=Math.round(movesArr.reduce((a,b)=>a+b,0)/movesArr.length*100)/100;
  batchResultEl.textContent+=`Average moves: ${avg}`;
}
