# Arquitetura e decisões

## Base

Meetily Community Edition, revisão `a2cb62e827da7ef59f65064c97233efb2313878e` (Release v0.4.1), é a base estudada. Aproveitaremos a aplicação Tauri/Rust, o processamento de voz e a interface React existentes. A base nova em `copilot/` fica isolada para evoluir e testar a lógica antes de tocar na captura.

O núcleo é TypeScript porque pode ser integrado à interface existente sem introduzir outro serviço. O código nativo continua em Rust. Não há razão técnica neste estágio para adicionar Java, .NET, servidor remoto ou microsserviços. A exigência Windows/Linux permanece para a V1; o funcionamento real nas duas plataformas será um critério de aceite.

## Fluxo já implementado

1. Um `Segment` identificado por sessão e sequência entra no `MeetingCopilot`.
2. O buffer valida formato, rejeita canais não remotos e espera resultados finais.
3. A janela guarda até dois minutos/200 segmentos, ordena resultados atrasados e substitui correções.
4. O detector encontra candidatas a pergunta. Eventos antigos não substituem uma pergunta mais recente; repetições iguais são suprimidas por 30 segundos.
5. A busca consulta apenas documentos com um escopo selecionado. Primeiro usa a pergunta; sem correspondência, usa até três falas recentes.
6. O módulo assistant prepara mensagens com a pergunta, conversa e trechos citáveis. O resultado informa `matches-found` ou `no-matches`, sem transformar similaridade em certeza.
7. `SuggestionRunner` oferece cancelamento e impede publicar uma resposta de geração anterior. Seu provedor ainda é uma interface; os testes usam substitutos controlados.

## Fluxo nativo planejado

| Plataforma | Caminho de captura a integrar | Condição obrigatória |
|---|---|---|
| Windows | Endpoint de saída WASAPI em loopback | Não abrir stream do microfone; falhar se a saída selecionada não estiver disponível |
| Linux | Monitor de saída PulseAudio ou compatibilidade `pipewire-pulse`; backend PipeWire dedicado se necessário | Identificar o monitor pelo servidor/dispositivo; não aceitar apenas o nome contendo `monitor` como prova |

O fluxo deve ser `captura de saída → STT → evento com sessionId/origem → núcleo → provedor → interface`. Um único aplicativo compartilhará a lógica; os adaptadores, empacotamento e validação de áudio variam por plataforma. Não há percentual de compartilhamento medido.

## Contrato de sessão

`CaptureSession` declara a sessão, a plataforma, o backend, a origem e que nenhum microfone foi aberto. **É uma pré-condição, não uma implementação nem uma fronteira de segurança.** O runtime nativo precisará produzir esses dados depois de validar o dispositivo. O JavaScript não deverá criá-los por suposição.

O evento bruto atual do Meetily não tem identificador de sessão de captura. Antes de conectar o adaptador, será necessário adicionar esse identificador na origem, validá-lo e rejeitar eventos da sessão anterior. Também será necessário garantir que todos os listeners sejam removidos ao parar. O adaptador atual assume que seu chamador fez essa vinculação; isoladamente não a comprova.

## Decisões para a integração

- Criar modo explícito `remote-only`; `mic_device_name: null` no upstream significa microfone padrão.
- Propagar esse modo por início, retomada e reconexão. Nenhum caminho de fallback pode abrir microfone.
- Sessão sem origem verificada deve parar com uma mensagem clara; não deve continuar com outra fonte automaticamente.
- Não prometer separação de pessoas pelo áudio de saída. Falantes remotos podem chegar misturados; diarização é uma evolução independente.
- Manter contexto de reunião separado de histórico completo e documentos pessoais. Seleção de escopo deve ocorrer antes de enviar qualquer dado a um provedor.
- Integrar provedores no lado nativo e guardar credenciais fora da interface. Não há chave nem envio de contexto nesta entrega.
- Ao parar, cancelar sugestões pendentes e descartar retornos tardios. O detector terá modo manual para os casos em que a heurística não reconhecer a pergunta.
- Suportar PT-BR como critério de avaliação do modelo STT; escolher modelo e aceleração por medições reais de CPU/GPU e latência.
- Não chamar overlay de invisível: comportamento em compartilhamento de tela depende da plataforma/aplicativo e exige teste. O primeiro painel poderá ser uma janela comum.

## API mínima de uso

```ts
import { MeetingCopilot } from './packages/core/src/index.ts';

const copilot = new MeetingCopilot({
  sessionId: 'reuniao-01',
  documents: documentosValidados,
  scopes: ['java'],
});

const prepared = copilot.ingest(segmentoDaSessaoVerificada);
// prepared?.question, prepared?.evidence, prepared?.request
// Somente após implementar/configurar um provedor: runner.run(prepared).
// Ao terminar: runner.cancel(), copilot.stop() e remover listeners.
```

Este exemplo descreve o contrato; as duas variáveis de entrada representam dados que a integração deverá fornecer. Para código executável completo, use `demo/run.mjs`.
