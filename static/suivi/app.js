// Assemblage : barre de gauche, en-tete, et branchement des sept ecrans.

import {
  api, etat, h, $, remplir, route, aller, demarrerNavigation, dessiner,
  chargerPersonnes, definirMoi, essayer, toast, initiales, aujourdhui,
  routeCourante
} from './noyau.js'
import { confirmer } from './ui.js'
import { vueTableau } from './vues/tableau.js'
import { vuePlanning, vueLives } from './vues/planning.js'
import { vueRapports, ouvrirFormulaire } from './vues/rapports.js'
import { vueArchive } from './vues/archive.js'
import { vueSupport } from './vues/support.js'
import { vueEquipe } from './vues/equipe.js'

const ECRANS = [
  { cle: 'tableau', ico: '📊', nom: 'Tableau de bord', vue: vueTableau,
    titre: 'Tableau de bord', sous: 'Tout ce qui se passe aujourd’hui, en un coup d’œil' },
  { cle: 'planning', ico: '🗓', nom: 'Planification', vue: vuePlanning,
    titre: 'Planification des lives', sous: 'Répartir les séances entre les responsables' },
  { cle: 'lives', ico: '🎥', nom: 'Toutes les séances', vue: vueLives,
    titre: 'Séances', sous: 'Historique complet des lives' },
  { cle: 'rapports', ico: '📝', nom: 'Rapports', vue: vueRapports, compteur: 'sansRapport',
    titre: 'Rapports quotidiens', sous: 'Un rapport après chaque live, même quand tout va bien' },
  { cle: 'archive', ico: '🗂', nom: 'Archive', vue: vueArchive,
    titre: 'Archive des rapports', sous: 'Rangement automatique par année et par mois' },
  { cle: 'support', ico: '🎫', nom: 'Support technique', vue: vueSupport, compteur: 'tickets',
    titre: 'Service technique', sous: 'Tickets, échanges et pièces jointes' },
  { cle: 'equipe', ico: '👥', nom: 'Équipe', vue: vueEquipe,
    titre: 'Équipe', sous: 'Qui suit les lives et écrit les rapports' }
]

/* ----------------------------------------------------------- barre nav */
function dessinerNav () {
  const { nom } = routeCourante()
  remplir($('#nav'),
    h('div', { class: 's-nav-titre' }, 'Suivi'),
    ...ECRANS.slice(0, 3).map(lien),
    h('div', { class: 's-nav-titre' }, 'Qualité'),
    ...ECRANS.slice(3, 6).map(lien),
    h('div', { class: 's-nav-titre' }, 'Organisation'),
    lien(ECRANS[6]))

  function lien (ecran) {
    const compte = ecran.compteur ? etat.compteurs[ecran.compteur] : 0
    return h('a', {
      class: `s-lien ${nom === ecran.cle ? 'actif' : ''}`,
      href: `#/${ecran.cle}`
    },
    h('span', { class: 's-lien-ico' }, ecran.ico),
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

  const personne = etat.personnes.find(p => p.id === etat.moi)
  remplir($('#hautActions'),
    h('button', {
      class: 'b primaire', onclick: () => ouvrirFormulaire({})
    }, '＋ Rapport'),
    h('button', {
      class: 's-qui', onclick: (e) => { e.stopPropagation(); menuProfil() }
    },
    h('span', {
      class: 's-pastille',
      style: { background: personne ? personne.couleur : 'var(--muted)' }
    }, initiales(personne && personne.nom)),
    h('span', {},
      h('small', {}, 'Connecté en tant que'),
      h('b', {}, personne ? personne.nom : 'Choisir…'))),
    h('button', {
      class: 'b ico', title: 'Thème clair / sombre', onclick: basculerTheme
    }, '☾'))
}

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
  h('div', { class: 's-nav-titre', style: { padding: '6px 10px' } }, 'Je suis'),
  etat.personnes.length
    ? null
    : h('p', { class: 's-info', style: { margin: '0 4px 6px' } },
        'Aucun technicien de live enregistré. Commencez par en ajouter.'),
  ...etat.personnes.map(personne => h('button', {
    class: `s-lien ${personne.id === etat.moi ? 'actif' : ''}`,
    onclick: () => {
      definirMoi(personne.id)
      menu.remove()
      dessinerEntete()
      toast(`Vous travaillez maintenant en tant que ${personne.nom}.`, 'info')
    }
  },
  h('span', {
    class: 's-pastille mini', style: { background: personne.couleur }
  }, initiales(personne.nom)),
  h('span', { class: 'txt' }, personne.nom))),
  h('div', { class: 's-sep', style: { margin: '8px 4px' } }),
  h('button', {
    class: 's-lien',
    onclick: () => { menu.remove(); aller('equipe') }
  }, h('span', { class: 's-lien-ico' }, '👥'), h('span', {}, 'Gérer l’équipe')),
  h('button', {
    class: 's-lien', style: { color: 'var(--danger)' },
    onclick: () => { menu.remove(); toutRemettreAZero() }
  }, h('span', { class: 's-lien-ico' }, '🧹'), h('span', {}, 'Tout remettre à zéro')))

  document.body.append(menu)
  setTimeout(() => {
    document.addEventListener('click', function fermer (e) {
      if (menu.contains(e.target)) return
      menu.remove()
      document.removeEventListener('click', fermer)
    })
  }, 0)
}

function toutRemettreAZero () {
  confirmer({
    titre: 'Tout remettre à zéro ?',
    texte: 'Rapports, lives, tickets, messages, membres de l’équipe et journal '
      + 'seront effacés, ainsi que les dossiers d’archive écrits sur le disque. '
      + 'L’application repart entièrement vide, prête pour vos vraies données. '
      + 'Cette action est définitive.',
    bouton: 'Tout effacer',
    surOui: () => rejouer(() => api.post('/reinitialiser'),
      'Tout est remis à zéro. Commencez par ajouter votre équipe.')
  })
}

async function rejouer (action, message) {
  const fait = await essayer(action, message)
  if (!fait) return
  localStorage.removeItem('suivi-moi')
  await chargerPersonnes()
  await majCompteurs()
  dessinerEntete()
  dessiner()
}

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
  appliquerTheme(localStorage.getItem('twoup-theme') || 'dark')
  for (const ecran of ECRANS) route(ecran.cle, ecran.vue)

  try {
    await chargerPersonnes()
  } catch (erreur) {
    remplir($('#vue'), h('div', { class: 's-vide' },
      h('span', { class: 'ico' }, '⛔'),
      h('b', {}, 'Le serveur ne répond pas'),
      h('p', {}, erreur.message)))
    return
  }

  document.addEventListener('suivi:vue', () => {
    dessinerNav()
    dessinerEntete()
    majCompteurs()
  })
  document.addEventListener('suivi:moi', dessinerEntete)

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
