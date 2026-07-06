"use client";

import { usePathname } from "next/navigation";
import {
  AssistenteChat,
  type AssistenteTela,
} from "@/components/assistente-chat";

/**
 * Coloca o botão flutuante do assistente em TODAS as telas do portal do cliente
 * (montado no layout), detectando a tela atual pela URL para a IA responder no
 * contexto certo (boletos, faturamento, rewards...). Telas sem foco específico
 * caem em "geral". É Client Component só por causa do usePathname.
 */

/** Prefixo da rota -> contexto da IA. A ordem importa (mais específico primeiro). */
const ROTA_PARA_TELA: Array<[string, AssistenteTela]> = [
  ["/portal/boletos", "boletos"],
  ["/portal/faturamento", "faturamento"],
  ["/portal/documentos", "documentos"],
  ["/portal/folha", "folha"],
  ["/portal/rewards", "rewards"],
  ["/portal/parcelamentos", "parcelamentos"],
];

function telaDaRota(pathname: string): AssistenteTela {
  for (const [prefixo, tela] of ROTA_PARA_TELA) {
    if (pathname.startsWith(prefixo)) return tela;
  }
  return "geral";
}

export function AssistentePortal() {
  const pathname = usePathname();
  return <AssistenteChat scope="cliente" tela={telaDaRota(pathname)} />;
}
