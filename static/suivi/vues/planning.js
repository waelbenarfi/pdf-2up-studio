// Point 4 : repartir les lives de la journee entre les responsables.
// Chacun voit ensuite les seances qui lui reviennent.

import {
  CONST, api, etat, h, aujourdhui, dateLongue, decalerJour, essayer,
  rafraichir, personneDe, aller
} from '../noyau.js'
import {
  carte, vide, tableau, modale, confirmer, champTexte, champZone, champListe,
  valeurs, badgeStatutLive, badge, pastille, boutonIco, actionsLigne,
  optionsPersonnes, optionsSimples, info
} from '../ui.js'
import { ouvrirFormulaire } from './rapports.js'

export async function vuePlanning (params) {
  const date = params.date || aujourdhui()
  const lives = await api.get('/lives', { date })
  // rôle unique : chaque technicien actif peut recevoir des séances
  const equipe = etat.personnes.filter(p => p.actif)

  const navigation = h('div', { class: 'b-groupe' },
    h('button', { class: 'b ico', title: 'Jour précédent', onclick: () => aller('planning', { date: decalerJour(date, -1) }) }, '‹'),
    h('input', {
      class: 's-saisie', type: 'date', value: date,
      style: { width: '160px' },
      onchange: (e) => aller('planning', { date: e.target.value || aujourdhui() })
    }),
    h('button', { class: 'b ico', title: 'Jour suivant', onclick: () => aller('planning', { date: decalerJour(date, 1) }) }, '›'),
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
      + `${nonAttribues.length} sans responsable · glissez une carte d’une colonne à l’autre`,
    actions: [
      navigation,
      h('button', {
        class: 'b',
        onclick: () => repartir(date),
        disabled: !lives.length || !equipe.length
      }, '⇄ Répartir'),
      h('button', { class: 'b primaire', onclick: () => ouvrirLive({ date }) },
        '＋ Nouveau live')
    ]
  },
  lives.length
    ? h('div', { class: 's-colonnes' }, ...colonnes)
    : vide({
      ico: '🗓',
      titre: 'Aucun live ce jour-là',
      texte: 'Ajoutez les séances prévues, puis répartissez-les entre les responsables.',
      action: h('button', { class: 'b primaire', onclick: () => ouvrirLive({ date }) },
        '＋ Planifier un live')
    }),
  equipe.length
    ? null
    : info('Aucun technicien de live enregistré : ajoutez-en depuis l’écran '
      + 'Équipe pour pouvoir leur attribuer des séances.'))
}

/* ------------------------------------------------------------- colonnes */
function colonne ({ personne, lives, date }) {
  const sousTitre = personne
    ? `${lives.length} séance${lives.length > 1 ? 's' : ''}`
    : 'glissez une carte ici'
  const corps = h('div', { class: 's-colonne-corps' },
    ...lives.map(live => jeton(live)),
    lives.length ? null : h('div', { class: 's-colonne-vide' },
      personne ? 'Aucun live attribué' : 'Tout est attribué 👍'))

  const boite = h('div', { class: 's-colonne' },
    h('div', { class: 's-colonne-tete' },
      personne
        ? pastille(personne)
        : h('span', { class: 's-pastille', style: { background: 'var(--muted)' } }, '?'),
      h('div', { style: { flex: '1', minWidth: '0' } },
        h('b', {}, personne ? personne.nom : 'À attribuer'),
        h('small', {}, sousTitre)),
      badge(String(lives.length), lives.length ? 'accent' : 'muted')),
    corps)

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
  return boite
}

function jeton (live) {
  const carteLive = h('div', { class: 's-jeton', draggable: 'true' },
    h('div', { class: 'bandeau' },
      h('span', { class: 's-heure' }, live.heure || '—'),
      etiquetteRapport(live)),
    h('b', {}, live.titre),
    // ligne masquée quand ni formateur ni plateforme ne sont renseignés
    sousTitreLive(live),
    h('div', { class: 'outils' },
      live.aRapport
        ? null
        : boutonIco('📝', 'Remplir le rapport', () => ouvrirFormulaire({ live })),
      boutonIco('✏️', 'Modifier', () => ouvrirLive({ live })),
      boutonIco('🗑', 'Supprimer', () => supprimerLive(live), 'danger')))

  carteLive.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(live.id))
    e.dataTransfer.effectAllowed = 'move'
    carteLive.classList.add('porte')
  })
  carteLive.addEventListener('dragend', () => carteLive.classList.remove('porte'))
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

export function ouvrirLive ({ live = null, date = null, apres = null } = {}) {
  const modif = !!live
  const base = live || {
    titre: '', date: date || aujourdhui(), heure: '09:00', heure_fin: '',
    formateur: '', plateforme: CONST.plateformes[0], responsable_id: null,
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
        aide: 'Vide = 1 h 30'
      })),
    h('div', { class: 's-lignes d2' },
      champTexte(refs, 'formateur', 'Formateur', {
        valeur: base.formateur, optionnel: true, exemple: 'Ex. Bader AL'
      }),
      champListe(refs, 'plateforme', 'Plateforme',
        optionsSimples(CONST.plateformes, '—'), { valeur: base.plateforme })),
    h('div', { class: 's-lignes d2' },
      champListe(refs, 'responsable_id', 'Responsable du suivi',
        optionsPersonnes(etat.personnes, 'À attribuer plus tard'),
        { valeur: base.responsable_id ?? '' }),
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
      modif
        ? h('button', { class: 'b danger', onclick: () => { fermer(); supprimerLive(live) } }, '🗑 Supprimer')
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
  if (live.aRapport) return badge('rapport ✓', 'ok')
  if (live.sansRapport) return badge('rapport manquant', 'danger')
  return badgeStatutLive(live.statut)
}

/** Dans la liste, le statut a déjà sa colonne : celle-ci ne parle que du rapport. */
function colonneRapport (live) {
  if (live.aRapport) return badge(live.rapport_reference, 'ok', '✓')
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
      h('a', { class: 'b', href: '/api/suivi/export/lives.csv', download: '' }, '⬇︎ CSV'),
      h('button', { class: 'b primaire', onclick: () => ouvrirLive({}) }, '＋ Nouveau live')
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
      { titre: '', classe: 'actions', largeur: '130px' }
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
      badgeStatutLive(live.statut),
      colonneRapport(live),
      actionsLigne(
        live.aRapport
          ? null
          : boutonIco('📝', 'Remplir le rapport', () => ouvrirFormulaire({ live })),
        boutonIco('✏️', 'Modifier', () => ouvrirLive({ live })),
        boutonIco('🗑', 'Supprimer', () => supprimerLive(live), 'danger'))
    ],
    message: vide({ ico: '🗓', titre: 'Aucune séance', texte: 'Aucune séance ne correspond à ces filtres.' })
  }))
}
