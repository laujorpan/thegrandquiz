'use strict';

const QUESTIONS_KEY_DEFAULT = 'questions';
const SESSION_TTL_SECONDS = 60 * 60 * 6;
const WON_COOKIE = 'ikerQuiz_hasWon';

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		try {
			if (url.pathname === '/api/health') {
				return jsonResponse(await health(env));
			}

			if (url.pathname === '/api/session/start' && request.method === 'POST') {
				return jsonResponse(await startSession(env));
			}

			if (url.pathname === '/api/session/answer' && request.method === 'POST') {
				const body = await readJson(request);
				return jsonResponse(await answerQuestion(env, body));
			}

			if (url.pathname === '/api/session/result' && request.method === 'GET') {
				const result = await getResult(env, request, url.searchParams.get('sessionId'));
				return jsonResponse(result.body, { headers: result.headers });
			}

			if (url.pathname.startsWith('/api/')) {
				return jsonResponse({ error: 'Endpoint no encontrado' }, { status: 404 });
			}

			if (!isAllowedAssetPath(url.pathname)) {
				return new Response('Not found', { status: 404 });
			}

			return env.ASSETS.fetch(request);
		} catch (err) {
			const status = err.status || 500;
			return jsonResponse({ error: err.message || 'Error interno' }, { status });
		}
	}
};

async function health(env) {
	const questions = await loadQuestions(env);
	const config = getQuizConfig(env, questions.length);
	return {
		ok: true,
		questionsAvailable: questions.length,
		questionsCount: config.questionsCount,
		minCorrect: config.minCorrect
	};
}

async function startSession(env) {
	const questions = await loadQuestions(env);
	const config = getQuizConfig(env, questions.length);
	const picked = shuffle(questions).slice(0, config.questionsCount);
	const session = {
		id: crypto.randomUUID(),
		questionIds: picked.map(q => q.id),
		currentIndex: 0,
		score: 0,
		answers: [],
		completed: false,
		createdAt: Date.now()
	};

	await saveSession(env, session);

	return {
		sessionId: session.id,
		questions: picked.map(toPublicQuestion),
		questionsCount: config.questionsCount,
		minCorrect: config.minCorrect
	};
}

async function answerQuestion(env, body) {
	const session = await loadSession(env, body.sessionId);
	if (session.completed) {
		throw httpError(409, 'La sesión ya está completada');
	}

	const questions = await loadQuestions(env);
	const questionById = new Map(questions.map(q => [q.id, q]));
	const expectedQuestionId = session.questionIds[session.currentIndex];

	if (!body.questionId || body.questionId !== expectedQuestionId) {
		throw httpError(409, 'La respuesta no corresponde a la pregunta actual');
	}

	const question = questionById.get(body.questionId);
	if (!question) {
		throw httpError(500, 'Pregunta no encontrada en el banco');
	}

	const selected = normalizeSelected(body.selected);
	const isCorrect = exactMatch(selected, question.correct);

	session.answers.push({
		id: question.id,
		question: question.question,
		options: question.options,
		selected,
		correct: question.correct,
		isCorrect
	});
	session.currentIndex += 1;
	if (isCorrect) session.score += 1;
	if (session.currentIndex >= session.questionIds.length) {
		session.completed = true;
	}

	await saveSession(env, session);

	return {
		ok: true,
		isCorrect,
		score: session.score,
		currentIndex: session.currentIndex,
		total: session.questionIds.length,
		completed: session.completed
	};
}

async function getResult(env, request, sessionId) {
	const session = await loadSession(env, sessionId);
	if (!session.completed) {
		throw httpError(409, 'La sesión todavía no ha terminado');
	}

	const questions = await loadQuestions(env);
	const config = getQuizConfig(env, questions.length);
	const won = session.score >= config.minCorrect;
	const alreadyWon = hasCookie(request, WON_COOKIE);
	const headers = new Headers();
	let prizeCode = null;

	if (won && !alreadyWon) {
		prizeCode = env.PRIZE_CODE || '[ CÓDIGO NO CONFIGURADO ]';
		headers.set('Set-Cookie', buildWonCookie(new URL(request.url)));
	}

	const reviewMode = won ? 'all' : 'session';
	const review = won
		? questions.map(q => ({ ...toPublicQuestion(q), correct: q.correct }))
		: session.answers;

	return {
		headers,
		body: {
			won,
			score: session.score,
			total: session.questionIds.length,
			minCorrect: config.minCorrect,
			prizeCode,
			reviewMode,
			review
		}
	};
}

async function loadQuestions(env) {
	if (!env.QUESTIONS_KV) {
		throw httpError(500, 'Falta el binding QUESTIONS_KV');
	}

	const key = env.QUESTIONS_KV_KEY || QUESTIONS_KEY_DEFAULT;
	const raw = await env.QUESTIONS_KV.get(key, 'text');
	if (!raw) {
		throw httpError(500, `No hay banco de preguntas en KV con la clave "${key}"`);
	}

	let questions;
	if (raw.trim().startsWith('[')) {
		questions = JSON.parse(raw);
	} else {
		questions = parseCSV(raw);
	}

	const normalized = questions.map(normalizeQuestion).filter(Boolean);
	if (!normalized.length) {
		throw httpError(500, 'El banco de preguntas está vacío o no es válido');
	}

	return normalized;
}

function parseCSV(text) {
	const lines = text.trim().split(/\r?\n/);
	return lines.slice(1).map(line => {
		const parts = line.split(';').map(p => p.trim());
		if (parts.length < 7) return null;
		const [id, question, optionA, optionB, optionC, optionD, correctRaw] = parts;
		return {
			id,
			question,
			options: [optionA, optionB, optionC, optionD],
			correct: correctRaw.split(',').map(c => c.trim().toUpperCase())
		};
	}).filter(Boolean);
}

function normalizeQuestion(q) {
	if (!q || !q.id || !q.question || !Array.isArray(q.options) || !Array.isArray(q.correct)) {
		return null;
	}

	const options = q.options.map(option => String(option || '').trim());
	const correct = normalizeSelected(q.correct);
	if (options.length !== 4 || correct.length === 0 || correct.some(letter => !['A', 'B', 'C', 'D'].includes(letter))) {
		return null;
	}

	return {
		id: String(q.id).trim(),
		question: String(q.question).trim(),
		options,
		correct
	};
}

async function loadSession(env, sessionId) {
	if (!env.QUIZ_SESSIONS) {
		throw httpError(500, 'Falta el binding QUIZ_SESSIONS');
	}
	if (!sessionId) {
		throw httpError(400, 'Falta sessionId');
	}

	const session = await env.QUIZ_SESSIONS.get(sessionId, 'json');
	if (!session) {
		throw httpError(404, 'Sesión no encontrada o caducada');
	}

	return session;
}

function saveSession(env, session) {
	return env.QUIZ_SESSIONS.put(session.id, JSON.stringify(session), {
		expirationTtl: SESSION_TTL_SECONDS
	});
}

function getQuizConfig(env, availableQuestions) {
	const questionsCount = parsePositiveInt(env.QUIZ_QUESTIONS_COUNT, 10);
	const minCorrect = parsePositiveInt(env.QUIZ_MIN_CORRECT, 9);

	if (availableQuestions < questionsCount) {
		throw httpError(500, `El banco debe tener al menos ${questionsCount} preguntas. Encontradas: ${availableQuestions}`);
	}

	if (minCorrect > questionsCount) {
		throw httpError(500, 'QUIZ_MIN_CORRECT no puede ser mayor que QUIZ_QUESTIONS_COUNT');
	}

	return { questionsCount, minCorrect };
}

function parsePositiveInt(value, fallback) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toPublicQuestion(q) {
	return {
		id: q.id,
		question: q.question,
		options: q.options
	};
}

function normalizeSelected(selected) {
	if (!Array.isArray(selected)) return [];
	return [...new Set(selected.map(s => String(s).trim().toUpperCase()))]
		.filter(letter => ['A', 'B', 'C', 'D'].includes(letter))
		.sort();
}

function exactMatch(selected, correct) {
	const normalizedCorrect = normalizeSelected(correct);
	return selected.length === normalizedCorrect.length &&
		selected.every((letter, index) => letter === normalizedCorrect[index]);
}

function shuffle(arr) {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

async function readJson(request) {
	try {
		return await request.json();
	} catch (err) {
		throw httpError(400, 'JSON no válido');
	}
}

function jsonResponse(data, init = {}) {
	const headers = new Headers(init.headers || {});
	headers.set('Content-Type', 'application/json; charset=utf-8');
	return new Response(JSON.stringify(data), {
		status: init.status || 200,
		headers
	});
}

function httpError(status, message) {
	const err = new Error(message);
	err.status = status;
	return err;
}

function hasCookie(request, name) {
	const cookie = request.headers.get('Cookie') || '';
	return cookie.split(';').some(part => part.trim().startsWith(`${name}=`));
}

function buildWonCookie(url) {
	const secure = url.protocol === 'https:' ? '; Secure' : '';
	return `${WON_COOKIE}=true; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${secure}`;
}

function isAllowedAssetPath(pathname) {
	if (pathname === '/' || pathname === '/index.html' || pathname === '/style.css' || pathname === '/quiz.js') {
		return true;
	}

	return pathname.startsWith('/assets/') || pathname.startsWith('/themes/');
}
