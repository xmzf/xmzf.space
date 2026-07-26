// ============================================
// terminal.js — Linux-style boot sequence
// ============================================

const BOOT_LOGS = [
    { text: '[    0.000000] XMZF Studio OS v1.0.0 (kernel 6.8.0-xmzf) #1 SMP', cls: 'dim' },
    { text: '[    0.001247] Command line: BOOT_IMAGE=/vmlinuz-xmzf root=/dev/sda1 ro quiet', cls: 'dim' },
    { text: '[    0.003891] BIOS-provided physical RAM map:', cls: 'dim' },
    { text: '[    0.012840] x86/cpu: Intel(R) Core(TM) i9-14900K @ 6.00GHz', cls: 'dim' },
    { text: '[    0.028910] ACPI: PM-Timer IO Port: 0x408', cls: 'dim' },
    { text: '[    0.041283] PCI: Using configuration type 1 for base access', cls: 'dim' },
    { text: '[    0.058291] RAID6: avx2x4 gen() 28018 MB/s', cls: 'dim' },
    { text: '[    0.072938] ACPI: PCI Root Bridge [PCI0] (domain 0000 bus 0)', cls: 'dim' },
    { text: '[    0.091847] NET: Registered PF_INET protocol family', cls: 'dim' },
    { text: '[    0.128374] SCSI subsystem initialized', cls: 'dim' },
    { text: '[    0.158291] usbcore: registered new device driver usb', cls: 'dim' },
    { text: '[    0.202847] EXT4-fs (sda1): mounted filesystem with ordered data mode', cls: 'dim' },
    { text: '[    0.218392] systemd[1]: Detected architecture x86-64.', cls: 'dim' },
    { text: '', cls: '' },
    { text: 'Welcome to XMZF Studio OS', cls: 'hi' },
    { text: '', cls: '' },
    { text: '[  <span class="ok">OK</span> ] Started Network Manager.' },
    { text: '[  <span class="ok">OK</span> ] Started D-Bus System Message Bus.' },
    { text: '[  <span class="ok">OK</span> ] Started Authorization Manager.' },
    { text: '[  <span class="ok">OK</span> ] Started User Login Management.' },
    { text: '[  <span class="ok">OK</span> ] Started Disk Manager.' },
    { text: '[  <span class="ok">OK</span> ] Started GNOME Display Manager.' },
    { text: '[  <span class="ok">OK</span> ] Reached target Network is Online.' },
    { text: '[  <span class="ok">OK</span> ] Reached target Multi-User System.' },
    { text: '[  <span class="ok">OK</span> ] Reached target Graphical Interface.' },
    { text: '', cls: '' },
    { text: '<span class="accent">xmzf-studio login:</span> root', cls: '' },
    { text: '<span class="hi">root@xmzf-studio</span>:<span class="accent">~</span># ./launch --target=web --mode=hero', cls: '' },
    { text: '<span class="dim">[xmzf-launch]</span> Initializing web runtime...', cls: '' },
    { text: '<span class="dim">[xmzf-launch]</span> Detected browser: <span class="hi">Chrome/WebKit</span>', cls: '' },
    { text: '<span class="dim">[xmzf-launch]</span> GPU acceleration: <span class="ok">enabled</span>', cls: '' },
    { text: '<span class="dim">[xmzf-launch]</span> Loading 3D engine <span class="accent">three.js r160</span>...', cls: '' },
    { text: '<span class="dim">[xmzf-launch]</span> Compiling shader programs...', cls: '' },
];

// progress steps, the last triggers completion
const PROGRESS_LINES = [
    { label: 'loading scene assets   ', target: 100, ms: 700, asset: 'monitor.mesh' },
];

const FINAL_LINES = [
    '<span class="ok">[OK]</span> <span class="dim">render context ready</span>',
    '<span class="ok">[OK]</span> <span class="dim">PBR materials compiled</span>',
    '<span class="ok">[OK]</span> <span class="dim">environment HDRI loaded</span>',
    '<span class="ok">[OK]</span> <span class="dim">scene graph optimized</span>',
    '',
    '<span class="accent">▶ Booting XMZF Studio...</span>',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export class Terminal {
    constructor(el) {
        this.root = el;
        this.output = el.querySelector('#terminal-output');
        this.cursor = el.querySelector('#terminal-cursor');
        this.inner = el.querySelector('#terminal-inner');
        this.done = false;
    }

    appendLine(html, cls = '') {
        const line = document.createElement('div');
        line.className = 'log-line' + (cls ? ' ' + cls : '');
        line.innerHTML = html;
        this.output.appendChild(line);
        // auto scroll
        this.inner.scrollTop = this.inner.scrollHeight;
        return line;
    }

    async run() {
        // initial cursor blink only (two blinks ~ 0.5s)
        await sleep(500);

        for (const log of BOOT_LOGS) {
            this.appendLine(log.text, log.cls || '');
            // tight, snappy timing — logs flow fast, real loading gates the end
            const t = 14 + Math.random() * 22;
            await sleep(t);
        }

        // progress bar
        await this.runProgress();

        // final ok lines
        for (const line of FINAL_LINES) {
            this.appendLine(line);
            await sleep(60 + Math.random() * 40);
        }

        await sleep(180);
        this.done = true;
    }

    async runProgress() {
        const line = this.appendLine('');
        const width = 24;
        let pct = 0;
        const startTime = performance.now();
        const duration = PROGRESS_LINES[0].ms;
        const label = PROGRESS_LINES[0].label;

        return new Promise(resolve => {
            const tick = () => {
                const elapsed = performance.now() - startTime;
                const progress = Math.min(1, elapsed / duration);
                // ease-out
                const eased = 1 - Math.pow(1 - progress, 2);
                pct = Math.floor(eased * 100);
                const filled = Math.round(eased * width);
                const bar = '█'.repeat(filled) + '<span class="dim">' + '░'.repeat(width - filled) + '</span>';
                line.innerHTML = `<span class="dim">[xmzf-launch]</span> ${label}<span class="bar">[${bar}]</span> ${pct.toString().padStart(3, ' ')}%`;

                if (progress < 1) {
                    requestAnimationFrame(tick);
                } else {
                    line.innerHTML = `<span class="dim">[xmzf-launch]</span> ${label}<span class="bar">[${'█'.repeat(width)}]</span> <span class="ok">100%</span>`;
                    resolve();
                }
            };
            requestAnimationFrame(tick);
        });
    }

    // Replace terminal content with XMZF brand text that will live on the screen
    morphToScreenContent() {
        // Fade terminal output then leave a clean "XMZF" mark
        this.output.style.transition = 'opacity 0.5s var(--ease)';
        this.output.style.opacity = '0';
        this.cursor.style.opacity = '0';
        setTimeout(() => {
            this.output.innerHTML = '';
            this.output.style.opacity = '1';
        }, 500);
    }
}
