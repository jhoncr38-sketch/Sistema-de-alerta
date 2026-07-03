"use client";

import { useState, useTransition } from "react";
import {
  ChevronDown,
  Loader2,
  Minus,
  Pencil,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  createMission,
  deleteMission,
  setMissionProgress,
  updateMission,
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
import { formatDayMonth } from "@/lib/format";
import type { IconKey } from "@/lib/rewards";
import { cn } from "@/lib/utils";

export interface AdminCompany {
  id: string;
  name: string;
}

export interface AdminMission {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  coins: number;
  xp: number;
  target: number;
  dueDate: string | null;
  companyId: string | null;
}

const inputBase =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Ícones oferecidos ao criar/editar uma missão (subconjunto curado). */
const ICON_OPTIONS: { value: IconKey; label: string }[] = [
  { value: "target", label: "Alvo" },
  { value: "file-check", label: "Documento" },
  { value: "dollar", label: "Pagamento" },
  { value: "calendar-check", label: "Prazo" },
  { value: "star", label: "Estrela" },
  { value: "shield-check", label: "Escudo" },
  { value: "trophy", label: "Troféu" },
  { value: "rocket", label: "Foguete" },
  { value: "sparkles", label: "Brilho" },
  { value: "gift", label: "Presente" },
];

export function RewardsMissionsPanel({
  companies,
  missions,
  progress,
}: {
  companies: AdminCompany[];
  missions: AdminMission[];
  /** Progresso por empresa, chaveado por `${missionId}:${companyId}`. */
  progress: Record<string, { progress: number; completed: boolean }>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Crie desafios com recompensa e acompanhe empresa a empresa. Ao concluir,
          as SJ Coins e o XP entram automaticamente no cliente.
        </p>
        <MissionFormDialog companies={companies} />
      </div>

      {missions.length === 0 ? (
        <div className="rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
          <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Target className="size-5" />
          </span>
          <p className="text-sm font-medium">Nenhuma missão criada ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crie a primeira missão para engajar seus clientes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {missions.map((m) => (
            <MissionRow
              key={m.id}
              mission={m}
              companies={companies}
              progress={progress}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MissionRow({
  mission,
  companies,
  progress,
}: {
  mission: AdminMission;
  companies: AdminCompany[];
  progress: Record<string, { progress: number; completed: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [pendingDelete, startDelete] = useTransition();

  // Empresas elegíveis: todas (missão global) ou apenas a dona (específica).
  const applicable = mission.companyId
    ? companies.filter((c) => c.id === mission.companyId)
    : companies;

  const completedCount = applicable.filter(
    (c) => progress[`${mission.id}:${c.id}`]?.completed,
  ).length;

  function remove() {
    if (!confirm(`Encerrar a missão "${mission.title}"? Isso a remove do portal.`))
      return;
    startDelete(async () => {
      try {
        await deleteMission(mission.id);
        toast.success("Missão encerrada.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao encerrar.");
      }
    });
  }

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex items-start gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:size-5">
          <RewardIcon name={(mission.icon || "target") as IconKey} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{mission.title}</p>
            <Badge variant="outline" className="font-normal">
              {mission.companyId
                ? applicable[0]?.name ?? "Empresa"
                : "Todas as empresas"}
            </Badge>
          </div>
          {mission.description ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {mission.description}
            </p>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              +{mission.coins} <Coin className="text-xs" />
            </span>
            {mission.xp > 0 ? <span>+{mission.xp} XP</span> : null}
            <span>Meta: {mission.target}</span>
            {mission.dueDate ? (
              <span>Prazo: {formatDayMonth(mission.dueDate)}</span>
            ) : null}
            <span className="font-medium text-foreground">
              {completedCount}/{applicable.length} concluíram
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <MissionFormDialog companies={companies} mission={mission} />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={remove}
            disabled={pendingDelete}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            title="Encerrar missão"
          >
            {pendingDelete ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between border-t px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
      >
        <span>Gerenciar progresso</span>
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="divide-y border-t">
          {applicable.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              Nenhuma empresa elegível.
            </p>
          ) : (
            applicable.map((c) => (
              <CompanyProgressRow
                key={c.id}
                missionId={mission.id}
                company={c}
                target={mission.target}
                value={progress[`${mission.id}:${c.id}`]?.progress ?? 0}
                completed={progress[`${mission.id}:${c.id}`]?.completed ?? false}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function CompanyProgressRow({
  missionId,
  company,
  target,
  value,
  completed,
}: {
  missionId: string;
  company: AdminCompany;
  target: number;
  value: number;
  completed: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function set(next: number) {
    startTransition(async () => {
      try {
        await setMissionProgress(missionId, company.id, next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao atualizar.");
      }
    });
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm">{company.name}</span>

      {completed ? (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
          Concluída
        </Badge>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={pending || value <= 0}
          onClick={() => set(Math.max(0, value - 1))}
          title="Diminuir"
        >
          <Minus />
        </Button>
        <span className="w-12 text-center text-sm font-medium tabular-nums">
          {pending ? (
            <Loader2 className="mx-auto size-4 animate-spin" />
          ) : (
            `${value}/${target}`
          )}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          disabled={pending || value >= target}
          onClick={() => set(Math.min(target, value + 1))}
          title="Aumentar"
        >
          <Plus />
        </Button>
      </div>

      {!completed ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => set(target)}
        >
          Concluir
        </Button>
      ) : null}
    </div>
  );
}

/** Formulário de missão — cria (sem `mission`) ou edita (com `mission`). */
function MissionFormDialog({
  companies,
  mission,
}: {
  companies: AdminCompany[];
  mission?: AdminMission;
}) {
  const isEdit = !!mission;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setError(null);
    startTransition(async () => {
      const res = isEdit
        ? await updateMission({}, formData)
        : await createMission({}, formData);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast.success(isEdit ? "Missão atualizada." : "Missão criada.");
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
          title="Editar missão"
        >
          <Pencil />
        </Button>
      ) : (
        <Button type="button" size="sm" onClick={() => setOpen(true)}>
          <Target className="size-4" />
          Nova missão
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Editar missão" : "Nova missão"}</DialogTitle>
            <DialogDescription>
              Um desafio com recompensa. Ao concluir, as SJ Coins e o XP entram no
              cliente automaticamente.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-3">
            {isEdit ? <input type="hidden" name="id" value={mission.id} /> : null}

            <div className="space-y-1.5">
              <Label htmlFor="m-title">Título *</Label>
              <Input
                id="m-title"
                name="title"
                required
                defaultValue={mission?.title ?? ""}
                placeholder="Ex.: Envie as notas fiscais do mês"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-description">Descrição</Label>
              <textarea
                id="m-description"
                name="description"
                rows={2}
                defaultValue={mission?.description ?? ""}
                placeholder="Instruções ou detalhes (opcional)."
                className={cn(inputBase, "h-auto py-2 resize-none")}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="m-company">Para quem *</Label>
                <select
                  id="m-company"
                  name="company_id"
                  defaultValue={mission?.companyId ?? ""}
                  className={inputBase}
                >
                  <option value="">Todas as empresas</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-icon">Ícone</Label>
                <select
                  id="m-icon"
                  name="icon"
                  defaultValue={mission?.icon ?? "target"}
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

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-coins">SJ Coins</Label>
                <Input
                  id="m-coins"
                  name="coins"
                  type="number"
                  min={0}
                  step={10}
                  defaultValue={mission?.coins ?? ""}
                  placeholder="300"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-xp">XP</Label>
                <Input
                  id="m-xp"
                  name="xp"
                  type="number"
                  min={0}
                  step={10}
                  defaultValue={mission?.xp ?? ""}
                  placeholder="250"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-target">Meta</Label>
                <Input
                  id="m-target"
                  name="target"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={mission?.target ?? 1}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="m-due">Prazo (opcional)</Label>
              <Input
                id="m-due"
                name="due_date"
                type="date"
                defaultValue={mission?.dueDate ?? ""}
              />
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
                    : "Criar missão"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
