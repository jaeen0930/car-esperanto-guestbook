#!/usr/bin/env python3
"""게스트북 키오스크 로컬 서버.
python3 -m http.server 와 같지만, 브라우저가 옛 파일을 기억(캐시)하지 않게 해서
파일을 고치면 새로고침 한 번에 바로 반영돼요."""
import http.server, socketserver, os, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
os.chdir(os.path.dirname(os.path.abspath(__file__)))

class NoCache(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.wasm': 'application/wasm', '.js': 'text/javascript', '.woff2': 'font/woff2'}
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()
    def log_message(self, *a):
        pass

class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

print(f'게스트북 서버: http://localhost:{PORT}  (끄려면 Ctrl + C)')
Server(('127.0.0.1', PORT), NoCache).serve_forever()
