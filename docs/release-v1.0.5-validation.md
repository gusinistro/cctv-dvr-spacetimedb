# SpaceVision DVR v1.0.5 — Registro de Release e Validação

**Data de publicação:** 13 de agosto de 2026 (UTC)  
**Tag:** [`v1.0.5`](https://github.com/gusinistro/cctv-dvr-spacetimedb/releases/tag/v1.0.5)  
**Status:** Release pública, estável e não pré-lançamento.  
**Automação aprovada:** [Versioned release — execução 31659623076](https://github.com/gusinistro/cctv-dvr-spacetimedb/actions/runs/31659623076)

## Escopo da entrega

A versão **v1.0.5** consolida o SpaceVision DVR como uma base operacional com painel web reativo, módulo SpacetimeDB local, aplicativo desktop para Windows e Linux, controles por papel, manutenção preventiva, governança de evidências e pipeline de release verificável. A publicação foi criada por automação após os gates de qualidade, compilação do módulo e empacotamento nativo serem concluídos para os dois sistemas operacionais de destino.

> A release contém instaladores reais, não apenas artefatos de compilação intermediários. Os hashes abaixo são aqueles registrados pelo GitHub no momento do upload.

| Plataforma | Artefato | Tamanho | SHA-256 | Download |
|---|---:|---:|---|---|
| Linux x86_64 | AppImage | 77.625.848 bytes | `d992ab7896124a024f706889f0f3b6539bd4f1279f34861bf53311f1536d727d` | [Baixar](https://github.com/gusinistro/cctv-dvr-spacetimedb/releases/download/v1.0.5/SpaceVision.Desktop_1.0.5_amd64.AppImage) |
| Linux x86_64 | DEB | 3.075.188 bytes | `fb1f9212f521755fb590b127fb8f209b059ea4ea5b4db63b886484f68a4696f5` | [Baixar](https://github.com/gusinistro/cctv-dvr-spacetimedb/releases/download/v1.0.5/SpaceVision.Desktop_1.0.5_amd64.deb) |
| Linux x86_64 | RPM | 3.075.156 bytes | `0f938ce31013645978d14fc9307563a9181e8419749fd6fed6ed02722ccd7df9` | [Baixar](https://github.com/gusinistro/cctv-dvr-spacetimedb/releases/download/v1.0.5/SpaceVision.Desktop-1.0.5-1.x86_64.rpm) |
| Windows x64 | Instalador NSIS | 2.062.469 bytes | `f762c740ecade258777ed04792a665f7f4d9023ccf3f531e9bbc2b9e62667361` | [Baixar](https://github.com/gusinistro/cctv-dvr-spacetimedb/releases/download/v1.0.5/SpaceVision.Desktop_1.0.5_x64-setup.exe) |
| Windows x64 | MSI | 3.108.864 bytes | `e2e498278a8de27226b2898db8ccb2b52a38a6af1c80be53550bd373e37d744c` | [Baixar](https://github.com/gusinistro/cctv-dvr-spacetimedb/releases/download/v1.0.5/SpaceVision.Desktop_1.0.5_x64_en-US.msi) |

## Evidências de validação

| Área | Procedimento | Resultado |
|---|---|---|
| Tipos e painel web | `pnpm check` | Aprovado sem erros de TypeScript. |
| Regras de negócio | `pnpm test` | Aprovado: 2 arquivos e 10 testes, incluindo capacidades por papel, transição de manutenção, multi-instalação, privacidade de exportação e guardas de comando. |
| Módulo reativo | `pnpm spacetime:build` | Aprovado; módulo SpacetimeDB compilado. |
| UI desktop | `pnpm desktop:web:build` | Aprovado; Vite produziu o bundle desktop. |
| Backend desktop | `pnpm desktop:check` | Aprovado com a toolchain Rust estável. |
| Dependências de produção | `pnpm audit --prod --audit-level high` | Aprovado; nenhuma vulnerabilidade conhecida encontrada. |
| Pacotes Linux | Job de release | Aprovado; AppImage, DEB e RPM carregados. |
| Pacotes Windows | Job de release | Aprovado; instaladores NSIS e MSI carregados. |
| Publicação | Job de release | Aprovado; release e notas geradas pelo GitHub. |

O painel web também foi inspecionado visualmente em viewport de desktop. A evidência confirma a grade de câmeras, alternador de instalação, indicadores de conexão reativa, alertas, linha do tempo e a navegação administrativa apresentada à identidade `admin`.

## Governança de papéis e evidência disponível

As capacidades de `admin`, `operator`, `auditor`, `technician` e `viewer` foram verificadas por testes automatizados da matriz de autorização. O painel elimina navegação sem a capacidade associada e os comandos são protegidos por capacidade, não apenas por ocultação visual. A execução visual capturada foi feita na sessão administrativa disponível neste ambiente.

| Papel | Evidência atual | Limitação conhecida |
|---|---|---|
| `admin` | Validação visual do painel e testes de capacidade. | Nenhuma limitação específica da evidência. |
| `operator` | Testes de capacidade e de reconhecimento de eventos. | Não houve sessão OAuth distinta disponível para captura manual nesta execução. |
| `auditor` | Testes de capacidade de exportação e privacidade. | Não houve sessão OAuth distinta disponível para captura manual nesta execução. |
| `technician` | Testes de diagnóstico e manutenção preventiva. | Não houve sessão OAuth distinta disponível para captura manual nesta execução. |
| `viewer` | Testes de bloqueio de comandos e capacidades. | Não houve sessão OAuth distinta disponível para captura manual nesta execução. |

## Limitações operacionais e próximos controles

O módulo e os clientes usam uma instância local do SpacetimeDB para desenvolvimento e demonstração. A operação em produção requer que a instância seja provisionada, protegida por rede, incluída na rotina de backup e monitorada conforme o [runbook operacional](./operations-runbook.md). A telemetria é opcional e o sistema não transmite vídeo bruto ao banco reativo por padrão.

A cadeia de evidência registra hash e eventos auditáveis no módulo. A assinatura criptográfica de conteúdo de clipe ou pacote permanece uma evolução pendente; portanto, o hash atual deve ser usado como controle de integridade de metadados, não como substituto de uma assinatura de pacote externa. Os limites de retenção e os controles biométricos permanecem sujeitos a consentimento, revisão humana e trilha de auditoria, conforme a política de governança do repositório.

Durante a construção, o bundle desktop apresentou aviso de tamanho do chunk JavaScript acima de 500 kB. Não bloqueia o produto nem a release, mas justifica decomposição futura por importações dinâmicas para melhorar o carregamento da interface desktop.

## Melhorias na esteira aplicadas nesta release

A primeira execução completa expôs condições de CI que foram corrigidas antes da publicação final. A esteira agora resolve a versão de `pnpm` pelo manifesto, instala a CLI SpacetimeDB sem interação, inclui os ícones PNG/ICO exigidos pela Tauri, seleciona somente instaladores finais para upload e executa uma repetição controlada do bundle Windows para falhas transitórias de download do NSIS. Essas medidas aumentam a reprodutibilidade sem ocultar falhas persistentes.

## Referências

[1]: https://github.com/gusinistro/cctv-dvr-spacetimedb/releases/tag/v1.0.5 "SpaceVision DVR v1.0.5 — GitHub Release"
[2]: https://github.com/gusinistro/cctv-dvr-spacetimedb/actions/runs/31659623076 "Versioned release — execução aprovada"
[3]: https://spacetimedb.com/install "SpacetimeDB — instalação da CLI"
