# -*- coding: utf-8 -*-
"""Regles du Suivi des lives.

Toutes les ecritures passent par ici : l'API ne fait que traduire le HTTP.
"""

import datetime
import os

from . import archive, db, schema


class Refus(Exception):
    """Donnee incorrecte : renvoyee telle quelle a l'utilisateur."""


# ------------------------------------------------------------------ outils
def _texte(valeurs, cle, defaut="", obligatoire=False, etiquette=None):
    valeur = str(valeurs.get(cle, defaut) or "").strip()
    if obligatoire and not valeur:
        raise Refus("%s : ce champ est obligatoire." % (etiquette or cle))
    return valeur


def _choix(valeurs, cle, liste, defaut):
    valeur = str(valeurs.get(cle) or defaut)
    permis = [item["cle"] for item in liste]
    return valeur if valeur in permis else defaut


def _entier(valeur):
    try:
        return int(valeur)
    except (TypeError, ValueError):
        return None


def _date_ou_base(valeurs, base, cle="date"):
    """La date vient du formulaire ; sur une modification elle peut manquer."""
    if cle in valeurs:
        return _date(valeurs, cle)
    if base and base.get(cle):
        return base[cle]
    raise Refus("La date est obligatoire.")


def _date(valeurs, cle="date", obligatoire=True):
    valeur = _texte(valeurs, cle)
    if not valeur:
        if obligatoire:
            raise Refus("La date est obligatoire.")
        return ""
    try:
        datetime.date.fromisoformat(valeur[:10])
    except ValueError:
        raise Refus("Date invalide : %s (format attendu AAAA-MM-JJ)." % valeur)
    return valeur[:10]


def _heure(valeurs, cle, obligatoire=False):
    valeur = _texte(valeurs, cle)
    if not valeur:
        if obligatoire:
            raise Refus("L'heure est obligatoire.")
        return ""
    if len(valeur) < 4 or ":" not in valeur:
        raise Refus("Heure invalide : %s (format attendu HH:MM)." % valeur)
    return valeur[:5]


def journaliser(action, cible="", detail="", qui=""):
    db.inserer("journal", {"quand": db.maintenant(), "qui": qui or "—",
                           "action": action, "cible": cible, "detail": detail})


def _horodate(date_iso, heure):
    if not date_iso or not heure:
        return None
    try:
        return datetime.datetime.fromisoformat("%sT%s:00" % (date_iso[:10],
                                                             heure[:5]))
    except ValueError:
        return None


# ================================================================ personnes
def personnes(actifs_seulement=False):
    sql = "SELECT * FROM personnes"
    if actifs_seulement:
        sql += " WHERE actif = 1"
    return db.tous(sql + " ORDER BY actif DESC, nom")


def creer_personne(valeurs, par=""):
    nom = _texte(valeurs, "nom", obligatoire=True, etiquette="Nom")
    ident = db.inserer("personnes", {
        "nom": nom,
        "fonction": schema.FONCTION,
        "email": _texte(valeurs, "email"),
        "telephone": _texte(valeurs, "telephone"),
        "couleur": _texte(valeurs, "couleur", schema.COULEURS[0]),
        "actif": 1 if valeurs.get("actif", True) else 0,
        "cree_le": db.maintenant(),
    })
    journaliser("Ajout d'un membre", nom, "", par)
    return db.un("SELECT * FROM personnes WHERE id = ?", (ident,))


def modifier_personne(ident, valeurs, par=""):
    personne = db.un("SELECT * FROM personnes WHERE id = ?", (ident,))
    if not personne:
        raise Refus("Membre introuvable.")
    champs = {}
    for cle, etiquette in (("nom", "Nom"), ("email", None),
                           ("telephone", None), ("couleur", None)):
        if cle in valeurs:
            champs[cle] = _texte(valeurs, cle, personne[cle],
                                 obligatoire=(cle == "nom"),
                                 etiquette=etiquette)
    if "actif" in valeurs:
        champs["actif"] = 1 if valeurs["actif"] else 0
    db.modifier("personnes", ident, champs)
    journaliser("Modification d'un membre", champs.get("nom", personne["nom"]),
                "", par)
    return db.un("SELECT * FROM personnes WHERE id = ?", (ident,))


def supprimer_personne(ident, par=""):
    personne = db.un("SELECT * FROM personnes WHERE id = ?", (ident,))
    if not personne:
        raise Refus("Membre introuvable.")
    db.supprimer("personnes", ident)
    journaliser("Suppression d'un membre", personne["nom"], "", par)
    return {"supprime": True}


# ==================================================================== lives
SELECT_LIVE = """
SELECT l.*, p.nom AS responsable_nom, p.couleur AS responsable_couleur,
       r.id AS rapport_id, r.reference AS rapport_reference, r.etat AS rapport_etat
FROM lives l
LEFT JOIN personnes p ON p.id = l.responsable_id
LEFT JOIN rapports  r ON r.live_id = l.id
"""


def _enrichir_live(live):
    fin = _horodate(live["date"], live["heure_fin"] or live["heure"])
    maintenant = datetime.datetime.now()
    passe = bool(fin and fin < maintenant)
    live["passe"] = passe
    live["aRapport"] = live.get("rapport_id") is not None
    live["sansRapport"] = bool(
        passe and not live["aRapport"] and live["statut"] != "annule")
    return live


def lives(date=None, du=None, au=None, responsable=None, statut=None,
          sans_rapport=False, recherche=""):
    conditions, params = [], []
    if date:
        conditions.append("l.date = ?")
        params.append(date)
    if du:
        conditions.append("l.date >= ?")
        params.append(du)
    if au:
        conditions.append("l.date <= ?")
        params.append(au)
    if responsable == "aucun":
        conditions.append("l.responsable_id IS NULL")
    elif responsable:
        conditions.append("l.responsable_id = ?")
        params.append(_entier(responsable))
    if statut:
        conditions.append("l.statut = ?")
        params.append(statut)
    if recherche:
        conditions.append("(l.titre LIKE ? OR l.formateur LIKE ?)")
        params += ["%%%s%%" % recherche] * 2

    sql = SELECT_LIVE
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY l.date DESC, l.heure"
    resultat = [_enrichir_live(l) for l in db.tous(sql, params)]
    if sans_rapport:
        resultat = [l for l in resultat if l["sansRapport"]]
    return resultat


def live(ident):
    trouve = db.un(SELECT_LIVE + " WHERE l.id = ?", (ident,))
    return _enrichir_live(trouve) if trouve else None


def _valeurs_live(valeurs, base=None):
    base = base or {}
    heure = _heure(valeurs, "heure", obligatoire=not base)
    fin = _heure(valeurs, "heure_fin")
    if not fin and heure:
        debut = _horodate("2000-01-01", heure)
        if debut:
            fin = (debut + datetime.timedelta(minutes=90)).strftime("%H:%M")
    if heure and fin and fin <= heure:
        raise Refus("L'heure de fin doit être après l'heure de début.")
    return {
        "titre": _texte(valeurs, "titre", base.get("titre", ""),
                        obligatoire=True, etiquette="Nom du live / classe"),
        "date": _date_ou_base(valeurs, base),
        "heure": heure or base.get("heure", ""),
        "heure_fin": fin or base.get("heure_fin", ""),
        "formateur": _texte(valeurs, "formateur", base.get("formateur", "")),
        "plateforme": _texte(valeurs, "plateforme", base.get("plateforme", "")),
        "responsable_id": _entier(valeurs.get("responsable_id")),
        "statut": _choix(valeurs, "statut", schema.STATUTS_LIVE,
                         base.get("statut", "planifie")),
        "note": _texte(valeurs, "note", base.get("note", "")),
    }


def creer_live(valeurs, par=""):
    champs = _valeurs_live(valeurs)
    champs["cree_le"] = champs["maj_le"] = db.maintenant()
    ident = db.inserer("lives", champs)
    journaliser("Live planifié", champs["titre"],
                "%s %s" % (champs["date"], champs["heure"]), par)
    return live(ident)


def modifier_live(ident, valeurs, par=""):
    actuel = db.un("SELECT * FROM lives WHERE id = ?", (ident,))
    if not actuel:
        raise Refus("Live introuvable.")
    # affectation seule : on ne repasse pas par toute la validation
    if set(valeurs) <= {"responsable_id", "statut"}:
        champs = {}
        if "responsable_id" in valeurs:
            champs["responsable_id"] = _entier(valeurs.get("responsable_id"))
        if "statut" in valeurs:
            champs["statut"] = _choix(valeurs, "statut", schema.STATUTS_LIVE,
                                      actuel["statut"])
    else:
        champs = _valeurs_live(valeurs, actuel)
    champs["maj_le"] = db.maintenant()
    db.modifier("lives", ident, champs)
    journaliser("Live modifié", champs.get("titre", actuel["titre"]), "", par)
    return live(ident)


def supprimer_live(ident, par=""):
    actuel = db.un("SELECT * FROM lives WHERE id = ?", (ident,))
    if not actuel:
        raise Refus("Live introuvable.")
    db.supprimer("lives", ident)
    journaliser("Live supprimé", actuel["titre"], actuel["date"], par)
    return {"supprime": True}


def repartir(date, par=""):
    """Distribue les lives d'une journee entre les techniciens actifs."""
    equipe = personnes(True)
    if not equipe:
        raise Refus("Ajoutez d'abord au moins un technicien dans l'équipe.")
    jour = [l for l in lives(date=date) if l["statut"] != "annule"]
    jour.sort(key=lambda l: l["heure"])
    for index, item in enumerate(jour):
        db.modifier("lives", item["id"],
                    {"responsable_id": equipe[index % len(equipe)]["id"],
                     "maj_le": db.maintenant()})
    journaliser("Répartition automatique", date,
                "%d live(s) sur %d personne(s)" % (len(jour), len(equipe)), par)
    return lives(date=date)


# ================================================================= rapports
def _reference(date_iso):
    prefixe = "RAP-%s-" % date_iso
    deja = db.un("SELECT COUNT(*) AS n FROM rapports WHERE reference LIKE ?",
                 (prefixe + "%",))["n"]
    while True:
        deja += 1
        candidat = "%s%03d" % (prefixe, deja)
        if not db.un("SELECT id FROM rapports WHERE reference = ?",
                     (candidat,)):
            return candidat


def _retard(live_lie, date_iso, heure, envoye_le):
    """Minutes ecoulees entre la fin prevue de la seance et l'envoi."""
    fin = None
    if live_lie:
        fin = _horodate(live_lie["date"], live_lie["heure_fin"]
                        or live_lie["heure"])
    if fin is None:
        debut = _horodate(date_iso, heure)
        fin = debut + datetime.timedelta(minutes=90) if debut else None
    if fin is None:
        return 0
    try:
        envoi = datetime.datetime.fromisoformat(envoye_le)
    except ValueError:
        return 0
    return max(0, int((envoi - fin).total_seconds() // 60))


def _enrichir_rapport(rapport):
    rapport["enRetard"] = rapport["retard_min"] > schema.RETARD_MINUTES
    rapport["fichiers"] = db.tous(
        "SELECT id, nom, chemin, taille, type FROM fichiers"
        " WHERE cible = 'rapport' AND cible_id = ? ORDER BY id",
        (rapport["id"],))
    return rapport


def rapports(du=None, au=None, etat=None, responsable=None, urgence=None,
             recherche="", limite=None):
    conditions, params = [], []
    if du:
        conditions.append("date >= ?")
        params.append(du)
    if au:
        conditions.append("date <= ?")
        params.append(au)
    if etat:
        conditions.append("etat = ?")
        params.append(etat)
    if urgence:
        conditions.append("urgence = ?")
        params.append(urgence)
    if responsable:
        conditions.append("responsable_id = ?")
        params.append(_entier(responsable))
    if recherche:
        conditions.append("(nom_live LIKE ? OR description LIKE ?"
                          " OR reference LIKE ? OR responsable_nom LIKE ?)")
        params += ["%%%s%%" % recherche] * 4
    sql = "SELECT * FROM rapports"
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY date DESC, heure DESC, id DESC"
    if limite:
        sql += " LIMIT %d" % int(limite)
    return [_enrichir_rapport(r) for r in db.tous(sql, params)]


def rapport(ident):
    trouve = db.un("SELECT * FROM rapports WHERE id = ?", (ident,))
    return _enrichir_rapport(trouve) if trouve else None


def _valeurs_rapport(valeurs, base=None):
    base = base or {}
    etat = _choix(valeurs, "etat", schema.ETATS, base.get("etat", "normale"))
    description = _texte(valeurs, "description", base.get("description", ""))
    if not description:
        # point 3 : meme quand tout va bien, le rapport doit dire quelque chose
        if etat == "normale":
            description = schema.TEXTE_RAS
        else:
            raise Refus("Décrivez ce qui s'est passé : la description est "
                        "obligatoire dès qu'un problème est signalé.")
    actions = _texte(valeurs, "actions", base.get("actions", ""))
    if etat != "normale" and not actions:
        raise Refus("Indiquez les actions prises face au problème.")
    responsable_id = _entier(valeurs.get("responsable_id",
                                         base.get("responsable_id")))
    nom_responsable = _texte(valeurs, "responsable_nom",
                             base.get("responsable_nom", ""))
    if responsable_id:
        personne = db.un("SELECT nom FROM personnes WHERE id = ?",
                         (responsable_id,))
        if personne:
            nom_responsable = personne["nom"]
    if not nom_responsable:
        raise Refus("Choisissez le responsable de la séance.")
    return {
        "date": _date_ou_base(valeurs, base),
        "heure": _heure(valeurs, "heure") or base.get("heure", ""),
        "nom_live": _texte(valeurs, "nom_live", base.get("nom_live", ""),
                           obligatoire=True,
                           etiquette="Nom du live / classe"),
        "responsable_id": responsable_id,
        "responsable_nom": nom_responsable,
        "etat": etat,
        "description": description,
        "eleves": _texte(valeurs, "eleves", base.get("eleves", "")),
        "urgence": _choix(valeurs, "urgence", schema.URGENCES,
                          base.get("urgence",
                                   "faible" if etat == "normale" else "moyenne")),
        "actions": actions or schema.ACTIONS_RAS,
        "commentaires": _texte(valeurs, "commentaires",
                               base.get("commentaires", "")),
    }


def creer_rapport(valeurs, par=""):
    champs = _valeurs_rapport(valeurs)
    live_id = _entier(valeurs.get("live_id"))
    live_lie = None
    if live_id:
        live_lie = db.un("SELECT * FROM lives WHERE id = ?", (live_id,))
        if not live_lie:
            raise Refus("Le live choisi n'existe plus.")
        existant = db.un("SELECT reference FROM rapports WHERE live_id = ?",
                         (live_id,))
        if existant:
            raise Refus("Ce live a déjà le rapport %s. Modifiez-le plutôt que "
                        "d'en créer un second." % existant["reference"])

    maintenant = db.maintenant()
    champs.update({
        "reference": _reference(champs["date"]),
        "live_id": live_id,
        "dossier": "",
        "envoye_le": maintenant,
        "envoye_par": par or champs["responsable_nom"],
        "retard_min": _retard(live_lie, champs["date"], champs["heure"],
                              maintenant),
        "maj_le": maintenant,
        "maj_par": "",
    })
    ident = db.inserer("rapports", champs)
    if live_id:
        suite = {"statut": "termine", "maj_le": maintenant}
        # une seance encore non attribuee revient a celui qui l'a rapportee
        if not live_lie["responsable_id"] and champs["responsable_id"]:
            suite["responsable_id"] = champs["responsable_id"]
        db.modifier("lives", live_id, suite)
    complet = rapport(ident)
    archive.assurer_rapport(complet)
    journaliser("Rapport envoyé", complet["reference"],
                "%s · %s" % (complet["nom_live"], complet["etat"]), par)
    return rapport(ident)


def modifier_rapport(ident, valeurs, par=""):
    actuel = db.un("SELECT * FROM rapports WHERE id = ?", (ident,))
    if not actuel:
        raise Refus("Rapport introuvable.")
    champs = _valeurs_rapport(valeurs, actuel)
    champs["maj_le"] = db.maintenant()
    champs["maj_par"] = par or actuel["maj_par"]
    db.modifier("rapports", ident, champs)

    complet = rapport(ident)
    ancien = dict(actuel)
    complet["dossier"] = ancien.get("dossier", "")
    archive.deplacer_si_besoin(complet)
    db.modifier("rapports", ident, {"dossier": complet["dossier"]})
    archive.assurer_rapport(complet)
    journaliser("Rapport modifié", complet["reference"], "", par)
    return rapport(ident)


def supprimer_rapport(ident, par=""):
    actuel = db.un("SELECT * FROM rapports WHERE id = ?", (ident,))
    if not actuel:
        raise Refus("Rapport introuvable.")
    archive.supprimer_dossier(actuel["dossier"])
    db.executer("DELETE FROM fichiers WHERE cible = 'rapport' AND cible_id = ?",
                (ident,))
    db.supprimer("rapports", ident)
    if actuel["live_id"]:
        db.modifier("lives", actuel["live_id"],
                    {"statut": "termine", "maj_le": db.maintenant()})
    journaliser("Rapport supprimé", actuel["reference"], actuel["nom_live"],
                par)
    return {"supprime": True}


def pdf_rapport(ident):
    from . import pdf
    complet = rapport(ident)
    if not complet:
        raise Refus("Rapport introuvable.")
    return complet, pdf.construire(complet, complet["fichiers"])


# ================================================================= fichiers
def ajouter_fichier(cible, cible_id, nom, contenu, par=""):
    if cible not in ("rapport", "ticket"):
        raise Refus("Type de pièce jointe inconnu.")
    extension = os.path.splitext(nom)[1].lower()
    if extension not in schema.EXTENSIONS:
        raise Refus("Format refusé : %s. Formats acceptés : %s."
                    % (extension or "sans extension",
                       ", ".join(e[1:] for e in schema.EXTENSIONS)))
    if len(contenu) > schema.TAILLE_MAX_MO * 1024 * 1024:
        raise Refus("Fichier trop lourd (maximum %d Mo)."
                    % schema.TAILLE_MAX_MO)

    if cible == "rapport":
        parent = rapport(cible_id)
        if not parent:
            raise Refus("Rapport introuvable.")
        relatif, _ = archive.assurer_rapport(parent)
    else:
        parent = db.un("SELECT * FROM tickets WHERE id = ?", (cible_id,))
        if not parent:
            raise Refus("Ticket introuvable.")
        relatif = parent["dossier"] or archive.chemin_ticket(parent)
        archive.creer(relatif)
        if parent["dossier"] != relatif:
            db.modifier("tickets", cible_id, {"dossier": relatif})

    nom_reel, taille = archive.deposer(relatif, nom, contenu)
    ident = db.inserer("fichiers", {
        "cible": cible, "cible_id": cible_id, "nom": nom_reel,
        "chemin": relatif + "/" + nom_reel, "taille": taille,
        "type": extension.lstrip("."), "cree_le": db.maintenant(),
    })
    journaliser("Pièce jointe ajoutée", nom_reel, cible, par)
    return db.un("SELECT * FROM fichiers WHERE id = ?", (ident,))


def supprimer_fichier(ident, par=""):
    fichier = db.un("SELECT * FROM fichiers WHERE id = ?", (ident,))
    if not fichier:
        raise Refus("Pièce jointe introuvable.")
    try:
        chemin = archive.absolu(fichier["chemin"])
        if os.path.isfile(chemin):
            os.remove(chemin)
    except (OSError, ValueError):
        pass
    db.supprimer("fichiers", ident)
    journaliser("Pièce jointe supprimée", fichier["nom"], "", par)
    return {"supprime": True}


# ================================================================== tickets
def _enrichir_ticket(ticket, avec_messages=False):
    ticket["fichiers"] = db.tous(
        "SELECT id, nom, chemin, taille, type FROM fichiers"
        " WHERE cible = 'ticket' AND cible_id = ? ORDER BY id",
        (ticket["id"],))
    ticket["nbMessages"] = db.un(
        "SELECT COUNT(*) AS n FROM messages WHERE ticket_id = ?",
        (ticket["id"],))["n"]
    if avec_messages:
        ticket["messages"] = db.tous(
            "SELECT * FROM messages WHERE ticket_id = ? ORDER BY id",
            (ticket["id"],))
    ticket["dureeMin"] = _duree_ticket(ticket)
    return ticket


def _duree_ticket(ticket):
    if not ticket.get("resolu_le"):
        return None
    try:
        debut = datetime.datetime.fromisoformat(ticket["cree_le"])
        fin = datetime.datetime.fromisoformat(ticket["resolu_le"])
    except ValueError:
        return None
    return max(0, int((fin - debut).total_seconds() // 60))


def tickets(statut=None, priorite=None, recherche="", assigne=None):
    conditions, params = [], []
    if statut:
        conditions.append("statut = ?")
        params.append(statut)
    if priorite:
        conditions.append("priorite = ?")
        params.append(priorite)
    if assigne:
        conditions.append("assigne_id = ?")
        params.append(_entier(assigne))
    if recherche:
        conditions.append("(sujet LIKE ? OR description LIKE ?"
                          " OR reference LIKE ?)")
        params += ["%%%s%%" % recherche] * 3
    sql = "SELECT * FROM tickets"
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY (statut = 'resolu'), cree_le DESC"
    return [_enrichir_ticket(t) for t in db.tous(sql, params)]


def ticket(ident):
    trouve = db.un("SELECT * FROM tickets WHERE id = ?", (ident,))
    return _enrichir_ticket(trouve, avec_messages=True) if trouve else None


def creer_ticket(valeurs, par=""):
    sujet = _texte(valeurs, "sujet", obligatoire=True, etiquette="Sujet")
    description = _texte(valeurs, "description", obligatoire=True,
                         etiquette="Description du problème")
    demandeur_id = _entier(valeurs.get("demandeur_id"))
    demandeur = db.un("SELECT nom FROM personnes WHERE id = ?",
                      (demandeur_id,)) if demandeur_id else None
    maintenant = db.maintenant()
    dernier = db.un("SELECT reference FROM tickets ORDER BY id DESC LIMIT 1")
    numero = int(dernier["reference"].split("-")[-1]) + 1 if dernier else 1
    while db.un("SELECT id FROM tickets WHERE reference = ?",
                ("TIC-%04d" % numero,)):
        numero += 1

    ident = db.inserer("tickets", {
        "reference": "TIC-%04d" % numero,
        "sujet": sujet,
        "description": description,
        "categorie": _texte(valeurs, "categorie", schema.CATEGORIES_TICKET[-1]),
        "priorite": _choix(valeurs, "priorite", schema.PRIORITES, "moyenne"),
        "statut": "nouveau",
        "demandeur_id": demandeur_id,
        "demandeur_nom": (demandeur or {}).get("nom", par or "—"),
        "assigne_id": _entier(valeurs.get("assigne_id")),
        "live_id": _entier(valeurs.get("live_id")),
        "dossier": "",
        "cree_le": maintenant, "maj_le": maintenant, "resolu_le": "",
    })
    db.inserer("messages", {
        "ticket_id": ident, "auteur": (demandeur or {}).get("nom", par or "—"),
        "texte": description, "cree_le": maintenant})
    journaliser("Ticket ouvert", "TIC-%04d" % numero, sujet, par)
    return ticket(ident)


def modifier_ticket(ident, valeurs, par=""):
    actuel = db.un("SELECT * FROM tickets WHERE id = ?", (ident,))
    if not actuel:
        raise Refus("Ticket introuvable.")
    champs = {"maj_le": db.maintenant()}
    for cle in ("sujet", "description", "categorie"):
        if cle in valeurs:
            champs[cle] = _texte(valeurs, cle, actuel[cle],
                                 obligatoire=(cle == "sujet"),
                                 etiquette="Sujet")
    if "priorite" in valeurs:
        champs["priorite"] = _choix(valeurs, "priorite", schema.PRIORITES,
                                    actuel["priorite"])
    if "assigne_id" in valeurs:
        champs["assigne_id"] = _entier(valeurs.get("assigne_id"))
    if "statut" in valeurs:
        statut = _choix(valeurs, "statut", schema.STATUTS_TICKET,
                        actuel["statut"])
        champs["statut"] = statut
        if statut == "resolu" and not actuel["resolu_le"]:
            champs["resolu_le"] = db.maintenant()
        if statut != "resolu":
            champs["resolu_le"] = ""
    db.modifier("tickets", ident, champs)
    journaliser("Ticket modifié", actuel["reference"],
                champs.get("statut", ""), par)
    return ticket(ident)


def supprimer_ticket(ident, par=""):
    actuel = db.un("SELECT * FROM tickets WHERE id = ?", (ident,))
    if not actuel:
        raise Refus("Ticket introuvable.")
    archive.supprimer_dossier(actuel["dossier"])
    db.executer("DELETE FROM fichiers WHERE cible = 'ticket' AND cible_id = ?",
                (ident,))
    db.supprimer("tickets", ident)
    journaliser("Ticket supprimé", actuel["reference"], actuel["sujet"], par)
    return {"supprime": True}


def repondre(ident, texte, auteur=""):
    actuel = db.un("SELECT * FROM tickets WHERE id = ?", (ident,))
    if not actuel:
        raise Refus("Ticket introuvable.")
    texte = str(texte or "").strip()
    if not texte:
        raise Refus("Le message est vide.")
    db.inserer("messages", {"ticket_id": ident, "auteur": auteur or "—",
                            "texte": texte, "cree_le": db.maintenant()})
    champs = {"maj_le": db.maintenant()}
    if actuel["statut"] == "nouveau":
        champs["statut"] = "en_cours"
    db.modifier("tickets", ident, champs)
    return ticket(ident)


def supprimer_message(ident):
    message = db.un("SELECT * FROM messages WHERE id = ?", (ident,))
    if not message:
        raise Refus("Message introuvable.")
    db.supprimer("messages", ident)
    return {"supprime": True}


# ========================================================== tableau de bord
def tableau():
    aujourdhui = db.aujourdhui()
    depuis = (datetime.date.today() - datetime.timedelta(days=29)).isoformat()

    lives_jour = lives(date=aujourdhui)
    sans_rapport_jour = [l for l in lives_jour if l["sansRapport"]]
    sans_rapport_total = lives(du=depuis, sans_rapport=True)
    rapports_jour = db.tous("SELECT * FROM rapports WHERE date = ?",
                            (aujourdhui,))
    mois = db.tous("SELECT * FROM rapports WHERE date >= ?", (depuis,))

    incidents = [r for r in mois if r["etat"] != "normale"]
    critiques = [r for r in incidents
                 if r["etat"] == "important" or r["urgence"] == "critique"]
    ouverts = db.tous("SELECT * FROM tickets WHERE statut != 'resolu'")
    resolus = db.tous("SELECT * FROM tickets WHERE statut = 'resolu'"
                      " AND resolu_le != ''")
    durees = [d for d in (_duree_ticket(t) for t in resolus) if d is not None]

    return {
        "date": aujourdhui,
        "indicateurs": {
            "livesJour": len(lives_jour),
            "rapportsJour": len(rapports_jour),
            "sansRapportJour": len(sans_rapport_jour),
            "sansRapportTotal": len(sans_rapport_total),
            "incidents": len(incidents),
            "critiques": len(critiques),
            "ticketsOuverts": len(ouverts),
            "resolutionMoyenne": int(sum(durees) / len(durees)) if durees else 0,
            "rapportsEnRetard": len([r for r in mois
                                     if r["retard_min"] > schema.RETARD_MINUTES]),
            "tauxCouverture": _taux_couverture(depuis),
        },
        "livesJour": lives_jour,
        "sansRapport": sans_rapport_total[:12],
        "historique": rapports(limite=12),
        "series": _series(),
        "repartition": _repartition(mois),
        "equipe": _classement(depuis),
    }


def _taux_couverture(depuis):
    passes = [l for l in lives(du=depuis) if l["passe"] and l["statut"] != "annule"]
    if not passes:
        return 100
    return int(round(100.0 * len([l for l in passes if l["aRapport"]])
                     / len(passes)))


def _series(jours=14):
    aujourdhui = datetime.date.today()
    sortie = []
    for recul in range(jours - 1, -1, -1):
        jour = (aujourdhui - datetime.timedelta(days=recul)).isoformat()
        compte = db.un(
            "SELECT COUNT(*) AS n FROM lives WHERE date = ? AND statut != 'annule'",
            (jour,))["n"]
        faits = db.un("SELECT COUNT(*) AS n FROM rapports WHERE date = ?",
                      (jour,))["n"]
        soucis = db.un("SELECT COUNT(*) AS n FROM rapports"
                       " WHERE date = ? AND etat != 'normale'", (jour,))["n"]
        sortie.append({"jour": jour, "lives": compte, "rapports": faits,
                       "incidents": soucis})
    return sortie


def _repartition(liste):
    compte = {item["cle"]: 0 for item in schema.ETATS}
    for rapport_ in liste:
        compte[rapport_["etat"]] = compte.get(rapport_["etat"], 0) + 1
    return [{"cle": item["cle"], "libelle": item["libelle"],
             "icone": item["icone"], "ton": item["ton"],
             "valeur": compte.get(item["cle"], 0)} for item in schema.ETATS]


def _classement(depuis):
    sortie = []
    for personne in personnes(True):
        attribues = [l for l in lives(du=depuis, responsable=personne["id"])
                     if l["passe"] and l["statut"] != "annule"]
        faits = [l for l in attribues if l["aRapport"]]
        manquants = len(attribues) - len(faits)
        retards = db.un(
            "SELECT COUNT(*) AS n FROM rapports WHERE responsable_id = ?"
            " AND date >= ? AND retard_min > ?",
            (personne["id"], depuis, schema.RETARD_MINUTES))["n"]
        sortie.append({
            "id": personne["id"], "nom": personne["nom"],
            "fonction": personne["fonction"], "couleur": personne["couleur"],
            "lives": len(attribues), "rapports": len(faits),
            "manquants": manquants, "retards": retards,
            "taux": int(round(100.0 * len(faits) / len(attribues)))
                    if attribues else 100,
        })
    sortie.sort(key=lambda item: (-item["taux"], -item["lives"]))
    return sortie


def journal(limite=100):
    return db.tous("SELECT * FROM journal ORDER BY id DESC LIMIT ?",
                   (int(limite),))
