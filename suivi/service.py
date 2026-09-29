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
    """L'equipe, avec son role et le fait d'avoir un mot de passe ou non.

    Le mot de passe lui-meme ne sort jamais d'ici — seulement s'il existe,
    de quoi afficher « compte actif » ou « à créer ».
    """
    # Les alias restent en minuscules : PostgreSQL replie tout identifiant non
    # guillemete, donc « AS aMotDePasse » revenait en « amotdepasse » et
    # l'interface ne trouvait plus la cle. SQLite, lui, garde la casse -- la
    # difference ne se voyait donc qu'en ligne. Le nom lisible est pose ici.
    sql = ("SELECT p.*, COALESCE(c.role, 'technicien') AS role,"
           " CASE WHEN COALESCE(c.mdp, '') != '' THEN 1 ELSE 0 END AS a_mdp,"
           " COALESCE(c.derniere, '') AS derniere,"
           " COALESCE(c.mdp_le, '') AS mdp_le,"
           " COALESCE(c.maj_par, '') AS mdp_par"
           " FROM personnes p LEFT JOIN comptes c ON c.personne_id = p.id")
    if actifs_seulement:
        sql += " WHERE p.actif = 1"
    lignes = db.tous(sql + " ORDER BY p.actif DESC, p.nom")
    for ligne in lignes:
        ligne["aMotDePasse"] = 1 if ligne.pop("a_mdp", 0) else 0
    return lignes


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
    # toute personne a un compte des sa creation, mot de passe encore vide :
    # l'administrateur le posera, et rien ne se connecte sans mot de passe
    db.inserer("comptes", {"personne_id": ident, "role": "technicien",
                           "mdp": "", "mdp_le": "", "maj_le": "",
                           "maj_par": "", "derniere": ""})
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
# Le compte des etapes cochees arrive par une jointure et non par une requete
# par seance : la liste du mois appelle cette requete une fois, pas trois cents.
SELECT_LIVE = """
SELECT l.*, p.nom AS responsable_nom, p.couleur AS responsable_couleur,
       r.id AS rapport_id, r.reference AS rapport_reference, r.etat AS rapport_etat,
       COALESCE(t.faites, 0) AS taches_faites,
       COALESCE(n.ecrits, 0) AS notes_total
FROM lives l
LEFT JOIN personnes p ON p.id = l.responsable_id
LEFT JOIN rapports  r ON r.live_id = l.id
LEFT JOIN (SELECT live_id, COUNT(*) AS faites FROM taches
           WHERE fait = 1 GROUP BY live_id) t ON t.live_id = l.id
LEFT JOIN (SELECT live_id, COUNT(*) AS ecrits FROM notes
           GROUP BY live_id) n ON n.live_id = l.id
"""


def _enrichir_live(live):
    fin = _horodate(live["date"], live["heure_fin"] or live["heure"])
    maintenant = datetime.datetime.now()
    passe = bool(fin and fin < maintenant)
    live["passe"] = passe
    live["aRapport"] = live.get("rapport_id") is not None
    live["sansRapport"] = bool(
        passe and not live["aRapport"] and live["statut"] != "annule")

    total = len(schema.TACHES)
    faites = min(int(live.get("taches_faites") or 0), total)
    live["tachesFaites"] = faites
    live["tachesTotal"] = total
    live["tachesRestantes"] = total - faites
    live["tachesCompletes"] = faites >= total
    live["nbNotes"] = int(live.get("notes_total") or 0)
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


def importer_lives(lignes, responsables=(), par=""):
    """Crée des séances en série et les répartit à tour de rôle.

    Pensé pour reprendre un mois entier d'un autre outil. Deux précautions :

    * les séances sont triées par date et heure **avant** la répartition,
      sinon l'ordre du fichier déciderait de qui hérite des soirées chargées ;
    * une séance déjà présente au même jour, à la même heure et sous le même
      titre est ignorée, pour qu'un import relancé ne double pas le planning.

    Rien n'est écrit si une seule ligne est refusée : un import à moitié
    passé est pire qu'un import refusé, on ne sait plus où on en est.
    """
    if not isinstance(lignes, (list, tuple)) or not lignes:
        raise Refus("Aucune séance à importer.")
    if len(lignes) > 2000:
        raise Refus("Import trop volumineux (2000 séances au maximum).")

    equipe = [_entier(i) for i in (responsables or []) if _entier(i)]
    connus = {p["id"] for p in personnes(True)}
    inconnus = [i for i in equipe if i not in connus]
    if inconnus:
        raise Refus("Responsable inconnu ou inactif : %s."
                    % ", ".join(str(i) for i in inconnus))

    # tout valider d'abord, n'ecrire qu'ensuite
    preparees = []
    for rang, brute in enumerate(lignes, 1):
        try:
            champs = _valeurs_live(brute or {})
        except Refus as souci:
            raise Refus("Ligne %d : %s" % (rang, souci))
        preparees.append(champs)

    preparees.sort(key=lambda c: (c["date"], c["heure"] or "99:99"))

    crees, ignorees = [], []
    quand = db.maintenant()
    for index, champs in enumerate(preparees):
        double = db.un(
            "SELECT id FROM lives WHERE date = ? AND heure = ? AND titre = ?",
            (champs["date"], champs["heure"], champs["titre"]))
        if double:
            ignorees.append("%s %s · %s" % (champs["date"], champs["heure"],
                                            champs["titre"]))
            continue
        if equipe:
            champs["responsable_id"] = equipe[len(crees) % len(equipe)]
        champs["cree_le"] = champs["maj_le"] = quand
        crees.append(db.inserer("lives", champs))

    journaliser("Import de séances", "%d séance(s)" % len(crees),
                "%d ignorée(s) · %d responsable(s)" % (len(ignorees), len(equipe)),
                par)
    return {"crees": len(crees), "ignorees": ignorees,
            "responsables": len(equipe)}


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


# =================================================================== taches
# Chaque seance suit le meme deroule (schema.TACHES). Une etape n'a de ligne
# en base qu'une fois cochee : la liste de reference reste le code, donc en
# ajouter une plus tard ne demande aucune reprise des seances passees.
def taches_de(live_id):
    faites = {ligne["cle"]: ligne for ligne in db.tous(
        "SELECT * FROM taches WHERE live_id = ?", (live_id,))}
    notes = {}
    for ligne in db.tous("SELECT * FROM notes WHERE live_id = ?"
                         " ORDER BY id", (live_id,)):
        notes.setdefault(ligne["cle"], []).append(ligne)

    sortie = []
    for item in schema.TACHES:
        ligne = faites.get(item["cle"]) or {}
        etape = dict(item)
        etape.update({
            "fait": bool(ligne.get("fait")),
            "fait_le": ligne.get("fait_le", ""),
            "fait_par": ligne.get("fait_par", ""),
            "notes": notes.get(item["cle"], []),
        })
        sortie.append(etape)
    return sortie


def _poser_tache(live_id, cle, fait, par=""):
    """Ecrit une case. Sans controle : les appelants ont deja verifie."""
    ligne = db.un("SELECT id FROM taches WHERE live_id = ? AND cle = ?",
                  (live_id, cle))
    champs = {"fait": 1 if fait else 0,
              "fait_le": db.maintenant() if fait else "",
              "fait_par": par if fait else ""}
    if ligne:
        db.modifier("taches", ligne["id"], champs)
    else:
        champs.update({"live_id": live_id, "cle": cle})
        db.inserer("taches", champs)


def _verifier_etape(cle):
    """Renvoie l'etape, ou refuse. Aucune ecriture ici."""
    if cle not in schema.CLES_TACHES:
        raise Refus("Étape inconnue : %s." % cle)
    etape = next(item for item in schema.TACHES if item["cle"] == cle)

    # La case du rapport suit le rapport lui-meme, jamais la main : la cocher
    # sans rapport ferait mentir le tableau de bord.
    if cle == schema.TACHE_RAPPORT:
        raise Refus("« %s » se coche toute seule quand le rapport part. "
                    "Utilisez le bouton Rapport." % etape["libelle"])
    return etape


def basculer_tache(live_id, cle, fait, par=""):
    return basculer_taches(live_id, [{"cle": cle, "fait": fait}], par)


def basculer_taches(live_id, changements, par=""):
    """Valide plusieurs cases d'un coup.

    L'ecran retient les clics puis envoie tout a la validation : un seul
    aller-retour, et surtout un seul instant ou la base change. Tout est
    donc verifie AVANT d'ecrire quoi que ce soit — sinon une etape inconnue
    en fin de liste laisserait les precedentes ecrites et l'utilisateur
    devant un refus, sans savoir ce qui a ete retenu.
    """
    seance = db.un("SELECT * FROM lives WHERE id = ?", (live_id,))
    if not seance:
        raise Refus("Live introuvable.")
    if not isinstance(changements, (list, tuple)) or not changements:
        raise Refus("Aucune modification à valider.")

    retenus, vues = [], set()
    for item in changements:
        cle = str((item or {}).get("cle") or "")
        if cle in vues:
            raise Refus("L'étape « %s » est demandée deux fois." % cle)
        vues.add(cle)
        retenus.append((_verifier_etape(cle), bool((item or {}).get("fait"))))

    for etape, fait in retenus:
        _poser_tache(live_id, etape["cle"], fait, par)

    detail = ", ".join("%s %s" % (etape["libelle"],
                                  "faite" if fait else "rouverte")
                       for etape, fait in retenus)
    journaliser("%d étape(s) mise(s) à jour" % len(retenus),
                seance["titre"], detail, par)
    return {"live": live(live_id), "taches": taches_de(live_id)}


# Un commentaire se rattache a (seance, etape) et non a la ligne de `taches` :
# le cas courant est justement celui d'une etape NON faite -- le professeur
# n'a pas repondu, il faudra le rappeler. Exiger la case cochee d'abord
# interdirait d'ecrire precisement quand on en a le plus besoin.
def commenter(live_id, cle, texte, par=""):
    seance = db.un("SELECT * FROM lives WHERE id = ?", (live_id,))
    if not seance:
        raise Refus("Live introuvable.")
    if cle not in schema.CLES_TACHES:
        raise Refus("Étape inconnue : %s." % cle)
    texte = str(texte or "").strip()
    if not texte:
        raise Refus("Le commentaire est vide.")
    if len(texte) > schema.NOTE_MAX:
        raise Refus("Commentaire trop long (%d caractères maximum)."
                    % schema.NOTE_MAX)

    etape = next(item for item in schema.TACHES if item["cle"] == cle)
    db.inserer("notes", {"live_id": live_id, "cle": cle, "texte": texte,
                         "auteur": par or "—", "cree_le": db.maintenant()})
    journaliser("Commentaire sur une étape", seance["titre"],
                etape["libelle"], par)
    return {"live": live(live_id), "taches": taches_de(live_id)}


def supprimer_note(ident, par=""):
    note = db.un("SELECT * FROM notes WHERE id = ?", (ident,))
    if not note:
        raise Refus("Commentaire introuvable.")
    db.supprimer("notes", ident)
    return {"live": live(note["live_id"]),
            "taches": taches_de(note["live_id"])}


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
        _poser_tache(live_id, schema.TACHE_RAPPORT, True,
                     par or champs["responsable_nom"])
    complet = rapport(ident)
    _archiver(complet)
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
    _archiver(complet)
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
        # le rapport n'existe plus : l'etape correspondante non plus
        _poser_tache(actuel["live_id"], schema.TACHE_RAPPORT, False)
    journaliser("Rapport supprimé", actuel["reference"], actuel["nom_live"],
                par)
    return {"supprime": True}


def historique_seance(complet):
    """Tout ce qui a été fait sur cette séance et sur son rapport.

    Le journal est tenu par cible : le titre de la séance pour les étapes et
    les commentaires, la référence du rapport pour son envoi et ses
    corrections. Les deux réunis donnent la trace complète, qui a fait quoi
    et quand.
    """
    cibles, params = [], []
    if complet.get("reference"):
        cibles.append("cible = ?")
        params.append(complet["reference"])
    if complet.get("live_id"):
        seance = db.un("SELECT titre FROM lives WHERE id = ?",
                       (complet["live_id"],))
        if seance:
            cibles.append("cible = ?")
            params.append(seance["titre"])
    if not cibles:
        return []
    return db.tous("SELECT * FROM journal WHERE %s ORDER BY id"
                   % " OR ".join(cibles), params)


def etapes_rapport(complet):
    """Les étapes de la séance liée, ou rien si le rapport est libre."""
    return taches_de(complet["live_id"]) if complet.get("live_id") else []


def _archiver(complet):
    """Ecrit le dossier du rapport avec ses etapes et sa tracabilite."""
    complet["etapes"] = etapes_rapport(complet)
    complet["historique"] = historique_seance(complet)
    return archive.assurer_rapport(complet, complet["etapes"],
                                   complet["historique"])


def pdf_rapport(ident):
    from . import pdf
    complet = rapport(ident)
    if not complet:
        raise Refus("Rapport introuvable.")
    return complet, pdf.construire(complet, complet["fichiers"],
                                   etapes_rapport(complet),
                                   historique_seance(complet))


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
        relatif, _ = _archiver(parent)
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
def tableau(pour=None):
    """Le tableau de bord, pour toute l'équipe ou pour une seule personne.

    `pour` est un identifiant de personne : les séances retenues sont celles
    dont elle est responsable, les rapports ceux qu'elle a signés. C'est
    l'API qui décide de ce qu'elle a le droit de demander ; ici on se
    contente de filtrer.
    """
    aujourdhui = db.aujourdhui()
    depuis = (datetime.date.today() - datetime.timedelta(days=29)).isoformat()
    qui = db.un("SELECT * FROM personnes WHERE id = ?", (pour,)) if pour else None

    lives_jour = lives(date=aujourdhui, responsable=pour or None)
    sans_rapport_jour = [l for l in lives_jour if l["sansRapport"]]
    etapes_restantes = sum(l["tachesRestantes"] for l in lives_jour
                           if l["statut"] != "annule")
    sans_rapport_total = lives(du=depuis, sans_rapport=True,
                               responsable=pour or None)

    ou, params = ["date >= ?"], [depuis]
    if pour:
        ou.append("responsable_id = ?")
        params.append(pour)
    mois = db.tous("SELECT * FROM rapports WHERE " + " AND ".join(ou), params)
    rapports_jour = [r for r in mois if r["date"] == aujourdhui]

    incidents = [r for r in mois if r["etat"] != "normale"]
    critiques = [r for r in incidents
                 if r["etat"] == "important" or r["urgence"] == "critique"]

    # les tickets d'une personne sont ceux qu'elle a ouverts
    cond_t = "" if not pour else " AND demandeur_id = %d" % int(pour)
    ouverts = db.tous("SELECT * FROM tickets WHERE statut != 'resolu'" + cond_t)
    resolus = db.tous("SELECT * FROM tickets WHERE statut = 'resolu'"
                      " AND resolu_le != ''" + cond_t)
    durees = [d for d in (_duree_ticket(t) for t in resolus) if d is not None]

    sortie = {
        "date": aujourdhui,
        "pour": pour,
        "nom": (qui or {}).get("nom", ""),
        "indicateurs": {
            "livesJour": len(lives_jour),
            "rapportsJour": len(rapports_jour),
            "sansRapportJour": len(sans_rapport_jour),
            "sansRapportTotal": len(sans_rapport_total),
            "etapesRestantes": etapes_restantes,
            "incidents": len(incidents),
            "critiques": len(critiques),
            "ticketsOuverts": len(ouverts),
            "resolutionMoyenne": int(sum(durees) / len(durees)) if durees else 0,
            "rapportsEnRetard": len([r for r in mois
                                     if r["retard_min"] > schema.RETARD_MINUTES]),
            "tauxCouverture": _taux_couverture(depuis, pour),
        },
        "livesJour": lives_jour,
        "sansRapport": sans_rapport_total[:12],
        "historique": rapports(limite=12, responsable=pour or None),
        "series": _series(pour=pour),
        "repartition": _repartition(mois),
        "equipe": _classement(depuis),
    }
    if qui:
        sortie["indicateurs"].update(_activite(qui["nom"], depuis))
    return sortie


def _activite(nom, depuis):
    """Ce que la personne a fait de ses mains, et non ce qu'on lui a confié.

    Les étapes et les commentaires portent le nom de leur auteur et non son
    identifiant — comme `responsable_nom` sur un rapport, pour que la trace
    survive à la suppression d'une fiche. Le comptage se fait donc par nom :
    renommer quelqu'un détacherait son historique.
    """
    etapes = db.un(
        "SELECT COUNT(*) AS n FROM taches t JOIN lives l ON l.id = t.live_id"
        " WHERE t.fait = 1 AND t.fait_par = ? AND l.date >= ?",
        (nom, depuis))["n"]
    mots = db.un(
        "SELECT COUNT(*) AS n FROM notes m JOIN lives l ON l.id = m.live_id"
        " WHERE m.auteur = ? AND l.date >= ?", (nom, depuis))["n"]
    return {"etapesFaites": etapes, "commentaires": mots}


def _taux_couverture(depuis, pour=None):
    passes = [l for l in lives(du=depuis, responsable=pour or None)
              if l["passe"] and l["statut"] != "annule"]
    if not passes:
        return 100
    return int(round(100.0 * len([l for l in passes if l["aRapport"]])
                     / len(passes)))


def _series(jours=14, pour=None):
    aujourdhui = datetime.date.today()
    filtre_l = " AND responsable_id = %d" % int(pour) if pour else ""
    filtre_r = filtre_l
    sortie = []
    for recul in range(jours - 1, -1, -1):
        jour = (aujourdhui - datetime.timedelta(days=recul)).isoformat()
        compte = db.un(
            "SELECT COUNT(*) AS n FROM lives WHERE date = ?"
            " AND statut != 'annule'" + filtre_l, (jour,))["n"]
        faits = db.un("SELECT COUNT(*) AS n FROM rapports WHERE date = ?"
                      + filtre_r, (jour,))["n"]
        soucis = db.un("SELECT COUNT(*) AS n FROM rapports"
                       " WHERE date = ? AND etat != 'normale'" + filtre_r,
                       (jour,))["n"]
        sortie.append({"jour": jour, "lives": compte, "rapports": faits,
                       "incidents": soucis})
    return sortie


def _repartition(liste):
    compte = {item["cle"]: 0 for item in schema.ETATS}
    for rapport_ in liste:
        compte[rapport_["etat"]] = compte.get(rapport_["etat"], 0) + 1
    return [{"cle": item["cle"], "libelle": item["libelle"],
             "icone": item["icone"], "symbole": item["symbole"],
             "ton": item["ton"],
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
        ligne = {
            "id": personne["id"], "nom": personne["nom"],
            "fonction": personne["fonction"], "couleur": personne["couleur"],
            "role": personne.get("role", "technicien"),
            "lives": len(attribues), "rapports": len(faits),
            "manquants": manquants, "retards": retards,
            "taux": int(round(100.0 * len(faits) / len(attribues)))
                    if attribues else 100,
        }
        ligne.update(_activite(personne["nom"], depuis))
        sortie.append(ligne)
    sortie.sort(key=lambda item: (-item["taux"], -item["lives"]))
    return sortie


# ============================================================ performance
def _bornes_mois(mois):
    """Premier et dernier jour du mois « AAAA-MM »."""
    try:
        annee, numero = int(mois[:4]), int(mois[5:7])
        debut = datetime.date(annee, numero, 1)
    except (ValueError, IndexError):
        raise Refus("Mois invalide : %s (format attendu AAAA-MM)." % mois)
    fin = datetime.date(annee + (numero == 12), (numero % 12) + 1, 1) \
        - datetime.timedelta(days=1)
    return debut.isoformat(), fin.isoformat()


def _part(fait, total):
    """Un pourcentage entier, et 0 plutôt qu'une division par zéro."""
    return int(round(100.0 * fait / total)) if total else 0


def performances(mois=None):
    """Le relevé mensuel de chacun, et ce qui compose son score.

    Chaque composante est rendue avec son détail chiffré : un score attaché
    à une prime doit pouvoir s'expliquer à la personne, sinon il fait plus
    de dégâts que pas de prime du tout.
    """
    mois = mois or db.aujourdhui()[:7]
    debut, fin = _bornes_mois(mois)
    maintenant = datetime.datetime.now()

    seances = db.tous(
        "SELECT * FROM lives WHERE date >= ? AND date <= ?"
        " AND statut != 'annule' AND responsable_id IS NOT NULL",
        (debut, fin))
    # seules les séances déjà passées se jugent : le reste est à venir
    seances = [s for s in seances
               if (_horodate(s["date"], s["heure_fin"] or s["heure"])
                   or maintenant) < maintenant]

    par_live = {s["id"]: s for s in seances}
    etapes = []
    if par_live:
        trous = ", ".join("?" * len(par_live))
        etapes = db.tous(
            "SELECT * FROM taches WHERE fait = 1 AND live_id IN (%s)" % trous,
            list(par_live))

    rapports_mois = db.tous(
        "SELECT * FROM rapports WHERE date >= ? AND date <= ?", (debut, fin))
    avec_rapport = {r["live_id"] for r in rapports_mois if r["live_id"]}

    cles_avant = [t["cle"] for t in schema.TACHES if t["moment"] == "avant"]
    # étapes regroupées par séance, pour ne pas reparcourir la liste
    par_seance = {}
    for etape in etapes:
        par_seance.setdefault(etape["live_id"], []).append(etape)

    brut = []
    for personne in personnes(True):
        miennes = [s for s in seances if s["responsable_id"] == personne["id"]]
        siens = [r for r in rapports_mois
                 if r["responsable_id"] == personne["id"]]

        a_temps = 0          # étapes d'avant-live cochées avant le début
        attendues = 0
        apres_coup = 0       # cochées après la fin : signal, pas sanction
        cochees = 0
        for seance in miennes:
            debut_live = _horodate(seance["date"], seance["heure"])
            fin_live = _horodate(seance["date"],
                                 seance["heure_fin"] or seance["heure"])
            faites = {e["cle"]: e for e in par_seance.get(seance["id"], [])}
            attendues += len(cles_avant)
            for cle in cles_avant:
                etape = faites.get(cle)
                if not etape:
                    continue
                quand = _quand(etape["fait_le"])
                if quand and debut_live and quand <= debut_live:
                    a_temps += 1
            for etape in faites.values():
                cochees += 1
                quand = _quand(etape["fait_le"])
                if quand and fin_live and quand > fin_live:
                    apres_coup += 1

        couverts = len([s for s in miennes if s["id"] in avec_rapport])
        ponctuels = len([r for r in siens
                         if int(r["retard_min"] or 0) <= schema.RETARD_MINUTES])
        brut.append({
            "id": personne["id"], "nom": personne["nom"],
            "couleur": personne["couleur"],
            "role": personne.get("role", "technicien"),
            "seances": len(miennes),
            "rapports": len(siens),
            "couverts": couverts,
            "ponctuels": ponctuels,
            "etapesATemps": a_temps,
            "etapesAttendues": attendues,
            "etapesCochees": cochees,
            "apresCoup": apres_coup,
            "incidents": len([r for r in siens if r["etat"] != "normale"]),
            "notes": {
                "couverture": _part(couverts, len(miennes)),
                "preparation": _part(a_temps, attendues),
                "ponctualite": _part(ponctuels, len(siens)),
            },
        })

    # la charge se juge les uns par rapport aux autres : le plus chargé du
    # mois fait le 100, sinon un mois creux noterait tout le monde à zéro
    plus_charge = max([p["seances"] for p in brut] or [0])
    poids = {item["cle"]: item["poids"] for item in schema.POIDS}
    for ligne in brut:
        ligne["notes"]["charge"] = _part(ligne["seances"], plus_charge)
        ligne["score"] = int(round(sum(
            ligne["notes"][cle] * poids[cle] for cle in poids) / 100.0))
        ligne["eligible"] = ligne["seances"] >= schema.SEUIL_ELIGIBLE
        ligne["partApresCoup"] = _part(ligne["apresCoup"], ligne["etapesCochees"])
        ligne["doute"] = ligne["partApresCoup"] >= schema.SEUIL_APRES_COUP \
            and ligne["etapesCochees"] >= 5

    # classés au score, la charge départage : à score égal, celui qui a
    # assuré le plus de séances passe devant
    brut.sort(key=lambda l: (-l["score"], -l["seances"], l["nom"]))
    rang = 0
    for ligne in brut:
        if ligne["eligible"]:
            rang += 1
            ligne["rang"] = rang
        else:
            ligne["rang"] = None

    return {
        "mois": mois, "debut": debut, "fin": fin,
        "classement": brut,
        "distinction": distinction_du_mois(mois),
        "plusCharge": plus_charge,
    }


def _quand(texte):
    try:
        return datetime.datetime.fromisoformat(str(texte or ""))
    except ValueError:
        return None


def distinction_du_mois(mois):
    ligne = db.un(
        "SELECT d.*, p.nom, p.couleur FROM distinctions d"
        " JOIN personnes p ON p.id = d.personne_id WHERE d.mois = ?", (mois,))
    return ligne


def nommer_employe(mois, personne_id, motif="", par=""):
    """Désigne l'employé du mois. La décision reste humaine et tracée."""
    _bornes_mois(mois)
    personne = db.un("SELECT * FROM personnes WHERE id = ?", (personne_id,))
    if not personne:
        raise Refus("Membre introuvable.")

    releve = performances(mois)
    ligne = next((l for l in releve["classement"] if l["id"] == personne_id),
                 None)
    if not ligne:
        raise Refus("Cette personne n'a pas de relevé pour ce mois.")
    if not ligne["eligible"]:
        raise Refus("%s n'a suivi que %d séance(s) ce mois-ci : en dessous de "
                    "%d, le score n'est pas comparable."
                    % (personne["nom"], ligne["seances"],
                       schema.SEUIL_ELIGIBLE))

    db.executer("DELETE FROM distinctions WHERE mois = ?", (mois,))
    db.inserer("distinctions", {
        "mois": mois, "personne_id": personne_id,
        "motif": str(motif or "").strip()[:500], "score": ligne["score"],
        "decide_le": db.maintenant(), "decide_par": par})
    journaliser("Employé du mois", personne["nom"],
                "%s · score %d" % (mois, ligne["score"]), par)
    return performances(mois)


def retirer_employe(mois, par=""):
    actuel = distinction_du_mois(mois)
    if not actuel:
        raise Refus("Aucun employé du mois désigné pour cette période.")
    db.executer("DELETE FROM distinctions WHERE mois = ?", (mois,))
    journaliser("Employé du mois retiré", actuel["nom"], mois, par)
    return performances(mois)


def journal(limite=100):
    return db.tous("SELECT * FROM journal ORDER BY id DESC LIMIT ?",
                   (int(limite),))
