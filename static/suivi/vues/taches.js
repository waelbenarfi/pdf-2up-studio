// Le déroulé d'une séance : de l'appel au professeur jusqu'au dépôt du
// fichier après le live. Les étapes viennent du serveur (window.SUIVI.taches),
// donc l'écran ne peut pas proposer une liste que la base ignore.

import {
  CONST, api, h, remplir, essayer, toast, ilYA, dateLongue, rafraichir
} from '../noyau.js'
import { modale, badge, barreProgres, boutonIco } from '../ui.js'
import { ouvrirFormulaire } from './rapports.js'

const MOMENTS = CONST.moments || []
export const TOTAL = (CONST.taches || []).length

const compte = (live) => ({
  faites: live.tachesFaites || 0,
  total: live.tachesTotal || TOTAL
})

const ton = (faites, total) => faites >= total ? 'ok' : (faites ? 'warn' : 'muted')

/** Étiquette « 3/7 », muette : pour une colonne de tableau. */
export function badgeTaches (live) {
  const { faites, total } = compte(live)
  if (!total) return null
  return badge(`${faites}/${total}`, ton(faites, total), '☑')
}

/**
 * La même étiquette, mais cliquable : sur une carte de planning il n'y a pas
 * la place d'un bouton de plus, et le compteur est déjà ce qu'on vise.
 */
export function puceTaches (live, apres = null) {
  const { faites, total } = compte(live)
  if (!total) return null
  return h('button', {
    class: `s-badge t-${ton(faites, total)} clic`,
    type: 'button',
    title: `Étapes de la séance (${faites}/${total})`,
    onclick: (e) => { e.stopPropagation(); ouvrirTaches(live, apres) }
  }, '☑', `${faites}/${total}`)
}

/** Bouton d'ouverture, à poser à côté des autres outils d'une séance. */
export function boutonTaches (live, apres = null) {
  const { faites, total } = compte(live)
  return boutonIco('☑', `Étapes de la séance (${faites}/${total})`,
    () => ouvrirTaches(live, apres))
}

export function ouvrirTaches (live, apres = null) {
  const corps = h('div', { class: 's-taches' })
  let liste = []

  const { fermer } = modale({
    titre: 'Étapes de la séance',
    sous: `${live.titre} · ${dateLongue(live.date)}`
      + (live.heure ? ` à ${live.heure}` : ''),
    corps,
    actions: (ferme) => [
      h('div', { class: 'droite' },
        h('button', {
          class: 'b primaire',
          onclick: () => { ferme(); terminer() }
        }, 'Fermer'))
    ]
  })

  charger()

  function terminer () {
    if (apres) apres(live); else rafraichir()
  }

  async function charger () {
    remplir(corps, h('div', { class: 's-chargement' },
      h('span', { class: 's-tourne' })))
    try {
      liste = await api.get(`/lives/${live.id}/taches`)
      dessiner()
    } catch (erreur) {
      remplir(corps, h('div', { class: 's-vide' },
        h('span', { class: 'ico' }, '⚠️'),
        h('b', {}, 'Étapes indisponibles'),
        h('p', {}, erreur.message),
        h('button', { class: 'b', onclick: charger }, 'Réessayer')))
    }
  }

  async function basculer (etape) {
    const avant = liste.filter(t => t.fait).length
    const resultat = await essayer(() => api.patch(`/lives/${live.id}/taches`,
      { cle: etape.cle, fait: !etape.fait }))
    if (!resultat) return
    liste = resultat.taches
    Object.assign(live, resultat.live)
    dessiner()
    const apresCoup = liste.filter(t => t.fait).length
    if (apresCoup === liste.length && avant < apresCoup) {
      toast('Toutes les étapes de cette séance sont faites.')
    }
  }

  function dessiner () {
    const faites = liste.filter(t => t.fait).length
    const total = liste.length
    const pourcent = total ? Math.round((100 * faites) / total) : 0
    remplir(corps,
      h('div', { class: 's-taches-tete' },
        h('b', {}, `${faites} étape${faites > 1 ? 's' : ''} sur ${total}`),
        h('span', {}, `${pourcent} %`)),
      barreProgres(pourcent, faites >= total ? 'var(--ok)' : 'var(--accent)'),
      ...MOMENTS.map(groupe).filter(Boolean))
  }

  function groupe (moment) {
    const etapes = liste.filter(t => t.moment === moment.cle)
    if (!etapes.length) return null
    return h('div', { class: 's-taches-groupe' },
      h('div', { class: 's-nav-titre' },
        `${moment.icone} ${moment.libelle}`),
      ...etapes.map(ligne))
  }

  // L'étape du rapport n'est pas cochable à la main : elle suit le rapport
  // lui-même, sinon le tableau de bord annoncerait un rapport qui n'existe pas.
  function ligne (etape) {
    const liee = etape.cle === CONST.tacheRapport
    return h(liee ? 'div' : 'button', {
      class: `s-tache ${etape.fait ? 'faite' : ''} ${liee ? 'liee' : ''}`,
      type: liee ? null : 'button',
      onclick: liee ? null : () => basculer(etape)
    },
    h('span', { class: 'case' }, etape.fait ? '✓' : ''),
    h('span', { class: 'ico' }, etape.icone),
    h('span', { class: 'corps' },
      h('b', {}, etape.libelle),
      h('small', {}, sousTitre(etape, liee))),
    liee && !etape.fait
      ? h('button', {
        class: 'b primaire petit',
        onclick: () => { fermer(); ouvrirFormulaire({ live, apres: terminer }) }
      }, 'Rédiger')
      : null)
  }

  function sousTitre (etape, liee) {
    if (etape.fait) {
      return `Fait ${ilYA(etape.fait_le)}`
        + (etape.fait_par ? ` par ${etape.fait_par}` : '')
    }
    return liee ? 'Se coche à l’envoi du rapport' : etape.aide
  }
}
