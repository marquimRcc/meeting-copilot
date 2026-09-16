# Meeting Copilot — incremento 0.1.0

Primeira base multimódulo para um copiloto de reunião Windows/Linux. O objetivo final é capturar o áudio recebido, transcrever, identificar perguntas, consultar contexto selecionado e mostrar uma sugestão textual. Você decide o que falar.

**Esta entrega é o núcleo executável com texto simulado. Ainda não é um aplicativo que ouve reuniões.** Não abre microfone, não captura áudio, não chama IA e não altera o comportamento de gravação do Meetily. Não foi criado um fork remoto na sua conta GitHub.

## Executar agora

Requisito: Node.js 24 ou superior. A demonstração e os testes não exigem `npm install`, Rust, modelo de voz, conta de IA ou credenciais.

Abra um terminal na pasta `copilot` extraída do pacote.

```bash
node demo/run.mjs
node --test tests/*.test.mjs
```

No Windows também pode executar `demo-windows.cmd`. No Linux: `bash demo-linux.sh`.

Para experimentar perguntas próprias:

```bash
node demo/run.mjs --interactive
```

Digite, por exemplo, `Como investigar erros em produção?`. Use `/sair` para terminar. O programa mostra a pergunta candidata, trechos do contexto e suas fontes. **Não apresenta esses trechos como resposta gerada por IA.** Os horários são simulados, avançando oito segundos por linha; não medem latência.

Para selecionar contexto e salvar a simulação:

```bash
node demo/run.mjs --interactive --context demo/context.json --scopes java --export minha-simulacao.json
```

A exportação contém todas as falas inseridas e as solicitações preparadas. Um arquivo existente não é sobrescrito. Sem `--export`, a demonstração não salva conversas. Isso não define ainda a política de gravação do futuro aplicativo.

## Módulos implementados

| Pacote | Responsabilidade |
|---|---|
| `contracts` | Contratos de sessão, transcrição, pergunta e evidência; validação de segmentos |
| `transcript` | Janela de contexto de dois minutos, limitada a 200 segmentos; ordenação e correções |
| `questions` | Detecção inicial de perguntas/pedidos em português, com deduplicação por 30 segundos |
| `context` | Busca lexical por parágrafo, filtrada pelos escopos selecionados e com identificação da fonte |
| `assistant` | Preparação de mensagens para IA e controle de cancelamento/respostas atrasadas |
| `core` | Orquestração de transcrição → pergunta → busca → solicitação preparada |
| `meetily-adapter` | Conversão do evento Meetily para o contrato comum; exige metadados de captura verificada |

São sete pacotes privados em um workspace npm. As importações relativas mantêm a demonstração executável diretamente com Node, mesmo antes de instalar dependências. O único pacote externo deste núcleo é TypeScript, usado na verificação de tipos.

## Verificação de desenvolvimento

```bash
npm ci
npm run typecheck
npm test
npm run demo
```

Existe um workflow para Windows e Ubuntu em `.github/workflows/copilot-core.yml`. Ele será executado quando os arquivos estiverem em um repositório com GitHub Actions habilitado. Sua presença não significa que a matriz já foi executada.

## Contexto próprio

Copie `demo/context.json` e substitua os exemplos por fatos confirmados. O formato é um array JSON com `id`, `title`, `scopes` e `text`. Parágrafos são separados por uma linha vazia (`\n\n`). `--scopes java,cvc` inclui documentos que tenham ao menos uma dessas etiquetas. Não use etiquetas genéricas em um documento que deva ficar restrito a outro projeto.

Os exemplos fornecidos são fictícios e não afirmam experiências suas. Esta versão não importa memória ou conversas do ChatGPT. Também não lê PDF/DOCX, não calcula embeddings e não faz pesquisa na internet.

## Limites conhecidos

- O detector é heurístico: pode perder perguntas sem pontuação, perguntas divididas entre trechos e gerar falsos positivos. Um trecho com várias perguntas produz uma candidata conjunta.
- A busca é lexical: sinônimos e flexões podem não encontrar um documento relevante. Uma correspondência não comprova a afirmação.
- O buffer de dois minutos é contexto temporário, não uma ata completa. A demonstração mantém um histórico separado para exportação; persistência do aplicativo ainda está pendente.
- A rejeição de canais `microphone`, `mixed` e `unknown` funciona no contrato. Só a camada nativa poderá comprovar de onde veio o áudio; marcar um campo como `remote-system` não faz essa comprovação.
- O adaptador Meetily está desacoplado e não registrado na interface. Não há captura WASAPI/PipeWire nova, overlay, diarização ou provedor de IA implementados neste incremento.
- A captura da saída, quando implementada, poderá incluir notificações, música e sua voz se ela retornar por eco/monitoramento. Para isolar só a reunião, será necessário roteamento ou seleção por aplicativo.

Veja [ARQUITETURA.md](docs/ARQUITETURA.md), [AUDITORIA-MEETILY.md](docs/AUDITORIA-MEETILY.md), [PROXIMOS-PASSOS.md](docs/PROXIMOS-PASSOS.md) e [VALIDACAO.md](docs/VALIDACAO.md).
