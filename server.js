import express from 'express';
import cors from 'cors';
import sweph from './index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getZodiacSign,
  getPlanetInHouse,
  calculateAspects,
  getHouseNames,
  generateMonthlyTable,
  calculateMonthlyTransits
} from './astro-utils.js';

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

    let result;
    try {
      result = sweph.calc_ut(jd, ipl, flag);

      // Controllo del flag
      if (result.flag < 0) {
        throw new Error(`Errore nel calcolo per ${name}: flag=${result.flag}`);
      }

      if (!result || !Array.isArray(result.data) || typeof result.data[0] !== 'number') {
        throw new Error(`Risultato malformato o mancante: ${JSON.stringify(result)}`);
      }

      const pos = Array.isArray(result.data) ? result.data[0] : undefined;

      if (typeof pos !== 'number') {
        throw new Error(`Posizione non valida: ${JSON.stringify(result)}`);
      }

      planetPositions[name] = pos;

    } catch (err) {
      console.error(`❌ Errore nel risultato per ${name}:`, err);
      continue;
    }
  }

  // ✅ Calcolo delle case e risposta finale – UNA SOLA VOLTA
  let houseData;
  try {
    houseData = sweph.houses(jd, latitude, longitude, 'P');

    // Controllo del flag di successo
    if (houseData.flag !== sweph.constants.OK) {
      throw new Error(`Errore nel calcolo delle case: flag=${houseData.flag}`);
    }

    if (!houseData || !houseData.data || !Array.isArray(houseData.data.houses)) {
      throw new Error('houseData.data.houses è undefined o non è un array');
    }
  } catch (err) {
    console.error("❌ Errore nel calcolo delle case:", err);
    return res.status(500).json({ error: "Errore nel calcolo delle case astrologiche" });
  }

  const cusps = houseData.data.houses;
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

// 🔭 TRANSITI A INTERVALLI: /range-transits

const PLANETS_RANGE = {
  Sun: sweph.constants.SE_SUN,
  Moon: sweph.constants.SE_MOON,
  Mercury: sweph.constants.SE_MERCURY,
  Venus: sweph.constants.SE_VENUS,
  Mars: sweph.constants.SE_MARS,
  Jupiter: sweph.constants.SE_JUPITER,
  Saturn: sweph.constants.SE_SATURN,
  Uranus: sweph.constants.SE_URANUS,
  Neptune: sweph.constants.SE_NEPTUNE,
  Pluto: sweph.constants.SE_PLUTO,
  TrueNode: sweph.constants.SE_TRUE_NODE,
  Lilith: sweph.constants.SE_MEAN_APOG,
  Chiron: sweph.constants.SE_CHIRON,
};

function formatToISOString(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().replace('.000Z', 'Z');
}

async function getTransitsInRange(startDate, endDate, stepHours) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start) || isNaN(end) || isNaN(stepHours) || stepHours <= 0) {
    throw new Error('Input non valido: date ISO e stepHours > 0 richiesti.');
  }

  const flag = sweph.constants.SEFLG_SWIEPH;
  const results = [];
  let current = new Date(start);

  while (current <= end) {
    const year = current.getUTCFullYear();
    const month = current.getUTCMonth() + 1;
    const day = current.getUTCDate();
    const hour = current.getUTCHours() + current.getUTCMinutes() / 60;

    const jd = sweph.julday(year, month, day, hour, 1);
    const positions = {};

    for (const [name, code] of Object.entries(PLANETS_RANGE)) {
      try {
        const result = sweph.calc_ut(jd, code, flag);

        if (!result || !Array.isArray(result.data) || typeof result.data[0] !== 'number') {
          throw new Error(`Dati non validi per ${name}`);
        }

        positions[name] = { lon: parseFloat(result.data[0].toFixed(2)) };
      } catch (err) {
        positions[name] = { error: err.message || 'Errore sconosciuto' };
      }
    }

    results.push({
      date: current.toISOString(),
      positions,
    });

    current = new Date(current.getTime() + stepHours * 60 * 60 * 1000);
  }

  return results;
}

app.get('/range-transits', async (req, res) => {
  const { startDate, endDate, stepHours } = req.query;

  console.log('➡️ QUERY PARAMS:', { startDate, endDate, stepHours });

  try {
    const data = await getTransitsInRange(startDate, endDate, parseInt(stepHours));
    res.json({ ok: true, data });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

// 🌟 NUOVO ENDPOINT: /tema-natale - Calcolo completo tema natale
app.post('/tema-natale', (req, res) => {
  const { datetime, latitude, longitude, timezone = 0 } = req.body;

  if (!datetime || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      error: 'Parametri richiesti: datetime (es. "2025-02-14T10:30:00"), latitude, longitude'
    });
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

  // Pianeti da calcolare
  const planets = {
    'Sole': 'SE_SUN',
    'Luna': 'SE_MOON',
    'Mercurio': 'SE_MERCURY',
    'Venere': 'SE_VENUS',
    'Marte': 'SE_MARS',
    'Giove': 'SE_JUPITER',
    'Saturno': 'SE_SATURN',
    'Urano': 'SE_URANUS',
    'Nettuno': 'SE_NEPTUNE',
    'Plutone': 'SE_PLUTO',
    'Chirone': 'SE_CHIRON',
    'Nodo Nord': 'SE_TRUE_NODE',
    'Lilith': 'SE_MEAN_APOG'
  };

  const planetaryData = {};

  // Calcolo case astrologiche
  let houseData;
  try {
    houseData = sweph.houses(jd, latitude, longitude, 'P'); // Sistema Placidus

    if (houseData.flag !== sweph.constants.OK) {
      throw new Error(`Errore nel calcolo delle case: flag=${houseData.flag}`);
    }
  } catch (err) {
    return res.status(500).json({ error: "Errore nel calcolo delle case astrologiche: " + err.message });
  }

  const houseCusps = houseData.data.houses;
  const houseInfo = {};

  // Informazioni sulle case
  for (let i = 0; i < 12; i++) {
    const houseNumber = i + 1;
    const zodiacInfo = getZodiacSign(houseCusps[i]);
    houseInfo[houseNumber] = {
      cusp: houseCusps[i].toFixed(2),
      zodiac: zodiacInfo,
      name: getHouseNames()[houseNumber]
    };
  }

  // Calcolo posizioni planetarie
  for (const [planetName, planetCode] of Object.entries(planets)) {
    const ipl = sweph.constants?.[planetCode];

    if (typeof ipl !== 'number') {
      console.error(`❌ Costante non valida per ${planetName}:`, planetCode);
      continue;
    }

    try {
      const result = sweph.calc_ut(jd, ipl, flag);

      if (result.flag < 0 || !result || !Array.isArray(result.data) || typeof result.data[0] !== 'number') {
        continue;
      }

      const longitude = result.data[0];
      const zodiacInfo = getZodiacSign(longitude);
      const house = getPlanetInHouse(longitude, houseCusps);

      planetaryData[planetName] = {
        longitude: longitude.toFixed(2),
        zodiac: zodiacInfo,
        house: house,
        houseName: getHouseNames()[house]
      };

    } catch (err) {
      console.error(`❌ Errore nel calcolo per ${planetName}:`, err);
      continue;
    }
  }

  // Calcolo aspetti tra tutti i pianeti
  const aspects = [];
  const planetNames = Object.keys(planetaryData);

  for (let i = 0; i < planetNames.length; i++) {
    for (let j = i + 1; j < planetNames.length; j++) {
      const planet1 = planetNames[i];
      const planet2 = planetNames[j];
      const pos1 = parseFloat(planetaryData[planet1].longitude);
      const pos2 = parseFloat(planetaryData[planet2].longitude);

      const planetAspects = calculateAspects(pos1, pos2);

      if (planetAspects.length > 0) {
        aspects.push({
          planet1,
          planet2,
          aspects: planetAspects
        });
      }
    }
  }

  res.json({
    inputData: {
      datetime,
      latitude,
      longitude,
      jd: jd.toFixed(6)
    },
    pianeti: planetaryData,
    case: houseInfo,
    ascendente: {
      longitude: houseCusps[0].toFixed(2),
      zodiac: getZodiacSign(houseCusps[0])
    },
    medioCoeli: {
      longitude: houseCusps[9].toFixed(2),
      zodiac: getZodiacSign(houseCusps[9])
    },
    aspetti: aspects
  });
});

// 🔮 NUOVO ENDPOINT: /transiti-mensili - Transiti planetari tabella mensile
app.get('/transiti-mensili', async (req, res) => {
  const { startDate = '2025-07-01', endDate = '2026-06-30' } = req.query;

  try {
    const monthlyTable = generateMonthlyTable(startDate, endDate);

    const planets = {
      'Sole': 'SE_SUN',
      'Luna': 'SE_MOON',
      'Mercurio': 'SE_MERCURY',
      'Venere': 'SE_VENUS',
      'Marte': 'SE_MARS',
      'Giove': 'SE_JUPITER',
      'Saturno': 'SE_SATURN',
      'Urano': 'SE_URANUS',
      'Nettuno': 'SE_NEPTUNE',
      'Plutone': 'SE_PLUTO',
      'Chirone': 'SE_CHIRON',
      'Nodo Nord': 'SE_TRUE_NODE',
      'Lilith': 'SE_MEAN_APOG'
    };

    const transitData = {};

    for (const monthInfo of monthlyTable) {
      const monthKey = `${monthInfo.monthName} ${monthInfo.year}`;
      transitData[monthKey] = await calculateMonthlyTransits(
        monthInfo.year,
        monthInfo.month,
        planets,
        sweph
      );
    }

    res.json({
      periodo: `${startDate} - ${endDate}`,
      transiti: transitData
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🎯 NUOVO ENDPOINT: /transiti-specifici - Transiti futuri per data specifica
app.post('/transiti-specifici', async (req, res) => {
  const { targetDate, natalData } = req.body;

  if (!targetDate) {
    return res.status(400).json({ error: 'targetDate richiesta (es. "2025-12-25")' });
  }

  const date = new Date(targetDate);
  const jd = sweph.julday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    12, // Mezzogiorno
    1
  );

  const flag = sweph.constants.SEFLG_SWIEPH;

  const planets = {
    'Sole': 'SE_SUN',
    'Luna': 'SE_MOON',
    'Mercurio': 'SE_MERCURY',
    'Venere': 'SE_VENUS',
    'Marte': 'SE_MARS',
    'Giove': 'SE_JUPITER',
    'Saturno': 'SE_SATURN',
    'Urano': 'SE_URANUS',
    'Nettuno': 'SE_NEPTUNE',
    'Plutone': 'SE_PLUTO',
    'Chirone': 'SE_CHIRON',
    'Nodo Nord': 'SE_TRUE_NODE',
    'Lilith': 'SE_MEAN_APOG'
  };

  const transitPositions = {};
  const transitAspects = [];

  // Calcola posizioni dei transiti
  for (const [planetName, planetCode] of Object.entries(planets)) {
    try {
      const result = sweph.calc_ut(jd, sweph.constants[planetCode], flag);

      if (result.data && result.data[0] !== undefined) {
        const longitude = result.data[0];
        const zodiacInfo = getZodiacSign(longitude);

        transitPositions[planetName] = {
          longitude: longitude.toFixed(2),
          zodiac: zodiacInfo
        };
      }
    } catch (error) {
      transitPositions[planetName] = { error: error.message };
    }
  }

  // Se forniti dati natali, calcola aspetti di transito
  if (natalData && natalData.pianeti) {
    for (const [transitPlanet, transitPos] of Object.entries(transitPositions)) {
      if (transitPos.longitude) {
        for (const [natalPlanet, natalPos] of Object.entries(natalData.pianeti)) {
          if (natalPos.longitude) {
            const aspects = calculateAspects(
              parseFloat(transitPos.longitude),
              parseFloat(natalPos.longitude)
            );

            if (aspects.length > 0) {
              transitAspects.push({
                transitPlanet,
                natalPlanet,
                aspects
              });
            }
          }
        }
      }
    }
  }

  res.json({
    data: targetDate,
    jd: jd.toFixed(6),
    posizioniTransiti: transitPositions,
    aspettiDiTransito: transitAspects
  });
});

// 📊 NUOVO ENDPOINT: /tabella-anno - Tabella completa anno astrologico
app.get('/tabella-anno', async (req, res) => {
  const { year = 2025 } = req.query;

  const startDate = `${year}-07-01`; // Luglio anno corrente
  const endDate = `${parseInt(year) + 1}-06-30`; // Giugno anno successivo

  try {
    const monthlyTable = generateMonthlyTable(startDate, endDate);

    // Pianeti principali per la tabella
    const planets = {
      'Sol': 'SE_SUN',
      'Lun': 'SE_MOON',
      'Mer': 'SE_MERCURY',
      'Ven': 'SE_VENUS',
      'Mar': 'SE_MARS',
      'Gio': 'SE_JUPITER',
      'Sat': 'SE_SATURN',
      'Ura': 'SE_URANUS',
      'Net': 'SE_NEPTUNE',
      'Plu': 'SE_PLUTO',
      'Chi': 'SE_CHIRON',
      'NN': 'SE_TRUE_NODE',
      'Lil': 'SE_MEAN_APOG'
    };

    const yearlyData = [];

    for (const monthInfo of monthlyTable) {
      const monthData = {
        mese: monthInfo.monthName,
        anno: monthInfo.year,
        pianeti: {}
      };

      // Calcola posizione al 15 del mese
      const midMonth = new Date(monthInfo.year, monthInfo.month - 1, 15);
      const jd = sweph.julday(
        midMonth.getUTCFullYear(),
        midMonth.getUTCMonth() + 1,
        midMonth.getUTCDate(),
        12,
        1
      );

      const flag = sweph.constants.SEFLG_SWIEPH;

      for (const [planetName, planetCode] of Object.entries(planets)) {
        try {
          const result = sweph.calc_ut(jd, sweph.constants[planetCode], flag);

          if (result.data && result.data[0] !== undefined) {
            const zodiacInfo = getZodiacSign(result.data[0]);
            monthData.pianeti[planetName] = `${zodiacInfo.degree}° ${zodiacInfo.sign}`;
          }
        } catch (error) {
          monthData.pianeti[planetName] = 'Errore';
        }
      }

      yearlyData.push(monthData);
    }

    res.json({
      annoAstrologico: `${year}-${parseInt(year) + 1}`,
      periodo: `Luglio ${year} - Giugno ${parseInt(year) + 1}`,
      tabellaRiepilogativa: yearlyData
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
