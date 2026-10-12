#!/usr/bin/env python3
"""WBS Master 로컬/팀 서버 — 표준 라이브러리만 사용.

    python3 server.py            # http://localhost:8080
    python3 server.py 9000       # 포트 지정
    python3 server.py 8080 0.0.0.0   # 같은 네트워크의 팀원과 공유

정적 파일을 제공하고, GET/PUT /api/state 로 data/wbs-data.json 을 읽고 씁니다.
저장할 때마다 data/backup/ 에 이전 파일을 남깁니다(최근 50개).
"""
import json
import os
import shutil
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(ROOT, "data")
DATA_FILE = os.path.join(DATA_DIR, "wbs-data.json")
BACKUP_DIR = os.path.join(DATA_DIR, "backup")
MAX_BODY = 50 * 1024 * 1024
KEEP_BACKUPS = 50
lock = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _json(self, code, body):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/state":
            with lock:
                if os.path.exists(DATA_FILE):
                    with open(DATA_FILE, encoding="utf-8") as f:
                        return self._json(200, f.read())
            return self._json(200, "null")
        if self.path.startswith("/data/"):  # 데이터 파일은 API로만 접근
            return self.send_error(404)
        return super().do_GET()

    def do_PUT(self):
        if self.path.split("?")[0] != "/api/state":
            return self.send_error(404)
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.send_error(413)
        raw = self.rfile.read(length).decode("utf-8")
        try:
            obj = json.loads(raw)
            if not isinstance(obj, dict) or not isinstance(obj.get("projects"), list):
                raise ValueError("projects 배열이 없습니다")
        except ValueError as e:
            return self._json(400, json.dumps({"error": str(e)}, ensure_ascii=False))
        with lock:
            os.makedirs(BACKUP_DIR, exist_ok=True)
            backups = sorted(os.listdir(BACKUP_DIR))
            last = os.path.getmtime(os.path.join(BACKUP_DIR, backups[-1])) if backups else 0
            if os.path.exists(DATA_FILE) and time.time() - last > 300:  # 5분에 한 번만 백업
                shutil.copy2(DATA_FILE, os.path.join(BACKUP_DIR, time.strftime("wbs-data-%Y%m%d-%H%M%S.json")))
                backups = sorted(os.listdir(BACKUP_DIR))
                for old in backups[:-KEEP_BACKUPS]:
                    os.remove(os.path.join(BACKUP_DIR, old))
            tmp = DATA_FILE + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(raw)
            os.replace(tmp, DATA_FILE)
        return self._json(200, '{"ok":true}')

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            return
        super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    host = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    os.makedirs(DATA_DIR, exist_ok=True)
    srv = ThreadingHTTPServer((host, port), Handler)
    print(f"WBS Master: http://{'localhost' if host in ('127.0.0.1', '0.0.0.0') else host}:{port}  (데이터: {DATA_FILE})")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
