/**
 * Sistema de origem das receitas na DCTFWeb — filtro `idsSistemaOrigem` do
 * DARF (GERARGUIA31). Confirmado em teste real (ATENDBEM, 07/2026):
 *   8 = MIT (IRPJ, CSLL, PIS, COFINS)   1 = eSocial (INSS: CP-SEGUR, CP-PATRONAL)
 * Arquivo separado (sem dependências) para poder ser usado no navegador.
 */
export const ORIGEM_ESOCIAL = 1;
export const ORIGEM_MIT = 8;
