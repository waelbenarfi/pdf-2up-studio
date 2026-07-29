# -*- coding: utf-8 -*-
"""Mise en page PDF d'un rapport de seance.

Une page A4 la plupart du temps, davantage si le texte est long : le curseur
descend et ouvre une nouvelle page quand il arrive en bas.
"""

import datetime
import os

import fitz

from . import arabe, schema

MARGE = 48
LARGEUR, HAUTEUR = fitz.paper_size("a4")
UTILE = LARGEUR - 2 * MARGE

ENCRE = (0.09, 0.13, 0.23)
GRIS = (0.42, 0.47, 0.57)
TRAIT = (0.85, 0.88, 0.93)
FOND = (0.96, 0.97, 0.99)
BLEU = (0.44, 0.49, 1.0)

TONS = {
    "ok": (0.13, 0.66, 0.45),
    "warn": (0.85, 0.58, 0.05),
    "danger": (0.85, 0.28, 0.22),
    "info": (0.20, 0.55, 0.85),
}

# Les polices integrees au format PDF (Helvetica et compagnie) ne
# connaissent que l'alphabet latin : un rapport ecrit en arabe en sortirait
# vide. On embarque donc une police qui couvre les deux ecritures. Arial est
# livree avec Windows et contient les formes contextuelles arabes.
CANDIDATES = {
    False: [r"C:\Windows\Fonts\arial.ttf", r"C:\Windows\Fonts\tahoma.ttf",
            r"C:\Windows\Fonts\segoeui.ttf"],
    True: [r"C:\Windows\Fonts\arialbd.ttf", r"C:\Windows\Fonts\tahomabd.ttf",
           r"C:\Windows\Fonts\segoeuib.ttf"],
}
NOMS_PDF = {False: "SuiviTexte", True: "SuiviGras"}
SECOURS = {False: "helv", True: "hebo"}      # si aucune police n'est trouvee

_FICHIERS = {}
_POLICES = {}


def fichier_police(gras):
    """Chemin de la police a embarquer, ou None s'il faut se rabattre."""
    if gras not in _FICHIERS:
        _FICHIERS[gras] = next(
            (c for c in CANDIDATES[gras] if os.path.isfile(c)), None)
    return _FICHIERS[gras]


def style(arabe_present, gras):
    """(fontname, fontfile) a passer aux fonctions de dessin de PyMuPDF.

    Une police complete pese pres d'un mega-octet une fois embarquee. On ne
    la sort donc que si le rapport contient vraiment de l'arabe ; sinon les
    polices integrees au format PDF suffisent et le fichier reste leger.
    """
    fichier = fichier_police(gras) if arabe_present else None
    return (NOMS_PDF[gras], fichier) if fichier else (SECOURS[gras], None)


def police(arabe_present=False, gras=False):
    """fitz.Font est couteux a construire : on garde celles qu'on utilise."""
    nom, fichier = style(arabe_present, gras)
    if nom not in _POLICES:
        _POLICES[nom] = (fitz.Font(fontfile=fichier) if fichier
                         else fitz.Font(nom))
    return _POLICES[nom]


def poser(page, point, texte, taille, gras=False, couleur=ENCRE,
          arabe_present=False):
    """Pose un texte court a une position donnee, arabe compris."""
    nom, fichier = style(arabe_present, gras)
    page.insert_text(point, arabe.preparer(texte), fontname=nom,
                     fontfile=fichier, fontsize=taille, color=couleur)


def largeur_texte(texte, taille, gras=False, arabe_present=False):
    return police(arabe_present, gras).text_length(
        arabe.mettre_en_forme(texte), taille)


def _fr(iso):
    """2026-07-29 -> 29/07/2026 ; 2026-07-29 14:05 -> 29/07/2026 a 14:05."""
    texte = str(iso or "")
    if len(texte) >= 10 and texte[4] == "-":
        jour = "%s/%s/%s" % (texte[8:10], texte[5:7], texte[:4])
        if len(texte) >= 16:
            return "%s à %s" % (jour, texte[11:16])
        return jour
    return texte or "—"


class Feuille(object):
    """Un document en construction, avec un curseur vertical."""

    def __init__(self, titre, arabe_present=False):
        self.doc = fitz.open()
        self.titre = titre
        self.ar = bool(arabe_present)
        self.page = None
        self.y = 0
        self.numero = 0
        self.nouvelle()

    # ---------------------------------------------------------- structure
    def nouvelle(self):
        self.page = self.doc.new_page(width=LARGEUR, height=HAUTEUR)
        self.numero += 1
        self.y = MARGE
        self._bandeau()

    def place(self, hauteur):
        if self.y + hauteur > HAUTEUR - MARGE - 26:
            self.nouvelle()

    def _bandeau(self):
        self.page.draw_rect(fitz.Rect(0, 0, LARGEUR, 8), color=None,
                            fill=BLEU)
        if self.numero > 1:
            poser(self.page, (MARGE, MARGE - 12), self.titre, 8.5,
                  couleur=GRIS, arabe_present=self.ar)
            self.y = MARGE + 6

    # ---------------------------------------------------------- ecriture
    def lignes(self, texte, taille, gras=False, largeur=UTILE):
        """Coupe le texte en lignes qui tiennent dans la largeur donnee.

        La mesure porte sur le texte *mis en forme* : en arabe, les lettres
        liees n'ont pas la meme largeur que les lettres isolees.
        """
        pol = police(self.ar, gras)
        sortie = []
        for paragraphe in str(texte).split("\n"):
            mots = paragraphe.split()
            if not mots:
                sortie.append("")
                continue
            ligne = ""
            for mot in mots:
                essai = (ligne + " " + mot).strip()
                trop_large = pol.text_length(
                    arabe.mettre_en_forme(essai), taille) > largeur
                if ligne and trop_large:
                    sortie.append(ligne)
                    ligne = mot
                else:
                    ligne = essai
            sortie.append(ligne)
        return sortie

    def hauteur_texte(self, texte, taille, gras=False, largeur=UTILE):
        return len(self.lignes(texte, taille, gras, largeur)) * taille * 1.42

    def ecrire(self, x, haut, ligne, taille, gras=False, couleur=ENCRE,
               largeur=None, base=None):
        """Pose une ligne. Ecrite en arabe, elle se cale sur le bord droit."""
        if not ligne:
            return
        pol = police(self.ar, gras)
        nom, fichier = style(self.ar, gras)
        prete = arabe.preparer(ligne, base)
        depart = x
        if largeur and (base or arabe.direction(ligne)) == "rtl":
            depart = x + largeur - pol.text_length(prete, taille)
        self.page.insert_text((depart, haut + pol.ascender * taille), prete,
                              fontname=nom, fontfile=fichier,
                              fontsize=taille, color=couleur)

    def texte(self, contenu, taille=10, gras=False, couleur=ENCRE,
              x=MARGE, largeur=UTILE, saut=6):
        contenu = str(contenu if contenu not in (None, "") else "—")
        base = arabe.direction(contenu)
        interligne = taille * 1.42
        total = 0
        for ligne in self.lignes(contenu, taille, gras, largeur):
            self.place(interligne)          # un long texte passe a la page
            self.ecrire(x, self.y, ligne, taille, gras, couleur, largeur, base)
            self.y += interligne
            total += interligne
        self.y += saut
        return total

    def trait(self, marge=10):
        self.place(marge + 2)
        self.y += marge / 2
        self.page.draw_line(fitz.Point(MARGE, self.y),
                            fitz.Point(LARGEUR - MARGE, self.y),
                            color=TRAIT, width=0.8)
        self.y += marge / 2

    def section(self, titre):
        self.place(34)
        self.y += 8
        self.page.draw_rect(fitz.Rect(MARGE, self.y + 1, MARGE + 3,
                                      self.y + 12), color=None, fill=BLEU)
        poser(self.page, (MARGE + 10, self.y + 10), titre.upper(), 8.6,
              gras=True, couleur=GRIS, arabe_present=self.ar)
        self.y += 20

    def pave(self, titre, contenu):
        self.section(titre)
        self.texte(contenu, taille=10.5, saut=4)

    def couples(self, paires, colonnes=2):
        """Petite grille etiquette / valeur."""
        largeur = UTILE / colonnes
        rangee = []
        for paire in paires:
            rangee.append(paire)
            if len(rangee) == colonnes:
                self._rangee(rangee, largeur)
                rangee = []
        if rangee:
            self._rangee(rangee, largeur)

    def _rangee(self, rangee, largeur):
        hauteur = 0
        for _, valeur in rangee:
            hauteur = max(hauteur, self.hauteur_texte(
                valeur or "—", 10.5, True, largeur - 14))
        self.place(hauteur + 22)
        depart = self.y
        for index, (etiquette, valeur) in enumerate(rangee):
            x = MARGE + index * largeur
            poser(self.page, (x, depart + 8), etiquette.upper(), 7.6,
                  couleur=GRIS, arabe_present=self.ar)
            contenu = str(valeur or "—")
            base = arabe.direction(contenu)
            for rang, ligne in enumerate(
                    self.lignes(contenu, 10.5, True, largeur - 14)):
                self.ecrire(x, depart + 12 + rang * 10.5 * 1.42, ligne,
                            10.5, True, ENCRE, largeur - 14, base)
        self.y = depart + hauteur + 20

    # ---------------------------------------------------------- final
    def pieds(self):
        total = self.doc.page_count
        edite = datetime.datetime.now().strftime("%d/%m/%Y à %H:%M")
        for index, page in enumerate(self.doc):
            y = HAUTEUR - MARGE + 8
            page.draw_line(fitz.Point(MARGE, y - 12),
                           fitz.Point(LARGEUR - MARGE, y - 12),
                           color=TRAIT, width=0.7)
            poser(page, (MARGE, y),
                  "Suivi des lives · édité le %s" % edite, 8, couleur=GRIS,
                  arabe_present=self.ar)
            libelle = "Page %d / %d" % (index + 1, total)
            recul = largeur_texte(libelle, 8, arabe_present=self.ar)
            poser(page, (LARGEUR - MARGE - recul, y), libelle, 8,
                  couleur=GRIS, arabe_present=self.ar)

    def octets(self):
        self.pieds()
        try:
            # sans cela, Arial est embarquee entiere : 1 Mo par rapport.
            # On ne garde que les caracteres reellement utilises.
            self.doc.subset_fonts(verbose=False)
        except Exception:
            pass                                  # jamais bloquant
        data = self.doc.tobytes(deflate=True, garbage=4)
        self.doc.close()
        return data


def construire(rapport, fichiers=()):
    """Renvoie les octets du PDF du rapport."""
    etats = schema.par_cle(schema.ETATS)
    etat = etats.get(rapport.get("etat"), etats["normale"])
    couleur = TONS.get(etat["ton"], TONS["info"])

    # une seule question posee une fois : ce rapport contient-il de l'arabe ?
    tout = " ".join(str(rapport.get(cle, "") or "") for cle in (
        "nom_live", "responsable_nom", "description", "actions", "eleves",
        "commentaires", "envoye_par", "maj_par"))
    tout += " " + " ".join(str(f.get("nom", "")) for f in fichiers)
    ar = arabe.contient(tout)

    feuille = Feuille("%s · %s" % (rapport["reference"], rapport["nom_live"]), ar)
    page = feuille.page

    # en-tete
    poser(page, (MARGE, MARGE + 16), "RAPPORT DE SÉANCE", 19, gras=True,
          arabe_present=ar)
    poser(page, (MARGE, MARGE + 33), rapport["reference"], 10.5, couleur=GRIS,
          arabe_present=ar)
    feuille.y = MARGE + 50

    # bandeau d'etat
    hauteur = 46
    feuille.place(hauteur + 8)
    rect = fitz.Rect(MARGE, feuille.y, LARGEUR - MARGE, feuille.y + hauteur)
    page.draw_rect(rect, color=None, fill=FOND, radius=0.14)
    page.draw_rect(fitz.Rect(MARGE, feuille.y, MARGE + 5,
                             feuille.y + hauteur), color=None, fill=couleur)
    # les polices ne savent pas dessiner d'emoji : le libelle et la barre de
    # couleur suffisent a donner l'etat au premier regard.
    poser(page, (MARGE + 18, feuille.y + 20), etat["libelle"], 13,
          gras=True, couleur=couleur, arabe_present=ar)
    poser(page, (MARGE + 18, feuille.y + 35),
          "Niveau d'urgence : %s" % str(rapport.get("urgence", "")).capitalize(),
          9.5, couleur=GRIS, arabe_present=ar)
    feuille.y += hauteur + 12

    feuille.couples([
        ("Cours / Live", rapport["nom_live"]),
        ("Responsable", rapport.get("responsable_nom")),
        ("Date", _fr(rapport["date"])),
        ("Heure", rapport.get("heure")),
    ])
    feuille.trait()

    feuille.pave("Description de ce qui s'est passé", rapport.get("description"))
    feuille.pave("Actions prises", rapport.get("actions"))
    if str(rapport.get("eleves") or "").strip():
        feuille.pave("Élèves concernés", rapport["eleves"])
    if str(rapport.get("commentaires") or "").strip():
        feuille.pave("Commentaires", rapport["commentaires"])

    if fichiers:
        feuille.section("Pièces jointes")
        for fichier in fichiers:
            feuille.texte("•  %s  (%.0f Ko)" % (fichier["nom"],
                                                fichier["taille"] / 1024.0),
                          taille=10, saut=2)

    feuille.trait(14)
    feuille.couples([
        ("Envoyé le", _fr(rapport.get("envoye_le"))),
        ("Envoyé par", rapport.get("envoye_par")),
    ])
    if int(rapport.get("retard_min") or 0) > schema.RETARD_MINUTES:
        feuille.texte("Rapport envoyé %d minutes après la fin de la séance."
                      % int(rapport["retard_min"]), taille=9.5,
                      couleur=TONS["warn"])
    if rapport.get("maj_par"):
        feuille.texte("Dernière modification : %s par %s"
                      % (_fr(rapport.get("maj_le")), rapport["maj_par"]),
                      taille=9.5, couleur=GRIS)

    return feuille.octets()
