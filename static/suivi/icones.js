// Jeu d'icônes tracées, à la place des émojis.
//
// Deux raisons de ne pas garder les émojis : ils changent de dessin selon le
// système (Windows, Android et iOS ne montrent pas le même 📞) et ils portent
// leurs propres couleurs, donc ils jurent avec la charte. Celles-ci sont des
// traits en `currentColor` : elles prennent la couleur de ce qui les entoure,
// navy sur fond clair, claires sur fond navy, sans rien changer d'autre.

const NS = 'http://www.w3.org/2000/svg'

// Traits seuls, sur une grille de 24. `fill` reste à none : ce sont des
// contours, jamais des aplats, pour rester lisibles à 14 comme à 28 pixels.
const DESSINS = {
  /* ------------------------------------------------------- navigation */
  tableau: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6" rx="1"/>'
    + '<rect x="12" y="8" width="3" height="10" rx="1"/>'
    + '<rect x="17" y="5" width="3" height="13" rx="1"/>',
  agenda: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  video: '<path d="M23 7.5 16 12l7 4.5z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
    + '<path d="M14 2v6h6M9 13h6M9 17h6"/>',
  boite: '<path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/><path d="M10 12h4"/>',
  bouee: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>'
    + '<path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/>',
  equipe: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'
    + '<path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',

  /* ------------------------------------------------ étapes d'une séance */
  telephone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6'
    + 'A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81'
    + 'a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45'
    + 'c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
  recevoir: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',
  televerser: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 8 5-5 5 5M12 3v12"/>',
  nuage: '<path d="M20.4 18.4A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/><path d="m16 16-4-4-4 4M12 12v9"/>',
  lecture: '<circle cx="12" cy="12" r="10"/><path d="M10 8.5 16 12l-6 3.5z"/>',
  oeil: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  onde: '<circle cx="12" cy="12" r="2"/><path d="M7.76 16.24a6 6 0 0 1 0-8.48M16.24 7.76a6 6 0 0 1 0 8.48"/>'
    + '<path d="M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  liste: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'
    + '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',

  /* ------------------------------------------------------- indicateurs */
  sablier: '<path d="M6 2h12M6 22h12"/><path d="M6 2v4a6 6 0 0 0 6 6 6 6 0 0 0 6-6V2"/>'
    + '<path d="M6 22v-4a6 6 0 0 1 6-6 6 6 0 0 1 6 6v4"/>',
  alerte: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>'
    + '<path d="M12 9v4M12 17h.01"/>',
  croix_cercle: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>',
  billet: '<path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 1 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/>'
    + '<path d="M13 5v2M13 11v2M13 17v2"/>',
  horloge: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  cible: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  coche_cercle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/>',

  /* ------------------------------------------------------------ actions */
  crayon: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  document_crayon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h5"/><path d="M14 2v6h6V8"/>'
    + '<path d="M18.4 12.6a2 2 0 1 1 2.8 2.8L16 20.6l-3 .8.8-3z"/>',
  corbeille: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>'
    + '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  croix: '<path d="M18 6 6 18M6 6l12 12"/>',
  coche: '<path d="m20 6-11 11-5-5"/>',
  bulle: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  envoyer: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4z"/>',
  echange: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/>'
    + '<path d="m15 15 6 6"/><path d="m4 4 5 5"/>',
  trombone: '<path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19'
    + 'a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  lune: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
  balai: '<path d="M19 5 12.5 11.5"/><path d="m14 4 6 6"/>'
    + '<path d="M11 10 4.5 16.5a3.5 3.5 0 0 0 5 5L16 15z"/><path d="m7 14 3 3"/>',
  gauche: '<path d="m15 18-6-6 6-6"/>',
  droite: '<path d="m9 18 6-6-6-6"/>',
  telecharger: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/>',

  /* ------------------------------------------------------------- états */
  visage_ok: '<circle cx="12" cy="12" r="10"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  point: '<circle cx="12" cy="12" r="3"/>',
  vide_boite: '<path d="M21 8v13H3V8"/><rect x="1" y="3" width="22" height="5" rx="1"/>',
  interdit: '<circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',

  /* ------------------------------------------------------- pièces jointes */
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>'
    + '<path d="m21 15-5-5L5 21"/>',
  film: '<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M7 3v18M17 3v18M2 9h5M17 9h5M2 15h5M17 15h5"/>',
  pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>'
    + '<path d="M14 2v6h6"/><path d="M9 15h1.5a1.5 1.5 0 0 0 0-3H9v6M14 18v-6h1.5a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5z"/>',
  tableur: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  archive_zip: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v3M12 8v3M12 13v3"/>',
  fichier: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'
}

/** Un dessin, en élément SVG prêt à poser dans le DOM. */
export function ico (nom, taille = 18) {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', taille)
  svg.setAttribute('height', taille)
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.7')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('class', 'ic')
  svg.innerHTML = DESSINS[nom] || DESSINS.point
  return svg
}

export const connue = (nom) => Object.prototype.hasOwnProperty.call(DESSINS, nom)

/** L'emblème Wael Academy, pour les écrans vides et les en-têtes. */
export function embleme (taille = 40, blanc = false) {
  const img = document.createElement('img')
  img.src = `/static/wael/emblem${blanc ? '-white' : ''}.svg`
  img.alt = 'Wael Academy'
  img.width = taille
  img.setAttribute('aria-hidden', 'true')
  return img
}

/** L'extension d'un fichier décide de son dessin. */
export function icoFichierNom (nom) {
  const ext = String(nom).split('.').pop().toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'mkv', 'avi'].includes(ext)) return 'film'
  if (ext === 'pdf') return 'pdf'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'tableur'
  if (ext === 'zip') return 'archive_zip'
  return 'fichier'
}
