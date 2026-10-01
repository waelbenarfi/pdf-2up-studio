// Ce qui a été coché dans la journée, et par qui.
//
// Un compteur seul ne vaut pas grand-chose : savoir que quelqu'un a fait
// onze étapes ne dit pas lesquelles. Le détail se lit, se vérifie, et se
// discute avec l'intéressé — c'est ce qui rend le chiffre utilisable.

import { api, h, dateLongue, aujourdhui } from '../noyau.js'
import { modale, vide, badge, pastille } from '../ui.js'
import { ico } from '../icones.js'

/**
 * Les étapes cochées un jour donné. `pour` limite à une personne ; sans
 * lui, l'administrateur voit toute l'équipe, groupée par personne.
 */
export async function ouvrirJour ({ pour = null, nom = '', date = null } = {}) {
  const params = {}
  if (pour) params.pour = pour
  if (date) params.date = date
  const data = await api.get('/jour', Object.keys(params).length ? params : null)
  const ceJour = data.date === aujourdhui() ? 'aujourd’hui' : 'ce jour-là'

  // groupées par personne, les plus actives d'abord
  const parPersonne = new Map()
  for (const etape of data.etapes) {
    const cle = etape.fait_par_id || etape.fait_par || '—'
    if (!parPersonne.has(cle)) parPersonne.set(cle, [])
    parPersonne.get(cle).push(etape)
  }
  const groupes = [...parPersonne.values()].sort((a, b) => b.length - a.length)

  return modale({
    titre: nom ? `Journée de ${nom}` : 'Étapes faites dans la journée',
    sous: `${dateLongue(data.date)} · ${data.total} étape(s) cochée(s)`,
    largeur: 'large',
    corps: data.total
      ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px' } },
        ...groupes.map(etapes => bloc(etapes, !pour)))
      : vide({
        dessin: 'liste',
        titre: 'Aucune étape cochée',
        texte: nom
          ? `${nom} n’a rien coché ${ceJour}.`
          : `Personne n’a coché d’étape ${ceJour}.`
      }),
    actions: (fermer) => [
      h('div', { class: 'droite' },
        h('button', { class: 'b primaire', onclick: fermer }, 'Fermer'))
    ]
  })
}

/** Les étapes d'une personne, les plus récentes d'abord. */
function bloc (etapes, avecNom) {
  const qui = etapes[0]
  return h('div', {},
    avecNom
      ? h('div', { class: 'piece', style: { marginBottom: '8px' } },
        pastille({ nom: qui.fait_par, couleur: '' }, 'mini'),
        h('b', {}, qui.fait_par || '—'),
        badge(`${etapes.length} étape(s)`, 'accent'))
      : null,
    h('div', { class: 's-liste s-jour' }, ...etapes.map(ligne)))
}

function ligne (etape) {
  return h('div', { class: 's-item' },
    h('span', { class: 'ico' }, ico(etape.symbole, 16)),
    h('div', { class: 'corps' },
      h('b', {}, etape.libelle),
      h('small', { dir: 'auto' }, etape.titre)),
    h('div', { class: 'droite' },
      // une étape cochée après le jour de la séance se signale : c'est un
      // rattrapage, pas le déroulé normal, et cela change la lecture
      etape.apresCoup
        ? badge(`séance du ${dateLongue(etape.seance_date)}`, 'warn',
          ico('horloge', 11))
        : null,
      h('span', { class: 'piece s-chiffre', title: 'Heure du clic' },
        ico('horloge', 12), etape.heure_faite || '—')))
}
