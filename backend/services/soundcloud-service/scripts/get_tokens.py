"""One-shot script to get SoundCloud OAuth tokens via Authorization Code flow.

Steps:
  1. python scripts/get_tokens.py
  2. Authorize in the browser that opens
  3. Copy the two lines printed at the end into .env
"""

import http.server
import os
import sys
import threading
import urllib.parse
import webbrowser

CLIENT_ID = os.environ.get("ECHO_SC_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("ECHO_SC_CLIENT_SECRET", "")
REDIRECT_URI = "http://localhost:8888/callback"
PORT = 8888

if not CLIENT_ID or not CLIENT_SECRET:
    sys.exit("Set ECHO_SC_CLIENT_ID and ECHO_SC_CLIENT_SECRET (see backend/.env) before running.")

_code: str | None = None
_done = threading.Event()


class _Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        global _code
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        if "code" in params:
            _code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h2>Got it! You can close this tab.</h2>")
        else:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Missing code parameter.")
        _done.set()

    def log_message(self, *_):
        pass


def _exchange(code: str) -> dict:
    import urllib.request, json as _json
    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "redirect_uri": REDIRECT_URI,
        "code": code,
    }).encode()
    req = urllib.request.Request(
        "https://secure.soundcloud.com/oauth/token",
        data=data,
        headers={"Accept": "application/json; charset=utf-8",
                 "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        return _json.loads(resp.read())


def main():
    server = http.server.HTTPServer(("localhost", PORT), _Handler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    auth_url = (
        "https://secure.soundcloud.com/authorize"
        f"?client_id={CLIENT_ID}"
        f"&redirect_uri={urllib.parse.quote(REDIRECT_URI, safe='')}"
        "&response_type=code"
        "&scope=non-expiring"
    )
    print(f"\nOuvrir dans le navigateur :\n  {auth_url}\n")
    webbrowser.open(auth_url)
    print("En attente de l'autorisation SoundCloud...")
    _done.wait(timeout=120)
    server.shutdown()

    if not _code:
        print("Timeout — aucun code reçu.")
        return

    tokens = _exchange(_code)
    access = tokens.get("access_token", "")
    refresh = tokens.get("refresh_token", "")

    print("\n✅ Ajoute ces lignes dans .env :\n")
    print(f"ECHO_SC_ACCESS_TOKEN={access}")
    print(f"ECHO_SC_REFRESH_TOKEN={refresh}")
    print()


if __name__ == "__main__":
    main()
