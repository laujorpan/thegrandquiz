'use strict';

// ── Configuración ────────────────────────────────────────────
const LS_KEY_WON = 'ikerQuiz_hasWon';
const STATIC_DISCOUNT_CODE = window.PRIZE_CODE || '[ CÓDIGO NO CONFIGURADO ]';
const STATIC_MIN_CORRECT = window.QUIZ_MIN_CORRECT || 9;
const STATIC_QUESTIONS_COUNT = window.QUIZ_QUESTIONS_COUNT || 10;

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

// ── Estado del juego ─────────────────────────────────────────
let sessionId = null;
let runtimeMode = 'worker';
let allQuestions = [];
let sessionQuestions = [];
let currentIndex = 0;
let score = 0;
let answers = [];
let reviewItems = [];
let canSeeAllQuestions = false;
let quizConfig = { questionsCount: 10, minCorrect: 9 };
let captchaStep = 0;

// ── Utilidades DOM ───────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showScreen(id) {
	document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
	document.getElementById(id).classList.add('active');
	window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setButtonBusy(button, isBusy, busyText) {
	if (!button) return;
	if (isBusy) {
		button.dataset.originalText = button.textContent;
		button.textContent = busyText;
		button.disabled = true;
	} else {
		button.textContent = button.dataset.originalText || button.textContent;
		button.disabled = false;
		delete button.dataset.originalText;
	}
}

function showFatalError(message) {
	document.body.innerHTML = `
		<div style="font-family:system-ui;padding:40px;max-width:600px;margin:auto;text-align:center;">
			<h2 style="color:#ef4444;">Error al cargar el quiz</h2>
			<p style="margin-top:12px;color:#555;">${escapeHTML(message)}</p>
			<p style="margin-top:8px;color:#888;font-size:0.85rem;">Asegúrate de servir el proyecto por HTTP: <code>npx wrangler dev</code> para modo seguro o <code>npx http-server . -p 8000</code> para modo estático.</p>
		</div>`;
}

// ── Parseo CSV para fallback estático ────────────────────────
function parseCSV(text) {
	const lines = text.trim().split(/\r?\n/);
	return lines.slice(1).map(line => {
		const parts = line.split(';').map(p => p.trim());
		if (parts.length < 7) return null;
		const [id, question, optionA, optionB, optionC, optionD, correctRaw] = parts;
		const correct = correctRaw.split(',').map(c => c.trim().toUpperCase());
		return { id, question, options: [optionA, optionB, optionC, optionD], correct };
	}).filter(Boolean);
}

async function apiRequest(path, options = {}) {
	const response = await fetch(path, {
		headers: {
			'Content-Type': 'application/json',
			...(options.headers || {})
		},
		...options
	});

	let data = null;
	try {
		data = await response.json();
	} catch (err) {
		if (!response.ok) throw new Error(`Respuesta inesperada del servidor (${response.status})`);
	}

	if (!response.ok) {
		throw new Error((data && data.error) || `Error del servidor (${response.status})`);
	}

	return data;
}

// ── Inicio del juego ─────────────────────────────────────────
async function startGame() {
	setButtonBusy($('btn-start'), true, 'Preparando...');
	setButtonBusy($('btn-retry'), true, 'Preparando...');

	try {
		if (runtimeMode === 'worker') {
			const data = await apiRequest('/api/session/start', { method: 'POST' });
			sessionId = data.sessionId;
			sessionQuestions = data.questions;
			quizConfig = {
				questionsCount: data.questionsCount,
				minCorrect: data.minCorrect
			};
		} else {
			sessionId = null;
			sessionQuestions = shuffle(allQuestions).slice(0, quizConfig.questionsCount);
		}

		currentIndex = 0;
		score = 0;
		answers = [];
		reviewItems = [];
		canSeeAllQuestions = false;
		captchaStep = 0;
		showCaptcha();
	} catch (err) {
		showFatalError(err.message);
	} finally {
		setButtonBusy($('btn-start'), false);
		setButtonBusy($('btn-retry'), false);
	}
}

// ── Mostrar pregunta ─────────────────────────────────────────
function showQuestion() {
	const q = sessionQuestions[currentIndex];
	const num = currentIndex + 1;
	const total = sessionQuestions.length;

	$('question-counter').textContent = `Pregunta ${num} de ${total}`;
	$('question-text').textContent = q.question;
	$('progress-bar').style.width = `${(num / total) * 100}%`;

	$('warning-box').classList.add('hidden');
	$('btn-next').classList.remove('hidden');

	renderStandardQuestion(q);
	showScreen('screen-question');
}

// ── Mostrar captcha ───────────────────────────────────────────
function showCaptcha() {
	const step = CAPTCHA_STEPS[captchaStep];

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
	$('btn-next').disabled = false;
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
	$('btn-next').disabled = false;
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

// ── Fisher-Yates shuffle ─────────────────────────────────────
function shuffle(arr) {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function normalizeAnswers(values) {
	if (!Array.isArray(values)) return [];
	return [...new Set(values.map(value => String(value).trim().toUpperCase()))]
		.filter(value => ['A', 'B', 'C', 'D'].includes(value))
		.sort();
}

function exactMatch(selected, correct) {
	return selected.length === correct.length &&
		selected.every((value, index) => value === correct[index]);
}

// ── Manejar "Siguiente" / "Confirmar" ───────────────────────
function handleNext() {
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
				showQuestion();
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
async function processAnswer(selected) {
	const q = sessionQuestions[currentIndex];
	setButtonBusy($('btn-next'), true, 'Guardando...');
	$('btn-warning-confirm').disabled = true;

	try {
		if (runtimeMode === 'static') {
			const correct = normalizeAnswers(q.correct);
			const normalizedSelected = normalizeAnswers(selected);
			const isCorrect = exactMatch(normalizedSelected, correct);

			if (isCorrect) score++;

			answers.push({
				id: q.id,
				question: q.question,
				options: q.options,
				selected: normalizedSelected,
				correct,
				isCorrect
			});

			nextQuestionOrResult();
			return;
		}

		const data = await apiRequest('/api/session/answer', {
			method: 'POST',
			body: JSON.stringify({
				sessionId,
				questionId: q.id,
				selected
			})
		});

		score = data.score;
		answers.push({
			id: q.id,
			question: q.question,
			options: q.options,
			selected,
			isCorrect: data.isCorrect
		});

		nextQuestionOrResult();
	} catch (err) {
		showFatalError(err.message);
	} finally {
		const warningConfirm = $('btn-warning-confirm');
		if (warningConfirm) warningConfirm.disabled = false;
		setButtonBusy($('btn-next'), false);
	}
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
		showResult();
	}
}

// ── Pantalla de resultado ────────────────────────────────────
async function showResult() {
	try {
		if (runtimeMode === 'static') {
			showStaticResult();
			return;
		}

		const result = await apiRequest(`/api/session/result?sessionId=${encodeURIComponent(sessionId)}`);
		const won = result.won;
		const hasPrize = Boolean(result.prizeCode);
		const resultLogo = $('result-logo');

		score = result.score;
		quizConfig.questionsCount = result.total;
		quizConfig.minCorrect = result.minCorrect;
		canSeeAllQuestions = result.reviewMode === 'all';
		reviewItems = result.review || [];

		$('result-score').textContent = `${score} / ${result.total}`;

		if (won) {
			resultLogo.src = 'assets/logowinner.png';
			resultLogo.alt = 'Logo ganador';
			$('result-title').textContent = '¡Lo conseguiste!';

			if (hasPrize && localStorage.getItem(LS_KEY_WON) !== 'true') {
				localStorage.setItem(LS_KEY_WON, 'true');
				$('result-message').textContent = '¡Enhorabuena! Has superado el reto. Aquí tienes tu código de premio exclusivo:';
				$('prize-box').classList.remove('hidden');
				$('discount-code').textContent = result.prizeCode;
			} else {
				$('result-message').textContent = '¡Volviste a ganar! Pero ya recibiste tu premio en una partida anterior.';
				$('prize-box').classList.add('hidden');
			}
		} else {
			resultLogo.src = 'assets/logolooser.png';
			resultLogo.alt = 'Logo perdedor';
			$('result-title').textContent = 'Casi lo consigues...';
			$('result-message').textContent =
				`Has acertado ${score} de ${result.total}. Necesitas al menos ${result.minCorrect} para ganar. ¡Vuelve a intentarlo!`;
			$('prize-box').classList.add('hidden');
		}

		$('btn-review').classList.remove('hidden');
		$('btn-review').textContent = canSeeAllQuestions ? 'Ver todas las preguntas' : 'Revisar mis respuestas';

		showScreen('screen-result');
	} catch (err) {
		showFatalError(err.message);
	}
}

function showStaticResult() {
	const won = score >= quizConfig.minCorrect;
	const hasWonBefore = localStorage.getItem(LS_KEY_WON) === 'true';
	const resultLogo = $('result-logo');

	canSeeAllQuestions = won;
	reviewItems = won
		? allQuestions.map(q => ({ ...q, correct: normalizeAnswers(q.correct) }))
		: answers;

	$('result-score').textContent = `${score} / ${sessionQuestions.length}`;

	if (won) {
		resultLogo.src = 'assets/logowinner.png';
		resultLogo.alt = 'Logo ganador';
		$('result-title').textContent = '¡Lo conseguiste!';

		if (!hasWonBefore) {
			localStorage.setItem(LS_KEY_WON, 'true');
			$('result-message').textContent = '¡Enhorabuena! Has superado el reto. Aquí tienes tu código de premio exclusivo:';
			$('prize-box').classList.remove('hidden');
			$('discount-code').textContent = STATIC_DISCOUNT_CODE;
		} else {
			$('result-message').textContent = '¡Volviste a ganar! Pero ya recibiste tu premio en una partida anterior.';
			$('prize-box').classList.add('hidden');
		}
	} else {
		resultLogo.src = 'assets/logolooser.png';
		resultLogo.alt = 'Logo perdedor';
		$('result-title').textContent = 'Casi lo consigues...';
		$('result-message').textContent =
			`Has acertado ${score} de ${sessionQuestions.length}. Necesitas al menos ${quizConfig.minCorrect} para ganar. ¡Vuelve a intentarlo!`;
		$('prize-box').classList.add('hidden');
	}

	$('btn-review').classList.remove('hidden');
	$('btn-review').textContent = canSeeAllQuestions ? 'Ver todas las preguntas' : 'Revisar mis respuestas';

	showScreen('screen-result');
}

// ── Pantalla de revisión ─────────────────────────────────────
function showReview() {
	const list = $('review-list');
	list.innerHTML = '';
	const letters = ['A', 'B', 'C', 'D'];

	const titleEl = document.querySelector('.review-title');
	const subtitleEl = document.querySelector('.review-subtitle');

	if (canSeeAllQuestions) {
		titleEl.textContent = 'Todas las preguntas';
		subtitleEl.textContent = 'Las respuestas correctas están marcadas en verde.';
	} else {
		titleEl.textContent = 'Tus respuestas';
		subtitleEl.textContent = 'Verde = correcta · Rojo = tu elección incorrecta.';
	}

	reviewItems.forEach((item, idx) => {
		const reviewItem = document.createElement('div');
		reviewItem.className = 'review-item';

		const header = document.createElement('div');
		header.className = 'review-item-header';
		header.textContent = canSeeAllQuestions
			? `Pregunta ${idx + 1}`
			: `Pregunta ${idx + 1} · ${item.isCorrect ? '✅' : '❌'}`;

		const questionDiv = document.createElement('div');
		questionDiv.className = 'review-item-question';
		questionDiv.textContent = item.question;

		const optionsDiv = document.createElement('div');
		optionsDiv.className = 'review-options';

		item.options.forEach((opt, i) => {
			const letter = letters[i];
			const isCorrectOpt = item.correct.includes(letter);
			const wasSelected = (item.selected || []).includes(letter);

			let cls = '';
			let check = '·';
			if (isCorrectOpt) {
				cls = ' is-correct';
				check = '✓';
			} else if (wasSelected) {
				cls = ' is-wrong';
				check = '✗';
			}

			const div = document.createElement('div');
			div.className = `review-option${cls}`;
			div.innerHTML = `<span class="check">${check}</span><strong>${letter}.</strong> ${escapeHTML(opt)}`;
			optionsDiv.appendChild(div);
		});

		reviewItem.appendChild(header);
		reviewItem.appendChild(questionDiv);
		reviewItem.appendChild(optionsDiv);
		list.appendChild(reviewItem);
	});

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
	return String(str)
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
		const health = await detectWorkerHealth();
		runtimeMode = 'worker';
		quizConfig = {
			questionsCount: health.questionsCount,
			minCorrect: health.minCorrect
		};
	} catch (err) {
		if (err && err.isWorkerConfigError) {
			showFatalError(err.message);
			return;
		}

		try {
			await initStaticMode();
		} catch (staticErr) {
			showFatalError(staticErr.message);
			return;
		}
	}

	bindEvents();
	showScreen('screen-start');
}

document.addEventListener('DOMContentLoaded', init);

async function detectWorkerHealth() {
	let response;
	try {
		response = await fetch('/api/health');
	} catch (err) {
		throw new Error('Worker no disponible');
	}

	if (response.status === 404) {
		throw new Error('Worker no disponible');
	}

	let data = null;
	try {
		data = await response.json();
	} catch (err) {
		if (!response.ok) {
			const error = new Error(`Respuesta inesperada del servidor (${response.status})`);
			error.isWorkerConfigError = true;
			throw error;
		}

		throw new Error('Worker no disponible');
	}

	if (!response.ok) {
		const error = new Error((data && data.error) || `Error del servidor (${response.status})`);
		error.isWorkerConfigError = true;
		throw error;
	}

	if (!data || data.ok !== true) {
		throw new Error('Worker no disponible');
	}

	return data;
}

async function initStaticMode() {
	runtimeMode = 'static';
	quizConfig = {
		questionsCount: STATIC_QUESTIONS_COUNT,
		minCorrect: STATIC_MIN_CORRECT
	};

	const response = await fetch('questions.csv');
	if (!response.ok) {
		throw new Error(`No se pudo cargar questions.csv (${response.status})`);
	}

	const text = await response.text();
	allQuestions = parseCSV(text);

	if (allQuestions.length < quizConfig.questionsCount) {
		throw new Error(`El fichero debe tener al menos ${quizConfig.questionsCount} preguntas. Encontradas: ${allQuestions.length}`);
	}
}
