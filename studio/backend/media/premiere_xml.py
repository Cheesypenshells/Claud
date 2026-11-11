"""Export an EDL as Final Cut Pro 7 XML (xmeml v4) — Premiere Pro imports this natively
(File > Import, or automatically via the Studio Bridge panel).

Produces one vertical sequence: V1 = jump-cut talking head (with Basic Motion scale for
punch-ins), V2 = b-roll, A1/A2 = dialogue, A3/A4 = music. Captions are delivered as an
.srt next to it (Premiere: File > Import > captions.srt, drag onto timeline).
"""
from pathlib import Path
from urllib.parse import quote
from xml.sax.saxutils import escape


def _url(p: str) -> str:
    p = str(Path(p).resolve()).replace("\\", "/")
    if not p.startswith("/"):
        p = "/" + p  # windows drive letter
    return "file://localhost" + quote(p)


def _rate(fps: int) -> str:
    return f"<rate><timebase>{fps}</timebase><ntsc>FALSE</ntsc></rate>"


def _file(fid: str, path: str, dur_f: int, fps: int, w: int, h: int, first: set) -> str:
    if fid in first:
        return f'<file id="{fid}"/>'
    first.add(fid)
    return (f'<file id="{fid}"><name>{escape(Path(path).name)}</name><pathurl>{_url(path)}</pathurl>'
            f'{_rate(fps)}<duration>{dur_f}</duration><media><video><samplecharacteristics>'
            f'<width>{w}</width><height>{h}</height></samplecharacteristics></video>'
            f'<audio><channelcount>2</channelcount></audio></media></file>')


def export(edl: dict, out: Path, name: str, source_info: dict) -> Path:
    fps = int(round(edl["canvas"].get("fps", 30)))
    W, H = edl["canvas"]["w"], edl["canvas"]["h"]
    f = lambda t: int(round(t * fps))  # noqa: E731
    src_dur = f(source_info.get("duration", 0) or 0) or 10**6
    sw, sh = source_info.get("width") or W, source_info.get("height") or H
    # Premiere scale is relative to source; fill-crop base scale:
    base = max(W / sw, H / sh) * 100
    seen: set = set()
    v1, a1, a2 = [], [], []
    t = 0
    for i, s in enumerate(edl["segments"]):
        ln = f(s["src_out"] - s["src_in"])
        scale = round(base * float(s.get("zoom", 1.0)), 2)
        common = (f"<start>{t}</start><end>{t + ln}</end><in>{f(s['src_in'])}</in><out>{f(s['src_in']) + ln}</out>")
        v1.append(
            f'<clipitem id="v1-{i}"><name>{escape(s.get("beat", "seg"))}</name><duration>{src_dur}</duration>'
            f'{_rate(fps)}{common}{_file("src", edl["source"], src_dur, fps, sw, sh, seen)}'
            f'<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory>'
            f'<effecttype>motion</effecttype><mediatype>video</mediatype><parameter><parameterid>scale</parameterid>'
            f'<name>Scale</name><valuemin>0</valuemin><valuemax>1000</valuemax><value>{scale}</value></parameter>'
            f'</effect></filter>'
            f'<link><linkclipref>v1-{i}</linkclipref></link><link><linkclipref>a1-{i}</linkclipref></link>'
            f'<link><linkclipref>a2-{i}</linkclipref></link></clipitem>')
        for lst, tag, ch in ((a1, "a1", 1), (a2, "a2", 2)):
            lst.append(f'<clipitem id="{tag}-{i}"><name>{escape(s.get("beat", "seg"))}</name>'
                       f'<duration>{src_dur}</duration>{_rate(fps)}{common}<file id="src"/>'
                       f'<sourcetrack><mediatype>audio</mediatype><trackindex>{ch}</trackindex></sourcetrack></clipitem>')
        t += ln
    total = t
    v2 = []
    for j, b in enumerate(edl.get("broll") or []):
        ln = f(b["end"] - b["start"])
        v2.append(f'<clipitem id="v2-{j}"><name>{escape(Path(b["path"]).name)}</name><duration>{ln}</duration>'
                  f'{_rate(fps)}<start>{f(b["start"])}</start><end>{f(b["start"]) + ln}</end><in>0</in><out>{ln}</out>'
                  f'{_file(f"broll{j}", b["path"], ln, fps, W, H, seen)}</clipitem>')
    a3 = []
    m = edl.get("music")
    if m:
        a3.append(f'<clipitem id="a3-0"><name>{escape(Path(m["path"]).name)}</name><duration>{total}</duration>'
                  f'{_rate(fps)}<start>0</start><end>{total}</end><in>0</in><out>{total}</out>'
                  f'{_file("music", m["path"], total, fps, W, H, seen)}'
                  f'<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid>'
                  f'<effectcategory>audiolevels</effectcategory><effecttype>audiolevels</effecttype>'
                  f'<mediatype>audio</mediatype><parameter><parameterid>level</parameterid><name>Level</name>'
                  f'<value>{10 ** (m.get("gain_db", -20) / 20):.4f}</value></parameter></effect></filter></clipitem>')
    track = lambda items: f"<track>{''.join(items)}</track>"  # noqa: E731
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4"><sequence id="seq1">'
        f"<name>{escape(name)}</name><duration>{total}</duration>{_rate(fps)}"
        "<media><video><format><samplecharacteristics>"
        f"{_rate(fps)}<width>{W}</width><height>{H}</height><pixelaspectratio>square</pixelaspectratio>"
        "</samplecharacteristics></format>"
        f"{track(v1)}{track(v2)}</video><audio>{track(a1)}{track(a2)}{track(a3)}</audio></media>"
        "</sequence></xmeml>\n"
    )
    out.write_text(xml, encoding="utf-8")
    return out
