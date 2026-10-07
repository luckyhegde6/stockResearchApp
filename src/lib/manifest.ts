import path from 'node:path';
import { writeText } from './fs.js';
import type { ResearchManifest } from '../types/research.js';

export async function writeManifest(researchDir:string, manifest:ResearchManifest){
  await writeText(path.join(researchDir,'manifest.json'),JSON.stringify(manifest,null,2));
}
