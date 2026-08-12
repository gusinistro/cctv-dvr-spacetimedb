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
