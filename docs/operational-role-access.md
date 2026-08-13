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

### Revisão analítica por papel

Em 13 de agosto de 2026, a área **Análise** do desktop foi validada na prévia de desenvolvimento com uma fixture não operacional de fila pendente. A fixture existe apenas quando não há sincronização reativa e a prévia de papel está ativa; ela não gera reducers, arquivos, hashes, telemetria nem `audit_logs` no SpacetimeDB. Esse limite torna a revisão visual repetível sem introduzir dados sintéticos na operação.

| Papel em prévia | Estado observado da fila | Resultado da tentativa |
|---|---|---|
| `operator` | Item `objects · person · 0.94` apresentado com **Aprovar** e **Rejeitar** disponíveis. | A aprovação alterou somente o estado local e confirmou textualmente que nenhuma mutação foi enviada ao SpacetimeDB. |
| `viewer` | O mesmo item foi exibido para inspeção em leitura. | **Aprovar** e **Rejeitar** permaneceram desabilitados; a interface informou que o papel não pode revisar incidentes. |
| Identidades reativas reais | O reducer `review_analysis_event` foi exercitado no teste isolado por papel. | `operator` foi permitido e auditado; os bloqueios do servidor seguem a matriz de capacidades. |

> A fixture não substitui a autorização. Ela verifica o estado visual do desktop; a decisão compartilhada permanece protegida pelo reducer reativo e pela prova isolada por identidade descrita abaixo.

### Prova automatizada com identidades reativas reais

Na mesma data, `pnpm desktop:validate-roles` foi executado contra uma base SpacetimeDB local nova e isolada (`spacevision-desktop-role-validation-20260813`). O comando usa o mesmo resolver de papel do bridge desktop, conecta cinco identidades independentes e verifica o papel efetivamente entregue pelas subscrições de `actors`. O resultado foi aprovado com `auditCount: 17`.

| Identidade efetiva | Verificação exercitada | Resultado observado |
|---|---|---|
| `operator` | Receber o papel no bridge, revisar evento analítico pendente e tentar alterar política biométrica. | Revisão permitida e auditada como `analysis_event_reviewed`; governança biométrica recusada. |
| `viewer` | Receber o papel no bridge e tentar rejeitar a mesma análise. | Revisão recusada pelo reducer. |
| `auditor` | Receber o papel no bridge e avaliar capacidades de revisão e biometria. | Ambas as capacidades permaneceram indisponíveis. |
| `technician` | Receber o papel no bridge, registrar saúde e avaliar capacidades de revisão e biometria. | Diagnóstico permitido; revisão e governança indisponíveis. |

Essa automação complementa a prévia visual ao demonstrar que a identidade que o desktop usa em produção para determinar `displayedRole` é realmente distinta por conexão, sem depender de login manual no navegador.

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
