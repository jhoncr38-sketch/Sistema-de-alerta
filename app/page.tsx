import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/auth";

export default async function Home() {
  const { user, profile } = await getUserAndProfile();
  if (!user) redirect("/login");
  if (profile?.role === "admin") redirect("/painel");
  if (profile?.status === "approved") redirect("/portal");
  redirect("/pending");
}
