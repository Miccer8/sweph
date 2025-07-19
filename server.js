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


  const result = sweph.swe_calc_ut(jd, ipl, flag);

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

  const flag = sweph.SEFLG_SWIEPH;
  const ipl = sweph.constants[planet];

  if (!ipl) {
    return res.status(400).json({ error: 'Invalid planet name' });
  }

  const result = sweph.swe_calc_ut(jd, ipl, flag);

  if (result.rc < 0) {
    return res.status(500).json({ error: result.error });
  }

  res.json({ planet, jd, position: result.x });
});

app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
