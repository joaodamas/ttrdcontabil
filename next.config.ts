import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',        // gera pasta out/ para Firebase Hosting estático
  reactCompiler: true,
  images: {
    unoptimized: true,     // obrigatório em static export
  },
  turbopack: {
    // Fixa a raiz do workspace NESTA pasta.
    //
    // A pasta pai (`JPHub/ttrdcontabil/`) tem `node_modules/`, `src/` e um
    // `package-lock.json` soltos, resíduo de uma estrutura antiga. O Turbopack
    // infere a raiz procurando esses marcadores para cima, achava a pasta pai e
    // montava o app com a árvore de módulos errada.
    //
    // O sintoma não parecia de build: o formulário de login não hidratava, o
    // clique em "Entrar no painel" virava um GET nativo do navegador e a senha
    // digitada ia parar na query string (`/login?email=...&senha=...`), sem
    // nunca chamar o Firebase Auth. Só em `npm run dev`; produção nunca teve o
    // problema, porque o build estático não passa por aqui.
    //
    // Efeito colateral bom: os 3 testes do Playwright que falhavam por timeout
    // em `page.waitForURL` dependiam desse login.
    root: __dirname,
  },
};

export default nextConfig;
