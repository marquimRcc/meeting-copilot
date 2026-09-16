# Auditoria do Meetily

Análise estática da cópia local na revisão `a2cb62e827da7ef59f65064c97233efb2313878e`, realizada em 16/09/2026. Não substitui compilação e teste de hardware. Os links abaixo fixam a revisão estudada; não representam uma promessa sobre versões posteriores.

| Achado no código | Consequência |
|---|---|
| `resolve_mic_or_default` usa o microfone padrão quando o argumento é `None` | O modo remoto precisa de uma opção explícita, não apenas deixar o microfone sem seleção |
| A inicialização registra um processador de eventos de dispositivo para fallback de microfone | A regra remoto-only precisa valer também em reconexões |
| Enumeração Windows usa CPAL/WASAPI e dispositivos de saída | Há um caminho nativo reutilizável; o teste de loopback real permanece obrigatório |
| Enumeração Linux procura nomes contendo `monitor` por CPAL/ALSA | Não há garantia de descoberta confiável no Regata OS nem backend PipeWire dedicado pronto nesse caminho |
| O worker emite `source: "Audio"` | Esse campo não distingue microfone de saída nem identifica falantes; não é evidência de captura remota |
| Evento fornece sequência e tempos relativos à gravação | Pode ser normalizado pelo adaptador, mas ainda precisa de vínculo nativo com sessão |
| README cita diarização na seção PRO | Não foi confirmado um pipeline de diarização disponível na edição comunitária estudada |
| Licença local é MIT | Preservar aviso e licença do upstream no trabalho derivado |

Fontes primárias:

- [README da revisão](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/README.md)
- [Resolução de dispositivos e comandos de gravação](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/recording_commands.rs)
- [Dispositivos Linux](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/devices/platform/linux.rs)
- [Dispositivos Windows](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/devices/platform/windows.rs)
- [Worker de transcrição](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src-tauri/src/audio/transcription/worker.rs)
- [Serviço de transcrição frontend](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/frontend/src/services/transcriptService.ts)
- [Licença MIT](https://github.com/Zackriya-Solutions/meetily/blob/a2cb62e827da7ef59f65064c97233efb2313878e/LICENSE.md)

## O que esta entrega altera

Adiciona `copilot/` e `.github/workflows/copilot-core.yml`. Nenhum arquivo nativo, tela ou comportamento de gravação do upstream foi modificado. Os novos arquivos podem ser revisados e executados separadamente.

## Aplicar em uma base local

Para a demonstração, não é necessário clonar o Meetily. Para continuar a integração, em uma pasta nova:

```bash
git clone https://github.com/Zackriya-Solutions/meetily.git meeting-copilot
cd meeting-copilot
git checkout -b feature/meeting-copilot a2cb62e827da7ef59f65064c97233efb2313878e
```

Copie a pasta `copilot` e o arquivo `.github/workflows/copilot-core.yml` do pacote para essa base. Isso cria uma linha de desenvolvimento local. No fork publicado, esses arquivos já estão incorporados à branch `main`. Não substitua arquivos preexistentes de outro trabalho sem revisar diferenças.

Confirme os arquivos adicionados com `git status --short` e execute os comandos do README na pasta `copilot`.
