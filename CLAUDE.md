# CLAUDE.md — Contexto do projeto (dash-marcelo)

> Este arquivo é lido automaticamente pelo Claude Code ao abrir o repositório.
> Ele carrega TODO o contexto necessário para continuar o trabalho sem depender
> de mensagens anteriores. Mantenha-o atualizado.

## O que é

Dashboard de **Captura de Leads (BTBExp)** — um app de BI estático (HTML/CSS/JS
puro + Chart.js via CDN) publicado no **GitHub Pages**, que cruza a lista de
**Leads** com o gerenciador **Meta Ads** e se atualiza sozinho a cada ~30 min
(build 100% na nuvem via GitHub Actions, disparado externamente pelo cron-job.org).

- **URL pública:** https://eduardomezzavilla.github.io/dash-marcelo/
- **Somente leitura** das planilhas. Nunca escrever de volta.

## Fontes de dados (Google Sheets — "BTBExp | Planilha Central")

Spreadsheet ID: `1_lj4IlJyylkC1MyW12ujCR7lpg90VOqzIbxO1XSvxXQ` (público — leitura via export CSV).

| Aba | gid | Colunas usadas |
|-----|-----|----------------|
| **Leads** | `2135966057` | A id · B created_time · D ad_name · F adset_name · H campaign_name · K is_organic · L platform(ig/fb) · M profissão · **N faturamento** · O full_name · P email · Q phone |
| **Meta Ads** | `1245628405` | A Day · B Campaign Name · C Ad Set Name · D Ad Name · E Amount Spent · F Impressions · G Link Clicks · H Leads |

URL de export CSV: `https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>`

### Regra de Lead Qualificado (MQL)
Faturamento médio mensal **≥ 30 mil** (coluna **N** da aba Leads). Faixas que
qualificam: `entre_30_e_50_mil`, `entre_50_e_100_mil`, `mais_de_100_mil`.
`entre_20_e_30_mil` **não** qualifica. (Lógica em `build.py` → `is_qualified`.)

### Imposto Meta Ads
Toggle ON aplica **×1,13806** (+13,806%) sobre custos do Meta (Gasto, CPL, CPC,
CPM, CPMQL, CAC…). Constante `TAX_FACTOR` em `build.py` e `TAX` no template.

### Convenções de campanha (do cliente)
- `E2-CAP` = campanhas de Captura (esta dashboard). `E6-VEN` = Vendas.
- Field mapping Meta: Campaign Name = utm_campaign · Ad Set Name = utm_medium · Ad Name = utm_content.

## Arquitetura / arquivos

```
build/build.py            # lê os 2 CSVs (read-only), emite REGISTROS BRUTOS (leads[]/meta[]); render() COSTURA os 4 arquivos abaixo
build/template.html       # esqueleto HTML. Placeholders __STYLES__, __APP_JS__, __DATA_JSON__, __BUILD_ID__, __GENERATED_BRT__
build/identidade-visual.css  # TODAS as cores (tema claro=padrão / escuro). Mexa AQUI p/ trocar só cor
build/estilos.css         # layout/componentes (sidebar, topbar, period-picker, funil, tabelas, gráficos)
build/app.js              # lógica + renderização (KPIs, funil, tabelas, filtro cruzado, period-picker, heatmap)
.github/workflows/deploy.yml  # roda build.py e publica no Pages (workflow_dispatch + schedule + push)
dist/index.html           # saída gerada (gitignored; o Actions reconstrói)
GUIA-REPLICACAO.md        # como replicar este modelo para outros relatórios
SETUP-CRON.md             # valores exatos do cron-job.org
```

> **Layout modular (repaginação inspirada no dash da Larissa/Código da Rainha):** o front-end
> foi separado em `identidade-visual.css` + `estilos.css` + `app.js`, costurados por `render()`
> nos placeholders `__STYLES__`/`__APP_JS__`. Página 1 usa **funil vertical de leads** (Gasto →
> Impressões → Cliques → Leads → MQLs → Vendas/Faturamento "-") + KPIs secundários. Topbar tem
> **seletor de período em calendário** (period-picker) no lugar dos chips. **Heatmap** das tabelas
> diárias = cor FIXA por métrica (só opacidade varia): **Gasto=vermelho · Leads=azul · MQLs=verde**
> (`--heat-gasto/leads/mqls`), aplicado só nessas 3 colunas. A estrutura de dados e os nomes das
> métricas do Marcelo foram **preservados** — só o layout/visual mudou.

O `build.py` **não agrega**: exporta as linhas cruas e TODA a lógica (filtros de
data, filtro cruzado, KPIs, tabelas, gráficos, heatmap, imposto) roda no navegador.
Isso permite interatividade total sem servidor.

## Rodar/testar local

```bash
python build/build.py --leads-file leads.csv --meta-file meta.csv --out dist/index.html
# (o sandbox do agente NÃO alcança docs.google.com; use CSVs locais para testar.
#  O runner do GitHub Actions tem internet e busca os CSVs ao vivo.)
```
Para conferir o visual sem depender do CDN: baixe `chart.js@4.4.1` do npm, troque a
`<script src=...>` por um caminho local e rode um screenshot com o Chromium headless
em `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`.

## Especificação funcional (resumo das regras do cliente)

Duas **páginas separadas** (sidebar, sem rolar entre elas):
1. **Visão Geral de Leads** — **funil vertical** (Gasto → Impressões → Cliques → Leads →
   MQLs → Vendas/Faturamento = "-", com CPM/CTR/CPC/CPL/ConvForm/Tx‑MQL/CPMQL inline) +
   **KPIs secundários** (Leads/MQLs Ads, Tx‑MQL Ads, Impressões, Cliques, CPM, Leads s/UTM,
   % Eficácia, Orgânicos, Org:Ads); gráfico combinado diário colado à **tabela diária com
   heatmap (todos os leads)**; barras por origem/faixa/plataforma/profissão.
2. **Captura Meta Ads** — funil em etapas; combinado diário; barras por utm_content;
   **tabela diária com heatmap (só Meta)**; **3 tabelas hierárquicas** Campanha →
   Conjunto → Anúncio, cada uma com **gráfico de linha colado embaixo**.

**Ordem das colunas nas tabelas de heatmap/hierarquia:**
`Data · Dia · Gasto · CPM · CTR · ConvForm(=Leads/Cliques) · Leads · CPL · Tx‑MQL · MQLs · CPMQL`
(nas hierárquicas a 1ª coluna é a dimensão em vez de Data/Dia).

**Regras obrigatórias das tabelas** (ver `GUIA-REPLICACAO.md`): cabeçalho sticky;
ordenação tri‑state (asc→desc→reset); colunas redimensionáveis (persist localStorage);
linha "Total Geral" fixa; dimensão nunca truncada (400/250/600px, wrap, ≥11px);
seleção com toggle + **Ctrl multi (Set/OR)**; **filtro cruzado bidirecional** com
âncora Anúncio>Conjunto>Campanha, reconstruindo tudo da fonte filtrada; tabela diária
com **último dia no topo**. **Heatmap de cor fixa por métrica** (só a opacidade varia,
maior valor = mais vibrante), aplicado apenas em **Gasto (vermelho) · Leads (azul) ·
MQLs (verde)** — cores em `--heat-gasto/leads/mqls`. As demais colunas ficam sem heatmap.

## Lacunas de dados (aguardando o cliente)
- **Vendas, Faturamento, ROAS, CAC** → precisam da aba **Lista de Compradores** (gid a informar), com utm_source/produto.
- **Page Views, CR, CPV, ConvLP** → precisam de uma fonte de page views.
- **Página Google Ads** → não há dados de Google nas 2 abas atuais.
Enquanto não vierem, essas métricas aparecem como "-".

## Publicação — como resolver os problemas conhecidos

1. **Push:** a integração GitHub da sessão é somente‑leitura (git push e as MCP tools
   dão 403 "Resource not accessible by integration"). O caminho que funciona é `git push`
   direto para `github.com` usando o **PAT do usuário** (o proxy permite o túnel git bruto;
   a API REST do Actions/Pages é bloqueada). Nunca gravar o token no `.git/config`
   (usar URL efêmera `https://x-access-token:<TOKEN>@github.com/...`).
2. **cron-job.org só funciona na `main`:** `workflow_dispatch` só existe quando o
   workflow está na branch padrão. Levar `build/` + `.github/workflows/deploy.yml` para
   a `main` para ativar.
3. **Pages liga sozinho:** `actions/configure-pages@v5` com `enablement: true` habilita
   o Pages na 1ª execução (precisa `permissions: pages: write, id-token: write`).
4. **Proxy do sandbox:** o ambiente do agente NÃO alcança `docs.google.com`,
   `*.github.io` nem a API REST de Actions/Pages — mas o runner do GitHub Actions
   alcança tudo. Testar dados via CSV local; confiar no Actions para o resto.
5. **Token exposto:** se um PAT foi colado no chat, avisar para **revogar e gerar um novo**
   (fine‑grained, só Actions: read/write neste repo).

## Branch / git
- Desenvolver em `claude/leads-dashboard-github-pages-p78f56`; manter sincronizada com `main`.
- Commits com autor `Claude <noreply@anthropic.com>` (avisos "Unverified" do hook são só
  ausência de assinatura GPG — cosméticos, ignoráveis).
