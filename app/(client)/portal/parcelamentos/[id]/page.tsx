import { redirect } from "next/navigation";

/** O detalhe agora fica na mesma página da lista (?plano=<id>). */
export default async function PortalParcelamentoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/portal/parcelamentos?plano=${encodeURIComponent(id)}`);
}
