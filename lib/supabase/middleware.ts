import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  isSessionExpired,
  readSessionStart,
  SESSION_MODE,
  SESSION_START_COOKIE,
  sessionCookieOptions,
} from "@/lib/session-policy";

const PROTECTED_PREFIXES = ["/painel", "/portal"];

/**
 * Atualiza a sessão do Supabase a cada requisição (refresh de token) e
 * manda usuários não autenticados para /login quando tentam acessar áreas
 * protegidas. A checagem de papel/status fica nos layouts (lib/auth.ts).
 *
 * Também aplica a expiração de sessão de 45 dias (ver lib/session-policy.ts):
 * marca o início da sessão e, passado o prazo, encerra e pede novo login.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANTE: não rode código entre createServerClient e getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  // ----- Não autenticado -----
  if (!user) {
    // Higiene: zera o marcador para a próxima sessão começar a contagem do zero.
    if (request.cookies.has(SESSION_START_COOKIE)) {
      supabaseResponse.cookies.delete(SESSION_START_COOKIE);
    }
    if (isProtected) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // ----- Autenticado: aplica a política de expiração (ver session-policy.ts) -----
  const reference = readSessionStart(
    request.cookies.get(SESSION_START_COOKIE)?.value,
  );

  if (reference !== null && isSessionExpired(reference)) {
    // Passou do prazo: encerra a sessão local e manda logar de novo.
    await supabase.auth.signOut({ scope: "local" });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("expirou", "1");
    const res = NextResponse.redirect(url);
    // Replica os cookies que o signOut limpou e remove o nosso marcador.
    supabaseResponse.cookies
      .getAll()
      .forEach((c) => res.cookies.set(c.name, c.value, c));
    res.cookies.delete(SESSION_START_COOKIE);
    return res;
  }

  // Marca o timestamp da sessão. No modo "inactivity" ele desliza a cada
  // acesso (conta a partir do último uso); no "absolute" só grava na primeira
  // vez (conta a partir do login).
  if (reference === null || SESSION_MODE === "inactivity") {
    supabaseResponse.cookies.set(
      SESSION_START_COOKIE,
      String(Date.now()),
      sessionCookieOptions,
    );
  }

  return supabaseResponse;
}
