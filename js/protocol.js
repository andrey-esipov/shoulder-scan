// Intake questions and the guided self-exam protocol.
// Each test tells the exam engine what to measure and which follow-up questions to ask.

const yn = [{ v: 'yes', label: 'Yes', kw: ['yes', 'yeah', 'yep', 'it did', 'sure'] }, { v: 'no', label: 'No', kw: ['no', 'nope', 'not really', "didn't"] }];

export const INTAKE = [
  { id: 'side', q: "Which shoulder is bothering you?", opts: [{ v: 'R', label: 'Right', kw: ['right'] }, { v: 'L', label: 'Left', kw: ['left'] }, { v: 'B', label: 'Both', kw: ['both'] }] },
  { id: 'dominant', q: 'Which arm do you serve with?', opts: [{ v: 'R', label: 'Right', kw: ['right'] }, { v: 'L', label: 'Left', kw: ['left'] }] },
  { id: 'age', q: 'How old are you?', opts: [{ v: 'u25', label: 'Under 25' }, { v: '25-39', label: '25–39' }, { v: '40-54', label: '40–54' }, { v: '55+', label: '55+' }] },
  { id: 'onset', q: 'How did it start?', opts: [{ v: 'gradual', label: 'Gradually / overuse', kw: ['gradual', 'slowly', 'over time', 'overuse'] }, { v: 'event', label: 'One specific serve or shot', kw: ['one serve', 'specific', 'one shot', 'suddenly'] }, { v: 'trauma', label: 'A fall or a hit', kw: ['fall', 'fell', 'hit', 'crash'] }, { v: 'unsure', label: 'Not sure', kw: ['not sure', "don't know"] }] },
  { id: 'duration', q: 'How long has it been going on?', opts: [{ v: '<2w', label: 'Under 2 weeks' }, { v: '2-6w', label: '2–6 weeks' }, { v: '6w-3m', label: '6 weeks – 3 months' }, { v: '>3m', label: 'More than 3 months' }] },
  { id: 'location', multi: true, q: 'Where do you feel the pain? Pick all that apply.', opts: [
    { v: 'lateral', label: 'Outside of upper arm', kw: ['outside', 'side of arm', 'deltoid'] },
    { v: 'front', label: 'Front of shoulder', kw: ['front'] },
    { v: 'back', label: 'Back of shoulder', kw: ['back of'] },
    { v: 'deep', label: 'Deep inside, hard to point', kw: ['deep', 'inside'] },
    { v: 'acPoint', label: 'Bony point on top', kw: ['top', 'bony'] },
    { v: 'blade', label: 'Shoulder blade', kw: ['blade', 'scapula'] },
    { v: 'lat', label: 'Side of back / under armpit', kw: ['lat', 'armpit', 'side of back'] },
    { v: 'neck', label: 'Neck into shoulder', kw: ['neck'] },
  ] },
  { id: 'servePhase', multi: true, q: 'When in the serve does it hurt?', opts: [
    { v: 'trophy', label: 'Racquet drop behind back', kw: ['drop', 'trophy', 'behind', 'cocking'] },
    { v: 'contact', label: 'Reaching up to hit', kw: ['contact', 'reach', 'hit', 'up'] },
    { v: 'follow', label: 'Follow-through', kw: ['follow'] },
    { v: 'all', label: 'The whole motion', kw: ['whole', 'all', 'everything'] },
    { v: 'none', label: "Serving doesn't hurt", kw: ['none', "doesn't"] },
  ] },
  { id: 'clickWhere', multi: true, q: 'Where do the clicks or pops come from?', opts: [
    { v: 'deepRot', label: 'Deep in the joint, rotating or overhead', kw: ['deep', 'joint', 'rotating'] },
    { v: 'blade', label: 'Under the shoulder blade or lat', kw: ['blade', 'lat', 'back'] },
    { v: 'front', label: 'Front of shoulder', kw: ['front'] },
    { v: 'top', label: 'Top of shoulder', kw: ['top'] },
    { v: 'none', label: 'No clicking', kw: ['no', 'none'] },
  ] },
  { id: 'clickPainful', q: 'Do the clicks hurt?', opts: [{ v: 'painful', label: 'Yes, they hurt', kw: ['yes', 'hurt', 'painful'] }, { v: 'sometimes', label: 'Sometimes', kw: ['sometimes'] }, { v: 'painless', label: "No, they don't hurt", kw: ['no', 'painless'] }] },
  { id: 'catching', q: "Does it ever catch, lock, or suddenly feel weak and numb (a 'dead arm') mid-serve?", opts: yn },
  { id: 'instability', q: 'Does it ever feel like it slips or might come out of the socket?', opts: yn },
  { id: 'pull', multi: true, q: 'Where do you feel the pulling when you reach overhead?', opts: [
    { v: 'lat', label: 'Lat / side of back', kw: ['lat', 'side', 'back'] },
    { v: 'chest', label: 'Front of chest', kw: ['chest', 'pec'] },
    { v: 'back', label: 'Back of shoulder', kw: ['back of shoulder'] },
    { v: 'arm', label: 'Down the front of the arm', kw: ['arm', 'bicep'] },
    { v: 'none', label: 'No pulling', kw: ['no', 'none'] },
  ] },
  { id: 'night', q: 'Does it wake you up at night, or hurt to lie on?', opts: yn },
  { id: 'weakness', q: "Is the arm actually weak? For example, can't lift a bag onto a shelf or keep it up.", opts: yn },
  { id: 'nerve', q: 'Any numbness, tingling, or pain shooting past the elbow?', opts: yn },
  { id: 'load', multi: true, q: 'Did anything change before this started?', opts: [
    { v: 'volume', label: 'Played or served more', kw: ['more', 'volume', 'played'] },
    { v: 'gear', label: 'New racquet or strings', kw: ['racquet', 'strings', 'racket'] },
    { v: 'technique', label: 'Changed my serve', kw: ['technique', 'changed'] },
    { v: 'gym', label: 'New overhead gym work', kw: ['gym', 'lifting', 'press'] },
    { v: 'none', label: 'Nothing changed', kw: ['no', 'nothing', 'none'] },
  ] },
  { id: 'painNow', q: 'How bad is the pain right now, from 0 to 10?', opts: [{ v: 1, label: '0–2' }, { v: 4, label: '3–5' }, { v: 7, label: '6–8' }, { v: 9, label: '9–10' }] },
  { id: 'redFlags', multi: true, q: 'Last safety check. Do any of these apply?', opts: [
    { v: 'fever', label: 'Fever or feeling unwell' },
    { v: 'deformity', label: 'Visible deformity after an injury' },
    { v: 'cantLift', label: 'Suddenly unable to lift the arm' },
    { v: 'chest', label: 'Chest pain or shortness of breath' },
    { v: 'weightLoss', label: 'Unexplained weight loss or night sweats' },
    { v: 'none', label: 'None of these', kw: ['none', 'no'] },
  ] },
];

const PAIN_LOC = [
  { v: 'none', label: 'No pain', kw: ['no', 'none', 'fine', 'nothing'] },
  { v: 'lateral', label: 'Outside/top of arm', kw: ['outside', 'side', 'top of arm'] },
  { v: 'front', label: 'Front', kw: ['front'] },
  { v: 'back', label: 'Back', kw: ['back'] },
  { v: 'deep', label: 'Deep inside', kw: ['deep', 'inside'] },
  { v: 'acPoint', label: 'Bony point on top', kw: ['top', 'bony', 'point'] },
  { v: 'blade', label: 'Shoulder blade/lat', kw: ['blade', 'lat'] },
];

/**
 * mode: 'hold' (stay in target for holdSec) | 'reps' (count reps on metric) | 'manual' (user says done)
 * sides: which arms we read ('both' | 'affected')
 * focus: anatomy highlight preset while the test runs
 */
export const TESTS = [
  {
    id: 'calib', title: 'Calibration', mode: 'hold', holdSec: 2.5, sides: 'both', focus: 'full',
    say: 'Stand about two meters back so I can see you from the hips up. Let your arms hang relaxed and look straight ahead.',
    steps: ['Stand ~2 m from the camera so your hips are in frame', 'Arms relaxed at your sides', 'Hold still'],
    target: { metric: 'elevation', max: 22 },
  },
  {
    id: 'flex', title: 'Forward raise', mode: 'reps', reps: 3, sides: 'both', focus: 'muscles',
    say: 'Raise both arms straight forward and up as high as you can, then lower them slowly. Do three. Press P for pain or C for a click the moment you feel either one.',
    steps: ['Thumbs up, elbows straight', 'Raise forward all the way overhead', 'Lower slowly (3 seconds)', 'Do 3 reps'],
    rep: { metric: 'elevation', up: 120, down: 40, plane: [50, 130] },
    follow: [{ id: 'pain', q: 'Did any part of that hurt?', opts: PAIN_LOC, multi: true }],
  },
  {
    id: 'abd', title: 'Side raise: painful-arc check', mode: 'reps', reps: 3, sides: 'both', focus: 'cuff',
    say: 'Now raise both arms out to the sides, thumbs pointing up, all the way overhead, then lower slowly. Do three. Press P exactly when it starts hurting and again when it stops.',
    steps: ['Arms out to the sides, thumbs up', 'Raise all the way overhead', 'Lower slowly. The way down matters most', 'Press P when pain starts and when it stops'],
    rep: { metric: 'elevation', up: 120, down: 40, plane: [-15, 55] },
    follow: [{ id: 'arc', q: 'Where in the movement did it hurt?', opts: [
      { v: 'none', label: 'No pain', kw: ['no', 'none'] },
      { v: 'middle', label: 'Middle, easier at the top', kw: ['middle', 'halfway'] },
      { v: 'top', label: 'Only near the top', kw: ['top', 'overhead'] },
      { v: 'whole', label: 'The whole way', kw: ['whole', 'all'] },
    ] }],
  },
  {
    id: 'erSide', title: 'Rotation at your side', mode: 'reps', reps: 3, sides: 'both', focus: 'cuff',
    say: 'Tuck your elbows into your sides, bent to ninety degrees with palms facing in. Rotate both forearms outward as far as they go, then back. Three times.',
    steps: ['Elbows glued to your sides, bent 90°', 'Rotate forearms outward like opening a book', 'Back to the middle', '3 reps'],
    rep: { metric: 'rotation', up: 35, down: 10, elevMax: 40 },
    follow: [{ id: 'pain', q: 'Any pain?', opts: PAIN_LOC, multi: true }],
  },
  {
    id: 'rot90', title: 'Rotation range', mode: 'reps', reps: 3, sides: 'affectedFirst', focus: 'labrum',
    say: 'This one matters for your serve. Raise the arm out to shoulder height with the elbow bent ninety degrees, like a goalpost. Rotate the hand back as far as is comfortable, then forward and down as far as it goes. Do the sore arm first, then the other one. Stop if it feels unstable.',
    steps: ['Goalpost position: elbow at shoulder height, bent 90°', 'Rotate hand up and back (external rotation)', 'Then rotate down and forward (internal rotation)', 'Keep the shoulder blade still: no shrugging', '3 reps each arm. Sore arm first'],
    tip: 'Turn 45° to the camera for a better read on rotation. GIRD means less inward rotation on one side compared with the other.',
    rep: { metric: 'rotation', up: 60, down: -10, elevRange: [65, 115] },
    follow: [{ id: 'cock', q: 'With the hand back (cocked position), what did you feel?', opts: [
      { v: 'none', label: 'Nothing', kw: ['nothing', 'no', 'fine'] },
      { v: 'backPain', label: 'Pain at the back of the shoulder', kw: ['back'] },
      { v: 'deepPain', label: 'Deep pain or click', kw: ['deep', 'click'] },
      { v: 'apprehension', label: 'Felt like it might slip out', kw: ['slip', 'unstable', 'out', 'scared'] },
      { v: 'frontPain', label: 'Pain at the front', kw: ['front'] },
    ] }],
  },
  {
    id: 'hawkins', title: 'Hawkins impingement test', mode: 'manual', sides: 'affected', focus: 'cuff',
    say: 'Raise the sore arm forward to shoulder height with the elbow bent ninety degrees. With your other hand, gently push the forearm down so the shoulder rotates inward. Hold two seconds. Press Next when finished.',
    steps: ['Sore arm forward to shoulder height', 'Elbow bent 90°, forearm across in front', 'Other hand pushes the forearm down (internal rotation)', 'Hold 2 seconds'],
    follow: [{ id: 'pain', q: 'Did that reproduce your pain?', opts: PAIN_LOC, multi: true }],
  },
  {
    id: 'crossBody', title: 'Cross-body reach (AC joint & posterior capsule)', mode: 'manual', sides: 'affected', focus: 'bones',
    say: 'Reach the sore arm across your chest at shoulder height and gently pull the elbow toward the other shoulder with your free hand. Hold three seconds.',
    steps: ['Sore arm across the chest at shoulder height', 'Free hand pulls the elbow across', 'Hold 3 seconds'],
    follow: [{ id: 'feel', q: 'What did you feel?', multi: true, opts: [
      { v: 'none', label: 'Nothing', kw: ['nothing', 'no'] },
      { v: 'acPoint', label: 'Pain on the bony top point', kw: ['top', 'bony'] },
      { v: 'backTight', label: 'Tight stretch at the back', kw: ['tight', 'stretch', 'back'] },
      { v: 'deep', label: 'Deep pain inside', kw: ['deep'] },
      { v: 'front', label: 'Pain at the front', kw: ['front'] },
    ] }],
  },
  {
    id: 'obrien', title: "O'Brien active compression (labrum vs AC)", mode: 'manual', sides: 'affected', focus: 'labrum',
    say: "Stand next to a table or doorframe. Put the sore arm straight out in front at shoulder height, angled slightly across your body, thumb pointing down. Press up hard against the underside of the table for five seconds. Then turn the palm up and press again. Press Next when finished.",
    steps: ['Arm straight, shoulder height, slightly across the midline', 'Thumb down, press up against a table/doorframe for 5 s', 'Then palm up, press again for 5 s'],
    follow: [
      { id: 'thumbDown', q: 'With your thumb down, did it hurt?', multi: true, opts: [
        { v: 'none', label: 'No pain', kw: ['no', 'none'] },
        { v: 'deep', label: 'Deep inside the joint', kw: ['deep', 'inside'] },
        { v: 'acPoint', label: 'On the bony top point', kw: ['top', 'bony'] },
        { v: 'front', label: 'Front of shoulder', kw: ['front'] },
      ] },
      { id: 'palmUp', q: 'Was it better with your palm up?', opts: [{ v: 'better', label: 'Yes, better', kw: ['better', 'yes'] }, { v: 'same', label: 'About the same', kw: ['same', 'no'] }, { v: 'na', label: 'There was no pain', kw: ['no pain', 'none'] }] },
    ],
  },
  {
    id: 'speeds', title: "Speed's test (biceps tendon)", mode: 'hold', holdSec: 5, sides: 'affected', focus: 'biceps',
    say: 'Hold a water bottle in the sore hand, palm up, elbow straight, and lift it straight in front to shoulder height. Hold for five seconds.',
    steps: ['Light weight (water bottle) in hand, palm up', 'Elbow straight', 'Raise straight in front to shoulder height', 'Hold 5 s'],
    target: { metric: 'elevation', min: 65, max: 115, plane: [50, 130] },
    follow: [{ id: 'pain', q: 'Pain at the front of the shoulder or down the biceps?', opts: [
      { v: 'front', label: 'Yes, front of shoulder', kw: ['yes', 'front'] },
      { v: 'other', label: 'Pain somewhere else', kw: ['somewhere', 'else', 'other'] },
      { v: 'none', label: 'No', kw: ['no', 'none'] },
    ] }],
  },
  {
    id: 'emptyCan', title: 'Empty-can hold (supraspinatus)', mode: 'hold', holdSec: 6, sides: 'both', focus: 'cuff',
    say: 'Hold something light in each hand. Raise both arms to shoulder height about thirty degrees forward of your sides, thumbs pointing down like emptying a can. Hold six seconds. I will watch for drift and shaking.',
    steps: ['Light weight in each hand', 'Arms 30° forward of the sides (scapular plane)', 'Thumbs down, raise to shoulder height', 'Hold 6 s. I track drift and tremor'],
    target: { metric: 'elevation', min: 70, max: 115, plane: [5, 70] },
    follow: [{ id: 'feel', q: 'How did the sore side feel?', multi: true, opts: [
      { v: 'none', label: 'Fine', kw: ['fine', 'no', 'nothing'] },
      { v: 'pain', label: 'Painful', kw: ['pain', 'hurt'] },
      { v: 'weak', label: 'Weak or shaky', kw: ['weak', 'shaky', 'tired'] },
    ] }],
  },
  {
    id: 'erHold', title: 'External-rotation hold (infraspinatus)', mode: 'hold', holdSec: 5, sides: 'both', focus: 'cuff',
    say: 'Elbows at your sides bent to ninety. Rotate both forearms out as far as they go, then hold that end position for five seconds without letting them drift back.',
    steps: ['Elbows tucked, bent 90°', 'Rotate out to the end of range', 'Hold 5 s. Do not let them drift back in'],
    target: { metric: 'rotation', min: 25, elevMax: 40 },
    follow: [{ id: 'feel', q: 'Could you hold it at the end?', multi: true, opts: [
      { v: 'none', label: 'Yes, easily', kw: ['yes', 'easy', 'fine'] },
      { v: 'weak', label: 'It drifted or felt weak', kw: ['drift', 'weak'] },
      { v: 'pain', label: 'Painful', kw: ['pain', 'hurt'] },
    ] }],
  },
  {
    id: 'latTest', title: 'Lat length test', mode: 'reps', reps: 2, sides: 'both', focus: 'lat',
    say: 'Stand with your back flat against a wall, heels a few inches out. Keeping your low back and ribs pinned to the wall and elbows straight, raise both arms overhead toward the wall. Do two slow reps and press L if you feel pulling.',
    steps: ['Back flat against a wall, ribs down', 'Elbows straight, thumbs up', 'Raise overhead toward the wall without arching', 'Press L when you feel pulling'],
    rep: { metric: 'elevation', up: 130, down: 50, plane: [40, 140] },
    follow: [{ id: 'pull', q: 'Did you feel pulling? Where?', multi: true, opts: [
      { v: 'none', label: 'No pulling', kw: ['no', 'none'] },
      { v: 'lat', label: 'Lat / side of back', kw: ['lat', 'side', 'back'] },
      { v: 'arch', label: "I couldn't reach without arching", kw: ['arch', 'couldn'] },
      { v: 'front', label: 'Front of shoulder or chest', kw: ['front', 'chest'] },
    ] }],
  },
  {
    id: 'scapClick', title: 'Shoulder-blade click check', mode: 'manual', sides: 'both', focus: 'scapula',
    say: 'Roll your shoulders up, back and down five times, slowly. Then slowly raise and lower the sore arm three times. Press C whenever you feel or hear a pop. Turn on the Click detector to use your microphone too.',
    steps: ['Slow shoulder rolls ×5 (up → back → down)', 'Then raise the sore arm overhead ×3', 'Press C on each pop', 'Optional: turn on Click detector'],
    follow: [{ id: 'where', q: 'Where did the clicking come from?', multi: true, opts: [
      { v: 'none', label: 'No clicking', kw: ['no', 'none'] },
      { v: 'blade', label: 'Under the shoulder blade', kw: ['blade', 'under', 'back'] },
      { v: 'deep', label: 'Deep in the joint', kw: ['deep', 'joint'] },
      { v: 'front', label: 'Front of shoulder', kw: ['front'] },
      { v: 'painful', label: 'The clicks hurt', kw: ['hurt', 'painful'] },
    ] }],
  },
  {
    id: 'scapReps', title: 'Shoulder-blade control (8 reps)', mode: 'reps', reps: 8, sides: 'both', focus: 'scapula',
    say: 'Last movement test. Hold something light in each hand and raise both arms forward overhead and back down, eight times at a steady pace. I am watching for shrugging and leaning as you tire.',
    steps: ['Light weight in each hand', 'Forward raise overhead and down', '8 steady reps', 'I track shrug and trunk lean as you fatigue'],
    rep: { metric: 'elevation', up: 120, down: 40, plane: [30, 130] },
    follow: [{ id: 'feel', q: 'Did the shoulder blade feel like it was hitching, clunking, or tiring?', opts: yn }],
  },
  {
    id: 'palpate', title: 'Self-palpation', mode: 'manual', sides: 'affected', focus: 'biceps',
    say: 'Two quick presses. First, find the bony bump on top of the shoulder where the collarbone ends and press it. Then press the front of the shoulder about three fingers below that bony tip while rotating the arm slightly outward. Press Next when finished.',
    steps: ['Press the AC joint: the bump at the outer end of the collarbone', 'Press the bicipital groove: front of the shoulder, 3 fingers below the bony tip', 'Compare with the other side'],
    follow: [
      { id: 'ac', q: 'Was the bony bump on top tender?', opts: yn },
      { id: 'groove', q: 'Was the front groove tender, more than on the other side?', opts: yn },
    ],
  },
  {
    id: 'neck', title: 'Neck screen', mode: 'manual', sides: 'both', focus: 'nerves',
    say: 'Gently turn your head toward the sore side, then tilt it back and toward that shoulder, and hold for five seconds. Only go as far as is comfortable.',
    steps: ['Turn head toward the sore side', 'Tilt back and toward that shoulder', 'Hold 5 s. Gentle, never force'],
    follow: [{ id: 'arm', q: 'Did that send pain or tingling into the shoulder or arm?', opts: yn }],
  },
];

export const QUICK_TEST_IDS = ['calib', 'flex', 'abd', 'rot90', 'hawkins', 'obrien', 'latTest', 'scapClick'];
