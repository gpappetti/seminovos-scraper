import os
import requests
import pandas as pd
import time
import math
from concurrent.futures import ThreadPoolExecutor, as_completed

DATA_DIR = os.environ.get("OUTPUT_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"))
os.makedirs(DATA_DIR, exist_ok=True)

print("=" * 60)
print("SCRAPING LOCALIZA (FAST)...")
print("=" * 60)

BUILD_ID = "version-4.31.0"
BASE_URL = f"https://seminovos.localiza.com/_next/data/{BUILD_ID}/carros.json"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://seminovos.localiza.com/carros',
}

# Get total
resp = requests.get(BASE_URL, params={"page": 1}, headers=HEADERS, timeout=30)
data = resp.json()
pp = data['pageProps']
total = pp['_metadados']['_total']
total_pages = pp['_metadados']['_totalPaginas']
print(f"Total vehicles: {total}, Total pages: {total_pages}")

def fetch_page(page):
    """Fetch a single page and return list of vehicle dicts"""
    for attempt in range(3):
        try:
            resp = requests.get(BASE_URL, params={"page": page}, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            items = data['pageProps']['products']
            if isinstance(items, dict):
                items = [items[str(i)] for i in range(len(items))]
            
            vehicles = []
            for item in items:
                ano_fab = item.get('anoFabricacao', '')
                ano_mod = item.get('anoModelo', '')
                ano_modelo = f"{ano_fab}/{ano_mod}" if ano_fab and ano_mod else str(ano_fab or ano_mod or '')
                
                marca = item.get('marcaDescricao', '')
                modelo = item.get('modeloFamiliaDescricao', '')
                modelo_desc = item.get('modeloDescricaoReduzida', '')
                versao_desc = item.get('versaoDescricao', '')
                
                if versao_desc and modelo_desc:
                    versao = f"{versao_desc} {modelo_desc}"
                elif versao_desc:
                    versao = versao_desc
                elif modelo_desc:
                    versao = modelo_desc
                else:
                    versao = ''
                
                cidade = item.get('cidadeDescricao', '')
                estado = item.get('siglaEstado', '')
                
                vehicles.append({
                    'MARCA': marca,
                    'MODELO': modelo,
                    'VERSÃO': versao,
                    'ODÔMETRO': item.get('odometro', ''),
                    'ANO/MODELO': ano_modelo,
                    'CÂMBIO': item.get('tipoTransmissaoDescricao', ''),
                    'PREÇO': item.get('preco', ''),
                    'CIDADE/ESTADO': f"{cidade}/{estado}",
                })
            return page, vehicles
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
            else:
                print(f"  Failed page {page} after 3 attempts: {e}")
                return page, []

all_vehicles = []
completed = 0

# Use thread pool with 10 workers
with ThreadPoolExecutor(max_workers=10) as executor:
    futures = {executor.submit(fetch_page, p): p for p in range(1, total_pages + 1)}
    for future in as_completed(futures):
        page, vehicles = future.result()
        all_vehicles.extend(vehicles)
        completed += 1
        if completed % 100 == 0 or completed == total_pages:
            print(f"  Completed {completed}/{total_pages} pages - {len(all_vehicles)} vehicles")

# Sort by original order isn't critical but let's keep it clean
df_localiza = pd.DataFrame(all_vehicles)
print(f"\nLocaliza: {len(df_localiza)} vehicles collected")
print(df_localiza.head())
df_localiza.to_parquet(os.path.join(DATA_DIR, 'localiza_veiculos.parquet'), index=False)
print("Saved localiza_veiculos.parquet")
