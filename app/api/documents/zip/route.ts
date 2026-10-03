import { after, NextResponse } from "next/server";
import { zipSync } from "fflate";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Máximo de arquivos por zip (evita pedidos enormes). */
const MAX_ARQUIVOS = 60;

/** Nome seguro dentro do zip, sem repetir (acrescenta " (2)", " (3)"...). */
function nomeUnico(nome: string, usados: Set<string>): string {
  const limpo = nome.replace(/[\\/:*?"<>|]+/g, "_").trim() || "arquivo";
  if (!usados.has(limpo)) {
    usados.add(limpo);
    return limpo;
  }
  const ponto = limpo.lastIndexOf(".");
  const base = ponto > 0 ? limpo.slice(0, ponto) : limpo;
  const ext = ponto > 0 ? limpo.slice(ponto) : "";
  for (let i = 2; ; i++) {
    const tentativa = `${base} (${i})${ext}`;
    if (!usados.has(tentativa)) {
      usados.add(tentativa);
      return tentativa;
    }
  }
}

/**
 * Baixa vários documentos de uma vez num .zip: GET /api/documents/zip?ids=a,b
 * (&nome=boletos). A RLS garante que só entram documentos que o usuário pode
 * ver; ids de outras empresas são ignorados. Usado pelo "Baixar" da seleção
 * múltipla (Meus boletos) e pelo "Baixar tudo" (folha do mês).
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ids = (params.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_ARQUIVOS);
  const nomeZip =
    (params.get("nome") ?? "documentos").replace(/[^\w\-]+/g, "_") || "documentos";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (ids.length === 0) {
    return new NextResponse("Nenhum documento selecionado.", { status: 400 });
  }

  const { data: docs } = await supabase
    .from("documents")
    .select("id,file_path,file_name")
    .in("id", ids);

  const comArquivo = (docs ?? []).filter(
    (d): d is { id: string; file_path: string; file_name: string | null } =>
      !!d.file_path,
  );
  if (comArquivo.length === 0) {
    return new NextResponse("Nenhum arquivo disponível para baixar.", {
      status: 404,
    });
  }

  const usados = new Set<string>();
  const arquivos: Record<string, Uint8Array> = {};
  const baixados: string[] = [];
  await Promise.all(
    comArquivo.map(async (d) => {
      const { data: blob } = await supabase.storage
        .from("boletos")
        .download(d.file_path);
      if (!blob) return;
      const nome = nomeUnico(
        d.file_name ?? d.file_path.split("/").pop() ?? "arquivo",
        usados,
      );
      arquivos[nome] = new Uint8Array(await blob.arrayBuffer());
      baixados.push(d.id);
    }),
  );

  if (baixados.length === 0) {
    return new NextResponse("Arquivos indisponíveis. Fale com seu contador.", {
      status: 404,
    });
  }

  // PDFs e imagens já são comprimidos: só empacota (level 0, mais rápido).
  const zip = zipSync(arquivos, { level: 0 });

  // "Visto": igual ao download individual — marca o 1º acesso do CLIENTE.
  after(async () => {
    try {
      const admin = createAdminClient();
      const { data: prof } = await admin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (prof?.role !== "client") return;
      await admin
        .from("documents")
        .update({ first_viewed_at: new Date().toISOString() })
        .in("id", baixados)
        .is("first_viewed_at", null);
    } catch {
      /* best-effort: nunca atrapalha o download */
    }
  });

  return new NextResponse(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${nomeZip}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
