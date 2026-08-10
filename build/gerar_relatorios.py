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


def period_metrics(leads, meta, a, b, tax, sample_min_spend, sample_min_mqls, top_n):
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

    return {"de": a, "ate": b, "total": pack(dT), "campanhas": camps,
            "top_anuncios": strip(top), "piores_anuncios": strip(worst)}


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
                                        B["sample_min_mqls"], B["top_ads_n"])
                     for k, (a, b) in ps.items()},
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print("== métricas geradas ==", file=sys.stderr)
    print(f"  hoje={out['hoje']} dados={B['date_min']}->{B['date_max']}", file=sys.stderr)
    print(f"  out={args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
