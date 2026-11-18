// Exercise library + webcam rep-coach logic (pure, no DOM).

export const EXERCISES = {
  isoER: { name: 'Isometric external rotation', dose: '5 × 30 s holds at ~30–50% effort, daily', phase: 1, why: 'Calms painful cuff tendons. Isometrics reduce pain and keep the cuff working without irritating it.', how: 'Elbow at your side bent 90°. Press the back of your hand into a doorframe as if rotating out. No movement.' },
  isoAbd: { name: 'Isometric abduction', dose: '5 × 30 s, daily', phase: 1, why: 'Loads supraspinatus and deltoid gently.', how: 'Elbow at your side. Press the outside of the elbow into a wall.' },
  sleeper: { name: 'Modified sleeper stretch', dose: '3 × 30 s, 1–2×/day', phase: 1, why: 'Restores internal rotation lost from serving (GIRD), which is a key driver of internal impingement and labral stress.', how: 'Lie on the sore side rolled back ~30°. Elbow at shoulder height, bent 90°. Use the other hand to gently push the forearm toward the floor. Stretch only, never pinching pain.' },
  crossBodyStretch: { name: 'Cross-body stretch', dose: '3 × 30 s, daily', phase: 1, why: 'Stretches the posterior capsule and cuff, which also improves internal rotation.', how: 'Pull the sore arm across the chest at shoulder height. Keep the shoulder blade from sliding forward by bracing it against a wall.' },
  latStretch: { name: 'Lat stretch (kneeling bench)', dose: '3 × 30–45 s, daily', phase: 1, coach: 'latHold', why: 'A tight lat pulls the arm down and in and limits overhead reach. That can create the "pulling" you feel overhead and make the shoulder compensate at full serve extension.', how: 'Kneel, elbows on a bench, hands together holding a stick. Sit hips back and drop the chest. Keep ribs tucked.' },
  openBook: { name: 'Open books (thoracic rotation)', dose: '2 × 10 each side', phase: 1, why: 'A stiff upper back forces the shoulder to make up range on the serve.', how: 'Lie on your side, knees bent. Open the top arm across to the other side, following it with your eyes.' },
  pecMinor: { name: 'Doorway pec stretch', dose: '3 × 30 s', phase: 1, why: 'A tight pec minor tips the shoulder blade forward and narrows the subacromial space.', how: 'Forearm on a doorframe, elbow slightly above shoulder height. Step through gently.' },
  sideER: { name: 'Side-lying external rotation', dose: '3 × 12–15, 3×/week', phase: 2, coach: 'standingER', why: 'Highest infraspinatus activation of any exercise. It builds the posterior cuff that decelerates the serve.', how: 'Lie on the good side with a towel under the sore elbow. Rotate a light dumbbell up slowly over 3 s and lower over 3 s.' },
  proneYTW: { name: 'Prone Y–T–W', dose: '2–3 × 10 each, 3×/week', phase: 2, why: 'Lower trapezius and posterior cuff strength for scapular control.', how: 'Face down on a bench. Thumbs up. Lift into Y, T and W shapes while squeezing the shoulder blades down and back.' },
  wallSlide: { name: 'Serratus wall slide with lift-off', dose: '3 × 10, 3×/week', phase: 2, coach: 'wallSlide', why: 'Trains serratus anterior to upwardly rotate the blade so the shoulder has room overhead.', how: 'Forearms on a wall with a foam roller or towel. Slide up while pushing into the wall, then lift the hands off briefly at the top. No shrugging.' },
  pushupPlus: { name: 'Push-up plus', dose: '3 × 10–15', phase: 2, why: 'Serratus anterior strength that protracts and stabilizes the blade.', how: 'Start from a wall or knees. At the top, push further to spread the shoulder blades apart.' },
  scaption: { name: 'Scaption (full can)', dose: '3 × 12, light', phase: 2, coach: 'scaption', why: 'Supraspinatus strengthening in a safe plane.', how: 'Arms 30° forward of the sides, thumbs UP. Raise to shoulder height only.' },
  row: { name: 'Band row with retraction', dose: '3 × 15', phase: 2, why: 'Mid-trap and rhomboid endurance to hold the blade back under load.', how: 'Pull the band to your ribs, squeezing the shoulder blades back and down.' },
  er9090: { name: '90/90 band external rotation', dose: '3 × 12–15, slow lowering', phase: 2, coach: 'er9090', why: 'Strengthens the cuff in the exact position of serve cocking, with emphasis on eccentric control.', how: 'Goalpost position with the band anchored in front. Rotate back slowly. Keep the elbow at shoulder height and no shrug.' },
  bicepsEcc: { name: 'Slow eccentric biceps curls', dose: '3 × 12, 3 s lowering', phase: 2, why: 'Gradual loading for irritated long head of biceps tendon.', how: 'Light weight. Curl up with both hands and lower slowly with the sore arm only.' },
  plyoDrops: { name: 'Prone ball drops (90/90)', dose: '3 × 30 s', phase: 3, why: 'Fast reactive cuff control near serve speed.', how: 'Face down with the arm at 90/90 off a bench. Rapidly drop and catch a light ball.' },
  plyoER: { name: 'Plyometric ER wall throws', dose: '3 × 10', phase: 3, why: 'Trains the posterior cuff to decelerate quickly.', how: 'Toss a 0.5–1 kg ball against a wall from 90/90, catch and decelerate.' },
  intervalServe: { name: 'Interval serve program', dose: 'Start at 10 serves at 50% every other day. Add 10 per session if pain is ≤ 2/10 the next morning', phase: 3, why: 'Gradual return of serve load.', how: 'Flat and slice first, kick serves last. Stop if pain is above 3/10 or the next morning is worse.' },
  shrugCircles: { name: 'Scapular clocks', dose: '2 × 10 each direction', phase: 1, why: 'Restores smooth blade gliding. Helpful for painless snapping.', how: 'Hand on a wall at shoulder height. Move the shoulder blade to 12, 3, 6 and 9 o’clock without moving the arm.' },
};

// Rep coach definitions consumed by main.js. Each uses live metrics for the working side.
export const COACH = {
  wallSlide: { name: 'Wall slides', metric: 'elevation', down: 75, up: 140, warnHike: 12, cue: 'Slide up, keep the shoulders down away from your ears.' },
  scaption: { name: 'Scaption', metric: 'elevation', down: 35, up: 82, plane: [5, 70], warnHike: 12, warnLean: 8, cue: 'Thumbs up, 30° forward, stop at shoulder height.' },
  er9090: { name: '90/90 band ER', metric: 'rotation', down: 10, up: 70, elevRange: [75, 110], cue: 'Keep the elbow at shoulder height, rotate back slowly.' },
  standingER: { name: 'External rotation at side', metric: 'rotation', down: 5, up: 40, elevMax: 35, cue: 'Elbow glued to your side, rotate out.' },
  latHold: { name: 'Overhead lat-stretch hold', metric: 'elevation', hold: 30, holdMin: 150, cue: 'Arms overhead, ribs down. Breathe and hold.' },
};
export function coachTarget(key) {
  const cfg = COACH[key];
  return {
    elevation: cfg.elevMax != null ? 0 : cfg.holdMin || (cfg.elevRange ? 90 : cfg.up),
    plane: key === 'latHold' ? 45 : cfg.metric === 'rotation' ? 0 : 30,
    rotation: cfg.metric === 'rotation' ? cfg.up : 0,
    elbowFlex: cfg.metric === 'rotation' ? 90 : 6, hike: 0,
  };
}

/** Rep counter with hysteresis; returns events. */
export class RepCounter {
  constructor({ up, down }) { this.up = up; this.down = down; this.state = 'down'; this.count = 0; this.peak = -Infinity; this.trough = Infinity; this.reps = []; }
  push(v, t) {
    if (v == null || Number.isNaN(v)) return null;
    if (this.state === 'down') {
      this.trough = Math.min(this.trough, v);
      if (v >= this.up) { this.state = 'up'; this.peak = v; this.tUp = t; }
    } else {
      this.peak = Math.max(this.peak, v);
      if (v <= this.down) {
        this.state = 'down'; this.count += 1;
        const rep = { peak: this.peak, trough: this.trough, t };
        this.reps.push(rep); this.peak = -Infinity; this.trough = v;
        return rep;
      }
    }
    return null;
  }
}
