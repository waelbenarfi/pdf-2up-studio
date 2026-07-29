// Point 2 : chaque rapport est range tout seul dans Rapports / Annee / Mois.
// Les dossiers existent vraiment sur le disque : on peut les ouvrir, les
// copier, ou laisser l'application Google Drive les synchroniser.

import { api, h, dateCourte, poids, essayer } from '../noyau.js'
import { carte, vide, info, badgeEtat, badge, icoFichier, remplir } from '../ui.js'
import { ouvrirFiche } from './rapports.js'

export async function vueArchive () {
  const { arbre, stats } = await api.get('/archive')

  return [
    carte({
      titre: 'Dossiers des rapports',
      sous: 'Classement automatique par année et par mois, pièces jointes comprises.'
    },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div', { class: 's-grille k3' },
        petit('📁', 'Dossiers', stats.dossiers),
        petit('📄', 'Fichiers', stats.fichiers),
        petit('💾', 'Taille totale', poids(stats.octets))),
      h('div', { class: 's-chemin' }, stats.racine),
      info('Ces dossiers sont créés sur cet ordinateur au fur et à mesure des '
        + 'envois. Pour les retrouver dans Google Drive, il suffit de placer '
        + 'le dossier ci-dessus dans un dossier synchronisé par Google Drive '
        + 'pour ordinateur : l’arborescence Rapports / Année / Mois est déjà '
        + 'celle qui est demandée.'),
      h('div', { class: 's-arbre' }, ...arbre.map(anneeNoeud)))),
    arbre.length && arbre.some(a => a.nombre)
      ? null
      : vide({
        ico: '🗂',
        titre: 'Aucun rapport archivé pour l’instant',
        texte: 'Dès qu’un rapport est envoyé, son dossier apparaît ici.'
      })
  ]
}

const petit = (ico, nom, valeur) => h('div', { class: 's-item' },
  h('span', { style: { fontSize: '20px' } }, ico),
  h('div', { class: 'corps' },
    h('b', {}, String(valeur)),
    h('small', {}, nom)))

/* --------------------------------------------------------------- arbre */
function anneeNoeud (annee) {
  const enfants = h('div', { class: 's-noeud', hidden: true })
  let charge = false
  const tete = branche({
    ico: '📁',
    nom: String(annee.annee),
    compte: `${annee.nombre} rapport${annee.nombre > 1 ? 's' : ''}`,
    surOuverture: (ouvert) => {
      enfants.hidden = !ouvert
      if (ouvert && !charge) {
        charge = true
        const noeuds = annee.mois.map(mois => moisNoeud(mois))
        remplir(enfants, ...noeuds)
        // le mois courant est celui qu'on vient consulter neuf fois sur dix
        const maintenant = new Date()
        const courant = maintenant.getMonth()
        if (annee.annee === maintenant.getFullYear() && annee.mois[courant].nombre) {
          noeuds[courant].firstChild.click()
        }
      }
    }
  })
  if (annee.nombre) setTimeout(() => tete.click(), 0)
  return h('div', {}, tete, enfants)
}

function moisNoeud (mois) {
  const enfants = h('div', { class: 's-noeud', hidden: true })
  let charge = false
  const tete = branche({
    ico: mois.nombre ? '📂' : '📁',
    nom: mois.nom,
    vide: !mois.nombre,
    compte: mois.nombre ? String(mois.nombre) : '—',
    surOuverture: (ouvert) => {
      enfants.hidden = !ouvert
      if (!ouvert || charge) return
      charge = true
      if (!mois.nombre) {
        remplir(enfants, h('p', { class: 's-info' }, 'Ce mois ne contient encore aucun rapport.'))
        return
      }
      remplir(enfants, ...mois.rapports.map(rapportNoeud))
    }
  })
  return h('div', {}, tete, enfants)
}

function rapportNoeud (rapport) {
  const enfants = h('div', { class: 's-noeud', hidden: true })
  let charge = false
  const tete = branche({
    ico: '📄',
    nom: `${rapport.reference} · ${rapport.nom_live}`,
    compte: dateCourte(rapport.date),
    apres: badgeEtat(rapport.etat),
    surOuverture: async (ouvert) => {
      enfants.hidden = !ouvert
      if (!ouvert || charge) return
      charge = true
      remplir(enfants, h('p', { class: 's-info' }, 'Préparation du dossier…'))
      const dossier = await essayer(() => api.get('/archive/dossier', { rapportId: rapport.id }))
      if (!dossier) {
        remplir(enfants, h('p', { class: 's-erreur' }, 'Dossier illisible.'))
        return
      }
      remplir(enfants,
        h('div', { class: 's-chemin' }, dossier.disque),
        h('div', { class: 's-fichiers', style: { marginTop: '8px' } },
          ...dossier.fichiers.map(fichier => h('div', { class: 's-fichier' },
            h('span', {}, icoFichier(fichier.nom)),
            h('a', {
              class: 'nom', target: '_blank', rel: 'noopener',
              href: `/api/suivi/fichier?chemin=${encodeURIComponent(fichier.chemin)}`
            }, fichier.nom),
            h('span', { class: 'poids' }, poids(fichier.taille)),
            h('a', {
              class: 'b ico petit', title: 'Télécharger', download: '',
              href: `/api/suivi/fichier?chemin=${encodeURIComponent(fichier.chemin)}&dl=1`
            }, '⬇︎'))),
          dossier.fichiers.length ? null : badge('dossier vide', 'muted')),
        h('div', { class: 'b-groupe', style: { marginTop: '10px' } },
          h('button', {
            class: 'b petit', onclick: () => ouvrirFiche(rapport.id)
          }, 'Ouvrir le rapport')))
    }
  })
  return h('div', {}, tete, enfants)
}

function branche ({ ico, nom, compte, vide: estVide, apres, surOuverture }) {
  let ouvert = false
  const noeud = h('div', {
    class: `s-branche ${estVide ? 'vide' : ''}`,
    role: 'button', tabindex: '0',
    onclick: () => basculer(),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); basculer() } }
  },
  h('span', { class: 'fleche' }, '▶'),
  h('span', {}, ico),
  h('span', { class: 'nom' }, nom),
  apres,
  h('span', { class: 'compte' }, compte))

  function basculer () {
    ouvert = !ouvert
    noeud.classList.toggle('ouvert', ouvert)
    surOuverture(ouvert)
  }
  return noeud
}
