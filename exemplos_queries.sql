-- ============================================================================
-- QUERIES DE EXEMPLO - SUPABASE - VEÍCULOS SEMINOVOS
-- ============================================================================
-- Acesse: https://supabase.com/dashboard/project/okihgyyvtijuubkgmoxg/editor
-- Cole e execute as queries abaixo no SQL Editor
-- ============================================================================

-- 1. VISÃO GERAL DOS DADOS
-- Resumo: total de linhas, datas disponíveis, fornecedoras
SELECT 
    COUNT(*) as total_linhas,
    COUNT(DISTINCT data_referencia) as total_datas,
    MIN(data_referencia) as primeira_data,
    MAX(data_referencia) as ultima_data,
    COUNT(DISTINCT fornecedora) as fornecedoras
FROM veiculos;

-- 2. ÚLTIMOS DADOS COLETADOS
-- Quantos veículos foram coletados na última data por fornecedora
SELECT 
    fornecedora,
    COUNT(*) as qtd_veiculos,
    ROUND(AVG(preco_num)) as preco_medio,
    MIN(preco_num) as preco_min,
    MAX(preco_num) as preco_max
FROM veiculos
WHERE data_referencia = (SELECT MAX(data_referencia) FROM veiculos)
GROUP BY fornecedora
ORDER BY fornecedora;

-- 3. TOP 10 MARCAS MAIS OFERTADAS (ÚLTIMA DATA)
SELECT 
    marca_norm as marca,
    COUNT(*) as qtd_ofertas,
    ROUND(AVG(preco_num)) as preco_medio,
    ROUND(AVG(odometro_num)) as km_medio
FROM veiculos
WHERE data_referencia = (SELECT MAX(data_referencia) FROM veiculos)
GROUP BY marca_norm
ORDER BY qtd_ofertas DESC
LIMIT 10;

-- 4. EVOLUÇÃO TEMPORAL DE UM MODELO ESPECÍFICO
-- Exemplo: Volkswagen Polo ao longo do tempo
SELECT 
    data_referencia,
    fornecedora,
    COUNT(*) as estoque,
    ROUND(AVG(preco_num)) as preco_medio,
    ROUND(MIN(preco_num)) as preco_min,
    ROUND(MAX(preco_num)) as preco_max
FROM veiculos
WHERE marca_norm = 'VOLKSWAGEN' 
  AND modelo_norm = 'POLO'
GROUP BY data_referencia, fornecedora
ORDER BY data_referencia DESC, fornecedora
LIMIT 30;

-- 5. COMPARAÇÃO MOVIDA vs LOCALIZA (PREÇOS MÉDIOS POR MARCA)
SELECT 
    marca_norm as marca,
    ROUND(AVG(CASE WHEN fornecedora = 'MOVIDA' THEN preco_num END)) as preco_medio_movida,
    ROUND(AVG(CASE WHEN fornecedora = 'LOCALIZA' THEN preco_num END)) as preco_medio_localiza,
    ROUND(AVG(CASE WHEN fornecedora = 'MOVIDA' THEN preco_num END) - 
          AVG(CASE WHEN fornecedora = 'LOCALIZA' THEN preco_num END)) as diferenca,
    COUNT(*) as total_ofertas
FROM veiculos
WHERE data_referencia >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY marca_norm
HAVING COUNT(CASE WHEN fornecedora = 'MOVIDA' THEN 1 END) > 10 
   AND COUNT(CASE WHEN fornecedora = 'LOCALIZA' THEN 1 END) > 10
ORDER BY total_ofertas DESC
LIMIT 20;

-- 6. VEÍCULOS MAIS BARATOS DISPONÍVEIS HOJE (TOP 20)
SELECT 
    fornecedora,
    marca,
    modelo,
    versao,
    ano_modelo,
    CONCAT(odometro, ' km') as km,
    CONCAT('R$ ', TO_CHAR(preco_num, 'FM999,999')) as preco,
    CONCAT(cidade, '/', estado) as localizacao
FROM veiculos
WHERE data_referencia = (SELECT MAX(data_referencia) FROM veiculos)
  AND preco_num > 30000  -- Filtro básico de qualidade
ORDER BY preco_num ASC
LIMIT 20;

-- 7. ANÁLISE DE ESTOQUE (QUANTO TEMPO UM VEÍCULO FICA DISPONÍVEL)
-- Conta quantos dias consecutivos um veículo "idêntico" aparece
WITH estoque_identificado AS (
    SELECT 
        marca_norm,
        modelo_norm,
        versao,
        odometro_num,
        cidade,
        estado,
        fornecedora,
        data_referencia,
        preco_num,
        -- Identificador único aproximado de veículo
        CONCAT(marca_norm, '|', modelo_norm, '|', versao, '|', odometro_num, '|', cidade) as veiculo_id
    FROM veiculos
    WHERE data_referencia >= CURRENT_DATE - INTERVAL '30 days'
)
SELECT 
    veiculo_id,
    marca_norm,
    modelo_norm,
    fornecedora,
    COUNT(DISTINCT data_referencia) as dias_no_estoque,
    MIN(data_referencia) as primeira_aparicao,
    MAX(data_referencia) as ultima_aparicao,
    MIN(preco_num) as preco_inicial,
    MAX(preco_num) as preco_atual,
    ROUND(MAX(preco_num) - MIN(preco_num)) as variacao_preco
FROM estoque_identificado
GROUP BY veiculo_id, marca_norm, modelo_norm, fornecedora
HAVING COUNT(DISTINCT data_referencia) > 10  -- Mais de 10 dias no estoque
ORDER BY dias_no_estoque DESC
LIMIT 50;

-- 8. OPORTUNIDADES (PREÇO ABAIXO DA MÉDIA DO MODELO)
WITH medias AS (
    SELECT 
        marca_norm,
        modelo_norm,
        AVG(preco_num) as preco_medio_modelo,
        STDDEV(preco_num) as desvio_padrao
    FROM veiculos
    WHERE data_referencia >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY marca_norm, modelo_norm
    HAVING COUNT(*) > 20  -- Modelos com amostra significativa
)
SELECT 
    v.fornecedora,
    v.marca,
    v.modelo,
    v.versao,
    v.ano_modelo,
    CONCAT('R$ ', TO_CHAR(v.preco_num, 'FM999,999')) as preco,
    CONCAT('R$ ', TO_CHAR(m.preco_medio_modelo, 'FM999,999')) as preco_medio_modelo,
    ROUND(((v.preco_num - m.preco_medio_modelo) / m.preco_medio_modelo) * 100, 1) as desconto_percentual,
    CONCAT(v.cidade, '/', v.estado) as localizacao
FROM veiculos v
JOIN medias m ON v.marca_norm = m.marca_norm AND v.modelo_norm = m.modelo_norm
WHERE v.data_referencia = (SELECT MAX(data_referencia) FROM veiculos)
  AND v.preco_num < m.preco_medio_modelo - (m.desvio_padrao * 0.5)  -- Abaixo de 0.5 desvio padrão
ORDER BY desconto_percentual ASC
LIMIT 30;

-- 9. DISTRIBUIÇÃO POR ESTADO (ÚLTIMA DATA)
SELECT 
    estado,
    COUNT(*) as qtd_veiculos,
    ROUND(AVG(preco_num)) as preco_medio,
    ROUND(AVG(odometro_num)) as km_medio,
    COUNT(DISTINCT marca_norm) as qtd_marcas
FROM veiculos
WHERE data_referencia = (SELECT MAX(data_referencia) FROM veiculos)
  AND estado IS NOT NULL
GROUP BY estado
ORDER BY qtd_veiculos DESC;

-- 10. TENDÊNCIAS DE PREÇO (ÚLTIMOS 30 DIAS)
SELECT 
    DATE_TRUNC('week', data_referencia) as semana,
    fornecedora,
    COUNT(*) as qtd_ofertas,
    ROUND(AVG(preco_num)) as preco_medio,
    ROUND(AVG(odometro_num)) as km_medio
FROM veiculos
WHERE data_referencia >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE_TRUNC('week', data_referencia), fornecedora
ORDER BY semana DESC, fornecedora;
