// Points 1, 3 et 5 : le formulaire de rapport, la liste, le suivi des
// seances qui n'ont pas encore le leur.

import {
  CONST, api, etat, h, aujourdhui, heureMaintenant, dateCourte, dateLongue,
  momentDe, ilYA, duree, essayer, rafraichir, aller, personneDe,
  etatDe, decalerJour
} from '../noyau.js'
import {
  carte, vide, info, tableau, modale, confirmer, champTexte, champZone,
  champListe, champEtat, champPilules, valeurs, zoneFichiers, badgeEtat,
  badgeUrgence, badge, pastille, boutonIco, actionsLigne, ligneFiltres,
  optionsPersonnes, optionsSimples
} from '../ui.js'
import { ouvrirPersonne } from './equipe.js'

/* ================================================================ liste */
export async function vueRapports (params) {
  const filtres = {
    du: params.du || '', au: params.au || '', etat: params.etat || '',
    responsable: params.responsable || '', q: params.q || ''
  }
  const [liste, manquants] = await Promise.all([
    api.get('/rapports', filtres),
    api.get('/lives', { sansRapport: '1', du: decalerJour(aujourdhui(), -30) })
  ])

  const changer = (cle) => (evenement) =>
    aller('rapports', { ...filtres, [cle]: evenement.target.value })

  const refs = {}
  const barre = ligneFiltres(
    champTexte(refs, 'q', null, {
      valeur: filtres.q, exemple: '🔎  Rechercher un cours, une description…',
      onsaisie: debounce((e) => aller('rapports', { ...filtres, q: e.target.value }), 380)
    }),
    champListe(refs, 'etat', null, optionsSimples(CONST.etats, 'Tous les états'),
      { valeur: filtres.etat, onchoix: changer('etat') }),
    champListe(refs, 'responsable', null, optionsPersonnes(etat.personnes),
      { valeur: filtres.responsable, onchoix: changer('responsable') }),
    champTexte(refs, 'du', null, { type: 'date', valeur: filtres.du, onsaisie: changer('du') }),
    champTexte(refs, 'au', null, { type: 'date', valeur: filtres.au, onsaisie: changer('au') }),
    (filtres.q || filtres.etat || filtres.responsable || filtres.du || filtres.au) &&
      h('button', { class: 'b', onclick: () => aller('rapports') }, 'Tout afficher')
  )
  barre.querySelector('.s-champ').classList.add('large')

  return [
    manquants.length ? blocManquants(manquants) : null,
    carte({
      titre: `Rapports quotidiens · ${liste.length}`,
      sous: 'Un rapport par séance, même quand tout s’est bien passé.',
      actions: [
        h('a', {
          class: 'b', href: '/api/suivi/export/rapports.csv', download: ''
        }, '⬇︎ Exporter (CSV)'),
        h('button', { class: 'b primaire', onclick: () => ouvrirFormulaire() },
          '＋ Nouveau rapport')
      ]
    },
    h('div', { style: { marginBottom: '14px' } }, barre),
    tableau({
      colonnes: [
        { titre: 'Référence', largeur: '172px', classe: 's-nowrap' },
        { titre: 'Date', largeur: '110px' },
        { titre: 'Live / classe' },
        { titre: 'Responsable' },
        { titre: 'État' },
        { titre: 'Envoyé', classe: 's-nowrap' },
        { titre: '', classe: 'actions', largeur: '148px' }
      ],
      lignes: liste,
      surClic: (rapport) => ouvrirFiche(rapport.id),
      rendu: (rapport) => [
        h('span', { class: 'principal', style: { fontFamily: 'ui-monospace, monospace', fontSize: '12.5px' } },
          rapport.reference),
        h('div', {}, h('span', {}, dateCourte(rapport.date)),
          h('div', { class: 'discret' }, rapport.heure || '—')),
        h('div', {}, h('span', { class: 'principal' }, rapport.nom_live),
          rapport.fichiers.length
            ? h('span', { class: 'discret' }, ` 📎 ${rapport.fichiers.length}`)
            : null),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          pastille(personneDe(rapport.responsable_id), 'mini'),
          h('span', {}, rapport.responsable_nom || '—')),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
          badgeEtat(rapport.etat),
          rapport.etat !== 'normale' ? badgeUrgence(rapport.urgence) : null),
        h('div', {}, h('span', { class: 'discret' }, ilYA(rapport.envoye_le)),
          rapport.enRetard
            ? h('div', {}, badge(`retard ${duree(rapport.retard_min)}`, 'warn'))
            : null),
        actionsLigne(
          h('a', {
            class: 'b ico petit', title: 'Ouvrir le PDF',
            href: `/api/suivi/rapports/${rapport.id}/pdf`, target: '_blank', rel: 'noopener'
          }, '📄'),
          boutonIco('✏️', 'Modifier', () => ouvrirFormulaire({ rapport })),
          boutonIco('🗑', 'Supprimer', () => supprimer(rapport), 'danger'))
      ],
      message: vide({
        ico: '📝',
        titre: 'Aucun rapport pour ces critères',
        texte: 'Chaque séance terminée doit avoir son rapport, même si tout s’est bien passé.',
        action: h('button', { class: 'b primaire', onclick: () => ouvrirFormulaire() },
          '＋ Écrire le premier rapport')
      })
    }))
  ]
}

/** Point 5 : les seances passees dont le rapport manque encore. */
function blocManquants (manquants) {
  return carte({
    titre: `⏳ ${manquants.length} séance${manquants.length > 1 ? 's' : ''} sans rapport`,
    sous: 'Séances déjà terminées dont le rapport n’a pas encore été envoyé.',
    actions: [h('button', {
      class: 'b', onclick: () => aller('planning', { date: manquants[0].date })
    }, 'Voir le planning')]
  },
  h('div', { class: 's-liste' },
    ...manquants.slice(0, 6).map(live => h('div', { class: 's-item alerte' },
      h('span', { class: 's-heure' }, live.heure || '—'),
      h('div', { class: 'corps' },
        h('b', {}, live.titre),
        h('small', {}, `${dateLongue(live.date)} · ${live.responsable_nom || 'personne assignée'}`)),
      h('div', { class: 'droite' },
        badge('rapport manquant', 'danger'),
        h('button', {
          class: 'b primaire petit',
          onclick: () => ouvrirFormulaire({ live })
        }, 'Remplir le rapport')))),
    manquants.length > 6
      ? h('p', { class: 's-info' }, `et ${manquants.length - 6} autre(s) séance(s) en attente.`)
      : null))
}

/* =========================================================== formulaire */
/**
 * Le formulaire du point 1. Il sert aussi bien a creer qu'a modifier, et
 * peut etre pre-rempli a partir d'une seance planifiee.
 */
export function ouvrirFormulaire ({ rapport = null, live = null, apres = null } = {}) {
  // sans personne enregistrée, aucun rapport n'a de responsable : on guide
  // plutôt que de laisser l'utilisateur buter sur un champ vide
  if (!etat.personnes.length) {
    inviterEquipe(() => ouvrirFormulaire({ rapport, live, apres }))
    return
  }
  const modif = !!rapport
  const base = rapport || {
    date: live ? live.date : aujourdhui(),
    heure: live ? live.heure : heureMaintenant(),
    nom_live: live ? live.titre : '',
    // une séance encore non attribuée ne doit pas bloquer : c'est celui qui
    // écrit le rapport qui en devient le responsable
    responsable_id: (live && live.responsable_id) || etat.moi,
    etat: 'normale',
    description: '', eleves: '', urgence: 'faible',
    actions: '', commentaires: '',
    fichiers: []
  }

  const refs = {}
  const messages = h('div')
  let seanceLiee = null
  if (live) seanceLiee = live.id
  else if (rapport) seanceLiee = rapport.live_id
  const lives = { liste: [], choisi: seanceLiee }

  const zone = zoneFichiers({
    existants: base.fichiers || [],
    surSuppression: async (fichier) => {
      const fait = await essayer(() => api.del(`/fichiers/${fichier.id}`),
        'Pièce jointe supprimée.')
      return fait !== null
    }
  })

  // --- champs -----------------------------------------------------------
  const champDate = champTexte(refs, 'date', 'Date', {
    type: 'date', valeur: base.date, obligatoire: true
  })
  const champHeure = champTexte(refs, 'heure', 'Heure', {
    type: 'time', valeur: (base.heure || '').slice(0, 5), obligatoire: true
  })
  const champNom = champTexte(refs, 'nom_live', 'Nom du live / classe', {
    valeur: base.nom_live, exemple: 'Ex. Anglais professionnel — groupe B',
    obligatoire: true
  })
  const champResp = champListe(refs, 'responsable_id', 'Responsable',
    optionsPersonnes(etat.personnes, 'Choisir…'),
    { valeur: base.responsable_id ?? '', obligatoire: true })

  const champUrgence = champPilules(refs, 'urgence', 'Niveau d’urgence',
    CONST.urgences, { valeur: base.urgence })

  // point 3 : un rapport « tout va bien » s'ouvre déjà écrit
  const texteDepart = (champ, quandNormale) =>
    base[champ] || (base.etat === 'normale' ? quandNormale : '')

  const champDescription = champZone(refs, 'description',
    'Description de ce qui s’est passé', {
      valeur: texteDepart('description', CONST.texteRas),
      lignes: 5, obligatoire: true,
      exemple: 'Racontez simplement le déroulement de la séance.'
    })
  const champActions = champZone(refs, 'actions', 'Actions prises', {
    valeur: texteDepart('actions', CONST.actionsRas), lignes: 3,
    exemple: 'Ce que vous avez fait face à la situation.'
  })
  const champEleves = champTexte(refs, 'eleves', 'Élèves concernés', {
    valeur: base.eleves, optionnel: true,
    exemple: 'Séparez les noms par des virgules'
  })
  const champCommentaires = champZone(refs, 'commentaires', 'Commentaires', {
    valeur: base.commentaires, lignes: 3, optionnel: true,
    exemple: 'Remarques, suggestions, points à signaler à la direction.'
  })

  // point 3 : quand tout va bien, le texte est deja ecrit — un clic suffit
  const zoneTexteDescription = refs.description
  const zoneTexteActions = refs.actions
  const estRas = (texte) => !texte.trim() || texte.trim() === CONST.texteRas ||
    texte.trim() === CONST.actionsRas

  const champLEtat = champEtat(refs, {
    valeur: base.etat,
    onchoix: (cle) => {
      if (cle === 'normale') {
        if (estRas(zoneTexteDescription.value)) zoneTexteDescription.value = CONST.texteRas
        if (estRas(zoneTexteActions.value)) zoneTexteActions.value = CONST.actionsRas
        refs.urgence.value = 'faible'
      } else {
        if (estRas(zoneTexteDescription.value)) zoneTexteDescription.value = ''
        if (estRas(zoneTexteActions.value)) zoneTexteActions.value = ''
        if (refs.urgence.value === 'faible') {
          refs.urgence.value = cle === 'important' ? 'haute' : 'moyenne'
        }
      }
      majAide(cle)
    }
  })

  const aide = h('p', { class: 's-info' })
  const majAide = (cle) => {
    aide.textContent = cle === 'normale'
      ? 'Séance normale : le compte rendu est déjà rempli, vous pouvez l’envoyer tel quel.'
      : 'Décrivez le problème et les actions prises : ces deux champs deviennent obligatoires.'
  }
  majAide(base.etat)

  // --- rattachement a une seance planifiee ------------------------------
  const selecteurLive = h('div', { class: 's-champ' })
  if (!modif) {
    chargerLives(selecteurLive, lives, refs)
  }

  const enregistrer = async (fermer) => {
    const donnees = valeurs(refs)
    donnees.responsable_id = donnees.responsable_id || null
    if (!modif) donnees.live_id = lives.choisi || null

    const enregistre = await essayer(
      () => modif
        ? api.patch(`/rapports/${rapport.id}`, donnees)
        : api.post('/rapports', donnees),
      modif ? 'Rapport modifié.' : 'Rapport envoyé et classé dans son dossier.')
    if (!enregistre) return

    const attente = zone.nouveaux()
    if (attente.length) {
      await essayer(() => api.envoyer('rapport', enregistre.id, attente),
        `${attente.length} pièce(s) jointe(s) ajoutée(s).`)
    }
    fermer()
    if (apres) apres(enregistre); else rafraichir()
  }

  modale({
    titre: modif ? `Modifier le rapport ${rapport.reference}` : 'Rapport de séance',
    sous: modif
      ? 'La modification est enregistrée dans le journal.'
      : 'À remplir après chaque live — même quand tout s’est bien passé.',
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      messages,
      !modif ? selecteurLive : null,
      h('div', { class: 's-lignes d2' }, champDate, champHeure),
      champNom,
      champResp,
      h('div', { class: 's-sep' }),
      champLEtat,
      aide,
      champUrgence,
      champDescription,
      champActions,
      champEleves,
      h('div', { class: 's-champ' },
        h('label', {}, 'Capture d’écran ou fichier',
          h('span', { class: 'opt' }, '(optionnel)')),
        zone.noeud),
      champCommentaires),
    actions: (fermer) => [
      modif
        ? h('button', {
            class: 'b danger',
            onclick: () => { fermer(); supprimer(rapport) }
          }, '🗑 Supprimer')
        : null,
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: (e) => {
            e.target.disabled = true
            enregistrer(fermer).finally(() => { e.target.disabled = false })
          }
        }, modif ? 'Enregistrer' : 'Envoyer le rapport'))
    ]
  })
}

/** Première utilisation : proposer de créer la première personne. */
function inviterEquipe (reprise) {
  modale({
    titre: 'Commencez par votre équipe',
    sous: 'Un rapport est toujours signé par un responsable.',
    largeur: 'etroite',
    corps: h('p', { class: 's-info' },
      'Aucun technicien de live n’est encore enregistré. Ajoutez ceux qui '
      + 'suivront les séances : ils pourront ensuite recevoir des lives et '
      + 'écrire les rapports.'),
    actions: (fermer) => [
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Plus tard'),
        h('button', {
          class: 'b primaire',
          onclick: () => {
            fermer()
            ouvrirPersonne({ apres: () => reprise() })
          }
        }, '＋ Ajouter un technicien'))
    ]
  })
}

async function chargerLives (conteneur, lives, refs) {
  const debut = decalerJour(aujourdhui(), -14)
  const liste = (await api.get('/lives', { du: debut, au: aujourdhui() }))
    .filter(live => !live.aRapport && live.statut !== 'annule')
  lives.liste = liste
  if (!liste.length) {
    conteneur.append(info('Aucune séance planifiée en attente de rapport : '
      + 'remplissez librement les champs ci-dessous.'))
    return
  }
  const choix = h('select', {
    onchange: (e) => {
      const id = Number(e.target.value)
      lives.choisi = id || null
      const seance = liste.find(l => l.id === id)
      if (!seance) return
      refs.date.value = seance.date
      refs.heure.value = (seance.heure || '').slice(0, 5)
      refs.nom_live.value = seance.titre
      if (seance.responsable_id) refs.responsable_id.value = String(seance.responsable_id)
    }
  },
  h('option', { value: '' }, 'Séance libre (non planifiée)'),
  ...liste.map(live => h('option', {
    value: live.id, selected: lives.choisi === live.id
  }, `${dateCourte(live.date)} · ${live.heure} · ${live.titre}`)))
  conteneur.append(
    h('label', {}, 'Séance concernée'),
    choix,
    h('span', { class: 'aide' },
      'Choisir une séance remplit la date, l’heure et le nom automatiquement.'))
  if (lives.choisi) choix.dispatchEvent(new Event('change'))
}

/* ================================================================ fiche */
export async function ouvrirFiche (id) {
  const rapport = await api.get(`/rapports/${id}`)
  const marque = etatDe(rapport.etat)
  const ligne = (etiquette, valeur) => h('div', { class: 's-champ' },
    h('label', {}, etiquette),
    h('div', { style: { fontSize: '13.5px', whiteSpace: 'pre-wrap', lineHeight: '1.6' } },
      valeur || '—'))

  modale({
    titre: `${marque.icone}  ${rapport.nom_live}`,
    sous: `${rapport.reference} · ${dateLongue(rapport.date)}${rapport.heure ? ' à ' + rapport.heure : ''}`,
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        badgeEtat(rapport.etat), badgeUrgence(rapport.urgence),
        rapport.enRetard ? badge(`envoyé avec ${duree(rapport.retard_min)} de retard`, 'warn') : null),
      h('div', { class: 's-lignes d2' },
        ligne('Responsable', rapport.responsable_nom),
        ligne('Envoyé le', momentDe(rapport.envoye_le))),
      h('div', { class: 's-bloc' },
        ligne('Description de ce qui s’est passé', rapport.description),
        ligne('Actions prises', rapport.actions)),
      rapport.eleves ? ligne('Élèves concernés', rapport.eleves) : null,
      rapport.commentaires ? ligne('Commentaires', rapport.commentaires) : null,
      rapport.fichiers.length
        ? h('div', { class: 's-champ' },
            h('label', {}, `Pièces jointes (${rapport.fichiers.length})`),
            h('div', { class: 's-fichiers' }, ...rapport.fichiers.map(fichier =>
              h('a', {
                class: 's-fichier',
                href: `/api/suivi/fichier?chemin=${encodeURIComponent(fichier.chemin)}`,
                target: '_blank', rel: 'noopener',
                style: { textDecoration: 'none', color: 'inherit' }
              }, h('span', { class: 'nom' }, '📎 ' + fichier.nom)))))
        : null,
      rapport.maj_par
        ? info(`Dernière modification : ${momentDe(rapport.maj_le)} par ${rapport.maj_par}`)
        : null),
    actions: (fermer) => [
      h('button', {
        class: 'b danger',
        onclick: () => { fermer(); supprimer(rapport) }
      }, '🗑 Supprimer'),
      h('div', { class: 'droite' },
        h('a', {
          class: 'b', href: `/api/suivi/rapports/${rapport.id}/pdf?dl=1`
        }, '⬇︎ PDF'),
        h('button', {
          class: 'b primaire',
          onclick: () => { fermer(); ouvrirFormulaire({ rapport }) }
        }, '✏️ Modifier'))
    ]
  })
}

export function supprimer (rapport) {
  confirmer({
    titre: `Supprimer ${rapport.reference} ?`,
    texte: `Le rapport de « ${rapport.nom_live} », son PDF et son dossier `
      + 'd’archive seront effacés. La séance repassera en « rapport manquant ».',
    surOui: async () => {
      await essayer(() => api.del(`/rapports/${rapport.id}`), 'Rapport supprimé.')
      rafraichir()
    }
  })
}

function debounce (fonction, delai) {
  let minuteur
  return (...args) => {
    clearTimeout(minuteur)
    minuteur = setTimeout(() => fonction(...args), delai)
  }
}
