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

For recordings, open http://localhost:8000/?demo=1 to start simulated anatomical motion automatically, without opening a camera. Add `&exam=quick` to begin the guided intake too. Demo uses only the anatomical skeleton, with centered, aspect-aware overview framing that reserves room for overhead arms. Clicking a regional anatomy preset deliberately zooms to that region. A solid grey-dot source pill and underlined readout caption explicitly label **simulated**, not measured, values.

During a demo exam, the simulator follows each movement test's original position gates and repetition thresholds; these movement tests complete automatically. Resistance and other manual tests explain that they cannot be simulated and require **Next**. Symptom answers are always yours. Demo reports are labeled simulated; incomplete exams include provisional completion counts.

The light, stage-first layout separates bilateral elevation, bilateral ER/IR and torso turn into a dedicated strip below the model. Camera mode keeps the real video and neutral pose overlay beside the anatomy and labels values **Measured**. Open **Anatomy** above the skeleton for side selection, presets, peel and layers; expand **Motion & tissue load** there for detailed readings. On phones the large anatomy leads, readings form a grid, markers are 2×2, and the exam is below the stage. **Report** opens an honest empty state until you have exam data.

The camera has to be served from `localhost` (or https). Opening `index.html` as a file won't work.

## What it does

- **Tracking:** MediaPipe Pose Landmarker (33 body points) plus Hand Landmarker (21 points per hand). Pose alone can't see a straight arm roll around its own axis, so rotation at 90° uses the knuckle line of the hand.
- **Measurements:** arm elevation, plane, internal/external rotation, elbow bend, shoulder hike, trunk lean, and torso turn, for both sides.
- **3D view:** Three.js with real CT-derived bone meshes from BodyParts3D, peelable layers, and presets for the rotator cuff, labrum, biceps, lat, scapula, and nerves.
- **Exam:** quick (6–8 min) and full (12–15 min) guided exams, beginning with your symptoms rather than assumptions. Sport questions are conditional. Voice is off by default; enable it in the header. Mark events with `P` or `Space` (pain), `C` (click), `L` (pull), `U` (unstable). Optional mic click detector.
- **Reasoning:** a deterministic, evidence-weighted engine in `js/reasoning.js`. No LLM. The report shows what counted for and against each possibility, plus red flags.
- **Safety:** red flags block testing with advice to seek care and an explicit, not-advised override. Exercises remain paused while flags are present.
- **Rehab:** a phased plan with a live-camera coach that counts reps. Coaching is disabled during an exam; Demo offers a camera-start prompt instead.

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
```

## Credits and license

- Inspired by [@mirrash7's Hand Doctor](https://x.com/mirrash7/status/2120966294371484037).
- Built with the GitHub Copilot app.
- Code: MIT, see [LICENSE](LICENSE).
- `assets/skeleton.glb` is derived from [BodyParts3D](https://lifesciencedb.jp/bp3d/), © The Database Center for Life Science, licensed [CC BY-SA 2.1 JP](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en). See [assets/LICENSE-BodyParts3D.txt](assets/LICENSE-BodyParts3D.txt).
