/**
 * Rodapé discreto do sistema. Fica colado na base da coluna de conteúdo
 * (mt-auto) sem empurrar o resto do layout. Usado no portal do cliente e no
 * painel do contador. O ano se atualiza sozinho.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t px-6 py-4 text-center text-xs text-muted-foreground">
      S J Contabilidade © {new Date().getFullYear()}
    </footer>
  );
}
