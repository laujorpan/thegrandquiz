 'use strict';

// ── Configuración ────────────────────────────────────────────
const DISCOUNT_CODE   = window.PRIZE_CODE || '[ CÓDIGO NO CONFIGURADO ]';
const MIN_CORRECT     = window.QUIZ_MIN_CORRECT     || 9;
const QUESTIONS_COUNT = window.QUIZ_QUESTIONS_COUNT || 10;
const LS_KEY_WON      = 'ikerQuiz_hasWon';

// ── Captchas ─────────────────────────────────────────────────
// Cada entrada tiene su pregunta y el mensaje que se muestra al pulsar "Confirmar".
// El usuario nunca puede avanzar: siempre se muestra el mensaje y se resetea el grid.
const CAPTCHA_STEPS = [
	{
		question: 'Selecciona todos los cuadros que contengan un "Jota"',
		message:  'Eso no parece correcto. Fíjate bien e inténtalo de nuevo.'
	},
	{
		question: 'Ahora selecciona todos los cuadros que contengan un "Marc"',
		message:  'Hmm, casi. Vuelve a intentarlo, esta vez con más cuidado.'
	},
	{
		question: 'Venga, prueba a seleccionar todos los que NO contienen un Jota ni un Marc',
		message:  'Ya, demasiado complicado. Bueno, no pasa nada. Haremos como que lo has hecho bien'
	}
];
// Índice del captcha actual (0, 1, 2). Se gestiona fuera del flujo normal de preguntas.
let captchaStep = 0;

// ── Estado del juego ─────────────────────────────────────────
let allQuestions   = [];   // pool completo del CSV
let sessionQuestions = []; // 10 aleatorias de esta partida
let currentIndex   = 0;
let score          = 0;
let answers        = [];   // {question, selected[], correct[], isCorrect}
let canSeeAllQuestions = false;

// ── Utilidades DOM ───────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showScreen(id) {
	document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
	document.getElementById(id).classList.add('active');
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Parseo CSV ───────────────────────────────────────────────
function parseCSV(text) {
	const lines = text.trim().split('\n');
	// Saltar cabecera
	return lines.slice(1).map(line => {
		const parts = line.split(';').map(p => p.trim());
		if (parts.length < 7) return null;
		const [id, question, option_a, option_b, option_c, option_d, correctRaw] = parts;
		const correct = correctRaw.split(',').map(c => c.trim().toUpperCase());
		return { id, question, options: [option_a, option_b, option_c, option_d], correct };
	}).filter(Boolean);
}

// ── Fisher-Yates shuffle ─────────────────────────────────────
function shuffle(arr) {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

// ── Inicio del juego ─────────────────────────────────────────
function startGame() {
	sessionQuestions = shuffle(allQuestions).slice(0, QUESTIONS_COUNT);
	currentIndex = 0;
	score = 0;
	answers = [];
	canSeeAllQuestions = false;
	captchaStep = 0;
	showQuestion();
}

// ── Mostrar pregunta ─────────────────────────────────────────
function showQuestion() {
	const q = sessionQuestions[currentIndex];
	const num = currentIndex + 1;
	const total = sessionQuestions.length;

	$('question-counter').textContent = `Pregunta ${num} de ${total}`;
	$('question-text').textContent = q.question;
	$('progress-bar').style.width = `${(num / total) * 100}%`;

	// Ocultar aviso
	$('warning-box').classList.add('hidden');
	$('btn-next').classList.remove('hidden');

	renderStandardQuestion(q);
	showScreen('screen-question');
}

// ── Mostrar captcha ───────────────────────────────────────────
function showCaptcha() {
	const step = CAPTCHA_STEPS[captchaStep];

	// Ocultar barra de progreso y contador durante el captcha
	$('question-counter').textContent = '🤖 Verificación de seguridad';
	$('question-text').textContent = step.question;
	$('progress-bar').style.width = '100%';

	$('warning-box').classList.add('hidden');
	$('btn-next').classList.remove('hidden');

	renderCaptchaQuestion();
	showScreen('screen-question');
}

// ── Pregunta estándar (checkboxes A/B/C/D) ───────────────────
function renderStandardQuestion(q) {
	$('hint-text').textContent = 'Selecciona todas las respuestas correctas';
	$('btn-next').textContent = 'Siguiente';
	const container = $('options-container');
	container.innerHTML = '';
	container.className = 'options';
	const letters = ['A', 'B', 'C', 'D'];
	q.options.forEach((opt, i) => {
		const label = document.createElement('label');
		label.className = 'option-label';
		label.innerHTML = `
			<input type="checkbox" value="${letters[i]}">
			<span><strong>${letters[i]}.</strong> ${escapeHTML(opt)}</span>
		`;
		const cb = label.querySelector('input');
		cb.addEventListener('change', () => {
			label.classList.toggle('selected', cb.checked);
		});
		container.appendChild(label);
	});
}

// ── Pregunta tipo captcha (grid 4×3 de imágenes) ─────────────
function renderCaptchaQuestion() {
	$('hint-text').textContent = 'Selecciona los paneles correctos y pulsa Confirmar';
	$('btn-next').textContent = 'Confirmar';
	const container = $('options-container');
	container.innerHTML = '';
	container.className = 'captcha-grid';

	const numbers = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

	numbers.forEach(num => {
		const panel = document.createElement('button');
		panel.type = 'button';
		panel.className = 'captcha-panel';
		panel.dataset.value = num;

		const img = document.createElement('img');
		img.src = `assets/captcha/panel-${num}.jpg`;
		img.alt = `Panel ${num}`;
		panel.appendChild(img);

		panel.addEventListener('click', () => panel.classList.toggle('selected'));
		container.appendChild(panel);
	});
}

// ── Manejar "Siguiente" / "Confirmar" ───────────────────────
function handleNext() {
	// Si estamos en modo captcha, mostrar el mensaje de ese paso
	if ($('btn-next').textContent === 'Confirmar') {
		showCaptchaFailModal(CAPTCHA_STEPS[captchaStep].message);
		return;
	}

	const selected = getSelected();

	if (selected.length === 0) {
		$('warning-box').classList.remove('hidden');
		$('btn-next').classList.add('hidden');
		return;
	}

	processAnswer(selected);
}

// ── Modal de fallo del captcha ───────────────────────────────
function showCaptchaFailModal(message) {
	const overlay = document.createElement('div');
	overlay.className = 'modal-overlay';
	overlay.innerHTML = `
		<div class="modal-box">
			<p class="modal-badge">🤖 Verificación</p>
			<h2 class="modal-title">Selección incorrecta</h2>
			<p class="modal-body">${message}</p>
			<div class="modal-actions modal-actions--center">
				<button class="btn btn-primary">Intentar de nuevo</button>
			</div>
		</div>`;

	document.body.appendChild(overlay);

	overlay.querySelector('.btn').addEventListener('click', () => {
		overlay.classList.add('modal-out');
		setTimeout(() => {
			overlay.remove();
			captchaStep++;
			if (captchaStep >= CAPTCHA_STEPS.length) {
				showResult();
			} else {
				showCaptcha();
			}
		}, 300);
	});
}

function getSelected() {
	return [...$('options-container').querySelectorAll('input:checked')]
		.map(cb => cb.value);
}

// ── Confirmar sin responder ──────────────────────────────────
function confirmEmpty() {
	processAnswer([]);
}

function cancelWarning() {
	$('warning-box').classList.add('hidden');
	$('btn-next').classList.remove('hidden');
}

// ── Procesar respuesta ───────────────────────────────────────
function processAnswer(selected) {
	const q = sessionQuestions[currentIndex];
	const correct = q.correct;

	// Comparación exacta (set) — funciona tanto para letras como para números
	const isCorrect =
		selected.length === correct.length &&
		selected.every(s => correct.includes(s));

	if (isCorrect) score++;

	answers.push({
		question: q.question,
		options:  q.options,
		selected,
		correct,
		isCorrect
	});

	nextQuestionOrResult();
}

// ── Pantalla de feedback ─────────────────────────────────────
function showFeedback(q, selected, correct, isCorrect) {
	const num = currentIndex + 1;
	$('question-counter-feedback').textContent = `Pregunta ${num} de ${sessionQuestions.length}`;
	$('feedback-icon').textContent  = isCorrect ? '✅' : '❌';
	$('feedback-title').textContent = isCorrect ? '¡Correcto!' : 'Incorrecto';
	$('feedback-title').className   = `feedback-title ${isCorrect ? 'correct' : 'incorrect'}`;
	$('feedback-question').textContent = q.question;

	const letters = ['A', 'B', 'C', 'D'];
	const container = $('feedback-answers');
	container.innerHTML = '';

	q.options.forEach((opt, i) => {
		const div = document.createElement('div');
		div.className = 'feedback-option neutral';
		div.innerHTML = `<strong>${letters[i]}.</strong> ${escapeHTML(opt)}`;
		container.appendChild(div);
	});

	// Cambiar texto del botón en la última pregunta
	$('btn-next-question').textContent =
		currentIndex < sessionQuestions.length - 1 ? 'Siguiente pregunta' : 'Ver resultado';

	showScreen('screen-feedback');
}

// ── Siguiente pregunta o resultado ───────────────────────────
function nextQuestionOrResult() {
	currentIndex++;
	if (currentIndex < sessionQuestions.length) {
		showQuestion();
	} else {
		// Preguntas normales terminadas → arrancar secuencia captcha
		captchaStep = 0;
		showCaptcha();
	}
}

// ── Pantalla de resultado ────────────────────────────────────
function showResult() {
	const won        = score >= MIN_CORRECT;
	const hasWonBefore = localStorage.getItem(LS_KEY_WON) === 'true';

	$('result-score').textContent = `${score} / ${QUESTIONS_COUNT}`;

	if (won) {
		$('result-icon').textContent  = '🏆';
		$('result-title').textContent = '¡Lo conseguiste!';

		if (!hasWonBefore) {
			// Primera victoria
			localStorage.setItem(LS_KEY_WON, 'true');
			$('result-message').textContent = '¡Enhorabuena! Has superado el reto. Aquí tienes tu código de premio exclusivo:';
			$('prize-box').classList.remove('hidden');
			$('discount-code').textContent = DISCOUNT_CODE;
		} else {
			// Victoria repetida
			$('result-message').textContent = '¡Volviste a ganar! Pero ya recibiste tu premio en una partida anterior.';
			$('prize-box').classList.add('hidden');
		}
	} else {
		$('result-icon').textContent  = '😓';
		$('result-title').textContent = 'Casi lo consigues...';
		$('result-message').textContent =
			`Has acertado ${score} de ${QUESTIONS_COUNT}. Necesitas al menos ${MIN_CORRECT} para ganar. ¡Vuelve a intentarlo!`;
		$('prize-box').classList.add('hidden');
	}

	canSeeAllQuestions = won;
	$('btn-review').classList.remove('hidden');
	$('btn-review').textContent = canSeeAllQuestions ? 'Ver todas las preguntas' : 'Revisar mis respuestas';

	showScreen('screen-result');
}

// ── Pantalla de revisión ─────────────────────────────────────
function showReview() {
	const list = $('review-list');
	list.innerHTML = '';
	const letters = ['A', 'B', 'C', 'D'];

	const titleEl    = document.querySelector('.review-title');
	const subtitleEl = document.querySelector('.review-subtitle');

	if (canSeeAllQuestions) {
		titleEl.textContent    = 'Todas las preguntas';
		subtitleEl.textContent = 'Las respuestas correctas están marcadas en verde.';

		allQuestions.forEach((q, idx) => {
			const item = document.createElement('div');
			item.className = 'review-item';

			const header = document.createElement('div');
			header.className = 'review-item-header';
			header.textContent = `Pregunta ${idx + 1}`;

			const questionDiv = document.createElement('div');
			questionDiv.className = 'review-item-question';
			questionDiv.textContent = q.question;

			const optionsDiv = document.createElement('div');
			optionsDiv.className = 'review-options';

			q.options.forEach((opt, i) => {
				const letter = letters[i];
				const isCorrect = q.correct.includes(letter);
				const div = document.createElement('div');
				div.className = `review-option${isCorrect ? ' is-correct' : ''}`;
				div.innerHTML = `<span class="check">${isCorrect ? '✓' : '·'}</span><strong>${letter}.</strong> ${escapeHTML(opt)}`;
				optionsDiv.appendChild(div);
			});

			item.appendChild(header);
			item.appendChild(questionDiv);
			item.appendChild(optionsDiv);
			list.appendChild(item);
		});
	} else {
		titleEl.textContent    = 'Tus respuestas';
		subtitleEl.textContent = 'Verde = correcta · Rojo = tu elección incorrecta.';

		answers.forEach((ans, idx) => {
			const item = document.createElement('div');
			item.className = 'review-item';

			const header = document.createElement('div');
			header.className = 'review-item-header';
			header.textContent = `Pregunta ${idx + 1} · ${ans.isCorrect ? '✅' : '❌'}`;

			const questionDiv = document.createElement('div');
			questionDiv.className = 'review-item-question';
			questionDiv.textContent = ans.question;

			const optionsDiv = document.createElement('div');
			optionsDiv.className = 'review-options';

			ans.options.forEach((opt, i) => {
				const letter      = letters[i];
				const isCorrectOpt = ans.correct.includes(letter);
				const wasSelected  = ans.selected.includes(letter);

				let cls   = '';
				let check = '·';
				if (isCorrectOpt)       { cls = ' is-correct'; check = '✓'; }
				else if (wasSelected)   { cls = ' is-wrong';   check = '✗'; }

				const div = document.createElement('div');
				div.className = `review-option${cls}`;
				div.innerHTML = `<span class="check">${check}</span><strong>${letter}.</strong> ${escapeHTML(opt)}`;
				optionsDiv.appendChild(div);
			});

			item.appendChild(header);
			item.appendChild(questionDiv);
			item.appendChild(optionsDiv);
			list.appendChild(item);
		});
	}

	showScreen('screen-review');
}

// ── Copiar código ────────────────────────────────────────────
function copyCode() {
	const code = $('discount-code').textContent;
	navigator.clipboard.writeText(code).then(() => {
		const btn = $('btn-copy');
		const label = $('copy-label');
		btn.classList.add('copied');
		label.textContent = '¡Copiado!';
		setTimeout(() => {
			btn.classList.remove('copied');
			label.textContent = 'Copiar';
		}, 2000);
	}).catch(() => {
		// Fallback para navegadores sin clipboard API
		const input = document.createElement('input');
		input.value = code;
		document.body.appendChild(input);
		input.select();
		document.execCommand('copy');
		document.body.removeChild(input);
		$('copy-label').textContent = '¡Copiado!';
		setTimeout(() => { $('copy-label').textContent = 'Copiar'; }, 2000);
	});
}

// ── Escape HTML ──────────────────────────────────────────────
function escapeHTML(str) {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

// ── Event listeners ──────────────────────────────────────────
function bindEvents() {
	$('btn-start').addEventListener('click', startGame);
	$('btn-next').addEventListener('click', handleNext);
	$('btn-warning-back').addEventListener('click', cancelWarning);
	$('btn-warning-confirm').addEventListener('click', confirmEmpty);
	$('btn-next-question').addEventListener('click', nextQuestionOrResult);
	$('btn-copy').addEventListener('click', copyCode);
	$('btn-retry').addEventListener('click', startGame);
	$('btn-review').addEventListener('click', showReview);
	$('btn-back-result').addEventListener('click', () => showScreen('screen-result'));
}

// ── Inicialización ───────────────────────────────────────────
async function init() {
	try {
		const response = await fetch('questions.csv');
		if (!response.ok) throw new Error(`No se pudo cargar questions.csv (${response.status})`);
		const text = await response.text();
		allQuestions = parseCSV(text);

		if (allQuestions.length < QUESTIONS_COUNT) {
			throw new Error(`El fichero debe tener al menos ${QUESTIONS_COUNT} preguntas. Encontradas: ${allQuestions.length}`);
		}

		bindEvents();
		showScreen('screen-start');
	} catch (err) {
		document.body.innerHTML = `
			<div style="font-family:system-ui;padding:40px;max-width:600px;margin:auto;text-align:center;">
				<h2 style="color:#ef4444;">Error al cargar el quiz</h2>
				<p style="margin-top:12px;color:#555;">${err.message}</p>
				<p style="margin-top:8px;color:#888;font-size:0.85rem;">Asegúrate de servir el proyecto desde un servidor local (ej: <code>python3 -m http.server</code>)</p>
			</div>`;
	}
}

document.addEventListener('DOMContentLoaded', init);
