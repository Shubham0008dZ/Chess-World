// ==========================================
// GLOBALS & CONFIGURATION
// ==========================================
// UPDATE YOUR LATEST GOOGLE APPS SCRIPT URL HERE
const API_URL = "https://script.google.com/macros/s/AKfycbwgGUnR-9o3vFxjTQm8aFiaUf3ObHFmjtBcoAuhmVXCPLw8GM2YD0zSQR8lucT97reT/exec"; 

let board = null;
let game = new Chess(); 
let undos = 3;
let currentId = "";
let currentEmail = "";
let aiLvl = 1;

// Multiplayer Variables
let pollInterval = null; 
let outgoingPollInterval = null; 
let currentTargetId = "";
let isMultiplayer = false;
let isMyTurn = false;
let playerColor = 'w';
let isModalActive = false; 

// ==========================================
// UI HELPER FUNCTIONS
// ==========================================
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
    
    // Agar board hide hoke wapas show hua hai, toh resize karna zaroori hai mobile ke liye
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
    if(!user || !mail) return alert("All fields required!");
    
    $('#regBtn').text("Registering...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "register", username: user, email: mail}) });
        const d = await res.json();
        if(d.status === "success") {
            $('#regMsg').text("Registration Done! Check Gmail for ID & Password.").css('color', '#00ffaa');
            $('#regUsername, #regEmail').val("");
        } else {
            $('#regMsg').text(d.message).css('color', '#ff4b2b'); 
        }
    } catch(e) { $('#regMsg').text("Server Error!").css('color', '#ff4b2b'); }
    $('#regBtn').text("Join Arena").prop('disabled', false);
}

async function loginUser() {
    const id = $('#loginId').val().trim();
    const pass = $('#loginPass').val().trim();
    if(!id || !pass) return alert("Enter ID and Password!");

    $('#loginBtn').text("Verifying...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "login", userId: id, password: pass}) });
        const d = await res.json();
        if(d.status === "success") {
            currentId = id;
            if(d.userStatus === "NEW") {
                showScreen('screenChangePass');
            } else { 
                $('#lobbyUsername').text(d.username);
                $('#lobbyMyId').text(id);
                showScreen('screenLobby');
                startPolling(); // LIVE CONNECTION STARTS HERE
            }
        } else {
            $('#loginMsg').text(d.message).css('color', '#ff4b2b');
        }
    } catch(e) { alert("Login failed. Check connection."); }
    $('#loginBtn').text("Enter Arena").prop('disabled', false);
}

// =====================================
// 2. FORGOT / CHANGE PASSWORD
// =====================================
async function sendOtp() {
    const mail = $('#forgotEmail').val().trim();
    if(!mail) return alert("Enter Email!");
    $('#sendOtpBtn').text("Sending...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "sendOtp", email: mail}) });
        const d = await res.json();
        if(d.status === "success") {
            currentEmail = mail;
            showScreen('screenVerifyOtp');
        } else {
            $('#forgotMsg').text(d.message).css('color', '#ff4b2b');
        }
    } catch(e) {}
    $('#sendOtpBtn').text("Send OTP").prop('disabled', false);
}

async function verifyAndResetPass() {
    const otp = $('#otpCode').val().trim();
    const p1 = $('#resetPass1').val().trim();
    const p2 = $('#resetPass2').val().trim();
    
    if(!otp || p1 !== p2 || p1.length < 4) return alert("Invalid details or Passwords mismatch!");
    $('#resetBtn').text("Verifying...").prop('disabled', true);
    
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "verifyOtpAndReset", email: currentEmail, otp: otp, newPassword: p1}) });
        const d = await res.json();
        if(d.status === "success") {
            alert("Password Reset Successfully! Login now.");
            showScreen('screenLogin');
        } else {
            $('#resetMsg').text(d.message).css('color', '#ff4b2b');
        }
    } catch(e) {}
    $('#resetBtn').text("Reset Password").prop('disabled', false);
}

async function changePassword() {
    const p1 = $('#newPass').val().trim(), p2 = $('#confirmPass').val().trim();
    if(p1.length < 4 || p1 !== p2) return alert("Password match nahi hua ya bohot chhota hai!");

    $('#changePassBtn').text("Saving...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "changePassword", userId: currentId, newPassword: p1}) });
        const d = await res.json();
        if(d.status === "success") { 
            alert("Password Updated! Entering Lobby..."); 
            $('#lobbyMyId').text(currentId);
            showScreen('screenLobby');
            startPolling();
        }
    } catch(e) {}
    $('#changePassBtn').text("Save & Proceed").prop('disabled', false);
}

// =====================================
// 3. FAST MULTIPLAYER MATCHMAKING
// =====================================

// SENDER LOGIC
async function sendChallenge() {
    const target = $('#targetId').val().trim();
    if(!target || target === currentId) return alert("Valid opponent ID dalo!");
    
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
                            $('#lobbyMsg').text("Challenge Accepted! Starting game...").css('color', '#00ffaa');
                            setTimeout(() => { startMultiplayerGame(false); }, 1000); 
                        } else if(outD.matchState === "REJECTED") {
                            clearInterval(outgoingPollInterval);
                            $('#lobbyMsg').text("Challenge Rejected by Player!").css('color', '#ff4b2b');
                            $('#challengeBtn').text("⚔️ Challenge Player").prop('disabled', false);
                        }
                    }
                } catch(err) { console.log("Outgoing poll wait..."); }
            }, 2000);

        } else {
            $('#lobbyMsg').text(d.message).css('color', '#ff4b2b');
            $('#challengeBtn').text("⚔️ Challenge Player").prop('disabled', false);
        }
    } catch(e) {
        $('#challengeBtn').text("⚔️ Challenge Player").prop('disabled', false);
    }
}

// RECEIVER LOGIC
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
                    $('#challengerIdText').text(d.challenger);
                    $('#challengeModal').css('display', 'flex'); 
                }
                if(d.matchState === "REJECTED") {
                    $('#lobbyMsg').text("Last challenge was rejected.").css('color', '#ff4b2b');
                    fetch(API_URL, { method: "POST", body: JSON.stringify({action: "respondChallenge", myId: currentId, response: "IDLE"}) });
                }
            }
        } catch(e) { console.log("Polling wait..."); }
    }, 2000); 
}

// Receiver accepts or rejects
async function respondChallenge(response) {
    $('#challengeModal').css('display', 'none'); 
    try {
        await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "respondChallenge", myId: currentId, response: response}) });
        
        if(response === "ACCEPTED") {
            clearInterval(pollInterval);
            isModalActive = false;
            alert("Match Accepted! Preparing multiplayer arena...");
            setTimeout(() => { startMultiplayerGame(true); }, 1000);
        } else {
            setTimeout(() => { isModalActive = false; }, 3000);
        }
    } catch(e) {
        setTimeout(() => { isModalActive = false; }, 3000);
    }
}

// =====================================
// 4. MULTIPLAYER GAME LOGIC
// =====================================
function startMultiplayerGame(isWhite) {
    if(pollInterval) clearInterval(pollInterval);
    if(outgoingPollInterval) clearInterval(outgoingPollInterval);
    
    isMultiplayer = true;
    playerColor = isWhite ? 'w' : 'b';
    isMyTurn = isWhite; 

    game.reset(); 
    $('#diffTitle').text("VS REAL PLAYER");
    
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
    } else {
         $('#compStatus').text("Waiting for opponent...").css('color', '#ffb300');
    }
}

// =====================================
// 5. AI GAME LOGIC (Upgraded AI Backend)
// =====================================
function startAiGame(lvl) {
    if(pollInterval) clearInterval(pollInterval); 
    if(outgoingPollInterval) clearInterval(outgoingPollInterval);

    isMultiplayer = false;
    aiLvl = lvl === 'PRO' ? 12 : (lvl === 'Expert' ? 5 : 1);
    
    game.reset(); 
    undos = 3; 
    
    $('#uC').text(undos);
    $('#uB').show(); 
    $('#uC').parent().show();
    $('#diffTitle').text("VS " + lvl + " AI");
    
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

// ========================================================
// UPGRADED AI FUNCTION: Ultra Stable API to fix the bug
// ========================================================
function aiMove() {
    $('#compStatus').text("AI Thinking...").css('color', '#ffb300');
    
    // Naya premium free API use kar rahe hain jo secure POST use karta hai
    // Isme FEN break hone ki (Pyada 2 kadam) dikkat hamesha ke liye khatam ho jayegi
    fetch("https://chess-api.com/v1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fen: game.fen(), depth: aiLvl })
    })
    .then(r => r.json())
    .then(d => {
        if(d && d.move) {
            let m = d.move; // Move jaise "e2e4" format me aati hai
            let promo = m.length > 4 ? m[4] : 'q';
            
            game.move({from: m.slice(0,2), to: m.slice(2,4), promotion: promo});
            board.position(game.fen()); 
            updateS();
        } else {
            console.error("AI API Error:", d);
            $('#compStatus').text("AI Engine Retry...").css('color', '#ff4b2b');
            setTimeout(aiMove, 2500); 
        }
    })
    .catch(e => {
        console.error("Network Error:", e);
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
    if(isMultiplayer) return; 

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
    isModalActive = false; 
    showScreen('screenLanding'); 
}
