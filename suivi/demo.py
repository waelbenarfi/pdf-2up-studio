# -*- coding: utf-8 -*-
"""Jeu de demonstration : de quoi voir tout de suite a quoi ressemble l'outil.

Deterministe (meme graine) pour que deux installations se ressemblent.
Rien ici n'est indispensable : tout se cree et se supprime depuis l'interface.
"""

import datetime
import random

from . import schema

EQUIPE = [
    ("Ahmed Benali", "ahmed@exemple.com", "#6f7cff"),
    ("Sami Trabelsi", "sami@exemple.com", "#22d3ee"),
    ("Youssef Karim", "youssef@exemple.com", "#34d399"),
    ("Nadia Mansouri", "nadia@exemple.com", "#c084fc"),
    ("Karim Haddad", "karim@exemple.com", "#fb923c"),
]

COURS = [
    ("Anglais professionnel", "Bader AL", "Zoom"),
    ("Excel avancé", "Mouna S.", "Google Meet"),
    ("Marketing digital", "Hichem B.", "Zoom"),
    ("Communication orale", "Rania T.", "Microsoft Teams"),
    ("Gestion de projet", "Slim K.", "Zoom"),
    ("Comptabilité pratique", "Fatma L.", "Google Meet"),
    ("Photoshop essentiel", "Oussama D.", "Zoom"),
    ("Français des affaires", "Ines M.", "Microsoft Teams"),
    ("Initiation à la programmation", "Wael R.", "YouTube Live"),
]

HEURES = ["08:30", "10:00", "11:30", "13:30", "15:00", "16:30", "18:00",
          "19:30", "21:00"]

SOUCIS_PETITS = [
    ("Le son du formateur a coupé pendant environ 3 minutes au début de la "
     "séance. Il s'est reconnecté et le cours a repris normalement.",
     "Demandé au formateur de redémarrer son micro, puis reprise du point "
     "manqué."),
    ("Deux élèves n'arrivaient pas à entrer dans la salle : le lien avait "
     "expiré de leur côté.",
     "Nouveau lien envoyé sur le groupe, les deux élèves ont rejoint à 10h12."),
    ("Image saccadée pendant une dizaine de minutes à cause de la connexion "
     "du formateur.",
     "Caméra coupée le temps du partage d'écran, la séance est redevenue "
     "fluide."),
    ("Bruit de fond continu chez un participant qui avait laissé son micro "
     "ouvert.",
     "Micro coupé côté organisateur et rappel de la consigne dans le chat."),
    ("Le partage d'écran a mis du temps à s'afficher chez plusieurs élèves.",
     "Le formateur a repartagé la fenêtre, le problème a disparu."),
]

SOUCIS_IMPORTANTS = [
    ("Coupure totale de la connexion du formateur pendant 20 minutes. La "
     "séance a dû être interrompue puis reprise avec du retard.",
     "Prévenu les élèves dans le groupe, séance décalée de 25 minutes et "
     "prolongée d'autant."),
    ("Panne de la plateforme : impossible de démarrer le live à l'heure "
     "prévue.",
     "Basculé sur la solution de secours et informé le service technique. "
     "Ticket ouvert."),
    ("Le formateur ne s'est pas présenté et n'était joignable ni par "
     "téléphone ni par message.",
     "Séance annulée et reportée. Direction prévenue immédiatement."),
]

ELEVES = ["Sirine B.", "Mohamed A.", "Yasmine G.", "Anis Z.", "Rim H.",
          "Bilel N.", "Chaima F.", "Oussama T.", "Nour E."]

TICKETS = [
    ("Micro du studio 2 grésille", "Problème de son", "haute",
     "Depuis ce matin le micro du studio 2 fait un bruit de fond continu dès "
     "qu'on monte le gain. Testé avec deux câbles différents, même résultat.",
     "en_cours"),
    ("Impossible de lancer le live sur la chaîne", "Plateforme de live",
     "urgente",
     "La clé de stream est refusée depuis la mise à jour d'hier soir. Le "
     "cours de 18h est concerné.", "nouveau"),
    ("Accès formateur à réinitialiser", "Compte / accès", "moyenne",
     "Le nouveau formateur n'arrive pas à se connecter, mot de passe refusé.",
     "resolu"),
    ("Enregistrement du cours d'hier introuvable", "Enregistrement", "haute",
     "Le fichier n'apparaît pas dans le dossier partagé alors que "
     "l'enregistrement était bien lancé.", "resolu"),
    ("Webcam de la salle 1 non détectée", "Matériel", "basse",
     "Le PC de la salle 1 ne voit plus la webcam depuis le redémarrage.",
     "nouveau"),
]

REPONSES = [
    "Bonjour, merci pour le signalement. On regarde ça tout de suite.",
    "Nous avons reproduit le problème de notre côté, une intervention est en "
    "cours.",
    "C'est réglé, pouvez-vous confirmer que tout fonctionne ?",
]


def _dt(date, heure):
    return datetime.datetime.combine(
        date, datetime.time(int(heure[:2]), int(heure[3:5])))


def remplir(cnx, jours=14):
    """Ecrit un historique credible dans une base deja creee."""
    alea = random.Random(20260729)
    maintenant = datetime.datetime.now().replace(microsecond=0)
    aujourdhui = maintenant.date()
    horodatage = maintenant.isoformat(" ")

    # --- equipe ---------------------------------------------------------
    ids = {}
    for nom, email, couleur in EQUIPE:
        cur = cnx.execute(
            "INSERT INTO personnes (nom, fonction, email, telephone, couleur,"
            " actif, cree_le) VALUES (?, ?, ?, ?, ?, 1, ?)",
            (nom, schema.FONCTION, email, "", couleur, horodatage))
        ids[nom] = cur.lastrowid
    techniciens = list(ids.values())
    noms = {v: k for k, v in ids.items()}

    etats = [e["cle"] for e in schema.ETATS]
    compteur_rapport = {}

    def reference(jour):
        n = compteur_rapport.get(jour, 0) + 1
        compteur_rapport[jour] = n
        return "RAP-%s-%03d" % (jour.strftime("%Y-%m-%d"), n)

    # --- lives et rapports ---------------------------------------------
    for recul in range(jours, -1, -1):
        jour = aujourdhui - datetime.timedelta(days=recul)
        if jour.weekday() == 6:              # pas de live le dimanche
            continue
        combien = 9 if recul == 0 else alea.randint(5, 8)
        creneaux = HEURES[:combien]
        for index, heure in enumerate(creneaux):
            titre, formateur, plateforme = COURS[index % len(COURS)]
            fin = (_dt(jour, heure) + datetime.timedelta(minutes=90))
            heure_fin = fin.strftime("%H:%M")
            responsable = techniciens[index % len(techniciens)]
            debut = _dt(jour, heure)

            if debut > maintenant:
                statut = "planifie"
            elif fin > maintenant:
                statut = "en_cours"
            else:
                statut = "termine"

            live = cnx.execute(
                "INSERT INTO lives (titre, date, heure, heure_fin, formateur,"
                " plateforme, responsable_id, statut, note, cree_le, maj_le)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)",
                (titre, jour.isoformat(), heure, heure_fin, formateur,
                 plateforme, responsable, statut, horodatage, horodatage)
            ).lastrowid

            if statut != "termine":
                continue
            # quelques seances restent volontairement sans rapport
            if alea.random() < (0.28 if recul <= 2 else 0.08):
                continue

            tirage = alea.random()
            if tirage < 0.7:
                etat = "normale"
                description, actions = schema.TEXTE_RAS, schema.ACTIONS_RAS
                urgence, eleves = "faible", ""
            elif tirage < 0.93:
                etat = "petit"
                description, actions = alea.choice(SOUCIS_PETITS)
                urgence = alea.choice(["moyenne", "haute"])
                eleves = ", ".join(alea.sample(ELEVES, alea.randint(0, 2)))
            else:
                etat = "important"
                description, actions = alea.choice(SOUCIS_IMPORTANTS)
                urgence = alea.choice(["haute", "critique"])
                eleves = ", ".join(alea.sample(ELEVES, alea.randint(1, 3)))

            retard = alea.choice([5, 10, 15, 20, 35, 75, 130])
            envoye = min(fin + datetime.timedelta(minutes=retard),
                         maintenant - datetime.timedelta(minutes=1))
            retard_reel = max(0, int((envoye - fin).total_seconds() // 60))
            cnx.execute(
                "INSERT INTO rapports (reference, live_id, date, heure,"
                " nom_live, responsable_id, responsable_nom, etat, description,"
                " eleves, urgence, actions, commentaires, dossier, envoye_le,"
                " envoye_par, retard_min, maj_le, maj_par)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?,"
                " ?, ?, '')",
                (reference(jour), live, jour.isoformat(), heure, titre,
                 responsable, noms[responsable], etat, description, eleves,
                 urgence, actions, envoye.isoformat(" "), noms[responsable],
                 retard_reel, envoye.isoformat(" ")))
            assert etat in etats

    # --- tickets --------------------------------------------------------
    support = ids["Karim Haddad"]
    for index, (sujet, categorie, priorite, texte, statut) in enumerate(TICKETS):
        demandeur = techniciens[index % len(techniciens)]
        cree = maintenant - datetime.timedelta(hours=alea.randint(2, 90))
        resolu = ""
        if statut == "resolu":
            resolu = (cree + datetime.timedelta(
                minutes=alea.randint(45, 400))).isoformat(" ")
        ticket = cnx.execute(
            "INSERT INTO tickets (reference, sujet, description, categorie,"
            " priorite, statut, demandeur_id, demandeur_nom, assigne_id,"
            " live_id, dossier, cree_le, maj_le, resolu_le)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', ?, ?, ?)",
            ("TIC-%04d" % (index + 1), sujet, texte, categorie, priorite,
             statut, demandeur, noms[demandeur],
             support if statut != "nouveau" else None,
             cree.isoformat(" "), (resolu or cree.isoformat(" ")), resolu)
        ).lastrowid
        cnx.execute(
            "INSERT INTO messages (ticket_id, auteur, texte, cree_le)"
            " VALUES (?, ?, ?, ?)",
            (ticket, noms[demandeur], texte, cree.isoformat(" ")))
        if statut != "nouveau":
            for pas, reponse in enumerate(REPONSES[: 2 if statut == "en_cours"
                                                   else 3]):
                quand = cree + datetime.timedelta(minutes=25 * (pas + 1))
                cnx.execute(
                    "INSERT INTO messages (ticket_id, auteur, texte, cree_le)"
                    " VALUES (?, ?, ?, ?)",
                    (ticket, noms[support], reponse, quand.isoformat(" ")))

    cnx.execute(
        "INSERT INTO journal (quand, qui, action, cible, detail)"
        " VALUES (?, 'Système', 'Installation',"
        " 'Suivi des lives', 'Jeu de démonstration créé')", (horodatage,))
