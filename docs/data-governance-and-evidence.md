# Governança de Dados e Cadeia de Evidências

O **SpaceVision DVR** mantém vídeo bruto na borda por padrão. O SpacetimeDB recebe metadados reativos de câmeras, eventos, análises, saúde técnica, evidências e auditoria. Essa separação diminui a exposição desnecessária de mídia e preserva a consulta operacional centralizada.

| Domínio | Registro reativo | Controle aplicado | Evidência de auditoria |
|---|---|---|---|
| Instalações | `installations` | Criação e edição por administrador | `installation_created`, `installation_updated` |
| Inventário de câmeras | `cameras`, `camera_health` | Administração de câmeras e diagnósticos por capacidade | `camera_created`, `camera_updated`, `camera_health_reported` |
| Análises | `analysis_events` | Revisão humana obrigatória quando configurada; biometria depende de controles ativos | `analysis_event_logged`, `analysis_event_reviewed` |
| Evidências | `evidence_records` | Hash SHA-256 obrigatório; exportação exige referência e algoritmo de assinatura | `evidence_hashed`, `evidence_exported` |
| Retenção | `retention_policies`, `biometric_controls` | Limite por câmera; para biometria, aplica o menor limite entre câmera e controle biométrico | `retention_enforced` |

> A trilha de auditoria registra **quem** executou a ação, **qual** objeto foi afetado, os metadados da decisão e o instante reativo da operação. Ela não substitui uma assinatura criptográfica externa de pacote de exportação; por isso o produto armazena a referência do pacote assinado e o algoritmo utilizado.

## Retenção e privacidade

O reducer `enforce_data_retention` remove `analysis_events` e `evidence_records` vencidos conforme a política da câmera. Eventos biométricos recebem uma regra adicional: a janela efetiva é o menor valor entre a retenção da câmera e `biometric_controls.retentionDays`. Assim, elevar a retenção operacional da câmera não amplia por acidente o período de dados biométricos.

O reducer só é executável por `admin`. Em uma implantação contínua, a operação deve agendar esse reducer por um processo autenticado e idempotente, conservando os logs de execução. O ambiente de desenvolvimento local não registra agendamentos automáticos; o comando pode ser chamado manualmente para validação e manutenção controlada.

| Fluxo | Papel autorizado | Resultado esperado |
|---|---|---|
| Registrar hash de uma evidência | `admin`, `operator` | Cria um registro único por hash e evento, associado à identidade emissora. |
| Marcar exportação assinada | `admin`, `auditor` | Registra data, exportador, referência do pacote e algoritmo da assinatura. |
| Revisar análise | `admin`, `operator` | Atualiza a revisão e produz um registro auditável. |
| Aplicar retenção | `admin` | Elimina metadados vencidos e registra a contagem da limpeza. |
| Reportar saúde e manutenção | `admin`, `operator`, `technician` | Atualiza falhas consecutivas, nota, estado e eventual vencimento de manutenção. |

## Manutenção preventiva

`camera_health` conserva a última checagem, a última confirmação de sucesso, a contagem de falhas consecutivas, uma nota operacional e os estados `none`, `scheduled`, `in_progress` e `completed`. Três falhas consecutivas atualizam a câmera para `offline`; um diagnóstico bem-sucedido reinicia a contagem de falhas. A interface desktop permite registrar o resultado de um diagnóstico RTSP como dado compartilhado, sem carregar credenciais ou vídeo bruto para o banco reativo.

## Validação local

O fluxo `pnpm spacetime:validate-analysis` cria uma base local isolada quando combinado com uma publicação temporária do módulo. A validação comprova a criação de análise, revisão, hash de evidência, exportação assinada, bloqueio de auditor em reconhecimento de evento, registro de diagnóstico por técnico e a execução auditada da retenção.
