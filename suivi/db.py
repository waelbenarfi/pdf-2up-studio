# -*- coding: utf-8 -*-
"""Acces a la base SQLite du Suivi des lives.

Une connexion par requete HTTP, refermee automatiquement a la fin.
"""

import datetime
import os
import sqlite3

from flask import g

from . import schema

_CHEMIN = None


def configurer(chemin):
    global _CHEMIN
    _CHEMIN = chemin


def connexion():
    if "suivi_db" not in g:
        cnx = sqlite3.connect(_CHEMIN)
        cnx.row_factory = sqlite3.Row
        cnx.execute("PRAGMA foreign_keys = ON")
        g.suivi_db = cnx
    return g.suivi_db


def fermer(_=None):
    cnx = g.pop("suivi_db", None)
    if cnx is not None:
        cnx.close()


# ---------------------------------------------------------------- requetes
def tous(sql, params=()):
    return [dict(r) for r in connexion().execute(sql, params).fetchall()]


def un(sql, params=()):
    ligne = connexion().execute(sql, params).fetchone()
    return dict(ligne) if ligne else None


def executer(sql, params=()):
    cnx = connexion()
    cur = cnx.execute(sql, params)
    cnx.commit()
    return cur


def inserer(table, valeurs):
    colonnes = list(valeurs.keys())
    sql = "INSERT INTO %s (%s) VALUES (%s)" % (
        table, ", ".join(colonnes), ", ".join("?" * len(colonnes)))
    return executer(sql, [valeurs[c] for c in colonnes]).lastrowid


def modifier(table, ident, valeurs):
    if not valeurs:
        return 0
    colonnes = list(valeurs.keys())
    sql = "UPDATE %s SET %s WHERE id = ?" % (
        table, ", ".join("%s = ?" % c for c in colonnes))
    return executer(sql, [valeurs[c] for c in colonnes] + [ident]).rowcount


def supprimer(table, ident):
    return executer("DELETE FROM %s WHERE id = ?" % table, (ident,)).rowcount


# ---------------------------------------------------------------- temps
def maintenant():
    return datetime.datetime.now().replace(microsecond=0).isoformat(" ")


def aujourdhui():
    return datetime.date.today().isoformat()


# ---------------------------------------------------------------- demarrage
def initialiser(chemin, avec_demo=True):
    """Cree le fichier de base et les tables si besoin.

    Le jeu de demonstration n'est ecrit qu'une seule fois, a la toute
    premiere ouverture : une base volontairement videe le reste apres un
    redemarrage.
    """
    configurer(chemin)
    os.makedirs(os.path.dirname(chemin), exist_ok=True)

    cnx = sqlite3.connect(chemin)
    cnx.row_factory = sqlite3.Row
    try:
        cnx.executescript(schema.DDL)
        cnx.commit()
        deja = cnx.execute("SELECT valeur FROM parametres WHERE cle = 'installe'"
                           ).fetchone()
        if not deja:
            # une base d'avant l'ajout de `parametres` peut deja contenir des
            # donnees : on ne remplit que si elle est reellement vide.
            occupee = any(
                cnx.execute("SELECT 1 FROM %s LIMIT 1" % table).fetchone()
                for table in schema.TABLES_DONNEES)
            if avec_demo and not occupee:
                from . import demo
                demo.remplir(cnx)
            cnx.execute("INSERT INTO parametres (cle, valeur)"
                        " VALUES ('installe', ?)", (maintenant(),))
            cnx.commit()
    finally:
        cnx.close()


def _effacer(cnx):
    cnx.execute("PRAGMA foreign_keys = OFF")
    for table in schema.TABLES_DONNEES:
        cnx.execute("DELETE FROM %s" % table)
        cnx.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))


def vider(chemin):
    """Repart de zero : plus aucune donnee, pas de jeu de demonstration."""
    cnx = sqlite3.connect(chemin)
    try:
        _effacer(cnx)
        cnx.commit()
    finally:
        cnx.close()


def vider_et_remplir(chemin):
    """Repart d'un jeu de demonstration propre."""
    cnx = sqlite3.connect(chemin)
    try:
        _effacer(cnx)
        from . import demo
        demo.remplir(cnx)
        cnx.commit()
    finally:
        cnx.close()
