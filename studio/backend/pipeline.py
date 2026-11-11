"""Producer / orchestrator. Runs the studio like a content company:

  Brief -> Research (Style DNA) -> Creative Director (concept + script)
        -> Talent records face footage -> Editor (EDL + render + Premiere XML)
        -> Creative Director review -> Premiere handoff / publish-ready

Every stage runs in a background worker and writes progress to the agent log.
"""
import shutil
import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import config, db
from .agents import creative_director as cd
from .agents import editor, researcher
from .media import analyze, fetch, premiere_xml, render

POOL = ThreadPoolExecutor(max_workers=3)
STAGES = ["research", "concept", "footage", "edit", "review"]
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".avi", ".mxf"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}


def submit(fn, *args):
    fut = POOL.submit(_safe, fn, *args)
    return fut


def _safe(fn, *args):
    try:
        return fn(*args)
    except Exception as e:
        pid = args[0] if args and isinstance(args[0], str) and args[0].startswith("pro_") else None
        db.log(pid, "Producer", f"ERROR in {fn.__name__}: {e}")
        traceback.print_exc()
        if pid:
            _stage(pid, _current_stage(pid), "error", error=str(e))
        raise


def _current_stage(pid):
    p = db.get(pid) or {}
    for s in STAGES:
        if p.get("stages", {}).get(s) == "running":
            return s
    return p.get("stage", "research")


def _stage(pid, stage, status, **fields):
    p = db.get(pid)
    stages = {**p.get("stages", {}), stage: status}
    db.update(pid, stages=stages, stage=stage, **fields)


# ---------------------------------------------------------------- content bank
def ingest(path: str, type_: str, tags: list[str] | None = None, copy: bool = False, info: dict | None = None,
           name: str | None = None) -> dict:
    src = Path(path)
    if copy:
        dest = config.BANK / type_ / src.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)
        src = dest
    asset = db.put("asset", {"type": type_, "name": name or src.name, "path": str(src.resolve()),
                             "tags": [t.lower().lstrip("@") for t in (tags or [])], "status": "analyzing",
                             "info": info or {}})
    submit(_analyze_asset, asset["id"])
    return asset


def _analyze_asset(aid: str):
    a = db.get(aid)
    p = Path(a["path"])
    transcript = a["type"] in ("reference", "raw")
    if p.suffix.lower() in AUDIO_EXT:
        res = {**analyze.probe(str(p))}
    else:
        res = analyze.analyze(str(p), with_transcript=transcript)
        th = analyze.thumbnail(str(p), config.DATA / "thumbs" / f"{aid}.jpg",
                               at=min(1.0, max(0.0, res.get("duration", 1) / 3)))
        if th:
            db.update(aid, thumb=f"/media/thumbs/{aid}.jpg")
    db.update(aid, analysis=res, status="ready")
    db.log(None, "Librarian", f"Analisa {a['name']}: {res.get('duration', 0):.1f}s"
                              + (f", {res.get('cuts_per_min')} cut/menit" if "cuts_per_min" in res else ""))
    # if a project was waiting on this raw footage, continue the line
    for proj in db.list_kind("project"):
        if proj.get("raw_asset") == aid and proj.get("stages", {}).get("footage") == "analyzing":
            _stage(proj["id"], "footage", "done")
            if proj.get("autopilot", True):
                submit(run_edit, proj["id"])


def scan_folder(folder: str, type_: str, tags: list[str]) -> list[dict]:
    """Index a folder from the hard drive into the bank (no copying)."""
    out = []
    for f in sorted(Path(folder).expanduser().rglob("*")):
        if f.suffix.lower() in VIDEO_EXT | AUDIO_EXT and f.is_file():
            if any(a["path"] == str(f.resolve()) for a in db.list_kind("asset")):
                continue
            out.append(ingest(str(f), type_, tags + [f.parent.name]))
    return out


def import_references(handle: str, platform: str, limit: int = 8, url: str | None = None, pid: str | None = None):
    url = url or fetch.profile_url(handle, platform)
    db.log(pid, "Research", f"Download referensi dari {url} (maks {limit})")
    files, log = fetch.download(url, config.BANK / "reference" / handle.lstrip("@"), limit)
    known = {a["path"] for a in db.list_kind("asset")}
    new = [ingest(str(f), "reference", [handle], info=fetch.info_for(f)) for f in files if str(f.resolve()) not in known]
    db.log(pid, "Research", f"{len(new)} video referensi baru masuk bank" + ("" if files else f" — yt-dlp: {log[-300:]}"))
    return new


# ---------------------------------------------------------------- stages
def create_project(brief: dict, autopilot: bool = True) -> dict:
    p = db.put("project", {"name": brief.get("topic", "Untitled")[:60], "brief": brief, "autopilot": autopilot,
                           "stage": "research", "stages": {s: "todo" for s in STAGES}})
    db.log(p["id"], "Producer", f"Project baru: '{p['name']}' — ref {brief.get('reference_handle')}, "
                                f"talent {brief.get('talent_handle')}")
    if autopilot:
        submit(run_research, p["id"])
    return p


def run_research(pid: str):
    p = db.get(pid)
    b = p["brief"]
    handle = (b.get("reference_handle") or "").lstrip("@").lower()
    _stage(pid, "research", "running")
    refs = [a for a in db.list_kind("asset") if a["type"] == "reference" and handle in a.get("tags", [])]
    if not refs and b.get("auto_download", True) and handle:
        import_references(handle, b.get("platform", "instagram"), pid=pid)
        import time
        for _ in range(600):  # wait for analysis of downloads
            refs = [a for a in db.list_kind("asset") if a["type"] == "reference" and handle in a.get("tags", [])]
            if all(a["status"] == "ready" for a in refs):
                break
            time.sleep(1)
    ready = [a for a in refs if a.get("status") == "ready"]
    notes = researcher.web_research("@" + handle, b.get("topic", ""), pid)
    style = researcher.build_style_profile("@" + handle, ready, notes, pid)
    style_doc = db.put("style", style)
    _stage(pid, "research", "done", style_id=style_doc["id"], research_notes=notes,
           reference_assets=[a["id"] for a in ready])
    db.log(pid, "Research", f"Style DNA selesai ({style.get('pace')} pace, shot {style.get('target_avg_shot_len')}s)")
    if db.get(pid).get("autopilot", True):
        run_concept(pid)


def run_concept(pid: str):
    p = db.get(pid)
    _stage(pid, "concept", "running")
    style = db.get(p["style_id"]) if p.get("style_id") else {}
    db.log(pid, "Creative Director", "Menyusun konsep, 3 opsi hook, dan script per beat")
    concept = cd.make_concept(p["brief"], style, p.get("research_notes", ""), pid)
    _stage(pid, "concept", "done", concept=concept)
    _stage(pid, "footage", "waiting")
    db.log(pid, "Creative Director", f"Konsep: '{concept.get('title')}'. Hook: \"{concept['beats'][0]['line']}\"")
    db.log(pid, "Producer", "Script siap di tab Teleprompter — tinggal rekam muka lu & upload footage-nya")


def attach_footage(pid: str, asset_id: str):
    a = db.get(asset_id)
    _stage(pid, "footage", "analyzing" if a.get("status") != "ready" else "done", raw_asset=asset_id)
    db.log(pid, "Producer", f"Footage talent diterima: {a['name']}")
    if a.get("status") == "ready" and db.get(pid).get("autopilot", True):
        submit(run_edit, pid)


def run_edit(pid: str, final: bool = True):
    p = db.get(pid)
    _stage(pid, "edit", "running")
    raw = db.get(p["raw_asset"])
    style = db.get(p["style_id"]) if p.get("style_id") else {}
    work = config.PROJECTS / pid
    work.mkdir(parents=True, exist_ok=True)
    bank = [a for a in db.list_kind("asset") if a.get("status") == "ready" and a["type"] in ("broll", "music")]
    edl, report = editor.build_edl(raw, p["concept"], style, bank, work, pid)
    report["target_duration"] = p["brief"].get("duration")
    db.log(pid, "Editor", "Render preview…")
    render.render(edl, work / "preview.mp4", preview=True)
    outputs = {"preview": f"/media/projects/{pid}/preview.mp4", "srt": f"/media/projects/{pid}/captions.srt"}
    if final:
        db.log(pid, "Editor", "Render final 1080x1920…")
        render.render(edl, work / "final.mp4")
        outputs["final"] = f"/media/projects/{pid}/final.mp4"
    xml = premiere_xml.export(edl, work / "sequence.xml", p["name"], raw["analysis"])
    outputs["xml"] = f"/media/projects/{pid}/sequence.xml"
    db.put("pjob", {"project": pid, "name": p["name"], "xml": str(xml.resolve()), "srt": str((work / 'captions.srt').resolve()),
                    "final": str((work / "final.mp4").resolve()) if final else None, "status": "queued"})
    db.log(pid, "Editor", "Sequence Premiere (XML) + SRT siap — panel Studio Bridge akan import otomatis")
    _stage(pid, "edit", "done", edl=edl, report=report, outputs=outputs)
    if db.get(pid).get("autopilot", True):
        run_review(pid)


def run_review(pid: str):
    p = db.get(pid)
    _stage(pid, "review", "running")
    style = db.get(p["style_id"]) if p.get("style_id") else {}
    rv = cd.review(p["concept"], p["report"], style, pid)
    _stage(pid, "review", "done", review=rv)
    db.log(pid, "Creative Director", f"Review: {rv['score']}/100 — {rv['verdict'].upper()}"
                                     + (f". Fix: {'; '.join(rv['fixes'][:3])}" if rv["fixes"] else ""))
