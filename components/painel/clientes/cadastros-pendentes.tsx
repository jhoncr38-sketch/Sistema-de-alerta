"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Sparkles, UserCheck } from "lucide-react";
import { approveClient, rejectClient } from "@/app/(admin)/painel/clientes/actions";
import { CnpjInput } from "@/components/masked-inputs";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CadastroPendente {
  id: string;
  name: string;
  email: string | null;
  /** Empresa sugerida pelo domínio do e-mail. */
  sugestao: { id: string; nome: string } | null;
}

const selectClass =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Enviar({ children, variant }: { children: React.ReactNode; variant?: "ghost" }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      variant={variant}
      disabled={pending}
      className="h-7 rounded-[7px] px-2.5 text-[13px]"
    >
      {pending ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Button>
  );
}

/**
 * Faixa "N cadastros aguardando aprovação" (tela Clientes): 1 clique para
 * vincular à empresa sugerida; "outra" abre o fluxo completo (escolher outra
 * empresa, criar uma nova ou recusar).
 */
export function CadastrosPendentes({
  pendentes,
  empresas,
}: {
  pendentes: CadastroPendente[];
  empresas: { id: string; label: string; cnpj: string }[];
}) {
  const [escolhido, setAberto] = useState<CadastroPendente | null>(null);
  // Depois de aprovar/recusar a página recarrega sem a pessoa: o diálogo fecha sozinho.
  const aberto = escolhido && pendentes.some((p) => p.id === escolhido.id) ? escolhido : null;
  if (pendentes.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-amber-300 bg-[#fffdf5] px-3.5 py-2.5 dark:border-amber-800 dark:bg-amber-950/20">
      <span className="inline-flex items-center gap-2 text-[13px] font-semibold whitespace-nowrap text-amber-800 dark:text-amber-300">
        <UserCheck className="size-[15px]" />
        {pendentes.length} {pendentes.length === 1 ? "cadastro aguardando" : "cadastros aguardando"} aprovação
      </span>
      <div className="flex flex-wrap gap-2">
        {pendentes.map((p) => (
          <div
            key={p.id}
            className="inline-flex max-w-full flex-wrap items-center gap-2.5 rounded-lg border border-amber-200 bg-card py-1 pr-1 pl-2.5 text-[13px] dark:border-amber-900"
          >
            <span className="min-w-0 leading-snug">
              <strong className="font-semibold">{p.name}</strong>{" "}
              <span className="text-muted-foreground">{p.email ?? "sem e-mail"}</span>
              {p.sugestao ? (
                <span className="block text-xs text-muted-foreground">
                  <Sparkles className="inline size-[11px]" /> sugestão pelo e-mail:{" "}
                  <strong className="font-medium text-foreground">{p.sugestao.nome}</strong>
                </span>
              ) : null}
            </span>
            {p.sugestao ? (
              <form action={approveClient} className="contents">
                <input type="hidden" name="userId" value={p.id} />
                <input type="hidden" name="companyId" value={p.sugestao.id} />
                <Enviar>
                  <Check />
                  Vincular a {p.sugestao.nome}
                </Enviar>
              </form>
            ) : null}
            <button
              type="button"
              onClick={() => setAberto(p)}
              className={
                p.sugestao
                  ? "pr-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                  : "inline-flex h-7 items-center rounded-[7px] bg-primary px-2.5 text-[13px] font-medium text-primary-foreground hover:brightness-110"
              }
            >
              {p.sugestao ? "outra" : "Escolher empresa"}
            </button>
          </div>
        ))}
      </div>

      <Dialog open={!!aberto} onOpenChange={(v) => !v && setAberto(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar {aberto?.name}</DialogTitle>
            <DialogDescription>{aberto?.email ?? "sem e-mail"}</DialogDescription>
          </DialogHeader>
          {aberto ? (
            <>
              <form action={approveClient} className="space-y-3">
                <input type="hidden" name="userId" value={aberto.id} />
                <div className="space-y-1.5">
                  <Label htmlFor="pend-empresa">Vincular à empresa</Label>
                  <select id="pend-empresa" name="companyId" className={selectClass} defaultValue={aberto.sugestao?.id ?? ""}>
                    <option value="">— Criar nova empresa —</option>
                    {empresas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label} ({c.cnpj})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="pend-razao" className="text-xs">
                      Razão social (nova)
                    </Label>
                    <Input id="pend-razao" name="razao_social" placeholder="Empresa X Ltda" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="pend-cnpj" className="text-xs">
                      CNPJ (novo)
                    </Label>
                    <CnpjInput id="pend-cnpj" name="cnpj" />
                  </div>
                </div>
                <Enviar>Aprovar e vincular</Enviar>
              </form>
              <form action={rejectClient} className="border-t pt-3">
                <input type="hidden" name="userId" value={aberto.id} />
                <Enviar variant="ghost">Recusar cadastro</Enviar>
              </form>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
