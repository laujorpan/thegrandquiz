# El Gran Quiz de Darwinex

Juego de preguntas y respuestas de temática Darwinex. Edición especial _"Volví casado y ya no me sé mi password"_.

Por defecto, 10 preguntas aleatorias por partida. Acierta 9 o más y ganas un premio. Ambos valores son configurables.

El flujo actual de la partida es: inicio, captcha fake de 3 pasos, bloque de preguntas, resultado y revisión.

## Arranque local

El quiz carga `questions.csv` mediante `fetch()`, así que debe servirse sobre HTTP:

```bash
npx serve .
# o
npx http-server . -p 8000
```

Abre: http://localhost:8000

En localhost aparece un selector de temas en la esquina inferior derecha. También puedes cambiar el tema por URL: `?theme=grand-prix`

## Configuración

Toda la configuración vive en `config.js` (gitignoreado). Para crearlo:

```bash
cp config.example.js config.js
# edita config.js con los valores reales
```

| Variable                  | Por defecto | Descripción                                      |
|---------------------------|-------------|--------------------------------------------------|
| `window.PRIZE_CODE`       | `null`      | Código de premio que se muestra al ganador       |
| `window.QUIZ_QUESTIONS_COUNT` | `10`    | Número de preguntas por partida                  |
| `window.QUIZ_MIN_CORRECT` | `9`         | Aciertos mínimos necesarios para ganar           |

El número total de preguntas disponibles se obtiene directamente de `questions.csv`, sin ningún valor fijo en el código.

Si `config.js` no existe, el quiz funciona con los valores por defecto y muestra `[ CÓDIGO NO CONFIGURADO ]` si se gana.
