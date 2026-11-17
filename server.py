"""
server.py - Bangladesh 3D Map-er local server (shudhu Python standard library, kono install lagbe na)

Chalate:   python server.py            (default port 8000)
           python server.py 5000       (onno port)
Tarpor browser-e khulun:  http://localhost:8000

Extra API (optional):
  GET /api/divisions          -> 8 ta bibhag-er sob tottho
  GET /api/divisions/<id>     -> ekta bibhag (id: 1..8)
  GET /api/districts?division=<id>
  GET /api/quiz?n=10          -> random quiz question
"""
import json
import random
import sys
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

PUBLIC = Path(__file__).parent / "public"
DATA = PUBLIC / "data"


def load(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".json": "application/json", ".geojson": "application/json"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(PUBLIC), **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if not u.path.startswith("/api/"):
            return super().do_GET()
        q = parse_qs(u.query)
        parts = [p for p in u.path.split("/") if p][1:]
        info = load("divisions_info.json")
        if parts == ["divisions"]:
            return self.send_json(info)
        if len(parts) == 2 and parts[0] == "divisions":
            d = info["divisions"].get(parts[1])
            return self.send_json(d) if d else self.send_json({"error": "bibhag paoa jayni"}, 404)
        if parts == ["districts"]:
            feats = load("districts.geojson")["features"]
            div = (q.get("division") or [None])[0]
            rows = [f["properties"] for f in feats if not div or f["properties"]["division_id"] == div]
            return self.send_json(rows)
        if parts == ["quiz"]:
            n = int((q.get("n") or ["10"])[0])
            bank = load("quiz.json")
            return self.send_json(random.sample(bank, min(n, len(bank))))
        return self.send_json({"error": "not found"}, 404)

    def log_message(self, fmt, *args):
        pass  # console shaf rakhte


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    url = f"http://localhost:{port}"
    print(f"Server chalu: {url}   (bondho korte Ctrl+C)")
    try:
        webbrowser.open(url)
    except Exception:
        pass
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
