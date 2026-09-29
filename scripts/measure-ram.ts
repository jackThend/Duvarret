/**
 * Mide la memoria real de un ejecutable de Duvarret (RNF-02: el reproductor debe operar con
 * menos de 150 MB). Suma todos los procesos de la ventana —el shell de Rust y los del motor web—
 * con la métrica que cada sistema considera «memoria del programa»:
 *
 *   - Linux: PSS (reparte las bibliotecas compartidas) y memoria privada (USS), desde /proc.
 *   - Windows: conjunto de trabajo privado (la columna «Memoria» del Administrador de tareas).
 *   - macOS: `footprint` (lo que muestra el Monitor de Actividad).
 *
 *   npm run medir-ram -- <ejecutable> [--segundos 30] [--limite 150] [--solo-medir] [--nombre texto]
 *                        [--informe salida.json] [--tecla Tab@7 --tecla Enter@8 …] [--captura ventana.png] [--clic 640,456@8 …]
 *
 * En Linux sin pantalla arranca un Xvfb propio; `--clic x,y@s` (xdotool) y `--captura` (ImageMagick)
 * solo funcionan allí. `--solo-medir` informa sin fallar por el límite. Si existe
 * `GITHUB_STEP_SUMMARY`, añade una tabla al resumen de la ejecución del CI.
 */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

interface ProcInfo {
  pid: number;
  ppid: number;
  name: string;
}

interface ProcMemory {
  pid: number;
  name: string;
  /** Métrica principal del sistema, en KB. */
  mainKb: number;
  /** Métrica secundaria (USS, conjunto de trabajo total o RSS), en KB. */
  otherKb: number;
}

interface Sample {
  at: number;
  mainKb: number;
  otherKb: number;
  processes: ProcMemory[];
}

interface Platform {
  main: string;
  other: string;
  /** Procesos auxiliares del motor web que no cuelgan del ejecutable (XPC de WebKit en macOS). */
  helpers?: RegExp;
  list(): ProcInfo[];
  memory(procs: ProcInfo[]): ProcMemory[];
  kill(pid: number): void;
}

function parseArgs(argv: string[]) {
  const [binary, ...rest] = argv;
  const flag = (name: string) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  if (!binary) throw new Error('Uso: npm run medir-ram -- <ejecutable> [--segundos 30] [--limite 150] [--solo-medir] [--nombre texto] [--informe salida.json] [--captura ventana.png] [--clic x,y@s …]');
  const clicks = rest.flatMap((arg, i) => (rest[i - 1] === '--clic' ? [arg] : [])).map((spec) => {
    const m = spec.match(/^(\d+),(\d+)@(\d+(?:\.\d+)?)$/);
    if (!m) throw new Error(`Clic no válido: «${spec}» (formato x,y@segundos)`);
    return { x: m[1]!, y: m[2]!, at: Number(m[3]) };
  });
  const keys = rest.flatMap((arg, i) => (rest[i - 1] === '--tecla' ? [arg] : [])).map((spec) => {
    const m = spec.match(/^(\w+)@(\d+(?:\.\d+)?)$/);
    if (!m) throw new Error(`Tecla no válida: «${spec}» (formato Enter@segundos)`);
    return { key: m[1]!, at: Number(m[2]) };
  });
  return {
    binary: resolve(binary),
    keys,
    seconds: Number(flag('segundos') ?? 30),
    limitMb: Number(flag('limite') ?? 150),
    measureOnly: rest.includes('--solo-medir'),
    label: flag('nombre') ?? basename(binary),
    report: flag('informe'),
    screenshot: flag('captura'),
    clicks,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mb = (kb: number) => (kb / 1024).toFixed(1);
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

// ── Linux ──────────────────────────────────────────────────────────────────────────────────────

const readField = (path: string, field: string): number => {
  try {
    const match = readFileSync(path, 'utf8').match(new RegExp(`^${field}:\\s+(\\d+)`, 'm'));
    return match ? Number(match[1]) : 0;
  } catch {
    return 0; // El proceso terminó entre la lista y la lectura.
  }
};

const linux: Platform = {
  main: 'PSS',
  other: 'Privada (USS)',
  // WebKitGTK puede lanzar sus procesos a través de un sandbox (bwrap) que los deja fuera del árbol.
  helpers: /^WebKit/,
  list() {
    const procs: ProcInfo[] = [];
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue;
      try {
        const stat = readFileSync(`/proc/${entry}/stat`, 'utf8');
        // El nombre va entre paréntesis y puede contener espacios: se parte tras el último «)».
        const ppid = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
        procs.push({ pid: Number(entry), ppid, name: stat.slice(stat.indexOf('(') + 1, stat.lastIndexOf(')')) });
      } catch {
        /* proceso efímero */
      }
    }
    return procs;
  },
  memory(procs) {
    return procs.map(({ pid, name }) => {
      const rollup = `/proc/${pid}/smaps_rollup`;
      return { pid, name, mainKb: readField(rollup, 'Pss'), otherKb: readField(rollup, 'Private_Clean') + readField(rollup, 'Private_Dirty') };
    });
  },
  kill(pid) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* ya terminó */
    }
  },
};

// ── Windows ────────────────────────────────────────────────────────────────────────────────────

const powershell = (script: string) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });

const windows: Platform = {
  main: 'Privada (conjunto de trabajo)',
  other: 'Conjunto de trabajo',
  helpers: /^msedgewebview2/i,
  list() {
    const json = powershell('ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | ForEach-Object { @{ i = [int]$_.ProcessId; p = [int]$_.ParentProcessId; n = [string]$_.Name } })');
    return (JSON.parse(json) as { i: number; p: number; n: string }[]).map((r) => ({ pid: r.i, ppid: r.p, name: r.n }));
  },
  memory(procs) {
    if (!procs.length) return [];
    const filter = procs.map((p) => `IDProcess=${p.pid}`).join(' OR ');
    const json = powershell(`ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_PerfFormattedData_PerfProc_Process -Filter "${filter}" | ForEach-Object { @{ i = [int]$_.IDProcess; pr = [int64]$_.WorkingSetPrivate; ws = [int64]$_.WorkingSet } })`);
    const rows = new Map((JSON.parse(json || '[]') as { i: number; pr: number; ws: number }[]).map((r) => [r.i, r]));
    return procs.flatMap(({ pid, name }) => {
      const row = rows.get(pid);
      return row ? [{ pid, name, mainKb: row.pr / 1024, otherKb: row.ws / 1024 }] : [];
    });
  },
  kill(pid) {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      /* ya terminó */
    }
  },
};

// ── macOS ──────────────────────────────────────────────────────────────────────────────────────

const UNITS: Record<string, number> = { B: 1 / 1024, KB: 1, MB: 1024, GB: 1024 * 1024 };
let footprintWarned = false;

/** `footprint` informa por proceso «nombre [pid]: … Footprint: 45 MB». */
function footprints(pids: number[]): Map<number, number> {
  const found = new Map<number, number>();
  for (const cmd of [['footprint'], ['sudo', '-n', 'footprint']]) {
    let out: string;
    try {
      out = execFileSync(cmd[0]!, [...cmd.slice(1), ...pids.map(String)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      out = String((error as { stdout?: string }).stdout ?? '');
    }
    for (const m of out.matchAll(/\[(\d+)\][^\n]*?Footprint:\s*([\d.,]+)\s*(B|KB|MB|GB)/g)) found.set(Number(m[1]), Number(m[2]!.replace(',', '.')) * UNITS[m[3]!]!);
    if (found.size) return found;
    if (!footprintWarned) {
      footprintWarned = true;
      console.warn(`(footprint no devolvió datos con «${cmd.join(' ')}»; salida: ${out.slice(0, 300).replace(/\n/g, ' ⏎ ')})`);
    }
  }
  return found;
}

const macos: Platform = {
  main: 'Footprint',
  other: 'RSS',
  helpers: /com\.apple\.WebKit\./,
  list() {
    const out = execFileSync('ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8' });
    return out.split('\n').flatMap((line) => {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), name: basename(m[3]!.trim()) }] : [];
    });
  },
  memory(procs) {
    if (!procs.length) return [];
    const rss = new Map(
      execFileSync('ps', ['-o', 'pid=,rss=', '-p', procs.map((p) => p.pid).join(',')], { encoding: 'utf8' })
        .split('\n')
        .flatMap((line) => {
          const m = line.match(/^\s*(\d+)\s+(\d+)/);
          return m ? [[Number(m[1]), Number(m[2])] as const] : [];
        }),
    );
    const fp = footprints(procs.map((p) => p.pid));
    return procs.flatMap(({ pid, name }) => (rss.has(pid) ? [{ pid, name, mainKb: fp.get(pid) ?? rss.get(pid)!, otherKb: rss.get(pid)! }] : []));
  },
  kill: linux.kill,
};

/**
 * Pulsa una tecla de verdad (evento del sistema, no sintético) en la ventana del ejecutable, para
 * medir mientras se juega: el navegador solo deja sonar el audio tras un gesto real.
 */
function pressKey(key: string, pid: number, display: string | undefined) {
  try {
    if (process.platform === 'linux') {
      // Sin gestor de ventanas (Xvfb), la ventana no recibe el foco del teclado por sí sola.
      const env = { ...process.env, DISPLAY: display };
      const window = execFileSync('xdotool', ['search', '--pid', String(pid)], { env, encoding: 'utf8' }).trim().split('\n').at(-1);
      if (window) execFileSync('xdotool', ['windowfocus', '--sync', window], { env });
      execFileSync('xdotool', ['key', key === 'Enter' ? 'Return' : key], { env });
    } else if (process.platform === 'win32') {
      const code = ({ Enter: '{ENTER}', Tab: '{TAB}', Space: ' ' } as Record<string, string>)[key] ?? key;
      powershell(`$w = New-Object -ComObject WScript.Shell; $null = $w.AppActivate(${pid}); Start-Sleep -Milliseconds 400; $w.SendKeys('${code}')`);
    } else if (process.platform === 'darwin') {
      const code = ({ Enter: 'key code 36', Tab: 'key code 48', Space: 'key code 49' } as Record<string, string>)[key] ?? `keystroke "${key}"`;
      execFileSync('osascript', ['-e', `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`, '-e', 'delay 0.4', '-e', `tell application "System Events" to ${code}`]);
    }
    console.log(`(tecla ${key} pulsada)`);
  } catch (error) {
    console.warn(`(no se pudo pulsar ${key}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)})`);
  }
}

/**
 * Captura la pantalla. En Windows imprime también el color medio: la portada de una obra es oscura
 * y una página que no ha cargado se ve blanca, así el registro del CI dice si la obra llegó a abrirse.
 */
function capture(file: string, display: string | undefined) {
  try {
    if (process.platform === 'linux') execFileSync('import', ['-display', display!, '-window', 'root', file]);
    else if (process.platform === 'darwin') execFileSync('screencapture', ['-x', file]);
    else if (process.platform === 'win32') {
      const rgb = powershell(
        `Add-Type -AssemblyName System.Drawing, System.Windows.Forms; $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; ` +
          `$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); ` +
          `$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp.Save('${file}', [System.Drawing.Imaging.ImageFormat]::Png); ` +
          `$r = 0; $gr = 0; $bl = 0; $n = 0; for ($x = 0; $x -lt $b.Width; $x += 16) { for ($y = 0; $y -lt $b.Height; $y += 16) { $c = $bmp.GetPixel($x, $y); $r += $c.R; $gr += $c.G; $bl += $c.B; $n++ } }; ` +
          `'{0},{1},{2}' -f [int]($r / $n), [int]($gr / $n), [int]($bl / $n)`,
      ).trim();
      console.log(`(color medio de la pantalla: rgb(${rgb}))`);
    }
    console.log(`(captura: ${file})`);
  } catch (error) {
    console.warn(`(no se pudo capturar la pantalla: ${error instanceof Error ? error.message.split('\n')[0] : String(error)})`);
  }
}

// ── Medición ───────────────────────────────────────────────────────────────────────────────────

/** El ejecutable, sus descendientes y los auxiliares del motor web aparecidos tras arrancarlo. */
function windowProcesses(platform: Platform, root: number, preexisting: Set<number>): ProcInfo[] {
  const procs = platform.list();
  const tree = new Set([root]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of procs) {
      if (tree.has(p.pid) || !tree.has(p.ppid)) continue;
      tree.add(p.pid);
      grew = true;
    }
  }
  return procs.filter((p) => tree.has(p.pid) || (platform.helpers?.test(p.name) && !preexisting.has(p.pid)));
}

async function startDisplay(): Promise<{ display: string | undefined; server: ChildProcess | null }> {
  if (process.platform !== 'linux' || process.env.DISPLAY) return { display: process.env.DISPLAY, server: null };
  for (let n = 99; n < 120; n++) {
    if (existsSync(`/tmp/.X11-unix/X${n}`)) continue;
    const server = spawn('Xvfb', [`:${n}`, '-screen', '0', '1440x900x24', '-nolisten', 'tcp'], { stdio: 'ignore' });
    await sleep(800);
    if (server.exitCode === null) return { display: `:${n}`, server };
  }
  throw new Error('No hay pantalla ni se pudo arrancar Xvfb (instálalo o define DISPLAY).');
}

async function main() {
  const platform = { linux, win32: windows, darwin: macos }[process.platform as string];
  if (!platform) throw new Error(`Sistema no compatible: ${process.platform}`);
  const { binary, seconds, limitMb, measureOnly, label, report, screenshot, clicks, keys } = parseArgs(process.argv.slice(2));
  if (!existsSync(binary)) throw new Error(`No existe ${binary}`);
  if (process.platform !== 'linux' && clicks.length) throw new Error('--clic solo funciona en Linux.');

  const { display, server } = await startDisplay();
  const home = mkdtempSync(join(tmpdir(), 'duvarret-ram-'));
  // HOME temporal para no depender de datos previos (en Windows, WebView2 usa %LOCALAPPDATA%).
  const env = process.platform === 'win32' ? process.env : { ...process.env, HOME: home, XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local/share'), ...(display ? { DISPLAY: display } : {}) };
  const preexisting = new Set(platform.helpers ? platform.list().filter((p) => platform.helpers!.test(p.name)).map((p) => p.pid) : []);
  const app = spawn(binary, [], { env, stdio: 'ignore' });
  const startedAt = Date.now();
  const samples: Sample[] = [];
  const pressed = new Set<(typeof keys)[number]>();
  try {
    while ((Date.now() - startedAt) / 1000 < seconds) {
      await sleep(1000);
      if (app.exitCode !== null) throw new Error(`El ejecutable terminó antes de tiempo (código ${app.exitCode}).`);
      const processes = platform.memory(windowProcesses(platform, app.pid!, preexisting));
      samples.push({ at: (Date.now() - startedAt) / 1000, mainKb: processes.reduce((s, p) => s + p.mainKb, 0), otherKb: processes.reduce((s, p) => s + p.otherKb, 0), processes });
      const elapsed = (Date.now() - startedAt) / 1000;
      for (const key of keys.filter((k) => k.at <= elapsed && !pressed.has(k))) {
        pressed.add(key);
        pressKey(key.key, app.pid!, display);
      }
      for (const click of clicks.filter((c) => c.at <= elapsed && c.at > elapsed - 1)) {
        execFileSync('xdotool', ['mousemove', click.x, click.y, 'click', '1'], { env: { ...process.env, DISPLAY: display } });
      }
    }
    if (screenshot) capture(resolve(screenshot), display);
  } finally {
    const leftovers = app.pid ? windowProcesses(platform, app.pid, preexisting) : [];
    app.kill();
    await sleep(500);
    for (const p of leftovers) platform.kill(p.pid);
    server?.kill('SIGTERM');
    rmSync(home, { recursive: true, force: true });
  }
  if (!samples.length) throw new Error('No se tomó ninguna muestra (aumenta --segundos).');

  // Una muestra es incompleta si le falta algún proceso o alguno se leyó a medias (cero): pasa
  // cuando un proceso del motor web se reinicia o termina entre la lista y la lectura.
  // También lo es si no aparece ningún proceso del motor web: sin él la cifra no significa nada.
  const hasEngine = (s: Sample) => !platform.helpers || s.processes.some((p) => platform.helpers!.test(p.name));
  const fullCount = Math.max(...samples.map((s) => s.processes.length));
  const complete = samples.filter((s) => hasEngine(s) && s.processes.length === fullCount && s.processes.every((p) => p.mainKb > 0));
  const discarded = samples.length - complete.length;
  if (!samples.some(hasEngine)) {
    const seen = [...new Set(samples.flatMap((s) => s.processes.map((p) => p.name)))].join(', ');
    const message = `No se encontraron los procesos del motor web (solo: ${seen}); la medición no es válida.`;
    if (!measureOnly) throw new Error(message);
    console.warn(`⚠ ${message}`);
    if (report) writeFileSync(resolve(report), JSON.stringify({ label, platform: process.platform, valid: false, error: message }, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Memoria · ${label} (${process.platform})\n\n⚠ ${message}\n`);
    return;
  }
  const usable = complete.length ? complete : samples;
  // Régimen estable: la mediana de la segunda mitad (tras la carga inicial).
  const tail = usable.slice(Math.floor(usable.length / 2));
  const steady = median(tail.map((s) => s.mainKb));
  const steadyOther = median(tail.map((s) => s.otherKb));
  const peak = Math.max(...samples.map((s) => s.mainKb));
  const last = usable.at(-1)!;
  if (discarded) console.warn(`(${discarded} de ${samples.length} muestras incompletas descartadas: faltaba algún proceso o se leyó a medias)`);
  console.log(`\nMemoria de ${label} en ${process.platform} durante ${seconds} s (${samples.length} muestras)`);
  console.log(`  ${'Proceso'.padEnd(34)} ${platform.main.padStart(30)} ${platform.other.padStart(22)}`);
  for (const p of last.processes) console.log(`  ${p.name.slice(0, 34).padEnd(34)} ${`${mb(p.mainKb)} MB`.padStart(30)} ${`${mb(p.otherKb)} MB`.padStart(22)}`);
  console.log(`  ${'Total estable'.padEnd(34)} ${`${mb(steady)} MB`.padStart(30)} ${`${mb(steadyOther)} MB`.padStart(22)}`);
  console.log(`  ${'Pico'.padEnd(34)} ${`${mb(peak)} MB`.padStart(30)}`);
  const ok = steady / 1024 < limitMb;
  console.log(ok ? `✓ Por debajo de ${limitMb} MB` : `✗ Supera ${limitMb} MB`);

  const result = {
    label,
    platform: process.platform,
    seconds,
    valid: true,
    samples: samples.length,
    discarded,
    metric: platform.main,
    steadyMb: +(steady / 1024).toFixed(1),
    peakMb: +(peak / 1024).toFixed(1),
    otherMetric: platform.other,
    otherSteadyMb: +(steadyOther / 1024).toFixed(1),
    processes: last.processes.map((p) => ({ name: p.name, mainMb: +(p.mainKb / 1024).toFixed(1), otherMb: +(p.otherKb / 1024).toFixed(1) })),
  };
  if (report) writeFileSync(resolve(report), JSON.stringify(result, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = result.processes.map((p) => `| ${p.name} | ${p.mainMb} | ${p.otherMb} |`).join('\n');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `\n### Memoria · ${label} (${process.platform})\n\n| Proceso | ${platform.main} (MB) | ${platform.other} (MB) |\n| :--- | ---: | ---: |\n${rows}\n| **Total estable** | **${result.steadyMb}** | **${result.otherSteadyMb}** |\n\nPico: ${result.peakMb} MB · ${samples.length} muestras en ${seconds} s\n`,
    );
  }
  process.exitCode = ok || measureOnly ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
