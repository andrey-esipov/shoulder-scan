# Shoulder Scan

A webcam shoulder screening tool that runs entirely in your browser. It tracks both arms and your torso, mirrors them on a real 3D skeleton, walks you through a voice-guided shoulder exam, and gives you a ranked list of likely causes with the evidence for and against each one, plus a phased rehab plan with a webcam rep coach.

I built it for my own tennis shoulder. The story is on my Substack, [Hands On](https://andreyesipov.substack.com/).

> **Not medical advice.** Shoulder Scan is a screening aid, not a diagnosis. It can't see tendons or cartilage. Use it to bring better notes to a physical therapist or sports-medicine doctor. If you have a deformity after an injury, sudden weakness, numbness, or night pain that won't settle, get seen.

## Run it

No install, no account, no API key. You need Python 3 (already on macOS) and Chrome or Edge.

```bash
git clone https://github.com/andrey-esipov/shoulder-scan.git
cd shoulder-scan
python3 -m http.server 8000
```

Open http://localhost:8000. Click **Try demo** without a camera, or **Start camera** to use your webcam. Stand about two meters back so your hips are in frame.

The report opens with a bilateral range-of-motion comparison and saved anatomy at the affected arm's peak forward raise, matching the gauge. At the end of an exam, an offscreen anatomy canvas renders that recorded pose at 900×1170, without ghost bones or camera pixels. The image has a transparent background and soft bottom fade. That still is stored with History, never recaptured when reopening the report. Missing or skipped measurements stay blank; demo results remain labeled as simulated. Older sessions without an image say so. No share-card mode or separate share-image export is created.

For recordings, open http://localhost:8000/?demo=1 to start simulated anatomical motion automatically, without opening a camera. Add `&exam=quick` to begin the guided intake too. Demo uses only the anatomical skeleton. The front view fits the torso, pelvis, both arms and fingertips, including overhead and side raises. `__shoulder.anatomy.getFramingMetrics()` exposes the projected bounds for layout checks. Regional presets animate to a fixed front view; **Full** restores the whole upper body. An orange-dot source pill and underlined readout caption explicitly label **simulated**, not measured, values.

During a demo exam, each movement has its own scripted motion and follows the original position gates and repetition thresholds. Only the working arm moves; bilateral repetition tests demonstrate each side in turn. The current motion continues while you answer its follow-up questions. Visual hand/forearm clearance checks cover the head and ribcage; these do not change tracked measurements. Manual movements use an illustrated motion where possible; hands-on-only tests auto-skip with an explanation. Neither illustrates actual resistance or a clinical test result. Symptom answers are always yours. Demo reports are labeled simulated; incomplete exams include provisional completion counts.

The light, stage-first layout separates bilateral elevation, bilateral outward/inward rotation and torso turn into a dedicated five-column strip below the model. Camera mode keeps the real video beside the anatomy and labels values **Measured**. No stick figure or pose overlay is drawn on the video or saved camera snapshot. Open **Anatomy** for side selection, presets, peel and layers; expand **Motion** or **Tissue load** for details. On phones the source selector moves into a menu; a 40vh sticky stage keeps icon controls clear of the head, with one marker row below it. New test questions place answer chips immediately below the question. Keyboard tips are hidden on touch devices. **Report** is disabled until a session exists and throughout an active exam, with accessible custom help.

The camera has to be served from `localhost` (or https). Opening `index.html` as a file won't work.

## What it does

- **Tracking:** MediaPipe Pose Landmarker (33 body points) plus Hand Landmarker (21 points per hand). Pose alone can't see a straight arm roll around its own axis, so rotation at 90° uses the knuckle line of the hand.
- **Measurements:** arm elevation, plane, internal/external rotation, elbow bend, shoulder hike, trunk lean, and torso turn, for both sides.
- **3D view:** Three.js with real CT-derived bone meshes from BodyParts3D, peelable layers, and presets for the rotator cuff, labrum, biceps, lat, scapula, and nerves.
- **Exam:** quick (4–6 min, eight intake questions) and full (12–15 min) guided exams, beginning with safety screening, then your symptoms rather than assumptions. Sport and pulling questions are conditional. Intake and movement tests have separate progress segments; opening a modal pauses movement-test counting. Voice is off by default; enable it in the header. Mark events with `P` or `Space` (pain), `C` (click), `L` (pull), `U` (unstable). Optional mic click detector.
- **Reasoning:** a deterministic, evidence-weighted engine in `js/reasoning.js`. No LLM. The report shows what counted for and against each possibility, plus red flags.
- **Safety:** red flags block testing with an explicit, not-advised override. Chest pain or shortness of breath shows **Call emergency services now** with an emergency telephone link outside the scrolling content. Flagged reports omit condition lists and exercise plans; Rehab explains the pause and links to the safety report. Numbness or tingling past the elbow adds a neck/nerve assessment referral.
- **Reports:** include marker type, side, angle, test and the real elapsed time of each event. Conflicting “No pain” answers prompt you to confirm or remove pain markers. Other painful-arc disagreements are explained once, with markers taking precedence in scoring. History supports inline, named confirmation for deletion of one or all sessions. Weak-pattern reports label exercise suggestions as a general plan. Print/PDF expands all sections, uses the page width and includes the date and anatomy credit; JSON export remains available. Start new exam offers a choice of exam.
- **Rehab:** a phased plan restored from the latest saved session on load and after History changes. Coaching is disabled during an exam. Without a camera, Coach shows a still illustrated exercise target without changing the selected motion source; connection errors stay inside its card. With a camera, the coach counts your live reps.

Your video is processed locally and never leaves your machine. The models download from public CDNs on first load. Session history is kept in `localStorage` (last 20 sessions).

## Troubleshooting

**Stuck on "Starting camera…"**: another app probably holds the camera. Quit Teams/Zoom (Cmd+Q, not just camera off) and any helper like Logitech RightSight, check the browser's camera permission for `localhost`, and on macOS check System Settings → Privacy & Security → Camera.

**Testing without a webcam:** use Demo mode, or launch Chrome with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`.

## Tests

```bash
node test/metrics.test.mjs
node test/reasoning.test.mjs
node test/experience.test.mjs
node test/framing.test.mjs
node test/arc-chart.test.mjs
```

## Credits and license

- Inspired by [@mirrash7's Hand Doctor](https://x.com/mirrash7/status/2120966294371484037).
- Built with the GitHub Copilot app.
- Code: MIT, see [LICENSE](LICENSE).
- `assets/skeleton.glb` is derived from [BodyParts3D](https://lifesciencedb.jp/bp3d/), © The Database Center for Life Science, licensed [CC BY-SA 2.1 JP](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en). See [assets/LICENSE-BodyParts3D.txt](assets/LICENSE-BodyParts3D.txt).
