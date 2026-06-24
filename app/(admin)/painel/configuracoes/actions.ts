"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AppSettingsRow } from "@/lib/types";

export interface BrandFormState {
  error?: string;
  ok?: boolean;
}

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB

/** Atualiza o nome do app e, se enviado, troca o logo. Só o contador pode chamar. */
export async function updateBranding(
  _prev: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  await requireAdmin();
  const supabase = await createClient();

  const name = String(formData.get("brand_name") ?? "").trim();
  if (!name) return { error: "Informe o nome do escritório/empresa." };

  const file = formData.get("logo");
  const { data: current } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();
  const oldPath = (current as AppSettingsRow | null)?.logo_path ?? null;

  let logoPath = oldPath;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_LOGO_SIZE) {
      return { error: "Logo muito grande (máx. 2MB)." };
    }
    if (!file.type.startsWith("image/")) {
      return { error: "Envie uma imagem (PNG, JPG ou SVG)." };
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "png";
    const path = `logo-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("branding")
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      return { error: `Falha ao enviar a imagem: ${uploadError.message}` };
    }

    logoPath = path;
  }

  const { error } = await supabase
    .from("app_settings")
    .update({ brand_name: name, logo_path: logoPath, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) {
    if (logoPath !== oldPath) await supabase.storage.from("branding").remove([logoPath!]);
    return { error: `Falha ao salvar: ${error.message}` };
  }

  // Remove o logo antigo só depois de confirmar que o novo já está salvo.
  if (oldPath && logoPath !== oldPath) {
    await supabase.storage.from("branding").remove([oldPath]);
  }

  revalidatePath("/painel");
  revalidatePath("/portal");
  revalidatePath("/login");
  revalidatePath("/painel/configuracoes");
  return { ok: true };
}
