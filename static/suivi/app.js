// Assemblage : barre de gauche, en-tete, et branchement des sept ecrans.

import {
  api, etat, h, $, remplir, route, aller, demarrerNavigation, dessiner,
  chargerPersonnes, deconnecter, initiales, aujourdhui,
  routeCourante, moiMeme
} from './noyau.js'
import { ico } from './icones.js'
import { ouvrirMotDePasse } from './vues/equipe.js'
import { vueTableau } from './vues/tableau.js'
import { vuePlanning, vueLives } from './vues/planning.js'
import { vueRapports, ouvrirFormulaire } from './vues/rapports.js'
import { vuePerformance } from './vues/performance.js'
import { vueArchive } from './vues/archive.js'
import { vueSupport } from './vues/support.js'
import { vueEquipe } from './vues/equipe.js'

const ECRANS = [
  { cle: 'tableau', ico: 'tableau', nom: 'Tableau de bord', vue: vueTableau,
    titre: 'Tableau de bord', sous: 'Tout ce qui se passe aujourd’hui, en un coup d’œil' },
  { cle: 'planning', ico: 'agenda', nom: 'Planification', vue: vuePlanning,
    titre: 'Planification des lives', sous: 'Répartir les séances entre les responsables' },
  { cle: 'lives', ico: 'video', nom: 'Toutes les séances', vue: vueLives,
    titre: 'Séances', sous: 'Historique complet des lives' },
  { cle: 'rapports', ico: 'document', nom: 'Rapports', vue: vueRapports, compteur: 'sansRapport',
    titre: 'Rapports quotidiens', sous: 'Un rapport après chaque live, même quand tout va bien' },
  { cle: 'performance', ico: 'cible', nom: 'Performance', vue: vuePerformance,
    titre: 'Performance du mois',
    sous: 'Ce que chacun a tenu, et sur quoi on le dit' },
  { cle: 'archive', ico: 'boite', nom: 'Archive', vue: vueArchive,
    titre: 'Archive des rapports', sous: 'Rangement automatique par année et par mois' },
  { cle: 'support', ico: 'bouee', nom: 'Support technique', vue: vueSupport, compteur: 'tickets',
    titre: 'Service technique', sous: 'Tickets, échanges et pièces jointes' },
  { cle: 'equipe', ico: 'equipe', nom: 'Équipe', vue: vueEquipe,
    titre: 'Équipe', sous: 'Qui suit les lives et écrit les rapports' }
]

/* ----------------------------------------------------------- barre nav */
function dessinerNav () {
  const { nom } = routeCourante()
  // les écrans sont regroupés par nom et non par position : ajouter une
  // entrée décalait silencieusement les trois sections
  const groupe = (...cles) => cles
    .map(cle => ECRANS.find(e => e.cle === cle)).filter(Boolean).map(lien)
  remplir($('#nav'),
    h('div', { class: 's-nav-titre' }, 'Suivi'),
    ...groupe('tableau', 'planning', 'lives'),
    h('div', { class: 's-nav-titre' }, 'Qualité'),
    ...groupe('rapports', 'performance', 'archive', 'support'),
    h('div', { class: 's-nav-titre' }, 'Organisation'),
    ...groupe('equipe'))

  function lien (ecran) {
    const compte = ecran.compteur ? etat.compteurs[ecran.compteur] : 0
    return h('a', {
      class: `s-lien ${nom === ecran.cle ? 'actif' : ''}`,
      href: `#/${ecran.cle}`
    },
    h('span', { class: 's-lien-ico' }, ico(ecran.ico)),
    h('span', { class: 'txt' }, ecran.nom),
    compte
      ? h('span', { class: `s-lien-num ${ecran.compteur === 'sansRapport' ? 'alerte' : ''}` },
          String(compte))
      : null)
  }
}

/* ------------------------------------------------------------- en-tete */
function dessinerEntete () {
  const { nom } = routeCourante()
  const ecran = ECRANS.find(e => e.cle === nom) || ECRANS[0]
  remplir($('#titrePage'),
    h('h1', {}, ecran.titre),
    h('p', {}, ecran.sous))

  // Pas de bouton « Rapport » ici : un rapport se rattache à une séance, et
  // chaque écran en propose un au bon endroit, la séance déjà choisie.
  remplir($('#hautActions'),
    h('button', {
      class: 's-qui', onclick: (e) => { e.stopPropagation(); menuProfil() }
    },
    h('span', { class: 's-pastille', style: { background: moiCouleur() } },
      initiales(etat.moiNom)),
    h('span', {},
      h('small', {}, etat.admin ? 'Administrateur' : 'Connecté'),
      h('b', {}, etat.moiNom || '—'))),
    h('button', {
      class: 'b ico', title: 'Thème clair / sombre', onclick: basculerTheme
    }, ico('lune')))
}

const moiCouleur = () => (moiMeme() || {}).couleur || 'var(--muted)'

const ouvrirMonMotDePasse = () =>
  ouvrirMotDePasse({ personne: moiMeme() || { id: etat.moi, nom: etat.moiNom },
    soiMeme: true })

function menuProfil () {
  const existant = document.querySelector('.s-menu-profil')
  if (existant) { existant.remove(); return }

  const menu = h('div', {
    class: 's-menu-profil',
    style: {
      position: 'fixed', top: '64px', right: '28px', zIndex: '90',
      background: 'var(--surface)', border: '1px solid var(--line)',
      borderRadius: '14px', boxShadow: 'var(--shadow)', padding: '8px',
      width: '260px', maxHeight: '70vh', overflowY: 'auto'
    }
  },
  h('div', { class: 's-nav-titre', style: { padding: '6px 10px' } },
    'Connecté'),
  h('div', { class: 's-menu-qui' },
    h('span', {
      class: 's-pastille', style: { background: moiCouleur() }
    }, initiales(etat.moiNom)),
    h('div', {},
      h('b', {}, etat.moiNom || '—'),
      h('small', {}, etat.admin ? 'Administrateur' : 'Technicien de live'))),
  h('div', { class: 's-sep', style: { margin: '8px 4px' } }),
  h('button', {
    class: 's-lien',
    onclick: () => { menu.remove(); ouvrirMonMotDePasse() }
  }, h('span', { class: 's-lien-ico' }, ico('cle')),
  h('span', {}, 'Changer mon mot de passe')),
  etat.admin
    ? h('button', {
      class: 's-lien',
      onclick: () => { menu.remove(); aller('equipe') }
    }, h('span', { class: 's-lien-ico' }, ico('equipe')),
    h('span', {}, 'Gérer l’équipe'))
    : null,
  h('div', { class: 's-sep', style: { margin: '8px 4px' } }),
  h('button', {
    class: 's-lien',
    onclick: () => { menu.remove(); deconnecter() }
  }, h('span', { class: 's-lien-ico' }, ico('sortie')),
  h('span', {}, 'Se déconnecter')))

  document.body.append(menu)
  setTimeout(() => {
    document.addEventListener('click', function fermer (e) {
      if (menu.contains(e.target)) return
      menu.remove()
      document.removeEventListener('click', fermer)
    })
  }, 0)
}

// « Tout remettre à zéro » a été retiré du menu : la remise à zéro efface
// l'équipe, les comptes, les rapports et les dossiers d'archive, et rien ne
// justifie de laisser ce bouton à portée de clic sur une installation qui
// travaille. La route POST /api/suivi/reinitialiser existe toujours, réservée
// à l'administrateur, pour repartir de zéro en connaissance de cause.

/* -------------------------------------------------------------- thème */
function appliquerTheme (theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem('twoup-theme', theme)
}

function basculerTheme () {
  appliquerTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light')
}

/* ---------------------------------------------------------- compteurs */
async function majCompteurs () {
  try {
    const [manquants, tickets] = await Promise.all([
      api.get('/lives', { sansRapport: '1' }),
      api.get('/tickets')
    ])
    etat.compteurs.sansRapport = manquants.length
    etat.compteurs.tickets = tickets.filter(t => t.statut !== 'resolu').length
  } catch (_) { /* la page reste utilisable sans les pastilles */ }
  dessinerNav()
}

/* ------------------------------------------------------------ demarrage */
async function demarrer () {
  // clair par défaut : la charte Wael Academy est navy sur fond clair
  appliquerTheme(localStorage.getItem('twoup-theme') || 'light')
  for (const ecran of ECRANS) route(ecran.cle, ecran.vue)

  try {
    await chargerPersonnes()
  } catch (erreur) {
    remplir($('#vue'), h('div', { class: 's-vide' },
      h('span', { class: 'ico' }, ico('interdit', 30)),
      h('b', {}, 'Le serveur ne répond pas'),
      h('p', {}, erreur.message)))
    return
  }

  document.addEventListener('suivi:vue', () => {
    dessinerNav()
    dessinerEntete()
    majCompteurs()
  })

  dessinerNav()
  dessinerEntete()
  demarrerNavigation()
  setInterval(majCompteurs, 60000)

  // raccourcis : n = nouveau rapport, t = aujourd'hui
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select') || e.ctrlKey || e.metaKey) return
    if (e.key === 'n') { e.preventDefault(); ouvrirFormulaire({}) }
    if (e.key === 't') aller('planning', { date: aujourdhui() })
  })
}

demarrer()
