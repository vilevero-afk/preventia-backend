# Déploiement Render

## Service

- Type : Web Service
- Build command : `npm install`
- Start command : `npm start`

## Variables d'environnement

Définir les variables suivantes dans Render :

```env
OPENAI_API_KEY=
OPENAI_MODEL=
HOST=0.0.0.0
PORT=3000
```

Ne pas commiter de clé API. La clé OpenAI doit être fournie uniquement via la variable d'environnement `OPENAI_API_KEY`.
