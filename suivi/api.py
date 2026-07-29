# -*- coding: utf-8 -*-
"""Routes HTTP du Suivi des lives.

Ne contient aucune regle : tout est delegue a service.py.
"""

import csv
import io
import os
import tempfile
import urllib.parse

from flask import (Blueprint, jsonify, render_template, request, send_file,
                   Response)

from . import archive, db, schema, service


def _dossier_donnees():
    """Ou ranger la base et les archives.

    En local : a cote du code, pour que les rapports restent d'une session a
    l'autre. Sur un hebergeur serverless le disque applicatif est en lecture
    seule ; seul le dossier temporaire accepte l'ecriture, au prix de donnees
    effacees a chaque demarrage a froid. `SUIVI_DONNEES` force le choix, par
    exemple vers un volume monte.
    """
    impose = os.environ.get("SUIVI_DONNEES")
    if impose:
        return impose
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return os.path.join(tempfile.gettempdir(), "donnees-suivi")
    return os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), "donnees-suivi")


DOSSIER_DONNEES = _dossier_donnees()
CHEMIN_DB = os.path.join(DOSSIER_DONNEES, "suivi.db")
DOSSIER_ARCHIVES = os.path.join(DOSSIER_DONNEES, "archives")

suivi_bp = Blueprint("suivi", __name__)


def preparer():
    os.makedirs(DOSSIER_DONNEES, exist_ok=True)
    db.initialiser(CHEMIN_DB)
    archive.configurer(DOSSIER_ARCHIVES)


suivi_bp.teardown_app_request(db.fermer)


# ------------------------------------------------------------------ outils
def _qui():
    brut = request.headers.get("X-Suivi-Qui", "")
    try:
        return urllib.parse.unquote(brut).strip()[:80]
    except Exception:
        return ""


def _corps():
    return request.get_json(silent=True) or {}


def _arg(nom, defaut=None):
    valeur = request.args.get(nom, defaut)
    return valeur if valeur not in ("", "tous", "toutes") else defaut


@suivi_bp.errorhandler(service.Refus)
def _refus(erreur):
    return jsonify({"ok": False, "erreur": str(erreur)}), 400


def ok(charge=None, **extra):
    reponse = {"ok": True}
    if charge is not None:
        reponse["donnees"] = charge
    reponse.update(extra)
    return jsonify(reponse)


# ------------------------------------------------------------------- pages
@suivi_bp.route("/operations")
@suivi_bp.route("/suivi")
def page():
    return render_template("suivi.html", constantes=schema.constantes())


# ------------------------------------------------------------------ equipe
@suivi_bp.route("/api/suivi/personnes", methods=["GET", "POST"])
def personnes():
    if request.method == "POST":
        return ok(service.creer_personne(_corps(), _qui()))
    return ok(service.personnes())


@suivi_bp.route("/api/suivi/personnes/<int:ident>",
                methods=["PATCH", "PUT", "DELETE"])
def personne(ident):
    if request.method == "DELETE":
        return ok(service.supprimer_personne(ident, _qui()))
    return ok(service.modifier_personne(ident, _corps(), _qui()))


# ------------------------------------------------------------------- lives
@suivi_bp.route("/api/suivi/lives", methods=["GET", "POST"])
def lives():
    if request.method == "POST":
        return ok(service.creer_live(_corps(), _qui()))
    return ok(service.lives(
        date=_arg("date"), du=_arg("du"), au=_arg("au"),
        responsable=_arg("responsable"), statut=_arg("statut"),
        sans_rapport=_arg("sansRapport") == "1",
        recherche=_arg("q", "")))


@suivi_bp.route("/api/suivi/lives/repartir", methods=["POST"])
def repartir():
    corps = _corps()
    return ok(service.repartir(corps.get("date") or db.aujourdhui(), _qui()))


@suivi_bp.route("/api/suivi/lives/<int:ident>",
                methods=["GET", "PATCH", "PUT", "DELETE"])
def live(ident):
    if request.method == "DELETE":
        return ok(service.supprimer_live(ident, _qui()))
    if request.method == "GET":
        trouve = service.live(ident)
        if not trouve:
            raise service.Refus("Live introuvable.")
        return ok(trouve)
    return ok(service.modifier_live(ident, _corps(), _qui()))


# ---------------------------------------------------------------- rapports
@suivi_bp.route("/api/suivi/rapports", methods=["GET", "POST"])
def rapports():
    if request.method == "POST":
        return ok(service.creer_rapport(_corps(), _qui()))
    return ok(service.rapports(
        du=_arg("du"), au=_arg("au"), etat=_arg("etat"),
        urgence=_arg("urgence"), responsable=_arg("responsable"),
        recherche=_arg("q", ""), limite=_arg("limite")))


@suivi_bp.route("/api/suivi/rapports/<int:ident>",
                methods=["GET", "PATCH", "PUT", "DELETE"])
def rapport(ident):
    if request.method == "DELETE":
        return ok(service.supprimer_rapport(ident, _qui()))
    if request.method == "GET":
        trouve = service.rapport(ident)
        if not trouve:
            raise service.Refus("Rapport introuvable.")
        return ok(trouve)
    return ok(service.modifier_rapport(ident, _corps(), _qui()))


@suivi_bp.route("/api/suivi/rapports/<int:ident>/pdf")
def rapport_pdf(ident):
    complet, octets = service.pdf_rapport(ident)
    return send_file(
        io.BytesIO(octets), mimetype="application/pdf",
        as_attachment=request.args.get("dl") == "1",
        download_name="%s.pdf" % complet["reference"])


# ---------------------------------------------------------------- fichiers
@suivi_bp.route("/api/suivi/fichiers", methods=["POST"])
def televerser():
    cible = request.form.get("cible", "rapport")
    cible_id = int(request.form.get("cibleId") or 0)
    envoyes = [f for f in request.files.getlist("file") if f and f.filename]
    if not envoyes:
        raise service.Refus("Aucun fichier reçu.")
    ajoutes = [service.ajouter_fichier(cible, cible_id, f.filename,
                                       f.read(), _qui()) for f in envoyes]
    return ok(ajoutes)


@suivi_bp.route("/api/suivi/fichiers/<int:ident>", methods=["DELETE"])
def fichier(ident):
    return ok(service.supprimer_fichier(ident, _qui()))


@suivi_bp.route("/api/suivi/fichier")
def telecharger():
    relatif = request.args.get("chemin", "")
    try:
        chemin = archive.absolu(relatif)
    except ValueError:
        raise service.Refus("Chemin refusé.")
    if not os.path.isfile(chemin):
        raise service.Refus("Fichier introuvable.")
    return send_file(chemin, as_attachment=request.args.get("dl") == "1",
                     download_name=os.path.basename(chemin))


# ----------------------------------------------------------------- tickets
@suivi_bp.route("/api/suivi/tickets", methods=["GET", "POST"])
def tickets():
    if request.method == "POST":
        return ok(service.creer_ticket(_corps(), _qui()))
    return ok(service.tickets(statut=_arg("statut"), priorite=_arg("priorite"),
                              assigne=_arg("assigne"), recherche=_arg("q", "")))


@suivi_bp.route("/api/suivi/tickets/<int:ident>",
                methods=["GET", "PATCH", "PUT", "DELETE"])
def ticket(ident):
    if request.method == "DELETE":
        return ok(service.supprimer_ticket(ident, _qui()))
    if request.method == "GET":
        trouve = service.ticket(ident)
        if not trouve:
            raise service.Refus("Ticket introuvable.")
        return ok(trouve)
    return ok(service.modifier_ticket(ident, _corps(), _qui()))


@suivi_bp.route("/api/suivi/tickets/<int:ident>/messages", methods=["POST"])
def repondre(ident):
    return ok(service.repondre(ident, _corps().get("texte"), _qui()))


@suivi_bp.route("/api/suivi/messages/<int:ident>", methods=["DELETE"])
def message(ident):
    return ok(service.supprimer_message(ident))


# ----------------------------------------------------------------- archive
@suivi_bp.route("/api/suivi/archive")
def arbre():
    return ok({"arbre": archive.arbre(),
               "stats": archive.statistiques()})


@suivi_bp.route("/api/suivi/archive/dossier")
def dossier():
    ident = request.args.get("rapportId")
    if ident:
        complet = service.rapport(int(ident))
        if not complet:
            raise service.Refus("Rapport introuvable.")
        relatif, chemin = archive.assurer_rapport(complet)
        return ok({"chemin": relatif, "disque": chemin,
                   "fichiers": archive.fichiers_de(relatif)})
    relatif = request.args.get("chemin", "")
    try:
        chemin = archive.creer(relatif)
    except ValueError:
        raise service.Refus("Chemin refusé.")
    return ok({"chemin": relatif, "disque": chemin,
               "fichiers": archive.fichiers_de(relatif)})


# ------------------------------------------------------------------ divers
@suivi_bp.route("/api/suivi/tableau")
def tableau():
    return ok(service.tableau())


@suivi_bp.route("/api/suivi/journal")
def journal():
    return ok(service.journal(int(request.args.get("limite", 120))))


@suivi_bp.route("/api/suivi/demo", methods=["POST"])
def demo():
    db.fermer()
    db.vider_et_remplir(CHEMIN_DB)
    return ok({"recree": True})


@suivi_bp.route("/api/suivi/reinitialiser", methods=["POST"])
def reinitialiser():
    """Tout remettre a zero : base vide et dossiers d'archive effaces."""
    db.fermer()
    db.vider(CHEMIN_DB)
    archive.tout_vider()
    return ok({"vide": True})


COLONNES = {
    "rapports": [
        ("reference", "Référence"), ("date", "Date"), ("heure", "Heure"),
        ("nom_live", "Live / classe"), ("responsable_nom", "Responsable"),
        ("etat", "État"), ("urgence", "Urgence"),
        ("description", "Description"), ("eleves", "Élèves concernés"),
        ("actions", "Actions prises"), ("commentaires", "Commentaires"),
        ("envoye_le", "Envoyé le"), ("retard_min", "Retard (min)"),
    ],
    "lives": [
        ("date", "Date"), ("heure", "Heure"), ("heure_fin", "Fin"),
        ("titre", "Live / classe"), ("formateur", "Formateur"),
        ("plateforme", "Plateforme"), ("responsable_nom", "Responsable"),
        ("statut", "Statut"), ("rapport_reference", "Rapport"),
    ],
    "tickets": [
        ("reference", "Référence"), ("sujet", "Sujet"),
        ("categorie", "Catégorie"), ("priorite", "Priorité"),
        ("statut", "Statut"), ("demandeur_nom", "Demandeur"),
        ("cree_le", "Ouvert le"), ("resolu_le", "Résolu le"),
        ("dureeMin", "Durée (min)"),
    ],
}


@suivi_bp.route("/api/suivi/export/<quoi>.csv")
def export(quoi):
    if quoi not in COLONNES:
        raise service.Refus("Export inconnu.")
    if quoi == "rapports":
        lignes = service.rapports()
    elif quoi == "lives":
        lignes = service.lives()
    else:
        lignes = service.tickets()

    tampon = io.StringIO()
    graveur = csv.writer(tampon, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    graveur.writerow([titre for _, titre in COLONNES[quoi]])
    for ligne in lignes:
        graveur.writerow([str(ligne.get(cle, "") if ligne.get(cle) is not None
                              else "") for cle, _ in COLONNES[quoi]])
    return Response(
        "﻿" + tampon.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition":
                 'attachment; filename="%s.csv"' % quoi})
