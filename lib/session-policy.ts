// ============================================================
// Política de sessão do ContAlert
// ------------------------------------------------------------
// O usuário continua logado entre visitas (a sessão fica nos cookies do
// Supabase e é renovada a cada acesso). Por cima disso, aplicamos uma
// expiração própria, controlada aqui. Há dois modos:
//
//  - "inactivity" (recomendado): desloga só depois de N dias SEM acessar.
//      Quem usa o sistema com frequência nunca é incomodado; contas
//      abandonadas caem sozinhas. É o padrão de apps de banco.
//
//  - "absolute": desloga N dias após o login, mesmo que a pessoa use todo
//      dia. Mais previsível, porém interrompe quem está ativo.
//
// Para mudar o comportamento ou o prazo, ajuste as duas constantes abaixo.
// A checagem acontece no proxy (lib/supabase/middleware.ts).
//
// Guardamos um timestamp num cookie httpOnly. Não assinamos o valor porque o
// cookie já é httpOnly (inacessível via JS) e o único "abuso" possível seria
// a própria pessoa esticar a própria sessão — sem ganho de acesso a nada.
// ============================================================

export type SessionMode = "inactivity" | "absolute";

// >>> Ajuste aqui <<<
export const SESSION_MODE: SessionMode = "inactivity";
export const SESSION_MAX_AGE_DAYS = 5;

export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

export const SESSION_START_COOKIE = "ca_sess_start";

// O cookie vive bem além do prazo (≈ máximo aceito pelos navegadores) para que
// a regra funcione mesmo quando a pessoa some e volta depois da janela — senão
// o marcador sumiria e a contagem reiniciaria sem querer.
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

/** Lê o timestamp (ms) guardado no cookie de sessão. */
export function readSessionStart(value: string | undefined): number | null {
  if (!value) return null;
  const ts = Number(value);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}

/** True se o tempo desde o timestamp registrado passou do prazo configurado. */
export function isSessionExpired(
  reference: number,
  now: number = Date.now(),
): boolean {
  return now - reference > SESSION_MAX_AGE_MS;
}

/** Opções do cookie de sessão. */
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: COOKIE_MAX_AGE_S,
};
