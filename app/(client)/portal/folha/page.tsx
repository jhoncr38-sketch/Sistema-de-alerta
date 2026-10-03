import { redirect } from "next/navigation";

/** A folha agora mora em "Documentos e folha" (aba Folha, a padrão). */
export default function PortalFolhaPage() {
  redirect("/portal/documentos");
}
