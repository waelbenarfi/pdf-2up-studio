// L'equipe : qui peut etre responsable d'un live, demandeur d'un ticket,
// auteur d'un rapport. Ajout, modification et suppression libres.

import {
  CONST, api, etat, h, essayer, rafraichir, remplir, chargerPersonnes, ilYA,
  momentDe, aller, toast
} from '../noyau.js'
import {
  carte, vide, tableau, modale, confirmer, champTexte, valeurs, libelleDispo,
  badge, pastille, boutonIco, barreProgres, info
} from '../ui.js'
import { ico } from '../icones.js'

export async function vueEquipe () {
  // « Dernières actions » est le relevé de toute l'équipe : seul
  // l'administrateur le demande, et le serveur refuse aux autres.
  const [personnes, bord, journal] = await Promise.all([
    api.get('/personnes'),
    api.get('/tableau'),
    etat.admin ? api.get('/journal', { limite: 25 }) : Promise.resolve(null)
  ])
  const chiffres = new Map(bord.equipe.map(item => [item.id, item]))
  const sansMdp = personnes.filter(p => p.actif && !p.aMotDePasse)

  return [
    etat.admin && sansMdp.length
      ? info(`${sansMdp.length} membre(s) n'ont pas encore d'accès et ne `
        + 'peuvent donc pas se connecter : '
        + sansMdp.map(p => p.nom).join(', ') + '.')
      : null,
    carte({
      titre: `Équipe · ${personnes.length}`,
      sous: etat.admin
        ? 'Vous êtes administrateur : vous créez les comptes et posez les '
          + 'mots de passe.'
        : 'Seul l’administrateur peut ajouter ou modifier un membre.',
      actions: etat.admin
        ? [h('button', { class: 'b primaire', onclick: () => ouvrirPersonne({}) },
          ico('plus', 15), 'Ajouter un membre')]
        : []
    },
    personnes.length
      ? h('div', { class: 's-grille k3' }, ...personnes.map(personne =>
          fiche(personne, chiffres.get(personne.id))))
      : vide({
        dessin: 'equipe',
        titre: 'Aucune personne enregistrée',
        texte: 'Commencez par ajouter les techniciens de live qui suivront les séances.',
        action: etat.admin
          ? h('button', { class: 'b primaire', onclick: () => ouvrirPersonne({}) },
            ico('plus', 15), 'Ajouter un membre')
          : null
      })),
    journal
      ? carte({
        titre: 'Dernières actions',
        sous: 'Qui a fait quoi, et quand · visible de l’administrateur seul',
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
        message: vide({ dessin: 'liste', titre: 'Journal vide' })
      }))
      : null
  ]
}

const roleDe = (cle) => (CONST.roles || []).find(r => r.cle === cle)
  || { libelle: cle, ton: 'muted' }

/** « Employé du mois · Août 2026 », ou le compte s'il y en a plusieurs. */
function titreLisible (personne) {
  const [annee, numero] = String(personne.titre_mois || '').split('-')
  const mois = (CONST.mois || [])[Number(numero) - 1]
  if (personne.titres > 1) return `employé du mois × ${personne.titres}`
  return mois ? `employé du mois · ${mois} ${annee}` : 'employé du mois'
}

function fiche (personne, chiffres) {
  const moi = etat.moi === personne.id
  const role = roleDe(personne.role)
  const peutToucher = etat.admin || moi
  return h('div', {
    class: 's-carte',
    style: { padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }
  },
  h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } },
    pastille(personne, 'grand'),
    h('div', { style: { flex: '1', minWidth: '0' } },
      h('b', { style: { fontSize: '15px' } }, personne.nom),
      // le rôle, et non « Technicien de live » pour tout le monde : la fiche
      // de l'administrateur se contredisait elle-même
      h('div', {
        class: 'piece',
        style: { fontSize: '12.5px', color: 'var(--muted)' }
      },
      ico(personne.role === 'admin' ? 'bouclier' : 'equipe', 13),
      role.libelle)),
    moi ? badge('vous', 'accent') : null,
    personne.actif ? null : badge('inactif', 'muted'),
    libelleDispo(personne)
      ? badge(libelleDispo(personne), 'info', ico('horloge', 11))
      : null),
  h('div', { class: 'b-groupe' },
    personne.aMotDePasse
      ? badge('peut se connecter', 'ok', ico('cadenas', 12))
      : badge('accès à créer', 'warn', ico('cadenas_ouvert', 12)),
    // une distinction se porte : elle doit se voir sur la fiche, pas
    // seulement au fond de l'écran Performance
    personne.titre_mois
      ? badge(titreLisible(personne), 'accent', ico('bouclier', 12))
      : null),
  personne.email || personne.telephone
    ? h('div', { style: { fontSize: '12.5px', color: 'var(--muted)' } },
        [personne.email, personne.telephone].filter(Boolean).join(' · '))
    : null,
  personne.derniere
    ? h('div', { style: { fontSize: '12px', color: 'var(--muted)' } },
      `Dernière connexion ${ilYA(personne.derniere)}`)
    : null,
  chiffresLisibles(chiffres),
  h('div', { class: 'b-groupe', style: { marginTop: 'auto' } },
    peutToucher
      ? h('button', {
        class: 'b petit',
        onclick: () => ouvrirMotDePasse({ personne, soiMeme: moi })
      }, ico('cle', 14), personne.aMotDePasse ? 'Mot de passe' : 'Créer l’accès')
      : null,
    etat.admin && !moi
      ? boutonIco(ico('bouclier'),
        personne.role === 'admin' ? 'Retirer l’administration' : 'Nommer administrateur',
        () => basculerRole(personne))
      : null,
    peutToucher
      ? boutonIco(ico('crayon'), 'Modifier', () => ouvrirPersonne({ personne }))
      : null,
    etat.admin && !moi
      ? boutonIco(ico('corbeille'), 'Supprimer',
        () => supprimerPersonne(personne), 'danger')
      : null))
}

/* ------------------------------------------------------- mots de passe */
/**
 * L'administrateur pose le mot de passe d'un membre ; chacun change le sien
 * en donnant l'actuel — sans quoi un poste resté ouvert suffirait à
 * verrouiller quelqu'un hors de son propre compte.
 */
export function ouvrirMotDePasse ({ personne, soiMeme = false }) {
  const refs = {}
  const mien = soiMeme && !etat.admin
  const corps = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
    mien
      ? champTexte(refs, 'actuel', 'Mot de passe actuel',
        { type: 'password', obligatoire: true })
      : null,
    champTexte(refs, 'mdp', 'Nouveau mot de passe', {
      type: 'password', obligatoire: true,
      aide: `${CONST.mdpMin || 8} caractères au minimum`
    }),
    champTexte(refs, 'mdp2', 'Confirmer', { type: 'password', obligatoire: true }),
    soiMeme
      ? null
      : info('Transmettez ce mot de passe à ' + personne.nom + ' de vive voix. '
        + 'Il ou elle pourra le changer ensuite depuis son propre menu.'))

  modale({
    titre: personne.aMotDePasse ? 'Changer le mot de passe' : 'Créer l’accès',
    sous: personne.nom,
    largeur: 'etroite',
    corps,
    actions: (fermer) => [
      etat.admin && !soiMeme && personne.aMotDePasse
        ? h('button', {
          class: 'b danger',
          onclick: () => { fermer(); retirerAcces(personne) }
        }, 'Retirer l’accès')
        : null,
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: async (e) => {
            const v = valeurs(refs)
            if (v.mdp !== v.mdp2) {
              toast('Les deux mots de passe diffèrent.', 'err')
              return
            }
            e.target.disabled = true
            const fait = await essayer(
              () => api.post(`/personnes/${personne.id}/mdp`,
                { mdp: v.mdp, actuel: v.actuel || '' }),
              'Mot de passe enregistré.')
            e.target.disabled = false
            if (!fait) return
            fermer()
            await chargerPersonnes()
            rafraichir()
          }
        }, 'Enregistrer'))
    ]
  })
}

function retirerAcces (personne) {
  confirmer({
    titre: 'Retirer l’accès ?',
    texte: `${personne.nom} ne pourra plus se connecter tant qu'un nouveau `
      + 'mot de passe ne lui aura pas été donné. Ses rapports et ses séances '
      + 'restent intacts.',
    bouton: 'Retirer l’accès',
    surOui: async () => {
      await essayer(() => api.del(`/personnes/${personne.id}/mdp`),
        'Accès retiré.')
      await chargerPersonnes()
      rafraichir()
    }
  })
}

function basculerRole (personne) {
  const vers = personne.role === 'admin' ? 'technicien' : 'admin'
  confirmer({
    titre: vers === 'admin' ? 'Nommer administrateur ?' : 'Retirer l’administration ?',
    texte: vers === 'admin'
      ? `${personne.nom} pourra gérer l'équipe, poser les mots de passe, `
        + 'supprimer des séances et des rapports.'
      : `${personne.nom} redeviendra technicien de live et perdra la gestion `
        + 'de l’équipe.',
    bouton: vers === 'admin' ? 'Nommer' : 'Retirer',
    surOui: async () => {
      await essayer(() => api.post(`/personnes/${personne.id}/role`, { role: vers }),
        'Rôle modifié.')
      await chargerPersonnes()
      rafraichir()
    }
  })
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
    nom: '', email: '', telephone: '', actif: 1, heure_min: '', jours: [],
    max_soir: '',
    // une couleur qui n'est pas déjà prise, pour distinguer les pastilles
    couleur: CONST.couleurs.find(c => !etat.personnes.some(p => p.couleur === c)) ||
      CONST.couleurs[etat.personnes.length % CONST.couleurs.length]
  }
  const refs = {}
  const couleur = { valeur: base.couleur }
  // La disponibilité : elle ne verrouille rien, elle guide la répartition
  // automatique. L'administrateur garde la main pour attribuer à qui il veut.
  const jours = new Set(base.jours || [])
  const listeJours = h('div', { class: 's-choix-equipe' })
  const dessinerJours = () => remplir(listeJours,
    ...CONST.jours.map((nom, i) => h('button', {
      type: 'button', class: `s-choix-qui ${jours.has(i) ? 'pris' : ''}`,
      onclick: () => {
        if (jours.has(i)) jours.delete(i); else jours.add(i)
        dessinerJours()
      }
    },
    h('span', { class: 'case' }, jours.has(i) ? ico('coche', 13) : null),
    h('span', {}, nom))))
  dessinerJours()

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
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, ...pastilles)),
      h('div', { class: 's-lignes d2' },
        champTexte(refs, 'heure_min', 'Pas de séance avant', {
          type: 'time', valeur: base.heure_min || '', optionnel: true,
          aide: 'Laissez vide si toutes les heures conviennent'
        }),
        champTexte(refs, 'max_soir', 'Au plus, par soir', {
          type: 'number', min: '1', valeur: base.max_soir ?? '',
          optionnel: true,
          aide: 'Vide = sa part entière, comme les autres'
        })),
      h('div', { class: 's-champ' },
        h('label', {}, 'Jours possibles ',
          h('span', { class: 'opt' }, '(rien de coché = tous les jours)')),
        listeJours,
        h('span', { class: 'aide' },
          'Sert à la répartition automatique ; l’administrateur peut '
          + 'toujours attribuer une séance à la main.'))),
    actions: (fermer) => [
      modif
        ? h('button', {
            class: 'b danger',
            onclick: () => { fermer(); supprimerPersonne(personne) }
          }, ico('corbeille', 15), 'Supprimer')
        : null,
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: async (e) => {
            e.target.disabled = true
            const donnees = {
              ...valeurs(refs),
              couleur: couleur.valeur,
              jours: [...jours].sort((a, b) => a - b)
            }
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
