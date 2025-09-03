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
guessInput().addEventListener("keydown", (e) => { if (e.key === "Enter") onAddRow(); });

async function init(){
  setStatus("Loading words...");
  try {
    const r = await fetch(RAW_URL, {cache:"no-cache"});
    const txt = await r.text();
    allWords = txt.split(/\r?\n/).map(s=>s.trim().toLowerCase()).filter(Boolean);
    possibleWords = [...allWords];
    setStatus(`Loaded ${allWords.length} words`);
    updateStatsAndSuggestions();
  } catch(err){
    console.error(err);
    setStatus("Failed to load words.");
  }
}

function setStatus(s){ statusEl.textContent = s; }

function onAddRow(){
  const guess = guessInput().value.trim().toLowerCase();
  if (!/^[a-z]{5}$/.test(guess)){ alert("Type 5-letter word"); return; }
  const row = document.createElement("div");
  row.className = "row"; row.dataset.guess = guess;
  for (let i=0;i<5;i++){
    const tile = document.createElement("div");
    tile.className = "tile state-0";
    tile.textContent = guess[i].toUpperCase();
    tile.dataset.state="0"; tile.dataset.pos=i;
    tile.addEventListener("click", ()=>cycleTileState(tile));
    row.appendChild(tile);
  }
  boardEl.appendChild(row);
  guessInput().value="";
}

function cycleTileState(tile){
  let s = parseInt(tile.dataset.state||"0",10);
  s=(s+1)%3;
  tile.dataset.state=String(s);
  tile.className=`tile state-${s}`;
}

function onApplyFeedback(){
  const rows = boardEl.querySelectorAll(".row");
  if (!rows.length){ alert("Add row first"); return; }
  const row = rows[rows.length-1];
  const guess = row.dataset.guess;
  const states = Array.from(row.querySelectorAll(".tile")).map(t=>+t.dataset.state);
  const pattern = states.join("");
  possibleWords = possibleWords.filter(sol => getPattern(guess,sol)===pattern);
  setStatus(`Applied ${guess.toUpperCase()}, left ${possibleWords.length}`);
  updateStatsAndSuggestions();
}

function resetAll(){
  possibleWords=[...allWords];
  boardEl.innerHTML=""; suggestionsEl.innerHTML="";
  setStatus(`Reset — ${possibleWords.length} words`);
  updateStatsAndSuggestions();
}

function getPattern(guess,solution){
  const g=guess.split(""), s=solution.split("");
  const pat=[0,0,0,0,0], used=[0,0,0,0,0];
  for (let i=0;i<5;i++){ if (g[i]===s[i]){ pat[i]=2; used[i]=1; } }
  for (let i=0;i<5;i++){ if (pat[i]===2) continue;
    for (let j=0;j<5;j++){ if (!used[j]&&g[i]===s[j]){ pat[i]=1; used[j]=1; break; } }
  }
  return pat.join("");
}

async function updateStatsAndSuggestions(){
  possibleCountEl.textContent=possibleWords.length;
  const bitsPerGuess=Math.log2(243);
  const minG=Math.ceil(Math.log2(Math.max(1,possibleWords.length))/bitsPerGuess);
  minGuessesEl.textContent=minG;
  await computeAndShowSuggestions();
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function computeSuggestions(pool){
  const freq={};
  for (const w of possibleWords){
    const seen=new Set();
    for (const ch of w){ if(!seen.has(ch)){ freq[ch]=(freq[ch]||0)+1; seen.add(ch); } }
  }
  function baseScore(word){
    let score=0, seen=new Set();
    for (const ch of word){ if(!seen.has(ch)){ score+=(freq[ch]||0); seen.add(ch); } }
    return score;
  }
  const scored=pool.map(w=>({w,s:baseScore(w)})).sort((a,b)=>b.s-a.s);
  const K=Math.min(MAX_CANDIDATES,scored.length);
  const topK=scored.slice(0,K).map(x=>x.w);
  let candidatePool=topK;
  if (possibleWords.length<=80){
    candidatePool=[...new Set([...candidatePool,...possibleWords])];
  }
  const results=[];
  const N=possibleWords.length||1;
  for (let i=0;i<candidatePool.length;i++){
    const cand=candidatePool[i];
    const counts=new Map();
    for (const sol of possibleWords){
      const pat=getPattern(cand,sol);
      counts.set(pat,(counts.get(pat)||0)+1);
    }
    let sumSq=0, entropy=0;
    for (const c of counts.values()){
      sumSq+=c*c; const p=c/N; entropy-=p*(Math.log2(p)||0);
    }
    results.push({word:cand,expectedRemaining:sumSq/N,entropy,baseScore:baseScore(cand)});
    if (i%40===0) await sleep(0);
  }
  results.sort((a,b)=>a.expectedRemaining-b.expectedRemaining||b.entropy-a.entropy);
  return results;
}

async function computeAndShowSuggestions(){
  suggestionsEl.innerHTML=""; computingEl.classList.remove("hidden"); await sleep(20);
  const results=await computeSuggestions(allWords);
  const top10=results.slice(0,10);
  expectedAfterEl.textContent=top10.length?Math.round(top10[0].expectedRemaining):"—";
  suggestionsEl.innerHTML="";
  for (const r of top10){
    const li=document.createElement("li");
    li.innerHTML=`<div class="sugg-left"><div class="sugg-word">${r.word.toUpperCase()}</div>
      <div class="sugg-meta">exp: <b>${r.expectedRemaining.toFixed(1)}</b> • entropy: ${r.entropy.toFixed(2)} • score: ${r.baseScore}</div></div>`;
    const btn=document.createElement("button"); btn.textContent="Use";
    btn.addEventListener("click",()=>{ guessInput().value=r.word; });
    li.appendChild(btn); suggestionsEl.appendChild(li);
  }
  computingEl.classList.add("hidden");
}
