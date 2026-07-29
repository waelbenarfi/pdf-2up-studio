// Briques de base : construction du DOM, appels serveur, etat, navigation.

export const CONST = window.SUIVI || {}

/* ------------------------------------------------------------------ DOM */
const PROPRIETES = new Set(['value', 'checked', 'disabled', 'selected',
  'textContent', 'innerHTML'])

export function h (balise, props, ...enfants) {
  const noeud = document.createElement(balise)
  for (const [cle, valeur] of Object.entries(props || {})) {
    if (valeur === null || valeur === undefined || valeur === false) continue
    if (cle.startsWith('on') && typeof valeur === 'function') {
      noeud.addEventListener(cle.slice(2).toLowerCase(), valeur)
    } else if (cle === 'style' && typeof valeur === 'object') {
      Object.assign(noeud.style, valeur)
    } else if (cle === 'dataset') {
      Object.assign(noeud.dataset, valeur)
    } else if (PROPRIETES.has(cle)) {
      // les <textarea>/<input> ignorent setAttribute une fois crees
      noeud[cle] = valeur
    } else {
      noeud.setAttribute(cle, valeur === true ? '' : valeur)
    }
  }
  ajouter(noeud, enfants)
  return noeud
}

export function ajouter (parent, enfants) {
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant === null || enfant === undefined || enfant === false) continue
    parent.append(enfant instanceof Node ? enfant : document.createTextNode(enfant))
  }
  return parent
}

export function remplir (noeud, ...enfants) {
  noeud.replaceChildren()
  return ajouter(noeud, enfants)
}

export const $ = (selecteur, racine = document) => racine.querySelector(selecteur)

/* --------------------------------------------------------------- reseau */
async function appel (url, options = {}) {
  const entetes = { 'X-Suivi-Qui': encodeURIComponent(etat.moiNom || '') }
  if (options.body && !(options.body instanceof FormData)) {
    entetes['Content-Type'] = 'application/json'
    options.body = JSON.stringify(options.body)
  }
  const reponse = await fetch(url, { ...options, headers: { ...entetes, ...options.headers } })
  let charge = null
  try { charge = await reponse.json() } catch (_) { /* pdf, csv... */ }
  if (!reponse.ok || (charge && charge.ok === false)) {
    throw new Error((charge && charge.erreur) || 'Le serveur a refusé la demande.')
  }
  return charge ? charge.donnees : null
}

const requete = (params) => {
  const propre = Object.entries(params || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
  return propre.length ? '?' + new URLSearchParams(propre) : ''
}

export const api = {
  get: (chemin, params) => appel('/api/suivi' + chemin + requete(params)),
  post: (chemin, body) => appel('/api/suivi' + chemin, { method: 'POST', body: body || {} }),
  patch: (chemin, body) => appel('/api/suivi' + chemin, { method: 'PATCH', body: body || {} }),
  del: (chemin) => appel('/api/suivi' + chemin, { method: 'DELETE' }),
  envoyer: (cible, cibleId, fichiers) => {
    const forme = new FormData()
    forme.append('cible', cible)
    forme.append('cibleId', cibleId)
    for (const fichier of fichiers) forme.append('file', fichier)
    return appel('/api/suivi/fichiers', { method: 'POST', body: forme })
  }
}

/* ----------------------------------------------------------------- etat */
export const etat = {
  personnes: [],
  moi: null,
  moiNom: '',
  compteurs: { sansRapport: 0, tickets: 0 }
}

export async function chargerPersonnes () {
  etat.personnes = await api.get('/personnes')
  const garde = Number(localStorage.getItem('suivi-moi'))
  const trouve = etat.personnes.find(p => p.id === garde) ||
    etat.personnes.find(p => p.actif) || etat.personnes[0] || null
  definirMoi(trouve ? trouve.id : null)
  return etat.personnes
}

export function definirMoi (id) {
  const personne = etat.personnes.find(p => p.id === id) || null
  etat.moi = personne ? personne.id : null
  etat.moiNom = personne ? personne.nom : ''
  if (personne) localStorage.setItem('suivi-moi', String(personne.id))
  document.dispatchEvent(new CustomEvent('suivi:moi'))
}

export const personneDe = (id) => etat.personnes.find(p => p.id === id) || null

/* ------------------------------------------------------------ formatage */
const MOIS = CONST.mois || []
const JOURS = CONST.jours || []

export function jourDe (iso) {
  const d = new Date((iso || '').slice(0, 10) + 'T12:00:00')
  return isNaN(d) ? null : d
}

export function dateCourte (iso) {
  const d = jourDe(iso)
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : (iso || '—')
}

export function dateLongue (iso) {
  const d = jourDe(iso)
  if (!d) return iso || '—'
  return `${JOURS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

export function momentDe (iso) {
  if (!iso) return '—'
  const texte = String(iso)
  return texte.length >= 16
    ? `${dateCourte(texte)} à ${texte.slice(11, 16)}`
    : dateCourte(texte)
}

export function ilYA (iso) {
  if (!iso) return '—'
  const quand = new Date(String(iso).replace(' ', 'T'))
  if (isNaN(quand)) return '—'
  const minutes = Math.round((Date.now() - quand.getTime()) / 60000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  if (minutes < 1440) return `il y a ${Math.floor(minutes / 60)} h`
  const jours = Math.floor(minutes / 1440)
  return jours === 1 ? 'hier' : `il y a ${jours} jours`
}

export function duree (minutes) {
  if (minutes === null || minutes === undefined) return '—'
  const m = Math.max(0, Math.round(minutes))
  if (m < 60) return `${m} min`
  const heures = Math.floor(m / 60)
  return heures < 24 ? `${heures} h ${pad(m % 60)}` : `${Math.floor(heures / 24)} j ${heures % 24} h`
}

export const poids = (octets) => octets < 1024
  ? `${octets} o`
  : octets < 1048576 ? `${(octets / 1024).toFixed(0)} Ko` : `${(octets / 1048576).toFixed(1)} Mo`

export const pad = (n) => String(n).padStart(2, '0')

export function aujourdhui () {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function decalerJour (iso, pas) {
  const d = jourDe(iso) || new Date()
  d.setDate(d.getDate() + pas)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function heureMaintenant () {
  const d = new Date()
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const initiales = (nom) => String(nom || '?').trim().split(/\s+/)
  .slice(0, 2).map(m => m[0]).join('').toUpperCase() || '?'

export const trouver = (liste, cle) => (liste || []).find(i => i.cle === cle) || null

export const etatDe = (cle) => trouver(CONST.etats, cle) || CONST.etats[0]
export const urgenceDe = (cle) => trouver(CONST.urgences, cle) || CONST.urgences[0]
export const statutLiveDe = (cle) => trouver(CONST.statutsLive, cle) || CONST.statutsLive[0]
export const statutTicketDe = (cle) => trouver(CONST.statutsTicket, cle) || CONST.statutsTicket[0]
export const prioriteDe = (cle) => trouver(CONST.priorites, cle) || CONST.priorites[1]

/* -------------------------------------------------------------- messages */
export function toast (texte, genre = 'ok') {
  const boite = $('#toasts')
  const icone = genre === 'err' ? '⛔' : genre === 'info' ? 'ℹ️' : '✅'
  const noeud = h('div', { class: `s-toast ${genre}` }, h('span', {}, icone),
    h('span', {}, texte))
  boite.append(noeud)
  setTimeout(() => {
    noeud.style.transition = 'opacity .25s'
    noeud.style.opacity = '0'
    setTimeout(() => noeud.remove(), 260)
  }, genre === 'err' ? 5200 : 2800)
}

/* Enveloppe toute action serveur : message d'erreur lisible, jamais d'echec muet. */
export async function essayer (action, succes) {
  try {
    const resultat = await action()
    if (succes) toast(succes)
    return resultat
  } catch (erreur) {
    toast(erreur.message, 'err')
    return null
  }
}

/* ----------------------------------------------------------- navigation */
const routes = new Map()
let vueCourante = null

export function route (nom, fabrique) { routes.set(nom, fabrique) }

export function aller (nom, params = {}) {
  const requeteTexte = requete(params)
  location.hash = `#/${nom}${requeteTexte}`
}

export function routeCourante () {
  const brut = (location.hash || '#/tableau').slice(2)
  const [nom, query] = brut.split('?')
  return { nom: nom || 'tableau', params: Object.fromEntries(new URLSearchParams(query || '')) }
}

export async function dessiner () {
  const { nom, params } = routeCourante()
  const fabrique = routes.get(nom) || routes.get('tableau')
  const cible = $('#vue')
  remplir(cible, h('div', { class: 's-chargement' }, h('span', { class: 's-tourne' })))
  vueCourante = nom
  try {
    const contenu = await fabrique(params)
    if (vueCourante !== nom) return          // l'utilisateur a change d'ecran
    remplir(cible, contenu)
    cible.scrollTop = 0
    document.dispatchEvent(new CustomEvent('suivi:vue', { detail: { nom, params } }))
  } catch (erreur) {
    remplir(cible, h('div', { class: 's-vide' },
      h('span', { class: 'ico' }, '⚠️'),
      h('b', {}, 'Cet écran n’a pas pu être chargé'),
      h('p', {}, erreur.message),
      h('button', { class: 'b', onclick: () => dessiner() }, 'Réessayer')))
  }
}

export function demarrerNavigation () {
  window.addEventListener('hashchange', dessiner)
  if (!location.hash) location.hash = '#/tableau'
  dessiner()
}

export const rafraichir = () => dessiner()
