import json
import os

locales_dir = "/Users/15indicado/B-Ride/frontend/src/locales"
locales = ["es.json", "en.json", "de.json", "fr.json", "it.json"]

new_keys = {
    "es": {
        "errors.outOfRange": "Fuera de Rango",
        "errors.outOfRangeMsg": "El destino excede el límite operativo de 100km.",
        "form.suggestedPrice": "Precio recomendado",
        "form.priceSubtext": "Basado en distancia y tiempo",
        "form.distance": "Distancia: {dist} km",
        "form.estimatedTime": "Tiempo estimado: {time} min",
        "form.adjustPrice": "Ajuste manual (opcional)",
        "ride.navigate": "Navegar",
        "general.underConstruction": "En Construcción",
        "general.underConstructionMsg": "Esta sección estará disponible próximamente."
    },
    "en": {
        "errors.outOfRange": "Out of Range",
        "errors.outOfRangeMsg": "The destination exceeds the 100km operating limit.",
        "form.suggestedPrice": "Recommended price",
        "form.priceSubtext": "Based on distance and time",
        "form.distance": "Distance: {dist} km",
        "form.estimatedTime": "Estimated time: {time} min",
        "form.adjustPrice": "Manual adjustment (optional)",
        "ride.navigate": "Navigate",
        "general.underConstruction": "Under Construction",
        "general.underConstructionMsg": "This section will be available soon."
    },
    "de": {
        "errors.outOfRange": "Außerhalb der Reichweite",
        "errors.outOfRangeMsg": "Das Ziel überschreitet die 100km-Betriebsgrenze.",
        "form.suggestedPrice": "Empfohlener Preis",
        "form.priceSubtext": "Basierend auf Entfernung und Zeit",
        "form.distance": "Entfernung: {dist} km",
        "form.estimatedTime": "Geschätzte Zeit: {time} min",
        "form.adjustPrice": "Manuelle Anpassung (optional)",
        "ride.navigate": "Navigieren",
        "general.underConstruction": "Im Bau",
        "general.underConstructionMsg": "Dieser Abschnitt wird bald verfügbar sein."
    },
    "fr": {
        "errors.outOfRange": "Hors tension",
        "errors.outOfRangeMsg": "La destination dépasse la limite d'exploitation de 100 km.",
        "form.suggestedPrice": "Prix recommandé",
        "form.priceSubtext": "Basé sur la distance et le temps",
        "form.distance": "Distance: {dist} km",
        "form.estimatedTime": "Temps estimé: {time} min",
        "form.adjustPrice": "Ajustement manuel (facultatif)",
        "ride.navigate": "Naviguer",
        "general.underConstruction": "En Coustruction",
        "general.underConstructionMsg": "Cette section sera bientôt disponible."
    },
    "it": {
        "errors.outOfRange": "Fuori portata",
        "errors.outOfRangeMsg": "La destinazione supera il limite operativo di 100 km.",
        "form.suggestedPrice": "Prezzo consigliato",
        "form.priceSubtext": "Basato su distanza e tempo",
        "form.distance": "Distanza: {dist} km",
        "form.estimatedTime": "Tempo stimato: {time} min",
        "form.adjustPrice": "Regolazione manuale (opzionale)",
        "ride.navigate": "Navigare",
        "general.underConstruction": "In Costruzione",
        "general.underConstructionMsg": "Questa sezione sarà disponibile a breve."
    }
}

for lang, data in new_keys.items():
    file_path = os.path.join(locales_dir, f"{lang}.json")
    with open(file_path, "r", encoding="utf-8") as f:
        curr = json.load(f)
    
    for dot_key, value in data.items():
        parts = dot_key.split(".")
        category = parts[0]
        key = parts[1]
        if category not in curr:
            curr[category] = {}
        curr[category][key] = value

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(curr, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"Updated {lang}.json")
