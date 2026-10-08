// Reprendre un lot de séances venu d'ailleurs : on colle un tableau, on
// vérifie ce qui a été compris, on choisit qui les reçoit, on importe.
//
// La lecture se fait ici et non sur le serveur : l'aperçu doit réagir pendant
// qu'on colle, et un fichier mal compris se corrige avant d'écrire quoi que
// ce soit plutôt qu'après.

import {
  CONST, api, etat, h, remplir, essayer, rafraichir, dateLongue, aller,
  aujourdhui
} from '../noyau.js'
import {
  modale, info, badge, tableau, vide, pastille, barreProgres, champTexte
} from '../ui.js'
import { ico } from '../icones.js'

/* ------------------------------------------------------------- lecture */
// Les en-têtes possibles, du plus précis au plus vague : « heure de fin »
// doit être reconnu avant « heure », sinon la première colonne gagne tout.
const COLONNES = [
  ['heure_fin', ['heure de fin', 'heure fin', 'fin', 'end', 'jusqu', 'hasta']],
  ['heure', ['heure de début', 'heure debut', 'heure', 'horaire', 'time', 'start', 'début', 'debut']],
  ['date', ['date', 'jour', 'day']],
  ['titre', ['titre', 'séance', 'seance', 'session', 'cours', 'matière', 'matiere', 'sujet', 'subject', 'class', 'classe', 'libellé', 'libelle', 'nom']],
  ['formateur', ['professeur', 'prof', 'enseignant', 'formateur', 'teacher', 'intervenant']],
  ['plateforme', ['plateforme', 'platforme', 'platform', 'salle', 'lien', 'outil']]
]

const SEPARATEURS = ['\t', ';', '|', ',']
// Dernier recours : un tableau dont les tabulations sont devenues des
// espaces d'alignement. Cela arrive quand on copie depuis un aperçu plutôt
// que depuis le fichier — le contenu est bon, la mise en forme seule a
// changé, autant le lire que de le refuser.
const ALIGNEMENT = /\s{2,}/

/** Le séparateur qui découpe le plus régulièrement les lignes, ou rien. */
function separateurDe (lignes) {
  let meilleur = null; let score = 0
  for (const sep of SEPARATEURS) {
    const compte = lignes.map(l => l.split(sep).length)
    const mini = Math.min(...compte)
    // régulier ET découpant vraiment : deux colonnes au minimum
    if (mini >= 2 && mini > score) { score = mini; meilleur = sep }
  }
  if (meilleur) return meilleur
  const mini = Math.min(...lignes.map(l => l.split(ALIGNEMENT).length))
  return mini >= 2 ? ALIGNEMENT : null
}

const sansAccent = (texte) => String(texte || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Associe chaque colonne du fichier à un champ connu, ou à rien. */
function reconnaitreEntetes (cellules) {
  const trouve = {}
  const pris = new Set()
  for (const [champ, mots] of COLONNES) {
    cellules.forEach((cellule, index) => {
      if (trouve[champ] !== undefined || pris.has(index)) return
      const nu = sansAccent(cellule)
      if (mots.some(mot => nu === sansAccent(mot) || nu.includes(sansAccent(mot)))) {
        trouve[champ] = index
        pris.add(index)
      }
    })
  }
  return trouve
}

/** JJ/MM/AAAA, JJ-MM-AAAA ou AAAA-MM-JJ vers la forme ISO. */
export function lireDate (brut) {
  const texte = String(brut || '').trim()
  let m = texte.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`
  m = texte.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) return `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`
  // 30/09/26 : deux chiffres d'année, comprise dans les années 2000
  m = texte.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/)
  if (m) return `20${m[3]}-${pad2(m[2])}-${pad2(m[1])}`
  return ''
}

/** 19:30, 19h30, 19h, 7:30 PM vers HH:MM. */
export function lireHeure (brut) {
  const texte = String(brut || '').trim()
  const m = texte.match(/(\d{1,2})\s*[:hH.]\s*(\d{2})?/)
  if (!m) return ''
  let heures = parseInt(m[1], 10)
  const minutes = m[2] ? parseInt(m[2], 10) : 0
  if (/pm/i.test(texte) && heures < 12) heures += 12
  if (/am/i.test(texte) && heures === 12) heures = 0
  if (heures > 23 || minutes > 59) return ''
  return `${pad2(heures)}:${pad2(minutes)}`
}

const pad2 = (n) => String(n).padStart(2, '0')

/** Une cellule qui commence par une heure — « 19:30 », « 19h » — et rien d'autre. */
const ressembleHeure = (cellule) =>
  /^\d{1,2}\s*[:hH.]\s*\d{0,2}\s*(am|pm)?$/i.test(String(cellule || '').trim()) &&
  Boolean(lireHeure(cellule))

/**
 * Sans ligne d'en-tête, deviner les colonnes d'après la forme de la
 * première ligne : la date se reconnaît, les heures aussi, et ce qui reste
 * suit l'ordre habituel — intitulé, professeur, plateforme.
 *
 * Le rang fixe d'avant supposait « date, heure, titre » ; un export qui
 * porte une heure de fin décalait tout et l'intitulé devenait « 21:30 ».
 */
function deduireColonnes (cellules) {
  const colonnes = {}
  const heures = []
  cellules.forEach((cellule, index) => {
    if (colonnes.date === undefined && lireDate(cellule)) {
      colonnes.date = index
    } else if (ressembleHeure(cellule)) {
      heures.push(index)
    }
  })
  if (heures.length) colonnes.heure = heures[0]
  if (heures.length > 1) colonnes.heure_fin = heures[1]
  const reste = cellules
    .map((_, index) => index)
    .filter(index => !Object.values(colonnes).includes(index))
  const [titre, formateur, plateforme] = reste
  if (titre !== undefined) colonnes.titre = titre
  if (formateur !== undefined) colonnes.formateur = formateur
  if (plateforme !== undefined) colonnes.plateforme = plateforme
  return colonnes
}

/**
 * Lit un tableau collé. Renvoie les séances comprises et les lignes
 * écartées, avec leur raison — une ligne perdue en silence serait pire
 * qu'une ligne refusée.
 */
export function lireTableau (texte) {
  const lignes = String(texte || '').split(/\r?\n/)
    .map(l => l.trim()).filter(Boolean)
  if (!lignes.length) return { seances: [], ecartees: [], colonnes: {} }

  const sep = separateurDe(lignes)
  if (!sep) {
    return {
      seances: [],
      ecartees: lignes.map(brut => ({ brut, raison: 'colonnes introuvables' })),
      colonnes: {},
      sansSeparateur: true
    }
  }
  const cases = lignes.map(l => l.split(sep).map(c => c.trim()))

  // Une ligne d'en-tête ne porte pas de date. Si la première en a une,
  // c'est une séance : les mots reconnus étaient ceux de son intitulé
  // (« Séance », « Maths »…), et la prendre pour un en-tête faisait perdre
  // la première ligne puis toutes les autres, faute de colonne date.
  const premiereEstUneSeance = cases[0].some(c => lireDate(c))
  let colonnes = premiereEstUneSeance ? {} : reconnaitreEntetes(cases[0])
  const aEntete = colonnes.date !== undefined || colonnes.titre !== undefined
  let debut = 0
  if (aEntete) {
    debut = 1
  } else {
    colonnes = deduireColonnes(cases[0])
  }

  const seances = []; const ecartees = []
  for (let i = debut; i < cases.length; i++) {
    const cellule = (champ) => colonnes[champ] === undefined
      ? '' : (cases[i][colonnes[champ]] || '').trim()
    const date = lireDate(cellule('date'))
    const heure = lireHeure(cellule('heure'))
    const titre = cellule('titre')
    const brut = lignes[i]

    if (!date) { ecartees.push({ brut, raison: 'date illisible' }); continue }
    if (!titre) { ecartees.push({ brut, raison: 'titre vide' }); continue }
    if (!heure) { ecartees.push({ brut, raison: 'heure illisible' }); continue }

    seances.push({
      date,
      heure,
      heure_fin: lireHeure(cellule('heure_fin')),
      titre,
      formateur: cellule('formateur'),
      plateforme: cellule('plateforme') || CONST.plateformes[0]
    })
  }
  return { seances, ecartees, colonnes, entete: aEntete }
}

/* ------------------------------------------------------------- écran */
export function ouvrirImport () {
  const equipe = etat.personnes.filter(p => p.actif)
  const choisis = new Set(equipe.map(p => p.id))
  let lu = { seances: [], ecartees: [] }

  const zone = h('textarea', {
    class: 's-import-zone', rows: 9, dir: 'auto',
    placeholder: 'Collez ici le tableau des séances.\n\n'
      + 'Date\tHeure\tSéance\tProfesseur\tPlateforme\n'
      + '30/09/2026\t19:30\tMath — Séance 1 | Elite\tMr Mohamed\tZoom'
  })
  const apercu = h('div')
  const listeEquipe = h('div', { class: 's-import-equipe' })

  zone.addEventListener('input', relire)
  zone.addEventListener('paste', () => setTimeout(relire, 0))

  function relire () {
    lu = lireTableau(zone.value)
    dessinerApercu()
  }

  function dessinerEquipe () {
    remplir(listeEquipe, ...equipe.map(personne => {
      const pris = choisis.has(personne.id)
      return h('button', {
        type: 'button',
        class: `s-import-qui ${pris ? 'pris' : ''}`,
        onclick: () => {
          if (pris) choisis.delete(personne.id); else choisis.add(personne.id)
          dessinerEquipe()
          dessinerApercu()
        }
      },
      h('span', { class: 'case' }, pris ? ico('coche', 13) : null),
      pastille(personne, 'mini'),
      h('span', {}, personne.nom))
    }))
  }

  function dessinerApercu () {
    const n = lu.seances.length
    const gens = equipe.filter(p => choisis.has(p.id))
    if (!n) {
      // Dire pourquoi, et quoi faire : « écartées » tout seul laissait
      // relire un fichier qui, lui, était bon.
      const raisons = [...new Set(lu.ecartees.map(e => e.raison))]
      remplir(apercu, lu.ecartees.length
        ? info(lu.sansSeparateur
          ? 'Les colonnes n’ont pas été trouvées : le texte collé ne contient '
            + 'ni tabulation ni point-virgule. Ouvrez le fichier avec le '
            + 'Bloc-notes, faites Ctrl+A puis Ctrl+C, et recollez ici.'
          : `Aucune séance comprise sur ${lu.ecartees.length} ligne(s) — `
            + `${raisons.join(', ')}. Collez le tableau entier, `
            + 'ligne d’en-tête comprise.')
        : h('div'))
      return
    }

    // qui reçoit quoi : exactement le calcul du serveur, pour que l'aperçu
    // ne promette pas autre chose que ce qui sera fait
    const triees = [...lu.seances].sort((a, b) =>
      (a.date + a.heure).localeCompare(b.date + b.heure))
    const part = new Map(gens.map(p => [p.id, 0]))
    triees.forEach((s, i) => {
      if (!gens.length) return
      const qui = gens[i % gens.length]
      s.responsable = qui.nom
      part.set(qui.id, part.get(qui.id) + 1)
    })

    const jours = new Set(triees.map(s => s.date))
    remplir(apercu,
      h('div', { class: 's-import-resume' },
        badge(`${n} séance(s)`, 'ok', ico('video', 12)),
        badge(`${jours.size} jour(s)`, 'accent', ico('agenda', 12)),
        badge(`du ${dateLongue(triees[0].date)} au ${dateLongue(triees[n - 1].date)}`,
          'muted'),
        lu.ecartees.length
          ? badge(`${lu.ecartees.length} ligne(s) écartée(s)`, 'warn',
            ico('alerte', 12))
          : null),
      gens.length
        ? h('div', { class: 's-import-part' }, ...gens.map(p =>
          h('div', { class: 'piece' }, pastille(p, 'mini'),
            h('small', {}, `${p.nom} · ${part.get(p.id)}`))))
        : info('Choisissez au moins une personne : sans responsable, les '
          + 'séances arriveront dans la colonne « À attribuer ».'),
      tableau({
        colonnes: [{ titre: 'Date', largeur: '108px' },
          { titre: 'Heure', largeur: '76px' }, { titre: 'Séance' },
          { titre: 'Professeur', largeur: '130px' },
          { titre: 'Responsable', largeur: '140px' }],
        lignes: triees.slice(0, 8),
        rendu: (s) => [s.date, s.heure, s.titre, s.formateur || '—',
          s.responsable || 'à attribuer'],
        message: vide({ titre: 'Rien à montrer' })
      }),
      n > 8
        ? h('p', { class: 's-info' }, `… et ${n - 8} autre(s).`)
        : null,
      lu.ecartees.length
        ? h('details', { class: 's-import-ecartees' },
          h('summary', {}, `${lu.ecartees.length} ligne(s) écartée(s)`),
          ...lu.ecartees.slice(0, 20).map(e =>
            h('p', {}, h('b', {}, e.raison + ' : '), e.brut)))
        : null)
  }

  // Mettre a jour ne touche a rien avant cette date : le passe ne se
  // reecrit pas, et un calendrier revu ne porte que la suite.
  const refs = {}
  const depuis = champTexte(refs, 'du', 'Mettre à jour à partir du', {
    type: 'date', valeur: aujourdhui(),
    aide: 'Les séances antérieures ne sont jamais touchées'
  })

  dessinerEquipe()
  dessinerApercu()

  modale({
    titre: 'Importer ou mettre à jour des séances',
    sous: 'Collez le tableau exporté de votre outil de planning.',
    largeur: 'large',
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      zone,
      h('div', { class: 's-lignes d2' },
        h('div', { class: 's-champ' },
          h('label', {}, 'Répartir entre'),
          listeEquipe),
        depuis),
      apercu),
    actions: (fermer) => [
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: async (e) => {
            if (!lu.seances.length) return
            e.target.disabled = true
            const fait = await essayer(() => api.post('/lives/importer', {
              lignes: lu.seances.map(({ responsable, ...reste }) => reste),
              responsables: [...choisis]
            }))
            e.target.disabled = false
            if (!fait) return
            fermer()
            resume(fait)
            rafraichir()
          }
        }, ico('recevoir', 15), 'Tout importer'),
        h('button', {
          class: 'b primaire',
          title: 'Comparer au planning existant au lieu de tout ajouter',
          onclick: async (e) => {
            if (!lu.seances.length) return
            e.target.disabled = true
            const plan = await essayer(() => api.post('/lives/reconcilier', {
              lignes: lu.seances.map(({ responsable, ...reste }) => reste),
              responsables: [...choisis],
              du: refs.du.value || undefined
            }))
            e.target.disabled = false
            if (!plan) return
            montrerPlan(plan, lu, [...choisis], refs.du.value, fermer)
          }
        }, ico('echange', 15), 'Mettre à jour'))
    ]
  })
}

/**
 * Ce que la mise à jour ferait, avant de le faire. Un planning qu'on
 * corrige porte déjà du travail : on montre d'abord, on écrit ensuite.
 */
export function montrerPlan (plan, lu, choisis, du, fermerImport) {
  const fusionnees = plan.fusionnees || []
  const replanifiees = plan.replanifiees || []
  const rien = !plan.creees.length && !plan.deplacees.length &&
    !plan.retirees.length && !fusionnees.length && !replanifiees.length
  const liste = (titre, items, ton, rendu) => items.length
    ? h('details', { class: 's-import-ecartees' },
      h('summary', {}, `${items.length} ${titre}`),
      ...items.slice(0, 25).map(rendu),
      items.length > 25
        ? h('p', {}, `… et ${items.length - 25} autre(s).`)
        : null)
    : null

  modale({
    titre: 'Mettre le planning à jour',
    sous: `Du ${dateLongue(plan.du)} au ${dateLongue(plan.au)}`,
    largeur: 'large',
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div', { class: 's-import-resume' },
        badge(`${plan.inchangees} inchangée(s)`, 'ok', ico('coche', 12)),
        plan.creees.length
          ? badge(`${plan.creees.length} à créer`, 'accent', ico('plus', 12))
          : null,
        plan.deplacees.length
          ? badge(`${plan.deplacees.length} horaire(s) corrigé(s)`, 'info',
            ico('horloge', 12))
          : null,
        replanifiees.length
          ? badge(`${replanifiees.length} déplacée(s) à un autre jour`, 'info',
            ico('agenda', 12))
          : null,
        fusionnees.length
          ? badge(`${fusionnees.length} doublon(s) fusionné(s)`, 'info',
            ico('echange', 12))
          : null,
        plan.retirees.length
          ? badge(`${plan.retirees.length} à retirer`, 'warn', ico('alerte', 12))
          : null,
        plan.conservees.length
          ? badge(`${plan.conservees.length} conservée(s)`, 'danger',
            ico('bouclier', 12))
          : null),
      rien
        ? info('Le planning correspond déjà au calendrier collé : rien à faire.')
        : info('Les séances inchangées ne sont pas touchées — leurs étapes '
          + 'cochées et leurs commentaires restent en place. Rien avant le '
          + `${dateLongue(plan.du)} n’est modifié.`),
      plan.conservees.length
        ? info('Ces séances ne sont plus au calendrier mais quelqu’un y a '
          + 'déjà travaillé : elles sont gardées. À vous de les annuler ou '
          + 'de les déplacer si besoin.')
        : null,
      liste('séance(s) à créer', plan.creees, 'accent', (s) =>
        h('p', {}, h('b', {}, `${s.date} ${s.heure} · `), s.titre,
          s.formateur ? ` — ${s.formateur}` : '')),
      liste('horaire(s) corrigé(s)', plan.deplacees, 'info', (s) =>
        h('p', {}, h('b', {}, `${s.date} · `), s.titre,
          ` — ${s.heure} → ${s.vers}`)),
      replanifiees.length
        ? info('Ces séances changent de jour. Elles sont déplacées, pas '
          + 'refaites : leurs étapes cochées, leurs commentaires et leur '
          + 'responsable suivent la séance.')
        : null,
      liste('séance(s) déplacée(s) à un autre jour', replanifiees, 'info',
        (s) => h('p', {}, h('b', {}, `${s.date} ${s.heure} · `), s.titre,
          ` → ${s.vers}`)),
      fusionnees.length
        ? info('Des séances existent en double — le même intitulé le même '
          + 'jour. Leurs étapes cochées et leurs commentaires rejoignent '
          + 'celle qui reste, puis la doublure disparaît : rien n’est perdu.')
        : null,
      liste('doublon(s) fusionné(s)', fusionnees, 'info', (s) =>
        h('p', {}, h('b', {}, `${s.date} ${s.heure} · `), s.titre)),
      liste('séance(s) à retirer', plan.retirees, 'warn', (s) =>
        h('p', {}, h('b', {}, `${s.date} ${s.heure} · `), s.titre,
          s.formateur ? ` — ${s.formateur}` : '')),
      liste('séance(s) conservée(s)', plan.conservees, 'danger', (s) =>
        h('p', {}, h('b', {}, `${s.date} ${s.heure} · `), s.titre,
          ` — ${s.raison}`))),
    actions: (fermer) => [
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        rien
          ? null
          : h('button', {
            class: 'b primaire',
            onclick: async (e) => {
              e.target.disabled = true
              const fait = await essayer(() => api.post('/lives/reconcilier', {
                lignes: lu.seances.map(({ responsable, ...reste }) => reste),
                responsables: choisis,
                du: du || undefined,
                appliquer: true
              }), 'Planning mis à jour.')
              e.target.disabled = false
              if (!fait) return
              fermer()
              fermerImport()
              rafraichir()
              if (fait.creees.length) {
                aller('planning', { date: fait.creees[0].date })
              }
            }
          }, ico('coche', 15), 'Appliquer'))
    ]
  })
}

/** Ce que l'import a vraiment fait : écrit, et surtout ce qu'il a ignoré. */
function resume (fait) {
  modale({
    titre: 'Import terminé',
    largeur: 'etroite',
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div', { class: 's-import-resume' },
        badge(`${fait.crees} séance(s) créée(s)`, 'ok', ico('coche', 12)),
        fait.ignorees.length
          ? badge(`${fait.ignorees.length} déjà présente(s)`, 'muted')
          : null),
      fait.ignorees.length
        ? h('details', { class: 's-import-ecartees' },
          h('summary', {}, 'Séances déjà au planning, non recréées'),
          ...fait.ignorees.slice(0, 40).map(t => h('p', {}, t)))
        : null,
      fait.crees
        ? info('Les séances sont réparties à tour de rôle, dans l’ordre des '
          + 'dates. Vous pouvez encore les déplacer d’une colonne à l’autre '
          + 'depuis la Planification.')
        : null,
      // La planification montre une journée à la fois et s'ouvre sur
      // aujourd'hui : après un import qui commence plus tard, elle paraît
      // vide. On dit donc où sont les séances, et on y emmène.
      fait.premiere
        ? info(`Elles vont du ${dateLongue(fait.premiere)} au `
          + `${dateLongue(fait.derniere)} — la Planification s’ouvre sur `
          + 'aujourd’hui, pensez à changer de date.')
        : null),
    actions: (fermer) => [
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Fermer'),
        fait.premiere
          ? h('button', {
            class: 'b primaire',
            onclick: () => { fermer(); aller('planning', { date: fait.premiere }) }
          }, ico('agenda', 15), 'Voir le premier jour')
          : null)
    ]
  })
}
