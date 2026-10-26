"""Local production server: standard library only, bound to loopback."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse, json

ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'app/dist'),**kwargs)
    def do_GET(self):
        if self.path=='/health':
            body=json.dumps({'status':'ok','application':'FloodTrace','version':json.loads((ROOT/'app/package.json').read_text())['version'],'root':str(ROOT)}).encode()
            self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        else:super().do_GET()
    def end_headers(self):
        self.send_header('Cache-Control','no-cache')
        self.send_header('X-Content-Type-Options','nosniff')
        super().end_headers()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=5178);args=parser.parse_args()
    if not (ROOT/'app/dist/index.html').exists():raise SystemExit('Missing build. Run ./rebuild.sh first.')
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    print(f'FloodTrace production: http://127.0.0.1:{args.port}/',flush=True)
    server.serve_forever()
