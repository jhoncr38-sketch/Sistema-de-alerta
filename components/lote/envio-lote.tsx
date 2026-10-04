"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Send,
  Sparkles,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { docTypeOptionsFor } from "@/lib/constants";
import { formatCurrency } from "@/lib/format";
import type { AnaliseGuia } from "@/lib/lote";
import type { DocType } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Máximo de PDFs por lote e quantos processar ao mesmo tempo. */
const MAX_ARQUIVOS = 60;
const PARALELO_LEITURA = 4;
const PARALELO_PUBLICACAO = 3;

const TIPOS = docTypeOptionsFor("boleto");

type Status =
  | "lendo"
  | "pronto"
  | "conferir"
  | "publicando"
  | "publicado"
  | "falhou";

interface Campos {
  companyId: string;
  tipo: DocType | "";
  descricao: string;
  competencia: string; // MM/AAAA
  valor: string; // pt-BR: "1.529,07"
  vencimento: string; // YYYY-MM-DD
}

interface Item {
  key: string;
  file: File;
  url: string; // blob: para abrir o PDF
  status: Status;
  marcado: boolean;
  campos: Campos;
  /** CNPJ/CPF que a IA leu (mostrado quando não achou o cliente). */
  documentoLido: string | null;
  duplicada: string | null;
  /** Avisos informativos da leitura (não impedem publicar). */
  notas: string[];
  erro: string | null;
  documentId: string | null;
}

export interface ClienteOpcao {
  id: string;
  label: string;
}

/** "1.529,07" / "1529.07" / "1529,07" → 1529.07 (NaN se inválido). */
function parseValor(s: string): number {
  let t = s.trim().replace(/\s|R\$/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  return Number(t);
}

function formatarValor(n: number | null): string {
  if (n == null) return "";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** O que falta para a guia poder ser publicada (vazio = completa). */
function pendencias(c: Campos): string[] {
  const p: string[] = [];
  if (!c.companyId) p.push("cliente");
  if (!c.tipo) p.push("tipo");
  if (c.tipo === "outro" && !c.descricao.trim()) p.push("descrição");
  if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(c.competencia.trim())) p.push("competência");
  const v = parseValor(c.valor);
  if (!Number.isFinite(v) || v <= 0) p.push("valor");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)) p.push("vencimento");
  return p;
}

/** Roda `tarefa` em cada item com no máximo `n` ao mesmo tempo. */
async function emParalelo<T>(itens: T[], n: number, tarefa: (t: T) => Promise<void>) {
  const fila = [...itens];
  const trabalhador = async () => {
    while (fila.length > 0) {
      const proximo = fila.shift();
      if (proximo !== undefined) await tarefa(proximo);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, fila.length) }, trabalhador));
}

const inputBase =
  "h-8 w-full rounded-md border bg-background px-2 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60";

/**
 * Envio em lote com IA (painel do contador): arrasta vários PDFs, a IA lê
 * cliente/tipo/competência/valor/vencimento, o contador confere e publica.
 * Cada cliente recebe UM e-mail com as guias dele.
 */
export function EnvioLote({ clientes }: { clientes: ClienteOpcao[] }) {
  const [itens, setItens] = useState<Item[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const [exigeComprovante, setExigeComprovante] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [resultado, setResultado] = useState<{
    publicadas: number;
    falhas: number;
    empresas: number;
  } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<string[]>([]);

  // Libera os blob: dos PDFs ao sair da tela.
  useEffect(() => () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const nomeCliente = new Map(clientes.map((c) => [c.id, c.label]));

  function atualizar(key: string, mudar: (i: Item) => Item) {
    setItens((lista) => lista.map((i) => (i.key === key ? mudar(i) : i)));
  }

  async function analisar(item: Item) {
    const fd = new FormData();
    fd.set("file", item.file);
    let r: AnaliseGuia | null = null;
    try {
      const res = await fetch("/api/lote/analisar", { method: "POST", body: fd });
      r = (await res.json()) as AnaliseGuia;
    } catch {
      r = null;
    }
    atualizar(item.key, (i) => {
      if (!r || !r.ok) {
        return {
          ...i,
          status: "conferir",
          marcado: false,
          erro: r?.erro ?? "Falha de conexão ao ler o PDF.",
        };
      }
      const campos: Campos = {
        companyId: r.companyId ?? "",
        tipo: r.tipo ?? "",
        descricao: r.descricao ?? "",
        competencia: r.competencia ?? "",
        valor: formatarValor(r.valor),
        vencimento: r.vencimento ?? "",
      };
      const completa = pendencias(campos).length === 0;
      const ok = completa && !r.duplicada;
      return {
        ...i,
        campos,
        documentoLido: r.documento,
        duplicada: r.duplicada,
        notas: r.notas ?? [],
        erro: null,
        status: ok ? "pronto" : "conferir",
        marcado: ok,
      };
    });
  }

  function adicionar(lista: FileList | File[]) {
    setResultado(null);
    setAviso(null);
    const pdfs = [...lista].filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    const ignorados = lista.length - pdfs.length;
    const jaTem = new Set(itens.map((i) => `${i.file.name}|${i.file.size}`));
    const novosArquivos = pdfs
      .filter((f) => !jaTem.has(`${f.name}|${f.size}`))
      .slice(0, Math.max(0, MAX_ARQUIVOS - itens.length));
    const cortados = pdfs.length - novosArquivos.length;

    const avisos: string[] = [];
    if (ignorados > 0) avisos.push(`${ignorados} arquivo(s) ignorado(s) por não serem PDF.`);
    if (cortados > 0) avisos.push(`${cortados} PDF(s) repetido(s) ou acima do limite de ${MAX_ARQUIVOS}.`);
    setAviso(avisos.length ? avisos.join(" ") : null);
    if (novosArquivos.length === 0) return;

    const novos: Item[] = novosArquivos.map((file) => {
      const url = URL.createObjectURL(file);
      urlsRef.current.push(url);
      return {
        key: crypto.randomUUID(),
        file,
        url,
        status: "lendo",
        marcado: false,
        campos: { companyId: "", tipo: "", descricao: "", competencia: "", valor: "", vencimento: "" },
        documentoLido: null,
        duplicada: null,
        notas: [],
        erro: null,
        documentId: null,
      };
    });
    setItens((l) => [...l, ...novos]);
    void emParalelo(novos, PARALELO_LEITURA, analisar);
  }

  function editar(key: string, campo: keyof Campos, valor: string) {
    atualizar(key, (i) => {
      const campos = { ...i.campos, [campo]: valor };
      const completaAntes = pendencias(i.campos).length === 0;
      const completaAgora = pendencias(campos).length === 0;
      // Ficou completa agora (e não é duplicada): já marca para publicar.
      const marcado =
        !completaAgora ? false : !completaAntes && !i.duplicada ? true : i.marcado;
      return {
        ...i,
        campos,
        marcado,
        status: completaAgora && !i.duplicada ? "pronto" : "conferir",
      };
    });
  }

  function remover(key: string) {
    setItens((l) => {
      const alvo = l.find((i) => i.key === key);
      if (alvo) URL.revokeObjectURL(alvo.url);
      return l.filter((i) => i.key !== key);
    });
  }

  const emLeitura = itens.filter((i) => i.status === "lendo").length;
  const aPublicar = itens.filter(
    (i) => i.marcado && i.status !== "publicado" && pendencias(i.campos).length === 0,
  );
  const clientesAvisados = new Set(aPublicar.map((i) => i.campos.companyId)).size;
  const totalAPublicar = aPublicar.reduce((s, i) => s + parseValor(i.campos.valor), 0);
  const prontas = itens.filter((i) => i.status === "pronto").length;
  const conferir = itens.filter((i) => i.status === "conferir").length;
  const publicadas = itens.filter((i) => i.status === "publicado").length;

  async function publicar() {
    setConfirmando(false);
    setPublicando(true);
    const ids: string[] = [];
    let falhas = 0;
    const lote = aPublicar;
    lote.forEach((i) => atualizar(i.key, (x) => ({ ...x, status: "publicando", erro: null })));

    await emParalelo(lote, PARALELO_PUBLICACAO, async (item) => {
      const c = item.campos;
      const fd = new FormData();
      fd.set("file", item.file);
      fd.set("companyId", c.companyId);
      fd.set("tipo", c.tipo);
      fd.set("descricao", c.descricao);
      fd.set("competencia", c.competencia.trim());
      fd.set("valor", String(parseValor(c.valor)));
      fd.set("vencimento", c.vencimento);
      if (exigeComprovante) fd.set("exigeComprovante", "1");
      try {
        const res = await fetch("/api/lote/publicar", { method: "POST", body: fd });
        const r = (await res.json()) as { ok: boolean; erro?: string; documentId?: string };
        if (r.ok && r.documentId) {
          ids.push(r.documentId);
          atualizar(item.key, (x) => ({
            ...x,
            status: "publicado",
            marcado: false,
            documentId: r.documentId ?? null,
          }));
        } else {
          falhas++;
          atualizar(item.key, (x) => ({ ...x, status: "falhou", erro: r.erro ?? "Falha ao publicar." }));
        }
      } catch {
        falhas++;
        atualizar(item.key, (x) => ({ ...x, status: "falhou", erro: "Falha de conexão." }));
      }
    });

    let empresas = 0;
    if (ids.length > 0) {
      try {
        const res = await fetch("/api/lote/notificar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentIds: ids }),
        });
        const r = (await res.json()) as { empresas?: number };
        empresas = r.empresas ?? 0;
      } catch {
        /* as guias já estão publicadas; só o aviso falhou */
      }
    }
    setResultado({ publicadas: ids.length, falhas, empresas });
    setPublicando(false);
  }

  return (
    <div className="space-y-4">
      {/* ----- Área de arrastar ----- */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (e.dataTransfer.files.length) adicionar(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-card px-6 py-10 text-center transition-colors",
          arrastando ? "border-primary bg-primary/5" : "hover:border-primary/50",
        )}
      >
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Upload className="size-5" />
        </span>
        <p className="text-sm font-medium">
          Arraste os PDFs das guias aqui, ou clique para escolher
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="size-3.5 text-amber-500" />
          A IA lê cliente (CNPJ), tipo, competência, valor e vencimento. Até{" "}
          {MAX_ARQUIVOS} PDFs por vez.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) adicionar(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {aviso ? <p className="text-xs text-amber-700 dark:text-amber-400">{aviso}</p> : null}

      {resultado ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>
            <strong>{resultado.publicadas}</strong>{" "}
            {resultado.publicadas === 1 ? "guia publicada" : "guias publicadas"} ·{" "}
            {resultado.empresas} {resultado.empresas === 1 ? "cliente avisado" : "clientes avisados"} por e-mail
            {resultado.falhas > 0 ? ` · ${resultado.falhas} com falha (veja abaixo)` : ""}
          </span>
          <Link href="/painel/documentos" className="ml-auto font-medium underline-offset-2 hover:underline">
            Ver em Documentos
          </Link>
        </div>
      ) : null}

      {itens.length > 0 ? (
        <>
          {/* ----- Resumo + publicar ----- */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
              {emLeitura > 0 ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> lendo {emLeitura}
                </span>
              ) : null}
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="size-3.5" /> {prontas} prontas
              </span>
              <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="size-3.5" /> {conferir} para conferir
              </span>
              {publicadas > 0 ? <span>{publicadas} publicadas</span> : null}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={exigeComprovante}
                  onChange={(e) => setExigeComprovante(e.target.checked)}
                  className="size-4 accent-primary"
                />
                Exigir comprovante
              </label>
              {confirmando ? (
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[13px]">
                    Publicar <strong>{aPublicar.length}</strong> guias ({formatCurrency(totalAPublicar)}) e avisar{" "}
                    <strong>{clientesAvisados}</strong> {clientesAvisados === 1 ? "cliente" : "clientes"} por e-mail?
                  </span>
                  <Button size="sm" onClick={publicar}>
                    <Send /> Confirmar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>
                    Cancelar
                  </Button>
                </span>
              ) : (
                <Button
                  size="sm"
                  disabled={aPublicar.length === 0 || emLeitura > 0 || publicando}
                  onClick={() => setConfirmando(true)}
                >
                  {publicando ? <Loader2 className="animate-spin" /> : <Send />}
                  {publicando ? "Publicando…" : `Publicar ${aPublicar.length} ${aPublicar.length === 1 ? "guia" : "guias"}`}
                </Button>
              )}
            </div>
          </div>

          {/* ----- Tabela de conferência ----- */}
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="w-9 px-3 py-2" />
                  <th className="px-2 py-2 font-medium">Arquivo</th>
                  <th className="w-[230px] px-2 py-2 font-medium">Cliente</th>
                  <th className="w-[190px] px-2 py-2 font-medium">Tipo</th>
                  <th className="w-[95px] px-2 py-2 font-medium">Competência</th>
                  <th className="w-[110px] px-2 py-2 font-medium">Valor (R$)</th>
                  <th className="w-[140px] px-2 py-2 font-medium">Vencimento</th>
                  <th className="w-9 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => {
                  const travado =
                    i.status === "lendo" || i.status === "publicando" || i.status === "publicado";
                  const falta = i.status === "lendo" ? [] : pendencias(i.campos);
                  return (
                    <tr
                      key={i.key}
                      className={cn(
                        "border-b align-top last:border-0",
                        i.status === "publicado" && "bg-emerald-50/50 dark:bg-emerald-950/20",
                        i.status === "falhou" && "bg-red-50/50 dark:bg-red-950/20",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          aria-label={`Publicar ${i.file.name}`}
                          checked={i.marcado}
                          disabled={travado || falta.length > 0}
                          onChange={(e) => atualizar(i.key, (x) => ({ ...x, marcado: e.target.checked }))}
                          className="mt-1.5 size-4 accent-primary"
                        />
                      </td>
                      <td className="max-w-0 px-2 py-2.5">
                        <a
                          href={i.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 font-medium hover:underline"
                          title="Abrir o PDF"
                        >
                          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate">{i.file.name}</span>
                        </a>
                        <StatusLinha item={i} falta={falta} />
                      </td>
                      <td className="px-2 py-2">
                        <select
                          value={i.campos.companyId}
                          disabled={travado}
                          onChange={(e) => editar(i.key, "companyId", e.target.value)}
                          className={cn(inputBase, !i.campos.companyId && i.status !== "lendo" && "border-amber-400")}
                          title={nomeCliente.get(i.campos.companyId) ?? ""}
                        >
                          <option value="">
                            {i.documentoLido ? `Não achei ${i.documentoLido}` : "Escolha o cliente"}
                          </option>
                          {clientes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="space-y-1 px-2 py-2">
                        <select
                          value={i.campos.tipo}
                          disabled={travado}
                          onChange={(e) => editar(i.key, "tipo", e.target.value)}
                          className={cn(inputBase, !i.campos.tipo && i.status !== "lendo" && "border-amber-400")}
                        >
                          <option value="">Escolha o tipo</option>
                          {TIPOS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        {i.campos.tipo === "outro" ? (
                          <input
                            value={i.campos.descricao}
                            disabled={travado}
                            placeholder="Descrição (o cliente vê)"
                            onChange={(e) => editar(i.key, "descricao", e.target.value)}
                            className={inputBase}
                          />
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={i.campos.competencia}
                          disabled={travado}
                          placeholder="MM/AAAA"
                          inputMode="numeric"
                          onChange={(e) => editar(i.key, "competencia", e.target.value)}
                          className={cn(inputBase, falta.includes("competência") && "border-amber-400")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={i.campos.valor}
                          disabled={travado}
                          placeholder="0,00"
                          inputMode="decimal"
                          onChange={(e) => editar(i.key, "valor", e.target.value)}
                          className={cn(inputBase, "text-right tabular-nums", falta.includes("valor") && "border-amber-400")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="date"
                          value={i.campos.vencimento}
                          disabled={travado}
                          onChange={(e) => editar(i.key, "vencimento", e.target.value)}
                          className={cn(inputBase, falta.includes("vencimento") && "border-amber-400")}
                        />
                      </td>
                      <td className="px-2 py-2">
                        {i.status !== "publicado" && i.status !== "publicando" ? (
                          <button
                            type="button"
                            onClick={() => remover(i.key)}
                            aria-label={`Remover ${i.file.name}`}
                            title="Tirar da lista"
                            className="mt-1 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <X className="size-4" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Linha de situação sob o nome do arquivo. */
function StatusLinha({ item, falta }: { item: Item; falta: string[] }) {
  const base = "mt-1 flex items-center gap-1 text-xs";
  switch (item.status) {
    case "lendo":
      return (
        <p className={cn(base, "text-muted-foreground")}>
          <Loader2 className="size-3 animate-spin" /> lendo com IA…
        </p>
      );
    case "publicando":
      return (
        <p className={cn(base, "text-muted-foreground")}>
          <Loader2 className="size-3 animate-spin" /> publicando…
        </p>
      );
    case "publicado":
      return (
        <p className={cn(base, "text-emerald-700 dark:text-emerald-400")}>
          <CheckCircle2 className="size-3" /> publicada
        </p>
      );
    case "falhou":
      return (
        <p className={cn(base, "text-red-700 dark:text-red-400")}>
          <XCircle className="size-3" /> {item.erro}
        </p>
      );
    default: {
      const msgs: string[] = [];
      if (item.erro) msgs.push(item.erro);
      if (falta.length > 0) msgs.push(`Falta: ${falta.join(", ")}`);
      if (item.duplicada) msgs.push(item.duplicada);
      if (msgs.length === 0) {
        return (
          <p className={cn(base, "text-emerald-700 dark:text-emerald-400")}>
            <CheckCircle2 className="size-3" /> pronta
            {item.notas.length > 0 ? (
              <span className="text-muted-foreground"> · {item.notas.join(" · ")}</span>
            ) : null}
          </p>
        );
      }
      return (
        <p className={cn(base, "items-start text-amber-700 dark:text-amber-400")}>
          <AlertTriangle className="mt-px size-3 shrink-0" /> {msgs.join(" · ")}
        </p>
      );
    }
  }
}
