# Validação do incremento 0.1.0

Executada em 16/09/2026 em ambiente Linux de desenvolvimento, com Node.js 24.19.0 e TypeScript 5.7.2.

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Aprovada, sem erros de tipos |
| `npm test` | 19 testes aprovados; zero falhas |
| `npm run demo` | Pergunta detectada, contexto do escopo `java` recuperado e fonte indicada |
| `bash -n demo-linux.sh` | Sintaxe aprovada |
| `bash demo-linux.sh` | Execução aprovada |
| CLI interativa e exportação | Exercitadas pelo teste de integração, inclusive recusa de sobrescrita |

Os testes verificam fluxo completo de texto, isolamento de escopo e sessão, rejeição de canais inadequados no contrato, parciais/finais, duplicidades/correções, resultados atrasados, limites de contexto, ausência de evidência, busca por contexto anterior, cancelamento e respostas tardias, conversão do evento Meetily e exportação da simulação.

As verificações são do núcleo TypeScript. Não foram executados: compilação completa do Meetily/Tauri/Rust, captura de áudio, transcrição de voz, Windows, Regata OS, modelos de IA ou GitHub Actions remoto. Rust/Cargo e dispositivos de áudio de usuário não estavam disponíveis neste ambiente.

O workflow Windows/Ubuntu acompanha o pacote como configuração para execução futura. Passar estes testes não comprova áudio remoto, desempenho ou isolamento de microfone no aplicativo final.
