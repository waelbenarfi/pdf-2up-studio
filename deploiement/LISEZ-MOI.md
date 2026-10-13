# Déployer l'Espace technique sur un serveur

Tout ce qu'il faut pour installer ce site sur une machine Ubuntu ou Debian,
derrière un domaine, en HTTPS. Écrit pour être suivi sans rien connaître du
projet.

## Ce que c'est

Une application **Flask**, en Python, qui sert deux choses sur la même
adresse :

- `/` — un outil de mise en page PDF (2 pages par feuille) ;
- `/operations` — l'**Espace technique** de Wael Academy : planning des
  séances, répartition entre les techniciens, rapports, répertoire des
  professeurs.

Elle n'a besoin d'aucun serveur de base de données : elle écrit dans un
fichier **SQLite**. Elle sait aussi parler à PostgreSQL si `DATABASE_URL`
est posée, mais ce n'est pas nécessaire — une équipe de six personnes et
une vingtaine de séances par soir tiennent très largement dans SQLite, et
un fichier se sauvegarde en une seconde.

## Ce qu'elle attend

| | |
|---|---|
| Entrée WSGI | `app:app` |
| Port interne | ce que vous voulez ; `127.0.0.1:8000` dans le script |
| `SUIVI_DONNEES` | dossier où ranger la base et les pièces jointes, **hors du dossier du code** |
| `SUIVI_HTTPS=1` | pose le cookie de session en « secure » — indispensable derrière HTTPS |
| `DATABASE_URL` | facultatif. Absente : SQLite. Présente : PostgreSQL |
| Envoi de fichiers | jusqu'à 50 Mo par pièce jointe — prévoir la limite du proxy en conséquence |

Le schéma de la base est créé tout seul au premier démarrage, et les
migrations suivantes s'appliquent aussi toutes seules à chaque démarrage.
Il n'y a jamais de commande de migration à lancer.

## La façon rapide

```bash
curl -fsSL https://raw.githubusercontent.com/waelbenarfi/pdf-2up-studio/main/deploiement/deployer.sh -o deployer.sh
sudo bash deployer.sh espace.mondomaine.com
```

Le script installe Python et Caddy, récupère le code, pose un service
systemd qui redémarre tout seul, et laisse Caddy obtenir le certificat
HTTPS. Le relancer plus tard met le site à jour sans jamais toucher aux
données.

## Avant de lancer

1. **Le DNS d'abord.** Un enregistrement **A** pour le sous-domaine, vers
   l'IP publique du serveur. Le certificat ne peut pas être obtenu avant
   que le nom résolve.
2. **Regarder ce qui occupe déjà les ports 80 et 443.** Si un nginx ou un
   apache sert déjà un autre site sur cette machine, **ne pas le
   remplacer** : ajouter un virtualhost pour ce sous-domaine et obtenir le
   certificat avec certbot. Le script suppose les ports libres.
3. **Les données, s'il y en a.** Un `suivi.db` existant se dépose à côté du
   script : il est repris tel quel. Sans lui, le site démarre vide et
   demande de créer le premier compte administrateur.

## Après

Vérifier, dans cet ordre :

```bash
systemctl is-active espace-technique     # en marche
systemctl is-enabled espace-technique    # repartira après un reboot
curl -I https://espace.mondomaine.com/operations   # 302 vers la connexion
journalctl -u espace-technique -n 40     # aucune erreur
```

Puis poser une sauvegarde de nuit — la base est un fichier, mais un fichier
qu'il faut copier pendant que le service écrit :

```
0 3 * * * sqlite3 /var/lib/espace-technique/suivi.db ".backup '/var/backups/espace-technique/suivi-$(date +\%F).db'"
```

`.backup` et non `cp` : SQLite garantit alors une copie cohérente même en
pleine écriture.

## Mettre à jour plus tard

```bash
sudo bash deployer.sh espace.mondomaine.com
```

Le script remet le code au dernier état de la branche `main` et redémarre
le service. Les données vivent ailleurs, elles ne bougent pas.

## Ce qui n'est pas dans ce dépôt

La base de données. Elle porte les séances, les rapports et les mots de
passe de l'équipe — elle n'a rien à faire dans un dépôt public. Elle se
transporte à la main, par le gestionnaire de fichiers du serveur ou par
`scp`.
