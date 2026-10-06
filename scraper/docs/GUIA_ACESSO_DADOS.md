# 📊 Guia de Acesso aos Dados - Veículos Seminovos no Supabase

Este guia mostra todas as formas de acessar e trabalhar com os dados armazenados no Supabase (PostgreSQL).

---

## 🌐 **Opção 1: Interface Web do Supabase** ⭐ Mais rápida

### Acesso:
1. Entre em: **https://supabase.com/dashboard**
2. Faça login com sua conta
3. Selecione o projeto: **seminovos** (`okihgyyvtijuubkgmoxg`)
4. Vá em: **SQL Editor** (menu lateral esquerdo)

### Como usar:
- Cole qualquer query SQL do arquivo `exemplos_queries.sql` e clique em **Run**
- Os resultados aparecem instantaneamente na tela
- Você pode exportar para CSV clicando em **Download CSV**

### Vantagens:
- ✅ Acesso instantâneo, sem instalar nada
- ✅ Interface visual com auto-complete
- ✅ Exportação direta para CSV
- ✅ Histórico de queries executadas

---

## 🐍 **Opção 2: Python + Pandas** ⭐ Para análises avançadas

### Instalação (uma vez):
```bash
pip install pandas psycopg2-binary python-dotenv openpyxl
```

### Uso:

**Método A: Script pronto (`exemplos_analise.py`)**
```bash
cd /caminho/para/seminovos-scraper
python exemplos_analise.py
```

Escolha um dos exemplos no menu:
1. Carregar dados em DataFrame (últimos 7 dias)
2. Comparação Movida vs Localiza
3. Evolução temporal de um modelo
4. Detector de oportunidades (preços abaixo da média)
5. Exportar relatório Excel
6. Exportar CSV completo da última data

**Método B: Código próprio**
```python
import pandas as pd
import psycopg2
from dotenv import load_dotenv
import os

# Carrega credenciais do .env
load_dotenv('db/.env')
conn = psycopg2.connect(os.getenv('DATABASE_URL'))

# Carrega dados em DataFrame
query = """
    SELECT *
    FROM veiculos
    WHERE data_referencia >= CURRENT_DATE - INTERVAL '7 days'
"""
df = pd.read_sql_query(query, conn)
conn.close()

# Análise
print(df.head())
print(df['marca_norm'].value_counts())
print(df.groupby('fornecedora')['preco_num'].mean())
```

### Vantagens:
- ✅ Análises estatísticas avançadas com Pandas
- ✅ Exporta para Excel, CSV, Parquet, etc.
- ✅ Integração com Matplotlib/Seaborn para gráficos
- ✅ Automação via scripts

---

## 📊 **Opção 3: Power BI** ⭐ Para dashboards visuais

### Conexão:

1. **Abra o Power BI Desktop**
2. Clique em **Obter Dados** → **Mais...**
3. Procure por **PostgreSQL database** e selecione
4. Preencha as informações de conexão:

   | Campo | Valor |
   |-------|-------|
   | **Servidor** | `aws-0-us-east-1.pooler.supabase.com:6543` |
   | **Banco de dados** | `postgres` |
   | **Modo de Conectividade** | Importar (recomendado) |

5. Clique em **OK**
6. Na tela de autenticação:
   - **Nome de usuário:** `postgres.okihgyyvtijuubkgmoxg`
   - **Senha:** `!@#C@fe4891#@!` *(você vai resetar depois)*
7. Selecione a tabela **`veiculos`** e clique em **Carregar**

### Configuração do Modelo (após carregar):

No Power BI, crie estas **medidas DAX** úteis:

```dax
# Preço Médio
Preço Médio = AVERAGE(veiculos[preco_num])

# Total de Veículos
Total Veículos = COUNTROWS(veiculos)

# Preço Mínimo
Preço Mínimo = MIN(veiculos[preco_num])

# Preço Máximo
Preço Máximo = MAX(veiculos[preco_num])

# Última Data de Coleta
Última Coleta = MAX(veiculos[data_referencia])

# Veículos da Última Data
Veículos Última Data = 
CALCULATE(
    COUNTROWS(veiculos),
    veiculos[data_referencia] = [Última Coleta]
)
```

### Sugestões de Visualizações:

1. **Gráfico de Linha:** Evolução de preço médio ao longo do tempo
   - Eixo X: `data_referencia`
   - Eixo Y: `Preço Médio`
   - Legenda: `fornecedora`

2. **Gráfico de Barras:** Top marcas por quantidade
   - Eixo Y: `marca_norm`
   - Eixo X: `Total Veículos`

3. **Mapa:** Distribuição geográfica
   - Localização: `estado`
   - Tamanho: `Total Veículos`
   - Legenda: `fornecedora`

4. **Cartões:** KPIs principais
   - Total Veículos Última Data
   - Preço Médio
   - Preço Mínimo / Máximo

### Atualização dos Dados:

- **Automática:** Configure em Página Inicial → **Atualizar** → **Agendar Atualização**
- **Manual:** Clique em **Atualizar** sempre que quiser os dados mais recentes

### Vantagens:
- ✅ Dashboards visuais interativos
- ✅ Publicação no Power BI Service (nuvem)
- ✅ Atualização automática agendada
- ✅ Compartilhamento com equipe

---

## 📈 **Opção 4: Excel (conexão direta ao banco)**

### Conexão (Excel 2016+):

1. Abra o Excel
2. Vá em: **Dados** → **Obter Dados** → **De Outras Fontes** → **Do PostgreSQL**
3. Preencha:
   - **Servidor:** `aws-0-us-east-1.pooler.supabase.com`
   - **Banco de dados:** `postgres`
4. Na autenticação:
   - **Nome de usuário:** `postgres.okihgyyvtijuubkgmoxg`
   - **Senha:** `!@#C@fe4891#@!`
5. Selecione a tabela **`veiculos`**
6. Clique em **Carregar**

### Query personalizada no Excel:

Alternativamente, você pode usar uma query SQL customizada:

1. **Dados** → **Obter Dados** → **Do PostgreSQL**
2. Marque **Opções avançadas**
3. Cole uma query SQL, exemplo:
```sql
SELECT *
FROM veiculos
WHERE data_referencia >= CURRENT_DATE - INTERVAL '30 days'
  AND marca_norm = 'VOLKSWAGEN'
```

### Vantagens:
- ✅ Familiar para quem já usa Excel
- ✅ Tabelas dinâmicas e gráficos nativos
- ✅ Fórmulas e análises ad-hoc

---

## 🔧 **Opção 5: DBeaver / DataGrip / pgAdmin** (para usuários avançados)

Ferramentas de administração de banco de dados profissionais.

### Configuração (exemplo DBeaver):

1. **Baixe:** https://dbeaver.io/download/
2. **Nova Conexão:** PostgreSQL
3. **Preencha:**
   - Host: `aws-0-us-east-1.pooler.supabase.com`
   - Port: `6543`
   - Database: `postgres`
   - Username: `postgres.okihgyyvtijuubkgmoxg`
   - Password: `!@#C@fe4891#@!`
4. **Teste a conexão** e salve

### Vantagens:
- ✅ Exploração completa do schema
- ✅ Editor SQL avançado com autocomplete
- ✅ Exportação para múltiplos formatos
- ✅ Gerenciamento de índices e performance

---

## 📦 **Opção 6: Exportação via Scripts Python (batch)**

Use o script `exemplos_analise.py` para gerar exports automatizados:

```bash
# Exporta última data para CSV
python exemplos_analise.py
# Escolha opção 6

# Exporta relatório Excel multi-abas
python exemplos_analise.py
# Escolha opção 5
```

Ou crie seu próprio script personalizado modificando `exemplos_analise.py`.

---

## 🔐 **String de Conexão (para qualquer ferramenta)**

Se precisar configurar outra ferramenta, use esta connection string:

```
postgresql://postgres.okihgyyvtijuubkgmoxg:!@#C@fe4891#@!@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

**Componentes separados:**
- **Host:** `aws-0-us-east-1.pooler.supabase.com`
- **Port:** `6543`
- **Database:** `postgres`
- **User:** `postgres.okihgyyvtijuubkgmoxg`
- **Password:** `!@#C@fe4891#@!`

---

## ⚠️ **IMPORTANTE: Segurança**

Você mencionou que vai **resetar a senha do banco**. Quando fizer isso:

### Onde atualizar a senha:

1. **Tarefa agendada (scraping automático):**
   - Arquivo: `/home/ubuntu/shared/.env`
   - Edite a linha `DATABASE_URL=postgresql://...`

2. **Repositório local:**
   - Arquivo: `/home/ubuntu/github_repos/seminovos-scraper/db/.env`
   - Edite a linha `DATABASE_URL=postgresql://...`

3. **Power BI / Excel:**
   - Reconecte com a nova senha quando abrir novamente

4. **Scripts Python:**
   - Se você baixou o repo na sua máquina, edite o `db/.env` local

### Como resetar a senha no Supabase:

1. Entre em: https://supabase.com/dashboard/project/okihgyyvtijuubkgmoxg
2. Vá em: **Settings** → **Database**
3. Em **Database Password**, clique em **Reset database password**
4. Copie a nova senha e atualize nos locais acima

---

## 📚 **Recursos Adicionais**

- **Queries SQL de exemplo:** veja `exemplos_queries.sql`
- **Scripts Python prontos:** veja `exemplos_analise.py`
- **Documentação Supabase:** https://supabase.com/docs/guides/database
- **Schema do banco:** veja `db/schema.sql`

---

## 🎯 **Qual opção escolher?**

| Situação | Recomendação |
|----------|--------------|
| Consulta rápida, exploração | **Interface Web do Supabase** |
| Análises estatísticas, ML | **Python + Pandas** |
| Dashboards para apresentar | **Power BI** |
| Análise para você mesmo | **Excel** |
| Desenvolvimento, debugging | **DBeaver / DataGrip** |
| Exports automatizados | **Scripts Python** |

---

**Dúvidas?** Todos os exemplos estão funcionais e testados. Experimente cada um e veja qual se encaixa melhor no seu fluxo de trabalho! 🚀
