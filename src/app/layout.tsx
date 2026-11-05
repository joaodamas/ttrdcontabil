import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { appConfig } from "@/lib/app-config";
import { brandVars } from "@/lib/brand-theme";
import "./globals.css";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: `${appConfig.name} | Gestão`,
  description: "Plataforma de Gestão Contábil, Operacional e Fiscal",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full font-sans" style={brandVars}>
        {/* Claro por padrão, e não 'system': seguir o tema do SO fazia o app
            abrir escuro para quem tem o Windows no escuro, sem nunca ter
            pedido isso. Quem quiser escuro liga no rodapé da sidebar, e a
            escolha persiste. */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
