import os
import json
import re
import google.generativeai as genai

# 1. Configuração da API
# Certifique-se de que o Secret no GitHub chama-se GEMINI_API_KEY
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Usaremos o 1.5-flash para garantir que a cota gratuita funcione sem erro 429
model = genai.GenerativeModel('gemini-1.5-flash')

# 2. Leitura dos arquivos locais
def carregar_arquivo(caminho):
    if os.path.exists(caminho):
        with open(caminho, "r", encoding="utf-8") as f:
            return f.read()
    return ""

metrics_data = carregar_arquivo("build/relatorios_metrics.json")
guia_regras = carregar_arquivo("build/GUIA-RELATORIOS.md")
relatorios_atuais_raw = carregar_arquivo("build/relatorios.json")

# 3. Preparação do Prompt
prompt = f"""
Você é um Gestor de Tráfego Senior. Sua tarefa é atualizar os 9 briefings do dashboard.
REGRAS: {guia_regras}
DADOS BRUTOS: {metrics_data}
JSON ATUAL: {relatorios_atuais_raw}

TAREFAS:
1. Pegue o 'html' que está em 'periodos.hoje' do JSON ATUAL e mova para 'periodos.ontem'.
2. Escreva um novo 'hoje' baseado nos DADOS BRUTOS.
3. Reescreva (3d, 7d, 14d, 30d, mes, mespass, todo) analisando a evolução e dando ações práticas.
4. Use tags: <span class="tag escala">Escalar</span>, <span class="tag otimiza">Otimizar</span>, <span class="tag corte">Cortar</span>, <span class="tag observar">Observar</span>.
5. Retorne APENAS o JSON completo, sem explicações.
"""

# 4. Chamada da API
try:
    response = model.generate_content(prompt)
    raw_text = response.text.strip()
    
    # Limpa markdown se a IA colocar (```json ...)
    if raw_text.startswith("```"):
        raw_text = re.sub(r"^```(?:json)?\s*", "", raw_text)
        raw_text = re.sub(r"\s*```$", "", raw_text)
    
    # Valida se é um JSON antes de salvar
    novo_json = json.loads(raw_text)
    
    with open("build/relatorios.json", "w", encoding="utf-8") as f:
        json.dump(novo_json, f, ensure_ascii=False, indent=2)
    
    print("✅ Sucesso: Relatórios atualizados.")

except Exception as e:
    print(f"❌ Erro crítico: {e}")
    exit(1)
