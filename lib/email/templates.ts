import { docTypeLabel, APP_NAME } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocCategoria, DocType } from "@/lib/types";

export type AlertKind = "vencido" | "vence_hoje" | "dias_3" | "dias_7";

const TITLE: Record<AlertKind, string> = {
  vencido: "Você tem um boleto vencido",
  vence_hoje: "Seu boleto vence hoje",
  dias_3: "Seu boleto vence em 3 dias",
  dias_7: "Seu boleto vence em 7 dias",
};

const ACCENT: Record<AlertKind, string> = {
  vencido: "#A32D2D",
  vence_hoje: "#854F0B",
  dias_3: "#185FA5",
  dias_7: "#185FA5",
};

const DANGER = "#A32D2D";
const SUCCESS = "#1A7F4B";
const INFO = "#185FA5";
const BUTTON = "#185FA5";

/** Cabeçalho colorido + cartão branco. Base visual de todos os e-mails. */
function shell(opts: {
  headline: string;
  accent: string;
  bodyHtml: string;
  footer?: string;
}) {
  const {
    headline,
    accent,
    bodyHtml,
    footer = `Você recebeu este e-mail porque tem acesso ao portal ${APP_NAME}.`,
  } = opts;
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;padding:24px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:${accent};color:#fff;padding:16px 24px;font-size:16px;font-weight:600">
        ${APP_NAME} · ${headline}
      </div>
      <div style="padding:24px;color:#27272a;font-size:14px;line-height:1.6">
        ${bodyHtml}
        <p style="color:#71717a;font-size:12px;margin-top:24px">${footer}</p>
      </div>
    </div>
  </div>`;
}

function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:${BUTTON};color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">${label}</a>`;
}

function row(label: string, value: string, valueColor = "#27272a") {
  return `<tr><td style="padding:6px 0;color:#71717a">${label}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:${valueColor}">${value}</td></tr>`;
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
        <p>Olá, <strong>${companyName}</strong>!</p>
        <p>Este é um aviso sobre a seguinte obrigação:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          ${row("Imposto", docTypeLabel(type))}
          ${competencia ? row("Competência", competencia) : ""}
          ${row("Valor", formatCurrency(amount))}
          ${row("Vencimento", formatDate(dueDate), accent)}
        </table>
        ${button(portalUrl, "Ver e baixar o boleto")}`;
  return { subject, html: shell({ headline: TITLE[kind], accent, bodyHtml: body }) };
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
        <p>Olá, <strong>${companyName}</strong>!</p>
        <p style="color:${DANGER};font-weight:600">Uma parcela do seu parcelamento venceu e ainda consta em aberto.</p>
        <p>Parcelamentos podem ser <strong>cancelados/excluídos</strong> em caso de atraso no pagamento das parcelas. Regularize o quanto antes para não perder o acordo.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          ${row("Parcelamento", planNome)}
          ${row("Guia", docTypeLabel(type))}
          ${row("Parcela", parcelaLabel)}
          ${row("Valor", formatCurrency(amount))}
          ${row("Vencimento", formatDate(dueDate), DANGER)}
        </table>
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
        <p>Olá, <strong>${companyName}</strong>!</p>
        <p>${intro}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          ${row("Tipo", docTypeLabel(type))}
          ${competencia ? row("Competência", competencia) : ""}
          ${amount != null ? row("Valor", formatCurrency(amount)) : ""}
          ${dueDate ? row("Vencimento", formatDate(dueDate), INFO) : ""}
        </table>
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
        <p>Olá, <strong>${companyName}</strong>!</p>
        <p>Registramos o pagamento da seguinte obrigação. Obrigado!</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          ${row("Imposto", docTypeLabel(type))}
          ${competencia ? row("Competência", competencia) : ""}
          ${amount != null ? row("Valor", formatCurrency(amount)) : ""}
        </table>
        ${button(portalUrl, "Ver no portal")}`;
  return { subject, html: shell({ headline, accent: SUCCESS, bodyHtml: body }) };
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
  const rows = items
    .map(
      (i) => `
          <tr>
            <td style="padding:8px 0;border-top:1px solid #f0f0f0">${docTypeLabel(i.type)}${i.isParcela ? " (parcela)" : ""}${i.competencia ? `<br><span style="color:#a1a1aa;font-size:12px">${i.competencia}</span>` : ""}</td>
            <td style="padding:8px 0;border-top:1px solid #f0f0f0;text-align:right;white-space:nowrap">${i.amount != null ? formatCurrency(i.amount) : "—"}</td>
            <td style="padding:8px 0;border-top:1px solid #f0f0f0;text-align:right;white-space:nowrap;color:#71717a">${formatDate(i.dueDate)}<br><span style="font-size:12px">${i.statusLabel}</span></td>
          </tr>`,
    )
    .join("");
  const body = `
        <p>Olá, <strong>${companyName}</strong>!</p>
        <p>Estas são as obrigações que vencem nos próximos dias:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead><tr>
            <th style="text-align:left;font-size:12px;color:#a1a1aa;font-weight:600;padding-bottom:4px">Obrigação</th>
            <th style="text-align:right;font-size:12px;color:#a1a1aa;font-weight:600;padding-bottom:4px">Valor</th>
            <th style="text-align:right;font-size:12px;color:#a1a1aa;font-weight:600;padding-bottom:4px">Vencimento</th>
          </tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr>
            <td style="padding-top:10px;border-top:2px solid #e4e4e7;font-weight:700">Total</td>
            <td style="padding-top:10px;border-top:2px solid #e4e4e7;text-align:right;font-weight:700">${formatCurrency(total)}</td>
            <td style="border-top:2px solid #e4e4e7"></td>
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
  const rows = companies
    .map(
      (c) => `
          <tr>
            <td style="padding:8px 0;border-top:1px solid #f0f0f0">${c.companyName}</td>
            <td style="padding:8px 0;border-top:1px solid #f0f0f0;text-align:center;color:${DANGER};font-weight:700">${c.vencido || ""}</td>
            <td style="padding:8px 0;border-top:1px solid #f0f0f0;text-align:center;color:#854F0B;font-weight:700">${c.venceHoje || ""}</td>
            <td style="padding:8px 0;border-top:1px solid #f0f0f0;text-align:center">${c.proximos || ""}</td>
            <td style="padding:8px 0;border-top:1px solid #f0f0f0;text-align:right;white-space:nowrap">${formatCurrency(c.totalAberto)}</td>
          </tr>`,
    )
    .join("");
  const body = `
        <p>Bom dia! Panorama das obrigações em aberto dos seus clientes:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
          <thead><tr>
            <th style="text-align:left;font-size:12px;color:#a1a1aa;padding-bottom:4px">Cliente</th>
            <th style="text-align:center;font-size:12px;color:#a1a1aa;padding-bottom:4px">Venc.</th>
            <th style="text-align:center;font-size:12px;color:#a1a1aa;padding-bottom:4px">Hoje</th>
            <th style="text-align:center;font-size:12px;color:#a1a1aa;padding-bottom:4px">7 dias</th>
            <th style="text-align:right;font-size:12px;color:#a1a1aa;padding-bottom:4px">Em aberto</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${button(portalUrl, "Abrir o painel")}`;
  return {
    subject,
    html: shell({
      headline,
      accent: INFO,
      bodyHtml: body,
      footer: `Resumo automático do ${APP_NAME} para o contador.`,
    }),
  };
}

/** E-mail de teste disparado pelas Configurações para validar o Resend. */
export function testEmail() {
  const headline = "E-mail de teste";
  const subject = `${APP_NAME} — e-mail de teste`;
  const body = `
        <p>Tudo certo! ✅</p>
        <p>Se você está lendo isto, a integração de e-mail do ${APP_NAME} (Resend) está <strong>funcionando</strong> e o remetente está autorizado a enviar.</p>
        <p style="color:#71717a">Este é apenas um disparo de teste feito a partir das Configurações do painel.</p>`;
  return { subject, html: shell({ headline, accent: INFO, bodyHtml: body }) };
}
