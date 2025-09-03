// Wordle Helper - frontend only
// Loads words from words.txt, supports tile click (black->yellow->green->black), filters solutions,
// computes top-10 suggestions using frequency + expected-remaining algorithm.

const RAW_URL = "words.txt";

let allWords = [];         // full allowed guesses
let possibleWords = [];    // remaining possible solutions
const MAX_CANDIDATES = 120; // top-K size for heavy expected-remaining calc

// track letters confirmed not in word
let bannedLetters = new Set();

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
guessInput().addEventListener("keydown", (e) => {
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
    setStatus("Failed to load words. Check words.txt path.");
  }
}

function setStatus(s){
  statusEl.textContent = s;
}

/* ---------- BOARD / TILE HANDLING ---------- */

function onAddRow(){
  const guess = guessInput().value.trim().toLowerCase();
  if (!/^[a-z]{5}$/.test(guess)){
    alert("Please type a 5-letter word (a-z).");
    return;
  }
  // create row
  const row = document.createElement("div");
  row.className = "row";
  row.dataset.guess = guess;
  for (let i=0; i<5; i++){
    const tile = document.createElement("div");
    tile.className = "tile state-0"; // start as gray
    tile.textContent = guess[i].toUpperCase();
    tile.dataset.state = "0";
    tile.dataset.pos = i;
    tile.addEventListener("click", () => {
      cycleTileState(tile);
    });
    row.appendChild(tile);
  }
  boardEl.appendChild(row); // add to bottom
  guessInput().value = "";
}

function cycleTileState(tile){
  // 0 -> 1 -> 2 -> 0 (gray -> yellow -> green -> gray)
  let s = parseInt(tile.dataset.state || "0", 10);
  s = (s + 1) % 3;
  tile.dataset.state = String(s);
  tile.classList.remove("state-0","state-1","state-2");
  tile.classList.add(`state-${s}`);
}

/* ---------- FEEDBACK APPLYING & FILTERING ---------- */

function onApplyFeedback(){
  // get last row (most recent)
  const rows = boardEl.querySelectorAll(".row");
  if (!rows.length){
    alert("Add a guess row first.");
    return;
  }
  const row = rows[rows.length-1];
  const guess = row.dataset.guess;
  const states = Array.from(row.querySelectorAll(".tile")).map(t => parseInt(t.dataset.state || "0",10));
  const pattern = states.join("");

  // track banned letters (state = 0 and not seen as 1/2 elsewhere in this guess)
  states.forEach((s,i) => {
    if (s === 0) {
      // only ban if this letter not marked green/yellow in same guess
      const stillUsed = states.some((st,j)=> (st===1||st===2) && guess[j]===guess[i]);
      if (!stillUsed) bannedLetters.add(guess[i]);
    }
  });

  // filter possibleWords
  possibleWords = possibleWords.filter(sol => getPattern(guess, sol) === pattern);
  setStatus(`Applied feedback for ${guess.toUpperCase()}. Remaining: ${possibleWords.length}`);
  updateStatsAndSuggestions();
}

function resetAll(){
  possibleWords = [...allWords];
  bannedLetters = new Set();
  boardEl.innerHTML = "";
  suggestionsEl.innerHTML = "";
  setStatus(`Reset — ${possibleWords.length} words loaded.`);
  updateStatsAndSuggestions();
}

/* ---------- WORDLE PATTERN (correct rules w/ duplicates) ---------- */

function getPattern(guess, solution){
  const g = guess.split("");
  const s = solution.split("");
  const pattern = [0,0,0,0,0];
  const used = [false, false, false, false, false];

  // greens
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

/* ---------- SUGGESTION ENGINE ---------- */

let lastSuggestionResults = [];

async function updateStatsAndSuggestions(){
  possibleCountEl.textContent = possibleWords.length;
  const bitsPerGuess = Math.log2(243);
  const minG = Math.ceil(Math.log2(Math.max(1, possibleWords.length)) / bitsPerGuess);
  minGuessesEl.textContent = minG === 0 ? "0 (already solved)" : String(minG);
  await computeAndShowSuggestions();
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function computeAndShowSuggestions(){
  suggestionsEl.innerHTML = "";
  computingEl.classList.remove("hidden");
  await sleep(20);

  // Stage 1: letter frequency scoring
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
    let score = 0;
    for (const ch of word){
      if (bannedLetters.has(ch)){
        score -= 1000; // heavy penalty for banned letters
      } else if (!seen.has(ch)){
        score += (freq[ch] || 0);
        seen.add(ch);
      }
    }
    return score;
  }

  const scored = allWords.map(w => ({w, s: baseScore(w)}));
  scored.sort((a,b) => b.s - a.s);

  const K = Math.min(MAX_CANDIDATES, scored.length);
  let candidatePool = scored.slice(0, K).map(x => x.w);

  if (possibleWords.length <= 80){
    const combined = new Set(candidatePool.concat(possibleWords));
    candidatePool = Array.from(combined);
  }

  const N = possibleWords.length || 1;
  const results = [];

  for (let idx=0; idx < candidatePool.length; idx++){
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

  results.sort((a,b) => {
    if (a.expectedRemaining !== b.expectedRemaining) return a.expectedRemaining - b.expectedRemaining;
    return b.entropy - a.entropy;
  });

  lastSuggestionResults = results;
  const top10 = results.slice(0, 10);
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
    useBtn.addEventListener("click", () => {
      guessInput().value = r.word;
      guessInput().focus();
    });

    li.appendChild(left);
    li.appendChild(useBtn);
    suggestionsEl.appendChild(li);
  }

  computingEl.classList.add("hidden");
}

/* ---------- Utilities ---------- */
function patternToEmojis(pat){
  return pat.split("").map(d => d === "2" ? "🟩" : (d === "1" ? "🟨" : "⬛")).join("");
}
