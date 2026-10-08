// Point 4 : repartir les lives de la journee entre les responsables.
// Chacun voit ensuite les seances qui lui reviennent.

import {
  CONST, api, etat, h, aujourdhui, dateLongue, decalerJour, essayer,
  rafraichir, remplir, personneDe, aller
} from '../noyau.js'
import {
  carte, vide, tableau, modale, confirmer, champTexte, champZone, champListe,
  valeurs, badgeStatutLive, badge, pastille, boutonIco, actionsLigne,
  optionsPersonnes, optionsSimples, info, ajouter, libelleDispo
} from '../ui.js'
import { ouvrirFormulaire, ouvrirRapportDe } from './rapports.js'
import { badgeTaches, boutonTaches, puceTaches } from './taches.js'
import { ouvrirImport } from './import.js'

import { ico } from '../icones.js'
export async function vuePlanning (params) {
  const date = params.date || aujourdhui()
  const lives = await api.get('/lives', { date })
  // Cet écran montre une journée à la fois. Vide, il ne dit pas s'il n'y a
  // rien ce jour-là ou rien du tout — après un import qui commence plus
  // tard, on croit que rien n'a été importé. On pointe donc vers la
  // prochaine journée qui a des séances.
  let prochaine = ''
  let sens = 'suivante'
  if (!lives.length) {
    const voisines = await api.get('/lives/voisines', { date })
    prochaine = voisines.suivante || voisines.precedente || ''
    sens = voisines.suivante ? 'suivante' : 'precedente'
  }
  // rôle unique : chaque technicien actif peut recevoir des séances
  const equipe = etat.personnes.filter(p => p.actif)

  // qui dépasse son plafond ce soir-là : le bandeau du jour le nomme
  const debordent = equipe.map(p => ({
    nom: p.nom,
    max: p.max_soir,
    combien: lives.filter(l => l.responsable_id === p.id).length
  })).filter(p => p.max && p.combien > p.max)

  const navigation = h('div', { class: 'b-groupe' },
    h('button', { class: 'b ico', title: 'Jour précédent', onclick: () => aller('planning', { date: decalerJour(date, -1) }) }, ico('gauche')),
    h('input', {
      class: 's-saisie', type: 'date', value: date,
      style: { width: '160px' },
      onchange: (e) => aller('planning', { date: e.target.value || aujourdhui() })
    }),
    h('button', { class: 'b ico', title: 'Jour suivant', onclick: () => aller('planning', { date: decalerJour(date, 1) }) }, ico('droite')),
    date !== aujourdhui()
      ? h('button', { class: 'b', onclick: () => aller('planning', { date: aujourdhui() }) }, "Aujourd'hui")
      : null)

  const nonAttribues = lives.filter(l => !l.responsable_id)
  const colonnes = [
    colonne({ personne: null, lives: nonAttribues, date }),
    ...equipe.map(personne => colonne({
      personne, date, lives: lives.filter(l => l.responsable_id === personne.id)
    }))
  ]

  const orphelins = lives.filter(l => l.responsable_id &&
    !equipe.some(p => p.id === l.responsable_id))
  if (orphelins.length) {
    const parPersonne = new Map()
    for (const live of orphelins) {
      if (!parPersonne.has(live.responsable_id)) parPersonne.set(live.responsable_id, [])
      parPersonne.get(live.responsable_id).push(live)
    }
    for (const [id, liste] of parPersonne) {
      colonnes.push(colonne({ personne: personneDe(id), lives: liste, date }))
    }
  }

  return carte({
    titre: `Planification · ${dateLongue(date)}`,
    sous: `${lives.length} live${lives.length > 1 ? 's' : ''} · `
      + `${nonAttribues.length} sans responsable · `
      + (debordent.length
        ? `${debordent.length} au-dessus de leur plafond : `
          + debordent.map(p => `${p.nom} ${p.combien}`).join(', ')
        : etat.admin
          ? 'glissez une carte d’une colonne à l’autre'
          : 'l’attribution est réservée à l’administrateur'),
    actions: [
      navigation,
      etat.admin
        ? h('button', {
          class: 'b',
          onclick: () => repartir(date),
          disabled: !lives.length || !equipe.length
        }, ico('echange', 15), 'Répartir')
        : null,
      etat.admin
        ? h('button', {
          class: 'b',
          onclick: () => deplacerJournee(date, lives),
          disabled: !lives.length
        }, ico('agenda', 15), 'Reporter le jour')
        : null,
      etat.admin
        ? h('button', { class: 'b', onclick: () => reaffecterSeances(date) },
          ico('equipe', 15), 'Réaffecter')
        : null,
      etat.admin
        ? h('button', { class: 'b', onclick: () => ouvrirImport() },
          ico('recevoir', 15), 'Importer')
        : null,
      h('button', { class: 'b primaire', onclick: () => ouvrirLive({ date }) },
        ico('plus', 15), 'Nouveau live')
    ]
  },
  lives.length
    ? h('div', { class: 's-colonnes' }, ...colonnes)
    : vide({
      dessin: 'agenda',
      titre: 'Aucun live ce jour-là',
      texte: prochaine
        ? (sens === 'suivante'
            ? `La prochaine journée planifiée est le ${dateLongue(prochaine)}.`
            : `La dernière journée planifiée est le ${dateLongue(prochaine)}.`)
        : 'Ajoutez les séances prévues, puis répartissez-les entre les responsables.',
      action: prochaine
        ? h('div', { class: 'b-groupe' },
          h('button', {
            class: 'b primaire',
            onclick: () => aller('planning', { date: prochaine })
          }, ico(sens === 'suivante' ? 'droite' : 'gauche', 15),
          'Y aller'),
          h('button', { class: 'b', onclick: () => ouvrirLive({ date }) },
            ico('plus', 15), 'Planifier un live'))
        : h('button', { class: 'b primaire', onclick: () => ouvrirLive({ date }) },
          ico('plus', 15), 'Planifier un live')
    }),
  equipe.length
    ? null
    : info('Aucun technicien de live enregistré : ajoutez-en depuis l’écran '
      + 'Équipe pour pouvoir leur attribuer des séances.'))
}

/* ------------------------------------------------------------- colonnes */
function colonne ({ personne, lives, date }) {
  // Le plafond de la personne, s'il est posé sur sa fiche : la colonne le
  // dit elle-même, au lieu de laisser compter les cartes.
  const plafond = personne ? personne.max_soir : null
  const trop = plafond && lives.length > plafond
  const sousTitre = personne
    ? `${lives.length} séance${lives.length > 1 ? 's' : ''}`
      + (plafond ? ` · au plus ${plafond}` : '')
      + (libelleDispo(personne) && !plafond ? ` · ${libelleDispo(personne)}` : '')
    : (etat.admin ? 'glissez une carte ici' : 'en attente d’attribution')
  const corps = h('div', { class: 's-colonne-corps' },
    ...lives.map(live => jeton(live)),
    lives.length ? null : h('div', { class: 's-colonne-vide' },
      personne ? 'Aucun live attribué' : 'Tout est attribué'))

  const boite = h('div', { class: 's-colonne' },
    h('div', { class: 's-colonne-tete' },
      personne
        ? pastille(personne)
        : h('span', { class: 's-pastille', style: { background: 'var(--muted)' } }, '?'),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('b', {}, personne ? personne.nom : 'À attribuer'),
        h('small', {}, sousTitre)),
      badge(String(lives.length), trop ? 'danger'
        : lives.length ? 'accent' : 'muted', trop ? ico('alerte', 11) : null)),
    corps)

  // seul l'administrateur attribue : pour les autres, la colonne ne
  // reçoit rien et aucune carte ne se saisit
  if (etat.admin) {
    boite.addEventListener('dragover', (e) => {
      e.preventDefault()
      boite.classList.add('survol')
    })
    boite.addEventListener('dragleave', () => boite.classList.remove('survol'))
    boite.addEventListener('drop', async (e) => {
      e.preventDefault()
      boite.classList.remove('survol')
      const id = Number(e.dataTransfer.getData('text/plain'))
      if (!id) return
      await essayer(
        () => api.patch(`/lives/${id}`, { responsable_id: personne ? personne.id : null }),
        personne ? `Live attribué à ${personne.nom}.` : 'Attribution retirée.')
      rafraichir()
    })
  }
  return boite
}

// L'heure et l'état d'abord, le titre ensuite, le compteur d'étapes en pied :
// trois lignes de pastilles avant le titre faisaient perdre de vue la séance.
function jeton (live) {
  const carteLive = h('div', {
    class: 's-jeton', draggable: etat.admin ? 'true' : 'false'
  },
    h('div', { class: 'bandeau' },
      h('span', { class: 's-heure' }, live.heure || '—'),
      etiquetteRapport(live)),
    h('b', {}, live.titre),
    h('div', { class: 'pied' },
      // ligne masquée quand ni professeur ni plateforme ne sont renseignés
      sousTitreLive(live),
      puceTaches(live)),
    h('div', { class: 'outils' },
      live.aRapport
        ? boutonIco(ico('document_crayon'), 'Modifier le rapport',
          () => ouvrirRapportDe(live))
        : boutonIco(ico('document'), 'Remplir le rapport',
          () => ouvrirFormulaire({ live })),
      boutonIco(ico('crayon'), 'Modifier la séance', () => ouvrirLive({ live })),
      etat.admin
        ? boutonIco(ico('corbeille'), 'Supprimer', () => supprimerLive(live),
          'danger')
        : null))

  if (etat.admin) {
    carteLive.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(live.id))
      e.dataTransfer.effectAllowed = 'move'
      carteLive.classList.add('porte')
    })
    carteLive.addEventListener('dragend',
      () => carteLive.classList.remove('porte'))
  }
  return carteLive
}

/* ------------------------------------------------------------ actions */
function repartir (date) {
  confirmer({
    titre: 'Répartir automatiquement ?',
    texte: 'Les lives de cette journée seront distribués à tour de rôle entre '
      + 'les techniciens de live. Les attributions existantes seront remplacées.',
    bouton: 'Répartir',
    surOui: async () => {
      await essayer(() => api.post('/lives/repartir', { date }), 'Lives répartis.')
      rafraichir()
    }
  })
}

/**
 * Reporter toute une journee. Un report vise presque toujours la journee
 * entiere -- un dimanche qui glisse d'une semaine, un jour ferie -- et le
 * faire seance par seance laissait facilement un oubli derriere soi.
 */
function deplacerJournee (date, lives) {
  const bougent = lives.filter(l => l.statut !== 'annule' && !l.aRapport)
  const restent = lives.length - bougent.length
  const refs = {}
  // Le decalage d'une semaine est le cas courant : il est propose d'emblee,
  // et le champ reste libre pour tout le reste.
  const champ = champTexte(refs, 'vers', 'Nouvelle date', {
    type: 'date', valeur: decalerJour(date, 7)
  })

  const raccourci = (pas, libelle) => h('button', {
    class: 'b', type: 'button',
    onclick: () => { refs.vers.value = decalerJour(date, pas) }
  }, libelle)

  const { fermer } = modale({
    titre: 'Reporter la journée',
    largeur: 'etroite',
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('p', { style: { fontSize: '13.5px', lineHeight: '1.6', color: 'var(--muted)', margin: 0 } },
        `${bougent.length} séance${bougent.length > 1 ? 's' : ''} du `
        + `${dateLongue(date)} ${bougent.length > 1 ? 'seront reportées' : 'sera reportée'} `
        + 'à la date choisie, avec leur responsable et leurs étapes déjà cochées.'),
      champ,
      h('div', { class: 'b-groupe' },
        raccourci(7, 'Semaine suivante'),
        raccourci(1, 'Lendemain'),
        raccourci(-7, 'Semaine précédente')),
      restent
        ? info(`${restent} séance(s) de ce jour ne bougeront pas : annulées, `
          + 'ou leur rapport est déjà envoyé.')
        : null),
    actions: (ferme) => [
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: ferme }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: async () => {
            const vers = refs.vers.value
            if (!vers || vers === date) return
            ferme()
            const fait = await essayer(
              () => api.post('/lives/deplacer', { date, vers }),
              `${bougent.length} séance(s) reportée(s).`)
            if (!fait) return
            // on suit les séances : rester sur un jour qu'on vient de vider
            // donnerait l'impression de les avoir perdues
            aller('planning', { date: vers })
          }
        }, ico('agenda', 15), 'Reporter'))
    ]
  })
  return fermer
}

/** « 12/10 · 19:00 » — assez pour situer une séance dans un récapitulatif. */
const courte = (seance) => seance
  ? `${seance.date.slice(8, 10)}/${seance.date.slice(5, 7)}`
    + `${seance.heure ? ' · ' + seance.heure.slice(0, 5) : ''}`
  : '—'

/**
 * Réaffecter un paquet de séances, à parts égales.
 *
 * Quand quelqu'un quitte l'équipe — ou qu'un jour de la semaine doit
 * revenir à deux personnes précises —, reprendre les séances une par une
 * au glisser-déposer est long et laisse toujours un oubli derrière soi. On
 * décrit ce qu'on veut, on regarde le plan, et on applique.
 *
 * Le plan vient du serveur : c'est lui qui répartira, donc c'est lui qui
 * doit dire d'avance ce qu'il va faire. Un aperçu calculé ici pourrait
 * annoncer autre chose que ce qui se passera.
 */
function reaffecterSeances (date) {
  const equipe = etat.personnes.filter(p => p.actif)
  const de = new Set()        // vide = les séances de tout le monde
  const profs = new Set()     // vide = tous les professeurs
  const horsProfs = new Set() // les professeurs mis de côté
  const jours = new Set()     // vide = tous les jours de la semaine
  // un Set garde l'ordre des clics : c'est lui qui donne l'ordre du tour
  const vers = new Set()
  const refs = {}
  let mode = 'egal'
  let plan = null

  const apercu = h('div')
  const listeDe = h('div', { class: 's-choix-equipe' })
  const listeProfs = h('div', {
    class: 's-choix-equipe',
    style: { maxHeight: '132px', overflowY: 'auto' }
  })
  const listeHorsProfs = h('div', {
    class: 's-choix-equipe',
    style: { maxHeight: '132px', overflowY: 'auto' }
  })
  const listeJours = h('div', { class: 's-choix-equipe' })
  const listeVers = h('div', { class: 's-choix-equipe' })
  const bouton = h('button', { class: 'b primaire', disabled: true },
    ico('echange', 15), 'Réaffecter')

  const chip = (libelle, pris, surClic, personne = null) =>
    h('button', {
      type: 'button', class: `s-choix-qui ${pris ? 'pris' : ''}`,
      onclick: surClic
    },
    h('span', { class: 'case' }, pris ? ico('coche', 13) : null),
    personne ? pastille(personne, 'mini') : null,
    h('span', {}, libelle))

  function basculer (ensemble, valeur) {
    if (ensemble.has(valeur)) ensemble.delete(valeur)
    else ensemble.add(valeur)
    dessiner()
    montrer()
  }

  const listeMode = h('div', { class: 's-choix-equipe' })
  const dessinerMode = () => remplir(listeMode,
    ...[['egal', 'À parts égales'], ['tour', 'À tour de rôle']].map(
      ([cle, libelle]) => chip(libelle, mode === cle, () => {
        mode = cle
        dessinerMode()
        dessiner()
        montrer()
      })))

  function dessiner () {
    remplir(listeDe,
      chip('Sans responsable', de.has(0), () => basculer(de, 0)),
      ...equipe.map(p => chip(p.nom, de.has(p.id), () => basculer(de, p.id), p)))
    const avecSeances = (etat.professeurs || [])
      .filter(p => p.actif && p.seances)
    remplir(listeProfs, ...avecSeances
      .map(p => chip(`${p.nom} · ${p.seances}`, profs.has(p.id),
        () => basculer(profs, p.id))))
    remplir(listeHorsProfs, ...avecSeances
      .map(p => chip(`${p.nom} · ${p.seances}`, horsProfs.has(p.id),
        () => basculer(horsProfs, p.id))))
    remplir(listeJours, ...CONST.jours.map((nom, i) =>
      chip(nom, jours.has(i), () => basculer(jours, i))))
    remplir(listeVers, ...equipe.map(p => {
      // en tour de rôle, le rang de chacun se lit sur sa pastille
      const rang = [...vers].indexOf(p.id)
      const libelle = mode === 'tour' && rang >= 0
        ? `${rang + 1}. ${p.nom}`
        : p.nom
      return chip(libelle, vers.has(p.id), () => basculer(vers, p.id), p)
    }))
  }

  const demande = (appliquer) => ({
    du: refs.du.value, au: refs.au.value, deQui: [...de], deProf: [...profs],
    jours: [...jours], versQui: [...vers], mode, appliquer,
    saufProf: [...horsProfs]
  })

  async function montrer () {
    plan = null
    bouton.disabled = true
    if (!vers.size) {
      remplir(apercu, info('Cochez les personnes qui recevront les séances.'))
      return
    }
    try {
      plan = await api.post('/lives/reaffecter', demande(false))
    } catch (souci) {
      remplir(apercu, info(String(souci.message || souci)))
      return
    }
    bouton.disabled = !plan.total
    remplir(apercu,
      h('div', { class: 's-import-resume' },
        badge(`${plan.total} séance(s) à répartir`,
          plan.total ? 'ok' : 'warn', ico('agenda', 12)),
        plan.terminees
          ? badge(`${plan.terminees} déjà rapportée(s), non touchée(s)`,
            'muted')
          : null,
        plan.annulees ? badge(`${plan.annulees} annulée(s)`, 'muted') : null,
        plan.orphelines.length
          ? badge(`${plan.orphelines.length} que personne ne peut prendre`,
            'warn', ico('alerte', 12))
          : null),
      plan.orphelines.length
        ? info('Ces séances restent où elles sont : aucune des personnes '
          + 'cochées n’est disponible à cette heure ou ce jour-là — '
          + plan.orphelines.slice(0, 4).map(s =>
            `${courte(s)} ${s.titre}`).join(' · ')
          + (plan.orphelines.length > 4
            ? ` … et ${plan.orphelines.length - 4} autre(s).` : '.'))
        : null,
      plan.total
        ? tableau({
          colonnes: [{ titre: 'Reçoit' }, { titre: 'Séances', largeur: '90px' },
            { titre: 'Du … au', largeur: '150px' },
            { titre: 'Horaires reçus' }],
          lignes: plan.repartition,
          rendu: (part) => [
            h('div', {
              style: {
                display: 'flex', alignItems: 'center', gap: '8px'
              }
            }, pastille(personneDe(part.id), 'mini'),
            h('div', {},
              h('div', {}, part.nom),
              // la contrainte sous le nom : sinon un total plus bas que les
              // autres passe pour une erreur de répartition
              libelleDispo({ heure_min: part.heureMin, jours: part.jours })
                ? h('small', { class: 'discret' },
                  libelleDispo({ heure_min: part.heureMin, jours: part.jours }))
                : null)),
            h('b', {}, String(part.combien)),
            h('span', { class: 'discret' },
              part.seances.length
                ? `${courte(part.seances[0])} → `
                  + `${courte(part.seances[part.seances.length - 1])}`
                : '—'),
            // deux personnes peuvent avoir le même nombre de séances sans
            // avoir le même travail : c'est ici que l'équité se voit
            h('div', { class: 's-niveaux' },
              ...part.horaires.map(creneau =>
                badge(`${creneau.heure}${creneau.combien > 1 ? ' × ' + creneau.combien : ''}`,
                  'info')))
          ],
          message: vide({ titre: 'Rien à répartir' })
        })
        : info('Aucune séance ne correspond : vérifiez la date de départ, '
          + 'les personnes et les jours cochés.'))
  }

  const { fermer } = modale({
    titre: 'Réaffecter des séances',
    sous: 'À parts égales, dans l’ordre du calendrier.',
    largeur: 'large',
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div', { class: 's-lignes d2' },
        champTexte(refs, 'du', 'À partir du', {
          type: 'date', valeur: date, obligatoire: true, onsaisie: montrer
        }),
        champTexte(refs, 'au', 'Jusqu’au', {
          type: 'date', valeur: '', optionnel: true, onsaisie: montrer,
          aide: 'Vide = jusqu’à la dernière séance planifiée'
        })),
      h('div', { class: 's-champ' },
        h('label', {}, 'Séances de ', h('span', { class: 'opt' },
          '(rien de coché = tout le monde)')),
        listeDe),
      // « les séances de tel professeur » n'est pas « les séances de tel
      // responsable » : un professeur donne la séance, un technicien en
      // répond. Les deux filtres existent, et se cumulent.
      h('details', { class: 's-champ' },
        h('summary', { style: { cursor: 'pointer', marginBottom: '7px' } },
          'Séances d’un professeur en particulier ',
          h('span', { class: 'opt' }, '(rien de coché = tous)')),
        listeProfs),
      // mettre de côté ce qu'on vient de fixer à la main, pour équilibrer
      // tout le reste autour sans y revenir
      h('details', { class: 's-champ' },
        h('summary', { style: { cursor: 'pointer', marginBottom: '7px' } },
          'Sauf les séances d’un professeur ',
          h('span', { class: 'opt' }, '(rien de coché = aucune exclusion)')),
        listeHorsProfs),
      h('div', { class: 's-champ' },
        h('label', {}, 'Seulement les ', h('span', { class: 'opt' },
          '(rien de coché = tous les jours)')),
        listeJours),
      h('div', { class: 's-champ' },
        h('label', {}, 'Comment'),
        listeMode,
        h('span', { class: 'aide' },
          'À parts égales : les soirées et les totaux s’équilibrent. '
          + 'À tour de rôle : chacun son tour, dans l’ordre où vous les '
          + 'cochez ci-dessous.')),
      h('div', { class: 's-champ' },
        h('label', {}, 'À répartir entre ',
          h('span', { class: 'oblig' }, '*')),
        listeVers),
      apercu),
    actions: (ferme) => {
      bouton.addEventListener('click', async () => {
        if (!plan || !plan.total) return
        bouton.disabled = true
        const fait = await essayer(
          () => api.post('/lives/reaffecter', demande(true)),
          `${plan.total} séance(s) réaffectée(s).`)
        bouton.disabled = false
        if (!fait) return
        ferme()
        rafraichir()
      })
      return [h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: ferme }, 'Annuler'), bouton)]
    }
  })

  dessinerMode()
  dessiner()
  montrer()
  return fermer
}

/** « 2 h », « 1 h 30 » — la durée que le serveur appliquera si on laisse vide. */
function dureeDefaut () {
  const minutes = CONST.dureeSeanceMin || 120
  const heures = Math.floor(minutes / 60)
  const reste = minutes % 60
  return `${heures} h${reste ? ' ' + String(reste).padStart(2, '0') : ''}`
}

export function ouvrirLive ({ live = null, date = null, apres = null } = {}) {
  const modif = !!live
  // une séance créée par un technicien lui revient : c'est l'administrateur
  // qui distribue le travail, et une séance sans personne se perd
  const base = live || {
    titre: '', date: date || aujourdhui(), heure: '09:00', heure_fin: '',
    formateur: '', plateforme: CONST.plateformes[0],
    responsable_id: etat.admin ? null : etat.moi,
    statut: 'planifie', note: ''
  }
  const refs = {}

  const corps = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
    champTexte(refs, 'titre', 'Nom du live / classe', {
      valeur: base.titre, obligatoire: true,
      exemple: 'Ex. Excel avancé — groupe du soir'
    }),
    h('div', { class: 's-lignes d3' },
      champTexte(refs, 'date', 'Date', { type: 'date', valeur: base.date, obligatoire: true }),
      champTexte(refs, 'heure', 'Début', { type: 'time', valeur: (base.heure || '').slice(0, 5), obligatoire: true }),
      champTexte(refs, 'heure_fin', 'Fin', {
        type: 'time', valeur: (base.heure_fin || '').slice(0, 5),
        // le texte suit la constante du serveur : deux endroits qui
        // annoncent une duree finiraient par ne plus dire la meme chose
        aide: `Vide = ${dureeDefaut()}`
      })),
    h('div', { class: 's-lignes d2' },
      // choisi dans le répertoire : c'est ce qui donne accès à son numéro
      // depuis l'étape d'appel. Un nom tapé à la main reste accepté.
      champProfesseur(refs, base),
      champListe(refs, 'plateforme', 'Plateforme',
        optionsSimples(CONST.plateformes, '—'), { valeur: base.plateforme })),
    h('div', { class: 's-lignes d2' },
      champListe(refs, 'responsable_id', 'Responsable du suivi',
        optionsPersonnes(etat.personnes, 'À attribuer plus tard'),
        {
          valeur: base.responsable_id ?? '',
          verrouille: !etat.admin,
          aide: etat.admin
            ? undefined
            : 'Seul l’administrateur attribue une séance.'
        }),
      champListe(refs, 'statut', 'Statut',
        optionsSimples(CONST.statutsLive), { valeur: base.statut })),
    champZone(refs, 'note', 'Note interne', {
      valeur: base.note, lignes: 2, optionnel: true,
      exemple: 'Consigne particulière pour cette séance.'
    }))

  modale({
    titre: modif ? 'Modifier le live' : 'Nouveau live',
    sous: modif ? live.titre : 'Ajoutez une séance au planning.',
    corps,
    actions: (fermer) => [
      modif && etat.admin
        ? h('button', { class: 'b danger', onclick: () => { fermer(); supprimerLive(live) } }, ico('corbeille', 15), 'Supprimer')
        : null,
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: async (e) => {
            e.target.disabled = true
            const donnees = valeurs(refs)
            donnees.responsable_id = donnees.responsable_id || null
            const fait = await essayer(
              () => modif ? api.patch(`/lives/${live.id}`, donnees)
                : api.post('/lives', donnees),
              modif ? 'Live modifié.' : 'Live ajouté au planning.')
            e.target.disabled = false
            if (!fait) return
            fermer()
            if (apres) apres(fait); else rafraichir()
          }
        }, modif ? 'Enregistrer' : 'Ajouter'))
    ]
  })
}

/**
 * Le professeur : au répertoire, ou tapé à la main.
 *
 * Le choisir dans la liste relie la séance à sa fiche, donc à son numéro.
 * « Autre » reste possible — on ne bloque pas une saisie parce qu'un
 * professeur n'a pas encore été enregistré.
 */
function champProfesseur (refs, base) {
  const connus = etat.professeurs || []
  const choix = [
    { valeur: '', libelle: '— Autre / à saisir —' },
    ...connus.map(p => ({
      valeur: p.id,
      libelle: p.telephone ? `${p.nom} · ${p.telephone}` : p.nom
    }))
  ]
  const boite = h('div', { class: 's-champ' })
  const libre = champTexte(refs, 'formateur', null, {
    valeur: base.formateur, exemple: 'Ex. Mr Mohamed'
  })
  const liste = champListe(refs, 'professeur_id', 'Professeur', choix, {
    valeur: base.professeur_id ?? '',
    optionnel: true,
    onchoix: (e) => { libre.hidden = !!e.target.value }
  })
  libre.hidden = !!base.professeur_id
  ajouter(boite, [liste, libre])
  if (!connus.length) {
    ajouter(boite, [h('span', { class: 'aide' },
      'Aucun professeur au répertoire : leur numéro n’apparaîtra pas sur '
      + 'l’étape d’appel.')])
  }
  return boite
}

export function supprimerLive (live) {
  confirmer({
    titre: 'Supprimer ce live ?',
    texte: `« ${live.titre} » du ${dateLongue(live.date)} sera retiré du planning.`
      + (live.aRapport ? ' Son rapport sera conservé.' : ''),
    surOui: async () => {
      await essayer(() => api.del(`/lives/${live.id}`), 'Live supprimé.')
      rafraichir()
    }
  })
}

function sousTitreLive (live) {
  const texte = [live.formateur, live.plateforme].filter(Boolean).join(' · ')
  return texte ? h('small', {}, texte) : null
}

/** Sur une carte de planning : une seule étiquette, le rapport d'abord. */
function etiquetteRapport (live) {
  if (live.aRapport) return badge('rapport', 'ok', ico('coche', 12))
  if (live.sansRapport) return badge('rapport manquant', 'danger')
  return badgeStatutLive(live)
}

/** Dans la liste, le statut a déjà sa colonne : celle-ci ne parle que du rapport. */
function colonneRapport (live) {
  if (live.aRapport) return badge(live.rapport_reference, 'ok', ico('coche'))
  if (live.sansRapport) return badge('manquant', 'danger')
  return badge('à venir', 'muted')
}

/* ------------------------------------------- liste complete des seances */
export async function vueLives (params) {
  const filtres = {
    du: params.du || '', au: params.au || '',
    responsable: params.responsable || '', statut: params.statut || ''
  }
  const lives = await api.get('/lives', filtres)
  const changer = (cle) => (e) => aller('lives', { ...filtres, [cle]: e.target.value })
  const refs = {}

  return carte({
    titre: `Toutes les séances · ${lives.length}`,
    sous: 'Historique complet, avec ou sans rapport.',
    actions: [
      h('a', { class: 'b', href: '/api/suivi/export/lives.csv', download: '' }, ico('telecharger', 15), 'CSV'),
      h('button', { class: 'b primaire', onclick: () => ouvrirLive({}) }, ico('plus', 15), 'Nouveau live')
    ]
  },
  h('div', { style: { marginBottom: '14px' } },
    h('div', { class: 's-filtres' },
      champTexte(refs, 'du', null, { type: 'date', valeur: filtres.du, onsaisie: changer('du') }),
      champTexte(refs, 'au', null, { type: 'date', valeur: filtres.au, onsaisie: changer('au') }),
      champListe(refs, 'responsable', null, optionsPersonnes(etat.personnes),
        { valeur: filtres.responsable, onchoix: changer('responsable') }),
      champListe(refs, 'statut', null, optionsSimples(CONST.statutsLive, 'Tous les statuts'),
        { valeur: filtres.statut, onchoix: changer('statut') }),
      h('button', { class: 'b', onclick: () => aller('lives') }, 'Tout afficher'))),
  tableau({
    colonnes: [
      { titre: 'Date', largeur: '120px' }, { titre: 'Heure', largeur: '110px' },
      { titre: 'Live / classe' }, { titre: 'Responsable' },
      { titre: 'Statut' }, { titre: 'Rapport' },
      { titre: 'Étapes', largeur: '90px' },
      { titre: '', classe: 'actions', largeur: '160px' }
    ],
    lignes: lives,
    rendu: (live) => [
      dateLongue(live.date).replace(/^(\S+)\s/, ''),
      h('span', { style: { fontFamily: 'ui-monospace, monospace' } },
        `${live.heure || '—'}${live.heure_fin ? ' → ' + live.heure_fin : ''}`),
      h('div', {}, h('span', { class: 'principal' }, live.titre),
        h('div', { class: 'discret' },
          [live.formateur, live.plateforme].filter(Boolean).join(' · '))),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        pastille(personneDe(live.responsable_id), 'mini'),
        h('span', {}, live.responsable_nom || 'à attribuer')),
      badgeStatutLive(live),
      colonneRapport(live),
      badgeTaches(live),
      actionsLigne(
        boutonTaches(live),
        live.aRapport
          ? boutonIco(ico('document_crayon'), 'Modifier le rapport',
            () => ouvrirRapportDe(live))
          : boutonIco(ico('document'), 'Remplir le rapport',
            () => ouvrirFormulaire({ live })),
        boutonIco(ico('crayon'), 'Modifier la séance', () => ouvrirLive({ live })),
        boutonIco(ico('corbeille'), 'Supprimer', () => supprimerLive(live), 'danger'))
    ],
    message: vide({ dessin: 'agenda', titre: 'Aucune séance', texte: 'Aucune séance ne correspond à ces filtres.' })
  }))
}
