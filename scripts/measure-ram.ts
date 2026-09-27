/**
 * Mide la memoria real de un ejecutable de Duvarret (RNF-02: el reproductor debe operar con
 * menos de 150 MB). Suma la PSS de todo el árbol de procesos —el shell de Rust y los procesos de
 * WebKit— para no contar dos veces las bibliotecas compartidas. Solo Linux (/proc).
 *
 *   npm run medir-ram -- <ejecutable> [--segundos 30] [--limite 150] [--captura ventana.png] [--clic 640,456@8 …]
 *
 * Sin pantalla, arranca un Xvfb propio. Usa un HOME temporal para no depender de datos previos.
 * `--clic x,y@s` pulsa en esas coordenadas a los s segundos (xdotool) para medir mientras se juega.
 * Además de la PSS se informa la memoria privada (USS): lo que el programa ocupa en exclusiva.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

interface Sample {
  at: number;
  pssKb: number;
  ussKb: number;
  rssKb: number;
  processes: { pid: number; name: string; pssKb: number; ussKb: number }[];
}

function parseArgs(argv: string[]) {
  const [binary, ...rest] = argv;
  const flag = (name: string) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (!binary) throw new Error('Uso: npm run medir-ram -- <ejecutable> [--segundos 30] [--limite 150] [--captura ventana.png] [--clic x,y@s …]');
  const clicks = rest.flatMap((arg, i) => (rest[i - 1] === '--clic' ? [arg] : [])).map((spec) => {
    const m = spec.match(/^(\d+),(\d+)@(\d+(?:\.\d+)?)$/);
    if (!m) throw new Error(`Clic no válido: «${spec}» (formato x,y@segundos)`);
    return { x: m[1]!, y: m[2]!, at: Number(m[3]) };
  });
  return {
    binary: resolve(binary),
    seconds: Number(flag('segundos') ?? 30),
    limitMb: Number(flag('limite') ?? 150),
    screenshot: flag('captura'),
    clicks,
  };
}

const readField = (path: string, field: string): number => {
  try {
    const match = readFileSync(path, 'utf8').match(new RegExp(`^${field}:\\s+(\\d+)`, 'm'));
    return match ? Number(match[1]) : 0;
  } catch {
    return 0; // El proceso terminó entre la lista y la lectura.
  }
};

/** Todos los descendientes de `root` (incluido), leyendo el padre de cada proceso en /proc. */
function processTree(root: number): number[] {
  const parents = new Map<number, number>();
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
      // El nombre va entre paréntesis y puede contener espacios: se parte tras el último «)».
      const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
      parents.set(Number(entry), ppid);
    } catch {
      /* proceso efímero */
    }
  }
  const tree = [root];
  for (let i = 0; i < tree.length; i++) for (const [pid, ppid] of parents) if (ppid === tree[i]) tree.push(pid);
  return tree.filter((pid) => existsSync(`/proc/${pid}`));
}

function sample(root: number, startedAt: number): Sample {
  const processes = processTree(root).map((pid) => {
    let name = String(pid);
    try {
      name = readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
    } catch {
      /* ya no existe */
    }
    const rollup = `/proc/${pid}/smaps_rollup`;
    return { pid, name, pssKb: readField(rollup, 'Pss'), ussKb: readField(rollup, 'Private_Clean') + readField(rollup, 'Private_Dirty'), rssKb: readField(`/proc/${pid}/status`, 'VmRSS') };
  });
  return {
    at: (Date.now() - startedAt) / 1000,
    pssKb: processes.reduce((s, p) => s + p.pssKb, 0),
    ussKb: processes.reduce((s, p) => s + p.ussKb, 0),
    rssKb: processes.reduce((s, p) => s + p.rssKb, 0),
    processes: processes.map(({ pid, name, pssKb, ussKb }) => ({ pid, name, pssKb, ussKb })),
  };
}

const mb = (kb: number) => (kb / 1024).toFixed(1);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

async function startDisplay(): Promise<{ display: string; server: ChildProcess | null }> {
  if (process.env.DISPLAY) return { display: process.env.DISPLAY, server: null };
  for (let n = 99; n < 120; n++) {
    if (existsSync(`/tmp/.X11-unix/X${n}`)) continue;
    const server = spawn('Xvfb', [`:${n}`, '-screen', '0', '1440x900x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
    await sleep(800);
    if (server.exitCode === null) return { display: `:${n}`, server };
  }
  throw new Error('No hay pantalla ni se pudo arrancar Xvfb (instálalo o define DISPLAY).');
}

async function main() {
  if (process.platform !== 'linux') throw new Error('La medición usa /proc y solo funciona en Linux.');
  const { binary, seconds, limitMb, screenshot, clicks } = parseArgs(process.argv.slice(2));
  if (!existsSync(binary)) throw new Error(`No existe ${binary}`);

  const { display, server } = await startDisplay();
  const home = mkdtempSync(join(tmpdir(), 'duvarret-ram-'));
  const app = spawn(binary, [], { env: { ...process.env, DISPLAY: display, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local/share') }, stdio: 'ignore' });
  const startedAt = Date.now();
  const samples: Sample[] = [];
  try {
    while ((Date.now() - startedAt) / 1000 < seconds) {
      await sleep(1000);
      if (app.exitCode !== null) throw new Error(`El ejecutable terminó antes de tiempo (código ${app.exitCode}).`);
      samples.push(sample(app.pid!, startedAt));
      const elapsed = (Date.now() - startedAt) / 1000;
      for (const click of clicks.filter((c) => c.at <= elapsed && c.at > elapsed - 1)) {
        execFileSync('xdotool', ['mousemove', click.x, click.y, 'click', '1'], { env: { ...process.env, DISPLAY: display } });
      }
    }
    if (screenshot) execFileSync('import', ['-display', display, '-window', 'root', resolve(screenshot)]);
  } finally {
    app.kill('SIGTERM');
    await sleep(500);
    for (const pid of app.pid ? processTree(app.pid) : []) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* ya terminó */
      }
    }
    server?.kill('SIGTERM');
    rmSync(home, { recursive: true, force: true });
  }

  // Régimen estable: la mediana de la segunda mitad (tras la carga inicial).
  const tail = samples.slice(Math.floor(samples.length / 2));
  const steady = median(tail.map((s) => s.pssKb));
  const steadyUss = median(tail.map((s) => s.ussKb));
  const peak = Math.max(...samples.map((s) => s.pssKb));
  const last = samples.at(-1)!;
  console.log(`\nMemoria de ${binary} durante ${seconds} s (${samples.length} muestras)`);
  console.log(`  ${'Proceso'.padEnd(18)} ${'PSS'.padStart(10)} ${'Privada'.padStart(10)}`);
  for (const p of last.processes) console.log(`  ${p.name.padEnd(18)} ${mb(p.pssKb).padStart(7)} MB ${mb(p.ussKb).padStart(7)} MB`);
  console.log(`  ${'Total estable'.padEnd(18)} ${mb(steady).padStart(7)} MB (PSS)`);
  console.log(`  ${'Pico'.padEnd(18)} ${mb(peak).padStart(7)} MB (PSS)`);
  console.log(`  ${'Privada estable'.padEnd(18)} ${mb(steadyUss).padStart(7)} MB (USS: sin bibliotecas compartidas)`);
  console.log(`  ${'RSS sumada'.padEnd(18)} ${mb(last.rssKb).padStart(7)} MB (cuenta varias veces lo compartido)`);
  const ok = steady / 1024 < limitMb;
  console.log(ok ? `✓ Por debajo de ${limitMb} MB` : `✗ Supera ${limitMb} MB`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
