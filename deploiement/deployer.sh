#!/usr/bin/env bash
# Installe l'Espace technique sur un serveur Ubuntu/Debian, derriere un
# domaine, en HTTPS.
#
#   sudo bash deployer.sh espace.mondomaine.tn
#
# Ce que fait ce script, dans l'ordre :
#   1. installe ce qu'il faut (Python, Caddy) ;
#   2. recupere le code depuis GitHub dans /opt/espace-technique ;
#   3. pose les dependances dans un environnement isole ;
#   4. installe la base si vous avez depose suivi.db a cote de ce script ;
#   5. declare un service qui redemarre tout seul au reboot ;
#   6. met Caddy devant, qui obtient le certificat HTTPS tout seul.
#
# Relancer ce script met simplement le site a jour : les donnees ne sont
# jamais touchees.

set -euo pipefail

DOMAINE="${1:-}"
DEPOT="https://github.com/waelbenarfi/pdf-2up-studio.git"
RACINE="/opt/espace-technique"
DONNEES="/var/lib/espace-technique"
UTILISATEUR="espace"
ICI="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$DOMAINE" ]; then
  echo "Donnez le domaine : sudo bash deployer.sh espace.mondomaine.tn" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "A lancer avec sudo." >&2
  exit 1
fi

echo "== 1/6  paquets"
apt-get update -qq
apt-get install -y -qq python3 python3-venv python3-pip git curl \
  debian-keyring debian-archive-keyring apt-transport-https
if ! command -v caddy > /dev/null; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi

echo "== 2/6  code"
id -u "$UTILISATEUR" > /dev/null 2>&1 || useradd --system --home "$RACINE" "$UTILISATEUR"
if [ -d "$RACINE/.git" ]; then
  git -C "$RACINE" fetch --quiet origin main
  git -C "$RACINE" reset --hard --quiet origin/main
else
  git clone --quiet "$DEPOT" "$RACINE"
fi

echo "== 3/6  dependances"
python3 -m venv "$RACINE/venv"
"$RACINE/venv/bin/pip" install --quiet --upgrade pip
"$RACINE/venv/bin/pip" install --quiet -r "$RACINE/requirements.txt" gunicorn

echo "== 4/6  donnees"
mkdir -p "$DONNEES"
if [ -f "$ICI/suivi.db" ] && [ ! -f "$DONNEES/suivi.db" ]; then
  cp "$ICI/suivi.db" "$DONNEES/suivi.db"
  echo "   base reprise depuis $ICI/suivi.db"
elif [ -f "$DONNEES/suivi.db" ]; then
  echo "   base deja en place, laissee telle quelle"
else
  echo "   base neuve : le site demandera de creer le premier compte"
fi
chown -R "$UTILISATEUR:$UTILISATEUR" "$RACINE" "$DONNEES"

echo "== 5/6  service"
cat > /etc/systemd/system/espace-technique.service <<SERVICE
[Unit]
Description=Espace technique - Wael Academy
After=network.target

[Service]
User=$UTILISATEUR
WorkingDirectory=$RACINE
Environment="SUIVI_DONNEES=$DONNEES"
Environment="SUIVI_HTTPS=1"
ExecStart=$RACINE/venv/bin/gunicorn --workers 2 --threads 4 \\
  --bind 127.0.0.1:8000 --timeout 120 app:app
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
SERVICE
systemctl daemon-reload
systemctl enable --quiet espace-technique
systemctl restart espace-technique

echo "== 6/6  domaine et HTTPS"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAINE {
    reverse_proxy 127.0.0.1:8000
    encode gzip
    request_body {
        max_size 60MB
    }
}
CADDY
systemctl reload caddy || systemctl restart caddy

sleep 3
echo
if systemctl is-active --quiet espace-technique; then
  echo "Service : en marche."
else
  echo "Service : ARRETE. Voir  journalctl -u espace-technique -n 40"
fi
echo "Site    : https://$DOMAINE/operations"
echo "Donnees : $DONNEES/suivi.db"
echo
echo "Sauvegarde conseillee, une ligne dans crontab -e :"
echo "  0 3 * * * sqlite3 $DONNEES/suivi.db \".backup '$DONNEES/sauvegarde-\\\$(date +\\%F).db'\""
