/**
 * Helpers SQL para normalização de modelos entre fornecedoras.
 *
 * Problema: Localiza usa "ONIX" para hatch e sedan (PLUS aparece na versão),
 *           Movida separa em "ONIX" (hatch) e "ONIX PLUS" (sedan).
 *
 * MODELO_UNIF normaliza para que ambas usem "ONIX" e "ONIX PLUS".
 *
 * VERSAO_NORM remove o prefixo "LONGITUDE" da Localiza e padroniza case,
 * para comparações cross-supplier mais precisas.
 */

/** Expressão SQL: unifica modelo_norm entre fornecedoras.
 *  @param alias - prefixo de tabela (ex: 'v' → 'v.modelo_norm'). Sem alias = coluna direta. */
export function modeloUnif(alias?: string): string {
  const mn = alias ? `${alias}.modelo_norm` : 'modelo_norm';
  const vs = alias ? `${alias}.versao` : 'versao';
  return `CASE WHEN ${mn} = 'ONIX' AND UPPER(${vs}) LIKE '%PLUS%' THEN 'ONIX PLUS' ELSE ${mn} END`;
}

/** Atalho sem alias (uso mais comum) */
export const MODELO_UNIF = modeloUnif();

/** Expressão SQL: normaliza versão removendo prefixo LONGITUDE da Localiza */
export const VERSAO_NORM = `
  UPPER(
    TRIM(
      REGEXP_REPLACE(
        REGEXP_REPLACE(versao, '^LONGITUDE\\s*', '', 'i'),
        '\\s+', ' ', 'g'
      )
    )
  )`;
