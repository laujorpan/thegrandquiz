import { readFile, writeFile } from 'node:fs/promises';

const inputPath = process.argv[2] || 'questions.csv';
const outputPath = process.argv[3] || '/tmp/thegrandquiz-questions.json';

const text = await readFile(inputPath, 'utf8');
const questions = parseCSV(text);

if (!questions.length) {
	throw new Error(`No se encontraron preguntas válidas en ${inputPath}`);
}

await writeFile(outputPath, `${JSON.stringify(questions, null, 2)}\n`, 'utf8');
console.log(`Exportadas ${questions.length} preguntas a ${outputPath}`);

function parseCSV(text) {
	const lines = text.trim().split(/\r?\n/);
	const header = lines.shift();
	if (header !== 'id;question;option_a;option_b;option_c;option_d;correct') {
		throw new Error('Cabecera CSV no válida');
	}

	return lines.map((line, index) => {
		const parts = line.split(';').map(part => part.trim());
		if (parts.length !== 7) {
			throw new Error(`Fila ${index + 2}: se esperaban 7 columnas y hay ${parts.length}`);
		}

		const [id, question, optionA, optionB, optionC, optionD, correctRaw] = parts;
		const correct = correctRaw.split(',').map(letter => letter.trim().toUpperCase());
		if (correct.some(letter => !['A', 'B', 'C', 'D'].includes(letter))) {
			throw new Error(`Fila ${index + 2}: respuesta correcta no válida`);
		}

		return {
			id,
			question,
			options: [optionA, optionB, optionC, optionD],
			correct
		};
	});
}
