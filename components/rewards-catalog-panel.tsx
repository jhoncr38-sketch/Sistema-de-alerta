"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Gift, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { saveReward, setRewardActive } from "@/app/(admin)/painel/rewards/actions";
import { CoinAmount } from "@/components/rewards/coin";
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
import type { IconKey } from "@/lib/rewards";
import { cn } from "@/lib/utils";

export interface AdminReward {
  id: string;
  name: string;
  description: string;
  icon: string;
  cost: number;
  category: string;
  requiresLevel: string | null;
  active: boolean;
}

const inputBase =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

const ICON_OPTIONS: { value: IconKey; label: string }[] = [
  { value: "gift", label: "Presente" },
  { value: "ebook", label: "E-book" },
  { value: "certificate", label: "Certidão" },
  { value: "mug", label: "Caneca" },
  { value: "diagnosis", label: "Diagnóstico" },
  { value: "consulting", label: "Consultoria" },
  { value: "priority", label: "Prioridade" },
  { value: "discount", label: "Desconto" },
  { value: "star", label: "Estrela" },
  { value: "trophy", label: "Troféu" },
  { value: "sparkles", label: "Brilho" },
];

const CATEGORIES: { value: string; label: string }[] = [
  { value: "servico", label: "Serviço" },
  { value: "consultoria", label: "Consultoria" },
  { value: "brinde", label: "Brinde" },
  { value: "desconto", label: "Desconto" },
];

const LEVELS: { value: string; label: string }[] = [
  { value: "", label: "Qualquer nível" },
  { value: "prata", label: "Prata" },
  { value: "ouro", label: "Ouro" },
  { value: "diamante", label: "Diamante" },
  { value: "master", label: "Master" },
  { value: "elite", label: "Elite" },
];

function categoryLabel(v: string): string {
  return CATEGORIES.find((c) => c.value === v)?.label ?? v;
}
function levelLabel(v: string): string {
  return LEVELS.find((l) => l.value === v)?.label ?? v;
}

export function RewardsCatalogPanel({ rewards }: { rewards: AdminReward[] }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Ajuste o custo em SJ Coins, o nome, o nível exigido ou tire de cartaz.
          As mudanças valem na loja do cliente na hora.
        </p>
        <RewardFormDialog />
      </div>

      {rewards.length === 0 ? (
        <div className="rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Gift className="size-5" />
          </span>
          <p className="text-sm font-medium">Nenhum prêmio no catálogo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie o primeiro prêmio da loja.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {rewards.map((r) => (
            <RewardRow key={r.id} reward={r} />
          ))}
        </div>
      )}
    </div>
  );
}

function RewardRow({ reward }: { reward: AdminReward }) {
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      try {
        await setRewardActive(reward.id, !reward.active);
        toast.success(reward.active ? "Prêmio ocultado." : "Prêmio ativado.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha na operação.");
      }
    });
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10",
        !reward.active && "opacity-60",
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 [&_svg]:size-5 dark:bg-amber-950/50 dark:text-amber-400">
        <RewardIcon name={(reward.icon || "gift") as IconKey} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{reward.name}</p>
          <Badge variant="outline" className="font-normal">
            {categoryLabel(reward.category)}
          </Badge>
          {reward.requiresLevel ? (
            <Badge variant="outline" className="font-normal">
              Nível {levelLabel(reward.requiresLevel)}
            </Badge>
          ) : null}
          {!reward.active ? (
            <Badge variant="outline" className="font-normal text-muted-foreground">
              Inativo
            </Badge>
          ) : null}
        </div>
        {reward.description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {reward.description}
          </p>
        ) : null}
        <div className="mt-1.5">
          <CoinAmount value={reward.cost} className="text-sm" />
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <RewardFormDialog reward={reward} />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          disabled={pending}
          title={reward.active ? "Ocultar da loja" : "Ativar na loja"}
        >
          {pending ? (
            <Loader2 className="animate-spin" />
          ) : reward.active ? (
            <EyeOff />
          ) : (
            <Eye />
          )}
        </Button>
      </div>
    </div>
  );
}

/** Formulário de prêmio — cria (sem `reward`) ou edita (com `reward`). */
function RewardFormDialog({ reward }: { reward?: AdminReward }) {
  const isEdit = !!reward;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = await saveReward({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(isEdit ? "Prêmio atualizado." : "Prêmio criado.");
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
          title="Editar prêmio"
        >
          <Pencil />
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Gift className="size-4" />
          Novo prêmio
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar prêmio" : "Novo prêmio"}</DialogTitle>
            <DialogDescription>
              Prêmio da loja de recompensas. O custo é cobrado em SJ Coins no
              resgate.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            {isEdit ? <input type="hidden" name="id" value={reward.id} /> : null}

            <div className="space-y-1.5">
              <Label htmlFor="r-name">Nome *</Label>
              <Input
                id="r-name"
                name="name"
                required
                defaultValue={reward?.name ?? ""}
                placeholder="Ex.: Consultoria de 30 min"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="r-description">Descrição</Label>
              <textarea
                id="r-description"
                name="description"
                rows={2}
                defaultValue={reward?.description ?? ""}
                placeholder="O que o cliente recebe (opcional)."
                className={cn(inputBase, "h-auto py-2 resize-none")}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="r-cost">Custo (SJ Coins) *</Label>
                <Input
                  id="r-cost"
                  name="cost"
                  type="number"
                  min={1}
                  step={10}
                  required
                  defaultValue={reward?.cost ?? ""}
                  placeholder="500"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-icon">Ícone</Label>
                <select
                  id="r-icon"
                  name="icon"
                  defaultValue={reward?.icon ?? "gift"}
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="r-category">Categoria</Label>
                <select
                  id="r-category"
                  name="category"
                  defaultValue={reward?.category ?? "servico"}
                  className={inputBase}
                >
                  {CATEGORIES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="r-level">Nível exigido</Label>
                <select
                  id="r-level"
                  name="requires_level"
                  defaultValue={reward?.requiresLevel ?? ""}
                  className={inputBase}
                >
                  {LEVELS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
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
                    : "Criar prêmio"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
