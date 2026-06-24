import { docTypeLabel, APP_NAME } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DocType } from "@/lib/types";

type Kind = "vencido" | "vence_hoje" | "dias_3";

const TITLE: Record<Kind, string> = {
  vencido: "Você tem um boleto vencido",
  vence_hoje: "Seu boleto vence hoje",
  dias_3: "Seu boleto vence em 3 dias",
};

const ACCENT: Record<Kind, string> = {
  vencido: "#A32D2D",
  vence_hoje: "#854F0B",
  dias_3: "#185FA5",
};

export function alertEmail(opts: {
  companyName: string;
  type: DocType;
  competencia: string;
  amount: number;
  dueDate: string;
  kind: Kind;
  portalUrl: string;
}) {
  const { companyName, type, competencia, amount, dueDate, kind, portalUrl } =
    opts;
  const subject = `${TITLE[kind]} — ${docTypeLabel(type)}`;
  const accent = ACCENT[kind];

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;background:#f4f4f5;padding:24px">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7">
      <div style="background:${accent};color:#fff;padding:16px 24px;font-size:16px;font-weight:600">
        ${APP_NAME} · ${TITLE[kind]}
      </div>
      <div style="padding:24px;color:#27272a;font-size:14px;line-height:1.6">
        <p>Olá, <strong>${companyName}</strong>!</p>
        <p>Este é um aviso sobre a seguinte obrigação:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr><td style="padding:6px 0;color:#71717a">Imposto</td><td style="padding:6px 0;text-align:right;font-weight:600">${docTypeLabel(type)}</td></tr>
          <tr><td style="padding:6px 0;color:#71717a">Competência</td><td style="padding:6px 0;text-align:right">${competencia}</td></tr>
          <tr><td style="padding:6px 0;color:#71717a">Valor</td><td style="padding:6px 0;text-align:right;font-weight:600">${formatCurrency(amount)}</td></tr>
          <tr><td style="padding:6px 0;color:#71717a">Vencimento</td><td style="padding:6px 0;text-align:right;color:${accent};font-weight:600">${formatDate(dueDate)}</td></tr>
        </table>
        <a href="${portalUrl}" style="display:inline-block;background:#185FA5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:600">Ver e baixar o boleto</a>
        <p style="color:#71717a;font-size:12px;margin-top:24px">Você recebeu este e-mail porque tem acesso ao portal ${APP_NAME}.</p>
      </div>
    </div>
  </div>`;

  return { subject, html };
}
