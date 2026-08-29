#!/usr/bin/env python3
"""
Popula o banco Supabase (PostgreSQL) com os dados históricos de veículos
seminovos (Movida e Localiza).

- Lê todos os parquets em DOWNLOADS_DIR no padrão {fornecedora}_veiculos_YYYY-MM-DD.parquet
- Corrige o bug "LONGITUDE" da Localiza (remove o prefixo espúrio da VERSÃO)
- Normaliza colunas (preço, odômetro, ano fab/modelo, cidade/UF, marca/modelo)
- Insere em massa na tabela `veiculos`
- Idempotente: apaga e reinsere as linhas de cada (fornecedora, data_referencia)

Uso:
    # 1) configure a conexão (arquivo .env ao lado deste script, ou variáveis de ambiente)
    cp db/.env.example db/.env  &&  edite db/.env
    # 2) crie o schema (uma vez):
    python db/populate_db.py --schema
    # 3) rode a carga:
    python db/populate_db.py
"""
import os
import re
import sys
import glob
import argparse
from urllib.parse import quote_plus

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

try:
    from dotenv import load_dotenv
    # carrega .env que estiver ao lado deste arquivo, e também o do diretório atual
    load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
    load_dotenv()
except Exception:
    pass

# Diretório com os parquets baixados dos e-mails
DOWNLOADS_DIR = os.environ.get(
    "DOWNLOADS_DIR",
    "/home/ubuntu/gmail_attachments/downloads",
)
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "schema.sql")

FILENAME_RE = re.compile(r"^(movida|localiza)_veiculos_(\d{4}-\d{2}-\d{2})\.parquet$", re.I)

# Colunas de destino na tabela (ordem usada no INSERT)
INSERT_COLS = [
    "marca", "modelo", "versao", "odometro", "ano_modelo_raw", "cambio",
    "preco", "cidade_estado", "fornecedora", "data_referencia", "preco_num",
    "odometro_num", "ano_fabricacao", "ano_modelo", "cidade", "estado",
    "marca_norm", "modelo_norm",
]


def get_conn():
    """Abre conexão psycopg2. Aceita DATABASE_URL ou parâmetros PG* separados.

    A senha pode conter caracteres especiais; por isso preferimos passar os
    parâmetros separadamente ao psycopg2 (evita problemas de parsing de URL).
    """
    url = os.environ.get("DATABASE_URL")
    if url:
        # Extrai partes manualmente para não quebrar com senha contendo @ ! # etc.
        m = re.match(r"^postgres(?:ql)?://([^:]+):(.+)@([^:/]+):(\d+)/(.+)$", url)
        if m:
            user, pwd, host, port, db = m.groups()
            return psycopg2.connect(
                host=host, port=int(port), user=user, password=pwd,
                dbname=db, connect_timeout=30,
            )
        # se não casar, tenta a URL crua (deixa o psycopg2 resolver)
        return psycopg2.connect(url, connect_timeout=30)

    return psycopg2.connect(
        host=os.environ["PGHOST"],
        port=int(os.environ.get("PGPORT", 6543)),
        user=os.environ["PGUSER"],
        password=os.environ["PGPASSWORD"],
        dbname=os.environ.get("PGDATABASE", "postgres"),
        connect_timeout=30,
    )


def apply_schema():
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        sql = f.read()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print("Schema aplicado com sucesso.")
    finally:
        conn.close()


def to_int(series):
    return pd.to_numeric(series, errors="coerce").astype("Int64")


def to_num(series):
    return pd.to_numeric(series, errors="coerce")


def parse_preco(series):
    """Converte PREÇO para número. Trata tanto int/float quanto strings com
    'R$', pontos de milhar e vírgula decimal."""
    if pd.api.types.is_numeric_dtype(series):
        return pd.to_numeric(series, errors="coerce")
    s = (
        series.astype(str)
        .str.replace(r"[Rr]\$", "", regex=True)
        .str.replace(r"\s", "", regex=True)
        .str.replace(".", "", regex=False)   # separador de milhar
        .str.replace(",", ".", regex=False)  # decimal
        .str.replace(r"[^0-9.]", "", regex=True)
    )
    return pd.to_numeric(s, errors="coerce")


def transform(df, fornecedora, data_ref):
    """Aplica correções e normalizações; devolve DataFrame pronto para inserir."""
    df = df.copy()

    # ---- Correção do bug "LONGITUDE" (somente Localiza) ----
    if fornecedora == "LOCALIZA":
        versao_str = df["VERSÃO"].astype(str)
        prefixadas = versao_str.str.startswith("LONGITUDE ")
        frac = prefixadas.mean() if len(df) else 0
        if frac >= 0.99:
            # Remove APENAS o primeiro "LONGITUDE " (^ ancora no início).
            # Isso recupera também os Jeep "Longitude" legítimos:
            # "LONGITUDE LONGITUDE 1.3..." -> "LONGITUDE 1.3..."
            df["VERSÃO"] = versao_str.str.replace(r"^LONGITUDE ", "", regex=True)
        else:
            print(f"    [AVISO] {data_ref}: só {frac:.1%} das versões têm prefixo "
                  f"'LONGITUDE ' — mantendo original (possível dado já corrigido).")

    out = pd.DataFrame()
    # Originais
    out["marca"] = df["MARCA"].astype(str)
    out["modelo"] = df["MODELO"].astype(str)
    out["versao"] = df["VERSÃO"].astype(str)
    out["odometro"] = df["ODÔMETRO"].astype(str)
    out["ano_modelo_raw"] = df["ANO/MODELO"].astype(str)
    out["cambio"] = df["CÂMBIO"].astype(str)
    out["preco"] = df["PREÇO"].astype(str)
    out["cidade_estado"] = df["CIDADE/ESTADO"].astype(str)

    # Normalizadas
    out["fornecedora"] = fornecedora
    out["data_referencia"] = data_ref
    out["preco_num"] = parse_preco(df["PREÇO"])
    out["odometro_num"] = to_int(df["ODÔMETRO"])

    anos = df["ANO/MODELO"].astype(str).str.split("/", n=1, expand=True)
    ano_fab = anos[0] if anos.shape[1] > 0 else pd.Series([None] * len(df))
    ano_mod = anos[1] if anos.shape[1] > 1 else ano_fab
    out["ano_fabricacao"] = to_int(ano_fab)
    out["ano_modelo"] = to_int(ano_mod.fillna(ano_fab))

    # cidade/estado: última "/" separa a UF
    ce = df["CIDADE/ESTADO"].astype(str).str.rsplit("/", n=1, expand=True)
    out["cidade"] = ce[0].str.strip() if ce.shape[1] > 0 else None
    out["estado"] = (ce[1].str.strip() if ce.shape[1] > 1 else None)

    out["marca_norm"] = df["MARCA"].astype(str).str.upper().str.strip()
    out["modelo_norm"] = df["MODELO"].astype(str).str.upper().str.strip()

    # Converte NaN/NA -> None para o psycopg2
    out = out.astype(object).where(pd.notnull(out), None)
    return out


def load_file(conn, path):
    fname = os.path.basename(path)
    m = FILENAME_RE.match(fname)
    if not m:
        print(f"  [PULADO] nome fora do padrão: {fname}")
        return 0
    fornecedora = m.group(1).upper()
    data_ref = m.group(2)

    df = pd.read_parquet(path)
    if df.empty:
        print(f"  [VAZIO] {fname}")
        return 0

    tdf = transform(df, fornecedora, data_ref)
    rows = list(tdf[INSERT_COLS].itertuples(index=False, name=None))

    with conn.cursor() as cur:
        # idempotência: remove linhas já existentes desta (fornecedora, data)
        cur.execute(
            "DELETE FROM veiculos WHERE fornecedora = %s AND data_referencia = %s",
            (fornecedora, data_ref),
        )
        cols = ", ".join(INSERT_COLS)
        execute_values(
            cur,
            f"INSERT INTO veiculos ({cols}) VALUES %s",
            rows,
            page_size=1000,
        )
    conn.commit()
    return len(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--schema", action="store_true", help="apenas cria o schema e sai")
    ap.add_argument("--dir", default=DOWNLOADS_DIR, help="diretório dos parquets")
    args = ap.parse_args()

    if args.schema:
        apply_schema()
        return

    # garante o schema antes da carga
    apply_schema()

    files = sorted(glob.glob(os.path.join(args.dir, "*.parquet")))
    if not files:
        print(f"Nenhum parquet encontrado em {args.dir}")
        sys.exit(1)

    print(f"Encontrados {len(files)} arquivos parquet em {args.dir}")
    conn = get_conn()
    total = 0
    try:
        for i, path in enumerate(files, 1):
            n = load_file(conn, path)
            total += n
            if i % 10 == 0 or i == len(files):
                print(f"  [{i}/{len(files)}] {os.path.basename(path)} -> "
                      f"{n} linhas (acumulado: {total})")

        # ---- Validações finais ----
        with conn.cursor() as cur:
            print("\n=== RESUMO NO BANCO ===")
            cur.execute(
                "SELECT fornecedora, count(*), min(data_referencia), "
                "max(data_referencia) FROM veiculos GROUP BY fornecedora "
                "ORDER BY fornecedora"
            )
            for forn, cnt, dmin, dmax in cur.fetchall():
                print(f"  {forn}: {cnt:,} linhas | {dmin} a {dmax}")

            cur.execute("SELECT count(*) FROM veiculos")
            print(f"  TOTAL: {cur.fetchone()[0]:,} linhas")

            cur.execute(
                "SELECT count(*) FROM veiculos WHERE fornecedora='LOCALIZA' "
                "AND versao LIKE 'LONGITUDE %%'"
            )
            resto = cur.fetchone()[0]
            print(f"\n  Localiza com VERSÃO ainda começando com 'LONGITUDE ' "
                  f"(esperado: só Jeep Longitude legítimos): {resto:,}")
            cur.execute(
                "SELECT DISTINCT modelo_norm FROM veiculos WHERE fornecedora='LOCALIZA' "
                "AND versao LIKE 'LONGITUDE %%'"
            )
            modelos = [r[0] for r in cur.fetchall()]
            print(f"  Modelos nesses casos: {modelos}")
    finally:
        conn.close()

    print("\nCarga concluída.")


if __name__ == "__main__":
    main()
