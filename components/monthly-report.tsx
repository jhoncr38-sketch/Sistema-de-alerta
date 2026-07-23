"use client";

import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from "lucide-react";

/**
 * Relatório mensal ("prestação de contas") — página pronta para imprimir ou
 * salvar como PDF pelo próprio navegador. É um DOCUMENTO: usa uma paleta fixa
 * (papel claro + dourado da marca) e NÃO segue o tema do app, para o PDF sair
 * sempre igual, independente de Claro/Escuro/Sereno.
 *
 * Todos os números já vêm calculados do servidor (page.tsx) — aqui só exibimos.
 * A barra de ações e a navegação de mês somem na impressão (@media print).
 */

type Tom = "vencido" | "avencer" | "emdia";

export interface ReportRow {
  id: string;
  tipo: string;
  subtitle: string;
  whenLabel: string; // "Vence 20/08"
  amountLabel: string | null;
  tom: Tom;
}

export interface ReportStat {
  k: string;
  v: string;
  s: string;
  tone: "up" | "neutral" | "down";
}

export interface MonthlyReportProps {
  brandName: string;
  companyName: string;
  cnpj: string | null;
  competenciaBadge: string; // "Julho · 2026"
  heroTone: "emdia" | "atencao";
  heroTitle: string;
  heroEyebrow: string;
  heroValueLabel: string;
  heroValue: string;
  stats: ReportStat[];
  faturamento: { valorLabel: string; sub: string; spark: number[] } | null;
  proximos: ReportRow[];
  proximosMesLabel: string; // "agosto"
  resumoTexto: string;
  prevHref: string;
  nextHref: string | null;
  backHref: string;
}

const DOT: Record<Tom, string> = {
  vencido: "#d64545",
  avencer: "#b8923d",
  emdia: "#3f7d4e",
};

/** Monta o mini-gráfico (linha + área) a partir dos valores mensais. */
function spark(values: number[]): {
  line: string;
  area: string;
  lastX: number;
  lastY: number;
} | null {
  if (values.length < 2) return null;
  const left = 10;
  const right = 210;
  const top = 8;
  const bottom = 48;
  const baseline = 54;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const step = (right - left) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = left + i * step;
    const y = bottom - ((v - min) / range) * (bottom - top);
    return { x, y };
  });
  const line = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const last = pts[pts.length - 1];
  const area = `${line} L ${right} ${baseline} L ${left} ${baseline} Z`;
  return { line, area, lastX: last.x, lastY: last.y };
}

export function MonthlyReport(props: MonthlyReportProps) {
  const s = props.faturamento ? spark(props.faturamento.spark) : null;

  return (
    <div id="report-root" className="rl-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Barra de ações (some na impressão) */}
      <div className="rl-toolbar">
        <Link href={props.backHref} className="rl-btn">
          <ArrowLeft className="rl-ico" />
          Voltar
        </Link>
        <div className="rl-nav">
          <Link href={props.prevHref} className="rl-btn rl-icononly" aria-label="Mês anterior">
            <ChevronLeft className="rl-ico" />
          </Link>
          {props.nextHref ? (
            <Link href={props.nextHref} className="rl-btn rl-icononly" aria-label="Próximo mês">
              <ChevronRight className="rl-ico" />
            </Link>
          ) : (
            <span className="rl-btn rl-icononly rl-disabled" aria-hidden="true">
              <ChevronRight className="rl-ico" />
            </span>
          )}
          <PrintButton />
        </div>
      </div>

      {/* A folha (o "PDF") */}
      <div className="rl-sheet">
        <div className="rl-pad">
          {/* Cabeçalho */}
          <div className="rl-masthead">
            <div>
              <div className="rl-mark">{props.brandName}</div>
              <div className="rl-kicker">Prestação de contas do mês</div>
            </div>
            <div className="rl-period">
              <span className="rl-badge">{props.competenciaBadge}</span>
              <div className="rl-client">{props.companyName}</div>
              {props.cnpj ? <div className="rl-cnpj">CNPJ {props.cnpj}</div> : null}
            </div>
          </div>

          {/* Destaque */}
          <div className="rl-hero">
            <div className="rl-hero-left">
              <div className={`rl-eyebrow rl-${props.heroTone}`}>
                {props.heroTone === "emdia" ? "✓ " : "⚠ "}
                {props.heroEyebrow}
              </div>
              <h1 className="rl-hero-title">{props.heroTitle}</h1>
            </div>
            <div className="rl-hero-right">
              <div className="rl-hero-lbl">{props.heroValueLabel}</div>
              <div className="rl-hero-val">{props.heroValue}</div>
            </div>
          </div>

          {/* Números */}
          <div className="rl-sectitle">Os números do mês</div>
          <div className={`rl-stats rl-cols-${Math.min(props.stats.length, 4)}`}>
            {props.stats.map((st) => (
              <div key={st.k} className="rl-stat">
                <div className="rl-stat-k">{st.k}</div>
                <div className="rl-stat-v">{st.v}</div>
                <div className={`rl-stat-s rl-${st.tone}`}>{st.s}</div>
              </div>
            ))}
          </div>

          {/* Faturamento + tendência */}
          {props.faturamento ? (
            <>
              <div className="rl-sectitle">Evolução do faturamento</div>
              <div className="rl-fat">
                <div>
                  <div className="rl-fat-lbl">Faturamento do mês</div>
                  <div className="rl-fat-big">{props.faturamento.valorLabel}</div>
                  <div className="rl-fat-sub">{props.faturamento.sub}</div>
                </div>
                {s ? (
                  <div className="rl-spark">
                    <svg width="230" height="60" viewBox="0 0 230 60" fill="none" aria-hidden="true">
                      <defs>
                        <linearGradient id="rlg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0" stopColor="#b8923d" stopOpacity="0.28" />
                          <stop offset="1" stopColor="#b8923d" stopOpacity="0" />
                        </linearGradient>
                      </defs>
                      <path d={s.area} fill="url(#rlg)" />
                      <path
                        d={s.line}
                        stroke="#9a7b34"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx={s.lastX} cy={s.lastY} r="4" fill="#b8923d" stroke="#fff" strokeWidth="1.5" />
                    </svg>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {/* Próximos vencimentos */}
          <div className="rl-sectitle">O que vem em {props.proximosMesLabel}</div>
          {props.proximos.length === 0 ? (
            <p className="rl-empty">Nenhum vencimento em {props.proximosMesLabel}. 🌿</p>
          ) : (
            <div className="rl-rows">
              {props.proximos.map((r) => (
                <div key={r.id} className="rl-row">
                  <span className="rl-dot" style={{ background: DOT[r.tom] }} />
                  <div className="rl-desc">
                    <div className="rl-desc-t">{r.tipo}</div>
                    <div className="rl-desc-m">{r.subtitle}</div>
                  </div>
                  <span className="rl-when">{r.whenLabel}</span>
                  {r.amountLabel ? <span className="rl-amt">{r.amountLabel}</span> : null}
                </div>
              ))}
            </div>
          )}

          {/* Resumo por IA */}
          <div className="rl-sectitle">Resumo do seu mês</div>
          <div className="rl-summary">
            <div className="rl-summary-ico">✦</div>
            <div className="rl-summary-body">
              <div className="rl-summary-tag">Em palavras simples</div>
              <p>{props.resumoTexto}</p>
            </div>
          </div>

          {/* Rodapé */}
          <div className="rl-foot">
            <div className="rl-foot-who">
              Preparado por <span>{props.brandName}</span>
            </div>
            <div className="rl-foot-meta">Dúvidas? Fale com seu contador pelo portal.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Botão que dispara a impressão/salvar-como-PDF do navegador. */
function PrintButton() {
  return (
    <button type="button" className="rl-btn rl-btn-gold" onClick={() => window.print()}>
      <Printer className="rl-ico" />
      Salvar PDF
    </button>
  );
}

const CSS = `
#report-root.rl-wrap {
  --paper: #fdfcf9; --ink: #262019; --muted: #7a746a; --hair: #e7e1d3;
  --gold: #9a7b34; --gold-bright: #b8923d; --gold-tint: #f4edda;
  --gold-tint-2: #f8f2e4; --green: #3f7d4e; --slate: #4a6b86; --slate-tint: #e7eef3;
  --serif: Georgia, "Times New Roman", serif;
  padding: 24px 16px 48px;
  display: flex; flex-direction: column; align-items: center; gap: 16px;
}
#report-root .rl-toolbar {
  width: 100%; max-width: 820px; display: flex; align-items: center;
  justify-content: space-between; gap: 12px; flex-wrap: wrap;
}
#report-root .rl-nav { display: flex; gap: 8px; }
#report-root .rl-btn {
  font-family: inherit; font-size: 13px; font-weight: 600; border-radius: 9px;
  padding: 8px 14px; cursor: pointer; border: 1px solid var(--border);
  background: var(--card); color: var(--foreground);
  display: inline-flex; align-items: center; gap: 7px; text-decoration: none;
  transition: box-shadow .15s ease;
}
#report-root .rl-btn:hover { box-shadow: 0 2px 10px #0000001a; }
#report-root .rl-icononly { padding: 8px; }
#report-root .rl-disabled { opacity: .4; cursor: default; }
#report-root .rl-btn-gold {
  background: linear-gradient(180deg, #b8923d, #9a7b34);
  border-color: #8a6d2e; color: #fff8ea;
}
#report-root .rl-ico { width: 15px; height: 15px; }
#report-root .rl-sheet {
  width: 100%; max-width: 820px; background: var(--paper); color: var(--ink);
  border-radius: 6px; box-shadow: 0 1px 2px #0000000d, 0 18px 50px #0000001f;
  overflow: hidden;
}
#report-root .rl-pad { padding: 40px 48px; }
#report-root .rl-masthead {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 20px; padding-bottom: 22px; border-bottom: 2px solid var(--gold);
}
#report-root .rl-mark {
  font-family: var(--serif); font-size: 24px; font-weight: 700;
  letter-spacing: .03em; color: var(--gold); line-height: 1.1;
}
#report-root .rl-kicker {
  margin-top: 9px; font-size: 11px; letter-spacing: .18em; text-transform: uppercase;
  color: var(--muted); font-weight: 600;
}
#report-root .rl-period { text-align: right; }
#report-root .rl-badge {
  display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: .1em;
  text-transform: uppercase; color: var(--gold); background: var(--gold-tint);
  border: 1px solid #e6d8b0; border-radius: 999px; padding: 5px 13px;
}
#report-root .rl-client { margin-top: 10px; font-size: 14px; font-weight: 600; color: var(--ink); }
#report-root .rl-cnpj { font-size: 12px; color: var(--muted); margin-top: 2px; }
#report-root .rl-hero {
  margin-top: 26px; background: linear-gradient(110deg, var(--gold-tint-2), var(--gold-tint));
  border: 1px solid #ecdfbf; border-radius: 14px; padding: 22px 26px;
  display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;
}
#report-root .rl-hero-left { min-width: 220px; }
#report-root .rl-eyebrow {
  font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
  display: flex; align-items: center;
}
#report-root .rl-eyebrow.rl-emdia { color: var(--green); }
#report-root .rl-eyebrow.rl-atencao { color: #b1462c; }
#report-root .rl-hero-title {
  font-family: var(--serif); font-size: 26px; font-weight: 700; margin: 8px 0 0;
  line-height: 1.22; color: var(--ink); text-wrap: balance;
}
#report-root .rl-hero-right { text-align: right; }
#report-root .rl-hero-lbl {
  font-size: 12px; color: var(--muted); font-weight: 600;
  text-transform: uppercase; letter-spacing: .05em;
}
#report-root .rl-hero-val {
  font-family: var(--serif); font-size: 38px; font-weight: 700; color: var(--gold);
  line-height: 1.05; margin-top: 4px; font-variant-numeric: tabular-nums;
}
#report-root .rl-sectitle {
  font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase;
  color: var(--muted); margin: 30px 0 14px; display: flex; align-items: center; gap: 10px;
}
#report-root .rl-sectitle::after { content: ""; flex: 1; height: 1px; background: var(--hair); }
#report-root .rl-stats { display: grid; gap: 14px; }
#report-root .rl-cols-4 { grid-template-columns: repeat(4, 1fr); }
#report-root .rl-cols-3 { grid-template-columns: repeat(3, 1fr); }
#report-root .rl-cols-2 { grid-template-columns: repeat(2, 1fr); }
#report-root .rl-cols-1 { grid-template-columns: 1fr; }
#report-root .rl-stat { border: 1px solid var(--hair); border-radius: 12px; padding: 15px 16px; background: #fff; }
#report-root .rl-stat-k {
  font-size: 11px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
}
#report-root .rl-stat-v {
  font-size: 20px; font-weight: 700; color: var(--ink); margin-top: 7px;
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
#report-root .rl-stat-s { font-size: 12px; margin-top: 6px; font-weight: 600; }
#report-root .rl-up { color: var(--green); }
#report-root .rl-down { color: #b1462c; }
#report-root .rl-neutral { color: var(--muted); }
#report-root .rl-fat {
  display: grid; grid-template-columns: 1fr auto; gap: 18px; align-items: center;
  border: 1px solid var(--hair); border-radius: 12px; padding: 16px 20px; background: #fff;
}
#report-root .rl-fat-lbl {
  font-size: 12px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: .04em;
}
#report-root .rl-fat-big {
  font-size: 25px; font-weight: 700; color: var(--ink);
  font-variant-numeric: tabular-nums; margin-top: 4px;
}
#report-root .rl-fat-sub { font-size: 12.5px; color: var(--muted); margin-top: 4px; }
#report-root .rl-rows { display: flex; flex-direction: column; gap: 8px; }
#report-root .rl-row {
  display: flex; align-items: center; gap: 14px; border: 1px solid var(--hair);
  border-radius: 11px; padding: 12px 16px; background: #fff;
}
#report-root .rl-dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
#report-root .rl-desc { flex: 1; min-width: 0; }
#report-root .rl-desc-t { font-size: 14px; font-weight: 600; color: var(--ink); }
#report-root .rl-desc-m { font-size: 12px; color: var(--muted); margin-top: 1px; }
#report-root .rl-when {
  font-size: 12px; font-weight: 600; color: var(--slate); background: var(--slate-tint);
  border-radius: 7px; padding: 4px 9px; white-space: nowrap;
}
#report-root .rl-amt {
  font-size: 15px; font-weight: 700; color: var(--ink);
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
#report-root .rl-empty { font-size: 13px; color: var(--muted); padding: 4px 2px; }
#report-root .rl-summary {
  border: 1px solid #ecdfbf; background: var(--gold-tint-2); border-radius: 12px;
  padding: 18px 20px; display: flex; gap: 14px;
}
#report-root .rl-summary-ico {
  flex: none; width: 34px; height: 34px; border-radius: 9px; background: var(--gold);
  color: #fff8ea; display: grid; place-items: center; font-size: 17px;
}
#report-root .rl-summary-body p { margin: 0; font-size: 14px; line-height: 1.65; color: #40382c; }
#report-root .rl-summary-tag {
  font-size: 10.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
  color: var(--gold); margin-bottom: 6px;
}
#report-root .rl-foot {
  margin-top: 32px; padding-top: 18px; border-top: 1px solid var(--hair);
  display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
}
#report-root .rl-foot-who { font-size: 13px; color: var(--ink); font-weight: 600; }
#report-root .rl-foot-who span { color: var(--gold); font-family: var(--serif); }
#report-root .rl-foot-meta { font-size: 12px; color: var(--muted); }

@media (max-width: 680px) {
  #report-root .rl-pad { padding: 26px 20px; }
  #report-root .rl-cols-4, #report-root .rl-cols-3 { grid-template-columns: repeat(2, 1fr); }
  #report-root .rl-masthead { flex-direction: column; }
  #report-root .rl-period { text-align: left; }
  #report-root .rl-hero-right { text-align: left; }
  #report-root .rl-hero-val { font-size: 32px; }
  #report-root .rl-fat { grid-template-columns: 1fr; }
}

@media print {
  @page { size: A4; margin: 12mm; }
  body * { visibility: hidden !important; }
  #report-root, #report-root * { visibility: visible !important; }
  #report-root { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
  #report-root .rl-toolbar { display: none !important; }
  #report-root .rl-sheet { box-shadow: none; border-radius: 0; max-width: none; }
  #report-root .rl-pad { padding: 0; }
}
`;
