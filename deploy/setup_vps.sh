#!/usr/bin/env bash
# ============================================================
# Provisionamento da VPS (Ubuntu 22.04/24.04) para o raio-x seminovos.
# Executar como root, com o repositorio ja clonado em /opt/raio-x:
#
#   git clone https://github.com/gpappetti/seminovos-scraper.git /opt/raio-x
#   cd /opt/raio-x && sudo bash deploy/setup_vps.sh
#
# Etapas: pacotes -> Postgres -> .env -> schema -> venv do scraper
#         -> build do app -> servicos systemd -> cron
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/raio-x}"
DB_NAME="${DB_NAME:-raio_x}"
DB_USER="${DB_USER:-raio_x}"
DB_PASS="${DB_PASS:-$(openssl rand -hex 16)}"
RUN_USER="${RUN_USER:-app}"
APP_PORT="${APP_PORT:-3000}"

echo "==> 1/8 Pacotes base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y postgresql postgresql-contrib python3-venv python3-pip curl
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
corepack enable || true

echo "==> 2/8 Usuario de servico"
id -u "$RUN_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /bin/bash "$RUN_USER"

echo "==> 3/8 Postgres: usuario e banco"
systemctl enable --now postgresql
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}';
  END IF;
END \$\$;
SQL
sudo -u postgres createdb -O "$DB_USER" "$DB_NAME" 2>/dev/null || echo "    banco ${DB_NAME} ja existe"

echo "==> 4/8 Arquivos .env"
cat > "$APP_DIR/.env" <<ENV
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
NEXTAUTH_URL=http://localhost:${APP_PORT}
ENV
cp "$APP_DIR/.env" "$APP_DIR/scraper/db/.env"
chown "$RUN_USER:$RUN_USER" "$APP_DIR/.env" "$APP_DIR/scraper/db/.env"
chmod 600 "$APP_DIR/.env" "$APP_DIR/scraper/db/.env"

echo "==> 5/8 Schema (veiculos + tabelas de cache)"
sudo -u postgres psql -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -f "$APP_DIR/scraper/db/schema.sql" \
  -f "$APP_DIR/deploy/sql/02_cache_tables.sql"

echo "==> 6/8 Ambiente Python do scraper"
cd "$APP_DIR/scraper"
sudo -u "$RUN_USER" python3 -m venv .venv
sudo -u "$RUN_USER" .venv/bin/pip install --upgrade pip
sudo -u "$RUN_USER" .venv/bin/pip install -r requirements.txt
sudo -u "$RUN_USER" mkdir -p data /var/log/raio-x

echo "==> 7/8 Build do dashboard (Next.js)"
cd "$APP_DIR"
sudo -u "$RUN_USER" env PATH="/usr/local/bin:/usr/bin:/bin:$PATH" corepack yarn install
sudo -u "$RUN_USER" env PATH="/usr/local/bin:/usr/bin:/bin:$PATH" corepack yarn build

echo "==> 8/8 Servico systemd + cron"
cat > /etc/systemd/system/raio-x.service <<UNIT
[Unit]
Description=Raio-X Seminovos (dashboard Next.js)
After=network.target postgresql.service
Requires=postgresql.service

[Service]
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${APP_DIR}/node_modules/.bin/next start -p ${APP_PORT}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now raio-x

cp "$APP_DIR/deploy/crontab" /etc/cron.d/raio-x
chmod 644 /etc/cron.d/raio-x

echo
echo "============================================================"
echo " Instalacao concluida."
echo " Dashboard: http://$(hostname -I | awk '{print $1}'):${APP_PORT}"
echo " Senha do banco (${DB_USER}): ${DB_PASS}  (salva em ${APP_DIR}/.env)"
echo
echo " Migrar a base do Supabase (opcional):"
echo "   SUPABASE_URL='postgresql://postgres.<REF>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres' \\"
echo "     bash $APP_DIR/deploy/migrar_supabase.sh"
echo "============================================================"
