# Dashboard de Captura de Leads · BTBExp

Dashboard **100% na nuvem** que cruza a lista de **Leads** com o investimento de
**Meta Ads**, calcula os **Leads Qualificados** e é publicada no **GitHub Pages**.
Reconstrói sozinha a cada ~30 min, disparada pelo **cron-job.org** — sem depender
de nenhum PC ligado.

**URL pública:** https://metrics-odr.github.io/dash-marcelo/

---

## O que ela mostra

- **KPIs**: Gasto Total, Leads Totais, CPL, **MQLs (≥ 30k)**, CPMQL, Tx-MQL, Impressões, Cliques, CTR, CPC, CPM.
- **Evolução diária**: gasto/dia, leads × MQLs/dia, CPL × CPMQL/dia.
- **Qualificação & origem**: leads por faixa de faturamento (qualificado destacado), por origem (Meta vs. orgânico), por profissão e por plataforma.
- **Cruzamento por campanha**: gasto (Meta) × leads/MQLs (lista) → CPL, CPMQL e Tx-MQL calculados.
- **Tabela de leads qualificados** (e-mail e telefone **mascarados**, pois a página é pública).
- **Toggle de imposto Meta ×1,1385** e **modo claro/escuro**.

## Critério de Lead Qualificado (MQL)

Faturamento médio mensal **≥ 30 mil** (coluna **N** da lista de leads —
`qual_seu_faturamento_médio_mensal?`). Faixas que qualificam: `entre_30_e_50_mil`,
`entre_50_e_100_mil`, `mais_de_100_mil`. A faixa `entre_20_e_30_mil` **não** qualifica.

## Fontes de dados (somente leitura)

Planilha central `BTBExp | Planilha Central`
(`1_lj4IlJyylkC1MyW12ujCR7lpg90VOqzIbxO1XSvxXQ`):

| Aba | gid | Uso |
|-----|-----|-----|
| Leads | `2135966057` | leads reais + coluna N (qualificação) |
| Meta Ads | `1245628405` | gasto, impressões, cliques |

O build lê essas abas via **export CSV público** (`.../export?format=csv&gid=...`).
**Nada é escrito de volta** nas planilhas.

---

## Arquitetura

```
cron-job.org  ──(POST workflow_dispatch a cada 30 min)──▶  GitHub Actions
                                                              │
                          build/build.py  lê os 2 CSVs ◀──────┘
                                 │  cruza dados + calcula MQLs
                                 ▼
                          dist/index.html  ──▶  deploy  ──▶  GitHub Pages (URL pública)
```

- `build/build.py` — baixa os CSVs, cruza os dados, gera `dist/index.html`.
- `build/template.html` — layout/gráficos/tema (Chart.js via CDN).
- `.github/workflows/deploy.yml` — roda o build e publica no Pages.

**Cache-bust:** a página usa `Cache-Control: no-cache`, mostra o horário do último
build, tem botão **Atualizar** e se recarrega sozinha (`?t=timestamp`) ~30 min após
aberta — sempre pegando a versão mais nova.

## Rodar localmente (opcional)

```bash
python build/build.py --out dist/index.html            # busca os CSVs ao vivo
# ou, com arquivos locais para teste:
python build/build.py --leads-file leads.csv --meta-file meta.csv --out dist/index.html
```

---

## Ativação (uma vez) e cron-job.org

O disparo por `workflow_dispatch` só funciona quando o workflow está na branch
**`main`**. Veja **`SETUP-CRON.md`** para o passo a passo e os valores exatos
(URL, headers e body) a colar no cron-job.org.

> ⚠️ **Segurança:** o token do GitHub foi compartilhado em texto puro no chat.
> **Gere um token novo** (de preferência *fine-grained*, só com **Actions: read/write**
> neste repositório) e use-o no cron-job.org. Nunca comite o token no repositório.
