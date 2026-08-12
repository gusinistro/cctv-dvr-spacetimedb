# SpaceVision DVR

O **SpaceVision DVR** é uma central web de monitoramento CCTV com feeds simulados em canvas, grades configuráveis, eventos, gravações, retenção, exportação de ocorrências e controle de acesso por papel. A aplicação pode operar imediatamente em modo de demonstração; quando configurada, ela se conecta diretamente a um banco SpacetimeDB por WebSocket e atualiza a interface por assinaturas reativas, sem endpoints REST de domínio.

## Arquitetura

| Camada | Implementação | Responsabilidade |
|---|---|---|
| Interface | React, Tailwind e canvas | Painel de vídeo, linha do tempo, filtros, relatórios e gestão operacional. |
| Simulação | Store reativa local | Gera atividade, hora, cenas dia/noite, movimento, eventos e estado de armazenamento sem câmera física. |
| Dados em tempo real | Bindings TypeScript gerados do SpacetimeDB | Conecta com `DbConnection`, assina `cameras`, `recordings`, `events` e `retentionPolicies`, e chama reducers para mutações. |
| Módulo de domínio | `spacetimedb/src/index.ts` | Define tabelas, reducers e autorização de administrador; é compilado e executado pelo SpacetimeDB como módulo WebAssembly. |

> O cliente web oficial do SpacetimeDB usa bindings TypeScript/JavaScript gerados e o `DbConnection` para assinar tabelas e receber callbacks de mudança; o componente compilado em WebAssembly é o **módulo SpacetimeDB** hospedado no servidor. Esta é a integração reativa oficial e não utiliza uma API REST tradicional.[1] [2]

## Funcionalidades

| Área | Entrega |
|---|---|
| Monitoramento | Grades 1×1, 2×2, 3×3 e 4×4, visualização em foco e simulador CCTV animado em canvas. |
| Câmeras | Cadastro, edição, estado online/offline, campo RTSP como placeholder e filtro operacional por grupo/zona. |
| Gravações | Linha do tempo por câmera, segmentos contínuos ou de movimento, seek e playback simulados. |
| Eventos | Movimento, câmera indisponível e armazenamento; filtros por câmera, período e tipo. |
| Administração | Retenção, qualidade e modo de gravação por câmera; ações protegidas em interface, simulador e reducers do SpacetimeDB. |
| Exportação | CSV e PDF filtrados a partir do mesmo conjunto de filtros usado na central de eventos. |

## Execução local

Para abrir o painel imediatamente com o simulador local:

```bash
pnpm install
pnpm dev
```

## Instância local do SpacetimeDB

Em desenvolvimento, o painel procura automaticamente a instância local em `ws://127.0.0.1:3001` e o banco `spacevision-dvr-local`. Inicie a instância e publique o módulo em dois terminais antes de abrir o painel:

```bash
# Terminal 1
pnpm spacetime:local

# Terminal 2
pnpm spacetime:publish-local
pnpm spacetime:bindings

# Terminal 3
pnpm dev
```

O módulo semeia oito câmeras, políticas de retenção, segmentos de gravação e três eventos operacionais na primeira publicação. A barra lateral do painel mostrará **Sincronização SpacetimeDB** quando as subscrições forem aplicadas com sucesso.

Para validar o módulo e regenerar os bindings após modificar `spacetimedb/src/index.ts`, instale a [CLI do SpacetimeDB][3] e execute:

```bash
cd spacetimedb
pnpm install
spacetime build --module-path . --lint-dir ''
cd ..
spacetime generate --lang typescript \
  --out-dir client/src/lib/spacetimedb-bindings \
  --module-path spacetimedb \
  --build-options='--lint-dir='
```

## Conexão a um banco SpacetimeDB

Defina as variáveis abaixo na configuração segura da aplicação apenas quando for conectar uma instância diferente da local. As duas são valores públicos de configuração do navegador, não chaves privadas.

| Variável | Exemplo | Uso |
|---|---|---|
| `VITE_SPACETIMEDB_URI` | `wss://seu-host-spacetimedb` | URI WebSocket da instância SpacetimeDB. |
| `VITE_SPACETIMEDB_DATABASE` | `spacevision-dvr-local` | Nome ou identidade do banco publicado. |

Sem essas variáveis, o sistema informa **Simulador local reativo** e mantém todos os fluxos demonstráveis. Se a conexão remota falhar, a interface retorna ao mesmo modo de demonstração, sem redirecionar as operações para REST.

## Segurança e papéis

O papel `viewer` recebe apenas telas de monitoramento, eventos e relatórios. Telas de câmeras e configurações são ocultadas e as mutações locais são bloqueadas pelo guard de papel. No módulo remoto, reducers administrativos exigem que a identidade do chamador tenha o papel `admin`; a proteção crítica permanece no SpacetimeDB, não só na interface.

## Validação realizada

A base passou em `pnpm check` e `pnpm test`. O módulo foi compilado pela CLI SpacetimeDB 2.8.0, publicado em uma instância local isolada e validado com a criação do administrador inicial na tabela `actors`.

## Referências

[1]: https://spacetimedb.com/docs/quickstarts/browser/ "Browser Quickstart — SpacetimeDB"
[2]: https://spacetimedb.com/docs/clients/typescript "TypeScript Client Reference — SpacetimeDB"
[3]: https://spacetimedb.com/install "Instalação da CLI SpacetimeDB"
