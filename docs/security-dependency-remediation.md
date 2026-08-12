# Registro de Remediação de Dependências

Em 12 de agosto de 2026, o projeto executou uma auditoria das dependências de produção. A análise inicial identificou **1 vulnerabilidade crítica, 21 altas, 49 moderadas e 10 baixas**. Foram aplicados overrides compatíveis e o lockfile foi atualizado; a auditoria posterior retornou **zero vulnerabilidades** nas dependências de produção.

| Item | Antes | Depois | Validação |
|---|---:|---:|---|
| Vulnerabilidades críticas | 1 | 0 | `pnpm audit --prod --json` |
| Vulnerabilidades altas | 21 | 0 | `pnpm audit --prod --json` |
| Vulnerabilidades moderadas | 49 | 0 | `pnpm audit --prod --json` |
| Vulnerabilidades baixas | 10 | 0 | `pnpm audit --prod --json` |
| Contratos TypeScript | — | Sem erros | `pnpm check` |
| Testes web | — | 10 aprovados | `pnpm test` |
| Build da interface desktop | — | Aprovado | `pnpm desktop:web:build` |
| Backend desktop | — | Aprovado | `pnpm desktop:check` e `cargo test --offline` |

As atualizações incluíram versões corrigidas de dependências transitivas relevantes, como `@trpc/server`, `axios`, `drizzle-orm`, `nanoid`, `mermaid`, `dompurify`, `path-to-regexp` e bibliotecas transitivas do ecossistema AWS. A substituição inicialmente sugerida para `path-to-regexp` usava uma faixa aberta, o que selecionou uma versão incompatível com Express 4 e gerou o erro `pathRegexp is not a function`. O override foi fixado em **0.1.13**, uma versão compatível com a API esperada pelo Express, e o painel voltou a responder após reinicialização do servidor.

O repositório possui também o pacote independente em `spacetimedb/`. Ele foi auditado separadamente com `pnpm audit --prod --json`, e o resultado também foi zero vulnerabilidades de produção. Alertas exibidos pelo GitHub podem refletir uma varredura em atraso ou um contexto de análise distinto; o token disponível não possui acesso à API de alertas Dependabot para confirmar cada alerta individualmente.

> A remediação depende de `pnpm-lock.yaml` e das substituições em `package.json`. Ambos devem ser mantidos juntos em qualquer release ou instalação reprodutível.
