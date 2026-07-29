# -*- coding: utf-8 -*-
"""Ecrire de l'arabe dans un PDF.

Un PDF ne sait pas ecrire l'arabe tout seul : il pose des caracteres les uns
apres les autres, de gauche a droite. Il manque deux choses.

1. **La liaison des lettres.** En arabe une lettre change de dessin selon sa
   place dans le mot : isolee, au debut, au milieu, a la fin. Unicode fournit
   ces quatre dessins dans le bloc « formes de presentation » (U+FE70..U+FEFF)
   et c'est a nous de choisir le bon pour chaque lettre.

2. **Le sens de lecture.** L'arabe se lit de droite a gauche, les chiffres et
   les mots latins restent de gauche a droite. Il faut donc reordonner la
   ligne avant de la dessiner.

Ce module fait les deux, sans aucune bibliotheque exterieure.
"""

# ----------------------------------------------------------------- tables
# base : (isolee, finale, initiale, mediane) ; None = ce dessin n'existe pas.
# Une lettre qui n'a ni initiale ni mediane ne se lie qu'a sa droite.
FORMES = {
    0x0621: (0xFE80, None, None, None),      # ء
    0x0622: (0xFE81, 0xFE82, None, None),    # آ
    0x0623: (0xFE83, 0xFE84, None, None),    # أ
    0x0624: (0xFE85, 0xFE86, None, None),    # ؤ
    0x0625: (0xFE87, 0xFE88, None, None),    # إ
    0x0626: (0xFE89, 0xFE8A, 0xFE8B, 0xFE8C),  # ئ
    0x0627: (0xFE8D, 0xFE8E, None, None),    # ا
    0x0628: (0xFE8F, 0xFE90, 0xFE91, 0xFE92),  # ب
    0x0629: (0xFE93, 0xFE94, None, None),    # ة
    0x062A: (0xFE95, 0xFE96, 0xFE97, 0xFE98),  # ت
    0x062B: (0xFE99, 0xFE9A, 0xFE9B, 0xFE9C),  # ث
    0x062C: (0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0),  # ج
    0x062D: (0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4),  # ح
    0x062E: (0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8),  # خ
    0x062F: (0xFEA9, 0xFEAA, None, None),    # د
    0x0630: (0xFEAB, 0xFEAC, None, None),    # ذ
    0x0631: (0xFEAD, 0xFEAE, None, None),    # ر
    0x0632: (0xFEAF, 0xFEB0, None, None),    # ز
    0x0633: (0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4),  # س
    0x0634: (0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8),  # ش
    0x0635: (0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC),  # ص
    0x0636: (0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0),  # ض
    0x0637: (0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4),  # ط
    0x0638: (0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8),  # ظ
    0x0639: (0xFEC9, 0xFECA, 0xFECB, 0xFECC),  # ع
    0x063A: (0xFECD, 0xFECE, 0xFECF, 0xFED0),  # غ
    0x0641: (0xFED1, 0xFED2, 0xFED3, 0xFED4),  # ف
    0x0642: (0xFED5, 0xFED6, 0xFED7, 0xFED8),  # ق
    0x0643: (0xFED9, 0xFEDA, 0xFEDB, 0xFEDC),  # ك
    0x0644: (0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0),  # ل
    0x0645: (0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4),  # م
    0x0646: (0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8),  # ن
    0x0647: (0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC),  # ه
    0x0648: (0xFEED, 0xFEEE, None, None),    # و
    0x0649: (0xFEEF, 0xFEF0, None, None),    # ى
    0x064A: (0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4),  # ي
}

# لا et ses variantes : deux lettres, un seul dessin. (isolee, finale)
LIGATURES = {
    (0x0644, 0x0622): (0xFEF5, 0xFEF6),
    (0x0644, 0x0623): (0xFEF7, 0xFEF8),
    (0x0644, 0x0625): (0xFEF9, 0xFEFA),
    (0x0644, 0x0627): (0xFEFB, 0xFEFC),
}

TATWEEL = 0x0640          # ـ  allonge la liaison, ne change pas de dessin

# Voyelles et signes qui se posent au-dessus ou en dessous : ils ne coupent
# jamais une liaison, on les saute quand on regarde les lettres voisines.
def _transparent(code):
    return (0x064B <= code <= 0x065F or code == 0x0670
            or 0x06D6 <= code <= 0x06ED or 0x0610 <= code <= 0x061A)


PLAGES_RTL = ((0x0590, 0x05FF), (0x0600, 0x06FF), (0x0700, 0x074F),
              (0x0750, 0x077F), (0x08A0, 0x08FF), (0xFB1D, 0xFDFF),
              (0xFE70, 0xFEFF))

MIROIRS = {'(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{',
           '<': '>', '>': '<', '«': '»', '»': '«'}


def _rtl(code):
    return any(debut <= code <= fin for debut, fin in PLAGES_RTL)


def contient(texte):
    """Y a-t-il de l'arabe (ou de l'hebreu) la-dedans ?"""
    return any(_rtl(ord(c)) for c in str(texte or ""))


def direction(texte):
    """Sens de lecture d'un paragraphe : donne par sa premiere lettre."""
    for caractere in str(texte or ""):
        code = ord(caractere)
        if _rtl(code):
            return "rtl"
        if caractere.isalpha():
            return "ltr"
    return "ltr"


# ------------------------------------------------------------ 1. liaisons
def _lie_a_gauche(code):
    """Cette lettre peut-elle se lier a celle qui la suit ?"""
    if code == TATWEEL:
        return True
    formes = FORMES.get(code)
    return bool(formes and formes[2])          # elle a une forme initiale


def _lie_a_droite(code):
    """Cette lettre peut-elle se lier a celle qui la precede ?"""
    if code == TATWEEL:
        return True
    formes = FORMES.get(code)
    return bool(formes and formes[1])          # elle a une forme finale


def mettre_en_forme(texte):
    """Remplace chaque lettre par le dessin qui convient a sa place."""
    codes = [ord(c) for c in str(texte or "")]

    # les ligatures d'abord : لا compte ensuite pour une seule lettre
    fusionnes = []
    index = 0
    while index < len(codes):
        paire = (codes[index], codes[index + 1]) if index + 1 < len(codes) else None
        if paire in LIGATURES:
            fusionnes.append(("ligature", LIGATURES[paire]))
            index += 2
        else:
            fusionnes.append(("lettre", codes[index]))
            index += 1

    def voisin(depart, pas):
        """Lettre significative la plus proche, en sautant les voyelles.

        Une ligature لا vaut deux lettres : c'est son alef qui ferme le mot
        du côté gauche, et son lam qui l'ouvre du côté droit. On renvoie donc
        celle des deux que le voisin va réellement rencontrer.
        """
        position = depart + pas
        while 0 <= position < len(fusionnes):
            genre, valeur = fusionnes[position]
            if genre == "ligature":
                return 0x0627 if pas < 0 else 0x0644
            if not _transparent(valeur):
                return valeur
            position += pas
        return None

    sortie = []
    for position, (genre, valeur) in enumerate(fusionnes):
        precedente = voisin(position, -1)
        suivante = voisin(position, +1)
        # une ligature se termine par un alef : rien ne s'y accroche a gauche
        lie_avant = precedente is not None and _lie_a_gauche(precedente)
        lie_apres = (suivante is not None and _lie_a_droite(suivante)
                     and genre != "ligature")

        if genre == "ligature":
            isolee, finale = valeur
            sortie.append(chr(finale if lie_avant else isolee))
            continue

        formes = FORMES.get(valeur)
        if not formes:
            sortie.append(chr(valeur))
            continue
        isolee, finale, initiale, mediane = formes
        if lie_avant and lie_apres:
            choisie = mediane or finale or isolee
        elif lie_avant:
            choisie = finale or isolee
        elif lie_apres:
            choisie = initiale or isolee
        else:
            choisie = isolee
        sortie.append(chr(choisie))
    return "".join(sortie)


# --------------------------------------------------------- 2. sens de lecture
def _classe(caractere):
    """R = droite a gauche, L = gauche a droite, N = neutre."""
    code = ord(caractere)
    if _rtl(code):
        return "R"
    if caractere.isalpha() or caractere.isdigit():
        return "L"
    return "N"


def ordre_visuel(texte, base=None):
    """Reordonne une ligne pour qu'elle se dessine correctement.

    Les neutres (espaces, ponctuation) prennent le sens de leurs voisins ;
    entre deux sens differents, ils prennent celui du paragraphe.
    """
    ligne = str(texte or "")
    if not ligne:
        return ligne
    base = base or direction(ligne)

    classes = [_classe(c) for c in ligne]

    # 1. les neutres heritent du sens qui les entoure
    position = 0
    while position < len(classes):
        if classes[position] != "N":
            position += 1
            continue
        fin = position
        while fin < len(classes) and classes[fin] == "N":
            fin += 1
        avant = classes[position - 1] if position > 0 else None
        apres = classes[fin] if fin < len(classes) else None
        herite = avant if avant == apres and avant else ("R" if base == "rtl" else "L")
        for index in range(position, fin):
            classes[index] = herite
        position = fin

    # 2. decoupage en tranches de meme sens
    tranches, debut = [], 0
    for index in range(1, len(classes) + 1):
        if index == len(classes) or classes[index] != classes[debut]:
            tranches.append((classes[debut], ligne[debut:index]))
            debut = index

    # 3. assemblage : en arabe on part de la droite
    if base == "rtl":
        tranches.reverse()
    morceaux = []
    for sens, contenu in tranches:
        if sens == "R":
            contenu = "".join(MIROIRS.get(c, c) for c in reversed(contenu))
        morceaux.append(contenu)
    return "".join(morceaux)


def preparer(texte, base=None):
    """Liaisons puis sens de lecture : le texte prêt à être dessiné."""
    if not contient(texte):
        return str(texte or "")
    return ordre_visuel(mettre_en_forme(texte), base)
