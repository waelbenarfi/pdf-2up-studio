# -*- coding: utf-8 -*-
"""Recopie la base SQLite locale du Suivi des lives vers PostgreSQL.

    set DATABASE_URL=postgresql://...
    python outils/migrer_vers_postgres.py [--remplacer] [--base CHEMIN]

Les identifiants sont conserves tels quels : les liens entre un live et son
responsable, ou entre un ticket et ses messages, restent valides. Les
sequences sont recalees derriere, sinon le premier ajout depuis le site
tomberait sur un identifiant deja pris.

Sans `--remplacer`, la cible doit etre vide : on ne veut pas ecraser par
inadvertance des donnees saisies en ligne.
"""

import argparse
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from suivi import schema  # noqa: E402

# Les parents d'abord : une ligne ne peut pas referencer une ligne absente.
ORDRE = ["personnes", "lives", "rapports", "fichiers", "tickets", "messages",
         "journal", "parametres"]

BASE_PAR_DEFAUT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "donnees-suivi", "suivi.db")


def colonnes(source, table):
    return [r[1] for r in source.execute("PRAGMA table_info(%s)" % table)]


def lire(source, table):
    if not source.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (table,)).fetchone():
        return [], []
    noms = colonnes(source, table)
    lignes = source.execute("SELECT %s FROM %s" % (", ".join(noms), table)
                            ).fetchall()
    return noms, [tuple(l) for l in lignes]


def cible_vide(curseur):
    for table in ORDRE:
        if table == "parametres":
            continue
        curseur.execute("SELECT COUNT(*) FROM %s" % table)
        if curseur.fetchone()[0]:
            return False
    return True


def main():
    parseur = argparse.ArgumentParser(description=__doc__)
    parseur.add_argument("--base", default=BASE_PAR_DEFAUT,
                         help="fichier SQLite source")
    parseur.add_argument("--remplacer", action="store_true",
                         help="vide la base PostgreSQL avant de copier")
    options = parseur.parse_args()

    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        parseur.error("DATABASE_URL n'est pas definie.")
    if not os.path.isfile(options.base):
        parseur.error("base introuvable : %s" % options.base)

    import psycopg2

    source = sqlite3.connect(options.base)
    cible = psycopg2.connect(url)
    curseur = cible.cursor()
    try:
        print("schema  : creation des tables manquantes")
        curseur.execute(schema.ddl_postgres())

        if options.remplacer:
            print("cible   : remise a zero")
            curseur.execute("TRUNCATE TABLE %s RESTART IDENTITY CASCADE"
                            % ", ".join(schema.TABLES_DONNEES))
            curseur.execute("DELETE FROM parametres")
        elif not cible_vide(curseur):
            cible.rollback()
            sys.exit("La base PostgreSQL contient deja des donnees. "
                     "Relancez avec --remplacer pour les ecraser.")

        total = 0
        for table in ORDRE:
            noms, lignes = lire(source, table)
            if not lignes:
                print("  %-11s vide" % table)
                continue
            marques = ", ".join(["%s"] * len(noms))
            sql = "INSERT INTO %s (%s) VALUES (%s)" % (
                table, ", ".join(noms), marques)
            curseur.executemany(sql, lignes)
            total += len(lignes)
            print("  %-11s %d ligne(s)" % (table, len(lignes)))

        print("sequences : recalage")
        for table in schema.TABLES_ID:
            curseur.execute(
                "SELECT setval(pg_get_serial_sequence(%s, 'id'),"
                " COALESCE((SELECT MAX(id) FROM %s), 0) + 1, false)"
                % ("%s", table), (table,))

        # Marque l'installation comme faite : sans ce drapeau, le premier
        # demarrage du site croirait la base neuve et ecrirait la demonstration.
        curseur.execute(
            "INSERT INTO parametres (cle, valeur) VALUES ('installe', %s)"
            " ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur",
            (__import__("datetime").datetime.now().replace(microsecond=0)
             .isoformat(" "),))

        cible.commit()
        print("\ntermine : %d ligne(s) copiee(s)." % total)
    except Exception:
        cible.rollback()
        raise
    finally:
        source.close()
        cible.close()


if __name__ == "__main__":
    main()
