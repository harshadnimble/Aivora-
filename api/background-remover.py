import io
import json
import os
from http.server import BaseHTTPRequestHandler

from PIL import Image, ImageOps

os.environ.setdefault("U2NET_HOME", "/tmp/.u2net")

from rembg import new_session, remove

MAX_INPUT_BYTES = 4 * 1024 * 1024
MAX_OUTPUT_BYTES = 4 * 1024 * 1024
MAX_INPUT_PIXELS = 45_000_000
MAX_SIDE = 3000

_sessions = {}


def get_session(model):
    if model not in _sessions:
        _sessions[model] = new_session(model)
    return _sessions[model]


class handler(BaseHTTPRequestHandler):
    def _json(self, status, message):
        body = json.dumps({"error": message}).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path not in ("/", "/api/background-remover"):
            return self._json(404, "Not found.")

        content_type = self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower()
        if content_type not in ("image/png", "image/jpeg", "image/webp"):
            return self._json(415, "Upload a PNG, JPEG, or WebP image.")

        model = self.headers.get("X-Background-Model", "isnet-general-use")
        allowed_models = {
            "isnet-general-use",
            "u2net",
            "u2net_human_seg",
            "birefnet-general-lite",
            "birefnet-general",
            "birefnet-portrait",
        }
        if model not in allowed_models:
            return self._json(400, "Choose a supported background removal model.")

        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._json(400, "Invalid image upload.")
        if length < 1 or length > MAX_INPUT_BYTES:
            return self._json(413, "Keep the image under 4 MB.")

        raw = self.rfile.read(length)
        if len(raw) != length:
            return self._json(400, "The image upload was incomplete.")

        try:
            with Image.open(io.BytesIO(raw)) as source:
                source.verify()
            with Image.open(io.BytesIO(raw)) as source:
                if source.width * source.height > MAX_INPUT_PIXELS:
                    return self._json(413, "The image dimensions are too large.")
                image = ImageOps.exif_transpose(source).convert("RGB")
                image.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
                normalized = io.BytesIO()
                image.save(normalized, format="PNG", optimize=True)

            output = remove(normalized.getvalue(), session=get_session(model), force_return_bytes=True)
            with Image.open(io.BytesIO(output)) as cutout:
                cutout = cutout.convert("RGBA")
                while True:
                    encoded = io.BytesIO()
                    cutout.save(encoded, format="PNG", optimize=True, compress_level=9)
                    if encoded.tell() <= MAX_OUTPUT_BYTES:
                        break
                    if max(cutout.size) <= 1200:
                        return self._json(413, "The cutout is too large to return. Try a smaller image.")
                    resized = cutout.resize(
                        (max(1, int(cutout.width * 0.85)), max(1, int(cutout.height * 0.85))),
                        Image.Resampling.LANCZOS,
                    )
                    cutout.close()
                    cutout = resized
                result = encoded.getvalue()

            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(result)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(result)
        except Exception:
            return self._json(502, "rembg could not process this image. Please try another image.")

    def do_GET(self):
        return self._json(405, "Use POST to remove an image background.")
