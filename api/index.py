# -*- coding: utf-8 -*-
"""Point d'entree Vercel : expose l'application Flask en fonction serverless.

Sur Vercel le disque de l'application est en lecture seule ; seul /tmp est
inscriptible, et son contenu disparait a chaque demarrage a froid. Les deux
dossiers de travail y sont donc rediriges avant l'import de `app`, qui cree
la base du Suivi des lives des le chargement du module.
"""

import os
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RACINE)

os.environ.setdefault("SUIVI_DONNEES", "/tmp/donnees-suivi")

from app import app  # noqa: E402  (l'environnement doit etre pret avant)

# Vercel appelle l'objet WSGI nomme `app` ou `handler`.
handler = app
