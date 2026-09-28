# Espace technique Wael Academy

Deuxième fonction de **2-up Studio**, complètement séparée de l'outil
d'imposition PDF : sa propre base de données, ses propres dossiers, sa propre
interface.

**Accès : http://localhost:1200/operations** — ou le bouton « Espace technique » en haut de la page 2-up.

Sept écrans, un par point de la demande. Tout se crée, se modifie, s'affiche
et se supprime depuis l'interface.

**Aux couleurs de Wael Academy.** L'interface reprend la carte de marque
officielle : le navy `#17497E` porte les boutons, les éléments actifs et les
barres, le vert `#2FA36B` marque ce qui est terminé. L'emblème remplace
l'ancienne vignette, en blanc sur sa pastille navy, et sert aussi de favicon.
Les émojis ont laissé place à un jeu d'icônes tracées (`static/suivi/icones.js`) :
un émoji change de dessin d'un système à l'autre et porte ses propres
couleurs ; ces icônes-ci sont en `currentColor` et suivent le thème.

Le **thème clair** est celui par défaut, le navy sur fond clair de la charte.
Le **thème sombre** est un noir neutre et non un navy foncé : étalée sur tout
un écran, l'encre de marque vire au délavé — le fond reste donc noir et c'est
le bleu qui ressort dessus.

---

## Comptes et mots de passe

L'espace est **fermé** : plus rien ne s'ouvre sans connexion. Auparavant
chacun se déclarait lui-même depuis un menu, et le serveur le croyait sur
parole — n'importe qui pouvait signer un rapport au nom d'un autre. L'identité
vient désormais de la session, et l'en-tête que le navigateur envoyait n'est
plus lue du tout.

### Deux rôles

| | Administrateur | Technicien de live |
|---|---|---|
| Séances, étapes, commentaires, rapports, tickets | oui | oui |
| Modifier un rapport déjà envoyé | oui | oui |
| Ajouter, modifier, supprimer un membre | oui | non |
| Poser ou retirer un mot de passe | oui | son propre seulement |
| Nommer un administrateur | oui | non |
| Supprimer une séance ou un rapport | oui | non |
| Tout remettre à zéro | oui | non |

Un technicien garde donc tout son travail quotidien ; ce qui lui échappe,
c'est l'administration et ce qui efface. Supprimer un rapport n'est pas une
correction mais l'effacement d'une trace : il peut toujours le **modifier**.

### Première configuration

Au premier démarrage, la page de connexion propose de poser le mot de passe
de l'administrateur. **Cette page ne se représente plus une fois le mot de
passe posé** : il faut donc le faire tout de suite, avant que quelqu'un
d'autre n'arrive sur le site.

Si aucune équipe n'existe encore, elle demande aussi le nom. Si l'équipe est
déjà là, c'est la personne nommée `ADMIN_PAR_DEFAUT` (*Oussama Mzali*) qui
devient administratrice ; à défaut, la plus anciennement enregistrée.

**Mot de passe perdu ?** Poser la variable d'environnement
`SUIVI_ADMIN_MDP` chez l'hébergeur : au démarrage suivant, l'administrateur
reprend ce mot de passe. La retirer ensuite, sinon il est reposé à chaque
démarrage.

### Au quotidien

L'administrateur crée les membres depuis l'écran **Équipe** et leur donne un
mot de passe de vive voix ; chacun peut ensuite le changer depuis son propre
menu, en donnant l'actuel. Une fiche annonce clairement *peut se connecter*
ou *sans mot de passe* — ce dernier ne bloque personne dans son travail
existant, il empêche seulement la connexion.

Changer un mot de passe **ferme les sessions ouvertes ailleurs** : de quoi
reprendre la main sur un poste resté connecté. Changer un *rôle* ne
déconnecte personne.

La clé qui signe les sessions est rangée **en base** et non dans une variable
d'environnement : en hébergement serverless, une clé tirée au démarrage
changerait à chaque instance et déconnecterait tout le monde en permanence.

**Ce qui n'est pas protégé :** l'outil PDF 2-up (`/`) reste ouvert. Il ne
contient aucune donnée et ne sert qu'à imposer un fichier envoyé sur le
moment.

**Tout peut s'écrire en arabe**, y compris dans les PDF — voir la
[section Écrire en arabe](#écrire-en-arabe).

**Qui a fait quoi, et quand.** Chaque étape cochée, chaque commentaire,
chaque rapport envoyé ou corrigé porte son auteur et son horodatage. Le tout
est repris dans le rapport lui-même — PDF et copie texte — sous *Étapes de
la séance* et *Traçabilité*.

---

## Les sept points

### 1. Formulaire de rapport quotidien

Le rapport s'ouvre **depuis la séance** : bouton *Rapport* sur le tableau de
bord, icône sur la carte du planning et sur la ligne des Séances, ou étape
*Rédiger le rapport* dans la liste des étapes. Un rapport se rattache à une
séance : le proposer partout, la séance encore à choisir, faisait recommencer
une saisie déjà faite. Le raccourci `n` ouvre un rapport libre.

**Un rapport envoyé se modifie.** Là où l'icône du rapport apparaît, elle
ouvre le rapport existant en modification une fois celui-ci envoyé : une
précision arrive souvent après coup, et il ne faut pas avoir à le rechercher
dans l'écran Rapports. Chaque modification est inscrite au journal.

Le formulaire est en trois temps — *la séance*, *ce qui s'est passé*,
*compléments* — plutôt qu'en une seule colonne de onze champs :

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

#### Les étapes d'une séance

Chaque live porte la même liste de sept étapes, dans l'ordre de la journée.
Le compteur **☑ 3/7** est posé sur la carte du planning, sur la ligne de
l'écran Séances et sur le tableau de bord ; on clique dessus pour ouvrir la
liste et cocher ce qui est fait.

| Étape | Quand |
|---|---|
| Appeler le professeur | avant le live |
| Récupérer le fichier de la séance | avant le live |
| Déposer le fichier sur le site Wael Academy | avant le live |
| Ouvrir le live | pendant |
| Contrôler le live | pendant |
| Rédiger le rapport après le live | après |
| Déposer le fichier après le live | après |

Chaque case cochée retient **qui** l'a cochée et **quand**. La case du
rapport fait exception : elle n'est pas cliquable, elle se coche toute seule
à l'envoi du rapport et se décoche si le rapport est supprimé — sans quoi le
tableau de bord pourrait annoncer un rapport qui n'existe pas. Le bouton au
bout de la ligne ouvre le formulaire — **Rédiger** tant que le rapport
n'existe pas, **Modifier** ensuite.

**Rien n'est enregistré avant « Valider ».** Un clic sur une case note
l'intention : la ligne passe en pointillé, son sous-titre devient *à
valider*, et la barre de progression montre déjà le résultat visé. Le pied
de la fenêtre compte les modifications en attente et propose **Annuler** ou
**Valider (n)**. Une étape ramenée à son état d'origine sort du compte — un
aller-retour ne compte pas pour une modification.

La validation part en **un seul appel**, vérifié entièrement avant d'écrire
quoi que ce soit : une étape inconnue dans la fournée fait tout refuser, et
rien n'est écrit à moitié. Le journal garde une ligne par validation, pas
une par case. Fermer la fenêtre avec des cases en attente — par le bouton,
la croix, la touche `Échap` ou un clic à côté — demande confirmation.

#### Commentaires sur une étape

Chaque étape a son propre fil de commentaires, ouvert par la bulle à droite
de la ligne. Le cas qui les justifie est celui d'une étape **non faite** :

> — Le prof n'a pas pris son téléphone, à rappeler vers 18 h 30.
> — Rappelé à 18 h 40, toujours rien.
> — Joint à 19 h, il arrive.

C'est pour cela qu'un commentaire se rattache au couple *(séance, étape)* et
non à la case cochée : exiger la case d'abord interdirait d'écrire justement
quand on en a le plus besoin. Cocher ou décocher l'étape ne touche pas au fil.

Chaque message garde son auteur et son heure, se supprime un par un, et tient
en 1 000 caractères. `Ctrl+Entrée` envoie sans lâcher le clavier. La bulle du
compteur **☑ 3/7** signale, d'un coup d'œil sur le planning, qu'une séance
porte des commentaires.

Le tableau de bord résume la journée : *« 12 séance(s) au programme · 34
étape(s) restante(s) »*. L'export CSV des séances porte deux colonnes de
plus, *Étapes faites* et *Étapes au total*.

Supprimer une séance supprime ses étapes avec elle.

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
| Rapport | « Rapport » ou « Remplir » sur une séance | l'icône du rapport sur la séance, ou dans la liste et la fiche | corbeille (le dossier d'archive part avec) |
| Live | « Nouveau live » | crayon sur la carte, ou glisser-déposer | corbeille |
| Ticket | « Nouveau ticket » | crayon dans le ticket | corbeille |
| Réponse | champ en bas du ticket | — | — |
| Technicien | « Ajouter un technicien » | crayon sur sa fiche | corbeille |
| Pièce jointe | zone de dépôt | — | croix à côté du fichier |
| Commentaire d'étape | bulle sur la ligne de l'étape | — | corbeille sur le message |

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

* **Tout remettre à zéro** — efface rapports, lives, tickets, messages,
  équipe, journal et dossiers d'archive. L'application repart entièrement
  vide et le reste après un redémarrage. Chaque écran explique alors quoi
  faire, et le premier rapport propose de créer le premier technicien.
* **Jeu de démonstration** — remplit l'application avec un exemple complet
  (cinq techniciens, deux semaines de lives, rapports et tickets) pour essayer
  sans rien saisir. Désactivé par défaut, voir `SUIVI_DEMO`.

Les deux demandent confirmation.
