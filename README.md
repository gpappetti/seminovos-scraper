# Scraper de Veículos Seminovos

Projeto de coleta diária automatizada de veículos seminovos das plataformas **Movida** e **Localiza**, com armazenamento em banco de dados PostgreSQL (Supabase) para análises temporais.

## 📋 Funcionalidades

- ✅ **Scraping paralelo** de Movida e Localiza (threads concorrentes)
- ✅ **Detecção dinâmica** do buildId do Next.js (Localiza) — não quebra com deploys do site
- ✅ **Correção automática** do bug "LONGITUDE" da API da Localiza
- ✅ **Banco de dados point-in-time** com histórico completo e normalização
- ✅ **Carga idempotente** — rodar múltiplas vezes não duplica dados
- ✅ Exportação em Parquet para backup/análise offline

## 🗄️ Estrutura do Banco de Dados

Tabela única `veiculos` no Supabase (PostgreSQL):

| Categoria | Colunas |
|---|---|
| **Originais** (preservadas) | marca, modelo, versao, odometro, ano_modelo_raw, cambio, preco, cidade_estado |
| **Normalizadas** | fornecedora, data_referencia, preco_num, odometro_num, ano_fabricacao, ano_modelo, cidade, estado, marca_norm, modelo_norm |

**Modelo:** histórico completo (point-in-time) — cada veículo/dia é uma linha, permitindo análises de evolução de preço, tempo de estoque, sazonalidade, etc.

**Volume atual:** ~2,5 milhões de linhas (96 dias × ~27 mil veículos/dia)

## ⚙️ Configuração

### 1. Dependências

```bash
pip install -r requirements.txt
```

### 2. Banco de dados (Supabase)

```bash
# Copie o template
cp db/.env.example db/.env

# Edite db/.env com suas credenciais do Supabase
# DATABASE_URL=postgresql://postgres.SEU_REF:SUA_SENHA@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# Crie o schema (apenas uma vez)
python db/populate_db.py --schema
```

**⚠️ IMPORTANTE:** use a **connection string do pooler IPv4** (`aws-0-REGIÃO.pooler.supabase.com`), não a direta (`db.*.supabase.co`), pois a última usa IPv6.

### 3. Carga histórica (opcional)

Se você tem arquivos parquet históricos (ex.: de e-mails anteriores), coloque-os em um diretório com o padrão `{fornecedora}_veiculos_YYYY-MM-DD.parquet` e rode:

```bash
python db/populate_db.py --dir /caminho/para/parquets
```

## 🚀 Uso

### Coleta diária (scraping + banco)

```bash
python src/run_daily.py
```

Isso vai:
1. Fazer scraping da Localiza e Movida
2. Salvar parquets locais em `data/`
3. Inserir os dados no banco com `data_referencia` = hoje

### Opções

```bash
# Apenas scraping (sem inserir no banco)
python src/run_daily.py --no-db

# Especificar data de referência
python src/run_daily.py --date 2026-08-30

# Pular envio de e-mail (funcionalidade ainda não implementada)
python src/run_daily.py --no-email
```

### Scrapers individuais

```bash
# Apenas Localiza
python src/scrape_localiza.py

# Apenas Movida
python src/scrape_movida.py
```

## 📊 Análises / Power BI

Exemplos de queries úteis:

```sql
-- Evolução de preço médio por marca/modelo ao longo do tempo
SELECT 
    data_referencia,
    marca_norm,
    modelo_norm,
    ROUND(AVG(preco_num)) as preco_medio,
    COUNT(*) as estoque
FROM veiculos
WHERE marca_norm = 'VOLKSWAGEN' AND modelo_norm = 'POLO'
GROUP BY data_referencia, marca_norm, modelo_norm
ORDER BY data_referencia;

-- Tempo médio de permanência no estoque (quanto tempo até sumir/vender)
-- (requer identificação estável de veículos via odômetro + versão + cidade)

-- Comparação de preços Movida vs Localiza
SELECT 
    modelo_norm,
    fornecedora,
    ROUND(AVG(preco_num)) as preco_medio,
    COUNT(*) as qtd
FROM veiculos
WHERE data_referencia = '2026-08-30'
GROUP BY modelo_norm, fornecedora
HAVING COUNT(*) > 5
ORDER BY modelo_norm, fornecedora;
```

## 🐛 Bugs Corrigidos

### Bug "LONGITUDE" (Localiza)

**Problema:** a API da Localiza retornava o campo `versaoDescricao` sempre com a string constante `"LONGITUDE"` (lixo), poluindo 100% dos registros.

**Correção:** o scraper agora usa exclusivamente `modeloDescricaoReduzida` (que contém a versão real), e o pipeline de ETL remove o prefixo espúrio dos dados históricos, preservando as versões "Longitude" legítimas dos Jeep Compass/Renegade/Commander.

### BuildId desatualizado (Localiza)

**Problema:** o buildId do Next.js estava hardcoded (`version-4.31.0`), fazendo a API retornar 404 após deploys do site.

**Correção:** detecção dinâmica via regex na página HTML — o scraper sempre usa o buildId atual.

## 📁 Estrutura do Projeto

```
seminovos-scraper/
├── src/
│   ├── scrape_localiza.py   # Scraper da Localiza (corrigido)
│   ├── scrape_movida.py     # Scraper da Movida
│   ├── scrape_vehicles.py   # (legado, mantido para referência)
│   └── run_daily.py         # ⭐ Orquestrador principal (scraping + banco)
├── db/
│   ├── schema.sql           # DDL da tabela veiculos
│   ├── populate_db.py       # Pipeline de ETL (correção + normalização + carga)
│   ├── .env.example         # Template de configuração
│   └── .env                 # ⚠️ SUA senha (não commitado)
├── data/                    # Parquets gerados localmente (ignorado pelo git)
├── requirements.txt
└── README.md
```

## 🤝 Contribuindo

Melhorias bem-vindas:
- [ ] Implementar envio de e-mail com os parquets (atualmente é placeholder)
- [ ] Dashboard web (Streamlit/Plotly) para visualização dos dados
- [ ] Detector de oportunidades (carros com preço abaixo da curva)
- [ ] Alertas de novos modelos/versões

## 📄 Licença

MIT — veja LICENSE para detalhes.
