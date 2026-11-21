# Como iniciar o desenvolvimento do Efettiva OS no Claude Code

## Arquivos deste pacote

- **`ESPECIFICACAO_MESTRA_EFETTIVA_OS.md`** — documento fonte de requisitos: produto, regras, dados, telas, endpoints, IA, geração de playbooks, relatórios, fases e critérios de aceite.
- **`catalogo_processos_seed.json`** — 146 processos para importação como seed.
- **`questionario_diagnostico_seed.json`** — 96 perguntas de diagnóstico distribuídas em 12 dimensões.
- **`docs/UI_LAYOUT.md`** — guia de layout: tokens, shell, componentes, telas e checklist visual.
- **`docs/design/`** — mockups HTML das 6 telas principais (referência visual).
- **`INICIAR_NO_CLAUDE_CODE.md`** — este arquivo de instruções.

## Como usar

1. Crie uma pasta vazia chamada `efettiva-os`, coloque nela os arquivos deste pacote e abra essa pasta no Claude Code.
2. Envie a instrução abaixo no Claude Code. O agente deve ler a especificação completa, montar o repositório e codificar em fases.
3. Após cada fase, valide a aplicação rodando de verdade. Peça correção de qualquer botão visual sem funcionalidade real, dado fictício em dashboards ou etapa marcada como concluída sem evidência.
4. Mantenha o arquivo `docs/IMPLEMENTATION_STATUS.md` atualizado para continuar depois sem perder progresso.

## Prompt inicial para copiar e colar

```text
Quero que você desenvolva o EFETTIVA OS neste repositório, um sistema web privado de uso interno da Efettiva Gestão.

LEIA INTEGRALMENTE antes de programar:
- ESPECIFICACAO_MESTRA_EFETTIVA_OS.md (fonte principal da verdade)
- docs/UI_LAYOUT.md (guia de layout; prevalece em decisões visuais) e os mockups em docs/design/
- catalogo_processos_seed.json
- questionario_diagnostico_seed.json

A especificação exige uma instalação para várias empresas-clientes isoladas, diagnóstico 360°, análise de dados, oportunidades, biblioteca de 146 processos, projetos de implantação, indicadores, playbooks personalizados e relatórios, com IA supervisionada posteriormente.

Regras:
1. Não faça apenas planejamento, wireframe ou MVP fake. Desenvolva software executável e persistente, por fases.
2. Comece pela Fase 0 e conclua cada etapa com interface, backend, banco, segurança e testes essenciais; depois avance.
3. Use stack e arquitetura da especificação, preferindo simplicidade e compatibilidade com Docker/Linux/EasyPanel.
4. A geração de playbooks deve funcionar sem IA primeiro, com editor, versões e exportação DOCX/PDF/MD; a integração Anthropic vem depois.
5. Toda métrica é calculada de forma determinística e com fonte. IA não pode inventar números ou modificar dados aprovados.
6. Garanta segregação de empresas por clientId em banco, jobs, arquivos, exportações e IA.
7. Crie docs/IMPLEMENTATION_STATUS.md com DONE/PARTIAL/BLOCKED e evidências reais. Documente comandos de instalação, execução, migrations e backup.
8. Importe seeds dos arquivos JSON sem duplicar códigos.
9. Não substitua funcionalidades por telas com dados de demonstração sem indicação explícita DEMO.
10. Faça verificações lint/build/testes críticos ao final de cada etapa e corrija problemas encontrados.

PRIMEIRA AÇÃO: inspecione o diretório, identifique dependências e implemente integralmente a Fase 0 (fundação, login, persistência, banco, Docker, layout e base segura). Continue com as fases seguintes conforme a execução permitir, reportando somente o que funciona de fato.
```

## Prompt para retomar em uma sessão futura

```text
Leia ESPECIFICACAO_MESTRA_EFETTIVA_OS.md e docs/IMPLEMENTATION_STATUS.md.
Confira o código e os testes existentes. Retome do primeiro item PARTIAL/BLOCKED
ou da próxima fase ainda não iniciada, sem refazer partes concluídas e sem
inventar status. Entregue funcionalidades reais, valide com build/testes e
atualize o status com evidências.
```

## Observações

- O projeto deve preservar histórico de mudanças e executar migrações do banco de forma segura.
- Não forneça credenciais reais, chaves Anthropic, dados comerciais de clientes ou senhas no prompt ou no repositório.
- Se o repositório já tiver código, o Claude Code deve examiná-lo antes de alterar arquitetura ou apagar arquivos.
