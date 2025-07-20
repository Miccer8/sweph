import express from 'express';
import cors from 'cors';
import sweph from './index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
app.use(cors());
const port = process.env.PORT || 3000;
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Percorso alla cartella ephe
sweph.set_ephe_path(path.join(__dirname, 'ephe'));

// Endpoint di test
app.get('/', (req, res) => {
  res.send('✅ Swiss Ephemeris server online');
});

// 👉 NUOVO ENDPOINT: /transit via GET
app.get('/transit', (req, res) => {
  const { datetime, planet = 'SE_SUN' } = req.query;

  if (!datetime) {
    return res.status(400).json({ error: 'Missing datetime parameter (ISO format)' });
  }

  const jd = sweph.julday(
    new Date(datetime).getUTCFullYear(),
    new Date(datetime).getUTCMonth() + 1,
    new Date(datetime).getUTCDate(),
    new Date(datetime).getUTCHours() + new Date(datetime).getUTCMinutes() / 60,
    1
  );

  const ipl = sweph.constants?.[planet];

if (ipl === undefined) {
  return res.status(400).json({ error: `Invalid planet name: ${planet}` });
}

  const flag = sweph.constants.SEFLG_SWIEPH;

  const result = sweph.calc_ut(jd, ipl, flag);

  if (result.rc < 0) {
    return res.status(500).json({ error: result.error });
  }

  res.json({
    datetime,
    jd,
    planet,
    position: result.x,
  });
});

// ENDPOINT POST già esistente
app.post('/transit', (req, res) => {
  const { jd = 2458849.5, planet = 'SE_SUN' } = req.body;

  const flag = sweph.constants.SEFLG_SWIEPH;
  const ipl = sweph.constants[planet];

  if (!ipl) {
    return res.status(400).json({ error: 'Invalid planet name' });
  }

  const result = sweph.calc_ut(jd, ipl, flag);

  if (result.rc < 0) {
    return res.status(500).json({ error: result.error });
  }

  res.json({ planet, jd, position: result.x });
});

// 📌 Endpoint POST: /chart – calcolo carta completa
app.post('/chart', (req, res) => {
  const { datetime, latitude, longitude } = req.body;

  if (!datetime || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Missing datetime, latitude or longitude' });
  }

  const date = new Date(datetime);
  const jd = sweph.julday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours() + date.getUTCMinutes() / 60,
    1
  );

  const flag = sweph.constants.SEFLG_SWIEPH;
  console.log("🧪 FLAG VALUE:", flag);


  const planets = {
    Sole: 'SE_SUN',
    Luna: 'SE_MOON',
    Mercurio: 'SE_MERCURY',
    Venere: 'SE_VENUS',
    Marte: 'SE_MARS',
    Giove: 'SE_JUPITER',
    Saturno: 'SE_SATURN',
    Urano: 'SE_URANUS',
    Nettuno: 'SE_NEPTUNE',
    Plutone: 'SE_PLUTO',
    Chirone: 'SE_CHIRON',
    'Nodo Nord': 'SE_TRUE_NODE',
    Lilith: 'SE_MEAN_APOG'
  };

  const planetPositions = {};

 for (const [name, code] of Object.entries(planets)) {
  const ipl = sweph.constants?.[code];

  if (typeof ipl !== 'number') {
    console.error(`❌ Costante non valida per ${name}:`, code);
    continue;
  }

  const result = sweph.calc_ut(jd, ipl, flag);

  if (!result || typeof result !== 'object') {
    console.error(`❌ Nessun risultato per ${name}:`, result);
    continue;
  }

  if (typeof result.rc !== 'number' || result.rc < 0) {
    console.error(`❌ Errore nel risultato per ${name}:`, result);
    continue;
  }

  const posArray = Array.isArray(result.x) ? result.x : result.data;

  if (!Array.isArray(posArray) || typeof posArray[0] !== 'number') {
    console.error(`❌ Posizione malformata per ${name}:`, result);
    continue;
  }

  planetPositions[name] = posArray[0];
}

  const houseData = sweph.houses(jd, latitude, longitude, 'P');
  const cusps = houseData.house;
  const asc = cusps[0];
  const mc = cusps[9];

  res.json({
    jd,
    planets: planetPositions,
    houses: cusps,
    ascendant: asc,
    mediumCoeli: mc
  });
});


app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
