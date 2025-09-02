let words = [];
let possibleWords = [];
let gridContainer = document.getElementById("grid");

// Load word list from GitHub raw link
fetch("https://gist.githubusercontent.com/dracos/dd0668f281e685bad51479e5acaadb93/raw/6bfa15d263d6d5b63840a8e5b64e04b382fdb079/valid-wordle-words.txt")
  .then(res => res.text())
  .then(text => {
    words = text.split("\n").map(w => w.trim());
    possibleWords = [...words];
    console.log("Words loaded:", words.length);
  });

// Function to filter words based on feedback
function filterWords(possibleWords, guess, feedback) {
  return possibleWords.filter(word => {
    for (let i = 0; i < 5; i++) {
      const g = guess[i];
      const f = feedback[i];
      if (f === "🟩" && word[i] !== g) return false;
      if (f === "🟨" && (word[i] === g || !word.includes(g))) return false;
      if (f === "⬛" && word.includes(g)) return false;
    }
    return true;
  });
}

// Add guess to grid
function addRow(guess, feedback) {
  for (let i = 0; i < guess.length; i++) {
    let tile = document.createElement("div");
    tile.classList.add("tile");
    let f = feedback[i];
    if (f === "🟩") tile.classList.add("green");
    else if (f === "🟨") tile.classList.add("yellow");
    else tile.classList.add("gray");
    tile.innerText = guess[i];
    gridContainer.appendChild(tile);
  }
}

// Submit guess and update next suggestion
function submitGuess() {
  const guess = document.getElementById("guess").value.toLowerCase();
  const feedback = document.getElementById("feedback").value;

  if (guess.length !== 5 || feedback.length !== 5) {
    alert("Both guess and feedback must be 5 letters!");
    return;
  }

  addRow(guess, feedback);
  possibleWords = filterWords(possibleWords, guess, feedback);
  const nextGuess = possibleWords.length > 0 ? possibleWords[Math.floor(Math.random() * possibleWords.length)] : "-----";

  document.getElementById("next").innerText = "Next guess: " + nextGuess;

  // Clear inputs
  document.getElementById("guess").value = "";
  document.getElementById("feedback").value = "";
}
