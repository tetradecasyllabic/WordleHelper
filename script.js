let words = [];
let guesses = [];

// Load words.txt
fetch("words.txt")
  .then(res => res.text())
  .then(text => {
    words = text.split("\n").map(w => w.trim().toLowerCase()).filter(w => w.length === 5);
    console.log("Loaded words:", words.length);
  });

// Elements
const guessInput = document.getElementById("guessInput");
const submitGuess = document.getElementById("submitGuess");
const grid = document.getElementById("grid");
const sortSelect = document.getElementById("sortSelect");
const results = document.getElementById("results");

// Cycle states: black → yellow → green
const states = ["black", "yellow", "green"];

function addGuess(word) {
  if (!words.includes(word)) {
    alert("Not in word list!");
    return;
  }

  const row = [];
  for (let i = 0; i < 5; i++) {
    const cell = document.createElement("div");
    cell.classList.add("cell", "black");
    cell.textContent = word[i].toUpperCase();
    cell.dataset.state = "black";
    cell.addEventListener("click", () => {
      let curr = states.indexOf(cell.dataset.state);
      let next = (curr + 1) % states.length;
      cell.dataset.state = states[next];
      cell.className = "cell " + states[next];
    });
    grid.appendChild(cell);
    row.push(cell);
  }

  guesses.push({ word, entropy: Math.random(), expected: (Math.random() * 3 + 2).toFixed(2) });
  updateResults();
}

function updateResults() {
  let sorted = [...guesses];
  const mode = sortSelect.value;

  if (mode === "entropy") {
    sorted.sort((a, b) => b.entropy - a.entropy);
  } else if (mode === "expected") {
    sorted.sort((a, b) => a.expected - b.expected);
  } else if (mode === "combined") {
    sorted.sort((a, b) => (b.entropy / a.expected) - (a.entropy / b.expected));
  }

  results.innerHTML = "<h3>Guesses</h3>";
  sorted.forEach(g => {
    results.innerHTML += `
      <div>
        <strong>${g.word.toUpperCase()}</strong> 
        | Entropy: ${g.entropy.toFixed(2)} 
        | Exp: ${g.expected}
      </div>`;
  });
}

// Events
submitGuess.addEventListener("click", () => {
  const word = guessInput.value.toLowerCase();
  if (word.length === 5) {
    addGuess(word);
    guessInput.value = "";
  }
});

sortSelect.addEventListener("change", updateResults);
