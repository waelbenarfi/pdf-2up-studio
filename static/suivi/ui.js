// Composants partages par les sept ecrans.

import {
  CONST, h, ajouter, remplir, $, etatDe, urgenceDe, statutLiveDe,
  statutTicketDe, prioriteDe, initiales, poids
} from './noyau.js'

/* --------------------------------------------------------------- badges */
export const badge = (texte, ton = 'muted', icone = null) =>
  h('span', { class: `s-badge t-${ton}` }, icone, texte)

export const badgeEtat = (cle) => {
  const e = etatDe(cle)
  return badge(e.libelle, e.ton, e.icone)
}
export const badgeUrgence = (cle) => {
  const u = urgenceDe(cle)
  return badge('Urgence : ' + u.libelle.toLowerCase(), u.ton)
}
export const badgeStatutLive = (cle) => {
  const s = statutLiveDe(cle)
  return badge(s.libelle, s.ton)
}
export const badgeStatutTicket = (cle) => {
  const s = statutTicketDe(cle)
  return badge(s.libelle, s.ton)
}
export const badgePriorite = (cle) => {
  const p = prioriteDe(cle)
  return badge(p.libelle, p.ton)
}

export const pastille = (personne, taille = '') => h('span', {
  class: `s-pastille ${taille}`,
  style: { background: (personne && personne.couleur) || 'var(--muted)' },
  title: (personne && personne.nom) || 'Non attribué'
}, initiales(personne && personne.nom))

/* --------------------------------------------------------------- cartes */
export function carte ({ titre, sous, actions, plein = false }, ...enfants) {
  const tete = (titre || actions)
    ? h('div', { class: 's-carte-tete' },
        titre && h('div', {}, h('h2', {}, titre), sous && h('p', {}, sous)),
        actions && h('div', { class: 'b-groupe' }, actions))
    : null
  return h('section', { class: 's-carte', style: plein ? { padding: '20px 20px 8px' } : null },
    tete, ...enfants)
}

export function kpi ({ ico, nom, valeur, sous, ton = 'accent', onclic }) {
  const couleurs = {
    ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)',
    info: 'var(--info)', accent: 'var(--accent)', violet: 'var(--violet)'
  }
  return h('div', {
    class: `s-kpi ${onclic ? 'clic' : ''}`,
    style: { '--ton': couleurs[ton] || couleurs.accent },
    onclick: onclic || null,
    role: onclic ? 'button' : null,
    tabindex: onclic ? '0' : null,
    onkeydown: onclic ? (e) => { if (e.key === 'Enter') onclic() } : null
  },
  h('div', { class: 's-kpi-tete' },
    h('span', { class: 's-kpi-ico' }, ico),
    h('span', { class: 's-kpi-nom' }, nom)),
  h('div', { class: 's-kpi-val', style: { color: couleurs[ton] } }, String(valeur)),
  sous && h('div', { class: 's-kpi-sous' }, sous))
}

export function vide ({ ico = '📭', titre, texte, action }) {
  return h('div', { class: 's-vide' },
    h('span', { class: 'ico' }, ico),
    h('b', {}, titre),
    texte && h('p', {}, texte),
    action)
}

export const info = (texte) => h('p', { class: 's-info' }, texte)

/* --------------------------------------------------------------- champs */
function enveloppe (etiquette, champ, { aide, obligatoire, optionnel } = {}) {
  return h('div', { class: 's-champ' },
    etiquette && h('label', {}, etiquette,
      obligatoire && h('span', { class: 'oblig' }, '*'),
      optionnel && h('span', { class: 'opt' }, '(optionnel)')),
    champ,
    aide && h('span', { class: 'aide' }, aide))
}

// dir="auto" : dès la première lettre arabe tapée, le champ passe de
// lui-même en écriture de droite à gauche — curseur, alignement et
// ponctuation compris. Une saisie en français ne bouge pas.
export function champTexte (refs, nom, etiquette, options = {}) {
  const champ = h('input', {
    type: options.type || 'text',
    dir: 'auto',
    value: options.valeur ?? '',
    placeholder: options.exemple || '',
    min: options.min, max: options.max, step: options.step,
    oninput: options.onsaisie || null
  })
  refs[nom] = champ
  return enveloppe(etiquette, champ, options)
}

export function champZone (refs, nom, etiquette, options = {}) {
  const champ = h('textarea', {
    dir: 'auto',
    value: options.valeur ?? '',
    rows: options.lignes || 4,
    placeholder: options.exemple || ''
  })
  refs[nom] = champ
  return enveloppe(etiquette, champ, options)
}

export function champListe (refs, nom, etiquette, choix, options = {}) {
  const champ = h('select', { onchange: options.onchoix || null },
    ...choix.map(item => h('option', {
      value: item.valeur,
      selected: String(item.valeur) === String(options.valeur ?? '')
    }, item.libelle)))
  refs[nom] = champ
  return enveloppe(etiquette, champ, options)
}

/** Les trois etats de la seance, en grandes cartes cliquables. */
export function champEtat (refs, options = {}) {
  const valeur = { cle: options.valeur || 'normale' }
  const boutons = CONST.etats.map(item => {
    const bouton = h('button', {
      type: 'button',
      class: 's-choix-item',
      style: { '--c': `var(--${item.ton === 'ok' ? 'ok' : item.ton})` },
      onclick: () => {
        valeur.cle = item.cle
        boutons.forEach(b => b.classList.toggle('pris', b.dataset.cle === item.cle))
        if (options.onchoix) options.onchoix(item.cle)
      }
    },
    h('span', { class: 'gros' }, item.icone),
    h('b', {}, item.libelle),
    h('small', {}, item.aide))
    bouton.dataset.cle = item.cle
    bouton.classList.toggle('pris', item.cle === valeur.cle)
    return bouton
  })
  refs.etat = { get value () { return valeur.cle } }
  return enveloppe(options.etiquette || 'État de la séance',
    h('div', { class: 's-choix' }, ...boutons), { obligatoire: true })
}

/** Suite de pilules a choix unique (urgence, priorite, statut...). */
export function champPilules (refs, nom, etiquette, choix, options = {}) {
  const couleurs = {
    ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)',
    info: 'var(--info)', accent: 'var(--accent)', muted: 'var(--muted)'
  }
  const valeur = { cle: options.valeur || choix[0].cle }
  const boutons = choix.map(item => {
    const bouton = h('button', {
      type: 'button', class: 's-pilule',
      style: { '--c': couleurs[item.ton] || couleurs.accent },
      onclick: () => {
        valeur.cle = item.cle
        boutons.forEach(b => b.classList.toggle('pris', b.dataset.cle === item.cle))
        if (options.onchoix) options.onchoix(item.cle)
      }
    }, item.libelle)
    bouton.dataset.cle = item.cle
    bouton.classList.toggle('pris', item.cle === valeur.cle)
    return bouton
  })
  refs[nom] = {
    get value () { return valeur.cle },
    set value (v) {
      valeur.cle = v
      boutons.forEach(b => b.classList.toggle('pris', b.dataset.cle === v))
    }
  }
  return enveloppe(etiquette, h('div', { class: 's-pilules' }, ...boutons), options)
}

export const valeurs = (refs) => Object.fromEntries(
  Object.entries(refs).map(([cle, champ]) => [cle,
    typeof champ.value === 'string' ? champ.value.trim() : champ.value]))

/* ------------------------------------------------------------- fichiers */
/**
 * Pieces jointes : les fichiers deja enregistres (supprimables) et ceux que
 * l'utilisateur vient de choisir (envoyes apres l'enregistrement).
 */
export function zoneFichiers ({ existants = [], surSuppression = null } = {}) {
  const attente = []
  const listeNouveaux = h('div', { class: 's-fichiers' })
  const listeAnciens = h('div', { class: 's-fichiers' })

  const entree = h('input', {
    type: 'file', multiple: true, hidden: true,
    accept: (CONST.extensions || []).join(','),
    onchange: (e) => { accepter([...e.target.files]); e.target.value = '' }
  })

  const depot = h('div', {
    class: 's-depot', tabindex: '0', role: 'button',
    onclick: () => entree.click(),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') entree.click() },
    ondragover: (e) => { e.preventDefault(); depot.classList.add('survol') },
    ondragleave: () => depot.classList.remove('survol'),
    ondrop: (e) => {
      e.preventDefault()
      depot.classList.remove('survol')
      accepter([...e.dataTransfer.files])
    }
  },
  h('span', { class: 'ico' }, '📎'),
  h('b', {}, 'Capture d’écran, photo, vidéo ou fichier'),
  h('small', {}, `Glissez ici ou cliquez · ${CONST.tailleMaxMo} Mo maximum par fichier`),
  entree)

  function accepter (fichiers) {
    for (const fichier of fichiers) {
      if (fichier.size > CONST.tailleMaxMo * 1024 * 1024) continue
      attente.push(fichier)
    }
    redessinerNouveaux()
  }

  function redessinerNouveaux () {
    remplir(listeNouveaux, ...attente.map((fichier, index) =>
      h('div', { class: 's-fichier' },
        h('span', {}, icoFichier(fichier.name)),
        h('span', { class: 'nom' }, fichier.name),
        h('span', { class: 'poids' }, poids(fichier.size)),
        h('button', {
          class: 'b ico petit danger', type: 'button', title: 'Retirer',
          onclick: () => { attente.splice(index, 1); redessinerNouveaux() }
        }, '✕'))))
  }

  function redessinerAnciens () {
    remplir(listeAnciens, ...existants.map(fichier =>
      h('div', { class: 's-fichier' },
        h('span', {}, icoFichier(fichier.nom)),
        h('a', {
          class: 'nom', href: `/api/suivi/fichier?chemin=${encodeURIComponent(fichier.chemin)}`,
          target: '_blank', rel: 'noopener'
        }, fichier.nom),
        h('span', { class: 'poids' }, poids(fichier.taille)),
        surSuppression && h('button', {
          class: 'b ico petit danger', type: 'button', title: 'Supprimer',
          onclick: async () => {
            if (await surSuppression(fichier) !== false) {
              existants = existants.filter(f => f.id !== fichier.id)
              redessinerAnciens()
            }
          }
        }, '✕'))))
  }

  redessinerAnciens()
  return {
    noeud: h('div', {}, listeAnciens, depot, listeNouveaux),
    nouveaux: () => attente
  }
}

export function icoFichier (nom) {
  const ext = String(nom).split('.').pop().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return '🖼️'
  if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return '🎬'
  if (ext === 'pdf') return '📕'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return '📊'
  if (ext === 'zip') return '🗜️'
  return '📄'
}

/* -------------------------------------------------------------- modales */
export function modale ({ titre, sous, corps, actions, largeur = '' }) {
  const voile = h('div', { class: 's-voile' })
  const fermer = () => {
    voile.remove()
    document.removeEventListener('keydown', surTouche)
  }
  const surTouche = (e) => { if (e.key === 'Escape') fermer() }
  document.addEventListener('keydown', surTouche)

  const boite = h('div', { class: `s-modale ${largeur}` },
    h('div', { class: 's-modale-tete' },
      h('div', {}, h('h3', {}, titre), sous && h('p', {}, sous)),
      h('button', { class: 'b ico fermer', onclick: fermer, title: 'Fermer' }, '✕')),
    h('div', { class: 's-modale-corps' }, corps))

  if (actions) {
    boite.append(h('div', { class: 's-modale-pied' },
      ...(Array.isArray(actions) ? actions : actions(fermer))))
  }
  voile.append(boite)
  voile.addEventListener('mousedown', (e) => { if (e.target === voile) fermer() })
  $('#calques').append(voile)
  const premier = boite.querySelector('input, textarea, select')
  if (premier) setTimeout(() => premier.focus(), 40)
  return { fermer, boite }
}

export function confirmer ({ titre, texte, bouton = 'Supprimer', surOui }) {
  const { fermer } = modale({
    titre,
    largeur: 'etroite',
    corps: h('p', { style: { fontSize: '13.5px', lineHeight: '1.6', color: 'var(--muted)' } }, texte),
    actions: (ferme) => [
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: ferme }, 'Annuler'),
        h('button', {
          class: 'b plein-danger',
          onclick: async () => { ferme(); await surOui() }
        }, bouton))
    ]
  })
  return fermer
}

/* ------------------------------------------------------------- tableaux */
export function tableau ({ colonnes, lignes, rendu, surClic, message }) {
  if (!lignes.length) return message || vide({ titre: 'Rien à afficher' })
  const corps = h('tbody', {},
    ...lignes.map(ligne => {
      const tr = h('tr', {
        class: surClic ? 'clicable' : '',
        onclick: surClic ? (e) => {
          if (e.target.closest('button, a')) return
          surClic(ligne)
        } : null
      }, ...rendu(ligne).map((cellule, index) =>
        h('td', { class: colonnes[index] && colonnes[index].classe },
          cellule)))
      return tr
    }))
  return h('div', { class: 's-tableau-boite' },
    h('table', { class: 's-tableau' },
      h('thead', {}, h('tr', {}, ...colonnes.map(col =>
        h('th', { class: col.classe, style: col.largeur ? { width: col.largeur } : null },
          col.titre)))),
      corps))
}

export const actionsLigne = (...boutons) =>
  h('div', { class: 'b-groupe', style: { justifyContent: 'flex-end' } }, ...boutons)

export const boutonIco = (icone, titre, surClic, classe = '') =>
  h('button', { class: `b ico petit ${classe}`, title: titre, onclick: surClic }, icone)

/* --------------------------------------------------------------- barres */
export function barreProgres (pourcent, couleur = 'var(--accent)') {
  return h('div', { class: 's-barre-progres' },
    h('i', { style: { width: `${Math.max(0, Math.min(100, pourcent))}%`, background: couleur } }))
}

export const ligneFiltres = (...enfants) =>
  h('div', { class: 's-filtres' }, ...enfants)

export const optionsPersonnes = (personnes, avecVide = 'Toute l’équipe') => [
  ...(avecVide ? [{ valeur: '', libelle: avecVide }] : []),
  ...personnes.map(p => ({ valeur: p.id, libelle: p.nom }))
]

export const optionsSimples = (liste, avecVide = null) => [
  ...(avecVide ? [{ valeur: '', libelle: avecVide }] : []),
  ...liste.map(item => typeof item === 'string'
    ? { valeur: item, libelle: item }
    : { valeur: item.cle, libelle: item.libelle })
]

export { ajouter, remplir }
