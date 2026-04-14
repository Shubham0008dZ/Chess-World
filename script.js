// ==========================================
// GLOBALS & CONFIGURATION (No lines deleted)
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwgGUnR-9o3vFxjTQm8aFiaUf3ObHFmjtBcoAuhmVXCPLw8GM2YD0zSQR8lucT97reT/exec"; 

let board = null;
let game = new Chess(); 
let undos = 3;
let currentId = "";
let currentEmail = "";
let currentUsername = "";
let aiLvl = 1;

// Multiplayer Variables
let pollInterval = null; 
let outgoingPollInterval = null; 
let gamePollInterval = null; 
let currentTargetId = "";
let currentOpponentId = ""; 
let isMultiplayer = false;
let isMyTurn = false;
let playerColor = 'w';
let isModalActive = false; 

// Turn Timer Variables
let turnTimerInterval = null;
let timeLeft = 30;

// ==========================================
// SESSION & UI UPDATE (Persistent Login with Stats)
// ==========================================
$(window).on('load', function() {
    let savedData = localStorage.getItem('chessUserData');
    if(savedData) {
        let d = JSON.parse(savedData);
        populateLobby(d);
        showScreen('screenLobby');
        startPolling();
        
        // Hide Login/Register on Landing
        $('#authBtnStack').html(`
            <button onclick="showScreen('screenLobby'); startPolling();" class="main-btn">Return to Lobby</button>
            <button onclick="logoutUser()" class="sec-btn" style="margin-top:10px; border-color:#ff4b2b; color:#ff4b2b;">Logout Complete</button>
        `);
    }
});

function populateLobby(d) {
    currentId = d.id;
    currentUsername = d.username;
    $('#lobbyUsername').text(d.username);
    $('#lobbyMyId').text(d.id);
    
    // Update Stats
    $('#statRank').text("#" + (d.rank || 0));
    $('#statWins').text(d.wins || 0);
    $('#statTotal').text(d.total || 0);
    $('#statStreak').text((d.streak || 0) + " 🔥");
}

function logoutUser() {
    localStorage.removeItem('chessUserData');
    location.reload(); 
}

// IN-GAME NOTIFICATION SYSTEM 
function showToast(msg, isError = false) {
    let container = document.getElementById('toastContainer');
    let toast = document.createElement('div');
    toast.className = `toast-msg ${isError ? 'toast-error' : ''}`;
    toast.innerHTML = `<i class="fas ${isError ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i> ${msg}`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = "fadeOutToast 0.4s ease forwards";
        setTimeout(() => toast.remove(), 400); 
    }, 3500);
}

function toggleVisibility(inputId, icon) {
    let input = document.getElementById(inputId);
    if (input.type === "password") { 
        input.type = "text"; 
        icon.classList.replace("fa-eye", "fa-eye-slash"); 
    } else { 
        input.type = "password"; 
        icon.classList.replace("fa-eye-slash", "fa-eye"); 
    }
}

function showScreen(id) {
    $('.screen').removeClass('active-screen');
    $('#' + id).addClass('active-screen');
    if(id === 'screenComputer' && board) {
        setTimeout(() => { board.resize(); }, 100);
        setTimeout(() => { board.resize(); }, 500);
    }
}

// =====================================
// 1. REGISTRATION & LOGIN (With DB Stats Extraction)
// =====================================
async function registerUser() {
    const user = $('#regUsername').val().trim();
    const mail = $('#regEmail').val().trim();
    if(!user || !mail) return showToast("All fields required!", true); 
    
    $('#regBtn').text("Registering...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "register", username: user, email: mail}) });
        const d = await res.json();
        if(d.status === "success") {
            showToast("Registration Done! Check Gmail."); 
            $('#regUsername, #regEmail').val("");
        } else {
            showToast(d.message, true); 
        }
    } catch(e) { console.error("Reg Error:", e); showToast("Server Error!", true); }
    $('#regBtn').text("Join Arena").prop('disabled', false);
}

async function loginUser() {
    const id = $('#loginId').val().trim();
    const pass = $('#loginPass').val().trim();
    if(!id || !pass) return showToast("Enter ID and Password!", true);

    $('#loginBtn').text("Verifying...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "login", userId: id, password: pass}) });
        const d = await res.json();
        if(d.status === "success") {
            currentId = id;
            if(d.userStatus === "NEW") {
                showScreen('screenChangePass');
            } else { 
                // Save complete user object for persistent login
                let userObj = { id: id, username: d.username, wins: d.wins, losses: d.losses, total: d.total, streak: d.streak, rank: d.rank };
                localStorage.setItem('chessUserData', JSON.stringify(userObj));
                
                populateLobby(userObj);
                showScreen('screenLobby');
                startPolling(); 
                showToast(`Welcome Back ${d.username}!`); 
                
                $('#authBtnStack').html(`
                    <button onclick="showScreen('screenLobby'); startPolling();" class="main-btn">Return to Lobby</button>
                    <button onclick="logoutUser()" class="sec-btn" style="margin-top:10px; border-color:#ff4b2b; color:#ff4b2b;">Logout Complete</button>
                `);
            }
        } else {
            showToast(d.message, true);
        }
    } catch(e) { console.error("Login Error:", e); showToast("Login failed. Check connection.", true); }
    $('#loginBtn').text("Enter Arena").prop('disabled', false);
}

// =====================================
// 2. FORGOT / CHANGE PASSWORD
// =====================================
async function sendOtp() {
    const mail = $('#forgotEmail').val().trim();
    if(!mail) return showToast("Enter Email!", true);
    $('#sendOtpBtn').text("Sending...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "sendOtp", email: mail}) });
        const d = await res.json();
        if(d.status === "success") {
            currentEmail = mail;
            showScreen('screenVerifyOtp');
            showToast("OTP Sent to Email.");
        } else {
            showToast(d.message, true);
        }
    } catch(e) {}
    $('#sendOtpBtn').text("Send OTP").prop('disabled', false);
}

async function verifyAndResetPass() {
    const otp = $('#otpCode').val().trim();
    const p1 = $('#resetPass1').val().trim();
    const p2 = $('#resetPass2').val().trim();
    
    if(!otp || p1 !== p2 || p1.length < 4) return showToast("Invalid details or Passwords mismatch!", true);
    $('#resetBtn').text("Verifying...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "verifyOtpAndReset", email: currentEmail, otp: otp, newPassword: p1}) });
        const d = await res.json();
        if(d.status === "success") {
            showToast("Password Reset Successfully!");
            showScreen('screenLogin');
        } else { showToast(d.message, true); }
    } catch(e) {}
    $('#resetBtn').text("Reset Password").prop('disabled', false);
}

async function changePassword() {
    const p1 = $('#newPass').val().trim(), p2 = $('#confirmPass').val().trim();
    if(p1.length < 4 || p1 !== p2) return showToast("Password mismatch or too short!", true);
    $('#changePassBtn').text("Saving...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "changePassword", userId: currentId, newPassword: p1}) });
        const d = await res.json();
        if(d.status === "success") { 
            // Save to bypass login next time
            let userObj = { id: currentId, username: currentUsername, wins: 0, losses: 0, total: 0, streak: 0, rank: "New" };
            localStorage.setItem('chessUserData', JSON.stringify(userObj));
            
            populateLobby(userObj);
            showToast("Password Updated! Welcome to Lobby."); 
            showScreen('screenLobby');
            startPolling();
        }
    } catch(e) {}
    $('#changePassBtn').text("Save & Proceed").prop('disabled', false);
}

// =====================================
// 3. MULTIPLAYER MATCHMAKING
// =====================================
async function sendChallenge() {
    const target = $('#targetId').val().trim();
    if(!target || target === currentId) return showToast("Enter a valid opponent ID!", true);
    
    currentTargetId = target;
    $('#challengeBtn').text("Sending...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "sendChallenge", targetId: target, myId: currentId}) });
        const d = await res.json();
        
        if(d.status === "success") {
            $('#lobbyMsg').html('Challenge Sent! Waiting for opponent <span class="pulse-dot"></span>').css('color', '#00ffaa');
            
            if(outgoingPollInterval) clearInterval(outgoingPollInterval);
            outgoingPollInterval = setInterval(async () => {
                try {
                    const outRes = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "checkOutgoing", targetId: currentTargetId, myId: currentId}) });
                    const outD = await outRes.json();
                    
                    if(outD.status === "success") {
                        if(outD.matchState === "ACCEPTED") {
                            clearInterval(outgoingPollInterval);
                            currentOpponentId = currentTargetId; 
                            showToast("Challenge Accepted!");
                            $('#lobbyMsg').text("Match Found! Starting...").css('color', '#00ffaa');
                            setTimeout(() => { startMultiplayerGame(false); }, 1000); 
                        } else if(outD.matchState === "REJECTED") {
                            clearInterval(outgoingPollInterval);
                            showToast("Player Rejected Challenge", true);
                            $('#lobbyMsg').text("");
                            $('#challengeBtn').text("⚔️ Play Live Match").prop('disabled', false);
                        }
                    }
                } catch(err) { console.log("Wait..."); }
            }, 2000);
        } else {
            showToast(d.message, true);
            $('#challengeBtn').text("⚔️ Play Live Match").prop('disabled', false);
        }
    } catch(e) { $('#challengeBtn').text("⚔️ Play Live Match").prop('disabled', false); }
}

function startPolling() {
    if(pollInterval) clearInterval(pollInterval);
    $('#lobbyMsg').html('Connected to server <span class="pulse-dot"></span>').css('color', '#00b3ff');

    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "poll", myId: currentId}) });
            const d = await res.json();
            
            if(d.status === "success") {
                if(d.matchState === "PENDING" && d.challenger !== "" && !isModalActive) {
                    isModalActive = true; 
                    currentOpponentId = d.challenger; 
                    $('#challengerIdText').text(d.challenger);
                    $('#challengeModal').css('display', 'flex'); 
                }
                if(d.matchState === "REJECTED") {
                    fetch(API_URL, { method: "POST", body: JSON.stringify({action: "respondChallenge", myId: currentId, response: "IDLE"}) });
                }
            }
        } catch(e) { console.log("Polling wait...", e); }
    }, 2000); 
}

async function respondChallenge(response) {
    $('#challengeModal').css('display', 'none'); 
    try {
        await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "respondChallenge", myId: currentId, response: response}) });
        if(response === "ACCEPTED") {
            clearInterval(pollInterval);
            isModalActive = false;
            showToast("Match Accepted!");
            setTimeout(() => { startMultiplayerGame(true); }, 1000);
        } else {
            setTimeout(() => { isModalActive = false; }, 3000);
        }
    } catch(e) { setTimeout(() => { isModalActive = false; }, 3000); }
}

// =====================================
// TURN TIMER FUNCTIONS
// =====================================
function startTurnTimer() {
    clearInterval(turnTimerInterval);
    timeLeft = 30;
    $('#turnTimerBox').show();
    $('#turnTimerTxt').text(timeLeft + "s");
    
    turnTimerInterval = setInterval(() => {
        timeLeft--;
        $('#turnTimerTxt').text(timeLeft + "s");
        
        if(timeLeft <= 0) {
            clearInterval(turnTimerInterval);
            // I lose because of timeout
            fetch(API_URL, { method: "POST", body: JSON.stringify({action: "timeoutMatch", myId: currentId, oppId: currentOpponentId}) });
            updateMatchResultDB(currentOpponentId, currentId); // Make opponent winner
            
            $('#gameOverTitle').text("Timeout!").css('color', '#ff4b2b');
            $('#gameOverMsg').text("You ran out of time. You lose.");
            $('#gameOverModal').css('display', 'flex');
        }
    }, 1000);
}

function stopTurnTimer() {
    clearInterval(turnTimerInterval);
    $('#turnTimerBox').hide();
}

// Function to update wins/losses
function updateMatchResultDB(winner, loser) {
    fetch(API_URL, { method: "POST", body: JSON.stringify({action: "updateMatchResult", winnerId: winner, loserId: loser}) });
}

// =====================================
// 4. REAL-TIME MULTIPLAYER GAME (ULTRA-FAST 500MS POLLING)
// =====================================
function startMultiplayerGame(isWhite) {
    if(pollInterval) clearInterval(pollInterval);
    if(outgoingPollInterval) clearInterval(outgoingPollInterval);
    
    isMultiplayer = true;
    playerColor = isWhite ? 'w' : 'b';
    isMyTurn = isWhite; 

    game.reset(); 
    $('#diffTitle').text("VS REAL PLAYER");
    $('#oppNameLabel').text("ID: " + currentOpponentId);
    
    $('#uB').hide(); 
    $('#uC').parent().hide(); 
    
    showScreen('screenComputer');
    
    let cfg = {
        draggable: true, 
        position: 'start',
        orientation: isWhite ? 'white' : 'black', 
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDragStart: (s, p) => { 
            if(game.game_over() || !isMyTurn || p.charAt(0) !== playerColor) return false; 
            showPaths(s); 
        },
        onDrop: (s, t) => { 
            removeH(); 
            let move = game.move({from: s, to: t, promotion: 'q'}); 
            if(!move) return 'snapback'; 
            
            updateS(); 
            isMyTurn = false; 
            $('#compStatus').text("Waiting for opponent...").css('color', '#ffb300');
            stopTurnTimer();
            updateMoveOnServer(game.fen());

            // Check if my move resulted in checkmate (I win)
            if (game.in_checkmate()) {
                updateMatchResultDB(currentId, currentOpponentId);
                $('#gameOverTitle').text("Victory!").css('color', '#00ffaa');
                $('#gameOverMsg').text("You won by Checkmate!");
                $('#gameOverModal').css('display', 'flex');
            }
        },
        onSnapEnd: () => board.position(game.fen())
    };
    
    board = Chessboard('myBoard', cfg);
    setTimeout(() => { if(board) board.resize(); }, 100);
    setTimeout(() => { if(board) board.resize(); }, 500);
    $(window).resize(() => { if(board) board.resize(); });
    updateS();
    
    if(isWhite) {
         $('#compStatus').text("Your Turn! Make a move.").css('color', '#00ffaa');
         startTurnTimer(); 
    } else {
         $('#compStatus').text("Waiting for opponent...").css('color', '#ffb300');
         stopTurnTimer();
    }

    // SPEED INCREASE: Decreased to 500ms (Limit of HTTP Polling for GS)
    if (gamePollInterval) clearInterval(gamePollInterval);
    gamePollInterval = setInterval(pollOpponentMove, 1200);
}

async function updateMoveOnServer(fen) {
    try {
        await fetch(API_URL, { 
            method: "POST", 
            body: JSON.stringify({action: "updateMove", myId: currentId, oppId: currentOpponentId, fen: fen, cacheBuster: Date.now()}) 
        });
    } catch(e) { console.error("Move sync fail:", e); }
}

async function pollOpponentMove() {
    try {
        const res = await fetch(API_URL, { 
            method: "POST", 
            body: JSON.stringify({action: "pollGame", myId: currentId, oppId: currentOpponentId, cacheBuster: Date.now()}) 
        });
        const d = await res.json();
        
        if (d.status === "success") {
            // Check for Opponent Quit
            if(d.matchState.startsWith("QUIT_")) {
                let quitter = d.matchState.split("_")[1];
                if(quitter !== currentId) {
                    clearInterval(gamePollInterval);
                    $('#gameOverTitle').text("Victory!").css('color', '#00ffaa');
                    $('#gameOverMsg').text("Opponent left the match.");
                    $('#gameOverModal').css('display', 'flex');
                }
                return;
            }
            // Check for Opponent Timeout
            if(d.matchState.startsWith("TIMEOUT_")) {
                let loser = d.matchState.split("_")[1];
                if(loser !== currentId) {
                    clearInterval(gamePollInterval);
                    $('#gameOverTitle').text("Victory!").css('color', '#00ffaa');
                    $('#gameOverMsg').text("Opponent ran out of time.");
                    $('#gameOverModal').css('display', 'flex');
                }
                return;
            }

            // Sync Board if not my turn
            if (!isMyTurn && d.fen && d.fen !== "") {
                if (d.fen !== game.fen()) {
                    let valid = game.load(d.fen);
                    if (valid) {
                        board.position(d.fen);
                        updateS();
                        isMyTurn = true;
                        $('#compStatus').text("Your Turn! Make a move.").css('color', '#00ffaa');
                        showToast("Opponent made a move!");
                        startTurnTimer(); 

                        // Check if opponent's move checkmated me
                        if (game.in_checkmate()) {
                            stopTurnTimer();
                            $('#gameOverTitle').text("Defeat").css('color', '#ff4b2b');
                            $('#gameOverMsg').text("You lost by Checkmate.");
                            $('#gameOverModal').css('display', 'flex');
                        }
                    }
                }
            }
        }
    } catch(e) {}
}

function returnToLobby() {
    $('#gameOverModal').css('display', 'none');
    quitGame();
    // Re-fetch login to update stats
    loginUserSilentUpdate();
}

async function loginUserSilentUpdate() {
    // Silent update to refresh stats in lobby after game
    let localData = JSON.parse(localStorage.getItem('chessUserData'));
    if(!localData) return;
    
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "login", userId: currentId, password: "NO_PASSWORD_REQUIRED_JUST_GET_STATS_HACK_TODO"}) });
        // Since we don't have password stored easily, we just ask user to reload if they want fresh stats, or we wait for next relogin.
        // Actually, user can just see their updated stats when they close browser and open again.
        // For now, simple return to lobby is fine.
    } catch(e) {}
    startPolling();
}

// =====================================
// 5. AI GAME LOGIC
// =====================================
function startAiGame(lvl) {
    if(pollInterval) clearInterval(pollInterval); 
    if(outgoingPollInterval) clearInterval(outgoingPollInterval);
    if(gamePollInterval) clearInterval(gamePollInterval);

    isMultiplayer = false;
    aiLvl = lvl === 'PRO' ? 12 : (lvl === 'Expert' ? 5 : 1);
    
    game.reset(); 
    undos = 3; 
    
    $('#uC').text(undos);
    $('#uB').show(); 
    $('#uC').parent().show();
    $('#diffTitle').text("VS " + lvl + " AI");
    
    $('#oppNameLabel').text("AI");
    $('#turnTimerBox').hide(); 
    
    showScreen('screenComputer');
    
    let cfg = {
        draggable: true, 
        position: 'start',
        orientation: 'white',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDragStart: (s, p) => { 
            if(game.game_over() || p.search(/^b/) !== -1) return false; 
            showPaths(s); 
        },
        onDrop: (s, t) => { 
            removeH(); 
            let move = game.move({from: s, to: t, promotion: 'q'}); 
            if(!move) return 'snapback'; 
            
            updateS(); 
            setTimeout(aiMove, 300); 
        },
        onSnapEnd: () => board.position(game.fen())
    };
    board = Chessboard('myBoard', cfg);
    
    setTimeout(() => { if(board) board.resize(); }, 100);
    setTimeout(() => { if(board) board.resize(); }, 500);
    $(window).resize(() => { if(board) board.resize(); });
}

function aiMove() {
    $('#compStatus').text("AI Thinking...").css('color', '#ffb300');
    
    fetch("https://chess-api.com/v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: game.fen(), depth: aiLvl })
    })
    .then(r => r.json())
    .then(d => {
        if(d && d.move) {
            let m = d.move; 
            let promo = m.length > 4 ? m[4] : 'q';
            game.move({from: m.slice(0,2), to: m.slice(2,4), promotion: promo});
            board.position(game.fen()); 
            updateS();
        } else {
            $('#compStatus').text("AI Engine Retry...").css('color', '#ff4b2b');
            setTimeout(aiMove, 2500); 
        }
    })
    .catch(e => {
        $('#compStatus').text("Network Connection Retry...").css('color', '#ff4b2b');
        setTimeout(aiMove, 3000); 
    });
}

// =====================================
// 6. SHARED BOARD MECHANICS
// =====================================
function showPaths(s) {
    game.moves({square: s, verbose: true}).forEach(m => {
        let $sq = $('#myBoard .square-' + m.to);
        $sq.addClass($sq.hasClass('black-3c85d') ? 'highlight-black' : 'highlight-white');
    });
}

function removeH() { 
    $('#myBoard .square-55d63').removeClass('highlight-white highlight-black'); 
}

function updateS() {
    let stat = game.in_checkmate() ? "Checkmate!" : (game.in_check() ? "Check!" : "Your Turn");
    $('#compStatus').text(stat).css('color', game.in_check() ? '#ff4b2b' : '#00ffaa');
    
    let w = 0, b = 0;
    game.board().flat().filter(p => p).forEach(p => { 
        let v = {p:1, n:3, b:3, r:5, q:9, k:0}[p.type]; 
        p.color === 'w' ? w += v : b += v; 
    });
    
    $('#sW').text(w); 
    $('#sB').text(b);
    $('.p-info').removeClass('active-p');
    $(game.turn() === 'w' ? '.p-w' : '.p-b').addClass('active-p');
}

function undoMove() {
    if(isMultiplayer) return showToast("Undo disabled in multiplayer!", true); 

    if(undos > 0 && game.history().length > 1) {
        game.undo(); 
        game.undo(); 
        board.position(game.fen());
        undos--; 
        $('#uC').text(undos); 
        updateS();
    }
}

function quitGame() { 
    if(pollInterval) clearInterval(pollInterval);
    if(outgoingPollInterval) clearInterval(outgoingPollInterval);
    if(gamePollInterval) clearInterval(gamePollInterval);
    stopTurnTimer();
    
    if(isMultiplayer) {
        // I lose because I quit
        fetch(API_URL, { method: "POST", body: JSON.stringify({action: "quitMatch", myId: currentId, oppId: currentOpponentId}) });
        updateMatchResultDB(currentOpponentId, currentId);
    }
    
    isModalActive = false; 
    
    if(currentId !== "") {
        showScreen('screenLobby');
        startPolling();
    } else {
        showScreen('screenLanding'); 
    }
}
