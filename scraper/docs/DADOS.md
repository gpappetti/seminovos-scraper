# Documentação dos dados

Este documento descreve em detalhes o esquema dos dados coletados e a origem
de cada campo.

## Esquema padronizado

Ambas as fontes (Movida e Localiza) são normalizadas para o mesmo conjunto de
colunas, facilitando a análise conjunta.

| Coluna          | Tipo    | Movida (campo de origem)        | Localiza (campo de origem)                              |
|-----------------|---------|---------------------------------|---------------------------------------------------------|
| `MARCA`         | texto   | `marca`                         | `marcaDescricao`                                        |
| `MODELO`        | texto   | `modelo`                        | `modeloFamiliaDescricao`                                |
| `VERSÃO`        | texto   | `versao`                        | `versaoDescricao` + `modeloDescricaoReduzida`           |
| `ODÔMETRO`      | número  | `quilometragem`                 | `odometro`                                              |
| `ANO/MODELO`    | texto   | `ano_fabricacao`/`ano_modelo`   | `anoFabricacao`/`anoModelo`                             |
| `CÂMBIO`        | texto   | `transmissao`                   | `tipoTransmissaoDescricao`                              |
| `PREÇO`         | número  | `preco`                         | `preco`                                                 |
| `CIDADE/ESTADO` | texto   | `cidade`/`uf`                   | `cidadeDescricao`/`siglaEstado`                         |

## Origem dos dados

### Movida
- Endpoint: `https://be-seminovos.movidacloud.com.br/elasticsearch/veiculos`
- Método: `POST` com corpo `{"from": "<offset>"}`
- Paginação por *offset* (20 itens por página).

### Localiza
- Endpoint: `https://seminovos.localiza.com/_next/data/<buildId>/carros.json`
- Método: `GET` com parâmetro `page`
- O `buildId` é detectado dinamicamente a partir do HTML da página
  `https://seminovos.localiza.com/carros`.

## Observações

- Os valores de `PREÇO` e `ODÔMETRO` podem vir como números; converta com
  `astype(float)` antes de operações numéricas, se necessário.
- Campos ausentes são preenchidos com string vazia.
