import { NextResponse } from "next/server";
import { lerGuia } from "@/lib/ai/ler-guia";
import {
  avisoDuplicada,
  clientePorDocumento,
  competenciaPeloVencimento,
  contadorLogado,
  erroDoArquivo,
  type AnaliseGuia,
} from "@/lib/lote";
import { createClient } from "@/lib/supabase/server";

// A leitura por IA de um PDF leva alguns segundos; folga para não cortar.
export const maxDuration = 60;

const VAZIO: Omit<AnaliseGuia, "ok" | "erro"> = {
  documento: null,
  companyId: null,
  tipo: null,
  descricao: null,
  competencia: null,
  valor: null,
  vencimento: null,
  duplicada: null,
  notas: [],
};

/**
 * Envio em lote — passo 1: lê UM PDF com IA e devolve os dados para a tela de
 * conferência (cliente pelo CNPJ, tipo, competência, valor, vencimento e aviso
 * de duplicidade). Não salva nada. Só o contador.
 */
export async function POST(request: Request) {
  if (!(await contadorLogado())) {
    return NextResponse.json({ ok: false, erro: "Sem permissão." }, { status: 403 });
  }

  const fd = await request.formData();
  const file = fd.get("file");
  const erroArquivo = erroDoArquivo(file);
  if (erroArquivo) {
    return NextResponse.json<AnaliseGuia>({ ok: false, erro: erroArquivo, ...VAZIO });
  }

  const b64 = Buffer.from(await (file as File).arrayBuffer()).toString("base64");
  const lida = await lerGuia(b64);
  if (!lida) {
    return NextResponse.json<AnaliseGuia>({
      ok: false,
      erro: "A IA não conseguiu ler este PDF. Preencha à mão.",
      ...VAZIO,
    });
  }

  const supabase = await createClient();
  const companyId = await clientePorDocumento(
    supabase,
    lida.documento,
    lida.documentos,
  );

  // Sem competência no PDF: estima pelo vencimento (mês anterior) e avisa.
  const notas: string[] = [];
  let competencia = lida.competencia;
  if (!competencia && lida.vencimento) {
    competencia = competenciaPeloVencimento(lida.vencimento);
    notas.push("competência estimada pelo vencimento — confira");
  }

  const duplicada =
    companyId && lida.tipo && competencia
      ? await avisoDuplicada(supabase, companyId, lida.tipo, competencia)
      : null;

  return NextResponse.json<AnaliseGuia>({
    ok: true,
    documento: lida.documento,
    companyId,
    tipo: lida.tipo,
    descricao: lida.descricao,
    competencia,
    valor: lida.valor,
    vencimento: lida.vencimento,
    duplicada,
    notas,
  });
}
