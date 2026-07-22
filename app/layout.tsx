import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RegisterSW } from "@/components/register-sw";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "S J Contabilidade",
  description:
    "Portal de boletos e obrigações contábeis: seus clientes baixam documentos e recebem alertas de vencimento.",
  // Permite instalar como app no iPhone (tela cheia, ícone próprio).
  appleWebApp: {
    capable: true,
    title: "S J Contábil",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background">
        {/* Aplica o tema salvo (escuro/sereno) antes da página pintar (evita flash). */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark')}else if(t==='sereno'){document.documentElement.classList.add('sereno')}}catch(e){}})();",
          }}
        />
        {children}
        <RegisterSW />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
