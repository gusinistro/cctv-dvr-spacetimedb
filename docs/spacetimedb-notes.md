# Notas de Arquitetura — SpacetimeDB

## Decisões confirmadas

O módulo será implementado em TypeScript em `spacetimedb/src/index.ts`, usando `schema`, `table` e `t` do pacote `spacetimedb/server`. As tabelas serão a fonte de verdade para câmeras, segmentos de gravação, eventos e políticas de retenção; mutações serão expostas exclusivamente como reducers. O painel não efetuará escritas em REST: as ações administrativas serão chamadas como reducers do binding gerado.

No navegador, o binding gerado será conectado com `DbConnection.builder()`, URI WebSocket e nome do banco. O token retornado na conexão deve ser preservado para reconexões. As consultas serão realizadas com `subscriptionBuilder()` e o estado React será atualizado pelos callbacks de inserção, atualização e remoção das tabelas assinadas. Isso mantém o painel reativo sem polling HTTP.

Como o ambiente de demonstração não possui um módulo SpacetimeDB já publicado, a aplicação terá um adaptador de demonstração explicitamente identificado, com o mesmo contrato de leitura e comando do cliente gerado. O adaptador local serve apenas para permitir simulação integral sem hardware e não substitui a integração: o módulo, as dependências e o ponto de troca do cliente real serão entregues no repositório.

## Fontes oficiais

- [Browser Quickstart — SpacetimeDB](https://spacetimedb.com/docs/quickstarts/browser/): geração de bindings, `DbConnection`, token e subscrições no navegador.
- [TypeScript Quickstart — SpacetimeDB](https://spacetimedb.com/docs/quickstarts/typescript): módulos TypeScript, tabelas e reducers.
