/* Ghosty Gains - Mobile App Engine */
(() => {
  'use strict';
  const { nutrients: MEAL_NUTRIENTS, styles: TRAINING_STYLES, prescription: rpePrescription,
    scaleNutrition, mealTotals } = window.GhostyLogic;
  const { validDate, shiftDate, copyMealPlans, parseMachineDisplay, validateMachineMetrics } = window.GhostyDaily;
  const { normalize: normalizeSupplements, suggestions: supplementSuggestions } = window.GhostySupplements;
  const styleForGoal = goal => goal === 'strongman' ? 'strength' : ['get_fit', 'fatloss', 'stay_same'].includes(goal) ? 'fitness' : 'bodybuilding';

  // --- Audio / Haptic Feedback ---
  const audioCtx = window.AudioContext || window.webkitAudioContext ? new (window.AudioContext || window.webkitAudioContext)() : null;
  function playBeep(freq = 880, duration = 0.15) {
    if (!audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (_) {}
  }

  function triggerVibrate(ms = 150) {
    if (window.AndroidApp && typeof window.AndroidApp.vibrate === 'function') {
      window.AndroidApp.vibrate(ms);
    } else if (navigator.vibrate) {
      navigator.vibrate(ms);
    }
  }

  function showToast(msg) {
    if (window.AndroidApp && typeof window.AndroidApp.showToast === 'function') {
      window.AndroidApp.showToast(msg);
    } else {
      const toast = document.createElement('div');
      toast.style.position = 'fixed';
      toast.style.bottom = '80px';
      toast.style.left = '50%';
      toast.style.transform = 'translateX(-50%)';
      toast.style.background = 'rgba(21, 21, 33, 0.95)';
      toast.style.color = '#00c8ff';
      toast.style.border = '1px solid #00c8ff';
      toast.style.padding = '8px 16px';
      toast.style.borderRadius = '20px';
      toast.style.fontSize = '12px';
      toast.style.fontWeight = 'bold';
      toast.style.zIndex = '9999';
      toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      toast.textContent = msg;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2200);
    }
  }

  // --- Unit Conversion Helpers ---
  const toKg = (v, u) => u === 'stone' ? v * 6.35029318 : u === 'lb' ? v * 0.45359237 : Number(v);
  const fromKg = (v, u) => u === 'stone' ? v / 6.35029318 : u === 'lb' ? v / 0.45359237 : Number(v);
  const fmt = v => Math.round(v).toLocaleString('en-GB');

  // Escape text from users / Open Food Facts before it goes into innerHTML
  const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // Local calendar date (YYYY-MM-DD). toISOString() is UTC, which rolls the day over at the wrong time.
  function localDateStr(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Monday-based week key so workout ticks reset each new training week
  function weekKey(d = new Date()) {
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return localDateStr(monday);
  }

  function copyText(text, okMsg) {
    if (window.AndroidApp && typeof window.AndroidApp.copyToClipboard === 'function') {
      window.AndroidApp.copyToClipboard(text);
      showToast(okMsg);
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => showToast(okMsg), () => prompt('Copy this:', text));
    } else {
      prompt('Copy this:', text);
    }
  }

  // --- Goal Archetypes ---
  const GOAL_PRESETS = {
    bodybuilding: {
      id: 'bodybuilding',
      name: 'Bodybuilding Return',
      badge: '💪 Bodybuilder Return',
      tagline: 'Rebuild muscle, joint health, RPE 8–10, controlled quality sets',
      calorieOffset: 250,
      proteinPerKg: 1.8,
      routineId: 'bodybuilding'
    },
    fatloss: {
      id: 'fatloss',
      name: 'Fat Loss / Shred',
      badge: '🔥 Fat Loss / Shred',
      tagline: 'Caloric deficit (−400 kcal), high protein, cardio + conditioning',
      calorieOffset: -400,
      proteinPerKg: 2.2,
      routineId: 'fatloss'
    },
    gainz: {
      id: 'gainz',
      name: 'Muscle Gainz / Bulk',
      badge: '🚀 Muscle Gainz',
      tagline: 'Caloric surplus (+300 kcal), hypertrophy volume overload',
      calorieOffset: 300,
      proteinPerKg: 2.0,
      routineId: 'gainz'
    },
    stay_same: {
      id: 'stay_same',
      name: 'Stay The Same / Recomp',
      badge: '⚖️ Recomp / Maintain',
      tagline: 'Exact maintenance, body recomposition, steady strength',
      calorieOffset: 0,
      proteinPerKg: 1.8,
      routineId: 'stay_same'
    },
    get_fit: {
      id: 'get_fit',
      name: 'Get Fit / Athletic',
      badge: '🏃 Get Fit / Athletic',
      tagline: 'Calisthenics, parkour joint mobility, core, athletic conditioning',
      calorieOffset: 0,
      proteinPerKg: 1.6,
      routineId: 'get_fit'
    },
    pure_bodybuilder: {
      id: 'pure_bodybuilder',
      name: 'Dedicated Bodybuilder',
      badge: '🏆 Dedicated Bodybuilder',
      tagline: 'High volume, chest/bi, back/tri, legs/glutes, isolation drop-sets',
      calorieOffset: 250,
      proteinPerKg: 2.2,
      routineId: 'pure_bodybuilder'
    },
    strongman: {
      id: 'strongman',
      name: 'Strongman / Strongwoman',
      badge: '🦍 Strongman / Strongwoman',
      tagline: 'Heavy compound lifts (3-6 reps), Overhead Log/Press, Carries & Deadlifts',
      calorieOffset: 450,
      proteinPerKg: 2.0,
      routineId: 'strongman'
    }
  };

  // --- Initial Preset Routines ---
  const DEFAULT_ROUTINES = {
    bodybuilding: {
      title: "Ghosty's Bodybuilding Return Split",
      days: [
        {
          id: 'mon', dayName: 'Monday', title: 'Light conditioning + core', isRest: false,
          exercises: [
            { id: 'e1', name: 'Warm-up', sets: '1 × 5–10 min', notes: 'Dynamic mobility & pulse raiser' },
            { id: 'e2', name: 'Incline walk, bike or rower', sets: '1 × 10–15 min', notes: 'Easy steady pace' },
            { id: 'e3', name: 'Ab crunch machine', sets: '2 × 10–15', notes: 'Controlled tempo' },
            { id: 'e4', name: 'Dead bug or bird dog', sets: '2 × 8–10', notes: 'Each side, core brace' },
            { id: 'e5', name: "Farmer's walks", sets: '2 × 20–30 sec', notes: 'Heavy dumbbells, upright posture' },
            { id: 'e6', name: 'Cool-down / mobility', sets: '1 × 5 min', notes: 'Joint mobility & stretch' }
          ]
        },
        {
          id: 'tue', dayName: 'Tuesday', title: 'Recovery / optional home session', isRest: true,
          exercises: [
            { id: 'e7', name: 'Comfortable push-ups / incline', sets: '2 × 8–12', notes: 'Stop well before failure' },
            { id: 'e8', name: 'Bodyweight squats', sets: '2 × 10–15', notes: 'Slow and smooth' },
            { id: 'e9', name: 'Glute bridges', sets: '2 × 12–15', notes: 'Squeeze at top' },
            { id: 'e10', name: 'Calf raises', sets: '2 × 12–20', notes: 'Full stretch and peak contraction' },
            { id: 'e11', name: 'Gentle wrist, shoulder & hip mobility', sets: '1 × 5 min', notes: 'Rest if sore' }
          ]
        },
        {
          id: 'wed', dayName: 'Wednesday', title: 'Chest + Biceps', isRest: false,
          exercises: [
            { id: 'e12', name: 'Incline dumbbell press', sets: '2–3 × 8–12', notes: '2–3 reps in reserve, controlled' },
            { id: 'e13', name: 'Machine chest press', sets: '2–3 × 8–12', notes: 'Smooth eccentric tempo' },
            { id: 'e14', name: 'Cable fly', sets: '2–3 × 12–15', notes: 'Chest stretch, avoid excessive flare' },
            { id: 'e15', name: 'EZ-bar curls', sets: '2–3 × 8–12', notes: 'Strict form, elbows locked at sides' },
            { id: 'e16', name: 'Hammer curls', sets: '2–3 × 10–12', notes: 'Brachialis & forearm focus' }
          ]
        },
        {
          id: 'thu', dayName: 'Thursday', title: 'Rest & Recovery', isRest: true,
          exercises: [
            { id: 'e17', name: 'Rest, hydrate & 7–9 hrs sleep', sets: 'Full Day', notes: 'Easy walk is fine' }
          ]
        },
        {
          id: 'fri', dayName: 'Friday', title: 'Back + Triceps', isRest: false,
          exercises: [
            { id: 'e18', name: 'Lat pulldown', sets: '2–3 × 8–12', notes: 'Drive elbows down to hips' },
            { id: 'e19', name: 'Seated cable row', sets: '2–3 × 8–12', notes: 'Chest up, squeeze rhomboids' },
            { id: 'e20', name: 'Chest-supported row', sets: '2–3 × 8–12', notes: 'Protects lower back' },
            { id: 'e21', name: 'Face pulls', sets: '2–3 × 12–15', notes: 'Rear delts & rotator cuff health' },
            { id: 'e22', name: 'Cable pushdowns', sets: '2–3 × 10–15', notes: 'Keep elbows tucked' },
            { id: 'e23', name: 'Overhead cable extensions', sets: '2–3 × 10–15', notes: 'Triceps long head stretch' }
          ]
        },
        {
          id: 'sat', dayName: 'Saturday', title: 'Legs + Glutes', isRest: false,
          exercises: [
            { id: 'e24', name: 'Leg press', sets: '2–3 × 10–15', notes: 'Full depth, keep lower back glued' },
            { id: 'e25', name: 'Romanian deadlift (light/controlled)', sets: '2–3 × 8–12', notes: 'Hamstrings hinge, neutral spine' },
            { id: 'e26', name: 'Hip thrust', sets: '2–3 × 8–12', notes: 'Glute lockout at top' },
            { id: 'e27', name: 'Leg curl (seated/lying)', sets: '2–3 × 10–15', notes: 'Controlled negative' },
            { id: 'e28', name: 'Leg extension', sets: '2–3 × 10–15', notes: 'Quad peak squeeze' },
            { id: 'e29', name: 'Hip abduction or cable kickback', sets: '2–3 × 12–15', notes: 'Glute medius' },
            { id: 'e30', name: 'Calf raises', sets: '2–3 × 12–20', notes: '2 sec pause at top' }
          ]
        },
        {
          id: 'sun', dayName: 'Sunday', title: 'Rest & Meal Prep', isRest: true,
          exercises: [
            { id: 'e31', name: 'Rest and prepare for next week', sets: 'Full Day', notes: 'Consistency beats burnout' }
          ]
        }
      ]
    },
    fatloss: {
      title: "Fat Loss & Metabolic Conditioning Split",
      days: [
        {
          id: 'mon', dayName: 'Monday', title: 'Upper Body Hypertrophy + HIIT Finisher', isRest: false,
          exercises: [
            { id: 'fl1', name: 'Incline Dumbbell Press', sets: '3 × 10–12', notes: 'Preserve upper chest muscle' },
            { id: 'fl2', name: 'Lat Pulldown', sets: '3 × 10–12', notes: 'Full lat stretch' },
            { id: 'fl3', name: 'Dumbbell Lateral Raises', sets: '3 × 15–20', notes: 'Shoulder cap burn' },
            { id: 'fl4', name: 'Triceps Pushdowns & Bicep Curls (Superset)', sets: '3 × 12–15', notes: 'Minimal rest' },
            { id: 'fl5', name: 'Incline Treadmill Walk / Sprint Intervals', sets: '15 min HIIT', notes: '30s sprint, 60s walk' }
          ]
        },
        {
          id: 'tue', dayName: 'Tuesday', title: 'Lower Body & Core Blast', isRest: false,
          exercises: [
            { id: 'fl6', name: 'Goblet Squats / Leg Press', sets: '3 × 12–15', notes: 'High metabolic burn' },
            { id: 'fl7', name: 'Dumbbell Romanian Deadlifts', sets: '3 × 10–12', notes: 'Hamstrings & glutes' },
            { id: 'fl8', name: 'Walking Lunges', sets: '3 × 12 each leg', notes: 'Keep chest high' },
            { id: 'fl9', name: 'Hanging Leg Raises / Plank', sets: '3 × 15 / 60s', notes: 'Tight core brace' }
          ]
        },
        {
          id: 'wed', dayName: 'Wednesday', title: 'Active Recovery & Zone 2 Cardio', isRest: true,
          exercises: [
            { id: 'fl10', name: 'Zone 2 Cardio (Brisk Walk/Incline/Cycle)', sets: '35–45 min', notes: 'Heart rate ~120-135 bpm' }
          ]
        },
        {
          id: 'thu', dayName: 'Thursday', title: 'Push / Pull Strength Retention', isRest: false,
          exercises: [
            { id: 'fl11', name: 'Barbell/Dumbbell Bench Press', sets: '3 × 8–10', notes: 'Keep heavy loading' },
            { id: 'fl12', name: 'Chest Supported Cable Rows', sets: '3 × 10–12', notes: 'Squeeze back' },
            { id: 'fl13', name: 'Overhead Shoulder Press', sets: '3 × 10–12', notes: 'Strict overhead drive' },
            { id: 'fl14', name: 'Face Pulls', sets: '3 × 15', notes: 'Posture & upper back' }
          ]
        },
        {
          id: 'fri', dayName: 'Friday', title: 'Legs, Glutes & Conditioning Circuit', isRest: false,
          exercises: [
            { id: 'fl15', name: 'Leg Extensions & Leg Curls', sets: '3 × 15 each', notes: 'Quad & ham isolation' },
            { id: 'fl16', name: 'Hip Thrusts', sets: '3 × 12', notes: 'Glute burn' },
            { id: 'fl17', name: "Kettlebell Swings / Farmer's Walks", sets: '4 × 15 swings / 30s walk', notes: 'Calorie torch' }
          ]
        },
        {
          id: 'sat', dayName: 'Saturday', title: 'Outdoor Walk / Calisthenics Fun', isRest: true,
          exercises: [
            { id: 'fl18', name: '10,000 Steps / Light Bodyweight Flow', sets: 'Daily Goal', notes: 'Burn calories effortlessly' }
          ]
        },
        {
          id: 'sun', dayName: 'Sunday', title: 'Rest & Full Recovery', isRest: true,
          exercises: [
            { id: 'fl19', name: 'Rest, hydrate, meal prep for deficit', sets: 'Full Day', notes: 'Stay hydrated' }
          ]
        }
      ]
    },
    gainz: {
      title: "Mass Gainz & Hypertrophy Overload Split",
      days: [
        {
          id: 'mon', dayName: 'Monday', title: 'Chest & Triceps Hypertrophy', isRest: false,
          exercises: [
            { id: 'gz1', name: 'Incline Barbell/Dumbbell Press', sets: '4 × 8–10', notes: 'Progressive overload primary lift' },
            { id: 'gz2', name: 'Flat Dumbbell Press', sets: '3 × 8–12', notes: 'Deep stretch at bottom' },
            { id: 'gz3', name: 'Cable Chest Flyes (Low to High)', sets: '3 × 12–15', notes: 'Upper chest squeeze' },
            { id: 'gz4', name: 'Skull Crushers / EZ-bar Extensions', sets: '3 × 10–12', notes: 'Triceps mass builder' },
            { id: 'gz5', name: 'Straight Bar Cable Pushdowns', sets: '3 × 12–15', notes: 'Drop set on final set' }
          ]
        },
        {
          id: 'tue', dayName: 'Tuesday', title: 'Back & Biceps Hypertrophy', isRest: false,
          exercises: [
            { id: 'gz6', name: 'Barbell Bent Over Rows / T-Bar Row', sets: '4 × 8–10', notes: 'Thick back builder' },
            { id: 'gz7', name: 'Wide Grip Lat Pulldown', sets: '3 × 10–12', notes: 'Focus on lat flare' },
            { id: 'gz8', name: 'Single Arm Dumbbell Rows', sets: '3 × 10–12', notes: 'Full lat stretch' },
            { id: 'gz9', name: 'Barbell / Incline Dumbbell Curls', sets: '3 × 8–12', notes: 'Bicep peak overload' },
            { id: 'gz10', name: 'Hammer Curls', sets: '3 × 10–12', notes: 'Forearms & thickness' }
          ]
        },
        {
          id: 'wed', dayName: 'Wednesday', title: 'Rest / Anabolic Growth Day', isRest: true,
          exercises: [
            { id: 'gz11', name: 'Eat in surplus, stretch, sleep 8+ hours', sets: 'Rest Day', notes: 'Muscle grows while resting' }
          ]
        },
        {
          id: 'thu', dayName: 'Thursday', title: 'Legs & Calves Destruction', isRest: false,
          exercises: [
            { id: 'gz12', name: 'Barbell Back Squats or Hack Squat', sets: '4 × 8–10', notes: 'Massive quad overload' },
            { id: 'gz13', name: 'Romanian Deadlifts', sets: '3 × 8–10', notes: 'Hamstring & glute builder' },
            { id: 'gz14', name: 'Leg Extensions', sets: '3 × 12–15', notes: '3 sec eccentric tempo' },
            { id: 'gz15', name: 'Lying Leg Curls', sets: '3 × 12–15', notes: 'Hamstrings isolation' },
            { id: 'gz16', name: 'Standing Calf Raises', sets: '4 × 15–20', notes: 'Full range of motion' }
          ]
        },
        {
          id: 'fri', dayName: 'Friday', title: 'Shoulders, Traps & Arms', isRest: false,
          exercises: [
            { id: 'gz17', name: 'Seated Dumbbell Shoulder Press', sets: '4 × 8–12', notes: 'Boulder shoulders' },
            { id: 'gz18', name: 'Dumbbell / Cable Lateral Raises', sets: '4 × 12–15', notes: 'Strict side delt' },
            { id: 'gz19', name: 'Face Pulls / Rear Delt Flyes', sets: '3 × 15', notes: '3D delts' },
            { id: 'gz20', name: 'Heavy Barbell Shrugs', sets: '3 × 12–15', notes: 'Trap mass' },
            { id: 'gz21', name: 'Superset: Cable Bicep Curl + Overhead Tricep Ext', sets: '3 × 12–15', notes: 'Arm pump' }
          ]
        },
        {
          id: 'sat', dayName: 'Saturday', title: 'Rest & Nutrient Loading', isRest: true,
          exercises: [
            { id: 'gz22', name: 'Rest and high-protein nutrition', sets: 'Rest Day', notes: 'Protein synthesis focus' }
          ]
        },
        {
          id: 'sun', dayName: 'Sunday', title: 'Full Rest & Recovery', isRest: true,
          exercises: [
            { id: 'gz23', name: 'Full recovery for next week overload', sets: 'Rest Day', notes: 'Ready for Monday PRs' }
          ]
        }
      ]
    },
    strongman: {
      title: "Strongman / Strongwoman Maximal Strength Split",
      days: [
        {
          id: 'mon', dayName: 'Monday', title: 'Heavy Overhead Press & Triceps Power', isRest: false,
          exercises: [
            { id: 'sm1', name: 'Overhead Log Press / Axle / Military Press', sets: '4 × 3–5', notes: 'Explosive leg drive or strict press' },
            { id: 'sm2', name: 'Incline Barbell Heavy Press', sets: '3 × 5–6', notes: 'Upper chest & triceps strength' },
            { id: 'sm3', name: 'Close Grip Bench Press', sets: '3 × 6–8', notes: 'Lockout power' },
            { id: 'sm4', name: 'Dumbbell Z-Press', sets: '3 × 8', notes: 'Seated on floor, pure core & shoulders' },
            { id: 'sm5', name: 'Heavy Triceps Dip / Pushdown', sets: '3 × 8–10', notes: 'Triceps lockout' }
          ]
        },
        {
          id: 'tue', dayName: 'Tuesday', title: 'Deadlift & Posterior Chain Power', isRest: false,
          exercises: [
            { id: 'sm6', name: 'Conventional Deadlift / Trap Bar Deadlift', sets: '4 × 3–5', notes: 'Heavy pulling power, brace hard' },
            { id: 'sm7', name: 'Deficit Deadlifts or Block Pulls', sets: '3 × 4–6', notes: 'Off-the-floor speed or lockout' },
            { id: 'sm8', name: 'Barbell Good Mornings', sets: '3 × 8', notes: 'Lower back, glutes & hamstrings' },
            { id: 'sm9', name: 'Heavy Barbell Shrugs & Grip Holds', sets: '3 × 10 (10s hold)', notes: 'Trap & crushing grip strength' }
          ]
        },
        {
          id: 'wed', dayName: 'Wednesday', title: 'Rest & High-Calorie Recovery', isRest: true,
          exercises: [
            { id: 'sm10', name: 'Rest, hydrate, lots of protein & carbs', sets: 'Rest Day', notes: 'Central Nervous System recovery' }
          ]
        },
        {
          id: 'thu', dayName: 'Thursday', title: 'Squat & Leg Drive Power', isRest: false,
          exercises: [
            { id: 'sm11', name: 'Heavy Barbell Back Squats', sets: '4 × 3–5', notes: 'Depth, explosive drive out of hole' },
            { id: 'sm12', name: 'Front Squats or Safety Bar Squats', sets: '3 × 5–6', notes: 'Quad drive & upper back rigidity' },
            { id: 'sm13', name: 'Heavy Romanian Deadlift', sets: '3 × 6–8', notes: 'Posterior chain' },
            { id: 'sm14', name: 'Standing Calf & Ankle Drive', sets: '3 × 12', notes: 'Carry foundation' }
          ]
        },
        {
          id: 'fri', dayName: 'Friday', title: 'Rest / Prepare for Event Day', isRest: true,
          exercises: [
            { id: 'sm15', name: 'Joint mobility & recovery', sets: 'Rest Day', notes: 'Get primed for Saturday carries' }
          ]
        },
        {
          id: 'sat', dayName: 'Saturday', title: 'Strongman/Strongwoman Event Training & Carries', isRest: false,
          exercises: [
            { id: 'sm16', name: "Heavy Farmer's Walks", sets: '4 × 30–40 meters', notes: 'Grip, traps, core stability' },
            { id: 'sm17', name: 'Sandbag / Keg / Heavy Ball Load & Carry', sets: '4 × 3–5 reps / 25m', notes: 'Triple extension & grit' },
            { id: 'sm18', name: 'Yoke Walk or Heavy Sled Push / Drag', sets: '4 × 20 meters', notes: 'Leg & hip brute power' },
            { id: 'sm19', name: 'Axle Bar / Fat Grip Bicep Curls', sets: '3 × 8–10', notes: 'Bicep tendon resilience' }
          ]
        },
        {
          id: 'sun', dayName: 'Sunday', title: 'Rest & Massive Feast', isRest: true,
          exercises: [
            { id: 'sm20', name: 'Full rest, sauna/hot bath, recover', sets: 'Rest Day', notes: 'Recharge for heavy presses' }
          ]
        }
      ]
    },
    pure_bodybuilder: {
      title: "Dedicated Bodybuilder High-Volume Split",
      days: [
        {
          id: 'mon', dayName: 'Monday', title: 'Chest + Biceps', isRest: false,
          exercises: [
            { id: 'pb1', name: 'Incline Barbell / Smith Press', sets: '4 × 6–10', notes: 'Upper chest priority, 2 RIR' },
            { id: 'pb2', name: 'Flat Dumbbell Press', sets: '3 × 8–12', notes: 'Deep stretch, controlled negative' },
            { id: 'pb3', name: 'Pec Deck / Cable Fly', sets: '3 × 12–15', notes: 'Drop-set on final set' },
            { id: 'pb4', name: 'Barbell Curl', sets: '3 × 8–12', notes: 'Strict, no swinging' },
            { id: 'pb5', name: 'Incline Dumbbell Curl', sets: '3 × 10–12', notes: 'Long-head stretch' },
            { id: 'pb6', name: 'Cable Hammer Curl', sets: '2 × 12–15', notes: 'Brachialis finisher' }
          ]
        },
        {
          id: 'tue', dayName: 'Tuesday', title: 'Back + Triceps', isRest: false,
          exercises: [
            { id: 'pb7', name: 'Weighted Pull-up / Lat Pulldown', sets: '4 × 6–10', notes: 'Full stretch at top' },
            { id: 'pb8', name: 'Chest-Supported T-Bar Row', sets: '3 × 8–12', notes: 'Squeeze mid-back' },
            { id: 'pb9', name: 'Single-Arm Cable Row', sets: '3 × 10–12', notes: 'Elbow to hip' },
            { id: 'pb10', name: 'Close-Grip Bench Press', sets: '3 × 6–10', notes: 'Triceps mass' },
            { id: 'pb11', name: 'Overhead Cable Extension', sets: '3 × 10–15', notes: 'Long head stretch' },
            { id: 'pb12', name: 'Rope Pushdown', sets: '2 × 12–15', notes: 'Drop-set on final set' }
          ]
        },
        {
          id: 'wed', dayName: 'Wednesday', title: 'Legs + Glutes', isRest: false,
          exercises: [
            { id: 'pb13', name: 'Hack Squat / Back Squat', sets: '4 × 6–10', notes: 'Full depth' },
            { id: 'pb14', name: 'Romanian Deadlift', sets: '3 × 8–10', notes: 'Hamstring stretch' },
            { id: 'pb15', name: 'Walking Lunges', sets: '3 × 10 each', notes: 'Glute focus, long stride' },
            { id: 'pb16', name: 'Leg Extension', sets: '3 × 12–15', notes: 'Pause at top' },
            { id: 'pb17', name: 'Seated Leg Curl', sets: '3 × 10–15', notes: 'Slow eccentric' },
            { id: 'pb18', name: 'Standing Calf Raise', sets: '4 × 10–15', notes: '2 sec pause at bottom' }
          ]
        },
        {
          id: 'thu', dayName: 'Thursday', title: 'Rest & Recovery', isRest: true,
          exercises: [
            { id: 'pb19', name: 'Rest, walk, eat at surplus', sets: 'Rest Day', notes: '7–9 hrs sleep' }
          ]
        },
        {
          id: 'fri', dayName: 'Friday', title: 'Shoulders + Rear Delts', isRest: false,
          exercises: [
            { id: 'pb20', name: 'Seated Dumbbell Shoulder Press', sets: '4 × 6–10', notes: 'Controlled depth' },
            { id: 'pb21', name: 'Cable Lateral Raise', sets: '4 × 12–20', notes: 'Side delt priority' },
            { id: 'pb22', name: 'Reverse Pec Deck', sets: '3 × 12–15', notes: 'Rear delts' },
            { id: 'pb23', name: 'Dumbbell Shrugs', sets: '3 × 10–15', notes: 'Hold at top' },
            { id: 'pb24', name: 'Face Pulls', sets: '2 × 15', notes: 'Shoulder health' }
          ]
        },
        {
          id: 'sat', dayName: 'Saturday', title: 'Arms + Weak Points', isRest: false,
          exercises: [
            { id: 'pb25', name: 'EZ-Bar Preacher Curl', sets: '3 × 8–12', notes: 'No bounce at bottom' },
            { id: 'pb26', name: 'Dips (weighted if able)', sets: '3 × 8–12', notes: 'Triceps & lower chest' },
            { id: 'pb27', name: 'Superset: Cable Curl + Pushdown', sets: '3 × 12–15', notes: 'Pump work' },
            { id: 'pb28', name: 'Weak point of choice', sets: '3 × 10–15', notes: 'Lagging muscle group' },
            { id: 'pb29', name: 'Hanging Leg Raise', sets: '3 × 12–15', notes: 'Abs' }
          ]
        },
        {
          id: 'sun', dayName: 'Sunday', title: 'Rest & Meal Prep', isRest: true,
          exercises: [
            { id: 'pb30', name: 'Full rest, meal prep for the week', sets: 'Rest Day', notes: 'Recover for Monday' }
          ]
        }
      ]
    },
    stay_same: {
      title: "Recomp / Maintain Full-Body Split",
      days: [
        {
          id: 'mon', dayName: 'Monday', title: 'Full Body A (Strength)', isRest: false,
          exercises: [
            { id: 'ss1', name: 'Back Squat / Leg Press', sets: '3 × 6–8', notes: 'Keep strength steady' },
            { id: 'ss2', name: 'Bench Press / DB Press', sets: '3 × 6–8', notes: '2 RIR' },
            { id: 'ss3', name: 'Barbell / Cable Row', sets: '3 × 8–10', notes: 'Squeeze back' },
            { id: 'ss4', name: 'Plank', sets: '3 × 45s', notes: 'Brace hard' }
          ]
        },
        {
          id: 'tue', dayName: 'Tuesday', title: 'Steps & Mobility', isRest: true,
          exercises: [
            { id: 'ss5', name: '8–10k steps + 10 min mobility', sets: 'Active Rest', notes: 'Easy pace' }
          ]
        },
        {
          id: 'wed', dayName: 'Wednesday', title: 'Full Body B (Hypertrophy)', isRest: false,
          exercises: [
            { id: 'ss6', name: 'Romanian Deadlift', sets: '3 × 8–10', notes: 'Hamstrings & glutes' },
            { id: 'ss7', name: 'Overhead Press', sets: '3 × 8–10', notes: 'Strict' },
            { id: 'ss8', name: 'Lat Pulldown', sets: '3 × 10–12', notes: 'Full stretch' },
            { id: 'ss9', name: 'Walking Lunges', sets: '2 × 10 each', notes: 'Controlled' },
            { id: 'ss10', name: 'Curl + Pushdown Superset', sets: '2 × 12–15', notes: 'Arm pump' }
          ]
        },
        {
          id: 'thu', dayName: 'Thursday', title: 'Rest & Recovery', isRest: true,
          exercises: [
            { id: 'ss11', name: 'Rest, hydrate, sleep 7–9 hrs', sets: 'Rest Day', notes: 'Easy walk is fine' }
          ]
        },
        {
          id: 'fri', dayName: 'Friday', title: 'Full Body C (Volume)', isRest: false,
          exercises: [
            { id: 'ss12', name: 'Hack Squat / Goblet Squat', sets: '3 × 10–12', notes: 'Quads' },
            { id: 'ss13', name: 'Incline DB Press', sets: '3 × 10–12', notes: 'Upper chest' },
            { id: 'ss14', name: 'Chest-Supported Row', sets: '3 × 10–12', notes: 'Upper back' },
            { id: 'ss15', name: 'Lateral Raise', sets: '3 × 12–15', notes: 'Side delts' },
            { id: 'ss16', name: 'Hanging Knee Raise', sets: '3 × 12', notes: 'Core' }
          ]
        },
        {
          id: 'sat', dayName: 'Saturday', title: 'Cardio / Sport', isRest: true,
          exercises: [
            { id: 'ss17', name: '30–45 min Zone 2 or sport', sets: 'Active Rest', notes: 'Enjoy it' }
          ]
        },
        {
          id: 'sun', dayName: 'Sunday', title: 'Rest & Meal Prep', isRest: true,
          exercises: [
            { id: 'ss18', name: 'Full rest and prep for the week', sets: 'Rest Day', notes: 'Consistency wins' }
          ]
        }
      ]
    },
    get_fit: {
      title: "Get Fit / Athletic Physique & Parkour Mobility",
      days: [
        {
          id: 'mon', dayName: 'Monday', title: 'Upper Body Calisthenics & Strength', isRest: false,
          exercises: [
            { id: 'gf1', name: 'Pull-ups / Chin-ups', sets: '3–4 × 6–10', notes: 'Controlled tempo, full hang' },
            { id: 'gf2', name: 'Dips / Incline Push-ups', sets: '3 × 10–12', notes: 'Chest & triceps power' },
            { id: 'gf3', name: 'Dumbbell Rows / Inverted Rows', sets: '3 × 10–12', notes: 'Scapular control' },
            { id: 'gf4', name: 'Overhead Kettlebell Press', sets: '3 × 8–10', notes: 'Core brace' },
            { id: 'gf5', name: 'Hanging Leg Raises & L-Sit Hold', sets: '3 × 10 / 15s', notes: 'Gymnast core strength' }
          ]
        },
        {
          id: 'tue', dayName: 'Tuesday', title: 'Leg Power & Joint Mobility', isRest: false,
          exercises: [
            { id: 'gf6', name: 'Bodyweight / Goblet Squats', sets: '3 × 12–15', notes: 'Deep ankle & hip mobility' },
            { id: 'gf7', name: 'Single Leg Bulgarian Split Squats', sets: '3 × 8–10 each', notes: 'Balance & unilateral strength' },
            { id: 'gf8', name: 'Nordic Hamstring Curls / Glute Bridges', sets: '3 × 8–12', notes: 'Knee tendon resilience' },
            { id: 'gf9', name: 'Tibialis & Calf Raises', sets: '3 × 15–20', notes: 'Shin splint & impact protection' }
          ]
        },
        {
          id: 'wed', dayName: 'Wednesday', title: 'Mobility & Active Recovery', isRest: true,
          exercises: [
            { id: 'gf10', name: 'Wrist, Shoulder & Hip Mobility Flow', sets: '20 min', notes: 'Joint health' }
          ]
        },
        {
          id: 'thu', dayName: 'Thursday', title: 'Athletic Conditioning & Agility', isRest: false,
          exercises: [
            { id: 'gf11', name: 'Jump Rope / Agility Footwork', sets: '4 × 2 min', notes: 'Coordination & cardio' },
            { id: 'gf12', name: 'Kettlebell Swings', sets: '4 × 15', notes: 'Explosive hip hinge' },
            { id: 'gf13', name: 'Bear Crawls & Crab Walks', sets: '3 × 20m', notes: 'Shoulder stability' },
            { id: 'gf14', name: "Farmer's Carries", sets: '3 × 40 sec', notes: 'Grip & posture' }
          ]
        },
        {
          id: 'fri', dayName: 'Friday', title: 'Full Body Athletic Tone', isRest: false,
          exercises: [
            { id: 'gf15', name: 'Push-ups Variations (Diamond / Wide)', sets: '3 × 12–15', notes: 'Chest & triceps' },
            { id: 'gf16', name: 'Dumbbell Romanian Deadlift', sets: '3 × 10–12', notes: 'Posture & hamstrings' },
            { id: 'gf17', name: 'Side Plank & Bird Dogs', sets: '3 × 30s each', notes: 'Spinal health' }
          ]
        },
        {
          id: 'sat', dayName: 'Saturday', title: 'Outdoor Sport / Free Flow', isRest: true,
          exercises: [
            { id: 'gf18', name: 'Parkour basics, run, cycle or swim', sets: 'Enjoy Movement', notes: 'Functional fitness' }
          ]
        },
        {
          id: 'sun', dayName: 'Sunday', title: 'Rest & Recharge', isRest: true,
          exercises: [
            { id: 'gf19', name: 'Rest and replenish', sets: 'Rest Day', notes: 'Ready for active week' }
          ]
        }
      ]
    }
  };

  // --- Initial Preset Foods & Recipes ---
  const DEFAULT_MENU = [
    { id: 'm1', l: 'Chicken, rice and mixed veg bowl', k: 460, p: 39, c: 50, f: 10, i: [['Chicken breast', 150, 'g'], ['Rice (dry)', 55, 'g'], ['Frozen mixed vegetables', 150, 'g'], ['Olive oil', 5, 'ml']] },
    { id: 'm2', l: 'Tuna jacket potato with yoghurt dressing', k: 440, p: 34, c: 58, f: 6, i: [['Potatoes', 300, 'g'], ['Tinned tuna, drained', 120, 'g'], ['Greek yoghurt', 40, 'g'], ['Sweetcorn', 40, 'g']] },
    { id: 'm3', l: 'Chicken and cheese wrap', k: 480, p: 38, c: 45, f: 16, i: [['Chicken breast', 130, 'g'], ['Tortilla wraps', 1, 'wrap'], ['Cheddar', 20, 'g'], ['Salad vegetables', 80, 'g']] },
    { id: 'm4', l: 'Beef and bean chilli with rice', k: 490, p: 33, c: 55, f: 14, i: [['Lean beef mince', 120, 'g'], ['Kidney beans, drained', 80, 'g'], ['Chopped tomatoes', 150, 'g'], ['Rice (dry)', 45, 'g']] },
    { id: 'm5', l: 'Egg and cheese sandwich with fruit', k: 430, p: 24, c: 48, f: 16, i: [['Bread', 3, 'slices'], ['Eggs', 2, 'eggs'], ['Cheddar', 15, 'g'], ['Fruit', 1, 'piece']] },
    { id: 'm6', l: 'Salmon, potatoes and broccoli', k: 500, p: 35, c: 45, f: 20, i: [['Salmon fillet', 130, 'g'], ['Potatoes', 250, 'g'], ['Broccoli', 150, 'g']] },
    { id: 'm7', l: 'Turkey mince pasta', k: 510, p: 38, c: 60, f: 12, i: [['Turkey mince', 150, 'g'], ['Pasta (dry)', 65, 'g'], ['Passata', 150, 'g'], ['Grated cheese', 10, 'g']] },
    { id: 'm8', l: 'Chicken curry and rice', k: 520, p: 39, c: 58, f: 14, i: [['Chicken breast', 150, 'g'], ['Rice (dry)', 60, 'g'], ['Curry sauce', 100, 'g'], ['Frozen peas', 80, 'g']] },
    { id: 'm9', l: 'Lean beef burger, oven chips and veg', k: 520, p: 31, c: 52, f: 20, i: [['Lean beef burger', 130, 'g'], ['Burger bun', 1, 'bun'], ['Oven chips', 140, 'g'], ['Frozen vegetables', 100, 'g']] },
    { id: 'm10', l: 'Bean and cheese baked potato', k: 470, p: 22, c: 68, f: 11, i: [['Potatoes', 300, 'g'], ['Baked beans', 170, 'g'], ['Cheddar', 25, 'g'], ['Side salad', 80, 'g']] },
    { id: 'm11', l: 'Whey shake and banana', k: 230, p: 25, c: 28, f: 2, i: [['Whey protein', 30, 'g'], ['Banana', 1, 'piece']] },
    { id: 'm12', l: 'Greek yoghurt and berries', k: 170, p: 15, c: 18, f: 4, i: [['Greek yoghurt', 150, 'g'], ['Frozen berries', 80, 'g']] },
    { id: 'm13', l: 'Peanut butter toast', k: 220, p: 9, c: 24, f: 10, i: [['Bread', 2, 'slices'], ['Peanut butter', 10, 'g']] },
    { id: 'm14', l: 'Cheese and crackers', k: 190, p: 9, c: 18, f: 9, i: [['Cheddar', 20, 'g'], ['Crackers', 25, 'g']] },
    { id: 'm15', l: 'Oats with milk & honey', k: 250, p: 12, c: 38, f: 6, i: [['Oats', 35, 'g'], ['Semi-skimmed milk', 180, 'ml']] }
  ];

  const DEFAULT_FIXED_MEALS = {
    breakfast: {
      title: 'Fixed Breakfast (Every Day)',
      items: [
        { name: 'Tesco Honey & Almond Granola', qty: 50, unit: 'g', kcal: 213, p: 4 },
        { name: 'Peanut butter', qty: 15, unit: 'g (1 tbsp)', kcal: 93, p: 4 },
        { name: 'Tesco Greek Style Yogurt', qty: 100, unit: 'g', kcal: 99, p: 4 }
      ]
    },
    snack: {
      title: 'Fixed Late-Night Snack (Every Day)',
      items: [
        { name: 'Chicken-flavour instant noodles', qty: 1, unit: 'packet', kcal: 380, p: 9 },
        { name: 'Sardines in tomato sauce', qty: 1, unit: 'tin', kcal: 228, p: 18 }
      ]
    }
  };

  const DEFAULT_SLEEP_HYGIENE = [
    { id: 'caffeine', text: '☕ No caffeine within 6–8 hours of bedtime', checked: false },
    { id: 'screens', text: '📱 Blue light filter / screens off 30 min before bed', checked: false },
    { id: 'temperature', text: '❄️ Room temperature cool (18–19°C) & pitch dark', checked: false },
    { id: 'magnesium', text: '💊 Magnesium glycinate / evening supplements taken', checked: false },
    { id: 'winddown', text: '🧘 5-min wind-down stretching / deep box breathing', checked: false }
  ];

  // Common Gym & Bodybuilding food mock database for instant offline scan & search fallback
  const OFFLINE_FOODS_DB = [
    {
      code: '5000128001234',
      name: 'Authentic Greek Yogurt 0% Fat',
      brand: 'Fage / Ghosty Nutrition',
      serving: '100g',
      calories: 54,
      protein: 10.3,
      carbs: 3.0,
      sugars: 3.0,
      fat: 0.0,
      satFat: 0.0,
      fiber: 0.0,
      salt: 0.1,
      nutriScore: 'A',
      image: '🥣'
    },
    {
      code: '5010029000123',
      name: 'Impact 100% Whey Protein (Vanilla)',
      brand: 'MyProtein / Optimum',
      serving: '30g scoop',
      calories: 400,
      protein: 80.0,
      carbs: 6.0,
      sugars: 4.0,
      fat: 6.0,
      satFat: 4.0,
      fiber: 1.0,
      salt: 0.4,
      nutriScore: 'A',
      image: '🥤'
    },
    {
      code: '5000111000456',
      name: 'Pure Rolled Scottish Wholegrain Oats',
      brand: 'Quaker / Flahavans',
      serving: '100g',
      calories: 375,
      protein: 11.0,
      carbs: 60.0,
      sugars: 1.0,
      fat: 8.0,
      satFat: 1.5,
      fiber: 9.0,
      salt: 0.02,
      nutriScore: 'A',
      image: '🌾'
    },
    {
      code: '5012345678900',
      name: 'Fresh Skinless Chicken Breast Fillets',
      brand: 'Butchers Select',
      serving: '100g',
      calories: 120,
      protein: 24.0,
      carbs: 0.0,
      sugars: 0.0,
      fat: 2.5,
      satFat: 0.6,
      fiber: 0.0,
      salt: 0.2,
      nutriScore: 'A',
      image: '🍗'
    },
    {
      code: '5023456789012',
      name: 'Tuna Chunks in Spring Water',
      brand: 'John West / Princes',
      serving: '100g drained',
      calories: 110,
      protein: 26.0,
      carbs: 0.0,
      sugars: 0.0,
      fat: 0.8,
      satFat: 0.2,
      fiber: 0.0,
      salt: 0.8,
      nutriScore: 'A',
      image: '🐟'
    },
    {
      code: '5034567890123',
      name: 'Sardines in Rich Tomato Sauce',
      brand: 'Ocean Fresh',
      serving: '120g tin',
      calories: 190,
      protein: 15.0,
      carbs: 3.5,
      sugars: 2.8,
      fat: 13.0,
      satFat: 3.0,
      fiber: 0.5,
      salt: 0.9,
      nutriScore: 'B',
      image: '🥫'
    },
    {
      code: '5045678901234',
      name: '100% Natural Crunchy Peanut Butter',
      brand: 'Whole Earth / Meridian',
      serving: '100g',
      calories: 596,
      protein: 26.0,
      carbs: 11.0,
      sugars: 5.0,
      fat: 46.0,
      satFat: 8.0,
      fiber: 8.5,
      salt: 0.02,
      nutriScore: 'B',
      image: '🥜'
    },
    {
      code: '5056789012345',
      name: 'White Basmati Rice',
      brand: 'Tilda / Royal',
      serving: '100g uncooked',
      calories: 350,
      protein: 8.5,
      carbs: 77.0,
      sugars: 0.5,
      fat: 0.8,
      satFat: 0.2,
      fiber: 1.5,
      salt: 0.01,
      nutriScore: 'A',
      image: '🍚'
    },
    {
      code: '5067890123456',
      name: 'Lean British Beef Mince 5% Fat',
      brand: 'Prime Beef',
      serving: '100g',
      calories: 135,
      protein: 21.5,
      carbs: 0.0,
      sugars: 0.0,
      fat: 5.0,
      satFat: 2.2,
      fiber: 0.0,
      salt: 0.15,
      nutriScore: 'A',
      image: '🥩'
    },
    {
      code: '5078901234567',
      name: 'Free Range Large Eggs',
      brand: 'British Lion',
      serving: '2 large eggs (100g)',
      calories: 140,
      protein: 12.5,
      carbs: 0.5,
      sugars: 0.5,
      fat: 9.8,
      satFat: 2.8,
      fiber: 0.0,
      salt: 0.35,
      nutriScore: 'A',
      image: '🥚'
    },
    {
      code: '5089012345678',
      name: 'Crunchy Protein Nut & Seed Granola',
      brand: 'Lizi\'s / Jordan\'s',
      serving: '100g',
      calories: 460,
      protein: 14.0,
      carbs: 52.0,
      sugars: 12.0,
      fat: 21.0,
      satFat: 4.5,
      fiber: 8.0,
      salt: 0.2,
      nutriScore: 'B',
      image: '🥣'
    },
    {
      code: '5090123456789',
      name: 'Fresh Cavendish Bananas',
      brand: 'Fairtrade Produce',
      serving: '1 medium banana (100g)',
      calories: 89,
      protein: 1.1,
      carbs: 23.0,
      sugars: 12.0,
      fat: 0.3,
      satFat: 0.1,
      fiber: 2.6,
      salt: 0.01,
      nutriScore: 'A',
      image: '🍌'
    }
  ];

  // --- App State & Local Storage ---
  const STORAGE_KEY = 'ghostyGainsData_v4';

  function getTodayString() {
    return localDateStr();
  }

  const LEGACY_STORAGE_KEYS = ['ghostyGainsData_v3', 'ghostyGainsData_v2'];

  // Copy kept by the Android app in its own files (survives WebView storage being cleared,
  // and is included in Android's automatic backup)
  function readNativeStateBackup() {
    try {
      if (window.AndroidApp && typeof window.AndroidApp.loadStateBackup === 'function') {
        const raw = window.AndroidApp.loadStateBackup();
        if (raw) return JSON.parse(raw);
      }
    } catch (e) {
      console.error('Native backup unreadable', e);
    }
    return null;
  }

  function loadState() {
    let local = null;
    try {
      const data = localStorage.getItem(STORAGE_KEY) || LEGACY_STORAGE_KEYS.map(k => localStorage.getItem(k)).find(Boolean);
      if (data) local = JSON.parse(data);
    } catch (e) {
      console.error(e);
    }
    const native = readNativeStateBackup();
    // Whichever copy was saved most recently wins; older saves have no savedAt (treated as 0)
    const chosen = local && native ? ((native.savedAt || 0) > (local.savedAt || 0) ? native : local) : (local || native);
    if (chosen) return normalizeState(chosen);
    return createDefaultState();
  }

  // Fills in anything missing from older saves or imported backups
  function normalizeState(parsed) {
        const listFields = ['workoutSets', 'workoutSessions', 'mealLogs', 'mealPlans', 'weightLogs', 'stepLogs', 'sleepLogs', 'waterLogs', 'workoutLog', 'progressPhotos', 'measureLogs', 'machineWorkouts'];
        for (const field of listFields) {
          if (parsed[field] != null && !Array.isArray(parsed[field])) throw new Error(`Invalid backup: ${field} must be a list.`);
        }
        parsed.workoutSets = (parsed.workoutSets || []).filter(window.GhostyJournal.validSet);
        parsed.workoutSessions = (parsed.workoutSessions || []).filter(s => s && typeof s.id === 'string' && typeof s.date === 'string');
        const defaults = createDefaultState();
        if (!parsed.profile) parsed.profile = defaults.profile;
        if (!parsed.routines) parsed.routines = {};
        Object.keys(DEFAULT_ROUTINES).forEach(id => {
          if (!parsed.routines[id]) parsed.routines[id] = JSON.parse(JSON.stringify(DEFAULT_ROUTINES[id]));
        });
        if (!GOAL_PRESETS[parsed.activeGoal]) parsed.activeGoal = 'bodybuilding';
        if (!TRAINING_STYLES[parsed.trainingStyle]) parsed.trainingStyle = styleForGoal(parsed.activeGoal);
        if (!Number.isFinite(Number(parsed.trainingRpe)) || Number(parsed.trainingRpe) < 1 || Number(parsed.trainingRpe) > 10) parsed.trainingRpe = TRAINING_STYLES[parsed.trainingStyle].rpe;
        if (!parsed.activeRoutineId || !parsed.routines[parsed.activeRoutineId]) parsed.activeRoutineId = GOAL_PRESETS[parsed.activeGoal].routineId;
        if (!parsed.completedExercises) parsed.completedExercises = {};
        if (!parsed.shoppingChecked) parsed.shoppingChecked = {};
        if (!parsed.customShoppingItems) parsed.customShoppingItems = [];
        if (!parsed.weightLogs) parsed.weightLogs = [];
        parsed.supplements = normalizeSupplements(parsed.supplements);
        if (!parsed.scannedHistory) parsed.scannedHistory = [];
        if (!parsed.lastStepDate) parsed.lastStepDate = getTodayString();
        if (!parsed.lastActiveWeek) parsed.lastActiveWeek = weekKey();
        if (!parsed.progressPhotos) parsed.progressPhotos = [];
        if (!parsed.measureLogs) parsed.measureLogs = [];
        if (!parsed.workoutLog) parsed.workoutLog = [];
        if (!parsed.tapeUnit) parsed.tapeUnit = 'cm';
        if (!parsed.focusMuscles) parsed.focusMuscles = [];
        if (!parsed.napLogs) parsed.napLogs = [];
        if (!parsed.waterLogs) parsed.waterLogs = [];
        if (!parsed.bodyMapSex) parsed.bodyMapSex = parsed.profile.sex === 'female' ? 'female' : 'male';
        if (!parsed.bodyMapSide) parsed.bodyMapSide = 'front';
        if (!parsed.exerciseKit) parsed.exerciseKit = 'gym';
        if (!parsed.profile.heightUnit) parsed.profile.heightUnit = 'ftin';
        if (!parsed.stepGoal) parsed.stepGoal = 10000;
        if (parsed.stepsToday === undefined) parsed.stepsToday = 0;
        if (!parsed.stepLogs) parsed.stepLogs = [];
        if (!parsed.sleepLogs) parsed.sleepLogs = [];
        if (!parsed.sleepTarget) parsed.sleepTarget = 8.0;
        if (!parsed.sleepHygiene) parsed.sleepHygiene = JSON.parse(JSON.stringify(DEFAULT_SLEEP_HYGIENE));
        if (!parsed.nutritionMode) parsed.nutritionMode = 'simple';
        if (!parsed.foodLibrary || parsed.foodLibrary.length === 0) {
          parsed.foodLibrary = JSON.parse(JSON.stringify(OFFLINE_FOODS_DB));
        }
        if (!parsed.mealLogs) {
          parsed.mealLogs = [];
          // Migrate old scanned diary entries
          if (parsed.scannedDiary && parsed.scannedDiary.length > 0) {
            parsed.scannedDiary.forEach(item => {
              parsed.mealLogs.push({
                id: item.id || ('migrated_' + Date.now() + '_' + Math.random()),
                date: item.date || getTodayString(),
                slot: 'snack',
                name: item.name,
                brand: item.brand || '',
                grams: item.weightGrams || 100,
                calories: item.calories || 0,
                protein: item.protein || 0,
                carbs: item.carbs || 0,
                fat: item.fat || 0,
                timestamp: item.time || '12:00'
              });
            });
          }
        }
        if (!Array.isArray(parsed.mealPlans)) parsed.mealPlans = [];
        if (!Array.isArray(parsed.machineWorkouts)) parsed.machineWorkouts = [];
        if (parsed.tutorialCompleted === undefined) parsed.tutorialCompleted = !!parsed.setupComplete;
        if (!parsed.lastActiveDate) parsed.lastActiveDate = getTodayString();
        return parsed;
  }

  function createDefaultState() {
    return {
      activeGoal: 'bodybuilding',
      trainingStyle: 'bodybuilding',
      trainingRpe: 9,
      profile: {
        weight: 10.4,
        unit: 'stone',
        height: 165.1,
        heightUnit: 'ftin',
        age: 33,
        sex: 'male',
        activity: 1.375,
        calorieTarget: 0,
        proteinTarget: 0,
        targetsManual: false
      },
      routines: JSON.parse(JSON.stringify(DEFAULT_ROUTINES)),
      activeRoutineId: 'bodybuilding',
      completedExercises: {},
      workoutSets: [],
      workoutSessions: [],
      progressPhotos: [],
      nutritionMode: 'simple',
      foodLibrary: JSON.parse(JSON.stringify(OFFLINE_FOODS_DB)),
      mealLogs: [],
      mealPlans: [],
      machineWorkouts: [],
      tutorialCompleted: false,
      menu: JSON.parse(JSON.stringify(DEFAULT_MENU)),
      shoppingChecked: {},
      customShoppingItems: [],
      weightLogs: [],
      supplements: normalizeSupplements(),
      stepGoal: 10000,
      stepsToday: 0,
      lastStepDate: getTodayString(),
      stepLogs: [],
      sleepLogs: [],
      sleepTarget: 8.0,
      sleepHygiene: JSON.parse(JSON.stringify(DEFAULT_SLEEP_HYGIENE)),
      scannedDiary: [],
      scannedHistory: [],
      lastActiveDate: getTodayString(),
      lastActiveWeek: weekKey()
    };
  }

  let state = loadState();
  let experience;

  // New day: untick supplements & sleep habits. New week: untick workout sets.
  function rolloverIfNewDay() {
    const today = getTodayString();
    const week = weekKey();
    let changed = false;
    if (state.lastActiveDate !== today) {
      state.supplements.forEach(s => s.checked = false);
      state.sleepHygiene.forEach(h => h.checked = false);
      state.lastActiveDate = today;
      changed = true;
    }
    if (state.lastActiveWeek !== week) {
      state.completedExercises = {};
      state.lastActiveWeek = week;
      changed = true;
    }
    if (changed) saveState();
    return changed;
  }

  let nativeMirrorTimer = null;

  function writeNativeMirror() {
    nativeMirrorTimer = null;
    try {
      if (window.AndroidApp && typeof window.AndroidApp.saveStateBackup === 'function') {
        window.AndroidApp.saveStateBackup(JSON.stringify(state));
      }
    } catch (e) {
      console.error('Native mirror failed:', e);
    }
  }

  function saveState() {
    state.savedAt = Date.now();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Save failed:', e);
    }
    // Batch rapid saves (ticking boxes etc.) into one file write
    if (!nativeMirrorTimer) nativeMirrorTimer = setTimeout(writeNativeMirror, 600);
    experience?.scheduleRefresh();
  }

  // Flush straight away when the app is backgrounded or closed
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && nativeMirrorTimer) {
      clearTimeout(nativeMirrorTimer);
      writeNativeMirror();
    }
  });
  window.addEventListener('pagehide', () => {
    if (nativeMirrorTimer) {
      clearTimeout(nativeMirrorTimer);
      writeNativeMirror();
    }
  });

  // Once a day, also refresh a backup file in Downloads (survives uninstalling the app)
  function dailyAutoBackup() {
    const today = getTodayString();
    if (state.lastAutoBackup === today) return;
    if (!(window.AndroidApp && typeof window.AndroidApp.autoBackupToDownloads === 'function')) return;
    try {
      if (window.AndroidApp.autoBackupToDownloads(JSON.stringify(state))) {
        state.lastAutoBackup = today;
        saveState();
      }
    } catch (_) {}
  }

  // --- DOM Element Shortcuts ---
  const $ = id => document.getElementById(id);

  // --- Navigation & Sub-views Handling ---
  function switchTab(tabId, subviewId = null) {
    if (tabId === 'today') experience?.refresh();
    let parentTab = tabId;
    let targetSubview = subviewId;

    if (tabId === 'steps') {
      parentTab = 'activity';
      targetSubview = 'subview-steps';
    } else if (tabId === 'sleep') {
      parentTab = 'activity';
      targetSubview = 'subview-sleep';
    } else if (tabId === 'calculator' || tabId === 'goals') {
      parentTab = 'profile';
      targetSubview = 'subview-goals';
    } else if (tabId === 'progress' || tabId === 'weight') {
      parentTab = 'profile';
      targetSubview = 'subview-weight';
    } else if (tabId === 'supplements' || tabId === 'supps') {
      parentTab = 'profile';
      targetSubview = 'subview-supps';
    }

    document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav .nav-item').forEach(el => el.classList.remove('active'));

    const view = $('tab-' + parentTab);
    const navBtn = $('nav-' + parentTab);
    if (view) view.classList.add('active');
    if (navBtn) navBtn.classList.add('active');
    document.querySelectorAll('.bottom-nav .nav-item').forEach(button => {
      if (button === navBtn) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    if (targetSubview) {
      switchSubview(parentTab, targetSubview);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    triggerVibrate(20);
  }

  function switchSubview(parentTab, subviewId) {
    if (subviewId === 'subview-supps') renderSupplements();
    const parent = $('tab-' + parentTab);
    if (!parent) return;

    parent.querySelectorAll('.subview').forEach(el => el.classList.remove('active'));
    parent.querySelectorAll('.subnav-btn').forEach(el => el.classList.remove('active'));

    const targetView = $(subviewId);
    if (targetView) targetView.classList.add('active');

    const btn = parent.querySelector(`[data-subview="${subviewId}"]`);
    if (btn) btn.classList.add('active');
  }

  window.handleAndroidBack = () => {
    if (tutorialStep >= 0) { endTutorial(); return 'handled'; }
    // Check if any modal is open
    const openModal = document.querySelector('.modal-overlay.active');
    if (openModal) {
      if (openModal.id === 'modal-onboarding') {
        if (onboardStep > 0) $('btn-ob-back').click();
        return 'handled';
      }
      closeModal(openModal.id);
      return 'handled';
    }
    // Return to the daily overview before exiting the app.
    const activeTab = document.querySelector('.tab-view.active');
    if (activeTab && activeTab.id !== 'tab-today') {
      switchTab('today');
      return 'handled';
    }
    return 'unhandled';
  };

  // --- Goal Archetype Logic ---
  function selectGoal(goalId, autoUpdateCalories = true) {
    const goal = GOAL_PRESETS[goalId];
    if (!goal) return;

    const intensityChanged = state.activeGoal !== goalId;
    if (intensityChanged) {
      state.trainingStyle = styleForGoal(goalId);
      state.trainingRpe = TRAINING_STYLES[state.trainingStyle].rpe;
    }
    state.activeGoal = goalId;
    if (state.routines[goal.routineId]) {
      state.activeRoutineId = goal.routineId;
    } else {
      state.activeRoutineId = 'bodybuilding';
    }

    $('active-goal-badge').innerHTML = `<span>${goal.badge.split(' ')[0]}</span> ${goal.name}`;
    $('current-goal-tagline').textContent = goal.tagline;

    document.querySelectorAll('.goal-pill').forEach(pill => {
      pill.classList.toggle('selected', pill.dataset.goal === goalId);
    });

    if (autoUpdateCalories) {
      // A new goal means new targets, even if they were typed in by hand before
      state.profile.targetsManual = false;
      recalculateCaloriesAndMacros();
    }

    selectedWorkoutDayFilter = 'today';
    renderWorkouts();
    // Suggested sets/reps depend on the goal
    if ($('bodymap-svg')) renderFocusExercises();
    renderNutrition();
    renderSupplements();
    if (intensityChanged) changeTrainingIntensity(state.trainingStyle);
    saveState();
  }

  function renderGoalSelector() {
    const container = $('goal-pills-container');
    container.replaceChildren();

    Object.values(GOAL_PRESETS).forEach(g => {
      const pill = document.createElement('div');
      pill.className = 'goal-pill' + (state.activeGoal === g.id ? ' selected' : '');
      pill.dataset.goal = g.id;

      const name = document.createElement('div');
      name.className = 'goal-pill-name';
      name.textContent = g.badge;

      const desc = document.createElement('div');
      desc.className = 'goal-pill-desc';
      desc.textContent = g.tagline;

      pill.append(name, desc);
      pill.onclick = () => {
        selectGoal(g.id);
        triggerVibrate(30);
        showToast('Active Goal: ' + g.name);
      };
      container.append(pill);
    });
  }

  // --- Calorie & Macro Guide Engine ---
  function recalculateCaloriesAndMacros() {
    const p = state.profile;
    const kg = toKg(p.weight, p.unit);
    const h = Number(p.height);
    const age = Number(p.age);
    const sex = p.sex;
    const act = Number(p.activity);

    if (!Number.isFinite(p.weight) || p.weight <= 0 || kg < 25 || kg > 350 || h < 100 || h > 250) {
      $('calc-bmi').textContent = '—';
      $('calc-maintenance').textContent = '—';
      $('calc-target').textContent = '—';
      return;
    }

    // BMI
    const bmi = kg / Math.pow(h / 100, 2);
    $('calc-bmi').textContent = bmi.toFixed(1);
    $('calc-bmi-detail').textContent = bmi < 18.5
      ? 'Below standard adult BMI range'
      : bmi > 25
      ? 'Above standard range (muscle/frame dependent)'
      : 'Normal screening range';

    // BMR (Mifflin-St Jeor) × daily life + training sessions + goal adjustment
    const e = estimateEnergy({ kg, height: h, age, sex, activity: act, goalId: state.activeGoal });
    const maintenance = e.maintenance;
    $('calc-maintenance').textContent = fmt(maintenance) + ' kcal';
    const suggestedTarget = e.target;
    const suggestedProtein = e.protein;
    if ($('calc-breakdown')) {
      $('calc-breakdown').textContent =
        `Resting burn ${fmt(e.bmr)} → daily life ${fmt(e.daily)} + training ${fmt(e.training)}/day ` +
        `(${e.sessions} sessions × ~${fmt(e.perSession)} kcal) = ${fmt(maintenance)} maintenance ` +
        `${e.offset >= 0 ? '+' : '−'} ${Math.abs(e.offset)} for ${e.goal.name} = ${fmt(e.target)} kcal.`;
    }

    // Auto targets follow goal/weight/activity until the user types their own
    const useManual = p.targetsManual && p.calorieTarget > 0 && p.proteinTarget > 0;
    const targetKcal = useManual ? p.calorieTarget : suggestedRoundedKcal(suggestedTarget);
    const protG = useManual ? p.proteinTarget : suggestedProtein;

    if (document.activeElement !== $('profile-calorie-target')) $('profile-calorie-target').value = targetKcal;
    if (document.activeElement !== $('profile-protein-target')) $('profile-protein-target').value = protG;
    $('calc-target').textContent = fmt(targetKcal) + ' kcal';

    const m = getMacroTargets(targetKcal, protG);
    $('macro-protein').textContent = m.protein + 'g (' + Math.round((m.protein * 4 / targetKcal) * 100) + '%)';
    $('macro-carbs').textContent = m.carbs + 'g (' + Math.round(((m.carbs * 4) / targetKcal) * 100) + '%)';
    $('macro-fats').textContent = m.fat + 'g (' + Math.round(((m.fat * 9) / targetKcal) * 100) + '%)';

    state.profile.calorieTarget = targetKcal;
    state.profile.proteinTarget = protG;
    saveState();
    renderSupplements();
  }

  const suggestedRoundedKcal = kcal => Math.round(kcal / 10) * 10;

  // Single source of truth for the macro split (fat 25% of kcal, carbs fill the rest)
  function getMacroTargets(targetKcal, proteinG) {
    const fat = Math.round((targetKcal * 0.25) / 9);
    const carbs = Math.max(0, Math.round((targetKcal - proteinG * 4 - fat * 9) / 4));
    return { kcal: targetKcal, protein: proteinG, carbs, fat };
  }

  // Weight-training MET by goal (~60 min sessions); circuits / conditioning burn a bit more
  const SESSION_MET = { strongman: 6, fatloss: 6, get_fit: 6 };
  const SESSION_HOURS = 1;

  // Daily calories = resting burn × daily-life activity + the plan's training sessions averaged
  // over the week + the goal's surplus/deficit. Activity is life outside the gym, so training
  // must be added separately or lifters get far too little food.
  function estimateEnergy({ kg, height, age, sex, activity, goalId }) {
    const goal = GOAL_PRESETS[goalId] || GOAL_PRESETS.bodybuilding;
    const bmr = 10 * kg + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
    const daily = bmr * activity;
    const routine = (state.routines && state.routines[goal.routineId]) || DEFAULT_ROUTINES[goal.routineId] || DEFAULT_ROUTINES.bodybuilding;
    const sessions = routine.days.filter(d => !d.isRest).length;
    const perSession = (SESSION_MET[goalId] || 5) * kg * SESSION_HOURS;
    const training = perSession * sessions / 7;
    const maintenance = Math.round(daily + training);
    const target = suggestedRoundedKcal(Math.max(1200, maintenance + goal.calorieOffset));
    return {
      bmr: Math.round(bmr),
      daily: Math.round(daily),
      training: Math.round(training),
      perSession: Math.round(perSession),
      sessions,
      maintenance,
      offset: goal.calorieOffset,
      target,
      protein: Math.round(kg * goal.proteinPerKg),
      goal
    };
  }

  let profileInputsBound = false;

  function cmToFtIn(cm) {
    let totalIn = Math.round((cm / 2.54) * 2) / 2; // nearest half inch
    const ft = Math.floor(totalIn / 12);
    return { ft, inch: +(totalIn - ft * 12).toFixed(1) };
  }

  const formatHeight = cm => {
    const { ft, inch } = cmToFtIn(cm);
    return `${ft}′ ${inch}″ (${Math.round(cm)} cm)`;
  };

  function updateHeightHint() {
    const hint = $('profile-height-hint');
    if (hint) hint.textContent = formatHeight(Number($('profile-height').value) || state.profile.height);
  }

  // Shows either the cm box or the ft + in boxes, filled from the stored cm value
  function syncHeightInputs() {
    const unit = state.profile.heightUnit || 'ftin';
    const isFtIn = unit === 'ftin';
    $('profile-height-unit').value = unit;
    $('profile-height').style.display = isFtIn ? 'none' : '';
    $('profile-height-ft').style.display = isFtIn ? '' : 'none';
    $('profile-height-in').style.display = isFtIn ? '' : 'none';
    const { ft, inch } = cmToFtIn(state.profile.height);
    $('profile-height-ft').value = ft;
    $('profile-height-in').value = inch;
    $('profile-height').value = state.profile.height;
    updateHeightHint();
  }

  function bindProfileInputs() {
    const p = state.profile;
    $('profile-weight').value = p.weight;
    $('profile-unit').value = p.unit;
    $('profile-height').value = p.height;
    $('profile-age').value = p.age;
    $('profile-sex').value = p.sex;
    $('profile-activity').value = p.activity;
    $('profile-calorie-target').value = p.calorieTarget;
    $('profile-protein-target').value = p.proteinTarget;

    syncHeightInputs();

    // initApp runs again after import/reset; only attach listeners once
    if (profileInputsBound) return;
    profileInputsBound = true;

    // Feet & inches are converted into the cm field, which drives all the maths
    const onFtIn = () => {
      const ft = parseFloat($('profile-height-ft').value) || 0;
      const inch = parseFloat($('profile-height-in').value) || 0;
      const cm = (ft * 12 + inch) * 2.54;
      if (cm < 100 || cm > 250) return;
      $('profile-height').value = cm.toFixed(1);
      $('profile-height').dispatchEvent(new Event('input'));
      updateHeightHint();
    };
    $('profile-height-ft').addEventListener('input', onFtIn);
    $('profile-height-in').addEventListener('input', onFtIn);
    $('profile-height').addEventListener('input', updateHeightHint);
    $('profile-height-unit').addEventListener('change', e => {
      state.profile.heightUnit = e.target.value;
      saveState();
      syncHeightInputs();
    });

    const fields = ['profile-weight', 'profile-height', 'profile-age', 'profile-sex', 'profile-activity', 'profile-calorie-target', 'profile-protein-target'];
    fields.forEach(f => {
      $(f).addEventListener('input', () => {
        state.profile.weight = Number($('profile-weight').value) || state.profile.weight;
        state.profile.height = Number($('profile-height').value) || state.profile.height;
        state.profile.age = Number($('profile-age').value) || state.profile.age;
        state.profile.sex = $('profile-sex').value;
        state.profile.activity = Number($('profile-activity').value) || state.profile.activity;
        if (f === 'profile-calorie-target' || f === 'profile-protein-target') {
          state.profile.targetsManual = true;
          state.profile.calorieTarget = Number($('profile-calorie-target').value) || state.profile.calorieTarget;
          state.profile.proteinTarget = Number($('profile-protein-target').value) || state.profile.proteinTarget;
        }
        recalculateCaloriesAndMacros();
        renderNutrition();
      });
    });

    $('btn-auto-targets').addEventListener('click', () => {
      state.profile.targetsManual = false;
      recalculateCaloriesAndMacros();
      renderNutrition();
      showToast('Targets recalculated from your goal & stats');
    });

    $('profile-unit').addEventListener('change', e => {
      const oldUnit = state.profile.unit;
      const newUnit = e.target.value;
      const kg = toKg(state.profile.weight, oldUnit);
      state.profile.unit = newUnit;
      state.profile.weight = Number(fromKg(kg, newUnit).toFixed(newUnit === 'stone' ? 2 : 1));
      $('profile-weight').value = state.profile.weight;
      recalculateCaloriesAndMacros();
      renderTracker();
    });
  }

  // --- Workouts & Custom Exercise Engine ---
  let selectedWorkoutDayFilter = 'today';
  const WEEKDAY_IDS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

  function trainingPrescription() {
    return rpePrescription(state.trainingRpe, state.trainingStyle);
  }

  function renderRpeControls() {
    const p = trainingPrescription();
    $('training-style').value = state.trainingStyle;
    $('workout-rpe').value = p.rpe;
    $('workout-rpe-value').textContent = p.rpe;
    $('workout-rpe-summary').textContent = `${p.exercises} exercises · ${p.sets} working sets each · ${p.rest}s rest · ${p.rir === 0 ? 'no reps left in reserve' : 'about ' + p.rir + ' reps in reserve'}. Choose a load that matches this effort with controlled form.`;
  }

  function changeTrainingIntensity(style) {
    if (style) {
      state.trainingStyle = style;
      state.trainingRpe = TRAINING_STYLES[style].rpe;
    } else state.trainingRpe = Number($('workout-rpe').value);
    saveState();
    const p = trainingPrescription();
    clearInterval(timerInterval);
    timerInterval = null;
    timerRemaining = timerTotal = p.rest;
    updateTimerDisplay();
    document.querySelectorAll('.timer-preset-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.sec) === p.rest));
    renderWorkouts();
    renderFocusExercises();
    renderSupplements();
  }

  // Build a view of the plan; keep the user's original exercises available when effort changes.
  function rpeDayExercises(day) {
    if (day.isRest) return day.exercises;
    const target = trainingPrescription().exercises;
    const working = day.exercises.filter(ex => classifyExercise(ex.name));
    const groups = [...new Set(working.map(ex => classifyExercise(ex.name)))];
    const result = [];
    // Cover each part of a split before adding another exercise for the same muscle.
    groups.forEach(group => {
      const ex = working.find(e => classifyExercise(e.name) === group);
      if (ex && result.length < target) result.push(ex);
    });
    working.forEach(ex => { if (result.length < target && !result.includes(ex)) result.push(ex); });
    const usedNames = new Set(result.map(e => e.name.toLowerCase()));
    const usedLib = new Set(result.map(e => e.libId || findLibraryMatch(e)?.id).filter(Boolean));
    const allowed = KIT_ALLOWED[state.exerciseKit] || KIT_ALLOWED.gym;
    const candidates = EXERCISE_LIBRARY.filter(e => allowed.includes(e.kit)
      && groups.includes(classifyExercise(e.name)) && !libHealthWarning(e) && !(day.rpeExcluded || []).includes(e.id))
      .sort((a, b) => Number(b.mechanic === 'compound') - Number(a.mechanic === 'compound'));
    for (const e of candidates) {
      if (result.length >= target) break;
      if (usedNames.has(e.name.toLowerCase()) || usedLib.has(e.id)) continue;
      result.push({ id: `rpe_${day.id}_${e.id}`, libId: e.id, name: e.name, sets: suggestedSets(e), notes: e.tip, generated: true });
      usedNames.add(e.name.toLowerCase());
      usedLib.add(e.id);
    }
    return result.length ? result : day.exercises;
  }

  function getTodayRoutineIndex(routine) {
    const todayId = WEEKDAY_IDS[new Date().getDay()];
    const idx = routine.days.findIndex(d => d.id === todayId);
    return idx >= 0 ? idx : (new Date().getDay() + 6) % 7 % routine.days.length;
  }

  // Chips come from the active routine so labels always match the real days
  function renderWorkoutDayChips(routine, todayIdx) {
    const bar = $('workout-day-filter-bar');
    if (!bar) return;
    bar.replaceChildren();

    const addChip = (value, label) => {
      const chip = document.createElement('button');
      chip.className = 'day-chip' + (String(selectedWorkoutDayFilter) === String(value) ? ' active' : '');
      chip.textContent = label;
      chip.onclick = () => {
        selectedWorkoutDayFilter = value;
        renderWorkouts();
        triggerVibrate(20);
      };
      bar.append(chip);
    };

    addChip('today', '📅 Today');
    addChip('all', 'Full Week');
    routine.days.forEach((day, idx) => {
      const shortName = (day.dayName || `Day ${idx + 1}`).slice(0, 3);
      const label = day.isRest ? `${shortName}: Rest` : `${shortName}: ${day.title}`;
      addChip(idx, (idx === todayIdx ? '• ' : '') + label);
    });
  }

  function renderWorkouts() {
    renderRpeControls();
    const routine = state.routines[state.activeRoutineId] || state.routines.bodybuilding;
    const container = $('workout-days-container');
    container.replaceChildren();

    $('active-routine-name').textContent = routine.title;

    const todayIdx = getTodayRoutineIndex(routine);
    renderWorkoutDayChips(routine, todayIdx);
    const dietAdj = getDietTrainingAdjustment();
    renderWorkoutBanners(dietAdj);

    const daysToRender = selectedWorkoutDayFilter === 'all'
      ? routine.days
      : selectedWorkoutDayFilter === 'today'
      ? [routine.days[todayIdx]].filter(Boolean)
      : routine.days.filter((_, idx) => String(idx) === String(selectedWorkoutDayFilter));

    daysToRender.forEach(day => {
      const displayedExercises = rpeDayExercises(day);
      const isToday = routine.days.indexOf(day) === todayIdx;
      const card = document.createElement('div');
      card.className = 'day-card' + (day.isRest ? ' rest-day' : '');

      const header = document.createElement('div');
      header.className = 'day-header';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'day-title-wrap';

      const title = document.createElement('div');
      title.className = 'day-title';
      title.textContent = `${day.dayName} — ${day.title}`;

      const subtitle = document.createElement('div');
      subtitle.className = 'day-subtitle';
      const doneCount = displayedExercises.filter(ex => state.completedExercises[ex.id]).length;
      subtitle.textContent = day.isRest
        ? 'Recovery day'
        : `${doneCount} / ${displayedExercises.length} exercises done this week · RPE ${trainingPrescription().rpe}`;

      titleWrap.append(title, subtitle);

      const badges = document.createElement('div');
      badges.className = 'day-badges';

      if (isToday) {
        const todayBadge = document.createElement('span');
        todayBadge.className = 'day-badge purple';
        todayBadge.textContent = 'Today';
        badges.append(todayBadge);
      }

      const badge = document.createElement('span');
      badge.className = 'day-badge' + (day.isRest ? ' rest' : ' cyan');
      badge.textContent = day.isRest ? 'Rest' : 'Workout';
      badges.append(badge);

      header.append(titleWrap, badges);

      const body = document.createElement('div');
      body.className = 'day-body';

      const exList = document.createElement('div');
      exList.className = 'exercise-list';

      const views = displayedExercises.map((ex, i) => ({ ex, view: getExerciseView(ex, day, i, dietAdj) }));
      // Over-eating on a fat-loss goal adds a cardio finisher to training days
      if (!day.isRest && dietAdj.finisher && trainingPrescription().rpe < 7 && views.length < trainingPrescription().exercises) {
        const fid = 'finisher_' + day.id;
        views.push({ ex: { id: fid, name: 'Incline walk finisher', sets: `1 × ${dietAdj.finisher} min` },
          view: { id: fid, name: 'Incline walk finisher', sets: `1 × ${dietAdj.finisher} min`, notes: 'Auto-added from your food log — brisk incline walk at a pace you can talk.', badges: [{ text: '🔥 Auto', cls: '' }], lib: null, auto: true } });
      }

      views.forEach(({ ex, view }) => {
        const item = document.createElement('div');
        const isDone = !!state.completedExercises[ex.id];
        item.className = 'exercise-item' + (isDone ? ' completed' : '');

        const checkControl = document.createElement('label');
        checkControl.className = 'exercise-check-control';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.className = 'exercise-check';
        check.checked = isDone;
        check.setAttribute('aria-label', `Completed: ${view.name}`);
        check.onchange = e => {
          e.stopPropagation();
          const done = check.checked;
          state.completedExercises[ex.id] = done;
          // Keeps a training history so progress photos can show what was worked on
          logWorkoutTick({ id: ex.id, name: view.name }, done);
          saveState();
          item.classList.toggle('completed', done);
          const doneCount = displayedExercises.filter(exercise => state.completedExercises[exercise.id]).length;
          subtitle.textContent = day.isRest ? 'Recovery day'
            : `${doneCount} / ${displayedExercises.length} exercises done this week · RPE ${trainingPrescription().rpe}`;
          triggerVibrate(done ? 60 : 20);
          if (done) playBeep(920, 0.1);
        };
        checkControl.append(check);

        const info = document.createElement('div');
        info.className = 'exercise-info';

        const name = document.createElement('div');
        name.className = 'exercise-name';
        name.textContent = view.name;
        view.badges.forEach(b => {
          const tag = document.createElement('span');
          tag.className = 'day-badge ' + (b.cls || '');
          tag.style.cssText = 'font-size:10px;margin-left:6px;';
          tag.textContent = b.text;
          if (b.title) tag.title = b.title;
          name.append(tag);
        });

        const target = document.createElement('div');
        target.className = 'exercise-target';
        target.textContent = view.sets;

        const notes = document.createElement('div');
        notes.className = 'exercise-notes';
        notes.textContent = view.notes || '';

        info.append(name, target, notes);

        const actions = document.createElement('div');
        actions.className = 'exercise-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-outline btn-icon btn-sm';
        editBtn.innerHTML = '✎';
        editBtn.title = 'Edit exercise';
        editBtn.onclick = e => {
          e.stopPropagation();
          if (ex.generated && !day.exercises.some(item => item.id === ex.id)) day.exercises.push({ ...ex, generated: false });
          openEditExerciseModal(day.id, ex);
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-outline btn-icon btn-sm';
        delBtn.innerHTML = '✕';
        delBtn.title = 'Delete';
        delBtn.onclick = e => {
          e.stopPropagation();
          if (confirm(`Remove "${ex.name}" from ${day.dayName}?`)) {
            if (ex.generated) day.rpeExcluded = [...(day.rpeExcluded || []), ex.libId];
            day.exercises = day.exercises.filter(x => x.id !== ex.id);
            saveState();
            renderWorkouts();
          }
        };

        // Exercises that match the picture library get a "how to" button
        const lib = view.lib;
        if (lib) {
          const howBtn = document.createElement('button');
          howBtn.className = 'btn btn-outline btn-icon btn-sm';
          howBtn.textContent = '📷';
          howBtn.title = 'How to do it';
          howBtn.onclick = e => {
            e.stopPropagation();
            openExerciseDetail(lib.id);
          };
          actions.append(howBtn);
        }
        if (!view.auto) actions.append(editBtn, delBtn);
        item.append(checkControl, info, actions);
        editBtn.setAttribute('aria-label', `Edit ${view.name}`);
        delBtn.setAttribute('aria-label', `Delete ${view.name}`);
        experience?.decorateExercise({ day, ex, view, item });
        exList.append(item);
      });

      body.append(exList);

      const footer = document.createElement('div');
      footer.className = 'day-footer';

      const addExBtn = document.createElement('button');
      addExBtn.className = 'btn btn-outline btn-sm';
      addExBtn.innerHTML = '＋ Add Exercise';
      addExBtn.onclick = () => openExercisePicker(day.id);

      const resetDayBtn = document.createElement('button');
      resetDayBtn.className = 'btn btn-outline btn-sm';
      resetDayBtn.innerHTML = '↺ Clear Checks';
      resetDayBtn.onclick = () => {
        const ids = new Set([...day.exercises, ...views.map(entry => entry.ex)].map(ex => ex.id));
        Object.keys(state.completedExercises).forEach(id => {
          if (id.startsWith(`rpe_${day.id}_`)) ids.add(id);
        });
        ids.forEach(id => {
          if (state.completedExercises[id]) logWorkoutTick({ id }, false);
          delete state.completedExercises[id];
        });
        saveState();
        renderWorkouts();
        showToast('Checks cleared for ' + day.dayName);
      };

      footer.append(addExBtn, resetDayBtn);
      body.append(footer);

      card.append(header, body);
      container.append(card);
    });
    experience?.renderWorkoutHeader();
  }

  // --- Modal Helpers ---
  const modalReturnFocus = new Map();
  function openModal(modalId) {
    const m = $(modalId);
    if (m) {
      modalReturnFocus.set(modalId, document.activeElement);
      const dialog = m.querySelector('.modal');
      if (dialog) {
        dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true'); dialog.tabIndex = -1;
        const title = dialog.querySelector('.modal-title');
        if (title) { if (!title.id) title.id = modalId + '-title'; dialog.setAttribute('aria-labelledby', title.id); }
      }
      m.classList.add('active');
      requestAnimationFrame(() => { if (m.classList.contains('active')) (dialog?.querySelector('input:not([type="hidden"]), button, select') || dialog)?.focus(); });
    }
  }

  function closeModal(modalId) {
    // Setup wizard only closes via its own buttons
    if (modalId === 'modal-onboarding') return;
    // The scanner modal owns the camera, so closing it must release the stream
    if (modalId === 'modal-barcode') {
      stopBarcodeScanner();
      return;
    }
    if (modalId === 'modal-machine-import') {
      machineRequestToken = null;
      machineDraft = null;
      if (machinePreviewUrl) URL.revokeObjectURL(machinePreviewUrl);
      machinePreviewUrl = null;
    }
    const m = $(modalId);
    if (m) m.classList.remove('active');
    const previous = modalReturnFocus.get(modalId);
    if (previous?.isConnected) previous.focus();
    modalReturnFocus.delete(modalId);
  }

  document.addEventListener('keydown', event => {
    const modal = [...document.querySelectorAll('.modal-overlay.active')].at(-1);
    if (!modal) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(modal.id); }
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')].filter(el => !el.disabled && el.getClientRects().length);
    if (!controls.length) return;
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // --- Exercise Add/Edit Modal ---
  let targetModalDayId = null;
  let targetModalExId = null;

  function openAddExerciseModal(dayId) {
    targetModalDayId = dayId;
    targetModalExId = null;
    $('exercise-modal-title').textContent = 'Add Exercise';
    $('modal-ex-name').value = '';
    $('modal-ex-sets').value = '3 × 10–12';
    $('modal-ex-notes').value = '';
    openModal('modal-exercise');
  }

  function openEditExerciseModal(dayId, ex) {
    targetModalDayId = dayId;
    targetModalExId = ex.id;
    $('exercise-modal-title').textContent = 'Edit Exercise';
    $('modal-ex-name').value = ex.name;
    $('modal-ex-sets').value = ex.sets;
    $('modal-ex-notes').value = ex.notes || '';
    openModal('modal-exercise');
  }

  $('btn-save-exercise').onclick = () => {
    const name = $('modal-ex-name').value.trim();
    const sets = $('modal-ex-sets').value.trim();
    const notes = $('modal-ex-notes').value.trim();

    if (!name) {
      alert('Please enter an exercise name.');
      return;
    }

    const routine = state.routines[state.activeRoutineId];
    const day = routine.days.find(d => d.id === targetModalDayId);
    if (!day) return;

    if (targetModalExId) {
      const ex = day.exercises.find(e => e.id === targetModalExId);
      if (ex) {
        ex.name = name;
        ex.sets = sets;
        ex.notes = notes;
      }
    } else {
      day.exercises.push({
        id: 'cust_' + Date.now(),
        name,
        sets,
        notes
      });
    }

    saveState();
    closeModal('modal-exercise');
    renderWorkouts();
    showToast('Exercise saved!');
  };

  // --- Rest Timer Engine ---
  let timerInterval = null;
  let timerRemaining = 0;
  let timerTotal = 60;

  function startRestTimer(seconds, isResume = false) {
    clearInterval(timerInterval);
    timerRemaining = seconds;
    if (!isResume) timerTotal = seconds;
    updateTimerDisplay();

    // Count against the clock: setInterval is throttled when the screen is off
    const endAt = Date.now() + seconds * 1000;
    timerInterval = setInterval(() => {
      timerRemaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      updateTimerDisplay();

      if (timerRemaining <= 0) {
        clearInterval(timerInterval);
        timerInterval = null;
        playBeep(880, 0.25);
        setTimeout(() => playBeep(880, 0.25), 300);
        setTimeout(() => playBeep(1100, 0.4), 600);
        triggerVibrate(500);
        showToast('Rest time up! Next set ready!');
      }
    }, 250);
  }

  function updateTimerDisplay() {
    const m = Math.floor(timerRemaining / 60);
    const s = timerRemaining % 60;
    $('timer-display').textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  $('btn-timer-start').onclick = () => {
    if (timerInterval) return;
    if (timerRemaining > 0) {
      startRestTimer(timerRemaining, true);
    } else {
      startRestTimer(timerTotal || 60);
    }
  };

  $('btn-timer-pause').onclick = () => {
    clearInterval(timerInterval);
    timerInterval = null;
  };

  $('btn-timer-reset').onclick = () => {
    clearInterval(timerInterval);
    timerInterval = null;
    timerRemaining = timerTotal;
    updateTimerDisplay();
  };

  document.querySelectorAll('.timer-preset-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.timer-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const secs = Number(btn.dataset.sec) || 60;
      startRestTimer(secs);
    };
  });

  // --- Meal Planner, Simple/Pro Nutrition & Food Customizer Engine ---
  let currentLoggingSlot = 'breakfast';
  let simpleMealSeed = 0;
  let selectedNutritionDate = getTodayString();
  let nutritionFollowsToday = true;
  let nutritionEntryMode = 'eaten';
  const nutritionDate = () => nutritionFollowsToday ? getTodayString() : selectedNutritionDate;
  const planningMeals = () => nutritionDate() > getTodayString() || nutritionEntryMode === 'planned';
  const newEntryId = () => 'entry_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

  function selectNutritionDate(date) {
    if (!validDate(date)) { showToast('Choose a valid nutrition date.'); return; }
    selectedNutritionDate = date;
    nutritionFollowsToday = date === getTodayString();
    nutritionEntryMode = date > getTodayString() ? 'planned' : 'eaten';
    simpleMealSeed = 0;
    state.nutritionMode = 'pro';
    renderNutrition();
  }

  function selectedMealEntries() {
    const date = nutritionDate();
    return [...state.mealLogs.filter(entry => entry.date === date), ...state.mealPlans.filter(entry => entry.date === date).map(entry => ({ ...entry, planned: true }))];
  }

  function selectedMacroEntries() {
    return nutritionDate() > getTodayString()
      ? state.mealPlans.filter(entry => entry.date === nutritionDate())
      : state.mealLogs.filter(entry => entry.date === nutritionDate());
  }

  function addNutritionEntry(entry) {
    entry.date = nutritionDate();
    entry.planned = planningMeals();
    (entry.planned ? state.mealPlans : state.mealLogs).unshift(entry);
  }

  function renderNutritionDates() {
    const date = nutritionDate();
    const future = date > getTodayString();
    $('nutrition-date').value = date;
    $('nutrition-entry-mode').value = planningMeals() ? 'planned' : 'eaten';
    $('nutrition-entry-mode').disabled = future;
    document.querySelectorAll('[data-water], #btn-water-undo').forEach(button => { button.disabled = future; });
    $('nutrition-date-summary').textContent = `${date === getTodayString() ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · ${planningMeals() ? 'Add planned meals' : 'Log food eaten on this day'}`;
    $('nutrition-calorie-label').textContent = future ? 'Planned Calories' : date === getTodayString() ? "Today's Calories" : 'Calories Eaten';
    const plans = state.mealPlans.filter(entry => entry.date === date);
    $('nutrition-planned-summary').textContent = plans.length
      ? `${plans.length} planned meal${plans.length === 1 ? '' : 's'} · ${fmt(plans.reduce((total, entry) => total + (entry.calories || 0), 0))} kcal${future ? '. Review them below.' : ' · not included in eaten totals until marked eaten.'}` : 'Plan meals ahead, then mark each one eaten when you have it.';
    $('btn-simple-autofill').textContent = planningMeals() ? '⚡ Plan Meals for This Day' : '⚡ Auto-Fill This Day’s Log';
    $('btn-clear-daily-logs').textContent = '↺ Clear This Day';
    document.querySelectorAll('.nutrition-destination').forEach(element => { element.textContent = `${planningMeals() ? 'Planning for' : 'Logging for'} ${date} · ${SLOT_NAMES[currentLoggingSlot]?.name || 'Meal'}`; });
    document.querySelectorAll('.btn-log-single-simple').forEach(button => { button.textContent = planningMeals() ? '＋ Plan' : '＋ Log'; });
  }

  function showNutritionHistory() {
    const box = $('nutrition-history-list');
    box.replaceChildren();
    const dates = [...new Set([...state.mealLogs, ...state.mealPlans].map(entry => entry.date).filter(date => validDate(date) && date <= getTodayString()))].sort().reverse();
    if (!dates.length) box.innerHTML = '<p class="report-text">No saved nutrition entries yet. Your logged days will appear here.</p>';
    dates.forEach(date => {
      const entries = state.mealLogs.filter(entry => entry.date === date);
      const plans = state.mealPlans.filter(entry => entry.date === date);
      const button = document.createElement('button');
      button.className = 'btn btn-outline nutrition-history-day';
      button.textContent = `${date} · ${entries.length} eaten · ${fmt(entries.reduce((sum, entry) => sum + (entry.calories || 0), 0))} kcal · ${plans.length} planned`;
      button.onclick = () => { selectNutritionDate(date); closeModal('modal-nutrition-history'); switchTab('nutrition'); };
      box.append(button);
    });
    openModal('modal-nutrition-history');
  }

  function markPlannedMealEaten(id) {
    const entry = state.mealPlans.find(item => item.id === id);
    if (!entry || entry.date > getTodayString()) return;
    state.mealPlans = state.mealPlans.filter(item => item.id !== id);
    state.mealLogs.unshift({ ...entry, planned: false, timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    saveState();
    renderNutrition();
  }

  function prepareComingDays() {
    try {
      const copies = copyMealPlans(selectedMealEntries(), $('copy-meals-start').value, Number($('copy-meals-days').value), getTodayString(), newEntryId);
      const dates = new Set(copies.map(entry => entry.date));
      if (state.mealPlans.some(entry => dates.has(entry.date)) && !$('copy-meals-replace').checked) throw new Error('Some of these days already have planned meals. Choose other dates or enable Replace existing planned meals.');
      if ($('copy-meals-replace').checked) state.mealPlans = state.mealPlans.filter(entry => !dates.has(entry.date));
      state.mealPlans.push(...copies);
      saveState();
      closeModal('modal-copy-meals');
      selectNutritionDate(copies[0].date);
      showToast('Your meal prep is saved for the selected days.');
    } catch (error) { $('copy-meals-status').textContent = error.message; }
  }

  const SLOT_NAMES = {
    breakfast: { name: 'Breakfast', icon: '🌅', label: '🌅 Breakfast' },
    lunch: { name: 'Lunch', icon: '🥪', label: '🥪 Lunch' },
    dinner: { name: 'Dinner', icon: '🍽️', label: '🍽️ Dinner' },
    snack: { name: 'Snacks & Late Night', icon: '🌙', label: '🌙 Snack' }
  };

  // Generic, wholesome gym meal templates for Simple Mode goal auto-pilot.
  // ing = [name, qty, unit] at base portion size; scaled with the meal for the shopping list.
  const GYM_MEAL_PRESETS = {
    breakfast: [
      { name: 'Protein Rolled Oats & Greek Yogurt Bowl with Berries', baseKcal: 420, baseP: 34, desc: 'Rolled wholegrain oats (60g), 0% Greek yogurt (150g), whey protein scoop, fresh blueberries & honey.',
        ing: [['Rolled oats', 60, 'g'], ['Greek yogurt 0%', 150, 'g'], ['Whey protein', 15, 'g'], ['Blueberries', 60, 'g'], ['Honey', 10, 'g']] },
      { name: 'Scrambled Eggs on Wholewheat Toast with Avocado', baseKcal: 440, baseP: 28, desc: '3 large free-range eggs, 2 slices wholewheat sourdough toast, sliced avocado (40g) and spinach.',
        ing: [['Eggs', 3, 'eggs'], ['Wholewheat bread', 2, 'slices'], ['Avocado', 40, 'g'], ['Spinach', 30, 'g']] },
      { name: 'High-Protein Banana Pancakes with Honey & Yogurt', baseKcal: 460, baseP: 36, desc: 'Egg whites, banana, oats and vanilla whey blended and cooked golden, topped with Greek yogurt.',
        ing: [['Egg whites', 150, 'ml'], ['Bananas', 1, 'piece'], ['Rolled oats', 40, 'g'], ['Whey protein', 20, 'g'], ['Greek yogurt 0%', 80, 'g']] },
      { name: 'Smoked Salmon & Poached Eggs on Toasted Rye', baseKcal: 410, baseP: 32, desc: 'Scottish smoked salmon (80g), 2 poached eggs, toasted seeded rye bread and grilled tomatoes.',
        ing: [['Smoked salmon', 80, 'g'], ['Eggs', 2, 'eggs'], ['Rye bread', 2, 'slices'], ['Tomatoes', 100, 'g']] }
    ],
    lunch: [
      { name: 'Grilled Chicken Breast, Basmati Rice & Steamed Broccoli', baseKcal: 480, baseP: 42, desc: 'Lean chicken breast (160g), steamed basmati rice (65g dry), tenderstem broccoli and 1 tsp olive oil.',
        ing: [['Chicken breast', 160, 'g'], ['Basmati rice (dry)', 65, 'g'], ['Broccoli', 120, 'g'], ['Olive oil', 5, 'ml']] },
      { name: 'Tuna & Sweetcorn Jacket Potato with Light Yogurt Dressing', baseKcal: 450, baseP: 38, desc: 'Baked jacket potato (280g), drained tuna (130g), sweetcorn, crisp green salad and Greek yogurt.',
        ing: [['Potatoes', 280, 'g'], ['Tinned tuna (drained)', 130, 'g'], ['Sweetcorn', 50, 'g'], ['Salad leaves', 60, 'g'], ['Greek yogurt 0%', 40, 'g']] },
      { name: 'Mexican Spiced Turkey & Black Bean Rice Bowl', baseKcal: 510, baseP: 40, desc: 'Lean turkey mince (150g), black beans, salsa, brown rice, peppers, sweetcorn and coriander.',
        ing: [['Turkey mince', 150, 'g'], ['Black beans (drained)', 60, 'g'], ['Brown rice (dry)', 50, 'g'], ['Peppers', 80, 'g'], ['Salsa', 40, 'g']] },
      { name: 'Grilled Salmon Fillet with Quinoa & Asparagus', baseKcal: 520, baseP: 36, desc: 'Salmon fillet (140g), fluffy quinoa (50g dry), grilled asparagus spears and fresh lemon.',
        ing: [['Salmon fillet', 140, 'g'], ['Quinoa (dry)', 50, 'g'], ['Asparagus', 100, 'g'], ['Lemons', 0.5, 'piece']] }
    ],
    dinner: [
      { name: 'Lean Beef & Kidney Bean Chilli with Brown Rice', baseKcal: 530, baseP: 42, desc: 'Extra-lean 5% beef mince (150g), red kidney beans, rich tomato passata, spices and steamed brown rice.',
        ing: [['Lean beef mince 5%', 150, 'g'], ['Kidney beans (drained)', 80, 'g'], ['Passata', 150, 'g'], ['Brown rice (dry)', 55, 'g']] },
      { name: 'Seared Salmon Fillet, Sweet Potato Mash & Greens', baseKcal: 520, baseP: 38, desc: 'Fresh salmon (140g), baked sweet potato (220g), steamed green beans and a drizzle of olive oil.',
        ing: [['Salmon fillet', 140, 'g'], ['Sweet potatoes', 220, 'g'], ['Green beans', 100, 'g'], ['Olive oil', 5, 'ml']] },
      { name: 'Turkey Breast Bolognese with Wholewheat Pasta', baseKcal: 490, baseP: 42, desc: 'Lean turkey breast mince (160g), wholewheat penne (65g dry), herby tomato sauce and grated parmesan.',
        ing: [['Turkey mince', 160, 'g'], ['Wholewheat pasta (dry)', 65, 'g'], ['Passata', 150, 'g'], ['Parmesan', 10, 'g']] },
      { name: 'Sirloin Steak with Roasted Baby Potatoes & Garlic Veggies', baseKcal: 550, baseP: 44, desc: 'Lean sirloin steak (170g), rosemary roasted baby potatoes (200g) and steamed asparagus.',
        ing: [['Sirloin steak', 170, 'g'], ['Baby potatoes', 200, 'g'], ['Asparagus', 100, 'g'], ['Olive oil', 5, 'ml']] }
    ],
    snack: [
      { name: 'Post-Workout Whey Protein Shake & Banana', baseKcal: 250, baseP: 27, desc: '1 scoop whey mixed with chilled water or almond milk, plus 1 ripe banana.',
        ing: [['Whey protein', 30, 'g'], ['Bananas', 1, 'piece']] },
      { name: '0% Greek Yogurt, Honey & Mixed Almonds', baseKcal: 240, baseP: 22, desc: 'Thick Greek yogurt (180g), 1 tsp honey and raw crushed almonds (15g).',
        ing: [['Greek yogurt 0%', 180, 'g'], ['Honey', 7, 'g'], ['Almonds', 15, 'g']] },
      { name: 'Natural Peanut Butter on Rice Cakes with Sliced Banana', baseKcal: 230, baseP: 9, desc: '2 wholegrain rice cakes, 1 tbsp 100% peanut butter and banana coins.',
        ing: [['Rice cakes', 2, 'cakes'], ['Peanut butter', 15, 'g'], ['Bananas', 0.5, 'piece']] },
      { name: 'Low-Fat Cottage Cheese Bowl with Berries & Walnuts', baseKcal: 220, baseP: 24, desc: 'Creamy cottage cheese (180g), fresh raspberries and crushed walnuts (10g).',
        ing: [['Cottage cheese', 180, 'g'], ['Raspberries', 60, 'g'], ['Walnuts', 10, 'g']] }
    ]
  };

  // Spreads seeds across the 4x4x4x4 combinations so consecutive days differ
  function pickMealCombo(seed) {
    const n = Math.abs(seed);
    return {
      b: n % 4,
      l: (n + Math.floor(n / 4)) % 4,
      d: (n + 2 * Math.floor(n / 4) + 1) % 4,
      s: (Math.floor(n / 2) + Math.floor(n / 8)) % 4
    };
  }

  // Day number within the 30-day rotation, so Simple Mode shows the same meals as today's rotation row
  function getRotationDayIndex(date = new Date()) {
    const days = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
    return ((days % 30) + 30) % 30;
  }

  function getSimpleSuggestedMeals(goalId, targetKcal, targetP, seed = 0) {
    const combo = pickMealCombo(seed);
    const picks = [
      ['breakfast', GYM_MEAL_PRESETS.breakfast[combo.b]],
      ['lunch', GYM_MEAL_PRESETS.lunch[combo.l]],
      ['dinner', GYM_MEAL_PRESETS.dinner[combo.d]],
      ['snack', GYM_MEAL_PRESETS.snack[combo.s]]
    ];

    const baseSumKcal = picks.reduce((s, [, m]) => s + m.baseKcal, 0);
    const baseSumP = picks.reduce((s, [, m]) => s + m.baseP, 0);
    const scale = targetKcal / baseSumKcal;

    // Calories scale to the daily target; protein is shared out to hit the protein target;
    // fat is 25% of each meal's kcal and carbs fill the remainder (same split as the Goals tab)
    return picks.map(([slot, m]) => {
      const k = Math.round(m.baseKcal * scale);
      const p = Math.round(targetP * (m.baseP / baseSumP));
      const fat = Math.round((k * 0.25) / 9);
      const carb = Math.max(0, Math.round((k - p * 4 - fat * 9) / 4));
      return {
        slot,
        name: m.name,
        desc: m.desc,
        calories: k,
        protein: p,
        carbs: carb,
        fat,
        ingredients: m.ing.map(([name, qty, unit]) => [name, qty * scale, unit])
      };
    });
  }

  // Seed for "today" in Simple Mode: today's rotation day, shifted by the Swap button
  const getTodayMealSeed = () => getRotationDayIndex(new Date(nutritionDate() + 'T12:00:00')) + simpleMealSeed;

  function getTodayMealLogs() {
    const today = getTodayString();
    return (state.mealLogs || []).filter(item => item.date === today);
  }

  // --- Portion units (foods are per 100 g, drinks per 100 ml; label values assume ~1 g per ml) ---
  const PORTION_UNITS = {
    g: { label: 'g', base: 1 },
    oz: { label: 'oz', base: 28.35 },
    ml: { label: 'ml', base: 1 },
    floz: { label: 'fl oz (UK)', base: 28.41 },
    usfloz: { label: 'fl oz (US)', base: 29.57 },
    pint: { label: 'pint (568 ml)', base: 568.26 },
    halfpint: { label: 'half pint (284 ml)', base: 284.13 },
    l: { label: 'litre', base: 1000 },
    cup: { label: 'cup (250 ml)', base: 250 },
    can: { label: 'can (330 ml)', base: 330 },
    bottle: { label: 'bottle (500 ml)', base: 500 },
    glass: { label: 'glass (250 ml)', base: 250 },
    tbsp: { label: 'tbsp (15)', base: 15 },
    tsp: { label: 'tsp (5)', base: 5 },
    serving: { label: 'serving', base: 0 },
    item: { label: 'item / piece', base: 100 }
  };
  const FOOD_UNIT_ORDER = ['g', 'serving', 'oz', 'tbsp', 'tsp', 'ml', 'cup'];
  const DRINK_UNIT_ORDER = ['ml', 'serving', 'can', 'bottle', 'glass', 'pint', 'halfpint', 'floz', 'usfloz', 'l', 'cup', 'tbsp', 'tsp'];

  // Size of one serving in g/ml, read from text like "1 serving (500 g)", "330ml", "30g scoop"
  function servingBaseOf(food) {
    if (food.servingBase > 0) return food.servingBase;
    const all = [...(food.serving || '').matchAll(/(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/gi)];
    if (!all.length) return 0;
    const m = all[all.length - 1];
    const n = parseFloat(m[1].replace(',', '.'));
    return n * { kg: 1000, g: 1, ml: 1, cl: 10, l: 1000 }[m[2].toLowerCase()];
  }

  function portionToBase(amount, unit, food) {
    if (unit === 'serving') return amount * (servingBaseOf(food) || 100);
    return amount * (PORTION_UNITS[unit] ? PORTION_UNITS[unit].base : 1);
  }

  function portionLabel(amount, unit, base, food) {
    const baseUnit = food.isDrink ? 'ml' : 'g';
    const amt = +(+amount).toFixed(2);
    if (food.servingUnknown) return `${amt} × ${food.serving}`;
    if (unit === 'g' || unit === 'ml') return `${amt} ${unit}`;
    const name = PORTION_UNITS[unit].label.replace(/\s*\(.*\)/, '');
    const plural = amt !== 1 && !/oz$/.test(name) ? 's' : '';
    return `${amt} ${name}${plural} (${Math.round(base)} ${baseUnit})`;
  }

  // Detects drinks from Open Food Facts data
  function looksLikeDrink(p) {
    const cats = (p.categories_tags || []).join(' ');
    return /en:(beverages|drinks|waters|sodas|juices|milks|energy-drinks|soft-drinks|plant-based-milks)/.test(cats)
      || /\d\s*(ml|cl|l)\b/i.test(p.quantity || '')
      || /\d\s*(ml|cl)\b/i.test(p.serving_size || '');
  }

  // Amount + unit picker; onChange(baseAmount, label) fires on every change
  function buildPortionPicker(food, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'input-row';
    const amount = document.createElement('input');
    amount.type = 'number';
    amount.inputMode = 'decimal';
    amount.step = 'any';
    amount.min = '0';
    amount.setAttribute('aria-label', 'Amount');
    const unit = document.createElement('select');
    unit.setAttribute('aria-label', 'Unit');
    const servingBase = servingBaseOf(food);
    const units = food.servingUnknown ? ['serving'] : (food.isDrink ? DRINK_UNIT_ORDER : FOOD_UNIT_ORDER);
    units.forEach(k => {
      if (k === 'serving' && !servingBase) return;
      const label = k === 'serving'
        ? (food.servingUnknown ? `serving (${food.serving})` : `serving (${Math.round(servingBase)} ${food.isDrink ? 'ml' : 'g'})`)
        : PORTION_UNITS[k].label;
      unit.add(new Option(label, k));
    });
    if (servingBase) {
      unit.value = 'serving';
      amount.value = 1;
    } else {
      unit.value = food.isDrink ? 'ml' : 'g';
      amount.value = 100;
    }
    const fire = () => {
      const a = parseFloat(amount.value) || 0;
      const base = portionToBase(a, unit.value, food);
      onChange(base, portionLabel(a, unit.value, base, food));
    };
    unit.onchange = () => {
      // Sensible default amount for the new unit
      amount.value = ['g', 'ml'].includes(unit.value) ? 100 : 1;
      fire();
    };
    amount.oninput = fire;
    wrap.append(amount, unit);
    wrap.fire = fire;
    return wrap;
  }

  function logFoodToSlot(food, weightGrams, slot = 'breakfast', portion = '') {
    const grams = parseFloat(weightGrams) || 100;
    const mult = grams / 100;
    const today = getTodayString();

    const entry = {
      id: 'meal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      date: today,
      slot: slot || 'breakfast',
      name: food.name,
      brand: food.brand || '',
      grams,
      portion: portion || '',
      isDrink: !!food.isDrink,
      calories: Math.round((food.calories || 0) * mult),
      protein: parseFloat(((food.protein || 0) * mult).toFixed(1)),
      carbs: parseFloat(((food.carbs || 0) * mult).toFixed(1)),
      fat: parseFloat(((food.fat || 0) * mult).toFixed(1)),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    Object.assign(entry, scaleNutrition(food, grams));
    entry.calories = Math.round(entry.calories || 0);
    ['protein', 'carbs', 'fat'].forEach(key => { entry[key] = +(entry[key] || 0).toFixed(1); });
    if (food.isRecipe) {
      entry.recipeCode = food.code;
      entry.ingredients = JSON.parse(JSON.stringify(food.ingredients));
      entry.recipeWeight = food.totalWeight;
    }

    addNutritionEntry(entry);

    // Save to food library if not already there
    if (!state.foodLibrary) state.foodLibrary = [];
    const exists = state.foodLibrary.some(f => (f.code && f.code === food.code) || (f.name.toLowerCase() === food.name.toLowerCase() && f.brand === food.brand));
    if (!exists) {
      state.foodLibrary.unshift({
        ...food,
        code: food.code || ('custom_' + Date.now()),
        name: food.name,
        brand: food.brand || 'Custom / Scanned',
        serving: food.serving || '100g',
        servingBase: food.servingBase || 0,
        isDrink: !!food.isDrink,
        calories: food.calories || 0,
        protein: food.protein || 0,
        carbs: food.carbs || 0,
        sugars: food.sugars ?? null,
        fat: food.fat || 0,
        satFat: food.satFat ?? null,
        fiber: food.fiber ?? null,
        salt: food.salt ?? null,
        nutriScore: food.nutriScore || 'A',
        image: food.image || '🥗'
      });
    }

    saveState();
    renderNutrition();
    triggerVibrate(60);
    showToast(`${planningMeals() ? 'Planned' : 'Logged'} for ${nutritionDate()} · ${SLOT_NAMES[slot]?.name || slot} (+${entry.calories} kcal)`);
  }

  function removeMealLog(id) {
    if (!state.mealLogs) return;
    state.mealLogs = state.mealLogs.filter(x => x.id !== id);
    state.mealPlans = state.mealPlans.filter(x => x.id !== id);
    saveState();
    renderNutrition();
    triggerVibrate(30);
    showToast('Food removed from log.');
  }

  function clearTodayMealLogs() {
    if (!confirm(`Clear all eaten and planned foods for ${nutritionDate()}?`)) return;
    const date = nutritionDate();
    state.mealLogs = state.mealLogs.filter(x => x.date !== date);
    state.mealPlans = state.mealPlans.filter(x => x.date !== date);
    saveState();
    renderNutrition();
    triggerVibrate(60);
    showToast('The selected day’s meals were cleared.');
  }

  const PLAN_BRAND = 'Goal Auto-Pilot Plan';

  // Plan meals are logged as whole portions and kept out of the food library
  function createPlanMealEntry(m) {
    return {
      id: 'meal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      date: getTodayString(),
      slot: m.slot,
      name: m.name,
      brand: PLAN_BRAND,
      grams: 0,
      portion: '1 portion',
      calories: m.calories,
      protein: m.protein,
      carbs: m.carbs,
      fat: m.fat,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  }

  function logPlanMeal(m) {
    addNutritionEntry(createPlanMealEntry(m));
    saveState();
    renderNutrition();
    triggerVibrate(60);
    showToast(`${planningMeals() ? 'Planned' : 'Logged'} for ${nutritionDate()} · ${SLOT_NAMES[m.slot]?.name || m.slot}`);
  }

  function logAllSimpleMeals() {
    const targetKcal = state.profile.calorieTarget || 2200;
    const targetP = state.profile.proteinTarget || 140;
    const meals = getSimpleSuggestedMeals(state.activeGoal, targetKcal, targetP, getTodayMealSeed());
    const date = nutritionDate();
    const collection = planningMeals() ? 'mealPlans' : 'mealLogs';
    const hadPlan = state[collection].some(x => x.date === date && x.brand === PLAN_BRAND);
    if (hadPlan && !confirm(`Replace the auto-filled meals for ${date}?`)) return;
    state[collection] = state[collection].filter(x => !(x.date === date && x.brand === PLAN_BRAND));
    meals.forEach(m => addNutritionEntry(createPlanMealEntry(m)));
    saveState();
    renderNutrition();
    triggerVibrate(100);
    showToast(`Meals ${planningMeals() ? 'planned' : 'logged'} for ${date}.`);
  }

  window.openFoodLoggerForSlot = function(slot) {
    currentLoggingSlot = slot;
    startBarcodeScanner();
  };

  // --- Render Nutrition Engine (Unified) ---
  function renderNutrition() {
    renderDailyMacroMeters();
    renderSimpleNutrition();
    renderProNutrition();
    renderNutritionDates();

    const badge = $('saved-food-count-badge');
    if (badge) badge.textContent = (state.foodLibrary || []).length;

    // Subview visibility based on active mode
    const isSimple = (state.nutritionMode || 'simple') === 'simple';
    const simpleView = $('nutri-view-simple');
    const proView = $('nutri-view-pro');
    const simpleBtn = $('subtab-nutri-simple');
    const proBtn = $('subtab-nutri-pro');

    if (simpleView) simpleView.style.display = isSimple ? 'block' : 'none';
    if (proView) proView.style.display = isSimple ? 'none' : 'block';
    if (simpleBtn) simpleBtn.classList.toggle('active', isSimple);
    if (proBtn) proBtn.classList.toggle('active', !isSimple);
  }

  function renderDailyMacroMeters() {
    const todayLogs = selectedMacroEntries();
    const targetKcal = state.profile.calorieTarget || 2200;
    const targetP = state.profile.proteinTarget || 140;
    const { carbs: targetC, fat: targetF } = getMacroTargets(targetKcal, targetP);

    const loggedKcal = todayLogs.reduce((sum, item) => sum + (item.calories || 0), 0);
    const loggedP = parseFloat(todayLogs.reduce((sum, item) => sum + (item.protein || 0), 0).toFixed(1));
    const loggedC = parseFloat(todayLogs.reduce((sum, item) => sum + (item.carbs || 0), 0).toFixed(1));
    const loggedF = parseFloat(todayLogs.reduce((sum, item) => sum + (item.fat || 0), 0).toFixed(1));

    if ($('macro-calories-logged')) $('macro-calories-logged').textContent = fmt(loggedKcal);
    if ($('macro-calories-target')) $('macro-calories-target').textContent = `/ ${fmt(targetKcal)} kcal`;

    const remaining = targetKcal - loggedKcal;
    const remainEl = $('macro-calories-remain');
    if (remainEl) {
      if (remaining >= 0) {
        remainEl.textContent = `${fmt(remaining)} kcal left`;
        remainEl.style.borderColor = 'var(--cyan)';
        remainEl.style.color = 'var(--cyan)';
      } else {
        remainEl.textContent = `+${fmt(Math.abs(remaining))} kcal over`;
        remainEl.style.borderColor = 'var(--orange)';
        remainEl.style.color = 'var(--orange)';
      }
    }

    const pctKcal = Math.min(100, Math.round((loggedKcal / targetKcal) * 100));
    if ($('macro-calories-bar')) $('macro-calories-bar').style.width = pctKcal + '%';

    // Macro bars
    const pctP = Math.min(100, Math.round((loggedP / targetP) * 100));
    const pctC = Math.min(100, Math.round((loggedC / targetC) * 100));
    const pctF = Math.min(100, Math.round((loggedF / targetF) * 100));

    if ($('macro-fill-p')) $('macro-fill-p').style.width = pctP + '%';
    if ($('macro-bar-text-p')) $('macro-bar-text-p').textContent = `${Math.round(loggedP)} / ${targetP}g`;

    if ($('macro-fill-c')) $('macro-fill-c').style.width = pctC + '%';
    if ($('macro-bar-text-c')) $('macro-bar-text-c').textContent = `${Math.round(loggedC)} / ${targetC}g`;

    if ($('macro-fill-f')) $('macro-fill-f').style.width = pctF + '%';

    // Water + logged drinks; ~35 ml per kg is a common daily guide
    const today = nutritionDate();
    const fluidMl = (state.waterLogs || []).filter(w => w.date === today).reduce((t, w) => t + w.ml, 0)
      + todayLogs.filter(x => x.isDrink).reduce((t, x) => t + (x.grams || 0), 0);
    const fluidTarget = Math.round(toKg(state.profile.weight, state.profile.unit) * 35 / 250) * 250;
    if ($('water-total')) $('water-total').textContent = fluidMl >= 1000 ? `${(fluidMl / 1000).toFixed(2)} L` : `${fluidMl} ml`;
    if ($('water-target')) $('water-target').textContent = fluidTarget > 0 ? `/ ~${(fluidTarget / 1000).toFixed(1)} L` : '';
    if ($('macro-bar-text-f')) $('macro-bar-text-f').textContent = `${Math.round(loggedF)} / ${targetF}g`;
  }

  function renderSimpleNutrition() {
    const targetKcal = state.profile.calorieTarget || 2200;
    const targetP = state.profile.proteinTarget || 140;
    const goalPreset = GOAL_PRESETS[state.activeGoal] || GOAL_PRESETS.bodybuilding;

    if ($('simple-mode-goal-badge')) $('simple-mode-goal-badge').textContent = goalPreset.badge;
    if ($('simple-target-summary')) $('simple-target-summary').textContent = `${fmt(targetKcal)} kcal · ${targetP}g Protein`;

    const mealsContainer = $('simple-suggested-meals-container');
    if (!mealsContainer) return;
    mealsContainer.replaceChildren();

    const suggested = getSimpleSuggestedMeals(state.activeGoal, targetKcal, targetP, getTodayMealSeed());

    suggested.forEach(m => {
      const card = document.createElement('div');
      card.className = 'simple-meal-card';

      const slotInfo = SLOT_NAMES[m.slot] || { name: m.slot, icon: '🍽️' };

      card.innerHTML = `
        <div class="simple-meal-header">
          <div class="simple-meal-title">${slotInfo.icon} ${slotInfo.name}</div>
          <button class="btn btn-cyan btn-sm btn-log-single-simple">➕ Log</button>
        </div>
        <div style="font-weight:700; color:#fff; font-size:12.5px; margin-bottom:2px;">${m.name}</div>
        <div class="simple-meal-desc">${m.desc}</div>
        <div class="simple-meal-macros">${m.calories} kcal · ${m.protein}g Protein · ${m.carbs}g Carbs · ${m.fat}g Fats</div>
      `;

      card.querySelector('.btn-log-single-simple').onclick = () => logPlanMeal(m);

      mealsContainer.append(card);
    });

    render30DayRotationAndShopping(suggested, targetKcal, targetP);
  }

  function renderProNutrition() {
    const todayLogs = selectedMealEntries();
    const slots = ['breakfast', 'lunch', 'dinner', 'snack'];

    slots.forEach(slot => {
      const container = $('slot-items-' + slot);
      const metaEl = $('slot-meta-' + slot);
      if (!container) return;

      container.replaceChildren();
      const slotLogs = todayLogs.filter(item => item.slot === slot);

      const slotKcal = slotLogs.reduce((s, x) => s + (x.calories || 0), 0);
      const slotP = parseFloat(slotLogs.reduce((s, x) => s + (x.protein || 0), 0).toFixed(1));
      const slotC = parseFloat(slotLogs.reduce((s, x) => s + (x.carbs || 0), 0).toFixed(1));
      const slotF = parseFloat(slotLogs.reduce((s, x) => s + (x.fat || 0), 0).toFixed(1));

      if (metaEl) {
        metaEl.textContent = `${slotKcal} kcal · ${slotP}g P · ${slotC}g C · ${slotF}g F`;
      }

      if (slotLogs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'meal-slot-empty';
        empty.innerHTML = `No foods logged for ${SLOT_NAMES[slot]?.name || slot} yet. Tap <b>＋ Add Food</b> to scan or search.`;
        container.append(empty);
      } else {
        slotLogs.forEach(item => {
          const row = document.createElement('div');
          row.className = 'logged-food-row';

          row.innerHTML = `
            <div class="logged-food-main">
              <div class="logged-food-name">${esc(item.name)}${item.planned ? ' · Planned' : ''}</div>
              <div class="logged-food-sub">${item.brand ? esc(item.brand) + ' · ' : ''}${item.portion ? esc(item.portion) : item.grams + 'g'} · ${esc(item.timestamp || '')}</div>
            </div>
            <div class="logged-food-macros">
              <span>${item.calories} kcal · ${item.protein}g P</span>
              <button class="btn-remove-food" title="Delete">🗑️</button>
            </div>
          `;

          row.querySelector('.btn-remove-food').onclick = () => removeMealLog(item.id);
          if (item.planned && item.date <= getTodayString()) {
            const eaten = document.createElement('button');
            eaten.className = 'btn btn-cyan btn-sm';
            eaten.textContent = 'Mark Eaten';
            eaten.onclick = () => markPlannedMealEaten(item.id);
            row.querySelector('.logged-food-macros').append(eaten);
          }
          container.append(row);
        });
      }
    });
  }

  // --- 30-Day Rotation & Shopping List Generator ---
  function render30DayRotationAndShopping(suggestedMeals, targetKcal, targetP) {
    const planContainer = $('meal-plan-container');
    if (!planContainer) return;
    planContainer.replaceChildren();

    const shoppingMap = new Map();
    const addShop = (name, qty, unit) => {
      const k = `${name}||${unit}`;
      shoppingMap.set(k, (shoppingMap.get(k) || 0) + qty);
    };

    let sumKcal = 0, sumP = 0;
    const startIdx = getRotationDayIndex(new Date(nutritionDate() + 'T12:00:00'));

    // Day 1 is today; each following row is the next calendar day of the rotation
    for (let offset = 0; offset < 30; offset++) {
      const date = new Date(nutritionDate() + 'T12:00:00');
      date.setDate(date.getDate() + offset);
      const seed = offset === 0 ? getTodayMealSeed() : startIdx + offset;
      const dayMeals = getSimpleSuggestedMeals(state.activeGoal, targetKcal, targetP, seed);
      const totalDayKcal = dayMeals.reduce((s, x) => s + x.calories, 0);
      const totalDayP = dayMeals.reduce((s, x) => s + x.protein, 0);

      sumKcal += totalDayKcal;
      sumP += totalDayP;

      dayMeals.forEach(dm => dm.ingredients.forEach(([name, qty, unit]) => addShop(name, qty, unit)));

      const card = document.createElement('div');
      card.className = 'food-card';
      if (offset === 0) card.style.borderColor = 'var(--cyan)';

      const dateLabel = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      const title = document.createElement('div');
      title.className = 'food-row';
      title.style.fontWeight = '700';
      title.style.color = offset === 0 ? '#00c8ff' : '#c586f0';
      title.innerHTML = `<span>Day ${offset + 1} · ${dateLabel}${offset === 0 ? ' (Today)' : ''}</span><span class="food-meta">${fmt(totalDayKcal)} kcal · ${totalDayP}g P</span>`;
      card.append(title);

      dayMeals.forEach(dm => {
        const r = document.createElement('div');
        r.className = 'food-row';
        r.innerHTML = `<span><b>${SLOT_NAMES[dm.slot]?.icon || ''} ${SLOT_NAMES[dm.slot]?.name || dm.slot}</b>: ${esc(dm.name)}</span><span class="food-meta">${dm.calories} kcal · ${dm.protein}g P</span>`;
        card.append(r);
      });

      planContainer.append(card);
    }

    if ($('plan-avg-calories')) $('plan-avg-calories').textContent = fmt(sumKcal / 30) + ' kcal/day';
    if ($('plan-avg-protein')) $('plan-avg-protein').textContent = Math.round(sumP / 30) + ' g/day';

    renderShoppingList(shoppingMap);
  }

  function formatShopQty(qty, unit) {
    if (unit === 'g' && qty >= 1000) return `${(qty / 1000).toFixed(1)} kg`;
    if (unit === 'ml' && qty >= 1000) return `${(qty / 1000).toFixed(1)} L`;
    if (unit === 'g' || unit === 'ml') return `${Math.round(qty / 10) * 10} ${unit}`;
    return `${Math.ceil(qty)} ${unit}`;
  }

  function renderShoppingList(shoppingMap) {
    const listContainer = $('shopping-list-container');
    if (!listContainer) return;
    listContainer.replaceChildren();

    const sorted = [...shoppingMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    sorted.forEach(([key, qty]) => {
      const [name, unit] = key.split('||');
      const isChecked = !!state.shoppingChecked[key];

      const item = document.createElement('div');
      item.className = 'shop-item' + (isChecked ? ' checked' : '');

      const check = document.createElement('div');
      check.className = 'checkbox-custom';
      check.innerHTML = isChecked ? '✓' : '';
      check.onclick = () => {
        state.shoppingChecked[key] = !state.shoppingChecked[key];
        saveState();
        triggerVibrate(30);
        renderNutrition();
      };

      const span = document.createElement('span');
      span.textContent = `${name}: ~${formatShopQty(qty, unit)}`;

      item.append(check, span);
      listContainer.append(item);
    });

    // Custom shopping items
    (state.customShoppingItems || []).forEach((cust, idx) => {
      const key = 'custom_' + idx;
      const isChecked = !!state.shoppingChecked[key];

      const item = document.createElement('div');
      item.className = 'shop-item' + (isChecked ? ' checked' : '');

      const check = document.createElement('div');
      check.className = 'checkbox-custom';
      check.innerHTML = isChecked ? '✓' : '';
      check.onclick = () => {
        state.shoppingChecked[key] = !state.shoppingChecked[key];
        saveState();
        renderNutrition();
      };

      const span = document.createElement('span');
      span.textContent = cust;

      const del = document.createElement('button');
      del.className = 'btn btn-outline btn-sm';
      del.style.marginLeft = 'auto';
      del.textContent = '✕';
      del.onclick = () => {
        state.customShoppingItems.splice(idx, 1);
        saveState();
        renderNutrition();
      };

      item.append(check, span, del);
      listContainer.append(item);
    });
  }

  // Bind shopping list buttons
  if ($('btn-add-shop-item')) {
    $('btn-add-shop-item').onclick = () => {
      const val = prompt('Enter grocery item (e.g. 2L Whole Milk, Olive Oil):');
      if (val && val.trim()) {
        if (!state.customShoppingItems) state.customShoppingItems = [];
        state.customShoppingItems.push(val.trim());
        saveState();
        renderNutrition();
        showToast('Item added to shopping list!');
      }
    };
  }

  if ($('btn-clear-shop-checked')) {
    $('btn-clear-shop-checked').onclick = () => {
      state.shoppingChecked = {};
      saveState();
      renderNutrition();
      showToast('Checked items reset.');
    };
  }

  if ($('btn-copy-shopping')) {
    $('btn-copy-shopping').onclick = () => {
      const list = document.querySelectorAll('.shop-item span');
      const text = Array.from(list).map(el => '• ' + el.textContent).join('\n');
      copyText(text, 'Shopping list copied to clipboard!');
    };
  }

  // --- Weight Tracker & SVG Chart Engine ---
  function renderTracker() {
    const logs = state.weightLogs.sort((a, b) => a.date.localeCompare(b.date));
    const u = state.profile.unit;
    const list = $('tracker-history-list');
    list.replaceChildren();

    if (!logs.length) {
      $('tracker-change-stat').textContent = '—';
      $('tracker-latest-stat').textContent = '—';
      $('tracker-chart-svg').innerHTML = '';
      return;
    }

    const latest = logs[logs.length - 1];
    const first = logs[0];
    $('tracker-latest-stat').textContent = `${fromKg(latest.kg, u).toFixed(u === 'stone' ? 2 : 1)} ${u}`;
    if (logs.length > 1) {
      const diff = latest.kg - first.kg;
      const diffFormatted = fromKg(Math.abs(diff), u).toFixed(2);
      $('tracker-change-stat').textContent = `${diff >= 0 ? '+' : '-'}${diffFormatted} ${u}`;
      $('tracker-change-stat').className = 'stat-val ' + (diff > 0 ? 'purple' : 'green');
    } else {
      $('tracker-change-stat').textContent = 'Baseline';
      $('tracker-change-stat').className = 'stat-val purple';
    }

    logs.slice().reverse().forEach(log => {
      const li = document.createElement('li');
      li.className = 'log-item';

      const info = document.createElement('span');
      info.textContent = `${log.date} — ${fromKg(log.kg, u).toFixed(u === 'stone' ? 2 : 1)} ${u}`;

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-outline btn-sm';
      delBtn.textContent = 'Remove';
      delBtn.onclick = () => {
        state.weightLogs = state.weightLogs.filter(x => x.id !== log.id);
        saveState();
        renderTracker();
      };

      li.append(info, delBtn);
      list.append(li);
    });

    drawWeightChart(logs, u);
  }

  function drawWeightChart(logs, unit) {
    const svg = $('tracker-chart-svg');
    svg.innerHTML = '';
    if (logs.length < 2) return;

    const width = svg.clientWidth || 340;
    const height = 180;
    const pad = 24;

    const values = logs.map(l => fromKg(l.kg, unit));
    const minVal = Math.min(...values) * 0.98;
    const maxVal = Math.max(...values) * 1.02;

    const getX = idx => pad + (idx / (logs.length - 1)) * (width - pad * 2);
    const getY = val => height - pad - ((val - minVal) / (maxVal - minVal || 1)) * (height - pad * 2);

    let pathD = '';
    values.forEach((v, i) => {
      const x = getX(i);
      const y = getY(v);
      pathD += (i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`);
    });

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('class', 'chart-line');
    svg.appendChild(path);

    values.forEach((v, i) => {
      const x = getX(i);
      const y = getY(v);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', '4');
      circle.setAttribute('class', 'chart-dot');

      const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      title.textContent = `${logs[i].date}: ${v.toFixed(1)} ${unit}`;
      circle.appendChild(title);

      svg.appendChild(circle);
    });
  }

  $('btn-save-weight-log').onclick = () => {
    const val = Number($('log-weight-input').value);
    const u = $('log-weight-unit').value;
    const date = $('log-weight-date').value || getTodayString();

    if (!val || val <= 0) {
      alert('Please enter a valid weight.');
      return;
    }

    const kg = toKg(val, u);
    const existing = state.weightLogs.findIndex(x => x.date === date);
    const entry = { id: date + '-' + Date.now(), date, kg };

    if (existing >= 0) {
      state.weightLogs[existing] = entry;
    } else {
      state.weightLogs.push(entry);
    }

    // Also update current profile weight
    state.profile.weight = Number(fromKg(kg, state.profile.unit).toFixed(state.profile.unit === 'stone' ? 2 : 1));
    $('profile-weight').value = state.profile.weight;

    saveState();
    recalculateCaloriesAndMacros();
    renderTracker();
    showToast('Weight log saved!');
  };

  // --- Supplements Tracker ---
  function renderSupplements() {
    const container = $('supplements-container');
    container.replaceChildren();
    const choices = $('supplement-choices');
    choices.replaceChildren();
    state.supplements.forEach(s => {
      const label = document.createElement('label');
      label.className = 'ob-check supplement-choice';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = s.selected;
      input.dataset.supplement = s.id;
      input.setAttribute('aria-label', `I take ${s.name}`);
      input.onchange = () => {
        s.selected = input.checked;
        if (!s.selected) s.checked = false;
        saveState();
        renderSupplements();
      };
      const name = document.createElement('span');
      name.textContent = s.name;
      label.append(input, name);
      choices.append(label);
    });
    const selected = state.supplements.filter(s => s.selected);
    $('supplement-progress').textContent = `${selected.filter(s => s.checked).length} / ${selected.length} taken today`;
    if (!selected.length) {
      const empty = document.createElement('p');
      empty.className = 'report-text';
      empty.textContent = 'Select the supplements you take above to create your daily checklist.';
      container.append(empty);
    }
    selected.forEach(s => {
      const item = document.createElement('div');
      item.className = 'supp-item' + (s.checked ? ' taken' : '');
      item.dataset.supplement = s.id;
      const label = document.createElement('label');
      label.className = 'supp-taken-control';
      const check = document.createElement('input');
      check.type = 'checkbox';
      check.checked = s.checked;
      check.setAttribute('aria-label', `Taken today: ${s.name}`);
      check.onchange = () => {
        s.checked = check.checked;
        saveState();
        triggerVibrate(20);
        renderSupplements();
      };
      label.append(check, document.createTextNode('Taken today'));
      const info = document.createElement('div');
      info.className = 'supp-info';
      const h4 = document.createElement('h4');
      h4.textContent = s.name;
      const p = document.createElement('p');
      p.textContent = s.desc;
      info.append(h4, p);
      item.append(info, label);
      container.append(item);
    });
    renderSupplementSuggestions();
  }

  function renderSupplementSuggestions() {
    const goal = GOAL_PRESETS[state.activeGoal] || GOAL_PRESETS.bodybuilding;
    const style = TRAINING_STYLES[state.trainingStyle] || TRAINING_STYLES.bodybuilding;
    $('supplement-plan-context').textContent = `${goal.name} · ${style.name} · RPE ${trainingPrescription().rpe}`;
    const list = $('supplement-suggestions');
    list.replaceChildren();
    supplementSuggestions({ goal: state.activeGoal, style: state.trainingStyle, rpe: state.trainingRpe, profile: state.profile }).forEach(advice => {
      const supplement = state.supplements.find(s => s.id === advice.id);
      if (!supplement) return;
      const row = document.createElement('div');
      row.className = 'supp-suggestion';
      row.dataset.supplement = supplement.id;
      const title = document.createElement('h4');
      title.textContent = supplement.name;
      const status = document.createElement('span');
      status.className = 'supp-advice-level';
      status.textContent = advice.level;
      const reason = document.createElement('p');
      reason.className = 'report-text';
      reason.textContent = advice.reason;
      const choose = document.createElement('button');
      choose.className = 'btn btn-outline btn-sm';
      choose.textContent = supplement.selected ? 'In My Supplements' : 'I Take This';
      choose.disabled = supplement.selected;
      choose.setAttribute('aria-label', `I take ${supplement.name}`);
      choose.onclick = () => { supplement.selected = true; saveState(); renderSupplements(); };
      title.append(status);
      row.append(title, reason, choose);
      list.append(row);
    });
  }

  $('btn-reset-supplements').onclick = () => {
    state.supplements.forEach(s => s.checked = false);
    saveState();
    renderSupplements();
    showToast('Daily supplements reset!');
  };

  // --- Backup / Export / Import ---
  $('btn-export-data').onclick = () => {
    const fileName = `ghosty_gains_backup_${getTodayString()}.json`;
    const json = JSON.stringify(state, null, 2);

    // WebView ignores <a download>, so the Android shell writes the file into Downloads
    if (window.AndroidApp && typeof window.AndroidApp.saveTextFile === 'function') {
      const savedPath = window.AndroidApp.saveTextFile(fileName, json);
      if (savedPath) {
        showToast('Backup saved to ' + savedPath);
      } else {
        alert('Could not save the backup file. Try again or free up some storage.');
      }
      return;
    }

    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(json));
    dlAnchor.setAttribute('download', fileName);
    dlAnchor.click();
    showToast('Backup data exported!');
  };

  $('btn-reset-all-data').onclick = async () => {
    if (confirm('Reset all Ghosty Gains data to original defaults?')) {
      await Promise.all((state.progressPhotos || []).map(photo => window.GhostyPhotos.remove(photo)));
      // Remove legacy keys too, otherwise loadState() would restore the old data
      [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].forEach(k => localStorage.removeItem(k));
      if (window.AndroidApp && typeof window.AndroidApp.clearStateBackup === 'function') window.AndroidApp.clearStateBackup();
      if (window.AndroidApp && typeof window.AndroidApp.setTodayNativeSteps === 'function') {
        window.AndroidApp.setTodayNativeSteps(0);
      }
      state = loadState();
      saveState();
      initApp();
      showToast('Reset to defaults.');
    }
  };

  // --- Barcode Scanner & Nutrition Engine ---
  let scannerStream = null;
  let scannerInterval = null;
  let currentCameraFacing = 'environment';
  let isTorchOn = false;
  let barcodeDetector = null;
  let scannerLookupVersion = 0;

  // Only ask for formats the device supports; unsupported ones make the constructor throw
  if ('BarcodeDetector' in window) {
    const wanted = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];
    const supportedPromise = typeof window.BarcodeDetector.getSupportedFormats === 'function'
      ? window.BarcodeDetector.getSupportedFormats()
      : Promise.resolve(wanted);
    supportedPromise.then(supported => {
      const formats = wanted.filter(f => supported.includes(f));
      if (formats.length) barcodeDetector = new window.BarcodeDetector({ formats });
    }).catch(() => {});
  }

  // --- High-Performance 1D Barcode Pattern Decoder (Pure JS Canvas Engine) ---
  const EAN_L = [
    [3, 2, 1, 1], [2, 2, 2, 1], [2, 1, 2, 2], [1, 4, 1, 1], [1, 1, 3, 2],
    [1, 2, 3, 1], [1, 1, 1, 4], [1, 3, 1, 2], [1, 2, 1, 3], [3, 1, 1, 2]
  ];
  const EAN_G = [
    [1, 1, 2, 3], [1, 2, 2, 2], [2, 2, 1, 2], [1, 1, 4, 1], [2, 3, 1, 1],
    [1, 3, 2, 1], [4, 1, 1, 1], [2, 1, 3, 1], [3, 1, 2, 1], [2, 1, 1, 3]
  ];
  const EAN_PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  function matchEanPattern(norm, table) {
    let best = null;
    let minD = 2.2;
    for (let d = 0; d < 10; d++) {
      const p = table[d];
      const dist = Math.abs(norm[0] - p[0]) + Math.abs(norm[1] - p[1]) + Math.abs(norm[2] - p[2]) + Math.abs(norm[3] - p[3]);
      if (dist < minD) {
        minD = dist;
        best = d;
      }
    }
    return minD <= 1.8 ? best : null;
  }

  function tryDecodeEANFromRuns(runs) {
    if (runs.length < 59) return null;
    for (let i = 0; i <= runs.length - 59; i++) {
      if (runs[i].bit !== 1 || runs[i+1].bit !== 0 || runs[i+2].bit !== 1) continue;
      const gWidth = runs[i].len + runs[i+1].len + runs[i+2].len;
      if (gWidth < 3) continue;

      let cur = i + 3;
      const leftDigits = [];
      const parity = [];
      let okLeft = true;

      for (let d = 0; d < 6; d++) {
        if (cur + 3 >= runs.length) { okLeft = false; break; }
        const r = [runs[cur].len, runs[cur+1].len, runs[cur+2].len, runs[cur+3].len];
        const sum = r[0] + r[1] + r[2] + r[3];
        const scale = 7 / sum;
        const norm = r.map(x => Math.round(x * scale));

        const mL = matchEanPattern(norm, EAN_L);
        const mG = matchEanPattern(norm, EAN_G);
        if (mL !== null) {
          leftDigits.push(mL);
          parity.push('L');
        } else if (mG !== null) {
          leftDigits.push(mG);
          parity.push('G');
        } else {
          okLeft = false;
          break;
        }
        cur += 4;
      }

      if (!okLeft || leftDigits.length !== 6) continue;
      if (cur + 4 >= runs.length) continue;
      if (runs[cur].bit !== 0 || runs[cur+1].bit !== 1 || runs[cur+2].bit !== 0 || runs[cur+3].bit !== 1 || runs[cur+4].bit !== 0) continue;
      cur += 5;

      const rightDigits = [];
      let okRight = true;
      for (let d = 0; d < 6; d++) {
        if (cur + 3 >= runs.length) { okRight = false; break; }
        const r = [runs[cur].len, runs[cur+1].len, runs[cur+2].len, runs[cur+3].len];
        const sum = r[0] + r[1] + r[2] + r[3];
        const scale = 7 / sum;
        const norm = r.map(x => Math.round(x * scale));
        const mR = matchEanPattern(norm, EAN_L);
        if (mR !== null) {
          rightDigits.push(mR);
        } else {
          okRight = false;
          break;
        }
        cur += 4;
      }

      if (!okRight || rightDigits.length !== 6) continue;
      if (cur + 2 < runs.length && runs[cur].bit === 1 && runs[cur+1].bit === 0 && runs[cur+2].bit === 1) {
        const parStr = parity.join('');
        const firstDigit = EAN_PARITY.indexOf(parStr);
        if (firstDigit !== -1) {
          const full = [firstDigit, ...leftDigits, ...rightDigits];
          let sum = 0;
          for (let k = 0; k < 12; k++) {
            sum += full[k] * (k % 2 === 0 ? 1 : 3);
          }
          const check = (10 - (sum % 10)) % 10;
          if (check === full[12]) {
            return full.join('');
          }
        }
      }
    }
    return null;
  }

  // EAN-8: guard, 4 L digits, centre guard, 4 R digits, guard
  function tryDecodeEAN8FromRuns(runs) {
    if (runs.length < 43) return null;
    const digitAt = (cur) => {
      const r = [runs[cur].len, runs[cur + 1].len, runs[cur + 2].len, runs[cur + 3].len];
      const scale = 7 / (r[0] + r[1] + r[2] + r[3]);
      return matchEanPattern(r.map(x => Math.round(x * scale)), EAN_L);
    };
    for (let i = 0; i <= runs.length - 43; i++) {
      if (runs[i].bit !== 1 || runs[i + 1].bit !== 0 || runs[i + 2].bit !== 1) continue;
      let cur = i + 3;
      const digits = [];
      for (let d = 0; d < 4 && cur + 3 < runs.length; d++, cur += 4) {
        const v = digitAt(cur);
        if (v === null) break;
        digits.push(v);
      }
      if (digits.length !== 4 || cur + 4 >= runs.length) continue;
      if (runs[cur].bit !== 0 || runs[cur + 1].bit !== 1 || runs[cur + 2].bit !== 0 || runs[cur + 3].bit !== 1 || runs[cur + 4].bit !== 0) continue;
      cur += 5;
      for (let d = 0; d < 4 && cur + 3 < runs.length; d++, cur += 4) {
        const v = digitAt(cur);
        if (v === null) break;
        digits.push(v);
      }
      if (digits.length !== 8) continue;
      let sum = 0;
      for (let k = 0; k < 7; k++) sum += digits[k] * (k % 2 === 0 ? 3 : 1);
      if ((10 - (sum % 10)) % 10 === digits[7]) return digits.join('');
    }
    return null;
  }

  function decodeRuns(runs) {
    return tryDecodeEANFromRuns(runs) || tryDecodeEAN8FromRuns(runs);
  }

  function decodeBarcodeFromCanvas(canvas) {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const w = canvas.width;
      const h = canvas.height;
      if (w < 60 || h < 60) return null;

      const imgData = ctx.getImageData(0, 0, w, h);
      const { data } = imgData;
      const scanlines = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8];

      for (let s = 0; s < scanlines.length; s++) {
        const y = Math.floor(h * scanlines[s]);
        const offset = y * w * 4;
        const lum = new Uint8Array(w);
        let minL = 255;
        let maxL = 0;

        for (let x = 0; x < w; x++) {
          const idx = offset + x * 4;
          const l = (data[idx] * 299 + data[idx + 1] * 587 + data[idx + 2] * 114) / 1000;
          lum[x] = l;
          if (l < minL) minL = l;
          if (l > maxL) maxL = l;
        }

        if (maxL - minL < 22) continue;
        const thresh = (minL + maxL) / 2;

        const runs = [];
        let curBit = lum[0] < thresh ? 1 : 0;
        let curLen = 1;

        for (let x = 1; x < w; x++) {
          const bit = lum[x] < thresh ? 1 : 0;
          if (bit === curBit) {
            curLen++;
          } else {
            runs.push({ bit: curBit, len: curLen });
            curBit = bit;
            curLen = 1;
          }
        }
        runs.push({ bit: curBit, len: curLen });

        // Try as-is, then reversed in case the pack is upside down
        const code = decodeRuns(runs) || decodeRuns(runs.slice().reverse());
        if (code) return code;
      }
    } catch (_) {}
    return null;
  }

  const hasNativeScanner = () => !!(window.AndroidApp && typeof window.AndroidApp.scanBarcodeNative === 'function');

  function setScannerHint(text) {
    const hint = $('scanner-status-hint');
    if (hint) hint.textContent = text;
  }

  // The viewfinder is only shown while the in-app camera is actually streaming
  function setViewfinderVisible(visible) {
    const box = $('scanner-viewport-box');
    if (box) box.style.display = visible ? '' : 'none';
    const camBtn = $('btn-toggle-camera');
    if (camBtn) camBtn.textContent = visible ? '🔄 Switch Lens' : '📷 Live Camera';
  }

  function openScannerModal() {
    scannerLookupVersion++;
    if (pendingMealIngredientId) $('modal-meal-builder').classList.remove('active');
    $('modal-barcode').classList.add('active');
    $('scanned-result-container').replaceChildren();
    $('scanner-loading').style.display = 'none';
    renderNutritionDates();
  }

  // Main "Scan Barcode" action: use Google's on-device scanner when the Android shell has it,
  // otherwise fall back to the in-app camera
  function scanBarcode() {
    if (hasNativeScanner()) {
      window.AndroidApp.scanBarcodeNative();
      return;
    }
    startBarcodeScanner();
  }

  window.onNativeBarcodeResult = function(code, status) {
    if (status === 'ok' && code) {
      playBeep(980, 0.2);
      triggerVibrate(120);
      openScannerModal();
      setViewfinderVisible(false);
      lookupBarcode(code);
    } else if (status === 'notfound') {
      openScannerModal();
      setViewfinderVisible(false);
      showToast('No barcode found in that photo. Get closer, keep it flat and in focus, or type the number.');
      const manualInput = $('manual-barcode-input');
      if (manualInput) manualInput.focus();
    } else if (status === 'error') {
      // Google scanner unavailable (no Play Services / module not downloaded yet)
      showToast('Using in-app camera scanner');
      startBarcodeScanner();
    } else if (status === 'cancelled' && pendingMealIngredientId) {
      pendingMealIngredientId = null;
      openModal('modal-meal-builder');
    }
  };

  async function startBarcodeScanner() {
    const video = $('scanner-video');
    openScannerModal();
    setViewfinderVisible(true);
    setScannerHint('Starting camera...');

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setViewfinderVisible(false);
      setScannerHint('');
      showToast('Live camera not available here. Use Snap Photo or type the barcode.');
      return;
    }

    try {
      stopCameraStream();

      const constraints = {
        video: {
          facingMode: { ideal: currentCameraFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      scannerStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Modal may have been closed while we waited for permission
      if (!$('modal-barcode').classList.contains('active')) {
        stopCameraStream();
        return;
      }

      video.srcObject = scannerStream;
      await video.play();
      isTorchOn = false;
      setScannerHint('Point camera at food barcode...');

      const canvas = $('scanner-canvas') || document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (scannerInterval) clearInterval(scannerInterval);
      let busy = false;
      scannerInterval = setInterval(async () => {
        if (busy || !video.videoWidth || !video.videoHeight) return;
        busy = true;

        let detectedCode = null;

        // 1. Try Native BarcodeDetector if available
        if (barcodeDetector) {
          try {
            const barcodes = await barcodeDetector.detect(video);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              detectedCode = barcodes[0].rawValue;
            }
          } catch (_) {}
        }

        // 2. Try In-Memory Canvas Pattern Decoder
        if (!detectedCode && scannerInterval) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          detectedCode = decodeBarcodeFromCanvas(canvas);
        }

        busy = false;

        if (detectedCode && scannerInterval) {
          playBeep(980, 0.2);
          triggerVibrate(120);
          clearInterval(scannerInterval);
          scannerInterval = null;
          setScannerHint(`Barcode Found: ${detectedCode}`);
          lookupBarcode(detectedCode);
        }
      }, 250);
    } catch (err) {
      console.warn('Camera stream error:', err);
      stopCameraStream();
      setViewfinderVisible(false);
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        showToast('Camera blocked. Allow Camera for Ghosty Gains in phone Settings > Apps.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        showToast('No camera found. Use Snap Photo or type the barcode.');
      } else if (name === 'NotReadableError') {
        showToast('Camera is in use by another app. Close it and try again.');
      } else {
        showToast('Camera failed to start. Use Snap Photo or type the barcode.');
      }
    }
  }

  function stopCameraStream() {
    if (scannerInterval) {
      clearInterval(scannerInterval);
      scannerInterval = null;
    }
    if (scannerStream) {
      scannerStream.getTracks().forEach(t => t.stop());
      scannerStream = null;
    }
    const video = $('scanner-video');
    if (video) video.srcObject = null;
  }

  function stopBarcodeScanner() {
    scannerLookupVersion++;
    stopCameraStream();
    $('modal-barcode').classList.remove('active');
    if (pendingMealIngredientId) {
      pendingMealIngredientId = null;
      openModal('modal-meal-builder');
    }
  }

  async function toggleTorch() {
    if (!scannerStream) {
      showToast('Start the live camera first');
      return;
    }
    const track = scannerStream.getVideoTracks()[0];
    if (!track) return;
    try {
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      if (capabilities.torch) {
        isTorchOn = !isTorchOn;
        await track.applyConstraints({ advanced: [{ torch: isTorchOn }] });
        showToast(isTorchOn ? 'Flashlight ON' : 'Flashlight OFF');
      } else {
        showToast('Flashlight not supported on this lens');
      }
    } catch (_) {
      showToast('Flashlight toggle failed');
    }
  }

  async function toggleCameraFacing() {
    // Without a running stream this button starts the live camera
    if (scannerStream) {
      currentCameraFacing = currentCameraFacing === 'environment' ? 'user' : 'environment';
    }
    await startBarcodeScanner();
  }

  function handleBarcodePhotoFile(file) {
    if (!file) return;
    stopCameraStream();
    openScannerModal();
    setViewfinderVisible(false);
    $('scanner-loading').style.display = 'block';

    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = async () => {
        let detected = null;

        // Try BarcodeDetector first
        if (barcodeDetector) {
          try {
            const barcodes = await barcodeDetector.detect(img);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              detected = barcodes[0].rawValue;
            }
          } catch (_) {}
        }

        // Try Canvas Decoder on a downscaled copy (phone photos are huge)
        if (!detected) {
          const srcW = img.naturalWidth || img.width;
          const srcH = img.naturalHeight || img.height;
          const ratio = Math.min(1, 1600 / Math.max(srcW, srcH));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(srcW * ratio);
          canvas.height = Math.round(srcH * ratio);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          detected = decodeBarcodeFromCanvas(canvas);
        }

        if (detected) {
          playBeep(980, 0.2);
          triggerVibrate(120);
          lookupBarcode(detected);
        } else {
          $('scanner-loading').style.display = 'none';
          showToast('No barcode found in photo. Hold it flat & close, or type the number.');
          const manualInput = $('manual-barcode-input');
          if (manualInput) manualInput.focus();
        }
      };
      img.onerror = () => {
        $('scanner-loading').style.display = 'none';
        showToast('Could not read that photo.');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  const num = v => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  async function fetchWithTimeout(url, ms) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
    try {
      return await fetch(url, { cache: 'no-cache', signal: ctrl ? ctrl.signal : undefined });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function lookupBarcode(query) {
    if (!query || !query.trim()) return;
    const lookupVersion = ++scannerLookupVersion;
    const cleanQuery = query.trim();
    const q = cleanQuery.toLowerCase();
    const isBarcodeNum = /^\d{6,14}$/.test(cleanQuery);
    $('manual-barcode-input').value = cleanQuery;
    $('scanner-loading').style.display = 'block';
    $('scanned-result-container').replaceChildren();

    let productData = null;

    // 1. Your own saved foods (custom foods keep their barcode) and the offline gym database
    const localFoods = [...(state.foodLibrary || []), ...OFFLINE_FOODS_DB];
    const localMatch = isBarcodeNum
      ? localFoods.find(f => f.code === cleanQuery)
      : localFoods.find(f => f.name.toLowerCase().includes(q) || (f.brand || '').toLowerCase().includes(q));

    // The same product is often stored as UPC-A (12 digits) or EAN-13 with a leading 0
    const codeVariants = isBarcodeNum
      ? [...new Set([cleanQuery, cleanQuery.length === 12 ? '0' + cleanQuery : null, cleanQuery.length === 13 && cleanQuery[0] === '0' ? cleanQuery.slice(1) : null, cleanQuery.length < 13 ? cleanQuery.padStart(13, '0') : null].filter(Boolean))]
      : [];
    const localVariant = isBarcodeNum && !localMatch ? localFoods.find(f => codeVariants.includes(f.code)) : null;

    // Foods you've saved yourself come up instantly for both barcodes and names
    const ownMatch = !isBarcodeNum && (state.foodLibrary || []).find(f => f.name.toLowerCase().includes(q));
    if (ownMatch) {
      productData = ownMatch;
    } else if (isBarcodeNum && (localMatch || localVariant)) {
      productData = localMatch || localVariant;
    } else {
      // 2. Open Food Facts
      try {
        let p = null;
        if (isBarcodeNum) {
          for (const code of codeVariants) {
            const response = await fetchWithTimeout(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`, 10000);
            if (!response.ok) continue;
            const json = await response.json();
            if (json.product && (json.status === 1 || json.status === undefined)) {
              p = json.product;
              break;
            }
          }
        } else {
          const response = await fetchWithTimeout(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(cleanQuery)}&search_simple=1&action=process&json=1&page_size=1`, 10000);
          if (response.ok) {
            const json = await response.json();
            p = json.products && json.products[0];
          }
        }
        {
          if (p) {
            const nut = p.nutriments || {};
            const kcal = num(nut['energy-kcal_100g']) || num(nut['energy-kcal']) || (num(nut['energy_100g']) ? num(nut['energy_100g']) / 4.184 : 0);
            const pro = num(nut['proteins_100g'] ?? nut['proteins']);
            const carb = num(nut['carbohydrates_100g'] ?? nut['carbohydrates']);
            const sug = num(nut['sugars_100g'] ?? nut['sugars']);
            const fat = num(nut['fat_100g'] ?? nut['fat']);
            const satFat = num(nut['saturated-fat_100g'] ?? nut['saturated-fat']);
            const fiber = num(nut['fiber_100g'] ?? nut['fiber']);
            const salt = num(nut['salt_100g']) || num(nut['sodium_100g']) * 2.5;

            productData = {
              code: isBarcodeNum ? cleanQuery : (p.code || ''),
              name: p.product_name || p.product_name_en || 'Scanned Food Product',
              brand: p.brands || 'Open Food Facts',
              serving: p.serving_size || '100g',
              servingBase: num(p.serving_quantity) || 0,
              isDrink: looksLikeDrink(p),
              calories: Math.round(kcal),
              protein: parseFloat(pro.toFixed(1)),
              carbs: parseFloat(carb.toFixed(1)),
              sugars: nut['sugars_100g'] != null ? sug : null,
              fat: parseFloat(fat.toFixed(1)),
              satFat: nut['saturated-fat_100g'] != null ? satFat : null,
              fiber: nut['fiber_100g'] != null ? fiber : null,
              salt: nut['salt_100g'] != null || nut['sodium_100g'] != null ? salt : null,
              sodium: nut['sodium_100g'] != null ? num(nut['sodium_100g']) * 1000 : nut['salt_100g'] != null ? salt * 400 : null,
              cholesterol: nut['cholesterol_100g'] != null ? num(nut['cholesterol_100g']) * 1000 : null,
              unsatFat: nut['unsaturated-fat_100g'] != null ? num(nut['unsaturated-fat_100g'])
                : nut['monounsaturated-fat_100g'] != null && nut['polyunsaturated-fat_100g'] != null
                ? num(nut['monounsaturated-fat_100g']) + num(nut['polyunsaturated-fat_100g']) : null,
              transFat: nut['trans-fat_100g'] != null ? num(nut['trans-fat_100g']) : null,
              potassium: nut['potassium_100g'] != null ? num(nut['potassium_100g']) * 1000 : null,
              nutriScore: p.nutriscore_grade && p.nutriscore_grade.length === 1 ? p.nutriscore_grade.toUpperCase() : '?',
              image: p.image_front_small_url || p.image_url || '🥗'
            };
          }
        }
      } catch (e) {
        console.warn('Open Food Facts lookup failed, using offline database:', e);
      }
    }

    if (lookupVersion !== scannerLookupVersion) return;
    $('scanner-loading').style.display = 'none';

    if (!productData && localMatch) {
      productData = localMatch;
    }

    if (productData) {
      // Save to scanned history
      if (!state.scannedHistory.some(h => h.code && h.code === productData.code)) {
        state.scannedHistory.unshift(productData);
        if (state.scannedHistory.length > 50) state.scannedHistory.pop();
        saveState();
      }
      renderScannedResult(productData);
    } else {
      const emptyDiv = document.createElement('div');
      emptyDiv.style.textAlign = 'center';
      emptyDiv.style.padding = '16px';
      emptyDiv.style.color = '#ff4757';
      emptyDiv.innerHTML = isBarcodeNum
        ? `<b>Barcode ${esc(cleanQuery)} isn't in Open Food Facts yet.</b><br><span style="font-size:11px;color:#a4a4ba;">Check you're online, or add it yourself from the label — next scan will find it.</span>`
        : `<b>No nutrition match found for "${esc(cleanQuery)}".</b><br><span style="font-size:11px;color:#a4a4ba;">Try generic gym foods like "Greek Yogurt", "Chicken Breast", "Oats", or "Whey".</span>`;

      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-cyan btn-sm';
      addBtn.style.marginTop = '10px';
      addBtn.textContent = '＋ Add as Custom Food';
      addBtn.onclick = () => {
        if (pendingMealIngredientId) {
          const ingredient = mealDraft.ingredients.find(i => i.id === pendingMealIngredientId);
          if (ingredient) { ingredient.food.name = isBarcodeNum ? '' : cleanQuery; ingredient.food.code = isBarcodeNum ? cleanQuery : ''; }
          stopBarcodeScanner();
          renderMealIngredients();
          return;
        }
        stopBarcodeScanner();
        openCustomFoodModal(isBarcodeNum ? { code: cleanQuery } : { name: cleanQuery });
      };
      emptyDiv.append(document.createElement('br'), addBtn);
      $('scanned-result-container').append(emptyDiv);
    }
  }

  function renderScannedResult(prod) {
    const container = $('scanned-result-container');
    container.replaceChildren();

    if (pendingMealIngredientId) {
      const targetId = pendingMealIngredientId;
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<div class="card-title">${esc(prod.name)}</div><p class="report-text">Nutrition per 100g. Choose the exact grams in your ingredient block.</p>`;
      let liquidWeight = null;
      if (prod.isDrink) {
        const field = document.createElement('div');
        field.className = 'form-group';
        field.innerHTML = '<label for="ingredient-liquid-weight">Weight of 100ml of this liquid (grams)</label><input id="ingredient-liquid-weight" type="number" min="0.01" step="any" inputmode="decimal" placeholder="Weigh 100ml or use the label"><p class="report-text">Liquid labels use ml. This converts their nutrition to the exact grams in your recipe.</p>';
        liquidWeight = field.querySelector('input');
        card.append(field);
      }
      const use = document.createElement('button');
      use.className = 'btn btn-cyan btn-block';
      use.textContent = 'Use This Ingredient';
      use.onclick = () => {
        const ingredient = mealDraft?.ingredients.find(i => i.id === targetId);
        if (!ingredient) return;
        if (prod.servingUnknown) {
          showToast('Enter nutrition per 100g manually for an ingredient without a known gram weight.');
          return;
        }
        if (liquidWeight && !(Number(liquidWeight.value) > 0)) {
          showToast('Enter the weight of 100ml to convert this liquid to grams.');
          return;
        }
        ingredient.food = liquidWeight
          ? { ...prod, ...scaleNutrition(prod, 10000 / Number(liquidWeight.value)),
            salt: prod.salt == null ? null : prod.salt * 100 / Number(liquidWeight.value),
            isDrink: false, liquidGramsPer100ml: Number(liquidWeight.value) }
          : { ...prod };
        stopBarcodeScanner();
        renderMealIngredients();
      };
      card.append(use);
      container.append(card);
      return;
    }

    let servingWeight = 100;

    const card = document.createElement('div');
    card.className = 'scanned-product-card';

    // Header
    const header = document.createElement('div');
    header.className = 'scanned-product-header';

    const imgWrap = document.createElement('div');
    if (prod.image && prod.image.startsWith('http')) {
      const img = document.createElement('img');
      img.className = 'product-thumb';
      img.src = prod.image;
      img.alt = prod.name;
      imgWrap.append(img);
    } else {
      const icon = document.createElement('div');
      icon.className = 'product-thumb';
      icon.style.display = 'flex';
      icon.style.alignItems = 'center';
      icon.style.justifyContent = 'center';
      icon.style.fontSize = '28px';
      icon.textContent = prod.image || '🥗';
      imgWrap.append(icon);
    }

    const titleDiv = document.createElement('div');
    titleDiv.style.flex = '1';
    titleDiv.innerHTML = `
      <div style="font-size:15px;font-weight:800;color:#fff;">${esc(prod.name)}</div>
      <div style="font-size:12px;color:var(--text-muted);">${esc(prod.brand)} · Serving: ${esc(prod.serving)}</div>
      <div style="margin-top:4px;">
        <span class="day-badge cyan" style="font-size:10px;">Nutri-Score: ${esc(prod.nutriScore || '?')}</span>
        <span class="day-badge" style="font-size:10px;">${prod.isDrink ? '🥤 Drink · per 100ml' : 'Values per 100g'}</span>
      </div>
    `;

    header.append(imgWrap, titleDiv);
    card.append(header);

    // Serving Weight Adjuster
    const weightAdjuster = document.createElement('div');
    weightAdjuster.style.background = 'rgba(0,0,0,0.2)';
    weightAdjuster.style.padding = '8px 10px';
    weightAdjuster.style.borderRadius = '8px';
    weightAdjuster.style.margin = '10px 0';
    weightAdjuster.style.display = 'flex';
    weightAdjuster.style.alignItems = 'center';
    weightAdjuster.style.justifyContent = 'space-between';

    weightAdjuster.style.gap = '10px';
    const portionLbl = document.createElement('span');
    portionLbl.style.cssText = 'font-size:12px;font-weight:700;color:var(--text-muted);white-space:nowrap;';
    portionLbl.textContent = prod.isDrink ? 'Amount:' : 'Portion:';
    let portionBase = 100;
    let portionText = '';
    const picker = buildPortionPicker(prod, (base, label) => {
      portionBase = base;
      portionText = label;
      updateMacroDisplay(base);
    });
    picker.style.maxWidth = '260px';
    weightAdjuster.append(portionLbl, picker);
    card.append(weightAdjuster);

    // Macro Pill Grid
    const macroGrid = document.createElement('div');
    macroGrid.className = 'macro-pill-grid';

    function updateMacroDisplay(grams) {
      const mult = grams / 100;
      const c = Math.round(prod.calories * mult);
      const p = parseFloat((prod.protein * mult).toFixed(1));
      const cb = parseFloat((prod.carbs * mult).toFixed(1));
      const f = parseFloat((prod.fat * mult).toFixed(1));

      macroGrid.innerHTML = `
        <div class="macro-pill"><div class="macro-pill-val cyan">${c}</div><div class="macro-pill-lbl">Kcal</div></div>
        <div class="macro-pill"><div class="macro-pill-val purple">${p}g</div><div class="macro-pill-lbl">Protein</div></div>
        <div class="macro-pill"><div class="macro-pill-val" style="color:#2ecc71;">${cb}g</div><div class="macro-pill-lbl">Carbs</div></div>
        <div class="macro-pill"><div class="macro-pill-val orange">${f}g</div><div class="macro-pill-lbl">Fats</div></div>
      `;
    }

    picker.fire();
    card.append(macroGrid);

    // Full profile follows the selected serving, including saved recipes.
    const microDetail = document.createElement('div');
    microDetail.style.fontSize = '11px';
    microDetail.style.color = 'var(--text-muted)';
    microDetail.style.margin = '6px 0 10px';
    microDetail.style.display = 'flex';
    microDetail.style.justifyContent = 'space-around';
    microDetail.innerHTML = `
      <span>Sugars: <b>${prod.sugars || 0}g</b></span>
      <span>Sat Fat: <b>${prod.satFat || 0}g</b></span>
      <span>Fiber: <b>${prod.fiber || 0}g</b></span>
      <span>Salt: <b>${prod.salt || 0}g</b></span>
    `;
    card.append(microDetail);
    const updateFullProfile = () => { microDetail.innerHTML = nutritionProfileHtml(scaleNutrition(prod, portionBase)); };
    picker.addEventListener('input', updateFullProfile);
    picker.addEventListener('change', updateFullProfile);
    updateFullProfile();
    if (prod.isRecipe) {
      const recipe = document.createElement('details');
      recipe.innerHTML = `<summary>Recipe · ${esc(prod.totalWeight)}g total</summary>${(prod.ingredients || []).map(i => `<div class="report-text">${esc(i.food.name)} · ${esc(i.grams)}g</div>`).join('')}`;
      card.append(recipe);
    }

    // Slot Selector Box
    const slotBox = document.createElement('div');
    slotBox.style.margin = '10px 0';
    slotBox.innerHTML = `
      <div style="font-size:11.5px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">Place In Meal:</div>
      <div class="slot-select-grid">
        <button class="slot-select-btn ${currentLoggingSlot === 'breakfast' ? 'active' : ''}" data-slot="breakfast">🌅 Breakfast</button>
        <button class="slot-select-btn ${currentLoggingSlot === 'lunch' ? 'active' : ''}" data-slot="lunch">🥪 Lunch</button>
        <button class="slot-select-btn ${currentLoggingSlot === 'dinner' ? 'active' : ''}" data-slot="dinner">🍽️ Dinner</button>
        <button class="slot-select-btn ${currentLoggingSlot === 'snack' ? 'active' : ''}" data-slot="snack">🌙 Snack</button>
      </div>
    `;
    card.append(slotBox);

    const slotButtons = slotBox.querySelectorAll('.slot-select-btn');
    slotButtons.forEach(btn => {
      btn.onclick = () => {
        currentLoggingSlot = btn.dataset.slot;
        slotButtons.forEach(b => b.classList.toggle('active', b === btn));
        btnLogMeal.textContent = `${planningMeals() ? '＋ Plan' : '➕ Log'} to ${SLOT_NAMES[currentLoggingSlot]?.name || 'Meal'}`;
        triggerVibrate(20);
      };
    });

    // Action Buttons
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';

    const btnLogMeal = document.createElement('button');
    btnLogMeal.className = 'btn btn-cyan btn-sm';
    btnLogMeal.style.flex = '1';
    btnLogMeal.textContent = `${planningMeals() ? '＋ Plan' : '➕ Log'} to ${SLOT_NAMES[currentLoggingSlot]?.name || 'Meal'}`;
    btnLogMeal.onclick = () => {
      if (!(portionBase > 0)) {
        alert('Enter how much you had.');
        return;
      }
      logFoodToSlot(prod, portionBase, currentLoggingSlot, portionText);
      stopBarcodeScanner();
      // Show the slot the food went into
      state.nutritionMode = 'pro';
      saveState();
      switchTab('nutrition');
      renderNutrition();
    };

    const btnCopy = document.createElement('button');
    btnCopy.className = 'btn btn-outline btn-sm';
    btnCopy.textContent = '📋 Copy';
    btnCopy.onclick = () => {
      const mult = portionBase / 100;
      const text = `${prod.name} (${portionText}) - ${Math.round(prod.calories * mult)} kcal | ${parseFloat((prod.protein * mult).toFixed(1))}g P | ${parseFloat((prod.carbs * mult).toFixed(1))}g C | ${parseFloat((prod.fat * mult).toFixed(1))}g F`;
      copyText(text, 'Nutrition info copied!');
    };

    btnRow.append(btnLogMeal, btnCopy);
    card.append(btnRow);
    container.append(card);

  }

  // --- Takeaways & Home Meals ---
  // Typical UK portions, per regular serving: [name, category, emoji, grams, kcal, protein, carbs, fat, what "regular" means]
  const TAKEAWAY_CATEGORIES = {
    kebab: '🥙 Kebab & Chippy',
    indian: '🍛 Indian',
    asian: '🥡 Chinese & Asian',
    pizza: '🍕 Pizza, Burgers & Chicken',
    home: '🏠 Home Meals',
    breakfast: '🍳 Breakfast',
    bakery: '🥐 Bakery & Meal Deals'
  };
  const TAKEAWAY_MEALS = [
    ['Lamb doner kebab in pitta (salad & sauce)', 'kebab', '🥙', 450, 1000, 45, 75, 58, '1 pitta'],
    ['Chicken doner kebab in pitta (salad & sauce)', 'kebab', '🥙', 420, 780, 55, 72, 28, '1 pitta'],
    ['Chicken shish kebab in pitta', 'kebab', '🥙', 400, 620, 52, 68, 14, '1 pitta'],
    ['Mixed kebab in naan', 'kebab', '🥙', 600, 1350, 75, 110, 65, '1 naan'],
    ['Doner meat & chips', 'kebab', '🍟', 600, 1450, 50, 120, 85, '1 box'],
    ['Fish & chips (battered cod)', 'kebab', '🐟', 600, 1150, 45, 120, 55, '1 fish + chips'],
    ['Chippy chips', 'kebab', '🍟', 300, 600, 8, 85, 25, '1 portion'],
    ['Cheesy chips', 'kebab', '🍟', 400, 900, 25, 90, 48, '1 portion'],
    ['Battered sausage & chips', 'kebab', '🌭', 450, 950, 22, 100, 50, '1 portion'],
    ['Chicken tikka masala', 'indian', '🍛', 350, 600, 45, 20, 38, '1 tub, curry only'],
    ['Chicken korma', 'indian', '🍛', 350, 700, 40, 25, 50, '1 tub, curry only'],
    ['Chicken jalfrezi', 'indian', '🍛', 350, 450, 45, 18, 22, '1 tub, curry only'],
    ['Lamb rogan josh', 'indian', '🍛', 350, 560, 38, 15, 38, '1 tub, curry only'],
    ['Chicken biryani', 'indian', '🍛', 450, 750, 40, 95, 22, '1 tub'],
    ['Pilau rice', 'indian', '🍚', 250, 400, 7, 75, 9, '1 tub'],
    ['Plain naan', 'indian', '🫓', 160, 440, 13, 75, 10, '1 naan'],
    ['Garlic naan', 'indian', '🫓', 170, 520, 13, 77, 18, '1 naan'],
    ['Onion bhajis', 'indian', '🧅', 160, 380, 7, 30, 26, '2 bhajis'],
    ['Chicken chow mein', 'asian', '🍜', 450, 650, 35, 75, 22, '1 tub'],
    ['Special fried rice', 'asian', '🍚', 400, 750, 25, 100, 26, '1 tub'],
    ['Egg fried rice', 'asian', '🍚', 350, 580, 14, 90, 18, '1 tub'],
    ['Sweet & sour chicken (battered)', 'asian', '🥡', 400, 850, 35, 100, 33, '1 tub'],
    ['Salt & pepper chicken', 'asian', '🥡', 300, 700, 40, 45, 38, '1 tub'],
    ['Crispy chilli beef', 'asian', '🥡', 300, 800, 30, 85, 38, '1 tub'],
    ['Spring rolls', 'asian', '🥟', 120, 300, 6, 35, 15, '2 rolls'],
    ['Chicken pad thai', 'asian', '🍜', 400, 700, 35, 85, 24, '1 box'],
    ['Thai green curry with chicken', 'asian', '🍛', 350, 520, 32, 15, 36, 'curry only'],
    ['Sushi (mixed)', 'asian', '🍣', 250, 400, 16, 70, 6, '8 pieces'],
    ['Margherita pizza', 'pizza', '🍕', 450, 1100, 48, 140, 38, 'whole 10" pizza'],
    ['Pepperoni pizza', 'pizza', '🍕', 480, 1300, 55, 140, 56, 'whole 10" pizza'],
    ['Garlic bread', 'pizza', '🥖', 120, 400, 9, 45, 20, '4 slices'],
    ['Cheeseburger (quarter-pounder style)', 'pizza', '🍔', 200, 520, 30, 42, 26, '1 burger'],
    ['Big Mac-style burger', 'pizza', '🍔', 215, 500, 26, 42, 25, '1 burger'],
    ['Fast-food fries', 'pizza', '🍟', 115, 340, 4, 43, 16, 'medium'],
    ['Chicken nuggets', 'pizza', '🍗', 100, 260, 14, 18, 14, '6 nuggets'],
    ['Fried chicken pieces', 'pizza', '🍗', 250, 560, 46, 18, 34, '2 pieces'],
    ['Fried chicken burger', 'pizza', '🍔', 230, 520, 28, 50, 22, '1 burger'],
    ['Chicken wings', 'pizza', '🍗', 200, 500, 40, 6, 34, '6 wings'],
    ['Peri-peri chicken (quarter)', 'pizza', '🍗', 180, 330, 42, 1, 18, '¼ chicken'],
    ['Chicken burrito (rice & beans)', 'pizza', '🌯', 450, 900, 50, 100, 30, '1 burrito'],
    ['6" chicken sub', 'pizza', '🥖', 230, 400, 30, 48, 8, '1 sub'],
    ['Spaghetti bolognese', 'home', '🍝', 450, 650, 35, 80, 20, '1 plate'],
    ['Chilli con carne with rice', 'home', '🌶️', 500, 700, 40, 85, 20, '1 plate'],
    ['Lasagne', 'home', '🍝', 350, 560, 30, 40, 30, '1 portion'],
    ["Shepherd's / cottage pie", 'home', '🥧', 400, 480, 28, 40, 22, '1 portion'],
    ['Roast chicken dinner with gravy', 'home', '🍗', 550, 750, 50, 65, 30, '1 plate'],
    ['Chicken, rice & broccoli', 'home', '🥦', 400, 520, 50, 60, 7, '1 meal-prep box'],
    ['Chicken curry & rice (homemade)', 'home', '🍛', 500, 700, 42, 85, 18, '1 plate'],
    ['Chicken stir-fry with noodles', 'home', '🍜', 400, 550, 38, 60, 16, '1 plate'],
    ['Chicken fajitas', 'home', '🌮', 350, 600, 40, 60, 20, '2 wraps'],
    ['Steak & chips', 'home', '🥩', 450, 900, 55, 65, 45, '1 plate'],
    ['Sausage & mash with gravy', 'home', '🌭', 450, 700, 25, 55, 42, '1 plate'],
    ['Fish fingers, chips & beans', 'home', '🐟', 450, 700, 25, 90, 26, '4 fish fingers'],
    ['Jacket potato with beans & cheese', 'home', '🥔', 450, 600, 25, 85, 18, '1 potato'],
    ['Mac & cheese', 'home', '🧀', 350, 600, 24, 60, 28, '1 bowl'],
    ['Tuna pasta bake', 'home', '🍝', 400, 600, 35, 65, 20, '1 portion'],
    ['Chicken Caesar salad', 'home', '🥗', 300, 450, 35, 15, 28, '1 bowl'],
    ['Ham & cheese sandwich', 'home', '🥪', 180, 450, 25, 40, 20, '1 sandwich'],
    ['Full English breakfast', 'breakfast', '🍳', 450, 900, 45, 60, 52, '2 sausage, 2 bacon, egg, beans, toast, hash brown'],
    ['Bacon sandwich', 'breakfast', '🥓', 150, 420, 22, 40, 18, '1 sandwich'],
    ['Beans on toast', 'breakfast', '🍞', 300, 450, 18, 70, 10, '2 slices'],
    ['Cheese omelette', 'breakfast', '🍳', 200, 450, 30, 2, 36, '3 eggs'],
    ['Porridge with milk', 'breakfast', '🥣', 300, 330, 14, 50, 8, '1 bowl'],
    ['Cereal with milk', 'breakfast', '🥣', 245, 270, 10, 45, 5, '45g cereal + 200ml milk'],
    ['Sausage roll (bakery)', 'bakery', '🥐', 100, 330, 9, 25, 22, '1 roll'],
    ['Steak bake (bakery)', 'bakery', '🥐', 140, 410, 13, 33, 25, '1 bake'],
    ['Meal-deal chicken sandwich', 'bakery', '🥪', 180, 380, 25, 40, 12, '1 sandwich']
  ].map(([name, cat, icon, grams, calories, protein, carbs, fat, hint]) => ({ name, cat, icon, grams, calories, protein, carbs, fat, hint }));

  const TAKEAWAY_SIZES = [
    { key: 'small', label: 'Small', mult: 0.7 },
    { key: 'regular', label: 'Regular', mult: 1 },
    { key: 'large', label: 'Large', mult: 1.4 }
  ];
  let takeawayCategory = 'all';

  function openTakeawaysModal() {
    takeawayCategory = 'all';
    $('takeaway-search-input').value = '';
    renderTakeawayChips();
    renderTakeawayList();
    $('modal-takeaways').classList.add('active');
  }

  function renderTakeawayChips() {
    const wrap = $('takeaway-category-chips');
    wrap.replaceChildren();
    [['all', 'All'], ...Object.entries(TAKEAWAY_CATEGORIES)].forEach(([key, label]) => {
      const chip = document.createElement('button');
      chip.className = 'chip-btn' + (key === takeawayCategory ? ' active' : '');
      chip.textContent = label;
      chip.onclick = () => {
        takeawayCategory = key;
        renderTakeawayChips();
        renderTakeawayList();
      };
      wrap.append(chip);
    });
  }

  function renderTakeawayList() {
    const list = $('takeaway-list-container');
    $('takeaway-detail-container').replaceChildren();
    list.style.display = '';
    $('takeaway-category-chips').style.display = 'flex';
    list.replaceChildren();

    const q = $('takeaway-search-input').value.toLowerCase().trim();
    const meals = TAKEAWAY_MEALS.filter(m => (takeawayCategory === 'all' || m.cat === takeawayCategory) && (!q || m.name.toLowerCase().includes(q)));
    if (!meals.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;padding:20px;color:var(--text-muted);';
      empty.innerHTML = `No dishes match "${esc(q)}".<br><span style="font-size:12px;color:var(--cyan);">Try 🔍 Search for a shop-bought item, or ＋ Custom Food.</span>`;
      list.append(empty);
      return;
    }

    meals.forEach(meal => {
      const item = document.createElement('div');
      item.className = 'food-lib-item';
      item.innerHTML = `
        <div style="font-size:22px;padding-right:8px;">${meal.icon}</div>
        <div style="flex:1; padding-right:8px; min-width:0;">
          <div style="font-weight:700; color:#fff; font-size:13px;">${esc(meal.name)}</div>
          <div style="font-size:11px; color:var(--text-muted);">Regular size: ${esc(meal.hint)}</div>
          <div style="font-size:11px; color:var(--cyan); font-weight:700; margin-top:2px;">${meal.calories} kcal · ${meal.protein}g P · ${meal.carbs}g C · ${meal.fat}g F</div>
        </div>
        <button class="btn btn-outline btn-sm" style="white-space:nowrap;">➕ Log</button>
      `;
      item.onclick = () => renderTakeawayDetail(meal);
      list.append(item);
    });
  }

  function renderTakeawayDetail(meal) {
    $('takeaway-list-container').style.display = 'none';
    $('takeaway-category-chips').style.display = 'none';
    const container = $('takeaway-detail-container');
    container.replaceChildren();

    let size = TAKEAWAY_SIZES[1];
    let qty = 1;

    const card = document.createElement('div');
    card.className = 'scanned-product-card';

    const back = document.createElement('button');
    back.className = 'btn btn-outline btn-sm';
    back.textContent = '← Back to list';
    back.onclick = renderTakeawayList;

    const header = document.createElement('div');
    header.style.margin = '10px 0';
    header.innerHTML = `
      <div style="font-size:15px;font-weight:800;color:#fff;">${meal.icon} ${esc(meal.name)}</div>
      <div style="font-size:12px;color:var(--text-muted);">Regular size: ${esc(meal.hint)} (about ${meal.grams}g)</div>
    `;

    const sizeGrid = document.createElement('div');
    sizeGrid.className = 'slot-select-grid';
    sizeGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    TAKEAWAY_SIZES.forEach(s => {
      const b = document.createElement('button');
      b.className = 'slot-select-btn' + (s === size ? ' active' : '');
      b.textContent = s.label;
      b.onclick = () => {
        size = s;
        sizeGrid.querySelectorAll('.slot-select-btn').forEach(x => x.classList.toggle('active', x === b));
        update();
      };
      sizeGrid.append(b);
    });

    const qtyGroup = document.createElement('div');
    qtyGroup.className = 'form-group';
    qtyGroup.style.marginTop = '10px';
    qtyGroup.innerHTML = '<label for="takeaway-qty">How many? (0.5 if you shared it)</label>';
    const qtyInput = document.createElement('input');
    qtyInput.id = 'takeaway-qty';
    qtyInput.type = 'number';
    qtyInput.inputMode = 'decimal';
    qtyInput.step = '0.5';
    qtyInput.min = '0';
    qtyInput.value = '1';
    qtyInput.oninput = () => {
      qty = Math.max(0, parseFloat(qtyInput.value) || 0);
      update();
    };
    qtyGroup.append(qtyInput);

    const macroGrid = document.createElement('div');
    macroGrid.className = 'macro-pill-grid';
    const grams = () => meal.grams * size.mult * qty;
    function update() {
      const mult = size.mult * qty;
      macroGrid.innerHTML = `
        <div class="macro-pill"><div class="macro-pill-val cyan">${Math.round(meal.calories * mult)}</div><div class="macro-pill-lbl">Kcal</div></div>
        <div class="macro-pill"><div class="macro-pill-val purple">${+(meal.protein * mult).toFixed(1)}g</div><div class="macro-pill-lbl">Protein</div></div>
        <div class="macro-pill"><div class="macro-pill-val" style="color:#2ecc71;">${+(meal.carbs * mult).toFixed(1)}g</div><div class="macro-pill-lbl">Carbs</div></div>
        <div class="macro-pill"><div class="macro-pill-val orange">${+(meal.fat * mult).toFixed(1)}g</div><div class="macro-pill-lbl">Fats</div></div>
      `;
    }
    update();

    const slotBox = document.createElement('div');
    slotBox.style.margin = '10px 0';
    slotBox.innerHTML = `
      <div style="font-size:11.5px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">Place In Meal:</div>
      <div class="slot-select-grid">
        ${Object.keys(SLOT_NAMES).map(s => `<button class="slot-select-btn ${currentLoggingSlot === s ? 'active' : ''}" data-slot="${s}">${SLOT_NAMES[s].label}</button>`).join('')}
      </div>
    `;

    const btnLog = document.createElement('button');
    btnLog.className = 'btn btn-cyan btn-block';
    const setLogLabel = () => { btnLog.textContent = `➕ Log to ${SLOT_NAMES[currentLoggingSlot]?.name || 'Meal'}`; };
    setLogLabel();
    const slotButtons = slotBox.querySelectorAll('.slot-select-btn');
    slotButtons.forEach(btn => {
      btn.onclick = () => {
        currentLoggingSlot = btn.dataset.slot;
        slotButtons.forEach(b => b.classList.toggle('active', b === btn));
        setLogLabel();
        triggerVibrate(20);
      };
    });

    btnLog.onclick = () => {
      if (!(qty > 0)) {
        alert('Enter how many you had.');
        return;
      }
      // Stored per 100 g like every other food, so it can be re-logged from the library
      const per100 = v => +(v * 100 / meal.grams).toFixed(2);
      const food = {
        code: 'takeaway_' + meal.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        name: meal.name,
        brand: 'Takeaway & meals guide',
        serving: `${meal.grams}g`,
        servingBase: meal.grams,
        calories: +(meal.calories * 100 / meal.grams).toFixed(1),
        protein: per100(meal.protein),
        carbs: per100(meal.carbs),
        fat: per100(meal.fat),
        image: meal.icon
      };
      const label = `${qty === 1 ? '' : qty + ' × '}${size.label.toLowerCase()} (${Math.round(grams())}g)`;
      logFoodToSlot(food, grams(), currentLoggingSlot, label);
      closeModal('modal-takeaways');
      state.nutritionMode = 'pro';
      saveState();
      switchTab('nutrition');
      renderNutrition();
    };

    card.append(back, header, sizeGrid, qtyGroup, macroGrid, slotBox, btnLog);
    container.append(card);
  }

  // --- Food Library & Custom Food Loggers ---
  function openFoodLibraryModal() {
    renderFoodLibrary();
    $('modal-food-library').classList.add('active');
  }

  function renderFoodLibrary(filterQuery = '') {
    const container = $('food-library-list-container');
    if (!container) return;
    container.replaceChildren();

    const lib = state.foodLibrary || [];
    const q = filterQuery.toLowerCase().trim();

    const filtered = q ? lib.filter(f => f.name.toLowerCase().includes(q) || (f.brand && f.brand.toLowerCase().includes(q))) : lib;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.style.textAlign = 'center';
      empty.style.padding = '20px';
      empty.style.color = 'var(--text-muted)';
      empty.innerHTML = `No foods found matching "${esc(filterQuery)}".<br><span style="font-size:12px;color:var(--cyan);">Tap "＋ Create Custom Food" to add one!</span>`;
      container.append(empty);
      return;
    }

    filtered.forEach(food => {
      const item = document.createElement('div');
      item.className = 'food-lib-item';

      item.innerHTML = `
        <div style="flex:1; padding-right:8px;">
          <div style="font-weight:700; color:#fff; font-size:13px;">${esc(food.name)}</div>
          <div style="font-size:11px; color:var(--text-muted);">${esc(food.brand || '')} · ${esc(food.serving || '100g')}</div>
          <div style="font-size:11px; color:var(--cyan); font-weight:700; margin-top:2px;">
            ${food.servingUnknown
              ? `${food.calories} kcal · ${food.protein}g P · ${food.carbs}g C · ${food.fat}g F (per ${esc(food.serving)})`
              : `${food.calories} kcal · ${food.protein}g P · ${food.carbs}g C · ${food.fat}g F (per 100${food.isDrink ? 'ml' : 'g'})`}
          </div>
        </div>
        <button class="btn btn-outline btn-sm" style="white-space:nowrap;">➕ Log</button>
      `;

      item.onclick = () => {
        $('modal-food-library').classList.remove('active');
        openScannerModal();
        setViewfinderVisible(false);
        renderScannedResult(food);
      };

      container.append(item);
    });
  }

  let pendingCustomFoodCode = null;

  let customFoodIsDrink = false;
  // Nutrition is typed for one serving by default (what most people read off a label or recipe)
  let customFoodPerServing = true;

  function readCustomServing() {
    const amt = parseFloat($('custom-food-serving-amt').value) || 0;
    const unit = $('custom-food-serving-unit').value;
    const unknownWeight = unit === 'item';
    const base = unknownWeight ? 100 : amt * (PORTION_UNITS[unit] ? PORTION_UNITS[unit].base : 1);
    const baseUnit = customFoodIsDrink ? 'ml' : 'g';
    let text;
    if (unknownWeight) text = `${amt || 1} item${(amt || 1) === 1 ? '' : 's'}`;
    else if (['g', 'ml'].includes(unit)) text = `${amt} ${unit}`;
    else text = `${amt} ${PORTION_UNITS[unit].label.replace(/\s*\(.*\)/, '')} (${Math.round(base)} ${baseUnit})`;
    return { amt, unit, base, text, unknownWeight };
  }

  function updateCustomFoodLabels() {
    const sv = readCustomServing();
    // Per-100 only makes sense when the serving has a real weight/volume
    if (sv.unknownWeight) customFoodPerServing = true;
    $('custom-food-basis-100').style.display = sv.unknownWeight ? 'none' : '';
    $('custom-food-basis-100').textContent = customFoodIsDrink ? 'Per 100ml (label)' : 'Per 100g (label)';
    document.querySelectorAll('#custom-food-basis .slot-select-btn').forEach(b => b.classList.toggle('active', (b.dataset.basis === 'serving') === customFoodPerServing));
    const per = customFoodPerServing ? `serving (${sv.text})` : (customFoodIsDrink ? '100ml' : '100g');
    document.querySelectorAll('#modal-custom-food .per-unit').forEach(el => { el.textContent = per; });

    const n = parseFloat($('custom-food-servings-now').value) || 0;
    const kcal = parseFloat($('custom-food-kcal').value) || 0;
    const pro = parseFloat($('custom-food-pro').value) || 0;
    const mult = customFoodPerServing ? n : n * sv.base / 100;
    $('custom-food-preview').textContent = n > 0
      ? `Logs ${n} × ${sv.text} = ${Math.round(kcal * mult)} kcal · ${+(pro * mult).toFixed(1)}g protein`
      : 'Saves to your library without logging it today.';
  }

  function setCustomFoodKind(isDrink) {
    customFoodIsDrink = isDrink;
    document.querySelectorAll('#custom-food-kind .slot-select-btn').forEach(b => b.classList.toggle('active', (b.dataset.kind === 'drink') === isDrink));
    $('custom-food-title').textContent = isDrink ? '✍️ Create Custom Drink' : '✍️ Create Custom Food';
    $('custom-food-name-label').textContent = isDrink ? 'Drink Name' : 'Food Name';
    $('custom-food-name').placeholder = isDrink ? 'e.g. Protein shake with semi-skimmed milk' : "e.g. Grandma's High-Protein Beef Stew";
    const sel = $('custom-food-serving-unit');
    sel.replaceChildren();
    (isDrink ? DRINK_UNIT_ORDER : FOOD_UNIT_ORDER.concat('item')).filter(k => k !== 'serving').forEach(k => sel.add(new Option(PORTION_UNITS[k].label, k)));
    sel.value = isDrink ? 'ml' : 'g';
    $('custom-food-serving-amt').value = isDrink ? 250 : 100;
    updateCustomFoodLabels();
  }

  function openCustomFoodModal(prefill = {}) {
    pendingCustomFoodCode = prefill.code || null;
    $('modal-custom-food').classList.add('active');
    $('custom-food-name').value = prefill.name || '';
    $('btn-save-custom-food').textContent = planningMeals() ? 'Save & Plan Food' : 'Save & Log Food';
    $('custom-food-brand').value = '';
    customFoodPerServing = true;
    $('custom-food-servings-now').value = 1;
    setCustomFoodKind(!!prefill.isDrink);
    document.querySelectorAll('#custom-food-basis .slot-select-btn').forEach(b => {
      b.onclick = () => {
        customFoodPerServing = b.dataset.basis === 'serving';
        updateCustomFoodLabels();
      };
    });
    ['custom-food-serving-amt', 'custom-food-servings-now', 'custom-food-kcal', 'custom-food-pro'].forEach(id => { $(id).oninput = updateCustomFoodLabels; });
    $('custom-food-serving-unit').onchange = () => {
      if ($('custom-food-serving-unit').value === 'item') $('custom-food-serving-amt').value = 1;
      updateCustomFoodLabels();
    };
    document.querySelectorAll('#custom-food-kind .slot-select-btn').forEach(b => {
      b.onclick = () => setCustomFoodKind(b.dataset.kind === 'drink');
    });
    $('custom-food-kcal').value = '';
    $('custom-food-pro').value = '';
    $('custom-food-carb').value = '';
    $('custom-food-fat').value = '';

    document.querySelectorAll('#custom-food-slot-selector .slot-select-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.slot === currentLoggingSlot);
      btn.onclick = () => {
        currentLoggingSlot = btn.dataset.slot;
        document.querySelectorAll('#custom-food-slot-selector .slot-select-btn').forEach(b => b.classList.toggle('active', b === btn));
      };
    });
  }

  if ($('btn-save-custom-food')) {
    $('btn-save-custom-food').onclick = () => {
      const name = $('custom-food-name').value.trim();
      if (!name) {
        alert('Please enter a food name.');
        return;
      }

      const brand = $('custom-food-brand').value.trim() || 'Custom';
      const sv = readCustomServing();
      if (!(sv.base > 0)) {
        alert('Enter the size of one serving.');
        return;
      }
      const servingBase = sv.base;
      const serving = sv.text;
      // Everything is stored per 100 g/ml; per-serving values are scaled to that
      const toPer100 = customFoodPerServing ? 100 / servingBase : 1;
      const per100 = id => +((parseFloat($(id).value) || 0) * toPer100).toFixed(2);
      const kcal = Math.round(per100('custom-food-kcal'));
      const pro = per100('custom-food-pro');
      const carb = per100('custom-food-carb');
      const fat = per100('custom-food-fat');
      const servingsNow = parseFloat($('custom-food-servings-now').value) || 0;

      const newFood = {
        code: pendingCustomFoodCode || ('custom_' + Date.now()),
        name,
        brand,
        serving,
        servingBase,
        servingUnknown: sv.unknownWeight,
        isDrink: customFoodIsDrink,
        calories: kcal,
        protein: pro,
        carbs: carb,
        sugars: 0,
        fat: fat,
        satFat: 0,
        fiber: 0,
        salt: 0,
        nutriScore: 'A',
        image: customFoodIsDrink ? '🥤' : '🍽️'
      };

      if (!state.foodLibrary) state.foodLibrary = [];
      state.foodLibrary = state.foodLibrary.filter(f => !(pendingCustomFoodCode && f.code === pendingCustomFoodCode));
      state.foodLibrary.unshift(newFood);
      pendingCustomFoodCode = null;

      if (servingsNow > 0) {
        const label = servingsNow === 1 ? serving : `${servingsNow} × ${serving}`;
        logFoodToSlot(newFood, servingBase * servingsNow, currentLoggingSlot, label);
      } else {
        saveState();
        renderNutrition();
      }

      $('modal-custom-food').classList.remove('active');
      showToast(servingsNow > 0 ? `Saved and logged ${name}!` : `Saved ${name} to your library`);
    };
  }

  // --- Custom Meal Builder: each ingredient uses its own per-100g label values. ---
  let mealDraft = null;
  let pendingMealIngredientId = null;
  let ingredientSequence = 0;

  function nutritionProfileHtml(values) {
    return `<div class="nutrition-profile">${MEAL_NUTRIENTS.map(([key, label, unit]) => `<div><span>${label}</span><strong>${values[key] == null ? 'Unknown' : Number(values[key].toFixed(2)) + ' ' + unit}</strong></div>`).join('')}</div>`;
  }

  function openMealBuilder() {
    pendingMealIngredientId = null;
    if (!mealDraft) {
      mealDraft = { name: '', ingredients: [] };
      addMealIngredient();
    }
    $('meal-builder-name').value = mealDraft.name;
    renderMealIngredients();
    openModal('modal-meal-builder');
  }

  function addMealIngredient() {
    mealDraft.ingredients.push({ id: 'ingredient_' + (++ingredientSequence), grams: 100, food: { name: '' } });
    renderMealIngredients();
  }

  function updateMealTotals() {
    const { weight, totals } = mealTotals(mealDraft.ingredients);
    $('meal-builder-weight').textContent = `${Number(weight.toFixed(2))}g total`;
    $('meal-builder-totals').innerHTML = nutritionProfileHtml(totals);
  }

  function renderMealIngredients() {
    const box = $('meal-builder-ingredients');
    box.replaceChildren();
    mealDraft.ingredients.forEach((ingredient, index) => {
      const block = document.createElement('div');
      block.className = 'card meal-ingredient';
      block.innerHTML = `
        <div class="card-title-row"><strong>Ingredient ${index + 1}</strong><button class="btn btn-outline btn-sm ingredient-delete" aria-label="Delete ingredient ${index + 1}">Delete</button></div>
        <div class="form-group"><label for="${ingredient.id}_name">Ingredient Name</label><input id="${ingredient.id}_name" class="ingredient-name" type="text" value="${esc(ingredient.food.name)}" placeholder="Enter manually or scan a barcode"></div>
        <button class="btn btn-outline btn-sm ingredient-scan">Scan Barcode / Search</button>
        <div class="form-group"><label for="${ingredient.id}_grams">Amount (grams)</label><input id="${ingredient.id}_grams" class="ingredient-grams" type="number" min="0.01" step="any" inputmode="decimal" value="${esc(ingredient.grams)}"></div>
        <details><summary>Nutrition per 100g · enter or edit label values</summary><div class="form-grid ingredient-nutrients">${MEAL_NUTRIENTS.map(([key, label, unit]) => `<div class="form-group"><label for="${ingredient.id}_${key}">${label} (${unit})</label><input id="${ingredient.id}_${key}" data-nutrient="${key}" type="number" inputmode="decimal" step="any" min="0" placeholder="Unknown" value="${esc(window.GhostyLogic.nutrientValue(ingredient.food, key) ?? '')}"></div>`).join('')}</div></details>`;
      block.querySelector('.ingredient-name').oninput = event => { ingredient.food.name = event.target.value; };
      block.querySelector('.ingredient-grams').oninput = event => { ingredient.grams = event.target.value; updateMealTotals(); };
      block.querySelectorAll('[data-nutrient]').forEach(input => {
        input.oninput = () => {
          ingredient.food[input.dataset.nutrient] = input.value === '' ? null : Number(input.value);
          if (input.dataset.nutrient === 'sodium') delete ingredient.food.salt;
          updateMealTotals();
        };
      });
      block.querySelector('.ingredient-delete').onclick = () => {
        mealDraft.ingredients = mealDraft.ingredients.filter(i => i.id !== ingredient.id);
        renderMealIngredients();
      };
      block.querySelector('.ingredient-scan').onclick = () => { pendingMealIngredientId = ingredient.id; scanBarcode(); };
      box.append(block);
    });
    updateMealTotals();
  }

  function saveCustomMeal() {
    mealDraft.name = $('meal-builder-name').value.trim();
    if (!mealDraft.name) { showToast('Enter a Meal Name.'); return; }
    if (!mealDraft.ingredients.length) { showToast('Add at least one ingredient.'); return; }
    for (const ingredient of mealDraft.ingredients) {
      if (!ingredient.food.name.trim() || !Number.isFinite(Number(ingredient.grams)) || Number(ingredient.grams) <= 0) {
        showToast('Each ingredient needs a name and a weight above zero.'); return;
      }
      for (const key of ['calories', 'protein', 'carbs', 'fat']) {
        if (window.GhostyLogic.nutrientValue(ingredient.food, key) == null) {
          showToast('Enter calories, protein, carbs and fats per 100g for every ingredient (use 0 if none).'); return;
        }
      }
      if (MEAL_NUTRIENTS.some(([key]) => ingredient.food[key] != null && (!Number.isFinite(Number(ingredient.food[key])) || Number(ingredient.food[key]) < 0))) {
        showToast('Nutrition values must be zero or greater.'); return;
      }
    }
    const { weight, totals } = mealTotals(mealDraft.ingredients);
    const per100 = Object.fromEntries(MEAL_NUTRIENTS.map(([key]) => [key, totals[key] == null ? null : totals[key] * 100 / weight]));
    const recipe = { ...per100, code: 'recipe_' + Date.now(), name: mealDraft.name, brand: 'Custom Meal',
      isRecipe: true, isDrink: false, totalWeight: weight, totals,
      serving: `${Number(weight.toFixed(2))}g whole recipe`, servingBase: weight,
      ingredients: JSON.parse(JSON.stringify(mealDraft.ingredients)), image: '🍲' };
    state.foodLibrary.unshift(recipe);
    saveState();
    mealDraft = null;
    closeModal('modal-meal-builder');
    renderNutrition();
    openFoodLibraryModal();
    showToast('Meal saved. Choose it from your library to log any serving in grams.');
  }

  // --- Step Tracker Engine ---
  function getStepDistance(steps) {
    const heightCm = state.profile.height || 165.1;
    const strideMeters = (heightCm * 0.414) / 100;
    const km = (steps * strideMeters) / 1000;
    return {
      km: parseFloat(km.toFixed(2)),
      miles: parseFloat((km * 0.621371).toFixed(2))
    };
  }

  function getStepCalories(steps) {
    const weightKg = toKg(state.profile.weight, state.profile.unit) || 66;
    const burn = steps * 0.04 * (weightKg / 70);
    return Math.round(burn);
  }

  function getStepActiveTime(steps) {
    return Math.round(steps / 105);
  }

  function updateSteps(steps, shouldSave = true, fromNative = false) {
    const today = getTodayString();
    const rolledOver = state.lastStepDate !== today;
    if (rolledOver) {
      if (state.stepsToday > 0) {
        state.stepLogs = state.stepLogs.filter(l => l.date !== state.lastStepDate);
        state.stepLogs.unshift({
          date: state.lastStepDate,
          steps: state.stepsToday,
          goal: state.stepGoal,
          distanceKm: getStepDistance(state.stepsToday).km,
          calories: getStepCalories(state.stepsToday)
        });
        if (state.stepLogs.length > 30) state.stepLogs.pop();
      }
      state.stepsToday = 0;
      state.lastStepDate = today;
    }

    const next = Math.max(0, steps);
    // Native pushes every 3s; skip redundant saves/redraws when nothing changed
    if (fromNative && !rolledOver && next === state.stepsToday) return;
    state.stepsToday = next;

    // Manual edits must reach the native counter, otherwise its next 3s sync overwrites them
    if (!fromNative && window.AndroidApp && typeof window.AndroidApp.setTodayNativeSteps === 'function') {
      window.AndroidApp.setTodayNativeSteps(state.stepsToday);
    }
    if (shouldSave) saveState();
    renderStepTracker();
  }

  function addSteps(amount) {
    updateSteps(state.stepsToday + amount);
    triggerVibrate(30);
    showToast(`Added +${amount} steps!`);
  }

  window.onNativeStepUpdate = function(nativeSteps) {
    if (typeof nativeSteps === 'number') {
      if (rolloverIfNewDay()) renderDailyChecklists();
      updateSteps(nativeSteps, true, true);
    }
  };

  const hasNativeStepSync = () => !!(window.AndroidApp && typeof window.AndroidApp.syncSteps === 'function');

  function isStepCountingPaused() {
    if (window.AndroidApp && typeof window.AndroidApp.isStepsPaused === 'function') return !!window.AndroidApp.isStepsPaused();
    return !!state.stepsPaused;
  }

  // Native reports back here after Sync / Pause / Start, once it has read the hardware counter
  let pendingStepAction = null;
  let stepSyncTimer = null;
  window.onNativeStepSync = function(nativeSteps, status, paused) {
    clearTimeout(stepSyncTimer);
    const action = pendingStepAction;
    pendingStepAction = null;
    if (typeof nativeSteps === 'number') {
      if (rolloverIfNewDay()) renderDailyChecklists();
      updateSteps(nativeSteps, true, true);
    }
    renderStepTracker();
    if (!action) return;
    if (status === 'permission') {
      showToast('Allow "Physical activity" for Ghosty Gains so it can count your steps.');
    } else if (action === 'pause') {
      showToast(`Step counting paused at ${fmt(state.stepsToday)} steps.`);
    } else if (action === 'start') {
      showToast('Step counting started.');
    } else if (status === 'no_reading') {
      showToast(`Step sensor didn't answer. Showing ${fmt(state.stepsToday)} steps, try again in a moment.`);
    } else {
      showToast(paused ? `Synced: ${fmt(state.stepsToday)} steps (counting is paused).` : `Synced: ${fmt(state.stepsToday)} steps today.`);
    }
  };

  function runNativeStepAction(action, call) {
    pendingStepAction = action;
    ['btn-sync-steps', 'btn-toggle-step-pause'].forEach(id => { if ($(id)) $(id).disabled = true; });
    // Re-enable even if the phone never calls back
    clearTimeout(stepSyncTimer);
    stepSyncTimer = setTimeout(() => {
      pendingStepAction = null;
      renderStepTracker();
    }, 6000);
    call();
  }

  function toggleStepPause() {
    const pause = !isStepCountingPaused();
    triggerVibrate(30);
    if (window.AndroidApp && typeof window.AndroidApp.setStepsPaused === 'function') {
      runNativeStepAction(pause ? 'pause' : 'start', () => window.AndroidApp.setStepsPaused(pause));
      return;
    }
    state.stepsPaused = pause;
    saveState();
    renderStepTracker();
    showToast(pause ? 'Step counting paused.' : 'Step counting started.');
  }

  function syncStepsWithSensor() {
    if (hasNativeStepSync()) {
      runNativeStepAction('sync', () => window.AndroidApp.syncSteps());
      return;
    }
    // Older app builds: read the cached count without pushing it back (that reset the sensor link)
    if (window.AndroidApp && typeof window.AndroidApp.getTodayNativeSteps === 'function') {
      const nativeSteps = window.AndroidApp.getTodayNativeSteps();
      if (typeof nativeSteps === 'number') {
        updateSteps(nativeSteps, true, true);
        showToast(`Synced: ${fmt(state.stepsToday)} steps today.`);
        return;
      }
    }
    showToast('No phone step sensor here. Log steps with the buttons below.');
  }

  function renderStepTracker() {
    const steps = state.stepsToday || 0;
    const goal = state.stepGoal || 10000;
    const dist = getStepDistance(steps);
    const kcal = getStepCalories(steps);
    const timeMins = getStepActiveTime(steps);

    $('step-count-display').textContent = fmt(steps);
    $('step-goal-display').textContent = `Goal: ${fmt(goal)}`;
    $('step-distance-display').textContent = `${dist.km} km`;
    $('step-miles-display').textContent = `${dist.miles} mi`;
    $('step-calories-display').textContent = `${kcal} kcal`;
    $('step-time-display').textContent = `${timeMins} min`;

    // SVG Circular Progress Ring
    const circle = $('steps-circle-bar');
    if (circle) {
      const radius = 76;
      const circumference = 2 * Math.PI * radius; // ~477.5
      const pct = Math.min(1, steps / goal);
      const offset = circumference - (pct * circumference);
      circle.style.strokeDashoffset = offset;
    }

    // Pause / Start button
    const paused = isStepCountingPaused();
    const pauseBtn = $('btn-toggle-step-pause');
    if (pauseBtn) {
      pauseBtn.textContent = paused ? '▶ Start Counting' : '⏸ Pause Counting';
      pauseBtn.className = `btn btn-sm ${paused ? 'btn-cyan' : 'btn-outline'}`;
      pauseBtn.disabled = !!pendingStepAction;
    }
    if ($('btn-sync-steps')) $('btn-sync-steps').disabled = !!pendingStepAction;
    if (paused) $('step-goal-display').textContent = '⏸ Paused';

    // Hardware Sensor Status Text
    const statusText = $('pedometer-status-text');
    const inVehicle = !!(window.AndroidApp && typeof window.AndroidApp.isInVehicle === 'function' && window.AndroidApp.isInVehicle());
    if ($('btn-clear-vehicle')) $('btn-clear-vehicle').style.display = inVehicle && typeof window.AndroidApp.clearVehicleDetection === 'function' ? 'block' : 'none';
    if (statusText) {
      const needsPermission = window.AndroidApp && typeof window.AndroidApp.hasActivityPermission === 'function' &&
        !window.AndroidApp.hasActivityPermission() && typeof window.AndroidApp.getSensorType === 'function' &&
        window.AndroidApp.getSensorType() !== 'Motion Accelerometer';
      if (paused) {
        statusText.textContent = '⏸ Step counting is paused. Steps you take now won\'t be added. Tap ▶ Start Counting to carry on.';
      } else if (needsPermission) {
        statusText.textContent = '⚠️ Steps can\'t be counted: allow "Physical activity" for Ghosty Gains in your phone settings, then tap 🔄 Sync.';
      } else if (window.AndroidApp && typeof window.AndroidApp.hasStepSensor === 'function' && window.AndroidApp.hasStepSensor()) {
        const type = typeof window.AndroidApp.getSensorType === 'function' ? window.AndroidApp.getSensorType() : 'Pedometer';
        statusText.textContent = inVehicle
          ? '🚗 Vehicle motion detected. Steps resume when walking is detected. If this is wrong, tap below.'
          : `${type} connected. Steps taken while driving or riding in a vehicle are ignored.`;
      } else if (window.AndroidApp) {
        statusText.textContent = 'No step sensor on this phone — log steps manually with the buttons above.';
      } else {
        statusText.textContent = 'Preview mode (no phone sensor) — log steps manually.';
      }
    }

    renderStepChart();
  }

  function renderStepChart() {
    const svg = $('steps-chart-svg');
    if (!svg) return;

    // Build 7-day data
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = localDateStr(d);
      const dayLabel = d.toLocaleDateString('en-GB', { weekday: 'short' });
      
      let stepVal = 0;
      if (i === 0) {
        stepVal = state.stepsToday || 0;
      } else {
        const found = state.stepLogs.find(l => l.date === dateStr);
        stepVal = found ? found.steps : 0;
      }
      days.push({ dateStr, dayLabel, steps: stepVal });
    }

    const maxSteps = Math.max(state.stepGoal, ...days.map(d => d.steps), 12000);
    const avg = Math.round(days.reduce((s, x) => s + x.steps, 0) / 7);
    $('step-weekly-avg').textContent = `Avg: ${fmt(avg)} / day`;

    const svgWidth = 400;
    const svgHeight = 160;
    const barWidth = 32;
    const gap = (svgWidth - (barWidth * 7)) / 8;

    let elements = `
      <line x1="0" y1="${svgHeight - 30 - ((state.stepGoal / maxSteps) * (svgHeight - 50))}" x2="${svgWidth}" y2="${svgHeight - 30 - ((state.stepGoal / maxSteps) * (svgHeight - 50))}" stroke="rgba(0, 200, 255, 0.4)" stroke-dasharray="4,4" stroke-width="1.5" />
    `;

    days.forEach((d, i) => {
      const x = gap + i * (barWidth + gap);
      const barH = Math.max(4, (d.steps / maxSteps) * (svgHeight - 50));
      const y = svgHeight - 30 - barH;
      const isMet = d.steps >= state.stepGoal;
      const color = isMet ? '#2ecc71' : (i === 6 ? '#00c8ff' : '#c586f0');

      elements += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="6" fill="${color}" opacity="${i === 6 ? 1 : 0.85}" />
        <text x="${x + barWidth / 2}" y="${svgHeight - 12}" fill="#a4a4ba" font-size="11" text-anchor="middle">${d.dayLabel}</text>
        <text x="${x + barWidth / 2}" y="${Math.max(14, y - 4)}" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">${d.steps > 0 ? (d.steps >= 1000 ? (d.steps / 1000).toFixed(1) + 'k' : d.steps) : '0'}</text>
      `;
    });

    svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
    svg.innerHTML = elements;
  }

  // --- Sleep & Recovery Coach Engine ---
  let selectedSleepQuality = 4;

  function calculateSleepDuration(bedtime, waketime) {
    if (!bedtime || !waketime) return 8.0;
    const [bH, bM] = bedtime.split(':').map(Number);
    const [wH, wM] = waketime.split(':').map(Number);

    let bedMinutes = bH * 60 + bM;
    let wakeMinutes = wH * 60 + wM;

    if (wakeMinutes <= bedMinutes) {
      wakeMinutes += 24 * 60; // crossed midnight
    }

    const totalMinutes = wakeMinutes - bedMinutes;
    return parseFloat((totalMinutes / 60).toFixed(2));
  }

  function calculateRecoveryScore(durationHours, qualityRating, hygieneCheckedCount) {
    // Duration factor (up to 60 points, 8h = 60 pts)
    const durPts = Math.min(60, (durationHours / 8.0) * 60);
    // Quality factor (up to 25 points, 5 stars = 25 pts)
    const qualPts = (qualityRating / 5.0) * 25;
    // Hygiene factor (up to 15 points, 5 items = 15 pts)
    const hygPts = (hygieneCheckedCount / 5.0) * 15;

    return Math.min(100, Math.round(durPts + qualPts + hygPts));
  }

  function renderSleepTracker() {
    const lastLog = state.sleepLogs[0];
    const duration = lastLog ? lastLog.durationHours : 8.0;
    const quality = lastLog ? lastLog.quality : 4;
    const hygieneDone = state.sleepHygiene.filter(h => h.checked).length;
    const recoveryScore = lastLog ? lastLog.recoveryScore : calculateRecoveryScore(duration, quality, hygieneDone);

    // Update Recovery Badge & Status Text
    const badge = $('recovery-score-badge');
    const scoreNum = $('recovery-score-num');
    const title = $('recovery-status-title');
    const desc = $('recovery-status-desc');

    if (scoreNum) scoreNum.textContent = recoveryScore + '%';

    if (recoveryScore >= 85) {
      if (badge) badge.style.borderColor = '#2ecc71';
      if (title) { title.textContent = '🟢 Optimal Hypertrophy Readiness'; title.style.color = '#2ecc71'; }
      if (desc) desc.textContent = 'CNS fully restored. High neuromuscular output ready for progressive overload, heavy compounds, and hypertrophy volume!';
    } else if (recoveryScore >= 70) {
      if (badge) badge.style.borderColor = '#00c8ff';
      if (title) { title.textContent = '🔵 Good Muscle Recovery'; title.style.color = '#00c8ff'; }
      if (desc) desc.textContent = 'Solid capacity for standard workout routines. Focus on clean form and steady RPE 7-8 intensity.';
    } else if (recoveryScore >= 55) {
      if (badge) badge.style.borderColor = '#ffa502';
      if (title) { title.textContent = '🟡 Moderate Recovery State'; title.style.color = '#ffa502'; }
      if (desc) desc.textContent = 'Some residual neural fatigue. Keep reps 2-3 in reserve, stay hydrated, and ensure high protein post-workout.';
    } else {
      if (badge) badge.style.borderColor = '#ff4757';
      if (title) { title.textContent = '🔴 High Fatigue / Deload Advice'; title.style.color = '#ff4757'; }
      if (desc) desc.textContent = 'Under-recovered. Recommended to prioritize joint mobility, active recovery walks, or a lighter deload session today.';
    }

    const hours = Math.floor(duration);
    const mins = Math.round((duration - hours) * 60);
    $('sleep-hours-stat').textContent = `${hours}h ${mins.toString().padStart(2, '0')}m`;
    $('sleep-target-stat').textContent = `${(state.sleepTarget || 8.0).toFixed(1)} h`;

    // Sleep debt over the last 7 calendar days: logged nights vs target, with naps paying some back
    const target = state.sleepTarget || 8.0;
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    const since = localDateStr(weekAgo);
    const nights = state.sleepLogs.filter(l => l.date >= since);
    const napHours = (state.napLogs || []).filter(n => n.date >= since).reduce((s, n) => s + n.minutes / 60, 0);
    let debt = 0;
    if (nights.length > 0 || napHours > 0) {
      const totalSleep = nights.reduce((s, x) => s + x.durationHours, 0) + napHours;
      debt = parseFloat((totalSleep - nights.length * target).toFixed(1));
    }
    const debtStat = $('sleep-debt-stat');
    if (debtStat) {
      debtStat.textContent = debt >= 0 ? `+${debt}h ahead` : `${debt}h debt`;
      debtStat.style.color = debt >= 0 ? '#2ecc71' : '#ff4757';
    }

    renderSleepHygiene();
    renderSleepChart();
    renderNapList();
  }

  function renderNapList() {
    const box = $('nap-list');
    if (!box) return;
    box.replaceChildren();
    const today = getTodayString();
    (state.napLogs || []).filter(n => n.date === today).forEach(n => {
      const row = document.createElement('div');
      row.className = 'log-item';
      const t = document.createElement('span');
      t.textContent = `😴 Nap today: ${n.minutes >= 60 ? (n.minutes / 60) + ' h' : n.minutes + ' min'}`;
      const del = document.createElement('button');
      del.className = 'btn btn-outline btn-sm';
      del.textContent = 'Remove';
      del.onclick = () => {
        state.napLogs = state.napLogs.filter(x => x.id !== n.id);
        saveState();
        renderSleepTracker();
      };
      row.append(t, del);
      box.append(row);
    });
  }

  // Day/month/year dropdowns that write "YYYY-MM-DD" into a hidden input (no future dates).
  // Call again after changing the hidden value in code to refresh the dropdowns.
  function syncDateSelects() {
    document.querySelectorAll('.time-select[data-date-for]').forEach(wrap => {
      const hidden = $(wrap.dataset.dateFor);
      if (!hidden) return;
      if (!hidden.value) hidden.value = getTodayString();
      if (!wrap.childElementCount) {
        const ds = document.createElement('select');
        ds.id = wrap.dataset.dateFor + '-d';
        ds.setAttribute('aria-label', 'Day');
        for (let d = 1; d <= 31; d++) ds.add(new Option(d, d));
        const ms = document.createElement('select');
        ms.setAttribute('aria-label', 'Month');
        ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].forEach((m, i) => ms.add(new Option(m, i + 1)));
        const ys = document.createElement('select');
        ys.setAttribute('aria-label', 'Year');
        const thisYear = new Date().getFullYear();
        for (let y = thisYear; y >= thisYear - 4; y--) ys.add(new Option(y, y));
        const sync = () => {
          const y = +ys.value, m = +ms.value;
          const maxDay = new Date(y, m, 0).getDate();
          if (+ds.value > maxDay) ds.value = maxDay;
          let v = `${y}-${String(m).padStart(2, '0')}-${String(ds.value).padStart(2, '0')}`;
          if (v > getTodayString()) v = getTodayString();
          hidden.value = v;
          if (v !== `${y}-${String(m).padStart(2, '0')}-${String(ds.value).padStart(2, '0')}`) syncDateSelects();
        };
        [ds, ms, ys].forEach(sel => { sel.onchange = sync; });
        wrap.append(ds, ms, ys);
      }
      const [y, m, d] = hidden.value.split('-').map(Number);
      const [ds, ms, ys] = wrap.querySelectorAll('select');
      ys.value = y;
      ms.value = m;
      ds.value = d;
    });
  }

  // Hour/minute dropdowns that write "HH:MM" into a hidden input
  function buildTimeSelects() {
    document.querySelectorAll('.time-select[data-time-for]').forEach(wrap => {
      const hidden = $(wrap.dataset.timeFor);
      if (!hidden || wrap.childElementCount) return;
      const [h0, m0] = (hidden.value || '00:00').split(':').map(Number);
      const hs = document.createElement('select');
      hs.id = wrap.dataset.timeFor + '-h';
      hs.setAttribute('aria-label', 'Hour');
      for (let h = 0; h < 24; h++) hs.add(new Option(String(h).padStart(2, '0'), h));
      const ms = document.createElement('select');
      ms.setAttribute('aria-label', 'Minute');
      for (let m = 0; m < 60; m += 5) ms.add(new Option(String(m).padStart(2, '0'), m));
      hs.value = h0;
      ms.value = Math.round(m0 / 5) * 5 % 60;
      const sync = () => { hidden.value = `${String(hs.value).padStart(2, '0')}:${String(ms.value).padStart(2, '0')}`; };
      hs.onchange = sync;
      ms.onchange = sync;
      const colon = document.createElement('span');
      colon.textContent = ':';
      wrap.append(hs, colon, ms);
    });
  }

  function renderSleepHygiene() {
    const container = $('sleep-hygiene-container');
    if (!container) return;
    container.replaceChildren();

    state.sleepHygiene.forEach(item => {
      const div = document.createElement('div');
      div.className = 'sleep-hygiene-item' + (item.checked ? ' done' : '');

      const text = document.createElement('span');
      text.textContent = item.text;

      const check = document.createElement('div');
      check.className = 'checkbox-custom' + (item.checked ? ' checked' : '');
      check.innerHTML = item.checked ? '✓' : '';
      check.onclick = () => {
        item.checked = !item.checked;
        saveState();
        triggerVibrate(20);
        renderSleepTracker();
      };

      div.append(text, check);
      container.append(div);
    });
  }

  function renderSleepChart() {
    const svg = $('sleep-chart-svg');
    if (!svg) return;

    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = localDateStr(d);
      const dayLabel = d.toLocaleDateString('en-GB', { weekday: 'short' });
      const found = state.sleepLogs.find(l => l.date === dateStr);
      const nap = (state.napLogs || []).filter(n => n.date === dateStr).reduce((s, n) => s + n.minutes / 60, 0);
      // Nights without a log stay empty instead of pretending to be 8h
      days.push({
        dayLabel,
        hours: (found ? found.durationHours : 0) + nap,
        logged: !!found || nap > 0
      });
    }

    const svgWidth = 400;
    const svgHeight = 160;
    const barWidth = 32;
    const gap = (svgWidth - (barWidth * 7)) / 8;
    const targetH = state.sleepTarget || 8.0;

    let elements = `
      <line x1="0" y1="${svgHeight - 30 - ((targetH / 10.0) * (svgHeight - 50))}" x2="${svgWidth}" y2="${svgHeight - 30 - ((targetH / 10.0) * (svgHeight - 50))}" stroke="rgba(197, 134, 240, 0.4)" stroke-dasharray="4,4" stroke-width="1.5" />
    `;

    days.forEach((d, i) => {
      const x = gap + i * (barWidth + gap);
      const barH = d.logged ? Math.max(6, (Math.min(d.hours, 12) / 10.0) * (svgHeight - 50)) : 4;
      const y = svgHeight - 30 - barH;
      const color = !d.logged ? 'rgba(164,164,186,0.3)' : d.hours >= targetH ? '#00c8ff' : '#c586f0';
      const label = d.logged ? `${parseFloat(d.hours.toFixed(1))}h` : '–';

      elements += `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${barH}" rx="6" fill="${color}" opacity="${i === 6 ? 1 : 0.85}" />
        <text x="${x + barWidth / 2}" y="${svgHeight - 12}" fill="#a4a4ba" font-size="11" text-anchor="middle">${d.dayLabel}</text>
        <text x="${x + barWidth / 2}" y="${Math.max(14, y - 4)}" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">${label}</text>
      `;
    });

    svg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
    svg.innerHTML = elements;
  }

  function bindScannerAndTrackers() {
    // Barcode scanner trigger buttons
    if ($('btn-open-scanner')) $('btn-open-scanner').onclick = scanBarcode;
    if ($('btn-open-scanner-manual')) {
      $('btn-open-scanner-manual').onclick = () => {
        stopCameraStream();
        openScannerModal();
        setViewfinderVisible(false);
        $('manual-barcode-input').focus();
      };
    }
    if ($('btn-close-scanner')) $('btn-close-scanner').onclick = stopBarcodeScanner;
    if ($('btn-toggle-camera')) $('btn-toggle-camera').onclick = toggleCameraFacing;
    if ($('btn-toggle-torch')) $('btn-toggle-torch').onclick = toggleTorch;

    // Photo Snap / Upload Fallback
    const snapInput = $('barcode-file-snap');
    const snapPhoto = () => {
      if (window.AndroidApp && typeof window.AndroidApp.scanBarcodeFromPhoto === 'function') {
        stopCameraStream();
        window.AndroidApp.scanBarcodeFromPhoto('camera');
      } else if (snapInput) {
        snapInput.click();
      }
    };
    if ($('btn-snap-photo-barcode')) $('btn-snap-photo-barcode').onclick = snapPhoto;
    if ($('btn-modal-snap-photo')) $('btn-modal-snap-photo').onclick = snapPhoto;
    if (snapInput) {
      snapInput.onchange = e => {
        if (e.target.files && e.target.files[0]) {
          handleBarcodePhotoFile(e.target.files[0]);
        }
        // Allow picking the same photo again
        e.target.value = '';
      };
    }

    // Takeaways & home meals guide
    if ($('btn-open-takeaways')) $('btn-open-takeaways').onclick = openTakeawaysModal;
    if ($('btn-close-takeaways')) $('btn-close-takeaways').onclick = () => closeModal('modal-takeaways');
    if ($('takeaway-search-input')) $('takeaway-search-input').oninput = renderTakeawayList;

    if ($('btn-lookup-barcode')) {
      $('btn-lookup-barcode').onclick = () => {
        lookupBarcode($('manual-barcode-input').value);
      };
    }
    if ($('manual-barcode-input')) {
      $('manual-barcode-input').onkeydown = e => {
        if (e.key === 'Enter') lookupBarcode($('manual-barcode-input').value);
      };
    }

    if ($('btn-view-scanned-history')) {
      $('btn-view-scanned-history').onclick = () => {
        openFoodLibraryModal();
      };
    }

    // Step Quick Chips
    document.querySelectorAll('[data-add-steps]').forEach(btn => {
      btn.onclick = () => {
        const amount = parseInt(btn.dataset.addSteps, 10);
        if (amount) addSteps(amount);
      };
    });

    if ($('btn-sync-steps')) $('btn-sync-steps').onclick = syncStepsWithSensor;
    if ($('btn-toggle-step-pause')) $('btn-toggle-step-pause').onclick = toggleStepPause;

    if ($('btn-edit-step-goal')) {
      $('btn-edit-step-goal').onclick = () => {
        $('input-step-goal').value = state.stepGoal || 10000;
        $('modal-step-goal').classList.add('active');
      };
    }

    if ($('btn-save-step-goal')) {
      $('btn-save-step-goal').onclick = () => {
        const val = parseInt($('input-step-goal').value, 10);
        if (val && val >= 1000) {
          state.stepGoal = val;
          saveState();
          renderStepTracker();
          $('modal-step-goal').classList.remove('active');
          showToast(`Step goal updated to ${fmt(val)}!`);
        }
      };
    }

    if ($('btn-custom-steps')) {
      $('btn-custom-steps').onclick = () => {
        $('input-custom-steps').value = 1000;
        $('modal-custom-steps').classList.add('active');
      };
    }

    if ($('btn-add-custom-steps')) {
      $('btn-add-custom-steps').onclick = () => {
        const val = parseInt($('input-custom-steps').value, 10);
        if (val) addSteps(val);
        $('modal-custom-steps').classList.remove('active');
      };
    }

    if ($('btn-set-absolute-steps')) {
      $('btn-set-absolute-steps').onclick = () => {
        const val = parseInt($('input-custom-steps').value, 10);
        if (val >= 0) {
          updateSteps(val);
          $('modal-custom-steps').classList.remove('active');
          showToast(`Steps set to ${fmt(val)}!`);
        }
      };
    }

    if ($('btn-reset-steps')) {
      $('btn-reset-steps').onclick = () => {
        if (confirm('Reset today\'s step count to 0?')) {
          updateSteps(0);
          showToast('Steps reset to 0.');
        }
      };
    }

    // Sleep Quality Star Rating
    document.querySelectorAll('#sleep-quality-stars .star-btn').forEach(btn => {
      btn.onclick = () => {
        const star = parseInt(btn.dataset.star, 10);
        selectedSleepQuality = star;
        document.querySelectorAll('#sleep-quality-stars .star-btn').forEach((b, idx) => {
          b.classList.toggle('active', idx < star);
        });
        const labels = [
          '1 Star — Terrible / Broken Sleep',
          '2 Stars — Poor / Woke Up Tired',
          '3 Stars — Okay / Average Sleep',
          '4 Stars — Great Restorative Sleep',
          '5 Stars — Optimal Deep Muscle Recovery'
        ];
        $('sleep-quality-label').textContent = labels[star - 1];
        triggerVibrate(20);
      };
    });

    if ($('btn-save-sleep')) {
      $('btn-save-sleep').onclick = () => {
        const bedtime = $('sleep-bedtime').value;
        const waketime = $('sleep-waketime').value;
        const notes = $('sleep-notes').value.trim();
        const duration = calculateSleepDuration(bedtime, waketime);
        const hygieneDone = state.sleepHygiene.filter(h => h.checked).length;
        const recoveryScore = calculateRecoveryScore(duration, selectedSleepQuality, hygieneDone);

        const newLog = {
          id: 'sleep_' + Date.now(),
          date: getTodayString(),
          bedtime,
          waketime,
          durationHours: duration,
          quality: selectedSleepQuality,
          notes,
          recoveryScore
        };

        // One entry per night: re-saving today replaces it
        state.sleepLogs = state.sleepLogs.filter(l => l.date !== newLog.date);
        state.sleepLogs.unshift(newLog);
        if (state.sleepLogs.length > 60) state.sleepLogs.pop();
        saveState();
        renderSleepTracker();
        triggerVibrate(80);
        showToast(`Sleep Logged (${duration} hrs, ${recoveryScore}% Recovery Readiness)!`);
      };
    }

    buildTimeSelects();
    syncDateSelects();
    if ($('btn-save-nap')) {
      $('btn-save-nap').onclick = () => {
        if (!state.napLogs) state.napLogs = [];
        const minutes = parseInt($('nap-minutes').value, 10) || 20;
        state.napLogs.push({ id: 'nap_' + Date.now(), date: getTodayString(), minutes });
        if (state.napLogs.length > 120) state.napLogs.shift();
        saveState();
        renderSleepTracker();
        renderSleepChart();
        triggerVibrate(40);
        showToast(`Nap logged (+${minutes} min) — sleep debt updated`);
      };
    }

    if ($('btn-reset-hygiene')) {
      $('btn-reset-hygiene').onclick = () => {
        state.sleepHygiene.forEach(h => h.checked = false);
        saveState();
        renderSleepHygiene();
        renderSleepTracker();
        showToast('Sleep hygiene checklist reset.');
      };
    }

    // Nutrition Mode Switchers
    if ($('subtab-nutri-simple')) {
      $('subtab-nutri-simple').onclick = () => {
        state.nutritionMode = 'simple';
        saveState();
        renderNutrition();
        triggerVibrate(20);
      };
    }

    if ($('subtab-nutri-pro')) {
      $('subtab-nutri-pro').onclick = () => {
        state.nutritionMode = 'pro';
        saveState();
        renderNutrition();
        triggerVibrate(20);
      };
    }

    // Nutrition Action Buttons
    if ($('btn-simple-autofill')) {
      $('btn-simple-autofill').onclick = () => logAllSimpleMeals();
    }

    if ($('btn-simple-reroll')) {
      $('btn-simple-reroll').onclick = () => {
        simpleMealSeed++;
        renderSimpleNutrition();
        showToast('Meal combos swapped!');
        triggerVibrate(20);
      };
    }

    document.querySelectorAll('[data-water]').forEach(btn => {
      btn.onclick = () => {
        if (!state.waterLogs) state.waterLogs = [];
        if (nutritionDate() > getTodayString()) return;
        state.waterLogs.push({ id: 'w_' + Date.now(), date: nutritionDate(), ml: parseInt(btn.dataset.water, 10) });
        if (state.waterLogs.length > 400) state.waterLogs.splice(0, state.waterLogs.length - 400);
        saveState();
        renderDailyMacroMeters();
        triggerVibrate(25);
      };
    });
    if ($('btn-water-undo')) {
      $('btn-water-undo').onclick = () => {
        const today = nutritionDate();
        const idx = (state.waterLogs || []).map(w => w.date).lastIndexOf(today);
        if (idx >= 0) {
          state.waterLogs.splice(idx, 1);
          saveState();
          renderDailyMacroMeters();
        }
      };
    }

    if ($('btn-open-food-library')) {
      $('btn-open-food-library').onclick = () => openFoodLibraryModal();
    }

    if ($('btn-open-custom-food')) {
      $('btn-open-custom-food').onclick = () => openCustomFoodModal();
    }

    if ($('btn-lib-add-custom-food')) {
      $('btn-lib-add-custom-food').onclick = () => {
        $('modal-food-library').classList.remove('active');
        openCustomFoodModal();
      };
    }

    if ($('food-lib-search-input')) {
      $('food-lib-search-input').oninput = (e) => {
        renderFoodLibrary(e.target.value);
      };
    }

    if ($('btn-clear-daily-logs')) {
      $('btn-clear-daily-logs').onclick = () => clearTodayMealLogs();
    }

    if ($('btn-copy-daily-macros')) {
      $('btn-copy-daily-macros').onclick = () => {
        const todayLogs = selectedMealEntries();
        const targetKcal = state.profile.calorieTarget || 2200;
        const totK = todayLogs.reduce((s, x) => s + (x.calories || 0), 0);
        const totP = todayLogs.reduce((s, x) => s + (x.protein || 0), 0);
        const totC = todayLogs.reduce((s, x) => s + (x.carbs || 0), 0);
        const totF = todayLogs.reduce((s, x) => s + (x.fat || 0), 0);

        let summary = `Ghosty Gains Nutrition Diary (${nutritionDate()}):\n`;
        summary += `Total: ${totK} / ${targetKcal} kcal | ${totP}g Protein | ${totC}g Carbs | ${totF}g Fats\n\n`;

        ['breakfast', 'lunch', 'dinner', 'snack'].forEach(slot => {
          const sLogs = todayLogs.filter(x => x.slot === slot);
          summary += `${SLOT_NAMES[slot]?.name || slot}:\n`;
          if (sLogs.length === 0) summary += `  (No foods logged)\n`;
          else sLogs.forEach(i => summary += `  • ${i.planned ? '[Planned] ' : ''}${i.name} (${i.grams}g) - ${i.calories} kcal, ${i.protein}g P\n`);
        });

        copyText(summary, 'Day summary copied to clipboard!');
      };
    }

    if ($('btn-add-to-breakfast')) $('btn-add-to-breakfast').onclick = () => openFoodLoggerForSlot('breakfast');
    if ($('btn-add-to-lunch')) $('btn-add-to-lunch').onclick = () => openFoodLoggerForSlot('lunch');
    if ($('btn-add-to-dinner')) $('btn-add-to-dinner').onclick = () => openFoodLoggerForSlot('dinner');
    if ($('btn-add-to-snack')) $('btn-add-to-snack').onclick = () => openFoodLoggerForSlot('snack');

    // Only generic subviews belong here; nutrition modes have their own handlers above.
    document.querySelectorAll('.subnav-btn[data-subview]').forEach(btn => {
      btn.onclick = () => {
        const subviewId = btn.dataset.subview;
        const parentTab = btn.closest('.tab-view')?.id?.replace('tab-', '');
        if (subviewId && parentTab) {
          switchSubview(parentTab, subviewId);
          triggerVibrate(20);
        }
      };
    });

  }

  // --- Physique Progress Photos & Tape Measurements ---
  // Photo metrics are body-outline widths divided by height in the photo (see BodyAnalyzer.kt),
  // so they're compared as % changes. Below this, differences are normal photo-to-photo noise.
  const PHOTO_NOISE_PCT = 2.5;

  // Which training groups build each measured area
  const PHOTO_METRICS = [
    { key: 'shoulders', label: 'Shoulders (delts)', groups: ['shoulders'], poses: ['front', 'back'] },
    { key: 'chest', label: 'Chest / lat width', groups: ['chest', 'back'], poses: ['front'] },
    { key: 'chest', label: 'Lat width (V-taper)', groups: ['back'], poses: ['back'] },
    { key: 'chest', label: 'Chest depth', groups: ['chest', 'back'], poses: ['side'] },
    { key: 'arm', label: 'Arms', groups: ['arms'], poses: ['front', 'back'] },
    { key: 'waist', label: 'Waist', groups: ['core', 'cardio'], poses: ['front', 'back'], isWaist: true },
    { key: 'waist', label: 'Belly / waist depth', groups: ['core', 'cardio'], poses: ['side'], isWaist: true },
    { key: 'hips', label: 'Hips & glutes', groups: ['legs'], poses: ['front', 'back'] },
    { key: 'hips', label: 'Glutes', groups: ['legs'], poses: ['side'] },
    { key: 'thigh', label: 'Thighs (quads)', groups: ['legs'], poses: ['front', 'back'] },
    { key: 'calf', label: 'Calves', groups: ['legs'], poses: ['front', 'back'] }
  ];

  const TAPE_FIELDS = [
    { key: 'chest', label: 'Chest', groups: ['chest', 'back'] },
    { key: 'arm', label: 'Arm (flexed)', groups: ['arms'] },
    { key: 'shoulders', label: 'Shoulders', groups: ['shoulders'] },
    { key: 'waist', label: 'Waist (at navel)', groups: ['core', 'cardio'], isWaist: true },
    { key: 'hips', label: 'Hips / glutes', groups: ['legs'] },
    { key: 'thigh', label: 'Thigh', groups: ['legs'] },
    { key: 'calf', label: 'Calf', groups: ['legs'] },
    { key: 'neck', label: 'Neck', groups: ['shoulders'] }
  ];

  const GROUP_LABELS = {
    chest: '🏋️ Chest', back: '🦅 Back', shoulders: '🎯 Shoulders', arms: '💪 Arms',
    legs: '🦵 Legs', core: '🧱 Core', cardio: '🏃 Cardio', other: '⚡ Other'
  };

  const CUT_GOALS = ['fatloss', 'stay_same', 'get_fit'];
  const BULK_GOALS = ['gainz', 'pure_bodybuilder', 'strongman'];

  // Order matters: leg curls/extensions must match legs before "curl"/"extension" match arms
  function classifyExercise(name) {
    const n = (name || '').toLowerCase();
    if (/rest|sleep|meal prep|recover|hydrate|mobility|stretch|warm-up|cool-down/.test(n)) return null;
    if (/leg (curl|extension|press|raise)|squat|lunge|romanian|rdl|hip thrust|glute|calf|abduction|kickback|nordic|split squat|good morning|sled|yoke|step-up/.test(n)) {
      return /leg raise/.test(n) ? 'core' : 'legs';
    }
    if (/curl|pushdown|push-down|tricep|bicep|skull|extension|preacher|dip/.test(n)) return 'arms';
    if (/lateral|shoulder|overhead|military|face pull|rear delt|shrug|z-press|log press|axle press|reverse pec/.test(n)) return 'shoulders';
    if (/bench|chest|fly|flye|push-up|pec|incline .*press|press/.test(n)) return 'chest';
    if (/row|pulldown|pull-up|chin-up|pull up|deadlift|lat |lats|back/.test(n)) return 'back';
    if (/crunch|plank|ab |abs|dead bug|bird dog|core|l-sit|hanging/.test(n)) return 'core';
    if (/walk|bike|rower|cardio|hiit|sprint|steps|jump rope|swim|run|cycle|zone 2|carry|carries|agility|crawl|swing/.test(n)) return 'cardio';
    return 'other';
  }

  function logWorkoutTick(ex, done) {
    if (!state.workoutLog) state.workoutLog = [];
    const today = getTodayString();
    if (done) {
      const group = classifyExercise(ex.name);
      if (!group) return;
      state.workoutLog.push({ date: today, exId: ex.id, name: ex.name, group });
      if (state.workoutLog.length > 3000) state.workoutLog.splice(0, state.workoutLog.length - 3000);
    } else {
      // Unticking removes the most recent tick of that exercise from this week
      const wk = weekKey();
      for (let i = state.workoutLog.length - 1; i >= 0; i--) {
        const e = state.workoutLog[i];
        if (e.exId === ex.id && weekKey(new Date(e.date + 'T12:00:00')) === wk) {
          state.workoutLog.splice(i, 1);
          break;
        }
      }
    }
  }

  function countWorkoutsBetween(fromDate, toDate) {
    const counts = {};
    (state.workoutLog || []).forEach(e => {
      if (e.date > fromDate && e.date <= toDate) counts[e.group] = (counts[e.group] || 0) + 1;
    });
    return counts;
  }

  const sumGroups = (counts, groups) => groups.reduce((s, g) => s + (counts[g] || 0), 0);
  const fmtPct = v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
  const daysBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  const prettyDate = d => new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const tapeToDisplay = cm => state.tapeUnit === 'in' ? cm / 2.54 : cm;
  const tapeFromDisplay = v => state.tapeUnit === 'in' ? v * 2.54 : v;

  function nearestByDate(list, date, maxDays) {
    let best = null;
    let bestGap = Infinity;
    (list || []).forEach(item => {
      const gap = Math.abs(daysBetween(item.date, date));
      if (gap <= maxDays && gap < bestGap) {
        best = item;
        bestGap = gap;
      }
    });
    return best;
  }

  function metricsForPose(pose) {
    return PHOTO_METRICS.filter(m => m.poses.includes(pose));
  }

  function verdictFor(def, pct, trained, goal) {
    const isCut = CUT_GOALS.includes(goal);
    const isBulk = BULK_GOALS.includes(goal);
    const trainedText = trained ? `${trained} ${trained === 1 ? 'exercise' : 'exercises'} logged for this since then.` : 'No exercises logged for this since then.';

    if (def.isWaist) {
      if (pct <= -PHOTO_NOISE_PCT) return { icon: '🔥', cls: 'up', text: `Tighter waist — fat loss is showing. ${isBulk ? 'On a bulk, make sure you are still eating enough to grow.' : 'Keep it up!'}` };
      if (pct >= PHOTO_NOISE_PCT) {
        return isBulk
          ? { icon: '📈', cls: 'flat', text: 'Waist up a little — normal on a calorie surplus. Keep the bulk slow (about 0.25–0.5 kg a week).' }
          : { icon: '⚠️', cls: 'down', text: 'Waist is wider. Check calories, add daily steps, and keep protein high.' };
      }
      return { icon: '➖', cls: 'flat', text: isCut ? 'Waist about the same — tighten nutrition slightly or add steps if fat loss is the goal.' : 'Waist holding steady.' };
    }

    if (pct >= PHOTO_NOISE_PCT) return { icon: '💪', cls: 'up', text: `Gainz! Bigger than before. ${trainedText}` };
    if (pct <= -PHOTO_NOISE_PCT) {
      return isCut
        ? { icon: '⬇️', cls: 'down', text: `Slightly smaller — normal while cutting. Keep lifting heavy and protein high to hold the muscle. ${trainedText}` }
        : { icon: '⬇️', cls: 'down', text: `Smaller than before — check you're eating enough and training it hard. ${trainedText}` };
    }
    if (trained >= 6) return { icon: '➖', cls: 'flat', text: `About the same. ${trainedText} Push progressive overload (add a rep or a little weight each week).` };
    if (trained === 0) return { icon: '➖', cls: 'flat', text: 'About the same. No exercises logged for this since then — train it to see growth.' };
    return { icon: '➖', cls: 'flat', text: `About the same. ${trained < 3 ? `Only ${trained} logged — train it more often to see growth.` : trainedText}` };
  }

  function photoConsistencyWarnings(a, b) {
    const w = [];
    if (a.ref !== b.ref) w.push('One photo shows head-to-feet and the other doesn\'t, so sizes were scaled differently — compare with care.');
    const angA = a.flags?.armAngle, angB = b.flags?.armAngle;
    if (typeof angA === 'number' && typeof angB === 'number' && Math.abs(angA - angB) > 15) w.push(`Arms are held at different angles (${Math.round(angB)}° vs ${Math.round(angA)}°), so arm and shoulder readings are less reliable.`);
    const fa = a.flags?.facing, fb = b.flags?.facing;
    if (fa && fb && Math.abs(fa / fb - 1) > 0.08) w.push('Your body is turned differently in one photo — face the camera straight on each time.');
    const ba = a.flags?.bodyFill, bb = b.flags?.bodyFill;
    if (ba && bb && Math.abs(ba / bb - 1) > 0.3) w.push('You\'re a very different size in the frame — keep the same distance from the camera.');
    if (a.flags?.mask && b.flags?.mask && a.flags.mask !== b.flags.mask) w.push('Different outline models were used for these photos, so treat small changes with caution.');
    return w;
  }

  // newer/older are photo entries (same pose). Returns report data used by both report views.
  function buildPhotoComparison(newer, older) {
    const goal = state.activeGoal;
    const counts = countWorkoutsBetween(older.date, newer.date);
    const rows = [];

    metricsForPose(newer.pose).forEach(def => {
      const a = older.metrics?.[def.key];
      const b = newer.metrics?.[def.key];
      if (typeof a !== 'number' || typeof b !== 'number' || a <= 0) return;
      const pct = (b / a - 1) * 100;
      rows.push({ def, pct, trained: sumGroups(counts, def.groups), ...verdictFor(def, pct, sumGroups(counts, def.groups), goal) });
    });

    // Shoulder-to-waist ratio = the classic V-taper
    let vtaper = null;
    const sa = older.metrics?.shoulders, wa = older.metrics?.waist, sb = newer.metrics?.shoulders, wb = newer.metrics?.waist;
    if (newer.pose !== 'side' && sa && wa && sb && wb) {
      vtaper = { before: sa / wa, after: sb / wb, pct: ((sb / wb) / (sa / wa) - 1) * 100 };
    }

    const tapeA = nearestByDate(state.measureLogs, older.date, 10);
    const tapeB = nearestByDate(state.measureLogs, newer.date, 10);
    const tapeRows = (tapeA && tapeB && tapeA.id !== tapeB.id) ? tapeDiffRows(tapeA, tapeB) : [];

    const wA = nearestByDate(state.weightLogs, older.date, 10);
    const wB = nearestByDate(state.weightLogs, newer.date, 10);
    const weight = (wA && wB && wA.id !== wB.id) ? { before: wA.kg, after: wB.kg } : null;

    return {
      days: daysBetween(older.date, newer.date),
      rows,
      vtaper,
      tapeRows,
      weight,
      counts,
      warnings: photoConsistencyWarnings(newer, older)
    };
  }

  function tapeDiffRows(a, b) {
    const rows = [];
    TAPE_FIELDS.forEach(f => {
      const va = a.values?.[f.key], vb = b.values?.[f.key];
      if (typeof va === 'number' && typeof vb === 'number') rows.push({ field: f, before: va, after: vb, diff: vb - va });
    });
    return rows;
  }

  function renderComparisonInto(container, newer, older) {
    container.replaceChildren();
    const cmp = buildPhotoComparison(newer, older);
    const u = state.profile.unit;
    const tapeUnit = state.tapeUnit || 'cm';

    const ups = cmp.rows.filter(r => !r.def.isWaist && r.pct >= PHOTO_NOISE_PCT).map(r => r.def.label);
    const waistRow = cmp.rows.find(r => r.def.isWaist);
    let headline = `${newer.pose[0].toUpperCase() + newer.pose.slice(1)} pose · ${cmp.days} days since ${prettyDate(older.date)}. `;
    if (ups.length) headline += `Gainz in: ${ups.join(', ')}. `;
    if (waistRow && waistRow.pct <= -PHOTO_NOISE_PCT) headline += 'Waist is tighter. ';
    if (!ups.length && !(waistRow && Math.abs(waistRow.pct) >= PHOTO_NOISE_PCT)) headline += 'No clear change yet — real changes usually take 4+ weeks to show in photos.';

    const summary = document.createElement('div');
    summary.className = 'report-summary';
    summary.textContent = headline;
    container.append(summary);

    cmp.warnings.forEach(text => {
      const w = document.createElement('div');
      w.className = 'report-warn';
      w.textContent = '⚠️ ' + text;
      container.append(w);
    });

    const addRow = (icon, title, changeText, changeCls, text) => {
      const row = document.createElement('div');
      row.className = 'report-row';
      row.innerHTML = `
        <div class="report-icon">${icon}</div>
        <div class="report-body">
          <div class="report-title"><span>${esc(title)}</span><span class="report-change ${changeCls}">${esc(changeText)}</span></div>
          <div class="report-text">${esc(text)}</div>
        </div>`;
      container.append(row);
    };

    if (cmp.rows.length) {
      const t = document.createElement('div');
      t.className = 'report-section-title';
      t.textContent = 'From your photos (estimates)';
      container.append(t);
      cmp.rows.forEach(r => addRow(r.icon, r.def.label, fmtPct(r.pct), r.cls, r.text));
      if (cmp.vtaper) {
        const p = cmp.vtaper.pct;
        addRow(p >= 2 ? '🦅' : '➖', 'V-taper (shoulder ÷ waist)', `${cmp.vtaper.before.toFixed(2)} → ${cmp.vtaper.after.toFixed(2)}`,
          p >= 2 ? 'up' : p <= -2 ? 'down' : 'flat',
          p >= 2 ? 'Your V-taper is improving — broader up top relative to your waist.' : p <= -2 ? 'V-taper slipped a little — prioritise shoulders, lats and waist control.' : 'V-taper about the same.');
      }
    } else {
      const none = document.createElement('div');
      none.className = 'report-text';
      none.textContent = 'These two photos don\'t share any measurements to compare (check the pose tips above).';
      container.append(none);
    }

    if (cmp.tapeRows.length) {
      const t = document.createElement('div');
      t.className = 'report-section-title';
      t.textContent = 'Tape measurements (real sizes)';
      container.append(t);
      cmp.tapeRows.forEach(r => {
        const d = tapeToDisplay(r.diff);
        const good = r.field.isWaist ? d < 0 : d > 0;
        addRow(Math.abs(d) < 0.2 ? '➖' : good ? '✅' : '🔸', r.field.label,
          `${tapeToDisplay(r.before).toFixed(1)} → ${tapeToDisplay(r.after).toFixed(1)} ${tapeUnit} (${d > 0 ? '+' : ''}${d.toFixed(1)})`,
          Math.abs(d) < 0.2 ? 'flat' : good ? 'up' : 'down', '');
      });
    }

    if (cmp.weight) {
      const diff = fromKg(cmp.weight.after, u) - fromKg(cmp.weight.before, u);
      addRow('⚖️', 'Bodyweight', `${diff > 0 ? '+' : ''}${diff.toFixed(u === 'stone' ? 2 : 1)} ${u}`, 'flat',
        `${fromKg(cmp.weight.before, u).toFixed(u === 'stone' ? 2 : 1)} → ${fromKg(cmp.weight.after, u).toFixed(u === 'stone' ? 2 : 1)} ${u}`);
    }

    const t = document.createElement('div');
    t.className = 'report-section-title';
    t.textContent = 'What you worked on since then';
    container.append(t);
    const entries = Object.entries(cmp.counts).sort((a, b) => b[1] - a[1]);
    const chips = document.createElement('div');
    chips.className = 'worked-on-chips';
    if (entries.length) {
      entries.forEach(([g, n]) => {
        const c = document.createElement('span');
        c.className = 'day-badge cyan';
        c.textContent = `${GROUP_LABELS[g] || g}: ${n}`;
        chips.append(c);
      });
    } else {
      chips.innerHTML = '<span class="report-text">No ticked exercises in this period. Tick exercises off in the Workouts tab so the report can link training to results.</span>';
    }
    container.append(chips);
  }

  // --- Photo capture flow ---
  let selectedProgressPose = 'front';
  let progressGalleryFilter = 'all';
  let progressDetailId = null;

  function requestProgressPhoto(source) {
    if (!(window.AndroidApp && typeof window.AndroidApp.takeProgressPhoto === 'function')) {
      alert('Physique photo analysis runs on your phone in the Ghosty Gains Android app.');
      return;
    }
    window.AndroidApp.takeProgressPhoto(source, selectedProgressPose);
  }

  window.onProgressPhotoStatus = function(status) {
    const el = $('progress-analyzing');
    if (el) el.style.display = status === 'analyzing' ? 'block' : 'none';
  };

  window.onProgressPhotoResult = function(res) {
    window.onProgressPhotoStatus('done');
    if (!res || !res.id) return;
    if (!state.progressPhotos) state.progressPhotos = [];

    const latestWeight = [...(state.weightLogs || [])].sort((a, b) => a.date.localeCompare(b.date)).pop();
    const entry = {
      id: res.id,
      date: getTodayString(),
      pose: res.pose || selectedProgressPose,
      photoUri: res.photoUri || '',
      markedUri: res.markedUri || '',
      ok: !!res.ok,
      error: res.error || '',
      ref: res.ref || null,
      metrics: res.metrics || {},
      flags: res.flags || {},
      warnings: res.warnings || [],
      weightKg: latestWeight ? latestWeight.kg : toKg(state.profile.weight, state.profile.unit),
      heightCm: state.profile.height
    };

    if (!entry.photoUri) {
      alert(entry.error || 'Could not save that photo.');
      return;
    }
    state.progressPhotos.push(entry);
    saveState();
    renderProgress();
    triggerVibrate(80);

    if (entry.ok) {
      playBeep(920, 0.12);
      showToast('Physique measured!');
    } else {
      alert(`Photo saved, but it couldn't be measured:\n${entry.error}`);
    }
    openProgressDetail(entry.id);
  };

  function photosOfPose(pose) {
    return (state.progressPhotos || []).filter(p => p.pose === pose && p.ok).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }

  // The photo taken just before this one in the same pose (falls back to none)
  function previousPhotoFor(photo) {
    const list = photosOfPose(photo.pose);
    const idx = list.findIndex(p => p.id === photo.id);
    return idx > 0 ? list[idx - 1] : null;
  }

  function renderProgress() {
    renderProgressGallery();
    renderProgressReport();
    renderTapeSection();
  }

  function renderProgressReport() {
    const container = $('progress-report-container');
    if (!container) return;
    const measured = (state.progressPhotos || []).filter(p => p.ok).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const latest = measured[measured.length - 1];
    const prev = latest ? previousPhotoFor(latest) : null;

    if (!latest || !prev) {
      container.replaceChildren();
      const p = document.createElement('div');
      p.className = 'report-text';
      p.textContent = latest
        ? `Baseline ${latest.pose} photo saved on ${prettyDate(latest.date)}. Take your next ${latest.pose} photo in 2–4 weeks and your Gainz Report will appear here.`
        : 'Take your first front photo to set your baseline. Your next photo in the same pose will be compared against it.';
      container.append(p);
      return;
    }
    renderComparisonInto(container, latest, prev);
  }

  function renderProgressGallery() {
    const grid = $('progress-gallery-grid');
    if (!grid) return;
    grid.replaceChildren();
    const photos = (state.progressPhotos || [])
      .filter(p => progressGalleryFilter === 'all' || p.pose === progressGalleryFilter)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

    $('progress-photo-count').textContent = `${(state.progressPhotos || []).length} photos`;
    document.querySelectorAll('#progress-gallery-filter .day-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === progressGalleryFilter));

    if (!photos.length) {
      const empty = document.createElement('div');
      empty.className = 'report-text';
      empty.style.gridColumn = '1 / -1';
      empty.textContent = 'No photos yet.';
      grid.append(empty);
      return;
    }

    photos.forEach(p => {
      const tile = document.createElement('div');
      tile.className = 'progress-thumb' + (p.ok ? '' : ' failed');
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = window.GhostyPhotos.source(p.photoUri);
      img.alt = `${p.pose} photo ${p.date}`;
      img.onerror = () => { img.style.display = 'none'; };
      const label = document.createElement('div');
      label.className = 'progress-thumb-label';
      label.textContent = `${new Date(p.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${p.pose}${p.ok ? '' : ' ⚠️'}`;
      tile.append(img, label);
      tile.onclick = () => openProgressDetail(p.id);
      grid.append(tile);
    });
  }

  function openProgressDetail(id, compareId) {
    const photo = (state.progressPhotos || []).find(p => p.id === id);
    if (!photo) return;
    progressDetailId = id;

    $('progress-detail-title').textContent = `${photo.pose[0].toUpperCase() + photo.pose.slice(1)} · ${prettyDate(photo.date)}`;

    // Compare options: every other measured photo in the same pose, default = the one before it
    const select = $('progress-compare-select');
    select.replaceChildren();
    const others = photosOfPose(photo.pose).filter(p => p.id !== id);
    const none = document.createElement('option');
    none.value = '';
    none.textContent = others.length ? 'Nothing (just this photo)' : 'No other photos in this pose yet';
    select.append(none);
    others.slice().reverse().forEach(p => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = `${prettyDate(p.date)}${p.date < photo.date ? '' : ' (newer)'}`;
      select.append(o);
    });
    const prev = previousPhotoFor(photo);
    select.value = compareId !== undefined ? compareId : (photo.ok && prev ? prev.id : (others[others.length - 1]?.id || ''));
    if (!photo.ok) select.value = '';
    select.disabled = !photo.ok || !others.length;

    renderProgressDetailBody();
    openModal('modal-progress-photo');
  }

  function renderProgressDetailBody() {
    const photo = (state.progressPhotos || []).find(p => p.id === progressDetailId);
    if (!photo) return;
    const other = (state.progressPhotos || []).find(p => p.id === $('progress-compare-select').value) || null;
    const showLines = $('progress-show-lines').checked;
    const src = p => window.GhostyPhotos.source((showLines && p.markedUri) ? p.markedUri : p.photoUri);

    // Older photo on the left, newer on the right
    const pair = other ? [other, photo].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) : [photo];
    const imgs = $('progress-compare-images');
    imgs.className = 'progress-compare-wrap' + (pair.length === 1 ? ' single' : '');
    imgs.replaceChildren();
    pair.forEach((p, i) => {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = src(p);
      img.alt = p.date;
      const cap = document.createElement('figcaption');
      cap.textContent = pair.length === 2 ? `${i === 0 ? 'Before' : 'After'} · ${prettyDate(p.date)}` : prettyDate(p.date);
      fig.append(img, cap);
      imgs.append(fig);
    });

    const body = $('progress-detail-report');
    body.replaceChildren();

    if (!photo.ok) {
      const w = document.createElement('div');
      w.className = 'report-warn';
      w.textContent = '⚠️ Not measured: ' + (photo.error || 'unknown error');
      body.append(w);
      return;
    }

    (photo.warnings || []).forEach(text => {
      const w = document.createElement('div');
      w.className = 'report-warn';
      w.textContent = '💡 ' + text;
      body.append(w);
    });

    if (other) {
      const [older, newer] = pair;
      renderComparisonInto(body, newer, older);
      return;
    }

    // Single photo: list the measurements found, with a rough width estimate from your height
    const t = document.createElement('div');
    t.className = 'report-section-title';
    t.textContent = 'Measured in this photo';
    body.append(t);
    const heightCm = photo.heightCm || state.profile.height;
    metricsForPose(photo.pose).forEach(def => {
      const v = photo.metrics?.[def.key];
      if (typeof v !== 'number') return;
      const row = document.createElement('div');
      row.className = 'report-row';
      const est = photo.ref === 'height' && heightCm ? `≈ ${(v * heightCm).toFixed(1)} cm wide` : `${(v * 100).toFixed(1)}% of torso length`;
      row.innerHTML = `<div class="report-icon">📐</div><div class="report-body"><div class="report-title"><span>${esc(def.label)}</span><span class="report-change flat">${esc(est)}</span></div></div>`;
      body.append(row);
    });
    const note = document.createElement('div');
    note.className = 'report-text';
    note.style.marginTop = '6px';
    note.textContent = 'Widths are front-on outline estimates (not tape circumference). Their real value is tracking change between photos.';
    body.append(note);
  }

  function deleteProgressPhoto(id) {
    if (!confirm('Delete this progress photo? This can\'t be undone.')) return;
    const photo = (state.progressPhotos || []).find(p => p.id === id);
    if (photo) window.GhostyPhotos.remove(photo).catch(() => showToast('The photo file could not be removed.'));
    state.progressPhotos = (state.progressPhotos || []).filter(p => p.id !== id);
    saveState();
    closeModal('modal-progress-photo');
    renderProgress();
    showToast('Photo deleted.');
  }

  // --- Tape measurements ---
  function renderTapeSection() {
    const grid = $('tape-form-grid');
    if (!grid) return;
    const unit = state.tapeUnit || 'cm';
    $('tape-unit').value = unit;
    if (!$('tape-date').value) $('tape-date').value = getTodayString();

    const logs = [...(state.measureLogs || [])].sort((a, b) => a.date.localeCompare(b.date));
    const last = logs[logs.length - 1];

    grid.replaceChildren();
    TAPE_FIELDS.forEach(f => {
      const group = document.createElement('div');
      group.className = 'form-group';
      const label = document.createElement('label');
      label.htmlFor = 'tape-' + f.key;
      label.textContent = `${f.label} (${unit})`;
      const input = document.createElement('input');
      input.id = 'tape-' + f.key;
      input.type = 'number';
      input.step = '0.1';
      input.inputMode = 'decimal';
      const lastVal = last?.values?.[f.key];
      input.placeholder = typeof lastVal === 'number' ? `last: ${tapeToDisplay(lastVal).toFixed(1)}` : '—';
      group.append(label, input);
      grid.append(group);
    });

    const hist = $('tape-history-container');
    hist.replaceChildren();
    if (!logs.length) return;

    // Table: first, previous and latest entries with change since first
    const first = logs[0];
    const prev = logs.length > 2 ? logs[logs.length - 2] : null;
    const cols = [first, prev, last].filter((v, i, arr) => v && arr.indexOf(v) === i);
    const table = document.createElement('table');
    table.className = 'tape-table';
    let html = `<tr><th>${unit}</th>${cols.map(c => `<th>${esc(new Date(c.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))}</th>`).join('')}${logs.length > 1 ? '<th>Change</th>' : ''}</tr>`;
    TAPE_FIELDS.forEach(f => {
      const vals = cols.map(c => c.values?.[f.key]);
      if (vals.every(v => typeof v !== 'number')) return;
      // Change needs two different entries that both have this measurement
      const withVal = logs.filter(l => typeof l.values?.[f.key] === 'number');
      const diff = withVal.length > 1 ? tapeToDisplay(withVal[withVal.length - 1].values[f.key] - withVal[0].values[f.key]) : null;
      const good = diff !== null && (f.isWaist ? diff < 0 : diff > 0);
      const color = diff === null || Math.abs(diff) < 0.2 ? 'var(--text-muted)' : good ? 'var(--green)' : 'var(--orange)';
      html += `<tr><td>${esc(f.label)}</td>${vals.map(v => `<td>${typeof v === 'number' ? tapeToDisplay(v).toFixed(1) : '–'}</td>`).join('')}${logs.length > 1 ? `<td style="color:${color};font-weight:700;">${diff === null ? '–' : (diff > 0 ? '+' : '') + diff.toFixed(1)}</td>` : ''}</tr>`;
    });
    table.innerHTML = html;
    hist.append(table);

    const list = document.createElement('ul');
    list.className = 'log-list';
    list.style.marginTop = '8px';
    logs.slice().reverse().forEach(l => {
      const li = document.createElement('li');
      li.className = 'log-item';
      const info = document.createElement('span');
      info.textContent = `${l.date} — ${Object.keys(l.values || {}).length} measurements`;
      const del = document.createElement('button');
      del.className = 'btn btn-outline btn-sm';
      del.textContent = 'Remove';
      del.onclick = () => {
        state.measureLogs = state.measureLogs.filter(x => x.id !== l.id);
        saveState();
        renderTapeSection();
      };
      li.append(info, del);
      list.append(li);
    });
    hist.append(list);
  }

  function saveTapeMeasurements() {
    const values = {};
    TAPE_FIELDS.forEach(f => {
      const v = parseFloat($('tape-' + f.key).value);
      if (Number.isFinite(v) && v > 0) values[f.key] = parseFloat(tapeFromDisplay(v).toFixed(1));
    });
    if (!Object.keys(values).length) {
      alert('Enter at least one measurement.');
      return;
    }
    const date = $('tape-date').value || getTodayString();
    if (!state.measureLogs) state.measureLogs = [];
    // One entry per day: merge into an existing entry for that date
    const existing = state.measureLogs.find(l => l.date === date);
    if (existing) Object.assign(existing.values, values);
    else state.measureLogs.push({ id: 'tape_' + Date.now(), date, values });
    saveState();
    renderTapeSection();
    renderProgressReport();
    triggerVibrate(60);
    showToast('Measurements saved!');
  }

  function bindProgress() {
    document.querySelectorAll('#progress-pose-selector .slot-select-btn').forEach(btn => {
      btn.onclick = () => {
        selectedProgressPose = btn.dataset.pose;
        document.querySelectorAll('#progress-pose-selector .slot-select-btn').forEach(b => b.classList.toggle('active', b === btn));
        triggerVibrate(20);
      };
    });
    document.querySelectorAll('#progress-gallery-filter .day-chip').forEach(chip => {
      chip.onclick = () => {
        progressGalleryFilter = chip.dataset.filter;
        renderProgressGallery();
      };
    });
    $('btn-progress-camera').onclick = () => requestProgressPhoto('camera');
    $('btn-progress-gallery').onclick = () => requestProgressPhoto('gallery');
    $('progress-compare-select').onchange = () => renderProgressDetailBody();
    $('progress-show-lines').onchange = () => renderProgressDetailBody();
    $('btn-progress-delete').onclick = () => progressDetailId && deleteProgressPhoto(progressDetailId);
    $('btn-progress-save-gallery').onclick = () => {
      if (!progressDetailId) return;
      if (window.AndroidApp && typeof window.AndroidApp.saveProgressPhotoToGallery === 'function') {
        showToast(window.AndroidApp.saveProgressPhotoToGallery(progressDetailId) ? 'Saved to Pictures/GhostyGains' : 'Could not save photo');
      }
    };
    $('btn-save-tape').onclick = saveTapeMeasurements;
    $('tape-unit').onchange = e => {
      state.tapeUnit = e.target.value;
      saveState();
      renderTapeSection();
      renderProgressReport();
    };
  }

  // --- Muscle Picker (tap a body map -> best exercises with pictures) ---
  const EXERCISE_LIBRARY = window.EXERCISE_LIBRARY || [];
  // Desktop preview HTML sits outside the assets folder and sets ASSET_BASE
  const assetUrl = path => (window.ASSET_BASE || '') + path;

  const MUSCLE_AREAS = {
    chest: { label: 'Chest', icon: '🏋️' },
    shoulders: { label: 'Shoulders', icon: '🎯' },
    biceps: { label: 'Biceps', icon: '💪' },
    triceps: { label: 'Triceps', icon: '🦾' },
    forearms: { label: 'Forearms', icon: '✊' },
    abs: { label: 'Abs', icon: '🧱' },
    obliques: { label: 'Obliques', icon: '🌀' },
    traps: { label: 'Traps', icon: '⛰️' },
    lats: { label: 'Back / Lats', icon: '🦅' },
    lowerback: { label: 'Lower Back', icon: '🛡️' },
    glutes: { label: 'Glutes', icon: '🍑' },
    quads: { label: 'Quads', icon: '🦵' },
    hamstrings: { label: 'Hamstrings', icon: '🦿' },
    calves: { label: 'Calves', icon: '🐂' }
  };

  // Left half of the figure (x < 100); every shape is mirrored to the right. viewBox 0 0 200 460.
  const BODY_BASE = [
    'M66 80 Q48 82 45 100 Q43 140 47 166 Q55 172 63 166 Q67 140 67 118 Z',
    'M46 166 Q40 196 43 234 L57 236 Q62 202 63 166 Z',
    'M100 70 L88 70 Q74 75 64 80 Q63 102 68 126 Q71 160 72 186 Q69 200 69 214 Q84 228 100 236 Z',
    'M69 210 Q62 248 66 298 Q70 326 76 340 L97 340 Q100 300 99 240 L100 236 Q84 228 69 210 Z',
    'M75 338 Q66 372 70 414 L87 418 Q93 380 97 338 Z',
    'M70 412 Q64 430 70 442 L92 442 Q93 428 87 416 Z'
  ];

  const BODY_MUSCLES = {
    front: [
      ['traps', 'M88 64 Q77 71 65 79 L88 75 Z'],
      ['shoulders', 'M65 80 Q50 82 46 97 Q45 112 51 121 Q57 105 69 97 Q71 87 65 80 Z'],
      ['chest', 'M70 86 Q86 80 99 84 L99 124 Q86 131 73 125 Q65 112 67 98 Z'],
      ['biceps', 'M50 124 Q46 142 48 160 Q55 167 61 160 Q64 141 61 118 Q55 117 50 124 Z'],
      ['forearms', 'M47 170 Q42 196 45 230 L55 231 Q60 202 61 170 Q54 174 47 170 Z'],
      ['abs', 'M85 131 L98 131 L98 203 Q91 208 85 202 Q83 166 85 131 Z'],
      ['obliques', 'M73 129 Q80 131 83 133 Q81 168 83 201 Q77 197 73 188 Q69 160 73 129 Z'],
      ['quads', 'M72 214 Q65 245 68 292 Q72 320 80 333 Q90 331 95 321 Q98 281 97 240 Q86 230 72 214 Z'],
      ['calves', 'M74 348 Q67 372 71 404 Q77 412 82 409 Q85 380 84 350 Q79 343 74 348 Z']
    ],
    back: [
      ['traps', 'M100 60 L90 62 Q79 71 66 80 Q83 87 92 112 L100 142 Z'],
      ['shoulders', 'M65 80 Q50 82 46 97 Q45 112 51 120 Q59 101 72 92 Q70 85 65 80 Z'],
      ['lats', 'M71 100 Q88 110 96 146 Q92 178 80 196 Q73 168 69 126 Q68 110 71 100 Z'],
      ['lowerback', 'M91 148 L99 148 L99 206 Q93 210 87 205 Q85 180 91 148 Z'],
      ['triceps', 'M49 104 Q44 130 47 160 Q54 167 61 160 Q65 132 62 106 Q55 100 49 104 Z'],
      ['forearms', 'M47 170 Q42 196 45 230 L55 231 Q60 202 61 170 Q54 174 47 170 Z'],
      ['glutes', 'M72 210 Q69 232 76 252 Q88 260 99 252 L99 216 Q86 208 72 210 Z'],
      ['hamstrings', 'M70 257 Q66 290 72 325 Q82 334 94 328 Q99 290 98 259 Q86 265 70 257 Z'],
      ['calves', 'M73 343 Q64 366 70 394 Q78 403 85 394 Q93 370 95 343 Q84 335 73 343 Z']
    ]
  };

  const FEMALE_CHEST = 'M71 88 Q86 84 99 88 L99 112 Q97 132 84 133 Q71 132 68 118 Q66 102 71 88 Z';

  // Female figure: same shapes, narrower shoulders/waist and wider hips (width factor by height)
  const FEMALE_WIDTH = [[0, 1], [62, 1], [78, 0.88], [150, 0.84], [205, 1.0], [240, 1.05], [300, 0.99], [460, 0.96]];
  function femaleWidthAt(y) {
    for (let i = 1; i < FEMALE_WIDTH.length; i++) {
      const [y1, k1] = FEMALE_WIDTH[i];
      const [y0, k0] = FEMALE_WIDTH[i - 1];
      if (y <= y1) return k0 + (k1 - k0) * ((y - y0) / (y1 - y0));
    }
    return 1;
  }

  // Applies fn(x, y) -> [x, y] to every "x y" pair in a path made of M/L/Q/Z commands
  const mapPath = (d, fn) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => fn(+x, +y).map(v => +v.toFixed(1)).join(' '));

  function shapeVariants(d, sex) {
    const shaped = sex === 'female' ? mapPath(d, (x, y) => [100 + (x - 100) * femaleWidthAt(y), y]) : d;
    return [shaped, mapPath(shaped, (x, y) => [200 - x, y])];
  }

  function buildBodySvg(sex, side, selected) {
    const fx = (x, y) => sex === 'female' ? 100 + (x - 100) * femaleWidthAt(y) : x;
    let s = '';
    BODY_BASE.forEach(d => shapeVariants(d, sex).forEach(v => { s += `<path class="bm-base" d="${v}"/>`; }));
    s += '<path class="bm-base" d="M89 52 L111 52 L113 74 L87 74 Z"/>';
    s += `<ellipse class="bm-base" cx="${fx(50, 248)}" cy="248" rx="7" ry="13"/><ellipse class="bm-base" cx="${200 - fx(50, 248)}" cy="248" rx="7" ry="13"/>`;
    if (sex === 'female') {
      // long hair falls behind the head
      shapeVariants('M82 22 Q75 52 78 74 L89 70 Q84 50 86 30 Z', 'male').forEach(v => { s += `<path class="bm-hair" d="${v}"/>`; });
    }
    s += '<ellipse class="bm-base" cx="100" cy="32" rx="18" ry="22"/>';
    if (side === 'back') {
      s += `<ellipse class="bm-hair" cx="100" cy="30" rx="18" ry="${sex === 'female' ? 22 : 18}"/>`;
    } else {
      const cap = sex === 'female' ? 'M82 28 Q82 8 100 8 L100 15 Q89 15 86 32 Z' : 'M83 24 Q85 9 100 9 L100 15 Q91 15 86 26 Z';
      shapeVariants(cap, 'male').forEach(v => { s += `<path class="bm-hair" d="${v}"/>`; });
    }

    BODY_MUSCLES[side].forEach(([area, d]) => {
      const shape = (sex === 'female' && side === 'front' && area === 'chest') ? FEMALE_CHEST : d;
      const cls = 'bm-muscle' + (selected.includes(area) ? ' selected' : '');
      shapeVariants(shape, sex).forEach(v => {
        s += `<path class="${cls}" data-area="${area}" d="${v}"><title>${MUSCLE_AREAS[area].label}</title></path>`;
      });
    });
    return s;
  }

  // --- Library lookups ---
  const libById = id => EXERCISE_LIBRARY.find(e => e.id === id) || null;
  const libMatchCache = new Map();

  // Finds the library exercise that best matches a plan exercise (for "how to" pictures)
  function findLibraryMatch(ex) {
    if (ex.libId) return libById(ex.libId);
    const name = (ex.name || '').toLowerCase();
    if (libMatchCache.has(name)) return libMatchCache.get(name);
    let found = null;
    for (const e of EXERCISE_LIBRARY) {
      if (!e.match) continue;
      try {
        if (new RegExp(e.match, 'i').test(name)) { found = e; break; }
      } catch (_) {}
    }
    libMatchCache.set(name, found);
    return found;
  }

  function suggestedSets(e) {
    const p = trainingPrescription();
    return `${p.sets} × ${e.mechanic === 'compound' ? p.reps : '10–15'}`;
  }

  const KIT_ALLOWED = {
    gym: ['gym', 'home', 'bodyweight'],
    home: ['home', 'bodyweight'],
    bodyweight: ['bodyweight']
  };

  function exercisesForArea(area, kit) {
    const allowed = KIT_ALLOWED[kit] || KIT_ALLOWED.gym;
    const rank = e => e.areas[0] === area ? 0 : e.areas.includes(area) ? 1 : 2;
    return EXERCISE_LIBRARY
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => allowed.includes(e.kit) && (e.areas.includes(area) || e.secondary.includes(area)))
      .sort((a, b) => rank(a.e) - rank(b.e) || (libHealthWarning(a.e) ? 1 : 0) - (libHealthWarning(b.e) ? 1 : 0) || a.i - b.i)
      .map(({ e }) => e);
  }

  // How many exercises in the current plan already train this area each week
  function planCountForArea(area) {
    const routine = state.routines[state.activeRoutineId];
    if (!routine) return 0;
    let n = 0;
    routine.days.forEach(d => d.exercises.forEach(ex => {
      const lib = findLibraryMatch(ex);
      if (lib && lib.areas.includes(area)) n++;
    }));
    return n;
  }

  // --- Rendering ---
  let pickerExpanded = {};

  function renderMusclePicker() {
    const svg = $('bodymap-svg');
    if (!svg) return;
    const sex = state.bodyMapSex || 'male';
    const side = state.bodyMapSide || 'front';
    const selected = state.focusMuscles || [];

    svg.innerHTML = buildBodySvg(sex, side, selected);
    svg.querySelectorAll('.bm-muscle').forEach(p => {
      p.onclick = () => toggleFocusMuscle(p.dataset.area);
    });

    document.querySelectorAll('#bodymap-sex .day-chip').forEach(c => c.classList.toggle('active', c.dataset.sex === sex));
    document.querySelectorAll('#bodymap-side .day-chip').forEach(c => c.classList.toggle('active', c.dataset.side === side));
    document.querySelectorAll('#exercise-kit-filter .day-chip').forEach(c => c.classList.toggle('active', c.dataset.kit === (state.exerciseKit || 'gym')));

    // Selected chips (tap to remove) + quick-add chips for areas on the other side of the body
    const chips = $('bodymap-selected');
    chips.replaceChildren();
    if (!selected.length) {
      chips.innerHTML = '<span class="report-text">Nothing selected yet — tap a muscle on the body.</span>';
    }
    selected.forEach(area => {
      const c = document.createElement('button');
      c.className = 'day-chip active';
      c.textContent = `${MUSCLE_AREAS[area].icon} ${MUSCLE_AREAS[area].label} ✕`;
      c.onclick = () => toggleFocusMuscle(area);
      chips.append(c);
    });

    const hidden = Object.keys(MUSCLE_AREAS).filter(a => !BODY_MUSCLES[side].some(([m]) => m === a));
    const hint = $('bodymap-other-side');
    hint.replaceChildren();
    const lbl = document.createElement('span');
    lbl.className = 'report-text';
    lbl.textContent = `On the ${side === 'front' ? 'back' : 'front'}: `;
    hint.append(lbl);
    hidden.forEach(area => {
      const c = document.createElement('button');
      c.className = 'chip-btn' + (selected.includes(area) ? ' active' : '');
      c.textContent = MUSCLE_AREAS[area].label;
      c.onclick = () => toggleFocusMuscle(area);
      hint.append(c);
    });

    renderFocusExercises();
  }

  function toggleFocusMuscle(area) {
    if (!state.focusMuscles) state.focusMuscles = [];
    const idx = state.focusMuscles.indexOf(area);
    if (idx >= 0) state.focusMuscles.splice(idx, 1);
    else state.focusMuscles.push(area);
    saveState();
    triggerVibrate(25);
    renderMusclePicker();
  }

  function renderFocusExercises() {
    const container = $('focus-exercises-container');
    const tips = $('focus-plan-tips');
    if (!container) return;
    container.replaceChildren();
    tips.replaceChildren();
    const selected = state.focusMuscles || [];
    const kit = state.exerciseKit || 'gym';

    if (!selected.length) {
      container.innerHTML = '<div class="report-text">Pick muscles on the body above and your best exercises will appear here.</div>';
      return;
    }

    tips.innerHTML = `<div class="callout info" style="margin-bottom: 10px;"><strong>How to prioritise:</strong> train your focus muscles <b>first</b> in a session while you're fresh, hit each one <b>2× a week</b>, and aim for about <b>10–20 hard sets a week</b> per muscle. Sets/reps below are tuned to your ${esc((GOAL_PRESETS[state.activeGoal] || GOAL_PRESETS.bodybuilding).name)} goal.</div>`;

    selected.forEach(area => {
      const list = exercisesForArea(area, kit);
      const section = document.createElement('div');
      section.className = 'focus-section';

      const inPlan = planCountForArea(area);
      const head = document.createElement('div');
      head.className = 'focus-section-head';
      head.innerHTML = `<span>${MUSCLE_AREAS[area].icon} ${esc(MUSCLE_AREAS[area].label)}</span><span class="day-badge ${inPlan >= 3 ? 'cyan' : 'purple'}">${inPlan} in your plan / week</span>`;
      section.append(head);

      if (inPlan < 2) {
        const note = document.createElement('div');
        note.className = 'report-text';
        note.style.marginBottom = '6px';
        note.textContent = 'Your current plan barely trains this — add 1–2 of these to your week.';
        section.append(note);
      }

      if (!list.length) {
        const none = document.createElement('div');
        none.className = 'report-text';
        none.textContent = 'No exercises for this muscle with that equipment — try "Full gym".';
        section.append(none);
      }

      const showAll = !!pickerExpanded[area];
      list.slice(0, showAll ? list.length : 4).forEach(e => section.append(buildExerciseCard(e, area)));

      if (list.length > 4) {
        const more = document.createElement('button');
        more.className = 'btn btn-outline btn-sm btn-block';
        more.textContent = showAll ? 'Show fewer' : `Show ${list.length - 4} more`;
        more.onclick = () => {
          pickerExpanded[area] = !showAll;
          renderFocusExercises();
        };
        section.append(more);
      }
      container.append(section);
    });
  }

  function buildExerciseCard(e, area) {
    const card = document.createElement('div');
    card.className = 'lib-ex-card';

    const img = document.createElement('img');
    img.className = 'lib-ex-img ex-anim';
    img.src = assetUrl(e.images[0]);
    img.dataset.frames = JSON.stringify(e.images.map(assetUrl));
    img.alt = e.name;
    img.loading = 'lazy';

    const info = document.createElement('div');
    info.className = 'lib-ex-info';
    const primary = e.areas[0] === area ? '' : ` · also hits ${MUSCLE_AREAS[e.areas[0]].label.toLowerCase()}`;
    info.innerHTML = `
      <div class="lib-ex-name">${esc(e.name)}</div>
      <div class="lib-ex-meta">${esc(e.equipment)} · ${esc(e.level)}${esc(primary)}</div>
      <div class="lib-ex-sets">${esc(suggestedSets(e))}</div>
      <div class="lib-ex-tip">${esc(e.tip)}</div>${libHealthWarning(e) ? `<div class="health-flag">⚠️ ${esc(libHealthWarning(e))}</div>` : ''}`;

    const actions = document.createElement('div');
    actions.className = 'lib-ex-actions';
    const how = document.createElement('button');
    how.className = 'btn btn-outline btn-sm';
    how.textContent = '📖 How to';
    how.onclick = () => openExerciseDetail(e.id);
    const add = document.createElement('button');
    add.className = 'btn btn-cyan btn-sm';
    add.textContent = '➕ Plan';
    add.onclick = () => openExerciseDetail(e.id, true);
    actions.append(how, add);

    info.append(actions);
    img.onclick = () => openExerciseDetail(e.id);
    card.append(img, info);
    return card;
  }

  // --- Exercise detail modal ---
  let detailExerciseId = null;

  function openExerciseDetail(id, showAddDays = false) {
    const e = libById(id);
    if (!e) return;
    detailExerciseId = id;
    $('exdetail-title').textContent = e.name;

    const imgs = $('exdetail-images');
    imgs.replaceChildren();
    e.images.forEach((src, i) => {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = assetUrl(src);
      img.alt = `${e.name} ${i === 0 ? 'start' : 'finish'}`;
      const cap = document.createElement('figcaption');
      cap.textContent = i === 0 ? 'Start' : 'Finish';
      fig.append(img, cap);
      imgs.append(fig);
    });

    const areas = [...e.areas.map(a => MUSCLE_AREAS[a].label)];
    const secondary = e.secondary.map(a => MUSCLE_AREAS[a].label);
    $('exdetail-meta').innerHTML = `
      <span class="day-badge cyan">${esc(areas.join(', '))}</span>
      ${secondary.length ? `<span class="day-badge">Also: ${esc(secondary.join(', '))}</span>` : ''}
      <span class="day-badge purple">${esc(e.equipment)}</span>
      <span class="day-badge">${esc(e.level)}</span>`;
    $('exdetail-sets').textContent = `Suggested for your goal: ${suggestedSets(e)}`;
    $('exdetail-tip').textContent = '💡 ' + e.tip;

    const ol = $('exdetail-steps');
    ol.replaceChildren();
    e.instructions.forEach(step => {
      const li = document.createElement('li');
      li.textContent = step;
      ol.append(li);
    });

    renderAddToPlanDays(showAddDays);
    openModal('modal-exercise-detail');
  }

  function renderAddToPlanDays(open) {
    const box = $('exdetail-add-days');
    box.replaceChildren();
    box.style.display = open ? 'block' : 'none';
    if (!open) return;
    const routine = state.routines[state.activeRoutineId] || state.routines.bodybuilding;
    const lbl = document.createElement('div');
    lbl.className = 'report-section-title';
    lbl.textContent = 'Add to which day?';
    box.append(lbl);
    const grid = document.createElement('div');
    grid.className = 'slot-select-grid';
    routine.days.forEach(day => {
      const b = document.createElement('button');
      b.className = 'slot-select-btn';
      b.textContent = `${(day.dayName || '').slice(0, 3)}: ${day.isRest ? 'Rest' : day.title}`;
      b.onclick = () => addLibraryExerciseToDay(detailExerciseId, day.id);
      grid.append(b);
    });
    box.append(grid);
  }

  function addLibraryExerciseToDay(libId, dayId, position = 'start') {
    const e = libById(libId);
    const routine = state.routines[state.activeRoutineId];
    const day = routine && routine.days.find(d => d.id === dayId);
    if (!e || !day) return;
    if (day.exercises.some(x => x.libId === libId)) {
      showToast(`${e.name} is already on ${day.dayName}`);
      return;
    }
    // Focus muscles go first in the session, so picker exercises are added at the top of the day
    const entry = { id: 'lib_' + Date.now(), name: e.name, sets: suggestedSets(e), notes: e.tip, libId };
    if (position === 'end') day.exercises.push(entry);
    else day.exercises.unshift(entry);
    saveState();
    renderWorkouts();
    renderFocusExercises();
    closeModal('modal-exercise-detail');
    triggerVibrate(60);
    showToast(`Added ${e.name} to ${day.dayName}!`);
  }

  // Start/finish photos alternate so each exercise plays like a slow animation
  let exAnimFrame = 0;
  setInterval(() => {
    exAnimFrame = 1 - exAnimFrame;
    document.querySelectorAll('img.ex-anim').forEach(img => {
      if (!img.isConnected || img.offsetParent === null) return;
      try {
        const frames = JSON.parse(img.dataset.frames || '[]');
        if (frames.length > 1) img.src = frames[exAnimFrame % frames.length];
      } catch (_) {}
    });
  }, 1300);

  function bindMusclePicker() {
    document.querySelectorAll('#bodymap-sex .day-chip').forEach(c => {
      c.onclick = () => { state.bodyMapSex = c.dataset.sex; saveState(); renderMusclePicker(); };
    });
    document.querySelectorAll('#bodymap-side .day-chip').forEach(c => {
      c.onclick = () => { state.bodyMapSide = c.dataset.side; saveState(); renderMusclePicker(); };
    });
    document.querySelectorAll('#exercise-kit-filter .day-chip').forEach(c => {
      c.onclick = () => { state.exerciseKit = c.dataset.kit; saveState(); renderMusclePicker(); };
    });
    $('btn-bodymap-clear').onclick = () => {
      state.focusMuscles = [];
      saveState();
      renderMusclePicker();
    };
    $('btn-exdetail-add').onclick = () => renderAddToPlanDays(true);
    $('addex-search').oninput = () => renderExercisePickerList();
    $('btn-addex-custom').onclick = () => {
      closeModal('modal-add-exercise');
      openAddExerciseModal(addExDayId);
    };
  }

  // --- Health conditions: automatic exercise swaps & cautions ---
  // swap: [regex on the plan exercise name, library id to use instead]
  // caution: [regex, advice] — kept in the plan but flagged with how to do it safely
  const HEALTH_CONDITIONS = {
    lowerback: {
      label: 'Lower back pain / disc problem',
      swap: [
        [/^(?!.*(romanian|rdl|stiff)).*deadlift|block pull|good morning/i, 'Barbell_Hip_Thrust'],
        [/romanian|rdl|stiff[- ]leg/i, 'Lying_Leg_Curls'],
        [/bent over row|barbell (bent over )?rows?|pendlay|t-bar row(?!.*chest)/i, 'Seated_Cable_Rows'],
        [/back squat|barbell (back )?squat|front squat|safety bar/i, 'Leg_Press'],
        [/military press|log press|standing.*press|z-press/i, 'Dumbbell_Shoulder_Press'],
        [/kettlebell swing/i, 'Barbell_Glute_Bridge']
      ],
      caution: [[/farmer|carry|carries|yoke|sandbag|keg|sled/i, 'Go lighter, stay tall, stop if your back aggravates.']]
    },
    knee: {
      label: 'Knee pain / knee injury',
      swap: [
        [/lunge|split squat|bulgarian|pistol|step-?up/i, 'Leg_Press'],
        [/jump|sprint|agility|jump rope/i, null]
      ],
      caution: [
        [/squat|hack|leg press/i, 'Only go as deep as is pain-free; control the lowering.'],
        [/leg extension/i, 'Light weight, top half of the movement only.']
      ],
      replaceText: { [/jump|sprint|agility|jump rope/i.source]: 'Low-impact cardio: bike or rower intervals' }
    },
    shoulder: {
      label: 'Shoulder pain / injury',
      swap: [
        [/upright row|behind (the )?neck/i, 'Side_Lateral_Raise'],
        [/^dips|dip \//i, 'Triceps_Pushdown_-_Rope_Attachment'],
        [/^(?!.*close).*(barbell.*bench|bench press)/i, 'Dumbbell_Bench_Press'],
        [/incline barbell/i, 'Incline_Dumbbell_Press'],
        [/pull-?ups?|chin-?ups?|muscle up/i, 'Wide-Grip_Lat_Pulldown']
      ],
      caution: [[/press|lateral|raise|fly|flye/i, 'Pain-free range only, neutral grip, stop if it pinches.']]
    },
    wristelbow: {
      label: 'Wrist / elbow pain',
      swap: [
        [/push-?ups?/i, 'Machine_Bench_Press'],
        [/^barbell( \/ incline dumbbell)? curls?|ez-?bar curls?|preacher/i, 'Hammer_Curls'],
        [/skull ?crusher|ez-bar extension/i, 'Triceps_Pushdown_-_Rope_Attachment']
      ],
      caution: [[/curl|press|row|pulldown/i, 'Neutral (palms-in) grip and wrist wraps/straps help.']]
    },
    heart: {
      label: 'Heart condition / high blood pressure',
      caution: [[/heavy|log|axle|yoke|sandbag|keg|deadlift|squat|press|sprint|hiit/i, 'Moderate weight (RPE 6–7), breathe out on effort, never hold your breath.']],
      banner: 'Heart / blood pressure: keep effort moderate (you can still talk), no breath-holding, and get your GP\'s OK before heavy training.'
    },
    asthma: {
      label: 'Asthma / breathing condition',
      caution: [[/sprint|hiit|interval|jump rope|circuit|conditioning/i, 'Warm up 10+ minutes and keep your inhaler with you.']]
    },
    arthritis: {
      label: 'Arthritis / joint pain',
      caution: [[/heavy|deadlift|squat|jump|sprint|log|axle/i, 'Lighter weight, 12–15 reps, slow tempo.']]
    },
    hernia: {
      label: 'Hernia / abdominal surgery',
      swap: [[/crunch|sit-?up|leg raise|ab roll|knee raise/i, 'Dead_Bug']],
      caution: [[/heavy|deadlift|squat|leg press|log|yoke/i, 'Avoid heavy straining; exhale on effort. Check with your doctor.']]
    },
    pregnancy: {
      label: 'Pregnant / postpartum',
      swap: [[/crunch|sit-?up|leg raise|ab roll|knee raise/i, 'Pallof_Press']],
      caution: [[/bench|skull|hip thrust|lying|glute bridge|heavy|deadlift|log/i, 'Avoid lying flat on your back after ~16 weeks; no heavy straining.']],
      banner: 'Pregnancy/postpartum: get midwife or GP clearance, avoid lying flat on your back after ~16 weeks, and skip anything that causes pain or doming of the stomach.'
    },
    lowerlimb: {
      label: 'Wheelchair user / limited leg use',
      caution: [[/squat|lunge|leg press|leg (curl|extension)|calf|deadlift|hip thrust|glute|walk|step|sprint|swing|carry|carries|bridge|kickback|abduction/i, 'Lower-body move — swap for a seated upper-body set or your physio\'s adapted exercise.']],
      banner: 'Limited leg use: lower-body exercises are flagged — replace them with seated upper-body or adapted work. Step goals don\'t apply to you.'
    }
  };

  const activeConditions = () => ((state.profile.health && state.profile.health.conditions) || []).filter(c => HEALTH_CONDITIONS[c]);

  // Returns how the plan exercise should be shown for this user's health
  function adaptForHealth(ex) {
    const name = ex.name || '';
    for (const c of activeConditions()) {
      const cond = HEALTH_CONDITIONS[c];
      for (const [re, libId] of cond.swap || []) {
        if (!re.test(name)) continue;
        const lib = libId ? libById(libId) : null;
        if (lib) {
          return { name: lib.name, libId: lib.id, notes: `Swapped from "${name}" for your ${cond.label.toLowerCase()}. ${lib.tip}`, flag: '🩹 Adapted', flagCls: 'cyan' };
        }
        const text = cond.replaceText && Object.entries(cond.replaceText).find(([src]) => new RegExp(src, 'i').test(name));
        if (text) return { name: text[1], notes: `Swapped from "${name}" for your ${cond.label.toLowerCase()}.`, flag: '🩹 Adapted', flagCls: 'cyan' };
      }
    }
    for (const c of activeConditions()) {
      for (const [re, advice] of HEALTH_CONDITIONS[c].caution || []) {
        if (re.test(name)) return { caution: advice, flag: '⚠️ Take care', flagCls: '' };
      }
    }
    return null;
  }

  // Warning for a library exercise (used in the pickers)
  function libHealthWarning(e) {
    for (const c of activeConditions()) {
      const cond = HEALTH_CONDITIONS[c];
      if ((cond.swap || []).some(([re]) => re.test(e.name))) return `Not ideal with ${cond.label.toLowerCase()}`;
      const caution = (cond.caution || []).find(([re]) => re.test(e.name));
      if (caution) return caution[1];
    }
    return '';
  }

  // --- Diet-linked training adjustments (automatic, from what you've logged) ---
  function getDietTrainingAdjustment() {
    const targetK = state.profile.calorieTarget || 2200;
    const targetP = state.profile.proteinTarget || 140;
    const today = getTodayString();
    const byDay = {};
    (state.mealLogs || []).forEach(m => {
      if (m.date >= today) return;
      if (!byDay[m.date]) byDay[m.date] = { k: 0, p: 0 };
      byDay[m.date].k += m.calories || 0;
      byDay[m.date].p += m.protein || 0;
    });
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const since = localDateStr(weekAgo);
    // Ignore near-empty days (a single snack logged) so they don't look like starving
    const days = Object.entries(byDay)
      .filter(([d, v]) => d >= since && v.k >= targetK * 0.3)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 3);
    if (days.length < 2) {
      return { status: 'nodata', setDelta: 0, focusDelta: 0, finisher: 0, message: 'Log your food for 2+ days and your workouts will adapt to how you\'re eating.' };
    }

    const avgK = days.reduce((s, [, v]) => s + v.k, 0) / days.length;
    const avgP = days.reduce((s, [, v]) => s + v.p, 0) / days.length;
    const rK = avgK / targetK;
    const rP = avgP / targetP;
    const goal = state.activeGoal;
    const intake = `Last ${days.length} days: ${fmt(avgK)} kcal (${Math.round(rK * 100)}% of target), ${Math.round(avgP)}g protein (${Math.round(rP * 100)}%).`;

    if (rK < 0.75 || rP < 0.7) {
      return { status: 'low', setDelta: -1, focusDelta: 0, finisher: 0, intake,
        message: 'Under-fuelled — volume is trimmed by 1 set per exercise so you can still recover. Eat closer to your targets to unlock full sessions.' };
    }
    if (CUT_GOALS.includes(goal) && goal === 'fatloss' && rK > 1.1) {
      const mins = Math.max(10, Math.min(30, Math.round((avgK - targetK) / 8 / 5) * 5));
      return { status: 'over', setDelta: 0, focusDelta: 0, finisher: mins, intake,
        message: `Eating above your fat-loss target — a ${mins}-minute incline-walk finisher has been added to training days to keep the deficit.` };
    }
    if ((BULK_GOALS.includes(goal) || goal === 'bodybuilding') && rK >= 0.95 && rP >= 0.9) {
      return { status: 'high', setDelta: 0, focusDelta: 1, finisher: 0, intake,
        message: (state.focusMuscles || []).length
          ? 'Fully fuelled — +1 set added on your focus-muscle exercises. Push for an extra rep or a little more weight.'
          : 'Fully fuelled — +1 set added on your first two exercises. Pick focus muscles in the Muscle Picker to target it.' };
    }
    if (rP < 0.85) {
      return { status: 'protein', setDelta: 0, focusDelta: 0, finisher: 0, intake,
        message: 'Calories are on track but protein is low — add a shake or extra lean meat to build muscle from these sessions.' };
    }
    return { status: 'ontrack', setDelta: 0, focusDelta: 0, finisher: 0, intake, message: 'Nutrition on track — sessions run as planned.' };
  }

  // "2–3 × 8–12" + delta -> "1–2 × 8–12"; returns null if there's no set count to change
  function adjustSetsText(sets, delta) {
    const m = /^(\d+)(?:\s*[–-]\s*(\d+))?(\s*×.*)$/.exec(sets || '');
    if (!m || !delta) return null;
    const a = Math.max(1, +m[1] + delta);
    const b = m[2] ? Math.max(a, +m[2] + delta) : null;
    return `${a}${b && b !== a ? '–' + b : ''}${m[3]}`;
  }

  // Everything the Workouts list needs for one exercise: health swap + diet-based volume
  function getExerciseView(ex, day, index, adj) {
    const health = adaptForHealth(ex);
    const view = {
      id: ex.id,
      name: health && health.name ? health.name : ex.name,
      sets: ex.sets,
      notes: health && health.notes ? health.notes : (ex.notes || ''),
      libId: (health && health.libId) || ex.libId,
      badges: []
    };
    if (health) view.badges.push({ text: health.flag, cls: health.flagCls, title: health.caution || '' });
    if (health && health.caution) view.notes = `${view.notes}${view.notes ? ' · ' : ''}⚠️ ${health.caution}`;
    view.lib = view.libId ? libById(view.libId) : findLibraryMatch({ name: view.name });

    if (!day.isRest && adj) {
      let delta = adj.setDelta;
      if (adj.focusDelta) {
        const focus = state.focusMuscles || [];
        const hitsFocus = focus.length
          ? view.lib && view.lib.areas.some(a => focus.includes(a))
          : index < 2;
        if (hitsFocus) delta += adj.focusDelta;
      }
      const adjusted = adjustSetsText(view.sets, delta);
      if (adjusted) {
        view.sets = adjusted;
        view.badges.push({ text: delta > 0 ? '🍗 +1 set' : '🔋 −1 set', cls: delta > 0 ? 'cyan' : '', title: adj.message });
      }
    }
    if (!day.isRest && classifyExercise(view.name)) {
      const p = trainingPrescription();
      const match = /^\d+(?:\s*[–-]\s*\d+)?\s*×\s*(.*)$/.exec(ex.sets || '');
      // Low food intake may reduce volume; extra diet sets never override the RPE cap.
      const sets = Math.max(1, p.sets + Math.min(0, adj?.setDelta || 0));
      const reps = match && !/min|sec|round/i.test(match[1]) && view.lib?.mechanic === 'compound' ? p.reps : match ? match[1] : p.reps;
      view.sets = `${sets} × ${reps}`;
      view.badges = view.badges.filter(b => !/set$/.test(b.text));
      view.badges.push({ text: `RPE ${p.rpe}`, cls: 'purple' });
      view.notes = `${view.notes.replace(/\b\d+(?:[–-]\d+)? reps in reserve[, .]*/gi, '')} · ${p.rir} reps in reserve · ${p.rest}s rest. ${p.rpe >= 9 ? 'High effort: controlled reps, stop when form breaks.' : 'Keep every rep controlled.'}`;
    }
    return view;
  }

  function renderWorkoutBanners(adj) {
    const box = $('workout-adapt-banner');
    if (!box) return;
    box.replaceChildren();
    const goal = GOAL_PRESETS[state.activeGoal] || GOAL_PRESETS.bodybuilding;

    const diet = document.createElement('div');
    diet.className = 'callout' + (adj.status === 'low' || adj.status === 'over' ? '' : ' info');
    const icon = { low: '🔋', over: '🔥', high: '🍗', protein: '🥩', ontrack: '✅', nodata: '🍽️' }[adj.status] || '🍽️';
    const message = adj.focusDelta > 0 ? 'Fully fuelled — keep the working-set volume set by your chosen RPE and focus on controlled reps.'
      : adj.finisher && trainingPrescription().rpe >= 7 ? 'Eating above your fat-loss target. Keep your RPE workout focused; an easy walk can be done separately.' : adj.message;
    diet.innerHTML = `<strong>${icon} Auto-adjusted for your diet & ${esc(goal.name)} goal:</strong> ${esc(message)}${adj.intake ? `<br><span style="font-size:11px;">${esc(adj.intake)} Targets: ${fmt(state.profile.calorieTarget)} kcal · ${state.profile.proteinTarget}g protein.</span>` : ''}`;
    box.append(diet);

    const conds = activeConditions();
    if (conds.length) {
      const h = document.createElement('div');
      h.className = 'callout';
      h.style.marginTop = '8px';
      const banners = conds.map(c => HEALTH_CONDITIONS[c].banner).filter(Boolean);
      h.innerHTML = `<strong>🩹 Adapted for your health (${esc(conds.map(c => HEALTH_CONDITIONS[c].label).join(', '))}):</strong> risky moves are swapped or flagged. Stop anything that hurts and follow your doctor/physio's advice.${banners.map(b => `<br>• ${esc(b)}`).join('')}`;
      box.append(h);
    }
  }

  // --- Add Exercise picker (full library list) ---
  let addExDayId = null;
  let addExArea = 'all';

  function openExercisePicker(dayId) {
    addExDayId = dayId;
    addExArea = 'all';
    const routine = state.routines[state.activeRoutineId];
    const day = routine && routine.days.find(d => d.id === dayId);
    $('addex-title').textContent = day ? `Add to ${day.dayName}` : 'Add Exercise';
    $('addex-search').value = '';
    renderExercisePickerList();
    openModal('modal-add-exercise');
  }

  function renderExercisePickerList() {
    const bar = $('addex-muscle-filter');
    bar.replaceChildren();
    [['all', 'All']].concat(Object.entries(MUSCLE_AREAS).map(([k, v]) => [k, `${v.icon} ${v.label}`])).forEach(([k, label]) => {
      const c = document.createElement('button');
      c.className = 'day-chip' + (addExArea === k ? ' active' : '');
      c.textContent = label;
      c.onclick = () => { addExArea = k; renderExercisePickerList(); };
      bar.append(c);
    });

    const q = $('addex-search').value.trim().toLowerCase();
    const list = $('addex-list');
    list.replaceChildren();
    const items = EXERCISE_LIBRARY
      .filter(e => addExArea === 'all' || e.areas.includes(addExArea))
      .filter(e => !q || e.name.toLowerCase().includes(q) || e.areas.some(a => MUSCLE_AREAS[a].label.toLowerCase().includes(q)) || e.equipment.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (!items.length) {
      list.innerHTML = '<div class="report-text" style="padding: 12px;">No exercises match — try another word, or create your own below.</div>';
      return;
    }
    items.forEach(e => {
      const row = document.createElement('div');
      row.className = 'addex-row';
      const img = document.createElement('img');
      img.src = assetUrl(e.images[0]);
      img.alt = '';
      img.loading = 'lazy';
      const info = document.createElement('div');
      const warn = libHealthWarning(e);
      info.innerHTML = `<div class="addex-row-name">${esc(e.name)}</div><div class="addex-row-meta">${esc(e.areas.map(a => MUSCLE_AREAS[a].label).join(', '))} · ${esc(e.equipment)}</div>${warn ? `<div class="health-flag">⚠️ ${esc(warn)}</div>` : ''}`;
      const plus = document.createElement('span');
      plus.className = 'addex-plus';
      plus.textContent = '＋';
      row.append(img, info, plus);
      row.onclick = () => {
        addLibraryExerciseToDay(e.id, addExDayId, 'end');
        closeModal('modal-add-exercise');
      };
      list.append(row);
    });
  }

  // --- Machine display photo import ---
  let machineDraft = null;
  let machineRequestToken = null;
  let machineNativeBusy = false;
  let machinePreviewUrl = null;
  let browserOcrPromise = null;
  const machineFields = { steps: 'machine-steps', calories: 'machine-calories', distanceKm: 'machine-distance', minutes: 'machine-minutes' };

  function machineMetricsText(metrics) {
    return Object.entries({ steps: 'steps', calories: 'kcal', distanceKm: 'km', minutes: 'min' })
      .filter(([key]) => metrics[key] != null)
      .map(([key, unit]) => `${Number(Number(metrics[key]).toFixed(2))} ${unit}`).join(' · ');
  }

  function renderMachineWorkouts() {
    const sessions = state.machineWorkouts.filter(session => session.date === getTodayString());
    const totals = Object.fromEntries(Object.keys(machineFields).map(key => [key, sessions.some(session => session[key] != null)
      ? sessions.reduce((sum, session) => sum + (session[key] || 0), 0) : null]));
    $('machine-daily-totals').textContent = sessions.length ? `Today: ${machineMetricsText(totals)}` : 'No machine workouts saved today.';
    $('workout-machine-summary').textContent = sessions.length ? `Machine training today: ${machineMetricsText(totals)} · ${sessions.length} session${sessions.length === 1 ? '' : 's'}` : '';
    const list = $('machine-workout-list');
    list.replaceChildren();
    [...sessions].reverse().forEach(session => {
      const row = document.createElement('div');
      row.className = 'machine-session';
      row.innerHTML = `<strong>${esc(session.name)}</strong><p class="report-text">${esc(machineMetricsText(session))}</p><p class="report-text">${session.stepsAdded ? 'Steps added to daily counter.' : 'Daily step counter unchanged.'}</p>`;
      const remove = document.createElement('button');
      remove.className = 'btn btn-outline btn-sm';
      remove.textContent = 'Remove Session';
      remove.onclick = () => {
        if (!confirm('Remove this machine workout? Steps added from this session will also be removed from today’s counter.')) return;
        state.machineWorkouts = state.machineWorkouts.filter(item => item.id !== session.id);
        if (session.stepsAdded && session.date === getTodayString()) {
          updateSteps(state.lastStepDate === getTodayString() ? Math.max(0, state.stepsToday - session.steps) : 0);
        }
        saveState();
        renderMachineWorkouts();
      };
      row.append(remove);
      list.append(row);
    });
  }

  function openMachineImport() {
    machineDraft = { id: newEntryId(), date: getTodayString(), fingerprint: '' };
    machineRequestToken = null;
    Object.values(machineFields).forEach(id => { $(id).value = ''; });
    $('machine-name').value = 'Treadmill';
    $('machine-add-steps').checked = false;
    $('machine-import-error').textContent = '';
    $('machine-photo-status').textContent = 'Take or choose a clear photo of the results screen, or enter the values below.';
    $('machine-photo-preview').style.display = 'none';
    setMachineReading(false);
    openModal('modal-machine-import');
  }

  function setMachineReading(reading) {
    ['btn-machine-camera', 'btn-machine-gallery', 'btn-save-machine-workout'].forEach(id => { $(id).disabled = reading; });
  }

  function applyMachineReading(text, boxes, fingerprint) {
    const values = parseMachineDisplay(text, boxes);
    Object.entries(machineFields).forEach(([key, id]) => { $(id).value = values[key] == null ? '' : String(Number(values[key].toFixed(3))); });
    machineDraft.fingerprint = fingerprint;
    const type = String(text).match(/treadmill|elliptical|stair\s*(?:climber|master)|rowing|rower|exercise bike|cycling/i);
    if (type) $('machine-name').value = type[0];
    const count = Object.values(values).filter(value => value != null).length;
    $('machine-photo-status').textContent = count ? 'Display read. Check every value and fill in anything missing before adding the workout.' : 'No labelled workout values found. Try a closer photo of the results screen or enter the readings below.';
  }

  function chooseMachinePhoto(source) {
    if (window.AndroidApp && typeof window.AndroidApp.readWorkoutMachinePhoto === 'function') {
      if (machineNativeBusy) { $('machine-photo-status').textContent = 'Finish the current photo capture before starting another.'; return; }
      machineRequestToken = newEntryId();
      Object.values(machineFields).forEach(id => { $(id).value = ''; });
      machineDraft.fingerprint = '';
      $('machine-add-steps').checked = false;
      machineNativeBusy = true;
      setMachineReading(true);
      $('machine-photo-status').textContent = 'Reading the display on this device…';
      try { window.AndroidApp.readWorkoutMachinePhoto(source, machineRequestToken); }
      catch (_) { machineNativeBusy = false; machineRequestToken = null; setMachineReading(false); $('machine-photo-status').textContent = 'Could not open the camera. Enter the readings below or try another photo.'; }
      return;
    }
    const input = $('machine-photo-file');
    input.value = '';
    if (source === 'camera') input.setAttribute('capture', 'environment'); else input.removeAttribute('capture');
    input.click();
  }

  window.onMachinePhotoResult = payload => {
    machineNativeBusy = false;
    if (!machineDraft || payload.token !== machineRequestToken) return;
    machineRequestToken = null;
    setMachineReading(false);
    if (payload.status === 'ok') applyMachineReading(payload.text, payload.lines || [], payload.fingerprint || '');
    else $('machine-photo-status').textContent = payload.status === 'cancelled' ? 'Photo cancelled. Choose another photo or enter the values.' : payload.status === 'permission' ? 'Allow camera access or use Choose Photo. You can also enter the values below.' : 'Could not read the display. Try a clearer photo or enter the values below.';
  };

  function browserOcr() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!browserOcrPromise) browserOcrPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(() => { script.remove(); browserOcrPromise = null; reject(new Error('Photo reading needs an internet connection for its first download.')); }, 20000);
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
      script.onload = () => { clearTimeout(timeout); resolve(window.Tesseract); };
      script.onerror = () => { clearTimeout(timeout); script.remove(); browserOcrPromise = null; reject(new Error('Photo reader unavailable. Enter the display values below.')); };
      document.head.append(script);
    });
    return browserOcrPromise;
  }

  async function readBrowserMachinePhoto(file) {
    if (!file || !machineDraft) return;
    if (!file.type.startsWith('image/') || file.size > 25 * 1024 * 1024) { $('machine-photo-status').textContent = 'Choose an image smaller than 25 MB.'; return; }
    const token = machineRequestToken = newEntryId();
    Object.values(machineFields).forEach(id => { $(id).value = ''; });
    machineDraft.fingerprint = '';
    $('machine-add-steps').checked = false;
    if (machinePreviewUrl) URL.revokeObjectURL(machinePreviewUrl);
    machinePreviewUrl = URL.createObjectURL(file);
    $('machine-photo-preview').src = machinePreviewUrl;
    $('machine-photo-preview').style.display = 'block';
    $('machine-photo-status').textContent = 'Reading the display on this device. The browser may need to download the photo reader first…';
    setMachineReading(true);
    let worker;
    let timeout;
    let readingFinished = false;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let hash = 2166136261;
      for (const byte of bytes) hash = Math.imul(hash ^ byte, 16777619);
      const reading = async () => {
        const engine = await browserOcr();
        if (readingFinished || token !== machineRequestToken) return null;
        const createdWorker = await engine.createWorker('eng', 1, { workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js' });
        if (readingFinished || token !== machineRequestToken) { await createdWorker.terminate(); return null; }
        worker = createdWorker;
        return worker.recognize(file);
      };
      const result = await Promise.race([reading(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Reading took too long. Try a closer photo or enter the values below.')), 60000); })]);
      if (result && token === machineRequestToken && machineDraft) applyMachineReading(result.data.text, [], `browser_${bytes.length}_${hash >>> 0}`);
    } catch (error) {
      if (token === machineRequestToken) $('machine-photo-status').textContent = error.message || 'Could not read this photo. Enter its values below.';
    } finally {
      readingFinished = true;
      clearTimeout(timeout);
      if (token === machineRequestToken) { machineRequestToken = null; setMachineReading(false); }
      if (worker) { try { await worker.terminate(); } catch (_) {} }
    }
  }

  function saveMachineWorkout() {
    if (!machineDraft || machineRequestToken) return;
    try {
      const name = $('machine-name').value.trim();
      if (!name) throw new Error('Enter a machine or workout name.');
      const metrics = validateMachineMetrics(Object.fromEntries(Object.entries(machineFields).map(([key, id]) => [key, $(id).value])));
      if (machineDraft.fingerprint && state.machineWorkouts.some(session => session.date === machineDraft.date && session.fingerprint === machineDraft.fingerprint)) throw new Error('This photo has already been added to this training day.');
      const stepsAdded = !!(metrics.steps > 0 && $('machine-add-steps').checked);
      if (stepsAdded && machineDraft.date !== getTodayString()) throw new Error('The day has changed. Reopen this form to add steps to today’s counter.');
      const session = { ...machineDraft, ...metrics, name, stepsAdded, source: machineDraft.fingerprint ? 'photo' : 'manual' };
      machineDraft = null;
      state.machineWorkouts.push(session);
      if (stepsAdded) updateSteps((state.lastStepDate === getTodayString() ? state.stepsToday : 0) + metrics.steps);
      saveState();
      closeModal('modal-machine-import');
      renderMachineWorkouts();
      showToast('Machine workout added to your training.');
    } catch (error) { $('machine-import-error').textContent = error.message; }
  }

  // --- Guided app tutorial: actual tabs stay clickable inside the spotlight. ---
  let tutorialStep = -1;
  let tutorialFrame = null;
  let tutorialReturnFocus = null;
  const TUTORIAL_STEPS = [
    { target: '#nav-workouts', click: true, title: 'Start with Workouts', text: 'This is your training plan. Tap the highlighted Workouts tab to see what to train today.' },
    { target: '#workout-rpe', title: 'Choose your effort', text: 'RPE sets how close you train to failure. Higher RPE creates fewer exercises and working sets. Change the slider or use a training style preset when planning your session.', tab: 'workouts' },
    { target: '#workout-days-container .exercise-item', title: 'Log your training', text: 'Use Log Sets to save weights, reps and optional RPE, compare last time and see your records. Weekly checkboxes track exercise completion. Your set history stays saved.', tab: 'workouts' },
    { target: '#nav-nutrition', click: true, title: 'Now open Nutrition', text: 'Tap Nutrition to track what you eat and prepare meals for the days ahead.' },
    { target: '#nutrition-day-controls', title: 'History and meal prep', text: 'Choose any date to review past entries or plan a future day. Copy a day to the coming week. Prepared meals stay Planned until you mark them Eaten.', tab: 'nutrition' },
    { target: '#nutrition-food-actions', title: 'Add your food', text: 'Scan packaging, search foods, or build a recipe from ingredients and exact gram weights. Your Library saves foods and recipes so you can log them again with any serving size.', tab: 'nutrition' },
    { target: '#nav-activity', click: true, title: 'Open Activity', text: 'Tap Activity for your steps, machine workouts, sleep and recovery.' },
    { target: '#machine-workout-card', title: 'Read a machine display', text: 'Photograph the final results screen, check the detected readings, then add the session. Add machine steps to the daily counter only if your phone has not counted them already.', tab: 'activity', subview: 'subview-steps' },
    { target: '#nav-profile', click: true, title: 'Open Goals & Logs', text: 'Tap Goals & Logs to keep your personal targets and progress up to date.' },
    { target: '#goal-pills-container', title: 'Make it your plan', text: 'Choose your goal and enter your own stats for suitable nutrition targets. You can log weight and progress here, adjust health preferences, and export a backup. Replay this tour any time with ? Guide.', tab: 'profile', subview: 'subview-goals' }
  ];

  function tutorialTarget() { return document.querySelector(TUTORIAL_STEPS[tutorialStep]?.target || '#btn-start-tutorial'); }

  function positionTutorial() {
    tutorialFrame = null;
    if (tutorialStep < 0) return;
    const target = tutorialTarget();
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const left = Math.max(0, rect.left - 5), top = Math.max(0, rect.top - 5);
    const right = Math.min(width, rect.right + 5), bottom = Math.min(height, rect.bottom + 5);
    const setBox = (id, x, y, w, h) => { $(id).style.cssText = `left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, h)}px;`; };
    setBox('tutorial-shade-top', 0, 0, width, top);
    setBox('tutorial-shade-bottom', 0, bottom, width, height - bottom);
    setBox('tutorial-shade-left', 0, top, left, bottom - top);
    setBox('tutorial-shade-right', right, top, width - right, bottom - top);
    setBox('tutorial-highlight', left, top, right - left, bottom - top);
    $('tutorial-highlight').style.pointerEvents = TUTORIAL_STEPS[tutorialStep].click ? 'none' : 'auto';
    const card = $('tutorial-card');
    const cardHeight = card.offsetHeight;
    const cardTop = bottom + cardHeight + 12 < height ? bottom + 12 : Math.max(12, top - cardHeight - 12);
    card.style.left = `${Math.max(12, Math.min(width - card.offsetWidth - 12, left))}px`;
    card.style.top = `${Math.min(height - cardHeight - 12, cardTop)}px`;
  }

  function queueTutorialPosition() { if (tutorialStep >= 0 && tutorialFrame == null) tutorialFrame = requestAnimationFrame(positionTutorial); }

  function showTutorialStep(index) {
    if (index >= TUTORIAL_STEPS.length) { endTutorial(); return; }
    tutorialStep = Math.max(0, index);
    const step = TUTORIAL_STEPS[tutorialStep];
    if (step.tab) switchTab(step.tab, step.subview);
    $('app-tutorial').hidden = false;
    $('tutorial-title').textContent = step.title;
    $('tutorial-text').textContent = step.text;
    $('tutorial-progress').textContent = `${tutorialStep + 1} / ${TUTORIAL_STEPS.length}`;
    $('tutorial-instruction').textContent = step.click ? 'Tap the highlighted tab to continue.' : 'Select Next to continue.';
    $('btn-tutorial-next').hidden = !!step.click;
    $('btn-tutorial-next').textContent = tutorialStep === TUTORIAL_STEPS.length - 1 ? 'Finish Tour' : 'Next';
    $('btn-tutorial-back').disabled = tutorialStep === 0;
    const target = tutorialTarget();
    if (target?.closest('details')) target.closest('details').open = true;
    target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    if (step.click) target?.focus({ preventScroll: true }); else $('btn-tutorial-next').focus({ preventScroll: true });
    positionTutorial();
    queueTutorialPosition();
  }

  function startTutorial() {
    if ($('modal-onboarding').classList.contains('active')) return;
    document.querySelectorAll('.modal-overlay.active').forEach(modal => closeModal(modal.id));
    tutorialReturnFocus = document.activeElement;
    showTutorialStep(0);
  }

  function endTutorial() {
    tutorialStep = -1;
    $('app-tutorial').hidden = true;
    state.tutorialCompleted = true;
    saveState();
    if (tutorialReturnFocus?.isConnected) tutorialReturnFocus.focus({ preventScroll: true });
  }

  document.addEventListener('click', event => {
    if (tutorialStep < 0 || !TUTORIAL_STEPS[tutorialStep].click) return;
    if (event.target.closest(TUTORIAL_STEPS[tutorialStep].target)) {
      const step = tutorialStep;
      setTimeout(() => { if (tutorialStep === step) showTutorialStep(step + 1); }, 0);
    }
  });
  document.addEventListener('keydown', event => {
    if (tutorialStep < 0) return;
    if (event.key === 'Escape') { event.preventDefault(); endTutorial(); return; }
    if (event.key !== 'Tab') return;
    const controls = [...$('tutorial-card').querySelectorAll('button:not(:disabled):not([hidden])')];
    if (TUTORIAL_STEPS[tutorialStep].click && tutorialTarget()) controls.unshift(tutorialTarget());
    const index = controls.indexOf(document.activeElement);
    event.preventDefault();
    controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus({ preventScroll: true });
  });
  window.addEventListener('resize', queueTutorialPosition);
  document.addEventListener('scroll', queueTutorialPosition, true);
  document.addEventListener('animationend', queueTutorialPosition, true);

  // --- First-launch setup wizard ---
  let onboardStep = 0;
  const ONBOARD_STEPS = 4;

  function showOnboardingIfNeeded() {
    if (state.setupComplete) { if (!state.tutorialCompleted && tutorialStep < 0) startTutorial(); return; }
    openOnboarding();
  }

  function openOnboarding() {
    onboardStep = 0;
    const p = state.profile;
    $('ob-sex').value = p.sex || 'male';
    $('ob-age').value = p.age || '';
    $('ob-weight-unit').value = p.unit || 'stone';
    $('ob-weight').value = p.weight || '';
    $('ob-height-unit').value = p.heightUnit || 'ftin';
    const { ft, inch } = cmToFtIn(p.height || 170);
    $('ob-height-ft').value = ft;
    $('ob-height-in').value = inch;
    $('ob-height-cm').value = p.height || '';
    $('ob-activity').value = String(p.activity || 1.375);
    $('ob-goal').value = state.activeGoal || 'bodybuilding';
    $('ob-kit').value = state.exerciseKit || 'gym';
    const conds = (p.health && p.health.conditions) || [];
    const box = $('ob-conditions');
    box.replaceChildren();
    Object.entries(HEALTH_CONDITIONS).forEach(([k, c]) => {
      const lbl = document.createElement('label');
      lbl.className = 'ob-check';
      lbl.innerHTML = `<input type="checkbox" value="${k}" ${conds.includes(k) ? 'checked' : ''}> <span>${esc(c.label)}</span>`;
      box.append(lbl);
    });
    $('ob-health-notes').value = (p.health && p.health.notes) || '';
    renderOnboardStep();
    $('modal-onboarding').classList.add('active');
  }

  function renderOnboardStep() {
    document.querySelectorAll('#modal-onboarding .ob-step').forEach((el, i) => { el.style.display = i === onboardStep ? 'block' : 'none'; });
    $('ob-progress').textContent = `Step ${onboardStep + 1} of ${ONBOARD_STEPS}`;
    $('btn-ob-back').style.visibility = onboardStep === 0 ? 'hidden' : 'visible';
    $('btn-ob-next').textContent = onboardStep === ONBOARD_STEPS - 1 ? '🚀 Start Training' : 'Next →';
    const isFtIn = $('ob-height-unit').value === 'ftin';
    $('ob-height-ft').style.display = isFtIn ? '' : 'none';
    $('ob-height-in').style.display = isFtIn ? '' : 'none';
    $('ob-height-cm').style.display = isFtIn ? 'none' : '';
    if (onboardStep === ONBOARD_STEPS - 1) renderOnboardSummary();
  }

  // Reads the wizard into a profile-like object without saving
  function readOnboardInputs() {
    const isFtIn = $('ob-height-unit').value === 'ftin';
    const heightCm = isFtIn
      ? ((parseFloat($('ob-height-ft').value) || 0) * 12 + (parseFloat($('ob-height-in').value) || 0)) * 2.54
      : parseFloat($('ob-height-cm').value) || 0;
    return {
      sex: $('ob-sex').value,
      age: parseInt($('ob-age').value, 10) || 0,
      weight: parseFloat($('ob-weight').value) || 0,
      unit: $('ob-weight-unit').value,
      height: +heightCm.toFixed(1),
      heightUnit: $('ob-height-unit').value,
      activity: parseFloat($('ob-activity').value) || 1.375,
      goal: $('ob-goal').value,
      kit: $('ob-kit').value,
      conditions: [...document.querySelectorAll('#ob-conditions input:checked')].map(i => i.value),
      notes: $('ob-health-notes').value.trim()
    };
  }

  function validateOnboardStep() {
    if (onboardStep !== 0) return '';
    const v = readOnboardInputs();
    const kg = toKg(v.weight, v.unit);
    if (!v.age || v.age < 13 || v.age > 100) return 'Please enter your age (13–100).';
    if (!kg || kg < 30 || kg > 300) return 'Please enter a realistic weight.';
    if (!v.height || v.height < 120 || v.height > 230) return 'Please enter your height.';
    return '';
  }

  function computeTargets(v) {
    const kg = toKg(v.weight, v.unit);
    const e = estimateEnergy({ kg, height: v.height, age: v.age, sex: v.sex, activity: v.activity, goalId: v.goal });
    return { maintenance: e.maintenance, kcal: e.target, protein: e.protein, ...getMacroTargets(e.target, e.protein), goal: e.goal, training: e.training };
  }

  function renderOnboardSummary() {
    const v = readOnboardInputs();
    const t = computeTargets(v);
    const routine = state.routines[t.goal.routineId] || state.routines.bodybuilding;
    const prevConds = state.profile.health;
    state.profile.health = { conditions: v.conditions, notes: v.notes };
    let adapted = 0, flagged = 0;
    routine.days.forEach(d => d.exercises.forEach(ex => {
      const h = adaptForHealth(ex);
      if (h && h.name) adapted++;
      else if (h) flagged++;
    }));
    state.profile.health = prevConds;
    const trainDays = routine.days.filter(d => !d.isRest).length;
    $('ob-summary').innerHTML = `
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-label">Daily Calories</div><div class="stat-val cyan">${fmt(t.kcal)}</div><div class="stat-sub">Maintenance ${fmt(t.maintenance)} (incl. ${fmt(t.training)} training)</div></div>
        <div class="stat-box"><div class="stat-label">Daily Protein</div><div class="stat-val purple">${t.protein}g</div><div class="stat-sub">${t.goal.proteinPerKg} g per kg</div></div>
      </div>
      <div class="report-text" style="margin: 8px 0;">Carbs ${t.carbs}g · Fats ${t.fat}g per day</div>
      <div class="report-section-title">Your training plan</div>
      <div class="report-text"><b style="color:#fff;">${esc(routine.title)}</b> — ${trainDays} training days a week, sets & reps tuned to ${esc(t.goal.name)}.</div>
      ${v.conditions.length ? `<div class="report-text" style="margin-top:6px;">🩹 ${adapted} exercise${adapted === 1 ? '' : 's'} swapped and ${flagged} flagged with safety tips for your health.</div>` : ''}
      <div class="report-text" style="margin-top:6px;">🍽️ Workouts will also auto-adjust to the food you log each day.</div>
      <div class="report-text" style="margin-top:6px;">You can change any of this later in <b>Goals &amp; Logs</b>.</div>`;
  }

  function finishOnboarding() {
    const v = readOnboardInputs();
    const p = state.profile;
    Object.assign(p, { sex: v.sex, age: v.age, weight: v.weight, unit: v.unit, height: v.height, heightUnit: v.heightUnit, activity: v.activity });
    p.health = { conditions: v.conditions, notes: v.notes };
    p.targetsManual = false;
    state.exerciseKit = v.kit;
    state.bodyMapSex = v.sex === 'female' ? 'female' : 'male';
    state.setupComplete = true;
    state.activeGoal = v.goal;
    state.trainingStyle = styleForGoal(v.goal);
    state.trainingRpe = TRAINING_STYLES[state.trainingStyle].rpe;
    saveState();
    $('modal-onboarding').classList.remove('active');
    initApp();
    selectGoal(v.goal, true);
    switchTab('workouts');
    showToast('All set! Your targets & plan are ready.');
  }

  function bindOnboarding() {
    $('btn-ob-next').onclick = () => {
      const err = validateOnboardStep();
      if (err) {
        alert(err);
        return;
      }
      if (onboardStep === ONBOARD_STEPS - 1) {
        finishOnboarding();
        return;
      }
      onboardStep++;
      renderOnboardStep();
    };
    $('btn-ob-back').onclick = () => {
      if (onboardStep > 0) onboardStep--;
      renderOnboardStep();
    };
    $('btn-ob-skip').onclick = () => {
      if (!confirm('Skip setup? The app will use example stats until you fill in your details on the Goals tab.')) return;
      state.setupComplete = true;
      saveState();
      $('modal-onboarding').classList.remove('active');
      startTutorial();
    };
    $('ob-height-unit').onchange = () => {
      // Carry the height across when switching units
      const isFtIn = $('ob-height-unit').value === 'ftin';
      if (isFtIn) {
        const { ft, inch } = cmToFtIn(parseFloat($('ob-height-cm').value) || 170);
        $('ob-height-ft').value = ft;
        $('ob-height-in').value = inch;
      } else {
        $('ob-height-cm').value = (((parseFloat($('ob-height-ft').value) || 0) * 12 + (parseFloat($('ob-height-in').value) || 0)) * 2.54).toFixed(1);
      }
      renderOnboardStep();
    };
    $('btn-redo-setup').onclick = () => openOnboarding();
  }

  // --- Tab Navigation Setup ---
  if ($('btn-refresh-plan')) {
    $('btn-refresh-plan').onclick = () => {
      renderNutrition();
      showToast('Meal plan refreshed!');
    };
  }

  document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      if (tab) switchTab(tab);
    };
  });

  if ($('header-goal-badge')) {
    $('header-goal-badge').onclick = () => {
      switchTab('profile', 'subview-goals');
    };
  }

  // --- Initial App Boot ---
  function renderDailyChecklists() {
    renderSupplements();
    renderSleepTracker();
    renderWorkouts();
    renderNutrition();
    renderMachineWorkouts();
  }

  // Coming back to the app after midnight / a new week refreshes "today"
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && rolloverIfNewDay()) {
      $('log-weight-date').value = getTodayString();
      syncDateSelects();
      renderDailyChecklists();
    }
  });

  function initApp() {
    $('nutrition-date').onchange = () => selectNutritionDate($('nutrition-date').value);
    $('btn-nutrition-prev').onclick = () => selectNutritionDate(shiftDate(nutritionDate(), -1));
    $('btn-nutrition-next').onclick = () => selectNutritionDate(shiftDate(nutritionDate(), 1));
    $('btn-nutrition-today').onclick = () => selectNutritionDate(getTodayString());
    $('nutrition-entry-mode').onchange = () => { nutritionEntryMode = $('nutrition-entry-mode').value; renderNutrition(); };
    $('btn-nutrition-history').onclick = showNutritionHistory;
    $('btn-copy-meal-day').onclick = () => {
      $('copy-meals-start').value = shiftDate(getTodayString(), 1);
      $('copy-meals-start').min = getTodayString();
      $('copy-meals-days').value = '7';
      $('copy-meals-replace').checked = false;
      $('copy-meals-status').textContent = '';
      openModal('modal-copy-meals');
    };
    $('btn-confirm-copy-meals').onclick = prepareComingDays;
    document.querySelectorAll('[data-close-modal]').forEach(button => { button.onclick = () => closeModal(button.dataset.closeModal); });
    $('btn-open-machine-import').onclick = openMachineImport;
    $('btn-machine-camera').onclick = () => chooseMachinePhoto('camera');
    $('btn-machine-gallery').onclick = () => chooseMachinePhoto('gallery');
    $('machine-photo-file').onchange = event => readBrowserMachinePhoto(event.target.files[0]);
    $('btn-save-machine-workout').onclick = saveMachineWorkout;
    $('btn-start-tutorial').onclick = startTutorial;
    $('btn-skip-tutorial').onclick = endTutorial;
    $('btn-tutorial-next').onclick = () => showTutorialStep(tutorialStep + 1);
    $('btn-tutorial-back').onclick = () => showTutorialStep(tutorialStep - 1);
    $('training-style').onchange = () => changeTrainingIntensity($('training-style').value);
    $('workout-rpe').oninput = () => changeTrainingIntensity();
    $('btn-open-meal-builder').onclick = openMealBuilder;
    $('meal-builder-name').oninput = () => { mealDraft.name = $('meal-builder-name').value; };
    $('btn-add-meal-ingredient').onclick = addMealIngredient;
    $('btn-save-custom-meal').onclick = saveCustomMeal;
    $('btn-close-meal-builder').onclick = () => closeModal('modal-meal-builder');
    $('btn-clear-vehicle').onclick = () => {
      runNativeStepAction('sync', () => window.AndroidApp.clearVehicleDetection());
    };
    if (!timerInterval) {
      timerRemaining = timerTotal = trainingPrescription().rest;
      updateTimerDisplay();
      document.querySelectorAll('.timer-preset-btn').forEach(b => b.classList.toggle('active', Number(b.dataset.sec) === timerTotal));
    }
    rolloverIfNewDay();
    $('log-weight-date').value = getTodayString();
    $('log-weight-unit').value = state.profile.unit;
    $('log-weight-input').value = state.profile.weight;

    renderGoalSelector();
    bindProfileInputs();
    selectGoal(state.activeGoal, false);
    recalculateCaloriesAndMacros();
    renderWorkouts();
    renderNutrition();
    renderTracker();
    renderSupplements();

    // Init Trackers & Scanners
    bindScannerAndTrackers();
    bindProgress();
    bindMusclePicker();
    renderMusclePicker();
    bindOnboarding();
    showOnboardingIfNeeded();
    dailyAutoBackup();
    renderProgress();

    // Check native steps
    if (window.AndroidApp && typeof window.AndroidApp.getTodayNativeSteps === 'function') {
      try {
        const nativeSteps = window.AndroidApp.getTodayNativeSteps();
        if (typeof nativeSteps === 'number') {
          // Goes through updateSteps so yesterday's total is archived before resetting.
          // If the app's saved count is higher (e.g. manual entries), push it down to native.
          const savedToday = state.lastStepDate === getTodayString() ? state.stepsToday : 0;
          updateSteps(Math.max(nativeSteps, savedToday), true, savedToday <= nativeSteps);
        }
        // Ask for a fresh hardware reading too; the cached count can lag while the phone batches steps
        if (hasNativeStepSync()) window.AndroidApp.syncSteps();
      } catch (_) {}
    }

    renderStepTracker();
    renderSleepTracker();
    renderMachineWorkouts();
    experience?.refresh();
    window.GhostyPhotos.hydrate(state.progressPhotos).then(() => renderProgress()).catch(error => showToast(error.message));
  }

  experience = window.GhostyExperience({
    getState: () => state, save: saveState, today: getTodayString, toKg,
    todayIndex: getTodayRoutineIndex, getDayFilter: () => selectedWorkoutDayFilter,
    setDayFilter: value => { selectedWorkoutDayFilter = value; },
    navigate: switchTab, renderWorkouts, renderNutrition, renderProgress,
    selectNutritionToday: () => selectNutritionDate(getTodayString()),
    openModal, closeModal, toast: showToast, normalize: normalizeState,
    replaceState: async next => {
      next.savedAt = Date.now();
      // Commit metadata only after all image files have been restored successfully.
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      state = next;
      writeNativeMirror();
      initApp();
    }
  });

  document.addEventListener('DOMContentLoaded', initApp);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initApp();
  }
})();
