# Próximos incrementos e critérios de aceite

## 1. Captura remota real — próximo marco

Implementar `remote-only` no Rust e na seleção de dispositivos. Impedir abertura/fallback de microfone na inicialização, troca de dispositivo, retomada e recuperação. Associar sessão e origem aos eventos de transcrição.

| Cenário | Resultado esperado em Windows e Linux |
|---|---|
| Somente você fala, sem áudio de saída | Nenhuma transcrição produzida pelo copiloto; nenhum stream de microfone aberto |
| Áudio remoto reproduzido no endpoint selecionado | Transcrição remota recebida com sessão e origem corretas |
| Microfone ocupado/desconectado | Captura de saída continua funcionando, sem tentar abrir outro microfone |
| Saída selecionada removida | Captura pausa/falha explicitamente, sem fallback para entrada |
| Troca de fone/Bluetooth | Estado e roteamento verificados; retomada somente com origem validada |
| Fim e início de reuniões consecutivas | Sem eventos, contexto nem respostas da sessão anterior |
| Silêncio prolongado | Sem criação indevida de falas/perguntas; avaliar alucinações do STT |
| Sua voz retorna na saída por eco/sidetone | Registrar a limitação; áudio de saída não identifica automaticamente o locutor |

No Regata OS, levantar o servidor de áudio real e os monitores disponíveis. KDE/X11 por si só não confirma PipeWire. Verificar dependências de compilação da distribuição. No Windows corporativo, validar se instalação e execução são permitidas pelo ambiente existente.

## 2. STT PT-BR e histórico

Selecionar um modelo com suporte confirmado a português; medir transcrição em CPU e, se disponível, GPU. Testar termos de Java, siglas e nomes dos seus projetos. Tratar segmentos fora de ordem, falas longas e perguntas cortadas entre blocos. Persistir o texto completo separado da janela de contexto. Definir explicitamente se áudio é salvo — o comportamento padrão do upstream não deve ser presumido como “sem gravação”.

Critério: histórico completo recuperável após reinício, continuidade entre blocos e avaliação de precisão/latência com amostra real. Ainda não existe medição de latência ou promessa de tempo de resposta.

## 3. Resposta por IA e contexto

Implementar `AssistantProvider` para um provedor escolhido, com timeout, cancelamento, tratamento de limites de uso, segredos no runtime nativo e mensagens de erro compreensíveis. Integrar seleção de contexto, importação inicial de Markdown/TXT e referências verificáveis. Embeddings e PDF/DOCX ficam para depois da validação da busca básica.

Critério: a resposta usa somente os documentos selecionados, distingue fatos pessoais de orientação geral, indica informação ausente e não aparece depois de parar a reunião. Nenhuma resposta é falada ou enviada para participantes automaticamente.

## 4. Interface e distribuição

Painel com transcrição, pergunta candidata, resposta, fontes, estados de erro e controles iniciar/parar, responder manualmente, refazer e ignorar. Depois, avaliar janela sempre visível e compartilhamento de tela em cada sistema. Compilar e testar pacotes Windows e Linux com o núcleo já integrado.

Critério: instalação e sessão completas nas duas plataformas. A matriz de testes TypeScript não substitui builds Tauri nem ensaios de áudio.

## Evoluções posteriores

Diarização de múltiplos participantes, atas com decisões/ações, recuperação semântica e roteamento por aplicativo. Nenhuma dessas capacidades é considerada pronta nesta entrega.
