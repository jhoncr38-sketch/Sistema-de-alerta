"use client";

import { FileText, Landmark, Layers, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmitirDasCard } from "@/components/emitir-das-card";
import { EmitirDarfCard } from "@/components/emitir-darf-card";
import { EmitirParcelamentoCard } from "@/components/emitir-parcelamento-card";
import { SituacaoFiscalCard } from "@/components/situacao-fiscal-card";

interface CompanyOpt {
  id: string;
  label: string;
  cnpj: string;
}

/**
 * Agrupa os serviços da Receita (DAS, DARF/DCTFWeb, Situação Fiscal) num único
 * card com abas — só a aba ativa aparece, mantendo a tela de envio limpa. Cada
 * card interno é renderizado em modo `bare` (sem seu próprio <Card>/ícone).
 */
export function ReceitaFederalPanel({
  companies,
  configurado,
}: {
  companies: CompanyOpt[];
  configurado: boolean;
}) {
  return (
    <Card className="max-w-3xl px-6 py-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Landmark className="size-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Receita Federal</h2>
          <p className="text-xs text-muted-foreground">
            Emita guias e consulte a situação fiscal direto na Receita.
          </p>
        </div>
      </div>

      <Tabs defaultValue="sitfis">
        <TabsList>
          <TabsTrigger value="sitfis">
            <ShieldCheck />
            Situação fiscal
          </TabsTrigger>
          <TabsTrigger value="das">
            <FileText />
            DAS
          </TabsTrigger>
          <TabsTrigger value="darf">
            <Landmark />
            DARF (DCTFWeb)
          </TabsTrigger>
          <TabsTrigger value="parcelamento">
            <Layers />
            Parcelamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sitfis" className="pt-4">
          <SituacaoFiscalCard
            companies={companies}
            configurado={configurado}
            bare
          />
        </TabsContent>
        <TabsContent value="das" className="pt-4">
          <EmitirDasCard companies={companies} configurado={configurado} bare />
        </TabsContent>
        <TabsContent value="darf" className="pt-4">
          <EmitirDarfCard companies={companies} configurado={configurado} bare />
        </TabsContent>
        <TabsContent value="parcelamento" className="pt-4">
          <EmitirParcelamentoCard
            companies={companies}
            configurado={configurado}
            bare
          />
        </TabsContent>
      </Tabs>
    </Card>
  );
}
