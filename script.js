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
const possibleAnswersWrap = document.getElementById("possibleAnswersWrap");
const possibleAnswersEl = document.getElementById("possibleAnswers");

document.addEventListener("DOMContentLoaded", init);
addRowBtn.addEventListener("click", onAddRow);
applyBtn.addEventListener("click", onApplyFeedback);
resetBtn.addEventListener("click", resetAll);
guessInput().addEventListener("keydown", e => { if(e.key==="Enter") onAddRow(); });

async function init() {
  setStatus("Loading words...");
  try {
    // NOTE: This assumes you have a file named 'words.txt' in the same directory
    // containing a list of 5-letter words, one per line.
    const r = await fetch(RAW_URL, { cache: "no-cache" });
    const txt = await r.text();
    allWords = txt.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
    possibleWords = [...allWords];
    setStatus(`Loaded ${allWords.length} words.`);
    updateStatsAndSuggestions();
  } catch(err) {
    console.error(err);
    setStatus("Failed to load words. Check console for details.");
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
  s=(s+1)%3; // 0=Gray/Absent, 1=Yellow/Present, 2=Green/Correct
  tile.dataset.state=s.toString();
  tile.classList.remove("state-0","state-1","state-2");
  tile.classList.add(`state-${s}`);
}

function onApplyFeedback() {
  // Apply all feedbacks cumulatively
  possibleWords = [...allWords];
  const rows = Array.from(boardEl.querySelectorAll(".row"));
  for(const row of rows){
    const guess = row.dataset.guess;
    const states = Array.from(row.querySelectorAll(".tile")).map(t=>parseInt(t.dataset.state||"0",10));
    const pattern = states.join("");
    // Filter the possible words by applying the pattern to each one
    possibleWords = possibleWords.filter(sol=>getPattern(guess,sol)===pattern);
  }
  setStatus(`Remaining: ${possibleWords.length} possible words.`);
  updateStatsAndSuggestions();
}

function resetAll(){
  possibleWords=[...allWords];
  boardEl.innerHTML="";
  suggestionsEl.innerHTML="";
  possibleAnswersEl.innerHTML="";
  possibleAnswersWrap.classList.add("hidden"); // Hide the list initially
  setStatus(`Reset — ${possibleWords.length} words loaded.`);
  updateStatsAndSuggestions();
}

/**
 * Calculates the feedback pattern (e.g., "01200") for a guess against a solution.
 * 0: Gray (Absent), 1: Yellow (Present), 2: Green (Correct)
 */
function getPattern(guess, solution){
  const g=guess.split(""); 
  const s=solution.split(""); 
  const pattern=[0,0,0,0,0];
  const counts={};

  // First pass: find all Green (2) tiles and count remaining letters in solution
  for(let i=0;i<5;i++){ 
    if(g[i]===s[i]) {
      pattern[i]=2; 
    } else {
      counts[s[i]]=(counts[s[i]]||0)+1; 
    }
  }

  // Second pass: find Yellow (1) tiles
  for(let i=0;i<5;i++){ 
    if(pattern[i]===0 && counts[g[i]]>0){ 
      pattern[i]=1; 
      counts[g[i]]--; 
    } 
  }

  // Remaining (where pattern[i] is still 0) are Gray (0)
  return pattern.join("");
}

let lastSuggestionResults=[];
async function updateStatsAndSuggestions(){
  possibleCountEl.textContent=possibleWords.length;

  // Theoretical Min Guesses calculation (based on information theory)
  const bitsPerGuess=Math.log2(243); // 3^5 possible patterns
  const minG=Math.ceil(Math.log2(Math.max(1,possibleWords.length))/bitsPerGuess);
  minGuessesEl.textContent=possibleWords.length<=1?"0 (solved)":String(minG);
  
  await computeAndShowSuggestions();
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

/**
 * Computes the best next guesses based on expected remaining answers and entropy.
 */
async function computeAndShowSuggestions(){
  suggestionsEl.innerHTML=""; 
  computingEl.classList.remove("hidden"); 
  await sleep(20); // Allow UI to update before long computation

  // 1. Calculate letter frequencies in the current possible answer set
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

  // Helper function to score a word based on unique letter frequencies
  function baseScore(word){ 
    let seen=new Set(); let score=0; 
    for(const ch of word){ 
      if(!seen.has(ch)){ 
        score+=(freq[ch]||0); 
        seen.add(ch); 
      } 
    } 
    return score; 
  }

  // 2. Select a candidate pool (top words by base score + all possible answers)
  const scored=allWords.map(w=>({w,s:baseScore(w)})).sort((a,b)=>b.s-a.s);
  const K=Math.min(MAX_CANDIDATES,scored.length);
  let candidatePool=scored.slice(0,K).map(x=>x.w);
  if(possibleWords.length<=80){ 
    // If few answers remain, include all of them in the pool
    const combined=new Set(candidatePool.concat(possibleWords)); 
    candidatePool=Array.from(combined); 
  }

  // 3. Evaluate each candidate word's effectiveness
  const N=possibleWords.length||1; 
  const results=[];
  for(let idx=0;idx<candidatePool.length;idx++){
    const candidate=candidatePool[idx]; 
    const counts=new Map(); // Map: pattern -> count of solutions that match pattern
    
    // Group all possible solutions by the pattern they would produce with this guess
    for(const sol of possibleWords){ 
      const pat=getPattern(candidate,sol); 
      counts.set(pat,(counts.get(pat)||0)+1); 
    }
    
    // Expected Remaining (Sum of (Bucket Size^2) / Total Possible)
    let sumSq=0; 
    for(const c of counts.values()) sumSq+=c*c;
    const expectedRemaining=sumSq/N;
    
    // Entropy (Information Gain)
    let entropy=0; 
    for(const c of counts.values()){ 
      const p=c/N; 
      entropy-=p*(Math.log2(p)||0); 
    }
    
    results.push({word:candidate,expectedRemaining,entropy,baseScore:baseScore(candidate)});
    
    // Yield execution every so often to keep the UI responsive
    if(idx%40===0) await sleep(0); 
  }

  // 4. Sort and display results
  // Primary sort: Expected Remaining (lower is better)
  // Secondary sort: Entropy (higher is better)
  results.sort((a,b)=>a.expectedRemaining!==b.expectedRemaining?a.expectedRemaining-b.expectedRemaining:b.entropy-a.entropy);
  lastSuggestionResults=results;

  const topResults = results.length <= 10 ? results : results.slice(0,10);
  expectedAfterEl.textContent=topResults.length?Math.round(topResults[0].expectedRemaining * 10) / 10:"—"; // Round to 1 decimal

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

  // 5. Update Possible Answers List
  possibleAnswersEl.innerHTML="";
  if(possibleWords.length>1 && possibleWords.length<50){
    possibleWords.forEach(w=>{
      const li=document.createElement("li"); 
      li.textContent=w.toUpperCase(); 
      possibleAnswersEl.appendChild(li);
    });
    possibleAnswersWrap.classList.remove("hidden");
  } else {
    // Hide the list if there's only one (solved) or too many (>50)
    possibleAnswersWrap.classList.add("hidden");
  }

  computingEl.classList.add("hidden");
}
