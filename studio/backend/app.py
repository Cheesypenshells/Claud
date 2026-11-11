"""Studio API + dashboard server.  Run:  uvicorn backend.app:app --port 8787  (from studio/)"""
import shutil
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, db, llm, pipeline
from .agents import researcher

db.init()
app = FastAPI(title="Geo Content Studio")
# The Premiere CEP panel runs from file:// (Origin "null"); browsers on other sites stay blocked.
app.add_middleware(CORSMiddleware, allow_origins=["null", "file://"], allow_methods=["*"], allow_headers=["*"])
app.mount("/media/projects", StaticFiles(directory=config.PROJECTS), name="projects")
(config.DATA / "thumbs").mkdir(exist_ok=True)
app.mount("/media/thumbs", StaticFiles(directory=config.DATA / "thumbs"), name="thumbs")
FRONT = config.ROOT / "frontend"


class Brief(BaseModel):
    topic: str
    message: str = ""
    reference_handle: str = "theoderick_"
    talent_handle: str = "geov10"
    platform: str = "instagram"
    duration: int = 45
    notes: str = ""
    auto_download: bool = True
    autopilot: bool = True


class FolderScan(BaseModel):
    folder: str
    type: str = "broll"
    tags: list[str] = []


class RefImport(BaseModel):
    handle: str
    platform: str = "instagram"
    limit: int = 8
    url: str | None = None


@app.get("/")
def index():
    return FileResponse(FRONT / "index.html")


app.mount("/static", StaticFiles(directory=FRONT), name="static")


@app.get("/api/status")
def status():
    return {"llm": llm.status(), "data_dir": str(config.DATA), "cookies_browser": config.COOKIES_BROWSER or None,
            "counts": {k: len(db.list_kind(k)) for k in ("project", "asset", "style", "pjob")}}


# ---------------- projects
@app.get("/api/projects")
def projects():
    return db.list_kind("project")


@app.post("/api/projects")
def create_project(b: Brief):
    d = b.model_dump()
    return pipeline.create_project(d, autopilot=d.pop("autopilot"))


@app.get("/api/projects/{pid}")
def project(pid: str):
    p = db.get(pid)
    if not p:
        raise HTTPException(404)
    if p.get("style_id"):
        p["style"] = db.get(p["style_id"])
    if p.get("raw_asset"):
        p["raw"] = db.get(p["raw_asset"])
    return p


@app.post("/api/projects/{pid}/run/{stage}")
def run_stage(pid: str, stage: str):
    fn = {"research": pipeline.run_research, "concept": pipeline.run_concept,
          "edit": pipeline.run_edit, "review": pipeline.run_review}.get(stage)
    if not fn:
        raise HTTPException(400, "unknown stage")
    pipeline.submit(fn, pid)
    return {"ok": True}


class ConceptPatch(BaseModel):
    concept: dict


@app.put("/api/projects/{pid}/concept")
def edit_concept(pid: str, body: ConceptPatch):
    db.log(pid, "Talent", "Script diedit manual")
    return db.update(pid, concept=body.concept)


@app.post("/api/projects/{pid}/footage")
async def upload_footage(pid: str, file: UploadFile = File(...)):
    dest = config.BANK / "raw" / f"{pid}_{Path(file.filename).name}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    a = pipeline.ingest(str(dest), "raw", ["talent"])
    pipeline.attach_footage(pid, a["id"])
    return a


@app.post("/api/projects/{pid}/footage/{aid}")
def use_existing_footage(pid: str, aid: str):
    pipeline.attach_footage(pid, aid)
    return {"ok": True}


@app.delete("/api/projects/{pid}")
def delete_project(pid: str):
    db.delete(pid)
    return {"ok": True}


# ---------------- content bank
@app.get("/api/assets")
def assets(type: str | None = None):
    a = db.list_kind("asset")
    return [x for x in a if not type or x["type"] == type]


@app.post("/api/assets/upload")
async def upload_asset(type: str = Form("broll"), tags: str = Form(""), file: UploadFile = File(...)):
    dest = config.BANK / type / Path(file.filename).name
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)
    return pipeline.ingest(str(dest), type, [t.strip() for t in tags.split(",") if t.strip()])


@app.post("/api/assets/scan")
def scan(body: FolderScan):
    if not Path(body.folder).expanduser().is_dir():
        raise HTTPException(400, f"Folder tidak ditemukan: {body.folder}")
    return pipeline.scan_folder(body.folder, body.type, body.tags)


@app.post("/api/assets/import-references")
def import_refs(body: RefImport):
    pipeline.submit(pipeline.import_references, body.handle.lstrip("@").lower(), body.platform, body.limit, body.url)
    return {"ok": True, "queued": True}


@app.delete("/api/assets/{aid}")
def delete_asset(aid: str):
    db.delete(aid)
    return {"ok": True}


@app.get("/api/assets/{aid}/file")
def asset_file(aid: str):
    a = db.get(aid)
    if not a:
        raise HTTPException(404)
    return FileResponse(a["path"])


@app.get("/api/styles")
def styles():
    return db.list_kind("style")


@app.get("/api/toolkit")
def toolkit():
    return researcher.RELEVANT_REPOS


@app.get("/api/logs")
def logs(project: str | None = None, after: int = 0):
    return db.logs(project, after)


# ---------------- Premiere bridge (polled by the CEP panel inside Premiere Pro)
@app.get("/api/premiere/jobs")
def premiere_jobs(status: str = "queued"):
    return [j for j in db.list_kind("pjob") if j["status"] == status]


@app.post("/api/premiere/jobs/{jid}/ack")
def premiere_ack(jid: str, result: dict | None = None):
    j = db.update(jid, status="imported", result=result or {})
    db.log(j["project"], "Premiere", f"Sequence '{j['name']}' ter-import ke Premiere Pro")
    return j
