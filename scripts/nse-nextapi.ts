import path from 'node:path';
import { acquireNseNextApi } from '../src/lib/nse-nextapi.js';

const symbol = process.argv[2]?.toUpperCase();
if (!symbol) throw new Error('Usage: npm run nse:nextapi -- ITC');
const root = path.join(process.cwd(), 'research', symbol);
const report = await acquireNseNextApi(symbol, root);
console.log(JSON.stringify(report, null, 2));
