"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateBranding,
  type BrandFormState,
} from "@/app/(admin)/painel/configuracoes/actions";

export function BrandSettingsForm({
  initialName,
  initialLogoUrl,
}: {
  initialName: string;
  initialLogoUrl: string | null;
}) {
  const [state, action, pending] = useActionState<BrandFormState, FormData>(
    updateBranding,
    {},
  );
  const [preview, setPreview] = useState<string | null>(initialLogoUrl);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.ok) toast.success("Identidade visual atualizada.");
    if (state.error) toast.error(state.error);
  }, [state]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  }

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="brand_name">Nome exibido no menu e na tela de login</Label>
        <Input
          id="brand_name"
          name="brand_name"
          defaultValue={initialName}
          placeholder="ContAlert"
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>Logo</Label>
        <div className="flex items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Pré-visualização do logo" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-6 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1">
            <Input
              ref={fileInputRef}
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleFileChange}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Deixe em branco para manter o logo atual.
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
