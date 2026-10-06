import os
import requests
import pandas as pd
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

DATA_DIR = os.environ.get("OUTPUT_DIR", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data"))
os.makedirs(DATA_DIR, exist_ok=True)

print("=" * 60)
print("SCRAPING MOVIDA (v2 - using 'from' offset)...")
print("=" * 60)

MOVIDA_URL = "https://be-seminovos.movidacloud.com.br/elasticsearch/veiculos"
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json',
    'Origin': 'https://www.seminovosmovida.com.br',
    'Referer': 'https://www.seminovosmovida.com.br/',
}

PAGE_SIZE = 20  # Default page size used by the site

# Get total
resp = requests.post(MOVIDA_URL, headers=HEADERS, json={"from": "0"})
data = resp.json()
total = data['total']['value']
print(f"Total vehicles: {total}")

offsets = list(range(0, total, PAGE_SIZE))
print(f"Total requests needed: {len(offsets)}")

def fetch_offset(offset):
    for attempt in range(3):
        try:
            resp = requests.post(MOVIDA_URL, headers=HEADERS, 
                               json={"from": str(offset)}, timeout=30)
            resp.raise_for_status()
            items = resp.json().get('data', [])
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
            return offset, vehicles
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
            else:
                print(f"  Failed offset {offset}: {e}")
                return offset, []

all_vehicles = []
completed = 0

with ThreadPoolExecutor(max_workers=10) as executor:
    futures = {executor.submit(fetch_offset, o): o for o in offsets}
    for future in as_completed(futures):
        offset, vehicles = future.result()
        all_vehicles.extend(vehicles)
        completed += 1
        if completed % 50 == 0 or completed == len(offsets):
            print(f"  Completed {completed}/{len(offsets)} - {len(all_vehicles)} vehicles")

df_movida = pd.DataFrame(all_vehicles)
print(f"\nMovida: {len(df_movida)} vehicles collected")
print(f"Unique brands: {df_movida['MARCA'].nunique()}")
print(df_movida['MARCA'].value_counts().head(10))
print(df_movida.head())
df_movida.to_parquet(os.path.join(DATA_DIR, 'movida_veiculos.parquet'), index=False)
print("Saved movida_veiculos.parquet")
