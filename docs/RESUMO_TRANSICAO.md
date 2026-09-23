# Resumo de Transição de Estado e Contexto do Projeto

> **Data de Atualização**: 23/09/2026  
> **Repositório**: `marquimRcc/meeting-copilot`  
> **Versão do Projeto**: `1.0.1`  
> **Branch Principal**: `main` (Atualizada e Sincronizada com `origin/main`)  
> **Status do CI (GitHub Actions)**: **100% Verde** (`Copilot core` aprovado em Ubuntu e Windows)

---

## 1. Visão Geral do Projeto
O **Meeting Copilot (Meetily)** é um assistente desktop para reuniões em tempo real, construído com **Rust (Tauri v2)** e **Next.js (React / TypeScript)**. O objetivo é fornecer:
1. **Transcrição local e contínua** (via Parakeet/Whisper).
2. **Separação de locutores e canais de áudio** (Microfone local vs. Áudio remoto do sistema/chamada).
3. **Copiloto em tempo real (Teleprompter)**: detecta perguntas feitas por outros participantes da reunião e sugere respostas técnicas contextuais instantaneamente usando IA (OpenAI / LM Studio / Ollama / Claude / Groq).

---

## 2. O Que Já Foi Implementado e Validado

### A. Mecanismo do Copiloto (Engine de Tempo Real)
- **Stemmer e Busca Lexical BM25 (PT-BR)**: busca semântica/lexical veloz sem depender de vetores pesados, com suporte a sinônimos e conjugações em português.
- **Detector Heurístico de Perguntas Conversacionais**: detecta perguntas diretas e vocativos, descartando muletas conversacionais ("estão me ouvindo?", "alô?").
- **Diarização e Filtro Estrito de Canais**:
  - Perguntas faladas no **microfone local** (`microphone`) **não disparam** respostas automáticas (evita responder à própria fala do usuário).
  - Perguntas vindas do **sistema/chamada remota** (`remote-system`) disparam o assistente automaticamente.
  - Suporte a disparo manual para qualquer canal sob demanda.
- **Buffer de Transcrição e Evicção**: buffer circular com descarte de contexto antigo, controle por marca d'água (`watermark`) e isolamento estrito entre reuniões (`meetingId`).

### B. Comunicação com Provedores de IA (Rust IPC Nativo)
- **Eliminação de Erros de CORS e WebKitGTK**:
  - No Linux, o WebKitGTK bloqueava requisições `fetch()` locais para o LM Studio (`http://127.0.0.1:1234`) com `Load failed` ou erro de CORS.
  - Foi criado um backend nativo em Rust (`api_copilot_stream_chat` e `api_copilot_check_health`) usando `reqwest` com streaming assíncrono.
  - Tokens são transmitidos via eventos Tauri (`copilot-token` e `copilot-done`), garantindo streaming fluido sem latência de ponte HTTP.
- **Compatibilidade Híbrida (Tauri vs. Headless Node.js)**:
  - `assistant-service.ts` detecta se o runtime do Tauri está presente (`window.__TAURI_INTERNALS__`).
  - Em ambiente de testes/CI headless (Node.js), utiliza fallback automático via `fetch`, permitindo que os testes unitários rodem perfeitamente sem o binário do Tauri.

### C. Redesign da Interface (Teleprompter)
- **Layout de Foco (75% / 25%)**:
  - Resposta do Copiloto ganha 75% da área útil do painel lateral para leitura confortável durante entrevistas e reuniões.
  - Transcrição recente ocupa os 25% inferiores com opção de colapso rápido.
- **Menu Lateral Recolhível**:
  - Adicionado botão de colapso intuitivo (`ChevronLeft` / `ChevronRight`) com transição suave, permitindo maximizar a área de trabalho.
- **Aba de Dispositivos de Áudio nas Configurações**:
  - Nova aba dedicada (`AudioSettingsTab.tsx`) para seleção de microfone e dispositivo de saída/fone, com bloqueio seguro durante gravação ativa.

### D. Pipeline de CI/CD (GitHub Actions)
- **Correção de Dependências no CI**:
  - Corrigido o erro `ERR_MODULE_NOT_FOUND: Cannot find package '@tauri-apps/api'` no runner do Node.js.
  - Corrigida a falha de compilação do OpenSSL no runner Windows (`x86_64-pc-windows-msvc`), isolando a dependência do OpenSSL exclusivamente para o target Linux no `Cargo.toml`.
- **Resultados no GitHub Actions (Run #35734183978)**:
  - `Copilot Engine (ubuntu-latest)`: ✅ **Success** (52 testes unitários + demo)
  - `Copilot Engine (windows-latest)`: ✅ **Success** (52 testes unitários + demo)
  - `Frontend Typecheck`: ✅ **Success** (0 erros de tipagem)
  - `Frontend Integration Tests`: ✅ **Success** (11 testes de ciclo de sessão aprovados)
  - `Rust Backend Check (Windows)`: ✅ **Success** (`cargo check` e `cargo test --no-run`)

---

## 3. Decisões Técnicas Tomadas

| Decisão | Motivação Técnica | Impacto |
|---|---|---|
| **Streaming de IA Nativo via Rust** | WebKitGTK no Linux impõe restrições de segurança e CORS severas entre `tauri://localhost` e portas locais (`1234`, `11434`). | 100% de estabilidade de conexão com LM Studio e Ollama, sem bloqueio de rede. |
| **Imports Dinâmicos do Tauri no Frontend** | No CI, o runner de testes executa a partir de `copilot/`, onde `@tauri-apps/api` não está instalado no `node_modules` local. | Os testes rodam no Node.js puro sem depender do runtime desktop. |
| **Isolamento de `openssl` no Target Linux** | Windows MSVC utiliza Schannel nativo para TLS. A inclusão global de `openssl-sys` forçava a busca por bibliotecas C ausentes no Windows runner. | Compilação limpa e nativa no Windows sem necessidade de vcpkg/Perl para OpenSSL. |
| **Priorização de Dispositivo Monitor no Linux** | No Linux (PipeWire/ALSA), a gravação de áudio do sistema exige um nó monitor loopback (`meetily_system_source`). | Captura limpa do som de conferências (Google Meet / YouTube) sem ruído do microfone. |
| **Persistência SQLite no Desktop** | Configurações de IA e chaves são gravadas diretamente na tabela `settings` do SQLite (`meeting_minutes.sqlite`), sincronizadas via Tauri Store. | Persistência entre reinicializações sem depender de LocalStorage volátil. |

---

## 4. Arquivos Envolvidos e Suas Responsabilidades

### Backend Rust (`frontend/src-tauri/`)
- `src/api/copilot.rs`: Implementação dos comandos nativos Tauri `api_copilot_check_health` e `api_copilot_stream_chat`.
- `src/api/mod.rs` & `src/lib.rs`: Registro dos comandos do Copiloto no invoke handler do Tauri.
- `src/audio/recording_commands.rs`: Gerenciamento de dispositivos de áudio, inicialização assíncrona e modo `MEETILY_RECORD_SYSTEM_ONLY`.
- `src/audio/devices/speakers.rs` & `src/audio/devices/configuration.rs`: Resolução de nós de áudio monitor e saídas padrão.
- `Cargo.toml`: Configuração de dependências, isolamento de `openssl` para `target_os = "linux"` e versão `1.0.1`.

### Frontend & Copilot Engine (`frontend/src/` e `copilot/`)
- `frontend/src/copilot/assistant-service.ts`: Serviço híbrido do Copiloto (Tauri IPC nativo em desktop + fetch fallback em Node/CI).
- `frontend/src/hooks/useMeetingCopilot.ts`: Hook React principal de orquestração do Copiloto, ingestão de transcrições, regras de disparo e integração com `ConfigContext`.
- `frontend/src/components/Copilot/CopilotPanel.tsx`: Componente de interface do teleprompter (layout 75%/25%, streaming em tempo real, botões de ação rápida).
- `frontend/src/components/Sidebar/index.tsx`: Menu lateral com controle de recolhimento suave.
- `frontend/src/components/AudioSettingsTab.tsx`: Configuração de áudio e fones.
- `copilot/tests/`: Suíte completa de testes unitários do motor conversacional e BM25.

### Scripts de Execução e CI/CD
- `start-desktop.sh`: Script de inicialização no Linux (configura virtual sink PipeWire, pré-aquece Next.js e inicia o Tauri).
- `.github/workflows/copilot-core.yml`: Workflow multiplataforma de validação (Ubuntu e Windows).

---

## 5. Diagnóstico Atual dos Provedores de IA

1. **OpenAI / ChatGPT**:
   - A chave de API (`sk-proj-...`) foi configurada e armazenada no banco SQLite local.
   - **Retorno no teste de chamada**:
     ```json
     {
       "error": {
         "message": "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
         "type": "insufficient_quota",
         "code": "credit_balance_exhausted"
       }
     }
     ```
   - **Causa**: A conta na plataforma de desenvolvedor da OpenAI está sem créditos pré-pagos (o plano ChatGPT Plus pessoal é desvinculado do faturamento de API).
2. **LM Studio (Servidor Local 100% Funcional)**:
   - Rodando em `http://127.0.0.1:1234/v1`.
   - Modelos testados e disponíveis: `qwen2.5-coder-14b-instruct` e `deepseek-r1-distill-qwen-14b`.
   - Custo zero, sem limites de quota e latência imediata.

---

## 6. Próximos Passos Específicos para WINDOWS

Para compilar, testar e executar o Meetily no ambiente **Windows**, siga este roteiro:

### A. Pré-requisitos de Ambiente (Máquina Windows)
1. **Rust Toolchain**:
   ```powershell
   rustup default stable-x86_64-pc-windows-msvc
   rustup update
   ```
2. **Build Tools do Visual Studio C++**:
   - Instalar o **Visual Studio Installer** com a carga de trabalho: *"Desenvolvimento para Desktop com C++"* (MSVC v143, Windows 10/11 SDK).
3. **Node.js e Gerenciador de Pacotes**:
   - Node.js versão `24.x` ou `20.x`.
   - Instalar pnpm: `npm install -g pnpm`
4. **WebView2**:
   - Já presente nativamente no Windows 10 e 11.

### B. Captura de Áudio no Windows (WASAPI Loopback)
- No Windows, a captura do áudio da reunião (Teams, Google Meet, Zoom) utiliza o **WASAPI Loopback** nativo do CPAL.
- **Configuração necessária**:
  - No `AudioSettingsTab` do Meetily, selecionar o dispositivo de saída ativo (ex: *"Headphones (Realtek Audio)"*).
  - O driver CPAL no Windows intercepta o loopback desse endpoint sem necessidade de softwares de terceiros (como Virtual Audio Cable).
  - O microfone físico do usuário é capturado separadamente pelo canal de gravação padrão.

### C. Build e Execução no Windows
1. **Instalar dependências do Frontend**:
   ```powershell
   cd frontend
   pnpm install
   ```
2. **Gerar binário placeholder ou sidecar do llama-helper**:
   ```powershell
   # Compilar o helper em CPU-mode
   cargo build --release -p llama-helper
   New-Item -ItemType Directory -Force -Path "frontend/src-tauri/binaries"
   Copy-Item "target/release/llama-helper.exe" -Destination "frontend/src-tauri/binaries/llama-helper-x86_64-pc-windows-msvc.exe"
   ```
3. **Executar em Modo de Desenvolvimento**:
   ```powershell
   cd frontend
   pnpm run tauri dev
   ```
4. **Build de Produção (Instalador .msi / .exe)**:
   - Pode ser acionado localmente com:
     ```powershell
     pnpm run tauri build
     ```
   - Ou acionando o workflow `.github/workflows/build-windows.yml` no GitHub Actions.

### D. Aceleração de GPU no Windows
- Por padrão, a compilação no Windows roda em modo CPU.
- Caso a máquina Windows possua GPU:
  - **NVIDIA**: `cargo build --release --features cuda`
  - **AMD / Intel**: `cargo build --release --features vulkan`
  - **CPU com otimização BLAS**: `cargo build --release --features openblas`

---

## 7. Próximos Passos Pendentes / Backlog Imediato

1. **Recarga de Créditos OpenAI (Opcional)**:
   - Adicionar créditos mínimos em `platform.openai.com/settings/organization/billing` para habilitar `gpt-4o` e `gpt-4o-mini` via API externa.
2. **Alternância Rápida de Provedor na UI**:
   - Enquanto a OpenAI estiver sem créditos, manter o provedor ativo como **LM Studio (Local / Custom OpenAI)** ou **Ollama**.
3. **Teste de Simulação de Reunião no Windows**:
   - Rodar o Meetily no Windows durante uma conferência real (Teams / Zoom / Meet).
   - Validar se o WASAPI Loopback separa com clareza a voz do interlocutor da voz do usuário no microfone.
