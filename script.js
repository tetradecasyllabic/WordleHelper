const grid = document.getElementById('grid');
const wordInput = document.getElementById('wordInput');
const entryForm = document.getElementById('entryForm');
const sortSelect = document.getElementById('sortSelect');

let wordList = [];
let words = []; // array of { word: string, states: [0,1,2,...] }
const maxRows = 6;

// States for each letter: 0 = absent (black), 1 = present (yellow), 2 = correct (green)
const STATE_CLASS = ['absent', 'present', 'correct'];
const STATE_NAMES = ['Absent', 'Present', 'Correct'];

// Load words from words.txt on page load
async function loadWords() {
  try {
    const response = await fetch('words.txt');
    const text = await response.text();
    wordList = text.trim().split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length === 5);
  } catch (e) {
    console.error('Could not load words.txt', e);
  }
}
loadWords();

// Render the grid rows and letter states
function render() {
  let sorted = [...words];
  // Sort words by selected method (placeholders: replace with real logic)
  switch (sortSelect.value) {
    case 'entropy':
      sorted.sort((a,b) => fakeEntropy(b.word) - fakeEntropy(a.word));
      break;
    case 'expected':
      sorted.sort((a,b) => fakeExpected(a.word) - fakeExpected(b.word));
      break;
    case 'overall':
      sorted.sort((a,b) => (fakeEntropy(b.word) + 20 - fakeExpected(b.word)) - (fakeEntropy(a.word) + 20 - fakeExpected(a.word)));
      break;
  }

  grid.innerHTML = '';
  sorted.forEach((entry, i) => {
    const row = document.createElement('div');
    row.className = 'row';
    entry.word.split('').forEach((ch, idx) => {
      const cell = document.createElement('div');
      cell.className = 'letter ' + STATE_CLASS[entry.states[idx]];
      cell.innerText = ch.toUpperCase();
      cell.title = STATE_NAMES[entry.states[idx]];
      cell.tabIndex = 0;
      // Rotate letter state on click 
      cell.onclick = () => {
        entry.states[idx] = (entry.states[idx] + 1) % 3;
        render();
      };
      row.appendChild(cell);
    });
    grid.appendChild(row);
  });
}

// Placeholder sorting functions for demonstration
function fakeEntropy(word) {
  return [...word].reduce((a,b) => a + b.charCodeAt(0) % 3, 0);
}
function fakeExpected(word) {
  return 1 + (word.charCodeAt(0) % 4);
}

// Add a new word with initial states to grid
entryForm.onsubmit = e => {
  e.preventDefault();
  let val = wordInput.value.trim().toLowerCase();
  if (!/^[a-z]{5}$/.test(val)) {
    alert('Enter a valid 5-letter word');
    wordInput.focus();
    return;
  }
  // Optional: Ensure word is in wordList
  if (!wordList.includes(val)) {
    alert('Word not in dictionary');
    wordInput.focus();
    return;
  }
  if (words.length >= maxRows) {
    alert('Max of 6 words reached');
    wordInput.value = '';
    return;
  }
  words.push({ word: val, states: [0, 0, 0, 0, 0] });
  wordInput.value = '';
  wordInput.focus();
  render();
};

sortSelect.onchange = render;

// Initial render call
render();
