let words = [];
let guesses = [];
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

// Add guess when button clicked or Enter pressed
addGuess.addEventListener('click', handleGuess);
guessInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleGuess();
});

function handleGuess(){
  const guess = guessInput.value.trim().toLowerCase();
  if(guess.length !== 5 || !words.includes(guess)){
    alert('Invalid word!');
    return;
  }
  guesses.push(guess);
  addGuessToGrid(guess);
  guessInput.value = '';
  updateSuggestions();
}

// Add guess to visual grid
function addGuessToGrid(guess){
  const rowDiv = document.createElement('div');
  rowDiv.className = 'grid-row';
  for(let i=0; i<5; i++){
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

// Cycle cell color: absent -> present -> correct -> absent
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

// Calculate entropy
function calculateEntropy(wordList){
  if(wordList.length === 0) return 0;
  return Math.log2(wordList.length).toFixed(2);
}

// Approx expected guesses remaining
function calculateExpectedGuesses(wordList){
  if(wordList.length === 0) return 0;
  return Math.max(1, (Math.log2(wordList.length)/Math.log2(1.5)).toFixed(1));
}

// Update suggestions based on current grid state
function updateSuggestions(){
  let possible = [...words];

  // Apply guesses and cell states
  const rows = document.querySelectorAll('.grid-row');
  rows.forEach(row => {
    const cells = row.querySelectorAll('.cell');
    cells.forEach((cell, i) => {
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

  // Update stats
  entropyDisplay.textContent = `Entropy: ${calculateEntropy(possible)}`;
  expectedDisplay.textContent = `Expected guesses remaining: ${calculateExpectedGuesses(possible)}`;

  // Update top suggestions
  suggestionList.innerHTML = '';
  possible.slice(0,10).forEach(w => {
    const li = document.createElement('li');
    li.textContent = w;
    suggestionList.appendChild(li);
  });
}
