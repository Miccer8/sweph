// Funzioni di utilità per calcoli astrologici

// Converte longitudine in segno zodiacale con gradi, minuti e secondi
export function getZodiacSign(longitude) {
    const signs = [
        'Ariete', 'Toro', 'Gemelli', 'Cancro',
        'Leone', 'Vergine', 'Bilancia', 'Scorpione',
        'Sagittario', 'Capricorno', 'Acquario', 'Pesci'
    ];

    // Normalizza la longitudine tra 0-360
    let normalizedLon = longitude % 360;
    if (normalizedLon < 0) normalizedLon += 360;

    const signIndex = Math.floor(normalizedLon / 30);
    const degreeInSign = normalizedLon % 30;
    const degree = Math.floor(degreeInSign);
    const minute = Math.floor((degreeInSign % 1) * 60);
    const second = Math.floor(((degreeInSign % 1) * 60 % 1) * 60);

    return {
        sign: signs[signIndex],
        signIndex: signIndex,
        degree: degree,
        minute: minute,
        second: second,
        formatted: `${degree}°${minute}'${second}" ${signs[signIndex]}`
    };
}

// Calcola in quale casa si trova un pianeta
export function getPlanetInHouse(planetLongitude, houseCusps) {
    // Normalizza la longitudine del pianeta
    let planetLon = planetLongitude % 360;
    if (planetLon < 0) planetLon += 360;

    for (let i = 0; i < 12; i++) {
        let currentCusp = houseCusps[i] % 360;
        let nextCusp = houseCusps[(i + 1) % 12] % 360;

        if (currentCusp < 0) currentCusp += 360;
        if (nextCusp < 0) nextCusp += 360;

        let inHouse = false;

        if (nextCusp > currentCusp) {
            // Casa normale
            inHouse = planetLon >= currentCusp && planetLon < nextCusp;
        } else {
            // Casa che attraversa 0° Ariete
            inHouse = planetLon >= currentCusp || planetLon < nextCusp;
        }

        if (inHouse) {
            return i + 1; // Case numerate da 1 a 12
        }
    }
    return 1; // Fallback alla prima casa
}

// Calcola aspetti tra pianeti
export function calculateAspects(pos1, pos2, orbs = { conjunction: 8, sextile: 6, square: 8, trine: 8, opposition: 8 }) {
    let diff = Math.abs(pos1 - pos2);
    if (diff > 180) diff = 360 - diff;

    const aspects = [];

    // Congiunzione (0°)
    if (diff <= orbs.conjunction) {
        aspects.push({ type: 'Congiunzione', orb: diff.toFixed(2), degrees: 0 });
    }

    // Sestile (60°)
    if (Math.abs(diff - 60) <= orbs.sextile) {
        aspects.push({ type: 'Sestile', orb: Math.abs(diff - 60).toFixed(2), degrees: 60 });
    }

    // Quadratura (90°)
    if (Math.abs(diff - 90) <= orbs.square) {
        aspects.push({ type: 'Quadratura', orb: Math.abs(diff - 90).toFixed(2), degrees: 90 });
    }

    // Trigono (120°)
    if (Math.abs(diff - 120) <= orbs.trine) {
        aspects.push({ type: 'Trigono', orb: Math.abs(diff - 120).toFixed(2), degrees: 120 });
    }

    // Opposizione (180°)
    if (Math.abs(diff - 180) <= orbs.opposition) {
        aspects.push({ type: 'Opposizione', orb: Math.abs(diff - 180).toFixed(2), degrees: 180 });
    }

    return aspects;
}

// Nomi delle case astrologiche
export function getHouseNames() {
    return {
        1: "I Casa - Ascendente",
        2: "II Casa - Denaro e Valori",
        3: "III Casa - Comunicazione",
        4: "IV Casa - Fondo Cielo",
        5: "V Casa - Creatività",
        6: "VI Casa - Lavoro e Salute",
        7: "VII Casa - Discendente",
        8: "VIII Casa - Trasformazione",
        9: "IX Casa - Filosofia",
        10: "X Casa - Medio Cielo",
        11: "XI Casa - Amicizie",
        12: "XII Casa - Subconscio"
    };
}

// Genera tabella mensile per transiti
export function generateMonthlyTable(startDate, endDate) {
    const months = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    let current = new Date(start.getFullYear(), start.getMonth(), 1);

    while (current <= end) {
        months.push({
            year: current.getFullYear(),
            month: current.getMonth() + 1,
            monthName: current.toLocaleString('it-IT', { month: 'long' }),
            startOfMonth: new Date(current),
            endOfMonth: new Date(current.getFullYear(), current.getMonth() + 1, 0)
        });

        current.setMonth(current.getMonth() + 1);
    }

    return months;
}

// Calcola transiti per un mese specifico
export async function calculateMonthlyTransits(year, month, planets, sweph) {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);

    const flag = sweph.constants.SEFLG_SWIEPH;
    const results = {};

    // Calcola posizioni a inizio, metà e fine mese
    const dates = [
        new Date(year, month - 1, 1),
        new Date(year, month - 1, 15),
        new Date(year, month - 1, endOfMonth.getDate())
    ];

    for (const date of dates) {
        const jd = sweph.julday(
            date.getUTCFullYear(),
            date.getUTCMonth() + 1,
            date.getUTCDate(),
            12, // Mezzogiorno
            1
        );

        const dayKey = `${date.getDate()}/${date.getMonth() + 1}`;
        results[dayKey] = {};

        for (const [planetName, planetCode] of Object.entries(planets)) {
            try {
                const result = sweph.calc_ut(jd, sweph.constants[planetCode], flag);

                if (result.data && result.data[0] !== undefined) {
                    const zodiacInfo = getZodiacSign(result.data[0]);
                    results[dayKey][planetName] = {
                        longitude: result.data[0].toFixed(2),
                        zodiac: zodiacInfo
                    };
                }
            } catch (error) {
                results[dayKey][planetName] = { error: error.message };
            }
        }
    }

    return results;
}