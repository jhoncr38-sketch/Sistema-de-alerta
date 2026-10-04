/**
 * Sugere a empresa de um cadastro pendente pelo domínio do e-mail
 * (marina@lumestudio.com.br → "Studio Lume"). Ignora provedores genéricos
 * (gmail, hotmail…), onde o domínio não diz nada sobre a empresa.
 */

const GENERICOS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "uol.com.br",
  "bol.com.br",
  "terra.com.br",
  "ig.com.br",
  "globo.com",
  "globomail.com",
  "r7.com",
  "zipmail.com.br",
  "protonmail.com",
  "proton.me",
  "aol.com",
]);

/** Palavras que não ajudam a reconhecer a empresa. */
const RUIDO = /\b(ltda|me|epp|eireli|s\/?a|sa|cia|comercio|servicos|e|de|da|do|das|dos)\b/g;

/** "Auto Peças Silva Ltda" → ["auto", "pecas", "silva"]. */
function palavras(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/ ]/g, " ")
    .replace(RUIDO, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 3);
}

/** "joao@autopecassilva.com.br" → "autopecassilva". */
function baseDoDominio(dominio: string): string {
  const partes = dominio.split(".");
  // tira o sufixo (.com, .com.br, .net.br…) e fica com o nome principal
  const nome = partes.find((p) => !["www", "mail", "email"].includes(p)) ?? partes[0];
  return nome.replace(/[^a-z0-9]/g, "");
}

/** O nome bate com o domínio? Todas as palavras do nome aparecem nele
 *  ("Studio Lume" ↔ "lumestudio") ou o domínio está dentro do nome. */
function nomeBate(nome: string | null, base: string): boolean {
  if (!nome) return false;
  const ps = palavras(nome);
  if (ps.length === 0) return false;
  if (ps.every((p) => base.includes(p))) return true;
  // domínio abreviado ("autopecas" em "Auto Peças Silva"): só se cobrir boa parte do nome
  const junto = ps.join("");
  return base.length >= 5 && junto.includes(base) && base.length >= junto.length * 0.6;
}

export function sugerirEmpresa<T extends { id: string; razao_social: string; nome_fantasia: string | null; email: string | null }>(
  email: string | null,
  empresas: T[],
): T | null {
  const dominio = email?.split("@")[1]?.trim().toLowerCase();
  if (!dominio || GENERICOS.has(dominio)) return null;

  // 1) mesmo domínio do e-mail cadastrado na empresa
  const porEmail = empresas.filter((c) => c.email?.split("@")[1]?.trim().toLowerCase() === dominio);
  if (porEmail.length === 1) return porEmail[0];

  // 2) domínio parecido com o nome (fantasia ou razão social)
  const base = baseDoDominio(dominio);
  if (base.length < 4) return null;
  const candidatas = empresas.filter(
    (c) => nomeBate(c.nome_fantasia, base) || nomeBate(c.razao_social, base),
  );
  return candidatas.length === 1 ? candidatas[0] : null;
}
