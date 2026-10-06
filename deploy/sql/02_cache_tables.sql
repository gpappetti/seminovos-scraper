-- ============================================================
-- Tabelas de cache usadas pelo dashboard (raio-x seminovos).
-- Complementam scraper/db/schema.sql (tabela veiculos).
-- Os endpoints criam/populam essas tabelas em runtime; aqui
-- garantimos a existencia com as constraints usadas nos
-- INSERT ... ON CONFLICT.
-- ============================================================

-- Cache de precos FIPE (API Parallelum), chaveado por marca+modelo+ano
CREATE TABLE IF NOT EXISTS fipe_cache (
    marca_norm          TEXT NOT NULL,
    modelo_norm         TEXT NOT NULL,
    ano_modelo          INTEGER NOT NULL,
    fipe_codigo         TEXT,
    fipe_marca          TEXT,
    fipe_modelo         TEXT,
    fipe_preco          NUMERIC,
    fipe_combustivel    TEXT,
    fipe_mes_referencia TEXT,
    match_score         NUMERIC,
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (marca_norm, modelo_norm, ano_modelo)
);

-- Cache de veiculos vendidos (diferenca entre snapshots de datas)
CREATE TABLE IF NOT EXISTS vendidos_cache (
    prev_date     DATE NOT NULL,
    curr_date     DATE NOT NULL,
    fornecedora   TEXT NOT NULL,
    vendidos      INTEGER,
    cache_version INTEGER,
    calculado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (prev_date, curr_date, fornecedora)
);

-- Cache dos top veiculos vendidos por marca/modelo
CREATE TABLE IF NOT EXISTS top_vendidos_cache (
    prev_date     DATE NOT NULL,
    curr_date     DATE NOT NULL,
    fornecedora   TEXT NOT NULL,
    marca_norm    TEXT,
    modelo_norm   TEXT,
    qtd_vendidos  INTEGER,
    ticket_medio  NUMERIC,
    cache_version INTEGER,
    calculado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (prev_date, curr_date, fornecedora, marca_norm, modelo_norm)
);
