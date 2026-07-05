import { docTypeLabel, APP_NAME } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocCategoria, DocType } from "@/lib/types";

export type AlertKind = "vencido" | "vence_hoje" | "dias_1" | "dias_3" | "dias_7";

const TITLE: Record<AlertKind, string> = {
  vencido: "Você tem um boleto vencido",
  vence_hoje: "Seu boleto vence hoje",
  dias_1: "Seu boleto vence amanhã",
  dias_3: "Seu boleto vence em 3 dias",
  dias_7: "Seu boleto vence em 7 dias",
};

// Marca do contador.
const BRAND_NAME = "S J Contabilidade";
const BRAND_TAGLINE = "Contabilidade com excelência, resultados com confiança";
// Logo no bucket público `branding` do Supabase. Se trocar a logo no painel,
// atualize este nome de arquivo (ou o e-mail mostra o texto alternativo).
const LOGO_URL =
  "https://qupsxlipqrsuyfeljlkm.supabase.co/storage/v1/object/public/branding/logo-1782297905570.png";

// ----- Paleta (claro + dourado, rodapé escuro) -----
const GOLD = "#c8a24a";
const GOLD_LIGHT = "#e6c66e";
const GOLD_DARK = "#9a7b2e";
const BG_OUTER = "#e9e7e1";
const CARD = "#ffffff";
const BORDER = "#e7e3d8";
const ROW_BORDER = "#efece4";
const HEAD_DARK = "#1f2733";
const TEXT = "#2b2f36";
const MUTED = "#8a8f98";
const FOOTER_BG = "#0e1320";

const DANGER = "#c0392b";
const WARN = "#c8821e";
const SUCCESS = "#1a7f4b";
const INFO = "#2563a8";

// Cor de destaque por tipo de alerta (linha sob o cabeçalho e valor do vencimento).
const ACCENT: Record<AlertKind, string> = {
  vencido: DANGER,
  vence_hoje: WARN,
  dias_1: WARN,
  dias_3: INFO,
  dias_7: INFO,
};

/** Data/hora atual no fuso de Brasília, ex.: "29/06/2026 às 05:39". */
function geradoEm(): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return fmt.format(new Date()).replace(", ", " às ");
}

/** Parágrafo (cor escura — fundo claro). */
function p(html: string): string {
  return `<p style="margin:0 0 12px;color:${TEXT};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6">${html}</p>`;
}

/** Destaque (nome do cliente) em dourado escuro, legível no branco. */
function b(text: string): string {
  return `<strong style="color:${GOLD_DARK}">${text}</strong>`;
}

/** Botão dourado (table-based; aparece com fundo até no Outlook). */
function button(href: string, label: string): string {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px">
    <tr><td align="center" bgcolor="${GOLD}" style="border-radius:8px;background:${GOLD};background:linear-gradient(90deg,${GOLD_DARK},${GOLD_LIGHT})">
      <a href="${href}" style="display:inline-block;padding:12px 26px;color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;text-decoration:none;letter-spacing:.5px;text-transform:uppercase">&#128202;&nbsp;&nbsp;${label}</a>
    </td></tr>
  </table>`;
}

/** Linha rótulo/valor das tabelas simples. */
function row(label: string, value: string, valueColor: string = TEXT): string {
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid ${ROW_BORDER};color:${MUTED};font-family:Arial,Helvetica,sans-serif;font-size:13px">${label}</td>
    <td style="padding:8px 0;border-bottom:1px solid ${ROW_BORDER};text-align:right;font-weight:bold;color:${valueColor};font-family:Arial,Helvetica,sans-serif;font-size:13px">${value}</td>
  </tr>`;
}

function infoTable(rowsHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0">${rowsHtml}</table>`;
}

/** Cabeçalho de coluna dourado (tabelas de resumo). */
function th(label: string, align: "left" | "center" | "right" = "left"): string {
  return `<th align="${align}" bgcolor="#faf6ec" style="padding:9px 10px;background:#faf6ec;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:.5px;text-transform:uppercase;color:${GOLD_DARK};border-bottom:2px solid #ead9b0">${label}</th>`;
}

/**
 * Moldura de todos os e-mails: claro + dourado, logo da SJ no topo e no rodapé,
 * e barra escura inferior com a tagline. `accent` colore a linha sob o cabeçalho
 * (urgência). `generated` adiciona "Relatório gerado em ...".
 */
function shell(opts: {
  headline: string;
  accent: string;
  bodyHtml: string;
  footer?: string;
  generated?: boolean;
}): string {
  const {
    headline,
    accent,
    bodyHtml,
    footer = `Você recebeu este e-mail porque tem acesso ao portal ${APP_NAME}.`,
    generated = false,
  } = opts;
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG_OUTER};margin:0;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${CARD};border:1px solid ${BORDER};border-radius:14px;overflow:hidden">
      <!-- faixa dourada superior -->
      <tr><td style="height:4px;line-height:4px;font-size:0;background:${GOLD};background:linear-gradient(90deg,${GOLD_DARK},${GOLD_LIGHT},${GOLD_DARK})">&nbsp;</td></tr>
      <!-- cabeçalho: logo + ContAlert + subtítulo -->
      <tr><td style="padding:22px 28px 14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="62" valign="middle">
            <img src="${LOGO_URL}" width="54" alt="${BRAND_NAME}" style="display:block;border:0;height:auto" />
          </td>
          <td valign="middle" style="padding-left:14px">
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:24px;font-weight:bold;letter-spacing:.3px"><span style="color:${HEAD_DARK}">Cont</span><span style="color:${GOLD}">Alert</span></div>
            <div style="color:${MUTED};font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;margin-top:4px">${headline}</div>
          </td>
        </tr></table>
      </td></tr>
      <!-- linha de destaque (urgência) -->
      <tr><td style="padding:0 28px"><div style="height:2px;background:${accent};border-radius:2px"></div></td></tr>
      <!-- corpo -->
      <tr><td style="padding:20px 28px 22px">${bodyHtml}</td></tr>
      <!-- rodapé claro: logo + nota + data -->
      <tr><td style="padding:14px 28px;border-top:1px solid ${ROW_BORDER}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td valign="middle"><img src="${LOGO_URL}" width="26" alt="${BRAND_NAME}" style="display:block;border:0;height:auto" /></td>
              <td valign="middle" style="padding-left:10px;color:${MUTED};font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4">${footer}</td>
            </tr></table>
          </td>
          ${
            generated
              ? `<td valign="middle" align="right" style="color:${MUTED};font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.4;white-space:nowrap">&#128197;&nbsp;Relatório gerado em:<br>${geradoEm()}</td>`
              : ""
          }
        </tr></table>
      </td></tr>
      <!-- barra escura com a marca -->
      <tr><td bgcolor="${FOOTER_BG}" style="background:${FOOTER_BG};padding:13px 24px;text-align:center">
        <span style="color:${GOLD_LIGHT};font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:bold;letter-spacing:.8px;text-transform:uppercase">${BRAND_NAME} &nbsp;|&nbsp; ${BRAND_TAGLINE}</span>
      </td></tr>
    </table>
  </td></tr>
</table>`;
}

/** Alerta de vencimento de boleto/guia (7 dias, 3 dias, hoje, vencido). */
export function alertEmail(opts: {
  companyName: string;
  type: DocType;
  competencia: string;
  amount: number;
  dueDate: string;
  kind: AlertKind;
  portalUrl: string;
}) {
  const { companyName, type, competencia, amount, dueDate, kind, portalUrl } =
    opts;
  const accent = ACCENT[kind];
  const subject = `${TITLE[kind]} — ${docTypeLabel(type)}`;
  const body = `
        ${p(`Olá, ${b(companyName)}!`)}
        ${p("Este é um aviso sobre a seguinte obrigação:")}
        ${infoTable(`
          ${row("Imposto", docTypeLabel(type))}
          ${competencia ? row("Competência", competencia) : ""}
          ${row("Valor", formatCurrency(amount))}
          ${row("Vencimento", formatDate(dueDate), accent)}
        `)}
        ${button(portalUrl, "Ver e baixar o boleto")}`;
  return {
    subject,
    html: shell({ headline: TITLE[kind], accent, bodyHtml: body }),
  };
}

/** Parcela de parcelamento (REFIS) vencida — alerta com risco de exclusão. */
export function parcelaRiscoEmail(opts: {
  companyName: string;
  type: DocType;
  planNome: string;
  parcelaNum: number | null;
  total: number | null;
  amount: number;
  dueDate: string;
  portalUrl: string;
}) {
  const { companyName, type, planNome, parcelaNum, total, amount, dueDate, portalUrl } =
    opts;
  const headline = "Parcela do parcelamento em atraso";
  const subject = `Atenção: parcela em atraso — ${planNome}`;
  const parcelaLabel =
    parcelaNum && total ? `${parcelaNum}/${total}` : parcelaNum ? `${parcelaNum}` : "—";
  const body = `
        ${p(`Olá, ${b(companyName)}!`)}
        ${p(`<span style="color:${DANGER};font-weight:bold">Uma parcela do seu parcelamento venceu e ainda consta em aberto.</span>`)}
        ${p("Parcelamentos podem ser <strong>cancelados/excluídos</strong> em caso de atraso. Regularize o quanto antes para não perder o acordo.")}
        ${infoTable(`
          ${row("Parcelamento", planNome)}
          ${row("Guia", docTypeLabel(type))}
          ${row("Parcela", parcelaLabel)}
          ${row("Valor", formatCurrency(amount))}
          ${row("Vencimento", formatDate(dueDate), DANGER)}
        `)}
        ${button(portalUrl, "Ver parcelamento e pagar")}`;
  return { subject, html: shell({ headline, accent: DANGER, bodyHtml: body }) };
}

/** Novo documento (boleto, folha ou documento institucional) disponível no portal. */
export function novoDocumentoEmail(opts: {
  companyName: string;
  categoria: DocCategoria;
  type: DocType;
  competencia: string | null;
  amount: number | null;
  dueDate: string | null;
  count: number;
  portalUrl: string;
}) {
  const { companyName, categoria, type, competencia, amount, dueDate, count, portalUrl } =
    opts;
  const isBoleto = categoria === "boleto" || categoria === "parcelamento";
  const headline = isBoleto ? "Novo boleto disponível" : "Novo documento disponível";
  const subject = `${headline} — ${docTypeLabel(type)}`;
  const intro =
    count > 1
      ? `${count} novos arquivos foram disponibilizados no seu portal:`
      : "Um novo documento foi disponibilizado no seu portal:";
  const body = `
        ${p(`Olá, ${b(companyName)}!`)}
        ${p(intro)}
        ${infoTable(`
          ${row("Tipo", docTypeLabel(type))}
          ${competencia ? row("Competência", competencia) : ""}
          ${amount != null ? row("Valor", formatCurrency(amount)) : ""}
          ${dueDate ? row("Vencimento", formatDate(dueDate), INFO) : ""}
        `)}
        ${button(portalUrl, isBoleto ? "Ver e baixar o boleto" : "Ver no portal")}`;
  return { subject, html: shell({ headline, accent: INFO, bodyHtml: body }) };
}

/** Confirmação de pagamento registrado. */
export function pagamentoConfirmadoEmail(opts: {
  companyName: string;
  type: DocType;
  competencia: string | null;
  amount: number | null;
  portalUrl: string;
}) {
  const { companyName, type, competencia, amount, portalUrl } = opts;
  const headline = "Pagamento confirmado";
  const subject = `Pagamento confirmado — ${docTypeLabel(type)}`;
  const body = `
        ${p(`Olá, ${b(companyName)}!`)}
        ${p("Registramos o pagamento da seguinte obrigação. Obrigado!")}
        ${infoTable(`
          ${row("Imposto", docTypeLabel(type))}
          ${competencia ? row("Competência", competencia) : ""}
          ${amount != null ? row("Valor", formatCurrency(amount), SUCCESS) : ""}
        `)}
        ${button(portalUrl, "Ver no portal")}`;
  return { subject, html: shell({ headline, accent: SUCCESS, bodyHtml: body }) };
}

/** Aviso AO CONTADOR: um cliente declarou pagamento e aguarda confirmação. */
export function pagamentoAguardandoEmail(opts: {
  companyName: string;
  type: DocType;
  competencia: string | null;
  amount: number | null;
  painelUrl: string;
}) {
  const { companyName, type, competencia, amount, painelUrl } = opts;
  const headline = "Pagamento aguardando confirmação";
  const subject = `Confirmar pagamento — ${companyName} · ${docTypeLabel(type)}`;
  const body = `
        ${p(`O cliente ${b(companyName)} marcou uma guia como paga e aguarda a sua confirmação.`)}
        ${infoTable(`
          ${row("Cliente", companyName)}
          ${row("Guia", docTypeLabel(type))}
          ${competencia ? row("Competência", competencia) : ""}
          ${amount != null ? row("Valor", formatCurrency(amount), WARN) : ""}
        `)}
        ${p("Abra o painel para confirmar ou rejeitar o pagamento.")}
        ${button(painelUrl, "Confirmar no painel")}`;
  return { subject, html: shell({ headline, accent: WARN, bodyHtml: body }) };
}

/** Resumo mensal (gerado por IA/cron): panorama do mês para o cliente. */
export function resumoMensalEmail(opts: {
  companyName: string;
  competenciaLabel: string; // "junho de 2026"
  texto: string; // resumo já redigido (pt-BR)
  portalUrl: string;
}) {
  const { companyName, competenciaLabel, texto, portalUrl } = opts;
  const headline = `Seu resumo de ${competenciaLabel}`;
  const subject = `Resumo de ${competenciaLabel} — ${companyName}`;
  const body = `
        ${p(`Olá, ${b(companyName)}!`)}
        ${p(texto)}
        ${button(portalUrl, "Ver no portal")}`;
  return { subject, html: shell({ headline, accent: INFO, bodyHtml: body }) };
}

/** Cliente subiu de nível no Clube SJ (SJ Rewards). */
export function nivelAlcancadoEmail(opts: {
  companyName: string;
  levelName: string;
  perks: string[];
  portalUrl: string;
}) {
  const { companyName, levelName, perks, portalUrl } = opts;
  const headline = "Você subiu de nível!";
  const subject = `Parabéns! Você chegou ao nível ${levelName} — Clube SJ`;
  const perksHtml = perks
    .map(
      (pk) =>
        `<p style="margin:0 0 8px;color:${TEXT};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">&#10004;&nbsp; ${pk}</p>`,
    )
    .join("");
  const body = `
        ${p(`Olá, ${b(companyName)}!`)}
        ${p(`Você alcançou o nível <strong style="color:${GOLD_DARK}">${levelName}</strong> no Clube SJ. &#127881;`)}
        ${perks.length ? p("Vantagens que passam a valer:") + perksHtml : ""}
        ${button(portalUrl, "Ver meu Clube SJ")}`;
  return { subject, html: shell({ headline, accent: GOLD, bodyHtml: body }) };
}

/** Cliente desbloqueou uma ou mais conquistas (medalhas). */
export function conquistaEmail(opts: {
  companyName: string;
  achievements: { name: string; description: string }[];
  portalUrl: string;
}) {
  const { companyName, achievements, portalUrl } = opts;
  const many = achievements.length > 1;
  const headline = many ? "Novas conquistas!" : "Nova conquista!";
  const subject = many
    ? `Você desbloqueou ${achievements.length} conquistas — Clube SJ`
    : `Nova conquista: ${achievements[0]?.name} — Clube SJ`;
  const list = achievements
    .map(
      (a) =>
        `<p style="margin:0 0 8px;color:${TEXT};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">&#127941;&nbsp; <strong style="color:${GOLD_DARK}">${a.name}</strong> — ${a.description}</p>`,
    )
    .join("");
  const body = `
        ${p(`Olá, ${b(companyName)}!`)}
        ${p(many ? "Você desbloqueou novas medalhas no Clube SJ:" : "Você desbloqueou uma nova medalha no Clube SJ:")}
        ${list}
        ${button(portalUrl, "Ver minhas conquistas")}`;
  return { subject, html: shell({ headline, accent: GOLD, bodyHtml: body }) };
}

export interface DigestItem {
  type: DocType;
  competencia: string | null;
  amount: number | null;
  dueDate: string;
  statusLabel: string;
  isParcela: boolean;
}

/** Resumo (semanal) dos próximos vencimentos enviado ao cliente. */
export function weeklyDigestEmail(opts: {
  companyName: string;
  items: DigestItem[];
  portalUrl: string;
}) {
  const { companyName, items, portalUrl } = opts;
  const headline = "Resumo dos próximos vencimentos";
  const subject = `Resumo da semana — ${items.length} ${items.length === 1 ? "obrigação" : "obrigações"} a vencer`;
  const total = items.reduce((s, i) => s + (i.amount ?? 0), 0);
  const cell = `padding:9px 10px;border-bottom:1px solid ${ROW_BORDER};font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${TEXT}`;
  const rows = items
    .map(
      (i) => `
          <tr>
            <td style="${cell}">${docTypeLabel(i.type)}${i.isParcela ? " (parcela)" : ""}${i.competencia ? `<br><span style="color:${MUTED};font-size:12px">${i.competencia}</span>` : ""}</td>
            <td style="${cell};text-align:right;white-space:nowrap">${i.amount != null ? formatCurrency(i.amount) : "—"}</td>
            <td style="${cell};text-align:right;white-space:nowrap;color:${MUTED}">${formatDate(i.dueDate)}<br><span style="font-size:12px">${i.statusLabel}</span></td>
          </tr>`,
    )
    .join("");
  const body = `
        ${p(`Olá, ${b(companyName)}!`)}
        ${p("Estas são as obrigações que vencem nos próximos dias:")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border:1px solid ${ROW_BORDER};border-radius:8px;overflow:hidden">
          <thead><tr>${th("Obrigação")}${th("Valor", "right")}${th("Vencimento", "right")}</tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr>
            <td style="padding:11px 10px;font-weight:bold;color:${HEAD_DARK};font-family:Arial,Helvetica,sans-serif;font-size:13px">Total</td>
            <td style="padding:11px 10px;text-align:right;font-weight:bold;color:${GOLD_DARK};font-family:Arial,Helvetica,sans-serif;font-size:13px">${formatCurrency(total)}</td>
            <td></td>
          </tr></tfoot>
        </table>
        ${button(portalUrl, "Ver tudo no portal")}`;
  return { subject, html: shell({ headline, accent: INFO, bodyHtml: body }) };
}

export interface AdminDigestCompany {
  companyName: string;
  vencido: number;
  venceHoje: number;
  proximos: number;
  totalAberto: number;
}

/** Resumo diário das pendências de todos os clientes, enviado ao contador. */
export function adminDigestEmail(opts: {
  companies: AdminDigestCompany[];
  portalUrl: string;
}) {
  const { companies, portalUrl } = opts;
  const headline = "Resumo diário — pendências dos clientes";
  const totVencido = companies.reduce((s, c) => s + c.vencido, 0);
  const totHoje = companies.reduce((s, c) => s + c.venceHoje, 0);
  const subject = `Resumo diário — ${totVencido} vencido(s), ${totHoje} vence(m) hoje`;
  const cell = `padding:10px;border-bottom:1px solid ${ROW_BORDER};font-family:Arial,Helvetica,sans-serif;font-size:13px`;
  const rows = companies
    .map(
      (c) => `
          <tr>
            <td style="${cell};color:${TEXT}">${c.companyName}</td>
            <td style="${cell};text-align:center;color:${DANGER};font-weight:bold">${c.vencido || ""}</td>
            <td style="${cell};text-align:center;color:${WARN};font-weight:bold">${c.venceHoje || ""}</td>
            <td style="${cell};text-align:center;color:${MUTED}">${c.proximos || ""}</td>
            <td style="${cell};text-align:right;white-space:nowrap;color:${HEAD_DARK};font-weight:bold">${formatCurrency(c.totalAberto)}</td>
          </tr>`,
    )
    .join("");
  const body = `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px"><tr>
          <td width="40" valign="middle">
            <div style="width:36px;height:36px;background:#faf6ec;border:1px solid #ead9b0;border-radius:50%;text-align:center;line-height:36px;color:${GOLD_DARK};font-size:16px">&#128276;</div>
          </td>
          <td valign="middle" style="padding-left:11px;color:${HEAD_DARK};font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold">Bom dia!</td>
        </tr></table>
        ${p("Panorama das obrigações em aberto dos seus clientes:")}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;border:1px solid ${ROW_BORDER};border-radius:8px;overflow:hidden">
          <thead><tr>${th("Cliente")}${th("Venc.", "center")}${th("Hoje", "center")}${th("7 dias", "center")}${th("Em aberto", "right")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${button(portalUrl, "Abrir o painel")}`;
  return {
    subject,
    html: shell({
      headline,
      accent: GOLD,
      bodyHtml: body,
      footer: `Resumo automático do ${APP_NAME} para o contador.`,
      generated: true,
    }),
  };
}

/** E-mail de teste disparado pelas Configurações para validar o Resend. */
export function testEmail() {
  const headline = "E-mail de teste";
  const subject = `${APP_NAME} — e-mail de teste`;
  const body = `
        ${p("Tudo certo! ✅")}
        ${p(`Se você está lendo isto, a integração de e-mail do ${APP_NAME} (Resend) está <strong>funcionando</strong> e o remetente está autorizado a enviar.`)}
        ${p(`<span style="color:${MUTED}">Este é apenas um disparo de teste feito a partir das Configurações do painel.</span>`)}`;
  return { subject, html: shell({ headline, accent: INFO, bodyHtml: body }) };
}
