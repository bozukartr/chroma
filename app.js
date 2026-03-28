import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get, remove, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyA09phzgd0mqVHKXYoDX8IcXoVjBfuT-zY",
    authDomain: "chroma-ae649.firebaseapp.com",
    projectId: "chroma-ae649",
    storageBucket: "chroma-ae649.firebasestorage.app",
    messagingSenderId: "1074137558745",
    appId: "1:1074137558745:web:883d52979689396c4c98c8",
    measurementId: "G-Z9TMK4Z3Q4"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- GAME STATE ---
let roomId = "";
let playerId = Math.random().toString(36).substring(7);
let playerName = "";
let isHost = false;
let currentPhase = "JOIN";
let targetColor = { r: 0, g: 0, b: 0 };
let myGuess = { r: 128, g: 128, b: 128 };
let players = {};
let timerInterval = null;
let roundCount = 1;

// --- DOM ELEMENTS ---
const screens = {
    join: document.getElementById('join-screen'),
    lobby: document.getElementById('lobby-screen'),
    target: document.getElementById('target-phase'),
    guess: document.getElementById('guess-phase'),
    result: document.getElementById('result-screen')
};

const elements = {
    rSlider: document.getElementById('r-slider'),
    gSlider: document.getElementById('g-slider'),
    bSlider: document.getElementById('b-slider'),
    rVal: document.getElementById('r-val'),
    gVal: document.getElementById('g-val'),
    bVal: document.getElementById('b-val'),
    guessBox: document.getElementById('guess-color-box'),
    targetBox: document.getElementById('target-color-box'),
    targetTimer: document.getElementById('target-timer'),
    guessTimer: document.getElementById('guess-timer'),
    resTarget: document.getElementById('res-target'),
    resP1: document.getElementById('res-p1'),
    resP2: document.getElementById('res-p2'),
    resP1Dist: document.getElementById('res-p1-dist'),
    resP2Dist: document.getElementById('res-p2-dist'),
    winnerText: document.getElementById('winner-text'),
    p1Name: document.getElementById('res-p1-name'),
    p2Name: document.getElementById('res-p2-name'),
    hud: document.getElementById('hud'),
    hudP1Name: document.getElementById('hud-p1-name'),
    hudP2Name: document.getElementById('hud-p2-name'),
    hudP1Score: document.getElementById('hud-p1-score'),
    hudP2Score: document.getElementById('hud-p2-score'),
    hudRound: document.getElementById('round-num'),
    lobbyP1Name: document.getElementById('lobby-p1-name'),
    lobbyP2Name: document.getElementById('lobby-p2-name'),
    p1Slot: document.getElementById('p1-slot'),
    p2Slot: document.getElementById('p2-slot')
};

// --- INITIALIZATION ---
function init() {
    setupEventListeners();
    updateGuessPreview();
}

function setupEventListeners() {
    document.getElementById('join-btn').addEventListener('click', joinGame);
    document.getElementById('submit-guess').addEventListener('click', submitGuess);
    document.getElementById('restart-btn').addEventListener('click', restartGame);

    [elements.rSlider, elements.gSlider, elements.bSlider].forEach(slider => {
        slider.addEventListener('input', () => {
            updateGuessPreview();
        });
    });
}

function updateGuessPreview() {
    const r = elements.rSlider.value;
    const g = elements.gSlider.value;
    const b = elements.bSlider.value;
    myGuess = { r: parseInt(r), g: parseInt(g), b: parseInt(b) };
    
    elements.rVal.textContent = r;
    elements.gVal.textContent = g;
    elements.bVal.textContent = b;
    elements.guessBox.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
}

// --- CORE FIREBASE ---
async function joinGame() {
    const nameInput = document.getElementById('player-name').value.trim();
    const roomInput = document.getElementById('room-id').value.trim();

    if (!nameInput || !roomInput) {
        showToast("Enter all identification data.");
        return;
    }

    playerName = nameInput.toUpperCase();
    roomId = roomInput.toLowerCase();

    const roomRef = ref(db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    const roomData = snapshot.val();

    if (roomData && roomData.players && Object.keys(roomData.players).length >= 2 && !roomData.players[playerId]) {
        showToast("Access Denied: Room Full.");
        return;
    }

    isHost = !roomData || !roomData.players;

    const playerRef = ref(db, `rooms/${roomId}/players/${playerId}`);
    await set(playerRef, {
        name: playerName,
        r: 128, g: 128, b: 128,
        submitted: false,
        score: 0
    });

    if (isHost) {
        await update(ref(db, `rooms/${roomId}`), { phase: 'waiting', round: 1 });
    }

    onDisconnect(playerRef).remove();

    onValue(roomRef, (snap) => {
        const data = snap.val();
        if (data) handleRoomUpdate(data);
    });

    switchScreen('lobby');
    document.getElementById('display-room-id').textContent = roomId;
}

function handleRoomUpdate(data) {
    players = data.players || {};
    const playerIds = Object.keys(players);
    roundCount = data.round || 1;
    
    // UI Update
    const p1 = players[playerIds[0]];
    const p2 = players[playerIds[1]];

    if (p1) {
        elements.p1Slot.classList.add('active');
        elements.lobbyP1Name.textContent = p1.name;
        elements.hudP1Name.textContent = p1.name;
        elements.hudP1Score.textContent = p1.score || 0;
    }
    if (p2) {
        elements.p2Slot.classList.add('active');
        elements.lobbyP2Name.textContent = p2.name;
        elements.hudP2Name.textContent = p2.name;
        elements.hudP2Score.textContent = p2.score || 0;
    }

    // Highlighting Active Scorer
    if (playerId === playerIds[0]) elements.hudP1Score.parentElement.classList.add('active-score');
    else if (playerId === playerIds[1]) elements.hudP2Score.parentElement.classList.add('active-score');

    // Transitions
    if (data.phase !== currentPhase) {
        currentPhase = data.phase;
        
        if (currentPhase === 'TARGET') {
            targetColor = data.target;
            elements.targetBox.style.backgroundColor = `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})`;
            elements.hudRound.textContent = roundCount;
            elements.hud.classList.remove('hidden');
            switchScreen('target');
            startTimer(10, elements.targetTimer);
        } else if (currentPhase === 'GUESS') {
            switchScreen('guess');
            elements.guessBox.classList.remove('locked-anim');
            elements.rSlider.value = 128;
            elements.gSlider.value = 128;
            elements.bSlider.value = 128;
            updateGuessPreview();
            startTimer(20, elements.guessTimer, () => {
                if (currentPhase === 'GUESS') submitGuess();
            });
        } else if (currentPhase === 'RESULT') {
            showResults();
        } else if (currentPhase === 'waiting') {
            switchScreen('lobby');
        }
    }

    if (isHost && (data.phase === 'waiting' || !data.phase) && playerIds.length === 2) {
        startGame();
    }
}

function startGame() {
    const target = {
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256)
    };

    update(ref(db, `rooms/${roomId}`), {
        phase: 'TARGET',
        target: target,
        startTime: Date.now()
    });

    setTimeout(() => {
        if (currentPhase === 'TARGET') {
            update(ref(db, `rooms/${roomId}`), { phase: 'GUESS' });
        }
    }, 10000);
}

function submitGuess() {
    if (currentPhase !== 'GUESS') return;
    
    elements.guessBox.classList.add('locked-anim');
    const updates = {};
    updates[`rooms/${roomId}/players/${playerId}/r`] = myGuess.r;
    updates[`rooms/${roomId}/players/${playerId}/g`] = myGuess.g;
    updates[`rooms/${roomId}/players/${playerId}/b`] = myGuess.b;
    updates[`rooms/${roomId}/players/${playerId}/submitted`] = true;
    
    update(ref(db), updates);
    showToast("Signal Alignment Locked.");
    checkAllSubmitted();
}

async function checkAllSubmitted() {
    if (!isHost) return;
    const snap = await get(ref(db, `rooms/${roomId}/players`));
    const currentPlayers = snap.val();
    const pIds = Object.keys(currentPlayers);
    const allSubmitted = pIds.length === 2 && Object.values(currentPlayers).every(p => p.submitted);

    if (allSubmitted) {
        const p1 = currentPlayers[pIds[0]];
        const p2 = currentPlayers[pIds[1]];
        const d1 = calculateDistance(targetColor, p1);
        const d2 = calculateDistance(targetColor, p2);

        const winnerId = d1 < d2 ? pIds[0] : (d2 < d1 ? pIds[1] : null);
        if (winnerId) {
            const currentScore = currentPlayers[winnerId].score || 0;
            update(ref(db, `rooms/${roomId}/players/${winnerId}`), { score: currentScore + 1 });
        }
        update(ref(db, `rooms/${roomId}`), { phase: 'RESULT' });
    }
}

function showResults() {
    switchScreen('result');
    const playerIds = Object.keys(players);
    const p1 = players[playerIds[0]];
    const p2 = players[playerIds[1]];

    const dist1 = calculateDistance(targetColor, p1);
    const dist2 = calculateDistance(targetColor, p2);

    const maxDelta = 441;
    const score1 = Math.max(0, 100 - (dist1 / maxDelta * 100)).toFixed(1);
    const score2 = Math.max(0, 100 - (dist2 / maxDelta * 100)).toFixed(1);

    elements.resTarget.style.backgroundColor = `rgb(${targetColor.r}, ${targetColor.g}, ${targetColor.b})`;
    elements.resP1.style.backgroundColor = `rgb(${p1.r}, ${p1.g}, ${p1.b})`;
    elements.resP2.style.backgroundColor = `rgb(${p2.r}, ${p2.g}, ${p2.b})`;
    
    elements.p1Name.textContent = `${p1.name} (Guess)`;
    elements.p2Name.textContent = `${p2.name} (Guess)`;
    
    elements.resP1Dist.textContent = `${score1}% MATCH`;
    elements.resP2Dist.textContent = `${score2}% MATCH`;

    if (dist1 < dist2) elements.winnerText.innerHTML = `${p1.name} Dominates Round.`;
    else if (dist2 < dist1) elements.winnerText.innerHTML = `${p2.name} Dominates Round.`;
    else elements.winnerText.innerHTML = "Signal Parity.";
}

function calculateDistance(c1, c2) {
    return Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
}

function restartGame() {
    if (isHost) {
        const pIds = Object.keys(players);
        const updates = { phase: 'waiting', round: roundCount + 1 };
        pIds.forEach(id => {
            updates[`players/${id}/submitted`] = false;
        });
        update(ref(db, `rooms/${roomId}`), updates);
    }
}

function switchScreen(screenId) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenId].classList.add('active');
}

function startTimer(seconds, element, callback) {
    clearInterval(timerInterval);
    let timeLeft = seconds;
    element.textContent = timeLeft;
    timerInterval = setInterval(() => {
        timeLeft--;
        element.textContent = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            if (callback) callback();
        }
    }, 1000);
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

init();
