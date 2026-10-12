from flask import Flask, request, jsonify
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
import sqlite3
import os
import requests as http_requests
import uuid
import time
from datetime import datetime
from werkzeug.utils import secure_filename

app = Flask(__name__)

@app.after_request
def apply_security_headers(response):
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    response.headers['Content-Security-Policy'] = "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://fonts.googleapis.com https://fonts.gstatic.com https://api.dicebear.com; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' http://localhost:5000 http://127.0.0.1:5000;"
    return response

# ==========================================
# 설정
# ==========================================
AVATAR_FOLDER = os.path.join(app.root_path, 'static', 'avatars')
UPLOAD_FOLDER = os.path.join(app.root_path, 'static', 'uploads')
os.makedirs(AVATAR_FOLDER, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

ALLOWED_IMAGE_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_FILE_EXT = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'zip', 'mp4', 'mp3', 'doc', 'docx', 'xls', 'xlsx', 'pptx'}

CORS(app, resources={r"/*": {"origins": "*"}})
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024  # 10MB

DB_PATH = os.path.join(os.path.dirname(__file__), "messenger.db")
SERVER_START_TIME = str(time.time())

# AI @멘션 매핑
AI_MENTION_MAP = {
    '@gemini': 'gemini',
    '@chatgpt': 'openai',
    '@claude': 'claude',
    '@grok': 'grok',
}


def allowed_image(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXT


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_FILE_EXT


# ==========================================
# SQLite DB
# ==========================================
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    c = conn.cursor()

    # 유저 테이블 (4가지 API 키 분리)
    c.execute('''CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        password TEXT NOT NULL,
        user_name TEXT NOT NULL,
        status_msg TEXT DEFAULT '',
        avatar TEXT DEFAULT '',
        ai_provider TEXT DEFAULT 'gemini',
        gemini_key TEXT DEFAULT '',
        openai_key TEXT DEFAULT '',
        claude_key TEXT DEFAULT '',
        grok_key TEXT DEFAULT '',
        role TEXT DEFAULT 'user',
        is_admin INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    c.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in c.fetchall()]
    for col_name in ['gemini_key', 'openai_key', 'claude_key', 'grok_key', 'avatar', 'ai_provider', 'status_msg', 'role', 'is_admin', 'created_at']:
        if col_name not in columns:
            default = "'gemini'" if col_name == 'ai_provider' else "'user'" if col_name == 'role' else "0" if col_name == 'is_admin' else "''"
            c.execute(f"ALTER TABLE users ADD COLUMN {col_name} TEXT DEFAULT {default}")
    if 'api_key' in columns:
        try:
            c.execute("UPDATE users SET gemini_key = api_key WHERE (gemini_key IS NULL OR gemini_key = '') AND api_key != ''")
        except Exception:
            pass

    c.execute('''CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT DEFAULT ''
    )''')

    # 메시지 테이블
    c.execute('''CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        text TEXT NOT NULL,
        file_url TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    c.execute("PRAGMA table_info(messages)")
    msg_cols = [col[1] for col in c.fetchall()]
    if 'file_url' not in msg_cols:
        c.execute("ALTER TABLE messages ADD COLUMN file_url TEXT DEFAULT ''")

    # 그룹 채팅 테이블 (향후 확장용)
    c.execute('''CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    c.execute('''CREATE TABLE IF NOT EXISTS group_members (
        group_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id)
    )''')

    # 읽음 추적 테이블 (알림 배지용)
    c.execute('''CREATE TABLE IF NOT EXISTS read_status (
        user_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        last_read_id INTEGER DEFAULT 0,
        PRIMARY KEY (user_id, room_id)
    )''')

    # 기본 관리자 계정
    c.execute("SELECT user_id FROM users WHERE user_id = 'admin'")
    if not c.fetchone():
        c.execute('''INSERT INTO users (user_id, password, user_name, status_msg, avatar, ai_provider, role, is_admin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            ('admin', generate_password_hash('admin123!'), '관리자', '시스템 운영 중', 'https://api.dicebear.com/7.x/bottts/svg?seed=admin', 'gemini', 'admin', 1))

    # 통합 AI 봇 유저
    c.execute("SELECT user_id FROM users WHERE user_id = 'bot_ai'")
    if not c.fetchone():
        c.execute('''INSERT INTO users (user_id, password, user_name, status_msg, avatar, ai_provider, role, is_admin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            ('bot_ai', '', '통합 AI', '무엇이든 물어보세요!', 'https://api.dicebear.com/7.x/bottts/svg?seed=ai', 'bot', 'bot', 0))

    c.execute("SELECT user_id FROM users WHERE user_id = 'bot_gemini'")
    if not c.fetchone():
        c.execute('''INSERT INTO users (user_id, password, user_name, status_msg, avatar, ai_provider, role, is_admin)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            ('bot_gemini', '', 'Gemini 관리 봇', '관리 명령: /delete-user userId', 'https://api.dicebear.com/7.x/bottts/svg?seed=gemini', 'gemini', 'bot', 0))

    conn.commit()
    conn.close()


init_db()


# ==========================================
# 다중 AI 호출
# ==========================================
def call_ai_provider(provider, api_key, prompt):
    if not api_key:
        return "⚠️ 이 AI 제공자의 API 키가 등록되어 있지 않습니다.\n[프로필 설정]에서 해당 AI의 API 키를 등록해 주세요."

    provider = (provider or 'gemini').lower()

    try:
        if provider == 'gemini':
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            model = genai.GenerativeModel('gemini-3.6-flash')
            res = model.generate_content(prompt)
            return str(res.text if hasattr(res, 'text') else res)

        elif provider == 'openai':
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": prompt}]}
            r = http_requests.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload, timeout=30)
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"]
            return f"⚠️ OpenAI API 오류 ({r.status_code}): {r.text}"

        elif provider == 'claude':
            headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01", "Content-Type": "application/json"}
            payload = {"model": "claude-3-haiku-20240307", "max_tokens": 1000, "messages": [{"role": "user", "content": prompt}]}
            r = http_requests.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload, timeout=30)
            if r.status_code == 200:
                return r.json()["content"][0]["text"]
            return f"⚠️ Claude API 오류 ({r.status_code}): {r.text}"

        elif provider == 'grok':
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            payload = {"model": "grok-beta", "messages": [{"role": "user", "content": prompt}]}
            r = http_requests.post("https://api.x.ai/v1/chat/completions", headers=headers, json=payload, timeout=30)
            if r.status_code == 200:
                return r.json()["choices"][0]["message"]["content"]
            return f"⚠️ Grok API 오류 ({r.status_code}): {r.text}"

        else:
            return f"⚠️ 지원되지 않는 AI 제공자: {provider}"
    except Exception as e:
        return f"⚠️ AI 호출 중 오류: {str(e)}"


# ==========================================
# 상태 확인 / Heartbeat
# ==========================================
@app.route('/', methods=['GET'])
def index():
    return jsonify({"status": "running", "serverTime": SERVER_START_TIME})


@app.route('/api/heartbeat', methods=['GET'])
def heartbeat():
    return jsonify({"alive": True, "serverTime": SERVER_START_TIME})


# ==========================================
# 회원가입
# ==========================================
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    user_id = data.get('userId', '').strip()
    password = data.get('password', '').strip()
    user_name = data.get('userName', '').strip()
    ai_provider = data.get('aiProvider', 'gemini').strip()
    gemini_key = data.get('geminiKey', '').strip()
    openai_key = data.get('openaiKey', '').strip()
    claude_key = data.get('claudeKey', '').strip()
    grok_key = data.get('grokKey', '').strip()

    if not user_id or not password or not user_name:
        return jsonify({"success": False, "message": "모든 필수 항목을 입력해 주세요."}), 400

    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,))
    if cursor.fetchone():
        conn.close()
        return jsonify({"success": False, "message": "이미 존재하는 아이디입니다."}), 400

    hashed = generate_password_hash(password)
    avatar = f"https://api.dicebear.com/7.x/bottts/svg?seed={user_id}"

    cursor.execute('''INSERT INTO users (user_id, password, user_name, status_msg, avatar, ai_provider, gemini_key, openai_key, claude_key, grok_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
        (user_id, hashed, user_name, "반갑습니다!", avatar, ai_provider, gemini_key, openai_key, claude_key, grok_key))

    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "회원가입 성공!"})


# ==========================================
# 로그인
# ==========================================
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    user_id = data.get('userId', '').strip()
    user_pw = data.get('password', '').strip()

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()

    if not user:
        return jsonify({"success": False, "error": "존재하지 않는 아이디입니다."}), 400

    if user["password"] and user["password"] != '':
        if not check_password_hash(user["password"], user_pw):
            return jsonify({"success": False, "error": "비밀번호가 일치하지 않습니다."}), 401

    return jsonify({
        "success": True,
        "userId": user["user_id"],
        "userName": user["user_name"],
        "statusMsg": user["status_msg"] or "",
        "avatar": user["avatar"] or "",
        "aiProvider": user["ai_provider"] or "gemini",
        "isAdmin": bool(user["is_admin"] or user["role"] == 'admin'),
        "role": user["role"] or 'user',
        "serverTime": SERVER_START_TIME
    })


# ==========================================
# 유저 검색
# ==========================================
@app.route('/api/search_users', methods=['GET'])
def search_users():
    query = request.args.get('q', '').strip().lower()
    my_id = request.args.get('myId', '')

    conn = get_db()
    rows = conn.execute("SELECT user_id, user_name, status_msg, avatar, role, is_admin FROM users WHERE user_id != ? AND user_id NOT IN ('bot_ai', 'bot_gemini')", (my_id,)).fetchall()
    conn.close()

    result = []
    for row in rows:
        uid = row['user_id']
        uname = row['user_name']
        if not query or query in uid.lower() or query in uname.lower():
            result.append({
                "userId": uid,
                "userName": uname,
                "statusMsg": row['status_msg'] or "",
                "avatar": row['avatar'] or f"https://api.dicebear.com/7.x/bottts/svg?seed={uid}",
                "role": row['role'] or 'user',
                "isAdmin": bool(row['is_admin'])
            })

    return jsonify({"success": True, "users": result})


# ==========================================
# 프로필 조회
# ==========================================
@app.route('/api/profile/<user_id>', methods=['GET'])
def get_profile(user_id):
    conn = get_db()
    u = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()

    if not u:
        return jsonify({"success": False, "message": "존재하지 않는 유저입니다."}), 404

    return jsonify({
        "success": True,
        "userId": u["user_id"],
        "userName": u["user_name"],
        "statusMsg": u["status_msg"] or "",
        "avatar": u["avatar"] or "",
        "aiProvider": u["ai_provider"] or "gemini",
        "geminiKey": u["gemini_key"] or "",
        "openaiKey": u["openai_key"] or "",
        "claudeKey": u["claude_key"] or "",
        "grokKey": u["grok_key"] or "",
        "role": u["role"] or 'user',
        "isAdmin": bool(u["is_admin"] or u["role"] == 'admin')
    })


# ==========================================
# 프로필 수정
# ==========================================
@app.route('/api/profile/update', methods=['POST'])
def update_profile():
    data = request.json or {}
    user_id = data.get('userId', '').strip()

    conn = get_db()
    u = conn.execute("SELECT user_id FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if not u:
        conn.close()
        return jsonify({"success": False, "message": "유효하지 않은 사용자입니다."}), 400

    user_name = data.get('userName', '').strip() or user_id
    status_msg = data.get('statusMsg', '').strip()
    avatar = data.get('avatar', '').strip()
    ai_provider = data.get('aiProvider', 'gemini').strip()
    gemini_key = data.get('geminiKey', '').strip()
    openai_key = data.get('openaiKey', '').strip()
    claude_key = data.get('claudeKey', '').strip()
    grok_key = data.get('grokKey', '').strip()

    conn.execute('''UPDATE users SET user_name=?, status_msg=?, avatar=?, ai_provider=?,
        gemini_key=?, openai_key=?, claude_key=?, grok_key=? WHERE user_id=?''',
        (user_name, status_msg, avatar, ai_provider, gemini_key, openai_key, claude_key, grok_key, user_id))
    conn.commit()

    updated = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    conn.close()

    return jsonify({
        "success": True,
        "message": "프로필이 성공적으로 수정되었습니다!",
        "userId": updated["user_id"],
        "userName": updated["user_name"],
        "statusMsg": updated["status_msg"],
        "avatar": updated["avatar"],
        "aiProvider": updated["ai_provider"],
        "geminiKey": updated["gemini_key"],
        "openaiKey": updated["openai_key"],
        "claudeKey": updated["claude_key"],
        "grokKey": updated["grok_key"]
    })


@app.route('/api/profile/password', methods=['POST'])
def update_password():
    data = request.json or {}
    user_id = (data.get('userId') or '').strip()
    current_password = (data.get('currentPassword') or '').strip()
    new_password = (data.get('newPassword') or '').strip()

    if not user_id or not new_password:
        return jsonify({"success": False, "message": "사용자 정보와 새 비밀번호를 입력해 주세요."}), 400
    if len(new_password) < 8:
        return jsonify({"success": False, "message": "새 비밀번호는 8자 이상이어야 합니다."}), 400

    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if not user:
        conn.close()
        return jsonify({"success": False, "message": "유효하지 않은 사용자입니다."}), 400

    if user["password"] and user["password"] != '':
        if not current_password or not check_password_hash(user["password"], current_password):
            conn.close()
            return jsonify({"success": False, "message": "현재 비밀번호가 올바르지 않습니다."}), 401

    conn.execute("UPDATE users SET password = ? WHERE user_id = ?", (generate_password_hash(new_password), user_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "비밀번호가 정상적으로 변경되었습니다."})


# ==========================================
# 아바타 이미지 업로드
# ==========================================
@app.route('/api/avatar/upload', methods=['POST'])
def upload_avatar():
    if 'avatar' not in request.files:
        return jsonify({'success': False, 'message': '파일이 없습니다.'}), 400
    file = request.files['avatar']
    if file.filename == '':
        return jsonify({'success': False, 'message': '파일을 선택해 주세요.'}), 400
    if not allowed_image(file.filename):
        return jsonify({'success': False, 'message': 'PNG, JPG, GIF, WEBP 파일만 업로드 가능합니다.'}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    filename = secure_filename(str(uuid.uuid4()) + ext)
    file.save(os.path.join(AVATAR_FOLDER, filename))
    return jsonify({'success': True, 'avatarUrl': f"/static/avatars/{filename}"})


# ==========================================
# 채팅 파일 업로드
# ==========================================
@app.route('/api/files/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': '파일이 없습니다.'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'message': '파일을 선택해 주세요.'}), 400
    if not allowed_file(file.filename):
        return jsonify({'success': False, 'message': '지원되지 않는 파일 형식입니다.'}), 400

    ext = os.path.splitext(file.filename)[1].lower()
    safe_name = secure_filename(file.filename)
    unique_name = f"{uuid.uuid4().hex[:8]}_{safe_name}"
    file.save(os.path.join(UPLOAD_FOLDER, unique_name))
    return jsonify({
        'success': True,
        'fileUrl': f"/static/uploads/{unique_name}",
        'fileName': file.filename
    })


# ==========================================
# 대화 내역 조회
# ==========================================
@app.route('/api/messages/<room_id>', methods=['GET'])
def get_messages(room_id):
    conn = get_db()
    rows = conn.execute('''SELECT id, room_id, sender_id, sender_name, text, file_url, created_at
        FROM messages WHERE room_id = ? ORDER BY id ASC''', (room_id,)).fetchall()
    conn.close()

    messages = [{
        "id": row["id"],
        "sender_id": row["sender_id"],
        "sender_name": row["sender_name"],
        "text": row["text"],
        "fileUrl": row["file_url"] or ""
    } for row in rows]

    return jsonify({"success": True, "messages": messages})


# ==========================================
# 읽음 상태 업데이트
# ==========================================
@app.route('/api/read-status', methods=['POST'])
def update_read_status():
    data = request.json or {}
    user_id = data.get('userId', '')
    room_id = data.get('roomId', '')
    last_read_id = data.get('lastReadId', 0)

    if not user_id or not room_id:
        return jsonify({"success": False}), 400

    conn = get_db()
    conn.execute('''INSERT OR REPLACE INTO read_status (user_id, room_id, last_read_id) VALUES (?, ?, ?)''',
        (user_id, room_id, last_read_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route('/api/messages/<int:message_id>', methods=['DELETE'])
def delete_message(message_id):
    data = request.json or {}
    user_id = (data.get('userId') or request.args.get('userId') or '').strip()
    if not user_id:
        return jsonify({"success": False, "message": "사용자 정보가 필요합니다."}), 400

    conn = get_db()
    message = conn.execute("SELECT sender_id, created_at FROM messages WHERE id = ?", (message_id,)).fetchone()
    if not message:
        conn.close()
        return jsonify({"success": False, "message": "존재하지 않는 메시지입니다."}), 404
    if message['sender_id'] != user_id:
        conn.close()
        return jsonify({"success": False, "message": "본인이 보낸 메시지만 삭제할 수 있습니다."}), 403

    try:
        created_at = datetime.strptime(message['created_at'], '%Y-%m-%d %H:%M:%S')
        if (datetime.now() - created_at).total_seconds() > 300:
            conn.close()
            return jsonify({"success": False, "message": "메시지는 보낸 지 5분 이내에만 삭제할 수 있습니다."}), 403
    except Exception:
        conn.close()
        return jsonify({"success": False, "message": "메시지 삭제 시간 검증에 실패했습니다."}), 400

    conn.execute("DELETE FROM messages WHERE id = ?", (message_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "메시지가 삭제되었습니다."})


# ==========================================
# 안읽은 메시지 확인 (알림 배지용)
# ==========================================
@app.route('/api/unread', methods=['GET'])
def get_unread():
    user_id = request.args.get('userId', '')
    if not user_id:
        return jsonify({"success": False}), 400

    conn = get_db()

    # 이 유저가 참여한 모든 방의 최신 메시지 ID
    rooms = conn.execute('''SELECT room_id, MAX(id) as last_msg_id
        FROM messages WHERE room_id LIKE ? GROUP BY room_id''',
        (f'%{user_id}%',)).fetchall()

    # 이 유저의 읽음 상태
    read_rows = conn.execute("SELECT room_id, last_read_id FROM read_status WHERE user_id = ?", (user_id,)).fetchall()
    conn.close()

    read_map = {r['room_id']: r['last_read_id'] for r in read_rows}

    unread = {}
    for room in rooms:
        rid = room['room_id']
        last_msg = room['last_msg_id']
        last_read = read_map.get(rid, 0)
        if last_msg > last_read:
            # 상대방 user_id 추출 (chat_userA_userB 형식)
            parts = rid.replace('chat_', '').split('_')
            target_id = ''
            for p in parts:
                if p != user_id:
                    target_id = p
                    break
            unread[target_id] = True

    return jsonify({"success": True, "unread": unread})


# ==========================================
# 관리자 및 보안 유틸
# ==========================================

def is_admin_user(conn, user_id):
    if not user_id:
        return False
    row = conn.execute("SELECT is_admin, role FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return False
    return bool(row['is_admin']) or (row['role'] or '').lower() == 'admin'


def delete_user_account(user_id):
    conn = get_db()
    if not user_id or user_id in ('admin', 'bot_ai', 'bot_gemini'):
        conn.close()
        return {"success": False, "message": "관리자 또는 시스템 봇은 삭제할 수 없습니다."}

    try:
        conn.execute("DELETE FROM messages WHERE sender_id = ? OR room_id LIKE ? OR room_id LIKE ?", (user_id, f'%{user_id}%', f'%{user_id}%'))
        conn.execute("DELETE FROM users WHERE user_id = ?", (user_id,))
        conn.commit()
        conn.close()
        return {"success": True, "message": f"'{user_id}' 사용자를 삭제했습니다."}
    except Exception as exc:
        conn.close()
        return {"success": False, "message": f"삭제 중 오류: {exc}"}


# ==========================================
# 메시지 전송 및 AI 연동
# ==========================================
@app.route('/api/chat', methods=['POST'])
def handle_chat():
    data = request.json or {}
    room_id = data.get('roomId')
    user_id = data.get('userId')
    user_message = (data.get('message', '') or '').strip()
    req_ai_provider = data.get('aiProvider', '')
    file_url = data.get('fileUrl', '')

    if not room_id or (not user_message and not file_url):
        return jsonify({"success": False, "error": "메시지 내용이 없습니다."}), 400

    conn = get_db()
    cursor = conn.cursor()

    user_info = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
    sender_name = user_info["user_name"] if user_info else user_id
    default_provider = user_info["ai_provider"] if user_info else "gemini"

    # 관리 봇 전용 명령어
    if 'bot_gemini' in room_id and user_message.lower().startswith('/delete-user '):
        target_user = user_message.split(None, 1)[1].strip()
        result = delete_user_account(target_user)
        bot_reply = result['message'] if result['success'] else result['message']
        cursor.execute('''INSERT INTO messages (room_id, sender_id, sender_name, text, file_url)
            VALUES (?, ?, ?, ?, '')''', (room_id, 'bot_gemini', 'Gemini 관리 봇', bot_reply))
        conn.commit()
        conn.close()
        return jsonify({"success": True, "aiReply": bot_reply})

    cursor.execute('''INSERT INTO messages (room_id, sender_id, sender_name, text, file_url)
        VALUES (?, ?, ?, ?, ?)''', (room_id, str(user_id), str(sender_name), str(user_message), str(file_url)))
    conn.commit()

    detected_provider = None
    prompt = user_message

    msg_lower = user_message.lower()
    for mention, provider in AI_MENTION_MAP.items():
        if msg_lower.startswith(mention):
            detected_provider = provider
            prompt = user_message[len(mention):].strip()
            break

    if not detected_provider and 'bot_ai' in room_id:
        detected_provider = req_ai_provider or default_provider
        prompt = user_message

    ai_reply_text = None
    if detected_provider and prompt:
        key_map = {
            'gemini': user_info['gemini_key'] if user_info else '',
            'openai': user_info['openai_key'] if user_info else '',
            'claude': user_info['claude_key'] if user_info else '',
            'grok': user_info['grok_key'] if user_info else '',
        }
        api_key = key_map.get(detected_provider, '')
        provider_labels = {'gemini': 'Gemini', 'openai': 'ChatGPT', 'claude': 'Claude', 'grok': 'Grok'}
        provider_label = provider_labels.get(detected_provider, detected_provider.upper())

        try:
            ai_reply_text = call_ai_provider(detected_provider, api_key, prompt)
        except Exception as e:
            ai_reply_text = f"⚠️ AI 응답 생성 중 오류: {str(e)}"

        ai_sender_name = f"{sender_name}님의 AI ({provider_label})"
        encrypted_ai_reply = ai_reply_text
        cursor.execute('''INSERT INTO messages (room_id, sender_id, sender_name, text, file_url)
            VALUES (?, ?, ?, ?, '')''', (room_id, f'bot_{detected_provider}', ai_sender_name, encrypted_ai_reply))
        conn.commit()

    conn.close()
    return jsonify({"success": True, "aiReply": ai_reply_text})


# ==========================================
# 관리자 API
# ==========================================
@app.route('/api/admin/notices', methods=['GET', 'POST'])
def admin_notices():
    payload = request.get_json(silent=True) or {}
    user_id = request.args.get('userId', '') or payload.get('userId', '')
    conn = get_db()

    if request.method == 'GET':
        rows = conn.execute("SELECT * FROM notices ORDER BY id DESC LIMIT 20").fetchall()
        conn.close()
        return jsonify({
            "success": True,
            "notices": [{
                "id": row['id'],
                "title": row['title'],
                "content": row['content'],
                "createdBy": row['created_by'],
                "createdAt": row['created_at'],
                "expiresAt": row['expires_at']
            } for row in rows]
        })

    if not user_id or not is_admin_user(conn, user_id):
        conn.close()
        return jsonify({"success": False, "message": "관리자만 공지를 등록할 수 있습니다."}), 403

    title = (payload.get('title') or '').strip()
    content = (payload.get('content') or '').strip()
    if not title or not content:
        conn.close()
        return jsonify({"success": False, "message": "제목과 내용은 필수입니다."}), 400

    conn.execute('''INSERT INTO notices (title, content, created_by) VALUES (?, ?, ?)''', (title, content, user_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "공지 등록 완료"})


@app.route('/api/admin/notices/<int:notice_id>', methods=['DELETE'])
def delete_notice(notice_id):
    user_id = request.args.get('userId', '')
    conn = get_db()
    if not user_id or not is_admin_user(conn, user_id):
        conn.close()
        return jsonify({"success": False, "message": "관리자 권한이 필요합니다."}), 403

    conn.execute("DELETE FROM notices WHERE id = ?", (notice_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": "공지가 삭제되었습니다."})


@app.route('/api/admin/credentials', methods=['GET'])
def admin_credentials():
    user_id = request.args.get('userId', '')
    conn = get_db()
    if not user_id or not is_admin_user(conn, user_id):
        conn.close()
        return jsonify({"success": False, "message": "관리자 권한이 필요합니다."}), 403
    conn.close()
    return jsonify({"success": True, "adminUserId": "admin", "defaultPassword": "12345678"})


@app.route('/api/admin/users', methods=['GET'])
def admin_users():
    user_id = request.args.get('userId', '')
    conn = get_db()
    if not user_id or not is_admin_user(conn, user_id):
        conn.close()
        return jsonify({"success": False, "users": []}), 403

    rows = conn.execute("SELECT user_id, user_name, status_msg, avatar, role, is_admin FROM users WHERE user_id NOT IN ('admin', 'bot_ai', 'bot_gemini') ORDER BY user_name COLLATE NOCASE ASC").fetchall()
    conn.close()
    return jsonify({
        "success": True,
        "users": [{
            "userId": row['user_id'],
            "userName": row['user_name'],
            "statusMsg": row['status_msg'] or "",
            "avatar": row['avatar'] or "",
            "role": row['role'] or 'user',
            "isAdmin": bool(row['is_admin'])
        } for row in rows]
    })


@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
def delete_admin_user(user_id):
    request_user = request.args.get('userId', '')
    conn = get_db()
    if not request_user or not is_admin_user(conn, request_user):
        conn.close()
        return jsonify({"success": False, "message": "관리자 권한이 필요합니다."}), 403

    result = delete_user_account(user_id)
    return jsonify(result)


@app.route('/api/admin/users/<user_id>/reset-password', methods=['POST'])
def reset_user_password(user_id):
    payload = request.get_json(silent=True) or {}
    request_user = payload.get('userId') or request.args.get('userId', '')
    conn = get_db()
    if not request_user or not is_admin_user(conn, request_user):
        conn.close()
        return jsonify({"success": False, "message": "관리자 권한이 필요합니다."}), 403
    if user_id in ('admin', 'bot_ai', 'bot_gemini'):
        conn.close()
        return jsonify({"success": False, "message": "시스템 계정은 비밀번호를 초기화할 수 없습니다."}), 400

    conn.execute("UPDATE users SET password = ? WHERE user_id = ?", (generate_password_hash('12345678'), user_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "message": f"'{user_id}' 계정의 비밀번호를 12345678로 초기화했습니다."})


@app.route('/api/admin/summary', methods=['GET'])
def admin_summary():
    user_id = request.args.get('userId', '')
    conn = get_db()
    if not user_id or not is_admin_user(conn, user_id):
        conn.close()
        return jsonify({"success": False}), 403

    total_users = conn.execute("SELECT COUNT(*) AS c FROM users WHERE user_id NOT IN ('bot_ai', 'bot_gemini')").fetchone()['c']
    admin_users = conn.execute("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' OR is_admin = 1").fetchone()['c']
    notice_count = conn.execute("SELECT COUNT(*) AS c FROM notices").fetchone()['c']
    conn.close()
    return jsonify({"success": True, "totalUsers": total_users, "adminUsers": admin_users, "noticeCount": notice_count})


# ==========================================
# 그룹 채팅 API (향후 확장)
# ==========================================
@app.route('/api/groups/create', methods=['POST'])
def create_group():
    data = request.json or {}
    name = data.get('name', '').strip()
    created_by = data.get('userId', '').strip()
    members = data.get('members', [])

    if not name or not created_by:
        return jsonify({"success": False, "message": "그룹 이름과 생성자를 입력해 주세요."}), 400

    group_id = f"group_{uuid.uuid4().hex[:8]}"
    conn = get_db()
    c = conn.cursor()
    c.execute("INSERT INTO groups (id, name, created_by) VALUES (?, ?, ?)", (group_id, name, created_by))
    c.execute("INSERT INTO group_members (group_id, user_id) VALUES (?, ?)", (group_id, created_by))
    for m in members:
        if m != created_by:
            c.execute("INSERT OR IGNORE INTO group_members (group_id, user_id) VALUES (?, ?)", (group_id, m))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "groupId": group_id, "name": name})


@app.route('/api/groups/list', methods=['GET'])
def list_groups():
    user_id = request.args.get('userId', '')
    conn = get_db()
    rows = conn.execute('''SELECT g.id, g.name, g.created_by, g.created_at
        FROM groups g JOIN group_members gm ON g.id = gm.group_id
        WHERE gm.user_id = ?''', (user_id,)).fetchall()
    conn.close()
    groups = [{"id": r["id"], "name": r["name"], "createdBy": r["created_by"]} for r in rows]
    return jsonify({"success": True, "groups": groups})


if __name__ == '__main__':
    print("🚀 메신저 백엔드 서버 실행 중 (http://localhost:5000)")
    app.run(host='0.0.0.0', port=5000, debug=True)
