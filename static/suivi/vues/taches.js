// Le déroulé d'une séance : de l'appel au professeur jusqu'au dépôt du
// fichier après le live. Les étapes viennent du serveur (window.SUIVI.taches),
// donc l'écran ne peut pas proposer une liste que la base ignore.
//
// Chaque étape porte ses commentaires. Le cas qui les justifie est celui
// d'une étape NON faite : le professeur n'a pas pris son téléphone, il faudra
// le rappeler, et la personne suivante doit le savoir.

import {
  CONST, api, h, remplir, essayer, toast, ilYA, dateLongue, rafraichir
} from '../noyau.js'
import { modale, badge, barreProgres, boutonIco, confirmer } from '../ui.js'
import { ico } from '../icones.js'
import { ouvrirFormulaire } from './rapports.js'

const MOMENTS = CONST.moments || []
export const TOTAL = (CONST.taches || []).length

const compte = (live) => ({
  faites: live.tachesFaites || 0,
  total: live.tachesTotal || TOTAL,
  notes: live.nbNotes || 0
})

const ton = (faites, total) => faites >= total ? 'ok' : (faites ? 'warn' : 'muted')

/** Étiquette « 3/7 », muette : pour une colonne de tableau. */
export function badgeTaches (live) {
  const { faites, total } = compte(live)
  if (!total) return null
  return badge(`${faites}/${total}`, ton(faites, total), ico('liste', 13))
}

/**
 * La même étiquette, mais cliquable : sur une carte de planning il n'y a pas
 * la place d'un bouton de plus, et le compteur est déjà ce qu'on vise.
 * La bulle n'apparaît que s'il y a vraiment quelque chose à lire.
 */
export function puceTaches (live, apres = null) {
  const { faites, total, notes } = compte(live)
  if (!total) return null
  return h('button', {
    class: `s-badge t-${ton(faites, total)} clic`,
    type: 'button',
    title: notes
      ? `Étapes de la séance (${faites}/${total}) · ${notes} commentaire(s)`
      : `Étapes de la séance (${faites}/${total})`,
    onclick: (e) => { e.stopPropagation(); ouvrirTaches(live, apres) }
  }, ico('liste', 13), `${faites}/${total}`,
  notes ? ico('bulle', 12) : null)
}

/** Bouton d'ouverture, à poser à côté des autres outils d'une séance. */
export function boutonTaches (live, apres = null) {
  const { faites, total } = compte(live)
  return boutonIco(ico('liste'), `Étapes de la séance (${faites}/${total})`,
    () => ouvrirTaches(live, apres))
}

export function ouvrirTaches (live, apres = null) {
  const corps = h('div', { class: 's-taches' })
  let liste = []
  // l'étape dont le fil de commentaires est déplié : un seul à la fois,
  // sinon la fenêtre devient un mur de texte
  let ouverte = null

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
        h('span', { class: 'ico' }, ico('alerte', 30)),
        h('b', {}, 'Étapes indisponibles'),
        h('p', {}, erreur.message),
        h('button', { class: 'b', onclick: charger }, 'Réessayer')))
    }
  }

  function appliquer (resultat) {
    liste = resultat.taches
    Object.assign(live, resultat.live)
    dessiner()
  }

  async function basculer (etape) {
    const avant = liste.filter(t => t.fait).length
    const resultat = await essayer(() => api.patch(`/lives/${live.id}/taches`,
      { cle: etape.cle, fait: !etape.fait }))
    if (!resultat) return
    appliquer(resultat)
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
        ico(moment.symbole, 13), moment.libelle),
      ...etapes.map(bloc))
  }

  function bloc (etape) {
    return h('div', { class: 's-tache-bloc' }, ligne(etape),
      ouverte === etape.cle ? fil(etape) : null)
  }

  // L'étape du rapport n'est pas cochable à la main : elle suit le rapport
  // lui-même, sinon le tableau de bord annoncerait un rapport qui n'existe pas.
  function ligne (etape) {
    const liee = etape.cle === CONST.tacheRapport
    const nb = (etape.notes || []).length
    return h('div', { class: `s-tache ${etape.fait ? 'faite' : ''}` },
      h(liee ? 'span' : 'button', {
        class: `case ${liee ? 'liee' : ''}`,
        type: liee ? null : 'button',
        title: liee
          ? 'Se coche à l’envoi du rapport'
          : (etape.fait ? 'Décocher cette étape' : 'Marquer comme faite'),
        onclick: liee ? null : () => basculer(etape)
      }, etape.fait ? ico('coche', 14) : null),
      h('span', { class: 'ico' }, ico(etape.symbole, 17)),
      h('span', { class: 'corps' },
        h('b', {}, etape.libelle),
        h('small', {}, sousTitre(etape, liee))),
      h('span', { class: 'outils' },
        h('button', {
          class: `b ico petit ${nb ? 'parle' : ''}`,
          title: nb ? `${nb} commentaire(s)` : 'Ajouter un commentaire',
          onclick: () => {
            ouverte = ouverte === etape.cle ? null : etape.cle
            dessiner()
          }
        }, ico('bulle'), nb ? h('i', {}, String(nb)) : null),
        liee && !etape.fait
          ? h('button', {
            class: 'b primaire petit',
            onclick: () => { fermer(); ouvrirFormulaire({ live, apres: terminer }) }
          }, 'Rédiger')
          : null))
  }

  /* --------------------------------------------------------- commentaires */
  function fil (etape) {
    const champ = h('textarea', {
      dir: 'auto', rows: 2, maxlength: String(CONST.noteMax || 1000),
      placeholder: 'Ex. le professeur n’a pas pris son téléphone, à rappeler '
        + 'vers 18 h 30.'
    })

    const envoyer = async () => {
      const texte = champ.value.trim()
      if (!texte) { champ.focus(); return }
      const resultat = await essayer(
        () => api.post(`/lives/${live.id}/notes`, { cle: etape.cle, texte }),
        'Commentaire ajouté.')
      if (!resultat) return
      champ.value = ''
      appliquer(resultat)
    }

    // Ctrl+Entrée envoie : la même main reste sur le clavier entre deux appels
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); envoyer() }
    })

    const boite = h('div', { class: 's-notes' },
      ...(etape.notes || []).map(note => h('div', { class: 's-note' },
        h('div', { class: 'haut' },
          h('b', {}, note.auteur || '—'),
          h('span', {}, ilYA(note.cree_le)),
          boutonIco(ico('corbeille', 13), 'Supprimer ce commentaire',
            () => retirer(note), 'danger')),
        h('p', {}, note.texte))),
      (etape.notes || []).length
        ? null
        : h('p', { class: 's-notes-vide' },
          'Aucun commentaire sur cette étape.'),
      h('div', { class: 's-note-saisie' }, champ,
        h('button', { class: 'b primaire petit', onclick: envoyer },
          ico('envoyer', 14), 'Ajouter')))

    setTimeout(() => champ.focus(), 30)
    return boite
  }

  function retirer (note) {
    confirmer({
      titre: 'Supprimer ce commentaire ?',
      texte: `« ${note.texte.slice(0, 120)}${note.texte.length > 120 ? '…' : ''} »`,
      surOui: async () => {
        const resultat = await essayer(() => api.del(`/notes/${note.id}`),
          'Commentaire supprimé.')
        if (resultat) appliquer(resultat)
      }
    })
  }

  function sousTitre (etape, liee) {
    if (etape.fait) {
      return `Fait ${ilYA(etape.fait_le)}`
        + (etape.fait_par ? ` par ${etape.fait_par}` : '')
    }
    return liee ? 'Se coche à l’envoi du rapport' : etape.aide
  }
}
