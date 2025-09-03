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

const simStartEl = document.getElementById("simStart");
const simTargetEl = document.getElementById("simTarget");
const simBtn = document.getElementById("simBtn");
const simResultEl = document.getElementById("simResult");

const batchStartEl = document.getElementById("batchStart");
const batchCountEl = document.getElementById("batchCount");
const batchSpeedEl = document.getElementById("batchSpeed");
const batchBtn = document.getElementById("batchBtn");
const batchResultEl = document.getElementById("batchResult");

document.addEventListener("DOMContentLoaded", init);
addRowBtn.addEventListener("click", onAddRow);
applyBtn.addEventListener("click", onApplyFeedback);
resetBtn.addEventListener("click", resetAll);
guessInput().addEventListener("keydown", (e) => { if (e.key === "Enter") onAddRow(); });
simBtn.addEventListener("click", singleWordSimulation);
batchBtn.addEventListener("click", batchSimulation);

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

let lastSuggestionResults=[];

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
  lastSuggestionResults=results;
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

function patternToEmojis(pat){ return pat.split("").map(d=>d==="2"?"🟩":d==="1"?"🟨":"⬛").join(""); }

async function singleWordSimulation(){
  const start=simStartEl.value.trim().toLowerCase();
  const target=simTargetEl.value.trim().toLowerCase();
  if(!allWords.includes(start)||!allWords.includes(target)){ alert("Invalid word"); return; }
  let guess=start, possible=[...allWords], moves=0;
  simResultEl.textContent="";
  while(guess!==target && moves<10){
    moves++;
    const pat=getPattern(guess,target);
    simResultEl.textContent=`Move ${moves}: ${guess.toUpperCase()} → ${patternToEmojis(pat)}`;
    await sleep(500);
    possible=possible.filter(w=>getPattern(guess,w)===pat);
    if(guess===target) break;
    if(!possible.length) break;
    let results;
    if(moves<=3){ results=await computeSuggestions(allWords); }
    else{ results=await computeSuggestions(possible); }
    guess=results[0].word;
  }
  if(guess===target){ simResultEl.textContent+=`\nSolved in ${moves>6?7:moves} moves ✅`; }
  else{ simResultEl.textContent+=`\nFailed ❌ target was ${target.toUpperCase()}`; }
}

async function batchSimulation(){
  const start=batchStartEl.value.trim().toLowerCase();
  const games=+batchCountEl.value||20;
  const speed=+batchSpeedEl.value||200;
  let total=0;
  batchResultEl.textContent="";
  for(let g=1;g<=games;g++){
    const target=allWords[Math.floor(Math.random()*allWords.length)];
    let guess=start, possible=[...allWords], moves=0;
    while(guess!==target && moves<10){
      moves++;
      const pat=getPattern(guess,target);
      possible=possible.filter(w=>getPattern(guess,w)===pat);
      if(guess===target) break;
      if(!possible.length) break;
      let results;
      if(moves<=3){ results=await computeSuggestions(allWords); }
      else{ results=await computeSuggestions(possible); }
      guess=results[0].word;
      await sleep(speed);
    }
    const solved=guess===target?(moves>6?7:moves):7;
    total+=solved;
    batchResultEl.textContent=`Game ${g}: ${target.toUpperCase()} → ${guess.toUpperCase()} in ${solved} moves\nAvg: ${(total/g).toFixed(2)}`;
  }
}
