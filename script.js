// script.js - fixed: re-evaluate ALL rows on Apply; ban letters only if gray-only across all rows;
// keeps exploratory guesses but heavily penalizes banned letters so "A spam" stops happening.

const RAW_URL = "words.txt"; // local file in repo root
const MAX_CANDIDATES = 120;

let allWords = [];
let possibleWords = [];

const el = id => document.getElementById(id);
const guessInput = () => el("guessInput");
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

document.addEventListener("DOMContentLoaded", init);
addRowBtn.addEventListener("click", onAddRow);
applyBtn.addEventListener("click", onApplyFeedback);
resetBtn.addEventListener("click", resetAll);
guessInput().addEventListener("keydown", (e) => { if (e.key === "Enter") onAddRow(); });
if (sortSelect) sortSelect.addEventListener("change", updateStatsAndSuggestions);

async function init(){
  setStatus("Loading words...");
  try {
    const r = await fetch(RAW_URL, { cache: "no-cache" });
    const txt = await r.text();
    allWords = txt.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);
    possibleWords = [...allWords];
    setStatus(`Loaded ${allWords.length} words.`);
    updateStatsAndSuggestions();
  } catch (err) {
    console.error("load words error:", err);
    setStatus("Failed to load words.txt — check path or paste list (fallback not included here).");
  }
}

function setStatus(s){ if (statusEl) statusEl.textContent = s; }

/* ---------- BOARD / TILE ---------- */

function onAddRow(){
  const guess = guessInput().value.trim().toLowerCase();
  if (!/^[a-z]{5}$/.test(guess)){
    alert("Please type a 5-letter word (a-z).");
    return;
  }
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.guess = guess;
  for (let i = 0; i < 5; i++){
    const tile = document.createElement("div");
    tile.className = "tile state-0";
    tile.textContent = guess[i].toUpperCase();
    tile.dataset.state = "0";
    tile.dataset.pos = i;
    tile.addEventListener("click", () => cycleTileState(tile));
    row.appendChild(tile);
  }
  boardEl.appendChild(row); // append at bottom (real Wordle order)
  guessInput().value = "";
  guessInput().focus();
}

function cycleTileState(tile){
  let s = parseInt(tile.dataset.state || "0", 10);
  s = (s + 1) % 3; // 0 -> 1 -> 2 -> 0  (gray -> yellow -> green -> gray)
  tile.dataset.state = String(s);
  tile.classList.remove("state-0","state-1","state-2");
  tile.classList.add(`state-${s}`);
}

/* ---------- APPLY FEEDBACK (RECOMPUTE ALL ROWS) ---------- */

function onApplyFeedback(){
  // Gather all rows and their patterns first
  const rows = Array.from(boardEl.querySelectorAll(".row"));
  if (!rows.length){
    alert("Add a guess row first.");
    return;
  }

  // We'll recompute from scratch
  // 1) gather patterns, and compute gray-only vs any green/yellow letters
  const patterns = []; // { guess, pattern }
  const seenGreenYellow = new Set();
  const seenGray = new Set();

  for (const row of rows){
    const guess = row.dataset.guess;
    if (!guess) continue;
    const tiles = Array.from(row.querySelectorAll(".tile"));
    const states = tiles.map(t => parseInt(t.dataset.state || "0", 10));
    const pattern = states.join("");
    patterns.push({ guess, pattern });

    // record letter observations across all rows
    for (let i=0;i<5;i++){
      const ch = guess[i];
      const st = states[i];
      if (st === 1 || st === 2) seenGreenYellow.add(ch);
      if (st === 0) seenGray.add(ch);
    }
  }

  // bannedLetters = letters seen gray somewhere AND never seen as green/yellow anywhere
  const bannedLetters = new Set([...seenGray].filter(x => !seenGreenYellow.has(x)));

  // 2) filter allWords by enforcing every recorded pattern
  let newPossible = allWords.filter(candidate => {
    return patterns.every(p => getPattern(p.guess, candidate) === p.pattern);
  });

  possibleWords = newPossible;
  setStatus(`Applied all feedback. Remaining: ${possibleWords.length}`);
  console.log("APPLY DEBUG: patterns=", patterns, "bannedLetters=", Array.from(bannedLetters), "remaining=", possibleWords.length);

  updateStatsAndSuggestions(bannedLetters);
}

/* ---------- RESET ---------- */

function resetAll(){
  possibleWords = [...allWords];
  boardEl.innerHTML = "";
  suggestionsEl.innerHTML = "";
  setStatus(`Reset — ${possibleWords.length} words loaded.`);
  updateStatsAndSuggestions();
}

/* ---------- PATTERN (Wordle rules; duplicates correct) ---------- */

function getPattern(guess, solution){
  // returns string '01220' where 2=green,1=yellow,0=gray
  const g = guess.split("");
  const s = solution.split("");
  const pattern = [0,0,0,0,0];
  const used = [false,false,false,false,false];

  // greens first
  for (let i=0;i<5;i++){
    if (g[i] === s[i]){ pattern[i] = 2; used[i] = true; }
  }
  // yellows (respect counts)
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

/* ---------- SUGGESTION ENGINE ---------- */

async function updateStatsAndSuggestions(bannedLettersArg){
  possibleCountEl.textContent = possibleWords.length;
  const bitsPerGuess = Math.log2(243);
  const minG = Math.ceil(Math.log2(Math.max(1, possibleWords.length)) / bitsPerGuess);
  minGuessesEl.textContent = minG === 0 ? "0 (solved)" : String(minG);
  // pass bannedLetters to suggestion calc (optional)
  await computeAndShowSuggestions(bannedLettersArg || new Set());
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function computeAndShowSuggestions(bannedLetters){
  suggestionsEl.innerHTML = "";
  if (computingEl) computingEl.classList.remove("hidden");
  await sleep(20); // allow UI to update

  // Endgame: show remaining directly
  if (possibleWords.length <= 10){
    const title = document.querySelector("#suggestionsWrap h2");
    if (title) title.textContent = "Remaining possible answers";
    suggestionsEl.innerHTML = "";
    for (const w of possibleWords){
      const li = document.createElement("li");
      li.innerHTML = `<div class="sugg-left"><div class="sugg-word">${w.toUpperCase()}</div><div class="sugg-meta">candidate</div></div>
                      <button class="useBtn">Use</button>`;
      li.querySelector(".useBtn").addEventListener("click", ()=>{ guessInput().value = w; guessInput().focus(); });
      suggestionsEl.appendChild(li);
    }
    if (computingEl) computingEl.classList.add("hidden");
    expectedAfterEl.textContent = possibleWords.length ? possibleWords.length : "—";
    return;
  }

  // Stage 1: frequency from remaining solutions
  const freq = {};
  for (const w of possibleWords){
    const seen = new Set();
    for (const ch of w){
      if (!seen.has(ch)){ freq[ch] = (freq[ch]||0) + 1; seen.add(ch); }
    }
  }

  function computeBaseScore(word){
    const seen = new Set();
    let score = 0;
    for (const ch of word){
      if (!seen.has(ch)){
        // heavy penalty for banned letters (so exploratory words that use banned letters get low score)
        if (bannedLetters && bannedLetters.has(ch)) score -= 1000;
        score += (freq[ch] || 0);
        seen.add(ch);
      }
    }
    return score;
  }

  // score allWords (we allow exploratory guesses) but penalize banned letters
  const scored = allWords.map(w => ({ w, s: computeBaseScore(w) }));
  scored.sort((a,b) => b.s - a.s);

  // candidate pool: top K scored, and include possibleWords if small
  const K = Math.min(MAX_CANDIDATES, scored.length);
  let candidatePool = scored.slice(0, K).map(x => x.w);
  if (possibleWords.length <= 80){
    const combined = new Set(candidatePool.concat(possibleWords));
    candidatePool = Array.from(combined);
  }

  // Stage 2: expected remaining + entropy for each candidate
  const N = possibleWords.length || 1;
  const results = [];
  for (let i=0;i<candidatePool.length;i++){
    const candidate = candidatePool[i];
    const counts = new Map();
    for (const sol of possibleWords){
      const pat = getPattern(candidate, sol);
      counts.set(pat, (counts.get(pat)||0) + 1);
    }
    let sumSq = 0, entropy = 0;
    for (const c of counts.values()){
      sumSq += c*c;
      const p = c / N;
      entropy -= (p * (Math.log2(p) || 0));
    }
    results.push({
      word: candidate,
      expectedRemaining: sumSq / N,
      entropy,
      baseScore: computeBaseScore(candidate)
    });
    if (i % 40 === 0) await sleep(0);
  }

  // compute combined 'overall' score (normalized)
  const erMin = Math.min(...results.map(r => r.expectedRemaining));
  const erMax = Math.max(...results.map(r => r.expectedRemaining));
  const entMin = Math.min(...results.map(r => r.entropy));
  const entMax = Math.max(...results.map(r => r.entropy));
  const bsMin = Math.min(...results.map(r => r.baseScore));
  const bsMax = Math.max(...results.map(r => r.baseScore));
  const norm = (v,a,b) => (b===a ? 0.5 : ((v-a)/(b-a)));

  for (const r of results){
    const erN = norm(r.expectedRemaining, erMin, erMax); // lower better
    const entN = norm(r.entropy, entMin, entMax);         // higher better
    const bsN = norm(r.baseScore, bsMin, bsMax);          // higher better
    r.overall = ((1 - erN) * 0.6) + (entN * 0.3) + (bsN * 0.1);
  }

  // sort according to user selection
  const mode = (sortSelect && sortSelect.value) || "exp";
  if (mode === "entropy"){
    results.sort((a,b) => b.entropy - a.entropy || a.expectedRemaining - b.expectedRemaining);
  } else if (mode === "overall"){
    results.sort((a,b) => b.overall - a.overall || a.expectedRemaining - b.expectedRemaining);
  } else {
    results.sort((a,b) => a.expectedRemaining - b.expectedRemaining || b.entropy - a.entropy);
  }

  // show top 10
  const top10 = results.slice(0,10);
  expectedAfterEl.textContent = top10.length ? Math.round(top10[0].expectedRemaining) : "—";

  suggestionsEl.innerHTML = "";
  for (const r of top10){
    const li = document.createElement("li");
    const left = document.createElement("div"); left.className = "sugg-left";
    left.innerHTML = `<div class="sugg-word">${r.word.toUpperCase()}</div>
                      <div class="sugg-meta">exp: <strong>${r.expectedRemaining.toFixed(1)}</strong> • entropy: ${r.entropy.toFixed(2)} • score: ${r.baseScore}</div>`;
    const useBtn = document.createElement("button"); useBtn.className = "useBtn"; useBtn.textContent = "Use";
    useBtn.addEventListener("click", ()=>{ guessInput().value = r.word; guessInput().focus(); });
    li.appendChild(left); li.appendChild(useBtn);
    suggestionsEl.appendChild(li);
  }

  if (computingEl) computingEl.classList.add("hidden");

  // debug: if zero remaining, help user diagnose
  if (possibleWords.length === 0){
    console.warn("No possible words after applying feedback. Patterns on board:");
    const rows = Array.from(boardEl.querySelectorAll(".row"));
    for (const row of rows){
      const guess = row.dataset.guess;
      const states = Array.from(row.querySelectorAll(".tile")).map(t => parseInt(t.dataset.state || "0",10)).join("");
      console.warn(guess, states);
    }
  }
}

/* ---------- end ---------- */
