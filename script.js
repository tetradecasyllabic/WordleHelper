// ---------- CONFIG ----------
const RAW_URL = "words.txt";
let allWords = [];
let possibleWords = [];
const MAX_CANDIDATES = 120;

// ---------- DOM ----------
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
const sortSelect = document.getElementById("sortSelect");

document.addEventListener("DOMContentLoaded", init);
addRowBtn.addEventListener("click", onAddRow);
applyBtn.addEventListener("click", onApplyFeedback);
resetBtn.addEventListener("click", resetAll);
guessInput().addEventListener("keydown", e => { if(e.key==="Enter") onAddRow(); });
sortSelect?.addEventListener("change", updateStatsAndSuggestions);

// ---------- INIT ----------
async function init(){
  setStatus("Loading words...");
  try {
    const r = await fetch(RAW_URL, {cache: "no-cache"});
    const txt = await r.text();
    allWords = txt.split(/\r?\n/).map(s=>s.trim().toLowerCase()).filter(Boolean);
    possibleWords = [...allWords];
    setStatus(`Loaded ${allWords.length} words.`);
    updateStatsAndSuggestions();
  } catch(e){
    console.error(e);
    setStatus("Failed to load words. Check words.txt and CORS.");
  }
}

function setStatus(s){ statusEl.textContent = s; }

// ---------- BOARD ----------
function onAddRow(){
  const guess = guessInput().value.trim().toLowerCase();
  if(!/^[a-z]{5}$/.test(guess)){ alert("Type a 5-letter word (a-z)"); return; }

  const row = document.createElement("div");
  row.className = "row";
  row.dataset.guess = guess;

  for(let i=0;i<5;i++){
    const tile = document.createElement("div");
    tile.className = "tile state-0";
    tile.textContent = guess[i].toUpperCase();
    tile.dataset.state = "0";
    tile.dataset.pos = i;
    tile.addEventListener("click", ()=>cycleTileState(tile));
    row.appendChild(tile);
  }

  boardEl.appendChild(row); // stack downward
  guessInput().value = "";
  guessInput().focus();
}

function cycleTileState(tile){
  let s = parseInt(tile.dataset.state||"0",10);
  s = (s+1)%3;
  tile.dataset.state = s;
  tile.classList.remove("state-0","state-1","state-2");
  tile.classList.add(`state-${s}`);
}

// ---------- FEEDBACK ----------
function onApplyFeedback(){
  const row = boardEl.lastElementChild;
  if(!row){ alert("Add a guess row first."); return; }

  const guess = row.dataset.guess;
  const states = Array.from(row.querySelectorAll(".tile")).map(t=>parseInt(t.dataset.state||"0",10));
  const pattern = states.join("");
  possibleWords = possibleWords.filter(sol => getPattern(guess, sol) === pattern);
  setStatus(`Applied feedback for ${guess.toUpperCase()}. Remaining: ${possibleWords.length}`);
  updateStatsAndSuggestions();
}

function resetAll(){
  possibleWords = [...allWords];
  boardEl.innerHTML = "";
  suggestionsEl.innerHTML = "";
  setStatus(`Reset — ${possibleWords.length} words loaded.`);
  updateStatsAndSuggestions();
}

// ---------- PATTERN ----------
function getPattern(guess, solution){
  const g = guess.split(""), s = solution.split("");
  const pattern = [0,0,0,0,0], used = [false, false, false, false, false];

  for(let i=0;i<5;i++){ if(g[i]===s[i]){pattern[i]=2; used[i]=true;} }

  for(let i=0;i<5;i++){
    if(pattern[i]===2) continue;
    for(let j=0;j<5;j++){
      if(!used[j] && g[i]===s[j]){ pattern[i]=1; used[j]=true; break; }
    }
  }
  return pattern.join("");
}

// ---------- SUGGESTIONS ----------
let lastSuggestionResults = [];

async function updateStatsAndSuggestions(){
  possibleCountEl.textContent = possibleWords.length;
  const bitsPerGuess = Math.log2(243);
  const minG = Math.ceil(Math.log2(Math.max(1,possibleWords.length))/bitsPerGuess);
  minGuessesEl.textContent = minG===0?"0 (solved)":minG;
  await computeAndShowSuggestions();
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function computeAndShowSuggestions(){
  if(possibleWords.length<=10){
    suggestionsEl.innerHTML="";
    possibleWords.forEach(w=>{
      const li = document.createElement("li");
      li.textContent = w.toUpperCase();
      suggestionsEl.appendChild(li);
    });
    expectedAfterEl.textContent="—";
    computingEl.classList.add("hidden");
    return;
  }

  suggestionsEl.innerHTML="";
  computingEl.classList.remove("hidden");
  await sleep(20);

  // freq scoring
  const freq={};
  for(const w of possibleWords){
    const seen = new Set();
    for(const ch of w){ if(!seen.has(ch)){ freq[ch]=(freq[ch]||0)+1; seen.add(ch); } }
  }
  const baseScore = w=>{ let seen=new Set(), s=0; for(const ch of w){ if(!seen.has(ch)){s+=freq[ch]; seen.add(ch);} } return s; };
  const scored = allWords.map(w=>({w,s:baseScore(w)})).sort((a,b)=>b.s-a.s);
  let topK = scored.slice(0,Math.min(MAX_CANDIDATES,scored.length)).map(x=>x.w);
  if(possibleWords.length<=80){ topK = Array.from(new Set(topK.concat(possibleWords))); }

  // expected remaining + entropy
  const N = possibleWords.length||1;
  const results=[];
  for(let idx=0;idx<topK.length;idx++){
    const candidate=topK[idx], counts=new Map();
    for(const sol of possibleWords){
      const pat=getPattern(candidate,sol);
      counts.set(pat,(counts.get(pat)||0)+1);
    }
    let sumSq=0,entropy=0;
    for(const c of counts.values()){ sumSq+=c*c; const p=c/N; entropy-=(p*Math.log2(p)||0); }
    results.push({word:candidate, expectedRemaining:sumSq/N, entropy, baseScore:baseScore(candidate), overall:baseScore(candidate)-sumSq/N});
    if(idx%40===0) await sleep(0);
  }

  const sortMode = sortSelect?.value || "exp";
  if(sortMode==="entropy"){ results.sort((a,b)=>b.entropy-a.entropy||a.expectedRemaining-b.expectedRemaining); }
  else if(sortMode==="overall"){ results.sort((a,b)=>b.overall-b.overall||a.expectedRemaining-b.expectedRemaining); }
  else{ results.sort((a,b)=>a.expectedRemaining-b.expectedRemaining||b.entropy-a.entropy); }

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
  
