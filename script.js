/* Wordle Helper - frontend only (works with local words.txt)
   - rows append at bottom
   - tile click cycles 0->1->2->0 (gray->yellow->green->gray)
   - shows Top 10 suggestions or final candidate list when <=10
   - sorting: lowest exp, highest entropy, best overall
*/

const RAW_URL = "words.txt"; // local file in repo root
const MAX_CANDIDATES = 120;  // tune for performance

let allWords = [];      // all allowed guesses
let possibleWords = []; // remaining possible solutions
let lastSuggestionResults = [];

const guessInputEl = () => document.getElementById("guessInput");
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
const suggestTitle = document.getElementById("suggestTitle");

document.addEventListener("DOMContentLoaded", init);
addRowBtn.addEventListener("click", onAddRow);
applyBtn.addEventListener("click", onApplyFeedback);
resetBtn.addEventListener("click", resetAll);
sortSelect.addEventListener("change", () => computeAndShowSuggestions());
guessInputEl().addEventListener("keydown", (e) => {
  if (e.key === "Enter") onAddRow();
});

async function init(){
  setStatus("Loading words...");
  try {
    const r = await fetch(RAW_URL, {cache: "no-cache"});
    const txt = await r.text();
    allWords = txt.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
    possibleWords = [...allWords];
    setStatus(`Loaded ${allWords.length} words.`);
    updateStatsAndSuggestions();
  } catch (err) {
    console.error(err);
    setStatus("Failed to load words. Put words.txt in repo root.");
  }
}

function setStatus(s){ statusEl.textContent = s; }

/* ---------- Board & tiles ---------- */

function onAddRow(){
  const guess = guessInputEl().value.trim().toLowerCase();
  if (!/^[a-z]{5}$/.test(guess)){
    alert("Please type a 5-letter word (a-z).");
    return;
  }
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.guess = guess;
  for (let i=0;i<5;i++){
    const tile = document.createElement("div");
    tile.className = "tile state-0";
    tile.textContent = guess[i].toUpperCase();
    tile.dataset.state = "0";
    tile.dataset.pos = i;
    tile.addEventListener("click", () => cycleTileState(tile));
    row.appendChild(tile);
  }
  boardEl.appendChild(row); // append to bottom (fix)
  guessInputEl().value = "";
  guessInputEl().focus();
}

function cycleTileState(tile){
  let s = parseInt(tile.dataset.state || "0", 10);
  s = (s + 1) % 3;
  tile.dataset.state = String(s);
  tile.classList.remove("state-0","state-1","state-2");
  tile.classList.add(`state-${s}`);
}

/* ---------- Apply feedback & filtering ---------- */

function onApplyFeedback(){
  // apply to the top-most (earliest) row that has not been applied? We'll apply to the last row added
  const rows = boardEl.querySelectorAll(".row");
  if (!rows.length){ alert("Add a guess row first."); return; }
  const row = rows[rows.length - 1]; // last row (bottom)
  const guess = row.dataset.guess;
  const states = Array.from(row.querySelectorAll(".tile")).map(t => parseInt(t.dataset.state || "0",10));
  const pattern = states.join(""); // e.g., "20100"
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

/* ---------- Wordle pattern generator (correct duplicate handling) ---------- */

function getPattern(guess, solution){
  // returns string of digits length 5: 0 absent, 1 present, 2 correct
  const g = guess.split("");
  const s = solution.split("");
  const pattern = [0,0,0,0,0];
  const used = [false, false, false, false, false];

  // greens first
  for (let i=0;i<5;i++){
    if (g[i] === s[i]){
      pattern[i] = 2;
      used[i] = true;
    }
  }
  // yellows
  for (let i=0;i<5;i++){
    if (pattern[i] === 2) continue;
    for (let j=0;j<5;j++){
      if (!used[j] && g[i] === s[j]){
        pattern[i] = 1;
        used[j] = true;
        break;
      }
    }
  }
  return pattern.join("");
}

/* ---------- Stats & suggestion flow ---------- */

function updateStatsAndSuggestions(){
  possibleCountEl.textContent = possibleWords.length;
  const bitsPerGuess = Math.log2(243); // 3^5 patterns
  const minG = Math.ceil(Math.log2(Math.max(1, possibleWords.length)) / bitsPerGuess);
  minGuessesEl.textContent = minG === 0 ? "0 (solved)" : String(minG);
  computeAndShowSuggestions();
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function computeAndShowSuggestions(){
  suggestionsEl.innerHTML = "";
  computingEl.classList.remove("hidden");
  await sleep(20);

  // Endgame: if small pool, just list them
  if (possibleWords.length <= 10){
    suggestTitle.textContent = "Remaining possible answers";
    suggestionsEl.innerHTML = "";
    for (const w of possibleWords){
      const li = document.createElement("li");
      const left = document.createElement("div");
      left.className = "sugg-left";
      const wd = document.createElement("div");
      wd.className = "sugg-word";
      wd.textContent = w.toUpperCase();
      const meta = document.createElement("div");
      meta.className = "sugg-meta";
      meta.textContent = "candidate";
      left.appendChild(wd);
      left.appendChild(meta);

      const useBtn = document.createElement("button");
      useBtn.className = "useBtn";
      useBtn.textContent = "Use";
      useBtn.addEventListener("click", () => { guessInputEl().value = w; guessInputEl().focus(); });

      li.appendChild(left);
      li.appendChild(useBtn);
      suggestionsEl.appendChild(li);
    }
    computingEl.classList.add("hidden");
    suggestTitle.textContent = "Remaining possible answers";
    expectedAfterEl.textContent = possibleWords.length ? possibleWords.length : "—";
    return;
  }

  suggestTitle.textContent = "Top suggestions";

  // Stage 1: frequency base score
  const freq = {};
  for (const w of possibleWords){
    const seen = new Set();
    for (const ch of w){
      if (!seen.has(ch)){
        freq[ch] = (freq[ch] || 0) + 1;
        seen.add(ch);
      }
    }
  }
  function baseScore(word){
    let seen = new Set();
    let s = 0;
    for (const ch of word){
      if (!seen.has(ch)){
        s += (freq[ch] || 0);
        seen.add(ch);
      }
    }
    return s;
  }

  const scored = allWords.map(w => ({w, s: baseScore(w)}));
  scored.sort((a,b) => b.s - a.s);
  const K = Math.min(MAX_CANDIDATES, scored.length);
  const topKWords = scored.slice(0, K).map(x => x.w);

  let candidatePool = topKWords.slice();
  if (possibleWords.length <= 80){
    const combined = new Set(candidatePool.concat(possibleWords));
    candidatePool = Array.from(combined);
  }

  // Stage 2: expected remaining + entropy
  const N = Math.max(1, possibleWords.length);
  const results = [];

  for (let idx=0; idx<candidatePool.length; idx++){
    const candidate = candidatePool[idx];
    const counts = new Map();
    for (const sol of possibleWords){
      const pat = getPattern(candidate, sol);
      counts.set(pat, (counts.get(pat) || 0) + 1);
    }
    let sumSq = 0;
    for (const c of counts.values()) sumSq += c*c;
    const expectedRemaining = sumSq / N;

    let entropy = 0;
    for (const c of counts.values()){
      const p = c / N;
      entropy -= (p * (Math.log2(p) || 0));
    }
    results.push({word: candidate, expectedRemaining, entropy, baseScore: baseScore(candidate)});
    if (idx % 40 === 0) await sleep(0);
  }

  // compute overall combined score for "best overall"
  // normalize metrics to 0-1 across results
  const erMin = Math.min(...results.map(r=>r.expectedRemaining));
  const erMax = Math.max(...results.map(r=>r.expectedRemaining));
  const entMin = Math.min(...results.map(r=>r.entropy));
  const entMax = Math.max(...results.map(r=>r.entropy));
  const bsMin = Math.min(...results.map(r=>r.baseScore));
  const bsMax = Math.max(...results.map(r=>r.baseScore));

  function norm(val, min, max){ return (max === min) ? 0.5 : ( (val - min) / (max - min) ); }

  for (const r of results){
    const erN = norm(r.expectedRemaining, erMin, erMax); // lower is better
    const entN = norm(r.entropy, entMin, entMax);         // higher is better
    const bsN = norm(r.baseScore, bsMin, bsMax);          // higher is better
    // overall: we want low expected, high entropy, high baseScore
    // create combined score where higher is better overall
    r.overall = ( (1 - erN) * 0.6 ) + ( entN * 0.3 ) + ( bsN * 0.1 );
  }

  // Sort according to user selection
  const mode = sortSelect.value;
  if (mode === "entropy"){
    results.sort((a,b) => b.entropy - a.entropy || a.expectedRemaining - b.expectedRemaining);
  } else if (mode === "overall"){
    results.sort((a,b) => b.overall - a.overall || a.expectedRemaining - b.expectedRemaining);
  } else { // default exp
    results.sort((a,b) => a.expectedRemaining - b.expectedRemaining || b.entropy - a.entropy);
  }

  lastSuggestionResults = results;
  const top10 = results.slice(0,10);

  expectedAfterEl.textContent = top10.length ? Math.round(top10[0].expectedRemaining) : "—";

  suggestionsEl.innerHTML = "";
  for (const r of top10){
    const li = document.createElement("li");
    const left = document.createElement("div");
    left.className = "sugg-left";
    const wd = document.createElement("div");
    wd.className = "sugg-word";
    wd.textContent = r.word.toUpperCase();
    const meta = document.createElement("div");
    meta.className = "sugg-meta";
    meta.innerHTML = `exp: <strong>${r.expectedRemaining.toFixed(1)}</strong> • entropy: ${r.entropy.toFixed(2)} • score: ${r.baseScore}`;
    left.appendChild(wd);
    left.appendChild(meta);

    const useBtn = document.createElement("button");
    useBtn.className = "useBtn";
    useBtn.textContent = "Use";
    useBtn.addEventListener("click", () => { guessInputEl().value = r.word; guessInputEl().focus(); });

    li.appendChild(left);
    li.appendChild(useBtn);
    suggestionsEl.appendChild(li);
  }

  computingEl.classList.add("hidden");
}
