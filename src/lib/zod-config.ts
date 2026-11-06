/**
 * Zod 4 testa `new Function('')` na primeira validação para decidir se usa o
 * caminho compilado (JIT). A CSP do firebase.json não tem 'unsafe-eval', então o
 * teste vira uma violação de CSP no console a cada carregamento (inofensiva — o
 * Zod cai para o modo interpretado). `jitless` pula o teste.
 * Importado por quem valida formulários antes do primeiro parse (auth-context, login).
 */
import { z } from 'zod'

z.config({ jitless: true })
