import { Bell } from "lucide-react";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants";

export function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Bell className="size-5" />
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold">{APP_NAME}</div>
        <div className="text-[11px] text-muted-foreground">{subtitle ?? APP_TAGLINE}</div>
      </div>
    </div>
  );
}
