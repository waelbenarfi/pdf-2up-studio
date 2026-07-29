// L'equipe : qui peut etre responsable d'un live, demandeur d'un ticket,
// auteur d'un rapport. Ajout, modification et suppression libres.

import {
  CONST, api, etat, h, essayer, rafraichir, chargerPersonnes, definirMoi,
  momentDe, aller
} from '../noyau.js'
import {
  carte, vide, tableau, modale, confirmer, champTexte, valeurs,
  badge, pastille, boutonIco, barreProgres
} from '../ui.js'

export async function vueEquipe () {
  const [personnes, bord, journal] = await Promise.all([
    api.get('/personnes'),
    api.get('/tableau'),
    api.get('/journal', { limite: 25 })
  ])
  const chiffres = new Map(bord.equipe.map(item => [item.id, item]))

  return [
    carte({
      titre: `Techniciens de live · ${personnes.length}`,
      sous: 'Tout le monde a le même rôle : recevoir des lives, écrire les '
        + 'rapports, ouvrir des tickets.',
      actions: [h('button', { class: 'b primaire', onclick: () => ouvrirPersonne({}) },
        '＋ Ajouter un technicien')]
    },
    personnes.length
      ? h('div', { class: 's-grille k3' }, ...personnes.map(personne =>
          fiche(personne, chiffres.get(personne.id))))
      : vide({
        ico: '👥',
        titre: 'Aucune personne enregistrée',
        texte: 'Commencez par ajouter les techniciens de live qui suivront les séances.',
        action: h('button', { class: 'b primaire', onclick: () => ouvrirPersonne({}) },
          '＋ Ajouter un technicien')
      })),
    carte({
      titre: 'Dernières actions',
      sous: 'Qui a fait quoi, et quand.',
      actions: [h('button', { class: 'b petit', onclick: () => aller('rapports') },
        'Voir les rapports')]
    },
    tableau({
      colonnes: [{ titre: 'Quand', largeur: '170px' }, { titre: 'Qui', largeur: '190px' },
        { titre: 'Action' }, { titre: 'Détail' }],
      lignes: journal,
      rendu: (ligne) => [
        h('span', { class: 'discret' }, momentDe(ligne.quand)),
        ligne.qui || '—',
        h('span', { class: 'principal' }, ligne.action),
        h('span', { class: 'discret' },
          [ligne.cible, ligne.detail].filter(Boolean).join(' · ') || '—')
      ],
      message: vide({ ico: '📋', titre: 'Journal vide' })
    }))
  ]
}

function fiche (personne, chiffres) {
  const moi = etat.moi === personne.id
  return h('div', {
    class: 's-carte',
    style: { padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }
  },
  h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
    pastille(personne, 'grand'),
    h('div', { style: { flex: '1', minWidth: '0' } },
      h('b', { style: { fontSize: '15px' } }, personne.nom),
      h('div', { style: { fontSize: '12.5px', color: 'var(--muted)' } },
        personne.fonction || CONST.fonction)),
    moi ? badge('vous', 'accent') : null,
    personne.actif ? null : badge('inactif', 'muted')),
  personne.email || personne.telephone
    ? h('div', { style: { fontSize: '12.5px', color: 'var(--muted)' } },
        [personne.email, personne.telephone].filter(Boolean).join(' · '))
    : null,
  chiffresLisibles(chiffres),
  h('div', { class: 'b-groupe', style: { marginTop: 'auto' } },
    moi
      ? null
      : h('button', {
          class: 'b petit',
          onclick: () => { definirMoi(personne.id); rafraichir() }
        }, 'Se mettre à sa place'),
    boutonIco('✏️', 'Modifier', () => ouvrirPersonne({ personne })),
    boutonIco('🗑', 'Supprimer', () => supprimerPersonne(personne), 'danger')))
}

/** Un taux n'a de sens que si la personne a eu des séances à suivre. */
function chiffresLisibles (chiffres) {
  if (!chiffres) return null
  if (!chiffres.lives) {
    return h('div', { style: { fontSize: '12.5px', color: 'var(--muted)' } },
      'Aucune séance à suivre sur les 30 derniers jours')
  }
  return h('div', {},
    h('div', { style: { display: 'flex', fontSize: '12.5px', marginBottom: '6px' } },
      h('span', { style: { color: 'var(--muted)' } },
        `${chiffres.rapports}/${chiffres.lives} séance(s) couverte(s)`),
      h('b', { style: { marginLeft: 'auto' } }, chiffres.taux + ' %')),
    barreProgres(chiffres.taux, `var(--${chiffres.taux >= 90 ? 'ok' : 'warn'})`))
}

export function ouvrirPersonne ({ personne = null, apres = null } = {}) {
  const modif = !!personne
  const base = personne || {
    nom: '', email: '', telephone: '', actif: 1,
    // une couleur qui n'est pas déjà prise, pour distinguer les pastilles
    couleur: CONST.couleurs.find(c => !etat.personnes.some(p => p.couleur === c)) ||
      CONST.couleurs[etat.personnes.length % CONST.couleurs.length]
  }
  const refs = {}
  const couleur = { valeur: base.couleur }

  const pastilles = CONST.couleurs.map(teinte => {
    const bouton = h('button', {
      type: 'button',
      style: {
        width: '28px', height: '28px', borderRadius: '50%', cursor: 'pointer',
        background: teinte,
        border: teinte === couleur.valeur ? '3px solid var(--text)' : '2px solid var(--line)'
      },
      title: teinte,
      onclick: () => {
        couleur.valeur = teinte
        pastilles.forEach((autre, index) => {
          autre.style.border = CONST.couleurs[index] === teinte
            ? '3px solid var(--text)' : '2px solid var(--line)'
        })
      }
    })
    return bouton
  })

  modale({
    titre: modif ? 'Modifier la fiche' : 'Nouveau technicien de live',
    sous: modif ? personne.nom
      : 'Il apparaîtra dans le planning et pourra écrire des rapports.',
    largeur: 'etroite',
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
      champTexte(refs, 'nom', 'Nom complet', {
        valeur: base.nom, obligatoire: true, exemple: 'Ex. Ahmed Benali'
      }),
      champTexte(refs, 'email', 'E-mail', {
        type: 'email', valeur: base.email, optionnel: true
      }),
      champTexte(refs, 'telephone', 'Téléphone', {
        valeur: base.telephone, optionnel: true
      }),
      h('div', { class: 's-champ' },
        h('label', {}, 'Couleur'),
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, ...pastilles))),
    actions: (fermer) => [
      modif
        ? h('button', {
            class: 'b danger',
            onclick: () => { fermer(); supprimerPersonne(personne) }
          }, '🗑 Supprimer')
        : null,
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: async (e) => {
            e.target.disabled = true
            const donnees = { ...valeurs(refs), couleur: couleur.valeur }
            const fait = await essayer(
              () => modif ? api.patch(`/personnes/${personne.id}`, donnees)
                : api.post('/personnes', donnees),
              modif ? 'Fiche modifiée.' : 'Personne ajoutée.')
            e.target.disabled = false
            if (!fait) return
            await chargerPersonnes()
            fermer()
            if (apres) apres(fait); else rafraichir()
          }
        }, modif ? 'Enregistrer' : 'Ajouter'))
    ]
  })
}

export function supprimerPersonne (personne) {
  confirmer({
    titre: `Supprimer ${personne.nom} ?`,
    texte: 'Ses lives redeviennent « à attribuer » et ses rapports gardent son '
      + 'nom. Cette fiche disparaît des listes.',
    surOui: async () => {
      const fait = await essayer(() => api.del(`/personnes/${personne.id}`),
        'Personne supprimée.')
      if (!fait) return
      await chargerPersonnes()
      rafraichir()
    }
  })
}
