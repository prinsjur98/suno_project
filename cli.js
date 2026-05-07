#!/usr/bin/env node
// Gebruik: node cli.js [naam1 naam2 naam3 naam4] [--shots] [--no-beer] [--rogue]
//
// Voorbeelden:
//   node cli.js                                  → 4 standaardspelers, bier, normaal
//   node cli.js Jan Piet Marie Klaas             → eigen namen
//   node cli.js Jan Piet --shots                 → bier + shots
//   node cli.js Jan Piet --shots --no-beer       → alleen shots
//   node cli.js Jan Piet Marie Klaas --rogue     → rogue modus

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function generateDrinkingSchedule(names, { drinks = ['beer'], severity = 'normal' } = {}) {
  const hasBeer = drinks.includes('beer');
  const hasShots = drinks.includes('shots');
  const rounds = names.length;

  return Array.from({ length: rounds }, () => {
    const name = names[Math.floor(Math.random() * names.length)];

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

// ── ANSI kleuren ──────────────────────────────────────────────────────────────

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  magenta: '\x1b[35m',
  red:     '\x1b[31m',
  gray:    '\x1b[90m',
};

function bold(s)    { return `${c.bold}${s}${c.reset}`; }
function yellow(s)  { return `${c.yellow}${s}${c.reset}`; }
function cyan(s)    { return `${c.cyan}${s}${c.reset}`; }
function green(s)   { return `${c.green}${s}${c.reset}`; }
function magenta(s) { return `${c.magenta}${s}${c.reset}`; }
function gray(s)    { return `${c.gray}${s}${c.reset}`; }
function red(s)     { return `${c.red}${s}${c.reset}`; }

// ── CLI args parsen ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
${bold('Drinkschema CLI')} — preview de drankdistributie voor een liedje

${bold('Gebruik:')}
  node cli.js [namen...] [opties]

${bold('Opties:')}
  --shots       Voeg shots toe aan het drankpakket
  --no-beer     Verwijder bier uit het drankpakket (alleen nuttig met --shots)
  --rogue       Rogue modus: veel meer adtjes, weinig slokken
  --gekke       Gekke modus: GPT bedenkt een grappige manier voor elk adtje
  -h, --help    Toon deze hulptekst

${bold('Voorbeelden:')}
  node cli.js
  node cli.js Jan Piet Marie Klaas
  node cli.js Jan Piet Marie Klaas --shots
  node cli.js Jan Piet Marie Klaas --shots --no-beer
  node cli.js Jan Piet Marie Klaas --rogue
  node cli.js Jan Piet Marie Klaas --rogue --gekke
`);
  process.exit(0);
}

const flags = new Set(args.filter((a) => a.startsWith('--') || a.startsWith('-')));
const names = args.filter((a) => !a.startsWith('-'));

const hasShots  = flags.has('--shots');
const noBeer    = flags.has('--no-beer');
const isRogue   = flags.has('--rogue');
const isGekke   = flags.has('--gekke');

const drinks = [];
if (!noBeer) drinks.push('beer');
if (hasShots) drinks.push('shots');
if (drinks.length === 0) drinks.push('beer'); // fallback

const severity = isRogue ? 'rogue' : 'normal';

const players = names.length >= 2
  ? names
  : ['Speler 1', 'Speler 2', 'Speler 3', 'Speler 4'];

// ── Output ────────────────────────────────────────────────────────────────────

const drinkLabel = drinks.map((d) => d === 'beer' ? '🍺 bier' : '🥃 shots').join(' + ');
const severityLabel = severity === 'rogue'
  ? red('🔥 ROGUE')
  : green('😊 normaal');
const gekkeLabel = isGekke ? magenta('  +  🤪 gekke modus') : '';

console.log('');
console.log(bold('═══════════════════════════════════'));
console.log(bold(' 🎵 Drinkschema Preview'));
console.log(bold('═══════════════════════════════════'));
console.log(`  Spelers  : ${cyan(players.join(', '))}`);
console.log(`  Dranken  : ${drinkLabel}`);
console.log(`  Modus    : ${severityLabel}${gekkeLabel}`);
console.log(bold('───────────────────────────────────'));

const schedule = generateDrinkingSchedule(players, { drinks, severity });

schedule.forEach((r, i) => {
  const num = gray(`Ronde ${String(i + 1).padStart(2, ' ')}`);
  const isAdtje = /adtje|biertje/i.test(r.punishment);
  const gekkeSuffix = (isGekke && isAdtje) ? magenta('  ← 🤪 GPT bedenkt de manier') : '';
  if (r.type === 'gezamenlijk') {
    console.log(`  ${num}  ${yellow('🍻 ' + r.punishment)}  ${gray('← iedereen')}${gekkeSuffix}`);
  } else {
    console.log(`  ${num}  ${r.punishment}${gekkeSuffix}`);
  }
});

console.log(bold('───────────────────────────────────'));
console.log(gray('  Druk nogmaals op ↑ Enter om opnieuw te genereren'));
console.log('');
