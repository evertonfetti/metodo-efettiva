# EFETTIVA OS — Guia de layout e interface

**Versão:** 1.0 — 20/11/2026
**Uso:** referência obrigatória para toda tela do Efettiva OS. Complementa a seção 10 da `ESPECIFICACAO_MESTRA_EFETTIVA_OS.md`.
**Precedência:** os requisitos funcionais continuam na especificação. Para decisões **visuais e de layout**, este guia prevalece.
**Referência visual:** `docs/design/*.html` são os mockups aprovados das 6 telas principais. Use-os como referência de estrutura, hierarquia e textos. **Não copie o HTML**: ele foi escrito para uma ferramenta de design (atributos `{{ }}`, `<x-dc>`, `<sc-for>`). Reimplemente com React, Tailwind e shadcn/ui.

> **Regra de ouro:** nenhum número aparece na tela sem fonte e período. Sem dado, a tela mostra **"Indisponível"** com o motivo, nunca `0`, `—` solto ou valor estimado escondido.

---

## 1. Princípios

1. **Sóbrio e funcional.** Ferramenta de trabalho do consultor, não landing page. Sem gradientes, sombras pesadas, ilustrações, emojis ou animações decorativas.
2. **Dado com origem.** Todo indicador mostra fonte (arquivo/lote, regra ou cadastro) e período/data de referência.
3. **Cor nunca sozinha.** Todo status tem **texto + ícone/símbolo** além da cor.
4. **Próxima ação sempre visível.** Estado vazio explica o que fazer ("Importe vendas para ver clientes inativos") e oferece o botão.
5. **Contexto do cliente explícito.** Dentro de um cliente, o nome dele aparece no menu lateral e na trilha. Trocar de cliente limpa o estado da tela anterior.
6. **DEMO sempre sinalizado.** Dados do seed fictício carregam o selo `DEMO` em toda tela onde aparecem.
7. **Desktop primeiro, funcional no celular.** Tudo continua usável em 390 px (menu vira gaveta, tabelas rolam na horizontal, colunas empilham).
8. **pt-BR em tudo:** textos, datas, moeda e números.

---

## 2. Tokens de design

### 2.1 Cores

| Token | Hex | Uso |
|---|---|---|
| `navy` | `#0B2545` | Menu lateral, botão primário, títulos, cabeçalho de tabela de documentos |
| `navy-700` | `#13345E` | Item ativo do menu, hover do primário, botão do cliente ativo |
| `navy-600` | `#1E3F66` | Divisórias e avatar dentro do menu |
| `navy-border` | `#3A5A82` | Bordas dentro do menu |
| `amber` | `#D9A441` | **Somente destaque**: logo, ícone do item ativo, sublinhado de aba ativa, marcador "hoje", anel de seleção. **Nunca** como cor de texto sobre fundo branco (contraste insuficiente) |
| `amber-50` | `#FDF3DC` | Fundo do selo DEMO e dos marcadores `[PENDENTE]` |
| `amber-900` | `#6B4A06` | Texto sobre `amber-50` |
| `bg` | `#F4F6F9` | Fundo da área de conteúdo |
| `surface` | `#FFFFFF` | Cards, tabelas, painéis, topbar |
| `surface-muted` | `#F8FAFC` | Blocos internos, inputs de busca |
| `surface-sunken` | `#EEF2F7` | Item selecionado em listas, legendas, colunas do kanban (`#E9EDF3`) |
| `border` | `#E2E8F0` | Bordas de cards e linhas de tabela |
| `border-strong` | `#CBD5E1` | Bordas de inputs e botões secundários |
| `text` | `#0F172A` | Texto principal |
| `text-muted` | `#475569` | Rótulos, descrições, trilha |
| `text-subtle` | `#64748B` | Linha de fonte dos indicadores, metadados |
| `on-navy` | `#FFFFFF` / `#DCE3EC` / `#AFC0D4` | Texto ativo / item normal / rótulo de seção no menu |

**Cores de status (fundo / texto)** — sempre acompanhadas de símbolo e palavra:

| Semântica | Fundo | Texto | Símbolo |
|---|---|---|---|
| Sucesso / aprovado / concluído | `#DCFCE7` | `#166534` | ✓ |
| Informação / em andamento / piloto | `#DBEAFE` | `#1E40AF` | ● ou ◐ |
| Neutro / planejado / pendente / detectado | `#F1F5F9` | `#334155` | ○ |
| Atenção / dado faltante / alerta | `#FEF3C7` | `#78350F` | ! (ícone de triângulo) |
| Erro / vencido / bloqueia aprovação | `#FEE2E2` | `#991B1B` | ✕ |
| Bloqueado / reavaliar | `#FFEDD5` | `#9A3412` | ícone de bloqueio (Lucide `ban`) |

Contraste mínimo: 4,5:1 para texto. Todas as combinações acima passam.

### 2.2 Tipografia

- Fonte: **Manrope** via `next/font/google` (pesos 400, 500, 600, 700, 800), fallback `system-ui, sans-serif`. Fonte também embarcada no container para o PDF.
- Escala:

| Uso | Tamanho | Peso |
|---|---|---|
| Título da página (h1) | 26 px (24 px no editor) | 800 |
| Título de card (h2) | 17 px (15 px em painéis laterais) | 800 |
| Título de pergunta/tarefa (h3) | 14–16 px | 700 |
| Corpo | 14 px (15 px no editor de documento, entrelinha 1,65) | 400–600 |
| Rótulos, metadados, fonte do KPI | 12–13 px | 600–700 |
| Rótulo de seção em caixa alta | 11–12 px, `letter-spacing: .5–.8px` | 700 |
| Valor de KPI | 30 px | 800 |

### 2.3 Espaçamento, raio e bordas

- Grade base de 4 px. Padding de página: `28px 32px 40px` (24 px no celular). Gap entre blocos: 24 px; dentro de cards: 12–16 px.
- Raio: cards e painéis 12 px; botões, inputs e chips quadrados 8 px; selos pequenos 4 px; chips de status `999px`.
- Card padrão: fundo branco, borda 1 px `border`, **sem sombra**.
- Alvo de toque mínimo: 40 px de altura em botões de desktop, 44 px em itens de navegação.

### 2.4 Implementação dos tokens

Defina os tokens como variáveis CSS em `src/app/globals.css` e mapeie para o tema do Tailwind (no v4 via `@theme`; no v3 via `tailwind.config.ts`) e para as variáveis do shadcn/ui (`--primary` = navy, `--primary-foreground` = branco, `--accent` = `surface-sunken`, `--ring` = navy, `--destructive` = `#991B1B`, `--radius` = 0.5rem). Não espalhe hex pelo código: use as classes do tema.

---

## 3. Estrutura da aplicação (shell)

```
┌───────────────┬──────────────────────────────────────────────────┐
│               │ TOPBAR (64 px, branco, borda inferior)           │
│  MENU LATERAL │  trilha · [busca ou filtro de período] · ação    │
│  248 px navy  ├──────────────────────────────────────────────────┤
│               │ CONTEÚDO (fundo #F4F6F9, max-width 1240 px)      │
│  logo         │  cabeçalho da página (h1 + subtítulo + ações)    │
│  nav global   │  blocos (cards, tabelas, quadros)                │
│  cliente ativo│                                                  │
│  nav cliente  │                                                  │
│  usuário      │                                                  │
└───────────────┴──────────────────────────────────────────────────┘
```

### 3.1 Menu lateral (`AppSidebar`)

1. **Marca:** quadrado âmbar 34 px com "E" em navy + "Efettiva OS" / "Uso interno". Trocar pela logo configurada em Configurações quando houver.
2. **Navegação global:** Visão geral (`/dashboard`), Clientes (`/clientes`), Biblioteca de processos (`/biblioteca`), Configurações (`/configuracoes`). Ícones Lucide 18 px: `layout-dashboard`, `building-2`, `book-open`, `sliders-horizontal`.
3. **Cliente ativo (`ClientSwitcher`):**
   - Sem cliente: botão com borda tracejada "Selecionar cliente" + texto de ajuda.
   - Com cliente: botão `navy-700` com nome, linha pequena âmbar "DEMO · Segmento" (o DEMO só aparece se for seed), chevron. Abre um Command (shadcn) com busca entre clientes.
4. **Navegação do cliente** (só aparece com cliente ativo, recuada 20 px): Visão 360°, Diagnósticos, Dados e importações, Oportunidades, Projetos, Documentos, Relatórios.
5. **Rodapé:** avatar com iniciais, nome e perfil (`OWNER`/`CONSULTANT`/`VIEWER`), menu com "Sair".
- Item ativo: fundo `navy-700`, texto branco 700, ícone âmbar, `aria-current="page"`.
- Abaixo de 1024 px: o menu vira gaveta (shadcn `Sheet`) aberta por botão de menu na topbar.

### 3.2 Topbar

- Esquerda: **trilha** (`Breadcrumb`): `Cliente / Seção / Item`, último item em `text`, anteriores em `text-muted` clicáveis.
- Centro/direita, conforme a tela: busca global (só na Visão geral), `PeriodFilter` (telas de cliente com indicadores), indicador de salvamento ("✓ Salvo automaticamente às 10:42" em verde; "Salvando…"; "Erro ao salvar — tentar de novo" em vermelho).
- Ação primária da tela pode ficar na topbar (Visão geral) ou no cabeçalho da página (demais telas). Nunca nos dois lugares.

### 3.3 Cabeçalho da página

`h1` + selo de status/DEMO ao lado + subtítulo de uma linha com contexto (segmento, período, datas, responsável) à esquerda; à direita, no máximo **1 botão primário** (navy) e até 2 secundários (branco com borda). Em telas estreitas, quebra linha.

### 3.4 Arquivos de layout no Next.js

- `src/app/(app)/layout.tsx`: shell (sidebar + topbar), verifica sessão.
- `src/app/(app)/clientes/[clientId]/layout.tsx`: carrega o cliente **com verificação de autorização no servidor**, fornece o contexto do cliente à sidebar e à trilha e garante que nenhum estado do cliente anterior sobreviva à troca (chave do layout = `clientId`).
- Texto da trilha vem do servidor (nome real do cliente/projeto/documento), nunca do ID.

---

## 4. Componentes

Nomes conforme a seção 10.3 da especificação. Todos em `src/components/`.

| Componente | Visual e regras |
|---|---|
| `MetricCardWithSource` | Card branco: rótulo 13 px muted → valor 30 px/800 navy → linha de fonte 12 px subtle ("Fonte: vendas.csv · lote 3 · 12/11/2026"). Props: `label`, `value: number \| null`, `format` (`integer`, `brl`, `percent`, `days`), `source`, `period`, `unavailableReason`. **Se `value === null`**: borda tracejada, valor "Indisponível" 20 px muted e "Motivo: …" no lugar da fonte. Pode ter um selo secundário ao lado do valor (ex.: "7 sem follow-up" em vermelho). Variante de alerta: borda `#F3C4C4` e valor em `#991B1B` + selo "Atenção". |
| `StatusBadge` | Chip arredondado com símbolo + texto em caixa alta ou normal, cores da tabela 2.1. Um mapa central `enum → {rótulo pt-BR, tom, símbolo}` (ver seção 6). Nunca renderizar o enum cru (`IN_PROGRESS`). |
| `DemoBadge` | "DEMO", 11 px/800, fundo `amber-50`, texto `amber-900`, raio 4 px. Aparece ao lado do nome de qualquer cliente/registro do seed. |
| `DataQualityBanner` | Faixa `#FEF3C7`/`#78350F`, ícone de triângulo, frase objetiva do problema e da consequência, botão secundário com a ação ("Importar custos"). `role="status"`. |
| `EmptyState` | Ícone de linha 32 px, título curto, uma frase de próxima ação, botão. Ex.: "Nenhum diagnóstico ainda — Comece pelo questionário-base de 96 perguntas. [Novo diagnóstico]". |
| `MethodJourney` | Faixa com as fases do método em grade de 5 colunas. Cada fase: status (✓ CONCLUÍDA / ● EM ANDAMENTO / ○ NÃO INICIADA), nome numerado e o gate em uma linha. Fase atual em fundo navy com texto branco e status âmbar; concluída em verde claro; demais em cinza. **Nomes e gates das fases vêm de configuração** (padrão: Anexo D — Diagnosticar, Ativar, Estruturar, Escalar, Sustentar). |
| `ClientContextHeader` | Nome (h1) + `DemoBadge` + linha "Segmento · Porte · Nº vendedores · Canais · Cliente desde dd/mm/aaaa" + ações (Importar dados, Novo diagnóstico, **Gerar playbook** como primária). |
| `AssessmentProgress` | Lista vertical das 12 áreas em card branco: "NN · Nome" + contador "x/8" (verde quando completo) + barra fina de 4 px. Área atual com fundo `surface-sunken` e contorno navy 2 px. Topo: "12 áreas · 96 perguntas". |
| `QuestionCard` | Código (12 px muted) → pergunta (16 px/700) → grupo de botões `0 1 2 3 4 5 · Não sei · Não se aplica` (min 44×40 px, `aria-pressed`). Selecionado: número = navy cheio; "Não sei" = âmbar claro com borda `#B45309`; "Não se aplica" = cinza `#E2E8F0`. Linha de status abaixo explicando o efeito ("Não sei — vira lacuna de dados e não reduz o score."). Bloco de evidência/nota quando houver. Rodapé: "+ Evidência", "+ Nota", "Informado por: …". Acima da lista, legenda da escala (rótulos padrão: 0 Inexistente · 1 Informal · 2 Iniciado · 3 Definido · 4 Praticado e medido · 5 Otimizado — **configuráveis**). |
| `PriorityMatrix` | Quadrado 2×2 (Impacto ↑ × Esforço →) com quadrantes nomeados: Ganhos rápidos (verde claro), Estruturantes, Ajustes, Reavaliar (laranja claro). Pontos de 46 px com o código (O-01). Preenchido navy = aprovada; contorno navy = revisada; contorno tracejado = detectada; anel âmbar = selecionada. Legenda abaixo. Clicar no ponto seleciona a oportunidade e abre o detalhe. Pontos sobrepostos se deslocam lateralmente. |
| `OpportunityDetail` | Painel ao lado da matriz: código + status + origem → título → 4 mini-cards (Impacto, Confiança, Esforço, **Score** em navy com rótulo âmbar) → Evidências (lista com fonte) → bloco âmbar "Dados ausentes" → Processos vinculados (chip navy = vinculado, chip tracejado = sugerido) → ações: Vincular a projeto (primária), Editar estimativa, Descartar com motivo (texto vermelho). |
| `ProcessCodeChip` | Código do processo em chip navy pequeno (11 px/800, raio 4 px). Sempre que um processo aparece, mostrar **código + nome** (ex.: "C05 · Recuperação de clientes inativos"). |
| `TaskBoard` / `TaskCard` | Quadro de 4 colunas (Pendente, Em andamento, Bloqueada, Concluída) em fundo `#E9EDF3`, título "Nome · contagem". Cartão: chips (processo + "VENCIDA HÁ N DIAS" em vermelho ou "BLOQUEADA") → título → **"Efettiva: nome" e "Cliente: papel/nome" em linhas separadas** → "Prazo dd/mm · checklist x/y · n evidências". Cartão vencido tem borda `#F3C4C4`. Bloqueada mostra o impedimento em laranja. Concluída mostra "✓ CONCLUÍDA EM dd/mm" e a evidência. Alternância Quadro/Lista e filtros em chips (Vencidas, Bloqueadas, Só responsável cliente). |
| `Timeline306090` | Três blocos (Dias 1–30, 31–60, 61–90) com fase e resumo; bloco atual em azul claro; linha vertical âmbar marcando "hoje" com o título "hoje é o dia N". |
| `DocumentSectionEditor` | Layout em 3 colunas (ver tela 06). Cabeçalho do editor com chips "Visibilidade: Cliente/Interno" e "Origem: …" + barra de ferramentas. Marcadores `[PENDENTE: …]` em fundo `amber-50` e negrito. Tabelas do documento com cabeçalho navy. Rodapé: "Regenerar seção do template" e "✓ Aprovar seção" (verde `#166534`). |
| `ExportPanel` | Seletor de audiência, 3 botões DOCX/PDF/MD, frase do que será excluído ("Arquivo para o cliente sai sem a seção 8 (interna)") e aviso de marca d'água quando for rascunho. |
| `QualityChecklist` | Lista de verificações antes de exportar: ✓ verde, ✕ vermelho (bloqueia aprovação), ! âmbar (alerta). |
| `VersionList` / `ApprovalHistory` | Versões com estado, data e autor; versões aprovadas marcadas "· imutável". |
| `ConfirmDestructiveAction` | Dialog do shadcn com digitação do nome para excluir cliente ou descartar registro aprovado. |

**Ícones:** Lucide, traço 2 px, 16–18 px, sempre com `aria-hidden` quando decorativos. Botões só com ícone exigem `aria-label`.

---

## 5. Telas

As telas 01–06 têm mockup em `docs/design/`. As demais seguem os mesmos padrões.

### 01 · Visão geral — `/dashboard` (`docs/design/01-visao-geral.html`)
- Cabeçalho: "Visão geral" + data por extenso e fuso. Faixa âmbar "Ambiente com dados DEMO" quando existir seed.
- Grade de 4 `MetricCardWithSource` **operacionais**: Clientes ativos, Projetos em andamento, Tarefas vencidas (variante alerta quando > 0), Jobs com falha.
- Frase fixa: "Receitas e margens não são somadas entre clientes diferentes. Abra um cliente para ver indicadores comerciais com fonte e período."
- Duas colunas: **Clientes** (tabela: Empresa + DEMO, Segmento, Fase do método, Próximo marco, Alertas) | coluna lateral com **Tarefas vencidas** (título, código do processo, cliente, "vencida há N dias"), **Próximos compromissos** (bloco de data + título + processo/cliente/hora) e **Processamentos recentes** (jobs com status e %).

### 02 · Cliente — Visão 360° — `/clientes/[clientId]` (`02-cliente-360.html`)
- `ClientContextHeader` → `MethodJourney` → `DataQualityBanner` (se houver lacuna) → 4 `MetricCardWithSource` (Clientes cadastrados, Com sinal de inatividade, Orçamentos abertos, Margem de contribuição) → duas colunas:
  - **Diagnóstico 360°:** barras horizontais por área (nota 0–5 com vírgula), barras âmbar abaixo de 2,0, "n/d" com barra tracejada quando só há "não sei"; linha de contexto (diagnóstico #, data de revisão, cobertura).
  - **Oportunidades aprovadas** (código, título, score) e **projeto ativo** (progresso de tarefas e status por processo).
- Filtro de período na topbar.

### 03 · Diagnóstico — `/clientes/[clientId]/diagnosticos/[assessmentId]` (`03-diagnostico.html`)
- Cabeçalho com status (RASCUNHO / FECHADO / REVISÃO n), modelo, período, cobertura geral "x% (n/96)". Ações: "Resumo e scores", **"Fechar diagnóstico"**.
- Duas colunas: `AssessmentProgress` (esquerda) | área atual com título "NN · Nome", "Perguntas 1–4 de 8 · score parcial da área: x,x", legenda da escala e `QuestionCard`s. Navegação no rodapé: "← área anterior" / "Perguntas 5–8 →".
- Autosave com indicador na topbar. Diagnóstico fechado fica somente leitura com botão "Criar revisão".
- Perguntas condicionais: aparecem/somem com transição discreta e um aviso "Pergunta exibida porque o segmento é Distribuição".

### 04 · Oportunidades — `/clientes/[clientId]/oportunidades` (`04-oportunidades.html`)
- Cabeçalho com a fórmula do score explicada em uma linha e "+ Registrar achado".
- Filtros em linha: Área, Origem (Regra, Consultor, Sugestão IA), Status, Confiança mínima.
- Duas colunas: `PriorityMatrix` | `OpportunityDetail` da selecionada.
- Tabela completa abaixo, ordenada por score: Código, Oportunidade, Origem, I, C, E, Score, Status, Processos. Linha selecionada com fundo `surface-muted`. Oportunidade com risco crítico ganha selo vermelho "RISCO CRÍTICO" e fica no topo, independentemente do score.

### 05 · Projeto — Plano de ação — `/clientes/[clientId]/projetos/[projectId]/acoes` (`05-projeto.html`)
- Cabeçalho: nome, status, datas, responsável Efettiva, patrocinador no cliente, "+ Nova tarefa".
- Abas do projeto (sublinhado âmbar na ativa): Visão geral, Plano de ação, Indicadores, Playbooks, Reuniões, Arquivos.
- Linha com `Timeline306090` | card "Processos no projeto" (código + nome + `StatusBadge` de implantação).
- Barra: alternância Quadro/Lista + filtros. `TaskBoard`.
- Na visão Lista: tabela com as mesmas informações e ordenação por prazo.

### 06 · Editor de playbook — `/clientes/[clientId]/documentos/[documentId]` (`06-playbook.html`)
- Conteúdo pode ir até 1320 px.
- Cabeçalho: título, selo de versão/estado, linha de origem ("Gerado sem IA a partir de…; v2 aprovada permanece imutável"). Ações: "Comparar com v2" e **"Aprovar versão"** — desabilitado enquanto houver seção não aprovada, com o motivo escrito embaixo em vermelho (`aria-describedby`).
- Três colunas:
  1. **Seções** (240 px): número + título + linha de estado ("✓ Aprovada · Cliente", "◐ Em revisão", "○ Pendente", "INTERNO" em laranja). Seção atual com contorno navy.
  2. **Editor** (flexível): `DocumentSectionEditor`.
  3. **Painel lateral** (280 px): `ExportPanel`, `QualityChecklist`, `VersionList`.
- Botão "Sugerir com IA" aparece **desabilitado com o motivo** ("IA desativada") enquanto a Fase 5 não estiver pronta ou sem chave configurada.
- Quando a IA estiver ativa (Fase 5), a sugestão aparece como bloco de diferença (antes/depois) com "Aceitar", "Editar" e "Rejeitar", mais a lista de evidências usadas e dados ausentes.

### Telas sem mockup (seguir os mesmos padrões)
- **`/login`:** card branco centralizado (max 400 px) sobre fundo navy; logo; e-mail, senha, botão primário largo; erro em faixa vermelha acima do botão; nada de "esqueci a senha" público no MVP.
- **`/clientes`:** cabeçalho + busca + filtros (segmento, status) + tabela como a da Visão geral, com paginação. Estado vazio com "+ Novo cliente".
- **`/clientes/novo`:** formulário em card único (max 720 px), agrupado em seções (Identificação, Perfil comercial, Contato opcional), React Hook Form + Zod, erros abaixo de cada campo.
- **`/clientes/[clientId]/dados`:** cards de cobertura por tipo de arquivo (clientes, produtos, vendas, orçamentos, interações, custos) com último lote, data, nº de linhas válidas/rejeitadas e botão "Importar".
- **`/clientes/[clientId]/dados/importar`:** assistente em passos numerados no topo (Tipo → Arquivo → Mapeamento → Prévia e validação → Confirmação). Prévia de 20 linhas em tabela com erros destacados por célula e resumo de erros por tipo. Reimportação mostra "x novos · y atualizados · z ignorados (duplicados)".
- **`/biblioteca`:** filtro por área (14 áreas como abas ou lista lateral), busca, cartões/linhas com `ProcessCodeChip` + nome + objetivo; selo "Ficha completa" nos 10 processos detalhados.
- **`/biblioteca/[code]`:** ficha em formato de documento (mesmo estilo do editor, somente leitura) com seções Objetivo, Gatilho, Entradas, Responsáveis, Passos, Abordagem, KPIs, Exceções, Validação e histórico de versões.
- **`…/indicadores`:** tabela de KPIs com colunas Baseline (congelado, com data) · Atual · Variação absoluta · Variação % · Classificação (Observado / Estimado / Meta / Não mensurado) · Fonte; gráfico de linha (Recharts) por KPI com legenda, unidade e fonte abaixo do gráfico; notas de comparabilidade em destaque âmbar.
- **`/clientes/[clientId]/relatorios`:** lista de relatórios por período com estado; relatório aberto usa o mesmo editor do playbook.
- **`/configuracoes`:** abas verticais (Marca, Parâmetros, Fases do método e escala do diagnóstico, Provedor de IA, Usuários, Backups e saúde). Chave de IA nunca exibida — só "Configurada via variável de ambiente ✓".

---

## 6. Rótulos de status (enum → tela)

| Contexto | Enum | Rótulo | Tom |
|---|---|---|---|
| Tarefa | `TODO` / `IN_PROGRESS` / `BLOCKED` / `DONE` | Pendente / Em andamento / Bloqueada / Concluída | neutro / info / bloqueado / sucesso |
| Tarefa vencida | (derivado) | Vencida há N dias | erro |
| Oportunidade | `DETECTED` / `REVIEWED` / `APPROVED` / `DISMISSED` / `LINKED_TO_PROJECT` | Detectada / Revisada / Aprovada / Descartada / Em projeto | neutro / info / sucesso / neutro (riscado) / sucesso |
| Origem do achado | `RULE` / `CONSULTANT` / `AI_SUGGESTION` | Regra / Consultor / Sugestão IA | neutro (chip cinza) |
| Processo no projeto | `PLANNED` / `IN_PROGRESS` / `PILOT` / `ACTIVE` / `VALIDATED` / `SUSTAINED` / `BLOCKED` / `CANCELLED` | Planejado / Em andamento / Piloto / Ativo / Validado / Sustentado / Bloqueado / Cancelado | neutro / info / info / info / sucesso / sucesso / bloqueado / neutro |
| Documento/seção | rascunho / em revisão / aprovado / publicado | Rascunho / Em revisão / Aprovada / Publicada | neutro / info / sucesso / sucesso |
| Visibilidade | `INTERNO` / `CLIENTE` | INTERNO / Cliente | bloqueado / neutro |
| Diagnóstico | rascunho / fechado / revisão | Rascunho / Fechado / Revisão n | neutro / sucesso / info |
| Job | `QUEUED` / `RUNNING` / `COMPLETED` / `FAILED` / `CANCELLED` | Na fila / Em execução x% / Concluído / Falhou — tentar de novo / Cancelado | neutro / info / sucesso / erro / neutro |
| Fase do método | (configuração) | ✓ Concluída / ● Em andamento / ○ Não iniciada | sucesso / navy / neutro |

Ajuste os nomes dos enums ao schema real, mantendo os rótulos.

---

## 7. Formatação de dados

- Use um único módulo `src/lib/format.ts` com `Intl` em `pt-BR` e fuso da empresa (padrão `America/Sao_Paulo`).
- Moeda: `R$ 1.234,56`. Números: `1.234`. Decimais de score: uma casa com vírgula (`2,2`). Percentual: `38%` ou `12,5%`.
- Datas: `dd/mm/aaaa` em tabelas; `dd/mm` em cartões quando o ano é o corrente; data por extenso só no cabeçalho da Visão geral.
- `null` → "Indisponível" (com motivo, quando houver espaço) ou "n/d" em espaços apertados, nunca `0`.
- Valores estimados sempre com o rótulo "Estimativa" ao lado.

---

## 8. Acessibilidade e comportamento

- HTML semântico: `nav` com `aria-label`, `main`, `h1` único por página, `table` para dados tabulares, `button` para ações, `a` para navegação.
- Foco visível em todos os elementos interativos (`ring` navy 2 px com offset).
- Botões desabilitados explicam o motivo por texto visível ligado por `aria-describedby`.
- Grupo de respostas do questionário com `role="group"` e `aria-pressed`; navegável por teclado.
- Feedback de salvamento e de jobs com `role="status"`.
- Tabelas largas dentro de contêiner com `overflow-x: auto`.
- Ações demoradas mostram etapa e progresso; erro sempre com opção de tentar de novo.
- Carregamento: skeletons nos cards e tabelas (não spinners de tela inteira).

---

## 9. Não fazer

- Gradientes, sombras grandes, glassmorphism, ilustrações, emojis como ícone, cards com borda colorida à esquerda.
- Âmbar como cor de texto sobre branco.
- Número fixo/inventado em dashboard, gráfico sem legenda/unidade/fonte, somatório de receita entre clientes.
- Botão visível sem ação real (se a função ainda não existe, não mostre o botão ou mostre desabilitado com o motivo "Disponível na Fase N").
- Enum cru na interface (`IN_PROGRESS`), IDs no lugar de nomes, data em formato americano.
- Modal para fluxos longos (importação, edição de documento): use página própria.

---

## 10. Ordem de implementação da interface (alinhada às fases da especificação)

| Fase | Entregas de interface |
|---|---|
| 0 | Tokens, fonte, shell completo (sidebar, topbar, trilha, gaveta mobile), `/login`, `/dashboard` com estados vazios reais, `StatusBadge`, `MetricCardWithSource`, `EmptyState`, `DemoBadge`, `format.ts` |
| 1 | `/clientes`, `/clientes/novo`, Visão 360° (com o que já existir), `ClientSwitcher`, diagnóstico completo (`AssessmentProgress`, `QuestionCard`, autosave, fechar/revisão) |
| 2 | Biblioteca e ficha, Oportunidades (`PriorityMatrix`, detalhe, tabela), Projeto (abas, `Timeline306090`, `TaskBoard` + lista), `MethodJourney` |
| 3 | Editor de documento (3 colunas), `ExportPanel`, `QualityChecklist`, `VersionList`, comparação de versões |
| 4 | Dados e assistente de importação, `DataQualityBanner`, indicadores reais nos cards da Visão 360° |
| 5 | Estados de IA no editor (sugestão, evidências, dados ausentes, aceitar/rejeitar) e configurações de IA |
| 6 | Tela de indicadores (baseline × atual, gráficos), relatórios |
| 7 | Revisão visual geral, acessibilidade, responsividade em 390 px |

---

## 11. Checklist de aceite visual (por tela)

- [ ] Segue o shell e a hierarquia do mockup correspondente.
- [ ] Todo número tem fonte e período; nulos aparecem como "Indisponível".
- [ ] Todo status tem texto + símbolo, com rótulo pt-BR.
- [ ] Estado vazio, carregando e erro implementados.
- [ ] DEMO sinalizado onde houver dado de seed.
- [ ] Nenhum botão sem ação real.
- [ ] Funciona em 1440 px e em 390 px (menu em gaveta, tabelas com rolagem).
- [ ] Navegável por teclado, foco visível, contraste ≥ 4,5:1.
- [ ] Sem dados de outro cliente na tela (conferir trocando de cliente).
