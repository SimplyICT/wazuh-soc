#!/usr/bin/env python3
import http.server
import os
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 5001
DIR = os.path.join(os.path.dirname(__file__), "dist")

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def do_GET(self):
        path = self.path.lstrip("/")
        static_path = os.path.join(DIR, path)
        if self.path.startswith("/assets/") and os.path.isfile(static_path):
            return super().do_GET()
        self.path = "/index.html"
        return super().do_GET()

if __name__ == "__main__":
    os.chdir(DIR)
    http.server.HTTPServer(("0.0.0.0", PORT), SPAHandler).serve_forever()
