-- ============================================================
-- Esquema do banco de dados de veículos seminovos (Supabase / PostgreSQL)
-- Modelo: histórico completo point-in-time (uma linha por veículo por dia)
-- Fontes: Movida e Localiza (tabela única com coluna 'fornecedora')
-- ============================================================

CREATE TABLE IF NOT EXISTS veiculos (
    id              BIGSERIAL PRIMARY KEY,

    -- ---------- Colunas ORIGINAIS (preservadas como vêm nos parquets) ----------
    marca           TEXT,   -- ex.: "VOLKSWAGEN" (Localiza) / "Renault" (Movida)
    modelo          TEXT,
    versao          TEXT,   -- já com o bug "LONGITUDE" corrigido na carga
    odometro        TEXT,   -- valor original (texto) para auditoria
    ano_modelo_raw  TEXT,   -- ex.: "2024/2025"
    cambio          TEXT,
    preco           TEXT,   -- valor original (texto) para auditoria
    cidade_estado   TEXT,   -- ex.: "SÃO JOSÉ DO RIO PRETO/SP"

    -- ---------- Colunas NORMALIZADAS ----------
    fornecedora     TEXT    NOT NULL,   -- 'MOVIDA' ou 'LOCALIZA'
    data_referencia DATE    NOT NULL,   -- data do e-mail/arquivo (chave point-in-time)
    preco_num       NUMERIC,            -- PREÇO como número
    odometro_num    INTEGER,            -- ODÔMETRO como inteiro
    ano_fabricacao  INTEGER,            -- de "2024/2025" -> 2024
    ano_modelo      INTEGER,            -- de "2024/2025" -> 2025
    cidade          TEXT,               -- de "SÃO PAULO/SP" -> "SÃO PAULO"
    estado          TEXT,               -- UF, de "SÃO PAULO/SP" -> "SP"
    marca_norm      TEXT,               -- MARCA em MAIÚSCULAS
    modelo_norm     TEXT,               -- MODELO em MAIÚSCULAS

    created_at      TIMESTAMPTZ DEFAULT now()
);

-- ---------- Índices para análises ----------
CREATE INDEX IF NOT EXISTS idx_veiculos_forn_data   ON veiculos (fornecedora, data_referencia);
CREATE INDEX IF NOT EXISTS idx_veiculos_marca_modelo ON veiculos (marca_norm, modelo_norm);
CREATE INDEX IF NOT EXISTS idx_veiculos_data         ON veiculos (data_referencia);
CREATE INDEX IF NOT EXISTS idx_veiculos_estado       ON veiculos (estado);
