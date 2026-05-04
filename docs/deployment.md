# Despliegue en Cloudflare

## 1. Instalar dependencias

```bash
npm install
```

## 2. Login en Cloudflare

```bash
npx wrangler login
```

## 3. Crear KV namespaces

```bash
npx wrangler kv namespace create questions --binding QUESTIONS_KV
npx wrangler kv namespace create questions --binding QUESTIONS_KV --preview
npx wrangler kv namespace create quiz-sessions --binding QUIZ_SESSIONS
npx wrangler kv namespace create quiz-sessions --binding QUIZ_SESSIONS --preview
```

## 4. Copiar IDs en `wrangler.jsonc`

Cada comando del paso 3 imprime un bloque con un `id`. Los comandos con `--preview` imprimen el `preview_id`.

Abre `wrangler.jsonc` y sustituye los valores `REPLACE_WITH_...` por esos IDs.

Ejemplo de lo que tienes ahora:

```jsonc
"kv_namespaces": [
	{
		"binding": "QUESTIONS_KV",
		"id": "REPLACE_WITH_QUESTIONS_KV_ID",
		"preview_id": "REPLACE_WITH_QUESTIONS_KV_PREVIEW_ID"
	},
	{
		"binding": "QUIZ_SESSIONS",
		"id": "REPLACE_WITH_SESSIONS_KV_ID",
		"preview_id": "REPLACE_WITH_SESSIONS_KV_PREVIEW_ID"
	}
]
```

Ejemplo de cómo debe quedar, usando IDs inventados:

```jsonc
"kv_namespaces": [
	{
		"binding": "QUESTIONS_KV",
		"id": "11111111111111111111111111111111",
		"preview_id": "22222222222222222222222222222222"
	},
	{
		"binding": "QUIZ_SESSIONS",
		"id": "33333333333333333333333333333333",
		"preview_id": "44444444444444444444444444444444"
	}
]
```

No copies estos IDs de ejemplo. Usa los que te haya mostrado Wrangler.

## 5. Crear el secret del premio

```bash
npx wrangler secret put PRIZE_CODE
```

## 6. Exportar el CSV real

Puedes guardar el CSV real dentro del proyecto como `questions.real.csv`. Ese archivo está en `.gitignore`, así que no se subirá al repo.

```bash
npm run questions:export -- questions.real.csv /tmp/thegrandquiz-questions.json
```

## 7. Subir preguntas a KV remoto

```bash
npx wrangler kv key put questions --path /tmp/thegrandquiz-questions.json --binding QUESTIONS_KV --remote
```

## 8. Probar en local con Workers

```bash
npm run dev
```

## 9. Desplegar

```bash
npm run deploy
```

## 10. Actualizar preguntas en el futuro

```bash
npm run questions:export -- questions.real.csv /tmp/thegrandquiz-questions.json
npx wrangler kv key put questions --path /tmp/thegrandquiz-questions.json --binding QUESTIONS_KV --remote
```
