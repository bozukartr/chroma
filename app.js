// ═══════════════════════════════════════════════════════════
//  CHROMA DUEL — app.js
//  Firebase Realtime Database + Game Engine
// ═══════════════════════════════════════════════════════════
// 🔥 FIREBASE CONFIG — Replace with your own Firebase project settings!
// Go to: https://console.firebase.google.com → Your project → Project settings → Your apps → Config

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref, set, get, update, onValue, off, remove, push, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ─── REPLACE THIS BLOCK WITH YOUR FIREBASE CONFIG ───────────
const firebaseConfig = {
  apiKey: "AIzaSyA09phzgd0mqVHKXYoDX8IcXoVjBfuT-zY",
  authDomain: "chroma-ae649.firebaseapp.com",
  projectId: "chroma-ae649",
  storageBucket: "chroma-ae649.firebasestorage.app",
  messagingSenderId: "1074137558745",
  appId: "1:1074137558745:web:883d52979689396c4c98c8",
  measurementId: "G-Z9TMK4Z3Q4"
};
// ────────────────────────────────────────────────────────────

const firebase = initializeApp(firebaseConfig);
const db = getDatabase(firebase);
const auth = getAuth(firebase);

// ─── Game Constants ──────────────────────────────────────────
const TOTAL_ROUNDS = 3;
const REVEAL_SECS = 10;
const GUESS_SECS = 10;
const RESULT_SECS = 8;
const MAX_SCORE = 100;
const MAX_DIST = Math.sqrt(255 ** 2 * 3); // ~441.67

// ─── State ───────────────────────────────────────────────────
let uid = null;
let nickname = "";
let roomId = null;
let myRole = "";   // "host" | "guest"
let oppUid = null;
let oppName = "";

let currentRound = 1;
let targetColor = { r: 0, g: 0, b: 0 };
let scores = { me: 0, opp: 0 };
let guessSubmitted = false;
let revealTimer = null;
let guessTimer = null;
let roomRef = null;
let roomListener = null;

// ─── DOM Helpers ─────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = (id) => $(id);

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = $(`screen-${id}`);
  if (target) target.classList.add("active");
}

function showToast(msg, duration = 2800) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove("show"), duration);
}

function rgb(r, g, b) { return `rgb(${r},${g},${b})`; }

function calcScore(guess, target) {
  const dist = Math.sqrt(
    (guess.r - target.r) ** 2 +
    (guess.g - target.g) ** 2 +
    (guess.b - target.b) ** 2
  );
  return Math.max(0, Math.round(MAX_SCORE * (1 - dist / MAX_DIST)));
}

function randomColor() {
  return {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256)
  };
}

function vibrate(pattern) {
  if ("vibrate" in navigator) navigator.vibrate(pattern);
}

// ─── Auth ─────────────────────────────────────────────────────
onAuthStateChanged(auth, user => {
  if (user) {
    uid = user.uid;
  }
});

async function ensureAuth() {
  if (!uid) {
    const cred = await signInAnonymously(auth);
    uid = cred.user.uid;
  }
}

// ─── Screen: Login ────────────────────────────────────────────
window.App = {

  // ─── UI: Toggle join panel ───────────────────────────────────
  toggleJoin() {
    const panel = $("join-panel");
    const isHidden = panel.style.display === "none" || panel.style.display === "";
    panel.style.display = isHidden ? "flex" : "none";
    // Reapply animation
    if (isHidden) {
      panel.style.animation = "none";
      requestAnimationFrame(() => { panel.style.animation = ""; });
      setTimeout(() => $("room-code-input").focus(), 50);
    }
  },

  // ─── Create Room (Host) ───────────────────────────────────────
  async createRoom() {
    const name = $("nickname-input").value.trim();
    if (!name)       { showToast("⚠️ Kullanıcı adı gir!"); $("nickname-input").focus(); return; }
    if (name.length < 2) { showToast("⚠️ En az 2 karakter!"); return; }
    nickname = name;

    try {
      await ensureAuth();

      // Generate a unique 5-digit numeric code, check uniqueness
      let code;
      let attempts = 0;
      do {
        code = String(Math.floor(10000 + Math.random() * 90000));
        const snap = await get(ref(db, `rooms/${code}`));
        if (!snap.exists()) break;
        attempts++;
      } while (attempts < 10);

      roomId = code;
      myRole = "host";
      scores = { me: 0, opp: 0 };
      currentRound = 1;

      // Write room to Firebase
      await set(ref(db, `rooms/${roomId}`), {
        meta: { status: "waiting", hostUid: uid, hostName: nickname },
        players: {
          [uid]: { name: nickname, score: 0, ready: true, guess: { r: 128, g: 128, b: 128 } }
        }
      });

      this._showLobby();
      this._watchRoom();
    } catch (e) {
      console.error(e);
      showToast("❌ Hata: " + e.message);
    }
  },

  // ─── Join Room (Guest) ────────────────────────────────────────
  async joinRoom() {
    const name = $("nickname-input").value.trim();
    if (!name)       { showToast("⚠️ Kullanıcı adı gir!"); $("nickname-input").focus(); return; }
    if (name.length < 2) { showToast("⚠️ En az 2 karakter!"); return; }

    const codeRaw = $("room-code-input").value.trim();
    if (!/^\d{5}$/.test(codeRaw)) {
      showToast("⚠️ 5 haneli sayısal kod gir!");
      $("room-code-input").focus();
      return;
    }

    nickname = name;
    const $btn = $("btn-join-go");
    $btn.disabled = true;

    try {
      await ensureAuth();

      const roomSnap = await get(ref(db, `rooms/${codeRaw}`));
      if (!roomSnap.exists()) {
        showToast("❌ Oda bulunamadı!"); $btn.disabled = false; return;
      }
      const d = roomSnap.val();
      if (d.meta?.status !== "waiting") {
        showToast("❌ Oda dolu veya oyun başladı!"); $btn.disabled = false; return;
      }

      roomId = codeRaw;
      myRole = "guest";
      scores = { me: 0, opp: 0 };
      currentRound = 1;
      oppUid   = d.meta.hostUid;
      oppName  = d.meta.hostName;

      // Write guest into room, update status
      await update(ref(db, `rooms/${roomId}/players/${uid}`), {
        name: nickname, score: 0, ready: true, guess: { r: 128, g: 128, b: 128 }
      });
      await update(ref(db, `rooms/${roomId}/meta`), { status: "starting" });

      this._showLobby();
      this._watchRoom();
      this._onBothReady();
    } catch (e) {
      console.error(e);
      showToast("❌ Hata: " + e.message);
    } finally {
      $btn.disabled = false;
    }
  },

  // ─── Copy room code ───────────────────────────────────────────
  copyCode() {
    if (!roomId) return;
    navigator.clipboard?.writeText(roomId).then(() => showToast("📋 Kod kopyalandı!"));
    vibrate(20);
  },

  // ─── Enter Lobby UI ───────────────────────────────────────────
  _showLobby() {
    showScreen("lobby");
    $("lobby-avatar-letter").textContent = nickname[0].toUpperCase();
    $("lobby-player-name").textContent   = nickname;
    $("room-code-display").textContent   = roomId;

    if (myRole === "host") {
      $("lobby-waiting-msg").textContent      = "Rakip bekleniyor, kodu paylaş…";
      $("opponent-player-name").textContent   = "Bağlanılıyor…";
      $("searching-indicator").style.display  = "flex";
    } else {
      $("lobby-waiting-msg").textContent      = "Odaya katıldın! Oyun başlıyor…";
      $("opponent-player-name").textContent   = oppName;
      $("opponent-avatar-letter").textContent = oppName[0]?.toUpperCase() ?? "?";
      $("opponent-avatar").classList.remove("avatar-ring--muted");
      $("searching-indicator").style.display  = "none";
    }
  },


  // ─── Room Watcher ─────────────────────────────────────────────
  _watchRoom() {
    if (roomListener) off(roomRef);
    roomRef = ref(db, `rooms/${roomId}`);
    roomListener = onValue(roomRef, snap => {
      if (!snap.exists()) return;
      const data = snap.val();
      const players = data.players || {};

      // Update opponent info in lobby when guest joins (host side)
      const playerKeys = Object.keys(players);
      if (playerKeys.length === 2 && myRole === "host") {
        const oppKey = playerKeys.find(k => k !== uid);
        if (oppKey && !oppUid) {
          oppUid  = oppKey;
          oppName = players[oppKey].name;
          $("opponent-player-name").textContent   = oppName;
          $("opponent-avatar-letter").textContent = oppName[0].toUpperCase();
          $("opponent-avatar").classList.remove("avatar-ring--muted");
          $("searching-indicator").style.display  = "none";
        }
      }

      // Watch for status change: guest joined → signal host
      const status = data.meta?.status;
      if (status === "starting" && myRole === "host" && !data.meta?.phase) {
        this._onBothReady();
      }

      // Game state machine
      const phase = data.meta?.phase;
      const round = data.meta?.round || 1;

      if (phase === "reveal" && currentRound !== round) {
        currentRound = round;
        targetColor  = data.meta.targetColor;
        this._startReveal();
      } else if (phase === "reveal" && currentRound === round) {
        targetColor = data.meta.targetColor;
        if (!document.getElementById("screen-reveal").classList.contains("active")) {
          this._startReveal();
        }
      }

      if (phase === "result") {
        this._showRoundResult(data, round);
      }

      if (phase === "final") {
        this._showFinalResult(data);
      }
    });
  },


  async _onBothReady() {
    showToast("✅ Rakip bulundu! Oyun başlıyor…");
    vibrate([30, 30, 80]);

    if (myRole === "host") {
      await update(ref(db, `rooms/${roomId}/meta`), { status: "playing" });
      // Give both clients time to see "match found" toast, then start round
      setTimeout(() => this._hostStartRound(1), 3000);
    }
  },


  // ─── Get Ready Overlay ────────────────────────────────────────
  _showGetReady(round, cb) {
    const overlay  = $("get-ready-overlay");
    const countEl  = $("gr-count");
    const labelEl  = $("gr-label");
    const roundEl  = $("gr-round-label");

    roundEl.textContent = `Tur ${round} / ${TOTAL_ROUNDS}`;
    labelEl.textContent = "Hazır Ol!";
    countEl.textContent = "3";
    countEl.classList.remove("go-flash");

    overlay.classList.add("active");
    vibrate(60);

    const steps = [
      { n: "3", delay: 0 },
      { n: "2", delay: 1000 },
      { n: "1", delay: 2000 },
      { n: "BAŞLA!", delay: 3000, go: true }
    ];

    steps.forEach(({ n, delay, go }) => {
      setTimeout(() => {
        countEl.textContent = n;
        if (go) {
          countEl.classList.add("go-flash");
          labelEl.textContent = "Rengi Ezberle!";
          vibrate([40, 20, 80]);
        } else {
          vibrate(25);
        }
      }, delay);
    });

    // Hide overlay and start reveal after 4s
    setTimeout(() => {
      overlay.classList.remove("active");
      // Small gap after overlay fades before reveal screen
      setTimeout(() => cb(), 350);
    }, 4000);
  },


  // ─── Round Management (Host only) ────────────────────────────
  async _hostStartRound(round) {
    const color = randomColor();
    await update(ref(db, `rooms/${roomId}/meta`), {
      phase: "reveal",
      round: round,
      targetColor: color,
      startedAt: serverTimestamp()
    });
  },

  // ─── Reveal Phase ────────────────────────────────────────────
  _startReveal() {
    // Show "Get Ready" overlay first, then reveal
    this._showGetReady(currentRound, () => this._doReveal());
  },

  _doReveal() {
    guessSubmitted = false;
    showScreen("reveal");

    $("reveal-round-label").textContent = `Tur ${currentRound} / ${TOTAL_ROUNDS}`;
    $("target-color-inner").style.background = rgb(targetColor.r, targetColor.g, targetColor.b);
    $("target-color-display").style.boxShadow =
      `0 12px 40px rgba(${targetColor.r},${targetColor.g},${targetColor.b},.35), 0 4px 16px rgba(0,0,0,.1)`;

    vibrate(50);

    let secs = REVEAL_SECS;
    const circumference = 175.9;
    const progressEl = $("reveal-progress-circle");

    const tick = () => {
      $("reveal-countdown").textContent = secs;
      progressEl.style.strokeDashoffset = circumference * (1 - secs / REVEAL_SECS);
      if (secs <= 0) {
        clearInterval(revealTimer);
        this._startGuess();
      }
      secs--;
    };

    clearInterval(revealTimer);
    tick(); // immediate first frame
    revealTimer = setInterval(tick, 1000);
  },

  // ─── Guess Phase ─────────────────────────────────────────────
  _startGuess() {
    showScreen("guess");
    $("guess-round-label").textContent = `Tur ${currentRound} / ${TOTAL_ROUNDS}`;

    // Reset sliders
    $("slider-r").value = 128;
    $("slider-g").value = 128;
    $("slider-b").value = 128;
    $("r-value").textContent = 128;
    $("g-value").textContent = 128;
    $("b-value").textContent = 128;
    $("player-color-preview").style.background = rgb(128, 128, 128);
    $("btn-submit-guess").disabled = false;
    $("btn-submit-guess").style.opacity = "1";

    let secs = GUESS_SECS;
    const circumference = 125.7;
    const progressEl = $("guess-progress-circle");

    const tick = () => {
      $("guess-countdown").textContent = secs;
      progressEl.style.strokeDashoffset = circumference * (1 - secs / GUESS_SECS);
      // Color timer ring red when ≤3s
      progressEl.style.stroke = secs <= 3 ? "#ef4444" : "var(--accent)";
      if (secs <= 3) vibrate(10);
      if (secs <= 0) {
        clearInterval(guessTimer);
        if (!guessSubmitted) this.submitGuess();
      }
      secs--;
    };

    clearInterval(guessTimer);
    tick();
    guessTimer = setInterval(tick, 1000);
  },

  onSliderChange() {
    const r = parseInt($("slider-r").value);
    const g = parseInt($("slider-g").value);
    const b = parseInt($("slider-b").value);

    $("r-value").textContent = r;
    $("g-value").textContent = g;
    $("b-value").textContent = b;
    // Hedef renk gizli — sadece oyuncunun rengi güncellenir
    $("player-color-preview").style.background = rgb(r, g, b);
  },

  async submitGuess() {
    if (guessSubmitted) return;
    guessSubmitted = true;
    clearInterval(guessTimer);

    const r = parseInt($("slider-r").value);
    const g = parseInt($("slider-g").value);
    const b = parseInt($("slider-b").value);
    const score = calcScore({ r, g, b }, targetColor);

    $("btn-submit-guess").disabled = true;
    $("btn-submit-guess").style.opacity = "0.6";
    vibrate([30, 20, 60]);

    // Write guess + score to Firebase
    await update(ref(db, `rooms/${roomId}/players/${uid}`), {
      guess: { r, g, b },
      score: (scores.me + score), // cumulative
      roundScore: score
    });

    scores.me += score;

    // Check if both guessed → host reveals result
    if (myRole === "host") {
      // Wait a bit then check both finished
      setTimeout(() => this._hostCheckBothGuessed(), 1200);
    }

    showToast(`Tahmin gönderildi! Puan: ${score} / 100`);
  },

  async _hostCheckBothGuessed() {
    const snap = await get(ref(db, `rooms/${roomId}/players`));
    if (!snap.exists()) return;
    const players = snap.val();
    const allDone = Object.values(players).every(p => p.roundScore !== undefined);

    if (allDone) {
      const isLastRound = currentRound >= TOTAL_ROUNDS;
      await update(ref(db, `rooms/${roomId}/meta`), {
        phase: isLastRound ? "final" : "result"
      });
    } else {
      // Retry after 2s
      setTimeout(() => this._hostCheckBothGuessed(), 2000);
    }
  },

  // ─── Round Result ─────────────────────────────────────────────
  _showRoundResult(data, round) {
    if (document.getElementById("screen-round-result").classList.contains("active")) return;
    showScreen("round-result");

    const players = data.players || {};
    const myData = players[uid] || {};
    const oppData = players[oppUid] || {};

    const myScore = myData.roundScore ?? 0;
    const oppScore = oppData.roundScore ?? 0;
    const myTotal = myData.score ?? 0;
    const oppTotal = oppData.score ?? 0;

    $("result-round-label").textContent = `Tur ${round} Sonuçları`;

    $("result-target-color").style.background = rgb(targetColor.r, targetColor.g, targetColor.b);
    $("result-my-color").style.background = rgb(myData.guess?.r ?? 128, myData.guess?.g ?? 128, myData.guess?.b ?? 128);
    $("result-opp-color").style.background = rgb(oppData.guess?.r ?? 128, oppData.guess?.g ?? 128, oppData.guess?.b ?? 128);

    $("result-my-score").textContent = myScore;
    $("result-opp-score").textContent = oppScore;
    $("total-my-name").textContent = nickname;
    $("total-opp-name").textContent = oppName;
    $("total-my-total").textContent = myTotal;
    $("total-opp-total").textContent = oppTotal;

    // Animate score bars
    const maxTotal = Math.max(myTotal, oppTotal, 1);
    setTimeout(() => {
      $("score-bar-me").style.width = `${(myTotal / (TOTAL_ROUNDS * 100)) * 100}%`;
      $("score-bar-opp").style.width = `${(oppTotal / (TOTAL_ROUNDS * 100)) * 100}%`;
    }, 200);

    if (myScore > oppScore) {
      vibrate([30, 20, 30, 20, 80]);
      showToast("🎉 Bu turu kazandın!");
    } else if (myScore < oppScore) {
      showToast("😬 Bu tur rakip daha iyi!");
    } else {
      showToast("🤝 Bu tur berabere!");
    }

    // Next round countdown + host advances
    let nextRound = round + 1;
    let countdown = RESULT_SECS;
    const hint = $("next-round-hint");

    const tick = setInterval(() => {
      if (countdown > 0) {
        hint.textContent = `▶ Sonraki tur ${countdown} saniye sonra başlıyor`;
      } else {
        clearInterval(tick);
        hint.textContent = "";
        if (myRole === "host") this._hostStartRound(nextRound);
      }
      countdown--;
    }, 1000);
  },

  // ─── Final Result ─────────────────────────────────────────────
  _showFinalResult(data) {
    if (document.getElementById("screen-final").classList.contains("active")) return;
    showScreen("final");

    const players = data.players || {};
    const myTotal = players[uid]?.score ?? 0;
    const oppTotal = players[oppUid]?.score ?? 0;

    $("final-my-name").textContent = nickname;
    $("final-opp-name").textContent = oppName;
    $("final-my-avatar").textContent = nickname[0] ?? "?";
    $("final-opp-avatar").textContent = oppName[0] ?? "?";
    $("final-my-pts").textContent = `${myTotal} pts`;
    $("final-opp-pts").textContent = `${oppTotal} pts`;

    // Style based on outcome
    if (myTotal > oppTotal) {
      $("final-trophy").textContent = "🏆";
      $("final-title").textContent = "Tebrikler!";
      $("final-subtitle").textContent = "Bu maçı kazandın 🎉";
      vibrate([50, 30, 50, 30, 100]);
    } else if (myTotal < oppTotal) {
      $("final-trophy").textContent = "😔";
      $("final-title").textContent = "Kaybettin";
      $("final-title").style.color = "var(--warning)";
      $("final-subtitle").textContent = "Bir dahaki sefere!";
    } else {
      $("final-trophy").textContent = "🤝";
      $("final-title").textContent = "Berabere!";
      $("final-title").style.color = "var(--text-secondary)";
      $("final-subtitle").textContent = "Çok yakındı!";
    }

    // Cleanup Firebase room
    if (myRole === "host") {
      setTimeout(() => remove(ref(db, `rooms/${roomId}`)), 10000);
    }
  },

  // ─── Navigation ─────────────────────────────────────────────
  playAgain() {
    // Go back to lobby creation — let user create or join a new room
    if (roomRef) off(roomRef);
    if (roomId && myRole === "host") remove(ref(db, `rooms/${roomId}`)).catch(() => {});
    roomId = null; roomRef = null; oppUid = null; oppName = "";
    scores = { me: 0, opp: 0 };
    currentRound = 1;
    clearInterval(revealTimer);
    clearInterval(guessTimer);
    showScreen("login");
  },


  goBack() {
    clearInterval(revealTimer);
    clearInterval(guessTimer);
    if (roomRef && roomListener) off(roomRef);
    if (roomId) remove(ref(db, `lobby/${roomId}`)).catch(() => { });
    roomId = null;
    showScreen("login");
  },

  goHome() {
    this.goBack();
  }

};
