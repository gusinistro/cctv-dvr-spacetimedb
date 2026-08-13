# Matriz de Acesso Operacional

O **SpaceVision DVR** aplica a autorização em duas camadas. A interface usa capacidades explícitas para ocultar fluxos que a identidade conectada não deve iniciar. O módulo SpacetimeDB aplica a autorização novamente nos reducers, preservando a decisão no servidor reativo e registrando as ações permitidas em `audit_logs`.

| Papel | Painel web | Aplicativo desktop | Ações permitidas | Limites relevantes |
|---|---|---|---|---|
| `admin` | Todas as telas | Todas as telas | Gerenciar câmeras, retenção, funções, controles biométricos, eventos, revisão e exportações | Deve usar as políticas de consentimento e revisão humana para biometria. |
| `operator` | Monitoramento e eventos | Monitoramento, análise e fila de revisão | Reconhecer eventos, registrar eventos operacionais e revisar análises | Não altera inventário, retenção, funções ou governança biométrica. |
| `auditor` | Monitoramento, eventos e relatórios | Visualização de telemetria sincronizada | Consultar ocorrências e exportar o recorte filtrado permitido | Não reconhece eventos e não executa mutações operacionais. |
| `technician` | Monitoramento e eventos | Câmeras, diagnósticos RTSP/ONVIF e telemetria | Consultar estados técnicos e executar diagnósticos locais | Não altera inventário compartilhado, retenção ou eventos. |
| `viewer` | Monitoramento e eventos em leitura | Monitoramento em leitura | Consultar feeds, gravações e ocorrências visíveis | Não inicia mutações, revisões ou exportações. |

## Correspondência de capacidades

| Capacidade | Admin | Operator | Auditor | Technician | Viewer |
|---|---:|---:|---:|---:|---:|
| `manage_cameras` | Sim | Não | Não | Não | Não |
| `manage_retention` | Sim | Não | Não | Não | Não |
| `acknowledge` | Sim | Sim | Não | Não | Não |
| `review_analysis` | Sim | Sim | Não | Não | Não |
| `export` | Sim | Não | Sim | Não | Não |
| `diagnostics` | Sim | Sim | Não | Sim | Não |
| `manage_biometrics` | Sim | Não | Não | Não | Não |
| `manage_roles` | Sim | Não | Não | Não | Não |

> A presença de um botão não é a fonte de autorização. Cada reducer protegido confirma o papel da identidade emissora antes de alterar o estado reativo. Uma tentativa não permitida é recusada pelo módulo, mesmo que uma interface incompatível seja alterada localmente.

## Validação executável

O comando `pnpm spacetime:validate-analysis`, executado em uma instância local isolada, cria identidades independentes para administrador, operador e auditor. Ele comprova que um operador consegue registrar e reconhecer um evento, que essas duas ações produzem `audit_logs` e que um auditor é bloqueado ao tentar reconhecer o mesmo evento. A cobertura unitária em `server/cctv.access.test.ts` verifica também as capacidades de interface e os comandos protegidos.

## Evidência visual e bloqueios confirmados

Em 13 de agosto de 2026, a mesma conta de validação foi alternada de forma reversível entre `admin`, `operator`, `auditor`, `technician` e `viewer`. A página raiz foi renderizada após cada mudança e a conta foi restaurada para `admin` ao término. As capturas confirmaram que apenas o administrador recebe as entradas **Câmeras** e **Configurações**; `operator` e `auditor` permanecem com **Relatórios**; `technician` e `viewer` ficam limitados a **Monitoramento** e **Eventos**.

| Papel | Navegação web observada | Ação restrita confirmada por teste | Resultado esperado |
|---|---|---|---|
| `admin` | Monitoramento, eventos, câmeras, configurações e relatórios | Criar/editar câmera | Permitida por `upsertCamera`. |
| `operator` | Monitoramento, eventos e relatórios | Alterar retenção | Recusada pelo guard de capacidade. |
| `auditor` | Monitoramento, eventos e relatórios | Registrar saúde/manutenção | Recusada pelo guard de capacidade. |
| `technician` | Monitoramento e eventos | Reconhecer evento | Recusada pelo guard de capacidade. |
| `viewer` | Monitoramento e eventos | Criar/editar câmera | Recusada pelo guard de capacidade. |

O comando `pnpm test` executado nessa validação aprovou **11 testes**, incluindo o contrato que combina os bloqueios acima. A evidência visual comprova a ausência das áreas de navegação incompatíveis; a prova de tentativa de ação utiliza os guards de comando e os reducers reativos, evitando depender exclusivamente de ocultação de interface.

Na sessão de navegador sem autenticação, o papel `viewer` foi aberto na tela **Eventos**. Os alertas pendentes apareceram identificados como **Somente leitura**, e nenhum botão de reconhecimento, exportação, alteração de retenção, manutenção ou configuração foi renderizado. Esta é uma prova visual e interativa do limite de leitura. Para os demais papéis, a navegação foi validada visualmente e os comandos incompatíveis foram validados pelo contrato automatizado; a captura interativa de cada botão oculto ou desabilitado permanece pendente para uma sessão autenticada dedicada por papel.

> **Limitação aceita nesta rodada.** O usuário optou explicitamente por pular a autenticação manual necessária para sessões interativas de `admin`, `operator`, `auditor` e `technician`. Consequentemente, essa evidência permanece limitada a capturas de navegação, à interação de `viewer` e aos testes de contrato. Nenhuma conclusão adicional deve ser inferida como teste manual de clique para esses quatro papéis.

## Prévia desktop de desenvolvimento

O desktop disponibiliza `?role=<papel>` **somente quando executado pelo servidor Vite de desenvolvimento**. A prévia altera a visibilidade e o estado habilitado dos controles, mas preserva a identidade reativa efetiva para chamadas ao SpacetimeDB e Tauri; por isso, não se converte em mecanismo de elevação de privilégio nem é incluída em builds de produção.

Na validação visual, `admin` exibiu os controles de consentimento, política biométrica, exportação de evidência assinada e telemetria. No mesmo caminho de tela, `viewer` mostrou as mensagens de bloqueio para exportação e governança. A inspeção do DOM confirmou que os botões **Assinar, verificar e exportar** e **Salvar política local** estavam desabilitados no papel `viewer`. A renderização inicial da governança também revelou e corrigiu a importação ausente dos hooks React no painel de telemetria.

## Prévia web de desenvolvimento

O painel web aceita `?role=admin|operator|auditor|technician|viewer` somente em desenvolvimento. A sobreposição altera exclusivamente a apresentação e os guards do cliente para tornar a validação de interface reproduzível; as chamadas reativas continuam usando a identidade efetiva da sessão, e a lógica é eliminada de builds de produção.

| Papel em prévia | Evidência visual verificada | Resultado |
|---|---|---|
| `admin` | Navegação completa, incluindo câmeras e configurações. | Áreas administrativas presentes. |
| `operator` | Tela de eventos com botões **Reconhecer** em alertas pendentes. | Ação operacional apresentada; a chamada reativa conserva a identidade efetiva do backend. |
| `auditor` | Eventos pendentes exibidos como **Somente leitura**. | Reconhecimento não é apresentado. |
| `technician` | Navegação limitada a monitoramento e eventos. | Relatórios e controles administrativos ausentes. |
| `viewer` | Navegação mínima e eventos somente leitura. | Controles mutáveis ausentes. |

Essa evidência fecha a validação visual da matriz de interface. A autorização efetiva permanece comprovada pela suíte de guards e reducers, que é a fonte de verdade para mutações compartilhadas.

## Prova reativa isolada por identidade

Além das prévias visuais, a validação `pnpm spacetime:validate-analysis` foi executada em uma base SpacetimeDB local exclusiva. Ela criou cinco conexões independentes, aplicou papéis reais no registro `actors` e executou reducers contra essas identidades. O resultado verificável da execução foi `auditCount: 15`, com a cadeia de evidência Ed25519 e a exclusão por retenção também aprovadas.

| Papel reativo | Operação exercitada | Resultado observado |
|---|---|---|
| `admin` | Configuração inicial, política biométrica, análise e retenção. | Permitida e auditada. |
| `operator` | Registro e reconhecimento de evento. | Permitidos; `system_event_logged` e `event_acknowledged` apareceram no log de auditoria. |
| `auditor` | Reconhecimento de evento. | Recusado; exportação assinada de evidência permaneceu permitida. |
| `technician` | Relato de saúde e manutenção; reconhecimento de evento. | Diagnóstico permitido; reconhecimento recusado. |
| `viewer` | Registro de evento de sistema. | Recusado. |

> A combinação da prévia de interface, dos testes de guard e desta execução reativa isolada valida tanto a apresentação quanto a autorização efetiva, sem depender de uma sessão manual do usuário.
