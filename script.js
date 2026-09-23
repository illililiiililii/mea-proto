// ==========================================
// [설정] 백엔드 URL 및 전역 상태 변수
// ==========================================
const BACKEND_URL = "http://localhost:5000";

let myUserId = sessionStorage.getItem('myUserId') || "";
let myUserName = sessionStorage.getItem('myUserName') || "";
let currentRoomId = null;
let currentTargetUserId = null;
let lastRenderedMsgCount = -1;
let messagePollingInterval = null;
let isSending = false;

// ==========================================
// [DOM 엘리먼트 획득]
// ==========================================
// 메인 UI & 상단
const messengerMain = document.getElementById('messenger-main');
const loginWin = document.getElementById('login-win');
const userDisplayName = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');

// 커스텀 로그아웃 모달 엘리먼트 (HTML 연동)
const logoutModal = document.getElementById('logout-modal');
const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
const cancelLogoutBtn = document.getElementById('cancel-logout-btn');

// 인증(로그인/회원가입) 탭 & 폼
const tabLoginBtn = document.getElementById('tab-login-btn');
const tabRegisterBtn = document.getElementById('tab-register-btn');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

// 로그인 입력창
const loginIdInput = document.getElementById('login-id');
const loginPwInput = document.getElementById('login-pw');

// 회원가입 입력창
const regIdInput = document.getElementById('reg-id');
const regPwInput = document.getElementById('reg-pw');
const regNameInput = document.getElementById('reg-name');

// 검색 및 네비게이션 목록
const naviList = document.querySelector('.navi');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

// 채팅 화면 영역
const chatscreen = document.getElementById('chat-screen');
const missing = document.getElementById('missing');
const chatTitle = document.querySelector('.chat-title');
const chatBody = document.getElementById('chat-body');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const chatFooter = document.querySelector('.chat-footer');
const chatback = document.getElementById('chat-back');
//비번 보기 숨기기
const regPwToggle = document.getElementById('reg-pw-toggle')
const loginPwToggle = document.getElementById('login-pw-toggle')

// 로그인 비밀번호 토글
if (loginPwToggle && loginPwInput) {
    loginPwToggle.onclick = function() {
        const isPassword = loginPwInput.type === 'password';
        loginPwInput.type = isPassword ? 'text' : 'password';
        loginPwToggle.textContent = isPassword ? '👁️' : '🙈';
    };
}

// 회원가입 비밀번호 토글
if (regPwToggle && regPwInput) {
    regPwToggle.onclick = function() {
        const isPassword = regPwInput.type === 'password';
        regPwInput.type = isPassword ? 'text' : 'password';
        regPwToggle.textContent = isPassword ? '👁️' : '🙈';
    };
}


// ==========================================
// 1. 공통 범용 모달 (일반 알림용) & HTML 로그아웃 모달 연동
// ==========================================
// [기본 안내 메시지용 동적 모달]
function showModal(msg, onConfirm = null) {
    let overlay = document.querySelector('.modal-overlay:not(#logout-modal)');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="select-ui">
                <div class="select-inbox" id="modal-msg-text"></div>
                <div class="btn-box">
                    <button type="button" class="btn-y" id="modal-ok-btn">확인</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    const msgText = overlay.querySelector('#modal-msg-text');
    const okBtn = overlay.querySelector('#modal-ok-btn');

    msgText.textContent = msg;
    overlay.classList.add('show');

    okBtn.onclick = () => {
        overlay.classList.remove('show');
        if (onConfirm) onConfirm();
    };
}

// [HTML에 작성된 로그아웃 모달 제어]
if (logoutBtn && logoutModal) {
    // 1) 로그아웃 버튼 클릭 시 모달 띄우기
    logoutBtn.onclick = () => {
        logoutModal.classList.add('show');
    };

    // 2) YES (확인) 버튼 클릭 시 세션 삭제 후 새로고침
    if (confirmLogoutBtn) {
        confirmLogoutBtn.onclick = () => {
            sessionStorage.clear();
            location.reload();
        };
    }

    // 3) NO (취소) 버튼 클릭 시 모달 닫기
    if (cancelLogoutBtn) {
        cancelLogoutBtn.onclick = () => {
            logoutModal.classList.remove('show');
        };
    }
}


// ==========================================
// 2. 로그인 ↔ 회원가입 탭 전환 이벤트
// ==========================================
if (tabLoginBtn && tabRegisterBtn) {
    tabLoginBtn.onclick = () => {
        tabLoginBtn.classList.add('active');
        tabRegisterBtn.classList.remove('active');
        if (loginForm) loginForm.style.display = 'flex';
        if (registerForm) registerForm.style.display = 'none';
    };

    tabRegisterBtn.onclick = () => {
        tabRegisterBtn.classList.add('active');
        tabLoginBtn.classList.remove('active');
        if (registerForm) registerForm.style.display = 'flex';
        if (loginForm) loginForm.style.display = 'none';
    };
}


// ==========================================
// 3. 로그인 / 회원가입 제출(Submit) 연동
// ==========================================
if (loginForm) {
    loginForm.onsubmit = async (e) => {
        e.preventDefault();

        const inputId = loginIdInput ? loginIdInput.value.trim() : "";
        const inputPw = loginPwInput ? loginPwInput.value.trim() : "";

        if (!inputId || !inputPw) {
            showModal("아이디와 비밀번호를 모두 입력해 주세요!");
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: inputId, password: inputPw })
            });

            const data = await response.json();

            if (data.success) {
                myUserId = data.userId;
                myUserName = data.userName;

                sessionStorage.setItem('myUserId', myUserId);
                sessionStorage.setItem('myUserName', myUserName);

                completeLogin();
            } else {
                showModal(data.message || "로그인 실패: 아이디/비밀번호를 확인해 주세요.");
            }
        } catch (err) {
            console.error("로그인 에러:", err);
            showModal("⚠️ 서버가 실행 중인지 확인해 주세요!");
        }
    };
}

if (registerForm) {
    registerForm.onsubmit = async (e) => {
        e.preventDefault();

        const userId = regIdInput ? regIdInput.value.trim() : "";
        const password = regPwInput ? regPwInput.value.trim() : "";
        const userName = regNameInput ? regNameInput.value.trim() : "";

        // 1. 필수값 체크
        if (!userId || !password || !userName) {
            showModal("모든 항목을 입력해 주세요!");
            return;
        }

        // 2. [추가] 아이디 영문/숫자 유효성 검사 (영문이 포함된 영문+숫자만 허용)
        const idRegex = /^[a-zA-Z0-9]+$/;
        if (!idRegex.test(userId)) {
            showModal("아이디는 영문, 숫자 조합으로만 입력 가능합니다.");
            return;
        } 
        
        if (userId.length < 2) {
            showModal("아이디는 2자 이상이여야 합니다.")
            return;
        }

        // 3. [추가] 비밀번호 8자 이상 검사
        if (password.length < 8) {
            showModal("비밀번호는 8자 이상이어야 합니다.");
            return;
        }

        try {
            const response = await fetch(`${BACKEND_URL}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, password, userName })
            });

            const data = await response.json();

            if (data.success) {
                showModal("🎉 회원가입 성공! 로그인해 주세요.", () => {
                    regIdInput.value = "";
                    regPwInput.value = "";
                    regNameInput.value = "";

                    if (loginIdInput) loginIdInput.value = userId;
                    if (tabLoginBtn) tabLoginBtn.click();
                });
            } else {
                showModal(data.message || "회원가입에 실패했습니다.");
            }
        } catch (err) {
            console.error("회원가입 에러:", err);
            showModal("⚠️ 서버 통신 중 오류가 발생했습니다.");
        }
    };
}


// ==========================================
// 4. 로그인 완료 처리 및 유저 목록
// ==========================================
function completeLogin() {
    if (loginWin) loginWin.style.display = 'none';
    if (messengerMain) messengerMain.classList.remove('is-blurred');
    
    if (logoutBtn) {
        logoutBtn.style.display = 'inline-block';
        logoutBtn.style.visibility = 'visible';
        logoutBtn.style.opacity = '1';
    }
    
    if (userDisplayName) userDisplayName.textContent = `(${myUserName}님)`;

    fetchAndRenderUsers();
}

async function fetchAndRenderUsers(query = "") {
    if (!myUserId) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/search_users?q=${encodeURIComponent(query)}&myId=${myUserId}`);
        const data = await response.json();

        if (data.success && naviList) {
            naviList.innerHTML = "";

            if (data.users.length === 0) {
                naviList.innerHTML = `<div style="padding:15px; color:var(--text-secondary); font-size:12px; text-align:center;">검색된 유저가 없습니다.</div>`;
                return;
            }

            data.users.forEach(user => {
                const btn = document.createElement('button');
                btn.className = 'user-chat-btn';
                btn.type = 'button';
                btn.innerHTML = `<div class="profile"></div><div><b>${user.userName}</b><br><small style="color:#8e8e93; font-weight:normal;">@${user.userId}</small></div>`;
                
                btn.onclick = () => {
                    openPrivateChat(user.userId, user.userName);
                };

                naviList.appendChild(btn);
            });
        }
    } catch (e) {
        console.error("유저 목록 로딩 에러:", e);
    }
}

if (searchBtn) searchBtn.onclick = () => fetchAndRenderUsers(searchInput ? searchInput.value.trim() : "");
if (searchInput) searchInput.oninput = (e) => fetchAndRenderUsers(e.target.value.trim());


// ==========================================
// 5. 대화방 및 메시지 처리
// ==========================================
function openPrivateChat(targetUserId, targetUserName) {
    currentTargetUserId = targetUserId;
    const ids = [myUserId, targetUserId].sort();
    currentRoomId = `chat_${ids[0]}_${ids[1]}`;

    if (chatTitle) chatTitle.textContent = targetUserName;
    if (chatscreen) chatscreen.style.display = 'flex';
    if (missing) missing.style.display = 'none';

    if (messengerMain) messengerMain.classList.add('mobile-chat-open');

    if (chatInput) {
        if (targetUserId === 'bot_gemini') {
            chatInput.placeholder = "AI에게 자유롭게 질문하세요... (Shift+Enter 줄바꿈)";
        } else {
            chatInput.placeholder = "메시지를 입력하세요... (@ai 질문 가능)";
        }
    }

    if (messagePollingInterval) clearInterval(messagePollingInterval);
    lastRenderedMsgCount = -1;

    fetchRoomMessages();
    messagePollingInterval = setInterval(fetchRoomMessages, 1000);
}

if (chatback) {
    chatback.onclick = function() {
        if (chatscreen) chatscreen.style.display = 'none';
        if (missing) missing.style.display = 'flex';
        if (messengerMain) messengerMain.classList.remove('mobile-chat-open');

        currentRoomId = null;
        currentTargetUserId = null;
        if (messagePollingInterval) clearInterval(messagePollingInterval);
    };
}

async function fetchRoomMessages() {
    if (!currentRoomId || isSending) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/messages/${currentRoomId}`);
        const data = await response.json();

        if (data.success && data.messages) {
            if (data.messages.length !== lastRenderedMsgCount) {
                if (chatBody) chatBody.innerHTML = "";
                
                data.messages.forEach(msg => {
                    const isMe = (msg.sender_id === myUserId);
                    const messageType = isMe ? 'outgoing' : 'incoming';
                    
                    let senderName = msg.sender_name || "";
                    if (msg.sender_id === 'bot_gemini' || msg.is_ai) {
                        senderName = "[AI]";
                    }

                    renderMessage(msg.text, messageType, senderName);
                });

                lastRenderedMsgCount = data.messages.length;
            }
        }
    } catch (error) {
        console.error("메시지 수신 실패:", error);
    }
}


// ==========================================
// 6. 메시지 전송 및 AI 연동
// ==========================================
if (chatInput) {
    chatInput.oninput = function() {
        if (chatInput.value.trim() === "") {
            if (sendButton) sendButton.classList.remove('show');
            if (chatFooter) chatFooter.classList.remove('has-text'); 
        } else {
            if (sendButton) sendButton.classList.add('show');
            if (chatFooter) chatFooter.classList.add('has-text');    
        }
    };

    chatInput.onkeydown = function(e) {
        if (e.isComposing) return; 

        if (e.key === 'Enter') {
            if (e.shiftKey) {
                return;
            } else {
                e.preventDefault(); 
                if (isSending) return; 
                handleMessageSubmit();
            }
        }
    };
}

if (sendButton) {
    sendButton.onclick = function(e) {
        e.preventDefault();
        if (isSending) return; 
        handleMessageSubmit();
    };
}

async function handleMessageSubmit() {
    let messageText = chatInput.value.trim();
    if (messageText === "" || !currentRoomId) return;

    if (currentTargetUserId === 'bot_gemini' && !messageText.startsWith('@ai')) {
        messageText = `@ai ${messageText}`;
    }

    isSending = true;

    chatInput.value = "";
    if (sendButton) sendButton.classList.remove('show');
    if (chatFooter) chatFooter.classList.remove('has-text');

    renderMessage(messageText.replace(/^@ai\s*/, ''), 'outgoing');

    let thinkingElement = null;
    const isAiCall = messageText.startsWith('@ai') || currentTargetUserId === 'bot_gemini';

    if (isAiCall) {
        thinkingElement = renderMessage('🤖 AI가 답변을 생각하고 있습니다...', 'incoming', '[AI]', true);
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: currentRoomId,
                userId: myUserId,
                message: messageText
            })
        });

        const data = await response.json();

        if (data.success && isAiCall && thinkingElement) {
            updateMessageContent(thinkingElement, data.reply || "답변을 불러오지 못했습니다.");
        } else {
            fetchRoomMessages();
        }

    } catch (error) {
        console.error("전송 에러:", error);
        if (thinkingElement) {
            updateMessageContent(thinkingElement, "⚠️ 답변 생성 중 오류가 발생했습니다.");
        }
    } finally {
        setTimeout(() => { isSending = false; }, 100);
    }
}


// ==========================================
// 7. 메시지 렌더링
// ==========================================
function renderMessage(text, type, senderName, isThinking = false) {
    if (!chatBody) return null;

    const messageWrapper = document.createElement('div');
    messageWrapper.className = `message-wrapper ${type}`;

    if (type === 'incoming' && senderName) {
        const nameTag = document.createElement('div');
        nameTag.className = 'message-sender-name';
        nameTag.textContent = senderName;
        messageWrapper.appendChild(nameTag);
    }

    const messageBox = document.createElement('div');
    messageBox.className = 'message-box';

    if (isThinking) {
        messageBox.classList.add('ai-thinking');
        messageBox.textContent = text;
    } else {
        formatAndSetBoxContent(messageBox, text);
    }

    messageWrapper.appendChild(messageBox);
    chatBody.appendChild(messageWrapper);
    chatBody.scrollTop = chatBody.scrollHeight;

    return messageBox;
}

function updateMessageContent(messageBox, newText) {
    if (!messageBox) return;
    messageBox.classList.remove('ai-thinking');
    messageBox.innerHTML = ""; 
    formatAndSetBoxContent(messageBox, newText);
    chatBody.scrollTop = chatBody.scrollHeight;
}

function formatAndSetBoxContent(messageBox, text) {
    const codeRegex = /'''\/([a-zA-Z0-9_-]+)\/\s*([\s\S]*?)'''/;
    const match = String(text || "").match(codeRegex);

    if (match) {
        const language = match[1];
        let codeContent = match[2].replace(/\\n/g, '\n');

        const codeContainer = document.createElement('div');
        codeContainer.className = 'code-viewer-container';

        const codeHeader = document.createElement('div');
        codeHeader.className = 'code-viewer-header';
        codeHeader.textContent = language.toUpperCase();

        const preTag = document.createElement('pre');
        const codeTag = document.createElement('code');
        codeTag.textContent = codeContent.trim(); 

        preTag.appendChild(codeTag);
        codeContainer.appendChild(codeHeader);
        codeContainer.appendChild(preTag);
        
        messageBox.appendChild(codeContainer);
        messageBox.classList.add('has-code');
    } else {
        messageBox.textContent = text;
    }
}


// ==========================================
// 8. 초기 자동 로그인 체크
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    if (myUserId && myUserName) {
        completeLogin();
    }
});