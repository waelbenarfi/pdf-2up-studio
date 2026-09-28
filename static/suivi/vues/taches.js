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
import { ouvrirRapportDe } from './rapports.js'

const MOMENTS = CONST.moments || []
export const TOTAL = (CONST.taches || []).length

const compte = (live) => ({
  faites: live.tachesFaites || 0,
  total: live.tachesTotal || TOTAL,
  notes: live.nbNotes || 0
})

// Une séance en cours de préparation n'est pas une alerte : l'orange est
// réservé aux vrais problèmes, un avancement partiel reste dans le bleu.
const ton = (faites, total) => faites >= total ? 'ok' : (faites ? 'accent' : 'muted')

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

  // Les cases cochées attendent ici : rien ne part tant que « Valider » n'a
  // pas été cliqué. On y garde la valeur voulue par clé ; une étape ramenée
  // à son état d'origine en ressort, sinon « 2 modifications » compterait
  // des allers-retours qui ne changent rien.
  const enAttente = new Map()
  const pied = h('div', { class: 's-taches-pied' })
  let envoiEnCours = false

  const { fermer, fermerForce } = modale({
    titre: 'Étapes de la séance',
    sous: `${live.titre} · ${dateLongue(live.date)}`
      + (live.heure ? ` à ${live.heure}` : ''),
    corps,
    actions: () => [pied],
    avantFermeture: () => {
      if (!enAttente.size) return true
      demanderAbandon(terminer)
      return false
    }
  })

  charger()
  dessinerPied()

  function terminer () {
    if (apres) apres(live); else rafraichir()
  }

  /** Ce que l'étape vaut à l'écran : la valeur en attente, sinon la vraie. */
  const valeurDe = (etape) => enAttente.has(etape.cle)
    ? enAttente.get(etape.cle)
    : etape.fait

  const modifiee = (etape) => enAttente.has(etape.cle)

  function demanderAbandon (suite) {
    const n = enAttente.size
    const s = n > 1 ? 's' : ''
    confirmer({
      titre: 'Fermer sans valider ?',
      texte: `${n} case${s} cochée${s} ou décochée${s} n'`
        + `${n > 1 ? 'ont' : 'a'} pas été validée${s}. En fermant maintenant, `
        + `${n > 1 ? 'elles seront perdues' : 'elle sera perdue'}.`,
      bouton: 'Fermer sans valider',
      surOui: () => { fermerForce(); suite() }
    })
  }

  /** Quitter la fenêtre pour aller ailleurs, sans perdre un clic en silence. */
  function quitterVers (action) {
    if (enAttente.size) { demanderAbandon(action); return }
    fermerForce()
    action()
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

  /** Un clic ne part pas au serveur : il note l'intention, c'est tout. */
  function basculer (etape) {
    const voulu = !valeurDe(etape)
    // revenue à sa valeur d'origine : ce n'est plus une modification
    if (voulu === etape.fait) enAttente.delete(etape.cle)
    else enAttente.set(etape.cle, voulu)
    dessiner()
    dessinerPied()
  }

  function annuler () {
    enAttente.clear()
    dessiner()
    dessinerPied()
  }

  async function valider () {
    if (!enAttente.size || envoiEnCours) return
    const changements = [...enAttente].map(([cle, fait]) => ({ cle, fait }))
    envoiEnCours = true
    dessinerPied()
    const resultat = await essayer(
      () => api.patch(`/lives/${live.id}/taches`, { changements }),
      `${changements.length} étape(s) enregistrée(s).`)
    envoiEnCours = false
    if (!resultat) { dessinerPied(); return }

    enAttente.clear()
    appliquer(resultat)
    dessinerPied()
    if (liste.every(t => t.fait)) {
      toast('Toutes les étapes de cette séance sont faites.')
    }
  }

  function dessinerPied () {
    const n = enAttente.size
    remplir(pied,
      n
        ? h('span', { class: 's-taches-attente' }, ico('crayon', 14),
          `${n} modification${n > 1 ? 's' : ''} non validée${n > 1 ? 's' : ''}`)
        : null,
      h('div', { class: 'droite' },
        n
          ? h('button', { class: 'b', onclick: annuler, disabled: envoiEnCours },
            'Annuler')
          : null,
        h('button', {
          class: n ? 'b primaire' : 'b',
          onclick: () => { if (n) valider(); else { fermer(); terminer() } },
          disabled: envoiEnCours
        }, n
          ? [ico('coche', 15), envoiEnCours ? 'Validation…' : `Valider (${n})`]
          : 'Fermer')))
  }

  // La barre montre l'état visé, modifications comprises : sinon on coche
  // trois cases sans que rien ne bouge, et on croit que le clic n'a pas pris.
  function dessiner () {
    const faites = liste.filter(valeurDe).length
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
    const coche = valeurDe(etape)
    const change = modifiee(etape)
    return h('div', {
      class: `s-tache ${coche ? 'faite' : ''} ${change ? 'change' : ''}`
    },
    h(liee ? 'span' : 'button', {
      class: `case ${liee ? 'liee' : ''}`,
      type: liee ? null : 'button',
      title: liee
        ? 'Se coche à l’envoi du rapport'
        : (coche ? 'Décocher cette étape' : 'Marquer comme faite'),
      onclick: liee ? null : () => basculer(etape)
    }, coche ? ico('coche', 14) : null),
    h('span', { class: 'ico' }, ico(etape.symbole, 17)),
    h('span', { class: 'corps' },
      h('b', {}, etape.libelle),
      h('small', {}, sousTitre(etape, liee, coche, change))),
    h('span', { class: 'outils' },
      h('button', {
        class: `b ico petit ${nb ? 'parle' : ''}`,
        title: nb ? `${nb} commentaire(s)` : 'Ajouter un commentaire',
        onclick: () => {
          ouverte = ouverte === etape.cle ? null : etape.cle
          dessiner()
        }
      }, ico('bulle'), nb ? h('i', {}, String(nb)) : null),
      // rapport envoyé ou non, on y accède d'ici : le corriger après coup
      // est au moins aussi fréquent que l'écrire
      liee
        ? h('button', {
          class: `b petit ${etape.fait ? '' : 'primaire'}`,
          onclick: () => quitterVers(() => ouvrirRapportDe(live, terminer))
        }, etape.fait ? 'Modifier' : 'Rédiger')
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

  function sousTitre (etape, liee, coche, change) {
    // tant que ce n'est pas validé, on dit ce qui va se passer, pas ce qui
    // est en base : « Fait il y a 3 jours » sur une case qu'on vient de
    // cocher serait faux
    if (change) return coche ? 'À cocher · à valider' : 'À décocher · à valider'
    if (etape.fait) {
      return `Fait ${ilYA(etape.fait_le)}`
        + (etape.fait_par ? ` par ${etape.fait_par}` : '')
    }
    return liee ? 'Se coche à l’envoi du rapport' : etape.aide
  }
}
