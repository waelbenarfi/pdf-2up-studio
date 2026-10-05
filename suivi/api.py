# -*- coding: utf-8 -*-
"""Routes HTTP du Suivi des lives.

Ne contient aucune regle : tout est delegue a service.py.
"""

import csv
import datetime
import io
import os
import tempfile

from flask import (Blueprint, jsonify, redirect, render_template, request,
                   send_file, url_for, Response)

from . import archive, auth, db, schema, service


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


def preparer(app=None):
    """Prepare la base et, si l'application est fournie, les sessions.

    La cle de signature vient de la base : en serverless, une cle tiree au
    demarrage changerait a chaque instance et deconnecterait tout le monde.
    """
    os.makedirs(DOSSIER_DONNEES, exist_ok=True)
    db.initialiser(CHEMIN_DB)
    archive.configurer(DOSSIER_ARCHIVES)
    if app is None:
        return
    app.secret_key = db.secret()
    app.config.setdefault("SESSION_COOKIE_HTTPONLY", True)
    app.config.setdefault("SESSION_COOKIE_SAMESITE", "Lax")
    app.config.setdefault("PERMANENT_SESSION_LIFETIME",
                          datetime.timedelta(days=30))
    # en ligne le site est en HTTPS : le cookie n'a rien a faire en clair
    if os.environ.get("VERCEL") or os.environ.get("SUIVI_HTTPS"):
        app.config.setdefault("SESSION_COOKIE_SECURE", True)
    with app.app_context():
        auth.assurer_admin()


suivi_bp.teardown_app_request(db.fermer)
suivi_bp.before_request(auth.garde)


# ------------------------------------------------------------------ outils
def _qui():
    """Le nom de la personne connectee.

    Plus rien ne vient de l'en-tete `X-Suivi-Qui` : elle etait envoyee par le
    navigateur, donc n'importe qui pouvait signer a la place d'un autre.
    """
    return auth.nom_courant()


def _corps():
    return request.get_json(silent=True) or {}


def _arg(nom, defaut=None):
    valeur = request.args.get(nom, defaut)
    return valeur if valeur not in ("", "tous", "toutes") else defaut


@suivi_bp.errorhandler(service.Refus)
def _refus(erreur):
    return jsonify({"ok": False, "erreur": str(erreur)}), 400


@suivi_bp.errorhandler(auth.Refus)
def _refus_droit(erreur):
    return jsonify({"ok": False, "erreur": str(erreur)}), 403


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
    return render_template("suivi.html", constantes=schema.constantes(),
                           moi=auth.utilisateur())


@suivi_bp.route("/connexion")
def page_connexion():
    if auth.utilisateur():
        return redirect(url_for("suivi.page"))
    combien = db.un("SELECT COUNT(*) AS n FROM personnes") or {}
    return render_template("connexion.html",
                           installation=auth.installation_a_faire(),
                           equipe_vide=not combien.get("n"),
                           admin=(auth.admin_courant() or {}).get("nom", ""))


# ------------------------------------------------------------- connexion
@suivi_bp.route("/api/suivi/etat-connexion")
def etat_connexion():
    """Qui peut se connecter, sans rien reveler de plus.

    La liste ne porte que les noms de ceux dont le mot de passe est pose :
    annoncer les comptes sans mot de passe indiquerait ou frapper.
    """
    if auth.installation_a_faire():
        return ok({"installation": True, "personnes": []})
    gens = db.tous(
        "SELECT p.id, p.nom, p.couleur FROM personnes p"
        " JOIN comptes c ON c.personne_id = p.id"
        " WHERE c.mdp != '' AND p.actif = 1 ORDER BY p.nom")
    return ok({"installation": False, "personnes": gens})


@suivi_bp.route("/api/suivi/connexion", methods=["POST"])
def connexion():
    corps = _corps()
    qui = auth.connecter(service._entier(corps.get("personne_id")),
                         corps.get("mdp", ""))
    service.journaliser("Connexion", qui["nom"], "", qui["nom"])
    return ok(qui)


@suivi_bp.route("/api/suivi/installer", methods=["POST"])
def installer():
    """Première configuration : l'administrateur pose son mot de passe.

    Ouverte seulement tant qu'aucun compte n'a de mot de passe, et refermée
    définitivement ensuite.
    """
    if not auth.installation_a_faire():
        raise auth.Refus("L'installation est déjà faite. Connectez-vous.")
    corps = _corps()
    nom = str(corps.get("nom") or "").strip()
    gens = db.tous("SELECT * FROM personnes ORDER BY id")
    if gens:
        admin = auth.admin_courant() or auth.assurer_admin()
        personne_id = admin["personne_id"]
    else:
        if not nom:
            raise service.Refus("Indiquez le nom de l'administrateur.")
        personne_id = service.creer_personne({"nom": nom}, nom)["id"]
        auth.compte_assure(personne_id, "admin")
        auth.definir_role(personne_id, "admin", nom)
    auth.definir_mdp(personne_id, corps.get("mdp", ""), "installation")
    qui = auth.connecter(personne_id, corps.get("mdp", ""))
    service.journaliser("Installation", qui["nom"],
                        "mot de passe administrateur posé", qui["nom"])
    return ok(qui)


@suivi_bp.route("/api/suivi/deconnexion", methods=["POST"])
def deconnexion():
    qui = auth.utilisateur()
    if qui:
        service.journaliser("Déconnexion", qui["nom"], "", qui["nom"])
    auth.deconnecter()
    return ok({"deconnecte": True})


@suivi_bp.route("/api/suivi/moi")
def moi():
    return ok(auth.utilisateur())


# ------------------------------------------------------------------ equipe
@suivi_bp.route("/api/suivi/personnes", methods=["GET", "POST"])
def personnes():
    if request.method == "POST":
        if not auth.est_admin():
            raise auth.Refus("Seul l'administrateur ajoute des membres.")
        cree = service.creer_personne(_corps(), _qui())
        auth.compte_assure(cree["id"])
        corps = _corps()
        if corps.get("mdp"):
            auth.definir_mdp(cree["id"], corps["mdp"], _qui())
        if corps.get("role"):
            auth.definir_role(cree["id"], corps["role"], _qui())
        return ok(cree)
    return ok(service.personnes())


@suivi_bp.route("/api/suivi/personnes/<int:ident>",
                methods=["PATCH", "PUT", "DELETE"])
def personne(ident):
    qui = auth.utilisateur()
    # chacun retouche sa propre fiche ; le reste de l'equipe, l'administrateur
    if not auth.est_admin() and (not qui or qui["id"] != ident):
        raise auth.Refus("Seul l'administrateur modifie les autres membres.")
    if request.method == "DELETE":
        if not auth.est_admin():
            raise auth.Refus("Seul l'administrateur supprime un membre.")
        if qui and qui["id"] == ident:
            raise auth.Refus("Vous ne pouvez pas supprimer votre propre "
                             "compte.")
        return ok(service.supprimer_personne(ident, _qui()))
    return ok(service.modifier_personne(ident, _corps(), _qui()))


@suivi_bp.route("/api/suivi/personnes/<int:ident>/mdp", methods=["POST",
                                                                 "DELETE"])
def mot_de_passe(ident):
    """L'administrateur pose ou retire le mot de passe d'un membre.

    Chacun peut aussi changer le sien, en donnant l'actuel.
    """
    qui = auth.utilisateur()
    soi_meme = bool(qui and qui["id"] == ident)

    if request.method == "DELETE":
        if not auth.est_admin():
            raise auth.Refus("Seul l'administrateur retire un mot de passe.")
        if soi_meme:
            raise auth.Refus("Retirer votre propre mot de passe vous "
                             "empêcherait de vous reconnecter.")
        auth.retirer_mdp(ident, _qui())
        service.journaliser("Mot de passe retiré", _nom_de(ident), "", _qui())
        return ok({"retire": True})

    corps = _corps()
    if not auth.est_admin():
        if not soi_meme:
            raise auth.Refus("Seul l'administrateur change le mot de passe "
                             "d'un autre membre.")
        # sans l'actuel, un poste laisse ouvert suffirait a verrouiller le compte
        if not auth.verifier_mdp(ident, corps.get("actuel", "")):
            raise auth.Refus("Le mot de passe actuel est incorrect.")

    auth.definir_mdp(ident, corps.get("mdp", ""), _qui())
    service.journaliser("Mot de passe défini", _nom_de(ident),
                        "par l'administrateur" if not soi_meme else "", _qui())
    # changer son propre mot de passe perime sa propre session : on la rouvre
    if soi_meme:
        auth.connecter(ident, corps.get("mdp", ""))
    return ok({"defini": True})


@suivi_bp.route("/api/suivi/personnes/<int:ident>/role", methods=["POST"])
@auth.exiger_admin
def role(ident):
    nouveau = _corps().get("role", "")
    auth.definir_role(ident, nouveau, _qui())
    service.journaliser("Rôle modifié", _nom_de(ident), nouveau, _qui())
    return ok(service.personnes())


def _nom_de(ident):
    trouve = db.un("SELECT nom FROM personnes WHERE id = ?", (ident,))
    return (trouve or {}).get("nom", "—")


# ------------------------------------------------------------ professeurs
@suivi_bp.route("/api/suivi/professeurs", methods=["GET", "POST"])
def professeurs():
    """Le repertoire : tout le monde le consulte, l'administrateur l'ecrit.

    Un technicien doit pouvoir lire le numero au moment d'appeler ; le tenir
    a jour est une autre affaire.
    """
    if request.method == "POST":
        if not auth.est_admin():
            raise auth.Refus("Seul l'administrateur ajoute un professeur.")
        return ok(service.creer_professeur(_corps(), _qui()))
    return ok(service.professeurs(_arg("actifs") == "1"))


@suivi_bp.route("/api/suivi/professeurs/importer", methods=["POST"])
@auth.exiger_admin
def importer_professeurs():
    """Reprend un repertoire entier colle d'un coup."""
    return ok(service.importer_professeurs(_corps().get("lignes"), _qui()))


@suivi_bp.route("/api/suivi/professeurs/fiabilite")
def fiabilite():
    """Ce que les rapports disent des professeurs, une fois additionnés."""
    return ok(service.fiabilite_professeurs(_arg("jours", 90)))


@suivi_bp.route("/api/suivi/soir")
def soir():
    """La soirée en cours. Un technicien ne voit que ses séances."""
    qui = auth.utilisateur()
    if not auth.est_admin():
        return ok(service.soiree(qui["id"], _arg("date")))
    demande = _arg("pour")
    return ok(service.soiree(
        None if demande in (None, "", "equipe") else service._entier(demande),
        _arg("date")))


@suivi_bp.route("/api/suivi/jour")
def jour():
    """Les etapes cochees dans la journee, et par qui.

    Meme regle que « Ce soir » : un technicien ne voit que les siennes.
    """
    qui = auth.utilisateur()
    if not auth.est_admin():
        return ok(service.detail_jour(_arg("date"), qui["id"]))
    demande = _arg("pour")
    return ok(service.detail_jour(
        _arg("date"),
        None if demande in (None, "", "equipe") else demande))


@suivi_bp.route("/api/suivi/professeurs/<int:ident>",
                methods=["PATCH", "PUT", "DELETE"])
def professeur(ident):
    if not auth.est_admin():
        raise auth.Refus("Seul l'administrateur modifie le répertoire.")
    if request.method == "DELETE":
        return ok(service.supprimer_professeur(ident, _qui()))
    return ok(service.modifier_professeur(ident, _corps(), _qui()))


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


@suivi_bp.route("/api/suivi/lives/reconcilier", methods=["POST"])
@auth.exiger_admin
def reconcilier():
    """Aligne le planning sur un calendrier revu.

    Sans `appliquer`, ne fait que decrire ce qui changerait : on montre le
    plan avant de toucher a quoi que ce soit.
    """
    corps = _corps()
    return ok(service.reconcilier_lives(
        corps.get("lignes"), corps.get("responsables"), corps.get("du"),
        bool(corps.get("appliquer")), _qui()))


@suivi_bp.route("/api/suivi/lives/voisines", methods=["GET"])
def voisines():
    """Les journees planifiees de part et d'autre d'une date vide."""
    return ok(service.journees_voisines(_arg("date") or db.aujourdhui()))


@suivi_bp.route("/api/suivi/lives/importer", methods=["POST"])
@auth.exiger_admin
def importer():
    """Reprend un lot de seances venu d'ailleurs et le repartit."""
    corps = _corps()
    return ok(service.importer_lives(corps.get("lignes"),
                                     corps.get("responsables"), _qui()))


@suivi_bp.route("/api/suivi/lives/repartir", methods=["POST"])
def repartir():
    corps = _corps()
    return ok(service.repartir(corps.get("date") or db.aujourdhui(), _qui()))


@suivi_bp.route("/api/suivi/lives/deplacer", methods=["POST"])
@auth.exiger_admin
def deplacer():
    """Reporte toute une journee sur une autre date."""
    corps = _corps()
    return ok(service.deplacer_journee(corps.get("date"), corps.get("vers"),
                                       _qui()))


@suivi_bp.route("/api/suivi/lives/<int:ident>/taches", methods=["GET", "PATCH"])
def taches(ident):
    """Les etapes d'une seance : appel du prof, fichiers, live, rapport.

    Le PATCH accepte une seule case (`cle` + `fait`) ou toute une fournee
    (`changements`), selon que l'appel vient d'un clic isole ou du bouton
    Valider de l'ecran.
    """
    if request.method == "PATCH":
        corps = _corps()
        if "changements" in corps:
            return ok(service.basculer_taches(ident, corps["changements"],
                                              _qui()))
        return ok(service.basculer_tache(ident, corps.get("cle", ""),
                                         bool(corps.get("fait")), _qui()))
    return ok(service.taches_de(ident))


@suivi_bp.route("/api/suivi/lives/<int:ident>/notes", methods=["POST"])
def commenter(ident):
    """Un mot sur une etape : « le prof n'a pas repondu, a rappeler »."""
    corps = _corps()
    return ok(service.commenter(ident, corps.get("cle", ""),
                                corps.get("texte", ""), _qui()))


@suivi_bp.route("/api/suivi/notes/<int:ident>", methods=["DELETE"])
def note(ident):
    return ok(service.supprimer_note(ident, _qui()))


@suivi_bp.route("/api/suivi/lives/<int:ident>",
                methods=["GET", "PATCH", "PUT", "DELETE"])
def live(ident):
    if request.method == "DELETE":
        if not auth.est_admin():
            raise auth.Refus("Seul l'administrateur supprime une séance.")
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
        # un rapport est le registre d'une seance : l'effacer n'est pas une
        # correction, c'est faire disparaitre une trace
        if not auth.est_admin():
            raise auth.Refus("Seul l'administrateur supprime un rapport. "
                             "Vous pouvez le modifier.")
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
    """Le tableau de bord de la personne connectée, ou celui qu'elle demande.

    Un technicien ne voit que le sien : le filtre est posé ici et non dans
    l'écran, sinon il suffirait de changer un paramètre dans l'adresse pour
    lire les chiffres d'un collègue.
    """
    qui = auth.utilisateur()
    if not auth.est_admin():
        return ok(service.tableau(qui["id"]))
    demande = _arg("pour")
    if demande in (None, "", "equipe"):
        return ok(service.tableau(None))
    return ok(service.tableau(service._entier(demande)))


@suivi_bp.route("/api/suivi/performances")
def performances():
    """Le relevé mensuel. Un technicien n'y voit que sa propre ligne.

    Le filtrage est fait ici : la note d'un collègue ne regarde que
    l'administrateur, et une prime se discute avec lui, pas entre collègues.
    """
    releve = service.performances(_arg("mois"))
    if auth.est_admin():
        return ok(releve)
    qui = auth.utilisateur()
    mienne = [l for l in releve["classement"] if l["id"] == qui["id"]]
    releve["classement"] = mienne
    releve["equipe"] = len(mienne)
    # la distinction du mois est publique : c'est une reconnaissance
    return ok(releve)


@suivi_bp.route("/api/suivi/performances/employe", methods=["POST", "DELETE"])
@auth.exiger_admin
def employe_du_mois():
    corps = _corps()
    mois = corps.get("mois") or request.args.get("mois") or db.aujourdhui()[:7]
    if request.method == "DELETE":
        return ok(service.retirer_employe(mois, _qui()))
    return ok(service.nommer_employe(mois,
                                     service._entier(corps.get("personne_id")),
                                     corps.get("motif", ""), _qui()))


@suivi_bp.route("/api/suivi/journal")
@auth.exiger_admin
def journal():
    """Réservé à l'administrateur : c'est le relevé de toute l'équipe."""
    return ok(service.journal(int(request.args.get("limite", 120))))


@suivi_bp.route("/api/suivi/etat")
def etat():
    """De quoi verifier d'un coup d'oeil sur quel moteur tourne le site.

    Utile apres un deploiement : tant que `DATABASE_URL` n'est pas posee chez
    l'hebergeur, la reponse indique `sqlite` et les donnees sont ephemeres.
    Ne renvoie aucun identifiant de connexion.
    """
    return ok({
        "moteur": db.moteur(),
        "persistant": db.POSTGRES,
        "personnes": (db.un("SELECT COUNT(*) AS n FROM personnes") or {}).get("n", 0),
        "lives": (db.un("SELECT COUNT(*) AS n FROM lives") or {}).get("n", 0),
        "rapports": (db.un("SELECT COUNT(*) AS n FROM rapports") or {}).get("n", 0),
    })


@suivi_bp.route("/api/suivi/demo", methods=["POST"])
def demo():
    """Regenere le jeu de demonstration. Desactive par defaut.

    Le bouton correspondant a ete retire de l'interface : ecraser une base de
    travail par des donnees inventees n'est jamais ce qu'on veut. Poser
    `SUIVI_DEMO=1` reactive la route.
    """
    if not db.DEMO_AUTORISEE:
        return jsonify({"ok": False, "erreur": "Le jeu de démonstration est "
                        "désactivé sur cette installation."}), 403
    db.fermer()
    db.vider_et_remplir(CHEMIN_DB)
    return ok({"recree": True})


@suivi_bp.route("/api/suivi/reinitialiser", methods=["POST"])
@auth.exiger_admin
def reinitialiser():
    """Tout remettre a zero : base vide et dossiers d'archive effaces.

    Les comptes partent avec le reste : l'application repasse par sa
    premiere configuration, ou l'administrateur repose son mot de passe.
    """
    auth.deconnecter()
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
        ("titre", "Live / classe"), ("formateur", "Professeur"),
        ("plateforme", "Plateforme"), ("responsable_nom", "Responsable"),
        ("statut", "Statut"), ("rapport_reference", "Rapport"),
        ("tachesFaites", "Étapes faites"), ("tachesTotal", "Étapes au total"),
    ],
    "professeurs": [
        ("nom", "Professeur"), ("matiere", "Matière"),
        ("telephone", "Téléphone"), ("seances", "Séances"),
        ("note", "Remarque"),
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
    elif quoi == "professeurs":
        lignes = service.professeurs()
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
