// --- UPDATE YOUR LATEST API URL HERE ---
const API_URL = "https://script.google.com/macros/s/AKfycbwgGUnR-9o3vFxjTQm8aFiaUf3ObHFmjtBcoAuhmVXCPLw8GM2YD0zSQR8lucT97reT/exec"; 

let board = null, game = new Chess(), undos = 3, currentId = "", aiLvl = 1, currentEmail = "";
let pollInterval = null;

// Password Visibility Logic
function toggleVisibility(inputId, icon) {
    let input = document.getElementById(inputId);
    if (input.type === "password") { input.type = "text"; icon.classList.replace("fa-eye", "fa-eye-slash"); } 
    else { input.type = "password"; icon.classList.replace("fa-eye-slash", "fa-eye"); }
}

function showScreen(id) {
    $('.screen').removeClass('active-screen');
    $('#' + id).addClass('active-screen');
}

// =====================================
// REGISTRATION & LOGIN
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
            $('#regMsg').text("Done! Check Gmail for ID & Password.").css('color', '#00ffaa');
            $('#regUsername, #regEmail').val("");
        } else {
            $('#regMsg').text(d.message).css('color', 'red'); // Duplicate Email msg
        }
    } catch(e) { $('#regMsg').text("Server Error!").css('color', 'red'); }
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
                startPolling(); // Lobby me aate hi notifications check karna shuru
            }
        } else {
            $('#loginMsg').text(d.message).css('color', 'red');
        }
    } catch(e) { alert("Login failed."); }
    $('#loginBtn').text("Enter Arena").prop('disabled', false);
}

// =====================================
// FORGOT PASSWORD FLOW
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
            $('#forgotMsg').text(d.message).css('color', 'red');
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
            $('#resetMsg').text(d.message).css('color', 'red');
        }
    } catch(e) {}
    $('#resetBtn').text("Reset Password").prop('disabled', false);
}

async function changePassword() {
    const p1 = $('#newPass').val().trim(), p2 = $('#confirmPass').val().trim();
    if(p1.length < 4 || p1 !== p2) return alert("Password match nahi hua!");

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
// MULTIPLAYER MATCHMAKING (Search & Poll)
// =====================================
async function sendChallenge() {
    const target = $('#targetId').val().trim();
    if(!target || target === currentId) return alert("Valid opponent ID dalo!");
    
    $('#challengeBtn').text("Challenging...").prop('disabled', true);
    try {
        const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "sendChallenge", targetId: target, myId: currentId}) });
        const d = await res.json();
        if(d.status === "success") {
            $('#lobbyMsg').text("Challenge sent! Waiting for response...").css('color', '#00ffaa');
        } else {
            $('#lobbyMsg').text(d.message).css('color', 'red');
        }
    } catch(e) {}
    $('#challengeBtn').text("⚔️ Challenge / Play").prop('disabled', false);
}

// Background checking for incoming challenges
function startPolling() {
    if(pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "poll", myId: currentId}) });
            const d = await res.json();
            
            if(d.status === "success") {
                if(d.matchState === "PENDING" && d.challenger !== "") {
                    $('#challengerIdText').text(d.challenger);
                    $('#challengeModal').css('display', 'flex'); // Show Modal
                }
                if(d.matchState === "ACCEPTED") {
                    clearInterval(pollInterval); // Stop polling when game starts
                    alert("Match Accepted! Game starting... (Multiplayer board logic will load here)");
                    // showScreen('screenMultiplayerBoard'); -> Future integration
                }
                if(d.matchState === "REJECTED") {
                    $('#lobbyMsg').text("Last challenge was rejected!").css('color', 'red');
                }
            }
        } catch(e) {}
    }, 4000); // Poll every 4 seconds
}

async function respondChallenge(response) {
    $('#challengeModal').css('display', 'none'); // Hide modal
    try {
        await fetch(API_URL, { method: "POST", body: JSON.stringify({action: "respondChallenge", myId: currentId, response: response}) });
        if(response === "ACCEPTED") {
            clearInterval(pollInterval);
            alert("You accepted the match! Game starting...");
        }
    } catch(e) {}
}


// =====================================
// ORIGINAL AI GAME LOGIC (Untouched/Expanded)
// =====================================
function startAiGame(lvl) {
    if(pollInterval) clearInterval(pollInterval); // Stop polling if playing AI
    aiLvl = lvl === 'PRO' ? 12 : (lvl === 'Expert' ? 5 : 1);
    game.reset(); undos = 3; $('#uC').text(undos);
    $('#diffTitle').text("VS " + lvl + " AI");
    showScreen('screenComputer');
    
    let cfg = {
        draggable: true, position: 'start',
        pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
        onDragStart: (s, p) => { if(game.game_over() || p.search(/^b/) !== -1) return false; showPaths(s); },
        onDrop: (s, t) => { removeH(); let move = game.move({from: s, to: t, promotion: 'q'}); if(!move) return 'snapback'; updateS(); setTimeout(aiMove, 300); },
        onSnapEnd: () => board.position(game.fen())
    };
    board = Chessboard('myBoard', cfg);
    $(window).resize(board.resize);
}

function showPaths(s) {
    game.moves({square: s, verbose: true}).forEach(m => {
        let $sq = $('#myBoard .square-' + m.to);
        $sq.addClass($sq.hasClass('black-3c85d') ? 'highlight-black' : 'highlight-white');
    });
}
function removeH() { $('#myBoard .square-55d63').removeClass('highlight-white highlight-black'); }

function aiMove() {
    $('#compStatus').text("AI Thinking...").css('color', 'yellow');
    fetch(`https://stockfish.online/api/s/v2.php?fen=${game.fen()}&depth=${aiLvl}`)
    .then(r => r.json()).then(d => {
        let m = d.bestmove.split(' ')[1];
        game.move({from: m.slice(0,2), to: m.slice(2,4), promotion: m[4]});
        board.position(game.fen()); updateS();
    });
}

function updateS() {
    let stat = game.in_checkmate() ? "Checkmate!" : (game.in_check() ? "Check!" : "Your Turn");
    $('#compStatus').text(stat).css('color', game.in_check() ? 'red' : '#00ffaa');
    let w = 0, b = 0;
    game.board().flat().filter(p => p).forEach(p => { let v = {p:1,n:3,b:3,r:5,q:9,k:0}[p.type]; p.color==='w' ? w+=v : b+=v; });
    $('#sW').text(w); $('#sB').text(b);
    $('.p-info').removeClass('active-p');
    $(game.turn()==='w' ? '.p-w' : '.p-b').addClass('active-p');
}

function undoMove() {
    if(undos > 0 && game.history().length > 1) {
        game.undo(); game.undo(); board.position(game.fen());
        undos--; $('#uC').text(undos); updateS();
    }
}
function quitGame() { 
    if(pollInterval) clearInterval(pollInterval);
    showScreen('screenLanding'); 
}