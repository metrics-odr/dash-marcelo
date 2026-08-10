import os
import json
import re
import google.generativeai as genai

# 1. Configuração da API
api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    raise ValueError("ERRO: A variável GEMINI_API_KEY não foi encontrada!")

genai.configure(api_key=api_key)

# 2. AUTO-DISCOVERY: Encontra o melhor modelo Flash disponível na sua conta
def encontrar_melhor_modelo():
    print("Buscando modelos disponíveis na sua conta...")
    try:
        for m in genai.list_models():
            # Procura um modelo que aceite gerar conteúdo e que seja da linha 'flash'
            if 'generateContent' in m.supported_generation_methods:
                if 'flash' in m.name.lower():
                    print(f"✅ Modelo selecionado automaticamente: {m.name}")
                    return m.name
        # Fallback caso não encontre 'flash', pega o primeiro que gera conteúdo
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                return m.name
    except Exception as e:
        print(f"Aviso ao listar modelos: {e}")
    return 'gemini-1.5-flash' # Último recurso

model_id = encontrar_melhor_modelo()
model = genai.GenerativeModel(model_id)

# 3. Funções de suporte
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

# 4. Prompt
prompt = f"""
Você é o Gestor de Tráfego do dash-marcelo. Atualize os 9 briefings.
REGRAS: {guia_regras}
MÉTRICAS: {metrics_data}
JSON ATUAL: {relatorios_atuais_raw}

TAREFA:
1. Mova 'periodos.hoje.html' para 'periodos.ontem.html'.
2. Gere novo HTML para 'hoje'.
3. Reescreva os briefings: 3d, 7d, 14d, 30d, este mes, mês passado e Periodo total.
4. Use rigorosamente as tags: <span class="tag escala|otimiza|corte|observar">.
5. Retorne APENAS o JSON válido.
"""

# 5. Execução
try:
    response = model.generate_content(
        prompt,
        generation_config={"response_mime_type": "application/json"}
    )
    
    raw_text = response.text.strip()
    if raw_text.startswith("```"):
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)
    
    novo_json = json.loads(raw_text)
    
    with open("build/relatorios.json", "w", encoding="utf-8") as f:
        json.dump(novo_json, f, ensure_ascii=False, indent=2)
    
    print("✅ Sucesso: build/relatorios.json atualizado.")

except Exception as e:
    print(f"❌ ERRO: {str(e)}")
    exit(1)
