#!/usr/bin/env python3
"""
EXEMPLOS DE ANÁLISE - DADOS VEÍCULOS SEMINOVOS NO SUPABASE

Execute qualquer função abaixo para trabalhar com os dados.
Pré-requisito: ter o arquivo db/.env configurado com DATABASE_URL.

Uso:
    python exemplos_analise.py
"""
import os
import sys
from pathlib import Path

# Configura o path para importar módulos
ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT / "db"))

from dotenv import load_dotenv
load_dotenv(ROOT / "db" / ".env")

import pandas as pd
import psycopg2
from psycopg2.extras import RealDictCursor


def get_connection():
    """Retorna conexão com o banco Supabase."""
    return psycopg2.connect(os.getenv("DATABASE_URL"))


# ============================================================================
# EXEMPLO 1: CARREGAR DADOS DIRETAMENTE EM DATAFRAME
# ============================================================================
def exemplo_1_carregar_dataframe():
    """Carrega últimos dados em um Pandas DataFrame para análise."""
    print("\n" + "="*70)
    print("EXEMPLO 1: Carregando dados em DataFrame")
    print("="*70)
    
    conn = get_connection()
    
    # Query: últimos 7 dias de dados
    query = """
        SELECT *
        FROM veiculos
        WHERE data_referencia >= CURRENT_DATE - INTERVAL '7 days'
        ORDER BY data_referencia DESC, fornecedora, marca_norm
    """
    
    print("Executando query e carregando em DataFrame...")
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    print(f"\n✅ DataFrame carregado: {len(df):,} linhas x {len(df.columns)} colunas")
    print(f"Período: {df['data_referencia'].min()} a {df['data_referencia'].max()}")
    print(f"\nPrimeiras 5 linhas:")
    print(df[['data_referencia', 'fornecedora', 'marca', 'modelo', 
              'preco_num', 'odometro_num', 'estado']].head())
    
    # Análises básicas com pandas
    print(f"\n📊 Estatísticas de Preço:")
    print(df['preco_num'].describe())
    
    print(f"\n📍 Distribuição por Estado:")
    print(df['estado'].value_counts().head(10))
    
    return df


# ============================================================================
# EXEMPLO 2: ANÁLISE COMPARATIVA MOVIDA vs LOCALIZA
# ============================================================================
def exemplo_2_comparacao_fornecedoras():
    """Compara preços médios entre Movida e Localiza por marca."""
    print("\n" + "="*70)
    print("EXEMPLO 2: Comparação Movida vs Localiza")
    print("="*70)
    
    conn = get_connection()
    
    query = """
        SELECT 
            marca_norm,
            fornecedora,
            COUNT(*) as qtd,
            ROUND(AVG(preco_num)) as preco_medio,
            ROUND(AVG(odometro_num)) as km_medio
        FROM veiculos
        WHERE data_referencia = (SELECT MAX(data_referencia) FROM veiculos)
        GROUP BY marca_norm, fornecedora
        HAVING COUNT(*) > 10
        ORDER BY marca_norm, fornecedora
    """
    
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    # Pivot: linhas = marca, colunas = fornecedora
    pivot = df.pivot_table(
        index='marca_norm',
        columns='fornecedora',
        values='preco_medio',
        aggfunc='first'
    )
    pivot['DIFERENÇA'] = pivot.get('MOVIDA', 0) - pivot.get('LOCALIZA', 0)
    pivot = pivot.sort_values('DIFERENÇA', ascending=False)
    
    print("\n📊 Preço Médio por Marca (Movida vs Localiza):")
    print(pivot.to_string())
    
    return pivot


# ============================================================================
# EXEMPLO 3: EVOLUÇÃO TEMPORAL DE UM MODELO
# ============================================================================
def exemplo_3_evolucao_modelo(marca='VOLKSWAGEN', modelo='POLO'):
    """Mostra evolução de preço/estoque de um modelo ao longo do tempo."""
    print("\n" + "="*70)
    print(f"EXEMPLO 3: Evolução Temporal - {marca} {modelo}")
    print("="*70)
    
    conn = get_connection()
    
    query = """
        SELECT 
            data_referencia,
            fornecedora,
            COUNT(*) as estoque,
            ROUND(AVG(preco_num)) as preco_medio,
            ROUND(MIN(preco_num)) as preco_min,
            ROUND(MAX(preco_num)) as preco_max,
            ROUND(AVG(odometro_num)) as km_medio
        FROM veiculos
        WHERE marca_norm = %s
          AND modelo_norm = %s
        GROUP BY data_referencia, fornecedora
        ORDER BY data_referencia DESC
        LIMIT 60
    """
    
    df = pd.read_sql_query(query, conn, params=(marca, modelo))
    conn.close()
    
    if df.empty:
        print(f"❌ Nenhum dado encontrado para {marca} {modelo}")
        return None
    
    print(f"\n✅ {len(df)} registros encontrados")
    print(f"Período: {df['data_referencia'].min()} a {df['data_referencia'].max()}")
    print(f"\n📈 Últimas 10 datas:")
    print(df[['data_referencia', 'fornecedora', 'estoque', 'preco_medio', 
              'preco_min', 'preco_max']].head(10).to_string(index=False))
    
    return df


# ============================================================================
# EXEMPLO 4: DETECTOR DE OPORTUNIDADES
# ============================================================================
def exemplo_4_oportunidades(limite=20):
    """Encontra veículos com preço significativamente abaixo da média."""
    print("\n" + "="*70)
    print(f"EXEMPLO 4: Detector de Oportunidades (Top {limite})")
    print("="*70)
    
    conn = get_connection()
    
    query = """
        WITH medias AS (
            SELECT 
                marca_norm,
                modelo_norm,
                AVG(preco_num) as preco_medio_modelo,
                STDDEV(preco_num) as desvio_padrao,
                COUNT(*) as amostra
            FROM veiculos
            WHERE data_referencia >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY marca_norm, modelo_norm
            HAVING COUNT(*) > 20
        )
        SELECT 
            v.fornecedora,
            v.marca,
            v.modelo,
            v.versao,
            v.ano_modelo,
            v.preco_num as preco,
            m.preco_medio_modelo,
            ROUND(((v.preco_num - m.preco_medio_modelo) / m.preco_medio_modelo) * 100, 1) 
                as desconto_pct,
            v.odometro_num as km,
            CONCAT(v.cidade, '/', v.estado) as localizacao
        FROM veiculos v
        JOIN medias m ON v.marca_norm = m.marca_norm AND v.modelo_norm = m.modelo_norm
        WHERE v.data_referencia = (SELECT MAX(data_referencia) FROM veiculos)
          AND v.preco_num < m.preco_medio_modelo - (m.desvio_padrao * 0.5)
        ORDER BY desconto_pct ASC
        LIMIT %s
    """
    
    df = pd.read_sql_query(query, conn, params=(limite,))
    conn.close()
    
    if df.empty:
        print("❌ Nenhuma oportunidade encontrada no momento.")
        return None
    
    print(f"\n✅ {len(df)} oportunidades encontradas!")
    print("\n🎯 Top Oportunidades (preço abaixo da média):")
    print(df.to_string(index=False))
    
    return df


# ============================================================================
# EXEMPLO 5: EXPORTAR PARA EXCEL
# ============================================================================
def exemplo_5_exportar_excel(output_path='relatorio_seminovos.xlsx'):
    """Gera relatório Excel com múltiplas abas de análise."""
    print("\n" + "="*70)
    print("EXEMPLO 5: Exportando relatório para Excel")
    print("="*70)
    
    conn = get_connection()
    
    # Aba 1: Resumo geral
    query_resumo = """
        SELECT 
            data_referencia,
            fornecedora,
            COUNT(*) as qtd_veiculos,
            ROUND(AVG(preco_num)) as preco_medio,
            ROUND(AVG(odometro_num)) as km_medio
        FROM veiculos
        WHERE data_referencia >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY data_referencia, fornecedora
        ORDER BY data_referencia DESC, fornecedora
    """
    df_resumo = pd.read_sql_query(query_resumo, conn)
    
    # Aba 2: Top marcas
    query_marcas = """
        SELECT 
            marca_norm as marca,
            COUNT(*) as qtd_ofertas,
            ROUND(AVG(preco_num)) as preco_medio,
            ROUND(AVG(odometro_num)) as km_medio
        FROM veiculos
        WHERE data_referencia = (SELECT MAX(data_referencia) FROM veiculos)
        GROUP BY marca_norm
        ORDER BY qtd_ofertas DESC
        LIMIT 30
    """
    df_marcas = pd.read_sql_query(query_marcas, conn)
    
    # Aba 3: Distribuição geográfica
    query_geo = """
        SELECT 
            estado,
            COUNT(*) as qtd_veiculos,
            ROUND(AVG(preco_num)) as preco_medio
        FROM veiculos
        WHERE data_referencia = (SELECT MAX(data_referencia) FROM veiculos)
          AND estado IS NOT NULL
        GROUP BY estado
        ORDER BY qtd_veiculos DESC
    """
    df_geo = pd.read_sql_query(query_geo, conn)
    
    conn.close()
    
    # Salva Excel
    output_full = ROOT / output_path
    with pd.ExcelWriter(output_full, engine='openpyxl') as writer:
        df_resumo.to_excel(writer, sheet_name='Resumo Temporal', index=False)
        df_marcas.to_excel(writer, sheet_name='Top Marcas', index=False)
        df_geo.to_excel(writer, sheet_name='Distribuição Geográfica', index=False)
    
    print(f"\n✅ Relatório Excel salvo em: {output_full}")
    print(f"   Tamanho: {output_full.stat().st_size / 1024:.1f} KB")
    print(f"   Abas: Resumo Temporal, Top Marcas, Distribuição Geográfica")
    
    return output_full


# ============================================================================
# EXEMPLO 6: DADOS CRUS (ÚLTIMA DATA) PARA ANÁLISE EXTERNA
# ============================================================================
def exemplo_6_exportar_csv_ultima_data(output_path='veiculos_ultima_data.csv'):
    """Exporta todos os dados da última data disponível em CSV."""
    print("\n" + "="*70)
    print("EXEMPLO 6: Exportando dados da última coleta para CSV")
    print("="*70)
    
    conn = get_connection()
    
    query = """
        SELECT *
        FROM veiculos
        WHERE data_referencia = (SELECT MAX(data_referencia) FROM veiculos)
        ORDER BY fornecedora, marca_norm, modelo_norm
    """
    
    df = pd.read_sql_query(query, conn)
    conn.close()
    
    output_full = ROOT / output_path
    df.to_csv(output_full, index=False, encoding='utf-8-sig')
    
    print(f"\n✅ Arquivo CSV salvo em: {output_full}")
    print(f"   Tamanho: {output_full.stat().st_size / 1024 / 1024:.1f} MB")
    print(f"   Linhas: {len(df):,}")
    print(f"   Data de referência: {df['data_referencia'].iloc[0]}")
    
    return output_full


# ============================================================================
# MENU PRINCIPAL
# ============================================================================
def main():
    """Menu interativo de exemplos."""
    print("\n" + "="*70)
    print("EXEMPLOS DE ANÁLISE - VEÍCULOS SEMINOVOS NO SUPABASE")
    print("="*70)
    print("\nEscolha um exemplo para executar:")
    print("  1 - Carregar dados em DataFrame (últimos 7 dias)")
    print("  2 - Comparação Movida vs Localiza")
    print("  3 - Evolução temporal (VW Polo)")
    print("  4 - Detector de oportunidades")
    print("  5 - Exportar relatório Excel")
    print("  6 - Exportar CSV (última data)")
    print("  0 - Executar TODOS os exemplos")
    print()
    
    escolha = input("Digite o número do exemplo (ou Enter para sair): ").strip()
    
    if not escolha:
        print("Saindo...")
        return
    
    if escolha == "1":
        exemplo_1_carregar_dataframe()
    elif escolha == "2":
        exemplo_2_comparacao_fornecedoras()
    elif escolha == "3":
        exemplo_3_evolucao_modelo()
    elif escolha == "4":
        exemplo_4_oportunidades()
    elif escolha == "5":
        exemplo_5_exportar_excel()
    elif escolha == "6":
        exemplo_6_exportar_csv_ultima_data()
    elif escolha == "0":
        print("\n🚀 Executando todos os exemplos...\n")
        exemplo_1_carregar_dataframe()
        exemplo_2_comparacao_fornecedoras()
        exemplo_3_evolucao_modelo()
        exemplo_4_oportunidades()
        exemplo_5_exportar_excel()
        exemplo_6_exportar_csv_ultima_data()
    else:
        print("❌ Opção inválida!")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrompido pelo usuário.")
    except Exception as e:
        print(f"\n❌ ERRO: {e}")
        import traceback
        traceback.print_exc()
