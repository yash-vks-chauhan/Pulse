import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.split('=');
    return [key, value.length ? value.join('=') : 'true'];
  }),
);

if (args.has('--help') || args.has('-h')) {
  console.log(`Usage:
  node apps/web/video/export-video.mjs [options]

Options:
  --mp3                 Also export pulse-demo.mp3
  --no-audio            Export a silent MP4
  --fps=24              Frame rate
  --duration=80         Timeline duration in seconds
  --out=FILE            MP4 output path, relative to apps/web/video
  --mp3-out=FILE        MP3 output path, relative to apps/web/video
  --keep-frames         Keep temporary rendered JPG frames

Requires ffmpeg. Install with:
  brew install ffmpeg

Or pass a binary explicitly:
  FFMPEG_PATH=/path/to/ffmpeg node apps/web/video/export-video.mjs --mp3`);
  process.exit(0);
}

const width = Number(args.get('--width') || 1920);
const height = Number(args.get('--height') || 1080);
const fps = Number(args.get('--fps') || 24);
const duration = Number(args.get('--duration') || 80);
const quality = Number(args.get('--quality') || 92);
const makeMp3 = args.has('--mp3');
const keepFrames = args.has('--keep-frames');
const withAudio = !args.has('--no-audio');
const outMp4 = path.resolve(__dirname, args.get('--out') || 'pulse-demo.mp4');
const outMp3 = path.resolve(__dirname, args.get('--mp3-out') || 'pulse-demo.mp3');
const htmlPath = path.resolve(__dirname, args.get('--html') || 'pulse-demo.html');

const chromePath =
  process.env.CHROME_PATH ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function commandExists(command) {
  try {
    execFileSync('sh', ['-lc', `command -v ${command}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

async function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (await commandExists('ffmpeg')) return 'ffmpeg';
  throw new Error(
    'ffmpeg not found. Install it with `brew install ffmpeg`, or run with FFMPEG_PATH=/path/to/ffmpeg.',
  );
}

function audioInputs() {
  return [
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=110:duration=${duration}:sample_rate=48000`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=164.81:duration=${duration}:sample_rate=48000`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=220:duration=${duration}:sample_rate=48000`,
  ];
}

function audioFilter() {
  return '[1:a][2:a][3:a]amix=inputs=3:duration=longest,lowpass=f=520,volume=0.045[a]';
}

async function main() {
  const ffmpeg = await findFfmpeg();
  const framesDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pulse-demo-frames-'));
  const frameCount = Math.round(duration * fps);

  console.log(`Rendering ${frameCount} frames at ${width}x${height}, ${fps}fps...`);
  console.log(`Frames: ${framesDir}`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      '--allow-file-access-from-files',
      '--disable-web-security',
      `--window-size=${width},${height + 44}`,
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: height + 44, deviceScaleFactor: 1 });

    page.on('pageerror', (error) => console.error(error.message));
    page.on('console', (message) => {
      if (['error'].includes(message.type())) console.error(message.text());
    });

    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: 'networkidle2',
      timeout: 60_000,
    });

    await page.evaluate(() => document.fonts && document.fonts.ready);

    const handles = await page.evaluateHandle(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      const stage = divs.find((el) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return (
          Math.round(rect.width) === 1920 &&
          Math.round(rect.height) === 1080 &&
          style.position === 'relative'
        );
      });
      const track = divs.find((el) => {
        const style = getComputedStyle(el);
        return style.cursor === 'pointer' && Math.round(el.getBoundingClientRect().height) === 22;
      });
      return { stage, track };
    });

    const { stage, track } = await handles.getProperties().then(async (props) => ({
      stage: props.get('stage')?.asElement(),
      track: props.get('track')?.asElement(),
    }));

    if (!stage || !track) throw new Error('Could not find the stage or playback track.');

    const trackBox = await track.boundingBox();
    if (!trackBox) throw new Error('Could not measure the playback track.');

    for (let i = 0; i < frameCount; i += 1) {
      const t = i / fps;
      const x = trackBox.x + trackBox.width * Math.min(t / duration, 1);
      const y = trackBox.y + trackBox.height / 2;
      await page.mouse.move(x, y);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));

      const framePath = path.join(framesDir, `frame_${String(i).padStart(5, '0')}.jpg`);
      await stage.screenshot({ path: framePath, type: 'jpeg', quality });

      if (i === 0 || (i + 1) % fps === 0) {
        process.stdout.write(`\rRendered ${String(i + 1).padStart(4)} / ${frameCount}`);
      }
    }
    process.stdout.write('\n');
  } finally {
    await browser.close();
  }

  const imageInput = path.join(framesDir, 'frame_%05d.jpg');
  const videoArgs = ['-y', '-framerate', String(fps), '-i', imageInput];

  if (withAudio) {
    videoArgs.push(...audioInputs(), '-filter_complex', audioFilter(), '-map', '0:v', '-map', '[a]');
  }

  videoArgs.push(
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
  );

  if (withAudio) videoArgs.push('-c:a', 'aac', '-b:a', '128k', '-shortest');

  videoArgs.push(outMp4);
  console.log(`Encoding ${outMp4}...`);
  execFileSync(ffmpeg, videoArgs, { stdio: 'inherit' });

  if (makeMp3) {
    console.log(`Encoding ${outMp3}...`);
    execFileSync(
      ffmpeg,
      [
        '-y',
        ...audioInputs(),
        '-filter_complex',
        '[0:a][1:a][2:a]amix=inputs=3:duration=longest,lowpass=f=520,volume=0.045[a]',
        '-map',
        '[a]',
        '-c:a',
        'libmp3lame',
        '-q:a',
        '4',
        outMp3,
      ],
      { stdio: 'inherit' },
    );
  }

  if (!keepFrames) await fs.rm(framesDir, { recursive: true, force: true });

  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
