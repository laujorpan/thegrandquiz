# El Gran Quiz de Darwinex

Juego de preguntas y respuestas de temática Darwinex. Edición especial _"Volví casado y ya no me sé mi password"_.

El frontend sigue siendo HTML, CSS y JavaScript vanilla. La app soporta dos modos:

- **Modo Workers**: las preguntas con respuestas se leen desde Cloudflare KV, la validación se hace en `/api/session/answer` y el código de premio se guarda como Cloudflare Secret.
- **Modo estático**: si `/api/health` no responde, el navegador carga `questions.csv` y valida en cliente para poder funcionar en GitHub Pages o con `http-server`.

El modo estático es funcional, pero no protege preguntas, respuestas ni premio. El `questions.csv` versionado es el banco demo público; el banco real de Cloudflare debe vivir fuera del repositorio.

## Desarrollo local

### Modo estático

Sirve el repositorio como archivos estáticos:

```bash
npx http-server . -p 8000
```

Abre `http://localhost:8000`. Este modo carga `questions.csv` desde el navegador.

### Modo Workers

Instala dependencias de despliegue:

```bash
npm install
```

Crea los namespaces KV en Cloudflare y sustituye los IDs en `wrangler.jsonc`:

```bash
npx wrangler kv namespace create questions --binding QUESTIONS_KV
npx wrangler kv namespace create questions --binding QUESTIONS_KV --preview
npx wrangler kv namespace create quiz-sessions --binding QUIZ_SESSIONS
npx wrangler kv namespace create quiz-sessions --binding QUIZ_SESSIONS --preview
```

Configura el premio como secret:

```bash
npx wrangler secret put PRIZE_CODE
```

Cuando tengas el banco real, guárdalo fuera del repo y expórtalo a JSON:

```bash
npm run questions:export -- /ruta/privada/questions-real.csv /tmp/thegrandquiz-questions.json
npx wrangler kv key put questions --path /tmp/thegrandquiz-questions.json --binding QUESTIONS_KV
```

Arranca localmente:

```bash
npm run dev
```

Abre la URL que muestre Wrangler. En localhost aparece un selector de temas en la esquina inferior derecha. También puedes cambiar el tema por URL: `?theme=grand-prix`.

## Despliegue

```bash
npm run deploy
```

Antes de desplegar comprueba:

- `wrangler.jsonc` tiene IDs reales de KV;
- `PRIZE_CODE` está creado como secret;
- la clave `questions` existe en el `QUESTIONS_KV` remoto:

```bash
npx wrangler kv key put questions --path /tmp/thegrandquiz-questions.json --binding QUESTIONS_KV --remote
```

- `config.js` no se usa ni se despliega;
- `questions.csv` no se sirve desde el navegador.

## GitHub Pages

GitHub Pages funciona en modo estático. Publica los archivos del repositorio y asegúrate de incluir `questions.csv`, que en este repo es la versión demo pública. Si quieres mostrar un premio demo en modo estático, crea un `config.js` público con:

```js
window.PRIZE_CODE = 'CODIGO-DEMO';
```

No uses ese modo para secretos reales ni para el banco bueno.

## Configuración

Los valores no secretos viven en `wrangler.jsonc`:

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `QUESTIONS_KV_KEY` | `questions` | Clave KV donde está el banco de preguntas |
| `QUIZ_QUESTIONS_COUNT` | `10` | Número de preguntas por partida |
| `QUIZ_MIN_CORRECT` | `9` | Aciertos mínimos necesarios para ganar |

El valor secreto vive en Cloudflare:

| Secret | Descripción |
| --- | --- |
| `PRIZE_CODE` | Código de premio que se entrega al ganador |

## Formato del CSV

`questions.csv` usa `;` como separador:

```csv
id;question;option_a;option_b;option_c;option_d;correct
1;Pregunta;Opción A;Opción B;Opción C;Opción D;A,C
```

El CSV versionado es la demo pública. El banco definitivo con respuestas reales debe guardarse fuera del repositorio, exportarse localmente con `scripts/export-questions.mjs` y subirse a KV.

Nombres locales habituales para el banco real como `questions.real.csv`, `questions.private.csv`, `questions.production.csv`, `private/` y `secrets/` están ignorados por git.
