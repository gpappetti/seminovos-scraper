# Raio-X Seminovos

Dashboard de análise do mercado de veículos seminovos das locadoras
(**Localiza** e **Movida**), alimentado diariamente por um motor de
coleta próprio.

```
┌─────────────────────────────┐      ┌──────────────────────────────┐
│  scraper/  (Python)         │      │  raiz  (Next.js 16 + React)  │
│  run_daily.py               │      │  app/api: evolucao, fipe,    │
│  ├─ scrape_localiza.py      ├─────▶│  mix-frota, pulso, vendidos  │
│  ├─ scrape_movida.py        │ SQL  │  UI: gráficos e métricas     │
│  └─ db/populate_db.py       │      │  lib/db.ts (pg Pool)         │
└──────────────┬──────────────┘      └───────────────┬──────────────┘
               │            PostgreSQL                │
               └──────────── veiculos ────────────────┘
                    + fipe_cache, vendidos_cache,
                      top_vendidos_cache (caches do dashboard)
```

- **`scraper/`** — motor de ingestão: coleta os anúncios diários das
  locadoras, normaliza (preço, odômetro, ano, cidade/UF, bug LONGITUDE,
  ONIX/ONIX PLUS) e grava na tabela `veiculos` (modelo point-in-time:
  uma linha por veículo por dia).
- **raiz** — dashboard **raio-x seminovos**: lê `veiculos`, mantém
  caches próprios e integra a API FIPE (Parallelum) com cache local.

## Estrutura

```
├── app/, components/, lib/, hooks/   dashboard (Next.js)
├── scraper/                          motor de ingestão (Python)
│   ├── src/                          scrapers + orquestrador diário
│   ├── db/                           schema.sql, populate_db.py, .env
│   └── docs/                         guias e queries de exemplo
├── deploy/                           VPS: setup, migração, cron, docker
└── deploy/sql/02_cache_tables.sql    DDL das tabelas de cache
```

## Variáveis de ambiente

| Variável | Onde | Uso |
|---|---|---|
| `DATABASE_URL` | `.env` (raiz) e `scraper/db/.env` | Conexão PostgreSQL — compartilhada por dashboard e scraper |
| `NEXTAUTH_URL` | `.env` (raiz) | URL pública do dashboard |

Exemplos em `.env.example` (raiz) e `scraper/db/.env.example`.

## Subir na VPS (Ubuntu)

**Caminho 1 — script (systemd + Postgres local):**
```bash
git clone https://github.com/gpappetti/seminovos-scraper.git /opt/raio-x
cd /opt/raio-x && sudo bash deploy/setup_vps.sh
```
O script instala Postgres + Node + Python, cria banco/usuário, aplica o
schema, faz o build do dashboard, instala o serviço systemd e a
rotina diária no cron (06:00).

**Caminho 2 — Docker:**
```bash
echo "POSTGRES_PASSWORD=uma_senha_forte" > deploy/.env
docker compose -f deploy/docker-compose.yml up -d --build
```

**Migração da base existente no Supabase** (opcional, uma vez):
```bash
SUPABASE_URL='postgresql://postgres.<REF>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres' \
  bash deploy/migrar_supabase.sh
```
Use a porta **5432** (session pooler); a 6543 não suporta `pg_dump`.

## Operação

- Pipeline diário: `cd scraper && python src/run_daily.py --no-email`
  (ou `--no-db` para gerar só os parquets). Agendado no cron pelo setup.
- Logs: `/var/log/raio-x/pipeline.log` · Serviço: `systemctl status raio-x`
- Backup mensal automático do banco em `/var/backups/raio-x/`.
- Segurança: Postgres fica escutando apenas em localhost; exponha o
  dashboard atrás de nginx + TLS ou via VPN (Tailscale/WireGuard).

## Desenvolvimento local

```bash
# banco (qualquer Postgres 15+) com o schema aplicado:
psql "$DATABASE_URL" -f scraper/db/schema.sql -f deploy/sql/02_cache_tables.sql

# dashboard
yarn install && yarn dev        # http://localhost:3000

# pipeline
python -m venv .venv && .venv/bin/pip install -r scraper/requirements.txt
.venv/bin/python scraper/src/run_daily.py --no-db   # só parquets
```
