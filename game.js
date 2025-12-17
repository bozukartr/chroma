// --- CONFIG & STATE ---
const ROOMS_REF = database.ref('rooms');
let gameRef = null;
let playerRef = null;

let state = {
    roomId: null,
    playerId: null, // 'p1' (Host) or 'p2' (Guest)
    myColor: { r: 0, g: 0, b: 0 },
    targetColor: { r: 0, g: 0, b: 0 },
    gameActive: false,
    mixing: {
        active: false,
        channel: null
    },
    timer: null,
    timer: null,
    endTime: 0,
    user: null // { uid, displayName, photoURL, gold }
};

// --- DOM ELEMENTS ---
const screens = {
    lobby: document.getElementById('lobbyScreen'),
    game: document.getElementById('gameScreen')
};

const ui = {
    // Lobby
    lobbyActions: document.querySelector('.lobby-actions'),
    createBtn: document.getElementById('createBtn'),
    joinBtn: document.getElementById('joinBtn'),
    joinInput: document.getElementById('joinInput'),
    lobbyInfo: document.getElementById('lobbyInfo'),
    gameCodeDisplay: document.getElementById('gameCodeDisplay'),
    statusMessage: document.getElementById('statusMessage'),
    cancelBtn: document.getElementById('cancelBtn'),

    playerBox: document.getElementById('playerColorBox'),
    opponentBox: document.getElementById('opponentColorBox'),
    targetBox: document.getElementById('targetColorBox'),

    btnRed: document.getElementById('btnRed'),
    btnGreen: document.getElementById('btnGreen'),
    btnBlue: document.getElementById('btnBlue'),
    resetMixBtn: document.getElementById('resetMixBtn'),

    submitBtn: document.getElementById('submitBtn'),

    // Result
    resultOverlay: document.getElementById('resultOverlay'),
    resultTitle: document.getElementById('resultTitle'),
    resultScore: document.getElementById('resultScore'),
    opponentScore: document.getElementById('opponentScore'),
    resultEmoji: document.getElementById('resultEmoji'),
    rematchBtn: document.getElementById('rematchBtn'),

    // Auth & Profile
    loginBtn: document.getElementById('loginBtn'),
    lobbyButtons: document.getElementById('lobbyButtons'),
    userProfile: document.getElementById('userProfile'),
    userGold: document.getElementById('userGold'),
    userAvatar: document.getElementById('userAvatar'),

    // Auth & Profile
    loginBtn: document.getElementById('loginBtn'),
    guestBtn: document.getElementById('guestBtn'), // NEW
    logoutBtn: document.getElementById('logoutBtn'),
    lobbyButtons: document.getElementById('lobbyButtons'),
    userProfile: document.getElementById('userProfile'),
    userGold: document.getElementById('userGold'),
    userAvatar: document.getElementById('userAvatar'),

    // Navigation
    quitGameBtn: document.getElementById('quitGameBtn'), // NEW
    leaveGameBtn: document.getElementById('leaveGameBtn'), // NEW

    // Powerups
    btnPowerReveal: document.getElementById('btnPowerReveal'),
    // Timer
    timerDisplay: document.getElementById('timerDisplay'),
    timerBar: document.querySelector('.timer-bar-fill')
};

// --- INITIALIZATION ---
function init() {
    setupEventListeners();
    initAuth();
    requestAnimationFrame(gameLoop);
}

function setupEventListeners() {
    ui.createBtn.addEventListener('click', createGame);
    ui.joinBtn.addEventListener('click', joinGame);
    ui.cancelBtn.addEventListener('click', cancelGame);

    // Pouring
    setupPourButton(ui.btnRed, 'r');
    setupPourButton(ui.btnGreen, 'g');
    setupPourButton(ui.btnBlue, 'b');

    // Reset
    ui.resetMixBtn.addEventListener('click', resetMyMix);

    ui.submitBtn.addEventListener('click', () => submitScore(false));
    ui.rematchBtn.addEventListener('click', requestRematch);

    // Auth
    ui.loginBtn.addEventListener('click', loginWithGoogle);
    ui.guestBtn.addEventListener('click', loginAnonymously); // NEW
    ui.logoutBtn.addEventListener('click', () => auth.signOut());

    // Navigation
    ui.quitGameBtn.addEventListener('click', confirmExit); // NEW
    ui.leaveGameBtn.addEventListener('click', () => window.location.reload()); // Exit -> Reload (F5)

    // Powerup
    ui.btnPowerReveal.addEventListener('click', activatePowerReveal);
}

function setupPourButton(btn, channel) {
    const start = (e) => {
        if (!state.gameActive) return;
        e.preventDefault();
        state.mixing.active = true;
        state.mixing.channel = channel;
        btn.style.transform = "scale(0.95)";
    };
    const end = (e) => {
        e.preventDefault();
        state.mixing.active = false;
        state.mixing.channel = null;
        btn.style.transform = "scale(1)";
    };

    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
    btn.addEventListener('mouseleave', end);
    btn.addEventListener('touchstart', start, { passive: false });
    btn.addEventListener('touchend', end, { passive: false });
}

function gameLoop() {
    if (state.gameActive && state.mixing.active && state.mixing.channel) {
        const ch = state.mixing.channel;
        if (state.myColor[ch] < 255) {
            state.myColor[ch] = Math.min(255, state.myColor[ch] + 4); // Slightly faster fill
            updateVisualsAndSync();
        }
    }

    // Timer Animation Update
    if (state.gameActive && state.endTime > 0) {
        updateTimerVisuals();
    }

    requestAnimationFrame(gameLoop);
}

function resetMyMix(e) {
    if (e) e.stopPropagation();
    state.myColor = { r: 0, g: 0, b: 0 };
    updateVisualsAndSync();
}

// --- LOBBY LOGIC ---
function createGame() {
    const roomId = generateRoomId();
    state.roomId = roomId;
    state.playerId = 'p1';

    gameRef = ROOMS_REF.child(roomId);

    const initialTarget = generateRandomColor();

    gameRef.set({
        targetColor: initialTarget,
        status: 'waiting',
        startTime: 0, // Will set when ready
        rematch: { p1: false, p2: false },
        p1: { r: 0, g: 0, b: 0, score: -1 },
        p2: { r: 0, g: 0, b: 0, score: -1 }
    }).then(() => {
        showLobbyInfo(roomId);
        listenToRoom();
    });
}

function joinGame() {
    const roomId = ui.joinInput.value.toUpperCase().trim();
    if (!roomId) return alert("Lütfen bir oda kodu girin!");

    state.roomId = roomId;
    state.playerId = 'p2';
    gameRef = ROOMS_REF.child(roomId);

    gameRef.get().then((snapshot) => {
        if (snapshot.exists()) {
            showLobbyInfo(roomId);
            listenToRoom();
            // Start Game Trigger
            const now = Date.now();
            gameRef.update({
                status: 'ready',
                startTime: now + 1000, // Start in 1s
                endTime: now + 1000 + 60000 // Initialize 60s end time
            });
        } else {
            alert("Oda bulunamadı!");
        }
    });
}

function cancelGame() {
    if (gameRef) {
        gameRef.remove();
        gameRef.off();
    }
    state.roomId = null;
    state.playerId = null;
    gameRef = null;
    ui.lobbyActions.classList.remove('hidden'); // Show the start/join buttons
    ui.lobbyInfo.classList.add('hidden');
    ui.statusMessage.innerText = "Bağlı Değil";
}

function confirmExit() {
    if (confirm("Oyundan çıkmak istediğine emin misin?")) {
        window.location.reload(); // F5 Logic
    }
}

function fullQuitGame() {
    state.gameActive = false;

    // Remove listeners
    if (gameRef) gameRef.off();
    if (playerRef) playerRef.remove(); // Optional: remove self from room

    // Reset State
    state.roomId = null;
    state.playerId = null;
    gameRef = null;
    playerRef = null;

    // UI Reset to Lobby
    screens.game.classList.remove('active');
    setTimeout(() => screens.game.classList.add('hidden'), 300);
    screens.lobby.classList.remove('hidden');

    ui.resultOverlay.classList.add('hidden');
    ui.lobbyInfo.classList.add('hidden');

    // Restore Lobby
    if (state.user) {
        ui.lobbyButtons.classList.remove('hidden');
    } else {
        ui.loginBtn.classList.remove('hidden');
    }
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}
function generateRandomColor() {
    return {
        r: Math.floor(Math.random() * 256), g: Math.floor(Math.random() * 256), b: Math.floor(Math.random() * 256)
    };
}
function showLobbyInfo(code) {
    ui.lobbyActions.classList.add('hidden'); // Hide the start/join buttons
    ui.lobbyInfo.classList.remove('hidden');
    ui.gameCodeDisplay.innerText = code;
    ui.statusMessage.innerText = state.playerId === 'p1' ? "Oda Sahibi" : "Misafir";

    // Copy Feature
    ui.gameCodeDisplay.onclick = () => {
        navigator.clipboard.writeText(code).then(() => {
            const original = ui.gameCodeDisplay.innerText;
            ui.gameCodeDisplay.innerText = "KOPYALANDI!";
            setTimeout(() => ui.gameCodeDisplay.innerText = original, 1000);
        });
    };
    ui.gameCodeDisplay.style.cursor = "pointer";
    ui.gameCodeDisplay.title = "Kopyalamak için tıkla";
}

// --- NETWORK SYNC ---
function listenToRoom() {
    gameRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (!data) return;

        // 1. Status Check
        if (data.status === 'ready') {
            if (!state.gameActive && !ui.resultOverlay.classList.contains('hidden')) {
                // Restart scenario
                restartLocalGame(data.targetColor, data.startTime, data.endTime);
            } else if (!state.gameActive) {
                // First start
                restartLocalGame(data.targetColor, data.startTime, data.endTime);
            } else if (state.gameActive && data.endTime && state.endTime !== data.endTime) {
                // SUDDEN DEATH SYNC: Update local timer if server time changes
                state.endTime = data.endTime;
            }
        }

        // 2. Sync Opponent
        const opponentId = state.playerId === 'p1' ? 'p2' : 'p1';
        if (data[opponentId]) {
            ui.opponentBox.style.backgroundColor = `rgb(${data[opponentId].r}, ${data[opponentId].g}, ${data[opponentId].b})`;
        }

        // 3. Game Over & Sudden Death Check
        const p1Done = data.p1 && data.p1.score >= 0;
        const p2Done = data.p2 && data.p2.score >= 0;

        if (p1Done && p2Done && state.gameActive) {
            handleGameOver(data.p1.score, data.p2.score);
        } else if ((p1Done || p2Done) && state.gameActive && data.endTime) {
            // SUDDEN DEATH: One submitted, drop time to 5s if more remains
            const now = Date.now();
            if (data.endTime - now > 5000) {
                // Only Host (p1) updates to avoid race conditions
                if (state.playerId === 'p1') {
                    gameRef.update({ endTime: now + 5000 });
                }
            }
        }

        // 4. Rematch Check
        if (data.rematch) {
            checkRematchStatus(data.rematch);
        }
    });
    playerRef = gameRef.child(state.playerId);
}

let highlightTimeout = null; // Track timeout to clear it on restart
let targetTimeout = null; // Track memory mode timeout

function restartLocalGame(target, startTime, endTime) {
    state.gameActive = true;
    state.myColor = { r: 0, g: 0, b: 0 };
    state.targetColor = target;

    // Timer Setup: Use provided end time or default to 60s
    state.endTime = endTime || (startTime + 60000);

    // UI Reset

    // UI Reset
    screens.lobby.classList.add('hidden');
    screens.game.classList.remove('hidden');
    setTimeout(() => screens.game.classList.add('active'), 50);

    ui.resultOverlay.classList.add('hidden');
    ui.submitBtn.disabled = false;
    ui.submitBtn.innerText = "RENGİ ONAYLA";
    ui.rematchBtn.disabled = false;
    ui.rematchBtn.innerText = "Tekrar Oyna";
    ui.rematchBtn.classList.remove('pulse-btn');
    ui.rematchBtn.classList.add('btn', 'primary'); // Ensure base classes are there

    // Clean up winner highlights definitively
    if (highlightTimeout) clearTimeout(highlightTimeout);
    ui.resultScore.parentElement.classList.remove('winner');
    ui.opponentScore.parentElement.classList.remove('winner');
    ui.resultScore.innerText = "0%";
    ui.opponentScore.innerText = "0%";

    ui.targetBox.style.backgroundColor = `rgb(${target.r}, ${target.g}, ${target.b})`;

    // Hardcore Memory Mode: Hide target after 5 seconds
    ui.targetBox.classList.remove('hidden-mode');
    if (targetTimeout) clearTimeout(targetTimeout);

    targetTimeout = setTimeout(() => {
        if (state.gameActive) {
            ui.targetBox.classList.add('hidden-mode');
            // Enable Powerup only when hidden
            updatePowerUpState();
        }
    }, 5000);

    updateVisualsAndSync();
}

function updateVisualsAndSync() {
    const { r, g, b } = state.myColor;
    ui.playerBox.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
    if (playerRef) playerRef.update({ r, g, b });
}

function updateTimerVisuals() {
    const now = Date.now();
    const timeLeft = Math.max(0, Math.ceil((state.endTime - now) / 1000));

    ui.timerDisplay.innerText = timeLeft;

    // Bar Progress
    const totalTime = 60;
    const progressPercent = (timeLeft / totalTime) * 100;

    if (ui.timerBar) {
        ui.timerBar.style.width = `${progressPercent}%`;

        if (timeLeft <= 10) {
            ui.timerBar.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-red');
        } else {
            ui.timerBar.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue('--primary');
        }
    }

    if (timeLeft === 0 && state.gameActive) {
        submitScore(true); // Force submit
    }
}

// --- SCORING ---
function submitScore(forced = false) {
    if (!state.gameActive) return;

    const score = calculateScore();
    ui.submitBtn.disabled = true;
    ui.submitBtn.innerText = forced ? "SÜRE BİTTİ!" : "BEKLENİYOR...";
    playerRef.update({ score: score });
}

function calculateScore() {
    const dr = state.myColor.r - state.targetColor.r;
    const dg = state.myColor.g - state.targetColor.g;
    const db = state.myColor.b - state.targetColor.b;
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    const maxDist = 442;
    return parseFloat((100 - (distance / maxDist * 100)).toFixed(1));
}

function handleGameOver(p1Score, p2Score) {
    state.gameActive = false;
    state.endTime = 0; // Stop timer

    const myScore = state.playerId === 'p1' ? p1Score : p2Score;
    const oppScore = state.playerId === 'p1' ? p2Score : p1Score;

    let title, emoji;
    if (myScore > oppScore) { title = "ZAFER!"; emoji = "🏆"; }
    else if (myScore < oppScore) { title = "YENİLGİ"; emoji = "💀"; }
    else { title = "BERABERE"; emoji = "🤝"; }

    ui.resultTitle.innerText = title;
    ui.resultEmoji.innerText = emoji;

    // Animate Scores (Slower: 2.5s)
    const duration = 2500;
    animateValue(ui.resultScore, 0, myScore, duration);
    animateValue(ui.opponentScore, 0, oppScore, duration);

    // Apply winner highlight AFTER animation
    highlightTimeout = setTimeout(() => {
        if (myScore > oppScore) {
            ui.resultScore.parentElement.classList.add('winner');
            triggerConfetti();

            // Economy: +50 Gold for Win
            if (state.user) {
                const newGold = state.user.gold + 50;
                database.ref('users/' + state.user.uid).update({ gold: newGold });
                // Visual feedback could be added here
            }

        } else if (oppScore > myScore) {
            ui.opponentScore.parentElement.classList.add('winner');
        }
    }, duration);

    ui.resultOverlay.classList.remove('hidden');

    // Reveal the target for comparison
    if (targetTimeout) clearTimeout(targetTimeout);
    ui.targetBox.classList.remove('hidden-mode');
}

function animateValue(obj, start, end, duration) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        // Easing (easeOutQuad)
        const easeProgress = 1 - (1 - progress) * (1 - progress);

        obj.innerHTML = Math.floor(progress * (end - start) + start) + "%";
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerHTML = end + "%";
        }
    };
    window.requestAnimationFrame(step);
}

// --- REMATCH ---
function requestRematch() {
    ui.rematchBtn.innerText = "Bekleniyor...";
    ui.rematchBtn.disabled = true;
    gameRef.child('rematch').update({ [state.playerId]: true });
}

function checkRematchStatus(rematchData) {
    // If I have already requested, check if opponent has too
    if (rematchData[state.playerId]) {
        ui.rematchBtn.innerText = "Rakip Bekleniyor...";
        ui.rematchBtn.disabled = true;

        const opponentId = state.playerId === 'p1' ? 'p2' : 'p1';
        if (rematchData[opponentId]) {
            ui.rematchBtn.innerText = "Rakip Kabul Etti! Başlıyor...";
            // Host triggers start
            if (state.playerId === 'p1') {
                // Slight delay to let UI show "Starting..."
                setTimeout(triggerSystemRestart, 500);
            }
        }
    } else {
        // I haven't clicked yet, check if opponent has
        const opponentId = state.playerId === 'p1' ? 'p2' : 'p1';
        if (rematchData[opponentId]) {
            ui.rematchBtn.innerText = "Rakip tekrar oynamak istiyor! (Kabul Et)";
            // Optional: Add a pulse class if defined in CSS, ensuring it exists
            ui.rematchBtn.classList.add('btn', 'primary');
        } else {
            ui.rematchBtn.innerText = "Tekrar Oyna";
        }
    }
}

function triggerSystemRestart() {
    const newTarget = generateRandomColor();
    const now = Date.now();
    gameRef.update({
        targetColor: newTarget,
        status: 'ready',
        startTime: now + 1000,
        endTime: now + 1000 + 60000, // Initialize explicitly for Sudden Death
        rematch: { p1: false, p2: false },
        p1: { r: 0, g: 0, b: 0, score: -1 },
        p2: { r: 0, g: 0, b: 0, score: -1 }
    });
}

init();

// --- AUTH & ECONOMY ---
function initAuth() {
    auth.onAuthStateChanged((user) => {
        if (user) {
            // Logged In
            state.user = {
                uid: user.uid,
                displayName: user.displayName || "Misafir",
                // Use custom geometric avatar based on UID
                photoURL: `https://api.dicebear.com/9.x/shapes/svg?seed=${user.uid}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
                gold: 0 // Default, will sync from DB
            };

            // UI Updates
            ui.loginBtn.classList.add('hidden');
            ui.guestBtn.classList.add('hidden'); // Hide guest button too
            ui.lobbyButtons.classList.remove('hidden');
            ui.userProfile.classList.remove('hidden');
            ui.userAvatar.src = state.user.photoURL; // Use the generated avatar
            ui.statusMessage.innerText = "Çevrimiçi";

            loadUserData();

        } else {
            // Logged Out
            state.user = null;
            ui.loginBtn.classList.remove('hidden');
            ui.guestBtn.classList.remove('hidden'); // Show guest button
            ui.lobbyButtons.classList.add('hidden');
            ui.userProfile.classList.add('hidden');
            ui.statusMessage.innerText = "Giriş Yapılmadı";
        }
    });
}

function loginWithGoogle() {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider).catch(err => alert("Giriş hatası: " + err.message));
}

function loginAnonymously() {
    auth.signInAnonymously().catch(err => alert("Giriş hatası: " + err.message));
}

function loadUserData() {
    const userRef = database.ref('users/' + state.user.uid);
    userRef.on('value', (snapshot) => {
        const data = snapshot.val();
        if (data) {
            state.user.gold = data.gold || 0;
            ui.userGold.innerText = `🪙 ${state.user.gold}`;

            // Re-evaluate button state
            updatePowerUpState();
        } else {
            // First time user logic
            userRef.set({
                gold: 0,
                displayName: state.user.displayName,
                photoURL: state.user.photoURL
            });
        }
    });
}

function activatePowerReveal() {
    if (!state.user || state.user.gold < 20) return;

    // 1. Deduct Gold
    const newGold = state.user.gold - 20;
    database.ref('users/' + state.user.uid).update({ gold: newGold });

    // 2. Apply Effect (Reveal Target)
    ui.targetBox.classList.remove('hidden-mode');
    updatePowerUpState(); // Update visual state immediately

    // 3. Re-hide after 5s
    // Clear any existing hidden-mode timeout to prevent early hiding
    if (targetTimeout) clearTimeout(targetTimeout);
    targetTimeout = setTimeout(() => {
        if (state.gameActive) {
            ui.targetBox.classList.add('hidden-mode');
            updatePowerUpState(); // Re-enable if conditions met
        }
    }, 5000); // 5 seconds of visibility
}

function updatePowerUpState() {
    if (!ui.btnPowerReveal) return;

    const isHidden = ui.targetBox.classList.contains('hidden-mode');
    const hasGold = state.user && state.user.gold >= 20;

    // Enable only if: Mode is Hidden AND User has Gold
    ui.btnPowerReveal.disabled = !(isHidden && hasGold);
}

// --- CONFETTI SYSTEM ---
function triggerConfetti() {
    const colors = ['#EF4444', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6'];
    for (let i = 0; i < 50; i++) {
        const confetto = document.createElement('div');
        confetto.classList.add('confetto');
        confetto.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetto.style.left = Math.random() * 100 + 'vw';
        confetto.style.animationDuration = (Math.random() * 2 + 2) + 's';
        confetto.style.animationDelay = (Math.random() * 0.5) + 's';
        document.body.appendChild(confetto);

        // Cleanup
        setTimeout(() => confetto.remove(), 4000);
    }
}
