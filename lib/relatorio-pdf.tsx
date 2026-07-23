import {
  Document,
  Image,
  Page,
  renderToBuffer,
  Text,
  View,
} from "@react-pdf/renderer";
import type { RelatorioView } from "@/lib/relatorio";

/**
 * Versão PDF (arquivo) do relatório mensal — mesmo layout/dados da folha na tela
 * (`RelatorioSheet`), mas desenhada com `@react-pdf/renderer` para virar um PDF
 * real (texto selecionável), gerado no servidor sem navegador. Usa as fontes
 * padrão do PDF (Helvetica + Times) no lugar de Geist/Georgia. Roda só no
 * servidor (ação de envio e rota de download).
 */

const GOLD = "#A07C2C";
const INK = "#14110E";
const MUTED = "#9A948B";
const LINE = "#ECE7DD";
const BAND = "#FAF8F3";
const TEXT = "#3A3630";
const TEXT2 = "#6F6A64";
const GREEN = "#2F6B4F";
const RED = "#B0402F";

function RelatorioPdf({
  view,
  logoData,
}: {
  view: RelatorioView;
  logoData: string | null;
}) {
  const atencao = view.alerta.tone === "atencao";
  const alertaCor = atencao ? "#8A6A1F" : GREEN;
  const situAlerta = view.situacao.tone === "alerta";
  const situCor = situAlerta ? RED : GREEN;

  return (
    <Document>
      <Page size="A4" style={{ backgroundColor: "#FFFFFF", color: INK, fontFamily: "Helvetica", fontSize: 11 }}>
        {/* Faixa da marca */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: BAND,
            borderBottomWidth: 1,
            borderBottomColor: LINE,
            paddingVertical: 18,
            paddingHorizontal: 34,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {logoData ? (
              // @react-pdf Image (não é <img> HTML; não tem alt).
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={logoData} style={{ width: 38, height: 38, marginRight: 12, objectFit: "contain" }} />
            ) : null}
            <View>
              <Text style={{ fontFamily: "Times-Bold", fontSize: 18, color: INK }}>{view.brandName}</Text>
              <Text style={{ fontSize: 8, letterSpacing: 1.4, color: GOLD, marginTop: 3 }}>PRESTAÇÃO DE CONTAS</Text>
            </View>
          </View>
          <View>
            <Text style={{ fontFamily: "Times-Bold", fontSize: 18, color: INK, textAlign: "right" }}>{view.periodo}</Text>
            <Text style={{ fontSize: 10, color: MUTED, textAlign: "right", marginTop: 2 }}>{view.competenciaCurto}</Text>
          </View>
        </View>
        <View style={{ height: 3, backgroundColor: GOLD }} />

        <View style={{ paddingHorizontal: 34, paddingTop: 22, paddingBottom: 26 }}>
          {/* Cliente + alerta */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <View>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 14, color: INK }}>{view.cliente}</Text>
              {view.cnpj ? <Text style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>CNPJ {view.cnpj}</Text> : null}
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                borderRadius: 20,
                paddingVertical: 6,
                paddingHorizontal: 12,
                backgroundColor: atencao ? "#FBF3E3" : "#EAF3EC",
                borderWidth: 1,
                borderColor: atencao ? "#EAD8AE" : "#CBE3D0",
              }}
            >
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: alertaCor, marginRight: 6 }} />
              <Text style={{ fontSize: 11, color: alertaCor }}>{view.alerta.texto}</Text>
            </View>
          </View>

          {/* Total pago + Ação necessária */}
          <View style={{ flexDirection: "row", marginBottom: 14 }}>
            <View
              style={{
                flex: 1,
                backgroundColor: BAND,
                borderWidth: 1,
                borderColor: LINE,
                borderRadius: 10,
                padding: 18,
                marginRight: 14,
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 9, color: MUTED, letterSpacing: 0.8 }}>TOTAL PAGO NO MÊS</Text>
              <Text style={{ fontFamily: "Times-Bold", fontSize: 25, color: INK, marginTop: 8, marginBottom: 3 }}>
                {view.totalPagoLabel}
              </Text>
              <Text style={{ fontSize: 11, color: TEXT2 }}>{view.guiasPagasLabel}</Text>
            </View>
            <View style={{ flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 10, padding: 16 }}>
              <Text style={{ fontSize: 9, color: GOLD, letterSpacing: 0.8, marginBottom: 10 }}>
                AÇÃO NECESSÁRIA · {view.proximosMesLabel.toUpperCase()}
              </Text>
              {view.proximos.length === 0 ? (
                <Text style={{ fontSize: 11, color: TEXT2 }}>Nenhuma guia a vencer em {view.proximosMesLabel}.</Text>
              ) : (
                <View>
                  {view.proximos.map((p) => (
                    <View key={p.id} style={{ flexDirection: "row", alignItems: "flex-end", paddingVertical: 3 }}>
                      <Text style={{ flex: 1, fontSize: 11, color: TEXT }}>{p.tipo}</Text>
                      <Text style={{ width: 40, fontSize: 10, color: MUTED, textAlign: "right" }}>{p.whenLabel}</Text>
                      <Text style={{ width: 74, fontFamily: "Helvetica-Bold", fontSize: 11, color: INK, textAlign: "right" }}>
                        {p.amountLabel}
                      </Text>
                    </View>
                  ))}
                  {view.totalAVencerLabel ? (
                    <View>
                      <View style={{ height: 1, backgroundColor: INK, marginTop: 5 }} />
                      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 7 }}>
                        <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12, color: INK }}>Total a vencer</Text>
                        <Text style={{ fontFamily: "Times-Bold", fontSize: 13, color: INK }}>{view.totalAVencerLabel}</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          </View>

          {/* Chips */}
          <View style={{ flexDirection: "row", marginBottom: 18 }}>
            <View style={{ flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 14, marginRight: 12 }}>
              <Text style={{ fontSize: 8, color: MUTED, letterSpacing: 0.8, marginBottom: 6 }}>FATURAMENTO</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, color: INK }}>{view.faturamentoLabel ?? "—"}</Text>
              <Text style={{ fontSize: 10, marginTop: 3, color: view.faturamentoVar ? (view.faturamentoVar.tone === "up" ? GREEN : RED) : TEXT2 }}>
                {view.faturamentoVar
                  ? `${view.faturamentoVar.tone === "up" ? "+" : "−"} ${view.faturamentoVar.pctLabel}`
                  : "no mês"}
              </Text>
            </View>
            <View style={{ flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 8, padding: 14, marginRight: 12 }}>
              <Text style={{ fontSize: 8, color: MUTED, letterSpacing: 0.8, marginBottom: 6 }}>CARGA TRIBUTÁRIA</Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, color: INK }}>{view.cargaLabel ?? "—"}</Text>
              <Text style={{ fontSize: 10, color: TEXT2, marginTop: 3 }}>do faturamento</Text>
            </View>
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderRadius: 8,
                padding: 14,
                borderColor: situAlerta ? "#F0DADA" : "#D5E7D9",
                backgroundColor: situAlerta ? "#FDF6F4" : "#F2F8F3",
              }}
            >
              <Text style={{ fontSize: 8, color: situAlerta ? "#B0806F" : "#6F9A7C", letterSpacing: 0.8, marginBottom: 6 }}>
                SITUAÇÃO
              </Text>
              <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 16, color: situCor }}>{view.situacao.valor}</Text>
              <Text style={{ fontSize: 10, color: situAlerta ? "#9A6558" : "#6F9A7C", marginTop: 3 }}>
                {situAlerta ? "a regularizar" : "sem pendências"}
              </Text>
            </View>
          </View>

          {/* Evolução */}
          {view.evolucao ? (
            <View style={{ borderWidth: 1, borderColor: LINE, borderRadius: 10, padding: 18, marginBottom: 16 }}>
              <Text style={{ fontSize: 10, color: GOLD, letterSpacing: 0.8, marginBottom: 14 }}>EVOLUÇÃO DO FATURAMENTO</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-end", height: 130 }}>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontSize: 11, color: TEXT2, marginBottom: 6 }}>{view.evolucao.fatAnteriorLabel}</Text>
                    <View style={{ width: 68, height: view.evolucao.anteriorH, backgroundColor: "#E7E2D8", borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                    <Text style={{ fontSize: 10, color: TEXT2, marginTop: 6 }}>{view.evolucao.mesAnteriorLabel}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: "center" }}>
                    <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, color: INK, marginBottom: 6 }}>{view.evolucao.fatAtualLabel}</Text>
                    <View style={{ width: 68, height: view.evolucao.atualH, backgroundColor: GOLD, borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                    <Text style={{ fontSize: 10, color: TEXT, marginTop: 6 }}>{view.evolucao.mesAtualLabel}</Text>
                  </View>
                </View>
                <View style={{ width: 150, borderLeftWidth: 1, borderLeftColor: LINE, paddingLeft: 22, marginLeft: 8 }}>
                  <Text style={{ fontFamily: "Times-Bold", fontSize: 26, color: view.evolucao.crescimentoTone === "up" ? GREEN : RED }}>
                    {view.evolucao.crescimentoLabel}
                  </Text>
                  <Text style={{ fontSize: 11, color: TEXT2, marginTop: 6, lineHeight: 1.4 }}>
                    de variação em relação ao mês anterior.
                  </Text>
                </View>
              </View>
            </View>
          ) : null}

          {/* Resumo */}
          <View
            style={{
              backgroundColor: BAND,
              borderWidth: 1,
              borderColor: LINE,
              borderLeftWidth: 3,
              borderLeftColor: GOLD,
              borderRadius: 10,
              padding: 18,
            }}
          >
            <Text style={{ fontSize: 10, color: GOLD, letterSpacing: 0.8, marginBottom: 8 }}>EM PALAVRAS SIMPLES</Text>
            <Text style={{ fontSize: 11, color: TEXT, lineHeight: 1.5 }}>{view.resumoTexto}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
            <Text style={{ fontSize: 10, color: MUTED }}>Preparado por {view.brandName}</Text>
            <Text style={{ fontSize: 10, color: MUTED }}>Dúvidas? Fale com seu contador pelo portal.</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Gera o PDF do relatório como Buffer (pronto pra anexar/baixar). */
export async function renderRelatorioPdf(
  view: RelatorioView,
  logoData: string | null,
): Promise<Buffer> {
  return renderToBuffer(<RelatorioPdf view={view} logoData={logoData} />);
}

/**
 * Baixa a logo do escritório e devolve como data URI (PNG/JPG) para embutir no
 * PDF. Retorna null se não houver, falhar ou não for um formato suportado — o
 * PDF então sai só com o nome da marca (sem quebrar).
 */
export async function fetchLogoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("png") && !ct.includes("jpeg") && !ct.includes("jpg")) {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
