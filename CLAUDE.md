# Efettiva OS — instruções permanentes de desenvolvimento

## Fonte da verdade

Leia **`ESPECIFICACAO_MESTRA_EFETTIVA_OS.md`** integralmente antes de planejar mudanças. Ela contém requisitos do produto, domínio, dados, APIs, UI, IA, playbooks, resultados, segurança, fases, casos de aceite e catálogo de processos. Consulte **`INICIAR_NO_CLAUDE_CODE.md`** para o prompt inicial e de retomada.

Para **qualquer tela ou componente**, leia **`docs/UI_LAYOUT.md`** e o mockup correspondente em `docs/design/`. Em decisões visuais e de layout, o guia prevalece sobre a seção 10 da especificação. Os mockups são referência de estrutura e hierarquia: reimplemente com React/Tailwind/shadcn, não copie o HTML.

## Produto

Web app **interno da Efettiva Gestão**. Uma instalação atende várias empresas-clientes, todas isoladas por `clientId`. O sistema serve ao consultor para diagnosticar, analisar oportunidades, implantar processos, produzir playbooks/POPs/treinamentos e comprovar resultados.

## Regras fundamentais

1. Implementar software **funcional e persistente**: nenhuma entrega vale se for só interface, protótipo ou dado mock sem sinalização DEMO.
2. Segregar clientes em banco, serviços, jobs, arquivos, IA e exportações. Verificar autorização em todo endpoint e download.
3. Entregar o ciclo sem IA antes do adaptador Anthropic: diagnóstico → oportunidade → projeto → tarefa → playbook editável → DOCX/PDF/MD → relatório.
4. IA gera **rascunhos estruturados e revisáveis**, nunca altera métricas ou publica material automaticamente.
5. Cálculos financeiros são determinísticos, rastreáveis e com fonte/período. Nunca usar dados inventados; `null` quando não houver dados.
6. Toda versão aprovada de documento é imutável; alterações criam nova revisão. Diferenciar arquivo `INTERNO` e `CLIENTE`.
7. Stack de referência: TypeScript, Next.js, PostgreSQL, Prisma, Docker, worker Redis/BullMQ. Manter implementação modular e simples.
8. Seeds: `catalogo_processos_seed.json` (146 processos) e `questionario_diagnostico_seed.json` (96 perguntas). Os 10 processos completos estão no Anexo C da especificação.
9. Não instalar dependências abandonadas sem justificativa e verificação de compatibilidade. Nunca colocar segredo em código/repositório.
10. Testes concisos mas obrigatórios nos riscos críticos: isolamento, idempotência, finanças, revisão/aprovação, exportação e fluxo ponta a ponta.

## Fluxo de execução

- Inspecionar código e ler `docs/IMPLEMENTATION_STATUS.md` (criá-lo se ausente).
- Seguir fases 0–7 da especificação, sem antecipar módulos secundários em detrimento do caminho central.
- Em cada fase: migrations + domínio + endpoints + UI + validação + testes + documentação de execução.
- Rodar build, lint e os testes críticos; corrigir falhas antes de marcar `DONE`.
- Atualizar `docs/IMPLEMENTATION_STATUS.md` com `DONE`, `PARTIAL` ou `BLOCKED` e evidência verificável; registrar decisões em `docs/DECISIONS.md`.
- Se interrompido, deixar orientação exata de continuação. Nunca afirmar que terminou o que não foi implementado e testado.

## UX

Interface pt-BR, visual sóbrio Efettiva: azul-marinho `#0B2545`, âmbar `#D9A441` (só destaque, nunca texto sobre branco), branco, fonte Manrope. Desktop primeiro, responsiva, acessível, com filtros, estados vazios e origem dos indicadores. Tokens, shell, componentes, telas, rótulos de status e checklist de aceite visual: `docs/UI_LAYOUT.md`.
