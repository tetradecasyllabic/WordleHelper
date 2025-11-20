// --- File Paths ---
const RAW_ANSWERS_URL = "answers.txt"; // Words that can be the solution
const RAW_GUESSES_URL = "guesses.txt"; // All valid words that can be guessed

// --- Word Lists & State ---
let allAnswers = []; // Full list of official answers
let allGuesses = []; // Full list of valid guesses (includes all answers)
let possibleWords = []; // Current subset of the active answer set (allAnswers or allGuesses)
let activeAnswerSet = 'answers'; // 'answers' or 'guesses'
let currentSortKey = 'expectedRemaining'; // 'expectedRemaining', 'entropy', or 'baseScore'
const MAX_CANDIDATES = 120;

// --- DOM Elements ---
const guessInput = () => document.getElementById("guessInput");
const addRowBtn = document.getElementById("addRowBtn");
const applyBtn = document.getElementById("applyBtn");
const resetBtn = document.getElementById("resetBtn");
const statusEl = document.getElementById("status");
const boardEl = document.getElementById("board"); // Must match <div id="board">
const suggestionsEl = document.getElementById("suggestions");
const computingEl = document.getElementById("computing");
const possibleCountEl = document.getElementById("possibleCount");
const minGuessesEl = document.getElementById("minGuesses");
const expectedAfterEl = document.getElementById("expectedAfter");
const possibleAnswersWrap = document.getElementById("possibleAnswersWrap");
const possibleAnswersEl = document.getElementById("possibleAnswers");

// NEW DOM Elements (Assumed to be in your HTML)
const sortExpBtn = document.getElementById("sortExpBtn");
const sortEntropyBtn = document.getElementById("sortEntropyBtn");
const sortScoreBtn = document.getElementById("sortScoreBtn");
const toggleAnswersBtn = document.getElementById("toggleAnswersBtn");

// --- Event Listeners ---
document.addEventListener("DOMContentLoaded", init);
addRowBtn.addEventListener("click", onAddRow);
applyBtn.addEventListener("click", onApplyFeedback);
// FIX APPLIED HERE: Ensure resetAll is called with 'false' to clear the board
resetBtn.addEventListener("click", () => resetAll(false)); 
guessInput().addEventListener("keydown", e => { if(e.key==="Enter") onAddRow(); });

// NEW Event Listeners
sortExpBtn.addEventListener("click", () => setSort('expectedRemaining'));
sortEntropyBtn.addEventListener("click", () => setSort('entropy'));
sortScoreBtn.addEventListener("click", () => setSort('baseScore'));
toggleAnswersBtn.addEventListener("click", toggleAnswerMode);

// --- Utility Functions ---

function setStatus(s){ statusEl.textContent = s; }
function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function setSort(key) {
    currentSortKey = key;
    // Visually update buttons (requires CSS class toggle)
    [sortExpBtn, sortEntropyBtn, sortScoreBtn].forEach(btn => btn.classList.remove('active-sort'));
    if (key === 'expectedRemaining') sortExpBtn.classList.add('active-sort');
    if (key === 'entropy') sortEntropyBtn.classList.add('active-sort');
    if (key === 'baseScore') sortScoreBtn.classList.add('active-sort');

    // Re-render suggestions immediately with the new sort order
    showSuggestions();
}

function toggleAnswerMode() {
    activeAnswerSet = activeAnswerSet === 'answers' ? 'guesses' : 'answers';
    toggleAnswersBtn.textContent = `Answers: ${activeAnswerSet === 'answers' ? 'Official Set' : 'ALL Guesses'}`;
    
    // Pass 'true' to preserve the board state while updating the possible words list
    resetAll(true); 
}

// --- Initialization ---

async function init() {
    setStatus("Loading word lists...");
    try {
        // 1. Load Answers (The Possible Solutions)
        const rAnswers = await fetch(RAW_ANSWERS_URL, { cache: "no-cache" });
        const txtAnswers = await rAnswers.text();
        allAnswers = txtAnswers.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);

        // 2. Load Guesses (The Words We Can Use for Suggestions)
        const rGuesses = await fetch(RAW_GUESSES_URL, { cache: "no-cache" });
        const txtGuesses = await rGuesses.text();
        let uniqueGuesses = txtGuesses.split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(Boolean);

        // Combine unique guesses and all answers into the definitive guessable list
        const combinedGuessesSet = new Set([...uniqueGuesses, ...allAnswers]);
        allGuesses = Array.from(combinedGuessesSet); 
        
        // Initialize state
        possibleWords = [...allAnswers]; 
        setSort(currentSortKey); // Sets initial sort and updates buttons
        toggleAnswersBtn.textContent = `Answers: Official Set`; // Initial button text

        setStatus(`Loaded ${allAnswers.length} answers and ${allGuesses.length} unique guessable words.`);
        updateStatsAndSuggestions();
    } catch(err) { 
        console.error(err); 
        setStatus("Failed to load word lists. Check answers.txt and guesses.txt."); 
    }
}

// --- Board Interaction Functions ---

function onAddRow() {
    const guess = guessInput().value.trim().toLowerCase();
    if(!/^[a-z]{5}$/.test(guess)){ alert("Type a 5-letter word."); return; }
    
    // Check if the guess is a valid word from the allGuesses list
    if(!allGuesses.includes(guess)){ alert("Word not in the valid guess list."); return; }

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
    // Determine the base set to filter from
    const baseAnswerSet = activeAnswerSet === 'answers' ? allAnswers : allGuesses;
    possibleWords = [...baseAnswerSet]; 
    
    const rows = Array.from(boardEl.querySelectorAll(".row"));
    for(const row of rows){
        const guess = row.dataset.guess;
        const states = Array.from(row.querySelectorAll(".tile")).map(t=>parseInt(t.dataset.state||"0",10));
        const pattern = states.join("");
        
        // Filter the possible words based on the feedback pattern generated by the 'guess'
        possibleWords = possibleWords.filter(sol=>getPattern(guess,sol)===pattern);
    }
    setStatus(`Remaining: ${possibleWords.length} (from ${activeAnswerSet === 'answers' ? 'Official' : 'All'} set)`);
    updateStatsAndSuggestions();
}

function resetAll(keepBoard = false){
    const baseAnswerSet = activeAnswerSet === 'answers' ? allAnswers : allGuesses;
    possibleWords=[...baseAnswerSet]; 
    
    // THIS LINE CLEARS THE ROWS when keepBoard is false (i.e., when Reset button is pressed)
    if (!keepBoard) {
        boardEl.innerHTML=""; 
    }
    
    suggestionsEl.innerHTML="";
    possibleAnswersWrap.classList.add("hidden");
    possibleAnswersEl.innerHTML="";
    setStatus(`Reset — ${possibleWords.length} words loaded.`);
    updateStatsAndSuggestions();
}

// --- Wordle Pattern Simulation (Crucial Logic) ---

function getPattern(guess, solution){
    const g=guess.split(""); 
    const s=solution.split(""); 
    const pattern=[0,0,0,0,0]; // 0=Grey, 1=Yellow, 2=Green
    const counts={};

    // First Pass: Find all Greens (2) and count remaining letters in the solution
    for(let i=0;i<5;i++){ 
        if(g[i]===s[i]) pattern[i]=2; // Green match
        else counts[s[i]]=(counts[s[i]]||0)+1; // Count available letters in solution
    }

    // Second Pass: Find Yellows (1) using the remaining counts
    for(let i=0;i<5;i++){ 
        if(pattern[i]===0 && counts[g[i]]>0){ 
            pattern[i]=1; // Yellow match
            counts[g[i]]--; // Consume one instance of the letter
        } 
    }
    return pattern.join("");
}

// --- Suggestion & Statistics ---

async function updateStatsAndSuggestions(){
    possibleCountEl.textContent=possibleWords.length;
    // Calculate minimum theoretical guesses needed
    const bitsPerGuess=Math.log2(243); // log2(3^5) possible patterns
    const minG=Math.ceil(Math.log2(Math.max(1,possibleWords.length))/bitsPerGuess);
    minGuessesEl.textContent=minG===0?"0 (solved)":String(minG);
    await computeAndShowSuggestions();
}

let lastSuggestionResults=[];
async function computeAndShowSuggestions(){
    suggestionsEl.innerHTML=""; 
    computingEl.classList.remove("hidden"); 
    await sleep(20);

    // 1. Calculate Letter Frequencies based on remaining possible words
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

    // 2. Filter Candidate Pool using allGuesses (always use the large guess list for candidates)
    const scored=allGuesses.map(w=>({w,s:baseScore(w)})).sort((a,b)=>b.s-a.s);
    
    const K=Math.min(MAX_CANDIDATES,scored.length);
    let candidatePool=scored.slice(0,K).map(x=>x.w);
    
    // If few answers remain, ensure all of them are included in the pool
    if(possibleWords.length<=80){ 
        const combined=new Set(candidatePool.concat(possibleWords)); 
        candidatePool=Array.from(combined); 
    }

    const N=possibleWords.length||1; 
    const results=[];
    
    // 3. Main Calculation Loop: Entropy & Expected Remaining
    for(let idx=0;idx<candidatePool.length;idx++){
        const candidate=candidatePool[idx]; 
        const counts=new Map();
        
        for(const sol of possibleWords){ 
            const pat=getPattern(candidate,sol); 
            counts.set(pat,(counts.get(pat)||0)+1); 
        }
        
        // Calculate Expected Remaining (Average size of the resulting groups)
        let sumSq=0; 
        for(const c of counts.values()) sumSq+=c*c;
        const expectedRemaining=sumSq/N;
        
        // Calculate Entropy (Information gain)
        let entropy=0; 
        for(const c of counts.values()){ 
            const p=c/N; 
            entropy-=p*(Math.log2(p)||0); 
        }
        
        results.push({word:candidate,expectedRemaining,entropy,baseScore:baseScore(candidate)});
        if(idx%40===0) await sleep(0); 
    }

    lastSuggestionResults=results; 
    
    // Display the results with current sort key
    showSuggestions();

    computingEl.classList.add("hidden");
}

function showSuggestions() {
    // 4. Sort Results based on currentSortKey
    let sortedResults = [...lastSuggestionResults];

    if (currentSortKey === 'expectedRemaining') {
        sortedResults.sort((a,b) => a.expectedRemaining !== b.expectedRemaining
            ? a.expectedRemaining - b.expectedRemaining // Ascending (Lower is better)
            : b.entropy - a.entropy // Tiebreaker: Descending Entropy
        );
    } else if (currentSortKey === 'entropy') {
        sortedResults.sort((a,b) => b.entropy - a.entropy // Descending (Higher is better)
        );
    } else if (currentSortKey === 'baseScore') {
        sortedResults.sort((a,b) => b.baseScore - a.baseScore // Descending (Higher is better)
        );
    }

    // 5. Display Top Suggestions
    const topResults = sortedResults.length <= 10 ? sortedResults : sortedResults.slice(0,10);
    expectedAfterEl.textContent=topResults.length?Math.round(topResults[0].expectedRemaining):"—";

    suggestionsEl.innerHTML="";
    for(const r of topResults){
        const li=document.createElement("li");
        const left=document.createElement("div"); left.className="sugg-left";
        const wd=document.createElement("div"); wd.className="sugg-word"; wd.textContent=r.word.toUpperCase();
        const meta=document.createElement("div"); meta.className="sugg-meta";
        
        // Highlight the metric currently being used for sorting
        const expStyle = currentSortKey === 'expectedRemaining' ? 'style="color: var(--accent-yellow); font-weight: bold;"' : '';
        const entropyStyle = currentSortKey === 'entropy' ? 'style="color: var(--accent-yellow); font-weight: bold;"' : '';
        const scoreStyle = currentSortKey === 'baseScore' ? 'style="color: var(--accent-yellow); font-weight: bold;"' : '';

        meta.innerHTML = `exp: <span ${expStyle}>${r.expectedRemaining.toFixed(1)}</span> • entropy: <span ${entropyStyle}>${r.entropy.toFixed(2)}</span> • score: <span ${scoreStyle}>${r.baseScore}</span>`;
        
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

    // 6. Display Possible Answers if the list is small
    if(possibleWords.length>0 && possibleWords.length<50){
        possibleAnswersWrap.classList.remove("hidden");
        possibleAnswersEl.innerHTML="";
        for(const w of possibleWords){
            const li=document.createElement("li");
            li.textContent=w.toUpperCase();
            possibleAnswersEl.appendChild(li);
        }
    } else {
        possibleAnswersWrap.classList.add("hidden");
        possibleAnswersEl.innerHTML="";
    }
}
