// Point 6 : l'espace service technique. Ouvrir un ticket, joindre une
// capture ou une video, suivre l'avancement, repondre dans le meme fil.

import {
  CONST, api, etat, h, momentDe, ilYA, duree, essayer, rafraichir, aller,
  personneDe, statutTicketDe, prioriteDe
} from '../noyau.js'
import {
  carte, kpi, vide, modale, confirmer, champTexte, champZone, champListe,
  champPilules, valeurs, zoneFichiers, badge, badgeStatutTicket, badgePriorite,
  pastille, optionsPersonnes, optionsSimples, icoFichier
} from '../ui.js'

export async function vueSupport (params) {
  const tickets = await api.get('/tickets', { q: params.q || '' })
  const par = (cle) => tickets.filter(t => t.statut === cle)
  const resolus = par('resolu').filter(t => t.dureeMin !== null)
  const moyenne = resolus.length
    ? Math.round(resolus.reduce((s, t) => s + t.dureeMin, 0) / resolus.length)
    : 0

  return [
    h('div', { class: 's-grille k4' },
      kpi({ ico: '🆕', nom: 'Nouveaux', valeur: par('nouveau').length, ton: 'info' }),
      kpi({ ico: '🛠', nom: 'En cours', valeur: par('en_cours').length, ton: 'warn' }),
      kpi({ ico: '✅', nom: 'Résolus', valeur: par('resolu').length, ton: 'ok' }),
      kpi({ ico: '⏱', nom: 'Temps moyen de résolution', valeur: duree(moyenne), ton: 'violet' })),
    carte({
      titre: `Tickets · ${tickets.length}`,
      sous: 'Un problème pendant un live ? Ouvrez un ticket, l’équipe répond dans le fil.',
      actions: [
        h('input', {
          class: 's-saisie', type: 'search', dir: 'auto', value: params.q || '',
          placeholder: '🔎  Rechercher…', style: { width: '210px' },
          onchange: (e) => aller('support', { q: e.target.value })
        }),
        h('button', { class: 'b primaire', onclick: () => ouvrirTicket({}) },
          '＋ Nouveau ticket')
      ]
    },
    tickets.length
      ? h('div', { class: 's-kanban' }, ...CONST.statutsTicket.map(statut =>
          colonne(statut, par(statut.cle))))
      : vide({
        ico: '🎫',
        titre: 'Aucun ticket',
        texte: 'Quand une panne de son, de connexion ou de plateforme survient, '
          + 'ouvrez un ticket : le service technique le voit tout de suite.',
        action: h('button', { class: 'b primaire', onclick: () => ouvrirTicket({}) },
          '＋ Ouvrir un ticket')
      }))
  ]
}

function colonne (statut, tickets) {
  return h('div', { class: 's-colonne' },
    h('div', { class: 's-colonne-tete' },
      badgeStatutTicket(statut.cle),
      h('div', { style: { flex: '1' } }),
      badge(String(tickets.length), tickets.length ? 'accent' : 'muted')),
    h('div', { class: 's-colonne-corps' },
      ...tickets.map(ticket => h('div', {
        class: 's-ticket', onclick: () => ouvrirFil(ticket.id)
      },
      h('div', { class: 'meta' },
        h('span', { style: { fontFamily: 'ui-monospace, monospace' } }, ticket.reference),
        badgePriorite(ticket.priorite)),
      h('b', {}, ticket.sujet),
      h('div', { class: 'meta' },
        h('span', {}, ticket.categorie),
        ticket.nbMessages > 1 ? h('span', {}, `💬 ${ticket.nbMessages}`) : null,
        ticket.fichiers.length ? h('span', {}, `📎 ${ticket.fichiers.length}`) : null),
      h('div', { class: 'meta' },
        pastille(personneDe(ticket.demandeur_id), 'mini'),
        h('span', {}, ticket.demandeur_nom || '—'),
        h('span', { style: { marginLeft: 'auto' } }, ilYA(ticket.cree_le))))),
      tickets.length ? null : h('div', { class: 's-colonne-vide' }, 'Rien ici')))
}

/* ------------------------------------------------------- creation / edition */
export function ouvrirTicket ({ ticket = null, live = null, apres = null } = {}) {
  const modif = !!ticket
  const base = ticket || {
    sujet: live ? `Problème pendant « ${live.titre} »` : '',
    description: '', categorie: CONST.categoriesTicket[0],
    priorite: 'moyenne', demandeur_id: etat.moi, assigne_id: null,
    fichiers: []
  }
  const refs = {}
  const zone = zoneFichiers({
    existants: base.fichiers || [],
    surSuppression: async (fichier) => {
      const fait = await essayer(() => api.del(`/fichiers/${fichier.id}`), 'Fichier supprimé.')
      return fait !== null
    }
  })

  const corps = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
    champTexte(refs, 'sujet', 'Sujet', {
      valeur: base.sujet, obligatoire: true,
      exemple: 'Ex. Le micro du studio 2 grésille'
    }),
    champZone(refs, 'description', 'Décrivez le problème', {
      valeur: base.description, lignes: 5, obligatoire: true,
      exemple: 'Ce qui se passe, depuis quand, ce que vous avez déjà essayé.'
    }),
    h('div', { class: 's-lignes d2' },
      champListe(refs, 'categorie', 'Catégorie',
        optionsSimples(CONST.categoriesTicket), { valeur: base.categorie }),
      champListe(refs, 'demandeur_id', 'Demandeur',
        optionsPersonnes(etat.personnes, 'Choisir…'), { valeur: base.demandeur_id ?? '' })),
    champPilules(refs, 'priorite', 'Priorité', CONST.priorites, { valeur: base.priorite }),
    modif
      ? champListe(refs, 'assigne_id', 'Pris en charge par',
          optionsPersonnes(etat.personnes, 'Personne pour l’instant'),
          { valeur: base.assigne_id ?? '' })
      : null,
    h('div', { class: 's-champ' },
      h('label', {}, 'Captures d’écran, photos ou vidéo',
        h('span', { class: 'opt' }, '(optionnel)')),
      zone.noeud))

  modale({
    titre: modif ? `Modifier ${ticket.reference}` : 'Nouveau ticket',
    sous: modif ? ticket.sujet : 'Le service technique reçoit le ticket immédiatement.',
    corps,
    actions: (fermer) => [
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: fermer }, 'Annuler'),
        h('button', {
          class: 'b primaire',
          onclick: async (e) => {
            e.target.disabled = true
            const donnees = valeurs(refs)
            donnees.demandeur_id = donnees.demandeur_id || null
            if ('assigne_id' in donnees) donnees.assigne_id = donnees.assigne_id || null
            const enregistre = await essayer(
              () => modif ? api.patch(`/tickets/${ticket.id}`, donnees)
                : api.post('/tickets', donnees),
              modif ? 'Ticket mis à jour.' : 'Ticket envoyé au service technique.')
            e.target.disabled = false
            if (!enregistre) return
            const attente = zone.nouveaux()
            if (attente.length) {
              await essayer(() => api.envoyer('ticket', enregistre.id, attente),
                `${attente.length} fichier(s) joint(s).`)
            }
            fermer()
            if (apres) apres(enregistre); else rafraichir()
          }
        }, modif ? 'Enregistrer' : 'Envoyer le ticket'))
    ]
  })
}

export function supprimerTicket (ticket) {
  confirmer({
    titre: `Supprimer ${ticket.reference} ?`,
    texte: 'Le ticket, ses réponses et ses pièces jointes seront effacés.',
    surOui: async () => {
      await essayer(() => api.del(`/tickets/${ticket.id}`), 'Ticket supprimé.')
      rafraichir()
    }
  })
}

/* -------------------------------------------------------------- le fil */
export async function ouvrirFil (id) {
  const ticket = await api.get(`/tickets/${id}`)
  const fil = h('div', { class: 's-fil' })
  const refs = {}

  const dessinerFil = (messages) => {
    fil.replaceChildren()
    for (const message of messages) {
      const moi = message.auteur === etat.moiNom
      fil.append(h('div', { class: `s-message ${moi ? 'moi' : ''}` },
        pastille(etat.personnes.find(p => p.nom === message.auteur), 'mini'),
        h('div', {},
          h('div', { class: 'qui' }, `${message.auteur} · ${momentDe(message.cree_le)}`),
          h('div', { class: 'bulle' }, message.texte))))
    }
  }
  dessinerFil(ticket.messages)

  const champReponse = h('textarea', {
    class: 's-saisie', dir: 'auto', rows: 3,
    placeholder: 'Écrire une réponse…'
  })
  refs.reponse = champReponse

  const statuts = h('div', { class: 's-pilules' })
  const dessinerStatuts = (courant) => {
    statuts.replaceChildren()
    for (const statut of CONST.statutsTicket) {
      const actif = statut.cle === courant
      statuts.append(h('button', {
        class: `s-pilule ${actif ? 'pris' : ''}`,
        style: { '--c': `var(--${statut.ton === 'ok' ? 'ok' : statut.ton})` },
        onclick: async () => {
          if (actif) return
          const maj = await essayer(() => api.patch(`/tickets/${id}`, { statut: statut.cle }),
            `Ticket marqué « ${statut.libelle} ».`)
          if (maj) dessinerStatuts(maj.statut)
        }
      }, statut.libelle))
    }
  }
  dessinerStatuts(ticket.statut)

  const priorite = prioriteDe(ticket.priorite)
  const statut = statutTicketDe(ticket.statut)

  modale({
    titre: ticket.sujet,
    sous: `${ticket.reference} · ${ticket.categorie} · ouvert ${ilYA(ticket.cree_le)}`
      + ` par ${ticket.demandeur_nom || '—'}`,
    largeur: 'large',
    corps: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        badge(statut.libelle, statut.ton), badge('Priorité ' + priorite.libelle.toLowerCase(), priorite.ton),
        ticket.assigne_id ? badge('Suivi par ' + personneDe(ticket.assigne_id)?.nom, 'accent') : null,
        ticket.dureeMin !== null ? badge('résolu en ' + duree(ticket.dureeMin), 'ok') : null),
      h('div', { class: 's-bloc' },
        h('span', { class: 'titre' }, 'Avancement'),
        statuts),
      ticket.fichiers.length
        ? h('div', { class: 's-champ' },
            h('label', {}, `Pièces jointes (${ticket.fichiers.length})`),
            h('div', { class: 's-fichiers' }, ...ticket.fichiers.map(fichier =>
              h('a', {
                class: 's-fichier', target: '_blank', rel: 'noopener',
                href: `/api/suivi/fichier?chemin=${encodeURIComponent(fichier.chemin)}`,
                style: { textDecoration: 'none', color: 'inherit' }
              }, h('span', {}, icoFichier(fichier.nom)),
              h('span', { class: 'nom' }, fichier.nom)))))
        : null,
      h('div', { class: 's-sep' }),
      fil,
      h('div', { class: 's-champ' },
        h('label', {}, 'Répondre'),
        champReponse,
        h('div', { class: 'b-groupe', style: { marginTop: '8px' } },
          h('button', {
            class: 'b primaire',
            onclick: async (e) => {
              const texte = champReponse.value.trim()
              if (!texte) return
              e.target.disabled = true
              const maj = await essayer(() => api.post(`/tickets/${id}/messages`, { texte }))
              e.target.disabled = false
              if (!maj) return
              champReponse.value = ''
              dessinerFil(maj.messages)
              dessinerStatuts(maj.statut)
            }
          }, 'Envoyer'),
          etat.moiNom
            ? h('span', { class: 'aide', style: { alignSelf: 'center', color: 'var(--muted)', fontSize: '12px' } },
                `Vous écrivez en tant que ${etat.moiNom}.`)
            : null))),
    actions: (fermer) => [
      h('button', {
        class: 'b danger',
        onclick: () => { fermer(); supprimerTicket(ticket) }
      }, '🗑 Supprimer'),
      h('div', { class: 'droite' },
        h('button', { class: 'b', onclick: () => { fermer(); rafraichir() } }, 'Fermer'),
        h('button', {
          class: 'b primaire',
          onclick: () => { fermer(); ouvrirTicket({ ticket }) }
        }, '✏️ Modifier'))
    ]
  })
}
