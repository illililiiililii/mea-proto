// ==========================================
// [설정] 백엔드 URL 및 전역 상태 변수
// ==========================================
const BACKEND_URL = "http://localhost:5000";
const MESSAGE_DELETE_LIMIT_MS = 5 * 60 * 1000;

let myUserId = sessionStorage.getItem('myUserId') || "";
let myUserName = sessionStorage.getItem('myUserName') || "";
let myStatusMsg = sessionStorage.getItem('myStatusMsg') || "";
let myAvatar = sessionStorage.getItem('myAvatar') || "";
let myRole = sessionStorage.getItem('myRole') || 'user';
let serverTime = sessionStorage.getItem('serverTime') || "";
let currentRoomId = null;
let currentTargetUserId = null;
let lastRenderedMsgCount = -1;
let messagePollingInterval = null;
let isSending = false;
let heartbeatFailureCount = 0;
let lastHeartbeatSuccessAt = Date.now();

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
const adminPanelBtn = document.getElementById('admin-panel-btn');
const logoutBtn = document.getElementById('logout-btn');
const adminPanel = document.getElementById('admin-panel');
const adminPanelClose = document.getElementById('admin-panel-close');
const adminNoticeForm = document.getElementById('admin-notice-form');
const adminNoticeList = document.getElementById('admin-notice-list');
const adminUserList = document.getElementById('admin-user-list');
const adminSummary = document.getElementById('admin-summary');
const noticeBanner = document.getElementById('notice-banner');
const tutorialOverlay = document.getElementById('tutorial-overlay');
const tutorialSkipBtn = document.getElementById('tutorial-skip-btn');
const tutorialStartBtn = document.getElementById('tutorial-start-btn');
const tutorialOpenBtn = document.getElementById('tutorial-open-btn');
const tutorialFab = document.getElementById('tutorial-fab');
const githubLinkBtn = document.getElementById('github-link-btn');
const devDocsBtn = document.getElementById('dev-docs-btn');

const chatTargetAvatar = document.getElementById('chat-target-avatar');
const chatTargetName = document.getElementById('chat-target-name');
const chatTargetStatus = document.getElementById('chat-target-status');
const viewTargetProfileBtn = document.getElementById('view-target-profile-btn');

const logoutModal = document.getElementById('logout-modal');
const confirmLogoutBtn = document.getElementById('confirm-logout-btn');
const cancelLogoutBtn = document.getElementById('cancel-logout-btn');
const serverDisconnectModal = document.getElementById('server-disconnect-modal');
const retryServerBtn = document.getElementById('retry-server-btn');
const confirmServerDisconnectBtn = document.getElementById('confirm-server-disconnect-btn');

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

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function getRoomCryptoKey(roomId) {
    const seed = `secure-room-v1:${roomId || 'public'}`;
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
    return crypto.subtle.importKey('raw', hashBuffer, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptRoomMessage(text, roomId) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedText = new TextEncoder().encode(text);
    const cryptoKey = await getRoomCryptoKey(roomId);
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, encodedText);
    return JSON.stringify({ version: 'v1', iv: Array.from(iv).map(byte => byte.toString(16).padStart(2, '0')).join(''), cipher: btoa(String.fromCharCode(...new Uint8Array(cipher))) });
}

async function decryptRoomMessage(rawText, roomId) {
    if (!rawText || typeof rawText !== 'string') return rawText || '';
    try {
        const parsed = JSON.parse(rawText);
        if (parsed && parsed.version === 'v1' && parsed.cipher && parsed.iv) {
            const key = await getRoomCryptoKey(roomId);
            const ivBytes = new Uint8Array(parsed.iv.match(/.{1,2}/g).map((hex) => parseInt(hex, 16)));
            const cipherBytes = Uint8Array.from(atob(parsed.cipher), (char) => char.charCodeAt(0));
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, cipherBytes);
            return new TextDecoder().decode(decrypted);
        }
    } catch (e) {
        return rawText;
    }
    return rawText;
}


// ==========================================
// 비밀번호 토글
// ==========================================
if (loginPwToggle && loginPwInput) {
    loginPwToggle.onclick = function () {
        const isPassword = loginPwInput.type === 'password';
        loginPwInput.type = isPassword ? 'text' : 'password';
        loginPwToggle.textContent = isPassword ? '🫣' : '😊';
    };
}
if (regPwToggle && regPwInput) {
    regPwToggle.onclick = function () {
        const isPassword = regPwInput.type === 'password';
        regPwInput.type = isPassword ? 'text' : 'password';
        regPwToggle.textContent = isPassword ? '🫣' : '😊';
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

function showServerDisconnectModal() {
    if (!serverDisconnectModal) return;
    if (document.visibilityState === 'hidden') return;
    serverDisconnectModal.classList.add('show');
    if (logoutModal) logoutModal.classList.remove('show');
}

function hideServerDisconnectModal() {
    if (!serverDisconnectModal) return;
    serverDisconnectModal.classList.remove('show');
}

async function retryServerConnection() {
    try {
        const res = await fetch(`${BACKEND_URL}/api/heartbeat`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (!res.ok || !data || data.alive !== true) {
            throw new Error('heartbeat invalid');
        }
        lastHeartbeatSuccessAt = Date.now();
        heartbeatFailureCount = 0;
        hideServerDisconnectModal();
        return true;
    } catch (e) {
        heartbeatFailureCount += 1;
        if (heartbeatFailureCount >= 2) {
            showServerDisconnectModal();
        }
        return false;
    }
}

if (retryServerBtn) {
    retryServerBtn.onclick = async () => {
        const connected = await retryServerConnection();
        if (connected) {
            showModal('서버에 다시 연결되었습니다.');
        }
    };
}

if (confirmServerDisconnectBtn) {
    confirmServerDisconnectBtn.onclick = () => {
        hideServerDisconnectModal();
        if (logoutModal) logoutModal.classList.add('show');
    };
}


// ==========================================
// 서버 상태 감시
// ==========================================
let heartbeatInterval = null;

function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/heartbeat`, { signal: AbortSignal.timeout(5000) });
            const data = await res.json();
            if (!res.ok || !data || data.alive !== true) {
                throw new Error('heartbeat invalid');
            }
            if (data.serverTime && serverTime && data.serverTime !== serverTime) {
                console.warn('서버가 재시작되어 연결 상태를 다시 확인합니다.');
                heartbeatFailureCount = 0;
                hideServerDisconnectModal();
                return;
            }
            lastHeartbeatSuccessAt = Date.now();
            heartbeatFailureCount = 0;
            hideServerDisconnectModal();
        } catch (e) {
            heartbeatFailureCount += 1;
            console.warn('서버 연결 상태 확인 실패', heartbeatFailureCount);
            const timeSinceLastSuccess = Date.now() - lastHeartbeatSuccessAt;
            if (myUserId && heartbeatFailureCount >= 2 && timeSinceLastSuccess > 10000) {
                showServerDisconnectModal();
            }
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
                myRole = data.role || 'user';
                serverTime = data.serverTime || "";
                const sessionToken = data.sessionToken || "";

                sessionStorage.setItem('myUserId', myUserId);
                sessionStorage.setItem('myUserName', myUserName);
                sessionStorage.setItem('myStatusMsg', myStatusMsg);
                sessionStorage.setItem('myAvatar', myAvatar);
                sessionStorage.setItem('myRole', myRole);
                sessionStorage.setItem('serverTime', serverTime);
                sessionStorage.setItem('authToken', sessionToken);

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

function initTutorial(forceShow = false) {
    if (!tutorialOverlay) return;
    const seenTutorial = localStorage.getItem('messengerTutorialSeen') === 'true';
    if (forceShow || !seenTutorial) {
        tutorialOverlay.style.display = 'flex';
    } else {
        tutorialOverlay.style.display = 'none';
    }

    if (tutorialSkipBtn) {
        tutorialSkipBtn.onclick = () => {
            localStorage.setItem('messengerTutorialSeen', 'true');
            tutorialOverlay.style.display = 'none';
        };
    }

    if (tutorialStartBtn) {
        tutorialStartBtn.onclick = () => {
            localStorage.setItem('messengerTutorialSeen', 'true');
            tutorialOverlay.style.display = 'none';
        };
    }

    if (tutorialOpenBtn) {
        tutorialOpenBtn.onclick = () => {
            localStorage.removeItem('messengerTutorialSeen');
            initTutorial(true);
        };
    }

    if (tutorialFab) {
        tutorialFab.onclick = () => {
            localStorage.removeItem('messengerTutorialSeen');
            initTutorial(true);
        };
    }
}

async function completeLogin() {
    if (loginWin) loginWin.style.display = 'none';
    if (messengerMain) messengerMain.classList.remove('is-blurred');
    if (logoutBtn) {
        logoutBtn.style.display = 'inline-block';
        logoutBtn.style.visibility = 'visible';
        logoutBtn.style.opacity = '1';
    }

    initTutorial();

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
    await refreshAdminState();
    await fetchNotices();
    fetchAndRenderUsers();

    // 10초마다 유저 목록 새로고침 + 알림 체크
    if (userRefreshInterval) clearInterval(userRefreshInterval);
    userRefreshInterval = setInterval(() => {
        if (document.visibilityState === 'visible') {
            fetchAndRenderUsers(searchInput ? searchInput.value.trim() : "");
        }
    }, 20000);

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
if (adminPanelBtn) {
    adminPanelBtn.onclick = async () => {
        const token = sessionStorage.getItem('authToken') || '';
        const userId = sessionStorage.getItem('myUserId') || '';
        if (!userId || !token) {
            adminPanelBtn.style.display = 'none';
            showModal('관리자 권한이 없습니다.');
            return;
        }

        try {
            const sessionRes = await fetch(`${BACKEND_URL}/api/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, userToken: token })
            });
            const sessionData = await sessionRes.json();
            const isAdmin = Boolean(sessionData.success && (sessionData.isAdmin || sessionData.role === 'admin'));
            if (!isAdmin) {
                adminPanelBtn.style.display = 'none';
                showModal('관리자 권한이 없습니다.');
                return;
            }
            window.location.href = 'admin.html';
        } catch (error) {
            showModal('관리자 페이지를 열 수 없습니다.');
        }
    };
}
if (adminPanelClose) {
    adminPanelClose.onclick = () => adminPanel.classList.add('hidden');
}
if (viewTargetProfileBtn) {
    viewTargetProfileBtn.onclick = () => {
        if (currentTargetUserId) {
            window.location.href = `profile.html?id=${currentTargetUserId}`;
        }
    };
}


// ==========================================
// 관리자/공지 기능
// ==========================================
async function refreshAdminState() {
    if (!myUserId) return;
    const token = sessionStorage.getItem('authToken') || '';
    try {
        const response = await fetch(`${BACKEND_URL}/api/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: myUserId, userToken: token })
        });
        const data = await response.json();
        const isAdmin = Boolean(data.success && (data.isAdmin || data.role === 'admin'));
        myRole = data.role || myRole;
        sessionStorage.setItem('myRole', myRole);
        if (adminPanelBtn) {
            adminPanelBtn.style.display = isAdmin ? 'inline-block' : 'none';
            if (!isAdmin && adminPanel) adminPanel.classList.add('hidden');
        }
    } catch (error) {
        if (adminPanelBtn) adminPanelBtn.style.display = 'none';
        if (adminPanel) adminPanel.classList.add('hidden');
        myRole = 'user';
        sessionStorage.setItem('myRole', myRole);
    }
}

async function fetchNotices() {
    try {
        const token = sessionStorage.getItem('authToken') || '';
        const response = await fetch(`${BACKEND_URL}/api/admin/notices?userId=${encodeURIComponent(myUserId)}&token=${encodeURIComponent(token)}`);
        const data = await response.json();
        const notices = Array.isArray(data.notices) ? data.notices : [];
        if (notices.length === 0) {
            if (noticeBanner) noticeBanner.innerHTML = '';
            if (adminNoticeList) adminNoticeList.innerHTML = '<p class="empty-state">등록된 공지가 없습니다.</p>';
            return;
        }
        const first = notices[0];
        if (noticeBanner) {
            noticeBanner.innerHTML = `<strong style="color: var(--text-primary);">공지</strong> ${escapeHtml(first.title)}: ${escapeHtml(first.content)}`;
        }
        if (adminNoticeList) {
            adminNoticeList.innerHTML = notices.map((notice) => `
                <div class="admin-notice-row">
                    <div>
                        <strong class="admin-notice-title">${escapeHtml(notice.title)}</strong>
                        <small class="admin-notice-title">${escapeHtml(notice.content)}</small>
                    </div>
                    <button type="button" class="admin-notice-delete" data-notice-id="${escapeHtml(String(notice.id))}">삭제</button>
                </div>
            `).join('');

            adminNoticeList.querySelectorAll('.admin-notice-delete').forEach((btn) => {
                btn.onclick = async () => {
                    const noticeId = btn.dataset.noticeId;
                    const token = sessionStorage.getItem('authToken') || '';
                    const res = await fetch(`${BACKEND_URL}/api/admin/notices/${encodeURIComponent(noticeId)}?userId=${encodeURIComponent(myUserId)}&token=${encodeURIComponent(token)}`, { method: 'DELETE' });
                    const result = await res.json();
                    showModal(result.message || '공지 삭제 완료');
                    await fetchNotices();
                    await loadAdminPanel();
                };
            });
        }
    } catch (error) {
        if (noticeBanner) noticeBanner.innerHTML = '';
        if (adminNoticeList) adminNoticeList.innerHTML = '<p class="empty-state">공지 목록을 불러오지 못했습니다.</p>';
    }
}

async function loadAdminPanel() {
    if (!adminPanel || !myUserId) return;
    try {
        const profileRes = await fetch(`${BACKEND_URL}/api/profile/${encodeURIComponent(myUserId)}`);
        const profileData = await profileRes.json();
        const isAdmin = Boolean(profileData.success && (profileData.isAdmin || profileData.role === 'admin'));
        if (!isAdmin) {
            if (adminSummary) adminSummary.innerHTML = '<p class="empty-state">관리자 권한이 없습니다.</p>';
            if (adminUserList) adminUserList.innerHTML = '<p class="empty-state">관리자 전용 기능입니다.</p>';
            return;
        }

        const token = sessionStorage.getItem('authToken') || '';
        const summaryRes = await fetch(`${BACKEND_URL}/api/admin/summary?userId=${encodeURIComponent(myUserId)}&token=${encodeURIComponent(token)}`);
        const summaryData = await summaryRes.json();
        if (summaryData.success && adminSummary) {
            const credentialsRes = await fetch(`${BACKEND_URL}/api/admin/credentials?userId=${encodeURIComponent(myUserId)}&token=${encodeURIComponent(token)}`);
            const credentialsData = credentialsRes.ok ? await credentialsRes.json() : null;
            adminSummary.innerHTML = `
                <div class="summary-item"><span>총 사용자</span><strong>${summaryData.totalUsers || 0}</strong></div>
                <div class="summary-item"><span>관리자</span><strong>${summaryData.adminUsers || 0}</strong></div>
                <div class="summary-item"><span>공지</span><strong>${summaryData.noticeCount || 0}</strong></div>
                <div class="summary-item summary-item-wide"><span>초기화 기본 비밀번호</span><strong>${credentialsData && credentialsData.success ? escapeHtml(credentialsData.defaultPassword || '12345678') : '12345678'}</strong></div>
            `;
        }

        const usersRes = await fetch(`${BACKEND_URL}/api/admin/users?userId=${encodeURIComponent(myUserId)}&token=${encodeURIComponent(token)}`);
        const usersData = await usersRes.json();
        if (!usersData.success || !adminUserList) return;
        adminUserList.innerHTML = (usersData.users || []).map((user) => `
            <div class="admin-user-row">
                <div>
                    <strong>${escapeHtml(user.userName)}</strong>
                    <small>@${escapeHtml(user.userId)}</small>
                </div>
                <div class="admin-user-actions">
                    <button type="button" data-user-id="${escapeHtml(String(user.userId))}" class="admin-reset-btn">초기화</button>
                    <button type="button" data-user-id="${escapeHtml(String(user.userId))}" class="admin-delete-btn">삭제</button>
                </div>
            </div>
        `).join('') || '<p class="empty-state">관리할 유저가 없습니다.</p>';

        adminUserList.querySelectorAll('.admin-delete-btn').forEach((btn) => {
            btn.onclick = async () => {
                const targetId = btn.dataset.userId;
                const token = sessionStorage.getItem('authToken') || '';
                const res = await fetch(`${BACKEND_URL}/api/admin/users/${encodeURIComponent(targetId)}?userId=${encodeURIComponent(myUserId)}&token=${encodeURIComponent(token)}`, { method: 'DELETE' });
                const result = await res.json();
                showModal(result.message || '처리 완료');
                await loadAdminPanel();
            };
        });

        adminUserList.querySelectorAll('.admin-reset-btn').forEach((btn) => {
            btn.onclick = async () => {
                const targetId = btn.dataset.userId;
                const token = sessionStorage.getItem('authToken') || '';
                const res = await fetch(`${BACKEND_URL}/api/admin/users/${encodeURIComponent(targetId)}/reset-password`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: myUserId, userToken: token })
                });
                const result = await res.json();
                showModal(result.message || '초기화 완료');
                await loadAdminPanel();
            };
        });
    } catch (error) {
        if (adminSummary) adminSummary.innerHTML = '<p class="empty-state">관리자 데이터를 불러오지 못했습니다.</p>';
    }
}

if (adminNoticeForm) {
    adminNoticeForm.onsubmit = async (e) => {
        e.preventDefault();
        const title = document.getElementById('admin-notice-title');
        const content = document.getElementById('admin-notice-content');
        if (!title || !content || !myUserId) return;
        const token = sessionStorage.getItem('authToken') || '';
        const res = await fetch(`${BACKEND_URL}/api/admin/notices?userId=${encodeURIComponent(myUserId)}&token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title.value.trim(), content: content.value.trim(), userId: myUserId, userToken: token })
        });
        const result = await res.json();
        showModal(result.message || '공지 등록 완료');
        title.value = '';
        content.value = '';
        await fetchNotices();
        await loadAdminPanel();
    };
}

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

            const noticeBtn = document.createElement('button');
            noticeBtn.className = 'user-chat-btn';
            noticeBtn.type = 'button';
            noticeBtn.innerHTML = `
                <div class="user-avatar"><img class="user-avatar-img" src="https://api.dicebear.com/7.x/bottts/svg?seed=notice" alt="공지"></div>
                <div class="user-info">
                    <div class="user-name">공지</div>
                    <div class="user-status">전체 공지 확인</div>
                </div>
            `;
            noticeBtn.onclick = () => openNoticeThread();
            naviList.appendChild(noticeBtn);

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
                const emptyState = document.createElement('div');
                emptyState.style.cssText = 'padding:15px; color:var(--text-secondary); font-size:12px; text-align:center;';
                emptyState.textContent = '검색된 유저가 없습니다.';
                naviList.appendChild(emptyState);
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

            const myProfileCard = document.createElement('div');
            myProfileCard.className = 'my-profile-card';
            myProfileCard.innerHTML = `
                <div class="my-profile-card-header">
                    <span class="my-profile-badge">내 프로필</span>
                </div>
                <div class="my-profile-summary">
                    <div class="user-avatar"><img class="user-avatar-img" src="${myAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${myUserId}`}" alt="my profile"></div>
                    <div class="user-info">
                        <div class="user-name">${myUserName || myUserId || '내 계정'}</div>
                        <div class="user-status">${myStatusMsg || '상태 메시지 없음'}</div>
                    </div>
                </div>
            `;
            myProfileCard.onclick = () => window.location.href = 'profile.html';
            naviList.appendChild(myProfileCard);
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
async function renderNoticeThread() {
    if (!chatBody) return;

    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/notices`);
        const data = await response.json();
        const notices = Array.isArray(data.notices) ? data.notices : [];

        if (!notices.length) {
            chatBody.innerHTML = '<div class="empty-state">등록된 공지가 없습니다.</div>';
            return;
        }

        const isAdmin = Boolean(myUserId && (myRole === 'admin' || myRole === 'system')) || myUserId === 'admin';
        chatBody.innerHTML = notices.map((notice) => `
            <div class="notice" style="max-width:100%; text-align: center; align-items: center;">
                <div class="message-sender-name" style="text-align: center; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 5px; margin-bottom: 10px; font-size: 2vh; color: var(--text-secondary);">
                    --------------------------------------------------------------
                    
                </div>
                <div class="message-bubble" style="max-width:100%;">
                    <h2 style="font-weight:70%; margin-bottom:6px; color: var(--text-primary);">${notice.title}</h2>
                    <h4 style="white-space:pre-wrap; font-weight:20%; line-height:1.6; color: var(--text-primary);">${notice.content}</h4>
                </div>
            </div>
        `).join('');

       
    } catch (error) {
        chatBody.innerHTML = '<div class="empty-state">공지 목록을 불러오지 못했습니다.</div>';
    }
}

async function openNoticeThread() {
    currentTargetUserId = 'notice';
    currentRoomId = 'notice_thread';

    if (chatTargetName) chatTargetName.textContent = '공지';
    renderAvatarElement(chatTargetAvatar, 'https://api.dicebear.com/7.x/bottts/svg?seed=notice');
    if (chatTargetStatus) chatTargetStatus.textContent = '전체 공지사항';

    if (chatscreen) chatscreen.style.display = 'flex';
    if (missing) missing.style.display = 'none';
    if (messengerMain) messengerMain.classList.add('mobile-chat-open');
    if (aiModelSelect) aiModelSelect.style.display = 'none';
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = '공지사항만 확인할 수 있습니다.';
        chatInput.value = '';
    }
    if (sendButton) {
        sendButton.disabled = true;
        sendButton.classList.remove('show');
    }
    if (chatFooter) chatFooter.classList.remove('has-text');
    if (messagePollingInterval) clearInterval(messagePollingInterval);
    messagePollingInterval = null;
    lastRenderedMsgCount = -1;
    renderNoticeThread();
}

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
        const isReadOnlyNotice = targetUserId === 'notice';
        chatInput.disabled = isReadOnlyNotice;
        chatInput.placeholder = isReadOnlyNotice
            ? "공지사항만 확인할 수 있습니다."
            : ((targetUserId === 'bot_ai') ? "AI에게 질문하세요..." : "메시지 입력... (@gemini @chatgpt @claude @grok 으로 AI 호출)");
        if (isReadOnlyNotice) {
            chatInput.value = '';
            if (sendButton) {
                sendButton.disabled = true;
                sendButton.classList.remove('show');
            }
            if (chatFooter) chatFooter.classList.remove('has-text');
        } else if (sendButton) {
            sendButton.disabled = false;
        }
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

if (githubLinkBtn) {
    githubLinkBtn.onclick = () => window.open('https://github.com/', '_blank', 'noopener,noreferrer');
}
if (devDocsBtn) {
    devDocsBtn.onclick = () => window.open('https://www.notion.so/', '_blank', 'noopener,noreferrer');
}


// ==========================================
// 메시지 수신
// ==========================================
async function fetchRoomMessages() {
    if (!currentRoomId || isSending) return;
    if (currentTargetUserId === 'notice') {
        renderNoticeThread();
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/messages/${currentRoomId}`);
        const data = await response.json();

        if (data.success && data.messages) {
            if (chatBody) chatBody.innerHTML = "";

            for (const msg of data.messages) {
                const isMe = (msg.sender_id === myUserId);
                const messageType = isMe ? 'outgoing' : 'incoming';
                const senderName = isMe ? "" : (msg.sender_name || "");
                const safeText = await decryptRoomMessage(msg.text, currentRoomId);
                renderMessage(safeText, messageType, senderName, false, msg.fileUrl, msg.id, msg.created_at || null);
            }

            lastRenderedMsgCount = data.messages.length;

            // 읽음 상태 업데이트
            if (data.messages.length > 0) {
                const lastId = data.messages[data.messages.length - 1].id;
                fetch(`${BACKEND_URL}/api/read-status`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: myUserId, userToken: sessionStorage.getItem('authToken') || '', roomId: currentRoomId, lastReadId: lastId })
                }).catch(() => {});
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
                        userToken: sessionStorage.getItem('authToken') || '',
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
        if (chatInput.disabled) {
            if (sendButton) sendButton.classList.remove('show');
            if (chatFooter) chatFooter.classList.remove('has-text');
            return;
        }

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
        if (chatInput.disabled) return;
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
    if (!myUserId || !sessionStorage.getItem('authToken')) {
        showModal('로그인이 필요합니다.');
        return;
    }

    if (currentTargetUserId === 'notice' || !chatInput || chatInput.disabled) {
        showModal('공지사항은 읽기 전용입니다.');
        if (chatInput) chatInput.value = '';
        if (sendButton) {
            sendButton.disabled = true;
            sendButton.classList.remove('show');
        }
        if (chatFooter) chatFooter.classList.remove('has-text');
        return;
    }

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

    // 화면에 내 메시지 즉시 표시 (AI 호출 명령어를 함께 보이도록 표시)
    const providerLabels = {
        gemini: 'Gemini',
        chatgpt: 'ChatGPT',
        claude: 'Claude',
        grok: 'Grok'
    };

    let displayText = messageText;
    let aiCommandLabel = '';
    for (const m of aiMentions) {
        if (messageText.toLowerCase().startsWith(m)) {
            const providerKey = m.replace('@', '');
            aiCommandLabel = providerLabels[providerKey] || providerKey.toUpperCase();
            displayText = messageText.substring(m.length).trim();
            break;
        }
    }

    if (currentTargetUserId === 'bot_ai' && !aiCommandLabel) {
        aiCommandLabel = providerLabels[aiProvider] || (aiProvider || 'Gemini');
    }

    if (aiCommandLabel) {
        displayText = `[AI:${aiCommandLabel}] ${displayText || '요청 전송'}`.trim();
    }

    renderMessage(displayText, 'outgoing', '', false, '', null);

    // AI 호출 시 로딩 표시
    let thinkingElement = null;
    if (isAiCall) {
        const thinkingLabel = aiCommandLabel ? `AI • ${aiCommandLabel}` : 'AI';
        thinkingElement = renderMessage('AI가 답변을 생각하고 있습니다...', 'incoming', thinkingLabel, true);
    }

    try {
        const encryptedPayload = await encryptRoomMessage(messageText, currentRoomId);
        const response = await fetch(`${BACKEND_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                roomId: currentRoomId,
                userId: myUserId,
                userToken: sessionStorage.getItem('authToken') || '',
                message: encryptedPayload,
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
function canDeleteMessage(createdAt) {
    if (!createdAt) return true;
    const createdTime = new Date(createdAt).getTime();
    if (Number.isNaN(createdTime)) return true;
    return (Date.now() - createdTime) <= MESSAGE_DELETE_LIMIT_MS;
}

async function deleteOutgoingMessage(messageId) {
    if (!messageId) return;
    const result = await fetch(`${BACKEND_URL}/api/messages/${messageId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: myUserId, userToken: sessionStorage.getItem('authToken') || '' })
    }).then(r => r.json()).catch(() => ({ success: false, message: '삭제 처리에 실패했습니다.' }));

    if (result.success) {
        showModal('메시지가 삭제되었습니다.');
        lastRenderedMsgCount = -1;
        fetchRoomMessages();
    } else {
        showModal(result.message || '삭제할 수 없습니다.');
    }
}

function hideMessageContextMenu() {
    const menu = document.querySelector('.message-context-menu');
    if (menu) menu.remove();
}

function showMessageContextMenu(event, messageId, shouldShowDelete, createdAt = null) {
    if (!messageId || !shouldShowDelete) return;
    event.preventDefault();
    hideMessageContextMenu();

    const menu = document.createElement('div');
    menu.className = 'message-context-menu';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'message-context-delete';
    deleteBtn.textContent = '삭제';
    deleteBtn.onclick = () => {
        deleteOutgoingMessage(messageId);
        hideMessageContextMenu();
    };

    menu.appendChild(deleteBtn);
    document.body.appendChild(menu);

    const offsetX = Math.min(event.clientX || window.innerWidth / 2, window.innerWidth - 110);
    const offsetY = Math.min(event.clientY || window.innerHeight / 2, window.innerHeight - 52);
    menu.style.left = `${Math.max(12, offsetX)}px`;
    menu.style.top = `${Math.max(12, offsetY)}px`;
}

function renderMessage(text, type, senderName = "", isThinking = false, fileUrl = "", messageId = null, createdAt = null) {
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
    if (messageId && type === 'outgoing') {
        messageBox.dataset.messageId = String(messageId);
        messageBox.dataset.createdAt = createdAt || new Date().toISOString();
    }

    if (isThinking) {
        messageBox.classList.add('ai-thinking');
        messageBox.textContent = text;
    } else if (fileUrl) {
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

    if (type === 'outgoing' && messageId) {
        const allowDelete = canDeleteMessage(createdAt);
        messageBox.addEventListener('contextmenu', (event) => {
            showMessageContextMenu(event, messageId, allowDelete, createdAt);
        });

        let longPressTimer = null;
        messageBox.addEventListener('touchstart', (event) => {
            if (!allowDelete) return;
            longPressTimer = setTimeout(() => {
                showMessageContextMenu({
                    preventDefault: () => {},
                    clientX: event.touches[0].clientX,
                    clientY: event.touches[0].clientY
                }, messageId, true, createdAt);
            }, 500);
        }, { passive: true });

        messageBox.addEventListener('touchend', () => clearTimeout(longPressTimer));
        messageBox.addEventListener('touchmove', () => clearTimeout(longPressTimer));
    }

    messageWrapper.appendChild(messageBox);
    chatBody.appendChild(messageWrapper);
    chatBody.scrollTop = chatBody.scrollHeight;
    return messageBox;
}

async function updateMessageContent(messageBox, newText) {
    if (!messageBox) return;
    messageBox.classList.remove('ai-thinking');
    messageBox.innerHTML = "";
    const decrypted = await decryptRoomMessage(newText, currentRoomId);
    formatAndSetBoxContent(messageBox, decrypted);
    chatBody.scrollTop = chatBody.scrollHeight;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatInlineMarkdown(value) {
    let html = escapeHtml(value);
    html = html.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
    return html;
}

function formatAndSetBoxContent(messageBox, text) {
    const rawText = String(text || '');
    const codeRegex = /'''\/?([a-zA-Z0-9_-]+)\/?\s*([\s\S]*?)'''/;
    const match = rawText.match(codeRegex);

    if (match) {
        const language = (match[1] || 'code').toUpperCase();
        const codeContent = (match[2] || rawText).replace(/\\n/g, '\n').trim();

        const container = document.createElement('div');
        container.className = 'code-viewer-container';

        const header = document.createElement('div');
        header.className = 'code-viewer-header';
        header.innerHTML = `<span>${language}</span><button type="button" class="code-copy-btn">복사</button>`;
        header.querySelector('.code-copy-btn').onclick = async () => {
            try {
                await navigator.clipboard.writeText(codeContent);
                const btn = header.querySelector('.code-copy-btn');
                btn.textContent = '복사됨';
                setTimeout(() => { btn.textContent = '복사'; }, 1200);
            } catch (error) {
                const fallback = document.createElement('textarea');
                fallback.value = codeContent;
                document.body.appendChild(fallback);
                fallback.select();
                document.execCommand('copy');
                document.body.removeChild(fallback);
            }
        };

        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = codeContent;
        pre.appendChild(code);

        container.appendChild(header);
        container.appendChild(pre);
        messageBox.appendChild(container);
        messageBox.classList.add('has-code');
        return;
    }

    const lines = rawText.split('\n');
    let richPresent = false;
    const richContent = document.createElement('div');
    richContent.className = 'message-rich-content';

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            richContent.appendChild(document.createElement('br'));
            return;
        }

        if (/^#{1,3}\s+/.test(trimmed)) {
            richPresent = true;
            const heading = document.createElement(trimmed.startsWith('###') ? 'h4' : trimmed.startsWith('##') ? 'h3' : 'h2');
            heading.className = 'rich-heading';
            heading.innerHTML = formatInlineMarkdown(trimmed.replace(/^#{1,3}\s+/, ''));
            richContent.appendChild(heading);
            return;
        }

        if (/^(>!|>TIP|>NOTE|>WARN)/i.test(trimmed)) {
            richPresent = true;
            const callout = document.createElement('div');
            callout.className = 'rich-callout';
            callout.innerHTML = formatInlineMarkdown(trimmed.replace(/^(>!|>TIP|>NOTE|>WARN)\s*/i, ''));
            richContent.appendChild(callout);
            return;
        }

        if (/^[-*]\s+\[([ xX])\]\s+/.test(trimmed)) {
            richPresent = true;
            const item = document.createElement('div');
            const checked = /\[x\]/i.test(trimmed);
            item.className = `rich-check-item ${checked ? 'checked' : ''}`;
            item.innerHTML = `<span>${checked ? '✓' : '□'}</span><span>${formatInlineMarkdown(trimmed.replace(/^[-*]\s+\[[ xX]\]\s+/, ''))}</span>`;
            richContent.appendChild(item);
            return;
        }

        const paragraph = document.createElement('p');
        paragraph.className = 'message-paragraph';
        paragraph.innerHTML = formatInlineMarkdown(line);
        richContent.appendChild(paragraph);
    });

    if (richPresent) {
        messageBox.appendChild(richContent);
        return;
    }

    messageBox.innerHTML = formatInlineMarkdown(rawText);
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