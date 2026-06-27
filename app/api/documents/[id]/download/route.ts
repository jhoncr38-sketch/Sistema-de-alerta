import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Gera uma URL assinada temporária para baixar o boleto.
 * A RLS garante que o usuário só acessa documentos da própria empresa
 * (ou tudo, se for admin). IDs de outras empresas retornam 404.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const searchParams = new URL(request.url).searchParams;
  // ?view=1 abre o arquivo no navegador (inline); sem isso, força o download.
  const inline = searchParams.get("view") === "1";
  // ?tipo=comprovante baixa o comprovante de pagamento em vez do boleto.
  const isComprovante = searchParams.get("tipo") === "comprovante";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("file_path,file_name,comprovante_path,comprovante_name")
    .eq("id", id)
    .single();

  if (!doc) {
    return new NextResponse("Documento não encontrado.", { status: 404 });
  }

  const filePath = isComprovante ? doc.comprovante_path : doc.file_path;
  const fileName = isComprovante ? doc.comprovante_name : doc.file_name;

  if (!filePath) {
    return new NextResponse(
      "Arquivo indisponível (ainda não foi enviado). Fale com seu contador.",
      { status: 404 },
    );
  }

  const { data: signed, error } = await supabase.storage
    .from("boletos")
    // Mais tempo na visualização (fica aberto na tela); download é rápido.
    .createSignedUrl(filePath, inline ? 600 : 60, {
      ...(inline || !fileName ? {} : { download: fileName }),
    });

  if (error || !signed) {
    return new NextResponse(
      "Arquivo indisponível (ainda não foi enviado). Fale com seu contador.",
      { status: 404 },
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
