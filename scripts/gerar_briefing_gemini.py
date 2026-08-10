import os
import json
import re
import time
from google import genai
from google.genai import types

# 1. Configuração do Cliente (SDK Moderno)
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("ERRO: A variável GEMINI_API_KEY não foi encontrada!")

client = genai.Client(api_key=api_key)

# 2. Funções de suporte
def carregar_arquivo(caminho):
    if os.path.exists(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            return f.read()
    return ""

metrics_data = carregar_arquivo("build/relatorios_metrics.json")
guia_regras = carregar_arquivo("build/GUIA-RELATORIOS.md")
relatorios_atuais_raw = carregar_arquivo("build/relatorios.json")

if not metrics_data:
    raise FileNotFoundError("ERRO: O arquivo build/relatorios_metrics.json é obrigatório.")

# 3. Prompt de análise
prompt = f"""
Você é o Gestor de Tráfego do dash-marcelo. Atualize os 9 briefings da aba 'Relatório'.
REGRAS: {guia_regras}
MÉTRICAS: {metrics_data}
JSON ATUAL: {relatorios_atuais_raw}

TAREFA:
1. Mova 'periodos.hoje.html' para 'periodos.ontem.html' (migração de dados).
2. Gere um novo HTML para 'hoje' analisando os dados atuais.
3. Reescreva os briefings: 3d, 7d, 14d, 30d, este mes, mês passado e Periodo total.
4. Use rigorosamente as tags: <span class="tag escala|otimiza|corte|observar">.
5. Retorne APENAS um objeto JSON válido, sem comentários.
"""

# 4. Sistema de Tentativas em Cascata (Fallback)
# Tentamos os modelos do mais novo para o mais estável conforme a disponibilidade da API em 2026
modelos_para_tentar = ["gemini-3.0-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
sucesso = False

print("Iniciando processo de geração de briefings...")

for model_id in modelos_para_tentar:
    try:
        print(f"Tentando modelo: {model_id}...")
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2
            )
        )
        
        if response and response.text:
            raw_text = response.text.strip()
            # Limpeza básica de Markdown
            if raw_text.startswith("```"):
                raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
                raw_text = re.sub(r"\s*```$", "", raw_text)
            
            novo_json = json.loads(raw_text)
            
            with open("build/relatorios.json", "w", encoding="utf-8") as f:
                json.dump(novo_json, f, ensure_ascii=False, indent=2)
            
            print(f"✅ Sucesso total com o modelo {model_id}!")
            sucesso = True
            break
            
    except Exception as e:
        print(f"⚠️ Erro com {model_id}: {str(e)}")
        continue

if not sucesso:
    print("❌ Falha crítica: Nenhum modelo disponível conseguiu processar a requisição.")
    exit(1)
