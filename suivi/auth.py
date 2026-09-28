# -*- coding: utf-8 -*-
"""Qui est connecte, et ce qu'il a le droit de faire.

Jusqu'ici l'application croyait sur parole l'en-tete `X-Suivi-Qui` envoyee
par le navigateur : n'importe qui pouvait se declarer n'importe qui, et le
site est public. L'identite vient desormais de la session signee par le
serveur, et l'en-tete n'est plus lue.

Un compte est une ligne a part (`comptes`) plutot qu'une colonne ajoutee a
`personnes` : le rattrapage de schema sait creer une table sur une base deja
installee, pas ajouter une colonne des deux cotes (SQLite ne connait pas
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`).
"""

import functools
import os

from flask import jsonify, redirect, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

from . import db, schema

# pbkdf2 plutot que le scrypt par defaut : disponible partout, sans exigence
# de memoire, ce qui compte sur un hebergement serverless contraint.
METHODE = "pbkdf2:sha256:600000"

# Depannage : pose cette variable et l'administrateur reprend ce mot de passe
# au demarrage suivant. De quoi rentrer si le mot de passe est perdu.
MDP_SECOURS = (os.environ.get("SUIVI_ADMIN_MDP") or "").strip()


class Refus(Exception):
    """Message rendu tel quel a l'utilisateur."""


# ------------------------------------------------------------------ mots
def hacher(mdp):
    return generate_password_hash(mdp, method=METHODE)


def _valider_mdp(mdp):
    mdp = str(mdp or "")
    if len(mdp) < schema.MDP_MIN:
        raise Refus("Le mot de passe doit faire au moins %d caractères."
                    % schema.MDP_MIN)
    return mdp


# --------------------------------------------------------------- comptes
def compte_de(personne_id):
    return db.un("SELECT * FROM comptes WHERE personne_id = ?", (personne_id,))


def _creer_compte(personne_id, role="technicien"):
    db.inserer("comptes", {"personne_id": personne_id, "role": role,
                           "mdp": "", "mdp_le": "", "maj_le": "",
                           "maj_par": "", "derniere": ""})
    return compte_de(personne_id)


def compte_assure(personne_id, role="technicien"):
    """Toute personne a un compte, meme sans mot de passe pose."""
    return compte_de(personne_id) or _creer_compte(personne_id, role)


def assurer_admin():
    """Garantit qu'au moins une personne est administratrice.

    Au premier demarrage apres la mise a jour, l'equipe existe deja sans
    aucun compte : sans cela, personne ne pourrait jamais se connecter.
    """
    gens = db.tous("SELECT * FROM personnes ORDER BY id")
    if not gens:
        return None
    for personne in gens:
        compte_assure(personne["id"])

    admin = db.un("SELECT * FROM comptes WHERE role = 'admin' LIMIT 1")
    if not admin:
        choisi = next((p for p in gens
                       if p["nom"].strip().lower()
                       == schema.ADMIN_PAR_DEFAUT.lower()), gens[0])
        db.executer("UPDATE comptes SET role = 'admin' WHERE personne_id = ?",
                    (choisi["id"],))
        admin = compte_de(choisi["id"])

    # filet de securite : SUIVI_ADMIN_MDP repose le mot de passe a chaque
    # demarrage tant qu'elle est definie
    if MDP_SECOURS and len(MDP_SECOURS) >= schema.MDP_MIN:
        quand = db.maintenant()
        db.executer("UPDATE comptes SET mdp = ?, mdp_le = ?, maj_le = ?,"
                    " maj_par = ? WHERE id = ?",
                    (hacher(MDP_SECOURS), quand, quand,
                     "SUIVI_ADMIN_MDP", admin["id"]))
        admin = db.un("SELECT * FROM comptes WHERE id = ?", (admin["id"],))
    return admin


def admin_courant():
    ligne = db.un(
        "SELECT c.*, p.nom FROM comptes c JOIN personnes p ON p.id = c.personne_id"
        " WHERE c.role = 'admin' ORDER BY c.id LIMIT 1")
    return ligne


def installation_a_faire():
    """Vrai tant qu'aucun compte ne peut se connecter.

    C'est la seule fenetre ou la page de connexion propose de poser le mot
    de passe de l'administrateur sans en exiger un : une fois pose, elle se
    referme definitivement.
    """
    ligne = db.un("SELECT COUNT(*) AS n FROM comptes WHERE mdp != ''")
    return not (ligne or {}).get("n")


def definir_mdp(personne_id, mdp, par=""):
    personne = db.un("SELECT * FROM personnes WHERE id = ?", (personne_id,))
    if not personne:
        raise Refus("Membre introuvable.")
    compte = compte_assure(personne_id)
    quand = db.maintenant()
    db.executer("UPDATE comptes SET mdp = ?, mdp_le = ?, maj_le = ?,"
                " maj_par = ? WHERE id = ?",
                (hacher(_valider_mdp(mdp)), quand, quand, par, compte["id"]))
    return compte_de(personne_id)


def retirer_mdp(personne_id, par=""):
    compte = compte_assure(personne_id)
    quand = db.maintenant()
    db.executer("UPDATE comptes SET mdp = '', mdp_le = ?, maj_le = ?,"
                " maj_par = ? WHERE id = ?", (quand, quand, par, compte["id"]))
    return compte_de(personne_id)


def definir_role(personne_id, role, par=""):
    if role not in schema.CLES_ROLES:
        raise Refus("Rôle inconnu : %s." % role)
    compte = compte_assure(personne_id)
    if compte["role"] == "admin" and role != "admin":
        restants = db.un("SELECT COUNT(*) AS n FROM comptes"
                         " WHERE role = 'admin' AND id != ?", (compte["id"],))
        if not (restants or {}).get("n"):
            raise Refus("Il doit rester au moins un administrateur.")
    db.executer("UPDATE comptes SET role = ?, maj_le = ?, maj_par = ?"
                " WHERE id = ?", (role, db.maintenant(), par, compte["id"]))
    return compte_de(personne_id)


# ------------------------------------------------------------- connexion
def verifier_mdp(personne_id, mdp):
    """Le mot de passe est-il le bon ? Sans ouvrir de session ni rien ecrire."""
    compte = compte_de(personne_id)
    return bool(compte and compte["mdp"]
                and check_password_hash(compte["mdp"], str(mdp or "")))


def connecter(personne_id, mdp):
    personne = db.un("SELECT * FROM personnes WHERE id = ?", (personne_id,))
    if not personne:
        raise Refus("Identifiants incorrects.")
    compte = compte_de(personne_id)
    # meme message dans tous les cas : distinguer « pas de compte » de
    # « mauvais mot de passe » renseignerait qui existe.
    if not compte or not compte["mdp"] or not check_password_hash(
            compte["mdp"], str(mdp or "")):
        raise Refus("Identifiants incorrects.")
    if not personne["actif"]:
        raise Refus("Ce compte est désactivé.")

    db.executer("UPDATE comptes SET derniere = ? WHERE id = ?",
                (db.maintenant(), compte["id"]))
    _ouvrir_session(personne, compte)
    return utilisateur()


def _ouvrir_session(personne, compte):
    session.clear()
    session["pid"] = personne["id"]
    # la date du dernier changement de mot de passe est embarquee : changer
    # le mot de passe invalide les sessions ouvertes ailleurs
    session["mdp_le"] = compte["mdp_le"]
    session.permanent = True


def deconnecter():
    session.clear()


def utilisateur():
    """La personne connectee, relue en base a chaque requete.

    Relire plutot que faire confiance au cookie : un role retire ou un
    compte desactive prend effet tout de suite, sans attendre une
    reconnexion.
    """
    pid = session.get("pid")
    if not pid:
        return None
    ligne = db.un(
        "SELECT p.id, p.nom, p.couleur, p.actif, c.role, c.mdp_le, c.mdp"
        " FROM personnes p JOIN comptes c ON c.personne_id = p.id"
        " WHERE p.id = ?", (pid,))
    if not ligne or not ligne["actif"] or not ligne["mdp"]:
        return None
    if session.get("mdp_le") != ligne["mdp_le"]:
        return None          # mot de passe change depuis : session perimee
    return {"id": ligne["id"], "nom": ligne["nom"],
            "couleur": ligne["couleur"], "role": ligne["role"],
            "admin": ligne["role"] == "admin"}


def nom_courant():
    qui = utilisateur()
    return qui["nom"] if qui else ""


def est_admin():
    qui = utilisateur()
    return bool(qui and qui["admin"])


def exiger_admin(fonction):
    """Reserve une route a l'administrateur."""
    @functools.wraps(fonction)
    def enveloppe(*args, **kwargs):
        if not est_admin():
            raise Refus("Cette action est réservée à l'administrateur.")
        return fonction(*args, **kwargs)
    return enveloppe


# ------------------------------------------------- garde de toutes les routes
# Ce qui reste accessible sans etre connecte : la page et l'API de connexion,
# et les fichiers statiques servis par Flask.
LIBRES = {"suivi.page_connexion", "suivi.connexion", "suivi.etat_connexion",
          "suivi.installer"}


def garde():
    """Branchee en `before_request` : rien ne passe sans session."""
    if request.endpoint in LIBRES or request.endpoint == "static":
        return None
    if utilisateur():
        return None
    if request.path.startswith("/api/"):
        return jsonify({"ok": False, "erreur": "Session expirée. "
                        "Reconnectez-vous.", "connexion": True}), 401
    return redirect(url_for("suivi.page_connexion", suite=request.path))
