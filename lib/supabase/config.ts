const PLACEHOLDER_VALUES = new Set([
  "",
  "https://SEU-PROJETO.supabase.co",
  "sua-anon-key",
  "sua-service-role-key",
]);

/** True quando a URL e a anon key do Supabase foram preenchidas (não são placeholders). */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return (
    url.startsWith("http") &&
    !PLACEHOLDER_VALUES.has(url) &&
    !PLACEHOLDER_VALUES.has(anon)
  );
}

export const SUPABASE_NOT_CONFIGURED_MSG =
  "O Supabase ainda não foi configurado. Preencha o arquivo contalert/.env.local com a URL e as chaves do seu projeto Supabase e reinicie o servidor (npm run dev).";
