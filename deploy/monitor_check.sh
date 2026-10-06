#!/usr/bin/env bash
# ============================================================
# Monitor diario do raio-x seminovos (rodar no host da VPS).
# Verifica: (1) dados de hoje no banco, (2) dashboard no ar.
# Envia push via ntfy.sh (NTFY_TOPIC no deploy/.env) em caso
# de FALHA, e um resumo OK diário como heartbeat.
#
# Uso: NTFY_TOPIC=raiox-xxxx ./monitor_check.sh
# Cron: 30 6 * * * root cd /opt/raio-x/deploy && set -a && . ./.env && set +a && ./monitor_check.sh >> /var/log/raio-x/monitor.log 2>&1
# ============================================================
set -uo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/raio-x/deploy}"
cd "$COMPOSE_DIR" || exit 1
[ -f .env ] && { set -a; . ./.env; set +a; }

HOJE="$(date +%F)"
falhas=()

# 1) Dados de hoje no banco (pipeline rodou?)
HOJE_ROWS="$(docker exec deploy-db-1 psql -U raio_x -d raio_x -tAc \
  "select count(*) from veiculos where data_referencia::date = current_date" 2>&1)"
if [ "${HOJE_ROWS:-0}" -eq 0 ] 2>/dev/null; then
  falhas+=("pipeline: 0 veiculos inseridos hoje (${HOJE_ROWS:-erro psql: ${HOJE_ROWS:0:120}})")
fi

# 2) Dashboard respondendo localmente
HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:3000/ 2>/dev/null)"
if [ "$HTTP_CODE" != "200" ]; then
  falhas+=("dashboard: HTTP ${HTTP_CODE:-sem resposta} em 127.0.0.1:3000")
fi

# Notificacao via ntfy (push no celular/navegador)
notif() {
  [ -n "${NTFY_TOPIC:-}" ] || return 0
  curl -s --max-time 10 -H "Title: Raio-X Seminovos" -d "$1" "https://ntfy.sh/${NTFY_TOPIC}" >/dev/null 2>&1
}

if [ "${#falhas[@]}" -gt 0 ]; then
  msg="FALHA em $(date '+%F %H:%M'):
${falhas[*]}

  Corrigir: ssh root@$(hostname) -> docker compose -f docker-compose.yml -f docker-compose.traefik.yml ps
  Logs: docker logs raio-x-pipeline --tail 50"
  echo "$msg"
  notif "$msg"
  exit 1
fi

msg="OK $(date '+%F %H:%M') — pipeline e dashboard saudaveis. Veiculos de hoje: ${HOJE_ROWS}."
echo "$msg"
notif "$msg"
