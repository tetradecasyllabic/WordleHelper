let words = [];
const gridDiv = document.getElementById('grid');
const guessInput = document.getElementById('guessInput');
const addGuess = document.getElementById('addGuess');
const suggestionList = document.getElementById('suggestionList');
const entropyDisplay = document.getElementById('entropy');
const expectedDisplay = document.getElementById('expected');

// Load words
fetch('words.txt')
  .then(res => res.text())
  .then(txt => {
    words = txt.split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length === 5);
    updateSuggestions();
  });

// Handle guess
addGuess.addEventListener('click', handleGuess);
guessInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleGuess();
});

function handleGuess() {
  const guess = guessInput.value.trim().toLowerCase();
  if (guess.length !== 5 || !words.includes(guess)) {
    alert('Invalid word!');
    return;
  }
  addGuessToGrid(guess);
  guessInput.value = '';
  updateSuggestions();
}

// Add guess to grid
function addGuessToGrid(guess) {
  const rowDiv = document.createElement('div');
  rowDiv.className = 'grid-row';
  for (let i = 0; i < 5; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell absent';
    cell.textContent = guess[i];
    cell.addEventListener('click', () => {
      cycleCell(cell);
      updateSuggestions();
    });
    rowDiv.appendChild(cell);
  }
  gridDiv.appendChild(rowDiv);
}

// Cycle cell: absent -> present -> correct -> absent
function cycleCell(cell) {
  if (cell.classList.contains('absent')) {
    cell.classList.remove('absent');
    cell.classList.add('present');
  } else if (cell.classList.contains('present')) {
    cell.classList.remove('present');
    cell.classList.add('correct');
  } else {
    cell.classList.remove('correct');
    cell.classList.add('absent');
  }
}

// Filter possible words based on current grid
function filterPossible() {
  let possible = [...words];
  const rows = document.querySelectorAll('.grid-row');

  rows.forEach(row => {
    const cells = row.querySelectorAll('.cell');

    // Collect letters by type
    const correct = {};
    const present = {};
    const absent = [];

    cells.forEach((cell, i) => {
      const letter = cell.textContent;
      if (cell.classList.contains('correct')) correct[i] = letter;
      else if (cell.classList.contains('present')) {
        if (!present[letter]) present[letter] = [];
        present[letter].push(i);
      } else if (cell.classList.contains('absent')) absent.push({letter, index: i});
    });

    // Filter
    possible = possible.filter(w => {
      // Correct positions
      for (let pos in correct) if (w[pos] !== correct[pos]) return false;
      // Present letters
      for (let l in present) {
        if (!w.includes(l)) return false;
        for (let idx of present[l]) if (w[idx] === l) return false;
      }
      // Absent letters (exclude only if not in correct/present elsewhere)
      for (let a of absent) {
        if (w.includes(a.letter) && !Object.values(correct).includes(a.letter) && !present[a.letter]) return false;
      }
      return true;
    });
  });

  return possible;
}

// Calculate entropy of a guess relative to remaining words
function calcWordEntropy(guess, possible) {
  const patternMap = {};

  possible.forEach(solution => {
    let pattern = '';
    for (let i = 0; i < 5; i++) {
      if (guess[i] === solution[i]) pattern += '2'; // correct
      else if (solution.includes(guess[i])) pattern += '1'; // present
      else pattern += '0'; // absent
    }
    patternMap[pattern] = (patternMap[pattern] || 0) + 1;
  });

  // Shannon entropy
  let entropy = 0;
  const total = possible.length;
  for (let p in patternMap) {
    const prob = patternMap[p] / total;
    entropy -= prob * Math.log2(prob);
  }
  return entropy;
}

// Update suggestions
function updateSuggestions() {
  const possible = filterPossible();

  // Update entropy and expected guesses
  const ent = possible.length > 0 ? Math.log2(possible.length).toFixed(2) : 0;
  const expected = possible.length > 0 ? (Math.log2(possible.length)/Math.log2(1.5)).toFixed(1) : 0;

  entropyDisplay.textContent = `Entropy: ${ent}`;
  expectedDisplay.textContent = `Expected guesses remaining: ${expected}`;

  // Show top suggestions by entropy
  let candidates = [];
  if (possible.length <= 10) {
    candidates = possible.slice();
  } else {
    // Compute entropy for each possible word in dictionary
    candidates = words.map(w => ({word: w, entropy: calcWordEntropy(w, possible)}))
                      .sort((a,b) => b.entropy - a.entropy)
                      .slice(0,10)
                      .map(x => x.word);
  }

  suggestionList.innerHTML = '';
  candidates.forEach(w => {
    const li = document.createElement('li');
    li.textContent = w;
    suggestionList.appendChild(li);
  });
}
