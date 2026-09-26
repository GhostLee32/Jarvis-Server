const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DB_FILE = path.join(__dirname, 'history.json');

function loadHistory() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveHistory(history) {
  fs.writeFileSync(DB_FILE, JSON.stringify(history));
}

const SYSTEM_PROMPT = "Eres un asistente de voz personal estilo Jarvis, hablas español, respondes breve (maximo 3 frases), de forma natural como si hablaras en voz alta, sin listas ni markdown.";

app.get('/api/history', (req, res) => {
  res.json({ messages: loadHistory() });
});

app.post('/api/clear', (req, res) => {
  saveHistory([]);
  res.json({ ok: true });
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Falta el mensaje' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Falta configurar GEMINI_API_KEY en Render' });

  const history = loadHistory();

  const contents = [
    { role: 'user', parts: [{ text: SYSTEM_PROMPT }] },
    { role: 'model', parts: [{ text: 'Entendido, listo para ayudar.' }] },
    ...history.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }]
    })),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents })
      }
    );
    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: 'Error de Gemini', detail: data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No pude generar una respuesta.';

    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: text });
    saveHistory(history);

    res.json({ text });
  } catch (e) {
    res.status(500).json({ error: 'Error al conectar con Gemini', detail: String(e) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor Jarvis corriendo en puerto ' + PORT));
