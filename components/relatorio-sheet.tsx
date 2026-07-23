import type { CSSProperties } from "react";
import type { ProximoLinha, RelatorioView } from "@/lib/relatorio";

/**
 * A "folha" do relatório mensal (prestação de contas) — layout A4 com a marca do
 * escritório. É um DOCUMENTO: paleta fixa (papel claro + dourado), NÃO segue o
 * tema do app. Usa estilos INLINE de propósito: num Server Component do Next, um
 * bloco <style> às vezes não aplica regras de layout (grid/flex/width) — inline
 * sempre aplica. A largura é fixa (A4 ≈ 794px) e a folha rola na horizontal em
 * telas estreitas. A impressão (@media print, único <style>) mostra só a folha.
 */

const C = {
  paper: "#FFFFFF",
  band: "#FAF8F3",
  line: "#ECE7DD",
  gold: "#A07C2C",
  ink: "#14110E",
  muted: "#9A948B",
  text: "#3A3630",
  text2: "#6F6A64",
  green: "#2F6B4F",
  red: "#B0402F",
};
const SERIF = 'Georgia, "Times New Roman", serif';

const label: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.gold,
};
const cardBorder: CSSProperties = {
  border: `1px solid ${C.line}`,
  borderRadius: 12,
};

export function RelatorioSheet(props: RelatorioView) {
  const situacaoColor = props.situacao.tone === "alerta" ? C.red : C.green;
  const chipBoxAlerta: CSSProperties =
    props.situacao.tone === "alerta"
      ? { border: "1px solid #F0DADA", background: "#FDF6F4" }
      : { border: "1px solid #D5E7D9", background: "#F2F8F3" };

  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <style
        dangerouslySetInnerHTML={{
          __html:
            "@media print{@page{size:A4;margin:12mm}body *{visibility:hidden!important}" +
            "#report-sheet,#report-sheet *{visibility:visible!important}" +
            "#report-sheet{position:absolute;left:0;top:0;box-shadow:none!important;border-radius:0!important}}",
        }}
      />
      <div
        id="report-sheet"
        style={{
          width: 794,
          margin: "0 auto",
          background: C.paper,
          color: C.ink,
          boxShadow: "0 20px 60px rgba(27,25,23,0.14)",
          borderRadius: 6,
          overflow: "hidden",
          fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {/* Faixa da marca */}
        <div
          style={{
            background: C.band,
            borderBottom: `1px solid ${C.line}`,
            padding: "26px 40px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {props.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={props.logoUrl}
                alt=""
                style={{ width: 48, height: 48, objectFit: "contain" }}
              />
            ) : (
              <div
                style={{
                  width: 48,
                  height: 48,
                  border: "1.5px dashed #CBB985",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: C.gold,
                }}
              >
                LOGO
              </div>
            )}
            <div>
              <div style={{ font: `700 22px ${SERIF}`, color: C.ink }}>
                {props.brandName}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: C.gold,
                  marginTop: 2,
                }}
              >
                Prestação de Contas
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ font: `700 22px ${SERIF}`, color: C.ink }}>
              {props.periodo}
            </div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {props.competenciaCurto}
            </div>
          </div>
        </div>
        <div style={{ height: 3, background: C.gold }} />

        <div style={{ padding: "30px 40px 36px" }}>
          {/* Cliente + alerta */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 16,
              marginBottom: 22,
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>
                {props.cliente}
              </div>
              {props.cnpj ? (
                <div
                  style={{
                    fontSize: 13,
                    color: C.muted,
                    marginTop: 2,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  CNPJ {props.cnpj}
                </div>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                borderRadius: 999,
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                whiteSpace: "nowrap",
                ...(props.alerta.tone === "atencao"
                  ? { background: "#FBF3E3", border: "1px solid #EAD8AE", color: "#8A6A1F" }
                  : { background: "#EAF3EC", border: "1px solid #CBE3D0", color: C.green }),
              }}
            >
              <span>{props.alerta.tone === "atencao" ? "⚠" : "✓"}</span>
              <span>{props.alerta.texto}</span>
            </div>
          </div>

          {/* Total pago + Ação necessária */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                ...cardBorder,
                background: C.band,
                padding: "24px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: C.muted,
                }}
              >
                Total pago no mês
              </div>
              <div
                style={{
                  font: `700 34px ${SERIF}`,
                  color: C.ink,
                  margin: "10px 0 4px",
                  letterSpacing: "-0.01em",
                  whiteSpace: "nowrap",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {props.totalPagoLabel}
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.text2 }}>
                {props.guiasPagasLabel}
              </div>
            </div>

            <div style={{ ...cardBorder, padding: "18px 22px" }}>
              <div style={{ ...label, marginBottom: 12 }}>
                Ação necessária · {props.proximosMesLabel}
              </div>
              {props.proximos.length === 0 ? (
                <p style={{ fontSize: 13, color: C.text2, margin: "4px 0" }}>
                  Nenhuma guia a vencer em {props.proximosMesLabel}.
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto auto",
                    columnGap: 16,
                    alignItems: "baseline",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {props.proximos.map((p) => (
                    <RowFrag key={p.id} p={p} />
                  ))}
                  {props.totalAVencerLabel ? (
                    <>
                      <div
                        style={{
                          gridColumn: "1 / -1",
                          height: 1,
                          background: C.ink,
                          margin: "6px 0 0",
                        }}
                      />
                      <span
                        style={{
                          gridColumn: "1 / 3",
                          fontSize: 14,
                          fontWeight: 600,
                          color: C.ink,
                          padding: "9px 0 0",
                        }}
                      >
                        Total a vencer
                      </span>
                      <span
                        style={{
                          font: `700 15px ${SERIF}`,
                          color: C.ink,
                          padding: "9px 0 0",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {props.totalAVencerLabel}
                      </span>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {/* Chips */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 14,
              marginBottom: 24,
            }}
          >
            <Chip k="Faturamento" v={props.faturamentoLabel ?? "—"}>
              {props.faturamentoVar ? (
                <span
                  style={{
                    color: props.faturamentoVar.tone === "up" ? C.green : C.red,
                  }}
                >
                  {props.faturamentoVar.tone === "up" ? "▲" : "▼"}{" "}
                  {props.faturamentoVar.pctLabel}
                </span>
              ) : (
                <span style={{ color: C.text2 }}>no mês</span>
              )}
            </Chip>
            <Chip k="Carga tributária" v={props.cargaLabel ?? "—"}>
              <span style={{ color: C.text2 }}>do faturamento</span>
            </Chip>
            <div style={{ ...chipBoxAlerta, borderRadius: 10, padding: "16px 18px" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: props.situacao.tone === "alerta" ? "#B0806F" : "#6F9A7C",
                  marginBottom: 7,
                }}
              >
                Situação
              </div>
              <div
                style={{
                  fontSize: 21,
                  fontWeight: 600,
                  color: situacaoColor,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {props.situacao.valor}
              </div>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 500,
                  color: props.situacao.tone === "alerta" ? "#9A6558" : "#6F9A7C",
                  marginTop: 3,
                }}
              >
                {props.situacao.tone === "alerta" ? "a regularizar" : "sem pendências"}
              </div>
            </div>
          </div>

          {/* Evolução do faturamento */}
          {props.evolucao ? (
            <div style={{ ...cardBorder, padding: "22px 24px", marginBottom: 22 }}>
              <div style={{ ...label, fontSize: 12, marginBottom: 18 }}>
                Evolução do faturamento
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 40 }}>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 28,
                    height: 150,
                  }}
                >
                  <Bar
                    fat={props.evolucao.fatAnteriorLabel}
                    fatColor={C.text2}
                    height={props.evolucao.anteriorH}
                    barColor="#E7E2D8"
                    mes={props.evolucao.mesAnteriorLabel}
                    mesColor={C.text2}
                  />
                  <Bar
                    fat={props.evolucao.fatAtualLabel}
                    fatColor={C.ink}
                    height={props.evolucao.atualH}
                    barColor={C.gold}
                    mes={props.evolucao.mesAtualLabel}
                    mesColor={C.text}
                    mesBold
                  />
                </div>
                <div
                  style={{
                    width: 200,
                    borderLeft: `1px solid ${C.line}`,
                    paddingLeft: 28,
                  }}
                >
                  <div
                    style={{
                      font: `700 30px ${SERIF}`,
                      color: props.evolucao.crescimentoTone === "up" ? C.green : C.red,
                      fontVariantNumeric: "tabular-nums",
                      lineHeight: 1,
                    }}
                  >
                    {props.evolucao.crescimentoLabel}
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: C.text2,
                      marginTop: 6,
                    }}
                  >
                    de variação em relação ao mês anterior.
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Resumo */}
          <div
            style={{
              ...cardBorder,
              background: C.band,
              borderLeft: `3px solid ${C.gold}`,
              padding: "20px 24px",
            }}
          >
            <div style={{ ...label, fontSize: 12, marginBottom: 9 }}>
              Em palavras simples
            </div>
            <div
              style={{ fontSize: 14, lineHeight: 1.65, color: C.text, textWrap: "pretty" }}
            >
              {props.resumoTexto}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 14,
              marginTop: 18,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>
              Preparado por{" "}
              <strong style={{ color: C.text, fontWeight: 600 }}>
                {props.brandName}
              </strong>
            </div>
            <div style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>
              Dúvidas? Fale com seu contador pelo portal.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Uma linha da tabela "Ação necessária" (3 células do grid). */
function RowFrag({ p }: { p: ProximoLinha }) {
  return (
    <>
      <span style={{ fontSize: 13, fontWeight: 500, color: C.text, padding: "5px 0" }}>
        {p.tipo}
      </span>
      <span
        style={{ fontSize: 12, color: C.muted, padding: "5px 0", textAlign: "right" }}
      >
        {p.whenLabel}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: C.ink,
          padding: "5px 0",
          textAlign: "right",
        }}
      >
        {p.amountLabel}
      </span>
    </>
  );
}

/** Um chip de indicador (Faturamento / Carga). */
function Chip({
  k,
  v,
  children,
}: {
  k: string;
  v: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ ...cardBorder, borderRadius: 10, padding: "16px 18px" }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: C.muted,
          marginBottom: 7,
        }}
      >
        {k}
      </div>
      <div
        style={{
          fontSize: 21,
          fontWeight: 600,
          color: C.ink,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {v}
      </div>
      <div style={{ fontSize: 12, fontWeight: 500, marginTop: 3 }}>{children}</div>
    </div>
  );
}

/** Uma barra da evolução (rótulo do valor em cima, barra, mês embaixo). */
function Bar({
  fat,
  fatColor,
  height,
  barColor,
  mes,
  mesColor,
  mesBold,
}: {
  fat: string;
  fatColor: string;
  height: number;
  barColor: string;
  mes: string;
  mesColor: string;
  mesBold?: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        justifyContent: "flex-end",
        height: "100%",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: fatColor,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {fat}
      </div>
      <div
        style={{
          width: "100%",
          maxWidth: 120,
          height,
          background: barColor,
          borderRadius: "5px 5px 0 0",
        }}
      />
      <div style={{ fontSize: 11, fontWeight: mesBold ? 600 : 500, color: mesColor }}>
        {mes}
      </div>
    </div>
  );
}
