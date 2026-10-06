from flask import Flask, request, jsonify
from flask_cors import CORS
import google.generativeai as genai
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
# CORS 완벽 허용
CORS(app, resources={r"/*": {"origins": "*"}})

# Gemini API 설정 (모델명 표준화)
GEMINI_API_KEY = input("your gemini api key: ")
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-3.6-flash')

# 💡 [임시 DB] 초기 유저 데이터베이스 (기본 AI 포함)
users_db = {
    "bot_gemini": {
        "password": "",
        "userName": "🤖 Gemini AI"
    }
}

# 채팅방 메시지 DB & 카운터
chat_rooms_db = {}
message_counter = 0


@app.route('/', methods=['GET'])
def index():
    return jsonify({"status": "running", "users": list(users_db.keys())})


# ==========================================
# 1. 회원가입 API
# ==========================================
@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    user_id = data.get('userId', '').strip()
    password = data.get('password', '').strip()
    user_name = data.get('userName', '').strip()

    if not user_id or not password or not user_name:
        return jsonify({"success": False, "message": "모든 항목을 입력해 주세요."}), 400

    if user_id in users_db:
        return jsonify({"success": False, "message": "이미 존재하는 아이디입니다."}), 400

    hashed_password = generate_password_hash(password)

    users_db[user_id] = {
        "password": hashed_password,
        "userName": user_name
    }

    return jsonify({"success": True, "message": "회원가입 성공!"})


# ==========================================
# 2. 로그인 API
# ==========================================
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    user_id = data.get('userId', '').strip()
    user_pw = data.get('password', '').strip() # 프론트에서 보낸 평문 비밀번호

    # 1. 딕셔너리에서 유저 정보 통째로 안전하게 가져오기
    user_info = users_db.get(user_id)

    # 2. 유저 정보가 없으면 (존재하지 않는 아이디) 바로 탈락
    if not user_info:
        return jsonify({"success": False, "error": "존재하지 않는 아이디입니다."}), 400

    # 3. 💡 핵심: 해시된 비밀번호와 입력된 비밀번호 검증
    # 회원가입 때 generate_password_hash를 썼으므로, 비교할 땐 check_password_hash를 써야 합니다.
    hashed_password = user_info.get("password")
    if not check_password_hash(hashed_password, user_pw):
        return jsonify({"success": False, "error": "비밀번호가 일치하지 않습니다."}), 401

    # 4. 로그인 성공 시 응답 (user_info["userName"]으로 뽑아오기)
    return jsonify({
        "success": True, 
        "userId": user_id, 
        "userName": user_info.get("userName")
    })

# ==========================================
# 3. 유저 검색 API (수정: dict 통째로 안 넘어가게 처리)
# ==========================================
@app.route('/api/search_users', methods=['GET'])
def search_users():
    query = request.args.get('q', '').strip().lower()
    my_id = request.args.get('myId', '')

    result = []

    for u_id, u_info in users_db.items():
        if u_id == my_id:
            continue

        # 💡 dict 형태에서 정확히 string 닉네임만 꺼냄
        if isinstance(u_info, dict):
            u_name = u_info.get('userName', u_id)
        else:
            u_name = str(u_info)

        if query in u_id.lower() or query in u_name.lower():
            result.append({
                "userId": u_id,
                "userName": u_name
            })

    return jsonify({"success": True, "users": result})


# ==========================================
# 4. 대화 내역 조회 API
# ==========================================
@app.route('/api/messages/<room_id>', methods=['GET'])
def get_messages(room_id):
    messages = chat_rooms_db.get(room_id, [])
    return jsonify({"success": True, "messages": messages})


# ==========================================
# 5. 메시지 전송 및 AI 응답 처리 API (핵심 수정)
# ==========================================
@app.route('/api/chat', methods=['POST'])
def handle_chat():
    global message_counter
    data = request.json or {}

    room_id = data.get('roomId')
    user_id = data.get('userId')
    req_user_name = data.get('userName') # 프론트에서 넘어온 닉네임
    user_message = data.get('message', '').strip()

    if not room_id or not user_message:
        return jsonify({"success": False, "error": "메시지 내용이 없습니다."}), 400

    if room_id not in chat_rooms_db:
        chat_rooms_db[room_id] = []

    # 💡 [수정 1] sender_name에 dict가 들어가지 않도록 정확히 닉네임 텍스트만 추출
    user_info = users_db.get(user_id)
    if isinstance(user_info, dict):
        sender_name = user_info.get('userName', user_id)
    else:
        sender_name = req_user_name or user_id

    # 1. 내 메시지 저장
    message_counter += 1
    my_msg = {
        "id": message_counter,
        "sender_id": str(user_id),
        "sender_name": str(sender_name), # 💡 무조건 순수 문자열 보장
        "text": str(user_message)
    }
    chat_rooms_db[room_id].append(my_msg)

    # 2. AI 호출 (@ai 질문 또는 Gemini AI 방)
    if user_message.startswith('@ai') or user_message.startswith('/ai') or "bot_gemini" in room_id:
        prompt = user_message.replace('@ai', '').replace('/ai', '').strip()
        if not prompt:
            prompt = "안녕하세요!"

        try:
            response = model.generate_content(prompt)
            # 💡 [수정 2] AI 응답 텍스트 추출 (str 보장)
            ai_reply = str(response.text if hasattr(response, 'text') else response)

            message_counter += 1
            ai_msg = {
                "id": message_counter,
                "sender_id": "bot_gemini",
                "sender_name": "🤖 Gemini AI",
                "text": ai_reply
            }
            chat_rooms_db[room_id].append(ai_msg)

        except Exception as e:
            print(f"Gemini API 에러: {e}")
            err_str = str(e)
            if "429" in err_str:
                ai_reply = "⚠️ 오늘 사용 가능한 AI 무료 질문 횟수(Quota)를 모두 소모했습니다."
            else:
                ai_reply = f"⚠️ AI 답변 생성 실패: {err_str}"

            message_counter += 1
            chat_rooms_db[room_id].append({
                "id": message_counter,
                "sender_id": "bot_gemini",
                "sender_name": "🤖 Gemini AI",
                "text": ai_reply
            })

    return jsonify({"success": True})


if __name__ == '__main__':
    print("🚀 백엔드 서버가 http://localhost:5000 에서 실행 중입니다.")
    app.run(host='0.0.0.0', port=5000, debug=True)
