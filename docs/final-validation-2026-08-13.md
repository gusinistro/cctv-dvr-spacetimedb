# Registro de Validação Final — 13 de agosto de 2026

**Produto:** SpaceVision DVR  
**Escopo:** painel web, módulo reativo SpacetimeDB, aplicativo desktop Windows/Linux e controles operacionais por papel.

Este registro consolida a verificação final executada antes da publicação do ciclo profissional. A validação foi realizada contra a instância SpacetimeDB local, sem introdução de vídeo bruto, imagens, credenciais de câmeras ou dados pessoais no repositório.

## Resultados consolidados

| Área | Comando ou evidência | Resultado |
|---|---|---|
| Tipagem TypeScript | `pnpm check` | Aprovado, sem erros de tipo. |
| Regras web e guards | `pnpm test` | Aprovado: 2 arquivos e 11 testes. |
| Módulo reativo | `pnpm spacetime:build` | Aprovado. |
| Interface desktop | `pnpm desktop:web:build` | Aprovado. O bundle de entrada gerado tem aproximadamente 564 kB antes de gzip; o aviso de divisão futura de bundle não bloqueia a compilação. |
| Backend desktop | `cargo test --manifest-path desktop/src-tauri/Cargo.toml` | Aprovado: 6 testes, incluindo política biométrica, RTSP/ONVIF e assinatura Ed25519. |
| Dependências de produção | `pnpm audit --prod --audit-level high` | Aprovado: nenhuma vulnerabilidade conhecida. |
| Papéis reativos do desktop | `SPACETIMEDB_DATABASE=spacevision-desktop-role-validation-20260813 pnpm desktop:validate-roles` | Aprovado: 5 identidades independentes, `auditCount: 17`, revisão permitida para `operator`, revisão bloqueada para `viewer` e governança biométrica bloqueada para `operator`. |

## Validação da identidade efetiva do desktop

O último comando usou uma base local nova, `spacevision-desktop-role-validation-20260813`, publicada somente para a execução. O teste conecta identidades independentes e verifica o mesmo resolvedor de papel consumido pela ponte SpacetimeDB do desktop. Dessa forma, não depende da sobreposição visual de desenvolvimento para confirmar o papel recebido da assinatura reativa.

| Papel | Comportamento validado | Resultado |
|---|---|---|
| `operator` | Revisar item analítico e tentar configurar biometria. | Revisão aprovada e auditada; alteração biométrica recusada. |
| `auditor` | Receber o papel reativo e avaliar capacidades do desktop. | Revisão e governança biométrica indisponíveis. |
| `technician` | Registrar saúde de câmera e avaliar capacidades do desktop. | Diagnóstico permitido; revisão e governança biométrica indisponíveis. |
| `viewer` | Tentar revisar o item analítico. | Reducer recusou a tentativa. |

> A prévia `?role=` existe exclusivamente para inspeção visual em desenvolvimento. A autorização compartilhada continua sendo aplicada pelos reducers do SpacetimeDB sobre a identidade conectada e é a fonte de verdade para produção.

## Limites conhecidos

O ambiente local não substitui uma implantação com câmeras físicas, segmentação de rede, gestão corporativa de chaves ou monitoramento de produção. Antes de operar em ambiente real, é necessário publicar o módulo em uma instância SpacetimeDB controlada, cadastrar endpoints RTSP/ONVIF autorizados, definir a cadeia de custódia organizacional e configurar observabilidade externa.
