// Le relevé mensuel : qui a tenu ses séances, et sur quoi on le dit.
//
// Un score attaché à une prime doit pouvoir s'expliquer à la personne. Rien
// n'est donc affiché comme un chiffre seul : chaque composante montre son
// calcul — « 18/20 séances couvertes » plutôt que « 90 ».

import {
  CONST, api, etat, h, aller, momentDe, dateLongue
} from '../noyau.js'
import {
  carte, vide, info, badge, pastille, barreProgres, modale, confirmer,
  champZone, valeurs, champListe, optionsPersonnes
} from '../ui.js'
import { ico } from '../icones.js'
import { essayer, rafraichir } from '../noyau.js'

const POIDS = CONST.poids || []
const MOIS = CONST.mois || []

const moisCourant = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const moisLisible = (mois) => {
  const [a, m] = String(mois || '').split('-')
  return MOIS[Number(m) - 1] ? `${MOIS[Number(m) - 1]} ${a}` : mois
}

/** Les douze derniers mois, pour le sélecteur. */
function derniersMois () {
  const sortie = []
  const d = new Date()
  for (let i = 0; i < 12; i++) {
    const mois = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    sortie.push({ valeur: mois, libelle: moisLisible(mois) })
    d.setMonth(d.getMonth() - 1)
  }
  return sortie
}

export async function vuePerformance (params) {
  const mois = params.mois || moisCourant()
  const data = await api.get('/performances', { mois })
  const classement = data.classement || []
  const refs = {}

  return [
    carte({
      titre: `Performance · ${moisLisible(mois)}`,
      sous: etat.admin
        ? 'Classement de l’équipe et désignation de l’employé du mois.'
        : 'Votre relevé du mois, et ce qui le compose.',
      actions: [
        champListe(refs, 'mois', null, derniersMois(), {
          valeur: mois,
          onchoix: (e) => aller('performance', { mois: e.target.value })
        })
      ]
    },
    laureat(data, mois)),

    etat.admin ? explication() : null,

    classement.length
      ? h('div', { class: 's-perf-liste' },
        ...classement.map(ligne => fiche(ligne, data, mois)))
      : vide({
        dessin: 'cible',
        titre: 'Aucune séance terminée ce mois-ci',
        texte: 'Le relevé se remplit au fur et à mesure que les séances '
          + 'passent et que les rapports arrivent.'
      })
  ]
}

/* ------------------------------------------------------------- lauréat */
function laureat (data, mois) {
  const gagnant = data.distinction
  const premier = (data.classement || []).find(l => l.rang === 1)

  if (gagnant) {
    return h('div', { class: 's-laureat' },
      h('span', { class: 'medaille' }, ico('bouclier', 26)),
      h('div', { class: 'corps' },
        h('small', {}, 'Employé du mois'),
        h('b', {}, gagnant.nom),
        gagnant.motif ? h('p', {}, gagnant.motif) : null,
        h('small', {}, `Score ${gagnant.score} / 100 · désigné par `
          + `${gagnant.decide_par || '—'} le ${momentDe(gagnant.decide_le)}`)),
      etat.admin
        ? h('div', { class: 'b-groupe' },
          h('button', {
            class: 'b petit',
            onclick: () => ouvrirNomination(data, mois)
          }, 'Changer'),
          h('button', {
            class: 'b petit danger', onclick: () => retirer(mois)
          }, 'Retirer'))
        : null)
  }

  if (!etat.admin) return h('div')

  return h('div', { class: 's-laureat vide' },
    h('span', { class: 'medaille' }, ico('bouclier', 26)),
    h('div', { class: 'corps' },
      h('small', {}, 'Employé du mois'),
      h('b', {}, 'Personne n’est encore désigné'),
      h('p', {}, premier
        ? `${premier.nom} arrive en tête avec ${premier.score} / 100. `
          + 'Le classement propose ; c’est vous qui décidez.'
        : 'Aucun membre n’atteint encore le minimum de '
          + `${CONST.seuilEligible} séances pour être classé.`)),
    h('button', {
      class: 'b primaire', disabled: !premier,
      onclick: () => ouvrirNomination(data, mois)
    }, ico('bouclier', 15), 'Désigner'))
}

/** Ce que le score mesure, et ce qu'il ne mesure pas. */
function explication () {
  return h('details', { class: 's-perf-methode' },
    h('summary', {}, ico('info', 14), 'Comment ce score est calculé'),
    h('div', { class: 'corps' },
      h('div', { class: 's-perf-poids' }, ...POIDS.map(item =>
        h('div', {},
          h('b', {}, `${item.poids} %`),
          h('span', {}, item.libelle),
          h('small', {}, item.aide)))),
      info('Les incidents ne retirent aucun point : les compter en négatif '
        + 'apprendrait à cacher les problèmes et punirait celui qui hérite '
        + 'des séances difficiles. Ils sont affichés comme contexte.'),
      info('Une étape revient à celui qui l’a cochée, pas au responsable de '
        + 'la séance : faire le travail d’un collègue compte pour celui qui '
        + 'le fait. Couverture et ponctualité restent, elles, attachées au '
        + 'responsable — c’est lui qui répond de ses séances.'),
      info(`En dessous de ${CONST.seuilEligible} séances ou `
        + `${CONST.seuilEtapes} étapes dans le mois, la personne reste `
        + 'affichée mais hors classement : trois séances parfaites ne valent '
        + 'pas quarante séances à 95 %.'),
      info('« Préparation à temps » ne compte que les étapes d’avant-live '
        + 'cochées avant le début de la séance, d’après l’horodatage du '
        + 'serveur. Tout cocher le lendemain n’y rapporte rien — c’est ce '
        + 'qui empêche la prime de récompenser le remplissage de cases.')))
}

/* -------------------------------------------------------------- fiches */
function fiche (ligne, data, mois) {
  const gagnant = data.distinction && data.distinction.personne_id === ligne.id
  return h('div', {
    class: `s-perf ${gagnant ? 'laureat' : ''} ${ligne.eligible ? '' : 'hors'}`
  },
  h('div', { class: 's-perf-tete' },
    ligne.rang
      ? h('span', { class: `s-perf-rang ${ligne.rang <= 3 ? 'podium' : ''}` },
        String(ligne.rang))
      : h('span', { class: 's-perf-rang hors' }, '—'),
    pastille(ligne, 'grand'),
    h('div', { class: 'qui' },
      h('div', { class: 'piece' },
        h('b', {}, ligne.nom),
        ligne.role === 'admin' ? badge('admin', 'accent', ico('bouclier', 11)) : null,
        gagnant ? badge('employé du mois', 'ok', ico('bouclier', 11)) : null),
      h('small', {}, ligne.eligible
        ? `${ligne.seances} séance(s) terminée(s) · ${ligne.rapports} rapport(s)`
          + ` · ${ligne.etapesCochees} étape(s) cochée(s)`
          + (ligne.pourAutrui
            ? `, dont ${ligne.pourAutrui} pour un collègue`
            : '')
        : `${ligne.seances} séance(s), ${ligne.etapesCochees} étape(s) — hors `
          + `classement : il en faut ${CONST.seuilEligible} ou `
          + `${CONST.seuilEtapes}`)),
    h('div', { class: 's-perf-score' },
      h('b', {}, ligne.eligible ? String(ligne.score) : '—'),
      h('small', {}, ligne.eligible ? '/ 100' : 'non classé')),
    etat.admin && ligne.eligible && !gagnant
      ? h('button', {
        class: 'b petit',
        onclick: () => ouvrirNomination(data, mois, ligne.id)
      }, 'Désigner')
      : null),

  h('div', { class: 's-perf-parts' },
    part('couverture', ligne.notes.couverture,
      `${ligne.couverts}/${ligne.seances} séance(s) avec rapport`),
    part('preparation', ligne.notes.preparation,
      `${ligne.etapesATemps}/${ligne.etapesAttendues} de vos étapes faites `
      + 'avant le live'),
    part('ponctualite', ligne.notes.ponctualite,
      `${ligne.ponctuels}/${ligne.rapports} rapport(s) dans le délai`),
    part('charge', ligne.notes.charge,
      `${ligne.seances} séance(s) + ${ligne.etapesCochees} étape(s) `
      + `sur ${data.plusCharge} au plus chargé`)),

  h('div', { class: 's-perf-pied' },
    h('span', { class: 'piece' }, ico('alerte', 12),
      `${ligne.incidents} incident(s) signalé(s)`),
    h('span', { class: 'discret' }, '· n’enlève aucun point'),
    ligne.doute
      ? badge(`${ligne.partApresCoup} % des étapes cochées après la séance`,
        'warn', ico('horloge', 11))
      : null))
}

function part (cle, valeur, detail) {
  const item = POIDS.find(p => p.cle === cle) || { libelle: cle, poids: 0 }
  const ton = valeur >= 90 ? 'ok' : (valeur >= 70 ? 'warn' : 'danger')
  return h('div', { class: 's-perf-part' },
    h('div', { class: 'haut' },
      h('span', { class: 'nom' }, item.libelle),
      h('span', { class: 'val' }, `${valeur} %`)),
    barreProgres(valeur, `var(--${ton})`),
    h('small', {}, detail),
    h('small', { class: 'poids' }, `pèse ${item.poids} %`))
}

/* ---------------------------------------------------------- nomination */
function ouvrirNomination (data, mois, prechoisi = null) {
  const eligibles = (data.classement || []).filter(l => l.eligible)
  if (!eligibles.length) return
  const refs = {}
  const premier = eligibles[0]
  const choisi = prechoisi || (data.distinction || {}).personne_id || premier.id

  modale({
    titre: 'Employé du mois',
    sous: moisLisible(mois),
    largeur: 'etroite',
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      champListe(refs, 'personne_id', 'Qui',
        eligibles.map(l => ({
          valeur: l.id, libelle: `${l.nom} — ${l.score} / 100`
        })), { valeur: String(choisi) }),
      champZone(refs, 'motif', 'Pourquoi', {
        lignes: 3, optionnel: true,
        exemple: 'Ex. aucune séance sans rapport, préparation toujours faite '
          + 'avant le live, a repris deux séances au pied levé.'
      }),
      info('Le motif est conservé avec la décision et reste visible par '
        + 'toute l’équipe. Une prime qui s’explique se conteste moins.')),
    actions: (fermer) => [
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: async (e) => {
            e.target.disabled = true
            const v = valeurs(refs)
            const fait = await essayer(
              () => api.post('/performances/employe', {
                mois, personne_id: Number(v.personne_id), motif: v.motif
              }), 'Employé du mois enregistré.')
            e.target.disabled = false
            if (!fait) return
            fermer()
            rafraichir()
          }
        }, ico('bouclier', 15), 'Désigner'))
    ]
  })
}

function retirer (mois) {
  confirmer({
    titre: 'Retirer la distinction ?',
    texte: `L'employé du mois de ${moisLisible(mois)} sera effacé. `
      + 'Le classement, lui, ne change pas.',
    bouton: 'Retirer',
    surOui: async () => {
      await essayer(() => api.del('/performances/employe?mois=' + mois),
        'Distinction retirée.')
      rafraichir()
    }
  })
}
