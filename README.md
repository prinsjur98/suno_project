# Suno Drankspel App

Genereer een AI-drankspelliedje: typ een concept, GPT-4o schrijft de tekst en stijl, Suno maakt het liedje.

## Vereisten

- Node.js 18 of hoger
- OpenAI API key
- sunoapi.org key (Suno toegang via [sunoapi.org](https://sunoapi.org))

## Eerste keer instellen

### 1. API keys instellen

Kopieer het voorbeeldbestand en vul je keys in:

```bash
copy .env.example .env
```

Open `.env` en vul in:

```
OPENAI_API_KEY=sk-...
SUNOAPI_KEY=...
APP_PASSWORD=kiesjeigenwachtwoord
PORT=3000
```

### 2. Dependencies installeren

```bash
npm install
```

### 3. App starten

```bash
npm start
```

De app draait nu op `http://localhost:3000`.

---

## Gebruiken op je mobiel (via WiFi)

1. Zorg dat je laptop en mobiel op hetzelfde wifi-netwerk zitten.
2. Zoek je lokale IP-adres op:
   - Windows: open PowerShell en typ `ipconfig` → zoek "IPv4 Address" (bijv. `192.168.1.42`)
3. Open op je mobiel: `http://192.168.1.42:3000`
4. **Installeren op homescreen:**
   - **Android (Chrome):** tik op de drie puntjes → "Toevoegen aan startscherm"
   - **iPhone (Safari):** tik op het deel-icoontje → "Zet op beginscherm"

> De laptop moet aan staan en `npm start` draaien als je de app wilt gebruiken.

---

## Deployen op Azure (overal toegankelijk)

Als je de app altijd online wilt hebben zonder dat je laptop aan hoeft:

### Vereiste tools

```bash
# Azure CLI installeren: https://docs.microsoft.com/cli/azure/install-azure-cli
az login
```

### Deployen

```bash
az webapp up \
  --name suno-drankspel \
  --resource-group mijn-rg \
  --runtime "NODE:22-lts" \
  --sku B1
```

### API keys instellen in Azure

```bash
az webapp config appsettings set \
  --name suno-drankspel \
  --resource-group mijn-rg \
  --settings \
    OPENAI_API_KEY="sk-..." \
    SUNOAPI_KEY="..." \
    APP_PASSWORD="jouwwachtwoord"
```

De app is dan bereikbaar op `https://suno-drankspel.azurewebsites.net`.

---

## Projectstructuur

```
suno_miniproject/
├── server.js          ← Express backend + API proxy
├── package.json
├── .env               ← Jouw API keys (niet committen!)
├── .env.example       ← Voorbeeld zonder echte keys
├── generate-icons.js  ← Script om PWA-iconen te genereren
├── public/
│   ├── index.html     ← App UI
│   ├── app.js         ← Frontend logica
│   ├── style.css      ← Styling
│   ├── manifest.json  ← PWA manifest
│   ├── sw.js          ← Service worker
│   └── icons/         ← App-iconen
└── README.md
```

## Hoe het werkt

1. Je typt een concept (thema, stijl, aantal spelers)
2. GPT-4o schrijft een Suno-prompt: titel, muziekstijl-tags en volledige liedtekst met drankregels
3. De sunoapi.org API genereert twee versies van het liedje (~1-2 minuten)
4. Je kunt het liedje beluisteren en downloaden als MP3

## sunoapi.org instellen

1. Ga naar [sunoapi.org](https://sunoapi.org) en maak een account aan
2. Koop credits
3. Ga naar [API Key Management](https://sunoapi.org/api-key) en kopieer je key
4. Plak de key in `.env` als `SUNOAPI_KEY`

## Problemen oplossen

| Probleem | Oplossing |
|---|---|
| `SUNOAPI_KEY is niet ingesteld` | Voeg `SUNOAPI_KEY=...` toe aan `.env` |
| `OPENAI_API_KEY is niet ingesteld` | Voeg `OPENAI_API_KEY=...` toe aan `.env` |
| `Onvoldoende credits` | Koop meer credits op sunoapi.org |
| Mobiel kan app niet bereiken | Controleer of laptop en mobiel op hetzelfde wifi zitten, en of firewall poort 3000 toestaat |
| Generatie duurt langer dan 5 min | Suno server druk; probeer het later opnieuw |
