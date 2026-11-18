// Presentation and simulated movement; clinical protocol and scoring stay separate.
export const formatValue = (value, digits = 0) => {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const rounded = Number(value).toFixed(digits);
  return Number(rounded) === 0 ? (0).toFixed(digits) : rounded.replace('-', '−');
};

export function demoTestPose(test, elapsed) {
  if (!test || test.mode === 'manual') return null;
  const gate = test.target || test.rep;
  const midpoint = range => (range[0] + range[1]) / 2;
  const pose = {
    elevation: gate.elevRange ? midpoint(gate.elevRange) : gate.elevMax != null ? 12 : 90,
    plane: gate.plane ? midpoint(gate.plane) : 20,
    rotation: 0, elbowFlex: gate.metric === 'rotation' ? 90 : 6, hike: 0,
  };
  if (test.mode === 'hold') {
    pose[gate.metric] = gate.min != null && gate.max != null ? (gate.min + gate.max) / 2
      : gate.min != null ? gate.min + 8 : Math.max(6, gate.max - 10);
  } else {
    const low = Math.max(gate.metric === 'rotation' ? -80 : 6, gate.down - 15);
    const high = Math.min(175, gate.up + 25);
    pose[gate.metric] = low + (high - low) * (1 - Math.cos(elapsed * Math.PI / 1.8)) / 2;
  }
  return pose;
}

export const phaseTitle = phase => `Phase ${phase.phase} · ${String(phase.title || '').replace(/^Phase \d+\s*[·:]\s*/i, '')}`;

export function displayReport(report, completion) {
  const lead = report.conditions?.[0];
  return {
    ...report, completion,
    summary: `${lead?.p >= .35 ? `The leading screening finding is **${lead.name}**.` : 'No strong screening pattern was found.'} ${completion.completed < completion.total ? 'Finish the remaining tests before drawing conclusions. ' : ''}The findings below show the supporting and conflicting evidence. A clinician can assess the cause and help choose a safe, gradual return to activity.`,
  };
}
