# 🚗 Seminovos Scraper

Coletor de dados (web scraper) de anúncios de veículos seminovos das plataformas
**Movida Seminovos** e **Localiza Seminovos**. O projeto acessa as APIs públicas
utilizadas pelos próprios sites para extrair informações de todos os veículos
disponíveis e salvá-las em arquivos [Parquet](https://parquet.apache.org/),
prontos para análise em ferramentas como pandas, Power BI, entre outras.

---

## 📋 Descrição do projeto

Os sites de seminovos da Movida e da Localiza carregam seus anúncios através de
APIs JSON internas. Este projeto consome essas APIs de forma paralela e eficiente
(usando *threads*), consolidando os dados em um formato tabular padronizado.

- **Movida:** `https://www.seminovosmovida.com.br/busca`
- **Localiza:** `https://seminovos.localiza.com/carros`

O script principal ([`src/scrape_vehicles.py`](src/scrape_vehicles.py)) coleta
os dois sites de uma só vez e gera um resumo em JSON. Também existem scripts
individuais para cada fonte, caso você queira rodar apenas uma delas.

---

## ✨ Funcionalidades

- ✅ Coleta **todos** os veículos disponíveis nas duas plataformas.
- ⚡ Requisições **paralelas** (ThreadPoolExecutor) para máxima velocidade.
- 🔁 **Retentativas automáticas** (3 tentativas) em caso de falha de rede.
- 🧩 Detecção **dinâmica do `buildId`** da Localiza (não depende de versão fixa).
- 💾 Saída em **Parquet** (compacto e tipado), um arquivo por plataforma.
- 📊 Geração de um **resumo em JSON** com a contagem de veículos coletados.
- 🗂️ Esquema de dados **padronizado** entre as duas fontes.

---

## 🧱 Estrutura dos dados coletados

Cada linha representa um veículo, com as seguintes colunas:

| Coluna          | Descrição                                        | Exemplo                     |
|-----------------|--------------------------------------------------|-----------------------------|
| `MARCA`         | Marca do veículo                                 | `FIAT`                      |
| `MODELO`        | Modelo/família                                   | `ARGO`                      |
| `VERSÃO`        | Versão detalhada                                 | `1.0 DRIVE ARGO`            |
| `ODÔMETRO`      | Quilometragem                                    | `45000`                     |
| `ANO/MODELO`    | Ano de fabricação/ano modelo                     | `2021/2022`                 |
| `CÂMBIO`        | Tipo de transmissão                              | `Automático`                |
| `PREÇO`         | Preço anunciado                                  | `68990`                     |
| `CIDADE/ESTADO` | Localização no formato `cidade/UF`               | `Belo Horizonte/MG`         |

Arquivos gerados na pasta `data/`:

- `movida_veiculos.parquet`
- `localiza_veiculos.parquet`
- `scrape_summary.json` (resumo da execução — apenas o script principal)

---

## 🔧 Requisitos e instalação

- **Python 3.8+**

Clone o repositório e instale as dependências:

```bash
git clone https://github.com/<SEU_USUARIO>/seminovos-scraper.git
cd seminovos-scraper

# (opcional, recomendado) crie um ambiente virtual
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

Dependências principais (ver [`requirements.txt`](requirements.txt)):

- `requests` — chamadas HTTP às APIs
- `pandas` — manipulação e tabulação dos dados
- `pyarrow` — gravação dos arquivos Parquet

---

## ▶️ Como usar

### 1. Coletar as duas plataformas de uma vez (recomendado)

```bash
python src/scrape_vehicles.py
```

Isso irá gerar `data/movida_veiculos.parquet`, `data/localiza_veiculos.parquet`
e `data/scrape_summary.json`.

### 2. Coletar apenas uma plataforma

```bash
python src/scrape_movida.py     # Somente Movida
python src/scrape_localiza.py   # Somente Localiza
```

### 3. Escolher a pasta de saída

Por padrão os arquivos são salvos em `data/`. Para mudar, defina a variável de
ambiente `OUTPUT_DIR`:

```bash
OUTPUT_DIR=/caminho/para/saida python src/scrape_vehicles.py
```

(Veja o arquivo [`.env.example`](.env.example).)

---

## 📈 Exemplos de uso

Ler e analisar os dados coletados com pandas:

```python
import pandas as pd

df = pd.read_parquet("data/localiza_veiculos.parquet")

print(f"Total de veículos: {len(df)}")

# 10 marcas mais anunciadas
print(df["MARCA"].value_counts().head(10))

# Filtrar por faixa de preço e estado
baratos_mg = df[(df["PREÇO"].astype(float) < 60000) &
                (df["CIDADE/ESTADO"].str.endswith("/MG"))]
print(baratos_mg.head())
```

Combinar as duas fontes:

```python
import pandas as pd

movida = pd.read_parquet("data/movida_veiculos.parquet")
localiza = pd.read_parquet("data/localiza_veiculos.parquet")

movida["FONTE"] = "Movida"
localiza["FONTE"] = "Localiza"

todos = pd.concat([movida, localiza], ignore_index=True)
print(f"Total combinado: {len(todos)} veículos")
```

---

## 📁 Estrutura do projeto

```
seminovos-scraper/
├── src/
│   ├── scrape_vehicles.py   # Script principal (Movida + Localiza + resumo JSON)
│   ├── scrape_movida.py     # Coletor individual da Movida
│   └── scrape_localiza.py   # Coletor individual da Localiza
├── data/                    # Saída dos arquivos .parquet (ignorados pelo Git)
│   └── .gitkeep
├── docs/                    # Documentação adicional
├── requirements.txt         # Dependências Python
├── .env.example             # Exemplo de configuração de ambiente
├── .gitignore
└── README.md
```

---

## ⚠️ Aviso legal

Este projeto foi desenvolvido para fins **educacionais e de análise de dados**.
Ele consome APIs públicas dos sites da Movida e da Localiza. Use de forma
responsável, respeitando os Termos de Uso de cada plataforma e evitando um
volume excessivo de requisições. Os dados coletados pertencem às respectivas
plataformas.

---

## 📄 Licença

Distribuído sob a licença MIT. Consulte o arquivo [`LICENSE`](LICENSE).
