import { redirect } from "next/navigation";

/**
 * O antigo Dashboard foi incorporado à tela Clientes (tarefas "Para você fazer",
 * calendário e assistente ficam lá). Links antigos para /painel continuam
 * funcionando.
 */
export default function PainelPage() {
  redirect("/painel/clientes");
}
