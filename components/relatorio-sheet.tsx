/**
 * A "folha" do relatório mensal (prestação de contas) — layout A4 com a marca do
 * escritório. É um DOCUMENTO: paleta fixa (papel claro + dourado), NÃO segue o
 * tema do app, para o PDF sair sempre igual. Puramente apresentacional: recebe
 * tudo já formatado da página. A impressão (@media print) mostra só esta folha.
 */

export interface ProximoLinha {
  id: string;
  tipo: string;
  whenLabel: string; // "24/07"
  amountLabel: string;
}

export interface RelatorioSheetProps {
  brandName: string;
  logoUrl: string | null;
  periodo: string; // "Junho · 2026"
  competenciaCurto: string; // "Competência 06/2026"
  cliente: string;
  cnpj: string | null;
  alerta: { tone: "atencao" | "ok"; texto: string };
  totalPagoLabel: string;
  guiasPagasLabel: string; // "19 guias quitadas em junho"
  proximos: ProximoLinha[];
  proximosMesLabel: string; // "Julho"
  totalAVencerLabel: string | null;
  faturamentoLabel: string | null;
  faturamentoVar: { txt: string; tone: "up" | "down" } | null;
  cargaLabel: string | null;
  situacao: { valor: string; tone: "ok" | "alerta" };
  evolucao: {
    mesAnteriorLabel: string;
    fatAnteriorLabel: string;
    anteriorH: number;
    mesAtualLabel: string;
    fatAtualLabel: string;
    atualH: number;
    crescimentoLabel: string;
    crescimentoTone: "up" | "down";
  } | null;
  resumoTexto: string;
}

export function RelatorioSheet(props: RelatorioSheetProps) {
  return (
    <div id="report-sheet" className="rs-sheet">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Faixa da marca */}
      <div className="rs-band">
        <div className="rs-brand">
          {props.logoUrl ? (
            // Logo do escritório num documento pra impressão: <img> simples
            // (o next/image otimiza/lazy-load, o que não serve pra PDF).
            // eslint-disable-next-line @next/next/no-img-element
            <img src={props.logoUrl} alt="" className="rs-logo" />
          ) : (
            <div className="rs-logo-ph">LOGO</div>
          )}
          <div>
            <div className="rs-brand-name">{props.brandName}</div>
            <div className="rs-brand-tag">Prestação de Contas</div>
          </div>
        </div>
        <div className="rs-period">
          <div className="rs-period-main">{props.periodo}</div>
          <div className="rs-period-sub">{props.competenciaCurto}</div>
        </div>
      </div>
      <div className="rs-rule" />

      <div className="rs-body">
        {/* Cliente + alerta */}
        <div className="rs-clientrow">
          <div>
            <div className="rs-client">{props.cliente}</div>
            {props.cnpj ? <div className="rs-cnpj">CNPJ {props.cnpj}</div> : null}
          </div>
          <div className={`rs-pill rs-pill-${props.alerta.tone}`}>
            <span>{props.alerta.tone === "atencao" ? "⚠" : "✓"}</span>
            <span>{props.alerta.texto}</span>
          </div>
        </div>

        {/* Total pago + Ação necessária */}
        <div className="rs-top">
          <div className="rs-hero">
            <div className="rs-hero-lbl">Total pago no mês</div>
            <div className="rs-hero-val">{props.totalPagoLabel}</div>
            <div className="rs-hero-sub">{props.guiasPagasLabel}</div>
          </div>
          <div className="rs-acao">
            <div className="rs-acao-title">Ação necessária · {props.proximosMesLabel}</div>
            {props.proximos.length === 0 ? (
              <p className="rs-acao-empty">
                Nenhuma guia a vencer em {props.proximosMesLabel}.
              </p>
            ) : (
              <div className="rs-acao-grid">
                {props.proximos.map((p) => (
                  <div key={p.id} className="rs-acao-line">
                    <span className="rs-acao-tipo">{p.tipo}</span>
                    <span className="rs-acao-when">{p.whenLabel}</span>
                    <span className="rs-acao-amt">{p.amountLabel}</span>
                  </div>
                ))}
                {props.totalAVencerLabel ? (
                  <>
                    <div className="rs-acao-hr" />
                    <div className="rs-acao-total">
                      <span>Total a vencer</span>
                      <span>{props.totalAVencerLabel}</span>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Chips */}
        <div className="rs-chips">
          <div className="rs-chip">
            <div className="rs-chip-k">Faturamento</div>
            <div className="rs-chip-v">{props.faturamentoLabel ?? "—"}</div>
            {props.faturamentoVar ? (
              <div className={`rs-chip-s rs-${props.faturamentoVar.tone}`}>
                {props.faturamentoVar.txt}
              </div>
            ) : (
              <div className="rs-chip-s rs-muted">no mês</div>
            )}
          </div>
          <div className="rs-chip">
            <div className="rs-chip-k">Carga tributária</div>
            <div className="rs-chip-v">{props.cargaLabel ?? "—"}</div>
            <div className="rs-chip-s rs-muted">do faturamento</div>
          </div>
          <div className={`rs-chip ${props.situacao.tone === "alerta" ? "rs-chip-alerta" : "rs-chip-ok"}`}>
            <div className="rs-chip-k">Situação</div>
            <div className="rs-chip-v rs-chip-v-status">{props.situacao.valor}</div>
            <div className="rs-chip-s">
              {props.situacao.tone === "alerta" ? "a regularizar" : "sem pendências"}
            </div>
          </div>
        </div>

        {/* Evolução do faturamento */}
        {props.evolucao ? (
          <div className="rs-evo">
            <div className="rs-evo-title">Evolução do faturamento</div>
            <div className="rs-evo-body">
              <div className="rs-evo-bars">
                <div className="rs-evo-col">
                  <div className="rs-evo-fat rs-muted-txt">{props.evolucao.fatAnteriorLabel}</div>
                  <div className="rs-bar rs-bar-prev" style={{ height: props.evolucao.anteriorH }} />
                  <div className="rs-evo-mes rs-muted-txt">{props.evolucao.mesAnteriorLabel}</div>
                </div>
                <div className="rs-evo-col">
                  <div className="rs-evo-fat">{props.evolucao.fatAtualLabel}</div>
                  <div className="rs-bar rs-bar-cur" style={{ height: props.evolucao.atualH }} />
                  <div className="rs-evo-mes rs-evo-mes-cur">{props.evolucao.mesAtualLabel}</div>
                </div>
              </div>
              <div className="rs-evo-side">
                <div className={`rs-evo-big rs-${props.evolucao.crescimentoTone}`}>
                  {props.evolucao.crescimentoLabel}
                </div>
                <div className="rs-evo-cap">de variação em relação ao mês anterior.</div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Resumo */}
        <div className="rs-foot-wrap">
          <div className="rs-summary">
            <div className="rs-summary-tag">Em palavras simples</div>
            <div className="rs-summary-txt">{props.resumoTexto}</div>
          </div>
          <div className="rs-foot">
            <div>
              Preparado por <strong>{props.brandName}</strong>
            </div>
            <div>Dúvidas? Fale com seu contador pelo portal.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
#report-sheet.rs-sheet {
  --paper:#FFFFFF; --band:#FAF8F3; --line:#ECE7DD; --gold:#A07C2C; --ink:#14110E;
  --muted:#9A948B; --text:#3A3630; --text2:#6F6A64; --green:#2F6B4F; --red:#B0402F;
  --serif:Georgia,"Times New Roman",serif;
  font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  width:100%; max-width:794px; margin:0 auto; background:var(--paper); color:var(--ink);
  box-shadow:0 20px 60px rgba(27,25,23,0.14); border-radius:4px; overflow:hidden;
  -webkit-font-smoothing:antialiased;
}
#report-sheet .rs-band {
  background:var(--band); border-bottom:1px solid var(--line); padding:26px 40px;
  display:flex; justify-content:space-between; align-items:center; gap:16px;
}
#report-sheet .rs-brand { display:flex; align-items:center; gap:16px; }
#report-sheet .rs-logo { width:48px; height:48px; object-fit:contain; }
#report-sheet .rs-logo-ph {
  width:48px; height:48px; border:1.5px dashed #CBB985; border-radius:6px;
  display:flex; align-items:center; justify-content:center;
  font-size:9px; font-weight:600; letter-spacing:0.08em; color:var(--gold);
}
#report-sheet .rs-brand-name { font:700 22px var(--serif); color:var(--ink); }
#report-sheet .rs-brand-tag {
  font-size:10px; font-weight:500; letter-spacing:0.22em; text-transform:uppercase;
  color:var(--gold); margin-top:2px;
}
#report-sheet .rs-period { text-align:right; }
#report-sheet .rs-period-main { font:700 22px var(--serif); color:var(--ink); }
#report-sheet .rs-period-sub { font-size:12px; color:var(--muted); margin-top:2px; }
#report-sheet .rs-rule { height:3px; background:var(--gold); }
#report-sheet .rs-body { padding:30px 40px 36px; }

#report-sheet .rs-clientrow {
  display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:22px;
}
#report-sheet .rs-client { font-size:16px; font-weight:600; color:var(--ink); }
#report-sheet .rs-cnpj { font-size:13px; color:var(--muted); margin-top:2px; font-variant-numeric:tabular-nums; }
#report-sheet .rs-pill {
  display:flex; align-items:center; gap:9px; border-radius:999px; padding:8px 16px;
  font-size:13px; font-weight:500; white-space:nowrap;
}
#report-sheet .rs-pill-atencao { background:#FBF3E3; border:1px solid #EAD8AE; color:#8A6A1F; }
#report-sheet .rs-pill-ok { background:#EAF3EC; border:1px solid #CBE3D0; color:var(--green); }

#report-sheet .rs-top {
  display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:20px;
}
#report-sheet .rs-hero {
  background:var(--band); border:1px solid var(--line); border-radius:12px;
  padding:24px 24px; display:flex; flex-direction:column; justify-content:center;
}
#report-sheet .rs-hero-lbl {
  font-size:11px; font-weight:500; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted);
}
#report-sheet .rs-hero-val {
  font:700 34px var(--serif); color:var(--ink); margin:10px 0 4px; letter-spacing:-0.01em;
  white-space:nowrap; font-variant-numeric:tabular-nums;
}
#report-sheet .rs-hero-sub { font-size:13px; font-weight:500; color:var(--text2); }
#report-sheet .rs-acao { border:1px solid var(--line); border-radius:12px; padding:18px 22px; }
#report-sheet .rs-acao-title {
  font-size:11px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase;
  color:var(--gold); margin-bottom:12px;
}
#report-sheet .rs-acao-empty { font-size:13px; color:var(--text2); margin:4px 0; }
#report-sheet .rs-acao-grid {
  display:grid; grid-template-columns:1fr auto auto; column-gap:16px; align-items:baseline;
  font-variant-numeric:tabular-nums;
}
#report-sheet .rs-acao-tipo { font-size:13px; font-weight:500; color:var(--text); padding:5px 0; }
#report-sheet .rs-acao-when { font-size:12px; color:var(--muted); padding:5px 0; text-align:right; }
#report-sheet .rs-acao-amt { font-size:13px; font-weight:600; color:var(--ink); padding:5px 0; text-align:right; }
#report-sheet .rs-acao-hr { grid-column:1/-1; height:1px; background:var(--ink); margin:6px 0 0; }
#report-sheet .rs-acao-total {
  grid-column:1/-1; display:flex; justify-content:space-between; align-items:baseline; padding:9px 0 0;
}
#report-sheet .rs-acao-total span:first-child { font-size:14px; font-weight:600; color:var(--ink); }
#report-sheet .rs-acao-total span:last-child { font:700 15px var(--serif); color:var(--ink); font-variant-numeric:tabular-nums; }

#report-sheet .rs-chips {
  display:grid; grid-template-columns:1fr 1fr 1fr; gap:14px; margin-bottom:24px;
}
#report-sheet .rs-chip { border:1px solid var(--line); border-radius:10px; padding:16px 18px; }
#report-sheet .rs-chip-alerta { border-color:#F0DADA; background:#FDF6F4; }
#report-sheet .rs-chip-ok { border-color:#D5E7D9; background:#F2F8F3; }
#report-sheet .rs-chip-k {
  font-size:10px; font-weight:500; letter-spacing:0.14em; text-transform:uppercase;
  color:var(--muted); margin-bottom:7px;
}
#report-sheet .rs-chip-alerta .rs-chip-k { color:#B0806F; }
#report-sheet .rs-chip-ok .rs-chip-k { color:#6F9A7C; }
#report-sheet .rs-chip-v { font-size:21px; font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums; }
#report-sheet .rs-chip-alerta .rs-chip-v-status { color:var(--red); }
#report-sheet .rs-chip-ok .rs-chip-v-status { color:var(--green); }
#report-sheet .rs-chip-s { font-size:12px; font-weight:500; color:var(--text2); margin-top:3px; }
#report-sheet .rs-chip-alerta .rs-chip-s { color:#9A6558; }
#report-sheet .rs-chip-ok .rs-chip-s { color:#6F9A7C; }
#report-sheet .rs-up { color:var(--green); }
#report-sheet .rs-down { color:var(--red); }
#report-sheet .rs-muted { color:var(--text2); }
#report-sheet .rs-muted-txt { color:var(--text2); }

#report-sheet .rs-evo { border:1px solid var(--line); border-radius:12px; padding:22px 24px; margin-bottom:22px; }
#report-sheet .rs-evo-title {
  font-size:12px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--gold); margin-bottom:18px;
}
#report-sheet .rs-evo-body { display:flex; align-items:flex-end; gap:40px; }
#report-sheet .rs-evo-bars { flex:1; display:flex; align-items:flex-end; gap:28px; height:150px; }
#report-sheet .rs-evo-col { flex:1; display:flex; flex-direction:column; align-items:center; gap:8px; justify-content:flex-end; }
#report-sheet .rs-evo-fat { font-size:12px; font-weight:600; color:var(--ink); font-variant-numeric:tabular-nums; }
#report-sheet .rs-bar { width:100%; max-width:120px; border-radius:5px 5px 0 0; }
#report-sheet .rs-bar-prev { background:#E7E2D8; }
#report-sheet .rs-bar-cur { background:var(--gold); }
#report-sheet .rs-evo-mes { font-size:11px; font-weight:500; }
#report-sheet .rs-evo-mes-cur { color:var(--text); font-weight:600; }
#report-sheet .rs-evo-side { width:190px; border-left:1px solid var(--line); padding-left:26px; }
#report-sheet .rs-evo-big { font:700 30px var(--serif); font-variant-numeric:tabular-nums; line-height:1; }
#report-sheet .rs-evo-cap { font-size:13px; line-height:1.5; color:var(--text2); margin-top:6px; }

#report-sheet .rs-summary {
  background:var(--band); border:1px solid var(--line); border-left:3px solid var(--gold);
  border-radius:12px; padding:20px 24px;
}
#report-sheet .rs-summary-tag {
  font-size:12px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--gold); margin-bottom:9px;
}
#report-sheet .rs-summary-txt { font-size:14px; line-height:1.65; color:var(--text); text-wrap:pretty; }
#report-sheet .rs-foot {
  display:flex; justify-content:space-between; align-items:center; gap:14px; margin-top:18px; flex-wrap:wrap;
}
#report-sheet .rs-foot div { font-size:12px; font-weight:500; color:var(--muted); }
#report-sheet .rs-foot strong { color:var(--text); font-weight:600; }

@media (max-width:640px) {
  #report-sheet .rs-band { padding:20px; }
  #report-sheet .rs-body { padding:22px 20px 26px; }
  #report-sheet .rs-top, #report-sheet .rs-chips { grid-template-columns:1fr; }
  #report-sheet .rs-evo-body { flex-direction:column; align-items:stretch; gap:22px; }
  #report-sheet .rs-evo-side { width:auto; border-left:0; border-top:1px solid var(--line); padding-left:0; padding-top:16px; }
  #report-sheet .rs-clientrow { flex-direction:column; align-items:flex-start; }
}

@media print {
  @page { size:A4; margin:12mm; }
  body * { visibility:hidden !important; }
  #report-sheet, #report-sheet * { visibility:visible !important; }
  #report-sheet {
    position:absolute; left:0; top:0; width:100% !important; max-width:none !important;
    margin:0 !important; box-shadow:none !important; border-radius:0 !important;
  }
}
`;
