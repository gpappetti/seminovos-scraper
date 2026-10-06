#!/usr/bin/env python3
"""
Scrapes vehicle advertisements from Seminovos Movida and Seminovos Localiza,
saves results as parquet files, and outputs a JSON summary.
"""
import requests
import pandas as pd
import time
import re
import json
import sys
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

# Diretório de saída: use a variável de ambiente OUTPUT_DIR ou, por padrão,
# a pasta "data" na raiz do projeto.
OUTPUT_DIR = os.environ.get(
    "OUTPUT_DIR",
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"),
)
os.makedirs(OUTPUT_DIR, exist_ok=True)

COMMON_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
}

# ─── MOVIDA ────────────────────────────────────────────────
def scrape_movida():
    print("=" * 60)
    print("SCRAPING MOVIDA...")
    print("=" * 60)
    
    url = "https://be-seminovos.movidacloud.com.br/elasticsearch/veiculos"
    headers = {
        **COMMON_HEADERS,
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json',
        'Origin': 'https://www.seminovosmovida.com.br',
        'Referer': 'https://www.seminovosmovida.com.br/',
    }
    PAGE_SIZE = 20

    resp = requests.post(url, headers=headers, json={"from": "0"}, timeout=30)
    resp.raise_for_status()
    total = resp.json()['total']['value']
    print(f"Total vehicles: {total}")

    offsets = list(range(0, total, PAGE_SIZE))

    def fetch_offset(offset):
        for attempt in range(3):
            try:
                r = requests.post(url, headers=headers, json={"from": str(offset)}, timeout=30)
                r.raise_for_status()
                items = r.json().get('data', [])
                vehicles = []
                for item in items:
                    ano_fab = item.get('ano_fabricacao', '')
                    ano_mod = item.get('ano_modelo', '')
                    ano_modelo = f"{ano_fab}/{ano_mod}" if ano_fab and ano_mod else str(ano_fab or ano_mod or '')
                    vehicles.append({
                        'MARCA': item.get('marca', ''),
                        'MODELO': item.get('modelo', ''),
                        'VERSÃO': item.get('versao', ''),
                        'ODÔMETRO': item.get('quilometragem', ''),
                        'ANO/MODELO': ano_modelo,
                        'CÂMBIO': item.get('transmissao', ''),
                        'PREÇO': item.get('preco', ''),
                        'CIDADE/ESTADO': f"{item.get('cidade', '')}/{item.get('uf', '')}",
                    })
                return vehicles
            except Exception as e:
                if attempt < 2:
                    time.sleep(1)
                else:
                    print(f"  Failed offset {offset}: {e}")
                    return []

    all_vehicles = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_offset, o): o for o in offsets}
        done = 0
        for future in as_completed(futures):
            all_vehicles.extend(future.result())
            done += 1
            if done % 50 == 0 or done == len(offsets):
                print(f"  Progress: {done}/{len(offsets)} requests - {len(all_vehicles)} vehicles")

    df = pd.DataFrame(all_vehicles)
    path = f"{OUTPUT_DIR}/movida_veiculos.parquet"
    df.to_parquet(path, index=False)
    print(f"Movida: {len(df)} vehicles saved to {path}")
    return len(df)

# ─── LOCALIZA ──────────────────────────────────────────────
def scrape_localiza():
    print("=" * 60)
    print("SCRAPING LOCALIZA...")
    print("=" * 60)

    # Dynamically fetch the current BUILD_ID
    resp = requests.get('https://seminovos.localiza.com/carros', headers=COMMON_HEADERS, timeout=30)
    resp.raise_for_status()
    match = re.search(r'"buildId":"([^"]+)"', resp.text)
    if not match:
        raise RuntimeError("Could not find Localiza BUILD_ID")
    build_id = match.group(1)
    print(f"Build ID: {build_id}")

    base_url = f"https://seminovos.localiza.com/_next/data/{build_id}/carros.json"
    headers = {**COMMON_HEADERS, 'Accept': 'application/json', 'Referer': 'https://seminovos.localiza.com/carros'}

    resp = requests.get(base_url, params={"page": 1}, headers=headers, timeout=30)
    resp.raise_for_status()
    meta = resp.json()['pageProps']['_metadados']
    total = meta['_total']
    total_pages = meta['_totalPaginas']
    print(f"Total vehicles: {total}, Total pages: {total_pages}")

    def fetch_page(page):
        for attempt in range(3):
            try:
                r = requests.get(base_url, params={"page": page}, headers=headers, timeout=30)
                r.raise_for_status()
                items = r.json()['pageProps']['products']
                if isinstance(items, dict):
                    items = [items[str(i)] for i in range(len(items))]
                vehicles = []
                for item in items:
                    ano_fab = item.get('anoFabricacao', '')
                    ano_mod = item.get('anoModelo', '')
                    ano_modelo = f"{ano_fab}/{ano_mod}" if ano_fab and ano_mod else str(ano_fab or ano_mod or '')
                    versao_desc = item.get('versaoDescricao', '')
                    modelo_desc = item.get('modeloDescricaoReduzida', '')
                    if versao_desc and modelo_desc:
                        versao = f"{versao_desc} {modelo_desc}"
                    else:
                        versao = versao_desc or modelo_desc or ''
                    cidade = item.get('cidadeDescricao', '')
                    estado = item.get('siglaEstado', '')
                    vehicles.append({
                        'MARCA': item.get('marcaDescricao', ''),
                        'MODELO': item.get('modeloFamiliaDescricao', ''),
                        'VERSÃO': versao,
                        'ODÔMETRO': item.get('odometro', ''),
                        'ANO/MODELO': ano_modelo,
                        'CÂMBIO': item.get('tipoTransmissaoDescricao', ''),
                        'PREÇO': item.get('preco', ''),
                        'CIDADE/ESTADO': f"{cidade}/{estado}",
                    })
                return vehicles
            except Exception as e:
                if attempt < 2:
                    time.sleep(1)
                else:
                    print(f"  Failed page {page}: {e}")
                    return []

    all_vehicles = []
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_page, p): p for p in range(1, total_pages + 1)}
        done = 0
        for future in as_completed(futures):
            all_vehicles.extend(future.result())
            done += 1
            if done % 100 == 0 or done == total_pages:
                print(f"  Progress: {done}/{total_pages} pages - {len(all_vehicles)} vehicles")

    df = pd.DataFrame(all_vehicles)
    path = f"{OUTPUT_DIR}/localiza_veiculos.parquet"
    df.to_parquet(path, index=False)
    print(f"Localiza: {len(df)} vehicles saved to {path}")
    return len(df)

# ─── MAIN ──────────────────────────────────────────────────
if __name__ == "__main__":
    results = {}
    try:
        results['movida'] = scrape_movida()
    except Exception as e:
        print(f"ERROR scraping Movida: {e}")
        results['movida'] = 0
        results['movida_error'] = str(e)

    try:
        results['localiza'] = scrape_localiza()
    except Exception as e:
        print(f"ERROR scraping Localiza: {e}")
        results['localiza'] = 0
        results['localiza_error'] = str(e)

    # Write summary JSON for the daemon to read
    summary_path = f"{OUTPUT_DIR}/scrape_summary.json"
    with open(summary_path, 'w') as f:
        json.dump(results, f)
    print(f"\nSummary saved to {summary_path}")
    print(json.dumps(results, indent=2))
