"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { notifyAviso } from "@/lib/email/notify";
import { createClient } from "@/lib/supabase/server";

export interface AvisoFormState {
  error?: string;
  ok?: boolean;
}

function revalidateAvisos() {
  revalidatePath("/painel/solicitacoes");
  revalidatePath("/portal");
}

/** Admin cria um aviso/comunicado para uma empresa (ou todas, se company_id null). */
export async function createAviso(
  _prev: AvisoFormState,
  formData: FormData,
): Promise<AvisoFormState> {
  const { profile } = await requireAdmin();

  const companyRaw = String(formData.get("company_id") ?? "");
  const companyId = companyRaw === "all" || companyRaw === "" ? null : companyRaw;
  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const notify = formData.get("notify") === "1";

  if (!companyRaw) {
    return { error: "Escolha a empresa (ou “Todas as empresas”)." };
  }
  if (!title || !message) {
    return { error: "Informe o título e a mensagem do aviso." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("avisos").insert({
    company_id: companyId,
    title,
    message,
    created_by: profile.id,
  });
  if (error) return { error: `Falha ao enviar aviso: ${error.message}` };

  if (notify) {
    // E-mail best-effort, fora do caminho crítico.
    after(async () => {
      try {
        await notifyAviso({ companyId, title, message });
      } catch {
        /* o e-mail nunca quebra a criação do aviso */
      }
    });
  }

  revalidateAvisos();
  return { ok: true };
}

/** Admin exclui um aviso. */
export async function deleteAviso(id: string) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("avisos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateAvisos();
}
