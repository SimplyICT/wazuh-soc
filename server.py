#!/usr/bin/env python3
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
DIR = os.path.join(os.path.dirname(__file__), "dist")
BASE = "/soc"


class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def do_GET(self):
        # Strip base path prefix
        req = self.path.split("?")[0]
        if req.startswith(BASE):
            req = req[len(BASE):] or "/"

        path = req.lstrip("/")
        # Normalise and prevent path traversal
        safe_path = os.path.normpath(path)
        if safe_path.startswith("..") or safe_path.startswith("/"):
            self.send_response(403)
            self.end_headers()
            return
        static_path = os.path.join(DIR, safe_path)

        if safe_path and os.path.isfile(static_path):
            # Serve the real file
            self.path = "/" + safe_path
            return super().do_GET()

        # Fallback to index.html for SPA routing
        self.path = "/index.html"
        return super().do_GET()


if __name__ == "__main__":
    http.server.HTTPServer(("0.0.0.0", PORT), SPAHandler).serve_forever()
