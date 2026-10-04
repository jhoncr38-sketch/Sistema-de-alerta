import { formatUltimoAcesso } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

export interface UltimoAcesso {
  /** Texto relativo pronto: "Hoje", "Há 3 dias", "Nunca acessou". */
  texto: string;
  /** ISO exato, para o tooltip (data/hora completa). */
  iso: string | null;
  /** Nunca entrou, ou faz mais de 30 dias — destaque visual pro contador. */
  sumido: boolean;
}

/**
 * "Último acesso" de cada usuário, direto do Supabase Auth
 * (auth.users.last_sign_in_at). É preenchido automaticamente a cada login —
 * não gravamos nada, não pesa no site do cliente. Só o contador vê.
 *
 * Retorna um mapa id -> UltimoAcesso já formatado. O "agora" é calculado aqui
 * (função utilitária, fora do render — a regra de pureza do React proíbe
 * Date.now() no corpo do componente). Se der qualquer erro (ex.: service role
 * ausente), devolve mapa vazio e a página segue funcionando.
 */
export async function fetchUltimosAcessos(): Promise<Map<string, UltimoAcesso>> {
  const mapa = new Map<string, UltimoAcesso>();
  const agora = Date.now();
  try {
    const admin = createAdminClient();
    // listUsers é paginado. Percorremos até acabar, para não perder clientes
    // quando o escritório passar de uma página de cadastros.
    for (let page = 1; page <= 100; page++) {
      const { data, error } = await admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error || !data?.users?.length) break;
      for (const u of data.users) {
        const iso = u.last_sign_in_at ?? null;
        const dias = iso
          ? Math.floor((agora - new Date(iso).getTime()) / 86_400_000)
          : Infinity;
        mapa.set(u.id, {
          texto: formatUltimoAcesso(iso, agora),
          iso,
          sumido: dias > 30,
        });
      }
      if (data.users.length < 200) break;
    }
  } catch {
    // silencioso: sem último acesso a página ainda funciona.
  }
  return mapa;
}

export interface AcessoEmpresa {
  /** Último login de QUALQUER pessoa com acesso à empresa (null = ninguém entrou). */
  iso: string | null;
  /** Dias desde esse acesso (Infinity = nunca). */
  dias: number;
  /** A empresa tem alguém com acesso cadastrado? */
  temUsuario: boolean;
}

/**
 * Último acesso por EMPRESA: o mais recente entre as pessoas vinculadas a ela
 * (client_companies + profiles.company_id). Base de "Sem acessar 30+ dias" e
 * "Nunca acessou" no painel do contador.
 */
export function acessoPorEmpresa(
  vinculos: { profile_id: string; company_id: string }[],
  usuarios: Map<string, UltimoAcesso>,
  agora: number = Date.now(),
): Map<string, AcessoEmpresa> {
  const out = new Map<string, AcessoEmpresa>();
  for (const v of vinculos) {
    const atual = out.get(v.company_id) ?? { iso: null, dias: Infinity, temUsuario: false };
    atual.temUsuario = true;
    const iso = usuarios.get(v.profile_id)?.iso ?? null;
    if (iso && (!atual.iso || iso > atual.iso)) {
      atual.iso = iso;
      atual.dias = Math.floor((agora - new Date(iso).getTime()) / 86_400_000);
    }
    out.set(v.company_id, atual);
  }
  return out;
}
