#!/usr/bin/env python3
"""Convert a captured Ink terminal frame (with SGR bold/dim/inverse codes) into a
styled HTML terminal card, ready for a headless-Chrome screenshot.

Reads the frame from stdin, writes HTML to argv[1]. Faithful: the text and the
bold headers are exactly what the real TUI emits (FORCE_COLOR capture)."""
import sys
import re
import html

frame = sys.stdin.read().rstrip("\n")

SGR = re.compile(r"\x1b\[([0-9;]*)m")


def to_spans(line: str) -> str:
    """Translate the SGR codes we actually emit (1 bold, 22 bold-off, 2 dim,
    7 inverse, 0 reset) into nested <span> markup with HTML-escaped text."""
    out = []
    bold = dim = inv = False
    pos = 0
    for m in SGR.finditer(line):
        text = line[pos:m.start()]
        if text:
            cls = " ".join(c for c, on in
                           (("b", bold), ("d", dim), ("i", inv)) if on)
            out.append(f'<span class="{cls}">{html.escape(text)}</span>'
                       if cls else html.escape(text))
        for code in (m.group(1) or "0").split(";"):
            code = code or "0"
            if code == "1": bold = True
            elif code == "22": bold = False
            elif code == "2": dim = True
            elif code == "7": inv = True
            elif code == "0": bold = dim = inv = False
        pos = m.end()
    tail = line[pos:]
    if tail:
        cls = " ".join(c for c, on in
                       (("b", bold), ("d", dim), ("i", inv)) if on)
        out.append(f'<span class="{cls}">{html.escape(tail)}</span>'
                   if cls else html.escape(tail))
    return "".join(out) or "&nbsp;"


body = "\n".join(to_spans(l) for l in frame.split("\n"))

HTML = f"""<!doctype html><html><head><meta charset="utf-8"><style>
  * {{ margin:0; padding:0; box-sizing:border-box; }}
  html,body {{ background:#161b22; }}
  .wrap {{ display:inline-block; padding:26px; }}
  .card {{
    background:#0d1117; border:1px solid #30363d; border-radius:10px;
    box-shadow:0 12px 40px rgba(0,0,0,.55); overflow:hidden;
    display:inline-block;
  }}
  .bar {{
    height:34px; background:#161b22; border-bottom:1px solid #30363d;
    display:flex; align-items:center; padding:0 14px; gap:8px;
  }}
  .dot {{ width:12px; height:12px; border-radius:50%; }}
  .r {{ background:#ff5f56; }} .y {{ background:#ffbd2e; }} .g {{ background:#27c93f; }}
  .title {{
    margin-left:10px; color:#8b949e; font:12px/1
    'JetBrains Mono','DejaVu Sans Mono',monospace;
  }}
  pre {{
    margin:0; padding:20px 24px; color:#c9d1d9;
    font:15px/1.55 'JetBrains Mono','DejaVu Sans Mono','Menlo',monospace;
    white-space:pre; tab-size:4;
  }}
  .b {{ color:#f0f6fc; font-weight:700; }}
  .d {{ color:#6e7681; }}
  .i {{ background:#c9d1d9; color:#0d1117; }}
</style></head><body><div class="wrap"><div class="card">
  <div class="bar">
    <span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
    <span class="title">undetermini — npm run eval:tui</span>
  </div>
  <pre>{body}</pre>
</div></div></body></html>"""

with open(sys.argv[1], "w") as f:
    f.write(HTML)
print(sys.argv[1])
