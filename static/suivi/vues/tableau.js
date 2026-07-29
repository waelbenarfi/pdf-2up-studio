// Point 7 : le tableau de bord de la direction.

import {
  api, h, dateLongue, dateCourte, ilYA, duree, aller, personneDe
} from '../noyau.js'
import {
  carte, kpi, vide, badge, badgeEtat, badgeStatutLive, pastille, tableau,
  barreProgres, info
} from '../ui.js'
import { ouvrirFormulaire, ouvrirFiche } from './rapports.js'

export async function vueTableau () {
  const data = await api.get('/tableau')
  const k = data.indicateurs

  const indicateurs = h('div', { class: 's-grille k4' },
    kpi({ ico: '🎥', nom: 'Lives aujourd’hui', valeur: k.livesJour, ton: 'accent',
      sous: dateLongue(data.date), onclic: () => aller('planning') }),
    kpi({ ico: '📝', nom: 'Rapports envoyés', valeur: k.rapportsJour, ton: 'ok',
      sous: 'aujourd’hui', onclic: () => aller('rapports') }),
    kpi({ ico: '⏳', nom: 'Lives sans rapport', valeur: k.sansRapportJour,
      ton: k.sansRapportJour ? 'danger' : 'ok',
      sous: `${k.sansRapportTotal} sur les 30 derniers jours`,
      onclic: () => aller('rapports') }),
    kpi({ ico: '⚠️', nom: 'Incidents', valeur: k.incidents, ton: 'warn',
      sous: '30 derniers jours',
      onclic: () => aller('rapports', { etat: 'petit' }) }),
    kpi({ ico: '❌', nom: 'Incidents critiques', valeur: k.critiques,
      ton: k.critiques ? 'danger' : 'ok', sous: 'problèmes importants ou urgence critique',
      onclic: () => aller('rapports', { etat: 'important' }) }),
    kpi({ ico: '🎫', nom: 'Tickets support ouverts', valeur: k.ticketsOuverts,
      ton: k.ticketsOuverts ? 'info' : 'ok', sous: 'nouveaux ou en cours',
      onclic: () => aller('support') }),
    kpi({ ico: '⏱', nom: 'Temps moyen de résolution',
      valeur: duree(k.resolutionMoyenne), ton: 'violet',
      sous: 'tickets résolus' }),
    kpi({ ico: '📊', nom: 'Taux de couverture', valeur: k.tauxCouverture + ' %',
      ton: tonTaux(k.tauxCouverture),
      sous: `${k.rapportsEnRetard} rapport(s) envoyé(s) en retard` }))

  return [
    indicateurs,
    h('div', { class: 's-grille k2' },
      carte({
        titre: 'Journée en cours',
        sous: `${data.livesJour.length} séance(s) au programme`,
        actions: [h('button', { class: 'b petit', onclick: () => aller('planning') },
          'Planning')]
      }, journee(data.livesJour)),
      carte({
        titre: 'Séances sans rapport',
        sous: 'À relancer auprès des responsables',
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
      sous: 'Les douze derniers rapports envoyés',
      actions: [
        h('button', { class: 'b petit', onclick: () => aller('rapports') }, 'Tout l’historique'),
        h('button', { class: 'b primaire petit', onclick: () => ouvrirFormulaire({}) },
          '＋ Nouveau rapport')
      ]
    }, historique(data.historique)),
    carte({ titre: 'Suivi par responsable', sous: 'Part des séances couvertes par un rapport, 30 derniers jours' },
      equipe(data.equipe))
  ]
}

const tonTaux = (taux) => taux >= 90 ? 'ok' : (taux >= 70 ? 'warn' : 'danger')

const legende = (couleur, texte) => h('span', {},
  h('i', { style: { background: couleur } }), texte)

/* --------------------------------------------------------------- blocs */
function journee (lives) {
  if (!lives.length) {
    return vide({ ico: '🌤', titre: 'Aucun live aujourd’hui', texte: 'Rien n’est planifié pour la journée.' })
  }
  return h('div', { class: 's-liste' }, ...lives.map(live =>
    h('div', { class: `s-item ${live.sansRapport ? 'alerte' : ''}` },
      h('span', { class: 's-heure' }, live.heure || '—'),
      h('div', { class: 'corps' },
        h('b', {}, live.titre),
        h('small', {}, live.responsable_nom || 'sans responsable')),
      h('div', { class: 'droite' },
        etiquetteLive(live),
        live.sansRapport
          ? h('button', { class: 'b primaire petit', onclick: () => ouvrirFormulaire({ live }) },
              'Rapport')
          : null))))
}

function etiquetteLive (live) {
  if (live.aRapport) return badge('rapport ✓', 'ok')
  if (live.sansRapport) return badge('rapport manquant', 'danger')
  return badgeStatutLive(live.statut)
}

function manquants (lives) {
  if (!lives.length) {
    return vide({ ico: '✅', titre: 'Tout est à jour', texte: 'Chaque séance terminée a bien son rapport.' })
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
    message: vide({ ico: '📝', titre: 'Aucun rapport pour l’instant' })
  })
}

function equipe (liste) {
  const suivis = liste.filter(membre => membre.lives)
  if (!suivis.length) {
    return info('Aucune séance terminée à suivre sur les 30 derniers jours. '
      + 'Ajoutez ou attribuez des lives depuis la Planification.')
  }
  return h('div', { class: 's-liste' }, ...suivis.map(membre =>
    h('div', { class: 's-item' },
      pastille(membre),
      h('div', { class: 'corps' },
        h('b', {}, membre.nom),
        h('small', {}, `${membre.rapports}/${membre.lives} séance(s) couverte(s)`
          + (membre.retards ? ` · ${membre.retards} en retard` : '')),
        h('div', { style: { marginTop: '7px' } },
          barreProgres(membre.taux, `var(--${tonTaux(membre.taux)})`))),
      h('div', { class: 'droite' },
        membre.manquants ? badge(`${membre.manquants} manquant(s)`, 'danger') : null,
        h('b', { style: { fontSize: '16px' } }, membre.taux + ' %')))))
}

function repartition (liste) {
  const total = liste.reduce((somme, item) => somme + item.valeur, 0)
  if (!total) return vide({ ico: '📊', titre: 'Pas encore de données' })
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
    ...liste.map(item => {
      const part = Math.round(100 * item.valeur / total)
      return h('div', {},
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '7px' } },
          h('span', {}, item.icone),
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
