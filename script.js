// ==========================================
// GLOBALS & CONFIGURATION (No lines deleted, functionality expanded)
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

// NAYA LOGIC: Turn Timer Variables
let turnTimerInterval = null;
let timeLeft = 30;

// ==========================================
// SESSION MANAGEMENT (Persistent Login)
// ==========================================
$(window).on('load', function() {
    let savedId = localStorage.getItem('chessUserId');
    let savedName = localStorage.getItem('chessUserName');
    if(savedId && savedName) {
        currentId = savedId;
        currentUsername = savedName;
        $('#lobbyUsername').text(savedName);
        $('#lobbyMyId').text(savedId);
        
        // Update Landing Screen
        $('#authBtnStack').html(`
            <button onclick="showScreen('screenLobby'); startPolling();" class="main-btn">Return to Lobby</button>
            <button onclick="logoutUser()" class="sec-btn" style="margin-top:10px; border-color:#ff4b2b; color:#ff4b2b;">Logout Complete</button>
        `);
    }
});

function logoutUser() {
    localStorage.removeItem('chessUserId');
    localStorage.removeItem('chessUserName');
    location.reload(); // Refresh to clear state completely
}

// ==========================================
// IN-GAME NOTIFICATION SYSTEM 
// ==========================================
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

// UI HELPER FUNCTIONS
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
// 1. REGISTRATION & LOGIN
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
            currentUsername = d.username;
            
            if(d.userStatus === "NEW") {
                showScreen('screenChangePass');
            } else { 
                // NAYA LOGIC: Save to local storage for persistent session
                localStorage.setItem('chessUserId', currentId);
                localStorage.setItem('chessUserName', currentUsername);
                
                $('#lobbyUsername').text(d.username);
                $('#lobbyMyId').text(id);
                
                // Update landing buttons dynamically
                $('#authBtnStack').html(`
                    <button onclick="showScreen('screenLobby'); startPolling();" class="main-btn">Return to Lobby</button>
                    <button onclick="logoutUser()" class="sec-btn" style="margin-top:10px; border-color:#ff4b2b; color:#ff4b2b;">Logout Complete</button>
                `);
                
                showScreen('screenLobby');
                startPolling(); 
                showToast(`Welcome Back ${d.username}!`); 
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
        } else {
            showToast(d.message, true);
        }
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
            // Also save session on first password change
            localStorage.setItem('chessUserId', currentId);
            localStorage.setItem('chessUserName', currentUsername);
            
            showToast("Password Updated! Welcome to Lobby."); 
            $('#lobbyMyId').text(currentId);
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
                            $('#challengeBtn').text("⚔️ Challenge Player").prop('disabled', false);
                        }
                    }
                } catch(err) { console.log("Wait..."); }
            }, 2000);

        } else {
            showToast(d.message, true);
            $('#challengeBtn').text("⚔️ Challenge Player").prop('disabled', false);
        }
    } catch(e) {
        console.error("Send Challenge Error:", e);
        $('#challengeBtn').text("⚔️ Challenge Player").prop('disabled', false);
    }
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
    } catch(e) {
        console.error("Respond Challenge Error:", e);
        setTimeout(() => { isModalActive = false; }, 3000);
    }
}

// =====================================
// NAYA LOGIC: TURN TIMER FUNCTIONS
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
            // Time out = Loss via API
            fetch(API_URL, { method: "POST", body: JSON.stringify({action: "timeoutMatch", myId: currentId, oppId: currentOpponentId}) });
            $('#gameOverTitle').text("Timeout!");
            $('#gameOverMsg').text("You ran out of time. You lose.");
            $('#gameOverModal').css('display', 'flex');
        }
    }, 1000);
}

function stopTurnTimer() {
    clearInterval(turnTimerInterval);
    $('#turnTimerBox').hide();
}


// =====================================
// 4. REAL-TIME MULTIPLAYER GAME (FASTER POLLING)
// =====================================
function startMultiplayerGame(isWhite) {
    if(pollInterval) clearInterval(pollInterval);
    if(outgoingPollInterval) clearInterval(outgoingPollInterval);
    
    isMultiplayer = true;
    playerColor = isWhite ? 'w' : 'b';
    isMyTurn = isWhite; 

    game.reset(); 
    $('#diffTitle').text("VS REAL PLAYER");
    
    // NAYA LOGIC: UPDATE UI WITH OPPONENT ID
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
            stopTurnTimer(); // Turn khatam toh timer band
            
            updateMoveOnServer(game.fen());
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
         startTurnTimer(); // Start 30s countdown
    } else {
         $('#compStatus').text("Waiting for opponent...").css('color', '#ffb300');
         stopTurnTimer();
    }

    // NAYA LOGIC: FASTER 800MS POLLING (Maximum safe for Google Apps Script)
    if (gamePollInterval) clearInterval(gamePollInterval);
    gamePollInterval = setInterval(pollOpponentMove, 800);
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
            // Check for Opponent Quit or Timeout
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
                        startTurnTimer(); // NAYA: Start 30s timer for my turn
                    }
                }
            }
        }
    } catch(e) { console.error("Polling Opponent Move Error:", e); }
}

function returnToLobby() {
    $('#gameOverModal').css('display', 'none');
    quitGame();
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
    
    // NAYA LOGIC: Reset Label to AI
    $('#oppNameLabel').text("AI");
    $('#turnTimerBox').hide(); // Hide timer for AI mode
    
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

// NAYA LOGIC: QUIT GAME API INTEGRATION
function quitGame() { 
    if(pollInterval) clearInterval(pollInterval);
    if(outgoingPollInterval) clearInterval(outgoingPollInterval);
    if(gamePollInterval) clearInterval(gamePollInterval);
    stopTurnTimer();
    
    if(isMultiplayer) {
        // Opponent ko batana ki main quit kar diya
        fetch(API_URL, { method: "POST", body: JSON.stringify({action: "quitMatch", myId: currentId, oppId: currentOpponentId}) });
    }
    
    isModalActive = false; 
    showScreen('screenLanding'); 
    
    if(currentId !== "") {
        // Keep in lobby if logged in
        showScreen('screenLobby');
        startPolling();
    }
}
