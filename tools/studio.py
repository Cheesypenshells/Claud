#!/usr/bin/env python3
"""Studio: mesin produksi video & pelacak target untuk George.

Pemakaian:
  python3 tools/studio.py editorial <spec.json>   # video B&W gaya editorial (@geov10)
  python3 tools/studio.py promo <spec.json>       # video promo makanan (@cheesypenshells)
  python3 tools/studio.py progress                # laporan progres target dari data/metrics.csv

Format spec: lihat produksi/README.md. Path media relatif terhadap folder spec.
Butuh: ffmpeg & ffprobe.
"""
import csv
import datetime as dt
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = os.path.join(ROOT, "tools", "fonts")
SERIF = os.path.join(FONTS, "CormorantGaramond-Medium.woff")
SERIF_IT = os.path.join(FONTS, "CormorantGaramond-MediumItalic.woff")
SCRIPT = os.path.join(FONTS, "GreatVibes-Regular.woff")
BOLD = os.path.join(FONTS, "Inter-Bold.otf")
XBOLD = os.path.join(FONTS, "Inter-ExtraBold.otf")

W, H, FPS = 1080, 1920, 30
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("ffmpeg gagal:\n" + r.stderr[-2000:])


def color(c):
    return "0x" + c.lstrip("#") if c.startswith("#") else c


class Text:
    """Simpan teks ke file supaya tanda baca (koma, titik dua, kutip) aman di drawtext."""

    def __init__(self, tmp):
        self.tmp, self.n = tmp, 0

    def __call__(self, s):
        self.n += 1
        p = os.path.join(self.tmp, f"t{self.n}.txt")
        with open(p, "w", encoding="utf-8") as f:
            f.write(s)
        return p


def media_input(path, start, dur):
    ext = os.path.splitext(path)[1].lower()
    if ext in IMAGE_EXT:
        return ["-loop", "1", "-framerate", str(FPS), "-t", str(dur), "-i", path], True
    return ["-ss", str(start), "-t", str(dur), "-i", path], False


def dt_(font, textfile, size, colr, y, start=0.0, fade=0.4, extra=""):
    return (f"drawtext=fontfile='{font}':textfile='{textfile}':fontcolor={colr}:fontsize={size}"
            f":x=(w-tw)/2:y={y}:alpha='min(1,max(0,(t-{start})/{fade}))'{extra}")


# ---------------------------------------------------------------- editorial
def editorial(spec, base, tmp):
    T = Text(tmp)
    parts = []
    for i, sc in enumerate(spec["scenes"]):
        dur = float(sc.get("duration", 5))
        frames = int(dur * FPS)
        inp, is_img = media_input(os.path.join(base, sc["media"]), sc.get("start", 0), dur)
        ph_h = int(sc.get("photo_height", 1150))
        grade = sc.get("grade", "contrast=1.15:brightness=-0.02")
        zoom = f"zoompan=z='1+on*0.0012':d=1:s={W}x{ph_h}:fps={FPS}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        soften = "gblur=sigma=1.2," if sc.get("soften", is_img) else ""
        txt_y = 260 + ph_h + 90
        f = [
            f"[0]fps={FPS},hue=s=0,scale={W}:{ph_h}:force_original_aspect_ratio=increase,crop={W}:{ph_h},"
            f"{soften}eq={grade},{zoom},noise=alls=14:allf=t,vignette=PI/4[ph]",
            f"[1][ph]overlay=0:260:shortest=1",
        ]
        if sc.get("line1"):
            f.append(dt_(SERIF, T(sc["line1"]), sc.get("size1", 78), "0xeeeeee", txt_y, 0.6, 0.6))
        if sc.get("line2"):
            f.append(dt_(SERIF_IT, T(sc["line2"]), sc.get("size2", 86), "white", txt_y + 105, 1.6, 0.6))
        f.append(f"fade=t=in:st=0:d=0.5,fade=t=out:st={dur - 0.5}:d=0.5")
        out = os.path.join(tmp, f"e{i}.mp4")
        run(["ffmpeg", "-y", *inp, "-f", "lavfi", "-i", f"color=c=0x0a0a0a:s={W}x{H}:r={FPS}",
             "-filter_complex", f[0] + ";" + ",".join(f[1:]), "-frames:v", str(frames),
             "-c:v", "libx264", "-pix_fmt", "yuv420p", out])
        parts.append(out)
    sig = spec.get("signature")
    if sig:
        out = os.path.join(tmp, "sig.mp4")
        vf = ",".join([
            dt_(SCRIPT, T(sig["name"]), 150, "white", 820, 0.3, 0.8),
            dt_(SERIF, T(sig.get("title", "")), 40, "0xaaaaaa", 1050, 1.2, 0.6),
            "noise=alls=10:allf=t,fade=t=in:st=0:d=0.4",
        ])
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c=0x0a0a0a:s={W}x{H}:r={FPS}:d={sig.get('duration', 4)}",
             "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", out])
        parts.append(out)
    return concat(parts, tmp)


# ---------------------------------------------------------------- promo
TRANSITIONS = ["slideleft", "zoomin", "slideup", "circleopen", "slideright", "fadeblack"]


def promo(spec, base, tmp):
    T = Text(tmp)
    parts, durs = [], []
    for i, sc in enumerate(spec["scenes"]):
        dur = float(sc.get("duration", 2.8))
        inp, is_img = media_input(os.path.join(base, sc["media"]), sc.get("start", 0), dur)
        z = "1+on*0.0025" if i % 2 == 0 else "1.15-on*0.002"
        fg = (f"[b]scale={W}:-2:flags=lanczos,unsharp=5:5:0.8[fg]" if sc.get("fit", "fit") == "fit"
              else f"[b]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}[fg]")
        f = [
            f"[0]fps={FPS},split[a][b]",
            f"[a]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.15[bg]",
            fg,
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,zoompan=z='{z}':d=1:s={W}x{H}:fps={FPS}"
            f":x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
            + ("," + dt_(XBOLD, T(sc["top"]), sc.get("top_size", 96), "white", 260, 0, 0.2,
                         ":borderw=10:bordercolor=black") if sc.get("top") else "")
            + ("," + dt_(XBOLD, T(sc["bottom"]), sc.get("bottom_size", 104), color(sc.get("color", "#ffd400")),
                         1500, 0.3, 0.2, ":borderw=10:bordercolor=black") if sc.get("bottom") else ""),
        ]
        out = os.path.join(tmp, f"p{i}.mp4")
        run(["ffmpeg", "-y", *inp, "-filter_complex", ";".join(f), "-frames:v", str(int(dur * FPS)),
             "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", out])
        parts.append(out)
        durs.append(dur)
    end = spec.get("endcard")
    if end:
        bgc = color(end.get("bg", "#14306e"))
        acc = color(end.get("accent", "#ffd400"))
        d = float(end.get("duration", 2.5))
        vf = ",".join(filter(None, [
            f"drawbox=x=0:y=0:w=iw:h=ih:color={acc}:t=24",
            f"drawtext=fontfile='{XBOLD}':textfile='{T(end['headline'])}':fontcolor={acc}"
            f":fontsize='min({end.get('size', 120)},40+t*400)':x=(w-tw)/2:y=780",
            dt_(BOLD, T(end["sub"]), 56, "white", 960, 0.4, 0.3) if end.get("sub") else None,
            dt_(XBOLD, T(end["handle"]), 64, "white", 1500, 0.6, 0.3) if end.get("handle") else None,
        ]))
        out = os.path.join(tmp, "end.mp4")
        run(["ffmpeg", "-y", "-f", "lavfi", "-i", f"color=c={bgc}:s={W}x{H}:r={FPS}:d={d}",
             "-vf", vf, "-c:v", "libx264", "-pix_fmt", "yuv420p", out])
        parts.append(out)
        durs.append(d)
    if len(parts) == 1:
        return parts[0]
    inputs = sum([["-i", p] for p in parts], [])
    td, chain, label, acc_t = 0.25, [], "[0]", 0.0
    for i in range(1, len(parts)):
        acc_t += durs[i - 1] - td
        nxt = f"[x{i}]" if i < len(parts) - 1 else ""
        chain.append(f"{label}[{i}]xfade=transition={TRANSITIONS[(i - 1) % len(TRANSITIONS)]}"
                     f":duration={td}:offset={acc_t:.3f}{nxt}")
        label = f"[x{i}]"
    out = os.path.join(tmp, "promo.mp4")
    run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(chain) + ",format=yuv420p",
         "-c:v", "libx264", "-crf", "18", out])
    return out


# ---------------------------------------------------------------- shared
def concat(parts, tmp):
    lst = os.path.join(tmp, "list.txt")
    with open(lst, "w") as f:
        f.writelines(f"file '{p}'\n" for p in parts)
    out = os.path.join(tmp, "joined.mp4")
    run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c:v", "libx264", "-crf", "18",
         "-pix_fmt", "yuv420p", out])
    return out


def finish(video, spec, base, out):
    audio = spec.get("audio")
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    if audio:
        run(["ffmpeg", "-y", "-i", video, "-i", os.path.join(base, audio), "-map", "0:v", "-map", "1:a",
             "-c:v", "copy", "-c:a", "aac", "-shortest", "-movflags", "+faststart", out])
    else:
        run(["ffmpeg", "-y", "-i", video, "-c", "copy", "-movflags", "+faststart", out])
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                         capture_output=True, text=True).stdout.strip()
    print(f"✅ {out} ({float(dur):.1f} detik)")


def build(kind, spec_path):
    spec_path = os.path.abspath(spec_path)
    base = os.path.dirname(spec_path)
    with open(spec_path, encoding="utf-8") as f:
        spec = json.load(f)
    out = os.path.join(base, spec.get("output", f"{kind}.mp4"))
    with tempfile.TemporaryDirectory() as tmp:
        video = editorial(spec, base, tmp) if kind == "editorial" else promo(spec, base, tmp)
        finish(video, spec, base, out)


# ---------------------------------------------------------------- progress
def progress():
    with open(os.path.join(ROOT, "data", "targets.json"), encoding="utf-8") as f:
        targets = json.load(f)
    rows = list(csv.DictReader(open(os.path.join(ROOT, "data", "metrics.csv"), encoding="utf-8")))
    today = dt.date.today()
    lines = [f"# Laporan Progres ({today.isoformat()})", "",
             "_Dibuat otomatis oleh `python3 tools/studio.py progress` dari `data/metrics.csv`._", ""]
    for acct, cfg in targets.items():
        hist = sorted([r for r in rows if r["akun"] == acct], key=lambda r: r["tanggal"])
        if not hist:
            continue
        last = hist[-1]
        f_now = int(last["followers"])
        d_last = dt.date.fromisoformat(last["tanggal"])
        if len(hist) > 1:
            first = hist[0]
            days = (d_last - dt.date.fromisoformat(first["tanggal"])).days or 1
            pace = (f_now - int(first["followers"])) / days
        else:
            pace = int(last.get("follower_baru_30h") or 0) / 30
        views = int(last.get("tayangan_30h") or 0)
        newf = int(last.get("follower_baru_30h") or 0)
        conv = (newf / views * 1000) if views else 0
        lines += [f"## {acct}", "",
                  f"- Follower: **{f_now:,}** (data {d_last.isoformat()})".replace(",", "."),
                  f"- Laju sekarang: **{pace:.1f} follower/hari**",
                  f"- Follow per 1.000 tayangan (30 hari): **{conv:.2f}** (target ≥ 5)", "",
                  "| Target | Tanggal | Kurang | Butuh / hari | Status |", "|---|---|---|---|---|"]
        for m in cfg["milestones"]:
            due = dt.date.fromisoformat(m["tanggal"])
            gap = max(0, m["followers"] - f_now)
            left = max(1, (due - d_last).days)
            need = gap / left
            status = "✅ tercapai" if gap == 0 else ("🟢 on track" if pace >= need else
                                                     ("🟡 perlu dorongan" if pace >= need * 0.5 else "🔴 jauh tertinggal"))
            lines.append(f"| {m['followers']:,} | {due.isoformat()} | {gap:,} | {need:.1f} | {status} |".replace(",", "."))
        lines.append("")
    report = "\n".join(lines)
    os.makedirs(os.path.join(ROOT, "laporan"), exist_ok=True)
    with open(os.path.join(ROOT, "laporan", "progres-terbaru.md"), "w", encoding="utf-8") as f:
        f.write(report + "\n")
    print(report)


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "progress":
        progress()
    elif len(sys.argv) == 3 and sys.argv[1] in ("editorial", "promo"):
        build(sys.argv[1], sys.argv[2])
    else:
        sys.exit(__doc__)
