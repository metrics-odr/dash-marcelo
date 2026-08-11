#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Auxiliar da aba RELATÓRIO — calcula as MÉTRICAS por período do funil de
evento presencial High Ticket (Impressões -> Cliques -> Leads -> MQLs ->
Check-ins -> Presenças -> Vendas -> Faturamento).

Uso pela rotina diária que regenera os briefings do Gestor: este script NÃO
escreve texto e NÃO chama nenhuma IA/API. Ele só faz a matemática (fonte
única de verdade, reaproveitando build.process) e emite um JSON com os
números de cada período. A rotina (Claude Code, via assinatura — sem
consumir créditos da API) lê esses números + build/GUIA-RELATORIOS.md e
redige os 9 briefings em build/relatorios.json.

Check-ins/Presenças/Vendas/Faturamento ainda não têm fonte de dados (aguardam
a lista do comercial/evento) — aparecem como null/0 até essa aba chegar; o
resto do funil (Gasto..MQLs) já é real.

Entradas (opcional; sem elas busca ao vivo via CSV público do Google Sheets):
    --leads-file leads.csv --meta-file meta.csv

Saída:
    --out relatorios_metrics.json   (default: build/relatorios_metrics.json)
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

# Reaproveita TODA a lógica de leitura/qualificação do build (mesma fonte de verdade)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build  # noqa: E402

BRT = timezone(timedelta(hours=-3))


# --------------------------------------------------------------------------- #
# Métricas (mesma matemática do app.js: derive/salesOf/adQuality)
# --------------------------------------------------------------------------- #
def new_bucket() -> dict:
    return dict(sp=0.0, im=0.0, cl=0.0, leads=0, mqls=0, checkins=0, presencas=0, vendas=0, fat=0.0)


def add_meta(a: dict, m: dict) -> None:
    a["sp"] += m["sp"]
    a["im"] += m["im"]
    a["cl"] += m["cl"]


def add_lead(a: dict, l: dict) -> None:
    a["leads"] += 1
    a["mqls"] += l["q"]


def sd(n, d):
    return (n / d) if d else None


def derive(a: dict, tax: float) -> dict:
    """Espelha derive()+salesOf() de app.js. checkins/presencas/vendas/fat=0
    hoje (sem fonte) -> as taxas/custos dependentes ficam None ("-")."""
    g = a["sp"] * tax
    mqls, checkins, presencas, vendas, fat = a["mqls"], a["checkins"], a["presencas"], a["vendas"], a["fat"]
    hasCk, hasPr, hasVd = checkins > 0, presencas > 0, (vendas > 0 or fat > 0)
    return dict(
        gasto=g, impr=a["im"], cliques=a["cl"], leads=a["leads"], mqls=mqls,
        cpm=sd(g * 1000, a["im"]), ctr=sd(a["cl"], a["im"]), cpc=sd(g, a["cl"]),
        convf=sd(a["leads"], a["cl"]), cpl=sd(g, a["leads"]),
        txmql=sd(mqls, a["leads"]), cpmql=sd(g, mqls),
        checkins=(checkins if hasCk else None), txcheckin=(sd(checkins, mqls) if hasCk else None),
        cpcin=(sd(g, checkins) if hasCk else None),
        presencas=(presencas if hasPr else None), txpres=(sd(presencas, checkins) if hasPr else None),
        cpp=(sd(g, presencas) if hasPr else None),
        vendas=(vendas if hasVd else None), txvenda=(sd(vendas, presencas) if (hasVd and hasPr) else None),
        fat=(fat if hasVd else None), cac=(sd(g, vendas) if (hasVd and vendas) else None),
        roas=(sd(fat, g) if (hasVd and g) else None), ticket=(sd(fat, vendas) if (hasVd and vendas) else None),
    )


def in_range(d, a, b) -> bool:
    return bool(d) and a <= d <= b


def presets(today: str, dmin: str, dmax: str) -> dict:
    def addd(s, n):
        return (date.fromisoformat(s) + timedelta(days=n)).isoformat()

    def month_first(s):
        return s[:8] + "01"

    y, m, _ = today.split("-")
    y, m = int(y), int(m)
    last_day_prev = date(y, m, 1) - timedelta(days=1)
    first_prev = last_day_prev.replace(day=1)
    return {
        "hoje": (today, today),
        "ontem": (addd(today, -1), addd(today, -1)),
        "3d": (addd(today, -2), today),
        "7d": (addd(today, -6), today),
        "14d": (addd(today, -13), today),
        "30d": (addd(today, -29), today),
        "mes": (month_first(today), today),
        "mespass": (first_prev.isoformat(), last_day_prev.isoformat()),
        "todo": (dmin, dmax),
    }


def totals(leads, meta, a, b):
    bk = new_bucket()
    for m in meta:
        if in_range(m["d"], a, b):
            add_meta(bk, m)
    for l in leads:
        if in_range(l["d"], a, b):
            add_lead(bk, l)
    return bk


def by_dim(leads, meta, a, b, dim):
    mp = {}
    for m in meta:
        if in_range(m["d"], a, b):
            mp.setdefault(m[dim], new_bucket())
            add_meta(mp[m[dim]], m)
    for l in leads:
        if in_range(l["d"], a, b):
            mp.setdefault(l[dim], new_bucket())
            add_lead(mp[l[dim]], l)
    return mp


def by_ad_full(leads, meta, a, b):
    # Agrupa por (campanha, conjunto, anúncio) — não só pelo nome do anúncio.
    # O mesmo nome de anúncio pode se repetir em campanhas diferentes; agregar
    # só por "ad" misturaria estruturas distintas sob o mesmo rótulo.
    mp = {}
    for m in meta:
        if in_range(m["d"], a, b):
            key = (m["camp"], m["adset"], m["ad"])
            mp.setdefault(key, new_bucket())
            add_meta(mp[key], m)
    for l in leads:
        if in_range(l["d"], a, b):
            key = (l["camp"], l["adset"], l["ad"])
            mp.setdefault(key, new_bucket())
            add_lead(mp[key], l)
    return mp


def r(v, p=4):
    return None if v is None else round(v, p)


def pack(d):
    money = ("gasto", "cpm", "cpc", "cpl", "cpmql", "cpcin", "cpp", "cac", "fat", "ticket")
    return {k: r(v, 2 if k in money else 4) for k, v in d.items()}


# --------------------------------------------------------------------------- #
# Formatação (bloco WhatsApp) — mesma convenção do dash-luana-fse
# --------------------------------------------------------------------------- #
def money(v):
    if v is None:
        return "—"
    return f"R$ {v:,.2f}".replace(",", "#").replace(".", ",").replace("#", ".")


def pct(v):
    if v is None:
        return "—"
    return f"{v * 100:.1f}%".replace(".", ",")


def num(v):
    if v is None:
        return "—"
    return f"{v:,.0f}".replace(",", ".")


def meta_status(nome, valor):
    return "meta não definida" if valor is None else f"meta {nome} = {money(valor)}"


# --------------------------------------------------------------------------- #
# Período de comparação por janela (mesma regra do dash-luana-fse: cada uma
# das 9 janelas usa o "período anterior equivalente" certo; "todo" nunca
# inventa um período anterior).
# --------------------------------------------------------------------------- #
def month_bounds(any_day: date, offset_months: int = 0):
    y, m = any_day.year, any_day.month
    m += offset_months
    while m < 1:
        m += 12
        y -= 1
    while m > 12:
        m -= 12
        y += 1
    first = date(y, m, 1)
    if m == 12:
        last = date(y, 12, 31)
    else:
        last = date(y, m + 1, 1) - timedelta(days=1)
    return first, last


def shift_back(a_iso: str, b_iso: str, n: int = 1):
    a, b = date.fromisoformat(a_iso), date.fromisoformat(b_iso)
    span = (b - a).days + 1
    new_b = a - timedelta(days=1 + span * (n - 1))
    new_a = new_b - timedelta(days=span - 1)
    return new_a.isoformat(), new_b.isoformat()


def previous_period(key: str, a_iso: str, b_iso: str, today_iso: str, dmin_iso, dmax_iso):
    today = date.fromisoformat(today_iso)
    if key in ("hoje", "ontem", "3d", "7d", "14d", "30d"):
        pa, pb = shift_back(a_iso, b_iso, 1)
        return pa, pb, "período imediatamente anterior, mesma duração"

    if key == "mes":
        a, b = date.fromisoformat(a_iso), date.fromisoformat(b_iso)
        n_dias = (b - a).days + 1
        prev_first, prev_last = month_bounds(today, -1)
        pb = min(prev_first + timedelta(days=n_dias - 1), prev_last)
        return prev_first.isoformat(), pb.isoformat(), f"mesmo intervalo de dias (1–{n_dias}) do mês anterior"

    if key == "mespass":
        pa, pb = month_bounds(today, -2)
        return pa.isoformat(), pb.isoformat(), "mês retrasado completo"

    if key == "todo":
        dmin = date.fromisoformat(dmin_iso) if dmin_iso else date.fromisoformat(a_iso)
        dmax = date.fromisoformat(dmax_iso) if dmax_iso else date.fromisoformat(b_iso)
        total_days = (dmax - dmin).days + 1
        if total_days < 14:
            return None, None, "histórico curto demais para dividir — usado só como benchmark, sem variação forçada"
        mid = dmin + timedelta(days=total_days // 2)
        return dmin.isoformat(), (mid - timedelta(days=1)).isoformat(), "metade mais antiga do histórico vs. metade mais recente"

    pa, pb = shift_back(a_iso, b_iso, 1)
    return pa, pb, "período imediatamente anterior, mesma duração"


RATE_METRICS = {"ctr", "convf", "txmql"}
MATERIAL_PCT = 0.10
MATERIAL_PP = 0.03
_HIGHER_IS_BETTER_FALSE = {"gasto", "cpm", "cpc", "cpl", "cpmql", "cpcin", "cpp", "cac"}


def compare(cur: dict, prev: dict | None) -> dict:
    """Compara duas agregações `derive()` métrica a métrica (só o núcleo do
    funil que já tem dado real: gasto..cpmql). Só marca `material=True` quando
    a variação passa os limiares mínimos — evita listar oscilação irrelevante."""
    metrics = ["gasto", "impr", "cliques", "leads", "mqls", "cpm", "ctr", "cpc", "cpl", "convf", "txmql", "cpmql"]
    out = {}
    for m in metrics:
        cv, pv = cur.get(m), (prev or {}).get(m)
        row = {"atual": cv, "anterior": pv, "delta_abs": None, "delta_pct": None,
               "delta_pp": None, "direcao": "sem_dado", "material": False}
        if cv is not None and pv is not None:
            row["delta_abs"] = round(cv - pv, 4)
            row["delta_pct"] = round((cv - pv) / pv, 4) if pv else None
            if m in RATE_METRICS:
                row["delta_pp"] = round((cv - pv) * 100, 2)
            higher_is_better = m not in _HIGHER_IS_BETTER_FALSE
            if abs(cv - pv) < 1e-9:
                row["direcao"] = "estavel"
            else:
                row["direcao"] = "melhorou" if ((cv > pv) == higher_is_better) else "piorou"
            if m in RATE_METRICS:
                row["material"] = row["delta_pp"] is not None and abs(row["delta_pp"]) >= MATERIAL_PP * 100
            else:
                row["material"] = row["delta_pct"] is not None and abs(row["delta_pct"]) >= MATERIAL_PCT
        elif cv is not None and pv is None:
            row["direcao"] = "sem_periodo_anterior"
        out[m] = row
    return out


# --------------------------------------------------------------------------- #
# Nota de saúde do funil (0–10) — mesma metodologia do dash-luana-fse,
# adaptada aos nomes de campo deste funil (checkins/presenças/vendas).
# --------------------------------------------------------------------------- #
def _clamp(v, lo=0.0, hi=10.0):
    return max(lo, min(hi, v))


def _classificacao(nota):
    if nota >= 8.0:
        return "Excelente"
    if nota >= 6.5:
        return "Saudável, com atenção"
    if nota >= 5.0:
        return "Atenção"
    if nota >= 3.0:
        return "Crítico"
    return "Crítico grave"


def funnel_health(cur: dict, baseline: dict, meta_cpmql, meta_cac, volume_min: int, sample_windows: list[dict]) -> dict:
    sub = {}

    if cur.get("cpm") is not None and baseline.get("cpm") and cur.get("ctr") is not None and baseline.get("ctr"):
        cpm_var = (cur["cpm"] - baseline["cpm"]) / baseline["cpm"]
        ctr_var = (cur["ctr"] - baseline["ctr"]) / baseline["ctr"]
        sub["aquisicao"] = round(_clamp(10 - cpm_var * 10 + ctr_var * 5), 1)
    else:
        sub["aquisicao"] = None

    sub["conversao_pagina"] = None  # sem fonte de Page Views/ConvLP conectada

    if cur.get("cpmql") is not None:
        ref = meta_cpmql if meta_cpmql is not None else baseline.get("cpmql")
        sub["qualificacao"] = round(_clamp(10 - (cur["cpmql"] - ref) / ref * 10), 1) if ref else None
    else:
        sub["qualificacao"] = None

    # Vendas: só calculável quando check-in/presença/venda já tiverem dado real.
    if cur.get("cac") is not None and meta_cac:
        cac_var = (cur["cac"] - meta_cac) / meta_cac
        sub["vendas"] = round(_clamp(10 - cac_var * 10), 1)
    else:
        sub["vendas"] = None

    txmqls = [w["txmql"] for w in sample_windows if w.get("txmql") is not None]
    if len(txmqls) >= 2 and max(txmqls) > 0:
        spread = (max(txmqls) - min(txmqls)) / max(txmqls)
        sub["consistencia"] = round(_clamp(10 - spread * 10), 1)
    else:
        sub["consistencia"] = None

    mqls = cur.get("mqls") or 0
    sub["confiabilidade_dados"] = round(_clamp(10 * mqls / volume_min if volume_min else 10), 1)

    disponiveis = {k: v for k, v in sub.items() if v is not None}
    if not disponiveis:
        return {"nota": None, "provisoria": True, "classificacao": "Sem dado suficiente",
                "motivo": "Nenhuma subnota pôde ser calculada neste período.", "subnotas": sub}

    nota = round(sum(disponiveis.values()) / len(disponiveis), 1)
    faltantes = [k for k, v in sub.items() if v is None]
    provisoria = bool(faltantes)
    motivo = ("Nota provisória: sem dados suficientes para " + ", ".join(faltantes) + "." if provisoria else "")
    return {"nota": nota, "provisoria": provisoria, "classificacao": _classificacao(nota),
            "motivo": motivo, "subnotas": sub}


def consolidado_criativos(ads: list[dict]) -> list[dict]:
    """Agrupa as ocorrências (campanha+conjunto+anúncio) pelo NOME do anúncio
    — visão consolidada do criativo (o mesmo criativo pode rodar em várias
    estruturas com resultados diferentes)."""
    by_ad: dict[str, list[dict]] = {}
    for row in ads:
        by_ad.setdefault(row["nome"], []).append(row)

    out = []
    for nome, occs in by_ad.items():
        gasto = sum(o["gasto"] for o in occs)
        leads = sum(o["leads"] for o in occs)
        mqls = sum(o["mqls"] for o in occs)
        cliques = sum(o["cliques"] for o in occs)
        impr = sum(o["impr"] for o in occs)
        occs_com_mql = [o for o in occs if o["mqls"]]
        melhor = min(occs_com_mql, key=lambda o: o["cpmql"]) if occs_com_mql else None
        pior = max(occs_com_mql, key=lambda o: o["cpmql"]) if occs_com_mql else None
        out.append({
            "anuncio": nome, "n_estruturas": len(occs),
            "estruturas": [{"campanha": o["campanha"], "conjunto": o["conjunto"]} for o in occs],
            "gasto": round(gasto, 2), "impr": impr, "cliques": cliques, "leads": leads, "mqls": mqls,
            "cpmql": round(gasto / mqls, 2) if mqls else None,
            "txmql": round(mqls / leads, 4) if leads else None,
            "melhor_estrutura": ({"campanha": melhor["campanha"], "conjunto": melhor["conjunto"], "cpmql": melhor["cpmql"]} if melhor else None),
            "pior_estrutura": ({"campanha": pior["campanha"], "conjunto": pior["conjunto"], "cpmql": pior["cpmql"]} if pior and pior is not melhor else None),
        })
    out.sort(key=lambda x: -x["gasto"])
    return out


def whatsapp_numeros(label: str, a_iso: str, b_iso: str, cur: dict, saude: dict) -> dict:
    de = date.fromisoformat(a_iso).strftime("%d/%m/%Y")
    ate = date.fromisoformat(b_iso).strftime("%d/%m/%Y")
    return {
        "periodo_label": label, "periodo_range": f"{de} a {ate}",
        "gasto": money(cur["gasto"]), "cpm": money(cur["cpm"]), "ctr": pct(cur["ctr"]),
        "connect_rate": "Não disponível", "conv_lp": "Não disponível",
        "leads": num(cur["leads"]), "cpl": money(cur["cpl"]),
        "mqls": num(cur["mqls"]), "cpa_cpmql": money(cur["cpmql"]),
        "vendas": num(cur["vendas"]) if cur.get("vendas") is not None else "Não disponível",
        "faturamento": money(cur["fat"]) if cur.get("fat") is not None else "Não disponível",
        "cac": money(cur["cac"]) if cur.get("cac") is not None else "Não disponível",
        "roas": (f"{cur['roas']:.2f}x".replace(".", ",") if cur.get("roas") is not None else "Não disponível"),
        "ticket_medio": money(cur["ticket"]) if cur.get("ticket") is not None else "Não disponível",
        "saude_funil": (
            f"{saude['nota']:.1f}/10 — {saude['classificacao']}" + (" (provisória)" if saude["provisoria"] else "")
            if saude["nota"] is not None else "Nota provisória — dados insuficientes"
        ),
    }


def ad_quality(d):
    """Espelha adQuality()/cmpBest() de app.js: resultado mais profundo
    disponível (Venda>Presença>Check-in>MQL>Leads), depois volume, depois custo."""
    if d["vendas"] is not None:
        return (4, d["vendas"], d["cac"] if d["cac"] is not None else float("inf"))
    if d["presencas"] is not None:
        return (3, d["presencas"], d["cpp"] if d["cpp"] is not None else float("inf"))
    if d["checkins"] is not None:
        return (2, d["checkins"], d["cpcin"] if d["cpcin"] is not None else float("inf"))
    if d["mqls"] > 0:
        return (1, d["mqls"], d["cpmql"] if d["cpmql"] is not None else float("inf"))
    return (0, d["leads"], d["cpl"] if d["cpl"] is not None else float("inf"))


def period_metrics(leads, meta, a, b, tax, sample_min_spend, sample_min_mqls, top_n,
                    label, today_iso, dmin_iso, dmax_iso, key, meta_cpmql, meta_cac, volume_min):
    dT = derive(totals(leads, meta, a, b), tax)

    camps = []
    for name, bk in sorted(by_dim(leads, meta, a, b, "camp").items(), key=lambda kv: -kv[1]["sp"]):
        camps.append({"nome": name, **pack(derive(bk, tax))})

    ads = []
    for (camp, adset, name), bk in by_ad_full(leads, meta, a, b).items():
        if bk["sp"] <= 0:
            continue
        d = derive(bk, tax)
        sample_ok = bk["sp"] >= sample_min_spend and bk["mqls"] >= sample_min_mqls
        ads.append({"nome": name, "campanha": camp, "conjunto": adset,
                    "amostra_ok": sample_ok, "_q": ad_quality(d), **pack(d)})

    # top: amostra relevante primeiro, depois melhor qualidade (tier desc, vol desc, custo asc)
    ranked = sorted(ads, key=lambda x: (not x["amostra_ok"], -x["_q"][0], -x["_q"][1], x["_q"][2]))
    top = ranked[:top_n]
    top_keys = {(x["nome"], x["campanha"], x["conjunto"]) for x in top}
    # piores: só com gasto relevante e fora do top; pior qualidade primeiro
    worst_pool = [x for x in ads if x["gasto"] >= sample_min_spend
                  and (x["nome"], x["campanha"], x["conjunto"]) not in top_keys]
    worst = sorted(worst_pool, key=lambda x: (x["_q"][0], x["_q"][1], -x["_q"][2]))[:top_n]

    def strip(lst):
        return [{k: v for k, v in x.items() if k != "_q"} for x in lst]

    ref7 = derive(totals(leads, meta, (date.fromisoformat(today_iso) - timedelta(days=6)).isoformat(), today_iso), tax)
    ref14 = derive(totals(leads, meta, (date.fromisoformat(today_iso) - timedelta(days=13)).isoformat(), today_iso), tax)
    ref30 = derive(totals(leads, meta, (date.fromisoformat(today_iso) - timedelta(days=29)).isoformat(), today_iso), tax)
    saude = funnel_health(dT, ref30, meta_cpmql, meta_cac, volume_min, [ref7, ref14, ref30])

    pa, pb, metodo = previous_period(key, a, b, today_iso, dmin_iso, dmax_iso)
    anterior = derive(totals(leads, meta, pa, pb), tax) if pa else None

    ads_full = strip(ranked)
    return {
        "de": a, "ate": b, "total": pack(dT), "campanhas": camps,
        "top_anuncios": strip(top), "piores_anuncios": strip(worst),
        "nota_saude": saude,
        "whatsapp_numeros": whatsapp_numeros(label, a, b, dT, saude),
        "comparativo_periodo_anterior": {
            "range": ({"de": pa, "ate": pb} if pa else None),
            "metodo": metodo,
            "total": (pack(anterior) if anterior else None),
            "variacao": compare(dT, anterior),
        },
        "criativos_consolidado": consolidado_criativos(ads_full),
    }


PERIOD_LABELS = {
    "hoje": "Hoje", "ontem": "Ontem", "3d": "3 dias", "7d": "7 dias", "14d": "14 dias",
    "30d": "30 dias", "mes": "Este mês", "mespass": "Mês passado", "todo": "Todo período",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--leads-file")
    ap.add_argument("--meta-file")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                    "relatorios_metrics.json"))
    args = ap.parse_args()

    # Sem --leads-file/--meta-file: busca ao vivo via CSV público do Google
    # Sheets (mesmo caminho do build.py) — usado pelo GitHub Actions, que
    # alcança docs.google.com (o sandbox do agente não alcança).
    leads_rows = build.load_rows(build.EXPORT_URL.format(sid=build.SPREADSHEET_ID, gid=build.GID_LEADS), args.leads_file)
    meta_rows = build.load_rows(build.EXPORT_URL.format(sid=build.SPREADSHEET_ID, gid=build.GID_META), args.meta_file)
    data = build.process(leads_rows, meta_rows)
    leads, meta, B = data["leads"], data["meta"], data["build"]
    tax = B["tax_factor"]

    ps = presets(B["today"], B["date_min"], B["date_max"])
    out = {
        "gerado_em": datetime.now(BRT).strftime("%d/%m/%Y %H:%M"),
        "hoje": B["today"], "periodo_dados": {"de": B["date_min"], "ate": B["date_max"]},
        "sample_min_spend": B["sample_min_spend"], "sample_min_mqls": B["sample_min_mqls"],
        # metas & parâmetros da conta (None = não definida) — a IA cita a meta ou
        # sinaliza "meta não definida" nos Insights de Tráfego.
        "metas": {"cpmql": B.get("meta_cpmql"), "cac": B.get("meta_cac"),
                  "volume_min_amostral": B.get("volume_min_amostral"),
                  "n_dias_corte": B.get("n_dias_corte")},
        "periodos": {k: period_metrics(leads, meta, a, b, tax, B["sample_min_spend"],
                                        B["sample_min_mqls"], B["top_ads_n"],
                                        PERIOD_LABELS.get(k, k), B["today"], B["date_min"], B["date_max"], k,
                                        B.get("meta_cpmql"), B.get("meta_cac"), B.get("volume_min_amostral"))
                     for k, (a, b) in ps.items()},
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("== métricas geradas ==", file=sys.stderr)
    print(f"  hoje={out['hoje']} dados={B['date_min']}->{B['date_max']}", file=sys.stderr)
    print(f"  out={args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
