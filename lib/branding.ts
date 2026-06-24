import { createClient } from "@/lib/supabase/server";
import { APP_NAME } from "@/lib/constants";
import type { AppSettingsRow } from "@/lib/types";

export interface Branding {
  name: string;
  logoUrl: string | null;
}

/** Nome e logo configurados pelo contador. Cai no padrão se ainda não houver registro. */
export async function getBranding(): Promise<Branding> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", true)
    .maybeSingle();

  const settings = data as AppSettingsRow | null;
  if (!settings) return { name: APP_NAME, logoUrl: null };

  let logoUrl: string | null = null;
  if (settings.logo_path) {
    const { data: pub } = supabase.storage
      .from("branding")
      .getPublicUrl(settings.logo_path);
    logoUrl = pub.publicUrl;
  }

  return { name: settings.brand_name || APP_NAME, logoUrl };
}
