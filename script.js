let words = [];
let grid = [];
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

// Add guess to grid
addGuess.addEventListener('click', () => {
  const guess = guessInput.value.toLowerCase();
  if(guess.length !== 5 || !words.includes(guess)) {
    alert('Invalid word!');
    return;
  }
  addGuessToGrid(guess);
  guessInput.value = '';
  updateSuggestions();
});

// Create grid cells
function addGuessToGrid(guess) {
  const row = [];
  for(let i=0;i<5;i++){
    const cell = document.createElement('div');
    cell.className = 'cell absent';
    cell.textContent = guess[i];
    cell.addEventListener('click', () => {
      cycleCell(cell);
      updateSuggestions();
    });
    gridDiv.appendChild(cell);
    row.push(cell);
  }
  grid.push(row);
}

// Cycle cell state: absent → present → correct → absent
function cycleCell(cell){
  if(cell.classList.contains('absent')){
    cell.classList.remove('absent');
    cell.classList.add('present');
  } else if(cell.classList.contains('present')){
    cell.classList.remove('present');
    cell.classList.add('correct');
  } else {
    cell.classList.remove('correct');
    cell.classList.add('absent');
  }
}

// Calculate entropy and expected guesses (basic approx)
function calculateEntropy(wordList){
  const total = wordList.length;
  if(total === 0) return 0;
  return Math.log2(total).toFixed(2);
}

function calculateExpectedGuesses(wordList){
  return Math.max(1, (Math.log2(wordList.length) / Math.log2(1.5)).toFixed(1));
}

// Update suggestion list
function updateSuggestions(){
  // Filter words based on grid state
  let possible = [...words];
  
  grid.forEach(row => {
    row.forEach((cell, i) => {
      const letter = cell.textContent;
      if(cell.classList.contains('correct')){
        possible = possible.filter(w => w[i] === letter);
      } else if(cell.classList.contains('present')){
        possible = possible.filter(w => w.includes(letter) && w[i] !== letter);
      } else if(cell.classList.contains('absent')){
        possible = possible.filter(w => !w.includes(letter));
      }
    });
  });

  // Update entropy and expected guesses
  entropyDisplay.textContent = `Entropy: ${calculateEntropy(possible)}`;
  expectedDisplay.textContent = `Expected guesses remaining: ${calculateExpectedGuesses(possible)}`;

  // Show top suggestions
  suggestionList.innerHTML = '';
  possible.slice(0,10).forEach(w => {
    const li = document.createElement('li');
    li.textContent = w;
    suggestionList.appendChild(li);
  });
}
