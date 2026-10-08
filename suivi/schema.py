# -*- coding: utf-8 -*-
"""Suivi des lives - vocabulaire et tables.

Un seul endroit definit les listes de choix : elles sont envoyees telles
quelles a l'interface (window.SUIVI), donc le serveur et l'ecran ne peuvent
pas diverger.
"""

import re

VERSION = 2

MOIS = [
    "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
]
MOIS_ACCENT = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
]
JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]

# ---------------------------------------------------------------- rapports
# Les trois etats du point 1 de la demande.
# `icone` part dans les fichiers texte de l'archive, ou un emoji se lit tres
# bien ; `symbole` nomme le dessin du jeu d'icones que l'interface trace.
ETATS = [
    {"cle": "normale", "libelle": "Séance normale", "icone": "✅",
     "symbole": "coche_cercle",
     "ton": "ok", "aide": "Tout s'est bien passé"},
    {"cle": "petit", "libelle": "Petit problème", "icone": "⚠️",
     "symbole": "alerte",
     "ton": "warn", "aide": "Gênant mais la séance a continué"},
    {"cle": "important", "libelle": "Problème important", "icone": "❌",
     "symbole": "croix_cercle",
     "ton": "danger", "aide": "La séance a été interrompue ou annulée"},
]

URGENCES = [
    {"cle": "faible", "libelle": "Faible", "ton": "ok"},
    {"cle": "moyenne", "libelle": "Moyenne", "ton": "info"},
    {"cle": "haute", "libelle": "Haute", "ton": "warn"},
    {"cle": "critique", "libelle": "Critique", "ton": "danger"},
]

# Texte pre-rempli quand la seance s'est bien passee (point 3 de la demande).
TEXTE_RAS = ("Aucun problème signalé. "
             "Le cours s'est déroulé normalement.")
ACTIONS_RAS = "Aucune action particulière."

# ---------------------------------------------------------------- lives
STATUTS_LIVE = [
    {"cle": "planifie", "libelle": "Planifié", "ton": "info"},
    {"cle": "en_cours", "libelle": "En cours", "ton": "accent"},
    {"cle": "termine", "libelle": "Terminé", "ton": "ok"},
    {"cle": "annule", "libelle": "Annulé", "ton": "muted"},
]

PLATEFORMES = ["Zoom", "Google Meet", "Microsoft Teams", "YouTube Live",
               "Facebook Live", "Autre"]

# ---------------------------------------------------------------- niveaux
# Le calendrier nomme ses seances « Matiere | Niveau | Groupe » -- par
# exemple « Anglais | Bac Lettres | Elite ». Le niveau est donc deja ecrit
# sur chaque seance : la fiche du professeur n'a pas a le redemander, elle
# n'a qu'a le relire. Un niveau saisi a la main sur la fiche se demoderait
# au premier changement de planning, et personne ne le corrigerait.
#
# Les familles sont dans l'ordre de la scolarite, parce que c'est l'ordre
# dans lequel on s'attend a les lire.
NIVEAUX_FAMILLES = ["7ème", "8ème", "9ème", "1ère", "2ème", "3ème", "Bac"]

# Les sections de chaque famille qui en a. Elles servent a ecrire « toutes
# les sections » au lieu de six noms : un professeur qui prend les six bacs
# se lit d'un coup d'oeil. La 2eme annee n'a ni Math ni Technique -- ces
# deux sections ne se separent qu'en 3eme.
SECTIONS = {
    "2ème": ["Sciences", "Informatique", "Économie", "Lettres"],
    "3ème": ["Math", "Sciences", "Technique", "Informatique", "Économie",
             "Lettres"],
    "Bac": ["Math", "Sciences", "Technique", "Informatique", "Économie",
            "Lettres"],
}

# ---------------------------------------------------------------- taches
# Le deroule d'une seance, du premier coup de fil au depot du fichier final.
# L'ordre de la liste est l'ordre d'affichage : il raconte la journee, et
# c'est aussi l'ordre dans lequel les cases se cochent.
MOMENTS = [
    {"cle": "avant", "libelle": "Avant le live", "symbole": "horloge",
     "ton": "info"},
    {"cle": "pendant", "libelle": "Pendant le live", "symbole": "onde",
     "ton": "accent"},
    {"cle": "apres", "libelle": "Après le live", "symbole": "coche_cercle",
     "ton": "ok"},
]

TACHES = [
    {"cle": "appel_prof", "moment": "avant", "symbole": "telephone",
     "libelle": "Appeler le professeur",
     "aide": "Confirmer sa présence et l'horaire de la séance"},
    {"cle": "fichier_avant", "moment": "avant", "symbole": "recevoir",
     "libelle": "Récupérer le fichier de la séance",
     "aide": "Support de cours reçu du professeur"},
    {"cle": "depot_avant", "moment": "avant", "symbole": "nuage",
     "libelle": "Déposer le fichier sur le site Wael Academy",
     "aide": "Mis en ligne avant le début du live"},
    {"cle": "ouverture", "moment": "pendant", "symbole": "lecture",
     "libelle": "Ouvrir le live",
     "aide": "Salle ouverte à l'heure prévue"},
    {"cle": "controle", "moment": "pendant", "symbole": "oeil",
     "libelle": "Contrôler le live",
     "aide": "Son, image et présence surveillés pendant toute la séance"},
    {"cle": "depot_apres", "moment": "apres", "symbole": "televerser",
     "libelle": "Déposer le fichier après le live",
     "aide": "Enregistrement ou support final mis en ligne"},
    # Le rapport ferme la seance : il raconte ce qui s'est passe, depot
    # compris. L'ecrire avant d'avoir depose le fichier obligeait a
    # revenir dessus, et la case restante apres l'envoi du rapport donnait
    # l'impression d'une seance jamais finie.
    {"cle": "rapport", "moment": "apres", "symbole": "document",
     "libelle": "Rédiger le rapport après le live",
     "aide": "Rapport envoyé une fois la séance terminée"},
]

CLES_TACHES = [item["cle"] for item in TACHES]

# La case « Rédiger le rapport » se coche toute seule quand le rapport part
# pour de bon : deux endroits ou dire la meme chose finiraient par diverger.
TACHE_RAPPORT = "rapport"

# L'etape qui fait basculer la seance « en cours » : la salle est ouverte,
# le live tourne. Nommee ici pour que la regle de statut ne depende pas
# d'une chaine recopiee au milieu du code.
TACHE_OUVERTURE = "ouverture"

# ---------------------------------------------------------------- support
STATUTS_TICKET = [
    {"cle": "nouveau", "libelle": "Nouveau", "ton": "info"},
    {"cle": "en_cours", "libelle": "En cours", "ton": "warn"},
    {"cle": "resolu", "libelle": "Résolu", "ton": "ok"},
]

CATEGORIES_TICKET = [
    "Problème de son", "Problème d'image", "Connexion / réseau",
    "Plateforme de live", "Compte / accès", "Matériel",
    "Enregistrement", "Autre",
]

PRIORITES = [
    {"cle": "basse", "libelle": "Basse", "ton": "muted"},
    {"cle": "moyenne", "libelle": "Moyenne", "ton": "info"},
    {"cle": "haute", "libelle": "Haute", "ton": "warn"},
    {"cle": "urgente", "libelle": "Urgente", "ton": "danger"},
]

# Au-dela de cet ecart, deux seances de meme intitule ne sont plus la
# meme seance deplacee mais deux seances differentes. Trois jours couvrent
# ce qui arrive vraiment -- un dimanche qui passe au samedi, un mardi au
# jeudi -- sans risquer de confondre deux semaines de suite.
JOURS_REPLANIFICATION = 3

# Combien de seances une personne peut suivre dans une meme soiree. C'est
# la regle par defaut, celle qui s'applique sans que personne ait rien a
# regler ; une fiche peut descendre plus bas (un renfort a trois), jamais
# monter plus haut par la repartition automatique.
#
# Elle ne flechit pas : une seance que plus personne ne peut prendre reste
# sans responsable et se voit, plutot que d'etre posee sur quelqu'un qui en
# a deja quatre. Un planning trop charge pour l'equipe est un fait a
# regarder, pas un fait a cacher.
MAX_SEANCES_SOIR = 4

# Duree d'une seance quand l'heure de fin n'est pas donnee. Les lives de
# l'academie durent deux heures ; c'est aussi la fin supposee pour mesurer
# le retard d'un rapport qui n'est rattache a aucune seance -- les deux
# doivent dire la meme chose, sinon un rapport parait en retard de trente
# minutes sans que personne ait traine.
DUREE_SEANCE_MIN = 120


# ------------------------------------------------------------------ heure
# L'academie vit a l'heure de Tunis. Le serveur, lui, tourne en UTC chez
# l'hebergeur : sans ce decalage, l'horloge de « Ce soir » retardait d'une
# heure, et entre 23 h et minuit la journee affichee etait celle de la
# veille -- un rapport ecrit apres le dernier live changeait de date.
#
# La Tunisie est a UTC+1 toute l'annee (plus de changement d'heure depuis
# 2008), donc un decalage fixe suffit et ne depend d'aucune base de fuseaux.
FUSEAU_MINUTES = 60
FUSEAU_NOM = "Afrique/Tunis (UTC+1)"


# ---------------------------------------------------------------- equipe
# Tout le monde suit les lives ; ce qui distingue l'administrateur, c'est ce
# qu'il peut faire en plus : gerer l'equipe, poser les mots de passe, effacer.
FONCTION = "Technicien de live"
FONCTIONS = [FONCTION]

ROLES = [
    {"cle": "admin", "libelle": "Administrateur", "ton": "accent",
     "aide": "Gère l'équipe et les mots de passe, peut tout modifier"},
    {"cle": "technicien", "libelle": "Technicien de live", "ton": "muted",
     "aide": "Suit les séances, écrit les rapports, ouvre des tickets"},
]
CLES_ROLES = [item["cle"] for item in ROLES]

# A qui revient l'administration si personne ne l'a encore. Au premier
# demarrage apres la mise a jour, la personne qui porte ce nom devient
# administratrice ; a defaut, la plus anciennement enregistree.
ADMIN_PAR_DEFAUT = "Oussama Mzali"

# Un mot de passe trop court se devine ; au-dela de la longueur, rien n'est
# impose : une regle compliquee pousse a le noter sur un papier.
MDP_MIN = 8

# ------------------------------------------------------------ performance
# Le score mensuel, et ce qui le compose.
#
# Regle de conception : ne noter que ce que la personne ne controle pas
# elle-meme. Les cases du deroule sont declaratives -- personne ne verifie
# qu'un professeur a vraiment ete appele. Des qu'une case coche paie, le
# chemin le plus court vers la prime est de tout cocher, pas de tout faire,
# et le deroule cesse de dire si la seance est prete.
#
# D'ou :
#   couverture   le rapport existe ou n'existe pas ;
#   ponctualite  compare a la fin PREVUE de la seance, que le technicien ne
#                fixe pas ;
#   preparation  les etapes d'avant-live cochees AVANT le debut du live,
#                d'apres l'horodatage du serveur : tout cocher le lendemain
#                ne rapporte rien ici ;
#   charge       le volume assure, rapporte au plus charge du mois, pour que
#                bien travailler sur quarante seances pese plus que sur
#                quatre -- sans recompenser l'accaparement, la part etant
#                plafonnee et minoritaire.
#
# Une etape revient a QUI L'A COCHEE, pas au responsable de la seance : il
# arrive qu'on fasse le travail d'un collegue, et le score doit le dire.
# Couverture et ponctualite, elles, restent attachees au responsable : c'est
# lui qui repond de ses seances.
#
# Volontairement absents : les incidents. Les compter en negatif apprend a
# cacher les problemes et punit celui qui herite des seances difficiles.
# Ils sont affiches comme contexte, jamais retires du score.
POIDS = [
    {"cle": "couverture", "libelle": "Couverture des rapports", "poids": 30,
     "aide": "Part de vos séances terminées qui ont bien reçu un rapport"},
    {"cle": "preparation", "libelle": "Préparation à temps", "poids": 30,
     "aide": "Parmi les étapes d'avant-live que VOUS avez cochées, celles "
             "faites avant le début de la séance"},
    {"cle": "ponctualite", "libelle": "Ponctualité", "poids": 25,
     "aide": "Rapports envoyés dans l'heure qui suit la fin de la séance"},
    {"cle": "charge", "libelle": "Charge assurée", "poids": 15,
     "aide": "Séances tenues et étapes cochées, y compris pour les autres, "
             "rapportées au plus chargé du mois"},
]

# En dessous, le score n'a pas de sens : trois seances parfaites battraient
# quarante seances a 95 %. La personne reste affichee, mais hors classement.
# Le second seuil ouvre le classement a qui n'a presque pas de seances a son
# nom mais coche beaucoup d'etapes pour les autres.
SEUIL_ELIGIBLE = 5
SEUIL_ETAPES = 15

# Au-dela de cette part d'etapes cochees apres la fin de la seance, l'ecran
# le signale a l'administrateur. Ce n'est pas une sanction, c'est une
# question a poser.
SEUIL_APRES_COUP = 60

COULEURS = ["#6f7cff", "#22d3ee", "#34d399", "#fbbf24", "#f97066",
            "#c084fc", "#fb923c", "#38bdf8", "#a3e635"]

# Au dela de ce delai apres la fin du live, le rapport est marque en retard.
RETARD_MINUTES = 60

# Types de fichiers acceptes en piece jointe (point 1 et 6).
EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
              ".pdf", ".mp4", ".webm", ".mov", ".mkv", ".avi",
              ".txt", ".log", ".doc", ".docx", ".xls", ".xlsx", ".zip"]
TAILLE_MAX_MO = 50


# Tables videes par « Tout remettre a zero » (dans cet ordre : les enfants
# d'abord, pour ne pas heurter les cles etrangeres).
TABLES_DONNEES = ["messages", "fichiers", "tickets", "notes", "taches",
                  "comptes", "distinctions", "rapports", "lives", "personnes",
                  "professeurs", "journal"]

# Tables dont la cle primaire est un entier auto-incremente. `parametres` est
# la seule a en etre depourvue : sa cle est un texte. La distinction sert a
# savoir ou ajouter un RETURNING id sous PostgreSQL.
TABLES_ID = ["personnes", "lives", "rapports", "fichiers", "tickets",
             "messages", "journal", "taches", "notes", "comptes",
             "distinctions", "professeurs"]


DDL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS parametres (
  cle    TEXT PRIMARY KEY,
  valeur TEXT NOT NULL DEFAULT ''
);

-- `heure_min` et `jours` disent quand la personne peut prendre une seance :
-- « pas avant 19 h », « mardi et mercredi ». Vides, elle peut tout prendre.
CREATE TABLE IF NOT EXISTS personnes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nom          TEXT    NOT NULL,
  fonction     TEXT    NOT NULL DEFAULT 'Technicien de live',
  email        TEXT    NOT NULL DEFAULT '',
  telephone    TEXT    NOT NULL DEFAULT '',
  couleur      TEXT    NOT NULL DEFAULT '#6f7cff',
  heure_min    TEXT    NOT NULL DEFAULT '',
  jours        TEXT    NOT NULL DEFAULT '',
  max_soir     INTEGER,
  actif        INTEGER NOT NULL DEFAULT 1,
  cree_le      TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS lives (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  titre          TEXT    NOT NULL,
  date           TEXT    NOT NULL,
  heure          TEXT    NOT NULL DEFAULT '',
  heure_fin      TEXT    NOT NULL DEFAULT '',
  formateur      TEXT    NOT NULL DEFAULT '',
  plateforme     TEXT    NOT NULL DEFAULT '',
  responsable_id INTEGER REFERENCES personnes(id) ON DELETE SET NULL,
  statut         TEXT    NOT NULL DEFAULT 'planifie',
  note           TEXT    NOT NULL DEFAULT '',
  cree_le        TEXT    NOT NULL,
  maj_le         TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS i_lives_date ON lives(date);
CREATE INDEX IF NOT EXISTS i_lives_resp ON lives(responsable_id);

CREATE TABLE IF NOT EXISTS rapports (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  reference       TEXT    NOT NULL UNIQUE,
  live_id         INTEGER REFERENCES lives(id) ON DELETE SET NULL,
  date            TEXT    NOT NULL,
  heure           TEXT    NOT NULL DEFAULT '',
  nom_live        TEXT    NOT NULL,
  responsable_id  INTEGER REFERENCES personnes(id) ON DELETE SET NULL,
  responsable_nom TEXT    NOT NULL DEFAULT '',
  etat            TEXT    NOT NULL DEFAULT 'normale',
  description     TEXT    NOT NULL DEFAULT '',
  eleves          TEXT    NOT NULL DEFAULT '',
  urgence         TEXT    NOT NULL DEFAULT 'faible',
  actions         TEXT    NOT NULL DEFAULT '',
  commentaires    TEXT    NOT NULL DEFAULT '',
  dossier         TEXT    NOT NULL DEFAULT '',
  envoye_le       TEXT    NOT NULL,
  envoye_par      TEXT    NOT NULL DEFAULT '',
  retard_min      INTEGER NOT NULL DEFAULT 0,
  maj_le          TEXT    NOT NULL,
  maj_par         TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_rapports_date ON rapports(date);
CREATE INDEX IF NOT EXISTS i_rapports_live ON rapports(live_id);

CREATE TABLE IF NOT EXISTS fichiers (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  cible    TEXT    NOT NULL,          -- 'rapport' ou 'ticket'
  cible_id INTEGER NOT NULL,
  nom      TEXT    NOT NULL,
  chemin   TEXT    NOT NULL,          -- relatif au dossier d'archives
  taille   INTEGER NOT NULL DEFAULT 0,
  type     TEXT    NOT NULL DEFAULT '',
  cree_le  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS i_fichiers_cible ON fichiers(cible, cible_id);

CREATE TABLE IF NOT EXISTS tickets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  reference     TEXT    NOT NULL UNIQUE,
  sujet         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  categorie     TEXT    NOT NULL DEFAULT 'Autre',
  priorite      TEXT    NOT NULL DEFAULT 'moyenne',
  statut        TEXT    NOT NULL DEFAULT 'nouveau',
  demandeur_id  INTEGER REFERENCES personnes(id) ON DELETE SET NULL,
  demandeur_nom TEXT    NOT NULL DEFAULT '',
  assigne_id    INTEGER REFERENCES personnes(id) ON DELETE SET NULL,
  live_id       INTEGER REFERENCES lives(id) ON DELETE SET NULL,
  dossier       TEXT    NOT NULL DEFAULT '',
  cree_le       TEXT    NOT NULL,
  maj_le        TEXT    NOT NULL,
  resolu_le     TEXT    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_tickets_statut ON tickets(statut);

CREATE TABLE IF NOT EXISTS messages (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  auteur    TEXT    NOT NULL DEFAULT '',
  texte     TEXT    NOT NULL,
  cree_le   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS i_messages_ticket ON messages(ticket_id);

CREATE TABLE IF NOT EXISTS journal (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  quand  TEXT NOT NULL,
  qui    TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  cible  TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS i_journal_quand ON journal(quand);
"""

# Tables apparues apres la premiere version. Elles sont ajoutees a DDL pour
# une base neuve, et rejouees seules sur une base deja installee : sans cela
# une nouveaute n'atteindrait jamais une base de production deja en place,
# puisque l'installation complete ne tourne qu'une fois.
#
# Une tache n'a de ligne qu'une fois cochee : la liste de reference est
# TACHES, pas la table. Rien a migrer le jour ou une etape s'ajoute.
AJOUTS = """
CREATE TABLE IF NOT EXISTS taches (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  live_id  INTEGER NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  cle      TEXT    NOT NULL,
  fait     INTEGER NOT NULL DEFAULT 0,
  fait_le  TEXT    NOT NULL DEFAULT '',
  fait_par TEXT    NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS i_taches_live_cle ON taches(live_id, cle);

CREATE TABLE IF NOT EXISTS notes (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  live_id INTEGER NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  cle     TEXT    NOT NULL,
  texte   TEXT    NOT NULL,
  auteur  TEXT    NOT NULL DEFAULT '',
  cree_le TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS i_notes_live_cle ON notes(live_id, cle);

-- `mdp_le` date le mot de passe et sert de version a la session : le changer
-- ferme les sessions ouvertes ailleurs. `maj_le` date le compte en general
-- (role compris) et n'a pas cet effet -- sans quoi nommer quelqu'un
-- administrateur le deconnecterait sur-le-champ.
CREATE TABLE IF NOT EXISTS comptes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
  role        TEXT    NOT NULL DEFAULT 'technicien',
  mdp         TEXT    NOT NULL DEFAULT '',
  mdp_le      TEXT    NOT NULL DEFAULT '',
  maj_le      TEXT    NOT NULL DEFAULT '',
  maj_par     TEXT    NOT NULL DEFAULT '',
  derniere    TEXT    NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS i_comptes_personne ON comptes(personne_id);

-- L'employe du mois : la decision est humaine, la trace est ecrite. Un seul
-- par mois, d'ou l'index unique.
CREATE TABLE IF NOT EXISTS distinctions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  mois        TEXT    NOT NULL,
  personne_id INTEGER NOT NULL REFERENCES personnes(id) ON DELETE CASCADE,
  motif       TEXT    NOT NULL DEFAULT '',
  score       INTEGER NOT NULL DEFAULT 0,
  decide_le   TEXT    NOT NULL,
  decide_par  TEXT    NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS i_distinctions_mois ON distinctions(mois);

-- Le repertoire des professeurs. La premiere etape de chaque seance est de
-- les appeler : le numero doit etre dans l'application, pas dans un carnet.
-- `report_*` : le decalage fixe de ce professeur. « Ses seances du
-- dimanche sont toujours le samedi a 19 h » est une regle durable, pas une
-- correction a refaire apres chaque import.
CREATE TABLE IF NOT EXISTS professeurs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nom          TEXT    NOT NULL,
  telephone    TEXT    NOT NULL DEFAULT '',
  matiere      TEXT    NOT NULL DEFAULT '',
  tarif        TEXT    NOT NULL DEFAULT '',
  note         TEXT    NOT NULL DEFAULT '',
  report_jour  TEXT    NOT NULL DEFAULT '',
  report_vers  TEXT    NOT NULL DEFAULT '',
  report_heure TEXT    NOT NULL DEFAULT '',
  actif        INTEGER NOT NULL DEFAULT 1,
  cree_le      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS i_professeurs_nom ON professeurs(nom);
"""

# Consultees au demarrage pour savoir s'il reste quelque chose a creer.
TABLES_AJOUTEES = ["taches", "notes", "comptes", "distinctions", "professeurs"]

# Colonnes ajoutees apres coup. Une table se cree d'un bloc avec un simple
# IF NOT EXISTS ; une colonne demande de regarder d'abord ce qui est en
# place, et les deux moteurs ne le disent pas de la meme facon.
#
# `fait_par_id` et `auteur_id` doublent `fait_par` et `auteur`, qui restent
# pour l'affichage et pour les archives deja ecrites. Le nom seul ne suffit
# plus : le score mensuel compte qui a fait le travail, et renommer
# quelqu'un detacherait son historique la veille de la prime.
COLONNES_AJOUTEES = [
    ("taches", "fait_par_id", "INTEGER"),
    ("notes", "auteur_id", "INTEGER"),
    # `formateur` reste le nom affiche ; `professeur_id` est le lien vers la
    # fiche, donc vers le numero de telephone.
    ("lives", "professeur_id", "INTEGER"),
    # « Le professeur ne s'est pas presente » vivait dans la description, en
    # texte libre : impossible a compter. C'est pourtant ce qu'on veut savoir
    # d'un professeur au bout de trois mois.
    ("rapports", "absent_prof", "INTEGER"),
    # Le tarif a ete retire de l'interface en octobre 2026, a la demande.
    # La colonne reste : elle porte des montants deja saisis, et une base
    # neuve doit avoir la meme forme qu'une base existante. Plus rien ne la
    # lit ni ne l'ecrit -- c'est de la donnee mise de cote, pas effacee.
    ("professeurs", "tarif", "TEXT"),
    # La disponibilite de chacun. Une contrainte vraie de la personne --
    # « je ne suis pas libre avant 19 h » -- et non d'une repartition :
    # posee une fois, elle vaut pour toutes les suivantes.
    ("personnes", "heure_min", "TEXT"),
    ("personnes", "jours", "TEXT"),
    # Le plafond par soiree. Vide, la personne prend sa part pleine ; c'est
    # le cas de presque tout le monde, donc rien a recoller pour l'existant.
    ("personnes", "max_soir", "INTEGER"),
    # Le report fixe d'un professeur : jour d'origine, jour d'arrivee, heure.
    ("professeurs", "report_jour", "TEXT"),
    ("professeurs", "report_vers", "TEXT"),
    ("professeurs", "report_heure", "TEXT"),
]

# Rattachement des lignes deja ecrites : le nom est ce qu'on a.
RECOLLAGES = [
    ("UPDATE taches SET fait_par_id ="
     " (SELECT p.id FROM personnes p WHERE p.nom = taches.fait_par)"
     " WHERE fait_par_id IS NULL AND fait_par != ''"),
    ("UPDATE notes SET auteur_id ="
     " (SELECT p.id FROM personnes p WHERE p.nom = notes.auteur)"
     " WHERE auteur_id IS NULL AND auteur != ''"),
    ("UPDATE lives SET professeur_id ="
     " (SELECT pr.id FROM professeurs pr WHERE pr.nom = lives.formateur)"
     " WHERE professeur_id IS NULL AND formateur != ''"),
    # Une colonne ajoutee arrive a NULL sur les lignes deja ecrites, alors
    # que le schema dit « texte, vide par defaut ». Deux facons d'etre vide
    # pour la meme chose finissent par se voir : on les ramene a une seule.
    ("UPDATE professeurs SET tarif = '' WHERE tarif IS NULL"),
    ("UPDATE personnes SET heure_min = '' WHERE heure_min IS NULL"),
    ("UPDATE personnes SET jours = '' WHERE jours IS NULL"),
    ("UPDATE professeurs SET report_jour = '' WHERE report_jour IS NULL"),
    ("UPDATE professeurs SET report_vers = '' WHERE report_vers IS NULL"),
    ("UPDATE professeurs SET report_heure = '' WHERE report_heure IS NULL"),
]

# Un commentaire est libre mais pas sans fin : au-dela, c'est un rapport.
NOTE_MAX = 1000

DDL = DDL + AJOUTS


def _postgres(texte):
    """Traduit un morceau de schema du dialecte SQLite vers PostgreSQL.

    Deriver la variante plutot que la recopier evite que les deux versions
    divergent : il n'y a qu'un seul endroit ou ajouter une colonne. Seules
    deux choses separent les dialectes ici, les PRAGMA (propres a SQLite) et
    la facon de declarer une cle primaire auto-incrementee.
    """
    sans_pragma = re.sub(r"^\s*PRAGMA[^;]*;\s*$", "", texte, flags=re.MULTILINE)
    return sans_pragma.replace("INTEGER PRIMARY KEY AUTOINCREMENT",
                               "SERIAL PRIMARY KEY")


def ddl_postgres():
    """Le schema complet, dit en PostgreSQL."""
    return _postgres(DDL)


def ddl_postgres_ajouts():
    """Les seules tables ajoutees apres coup, pour une base deja installee."""
    return _postgres(AJOUTS)


def par_cle(liste):
    return {item["cle"]: item for item in liste}


def constantes():
    """Envoye tel quel a l'interface."""
    return {
        "etats": ETATS,
        "urgences": URGENCES,
        "statutsLive": STATUTS_LIVE,
        "statutsTicket": STATUTS_TICKET,
        "priorites": PRIORITES,
        "categoriesTicket": CATEGORIES_TICKET,
        "plateformes": PLATEFORMES,
        "taches": TACHES,
        "moments": MOMENTS,
        "tacheRapport": TACHE_RAPPORT,
        "tacheOuverture": TACHE_OUVERTURE,
        "noteMax": NOTE_MAX,
        "roles": ROLES,
        "mdpMin": MDP_MIN,
        "dureeSeanceMin": DUREE_SEANCE_MIN,
        "maxSeancesSoir": MAX_SEANCES_SOIR,
        "fuseauMinutes": FUSEAU_MINUTES,
        "fuseauNom": FUSEAU_NOM,
        "poids": POIDS,
        "seuilEligible": SEUIL_ELIGIBLE,
        "seuilEtapes": SEUIL_ETAPES,
        "seuilApresCoup": SEUIL_APRES_COUP,
        "fonction": FONCTION,
        "couleurs": COULEURS,
        "mois": MOIS_ACCENT,
        "jours": JOURS,
        "texteRas": TEXTE_RAS,
        "actionsRas": ACTIONS_RAS,
        "retardMinutes": RETARD_MINUTES,
        "tailleMaxMo": TAILLE_MAX_MO,
        "extensions": EXTENSIONS,
    }
