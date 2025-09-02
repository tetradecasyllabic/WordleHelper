const RAW_URL = "words.txt";

let allWords = [];
let possibleWords = [];
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

document.addEventListener("DOMContentLoaded", init);
addRowBtn.addEventListener("click", onAddRow);
applyBtn.addEventListener("click", onApplyFeedback);
resetBtn.addEventListener("click", resetAll);
guessInput().addEventListener("keydown", (e) => { if(e.key==="Enter") onAddRow(); });

async function init(){
  setStatus("Loading words...");
  try{
    const r = await fetch(RAW_URL, {cache:"no-cache"});
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

/* BOARD */
function onAddRow(){
  const guess = guessInput().value.trim().toLowerCase();
  if(!/^[a-z]{5}$/.test(guess)){ alert("Type 5 letters."); return; }
  const row = document.createElement("div");
  row.className = "row"; row.dataset.guess=guess;
  for(let i=0;i<5;i++){
    const tile = document.createElement("div");
    tile.className="tile state-0";
    tile.textContent=guess[i].toUpperCase();
    tile.dataset.state="0"; tile.dataset.pos=i;
    tile.addEventListener("click",()=>{ cycleTileState(tile); });
    row.appendChild(tile);
  }
  boardEl.prepend(row); guessInput().value="";
}

function cycleTileState(tile){
  let s = parseInt(tile.dataset.state||"0",10); s=(s+1)%3;
  tile.dataset.state=String(s);
  tile.classList.remove("state-0","state-1","state-2");
  tile.classList.add(`state-${s}`);
}

/* FEEDBACK */
function onApplyFeedback(){
  const row = boardEl.querySelector(".row");
  if(!row){ alert("Add a guess first."); return; }
  const guess=row.dataset.guess;
  const states = Array.from(row.querySelectorAll(".tile")).map(t=>parseInt(t.dataset.state||"0",10));
  const pattern = states.join("");
  possibleWords = possibleWords.filter(sol=>getPattern(guess, sol)===pattern);
  setStatus(`Applied ${guess.toUpperCase()}. Remaining: ${possibleWords.length}`);
  updateStatsAndSuggestions();
}

function resetAll(){
  possibleWords=[...allWords];
  boardEl.innerHTML=""; suggestionsEl.innerHTML="";
  setStatus(`Reset — ${possibleWords.length} words loaded.`);
  updateStatsAndSuggestions();
}

/* PATTERN */
function getPattern(guess, solution){
  const g=guess.split(""), s=solution.split("");
  const pattern=[0,0,0,0,0], used=[false,false,false,false,false];
  for(let i=0;i<5;i++){ if(g[i]===s[i]){pattern[i]=2; used[i]=true;} }
  for(let i=0;i<5;i++){ if(pattern[i]===2) continue;
    for(let j=0;j<5;j++){ if(!used[j]&&g[i]===s[j]){pattern[i]=1; used[j]=true; break;} } }
  return pattern.join("");
}

/* SUGGESTIONS */
let lastSuggestionResults=[];
async function updateStatsAndSuggestions(){
  possibleCountEl.textContent=possibleWords.length;
  const bitsPerGuess=Math.log2(243);
  const minG=Math.ceil(Math.log2(Math.max(1, possibleWords.length))/bitsPerGuess);
  minGuessesEl.textContent=minG===0?"0 (solved)":String(minG);
  await computeAndShowSuggestions();
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function computeAndShowSuggestions(){
  suggestionsEl.innerHTML=""; computingEl.classList.remove("hidden");
  await sleep(20);
  const freq={};
  for(const w of possibleWords){ const seen=new Set(); for(const ch of w){ if(!seen.has(ch)){freq[ch]=(freq[ch]||0)+1; seen.add(ch);}}}
  function baseScore(word){ const seen=new Set(); let score=0; for(const ch of word){ if(!seen.has(ch)){score+=(freq[ch]||0); seen.add(ch);}} return score; }
  const scored=allWords.map(w=>({w,s:baseScore(w)})).sort((a,b)=>b.s-a.s);
  const K=Math.min(MAX_CANDIDATES, scored.length);
  let candidatePool=scored.slice(0,K).map(x=>x.w);
  if(possibleWords.length<=80){ const combined=new Set(candidatePool.concat(possibleWords)); candidatePool=Array.from(combined);}
  const N=possibleWords.length||1; const results=[];
  for(let idx=0;idx<candidatePool.length;idx++){
    const candidate=candidatePool[idx]; const counts=new Map();
    for(const sol of possibleWords){ const pat=getPattern(candidate,sol); counts.set(p
