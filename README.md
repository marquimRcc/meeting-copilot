<div align="center" style="border-bottom: none">
    <h1>
        <img src="docs/Meetily-6.png" style="border-radius: 10px;" />
        <br>
        Meeting Copilot
    </h1>
    <p><b>Privacy-First AI Meeting Assistant & Real-Time Copilot</b></p>
    <br>
    <a href="https://github.com/marquimRcc/meeting-copilot/releases"><img src="https://img.shields.io/badge/License-MIT-blue" alt="License"></a>
    <a href="https://github.com/marquimRcc/meeting-copilot"><img src="https://img.shields.io/badge/Supported_OS-macOS,_Windows,_Linux-white" alt="Supported OS"></a>
    <a href="https://github.com/marquimRcc/meeting-copilot/actions/workflows/copilot-core.yml"><img src="https://github.com/marquimRcc/meeting-copilot/actions/workflows/copilot-core.yml/badge.svg" alt="CI Status"></a>
    <br><br>
    <h3>Open Source • Local-First • Privacy-First</h3>
    <p align="center">
        Um assistente e copiloto inteligente para reuniões que grava, transcreve, detecta perguntas e gera resumos e sugestões em tempo real diretamente no seu computador, preservando total privacidade e soberania de dados.
    </p>

    <p align="center">
        <img src="docs/meetily_demo.gif" width="650" alt="Meeting Copilot Demo" />
    </p>
</div>

---

<details>
<summary><b>Sumário / Table of Contents</b></summary>

- [Visão Geral / Overview](#visão-geral--overview)
- [Principais Funcionalidades](#principais-funcionalidades)
- [Copilot Engine Integrado](#copilot-engine-integrado)
- [Instalação e Execução](#instalação-e-execução)
  - [Pré-requisitos](#pré-requisitos)
  - [Compilação a partir do Código-Fonte](#compilação-a-partir-do-código-fonte)
- [Arquitetura do Sistema](#arquitetura-do-sistema)
- [Testes e Validação Contínua](#testes-e-validação-contínua)
- [Licença](#licença)
- [Agradecimentos](#agradecimentos)

</details>

---

## Visão Geral / Overview

O **Meeting Copilot** é uma aplicação desktop nativa e de código aberto desenvolvida com **Tauri (Rust)** e **Next.js (TypeScript/React)**. Seu propósito é fornecer transcrição contínua em tempo real, copiloto conversacional com recuperação de contexto e resumos automatizados de reuniões corporativas sem depender obrigatoriamente de nuvem.

### Princípios do Projeto:
- **Privacidade e Soberania Total:** Modelos de transcrição (Whisper/Parakeet), gravações de áudio, transcrições e banco de dados rodam e persistem localmente na sua máquina (SQLite e IndexedDB).
- **Sem Lock-in Comercial:** 100% livre e de código aberto. Sem assinaturas pagas, tiers restritos, telemetrias intrusivas ou dependências de servidores proprietários.
- **Suporte a LLMs Locais e Externas:** Integração nativa com **Ollama** e **LM Studio** para execução offline com modelos open-source (Llama 3, Mistral, Qwen, DeepSeek), além de compatibilidade com endpoints OpenAI, Claude, Groq e OpenRouter.

---

## Principais Funcionalidades

- 🎙️ **Captura de Áudio Multicanal:** Gravação simultânea de microfone e áudio do sistema (interlocutor/reunião) com controle de canais e suporte a monitores no Windows e Linux (PulseAudio/PipeWire/ALSA).
- ⚡ **Transcrição em Tempo Real:** Transcrição contínua acelerada por GPU (Vulkan/Metal/CUDA) usando Whisper ou Parakeet.
- 🔄 **Ciclo de Vida Transacional e Resiliente:** Inicialização e parada transacionais com rollback automático no backend Rust, sincronização de sessão pós-reload (F5) e proteção contra inícios simultâneos concorrentes.
- 📝 **Editor de Notas e Resumos com IA:** Geração de resumos de reuniões estruturados, planos de ação e atas automáticas com editor de texto integrado.
- 📥 **Importação e Retranscrição de Áudio:** Possibilidade de importar gravações de áudio prévias para transcrição e reprocessamento com modelos variados.

---

## Copilot Engine Integrado

Além da transcrição convencional, o projeto conta com um **Copilot Engine** integrado (`frontend/src/copilot/` e workspace `copilot/`):

1. **Separação de Locutores e Canais:** Diferencia perguntas vindas do interlocutor remoto (`remote-system`) da fala do próprio usuário (`microphone`), disparando sugestões de resposta contextuais apenas quando o interlocutor fizer uma pergunta ao usuário.
2. **Detecção de Perguntas Conversacionais:** Heurística refinada para identificar perguntas naturais e solicitações em português, com descarte de muletas de áudio e deduplicação de 30 segundos.
3. **Mecanismo de Busca Semântica Lexical (BM25 + Stemmer PT-BR):** Indexação e busca por evidências técnicas relevantes a partir de base de conhecimento em JSON, com suporte a filtragem estrita de escopos/projetos.
4. **Endurecimento de Segurança Anti-Injection:** Sandboxing de entradas não confiáveis com tags estruturadas (`<untrusted_question>`, `<untrusted_evidence_documents>`) e regras explícitas para impedir ataques de jailbreak ou prompt injection embutidos no áudio da reunião.

---

## Instalação e Execução

### Pré-requisitos
- **Node.js:** Versão 20 ou 24 (recomendado v24)
- **pnpm:** Versão 9.15.9 (`npm install -g pnpm@9.15.9`)
- **Rust & Cargo:** Versão estável recente (`curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`)
- **Compiladores C++:**
  - *Windows:* Visual Studio Build Tools (C++ development workload)
  - *Linux:* `build-essential`, `libasound2-dev`, dependências de áudio ALSA/Pulse/PipeWire
  - *macOS:* Xcode Command Line Tools (`xcode-select --install`)

### Compilação a partir do Código-Fonte

Clone o repositório:
```bash
git clone https://github.com/marquimRcc/meeting-copilot.git
cd meeting-copilot/frontend
```

Instale as dependências com lockfile congelado:
```bash
pnpm install --frozen-lockfile
```

Execute em modo de desenvolvimento desktop (Tauri + Next.js):
```bash
pnpm run tauri:dev
```

Para compilar o executável de produção para sua plataforma:
```bash
pnpm run tauri:build
```

---

## Arquitetura do Sistema

```
meeting-copilot/
├── frontend/
│   ├── src/                 # Interface gráfica em Next.js (React/Tailwind)
│   │   ├── copilot/         # Integração frontend do Copilot (Stemmer, BM25, Sandbox)
│   │   ├── hooks/           # useRecordingStart, useTranscripts, useRecordingState
│   │   └── services/        # recordingService, indexedDBService
│   ├── src-tauri/           # Backend nativo em Rust
│   │   ├── src/audio/       # Captura de microfone, áudio do sistema, mixer, pipeline
│   │   └── src/recording_commands.rs # Comandos e locks de ciclo de vida de gravação
│   └── tests/integration/   # Testes de ciclo de vida (session-lifecycle) e canário
└── copilot/                 # Módulo de simulação e suíte central do Copilot Engine
    ├── tests/               # Testes automatizados do motor
    └── demo/                # Demonstração CLI interativa
```

---

## Testes e Validação Contínua

A base de código possui suítes automatizadas validadas via **GitHub Actions** em ambientes Linux e Windows:

- **Copilot Engine:** 50 testes unitários cobrindo Stemmer, BM25, Diarização, Buffering e Anti-Injection:
  ```bash
  cd copilot && node --test tests/*.test.mjs ../frontend/src/copilot/tests/copilot-engine.test.mjs
  ```
- **Testes de Integração de Ciclo de Vida & Canário:**
  ```bash
  cd frontend && pnpm run test:integration
  ```
- **Checagem de Tipos do Frontend:**
  ```bash
  cd frontend && pnpm run typecheck
  ```
- **Backend Rust (Windows MSVC / Linux):**
  ```bash
  cargo check --manifest-path frontend/src-tauri/Cargo.toml
  cargo test --manifest-path frontend/src-tauri/Cargo.toml --no-run
  ```

---

## Licença

Este projeto é distribuído sob a licença **MIT**. Consulte o arquivo [LICENSE](LICENSE) para mais detalhes.

---

## Agradecimentos

Este projeto é um fork evoluído de forma independente a partir do [Meetily](https://github.com/Zackriya-Solutions/meeting-minutes) (Zackriya Solutions), estendido com um motor de Copilot em tempo real, proteção transacional de sessões, compatibilidade Linux/PipeWire e isolamento local.

Reconhecimentos a outros projetos de código aberto fundamentais:
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp) por Georgi Gerganov
- [Tauri](https://tauri.app/)
- [Screenpipe](https://github.com/mediar-ai/screenpipe)
- [transcribe-rs](https://crates.io/crates/transcribe-rs)
- **NVIDIA** pelo modelo **Parakeet** e [istupakov](https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx) pela conversão ONNX.
