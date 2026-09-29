// Point 7 : le tableau de bord.
//
// Chacun y voit son propre travail. L'administrateur choisit en plus de
// regarder toute l'équipe, ou n'importe lequel de ses membres. Le filtre est
// posé par le serveur : ce sélecteur ne fait que demander.

import {
  CONST, api, etat, h, dateLongue, dateCourte, ilYA, duree, aller, personneDe
} from '../noyau.js'
import {
  carte, kpi, vide, badge, badgeEtat, badgeStatutLive, pastille, tableau,
  barreProgres, info, optionsPersonnes, champListe
} from '../ui.js'
import { ouvrirFormulaire, ouvrirFiche, ouvrirRapportDe } from './rapports.js'
import { puceTaches } from './taches.js'
import { ico } from '../icones.js'

export async function vueTableau (params) {
  // un technicien n'a rien à choisir : le serveur lui rend le sien
  const pour = etat.admin ? (params.pour || '') : ''
  const data = await api.get('/tableau', pour ? { pour } : null)
  const k = data.indicateurs
  const perso = !!data.pour
  const equipeEntiere = etat.admin && !perso
  // « mes séances » quand c'est le sien, « ses séances » quand
  // l'administrateur regarde quelqu'un d'autre
  const soi = perso && data.pour === etat.moi

  const indicateurs = h('div', { class: 's-grille k4' },
    kpi({ dessin: 'video', nom: 'Lives aujourd’hui', valeur: k.livesJour, ton: 'accent',
      sous: dateLongue(data.date), onclic: () => aller('planning') }),
    kpi({ dessin: 'document', nom: 'Rapports envoyés', valeur: k.rapportsJour, ton: 'ok',
      sous: 'aujourd’hui', onclic: () => aller('rapports') }),
    kpi({ dessin: 'sablier', nom: 'Lives sans rapport', valeur: k.sansRapportJour,
      ton: k.sansRapportJour ? 'danger' : 'ok',
      sous: `${k.sansRapportTotal} sur les 30 derniers jours`,
      onclic: () => aller('rapports') }),
    kpi({ dessin: 'alerte', nom: 'Incidents', valeur: k.incidents, ton: 'warn',
      sous: '30 derniers jours',
      onclic: () => aller('rapports', { etat: 'petit' }) }),
    // sur une vue personnelle, le travail fait de ses mains remplace les
    // chiffres du support, qui ne disent rien de ce que la personne a fait
    perso
      ? kpi({ dessin: 'liste', nom: 'Étapes cochées', valeur: k.etapesFaites || 0,
        ton: 'accent', sous: '30 derniers jours' })
      : kpi({ dessin: 'croix_cercle', nom: 'Incidents critiques', valeur: k.critiques,
        ton: k.critiques ? 'danger' : 'ok',
        sous: 'problèmes importants ou urgence critique',
        onclic: () => aller('rapports', { etat: 'important' }) }),
    perso
      ? kpi({ dessin: 'bulle', nom: 'Commentaires écrits',
        valeur: k.commentaires || 0, ton: 'info', sous: '30 derniers jours' })
      : kpi({ dessin: 'billet', nom: 'Tickets support ouverts', valeur: k.ticketsOuverts,
        ton: k.ticketsOuverts ? 'info' : 'ok', sous: 'nouveaux ou en cours',
        onclic: () => aller('support') }),
    perso
      ? kpi({ dessin: 'croix_cercle', nom: 'Incidents critiques', valeur: k.critiques,
        ton: k.critiques ? 'danger' : 'ok',
        sous: soi ? 'sur vos séances' : 'sur ses séances' })
      : kpi({ dessin: 'horloge', nom: 'Temps moyen de résolution',
        valeur: duree(k.resolutionMoyenne), ton: 'violet', sous: 'tickets résolus' }),
    kpi({ dessin: 'cible', nom: 'Taux de couverture', valeur: k.tauxCouverture + ' %',
      ton: tonTaux(k.tauxCouverture),
      sous: `${k.rapportsEnRetard} rapport(s) envoyé(s) en retard` }))

  return [
    annonceDistinction(data.distinction),
    etat.admin ? selecteur(pour, data) : null,
    perso && etat.admin
      ? info(`Vous regardez le tableau de bord de ${data.nom}. `
        + 'Les chiffres ci-dessous ne portent que sur ses séances.')
      : null,
    indicateurs,
    h('div', { class: 's-grille k2' },
      carte({
        titre: !perso ? 'Journée en cours'
          : (soi ? 'Mes séances du jour' : 'Ses séances du jour'),
        sous: `${data.livesJour.length} séance(s) au programme`
          + (k.etapesRestantes
            ? ` · ${k.etapesRestantes} étape(s) restante(s)`
            : ' · toutes les étapes sont faites'),
        actions: [h('button', { class: 'b petit', onclick: () => aller('planning') },
          'Planning')]
      }, journee(data.livesJour, perso, soi)),
      carte({
        titre: 'Séances sans rapport',
        sous: !perso ? 'À relancer auprès des responsables'
          : (soi ? 'À rattraper' : 'À relancer auprès de cette personne'),
        actions: [h('button', { class: 'b petit', onclick: () => aller('lives', { statut: 'termine' }) },
          'Tout voir')]
      }, manquants(data.sansRapport))),
    h('div', { class: 's-grille k2' },
      carte({ titre: 'Lives et rapports', sous: 'Quatorze derniers jours' },
        graphe(data.series),
        h('div', { class: 's-legende' },
          legende('var(--accent)', 'Lives'),
          legende('var(--ok)', 'Rapports'),
          legende('var(--danger)', 'Incidents'))),
      carte({ titre: 'Comment se passent les séances', sous: '30 derniers jours' },
        repartition(data.repartition))),
    carte({
      titre: 'Historique des rapports',
      sous: perso
        ? `Les douze derniers rapports signés ${soi ? 'par vous' : 'par cette personne'}`
        : 'Les douze derniers rapports envoyés',
      actions: [
        h('button', { class: 'b petit', onclick: () => aller('rapports') }, 'Tout l’historique'),
        h('button', { class: 'b primaire petit', onclick: () => ouvrirFormulaire({}) },
          ico('plus', 15), 'Nouveau rapport')
      ]
    }, historique(data.historique)),
    // le classement de toute l'équipe ne regarde que l'administrateur
    equipeEntiere
      ? carte({
        titre: 'Suivi par responsable',
        sous: 'Séances couvertes, étapes cochées et commentaires · 30 derniers jours'
      }, equipe(data.equipe))
      : null
  ]
}

/**
 * L'employé du mois, annoncé là où tout le monde passe.
 *
 * L'écran Performance s'ouvre sur le mois courant alors qu'on récompense le
 * mois écoulé : l'intéressé pouvait être désigné sans jamais l'apprendre.
 * Une reconnaissance que personne ne voit n'en est pas une.
 */
function annonceDistinction (titre) {
  if (!titre) return null
  const moi = titre.personne_id === etat.moi
  const [annee, numero] = String(titre.mois || '').split('-')
  const mois = (CONST.mois || [])[Number(numero) - 1]
  const quand = mois ? `${mois} ${annee}` : titre.mois

  return h('div', { class: `s-annonce ${moi ? 'moi' : ''}` },
    h('span', { class: 'medaille' }, ico('bouclier', 24)),
    h('div', { class: 'corps' },
      h('small', {}, `Employé du mois · ${quand}`),
      h('b', {}, moi ? `Bravo, c’est vous !` : titre.nom),
      titre.motif ? h('p', {}, titre.motif) : null),
    h('button', {
      class: 'b petit',
      onclick: () => aller('performance', { mois: titre.mois })
    }, 'Voir le relevé'))
}

/** Choix de la personne regardée : réservé à l'administrateur. */
function selecteur (pour, data) {
  const refs = {}
  return carte({
    titre: pour ? `Tableau de bord · ${data.nom}` : 'Tableau de bord de l’équipe',
    sous: pour
      ? 'Les chiffres d’une seule personne.'
      : 'Toute l’équipe confondue. Choisissez un membre pour ne voir que le sien.',
    actions: [
      champListe(refs, 'pour', null,
        [{ valeur: '', libelle: 'Toute l’équipe' },
          ...optionsPersonnes(etat.personnes, null)],
        {
          valeur: String(pour || ''),
          onchoix: (e) => aller('tableau', e.target.value
            ? { pour: e.target.value }
            : {})
        })
    ]
  })
}

const tonTaux = (taux) => taux >= 90 ? 'ok' : (taux >= 70 ? 'warn' : 'danger')

const legende = (couleur, texte) => h('span', {},
  h('i', { style: { background: couleur } }), texte)

/* --------------------------------------------------------------- blocs */
function journee (lives, perso = false, soi = false) {
  if (!lives.length) {
    return vide({
      dessin: 'agenda',
      titre: perso ? 'Aucune séance aujourd’hui' : 'Aucun live aujourd’hui',
      texte: !perso ? 'Rien n’est planifié pour la journée.'
        : (soi ? 'Aucune séance ne vous est attribuée pour la journée.'
            : 'Aucune séance ne lui est attribuée pour la journée.')
    })
  }
  return h('div', { class: 's-liste' }, ...lives.map(live =>
    h('div', { class: `s-item ${live.sansRapport ? 'alerte' : ''}` },
      h('span', { class: 's-heure' }, live.heure || '—'),
      h('div', { class: 'corps' },
        h('b', {}, live.titre),
        h('small', {}, live.responsable_nom || 'sans responsable')),
      h('div', { class: 'droite' },
        puceTaches(live),
        etiquetteLive(live),
        live.sansRapport
          ? h('button', { class: 'b primaire petit', onclick: () => ouvrirFormulaire({ live }) },
            'Rapport')
          : (live.aRapport
              ? h('button', { class: 'b petit', onclick: () => ouvrirRapportDe(live) },
                'Modifier')
              : null)))))
}

function etiquetteLive (live) {
  if (live.aRapport) return badge('rapport', 'ok', ico('coche', 12))
  if (live.sansRapport) return badge('rapport manquant', 'danger')
  return badgeStatutLive(live.statut)
}

function manquants (lives) {
  if (!lives.length) {
    return vide({ dessin: 'coche_cercle', titre: 'Tout est à jour', texte: 'Chaque séance terminée a bien son rapport.' })
  }
  return h('div', { class: 's-liste' }, ...lives.map(live =>
    h('div', { class: 's-item alerte' },
      h('div', { class: 'corps' },
        h('b', {}, live.titre),
        h('small', {}, `${dateCourte(live.date)} · ${live.heure} · ${live.responsable_nom || 'sans responsable'}`)),
      h('button', { class: 'b primaire petit', onclick: () => ouvrirFormulaire({ live }) },
        'Remplir'))))
}

function historique (liste) {
  return tableau({
    colonnes: [{ titre: 'Référence' }, { titre: 'Live / classe' },
      { titre: 'Responsable' }, { titre: 'État' }, { titre: 'Envoyé' }],
    lignes: liste,
    surClic: (rapport) => ouvrirFiche(rapport.id),
    rendu: (rapport) => [
      h('span', { style: { fontFamily: 'ui-monospace, monospace', fontSize: '12.5px' } },
        rapport.reference),
      h('div', {}, h('span', { class: 'principal' }, rapport.nom_live),
        h('div', { class: 'discret' }, dateCourte(rapport.date))),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        pastille(personneDe(rapport.responsable_id), 'mini'), rapport.responsable_nom),
      badgeEtat(rapport.etat),
      h('span', { class: 'discret' }, ilYA(rapport.envoye_le))
    ],
    message: vide({ dessin: 'document', titre: 'Aucun rapport pour l’instant' })
  })
}

/**
 * Le relevé de l'équipe. On y garde qui n'a rien eu à suivre : une ligne à
 * zéro dit quelque chose, alors que son absence passe pour un oubli.
 */
function equipe (liste) {
  if (!liste.length) {
    return info('Aucun technicien actif. Ajoutez votre équipe depuis l’écran '
      + 'Équipe pour suivre son activité.')
  }
  return h('div', { class: 's-liste' }, ...liste.map(membre =>
    h('div', { class: 's-item' },
      pastille(membre),
      h('div', { class: 'corps' },
        h('div', { class: 'piece' },
          h('b', {}, membre.nom),
          membre.role === 'admin' ? badge('admin', 'accent', ico('bouclier', 11)) : null),
        h('small', {}, membre.lives
          ? `${membre.rapports}/${membre.lives} séance(s) couverte(s)`
            + (membre.retards ? ` · ${membre.retards} en retard` : '')
          : 'aucune séance à suivre sur la période'),
        h('div', { style: { marginTop: '7px' } },
          barreProgres(membre.lives ? membre.taux : 0,
            `var(--${membre.lives ? tonTaux(membre.taux) : 'muted'})`))),
      h('div', { class: 'droite' },
        chiffre(ico('liste', 13), membre.etapesFaites || 0, 'étape(s) cochée(s)'),
        chiffre(ico('bulle', 13), membre.commentaires || 0, 'commentaire(s)'),
        membre.manquants ? badge(`${membre.manquants} manquant(s)`, 'danger') : null,
        h('b', { style: { fontSize: '16px', minWidth: '46px', textAlign: 'right' } },
          membre.lives ? membre.taux + ' %' : '—')))))
}

/** Un petit compteur avec son dessin, pour la colonne de droite. */
const chiffre = (dessin, valeur, titre) => h('span', {
  class: 'piece s-chiffre', title: `${valeur} ${titre}`
}, dessin, String(valeur))

function repartition (liste) {
  const total = liste.reduce((somme, item) => somme + item.valeur, 0)
  if (!total) return vide({ dessin: 'tableau', titre: 'Pas encore de données' })
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
    ...liste.map(item => {
      const part = Math.round(100 * item.valeur / total)
      return h('div', {},
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '7px' } },
          h('span', {
            class: 'piece',
            style: { color: `var(--${item.ton})` }
          }, ico(item.symbole, 15)),
          h('b', { style: { fontSize: '13.5px' } }, item.libelle),
          h('span', { style: { marginLeft: 'auto', fontSize: '13px', color: 'var(--muted)' } },
            `${item.valeur} · ${part} %`)),
        barreProgres(part, `var(--${item.ton === 'ok' ? 'ok' : item.ton})`))
    }))
}

/* -------------------------------------------------------------- graphe */
/** Barres groupees dessinees a la main : aucune bibliotheque a charger. */
function graphe (series) {
  const L = 720; const H = 240; const bas = 34; const gauche = 30
  const max = Math.max(4, ...series.map(j => Math.max(j.lives, j.rapports)))
  const pasX = (L - gauche - 10) / series.length
  const echelle = (valeur) => (H - bas) * (1 - valeur / max) + 6

  const elements = []
  for (let n = 0; n <= 4; n++) {
    const valeur = Math.round(max * n / 4)
    const y = echelle(valeur)
    elements.push(svg('line', { x1: gauche, y1: y, x2: L, y2: y, stroke: 'var(--line)', 'stroke-width': 1 }))
    elements.push(svg('text', {
      x: gauche - 6, y: y + 4, 'text-anchor': 'end', fill: 'var(--muted)',
      'font-size': 10
    }, String(valeur)))
  }

  series.forEach((jour, index) => {
    const x = gauche + index * pasX
    const largeur = Math.max(4, pasX / 3.2)
    const bloc = (valeur, decalage, couleur) => {
      const y = echelle(valeur)
      return svg('rect', {
        x: x + decalage, y, width: largeur, height: Math.max(0, H - bas - y + 6),
        rx: 3, fill: couleur
      }, svg('title', {}, `${dateCourte(jour.jour)} — ${valeur}`))
    }
    elements.push(bloc(jour.lives, pasX * 0.14, 'var(--accent)'))
    elements.push(bloc(jour.rapports, pasX * 0.14 + largeur + 2, 'var(--ok)'))
    if (jour.incidents) {
      elements.push(svg('circle', {
        cx: x + pasX * 0.14 + largeur + 1, cy: echelle(jour.incidents) - 8,
        r: 3.5, fill: 'var(--danger)'
      }, svg('title', {}, `${jour.incidents} incident(s)`)))
    }
    if (index % 2 === 0 || index === series.length - 1) {
      elements.push(svg('text', {
        x: x + pasX / 2, y: H - 8, 'text-anchor': 'middle',
        fill: 'var(--muted)', 'font-size': 10
      }, dateCourte(jour.jour).slice(0, 5)))
    }
  })

  return svg('svg', {
    class: 's-graphe', viewBox: `0 0 ${L} ${H}`,
    preserveAspectRatio: 'xMidYMid meet', role: 'img',
    'aria-label': 'Lives et rapports des quatorze derniers jours'
  }, ...elements)
}

function svg (balise, attributs, ...enfants) {
  const noeud = document.createElementNS('http://www.w3.org/2000/svg', balise)
  for (const [cle, valeur] of Object.entries(attributs || {})) {
    noeud.setAttribute(cle, valeur)
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue
    noeud.append(enfant instanceof Node ? enfant : document.createTextNode(enfant))
  }
  return noeud
}
