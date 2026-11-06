import argparse
import atexit
import json
import math
import os
import re
import secrets
import shutil
import subprocess
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / 'public'
MAX_UPLOAD = 1536 * 1024 * 1024
MAX_JOBS = 2
JOBS = {}
LOCK = threading.RLock()
POOL = ThreadPoolExecutor(max_workers=MAX_JOBS)
WORK = Path(tempfile.mkdtemp(prefix='prism-music-'))
FFMPEG = shutil.which(os.environ.get('FFMPEG_PATH', 'ffmpeg'))
def dimensions(value, default):
    number = int(value or default)
    if number < 240 or number > 3840 or number % 2:
        raise ValueError('Dimensions must be even numbers between 240 and 3840.')
    return number
def convert(job_id):
    with LOCK:
        job = JOBS[job_id]
        if job['status'] == 'cancelled':
            return
        job['status'] = 'encoding'
    command = [FFMPEG, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(job['input']),
               '-map', '0:v:0', '-map', '0:a:0', '-vf',
               f"scale={job['width']}:{job['height']}:force_original_aspect_ratio=decrease,pad={job['width']}:{job['height']}:(ow-iw)/2:(oh-ih)/2,setsar=1",
               '-r', str(job['fps']), '-c:v', 'libx264', '-preset', 'veryfast',
               '-crf', str(job['crf']), '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
               '-movflags', '+faststart', '-t', str(job['duration']), '-shortest', '-progress', 'pipe:1', '-nostats', str(job['output'])]
    try:
        with open(job['log'], 'w+') as log:
            with LOCK:
                if job['status'] == 'cancelled':
                    return
                process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=log, text=True)
                job['process'] = process
            for line in process.stdout:
                if line.startswith('out_time_us='):
                    try:
                        elapsed = int(line.strip().split('=')[1]) / 1_000_000
                        with LOCK:
                            job['progress'] = min(99, round(elapsed / job['duration'] * 100))
                    except ValueError:
                        pass
            code = process.wait()
            with LOCK:
                if job['status'] != 'cancelled':
                    if code == 0 and job['output'].exists():
                        job.update(status='done', progress=100)
                    else:
                        log.seek(0)
                        job.update(status='error', error='FFmpeg could not encode this recording. ' + log.read()[-1500:])
    except Exception as error:
        with LOCK:
            if job['status'] != 'cancelled':
                job.update(status='error', error=str(error))
    finally:
        with LOCK:
            job['process'] = None
        job['input'].unlink(missing_ok=True)
        if job['status'] == 'cancelled':
            job['output'].unlink(missing_ok=True)
def cleanup():
    with LOCK:
        for job in JOBS.values():
            process = job.get('process')
            if process and process.poll() is None:
                process.terminate()
    POOL.shutdown(wait=True, cancel_futures=True)
    shutil.rmtree(WORK, ignore_errors=True)
def reap():
    with LOCK:
        expired = [key for key, job in JOBS.items() if time.time() - job['created'] > 7200 and job['status'] in ('done', 'error', 'cancelled')]
        for key in expired:
            job = JOBS.pop(key)
            for name in ('input', 'output', 'log'):
                job[name].unlink(missing_ok=True)
class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC), **kwargs)
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Cross-Origin-Resource-Policy', 'same-origin')
        super().end_headers()
    def json_response(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)
    def allowed_origin(self):
        host = self.headers.get('Host', '')
        try:
            hostname = urlparse('http://' + host).hostname
        except ValueError:
            return False
        if hostname not in ('localhost', '127.0.0.1', '::1'):
            return False
        origin = self.headers.get('Origin')
        return not origin or origin == 'http://' + host
    def do_GET(self):
        if not self.allowed_origin():
            return self.json_response(403, {'error': 'Local access only.'})
        path = urlparse(self.path).path
        if path == '/api/health':
            return self.json_response(200, {'ok': True, 'ffmpeg': bool(FFMPEG), 'developer': 'Sonny', 'maxUploadMB': MAX_UPLOAD // 1048576})
        match = re.fullmatch(r'/api/jobs/([a-f0-9]{32})(/download)?', path)
        if match:
            with LOCK:
                job = JOBS.get(match[1])
                if not job:
                    return self.json_response(404, {'error': 'Export not found or expired.'})
                snapshot = {key: job.get(key) for key in ('status', 'progress', 'error')}
            if not match[2]:
                return self.json_response(200, snapshot)
            if snapshot['status'] != 'done':
                return self.json_response(409, {'error': 'This video is not ready.'})
            try:
                with open(job['output'], 'rb') as video:
                    self.send_response(200)
                    self.send_header('Content-Type', 'video/mp4')
                    self.send_header('Content-Disposition', 'attachment; filename="prism-video.mp4"')
                    self.send_header('Content-Length', str(os.fstat(video.fileno()).st_size))
                    self.end_headers()
                    shutil.copyfileobj(video, self.wfile)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        if path.startswith('/api/'):
            return self.json_response(404, {'error': 'Endpoint not found.'})
        return super().do_GET()
    def do_POST(self):
        if not self.allowed_origin():
            self.close_connection = True
            return self.json_response(403, {'error': 'Local access only.'})
        if urlparse(self.path).path != '/api/exports':
            self.close_connection = True
            return self.json_response(404, {'error': 'Endpoint not found.'})
        if not FFMPEG:
            self.close_connection = True
            return self.json_response(503, {'error': 'FFmpeg is not installed. Install it and restart the server.'})
        reap()
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > MAX_UPLOAD:
                raise ValueError('Recording must be between 1 byte and 1.5 GB. Export a shorter clip.')
            width = dimensions(self.headers.get('X-Video-Width'), 1920)
            height = dimensions(self.headers.get('X-Video-Height'), 1080)
            fps = int(self.headers.get('X-Video-Fps', '30'))
            if fps not in (24, 30, 60, 90, 120):
                raise ValueError('Frame rate must be 24, 30, 60, 90 or 120.')
            duration = float(self.headers.get('X-Video-Duration', '1'))
            if not math.isfinite(duration) or not 0 < duration <= 7200:
                raise ValueError('Clip duration must be between 0 and 7200 seconds.')
            crf = {'draft': 26, 'balanced': 20, 'ultra': 16}.get(self.headers.get('X-Video-Quality'), 20)
        except (ValueError, OverflowError) as error:
            self.close_connection = True
            return self.json_response(400, {'error': str(error)})
        job_id = secrets.token_hex(16)
        job = {'status': 'uploading', 'progress': 0, 'error': None, 'created': time.time(),
               'input': WORK / f'{job_id}.webm', 'output': WORK / f'{job_id}.mp4',
               'log': WORK / f'{job_id}.log', 'process': None,
               'width': width, 'height': height, 'fps': fps, 'duration': duration, 'crf': crf}
        with LOCK:
            active = sum(j['status'] in ('uploading', 'queued', 'encoding') for j in JOBS.values())
            if active >= MAX_JOBS:
                self.close_connection = True
                return self.json_response(429, {'error': 'Two exports are already active. Please wait.'})
            JOBS[job_id] = job
        try:
            self.connection.settimeout(180)
            remaining = length
            with open(job['input'], 'wb') as target:
                while remaining:
                    chunk = self.rfile.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise ValueError('Upload was interrupted.')
                    target.write(chunk)
                    remaining -= len(chunk)
            with LOCK:
                job['status'] = 'queued'
            POOL.submit(convert, job_id)
            return self.json_response(202, {'id': job_id})
        except (OSError, ValueError) as error:
            with LOCK:
                job.update(status='error', error=str(error))
            job['input'].unlink(missing_ok=True)
            self.close_connection = True
            return self.json_response(400, {'error': str(error)})
    def do_DELETE(self):
        if not self.allowed_origin():
            return self.json_response(403, {'error': 'Local access only.'})
        match = re.fullmatch(r'/api/jobs/([a-f0-9]{32})', urlparse(self.path).path)
        with LOCK:
            job = JOBS.get(match[1]) if match else None
            if not job:
                return self.json_response(404, {'error': 'Export not found.'})
            if job['status'] in ('queued', 'encoding'):
                job['status'] = 'cancelled'
                process = job.get('process')
                if process and process.poll() is None:
                    process.terminate()
        return self.json_response(200, {'ok': True})
def main():
    parser = argparse.ArgumentParser(description='Prism Music Equalizer by Sonny')
    parser.add_argument('--port', type=int, default=8080)
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    print(f'\n  PRISM MUSIC EQUALIZER · Developed by Sonny\n  Open http://localhost:{args.port}\n  MP4 encoder: {FFMPEG or "Not found - install FFmpeg and restart"}\n', flush=True)
    atexit.register(cleanup)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nClosing Prism…')
    finally:
        server.server_close()
if __name__ == '__main__':
    main()
