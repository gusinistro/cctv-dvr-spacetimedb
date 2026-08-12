# Auditoria de Produto Profissional — SpaceVision DVR

## Diagnóstico atual

O SpaceVision possui uma fundação funcional de alto potencial: painel web reativo, aplicativo desktop nativo, descoberta ONVIF, captura RTSP segmentada, análise local, governança biométrica, trilha de auditoria e sincronização de metadados com SpacetimeDB. A evolução para uso profissional requer tornar esses recursos **operacionalmente governáveis**, mensuráveis e recuperáveis em múltiplas instalações.

| Dimensão | Base atual | Lacuna profissional prioritária |
|---|---|---|
| Instalações | Zonas por câmera | Hierarquia explícita de instalações, responsável, fuso e status operacional. |
| Disponibilidade | Online/offline e teste RTSP | Sinais de saúde, falhas consecutivas, última verificação e tarefas de manutenção. |
| Evidências | Referência local de frame | Hash de integridade, cadeia de exportação e registro de acesso ou exportação. |
| Segurança | Admin/viewer, cofre ONVIF e auditoria | Privilégios operacionais mais granulares e rastreabilidade de alterações críticas. |
| Operação de borda | Worker, FFmpeg e SpacetimeDB local | Diagnóstico local, recuperação documentada e telemetria opcional sem vídeo bruto. |
| Distribuição | Pacotes Linux e CI Windows | Releases versionadas, verificação de dependências e artefatos rastreáveis. |

## Decisões de produto

O sistema continuará a manter vídeo e modelos no dispositivo de borda por padrão. O SpacetimeDB receberá **somente metadados operacionais, eventos, hashes de evidência, decisões de revisão e auditoria**. As funções biométricas permanecerão desligadas inicialmente, dependentes de controles de política e revisão humana.

## Próxima implementação

O modelo reativo receberá instalações, estado de saúde por câmera, tarefas de manutenção e registros de evidência. A interface apresentará uma visão operacional por instalação, indicadores de risco e ações de recuperação. O desktop enviará sinais de diagnóstico que possam ser convertidos em manutenção e auditoria, sem transmitir streams ou credenciais.
