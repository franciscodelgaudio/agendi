# ADR-027: Ficha técnica pertence ao Estoque

- **Status:** Aceita
- **Data:** 2026-10

## Contexto

Inicialmente a ficha técnica foi listada no Catálogo. Mas estimar quanto de cada produto um serviço consome é uma regra de estoque, e o Catálogo é um subdomínio genérico, próximo de um CRUD.

## Decisão

`FichaTecnica` é um agregado do Estoque, uma por tipo de serviço, com versões e vigência. O Catálogo fornece apenas os tipos de serviço e os produtos.

## Consequências

A regra de consumo e sua evolução ficam junto do saldo que ela afeta. O Catálogo continua simples.

## Alternativas descartadas

Manter a ficha técnica no Catálogo.
