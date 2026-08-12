# Arquitetura do SpaceVision DVR

O painel opera em dois modos com um único contrato de dados. O modo de demonstração cria uma store em memória e atualiza os componentes por subscrição; o modo conectado usa bindings TypeScript gerados do módulo, assina somente as tabelas públicas necessárias e aplica o mesmo snapshot ao React. Essa separação permite demonstrar o produto sem vídeo físico e trocar para SpacetimeDB sem redesenhar o frontend.

| Fluxo | Leitura | Escrita | Garantia de acesso |
|---|---|---|---|
| Demonstração | `createDemoStore()` e subscrição React | Store protegida por `guardCommands` | `viewer` recebe erro em toda mutação. |
| SpacetimeDB | `DbConnection`, query builders e subscrições | Reducers tipados gerados | `requireAdmin()` é executado no módulo. |

O módulo fica em `spacetimedb/src/index.ts` e inclui `actors`, `cameras`, `recordings`, `events` e `retentionPolicies`. Em cada conexão remota, o cliente preserva o token emitido pelo servidor para reconectar à mesma identidade. Assinaturas são aplicadas pelos query builders das tabelas, e os callbacks de insert, update e delete atualizam o snapshot exibido no React.[1] [2]

> A terminologia correta é: o módulo SpacetimeDB TypeScript é compilado para WebAssembly e roda no servidor SpacetimeDB; o navegador consome os bindings TypeScript/JavaScript gerados e sua sincronização WebSocket reativa. A aplicação deliberadamente não oferece uma camada REST alternativa.[1] [2]

## Procedimento de publicação

Após disponibilizar uma instância SpacetimeDB acessível, publique o módulo e então configure `VITE_SPACETIMEDB_URI` e `VITE_SPACETIMEDB_DATABASE` na implantação web. O banco pode usar OIDC para fornecer uma identidade persistente, enquanto o módulo valida o papel em cada reducer administrativo.[3]

## Referências

[1]: https://spacetimedb.com/docs/quickstarts/browser/ "Browser Quickstart — SpacetimeDB"
[2]: https://spacetimedb.com/docs/clients/typescript "TypeScript Client Reference — SpacetimeDB"
[3]: https://spacetimedb.com/docs/core-concepts/authentication "Authentication — SpacetimeDB"
