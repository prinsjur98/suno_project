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

function beerPunishment(name, roll, severity, communal = false) {
  const subject = communal ? 'Iedereen' : name;
  if (severity === 'rogue') {
    // Rogue = veel meer adtjes, weinig slokken
    if (roll < 0.15) {
      const n = randInt(3, 8);
      return `${subject} drinkt ${n} slok${n === 1 ? '' : 'ken'}`;
    } else if (roll < 0.65) {
      return `${subject} drinkt een adtje`;
    } else {
      return `${subject} drinkt een half adtje`;
    }
  } else {
    if (roll < 0.60) {
      const n = randInt(1, 10);
      return `${subject} drinkt ${n} slok${n === 1 ? '' : 'ken'}`;
    } else if (roll < 0.80) {
      return `${subject} drinkt een adtje`;
    } else {
      return `${subject} drinkt een half adtje`;
    }
  }
}

function shotPunishment(name, severity, communal = false) {
  const subject = communal ? 'Iedereen' : name;
  const n = severity === 'rogue' ? randInt(2, 3) : 1;
  return `${subject} drinkt ${n} shot${n === 1 ? '' : 's'}`;
}

// drinks: array containing 'beer' and/or 'shots' (default ['beer'])
// severity: 'normal' | 'rogue'
//
// Generates `names.length` rounds, but each round picks a RANDOM player —
// so some players may be picked multiple times and others not at all.
function generateDrinkingSchedule(names, { drinks = ['beer'], severity = 'normal' } = {}) {
  const hasBeer = drinks.includes('beer');
  const hasShots = drinks.includes('shots');
  const rounds = names.length;

  return Array.from({ length: rounds }, () => {
    const name = names[Math.floor(Math.random() * names.length)];

    // 25% kans: gezamenlijke ronde — iedereen deelt mee, individuele straf vervalt
    if (Math.random() < 0.25) {
      let punishment;
      if (hasBeer && hasShots) {
        punishment = Math.random() < 0.5
          ? beerPunishment(name, Math.random(), severity, true)
          : shotPunishment(name, severity, true);
      } else if (hasBeer) {
        punishment = beerPunishment(name, Math.random(), severity, true);
      } else {
        punishment = shotPunishment(name, severity, true);
      }
      return {
        type: 'gezamenlijk',
        name,
        punishment,
        note: `${name} was aan de beurt maar iedereen deelt mee`,
      };
    }

    const roll = Math.random();
    let punishment;
    if (hasBeer && hasShots) {
      // ~30% kans op een shot, rest bier
      punishment = Math.random() < 0.30
        ? shotPunishment(name, severity)
        : beerPunishment(name, roll, severity);
    } else if (hasShots) {
      punishment = shotPunishment(name, severity);
    } else {
      punishment = beerPunishment(name, roll, severity);
    }

    return { type: 'individual', name, punishment };
  });
}

// ── Prompt engineering via OpenAI ────────────────────────────────────────────

async function buildSunoPrompt({ names, theme, style, schedule, gekke = false }) {
  const scheduleText = schedule
    .map((r, i) => {
      const base = `Ronde ${i + 1}: ${r.punishment}`;
      const communalNote = r.type === 'gezamenlijk' ? `  ← (${r.note})` : '';
      const gekkeTag = (gekke && r.gekke) ? '  ← [GEKKE MANIER]' : '';
      return `${base}${communalNote}${gekkeTag}`;
    })
    .join('\n');

  const gekkeBlock = gekke ? `

GEKKE MODUS — ACTIEF:
Rondes met [GEKKE MANIER] krijgen een grappige, concrete uitvoeringswijze in plaats van simpelweg "drinkt een adtje" of "drinkt een half adtje".
Bedenk per ronde een unieke, hilarische opdracht hoe het adtje gedronken moet worden.
Verwerk die manier in de straftekst zelf (bv. "Jan drinkt een adtje terwijl hij staat op één been").
Geef het bijgewerkte schema terug als extra JSON-veld "schedule": array van objecten { type, name, punishment, note? }.
Gewone rondes: ongewijzigd overnemen. [GEKKE MANIER]-rondes: de grappige methode verwerkt in "punishment".` : '';

  const scheduleReturnField = gekke ? '\n- schedule: bijgewerkt drinkschema met grappige uitvoeringswijzen (zie GEKKE MODUS)' : '';

  const systemPrompt = `Je bent een schrijver van Nederlandse drankspelliedjes.
De drinkregels zijn al VASTGELEGD via een willekeurige generator. Jouw enige taak is er een leuk verhaal omheen schrijven.

Geef je antwoord als valide JSON met deze velden:
- title: pakkende, grappige titel (max 60 tekens)
- tags: muziekstijl-tags voor Suno, kommagescheiden
- lyrics: de volledige liedtekst${scheduleReturnField}

DRINKSCHEMA (staat vast — namen en hoeveelheden NIET wijzigen${gekke ? ', behalve de uitvoeringswijze van [GEKKE MANIER]-rondes' : ''}):
${scheduleText}
${gekkeBlock}

HOE JE HET LIEDJE OPBOUWT:
Voor elke ronde schrijf je één blok lyrics:
  - OPBOUW (3-4 regels): grappig verhaaltje over de sfeer of de spelers. Bouw spanning op.
    Je MAG misleidend zijn: hint naar persoon A terwijl de straf voor B is.
    Bij een gezamenlijke ronde: hint dat iedereen erbij betrokken is.
    ⚠️ VERBODEN in de opbouw: elk woord dat naar drinken verwijst — "drink", "drinkt", "slok",
    "biertje", "adtje", "shot", "cocktail", "glas", "fles", "slurp", of synoniemen daarvan.
    De opbouw mag NOOIT verraden wie er drinkt of wat.
  - STRAF (1-2 regels): de drinkregel uit het schema, letterlijk overgenomen.
    Dit is het ENIGE moment in de hele ronde dat drinken wordt genoemd.
    De straf eindigt de ronde.${gekke ? `
    Bij [GEKKE MANIER]-rondes: de strafzin bevat ZOWEL de hoeveelheid ALS de grappige
    uitvoeringswijze in één zin, bv. "Jan drinkt een adtje terwijl hij staat op één been".` : ''}

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
  const { names, theme, style, drinks, severity, gekke } = req.body;
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
    const drinkOptions = {
      drinks: Array.isArray(drinks) && drinks.length ? drinks : ['beer'],
      severity: severity === 'rogue' ? 'rogue' : 'normal',
    };
    const schedule = generateDrinkingSchedule(names, drinkOptions);

    // In gekke modus: markeer adtje-rondes zodat GPT er een grappige draai aan geeft
    const isGekke = gekke === true;
    if (isGekke) {
      schedule.forEach((r) => {
        if (/adtje|biertje/i.test(r.punishment)) r.gekke = true;
      });
    }

    // 2) OpenAI schrijft het verhaal om het schema heen (en verrijkt in gekke modus)
    const result = await buildSunoPrompt({ names, theme, style, schedule, gekke: isGekke });
    const { title, tags, lyrics } = result;
    // Als GPT een bijgewerkt schema teruggeeft (gekke modus), gebruik dat voor de weergave
    const finalSchedule = (isGekke && Array.isArray(result.schedule) && result.schedule.length)
      ? result.schedule
      : schedule;

    // 3) Suno job indienen
    const taskId = await submitSunoJob(title, tags, lyrics);

    // 4) Pollen tot klaar
    const sunoData = await pollSunoJob(taskId);

    res.json({
      title,
      tags,
      lyrics,
      schedule: finalSchedule,
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
