"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { ObligationsCalendar, type CalItem } from "@/components/obligations-calendar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

/** "Calendário" no cabeçalho de Clientes: abre os vencimentos do mês inteiro. */
export function BotaoCalendario({ itens }: { itens: CalItem[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 rounded-[7px] px-2.5 text-[13px]"
        onClick={() => setAberto(true)}
      >
        <CalendarDays />
        Calendário
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogTitle>Calendário de vencimentos</DialogTitle>
          {aberto ? <ObligationsCalendar items={itens} /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
