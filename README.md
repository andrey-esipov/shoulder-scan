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

The report opens as a movement-study poster: a 12-column grid pairs the range-of-motion gauge with enlarged anatomy, under one headline and date/side/source caption. On phones the gauge and figure sit side by side. One exam-scoped summary supplies the gauge, findings and marker chart. The selected movement is forward raise, or side raise when forward raise was not measured. Its peak includes marked frames from that same completed movement; pre-exam marks and other movements stay in separately labelled strips and never feed its gauge or first symptom angle. At exam completion, an offscreen 900×1170 anatomy canvas illustrates each arm at that movement's recorded elevation in the frontal plane, with an angle-labelled shoulder arc. This is an angle illustration, not a reconstruction of movement direction or an injury. The still is stored with History, never recaptured on reopening. Missing or skipped measurements stay untested; demo results remain labelled as simulated. Older sessions without an image say so. No share-card mode or separate share-image export is created.

For recordings, open http://localhost:8000/?demo=1 to start simulated anatomical motion automatically, without opening a camera. Add `&exam=quick` to begin the guided intake too. Demo uses only the anatomical skeleton. One precomputed maximum-reach envelope fixes the camera for each viewport; moving arms never trigger a refit. It includes the torso, pelvis, both arms and fingertips, including overhead and side raises. `__shoulder.anatomy.getFramingMetrics()` exposes the projected bounds and camera position for layout checks. Regional presets ease to fixed views over 400ms; **Full** restores the whole upper body. Posterior-cuff coaching uses a rear three-quarter view and labels the standing version. An orange-dot source pill and underlined readout caption explicitly label **simulated**, not measured, values.

During a demo exam, each movement has its own scripted motion and follows the original position gates and repetition thresholds. Only the working arm moves; bilateral repetition tests demonstrate each side in turn. Each follow-up question eases to and holds that test's peak pose until answered; O'Brien switches from thumb down to palm up with its question. Visual hand/forearm clearance checks cover the head and ribcage; these do not change tracked measurements. Manual movements use an illustrated motion where possible; hands-on-only tests auto-skip with an explanation. Neither illustrates actual resistance or a clinical test result. Symptom answers are always yours. Demo reports are labeled simulated; fewer than half the tests completed yields an **Incomplete screening** headline, with possible findings secondary.

The light, stage-first layout separates both arm raises, both rotations and torso turn into a dedicated strip below the model (two balanced pairs plus torso on phones). Camera mode keeps the real video beside the anatomy and labels values **Measured**. Camera failures or a five-second timeout show recovery actions for Demo and video upload. No stick figure or pose overlay is drawn on the video or saved camera snapshot. Open **Anatomy** for side selection, presets, peel and layers; expand **Motion** or **Tissue load** for details. The chart's R/L button changes the tracked side. On phones the source selector moves into a menu with a compact DEMO chip; a 40vh sticky stage keeps icon controls clear of the head, with one marker row below it. Marker feedback floats at the mobile stage's bottom edge without reserving space and dismisses after two seconds. The mobile CTA offers Quick and Full exams in its own row before the chart. Movement tests have a fixed card slot, a live numeric target readout, accent-tinted active muscles, and prior conversation behind **Show answers**. The conversation scrolls independently; typing is enabled only for active questions. Keyboard tips are hidden on touch devices. **Report** is disabled until a session exists and throughout an active exam, with accessible custom help.

The camera has to be served from `localhost` (or https). Opening `index.html` as a file won't work.

## What it does

- **Tracking:** MediaPipe Pose Landmarker (33 body points) plus Hand Landmarker (21 points per hand). Pose alone can't see a straight arm roll around its own axis, so rotation at 90° uses the knuckle line of the hand.
- **Measurements:** arm elevation, plane, internal/external rotation, elbow bend, shoulder hike, trunk lean, and torso turn, for both sides.
- **3D view:** Three.js with real CT-derived bone meshes from BodyParts3D, peelable layers, and presets for the rotator cuff, labrum, biceps, lat, scapula, and nerves.
- **Exam:** quick (4–6 min, eight intake questions) and full (12–15 min) guided exams, beginning with safety screening, then your symptoms rather than assumptions. Sport and pulling questions are conditional. Intake and movement tests have separate progress segments; opening a modal pauses movement-test counting. Voice is off by default; enable it in the header. Mark events with `P` or `Space` (pain), `C` (click), `L` (pull), `U` (unstable). Optional mic click detector.
- **Reasoning:** a deterministic, evidence-weighted engine in `js/reasoning.js`. No LLM. The report shows what counted for and against each possibility, plus red flags.
- **Safety:** red flags block testing with an explicit, not-advised override. Chest pain or shortness of breath shows **Call emergency services now** with an emergency telephone link outside the scrolling content. Flagged reports omit condition lists and exercise plans; Rehab explains the pause and links to the safety report. Numbness or tingling past the elbow adds a neck/nerve assessment referral.
- **Reports:** session markers survive exam start, with their press-time angles and pre-exam/demo/test context. An always-open 0–180° strip uses typed P/C/L/U pins, with separate before-exam and muted reference rows. Calibration and withdrawn marks do not become headline evidence. Three findings tiles state whether a pain-free range is established, the selected movement's first symptom angle, and an actual reported test response (or measured range/comparison). Symptom marks alone do not establish a pain-free range. Conflicting “No pain” answers prompt you to confirm or withdraw pain markers from screening; withdrawn marks stay labelled in the session log but do not influence findings. Other painful-arc disagreements are explained once, with markers taking precedence in scoring. History supports inline, named confirmation for deletion of one or all sessions. **Worth ruling out**, **Movement plan** and **Next steps** are the three supporting accordions; each starts collapsed, and Next steps links directly to the plan. Sport-specific next steps and rehab require an affirmative overhead-sport answer. Leaving Demo clears its active rehab preview; saved reports retain their simulated label. Print/PDF expands all sections, uses the page width and includes the date and anatomy credit; JSON export remains available. Start new exam offers a choice of exam.
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
