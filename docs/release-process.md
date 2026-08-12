# Processo de Release do SpaceVision DVR

Cada release deve associar o painel web, o módulo SpacetimeDB e os pacotes desktop Windows/Linux a um mesmo identificador de versão. A publicação de artefatos só pode ocorrer depois que os contratos TypeScript, os testes, o módulo reativo, a interface desktop e a auditoria de dependências tenham sido verificados.

| Etapa | Evidência exigida | Bloqueio de release |
|---|---|---|
| Preparação | `todo.md` revisado, changelog de segurança e impacto operacional registrados | Itens críticos sem responsável ou sem validação. |
| Qualidade web | `pnpm check` e `pnpm test` | Falha de tipos ou teste. |
| Segurança | `pnpm audit --prod --audit-level high` | Vulnerabilidade alta ou crítica conhecida. |
| Reatividade | Build do módulo e validação local isolada de reducers | Bindings incompatíveis ou ausência de auditoria esperada. |
| Desktop | `pnpm desktop:web:build`, `pnpm desktop:check` e testes Rust/Python pertinentes | Build ou integração de borda reprovados. |
| Empacotamento | Workflow desktop para Windows e Linux | Artefatos ausentes ou assinatura/manifesto de evidência incompleto. |
| Publicação | Checkpoint recuperável e commit no repositório | Diferença entre checkpoint e código publicado. |

## Numeração

Use versionamento semântico. Uma alteração incompatível de contrato, retenção ou reducer exige incremento **major**. Recursos compatíveis, como uma nova tela de inventário ou uma capacidade opt-in, exigem incremento **minor**. Correções de segurança, estabilidade e documentação exigem incremento **patch**.

## Conteúdo mínimo das notas de versão

As notas devem separar mudanças de operação, governança, privacidade, segurança, desktop e compatibilidade do módulo. Uma nota deve informar explicitamente qualquer migração, redefinição de retenção, alteração de capacidade por papel e dependência local adicionada na borda.

> Não publique um pacote de evidência ou uma feature biométrica como concluída sem validar a cadeia de integridade aplicável e o fluxo de consentimento e revisão humana.
