// L'écran du soir.
//
// Il ne sert pas à consulter un planning : il sert pendant que trois lives
// tournent en même temps, un téléphone dans la main. D'où ses choix —
// les séances dans l'ordre des heures, une seule action mise en avant par
// séance, et un clic qui part tout de suite. La validation groupée de la
// fenêtre des étapes serait ici un contresens : on coche une chose parce
// qu'on vient de la faire, pas pour préparer une liste.

import {
  CONST, api, etat, h, remplir, essayer, toast, aller, dateLongue,
  personneDe
} from '../noyau.js'
import {
  carte, vide, badge, pastille, barreProgres, info, boutonIco, champListe,
  optionsPersonnes
} from '../ui.js'
import { ico } from '../icones.js'
import { ouvrirTaches } from './taches.js'
import { ouvrirRapportDe, ouvrirFormulaire } from './rapports.js'
import { boutonAppel } from './professeurs.js'

let minuteur = null

export async function vueSoir (params) {
  const pour = etat.admin ? (params.pour || '') : ''
  const cible = h('div', { class: 's-soir' })

  // L'heure est la moitié de l'information : « dans 12 min » doit rester
  // vrai. On redessine chaque minute, et on arrête en quittant l'écran.
  clearInterval(minuteur)
  minuteur = setInterval(() => {
    if (!document.body.contains(cible)) { clearInterval(minuteur); return }
    charger()
  }, 60000)

  async function charger () {
    let data
    try {
      data = await api.get('/soir', pour ? { pour } : null)
    } catch (erreur) {
      remplir(cible, info(erreur.message))
      return
    }
    dessiner(data)
  }

  function dessiner (data) {
    const seances = data.seances || []
    const aFaire = seances.filter(s => s.reste > 0).length
    remplir(cible,
      carte({
        titre: dateLongue(data.date),
        sous: seances.length
          ? `${seances.length} séance(s) · ${aFaire} avec des étapes en attente`
          : 'Rien au programme.',
        actions: [
          h('span', { class: 's-horloge' }, ico('horloge', 14), data.maintenant),
          etat.admin ? selecteur(pour) : null
        ].filter(Boolean)
      },
      seances.length
        ? h('div', { class: 's-soir-liste' },
          ...seances.map(s => carteSeance(s, charger)))
        : vide({
          dessin: 'agenda',
          titre: 'Aucune séance ce soir',
          texte: etat.admin
            ? 'Rien n’est planifié pour aujourd’hui.'
            : 'Aucune séance ne vous est attribuée aujourd’hui.'
        })))
  }

  await charger()
  return cible
}

function selecteur (pour) {
  const refs = {}
  return champListe(refs, 'pour', null,
    [{ valeur: '', libelle: 'Toute l’équipe' },
      ...optionsPersonnes(etat.personnes, null)],
    {
      valeur: String(pour || ''),
      onchoix: (e) => aller('soir', e.target.value
        ? { pour: e.target.value }
        : {})
    })
}

/* ------------------------------------------------------ une séance */
function carteSeance (seance, apres) {
  const etat_ = moment(seance)
  return h('div', { class: `s-soir-carte ${etat_.cle}` },
    h('div', { class: 's-soir-tete' },
      h('span', { class: 's-heure' }, seance.heure || '—'),
      h('span', { class: `s-soir-quand ${etat_.cle}` },
        ico(etat_.dessin, 13), etat_.texte),
      h('span', { class: 'droite' },
        badge(`${seance.tachesFaites}/${seance.tachesTotal}`,
          seance.reste ? 'accent' : 'ok', ico('liste', 12)))),

    h('b', { class: 's-soir-titre' }, seance.titre),

    h('div', { class: 's-soir-qui' },
      seance.responsable_nom
        ? h('span', { class: 'piece' },
          pastille(personneDe(seance.responsable_id), 'mini'),
          h('small', {}, seance.responsable_nom))
        : null,
      seance.formateur ? h('small', {}, seance.formateur) : null,
      boutonAppel(seance.professeur_tel, 12)),

    barreProgres(Math.round(100 * seance.tachesFaites / seance.tachesTotal),
      seance.reste ? 'var(--accent)' : 'var(--ok)'),

    prochaine(seance, apres),

    h('div', { class: 's-soir-outils' },
      h('button', {
        class: 'b petit',
        onclick: () => ouvrirTaches(seance, apres)
      }, ico('liste', 14), 'Toutes les étapes'),
      seance.aRapport
        ? h('button', {
          class: 'b petit',
          onclick: () => ouvrirRapportDe(seance, apres)
        }, ico('document_crayon', 14), 'Modifier le rapport')
        : null))
}

/**
 * La seule action mise en avant : la prochaine.
 *
 * Un clic l'envoie immédiatement. Ailleurs on valide en bloc, ici non : on
 * coche parce qu'on vient de le faire, souvent entre deux gestes.
 */
function prochaine (seance, apres) {
  if (!seance.reste) {
    return h('div', { class: 's-soir-fini' },
      ico('coche_cercle', 15), 'Tout est fait pour cette séance.')
  }

  const etape = seance.suivante
  if (!etape) {
    // il ne reste que le rapport : il se règle par le formulaire
    return h('div', { class: 's-soir-action' },
      h('div', { class: 'quoi' },
        h('small', {}, 'Il reste'),
        h('b', {}, 'Rédiger le rapport')),
      h('button', {
        class: 'b primaire',
        onclick: () => ouvrirFormulaire({ live: seance, apres })
      }, ico('document', 15), 'Rédiger'))
  }

  return h('div', { class: 's-soir-action' },
    h('span', { class: 'marque' }, ico(etape.symbole, 17)),
    h('div', { class: 'quoi' },
      h('small', {}, 'Prochaine étape'),
      h('b', {}, etape.libelle)),
    h('button', {
      class: 'b primaire',
      onclick: async (e) => {
        e.target.disabled = true
        const fait = await essayer(
          () => api.patch(`/lives/${seance.id}/taches`,
            { cle: etape.cle, fait: true }))
        e.target.disabled = false
        if (!fait) return
        toast(`${etape.libelle} — fait.`)
        apres()
      }
    }, ico('coche', 15), 'C’est fait'))
}

/** Où en est la séance par rapport à l'heure qu'il est. */
function moment (seance) {
  if (seance.enCours) {
    return { cle: 'encours', dessin: 'onde', texte: 'en cours' }
  }
  if (seance.finie) return { cle: 'finie', dessin: 'coche', texte: 'terminée' }
  const minutes = seance.minutesAvant
  if (minutes === null || minutes === undefined) {
    return { cle: 'avenir', dessin: 'horloge', texte: 'à venir' }
  }
  if (minutes <= 30) {
    return { cle: 'bientot', dessin: 'horloge', texte: `dans ${minutes} min` }
  }
  if (minutes < 120) {
    return { cle: 'avenir', dessin: 'horloge', texte: `dans ${minutes} min` }
  }
  const heures = Math.floor(minutes / 60)
  return { cle: 'avenir', dessin: 'horloge', texte: `dans ${heures} h` }
}
