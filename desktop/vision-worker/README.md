# Worker local de visão

O worker recebe comandos JSONL pela entrada padrão e produz respostas JSONL na saída padrão. Ele não baixa modelos, não envia frames para a rede e não fabrica detecções quando um pacote de modelo não está configurado.

| Tarefa | Implementação atual | Condição operacional |
|---|---|---|
| OCR | `pytesseract` quando disponível | Resultado sempre sinalizado para revisão. |
| Anomalia visual | Medida local de degradação/baixa nitidez | Não substitui revisão ou análise temporal. |
| Objetos, placas e atividades | Adaptador de pacote ONNX | Exige peso local aprovado e configuração no manifesto. |
| Comparação facial e sinais emocionais | Adaptador bloqueado por política | Só pode rodar com consentimento/fundamento autorizado e revisão humana. |

## Exemplo de uso

```bash
python3 worker.py <<'EOF'
{"action":"health"}
{"action":"analyze","imagePath":"/dados/frame.jpg","tasks":["ocr","anomaly","faces"],"policy":{"faceEnabled":false}}
EOF
```

O consumidor deve criar um evento no SpacetimeDB apenas depois que a regra de revisão definida pela organização for satisfeita. Para qualquer tarefa que tenha peso ONNX, registre o caminho local aprovado no campo `models`; pesos e templates biométricos não entram no repositório.

O worker agora lê automaticamente `../model-manifest.json` e resolve os caminhos a partir de `SPACEVISION_MODEL_DIR` quando essa variável for definida; caso contrário, usa o diretório do manifesto. Assim, a interface não injeta caminhos arbitrários e somente os pacotes declarados pela organização podem ser carregados.
