// Rasterize the existing geometric SVG icon for the portal's PNG-only upload.
// Usage: node scripts/export-logo.mjs <absolute path to installed sharp module>
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const sharp=require(process.argv[2]||'sharp');
const output=resolve('submission/veristep-logo.png');
await sharp(resolve('frontend/public/icon.svg'),{density:576}).resize(512,512).png().toFile(output);
const metadata=await sharp(output).metadata();
if(metadata.width!==512||metadata.height!==512||metadata.format!=='png')throw new Error('Logo export validation failed');
console.log(JSON.stringify({output,width:metadata.width,height:metadata.height,format:metadata.format}));
