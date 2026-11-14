#!/usr/bin/env bash
# Despliega Surco al CT 138 de prox: compila la web y sube web + API. No toca las bases del servidor (cache.sqlite, expedientes.sqlite).
# Uso: bash desplegar.sh
set -euo pipefail
cd "$(dirname "$0")"
(cd web && npm run build >/dev/null)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
tar czf "$T/web.tgz" -C web/dist .
# la API sale del último commit, no del árbol de trabajo: lo que corre en el servidor siempre tiene su commit
git archive HEAD:api --format=tar.gz -o "$T/api.tgz"
[ -z "$(git status --short web)" ] || echo "ojo: web/ tiene cambios sin commit y se van igual"
scp -q "$T/web.tgz" "$T/api.tgz" servidor/surco-api.service servidor/nginx-surco.conf prox:/tmp/
ssh prox 'set -e
for f in web.tgz api.tgz surco-api.service nginx-surco.conf; do pct push 138 /tmp/$f /tmp/$f; rm -f /tmp/$f; done
pct exec 138 -- bash -ec "
rm -rf /var/www/surco.nuevo && mkdir -p /var/www/surco.nuevo && tar xzf /tmp/web.tgz -C /var/www/surco.nuevo
rm -rf /var/www/surco.viejo; [ -d /var/www/surco ] && mv /var/www/surco /var/www/surco.viejo; mv /var/www/surco.nuevo /var/www/surco
mkdir -p /opt/surco/api && tar xzf /tmp/api.tgz -C /opt/surco/api && chown -R surco:surco /opt/surco
install -m 644 /tmp/surco-api.service /etc/systemd/system/surco-api.service
install -m 644 /tmp/nginx-surco.conf /etc/nginx/sites-available/surco && ln -sf /etc/nginx/sites-available/surco /etc/nginx/sites-enabled/surco && rm -f /etc/nginx/sites-enabled/default
rm -f /tmp/web.tgz /tmp/api.tgz /tmp/surco-api.service /tmp/nginx-surco.conf
cd /opt/surco/api && runuser -u surco -- /usr/local/bin/uv sync --frozen -q
systemctl daemon-reload && systemctl enable -q surco-api && systemctl restart surco-api && nginx -t -q && systemctl reload nginx
"'
for i in $(seq 1 20); do ssh prox 'pct exec 138 -- curl -sf -o /dev/null http://127.0.0.1/api/expediente/no-existe -w "%{http_code}"' 2>/dev/null | grep -q 404 && { echo "desplegado: API arriba"; exit 0; }; sleep 2; done
echo "la API no respondió; revisar: ssh prox 'pct exec 138 -- journalctl -u surco-api -n 40'"; exit 1
