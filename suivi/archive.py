# -*- coding: utf-8 -*-
"""Classement automatique des rapports en dossiers reels sur le disque.

    Rapports/
      2026/
        Janvier/ ... Decembre/
          RAP-2026-07-29-001 Anglais professionnel/
            RAP-2026-07-29-001.pdf     le rapport, mis en page
            rapport.txt                le meme contenu en texte simple
            <pieces jointes>           captures d'ecran, videos, fichiers

    Support/
      2026/
        Juillet/
          TIC-0001/                    pieces jointes des tickets

Les dossiers d'un rapport sont ecrits a la demande (premiere ouverture ou
premier telechargement) : le demarrage reste instantane meme avec un long
historique.
"""

import datetime
import json
import os
import unicodedata

from . import db, schema

RACINE = None
DOSSIER_RAPPORTS = "Rapports"
DOSSIER_SUPPORT = "Support"

INTERDITS = '<>:"/\\|?*'


def configurer(racine):
    global RACINE
    RACINE = racine
    os.makedirs(racine, exist_ok=True)
    squelette(datetime.date.today().year)


def squelette(annee):
    """Cree les douze mois de l'annee, meme vides."""
    for mois in schema.MOIS_ACCENT:
        os.makedirs(os.path.join(RACINE, DOSSIER_RAPPORTS, str(annee), mois),
                    exist_ok=True)


def nom_sur(texte, longueur=70):
    """Nom de dossier ou de fichier utilisable sur tous les systemes."""
    texte = "".join(" " if c in INTERDITS else c for c in (texte or ""))
    texte = "".join(c for c in texte if unicodedata.category(c)[0] != "C")
    texte = " ".join(texte.split()).strip(" .")
    return (texte[:longueur].strip() or "sans-nom")


def mois_de(date_iso):
    try:
        annee, mois = int(date_iso[:4]), int(date_iso[5:7])
    except (ValueError, TypeError):
        aujourd = datetime.date.today()
        annee, mois = aujourd.year, aujourd.month
    return annee, schema.MOIS_ACCENT[max(0, min(11, mois - 1))]


def chemin_rapport(rapport):
    """Chemin relatif (a partir de la racine des archives)."""
    annee, mois = mois_de(rapport["date"])
    nom = nom_sur("%s %s" % (rapport["reference"], rapport["nom_live"]))
    return "/".join([DOSSIER_RAPPORTS, str(annee), mois, nom])


def chemin_ticket(ticket):
    annee, mois = mois_de(ticket["cree_le"][:10])
    return "/".join([DOSSIER_SUPPORT, str(annee), mois,
                     nom_sur(ticket["reference"])])


def absolu(relatif):
    """Chemin disque, avec garde contre les remontees de dossier."""
    cible = os.path.abspath(os.path.join(RACINE, *str(relatif).split("/")))
    racine = os.path.abspath(RACINE)
    if not (cible == racine or cible.startswith(racine + os.sep)):
        raise ValueError("Chemin hors des archives.")
    return cible


def creer(relatif):
    chemin = absolu(relatif)
    os.makedirs(chemin, exist_ok=True)
    return chemin


# ------------------------------------------------------------------ ecriture
def deposer(relatif, nom_fichier, contenu):
    """Ecrit un fichier dans le dossier voulu, sans ecraser un homonyme."""
    dossier = creer(relatif)
    base, ext = os.path.splitext(nom_sur(nom_fichier, 90))
    nom, essai = base + ext, 1
    while os.path.exists(os.path.join(dossier, nom)):
        essai += 1
        nom = "%s (%d)%s" % (base, essai, ext)
    chemin = os.path.join(dossier, nom)
    mode = "wb" if isinstance(contenu, (bytes, bytearray)) else "w"
    with open(chemin, mode, **({} if mode == "wb" else
                               {"encoding": "utf-8"})) as fh:
        fh.write(contenu)
    return nom, os.path.getsize(chemin)


def texte_rapport(rapport):
    etats = schema.par_cle(schema.ETATS)
    etat = etats.get(rapport["etat"], etats["normale"])
    lignes = [
        "RAPPORT DE SEANCE  -  %s" % rapport["reference"],
        "=" * 58, "",
        "Cours / Live   : %s" % rapport["nom_live"],
        "Date           : %s" % rapport["date"],
        "Heure          : %s" % (rapport["heure"] or "-"),
        "Responsable    : %s" % (rapport["responsable_nom"] or "-"),
        "Etat           : %s %s" % (etat["icone"], etat["libelle"]),
        "Urgence        : %s" % rapport["urgence"],
        "Envoye le      : %s" % rapport["envoye_le"],
        "", "-- Description " + "-" * 43, rapport["description"] or "-",
        "", "-- Actions prises " + "-" * 40, rapport["actions"] or "-",
    ]
    if rapport.get("eleves"):
        lignes += ["", "-- Eleves concernes " + "-" * 38, rapport["eleves"]]
    if rapport.get("commentaires"):
        lignes += ["", "-- Commentaires " + "-" * 42, rapport["commentaires"]]
    return "\n".join(lignes) + "\n"


def assurer_rapport(rapport):
    """Cree le dossier du rapport et (re)ecrit le PDF et le texte."""
    from . import pdf

    relatif = rapport.get("dossier") or chemin_rapport(rapport)
    dossier = creer(relatif)
    squelette(mois_de(rapport["date"])[0])

    nom_pdf = nom_sur(rapport["reference"]) + ".pdf"
    try:
        with open(os.path.join(dossier, nom_pdf), "wb") as fh:
            fh.write(pdf.construire(rapport))
    except Exception as exc:                    # jamais bloquant
        with open(os.path.join(dossier, "erreur-pdf.txt"), "w",
                  encoding="utf-8") as fh:
            fh.write("PDF non genere : %s\n" % exc)
    with open(os.path.join(dossier, "rapport.txt"), "w",
              encoding="utf-8") as fh:
        fh.write(texte_rapport(rapport))
    with open(os.path.join(dossier, "rapport.json"), "w",
              encoding="utf-8") as fh:
        json.dump(rapport, fh, ensure_ascii=False, indent=2)

    if rapport.get("dossier") != relatif and rapport.get("id"):
        db.modifier("rapports", rapport["id"], {"dossier": relatif})
        rapport["dossier"] = relatif
    return relatif, dossier


def deplacer_si_besoin(rapport):
    """Apres modification, replace le dossier dans le bon mois."""
    voulu = chemin_rapport(rapport)
    ancien = rapport.get("dossier") or ""
    if ancien and ancien != voulu and os.path.isdir(absolu(ancien)):
        cible = absolu(voulu)
        os.makedirs(os.path.dirname(cible), exist_ok=True)
        if not os.path.exists(cible):
            try:
                os.rename(absolu(ancien), cible)
            except OSError:
                pass
    rapport["dossier"] = voulu
    return voulu


def tout_vider():
    """Efface tous les dossiers d'archive, puis recree les douze mois vides."""
    import shutil
    for nom in (DOSSIER_RAPPORTS, DOSSIER_SUPPORT):
        chemin = os.path.join(RACINE, nom)
        if os.path.isdir(chemin):
            shutil.rmtree(chemin, ignore_errors=True)
    squelette(datetime.date.today().year)


def supprimer_dossier(relatif):
    import shutil
    if not relatif:
        return
    try:
        chemin = absolu(relatif)
    except ValueError:
        return
    if os.path.isdir(chemin):
        shutil.rmtree(chemin, ignore_errors=True)


# ------------------------------------------------------------------ lecture
def fichiers_de(relatif):
    """Fichiers reellement presents dans un dossier."""
    try:
        chemin = absolu(relatif)
    except ValueError:
        return []
    if not os.path.isdir(chemin):
        return []
    sortie = []
    for nom in sorted(os.listdir(chemin)):
        complet = os.path.join(chemin, nom)
        if os.path.isfile(complet):
            sortie.append({
                "nom": nom,
                "chemin": relatif + "/" + nom,
                "taille": os.path.getsize(complet),
                "modifie": datetime.datetime.fromtimestamp(
                    os.path.getmtime(complet)).strftime("%d/%m/%Y %H:%M"),
            })
    return sortie


def arbre():
    """Arborescence Annee > Mois > Rapport, construite depuis la base."""
    rapports = db.tous(
        "SELECT id, reference, date, nom_live, etat, responsable_nom, dossier"
        " FROM rapports ORDER BY date DESC, reference DESC")
    annees = {}
    for rapport in rapports:
        annee, mois = mois_de(rapport["date"])
        bloc = annees.setdefault(annee, {})
        bloc.setdefault(mois, []).append(rapport)

    if not annees:
        annees[datetime.date.today().year] = {}

    sortie = []
    for annee in sorted(annees, reverse=True):
        mois_liste = []
        for nom_mois in schema.MOIS_ACCENT:
            items = annees[annee].get(nom_mois, [])
            mois_liste.append({
                "nom": nom_mois,
                "chemin": "%s/%d/%s" % (DOSSIER_RAPPORTS, annee, nom_mois),
                "nombre": len(items),
                "rapports": items,
            })
        sortie.append({
            "annee": annee,
            "chemin": "%s/%d" % (DOSSIER_RAPPORTS, annee),
            "nombre": sum(m["nombre"] for m in mois_liste),
            "mois": mois_liste,
        })
    return sortie


def statistiques():
    total_fichiers = total_octets = dossiers = 0
    for racine, sous, fichiers in os.walk(RACINE):
        dossiers += len(sous)
        for nom in fichiers:
            total_fichiers += 1
            try:
                total_octets += os.path.getsize(os.path.join(racine, nom))
            except OSError:
                pass
    return {"racine": os.path.abspath(RACINE), "dossiers": dossiers,
            "fichiers": total_fichiers, "octets": total_octets}
