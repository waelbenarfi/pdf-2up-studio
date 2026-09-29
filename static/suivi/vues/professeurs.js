// Le répertoire des professeurs.
//
// La première étape de chaque séance est de les appeler. Sans leur numéro
// ici, le technicien coche une case pour un appel qu'il a dû chercher
// ailleurs — un carnet, un téléphone personnel, un message d'il y a trois
// semaines. Le numéro appartient à l'application.

import {
  api, etat, h, essayer, rafraichir, aller
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
        ? 'Leur numéro apparaît sur l’étape « Appeler le professeur ».'
        : 'Consultable par toute l’équipe ; seul l’administrateur le modifie.',
      actions: etat.admin
        ? [h('button', { class: 'b primaire', onclick: () => ouvrirProfesseur({}) },
          ico('plus', 15), 'Ajouter un professeur')]
        : []
    },
    liste.length
      ? tableau({
        colonnes: [
          { titre: 'Professeur' }, { titre: 'Matière', largeur: '180px' },
          { titre: 'Téléphone', largeur: '200px' },
          { titre: 'Séances', largeur: '100px' },
          { titre: '', classe: 'actions', largeur: '110px' }
        ],
        lignes: liste,
        rendu: (prof) => [
          h('div', {},
            h('span', { class: 'principal' }, prof.nom),
            prof.note ? h('div', { class: 'discret' }, prof.note) : null),
          prof.matiere || '—',
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
    }))

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
