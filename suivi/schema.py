# -*- coding: utf-8 -*-
"""Suivi des lives - vocabulaire et tables.

Un seul endroit definit les listes de choix : elles sont envoyees telles
quelles a l'interface (window.SUIVI), donc le serveur et l'ecran ne peuvent
pas diverger.
"""

import re

VERSION = 1

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
ETATS = [
    {"cle": "normale", "libelle": "Séance normale", "icone": "✅",
     "ton": "ok", "aide": "Tout s'est bien passé"},
    {"cle": "petit", "libelle": "Petit problème", "icone": "⚠️",
     "ton": "warn", "aide": "Gênant mais la séance a continué"},
    {"cle": "important", "libelle": "Problème important", "icone": "❌",
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

# ---------------------------------------------------------------- equipe
# Un seul role : toute personne enregistree est technicienne de live, et
# peut donc recevoir des seances, ecrire des rapports et ouvrir des tickets.
FONCTION = "Technicien de live"
FONCTIONS = [FONCTION]

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
TABLES_DONNEES = ["messages", "fichiers", "tickets", "rapports", "lives",
                  "personnes", "journal"]

# Tables dont la cle primaire est un entier auto-incremente. `parametres` est
# la seule a en etre depourvue : sa cle est un texte. La distinction sert a
# savoir ou ajouter un RETURNING id sous PostgreSQL.
TABLES_ID = ["personnes", "lives", "rapports", "fichiers", "tickets",
             "messages", "journal"]


DDL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS parametres (
  cle    TEXT PRIMARY KEY,
  valeur TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS personnes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  nom          TEXT    NOT NULL,
  fonction     TEXT    NOT NULL DEFAULT 'Technicien de live',
  email        TEXT    NOT NULL DEFAULT '',
  telephone    TEXT    NOT NULL DEFAULT '',
  couleur      TEXT    NOT NULL DEFAULT '#6f7cff',
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


def ddl_postgres():
    """Le meme schema, dit en PostgreSQL.

    Deriver la variante plutot que la recopier evite que les deux versions
    divergent : il n'y a qu'un seul endroit ou ajouter une colonne. Seules
    deux choses separent les dialectes ici, les PRAGMA (propres a SQLite) et
    la facon de declarer une cle primaire auto-incrementee.
    """
    texte = re.sub(r"^\s*PRAGMA[^;]*;\s*$", "", DDL, flags=re.MULTILINE)
    return texte.replace("INTEGER PRIMARY KEY AUTOINCREMENT",
                         "SERIAL PRIMARY KEY")


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
