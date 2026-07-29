# 2-up Studio

Application locale à deux fonctions, servies par le même serveur :

1. **Outil 2-up** (`/`) — deux pages paysage sur chaque feuille portrait, avec
   suppression automatique des pages vides et remplacement de la première page.
2. **Suivi des lives** (`/operations`) — rapport obligatoire après chaque
   séance, classement automatique des dossiers par mois, planification,
   support technique et tableau de bord.
   Voir [SUIVI-DES-LIVES.md](SUIVI-DES-LIVES.md).

Tout se passe en local, aucun fichier ne quitte la machine.

## Lancer

```bat
cd /d D:\pdf-2up-studio
python app.py
```
puis ouvrir **http://localhost:1200** (ou double-cliquer sur `start.bat`).

Installation des dépendances (une seule fois) : `pip install -r requirements.txt`

## Utilisation

1. **Glisser le ou les PDF paysage** dans la zone 1 (ou n'importe où sur la
   page). Plusieurs fichiers sont **assemblés bout à bout** dans l'ordre de la
   liste, et la suite du traitement se fait sur ce document unique.
   Le serveur rend chaque page en vignette et mesure l'encre « ajoutée » par
   rapport au gabarit répété du document (bandeaux, logo, filigrane).

   La liste se retouche à tout moment sans rien renvoyer : **+ Ajouter des PDF**,
   flèches ↑ ↓ pour changer l'ordre, × pour retirer un document. Chaque
   modification refusionne et réanalyse le document. Dans la grille, un
   séparateur rappelle où commence chaque fichier d'origine.
2. **Vérifier les pages vides** : elles apparaissent barrées en rouge dans la
   grille. Le curseur *Sensibilité* ajuste le seuil en direct, un clic sur une
   vignette force la conservation ou la suppression d'une page.
3. **Nouvelle 1re page** (facultatif) : un PDF ou une image remplace la page 1.
   Placement en couverture pleine page ou intégrée au flux 2-up.
4. **Mise en page** : format de feuille (A4, Letter, Legal, A3, A5, auto, sur
   mesure), marge extérieure, espace central, marge de couverture.
5. **Générer** → aperçu des feuilles produites puis **Télécharger**.

Le format `Auto` calcule une feuille exactement aux dimensions de la source
empilée deux fois : aucune bande blanche, aucune déformation.

## Fichiers

| Fichier | Rôle |
|---|---|
| `app.py` | serveur Flask, port 1200, API upload / assemblage / analyse / génération / téléchargement |
| `core.py` | traitement PDF : fusion, détection des pages vides, imposition, vignettes |
| `templates/index.html` | interface de l'outil 2-up |
| `static/style.css` | thème clair / sombre (partagé avec le Suivi des lives) |
| `static/app.js` | logique de l'interface 2-up |
| `suivi/` | Suivi des lives : base SQLite, règles, API, PDF, archive |
| `templates/suivi.html`, `static/suivi.css`, `static/suivi/` | interface du Suivi des lives |
| `donnees-suivi/` | base et archives du Suivi des lives (créé au 1er démarrage) |

Les fichiers envoyés sont stockés dans `%TEMP%\pdf-2up-studio` et purgés
automatiquement au bout de 6 heures (ou en cliquant sur « Nouveau document »).
Un dossier de travail contient `parts/` (les PDF d'origine, conservés tels
quels), `parts.json` (leur ordre), `src_….pdf` (le document assemblé, seul
fichier analysé et imposé) et `out_….pdf` (le résultat).

## Réglages avancés

Dans `core.py` :

* `DETECT_DPI`, `DETECT_MAX_WIDTH` — finesse / vitesse de l'analyse
* `MIN_PAGES_FOR_TEMPLATE` — en dessous, méthode simple sans gabarit
* `PAGE_SIZES` — ajouter un format

Dans `app.py` : `PORT`, `MAX_UPLOAD_MB` (poids total d'un envoi),
`MAX_SOURCE_FILES` (nombre de PDF assemblables), `JOB_TTL_SECONDS`.
