import {build} from 'esbuild';
import {readFile,writeFile,copyFile,mkdir,rm,readdir} from 'node:fs/promises';
import {dirname,resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const native=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(native,'..');
const out=join(native,'www');
// Only this disposable, generated directory may be replaced by the builder.
if(relative(native,out)!=='www')throw Error('Unsafe build output');
await mkdir(out,{recursive:true});
const owned=await readdir(out);
for(const file of owned)await rm(join(out,file),{recursive:true,force:true});

const result=await build({
  absWorkingDir:native,
  entryPoints:{'app.bundle':join(root,'app.js')},
  outdir:out,bundle:true,splitting:true,format:'esm',platform:'browser',
  target:['safari15'],minify:true,legalComments:'eof',metafile:true,
  define:{__FUTBOLISTA_PACKAGED__:'true'},
  chunkNames:'chunks/[name]-[hash]',
  plugins:[{name:'same-firebase-sdk-and-shared-source',setup(context){
    context.onResolve({filter:/^https:\/\/www\.gstatic\.com\/firebasejs\//},async args=>{
      const match=args.path.match(/^https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.2\/firebase-(app|auth|firestore)\.js$/);
      if(!match)throw Error(`Unexpected remote module: ${args.path}`);
      return context.resolve(`firebase/${match[1]}`,{resolveDir:native,kind:args.kind});
    });
    context.onResolve({filter:/^\.\.?\/.*\?v=\d+$/},args=>({path:resolve(dirname(args.importer),args.path.split('?')[0])}));
  }}]
});

let html=await readFile(join(root,'index.html'),'utf8');
html=html.replace('<html lang=', '<html class="native-app" lang=').replace(/<link rel="manifest"[^>]*>\s*/,'')
  .replace(/src="\.\/app\.js\?v=\d+"/,'src="./app.bundle.js"')
  .replace(/href="\.\/styles\.css\?v=\d+"/,'href="./styles.css"');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
const csp=`default-src 'self'; script-src 'self' ${inline.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://el-futbolistas.firebaseapp.com; frame-src https://el-futbolistas.firebaseapp.com; object-src 'none'; base-uri 'self'; form-action 'self'`;
html=html.replace('<meta charset="UTF-8" />',`<meta charset="UTF-8" />\n  <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
await writeFile(join(out,'index.html'),html);
for(const file of ['styles.css','policy.css','privacy.html','support.html','icon.svg','apple-touch-icon.png','icon-192.png','icon-512.png'])await copyFile(join(root,file),join(out,file));
const outputs=Object.entries(result.metafile.outputs).map(([path,value])=>({path,bytes:value.bytes,imports:value.imports}));
if(outputs.some(file=>file.imports.some(i=>i.external)))throw Error('Native app must not load remote JavaScript');
await writeFile(join(native,'build-report.json'),JSON.stringify({release:'500412',firebaseSDK:'10.12.2',appId:'live.ftbll.futbolista',remoteJavaScript:false,outputs},null,2));
console.log(JSON.stringify({built:true,release:'500412',javascriptBytes:outputs.reduce((n,f)=>n+f.bytes,0),remoteJavaScript:false}));
