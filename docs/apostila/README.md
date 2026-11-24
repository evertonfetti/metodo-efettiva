# Apostila de ajuda — Efettiva OS

- **PDF pronto:** `Apostila_Efettiva_OS.pdf` (A4, ~60 páginas).
- Fonte: `build.py` (conteúdo) + `apostila.css` + `render-pdf.mjs`. Imagens em `img/` (capturas do sistema com dados DEMO).

Regerar o PDF após editar o texto em `build.py`:

```bash
mkdir -p /tmp/capturas && cp docs/apostila/img/*.png /tmp/capturas/   # ou uma pasta com capturas novas
SHOTS=/tmp/capturas python3 docs/apostila/build.py                    # gera apostila.html
node docs/apostila/render-pdf.mjs                                     # requer: npx playwright install chromium
```

Para atualizar as capturas: suba um banco descartável (`npm run db:seed:demo`), rode o app e refaça os PNGs (1440 px de largura) com os mesmos nomes de `img/`.

Capturas automáticas: com banco descartável + seed demo + app em outra porta, rode `DATABASE_URL=… BASE=http://localhost:3101 E2E_EMAIL=… E2E_PASSWORD=… OUT=/tmp/capturas npx tsx scripts/e2e/capturas-apostila.ts` e depois `SHOTS=/tmp/capturas python3 docs/apostila/build.py && node docs/apostila/render-pdf.mjs`.
