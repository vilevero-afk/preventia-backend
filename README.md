# PreventIA Backend

Backend Node.js + Express pour l'application Flutter **PreventIA Belgique**.

Le backend reçoit les données du formulaire de prévention, appelle l'API OpenAI côté serveur via le SDK officiel, puis renvoie un projet de document structuré.

## Installation

```bash
npm install
```

## Configuration `.env`

Créer un fichier `.env` local à partir de `.env.example` :

```bash
cp .env.example .env
```

Puis renseigner la clé côté serveur uniquement :

```env
PORT=3000
HOST=0.0.0.0
OPENAI_API_KEY=sk-your-real-api-key
OPENAI_MODEL=gpt-4.1-mini
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
JSON_LIMIT=100kb
RATE_LIMIT=60
```

Ne jamais mettre la clé API OpenAI dans Flutter, dans le dépôt Git ou dans un fichier versionné. Le fichier `.env` est ignoré par Git.

## Lancement local

```bash
npm run start
```

Ou en mode développement avec redémarrage automatique Node :

```bash
npm run dev
```

## Test de `/health`

```bash
curl http://localhost:3000/health
```

Réponse attendue :

```json
{
  "status": "ok",
  "service": "preventia-backend"
}
```

## Test de `/api/generate-document`

```bash
curl -X POST http://localhost:3000/api/generate-document \
  -H "Content-Type: application/json" \
  -d '{
    "documentType": "Analyse de risques générale",
    "formData": {
      "secteurActivite": "Construction",
      "nombreTravailleurs": "25",
      "siteLieuTravail": "Chantier temporaire à Bruxelles",
      "activitePoste": "Travaux de rénovation intérieure",
      "machinesEquipements": "Échelles, outils électroportatifs, échafaudage mobile",
      "produitsDangereux": "Colles, solvants, poussières de découpe",
      "travailleursExposes": "Ouvriers, chef d’équipe, sous-traitants",
      "accidentsIncidents": "Chutes de plain-pied et coupures mineures déjà signalées",
      "mesuresExistantes": "EPI, accueil sécurité, balisage partiel",
      "presenceCppt": "Non",
      "serviceInterneExterne": "Service externe de prévention et protection au travail",
      "contraintesParticulieres": "Travail en site occupé",
      "informationsComplementaires": "Horaires variables selon accès au bâtiment"
    }
  }'
```

Réponse attendue :

```json
{
  "success": true,
  "source": "ai_backend",
  "document": "texte complet du document généré"
}
```

## URL backend pour Flutter

Exemple d'URL à utiliser dans l'application Flutter :

```text
http://localhost:3000/api/generate-document
```

Depuis un iPhone physique connecté au même Wi-Fi que le Mac, utiliser l'adresse IP locale du Mac :

```text
http://ADRESSE_IP_DU_MAC:3000/api/generate-document
```

Pour Android Emulator, `localhost` côté application peut devoir être remplacé par `10.0.2.2`.
