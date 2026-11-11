"""Tiny SQLite document store: projects, assets (content bank), style profiles, agent log."""
import json
import sqlite3
import threading
import time
import uuid

from .config import DB_PATH

_lock = threading.Lock()


def _conn():
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init():
    with _lock, _conn() as c:
        c.executescript(
            """
            CREATE TABLE IF NOT EXISTS docs (
              id TEXT PRIMARY KEY, kind TEXT NOT NULL, created REAL, updated REAL, body TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS docs_kind ON docs(kind);
            CREATE TABLE IF NOT EXISTS log (
              id INTEGER PRIMARY KEY AUTOINCREMENT, project TEXT, agent TEXT, ts REAL, msg TEXT);
            """
        )


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def put(kind: str, body: dict, id: str | None = None) -> dict:
    id = id or body.get("id") or new_id(kind[:3])
    body = {**body, "id": id, "kind": kind}
    now = time.time()
    with _lock, _conn() as c:
        row = c.execute("SELECT created FROM docs WHERE id=?", (id,)).fetchone()
        created = row["created"] if row else now
        body.setdefault("created", created)
        c.execute(
            "INSERT OR REPLACE INTO docs(id,kind,created,updated,body) VALUES(?,?,?,?,?)",
            (id, kind, created, now, json.dumps(body, ensure_ascii=False)),
        )
    return body


def get(id: str) -> dict | None:
    with _lock, _conn() as c:
        row = c.execute("SELECT body FROM docs WHERE id=?", (id,)).fetchone()
    return json.loads(row["body"]) if row else None


def update(id: str, **fields) -> dict:
    doc = get(id)
    if doc is None:
        raise KeyError(id)
    doc.update(fields)
    return put(doc["kind"], doc, id)


def list_kind(kind: str) -> list[dict]:
    with _lock, _conn() as c:
        rows = c.execute("SELECT body FROM docs WHERE kind=? ORDER BY created DESC", (kind,)).fetchall()
    return [json.loads(r["body"]) for r in rows]


def delete(id: str):
    with _lock, _conn() as c:
        c.execute("DELETE FROM docs WHERE id=?", (id,))


def log(project: str | None, agent: str, msg: str):
    with _lock, _conn() as c:
        c.execute("INSERT INTO log(project,agent,ts,msg) VALUES(?,?,?,?)", (project, agent, time.time(), msg))


def logs(project: str | None = None, after: int = 0, limit: int = 300) -> list[dict]:
    q = "SELECT * FROM log WHERE id>?"
    args: list = [after]
    if project:
        q += " AND project=?"
        args.append(project)
    q += " ORDER BY id DESC LIMIT ?"
    args.append(limit)
    with _lock, _conn() as c:
        rows = c.execute(q, args).fetchall()
    return [dict(r) for r in reversed(rows)]
