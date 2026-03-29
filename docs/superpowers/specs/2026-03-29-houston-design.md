# Houston — Design Document

## 1. Visão Geral

Houston é um simulador de triagem inteligente que demonstra como IA pode orquestrar a comunicação entre clientes e equipes de desenvolvimento. Construído como resposta a um desafio técnico que pede uma aplicação full-stack pequena com uso significativo de IA.

Em vez de implementar o bot Discord descrito no documento de produto original, o projeto entrega um **simulador web** onde o avaliador pode digitar mensagens como se fosse um cliente e observar o pipeline de processamento em tempo real — classificação, busca de contexto, criação de card e geração de respostas.

### Decisões de escopo

- **Simulador web em vez de bot Discord:** satisfaz o requisito de frontend do desafio e permite que o avaliador teste o produto diretamente no browser
- **Todas as integrações reais:** Claude API, GitHub API e Linear API funcionam de verdade — não são mockadas
- **RAG simplificado:** RAG simplificado baseado em keyword matching, suficiente para o MVP e projetado para evoluir para embeddings no futuro. Busca documentação direto do repositório GitHub alvo, sem embeddings ou vector store
- **6-8 horas de desenvolvimento:** escopo calibrado para qualidade e clareza, não completude

## 2. Arquitetura

### Stack

- **Next.js** (App Router) — frontend e backend no mesmo projeto
- **Claude API** (Anthropic) — classificação, geração de cards e respostas
- **GitHub API** — busca de PRs, issues, código e documentação
- **Linear API** — criação de cards de bugs e features
- **Vitest** — testes unitários e de integração
- **Vercel** — deploy

### Estrutura do projeto

```
houston/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Página principal (simulador)
│   │   ├── layout.tsx                # Layout raiz
│   │   └── api/
│   │       ├── classify/route.ts     # Step 1: Classifica mensagem
│   │       ├── context/route.ts      # Step 2: Busca e curadoria de contexto
│   │       ├── triage/route.ts       # Step 3: Cria card no Linear
│   │       └── respond/route.ts      # Step 4: Gera respostas
│   ├── lib/
│   │   ├── anthropic.ts              # Client Claude API
│   │   ├── github.ts                 # Client GitHub API (retrieval puro)
│   │   ├── linear.ts                 # Client Linear API
│   │   ├── rag.ts                    # Busca docs via GitHub (retrieval puro)
│   │   └── prompts.ts               # System prompts por step
│   ├── components/                   # Componentes React
│   └── types/                        # Types compartilhados
├── __tests__/                        # Testes
├── .env.local                        # API keys
└── next.config.ts
```

### Fluxo de dados (pipeline sequencial)

```
[UI: Input] → POST /api/classify
                 └─ Claude API: classifica tipo + extrai informações
                 └─ retorna: { type, confidence, extracted }

[UI: Step 2] → POST /api/context
                 └─ lib/github.ts: retrieval bruto (PRs, issues, code)
                 └─ lib/rag.ts: retrieval bruto (docs via GitHub)
                 └─ route.ts: filtering + ranking → top N curado
                 └─ retorna: { github, docs }

[UI: Step 3] → POST /api/triage  (só para bug e feature)
                 └─ Claude API: gera título/descrição do card
                 └─ Linear API: cria card
                 └─ retorna: { card: { id, url, title, description, labels } }

[UI: Step 4] → POST /api/respond
                 └─ Claude API: gera resposta para cliente + resumo para dev
                 └─ retorna: { clientResponse, devSummary }
```

Cada step recebe os resultados acumulados dos steps anteriores. O frontend controla o fluxo e faz as chamadas sequencialmente.

### Separação de responsabilidades

- `lib/github.ts` e `lib/rag.ts` → **retrieval puro**. Buscam dados brutos, sem filtrar ou ranquear.
- `/api/context/route.ts` → **curadoria**. Recebe resultados brutos, aplica filtering + ranking, retorna subconjunto curado (top N) para evitar poluir o contexto nos steps seguintes.

## 3. API Routes

### Step 1 — `POST /api/classify`

**Input:**
```ts
{ message: string, repo?: { owner: string, name: string } }
```

**O que faz:**
- Envia a mensagem ao Claude com tool use (`classify_message`) para garantir output JSON estruturado
- Classifica em exatamente um tipo: `bug`, `question`, `feature` ou `ambiguous`
- Extrai informações estruturadas: funcionalidade afetada, passos para reproduzir (se bug), pergunta central (se dúvida), descrição (se feature)

**Regras de classificação:**
- O modelo deve escolher **exatamente um tipo**. Sem respostas ambíguas.
- **Critério de desempate:** na dúvida, escolher o tipo mais acionável. Bug > Feature > Question > Ambiguous. Racional: é melhor triar algo como bug e estar errado do que classificar como ambíguo e não fazer nada.

**Output:**
```ts
{
  type: "bug" | "question" | "feature" | "ambiguous",
  confidence: number,
  extracted: {
    summary: string,
    affectedArea?: string,
    stepsToReproduce?: string[],
    coreQuestion?: string,
    featureDescription?: string
  }
}
```

### Step 2 — `POST /api/context`

**Input:** resultado do step 1 + info do repo

**O que faz:**
- `lib/github.ts` busca PRs, issues e código (retrieval bruto)
- `lib/rag.ts` busca documentação do repo via GitHub (retrieval bruto)
- `route.ts` aplica filtering + ranking e retorna apenas um subconjunto curado

**Estratégia de ranking (2 níveis):**
1. **Heurístico (rápido, sem custo):** filtra por recência, match de keywords no título/path, similaridade lexical (keyword-based)
2. **Assistido pelo Claude (quando heurístico retorna >3 resultados por categoria):** envia títulos/resumos ao Claude para ranquear relevância antes de puxar conteúdo completo — evita queimar tokens com conteúdo irrelevante. Pulado quando o heurístico já retorna ≤3 resultados por categoria.

**Adapta a busca com base no tipo:** bugs focam em PRs/código, questions focam em docs, features focam em estrutura do codebase.

**Output (curado, top N):**
```ts
{
  github: {
    relevantPRs: Array<{ title, url, body }>,        // top 3
    relevantIssues: Array<{ title, url, body }>,      // top 3
    codeMatches: Array<{ path, snippet }>              // top 5 snippets
  },
  docs: Array<{ path, content, relevance }>            // top 3 docs
}
```

### Step 3 — `POST /api/triage`

**Input:** resultados dos steps 1 e 2

**Só executa para `bug` e `feature`.** Para `question` e `ambiguous`, o frontend pula este step.

**O que faz:**
- Usa Claude com tool use (`create_card`) para gerar título e descrição markdown do card
- Cria o card na Linear API com labels apropriadas (Bug / Feature Request)

**Constraint forte: não inventar informação.** O Claude só pode usar informação presente no contexto curado dos steps anteriores. Se não há evidência de onde o bug está, o card diz "localização não identificada" — nunca inventa um arquivo ou função. O prompt inclui instrução explícita: "Não infira, não adivinhe, não invente. Se a informação não está no contexto fornecido, diga que não está disponível." Hipóteses só são geradas no Step 4 (devSummary), nunca no card.

**Output:**
```ts
{
  card: {
    id: string,
    url: string,
    title: string,
    description: string,
    labels: string[]
  }
}
```

### Step 4 — `POST /api/respond`

**Input:** resultados de todos os steps anteriores

**O que faz:**
- Usa Claude com tool use para gerar duas respostas com tom radicalmente diferente:
  - **Resposta sugerida para o cliente:** empática, linguagem simples, sem termos técnicos, confirma que a demanda foi recebida e está sendo tratada, oferece próximos passos quando possível
  - **Resumo para o dev:** técnico e denso, inclui hipóteses baseadas em evidência do contexto ("PR #42 tocou nesse módulo há 3 dias"), links para PRs/issues/card, e gaps explícitos ("não foram encontrados testes para este fluxo")

**Output:**
```ts
{
  clientResponse: string,
  devSummary: string
}
```

## 4. Integração com IA (Claude API)

### Por que Claude

O desafio pede para explicar a escolha do modelo. Motivos:
- **Tool use nativo:** garante outputs estruturados nos steps de classificação e triage, sem parsing manual
- **Janela de contexto grande:** permite enviar o contexto curado inteiro (PRs, snippets, docs) num único request
- **Qualidade de instrução-following:** system prompts com critérios de classificação e diferenciação de tom funcionam bem

### Momentos de uso

1. **Step 1 — Classificação:** tool use com `classify_message`. Tipo único, desempate por acionabilidade.
2. **Step 2 — Ranking (opcional):** chamada leve com títulos/resumos para ranquear relevância. Econômica em tokens. Pulada quando heurístico é suficiente.
3. **Step 3 — Geração de card:** tool use com `create_card`. Constraint de não-invenção.
4. **Step 4 — Geração de respostas:** tool use retornando ambas as respostas (cliente + dev) com tons distintos.

### Prompts

Todos os system prompts ficam centralizados em `lib/prompts.ts`, um por step. Cada prompt inclui:
- Papel e contexto do step
- Regras específicas (desempate, não-invenção, diferenciação de tom)
- Schema da tool esperada

## 5. Integrações Externas

### `lib/github.ts`

Client puro de retrieval. Usa a REST API do GitHub (ou `octokit`).

**Operações:**
- `searchPRs(owner, repo, query)` — busca PRs por keywords
- `searchIssues(owner, repo, query)` — busca issues por keywords
- `searchCode(owner, repo, query)` — busca código no repo
- `getFileContent(owner, repo, path)` — busca conteúdo de um arquivo
- `listDocs(owner, repo, docsPath?)` — lista arquivos markdown no repo

Autenticação via GitHub token (env var). Funciona com repos públicos sem token (rate limit menor).

Todas as funções retornam dados brutos — sem filtragem, sem ranking.

### `lib/rag.ts`

RAG simplificado baseado em keyword matching, suficiente para o MVP e projetado para evoluir para embeddings no futuro. Retrieval de documentação via GitHub com keyword match contra títulos e conteúdo.

**Fluxo:**
1. Usa `github.listDocs()` para descobrir arquivos de documentação no repo
2. Usa `github.getFileContent()` para puxar o conteúdo
3. Retorna docs brutos — curadoria fica no `/api/context`

**Fallback de docs:** busca em `docs/` primeiro. Se não existir ou estiver vazio, cai para `README.md`. Garante que sempre tem alguma documentação para trabalhar.

### `lib/linear.ts`

Client para criação de cards. Usa a API GraphQL do Linear (SDK oficial `@linear/sdk`).

**Operações:**
- `createIssue(teamId, title, description, labels)` — cria issue, retorna id + url
- `getTeams()` — lista teams disponíveis

**Configuração via env vars:**
- `LINEAR_API_KEY` — API key
- `LINEAR_TEAM_ID` — team onde os cards são criados

Labels automáticas: "Bug" ou "Feature Request" baseado na classificação do Step 1.

### Variáveis de ambiente

```
ANTHROPIC_API_KEY=sk-ant-...
GITHUB_TOKEN=ghp_...          # opcional para repos públicos
LINEAR_API_KEY=lin_api_...
LINEAR_TEAM_ID=...
```

## 6. Frontend

### Layout (3 áreas)

**1. Config bar (topo)**
- Seletor de repositório GitHub (owner/repo) — o avaliador pode trocar o repo alvo
- Indicadores de status das integrações (verde/vermelho para Anthropic, GitHub, Linear)

**2. Painel de input (esquerda)**
- Textarea para a mensagem do "cliente"
- Botão "Enviar para Houston"
- Exemplos de mensagens pré-prontas clicáveis (um bug, uma dúvida, uma feature) — facilita a demo

**3. Painel de processamento (direita)**
- Pipeline visual com 4 steps em cards empilhados verticalmente
- Cada step tem 3 estados visuais:
  - **Pendente (cinza):** aguardando steps anteriores
  - **Processando (azul):** spinner + mensagens de progresso
  - **Completo (verde):** expandido com resultado detalhado
- Se um step falhar, mostra o erro naquele step
- Step 1 completo mostra: tipo (badge), confiança, informações extraídas
- Step 2 completo mostra: PRs, issues, snippets e docs encontrados (colapsáveis)
- Step 3 completo mostra: card criado com link real para o Linear (ou "Pulado" para questions)
- Step 4 completo mostra: duas áreas — "Resposta para Cliente" e "Resumo para Dev"
- Opcionalmente, cada step pode exibir o tempo de execução (execution time per step)

### Configuração

- API keys: variáveis de ambiente (`.env.local`)
- Repositório GitHub: selecionável na UI (o avaliador pode trocar sem reiniciar)

## 7. Testes

### Framework

Vitest — integrado com Next.js, rápido, boa DX.

### O que testar

**1. Classificação (unit)**
- Dado output estruturado do Claude, o step 1 retorna tipo correto e campos extraídos
- Teste de desempate: confiança baixa resulta no tipo mais acionável

**2. Curadoria de contexto (unit)**
- Dado N PRs/issues/docs brutos, o `/api/context` retorna no máximo o top N configurado
- Ranking heurístico ordena por relevância corretamente

**3. Roteamento do pipeline (integration)**
- Mensagem `question` pula Step 3 e vai direto pro Step 4
- Mensagem `bug` passa por todos os 4 steps

**4. Constraint de não-invenção (unit)**
- Prompt do Step 3 com contexto vazio gera card que diz "informação não disponível"

**5. Resiliência a contexto vazio (integration)**
- Quando GitHub retorna 0 PRs, 0 issues, 0 code matches, e RAG retorna 0 docs, o pipeline não quebra. Step 2 retorna estrutura vazia válida, Step 3 cria card com a informação disponível (só do Step 1), Step 4 gera respostas normalmente.

### O que NÃO testar (MVP)

- Chamadas reais às APIs externas — mockadas nos testes
- Componentes React
- E2E completo

### Setup

Mocks dos clients (`lib/anthropic.ts`, `lib/github.ts`, `lib/linear.ts`).

## 8. Deploy e Entregáveis

### Deploy

Vercel — deploy direto do GitHub repo, zero config com Next.js. Env vars configuradas no painel da Vercel.

### README

1. **Project overview** — o que é o Houston, o problema que resolve
2. **Tech stack** — Next.js, Claude API, GitHub API, Linear API, Vitest
3. **Diagrama de arquitetura** — pipeline em alto nível (Input → Classify → Context → Triage → Respond) com as APIs envolvidas em cada step
4. **How AI is used** — os 3-4 momentos de uso do Claude com justificativa da escolha do modelo
5. **Fallback de erros** — comportamento em caso de falha de integração:
   - GitHub falha → pipeline continua com contexto vazio
   - Linear falha → Step 3 mostra o card que seria criado mas indica que não foi possível criar
   - Claude falha → step falha e pipeline para com erro visível
6. **Setup instructions** — clone, `npm install`, configurar `.env.local`, `npm run dev`
7. **Trade-offs / improvements** — o que faria com mais tempo (embeddings para RAG, SSE para streaming, persistência, auth, multi-channel)

### Demo

Live demo na Vercel (se deployado) ou gravação em Loom mostrando o fluxo completo: mensagem de bug, question e feature passando pelo pipeline.

---

**Diretriz de idioma:** All code, comments, and prompts are written in English to align with standard practices in international engineering teams.
