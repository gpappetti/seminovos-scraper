#!/usr/bin/env python3
"""
Script orquestrador de coleta diária de veículos seminovos.

Executa:
1. Scraping da Localiza e Movida (gera parquets em data/)
2. Inserção no banco de dados Supabase (PostgreSQL) com normalização
3. (Opcional) Envio de e-mail com os arquivos

Uso:
    # 1) Configure o .env (copie db/.env.example e preencha)
    # 2) Execute:
    python src/run_daily.py

Opções:
    --no-db     Pula a inserção no banco (só scraping + parquets locais)
    --no-email  Pula o envio de e-mail (só scraping + banco)
    --date      Data de referência (YYYY-MM-DD, padrão: hoje)
"""
import os
import sys
import argparse
import subprocess
from datetime import date
from pathlib import Path

# Adiciona o diretório db/ ao path para importar populate_db
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR / "db"))

try:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / "db" / ".env")
    load_dotenv()
except Exception:
    pass

import populate_db as db


def run_scrapers(data_dir):
    """Executa os scrapers de Localiza e Movida."""
    env = os.environ.copy()
    env["OUTPUT_DIR"] = str(data_dir)
    
    print("=" * 70)
    print("EXECUTANDO SCRAPER DA LOCALIZA")
    print("=" * 70)
    result = subprocess.run(
        [sys.executable, str(ROOT_DIR / "src" / "scrape_localiza.py")],
        env=env,
        capture_output=False,
    )
    if result.returncode != 0:
        print(f"ERRO: scraper da Localiza falhou com código {result.returncode}")
        sys.exit(1)
    
    print("\n" + "=" * 70)
    print("EXECUTANDO SCRAPER DA MOVIDA")
    print("=" * 70)
    result = subprocess.run(
        [sys.executable, str(ROOT_DIR / "src" / "scrape_movida.py")],
        env=env,
        capture_output=False,
    )
    if result.returncode != 0:
        print(f"ERRO: scraper da Movida falhou com código {result.returncode}")
        sys.exit(1)
    
    print("\n✅ Scrapers concluídos com sucesso")


def load_to_db(data_dir, data_ref):
    """Carrega os parquets gerados no banco de dados."""
    import pandas as pd
    
    print("\n" + "=" * 70)
    print("CARREGANDO DADOS NO BANCO DE DADOS")
    print("=" * 70)
    
    localiza_file = data_dir / "localiza_veiculos.parquet"
    movida_file = data_dir / "movida_veiculos.parquet"
    
    if not localiza_file.exists() or not movida_file.exists():
        print(f"ERRO: arquivos parquet não encontrados em {data_dir}")
        sys.exit(1)
    
    conn = db.get_conn()
    total = 0
    
    try:
        for forn, path in [("LOCALIZA", localiza_file), ("MOVIDA", movida_file)]:
            df = pd.read_parquet(path)
            if df.empty:
                print(f"  [AVISO] {forn}: parquet vazio, pulando")
                continue
            
            tdf = db.transform(df, forn, data_ref)
            rows = list(tdf[db.INSERT_COLS].itertuples(index=False, name=None))
            
            with conn.cursor() as cur:
                # Remove linhas já existentes desta (fornecedora, data)
                cur.execute(
                    "DELETE FROM veiculos WHERE fornecedora = %s AND data_referencia = %s",
                    (forn, data_ref),
                )
                deleted = cur.rowcount
                
                # Insere novas linhas
                from psycopg2.extras import execute_values
                cols = ", ".join(db.INSERT_COLS)
                execute_values(
                    cur,
                    f"INSERT INTO veiculos ({cols}) VALUES %s",
                    rows,
                    page_size=1000,
                )
            conn.commit()
            print(f"  {forn}: {len(rows):,} linhas inseridas "
                  f"(removidas {deleted} existentes da mesma data)")
            total += len(rows)
        
        # Validação
        with conn.cursor() as cur:
            cur.execute(
                "SELECT count(*) FROM veiculos WHERE data_referencia = %s",
                (data_ref,)
            )
            count_db = cur.fetchone()[0]
            print(f"\n  ✅ Total no banco para {data_ref}: {count_db:,} linhas")
            
            if abs(count_db - total) > 10:
                print(f"  ⚠️  AVISO: diferença entre inserido ({total}) e "
                      f"contagem no banco ({count_db})")
    finally:
        conn.close()


def send_email(data_dir, data_ref):
    """Envia e-mail com os parquets anexados (PLACEHOLDER)."""
    print("\n" + "=" * 70)
    print("ENVIO DE E-MAIL")
    print("=" * 70)
    print("  ⚠️  FUNCIONALIDADE DE E-MAIL AINDA NÃO IMPLEMENTADA")
    print("  Os arquivos estão salvos em:", data_dir)
    print("  Para implementar: use a API do Gmail ou SMTP")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--no-db", action="store_true",
                        help="Pula a inserção no banco")
    parser.add_argument("--no-email", action="store_true",
                        help="Pula o envio de e-mail")
    parser.add_argument("--date", type=str,
                        help="Data de referência (YYYY-MM-DD, padrão: hoje)")
    args = parser.parse_args()
    
    data_ref = args.date or str(date.today())
    data_dir = ROOT_DIR / "data"
    data_dir.mkdir(exist_ok=True)
    
    print(f"\n📅 Data de referência: {data_ref}")
    print(f"📁 Diretório de saída: {data_dir}")
    
    # 1. Scraping
    run_scrapers(data_dir)
    
    # 2. Banco de dados
    if not args.no_db:
        try:
            load_to_db(data_dir, data_ref)
        except Exception as e:
            print(f"\n❌ ERRO ao carregar no banco: {e}")
            print("Os arquivos parquet foram salvos localmente.")
            import traceback
            traceback.print_exc()
            sys.exit(1)
    else:
        print("\n⏭️  Pulando inserção no banco (--no-db)")
    
    # 3. E-mail
    if not args.no_email:
        send_email(data_dir, data_ref)
    else:
        print("\n⏭️  Pulando envio de e-mail (--no-email)")
    
    print("\n" + "=" * 70)
    print("✅ PIPELINE DIÁRIO CONCLUÍDO")
    print("=" * 70)


if __name__ == "__main__":
    main()
