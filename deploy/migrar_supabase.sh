#!/usr/bin/env bash
# ============================================================
# Migra a base do Supabase para o Postgres local da VPS.
#
# Uso:
#   SUPABASE_URL='postgresql://postgres.<REF>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres' \
#     ./deploy/migrar_supabase.sh
#
# IMPORTANTE: use o SESSION POOLER (porta 5432). O transaction
# pooler (6543) nao suporta pg_dump/catalog queries.
# ============================================================
set -euo pipefail

SUPABASE_URL="${SUPABASE_URL:?Defina SUPABASE_URL com a connection string do Supabase (porta 5432)}"
LOCAL_DB="${LOCAL_DB:-raio_x}"
LOCAL_USER="${LOCAL_USER:-postgres}"
DUMP_FILE="${DUMP_FILE:-/tmp/seminovos_supabase.dump}"

echo "==> 1/3 Extraindo dump do Supabase (schema public)..."
pg_dump "$SUPABASE_URL" \
  --schema=public --no-owner --no-privileges \
  --format=custom --file="$DUMP_FILE"

echo "==> 2/3 Garantindo banco local '$LOCAL_DB'..."
createdb -U "$LOCAL_USER" "$LOCAL_DB" 2>/dev/null || echo "    banco ja existe, seguindo"

echo "==> 3/3 Restaurando no Postgres local..."
pg_restore -U "$LOCAL_USER" -d "$LOCAL_DB" --no-owner --no-privileges "$DUMP_FILE"

echo "==> Concluido. Verificando:"
psql -U "$LOCAL_USER" -d "$LOCAL_DB" -c \
  "SELECT fornecedora, COUNT(*), MAX(data_referencia) AS ultima_data FROM veiculos GROUP BY fornecedora;"
