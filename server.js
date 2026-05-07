import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || 'drankspel';
const SUNOAPI_KEY = process.env.SUNOAPI_KEY || '';
const SUNOAPI_BASE = 'https://api.sunoapi.org';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use(express.json());
app.use(cookieParser());

// ── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  if (req.cookies?.auth === APP_PASSWORD) return next();
  res.status(401).json({ error: 'Niet ingelogd' });
}

// ── Auth endpoints ───────────────────────────────────────────────────────────

app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password !== APP_PASSWORD) {
    return res.status(401).json({ error: 'Verkeerd wachtwoord' });
  }
  res.cookie('auth', APP_PASSWORD, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dagen
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('auth');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ loggedIn: req.cookies?.auth === APP_PASSWORD });
});

// ── Random drinkschema ────────────────────────────────────────────────────────

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateDrinkingSchedule(names) {
  return names.map((name) => {
    // 25% kans: gezamenlijke ronde — iedereen deelt mee, individuele straf vervalt
    if (Math.random() < 0.25) {
      const n = randInt(1, 10);
      return {
        type: 'gezamenlijk',
        name,
        punishment: `Iedereen drinkt ${n} slok${n === 1 ? '' : 'ken'}`,
        note: `${name} was aan de beurt maar iedereen deelt mee`,
      };
    }

    const roll = Math.random();
    let punishment;
    if (roll < 0.60) {
      const n = randInt(1, 10);
      punishment = `${name} drinkt ${n} slok${n === 1 ? '' : 'ken'}`;
    } else if (roll < 0.80) {
      punishment = `${name} drinkt een adtje`;
    } else {
      punishment = `${name} drinkt een half adtje`;
    }

    return { type: 'individual', name, punishment };
  });
}

// ── Prompt engineering via OpenAI ────────────────────────────────────────────

async function buildSunoPrompt({ names, theme, style, schedule }) {
  const scheduleText = schedule
    .map((r, i) => {
      const base = `Ronde ${i + 1}: ${r.punishment}`;
      return r.type === 'gezamenlijk' ? `${base}  ← (${r.note})` : base;
    })
    .join('\n');

  const systemPrompt = `Je bent een schrijver van Nederlandse drankspelliedjes.
De drinkregels zijn al VASTGELEGD via een willekeurige generator. Jouw enige taak is er een leuk verhaal omheen schrijven.

Geef je antwoord als valide JSON met precies deze velden:
- title: pakkende, grappige titel (max 60 tekens)
- tags: muziekstijl-tags voor Suno, kommagescheiden
- lyrics: de volledige liedtekst

DRINKSCHEMA (staat vast — verander hoeveelheden of namen NIET):
${scheduleText}

HOE JE HET LIEDJE OPBOUWT:
Voor elke ronde schrijf je één blok lyrics:
  - OPBOUW (3-4 regels): grappig verhaaltje over de spelers, nog geen drankregel.
    Bouw spanning op. Je MAG misleidend zijn: hint naar persoon A terwijl de straf voor B is.
    Bij een gezamenlijke ronde: hint dat iedereen erbij betrokken is.
  - STRAF (1-2 regels): de exacte drinkregel uit het schema, letterlijk overgenomen.
    De straf eindigt de ronde.

Tussen elke twee rondes een [Chorus] van 2-4 regels: feestelijk, herhalend, zonder drankregel.
Na de laatste ronde een kort [Outro].

STRUCTUUR (pas aan op het aantal rondes):
[Verse 1]   ← ronde 1
[Chorus]
[Verse 2]   ← ronde 2
[Chorus]
... (vervolg voor alle rondes)
[Outro]

EXTRA REGELS:
- Schrijf altijd in het Nederlands
- De strafregel moet EXACT overeenkomen met het schema: zelfde naam, zelfde hoeveelheid
- Opbouw is grappig en herkenbaar, de straf voelt verdiend (of juist niet — dat is de grap)
- Houd het energiek en feestelijk`;

  const userMsg = [
    `Spelers: ${names.join(', ')}`,
    theme ? `Thema/extra: ${theme}` : '',
    style ? `Muziekstijl voorkeur: ${style}` : '',
  ].filter(Boolean).join('\n');

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.95,
  });

  const raw = completion.choices[0].message.content;
  return JSON.parse(raw);
}

// ── Suno generatie via sunoapi.org ───────────────────────────────────────────

function sunoHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUNOAPI_KEY}`,
  };
}

async function submitSunoJob(title, style, lyrics) {
  const response = await fetch(`${SUNOAPI_BASE}/api/v1/generate`, {
    method: 'POST',
    headers: sunoHeaders(),
    body: JSON.stringify({
      customMode: true,
      instrumental: false,
      model: 'V4_5',
      title,
      style,
      prompt: lyrics,
      callBackUrl: 'https://example.com/callback', // polling ipv webhook
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`sunoapi.org fout (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (data.code !== 200 || !data.data?.taskId) {
    throw new Error(`Onverwacht sunoapi.org antwoord: ${JSON.stringify(data)}`);
  }
  return data.data.taskId;
}

async function pollSunoJob(taskId, maxWaitMs = 300_000) {
  const interval = 5000;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));

    const response = await fetch(
      `${SUNOAPI_BASE}/api/v1/generate/record-info?taskId=${taskId}`,
      { headers: sunoHeaders() }
    );

    if (!response.ok) continue;

    const data = await response.json();
    const status = data.data?.status;

    if (status === 'SUCCESS' && data.data?.response?.sunoData?.length > 0) {
      return data.data.response.sunoData;
    }
    if (status === 'CREATE_TASK_FAILED' || status === 'GENERATE_AUDIO_FAILED' || status === 'SENSITIVE_WORD_ERROR') {
      throw new Error(`Suno generatie mislukt (${status}): ${data.data?.errorMessage || ''}`);
    }
    // PENDING, TEXT_SUCCESS, FIRST_SUCCESS: blijf pollen
  }

  throw new Error('Suno generatie duurde te lang (timeout na 5 min)');
}

// ── Hoofd-endpoint ───────────────────────────────────────────────────────────

app.post('/api/generate', requireAuth, async (req, res) => {
  const { names, theme, style } = req.body;
  if (!Array.isArray(names) || names.length < 2) {
    return res.status(400).json({ error: 'Voer minimaal 2 namen in' });
  }
  if (!SUNOAPI_KEY) {
    return res.status(500).json({ error: 'SUNOAPI_KEY is niet ingesteld in .env' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'OPENAI_API_KEY is niet ingesteld in .env' });
  }

  try {
    // 1) Random drinkschema genereren (geen LLM)
    const schedule = generateDrinkingSchedule(names);

    // 2) OpenAI schrijft het verhaal om het schema heen
    const { title, tags, lyrics } = await buildSunoPrompt({ names, theme, style, schedule });

    // 3) Suno job indienen
    const taskId = await submitSunoJob(title, tags, lyrics);

    // 4) Pollen tot klaar
    const sunoData = await pollSunoJob(taskId);

    res.json({
      title,
      tags,
      lyrics,
      schedule,
      tracks: sunoData.map((m) => ({
        musicId: m.id,
        title: m.title || title,
        audioUrl: m.audioUrl,
        videoUrl: null,
        imageUrl: m.imageUrl,
        duration: m.duration,
      })),
    });
  } catch (err) {
    console.error('Generatie fout:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Static bestanden serveren ────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Server starten ───────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎵 Suno Drankspel App draait op http://localhost:${PORT}`);
  console.log(`   Mobiel (zelfde WiFi): zoek je lokale IP via 'ipconfig'\n`);
});
