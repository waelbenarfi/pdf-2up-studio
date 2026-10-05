// Le répertoire des professeurs.
//
// La première étape de chaque séance est de les appeler. Sans leur numéro
// ici, le technicien coche une case pour un appel qu'il a dû chercher
// ailleurs — un carnet, un téléphone personnel, un message d'il y a trois
// semaines. Le numéro appartient à l'application.

import {
  api, etat, h, remplir, essayer, rafraichir, aller, toast, chargerProfesseurs
} from '../noyau.js'
import {
  carte, vide, tableau, modale, confirmer, champTexte, champZone, valeurs,
  badge, boutonIco, info, actionsLigne
} from '../ui.js'
import { ico } from '../icones.js'

/** Un numéro composable : les espaces gênent le lien, pas la lecture. */
export const lienTel = (numero) => 'tel:'
  + String(numero || '').replace(/[^\d+]/g, '')

/** Le numéro en bouton d'appel, ou rien s'il manque. */
export function boutonAppel (numero, taille = 14) {
  if (!String(numero || '').trim()) return null
  return h('a', {
    class: 's-appel', href: lienTel(numero),
    title: `Appeler ${numero}`
  }, ico('telephone', taille), numero)
}

export async function vueProfesseurs (params) {
  const [liste, fiabilite] = await Promise.all([
    api.get('/professeurs'),
    api.get('/professeurs/fiabilite', { jours: 90 })
  ])
  const sans = liste.filter(p => p.actif && !p.telephone)

  return [
    releve(fiabilite),
    etat.admin && sans.length
      ? info(`${sans.length} professeur(s) sans numéro : `
        + sans.map(p => p.nom).join(', ') + '. L’étape « appeler le '
        + 'professeur » restera à faire de mémoire tant qu’il manque.')
      : null,
    carte({
      titre: `Professeurs · ${liste.length}`,
      sous: etat.admin
        ? 'Leur numéro apparaît sur l’étape « Appeler le professeur ». Les '
          + 'niveaux sont relevés sur le planning.'
        : 'Consultable par toute l’équipe ; seul l’administrateur le modifie.',
      actions: etat.admin
        ? [h('a', {
          class: 'b', href: '/api/suivi/export/professeurs.csv', download: '',
          title: 'Niveaux, numéros et nombre de séances — s’ouvre dans Excel'
        }, ico('telecharger', 15), 'Excel'),
        h('button', { class: 'b', onclick: () => ouvrirImportProfs() },
          ico('recevoir', 15), 'Importer'),
        h('button', { class: 'b primaire', onclick: () => ouvrirProfesseur({}) },
          ico('plus', 15), 'Ajouter un professeur')]
        : []
    },
    liste.length
      ? tableau({
        colonnes: [
          { titre: 'Professeur' }, { titre: 'Matière', largeur: '150px' },
          { titre: 'Niveaux', largeur: '240px' },
          { titre: 'Téléphone', largeur: '180px' },
          { titre: 'Séances', largeur: '100px' },
          { titre: '', classe: 'actions', largeur: '110px' }
        ],
        lignes: liste,
        rendu: (prof) => [
          h('div', {},
            h('span', { class: 'principal' }, prof.nom),
            prof.note ? h('div', { class: 'discret' }, prof.note) : null),
          prof.matiere || '—',
          celluleNiveaux(prof),
          boutonAppel(prof.telephone) || badge('à renseigner', 'warn'),
          h('span', { class: 'discret' }, `${prof.seances} séance(s)`),
          actionsLigne(
            etat.admin
              ? boutonIco(ico('crayon'), 'Modifier',
                () => ouvrirProfesseur({ prof }))
              : null,
            etat.admin
              ? boutonIco(ico('corbeille'), 'Retirer du répertoire',
                () => supprimer(prof), 'danger')
              : null)
        ],
        message: vide({ titre: 'Répertoire vide' })
      })
      : vide({
        dessin: 'equipe',
        titre: 'Aucun professeur enregistré',
        texte: 'Ajoutez-les avec leur numéro : il s’affichera sur l’étape '
          + '« Appeler le professeur » de chaque séance.',
        action: etat.admin
          ? h('button', { class: 'b primaire', onclick: () => ouvrirProfesseur({}) },
            ico('plus', 15), 'Ajouter un professeur')
          : null
      }))
  ]
}

/**
 * Les niveaux d'un groupe, en une étiquette lisible.
 *
 * Six pastilles « Bac Math », « Bac Sciences »… ne se lisent plus ; quand
 * la famille est complète, « Bac : toutes les sections » dit la même chose
 * d'un coup d'œil.
 */
export function etiquetteNiveau (groupe) {
  if (!groupe.sections.length) return groupe.famille
  if (groupe.toutes) return `${groupe.famille} : toutes les sections`
  return `${groupe.famille} : ${groupe.sections.join(', ')}`
}

/**
 * Les niveaux du professeur, relus sur son planning.
 *
 * Rien n'est saisi ici : l'intitulé de chaque séance porte déjà le niveau.
 * Une fiche remplie à la main se démoderait au premier changement de
 * planning ; celle-ci suit le calendrier sans que personne y touche.
 */
function celluleNiveaux (prof) {
  const groupes = prof.niveauxGroupes || []
  if (!groupes.length) {
    return h('span', { class: 'discret' },
      prof.seances ? '—' : 'aucune séance')
  }
  return h('div', { class: 's-niveaux', title: prof.niveaux },
    ...groupes.map(g => badge(etiquetteNiveau(g), 'info')))
}

/**
 * Ce que disent les rapports, une fois additionnés par professeur.
 *
 * Vous écrivez un rapport par séance depuis des mois ; personne ne les
 * relit à l'envers. Regroupés, ils répondent à la seule question utile :
 * avec qui les séances se passent-elles mal, et à quelle fréquence ?
 */
function releve (fiabilite) {
  const liste = (fiabilite.professeurs || []).filter(p => p.rapports)
  const signales = liste.filter(p => p.absences || p.graves || p.part >= 30)
  if (!liste.length) return null

  return carte({
    titre: 'Ce que disent les rapports',
    sous: `${liste.length} professeur(s) · ${fiabilite.jours} derniers jours`
      + ' · séances sans rapport exclues'
  },
  signales.length
    ? h('div', { class: 's-liste' }, ...signales.map(p =>
      h('div', { class: `s-item ${p.absences ? 'alerte' : ''}` },
        h('div', { class: 'corps' },
          h('b', {}, p.nom),
          h('small', {}, `${p.soucis}/${p.rapports} séance(s) avec un `
            + `problème signalé · ${p.part} %`)),
        h('div', { class: 'droite' },
          p.absences
            ? badge(`${p.absences} absence(s)`, 'danger', ico('croix_cercle', 12))
            : null,
          p.graves
            ? badge(`${p.graves} problème(s) important(s)`, 'warn',
              ico('alerte', 12))
            : null,
          boutonAppel(p.telephone, 12)))))
    : info('Aucun professeur ne ressort sur la période : pas d’absence, pas '
      + 'de problème important, et moins de 30 % de séances avec incident '
      + 'pour chacun.'))
}

export function ouvrirProfesseur ({ prof = null, apres = null } = {}) {
  const modif = !!prof
  const base = prof || { nom: '', telephone: '', matiere: '', note: '' }
  const refs = {}

  const corps = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
    champTexte(refs, 'nom', 'Nom du professeur', {
      valeur: base.nom, obligatoire: true, exemple: 'Ex. Mr Mohamed Ben Ali'
    }),
    h('div', { class: 's-lignes d2' },
      champTexte(refs, 'telephone', 'Téléphone', {
        type: 'tel', valeur: base.telephone, exemple: 'Ex. +216 20 123 456',
        aide: 'Composable d’un clic depuis la séance'
      }),
      champTexte(refs, 'matiere', 'Matière', {
        valeur: base.matiere, optionnel: true, exemple: 'Ex. Mathématiques'
      })),
    champZone(refs, 'note', 'Remarque', {
      valeur: base.note, lignes: 2, optionnel: true,
      exemple: 'Ex. ne répond pas avant 17 h, préfère WhatsApp.'
    }),
    modif && base.niveaux
      ? info(`Niveaux assurés : ${base.niveaux}. Relevés sur le planning, `
        + 'ils se mettent à jour tout seuls — rien à saisir ici.')
      : null)

  modale({
    titre: modif ? 'Modifier le professeur' : 'Nouveau professeur',
    sous: modif ? prof.nom : 'Son numéro servira à l’étape d’appel.',
    largeur: 'etroite',
    corps,
    actions: (fermer) => [
      modif
        ? h('button', {
          class: 'b danger',
          onclick: () => { fermer(); supprimer(prof) }
        }, ico('corbeille', 15), 'Retirer')
        : null,
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: async (e) => {
            e.target.disabled = true
            const donnees = valeurs(refs)
            const fait = await essayer(
              () => modif
                ? api.patch(`/professeurs/${prof.id}`, donnees)
                : api.post('/professeurs', donnees),
              modif ? 'Professeur modifié.' : 'Professeur ajouté.')
            e.target.disabled = false
            if (!fait) return
            fermer()
            if (apres) apres(fait); else rafraichir()
          }
        }, modif ? 'Enregistrer' : 'Ajouter'))
    ]
  })
}

/* ------------------------------------------------------------ import */
/**
 * Reprendre un répertoire entier. Cinquante professeurs saisis un par un,
 * personne ne le fait — et un carnet à moitié rempli ne sert à rien.
 */
export function ouvrirImportProfs () {
  let lu = { profs: [], ecartees: [] }
  const apercu = h('div')
  const zone = h('textarea', {
    class: 's-import-zone', rows: 9, dir: 'auto',
    placeholder: 'Collez ici le tableau des professeurs.\n\n'
      + 'Nom\tTéléphone\tMatière\n'
      + 'Hela Jbeli\t22 910 536\tMaths'
  })

  zone.addEventListener('input', relire)
  zone.addEventListener('paste', () => setTimeout(relire, 0))

  function relire () {
    lu = lireProfs(zone.value)
    const n = lu.profs.length
    remplir(apercu,
      n
        ? h('div', { class: 's-import-resume' },
          badge(`${n} professeur(s)`, 'ok', ico('equipe', 12)),
          badge(`${lu.profs.filter(p => p.telephone).length} avec un numéro`,
            'accent', ico('telephone', 12)),
          lu.ecartees.length
            ? badge(`${lu.ecartees.length} ligne(s) écartée(s)`, 'warn',
              ico('alerte', 12))
            : null)
        : (lu.ecartees.length
            ? info('Aucun professeur compris : la première colonne doit être '
              + 'le nom.')
            : h('div')),
      n
        ? tableau({
          colonnes: [{ titre: 'Nom' }, { titre: 'Téléphone', largeur: '160px' },
            { titre: 'Matière', largeur: '150px' }],
          lignes: lu.profs.slice(0, 8),
          rendu: (p) => [p.nom, p.telephone || '—', p.matiere || '—'],
          message: vide({ titre: 'Rien à montrer' })
        })
        : null,
      n > 8 ? h('p', { class: 's-info' }, `… et ${n - 8} autre(s).`) : null,
      n
        ? info('Un professeur déjà connu n’est pas recréé : son numéro et '
          + 'sa matière sont complétés s’ils manquaient, et laissés tels '
          + 'quels sinon — une correction faite à la main n’est jamais '
          + 'écrasée.')
        : null)
  }

  relire()
  modale({
    titre: 'Importer des professeurs',
    sous: 'Nom, téléphone, matière — dans cet ordre ou avec une ligne '
      + 'd’en-tête.',
    largeur: 'large',
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      zone, apercu),
    actions: (fermer) => [
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: async (e) => {
            if (!lu.profs.length) return
            e.target.disabled = true
            const fait = await essayer(
              () => api.post('/professeurs/importer', { lignes: lu.profs }))
            e.target.disabled = false
            if (!fait) return
            fermer()
            toast(`${fait.crees} professeur(s) ajouté(s)`
              + (fait.completes.length
                ? `, ${fait.completes.length} fiche(s) complétée(s)` : '')
              + (fait.connus.length
                ? `, ${fait.connus.length} déjà connu(s)` : '') + '.')
            await chargerProfesseurs()
            rafraichir()
          }
        }, ico('recevoir', 15), 'Importer'))
    ]
  })
}

/** Nom, téléphone, matière. Le nom seul est obligatoire. */
export function lireProfs (texte) {
  const lignes = String(texte || '').split(/\r?\n/)
    .map(l => l.trim()).filter(Boolean)
  if (!lignes.length) return { profs: [], ecartees: [] }

  const sep = ['\t', ';', '|', ','].reduce((meilleur, s) =>
    Math.min(...lignes.map(l => l.split(s).length)) >
    Math.min(...lignes.map(l => l.split(meilleur).length)) ? s : meilleur, '\t')

  const profs = []; const ecartees = []
  lignes.forEach((ligne, i) => {
    const cases = ligne.split(sep).map(c => c.trim())
    const nu = cases[0].toLowerCase()
    // une ligne d'en-tête ne se distingue que par son premier mot
    if (i === 0 && (nu === 'nom' || nu === 'professeur' || nu === 'name')) return
    if (!cases[0]) { ecartees.push({ brut: ligne, raison: 'nom vide' }); return }
    profs.push({
      nom: cases[0],
      telephone: (cases[1] || '').trim(),
      matiere: (cases[2] || '').trim()
    })
  })
  return { profs, ecartees }
}

function supprimer (prof) {
  confirmer({
    titre: 'Retirer du répertoire ?',
    texte: `${prof.nom} sera retiré du répertoire. Ses ${prof.seances} `
      + 'séance(s) gardent son nom, elles perdent seulement le lien vers '
      + 'son numéro.',
    bouton: 'Retirer',
    surOui: async () => {
      await essayer(() => api.del(`/professeurs/${prof.id}`),
        'Professeur retiré.')
      rafraichir()
    }
  })
}
