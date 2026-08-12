# Runbook Operacional do SpaceVision DVR

Este runbook descreve a operação do ambiente local do **SpaceVision DVR**. Ele cobre somente metadados e serviços do produto; fluxos RTSP, segmentos de vídeo e credenciais ONVIF permanecem na borda, conforme a configuração de cada instalação.

| Sinal | Fonte de verificação | Condição saudável | Resposta inicial |
|---|---|---|---|
| Painel web | `pnpm check`, pré-visualização e logs do servidor | Tipos sem erros e painel renderizado | Reiniciar o servidor de desenvolvimento e revisar `browserConsole.log`. |
| Módulo reativo | `pnpm spacetime:build` e validação local | Build concluído; subscriptions conectadas | Recompilar bindings e publicar em uma base local isolada. |
| Desktop | `pnpm desktop:check`, `cargo test --offline` | Backend compila e testes passam | Verificar dependências locais de FFmpeg, Python e cofre do sistema. |
| Câmeras | `camera_health` e diagnóstico RTSP | Sem falhas consecutivas; manutenção `none` ou `completed` | Investigar endpoint, programar manutenção e registrar o resultado. |
| Segurança de dependências | `pnpm audit --prod --audit-level high` | Sem avisos altos ou críticos | Atualizar overrides de forma compatível, validar e registrar o impacto. |

## Telemetria local opcional

O produto deve registrar somente métricas técnicas necessárias, como duração de diagnóstico RTSP, status de conectividade, falhas consecutivas, backlog de revisões e uso de armazenamento local. Não devem ser incluídos frames, credenciais, identificadores biométricos ou conteúdo textual extraído por OCR em telemetria agregada. A telemetria permanece desativada até que a instalação defina finalidade, retenção e controlador responsável.

## Cópia de segurança

As cópias devem separar metadados reativos de mídia local. Para cada instalação, registre o banco SpacetimeDB, a configuração de retenção, os controles biométricos, os manifestos de evidência, o inventário de câmeras e o estado de saúde. As senhas ONVIF não devem ser exportadas em texto: a restauração deve exigir o recadastro no cofre local do novo dispositivo.

| Artefato | Periodicidade operacional sugerida | Proteção | Restauração |
|---|---|---|---|
| Estado do módulo e metadados reativos | Definida pela política da instalação | Repositório ou armazenamento cifrado com acesso mínimo | Restaurar em ambiente isolado e validar subscriptions antes de liberar acesso. |
| Manifestos de evidência | A cada exportação assinada | Imutabilidade e trilha de auditoria | Conferir hash, referência, identidade e decisão de revisão. |
| Segmentos de vídeo de borda | Conforme retenção da câmera | Volume local protegido e sem compartilhamento por padrão | Restaurar somente para finalidade autorizada e documentar o acesso. |
| Configuração de desktop | Antes de atualização de versão | Sem segredos em texto | Reaplicar perfis e registrar novas credenciais no cofre. |

## Recuperação controlada

Primeiro, suspenda alterações na instalação afetada e registre o incidente. Em seguida, valide a versão do módulo, restaure metadados em uma base isolada e compare o inventário de câmeras, políticas de retenção, eventos, evidências e auditoria. Só após confirmar consistência deve-se redirecionar a interface web ou o desktop para o ambiente recuperado. Toda ação de recuperação deve gerar um evento operacional e uma entrada em `audit_logs`.
