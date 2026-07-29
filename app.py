#!/usr/bin/env python3
"""
2-up Studio  -  interface web du convertisseur PDF paysage -> portrait 2-up.

Lancement :
    python app.py
puis ouvrir  http://localhost:1200
"""

import json
import os
import shutil
import tempfile
import time
import uuid

import fitz
from flask import Flask, jsonify, request, send_file, render_template

import core
import suivi

PORT = 1200
MAX_UPLOAD_MB = 300
MAX_SOURCE_FILES = 40      # nombre de PDF assemblables en une seule fois
JOB_TTL_SECONDS = 6 * 3600  # les fichiers de travail sont purges apres 6 h

# Organisation d'un dossier de travail :
#   parts/<uid>_<nom>.pdf   les PDF envoyes par l'utilisateur, tels quels
#   parts.json              leur ordre d'assemblage
#   src_<nom>.pdf           le document fusionne, seul fichier analyse/impose
#   out_<nom>.pdf           le resultat telechargeable
PARTS_DIR = "parts"
PARTS_META = "parts.json"

WORK_DIR = os.path.join(tempfile.gettempdir(), "pdf-2up-studio")
os.makedirs(WORK_DIR, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

# Deuxieme fonction de l'application : le Suivi des lives.
# Module autonome (base, archives et routes qui lui sont propres) ; il ne
# partage avec l'outil 2-up que le serveur Flask et la barre de navigation.
suivi.preparer()
app.register_blueprint(suivi.suivi_bp)


# ----------------------------------------------------------------------
#  Utilitaires
# ----------------------------------------------------------------------
def purge_old_files():
    """Supprime les dossiers de travail trop anciens."""
    now = time.time()
    for name in os.listdir(WORK_DIR):
        path = os.path.join(WORK_DIR, name)
        try:
            if now - os.path.getmtime(path) > JOB_TTL_SECONDS:
                shutil.rmtree(path, ignore_errors=True)
        except OSError:
            pass


def job_dir(token, create=False):
    """Dossier de travail associe a un identifiant (protege contre ../)."""
    token = os.path.basename(str(token))
    if not token or len(token) > 64:
        return None
    path = os.path.join(WORK_DIR, token)
    if create:
        os.makedirs(path, exist_ok=True)
        return path
    return path if os.path.isdir(path) else None


def stored_file(token):
    """Chemin du document de travail (fusionne) d'un dossier."""
    path = job_dir(token)
    if not path:
        return None
    for name in sorted(os.listdir(path)):
        if name.startswith("src_"):
            return os.path.join(path, name)
    return None


def safe_name(name):
    keep = "".join(c for c in (name or "") if c.isalnum() or c in " ._-()[]")
    return keep.strip() or "document.pdf"


def error(message, code=400):
    return jsonify({"ok": False, "error": message}), code


# ----------------------------------------------------------------------
#  Liste des PDF source d'un dossier de travail
# ----------------------------------------------------------------------
def read_parts(folder):
    """Liste ordonnee [{"file": nom sur disque, "name": nom affiche}, ...]."""
    try:
        with open(os.path.join(folder, PARTS_META), encoding="utf-8") as fh:
            parts = json.load(fh)
    except (OSError, ValueError):
        return []
    return [p for p in parts if isinstance(p, dict) and p.get("file")]


def write_parts(folder, parts):
    with open(os.path.join(folder, PARTS_META), "w", encoding="utf-8") as fh:
        json.dump(parts, fh, ensure_ascii=False)


def merged_name(parts):
    """Nom du document de travail : celui du PDF unique, sinon un nom groupe."""
    first = os.path.splitext(parts[0]["name"])[0]
    if len(parts) == 1:
        return first + ".pdf"
    return "%s et %d autres.pdf" % (first, len(parts) - 1)


def rebuild_source(folder, token, dark_delta=40):
    """(Re)fusionne les PDF du dossier puis renvoie le payload d'analyse.

    Appele apres chaque ajout, suppression ou deplacement dans la liste :
    l'utilisateur n'a jamais besoin de renvoyer ses fichiers."""
    parts = read_parts(folder)
    if not parts:
        raise ValueError("Aucun document dans la liste.")

    paths = [os.path.join(folder, PARTS_DIR, p["file"]) for p in parts]
    missing = [p["name"] for p, path in zip(parts, paths) if not os.path.isfile(path)]
    if missing:
        raise ValueError("Fichier de travail perdu : %s. Rechargez-le."
                         % ", ".join(missing))

    out_path = os.path.join(folder, "src_" + merged_name(parts))
    if len(parts) == 1:
        # un seul PDF : on le copie tel quel, aucune recompression inutile
        if os.path.abspath(paths[0]) != os.path.abspath(out_path):
            shutil.copyfile(paths[0], out_path)
        merged = fitz.open(out_path)
        segments = [{"pages": merged.page_count, "start": 0}]
        if merged.page_count == 0:
            merged.close()
            raise ValueError("Ce PDF ne contient aucune page.")
    else:
        merged, segments = core.merge_pdfs(paths)

    # les anciens documents de travail (nom different) sont retires
    for name in os.listdir(folder):
        if name.startswith("src_") and os.path.join(folder, name) != out_path:
            try:
                os.remove(os.path.join(folder, name))
            except OSError:
                pass

    try:
        if len(parts) > 1:
            merged.save(out_path, deflate=True, garbage=3)
        first = merged[0].rect
        return {
            "ok": True,
            "id": token,
            "name": merged_name(parts),
            "pages": merged.page_count,
            "ratios": core.ink_ratios(merged, dark_delta),
            "thumbs": core.thumbnails(merged),
            "width": round(first.width, 1),
            "height": round(first.height, 1),
            "landscape": first.width >= first.height,
            "sizeMb": round(os.path.getsize(out_path) / 1048576, 2),
            "sources": [
                {"file": p["file"], "name": p["name"],
                 "pages": s["pages"], "start": s["start"]}
                for p, s in zip(parts, segments)
            ],
        }
    finally:
        merged.close()


# ----------------------------------------------------------------------
#  Routes
# ----------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html", port=PORT, max_mb=MAX_UPLOAD_MB)


@app.route("/api/upload", methods=["POST"])
def upload():
    """Recoit des fichiers.

    kind=source : un ou plusieurs PDF, assembles bout a bout puis analyses.
                  `appendTo` ajoute les fichiers a une liste deja chargee.
    kind=first  : un seul PDF ou une image, pour la nouvelle premiere page."""
    purge_old_files()
    kind = request.form.get("kind", "source")
    files = [f for f in request.files.getlist("file") if f and f.filename]
    if not files:
        return error("Aucun fichier recu.")
    dark_delta = int(request.form.get("darkDelta", 40))

    if kind != "source":
        return upload_replacement(files[0])

    for upload_file in files:
        ext = os.path.splitext(safe_name(upload_file.filename))[1].lower()
        if ext != ".pdf":
            return error("Format refuse : %s (les documents source doivent etre "
                         "des PDF)." % (ext or "sans extension"))

    # ajout a une liste existante, ou nouveau dossier de travail
    token = request.form.get("appendTo") or ""
    folder = job_dir(token) if token else None
    fresh = folder is None
    if fresh:
        token = uuid.uuid4().hex
        folder = job_dir(token, create=True)

    parts = read_parts(folder)
    if len(parts) + len(files) > MAX_SOURCE_FILES:
        return error("Trop de documents : %d au maximum." % MAX_SOURCE_FILES)

    os.makedirs(os.path.join(folder, PARTS_DIR), exist_ok=True)
    added = []
    for upload_file in files:
        name = safe_name(upload_file.filename)
        stored = "%s_%s" % (uuid.uuid4().hex[:8], name)
        upload_file.save(os.path.join(folder, PARTS_DIR, stored))
        added.append({"file": stored, "name": name})
    write_parts(folder, parts + added)

    try:
        return jsonify(rebuild_source(folder, token, dark_delta))
    except Exception as exc:  # fichier corrompu, protege par mot de passe, ...
        if fresh:
            shutil.rmtree(folder, ignore_errors=True)
        else:  # on remet la liste dans son etat precedent
            for part in added:
                try:
                    os.remove(os.path.join(folder, PARTS_DIR, part["file"]))
                except OSError:
                    pass
            write_parts(folder, parts)
        return error("Lecture impossible : %s" % exc)


def upload_replacement(upload_file):
    """Enregistre la nouvelle premiere page et renvoie son apercu."""
    name = safe_name(upload_file.filename)
    ext = os.path.splitext(name)[1].lower()
    allowed = (".pdf",) + core.IMAGE_EXTS
    if ext not in allowed:
        return error("Format refuse : %s (attendu : %s)" % (ext, ", ".join(allowed)))

    token = uuid.uuid4().hex
    folder = job_dir(token, create=True)
    path = os.path.join(folder, "src_" + name)
    upload_file.save(path)
    try:
        preview = core.load_replacement(path)
        payload = {
            "ok": True,
            "id": token,
            "name": name,
            "thumbs": core.thumbnails(preview, width=220),
            "sizeMb": round(os.path.getsize(path) / 1048576, 2),
        }
        preview.close()
        return jsonify(payload)
    except Exception as exc:
        shutil.rmtree(folder, ignore_errors=True)
        return error("Lecture impossible : %s" % exc)


@app.route("/api/arrange", methods=["POST"])
def arrange():
    """Reordonne ou retire des PDF de la liste, puis refusionne et reanalyse.
    `order` = les identifiants `file` a garder, dans l'ordre voulu."""
    data = request.get_json(silent=True) or {}
    token = data.get("sourceId")
    folder = job_dir(token)
    if not folder:
        return error("Fichier source introuvable, merci de le recharger.", 404)

    parts = read_parts(folder)
    by_file = {p["file"]: p for p in parts}
    wanted = [by_file[f] for f in (data.get("order") or []) if f in by_file]
    if not wanted:
        return error("Gardez au moins un document dans la liste.")

    kept = {p["file"] for p in wanted}
    for part in parts:
        if part["file"] not in kept:
            try:
                os.remove(os.path.join(folder, PARTS_DIR, part["file"]))
            except OSError:
                pass
    write_parts(folder, wanted)

    try:
        return jsonify(rebuild_source(folder, token, int(data.get("darkDelta", 40))))
    except Exception as exc:
        return error("Assemblage impossible : %s" % exc)


@app.route("/api/analyze", methods=["POST"])
def analyze():
    """Recalcule les taux d'encre avec une autre sensibilite de contraste."""
    data = request.get_json(silent=True) or {}
    path = stored_file(data.get("sourceId"))
    if not path:
        return error("Fichier source introuvable, merci de le recharger.", 404)
    try:
        doc = fitz.open(path)
        ratios = core.ink_ratios(doc, int(data.get("darkDelta", 40)))
        doc.close()
        return jsonify({"ok": True, "ratios": ratios})
    except Exception as exc:
        return error("Analyse impossible : %s" % exc)


@app.route("/api/process", methods=["POST"])
def process():
    """Construit le PDF final et renvoie ses statistiques + un apercu."""
    data = request.get_json(silent=True) or {}
    source_path = stored_file(data.get("sourceId"))
    if not source_path:
        return error("Fichier source introuvable, merci de le recharger.", 404)

    first_path = stored_file(data.get("firstId")) if data.get("firstId") else None
    if data.get("firstId") and not first_path:
        return error("Page de remplacement introuvable, merci de la recharger.", 404)

    try:
        out, stats = core.build_document(
            source_path,
            first_path,
            data.get("removed") or [],
            page_size=data.get("pageSize", "a4"),
            custom_size=data.get("customSize"),
            outer_margin=float(data.get("outerMargin", 6)),
            middle_gap=float(data.get("middleGap", 6)),
            cover_margin=float(data.get("coverMargin", 0)),
            mode=data.get("mode", "cover"),
        )
    except Exception as exc:
        return error(str(exc))

    token = uuid.uuid4().hex
    folder = job_dir(token, create=True)
    base = os.path.splitext(os.path.basename(source_path))[0]
    if base.startswith("src_"):
        base = base[4:]
    out_name = "%s_2up.pdf" % base
    out_path = os.path.join(folder, "out_" + out_name)
    out.save(out_path, deflate=True, garbage=4)

    preview_count = min(out.page_count, 12)
    stats.update({
        "ok": True,
        "jobId": token,
        "fileName": out_name,
        "sizeMb": round(os.path.getsize(out_path) / 1048576, 2),
        "thumbs": core.thumbnails(out, width=200, indexes=range(preview_count)),
        "previewCount": preview_count,
    })
    out.close()
    return jsonify(stats)


@app.route("/api/download/<job_id>")
def download(job_id):
    folder = job_dir(job_id)
    if folder:
        for name in os.listdir(folder):
            if name.startswith("out_"):
                return send_file(os.path.join(folder, name), as_attachment=True,
                                 download_name=name[4:], mimetype="application/pdf")
    return error("Resultat expire ou introuvable. Relancez la conversion.", 404)


@app.route("/api/discard", methods=["POST"])
def discard():
    """Supprime un fichier de travail (bouton 'retirer' de l'interface)."""
    data = request.get_json(silent=True) or {}
    folder = job_dir(data.get("id"))
    if folder:
        shutil.rmtree(folder, ignore_errors=True)
    return jsonify({"ok": True})


@app.errorhandler(413)
def too_large(_):
    return error("Fichier trop volumineux (maximum %d Mo)." % MAX_UPLOAD_MB, 413)


if __name__ == "__main__":
    purge_old_files()
    print("=" * 62)
    print("  2-up Studio        ->  http://localhost:%d" % PORT)
    print("  Suivi des lives    ->  http://localhost:%d/operations" % PORT)
    print("  Dossier de travail : %s" % WORK_DIR)
    print("  Donnees du suivi   : %s" % suivi.DOSSIER_DONNEES)
    print("  Ctrl+C pour arreter")
    print("=" * 62)
    app.run(host="127.0.0.1", port=PORT, debug=False)
