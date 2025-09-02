let words = [];
let solution = '';
let currentRow = 0;
let maxRows = 6;
let guesses = [];

async function loadWords() {
    const response = await fetch('words.txt');
    const text = await response.text();
    words = text.trim().split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length === 5);
    startGame();
}

function startGame() {
    solution = words[Math.floor(Math.random() * words.length)];
    currentRow = 0;
    guesses = [];
    renderGame();
    document.getElementById('result').textContent = '';
    document.getElementById('guessInput').value = '';
}

function renderGame() {
    let game = document.getElementById('game');
    game.innerHTML = '';
    for (let i = 0; i < maxRows; i++) {
        let guess = guesses[i] || '';
        for (let j = 0; j < 5; j++) {
            let cell = document.createElement('div');
            cell.className = 'cell';
            if (guess) {
                cell.textContent = guess[j] || '';
                if (solution[j] === guess[j]) {
                    cell.classList.add('correct');
                } else if (solution.includes(guess[j])) {
                    cell.classList.add('present');
                } else {
                    cell.classList.add('absent');
                }
            }
            game.appendChild(cell);
        }
    }
}

function submitGuess(word) {
    word = word.toLowerCase();
    if (word.length !== 5 || !words.includes(word)) {
        document.getElementById('result').textContent = 'Invalid word!';
        return;
    }
    guesses[currentRow] = word;
    renderGame();

    if (word === solution) {
        document.getElementById('result').textContent = `🎉 Correct! The word was "${solution.toUpperCase()}".`;
        return;
    }
    currentRow++;
    if (currentRow === maxRows) {
        document.getElementById('result').textContent = `❌ Out of attempts! The word was "${solution.toUpperCase()}".`;
    }
}

function botPlay() {
    // Simple bot: random valid guess. Smarter bot can be implemented!
    if (currentRow >= maxRows || guesses[currentRow] === solution) return;
    let guess = words[Math.floor(Math.random() * words.length)];
    submitGuess(guess);
    document.getElementById('guessInput').value = guess;
}

document.getElementById('submitGuess').onclick = function() {
    if (currentRow < maxRows) submitGuess(document.getElementById('guessInput').value.toLowerCase());
};

document.getElementById('botPlay').onclick = function() {
    botPlay();
};

document.getElementById('guessInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('submitGuess').click();
    }
});

loadWords();
