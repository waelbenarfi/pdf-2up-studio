# -*- coding: utf-8 -*-
"""Acces a la base du Suivi des lives.

Deux moteurs derriere une seule interface :

* **SQLite** en local, un fichier a cote du code, rien a installer ;
* **PostgreSQL** des que `DATABASE_URL` est definie -- indispensable sur un
  hebergement serverless, ou le disque est efface a chaque demarrage a froid.

Tout le reste du module `suivi` ecrit ses requetes en style SQLite, avec des
placeholders `?`, et ignore lequel des deux moteurs repond. La traduction est
faite ici et nulle part ailleurs.

Une connexion par requete HTTP, refermee automatiquement a la fin.
"""

import datetime
import os
import re
import sqlite3

from flask import g

from . import schema

_CHEMIN = None

URL = (os.environ.get("DATABASE_URL") or "").strip()
POSTGRES = URL.startswith(("postgres://", "postgresql://"))

# Le jeu de demonstration ne s'ecrit plus jamais tout seul : une base neuve
# reste vide, et le bouton qui le regenerait a ete retire de l'interface. Il
# faut poser SUIVI_DEMO=1 pour le rendre a nouveau disponible -- utile pour
# une capture d'ecran, jamais sur l'installation de travail.
DEMO_AUTORISEE = (os.environ.get("SUIVI_DEMO") or "").strip().lower() in (
    "1", "true", "oui", "yes")


def configurer(chemin):
    global _CHEMIN
    _CHEMIN = chemin


def moteur():
    """Nom du moteur actif, pour l'affichage et les diagnostics."""
    return "postgresql" if POSTGRES else "sqlite"


# ---------------------------------------------------------------- traduction
_DEBUT_INSERT = re.compile(r"^\s*INSERT\s+INTO\s+(\w+)", re.IGNORECASE)


def _traduire(sql):
    """Passe une requete du style SQLite au style psycopg.

    Les `?` deviennent des `%s`, et les `%` litteraux sont doubles pour ne pas
    etre pris pour des marqueurs. Les deux caracteres sont laisses intacts a
    l'interieur d'une chaine SQL, ou ils n'ont rien d'un placeholder.
    """
    morceaux = []
    dans_texte = False
    for caractere in sql:
        if caractere == "'":
            dans_texte = not dans_texte
            morceaux.append(caractere)
        elif dans_texte:
            morceaux.append(caractere)
        elif caractere == "?":
            morceaux.append("%s")
        elif caractere == "%":
            morceaux.append("%%")
        else:
            morceaux.append(caractere)
    return "".join(morceaux)


def _avec_returning(sql):
    """Ajoute `RETURNING id` a un INSERT, seul moyen d'obtenir la cle sous PG.

    Renvoie (requete, faut_il_lire_l_id). `parametres` est ecartee : sa cle
    primaire est un texte, elle n'a pas de colonne `id`.
    """
    trouve = _DEBUT_INSERT.match(sql)
    if not trouve or " RETURNING " in sql.upper():
        return sql, False
    if trouve.group(1).lower() not in schema.TABLES_ID:
        return sql, False
    return sql.rstrip().rstrip(";") + " RETURNING id", True


# ---------------------------------------------------------------- connexions
class _Curseur:
    """Surface commune aux deux moteurs : ce que `execute()` rend.

    Les lignes sortent en dictionnaires des deux cotes, et `lastrowid` existe
    partout -- sous PostgreSQL il vient du RETURNING ajoute plus haut.
    """

    def __init__(self, curseur, lastrowid=None):
        self._curseur = curseur
        self.lastrowid = lastrowid
        self.rowcount = curseur.rowcount

    def fetchone(self):
        ligne = self._curseur.fetchone()
        return dict(ligne) if ligne is not None else None

    def fetchall(self):
        return [dict(ligne) for ligne in self._curseur.fetchall()]


class _CurseurSqlite(_Curseur):
    def __init__(self, curseur):
        _Curseur.__init__(self, curseur, curseur.lastrowid)


class _Connexion:
    """Connexion neutre : les appelants ne voient jamais le moteur."""

    def __init__(self, brute, postgres):
        self.brute = brute
        self.postgres = postgres

    def execute(self, sql, params=()):
        params = tuple(params or ())
        if not self.postgres:
            return _CurseurSqlite(self.brute.execute(sql, params))

        sql, lire_id = _avec_returning(sql)
        curseur = self.brute.cursor()
        curseur.execute(_traduire(sql), params)
        dernier = None
        if lire_id:
            ligne = curseur.fetchone()
            dernier = ligne["id"] if ligne else None
        return _Curseur(curseur, dernier)

    def commit(self):
        self.brute.commit()

    def close(self):
        self.brute.close()


def _ouvrir():
    """Nouvelle connexion au moteur actif."""
    if POSTGRES:
        import psycopg2
        import psycopg2.extras
        brute = psycopg2.connect(
            URL, cursor_factory=psycopg2.extras.RealDictCursor)
        return _Connexion(brute, True)

    brute = sqlite3.connect(_CHEMIN)
    brute.row_factory = sqlite3.Row
    brute.execute("PRAGMA foreign_keys = ON")
    return _Connexion(brute, False)


def connexion():
    if "suivi_db" not in g:
        g.suivi_db = _ouvrir()
    return g.suivi_db


def fermer(_=None):
    cnx = g.pop("suivi_db", None)
    if cnx is not None:
        cnx.close()


# ---------------------------------------------------------------- requetes
def tous(sql, params=()):
    return connexion().execute(sql, params).fetchall()


def un(sql, params=()):
    return connexion().execute(sql, params).fetchone()


def executer(sql, params=()):
    cnx = connexion()
    curseur = cnx.execute(sql, params)
    cnx.commit()
    return curseur


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
def initialiser(chemin, avec_demo=None):
    """Cree les tables si besoin. Une base neuve reste vide.

    Le drapeau `installe` marque la premiere ouverture : une base volontairement
    videe le reste apres un redemarrage. Sous PostgreSQL, poser ce drapeau est
    aussi ce qui departage deux instances qui demarreraient en meme temps.

    `avec_demo` laisse a None suit `SUIVI_DEMO`, c'est-a-dire : pas de donnees
    inventees, jamais, sauf demande explicite.
    """
    if avec_demo is None:
        avec_demo = DEMO_AUTORISEE
    configurer(chemin)
    if POSTGRES:
        _initialiser_postgres(avec_demo)
        return

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
                demo.remplir(_Connexion(cnx, False))
            cnx.execute("INSERT INTO parametres (cle, valeur)"
                        " VALUES ('installe', ?)", (maintenant(),))
            cnx.commit()
    finally:
        cnx.close()


# Verrou arbitraire mais stable : deux instances qui demarrent en meme temps
# doivent creer le schema l'une apres l'autre. Il est pris a l'echelle de la
# transaction et non de la session, seule forme sure derriere le pooler
# PgBouncer de Neon, ou une session peut changer de client entre deux ordres.
_VERROU = 862026


def _deja_installee(cnx):
    """Vrai si une precedente instance a fini l'installation.

    Evite de rejouer tout le schema a chaque demarrage a froid, ce qui, en
    serverless, arrive souvent.
    """
    table = cnx.execute("SELECT to_regclass('public.parametres') AS t").fetchone()
    if not table or not table["t"]:
        return False
    return cnx.execute("SELECT 1 AS present FROM parametres"
                       " WHERE cle = 'installe'").fetchone() is not None


def _initialiser_postgres(avec_demo):
    cnx = _ouvrir()
    try:
        if _deja_installee(cnx):
            return
        cnx.execute("SELECT pg_advisory_xact_lock(%d)" % _VERROU)
        cnx.brute.cursor().execute(schema.ddl_postgres())

        # Une base deja peuplee mais sans le drapeau (import de donnees, par
        # exemple) ne doit surtout pas recevoir le jeu de demonstration.
        occupee = any(
            cnx.execute("SELECT 1 FROM %s LIMIT 1" % table).fetchone()
            for table in schema.TABLES_DONNEES)
        pose = cnx.execute(
            "INSERT INTO parametres (cle, valeur) VALUES ('installe', ?)"
            " ON CONFLICT (cle) DO NOTHING", (maintenant(),))

        if pose.rowcount == 1 and avec_demo and not occupee:
            from . import demo
            demo.remplir(cnx)
        cnx.commit()          # libere aussi le verrou
    finally:
        cnx.close()


def _effacer(cnx):
    if cnx.postgres:
        cnx.execute("TRUNCATE TABLE %s RESTART IDENTITY CASCADE"
                    % ", ".join(schema.TABLES_DONNEES))
        return
    cnx.execute("PRAGMA foreign_keys = OFF")
    for table in schema.TABLES_DONNEES:
        cnx.execute("DELETE FROM %s" % table)
        cnx.execute("DELETE FROM sqlite_sequence WHERE name = ?", (table,))


def vider(chemin):
    """Repart de zero : plus aucune donnee, pas de jeu de demonstration."""
    configurer(chemin)
    cnx = _ouvrir()
    try:
        _effacer(cnx)
        cnx.commit()
    finally:
        cnx.close()


def vider_et_remplir(chemin):
    """Repart d'un jeu de demonstration propre.

    Refuse tant que `SUIVI_DEMO` n'est pas posee : ecraser une base de travail
    par des donnees inventees est une erreur dont on ne revient pas.
    """
    if not DEMO_AUTORISEE:
        raise RuntimeError(
            "Le jeu de démonstration est désactivé. Définissez SUIVI_DEMO=1 "
            "pour l'autoriser.")
    configurer(chemin)
    cnx = _ouvrir()
    try:
        _effacer(cnx)
        from . import demo
        demo.remplir(cnx)
        cnx.commit()
    finally:
        cnx.close()
