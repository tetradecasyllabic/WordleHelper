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
guessInput().addEventListener("keydown", e => { if(e.key==="Enter") onAddRow(); });

async function init() {
  setStatus("Loading words...");
  try {
    const r = await fetch(RAW_URL, { cache: "no-cache" });
    const txt = await r.text();
    allWords = txt.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
    possibleWords = [...allWords];
    setStatus(`Loaded ${allWords.length} words.`);
    updateStatsAndSuggestions();
  } catch(err) { 
    console.error(err); 
    setStatus("Failed to load words."); 
  }
}

function setStatus(s){ statusEl.textContent = s; }

function onAddRow() {
  const guess = guessInput().value.trim().toLowerCase();
  if(!/^[a-z]{5}$/.test(guess)){ alert("Type a 5-letter word."); return; }
  const row = document.createElement("div");
  row.className = "row"; 
  row.dataset.guess = guess;
  for(let i=0;i<5;i++){
    const tile = document.createElement("div");
    tile.className="tile state-0"; 
    tile.textContent=guess[i].toUpperCase();
    tile.dataset.state="0"; 
    tile.dataset.pos=i;
    tile.addEventListener("click",()=>{ cycleTileState(tile); });
    row.appendChild(tile);
  }
  boardEl.appendChild(row);
  guessInput().value="";
}

function cycleTileState(tile){
  let s=parseInt(tile.dataset.state||"0",10); 
  s=(s+1)%3;
  tile.dataset.state=s.toString();
  tile.classList.remove("state-0","state-1","state-2");
  tile.classList.add(`state-${s}`);
}

function onApplyFeedback() {
  possibleWords = [...allWords];
  const rows = Array.from(boardEl.querySelectorAll(".row"));
  for(const row of rows){
    const guess = row.dataset.guess;
    const states = Array.from(row.querySelectorAll(".tile")).map(t=>parseInt(t.dataset.state||"0",10));
    const pattern = states.join("");
    possibleWords = possibleWords.filter(sol=>getPattern(guess,sol)===pattern);
  }
  setStatus(`Remaining: ${possibleWords.length}`);
  updateStatsAndSuggestions();
}

function resetAll(){
  possibleWords=[...allWords];
  boardEl.innerHTML="";
  suggestionsEl.innerHTML="";
  setStatus(`Reset — ${possibleWords.length} words loaded.`);
  updateStatsAndSuggestions();
}

// ✅ duplicate letters handled properly
function getPattern(guess, solution){
  const g=guess.split(""); 
  const s=solution.split(""); 
  const pattern=[0,0,0,0,0];
  const counts={};
  for(let i=0;i<5;i++){ 
    if(g[i]===s[i]) pattern[i]=2; 
    else counts[s[i]]=(counts[s[i]]||0)+1; 
  }
  for(let i=0;i<5;i++){ 
    if(pattern[i]===0 && counts[g[i]]>0){ 
      pattern[i]=1; 
      counts[g[i]]--; 
    } 
  }
  return pattern.join("");
}

let lastSuggestionResults=[];
async function updateStatsAndSuggestions(){
  possibleCountEl.textContent=possibleWords.length;
  const bitsPerGuess=Math.log2(243);
  const minG=Math.ceil(Math.log2(Math.max(1,possibleWords.length))/bitsPerGuess);
  minGuessesEl.textContent=minG===0?"0 (solved)":String(minG);
  await computeAndShowSuggestions();
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function computeAndShowSuggestions(){
  suggestionsEl.innerHTML=""; 
  computingEl.classList.remove("hidden"); 
  await sleep(20);

  const freq={}; 
  for(const w of possibleWords){ 
    const seen=new Set(); 
    for(const ch of w){ 
      if(!seen.has(ch)){ 
        freq[ch]=(freq[ch]||0)+1; 
        seen.add(ch); 
      } 
    } 
  }

  function baseScore(word){ 
    let seen=new Set(); let score=0; 
    for(const ch of word){ 
      if(!seen.has(ch)){ 
        score+=freq[ch]||0; 
        seen.add(ch); 
      } 
    } 
    return score; 
  }

  const scored=allWords.map(w=>({w,s:baseScore(w)})).sort((a,b)=>b.s-a.s);
  const K=Math.min(MAX_CANDIDATES,scored.length);
  let candidatePool=scored.slice(0,K).map(x=>x.w);
  if(possibleWords.length<=80){ 
    const combined=new Set(candidatePool.concat(possibleWords)); 
    candidatePool=Array.from(combined); 
  }

  const N=possibleWords.length||1; 
  const results=[];
  for(let idx=0;idx<candidatePool.length;idx++){
    const candidate=candidatePool[idx]; 
    const counts=new Map();
    for(const sol of possibleWords){ 
      const pat=getPattern(candidate,sol); 
      counts.set(pat,(counts.get(pat)||0)+1); 
    }
    let sumSq=0; 
    for(const c of counts.values()) sumSq+=c*c;
    const expectedRemaining=sumSq/N;
    let entropy=0; 
    for(const c of counts.values()){ 
      const p=c/N; 
      entropy-=p*(Math.log2(p)||0); 
    }
    results.push({word:candidate,expectedRemaining,entropy,baseScore:baseScore(candidate)});
    if(idx%40===0) await sleep(0);
  }

  results.sort((a,b)=>a.expectedRemaining!==b.expectedRemaining?a.expectedRemaining-b.expectedRemaining:b.entropy-b.entropy);
  lastSuggestionResults=results;

  const topResults = results.length <= 10 ? results : results.slice(0,10);
  expectedAfterEl.textContent=topResults.length?Math.round(topResults[0].expectedRemaining):"—";

  suggestionsEl.innerHTML="";
  for(const r of topResults){
    const li=document.createElement("li");
    const left=document.createElement("div"); left.className="sugg-left";
    const wd=document.createElement("div"); wd.className="sugg-word"; wd.textContent=r.word.toUpperCase();
    const meta=document.createElement("div"); meta.className="sugg-meta";
    meta.innerHTML=`exp: <strong>${r.expectedRemaining.toFixed(1)}</strong> • entropy: ${r.entropy.toFixed(2)} • score: ${r.baseScore}`;
    left.appendChild(wd); left.appendChild(meta);
    const useBtn=document.createElement("button"); 
    useBtn.className="useBtn"; 
    useBtn.textContent="Use";
    useBtn.addEventListener("click",()=>{ 
      guessInput().value=r.word; 
      guessInput().focus(); 
    });
    li.appendChild(left); 
    li.appendChild(useBtn); 
    suggestionsEl.appendChild(li);
  }

  computingEl.classList.add("hidden");
}
