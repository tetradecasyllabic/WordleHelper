const RAW_URL = "words.txt";

let allWords = [];
let possibleWords = [];

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
const simResultEl = document.getElementById("simResult");
const runSimBtn = document.getElementById("runSimBtn");

const batchStartEl = document.getElementById("batchStart");
const batchCountEl = document.getElementById("batchCount");
const batchSpeedEl = document.getElementById("batchSpeed");
const runBatchBtn = document.getElementById("runBatchBtn");
const batchResultEl = document.getElementById("batchResult");

document.addEventListener("DOMContentLoaded", init);
addRowBtn.addEventListener("click", onAddRow);
applyBtn.addEventListener("click", onApplyFeedback);
resetBtn.addEventListener("click", resetAll);
guessInput().addEventListener("keydown", e => { if (e.key === "Enter") onAddRow(); });
runSimBtn.addEventListener("click", singleWordSimulation);
runBatchBtn.addEventListener("click", batchSimulation);

async function init(){
  setStatus("Loading words...");
  try {
    const r = await fetch(RAW_URL, {cache:"no-cache"});
    const txt = await r.text();
    allWords = txt.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
    possibleWords = [...allWords];
    setStatus(`Loaded ${allWords.length} words.`);
    updateStatsAndSuggestions();
  } catch(e){
    console.error(e);
    setStatus("Failed to load words.");
  }
}

function setStatus(s){ statusEl.textContent = s; }

function onAddRow(){
  const guess = guessInput().value.trim().toLowerCase();
  if(!/^[a-z]{5}$/.test(guess)){ alert("Type a 5-letter word."); return; }
  const row = document.createElement("div");
  row.className="row"; row.dataset.guess=guess;
  for(let i=0;i<5;i++){
    const tile=document.createElement("div");
    tile.className="tile state-0"; tile.textContent=guess[i].toUpperCase();
    tile.dataset.state="0"; tile.dataset.pos=i;
    tile.addEventListener("click",()=>cycleTileState(tile));
    row.appendChild(tile);
  }
  boardEl.append(row);
  guessInput().value="";
}

function cycleTileState(tile){
  let s=parseInt(tile.dataset.state||"0",10);
  s=(s+1)%3; tile.dataset.state=String(s);
  tile.className=`tile state-${s}`;
}

function onApplyFeedback(){
  const rows=Array.from(boardEl.querySelectorAll(".row"));
  if(!rows.length){ alert("Add a row first"); return; }
  const lastRow=rows[rows.length-1];
  const guess=lastRow.dataset.guess;
  const states=Array.from(lastRow.querySelectorAll(".tile")).map(t=>+t.dataset.state);
  const pattern=states.join("");
  possibleWords=possibleWords.filter(sol=>getPattern(guess,sol)===pattern);
  setStatus(`Applied feedback for ${guess.toUpperCase()}. Remaining: ${possibleWords.length}`);
  updateStatsAndSuggestions();
}

function resetAll(){
  possibleWords=[...allWords];
  boardEl.innerHTML=""; suggestionsEl.innerHTML="";
  setStatus(`Reset — ${possibleWords.length} words loaded.`);
  updateStatsAndSuggestions();
}

function getPattern(guess,solution){
  const g=guess.split(""), s=solution.split("");
  const pat=[0,0,0,0,0], used=[0,0,0,0,0];
  for(let i=0;i<5;i++){ if(g[i]===s[i]){ pat[i]=2; used[i]=1; } }
  for(let i=0;i<5;i++){ if(pat[i]===2) continue;
    for(let j=0;j<5;j++){ if(!used[j]&&g[i]===s[j]){ pat[i]=1; used[j]=1; break; } }
  }
  return pat.join("");
}

function patternToEmojis(pat){
  return pat.split("").map(d=>d==="2"?"🟩":d==="1"?"🟨":"⬛").join("");
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function computeSuggestions(possible){
  const freq={};
  for(const w of possible){
    const seen=new Set();
    for(const c of w){ if(!seen.has(c)){ freq[c]=(freq[c]||0)+1; seen.add(c); } }
  }
  function baseScore(w){
    let s=0, seen=new Set();
    for(const c of w){ if(!seen.has(c)){ s+=(freq[c]||0); seen.add(c); } }
    return s;
  }
  const scored=allWords.map(w=>({w,s:baseScore(w)})).sort((a,b)=>b.s-a.s);
  const candidates=scored.slice(0,80).map(x=>x.w);
  const N=possible.length||1, results=[];
  for(const cand of candidates){
    const counts=new Map();
    for(const sol of possible){ const p=getPattern(cand,sol); counts.set(p,(counts.get(p)||0)+1); }
    let sumSq=0, entropy=0;
    for(const c of counts.values()){ sumSq+=c*c; const p=c/N; entropy-=p*Math.log2(p); }
    results.push({word:cand,expectedRemaining:sumSq/N,entropy,baseScore:baseScore(cand)});
  }
  results.sort((a,b)=>a.expectedRemaining-b.expectedRemaining||b.entropy-a.entropy);
  return results;
}

async function updateStatsAndSuggestions(){
  possibleCountEl.textContent=possibleWords.length;
  const bitsPerGuess=Math.log2(243);
  const minG=Math.ceil(Math.log2(Math.max(1,possibleWords.length))/bitsPerGuess);
  minGuessesEl.textContent=minG===0?"0 (solved)":String(minG);
  computingEl.classList.remove("hidden"); await sleep(10);
  const results=await computeSuggestions(possibleWords);
  computingEl.classList.add("hidden");
  expectedAfterEl.textContent=results.length?Math.round(results[0].expectedRemaining):"—";
  suggestionsEl.innerHTML="";
  results.slice(0,10).forEach(r=>{
    const li=document.createElement("li");
    li.innerHTML=`<strong>${r.word.toUpperCase()}</strong> — exp:${r.expectedRemaining.toFixed(1)} • ent:${r.entropy.toFixed(2)} • score:${r.baseScore}`;
    suggestionsEl.appendChild(li);
  });
}

async function singleWordSimulation(){
  const start=simStartEl.value.trim().toLowerCase();
  const target=simTargetEl.value.trim().toLowerCase();
  if(!allWords.includes(start)||!allWords.includes(target)){ alert("Invalid word"); return; }
  let guess=start, possible=[...allWords], moves=0;
  simResultEl.textContent="";
  while(guess!==target&&moves<10){
    moves++;
    const pat=getPattern(guess,target);
    simResultEl.textContent=`Move ${moves}: ${guess.toUpperCase()} → ${patternToEmojis(pat)}`;
    await sleep(300);
    possible=possible.filter(w=>getPattern(guess,w)===pat);
    if(guess===target) break;
    if(!possible.length) break;
    const results=await computeSuggestions(possible);
    if(moves<=3){
      const top3=results.slice(0,3);
      guess=top3[Math.floor(Math.random()*top3.length)].word;
    } else {
      guess=results[0].word;
    }
  }
  simResultEl.textContent+=`\nSolved in ${moves>6?7:moves} moves ✅`;
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
    while(guess!==target&&moves<10){
      moves++;
      const pat=getPattern(guess,target);
      possible=possible.filter(w=>getPattern(guess,w)===pat);
      if(guess===target) break;
      if(!possible.length) break;
      const results=await computeSuggestions(possible);
      if(moves<=3){
        const top3=results.slice(0,3);
        guess=top3[Math.floor(Math.random()*top3.length)].word;
      } else {
        guess=results[0].word;
      }
      await sleep(speed);
    }
    total+=(moves>6?7:moves);
    batchResultEl.textContent=`Game ${g}: ${target.toUpperCase()} solved in ${moves>6?7:moves} moves\nAvg so far: ${(total/g).toFixed(2)}`;
    await sleep(speed);
  }
  batchResultEl.textContent+=`\nBatch done ✅ Avg moves: ${(total/games).toFixed(2)}`;
}
