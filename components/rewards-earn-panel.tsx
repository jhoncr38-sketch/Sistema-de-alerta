"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, Pencil, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteEarnRule,
  saveEarnRule,
  setEarnRuleActive,
} from "@/app/(admin)/painel/rewards/actions";
import { Coin } from "@/components/rewards/coin";
import { RewardIcon } from "@/components/rewards/reward-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DOC_TYPE_LABELS, docTypeOptionsFor } from "@/lib/constants";
import type { IconKey } from "@/lib/rewards";
import { cn } from "@/lib/utils";

export interface AdminEarnRule {
  key: string;
  label: string;
  description: string;
  icon: string;
  coins: number;
  xp: number;
  active: boolean;
  /** Gatilho automático por pagamento: 'boleto' | 'parcelamento' | null. */
  payCategoria: string | null;
  /** DocType específico (só p/ boleto) ou null = qualquer tipo da categoria. */
  payType: string | null;
}

const inputBase =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const ICON_OPTIONS: { value: IconKey; label: string }[] = [
  { value: "file-check", label: "Documento" },
  { value: "dollar", label: "Pagamento" },
  { value: "calendar-check", label: "Prazo" },
  { value: "user-edit", label: "Cadastro" },
  { value: "survey", label: "Pesquisa" },
  { value: "smartphone", label: "App" },
  { value: "video", label: "Vídeo" },
  { value: "target", label: "Alvo" },
  { value: "shield-check", label: "Escudo" },
  { value: "star", label: "Estrela" },
  { value: "sparkles", label: "Brilho" },
  { value: "gift", label: "Presente" },
];

/** Opções do gatilho automático de pagamento (usa os mesmos tipos do upload). */
const TRIGGER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Manual (eu lanço)" },
  { value: "parcelamento", label: "Ao pagar em dia — Parcelamento" },
  { value: "boleto", label: "Ao pagar em dia — Qualquer boleto" },
  ...docTypeOptionsFor("boleto").map((o) => ({
    value: `boleto:${o.value}`,
    label: `Ao pagar em dia — ${o.label}`,
  })),
];

/** Valor do <select> de gatilho a partir do estado salvo da regra. */
function triggerValue(rule?: AdminEarnRule): string {
  if (!rule || !rule.payCategoria) return "";
  if (rule.payCategoria === "parcelamento") return "parcelamento";
  if (rule.payCategoria === "boleto")
    return rule.payType ? `boleto:${rule.payType}` : "boleto";
  return "";
}

/** Selo curto do que dispara a ação automaticamente (ou null se manual). */
function autoBadge(rule: AdminEarnRule): string | null {
  if (rule.payCategoria === "parcelamento") return "Auto: parcela em dia";
  if (rule.payCategoria === "boleto") {
    if (!rule.payType) return "Auto: boleto em dia";
    const label =
      DOC_TYPE_LABELS[rule.payType as keyof typeof DOC_TYPE_LABELS] ??
      rule.payType;
    return `Auto: ${label} em dia`;
  }
  if (rule.key === "doc-no-prazo") return "Auto: envio de documento";
  if (rule.key === "acessar-app") return "Auto: acesso ao app";
  return null;
}

export function RewardsEarnPanel({ rules }: { rules: AdminEarnRule[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          As ações que dão SJ Coins. Editar o valor muda o crédito; ocultar ou
          apagar desliga a ação (inclusive o crédito automático dela).
        </p>
        <EarnRuleFormDialog />
      </div>

      {rules.length === 0 ? (
        <div className="rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </span>
          <p className="text-sm font-medium">Nenhuma ação cadastrada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie a primeira forma de ganhar SJ Coins.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((r) => (
            <EarnRuleRow key={r.key} rule={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function EarnRuleRow({ rule }: { rule: AdminEarnRule }) {
  const [pendingToggle, startToggle] = useTransition();
  const [pendingDelete, startDelete] = useTransition();

  function toggle() {
    startToggle(async () => {
      try {
        await setEarnRuleActive(rule.key, !rule.active);
        toast.success(rule.active ? "Ação ocultada." : "Ação ativada.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha na operação.");
      }
    });
  }

  function remove() {
    if (
      !confirm(
        `Apagar a ação "${rule.label}"? Ela some do card e, se creditava sozinha, deixa de creditar.`,
      )
    )
      return;
    startDelete(async () => {
      try {
        await deleteEarnRule(rule.key);
        toast.success("Ação apagada.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao apagar.");
      }
    });
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
        !rule.active && "opacity-60",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
        <RewardIcon name={(rule.icon || "sparkles") as IconKey} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{rule.label}</p>
          {autoBadge(rule) ? (
            <Badge variant="outline" className="font-normal text-primary">
              {autoBadge(rule)}
            </Badge>
          ) : null}
          {!rule.active ? (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Inativa
            </Badge>
          ) : null}
        </div>
        {rule.description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {rule.description}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
            +{rule.coins} <Coin className="text-xs" />
          </span>
          {rule.xp > 0 ? <span>+{rule.xp} XP</span> : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <EarnRuleFormDialog rule={rule} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          disabled={pendingToggle}
          title={rule.active ? "Ocultar" : "Ativar"}
        >
          {pendingToggle ? (
            <Loader2 className="animate-spin" />
          ) : rule.active ? (
            <EyeOff />
          ) : (
            <Eye />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={remove}
          disabled={pendingDelete}
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          title="Apagar ação"
        >
          {pendingDelete ? <Loader2 className="animate-spin" /> : <Trash2 />}
        </Button>
      </div>
    </div>
  );
}

/** Formulário de boa ação — cria (sem `rule`) ou edita (com `rule`). */
function EarnRuleFormDialog({ rule }: { rule?: AdminEarnRule }) {
  const isEdit = !!rule;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await saveEarnRule({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(isEdit ? "Ação atualizada." : "Ação criada.");
      if (!isEdit) form.reset();
      setOpen(false);
    });
  }

  return (
    <>
      {isEdit ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(true)}
          title="Editar ação"
        >
          <Pencil />
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Sparkles className="size-4" />
          Nova ação
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar ação" : "Nova ação"}</DialogTitle>
            <DialogDescription>
              Uma forma de ganhar SJ Coins na seção “Como ganhar SJ Coins”.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            {isEdit ? <input type="hidden" name="key" value={rule.key} /> : null}

            <div className="space-y-1.5">
              <Label htmlFor="e-label">Nome *</Label>
              <Input
                id="e-label"
                name="label"
                required
                defaultValue={rule?.label ?? ""}
                placeholder="Ex.: Enviar documentos"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="e-description">Descrição</Label>
              <Input
                id="e-description"
                name="description"
                defaultValue={rule?.description ?? ""}
                placeholder="Ex.: Antes do prazo combinado"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="e-coins">SJ Coins</Label>
                <Input
                  id="e-coins"
                  name="coins"
                  type="number"
                  min={0}
                  step={10}
                  defaultValue={rule?.coins ?? ""}
                  placeholder="100"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-xp">XP</Label>
                <Input
                  id="e-xp"
                  name="xp"
                  type="number"
                  min={0}
                  step={10}
                  defaultValue={rule?.xp ?? ""}
                  placeholder="100"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-icon">Ícone</Label>
                <select
                  id="e-icon"
                  name="icon"
                  defaultValue={rule?.icon ?? "sparkles"}
                  className={inputBase}
                >
                  {ICON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="e-trigger">Creditar automaticamente</Label>
              <select
                id="e-trigger"
                name="pay_trigger"
                defaultValue={triggerValue(rule)}
                className={inputBase}
              >
                {TRIGGER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Vincula esta ação ao pagamento em dia de um tipo de documento (o
                “Tipo de imposto” do upload). “Manual” = você lança quando quiser.
              </p>
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Cancelar
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending
                  ? "Salvando..."
                  : isEdit
                    ? "Salvar alterações"
                    : "Criar ação"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
