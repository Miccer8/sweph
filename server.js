import express from 'express';
import sweph from './index.mjs';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const port = process.env.PORT || 3000;
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Percorso alla cartella ephe
sweph.swe_set_ephe_path(path.join(__dirname, 'ephe'));

app.get('/', (req, res) => {
  res.send('✅ Swiss Ephemeris server online');
});

app.post('/transit', (req, res) => {
  const { jd = 2458849.5, planet = 'SE_SUN' } = req.body;

  const flag = sweph.SEFLG_SWIEPH;
  const ipl = sweph[planet];

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
