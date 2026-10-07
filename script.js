// ==========================================
// [설정] 백엔드 URL 및 전역 상태 변수
// ==========================================
const BACKEND_URL = "http://localhost:5000";

let myUserId = sessionStorage.getItem('myUserId') || "";
let myUserName = sessionStorage.getItem('myUserName') || "";
let myStatusMsg = sessionStorage.getItem('myStatusMsg') || "";
let myAvatar = sessionStorage.getItem('myAvatar') || "";
let serverTime = sessionStorage.getItem('serverTime') || "";
let currentRoomId = null;
let currentTargetUserId = null;
let lastRenderedMsgCount = -1;
let messagePollingInterval = null;
let isSending = false;

// ==========================================
// [DOM 엘리먼트]
// ==========================================
const messengerMain = document.getElementById('messenger-main');
const loginWin = document.getElementById('login-win');
const userDisplayName = document.getElementById('user-display-name');
const userDisplayStatus = document.getElementById('user-display-status');
const userDisplayAvatar = document.getElementById('user-display-avatar');
const userProfileSummary = document.getElementById('user-profile-summary');
const profileEditBtn = document.getElementById('profile-edit-btn');
const logoutBtn = document.getElementById('logout-btn');

const chatTargetAvatar = document.getElementById('chat-target-avatar');
const chatTargetName = document.getElementById('chat-target-name');
const chatTargetStatus = document.getElementById('chat-target-status');
const viewTargetProfileBtn = document.getElementById('view-target-profile-btn');

const logoutModal = document.getElementById('logout-modal');
const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
const cancelLogoutBtn = document.getElementById('cancel-logout-btn');

const tabLoginBtn = document.getElementById('tab-login-btn');
const tabRegisterBtn = document.getElementById('tab-register-btn');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

const loginIdInput = document.getElementById('login-id');
const loginPwInput = document.getElementById('login-pw');

const regIdInput = document.getElementById('reg-id');
const regPwInput = document.getElementById('reg-pw');
const regNameInput = document.getElementById('reg-name');

const naviList = document.querySelector('.navi');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');

const chatscreen = document.getElementById('chat-screen');
const missing = document.getElementById('missing');
const chatBody = document.getElementById('chat-body');
const chatInput = document.getElementById('chat-input');
const sendButton = document.getElementById('send-button');
const chatFooter = document.querySelector('.chat-footer');
const chatback = document.getElementById('chat-back');

const fileUploadBtn = document.getElementById('file-upload-btn');
const fileUploadInput = document.getElementById('file-upload-input');
const aiModelSelect = document.getElementById('ai-model-select');

const regPwToggle = document.getElementById('reg-pw-toggle');
const loginPwToggle = document.getElementById('login-pw-toggle');


// ==========================================
// 아바타 유틸
// ==========================================
function isAvatarUrl(value) {
    return typeof value === 'string' && /^(https?:\/\/|data:image\/|\/static\/)/i.test(value.trim());
}

function getAvatarMarkup(avatarValue, fallback) {
    const fb = fallback || 'https://api.dicebear.com/7.x/bottts/svg?seed=user';
    const value = (!avatarValue || avatarValue === '') ? fb : String(avatarValue).trim();
    if (isAvatarUrl(value)) {
        return `<img class="user-avatar-img" src="${value}" alt="avatar" onerror="this.src='https://api.dicebear.com/7.x/bottts/svg?seed=user';">`;
    }
    return `<img class="user-avatar-img" src="${fb}" alt="avatar">`;
}

function renderAvatarElement(element, avatarValue, fallback) {
    if (!element) return;
    const fb = fallback || 'https://api.dicebear.com/7.x/bottts/svg?seed=user';
    const value = (!avatarValue || avatarValue === '') ? fb : String(avatarValue).trim();
    if (isAvatarUrl(value)) {
        element.innerHTML = `<img class="user-avatar-img" src="${value}" alt="avatar" onerror="this.src='${fb}';">`;
    } else {
        element.innerHTML = `<img class="user-avatar-img" src="${fb}" alt="avatar">`;
    }
}


// ==========================================
// 비밀번호 토글
// ==========================================
if (loginPwToggle && loginPwInput) {
    loginPwToggle.onclick = function () {
        const isPassword = loginPwInput.type === 'password';
        loginPwInput.type = isPassword ? 'text' : 'password';
        loginPwToggle.textContent = isPassword ? '👁️' : '🙈';
    };
}
if (regPwToggle && regPwInput) {
    regPwToggle.onclick = function () {
        const isPassword = regPwInput.type === 'password';
        regPwInput.type = isPassword ? 'text' : 'password';
        regPwToggle.textContent = isPassword ? '👁️' : '🙈';
    };
}


// ==========================================
// 모달
// ==========================================
function showModal(msg, onConfirm = null) {
    let overlay = document.querySelector('.modal-overlay.dynamic-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'modal-overlay dynamic-modal';
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


// ==========================================
// 로그아웃 모달
// ==========================================
if (logoutBtn && logoutModal) {
    logoutBtn.onclick = () => logoutModal.classList.add('show');
    if (confirmLogoutBtn) {
        confirmLogoutBtn.onclick = () => {
            sessionStorage.clear();
            location.reload();
        };
    }
    if (cancelLogoutBtn) {
        cancelLogoutBtn.onclick = () => logoutModal.classList.remove('show');
    }
}


// ==========================================
// 자동 로그아웃 (백엔드 죽으면)
// ==========================================
let heartbeatInterval = null;

function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/heartbeat`, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            // 서버가 재시작 되었으면 (serverTime 변경) 자동 로그아웃
            if (data.serverTime && serverTime && data.serverTime !== serverTime) {
                sessionStorage.clear();
                location.reload();
                return;
            }
        } catch (e) {
            // 서버 연결 불가 → 자동 로그아웃
            console.warn("서버 연결 끊김, 자동 로그아웃");
            sessionStorage.clear();
            location.reload();
        }
    }, 5000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}


// ==========================================
// 탭 전환
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
// 로그인
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
                myStatusMsg = data.statusMsg || "";
                myAvatar = data.avatar || "";
                serverTime = data.serverTime || "";

                sessionStorage.setItem('myUserId', myUserId);
                sessionStorage.setItem('myUserName', myUserName);
                sessionStorage.setItem('myStatusMsg', myStatusMsg);
                sessionStorage.setItem('myAvatar', myAvatar);
                sessionStorage.setItem('serverTime', serverTime);

                completeLogin();
            } else {
                showModal(data.error || data.message || "로그인 실패");
            }
        } catch (err) {
            showModal("서버가 실행 중인지 확인해 주세요!");
        }
    };
}


// ==========================================
// 회원가입
// ==========================================
if (registerForm) {
    registerForm.onsubmit = async (e) => {
        e.preventDefault();
        const userId = regIdInput ? regIdInput.value.trim() : "";
        const password = regPwInput ? regPwInput.value.trim() : "";
        const userName = regNameInput ? regNameInput.value.trim() : "";

        if (!userId || !password || !userName) {
            showModal("모든 항목을 입력해 주세요!");
            return;
        }
        if (!/^[a-zA-Z0-9]+$/.test(userId)) {
            showModal("아이디는 영문, 숫자 조합으로만 입력 가능합니다.");
            return;
        }
        if (userId.length < 2) {
            showModal("아이디는 2자 이상이어야 합니다.");
            return;
        }
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
                showModal("회원가입 성공! 로그인해 주세요.", () => {
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
            showModal("서버 통신 중 오류가 발생했습니다.");
        }
    };
}


// ==========================================
// 로그인 완료
// ==========================================
let userRefreshInterval = null;

async function completeLogin() {
    if (loginWin) loginWin.style.display = 'none';
    if (messengerMain) messengerMain.classList.remove('is-blurred');
    if (logoutBtn) {
        logoutBtn.style.display = 'inline-block';
        logoutBtn.style.visibility = 'visible';
        logoutBtn.style.opacity = '1';
    }

    // 프로필 동기화
    try {
        const res = await fetch(`${BACKEND_URL}/api/profile/${myUserId}`);
        const data = await res.json();
        if (data.success) {
            myUserName = data.userName;
            myStatusMsg = data.statusMsg || "";
            myAvatar = data.avatar || "";
            sessionStorage.setItem('myUserName', myUserName);
            sessionStorage.setItem('myStatusMsg', myStatusMsg);
            sessionStorage.setItem('myAvatar', myAvatar);
        }
    } catch (e) {}

    if (userDisplayName) userDisplayName.textContent = myUserName;
    if (userDisplayStatus) userDisplayStatus.textContent = myStatusMsg ? `"${myStatusMsg}"` : "";
    renderAvatarElement(userDisplayAvatar, myAvatar);

    fetchAndRenderUsers();

    // 10초마다 유저 목록 새로고침 + 알림 체크
    if (userRefreshInterval) clearInterval(userRefreshInterval);
    userRefreshInterval = setInterval(() => {
        fetchAndRenderUsers(searchInput ? searchInput.value.trim() : "");
    }, 10000);

    // 하트비트 시작
    startHeartbeat();
}


// ==========================================
// 프로필 페이지 이동
// ==========================================
if (profileEditBtn) {
    profileEditBtn.onclick = () => window.location.href = 'profile.html';
}
if (userProfileSummary) {
    userProfileSummary.onclick = () => window.location.href = 'profile.html';
}
if (viewTargetProfileBtn) {
    viewTargetProfileBtn.onclick = () => {
        if (currentTargetUserId) {
            window.location.href = `profile.html?id=${currentTargetUserId}`;
        }
    };
}


// ==========================================
// 유저 목록 + 알림 배지
// ==========================================
let unreadMap = {};

async function fetchUnread() {
    if (!myUserId) return;
    try {
        const res = await fetch(`${BACKEND_URL}/api/unread?userId=${myUserId}`);
        const data = await res.json();
        if (data.success) {
            unreadMap = data.unread || {};
        }
    } catch (e) {}
}

async function fetchAndRenderUsers(query = "") {
    if (!myUserId) return;

    await fetchUnread();

    try {
        const response = await fetch(`${BACKEND_URL}/api/search_users?q=${encodeURIComponent(query)}&myId=${myUserId}`);
        const data = await response.json();

        if (data.success && naviList) {
            naviList.innerHTML = "";

            // AI 봇 버튼 추가
            const aiBtn = document.createElement('button');
            aiBtn.className = 'user-chat-btn ai-bot-btn';
            aiBtn.type = 'button';
            aiBtn.innerHTML = `
                <div class="user-avatar"><img class="user-avatar-img" src="https://api.dicebear.com/7.x/bottts/svg?seed=ai" alt="AI"></div>
                <div class="user-info">
                    <div class="user-name">통합 AI</div>
                    <div class="user-status">AI에게 질문하기</div>
                </div>
            `;
            aiBtn.onclick = () => openPrivateChat('bot_ai', '통합 AI', 'AI에게 질문하기', 'https://api.dicebear.com/7.x/bottts/svg?seed=ai');
            naviList.appendChild(aiBtn);

            if (data.users.length === 0) {
                naviList.innerHTML += `<div style="padding:15px; color:var(--text-secondary); font-size:12px; text-align:center;">검색된 유저가 없습니다.</div>`;
                return;
            }

            data.users.forEach(user => {
                const btn = document.createElement('button');
                btn.className = 'user-chat-btn';
                btn.type = 'button';
                const avatar = user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.userId}`;
                const statusText = user.statusMsg || '상태 메시지 없음';
                const hasUnread = unreadMap[user.userId];

                btn.innerHTML = `
                    <div class="user-avatar">${getAvatarMarkup(avatar)}</div>
                    <div class="user-info">
                        <div class="user-name">${user.userName} <small style="color:var(--text-secondary); font-weight:normal;">@${user.userId}</small></div>
                        <div class="user-status">${statusText}</div>
                    </div>
                    ${hasUnread ? '<span class="unread-badge">!</span>' : ''}
                `;

                btn.onclick = () => {
                    openPrivateChat(user.userId, user.userName, user.statusMsg, user.avatar);
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
// 대화방 열기
// ==========================================
async function openPrivateChat(targetUserId, targetUserName, targetStatusMsg = "", targetAvatar = "") {
    currentTargetUserId = targetUserId;
    const ids = [myUserId, targetUserId].sort();
    currentRoomId = `chat_${ids[0]}_${ids[1]}`;

    if (chatTargetName) chatTargetName.textContent = targetUserName;
    renderAvatarElement(chatTargetAvatar, targetAvatar);
    if (chatTargetStatus) chatTargetStatus.textContent = targetStatusMsg ? `"${targetStatusMsg}"` : "";

    // 최신 프로필 가져오기
    try {
        const res = await fetch(`${BACKEND_URL}/api/profile/${targetUserId}`);
        const data = await res.json();
        if (data.success) {
            if (chatTargetName) chatTargetName.textContent = data.userName;
            renderAvatarElement(chatTargetAvatar, data.avatar);
            if (chatTargetStatus) chatTargetStatus.textContent = data.statusMsg ? `"${data.statusMsg}"` : "";
        }
    } catch (e) {}

    if (chatscreen) chatscreen.style.display = 'flex';
    if (missing) missing.style.display = 'none';
    if (messengerMain) messengerMain.classList.add('mobile-chat-open');

    // AI 모델 선택 드롭다운 표시 (AI 방일 때만)
    if (aiModelSelect) {
        aiModelSelect.style.display = (targetUserId === 'bot_ai') ? 'inline-block' : 'none';
    }

    if (chatInput) {
        chatInput.placeholder = (targetUserId === 'bot_ai')
            ? "AI에게 질문하세요..."
            : "메시지 입력... (@gemini @chatgpt @claude @grok 으로 AI 호출)";
    }

    if (messagePollingInterval) clearInterval(messagePollingInterval);
    lastRenderedMsgCount = -1;
    fetchRoomMessages();
    messagePollingInterval = setInterval(fetchRoomMessages, 1000);
}

if (chatback) {
    chatback.onclick = function () {
        if (chatscreen) chatscreen.style.display = 'none';
        if (missing) missing.style.display = 'flex';
        if (messengerMain) messengerMain.classList.remove('mobile-chat-open');
        currentRoomId = null;
        currentTargetUserId = null;
        if (messagePollingInterval) clearInterval(messagePollingInterval);
    };
}


// ==========================================
// 메시지 수신
// ==========================================
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
                    const senderName = isMe ? "" : (msg.sender_name || "");
                    renderMessage(msg.text, messageType, senderName, false, msg.fileUrl);
                });

                lastRenderedMsgCount = data.messages.length;

                // 읽음 상태 업데이트
                if (data.messages.length > 0) {
                    const lastId = data.messages[data.messages.length - 1].id;
                    fetch(`${BACKEND_URL}/api/read-status`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId: myUserId, roomId: currentRoomId, lastReadId: lastId })
                    }).catch(() => {});
                }
            }
        }
    } catch (error) {
        console.error("메시지 수신 실패:", error);
    }
}


// ==========================================
// 파일 업로드
// ==========================================
if (fileUploadBtn && fileUploadInput) {
    fileUploadBtn.onclick = () => fileUploadInput.click();

    fileUploadInput.onchange = async () => {
        const file = fileUploadInput.files[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
            showModal("파일 크기는 10MB 이하여야 합니다.");
            fileUploadInput.value = '';
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${BACKEND_URL}/api/files/upload`, { method: 'POST', body: formData });
            const data = await res.json();

            if (data.success) {
                // 파일 메시지 전송
                const ext = file.name.split('.').pop().toLowerCase();
                const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);
                const msgText = isImage ? `[이미지] ${file.name}` : `[파일] ${file.name}`;

                await fetch(`${BACKEND_URL}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        roomId: currentRoomId,
                        userId: myUserId,
                        message: msgText,
                        fileUrl: data.fileUrl
                    })
                });

                lastRenderedMsgCount = -1;
                fetchRoomMessages();
            } else {
                showModal(data.message || "파일 업로드 실패");
            }
        } catch (err) {
            showModal("파일 업로드 중 오류 발생");
        }

        fileUploadInput.value = '';
    };
}


// ==========================================
// 메시지 전송
// ==========================================
if (chatInput) {
    chatInput.oninput = function () {
        if (chatInput.value.trim() === "") {
            if (sendButton) sendButton.classList.remove('show');
            if (chatFooter) chatFooter.classList.remove('has-text');
        } else {
            if (sendButton) sendButton.classList.add('show');
            if (chatFooter) chatFooter.classList.add('has-text');
        }
    };

    chatInput.onkeydown = function (e) {
        if (e.isComposing) return;
        if (e.key === 'Enter') {
            if (e.shiftKey) return;
            e.preventDefault();
            if (isSending) return;
            handleMessageSubmit();
        }
    };
}

if (sendButton) {
    sendButton.onclick = function (e) {
        e.preventDefault();
        if (isSending) return;
        handleMessageSubmit();
    };
}

async function handleMessageSubmit() {
    let messageText = chatInput.value.trim();
    if (messageText === "" || !currentRoomId) return;

    isSending = true;
    chatInput.value = "";
    if (sendButton) sendButton.classList.remove('show');
    if (chatFooter) chatFooter.classList.remove('has-text');

    // AI 호출 여부 판단
    const aiMentions = ['@gemini', '@chatgpt', '@claude', '@grok'];
    let isAiCall = aiMentions.some(m => messageText.toLowerCase().startsWith(m));
    let aiProvider = '';

    if (currentTargetUserId === 'bot_ai') {
        isAiCall = true;
        aiProvider = aiModelSelect ? aiModelSelect.value : 'gemini';
    }

    // 화면에 내 메시지 즉시 표시 (AI 멘션은 제거하고 표시)
    let displayText = messageText;
    for (const m of aiMentions) {
        if (messageText.toLowerCase().startsWith(m)) {
            displayText = messageText.substring(m.length).trim();
            break;
        }
    }
    renderMessage(displayText, 'outgoing');

    // AI 호출 시 로딩 표시
    let thinkingElement = null;
    if (isAiCall) {
        thinkingElement = renderMessage('AI가 답변을 생각하고 있습니다...', 'incoming', 'AI', true);
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: currentRoomId,
                userId: myUserId,
                message: messageText,
                aiProvider: aiProvider
            })
        });
        const data = await response.json();

        if (isAiCall && thinkingElement && data.aiReply) {
            updateMessageContent(thinkingElement, data.aiReply);
        }

        // 전체 새로고침
        lastRenderedMsgCount = -1;
        setTimeout(() => fetchRoomMessages(), 300);

    } catch (error) {
        console.error("전송 에러:", error);
        if (thinkingElement) {
            updateMessageContent(thinkingElement, "전송 중 오류가 발생했습니다.");
        }
    } finally {
        setTimeout(() => { isSending = false; }, 200);
    }
}


// ==========================================
// 메시지 렌더링
// ==========================================
function renderMessage(text, type, senderName = "", isThinking = false, fileUrl = "") {
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
    } else if (fileUrl) {
        // 파일 메시지 렌더링
        const ext = fileUrl.split('.').pop().toLowerCase();
        const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext);

        if (isImage) {
            const img = document.createElement('img');
            img.src = BACKEND_URL + fileUrl;
            img.alt = text;
            img.className = 'chat-file-image';
            img.onclick = () => window.open(BACKEND_URL + fileUrl, '_blank');
            messageBox.appendChild(img);
        } else {
            const link = document.createElement('a');
            link.href = BACKEND_URL + fileUrl;
            link.target = '_blank';
            link.className = 'chat-file-link';
            link.textContent = `📎 ${text}`;
            messageBox.appendChild(link);
        }
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
    const codeRegex = /'''\/?([a-zA-Z0-9_-]+)\/?[\s\S]*?'''/;
    const match = String(text || "").match(codeRegex);

    if (match) {
        const language = match[1];
        let codeContent = text.replace(codeRegex, '').trim();
        const codeMatch = String(text).match(/'''\/?[a-zA-Z0-9_-]+\/?\s*([\s\S]*?)'''/);
        if (codeMatch) codeContent = codeMatch[1].replace(/\\n/g, '\n');

        const container = document.createElement('div');
        container.className = 'code-viewer-container';
        const header = document.createElement('div');
        header.className = 'code-viewer-header';
        header.textContent = language.toUpperCase();
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = codeContent.trim();
        pre.appendChild(code);
        container.appendChild(header);
        container.appendChild(pre);
        messageBox.appendChild(container);
        messageBox.classList.add('has-code');
    } else {
        messageBox.textContent = text;
    }
}


// ==========================================
// 초기 자동 로그인 체크
// ==========================================
window.addEventListener('DOMContentLoaded', async () => {
    if (myUserId && myUserName) {
        await completeLogin();

        const urlParams = new URLSearchParams(window.location.search);
        const chatTargetParam = urlParams.get('chat');
        if (chatTargetParam) {
            openPrivateChat(chatTargetParam, chatTargetParam);
        }
    }
});