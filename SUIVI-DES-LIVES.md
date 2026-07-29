# Suivi des lives

Deuxième fonction de **2-up Studio**, complètement séparée de l'outil
d'imposition PDF : sa propre base de données, ses propres dossiers, sa propre
interface.

**Accès : http://localhost:1200/operations** — ou le bouton « 🎥 Suivi des
lives » en haut de la page 2-up.

Sept écrans, un par point de la demande. Tout se crée, se modifie, s'affiche
et se supprime depuis l'interface.

**Un seul rôle : « Technicien de live ».** Toute personne enregistrée peut
recevoir des séances, écrire des rapports, ouvrir et traiter des tickets.
Il n'y a aucun droit à régler, aucune hiérarchie à définir.

**Tout peut s'écrire en arabe**, y compris dans les PDF — voir la
[section Écrire en arabe](#écrire-en-arabe).

---

## Les sept points

### 1. Formulaire de rapport quotidien

Bouton **＋ Rapport**, présent en haut de tous les écrans (raccourci : `n`).

Le formulaire reprend exactement les champs demandés :

| Champ | Détail |
|---|---|
| Séance concernée | facultatif — remplit la date, l'heure et le nom automatiquement |
| Date, Heure | pré-remplies |
| Nom du live / classe | obligatoire |
| Responsable | le technicien de live, pré-rempli avec la personne connectée |
| État de la séance | ✅ Séance normale · ⚠️ Petit problème · ❌ Problème important |
| Description de ce qui s'est passé | obligatoire dès qu'un problème est signalé |
| Élèves concernés | facultatif |
| Capture d'écran ou fichier | facultatif — images, vidéos, PDF, documents, 50 Mo par fichier |
| Niveau d'urgence | Faible · Moyenne · Haute · Critique |
| Actions prises | obligatoire dès qu'un problème est signalé |
| Commentaires | facultatif |

L'état choisi ajuste le formulaire : un problème rend la description et les
actions obligatoires et relève l'urgence ; « séance normale » remet tout au
plus simple.

### 2. Génération automatique des dossiers

Chaque rapport envoyé est enregistré en base **et** rangé dans un dossier réel
sur le disque :

```
donnees-suivi/archives/
└── Rapports/
    └── 2026/
        ├── Janvier/  Février/  Mars/  Avril/  Mai/  Juin/
        ├── Juillet/
        │   └── RAP-2026-07-29-001 Anglais professionnel/
        │       ├── RAP-2026-07-29-001.pdf     le rapport mis en page
        │       ├── rapport.txt                le même contenu en texte
        │       ├── rapport.json               les données brutes
        │       └── capture-son.png            les pièces jointes
        └── Août/ … Décembre/
```

Les douze mois existent dès le départ. Les pièces jointes des tickets vont
dans `Support/AAAA/Mois/TIC-nnnn/`.

L'écran **Archive** montre cette arborescence, affiche le chemin exact sur la
machine et permet d'ouvrir ou de télécharger chaque fichier. Pour retrouver le
tout dans Google Drive, il suffit de placer le dossier `archives` dans un
dossier synchronisé par *Google Drive pour ordinateur* : la structure est déjà
celle qui est demandée. Aucune autorisation Google n'est nécessaire.

### 3. Même si tout va bien

Choisir **✅ Séance normale** écrit le compte rendu à la place de
l'utilisateur :

> Aucun problème signalé. Le cours s'est déroulé normalement.

Le rapport s'envoie alors en un clic — mais il s'envoie quand même, pour que
le registre des séances soit complet.

### 4. Planification des lives

Écran **Planification** : une colonne par technicien de live, plus une colonne
« À attribuer ». On **glisse une carte d'une colonne à l'autre** pour changer
d'affectation, ou on utilise **⇄ Répartir** qui distribue la journée à tour de
rôle entre tous les techniciens.

Chaque personne retrouve ensuite ses seules séances (filtre *Responsable* sur
l'écran Séances). Les flèches ‹ › et le sélecteur de date changent de journée.

### 5. Rapport obligatoire

Le système sait, pour chaque séance terminée :

* **si** le rapport a été envoyé — sinon la séance est marquée *rapport
  manquant*, en rouge, dans le planning, sur le tableau de bord et en tête de
  l'écran Rapports ;
* **quand** — date et heure d'envoi ;
* **par qui** — nom conservé même si la fiche de la personne est supprimée ;
* **s'il y a du retard** — l'écart entre la fin prévue de la séance et l'envoi
  est mesuré ; au-delà d'une heure le rapport est marqué *en retard* ;
* **combien de séances restent sans rapport** — compteur rouge dans la barre
  de gauche, mis à jour toutes les minutes.

Un live ne peut avoir qu'un seul rapport : une seconde tentative est refusée
et renvoie vers le rapport existant.

### 6. Espace service technique

Écran **Support technique** : trois colonnes **Nouveau → En cours → Résolu**.

Ouvrir un ticket demande un sujet, une description, une catégorie, une
priorité, et accepte des **captures d'écran ou des vidéos**. Le fil de
discussion se trouve dans le ticket : le demandeur et le support se répondent
au même endroit. Une première réponse fait passer le ticket *En cours*
automatiquement ; le passage à *Résolu* horodate la clôture et calcule la
durée de traitement.

### 7. Tableau de bord

Huit indicateurs, chacun cliquable pour aller à l'écran correspondant :

lives du jour · rapports envoyés · lives sans rapport · incidents · incidents
critiques · tickets support ouverts · temps moyen de résolution · taux de
couverture.

Puis la journée en cours, les séances sans rapport à relancer, un graphe des
quatorze derniers jours, la répartition des états de séance, l'historique des
rapports et le suivi par responsable.

---

## Créer, modifier, supprimer

Tout est modifiable par n'importe quel utilisateur, partout :

| Objet | Créer | Modifier | Supprimer |
|---|---|---|---|
| Rapport | ＋ Rapport, ou « Remplir » sur une séance | ✏️ dans la liste ou la fiche | 🗑 (le dossier d'archive part avec) |
| Live | ＋ Nouveau live | ✏️ sur la carte, ou glisser-déposer | 🗑 |
| Ticket | ＋ Nouveau ticket | ✏️ dans le ticket | 🗑 |
| Réponse | champ en bas du ticket | — | — |
| Technicien | ＋ Ajouter un technicien | ✏️ sur sa fiche | 🗑 |
| Pièce jointe | zone de dépôt | — | ✕ à côté du fichier |

Chaque suppression demande confirmation. Toutes les actions sont inscrites
dans **Dernières actions**, en bas de l'écran Équipe.

Le sélecteur « Connecté en tant que », en haut à droite, indique qui écrit :
c'est ce nom qui est enregistré sur les rapports, les messages et le journal.

---

## Écrire en arabe

Tous les champs acceptent l'arabe, et rien n'est à régler : dès la première
lettre tapée, le champ se met à écrire de droite à gauche — curseur,
alignement et ponctuation compris. Une saisie en français ne bouge pas. Les
deux écritures peuvent se mélanger dans le même texte.

Cela vaut partout : nom du live, description, actions prises, élèves,
commentaires, sujet et réponses des tickets, noms des techniciens, recherche.
L'arabe traverse ensuite toute la chaîne sans se dégrader : base de données,
liste à l'écran, **PDF du rapport**, nom du dossier d'archive, résumé texte et
export CSV.

### Comment le PDF s'en sort

Un PDF ne sait pas écrire l'arabe tout seul : il pose des caractères de gauche
à droite, sans les lier. Deux choses manquent, et `suivi/arabe.py` les fournit :

* **la liaison des lettres** — en arabe une lettre change de dessin selon sa
  place dans le mot (isolée, initiale, médiane, finale). Le module choisit le
  bon dessin pour chaque lettre, gère les voyelles qui ne coupent pas la
  liaison, et les ligatures لا ;
* **le sens de lecture** — la ligne est réordonnée avant d'être dessinée ; les
  chiffres et les mots latins gardent leur sens, les parenthèses sont
  retournées.

Le retour à la ligne et l'alignement sont calculés à la main dans
`suivi/pdf.py`, la mise en page ne dépendant d'aucune bibliothèque.

Une police couvrant l'arabe (Arial, livrée avec Windows) n'est embarquée que
si le rapport en contient réellement : un rapport en français reste à ~6 Ko,
un rapport en arabe pèse ~105 Ko. Si aucune police adaptée n'est trouvée, le
PDF se rabat sur les polices intégrées et le reste du document est produit
normalement.

---

## Organisation des fichiers

```
pdf-2up-studio/
  app.py                     outil 2-up + 2 lignes d'enregistrement du module
  suivi/                     le module, côté serveur
    schema.py                tables SQL et listes de choix
    db.py                    connexion SQLite par requête
    demo.py                  jeu de démonstration
    service.py               RÈGLES — toute écriture passe par ici
    api.py                   routes HTTP
    pdf.py                   mise en page PDF d'un rapport
    arabe.py                 liaison des lettres arabes et sens de lecture
    archive.py               dossiers Rapports / Année / Mois
  templates/suivi.html       coquille de la page
  static/suivi.css           styles
  static/suivi/              interface (modules ES, sans bibliothèque)
    noyau.js                 client HTTP, état, routeur, formatage
    ui.js                    champs, cartes, tableaux, modales
    app.js                   navigation et démarrage
    vues/tableau.js          tableau de bord et graphe
    vues/planning.js         planification et liste des séances
    vues/rapports.js         formulaire, liste, fiche
    vues/archive.js          arborescence des dossiers
    vues/support.js          tickets et fils de discussion
    vues/equipe.js           personnes et journal
  donnees-suivi/             créé au premier démarrage
    suivi.db                 base SQLite
    archives/                dossiers et PDF
```

Modifications de l'outil 2-up, toutes additives : `app.py` (import et
enregistrement) et `templates/index.html` (le lien de navigation). Aucune
dépendance supplémentaire : Flask et PyMuPDF étaient déjà là.

### API

```
GET  POST            /api/suivi/personnes           PATCH DELETE  …/<id>
GET  POST            /api/suivi/lives               PATCH DELETE  …/<id>
POST                 /api/suivi/lives/repartir
GET  POST            /api/suivi/rapports            PATCH DELETE  …/<id>
GET                  /api/suivi/rapports/<id>/pdf
GET  POST            /api/suivi/tickets             PATCH DELETE  …/<id>
POST                 /api/suivi/tickets/<id>/messages
POST                 /api/suivi/fichiers            DELETE        …/<id>
GET                  /api/suivi/fichier?chemin=
GET                  /api/suivi/archive             /archive/dossier
GET                  /api/suivi/tableau             /journal
GET                  /api/suivi/export/<quoi>.csv
POST                 /api/suivi/demo                jeu de démonstration
```

Les pages n'écrivent jamais dans la base : elles appellent l'API, qui délègue
à `suivi/service.py`. Une règle refusée l'est donc côté serveur, pas seulement
à l'écran.

---

## Raccourcis

| Touche | Action |
|---|---|
| `n` | nouveau rapport |
| `t` | planning du jour |
| `Échap` | fermer la fenêtre ouverte |

Le thème clair / sombre est partagé avec l'outil 2-up.

## Repartir de zéro

Menu « Connecté en tant que », en haut à droite :

* **🧹 Tout remettre à zéro** — efface rapports, lives, tickets, messages,
  équipe, journal et dossiers d'archive. L'application repart entièrement
  vide et le reste après un redémarrage. Chaque écran explique alors quoi
  faire, et le bouton ＋ Rapport propose de créer le premier technicien.
* **♻️ Jeu de démonstration** — remplit l'application avec un exemple complet
  (cinq techniciens, deux semaines de lives, rapports et tickets) pour essayer
  sans rien saisir.

Les deux demandent confirmation.
