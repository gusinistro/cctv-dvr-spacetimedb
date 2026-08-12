# SpaceVision Desktop

O aplicativo desktop é a camada de borda para **Windows e Linux**. Ele faz descoberta ONVIF por WS-Discovery, testa a conectividade TCP de endpoints RTSP e prepara o fluxo local de análise antes de sincronizar somente **eventos e metadados** com o SpacetimeDB local.

## Executar no Linux

Após instalar Rust estável, Node.js e as bibliotecas do WebKitGTK, execute:

```bash
pnpm install
pnpm desktop:dev
```

Para compilar o pacote nativo Linux:

```bash
pnpm desktop:build
```

No Windows, execute os mesmos comandos em uma máquina Windows com as dependências do Tauri instaladas; o build produz o instalador Windows no ambiente Windows. Tauri usa a webview nativa do sistema e permite invocar comandos Rust a partir da interface.[1]

## Suporte de vídeo

| Recurso | Estado nesta base | Observação |
|---|---|---|
| Descoberta ONVIF | Implementada | WS-Discovery em multicast; redes segmentadas podem exigir cadastro manual. |
| Diagnóstico e captura RTSP/RTSPS | Implementado | Verifica esquema, DNS, porta e conexão TCP; inicia segmentos MP4 de 60 segundos via FFmpeg com transporte TCP, sem construir comandos por shell. |
| Objetos, OCR, placas, atividades e anomalias | Pipeline/model manifest | Execute modelos locais registrados no arquivo `model-manifest.json` e revise os alertas. |
| Comparação facial e sinais emocionais | Desativados por padrão | Exigem registro de consentimento ou fundamento autorizado, retenção máxima de 30 dias e revisão humana. |

> A estimativa de emoção é um sinal probabilístico e não deve ser usada isoladamente para decidir acesso, sanções, segurança ou qualquer consequência sobre uma pessoa. O aplicativo bloqueia a remoção da revisão humana desses fluxos.

## Pacotes de modelo

Os pesos de IA não são distribuídos no repositório. Registre modelos ONNX/OCR validados por sua organização no manifesto e mantenha os arquivos somente no dispositivo de borda. Isso evita o envio de vídeo bruto ao banco e torna explícita a proveniência de cada modelo usado em produção.

O diretório `vision-worker` fornece o protocolo local para esse pipeline. Ele executa OCR e análise simples de qualidade quando suas dependências estão instaladas, expõe adaptadores para objetos, placas e atividades por pacotes de modelo locais, e bloqueia comparação facial e sinais emocionais sem os controles explícitos de governança.

O código do worker é incluído como recurso do pacote desktop. Na instalação de produção, disponibilize um interpretador Python e as dependências do `requirements.txt`, ou gere um sidecar independente por arquitetura antes de distribuir o aplicativo. O fluxo de análise informa falha explícita quando esse requisito não foi preparado; ele nunca envia o frame a um serviço remoto como alternativa.

## Dependência de mídia

O protótipo usa o executável `ffmpeg` no `PATH` para gravar streams RTSP em segmentos. Para a distribuição final Windows/Linux, a recomendação é empacotar um sidecar FFmpeg por arquitetura e conceder somente as permissões necessárias; o Tauri documenta esse modelo de binário auxiliar e as permissões correspondentes.[2]

## Builds por plataforma

| Plataforma | Situação de validação | Artefato |
|---|---|---|
| Linux x86_64 | Compilado no ambiente de desenvolvimento | `.deb`, `.rpm` e `.AppImage`. |
| Windows x86_64 | Build nativo automatizado no GitHub Actions | Artefato do workflow contendo instaladores Windows gerados no runner Windows. |

O workflow `.github/workflows/desktop-build.yml` é executado no `main` para alterações do desktop e pode ser acionado manualmente. A compilação Windows é feita em runner Windows, evitando a alegação enganosa de que um pacote Windows foi produzido por cross-compilação em Linux.

## Instalação e execução

| Plataforma | Instalação | Execução e pré-requisitos |
|---|---|---|
| Debian, Ubuntu e derivados | Baixe o arquivo `.deb` produzido e execute `sudo apt install ./SpaceVision\ Desktop_0.1.0_amd64.deb`. | Inicie pelo menu de aplicações ou com `spacevision-desktop`. Instale `ffmpeg` e `python3`; para análise ONNX, crie um ambiente Python local e instale `desktop/vision-worker/requirements.txt`. |
| Fedora, RHEL e derivados | Baixe o `.rpm` e execute `sudo dnf install ./SpaceVision\ Desktop-0.1.0-1.x86_64.rpm`. | Use as mesmas dependências locais: `ffmpeg`, `python3` e os requisitos do worker quando os modelos forem habilitados. |
| Distribuições Linux genéricas | Marque o `.AppImage` como executável com `chmod +x SpaceVision\ Desktop_0.1.0_amd64.AppImage` e execute o arquivo. | Se o AppImage não abrir, habilite FUSE compatível com a distribuição ou extraia o pacote conforme a documentação da plataforma. |
| Windows x86_64 | Baixe o instalador criado pelo job **Windows** em Actions, execute-o e confirme a instalação. | Instale uma versão atual de Python disponível no `PATH` e FFmpeg no `PATH`. O workflow Windows gera o instalador em runner nativo; baixe-o apenas de releases ou artefatos confiáveis do repositório. |

Antes de conectar câmeras reais, inicie a instância local do SpacetimeDB com `pnpm spacetime:local`, publique o módulo com `pnpm spacetime:publish-local` e deixe o banco `spacevision-dvr-local` ativo. O aplicativo indica o estado da sincronização no painel lateral. Para desenvolvimento, execute `pnpm desktop:dev` em vez de instalar um pacote.

> Se a captura RTSP falhar, valide primeiro a URL com o botão **Testar conectividade**, confirme alcance TCP da porta 554 ou da porta configurada e depois verifique se o FFmpeg está disponível no `PATH`. Se a análise local informar que um pacote de modelo está ausente, coloque o modelo aprovado em `desktop/model-packs/` ou configure `SPACEVISION_MODEL_DIR`; o sistema não procura nem baixa pesos automaticamente.

## Referências

[1]: https://v2.tauri.app/start/ "Tauri — What is Tauri?"
[2]: https://v2.tauri.app/develop/sidecar/ "Tauri — Embedding External Binaries"
