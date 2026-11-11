"""End-to-end test of the whole studio in offline mode, with synthetic footage.

Run from studio/:  STUDIO_OFFLINE=1 python -m pytest -q tests
"""
import os
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from pathlib import Path

os.environ["STUDIO_OFFLINE"] = "1"
os.environ.setdefault("STUDIO_DATA", tempfile.mkdtemp(prefix="studio-test-"))

from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app  # noqa: E402
from backend.agents import editor  # noqa: E402

client = TestClient(app)
TMP = Path(tempfile.mkdtemp(prefix="studio-media-"))


def make_video(path: Path, seconds=12, cut_every=None, w=540, h=960):
    """Talking-head stand-in: test pattern video + 'speech' tone bursts separated by silences."""
    v = f"testsrc2=size={w}x{h}:rate=30:duration={seconds}"
    if cut_every:  # hard scene changes for the reference clip
        v = (f"testsrc2=size={w}x{h}:rate=30:duration={seconds},"
             f"negate=enable='lt(mod(t\\,{2 * cut_every})\\,{cut_every})'")
    a = f"aevalsrc='0.5*sin(2*PI*220*t)*lt(mod(t\\,2.3)\\,1.6)':s=48000:d={seconds}"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", v, "-f", "lavfi", "-i", a,
                    "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", str(path)], check=True)
    return path


def wait(pred, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        r = pred()
        if r:
            return r
        time.sleep(0.5)
    raise TimeoutError


def test_retake_removal():
    w = lambda t, s: {"w": t, "s": s, "e": s + 0.3}  # noqa: E731
    words = [w("jadi", 0), w("gw", 0.4), w("mau", 0.8), w("bahas.", 1.2),
             w("jadi", 2.5), w("gw", 2.9), w("mau", 3.3), w("ngomongin", 3.7), w("ini.", 4.1)]
    kept, n = editor.drop_retakes(words)
    assert n == 1 and kept[0]["s"] == 2.5


def test_end_to_end():
    assert client.get("/api/status").json()["llm"]["online"] is False

    # 1) content bank: reference clips + b-roll + music
    ref_dir = TMP / "refs"
    ref_dir.mkdir()
    make_video(ref_dir / "ref1.mp4", 10, cut_every=1.5)
    make_video(ref_dir / "ref2.mp4", 8, cut_every=1.2)
    r = client.post("/api/assets/scan", json={"folder": str(ref_dir), "type": "reference", "tags": ["theoderick_"]})
    assert r.status_code == 200 and len(r.json()) == 2
    broll = make_video(TMP / "city_broll.mp4", 4)
    with broll.open("rb") as f:
        client.post("/api/assets/upload", data={"type": "broll", "tags": "city,money"}, files={"file": f})
    music = TMP / "lofi_beat.m4a"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=110:duration=5",
                    "-c:a", "aac", str(music)], check=True)
    with music.open("rb") as f:
        client.post("/api/assets/upload", data={"type": "music", "tags": "lofi"}, files={"file": f})
    wait(lambda: all(a["status"] == "ready" for a in client.get("/api/assets").json()))
    ref = next(a for a in client.get("/api/assets").json() if a["name"] == "ref1.mp4")
    assert ref["analysis"]["cuts_per_min"] > 20, ref["analysis"]

    # 2) brief -> research -> concept (autopilot)
    p = client.post("/api/projects", json={"topic": "nabung buat anak muda", "duration": 30,
                                            "auto_download": False}).json()
    pid = p["id"]
    proj = wait(lambda: (lambda x: x if x["stages"].get("footage") == "waiting" else None)(
        client.get(f"/api/projects/{pid}").json()))
    assert proj["style"]["metrics"]["clips"] == 2
    assert len(proj["concept"]["beats"]) >= 4

    # put a b-roll hint on a beat so the editor uses the bank
    c = proj["concept"]
    c["beats"][2]["broll_hint"] = "city"
    client.put(f"/api/projects/{pid}/concept", json={"concept": c})

    # 3) talent uploads face footage -> edit -> review
    raw = make_video(TMP / "geo_take1.mp4", 14)
    with raw.open("rb") as f:
        client.post(f"/api/projects/{pid}/footage", files={"file": f})
    proj = wait(lambda: (lambda x: x if x["stages"].get("review") in ("done", "error") else None)(
        client.get(f"/api/projects/{pid}").json()), timeout=600)
    assert proj["stages"]["review"] == "done", client.get(f"/api/logs?project={pid}").json()[-5:]

    rep = proj["report"]
    assert rep["removed_seconds"] > 2  # silences cut
    assert rep["broll_used"] == 1 and rep["music"] is True
    for k in ("preview", "final", "xml", "srt"):
        assert client.get(proj["outputs"][k]).status_code == 200
    # final render is vertical 1080x1920
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v", "-show_entries", "stream=width,height",
                          "-of", "csv=p=0", str(Path(os.environ["STUDIO_DATA"]) / "projects" / pid / "final.mp4")],
                         capture_output=True, text=True).stdout.strip()
    assert out == "1080,1920"
    # Premiere XML parses and has one clip per segment
    xml = ET.fromstring(client.get(proj["outputs"]["xml"]).content)
    assert len(xml.findall(".//video/track")[0].findall("clipitem")) == rep["segments"]

    # 4) Premiere bridge job queue
    jobs = client.get("/api/premiere/jobs").json()
    assert len(jobs) == 1
    client.post(f"/api/premiere/jobs/{jobs[0]['id']}/ack", json={"ok": True})
    assert client.get("/api/premiere/jobs").json() == []
