"""Builds app/src/main/assets/exercise_library.js + exercise images from free-exercise-db (Unlicense)."""
import io
import json
import os
import sys
import urllib.request

from PIL import Image

SRC_JSON = sys.argv[1]
ASSETS = sys.argv[2]
RAW = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/'

# (dataset id, body-map areas it trains most, regex matching plan exercise names, coaching tip)
CURATED = [
    # Chest
    ('Barbell_Bench_Press_-_Medium_Grip', ['chest'], r'^(barbell )?(\/ ?dumbbell )?bench press|flat (barbell )?bench|barbell\/dumbbell bench', 'Shoulder blades pinned back, bar to mid-chest.'),
    ('Incline_Dumbbell_Press', ['chest'], r'incline (dumbbell|db|barbell\/dumbbell|barbell \/ dumbbell)? ?press|incline barbell', 'Upper-chest builder. 30° bench, elbows ~45°.'),
    ('Dumbbell_Bench_Press', ['chest'], r'(flat )?dumbbell (bench )?press|^db press', 'Deeper stretch than a barbell, great for chest growth.'),
    ('Dumbbell_Flyes', ['chest'], r'^dumbbell fly|flat dumbbell fly', 'Soft elbows, feel the deep stretch.'),
    ('Cable_Crossover', ['chest'], r'^(?!.*reverse).*(cable (chest )?fl(y|ye)|crossover|pec deck)', 'Squeeze hands together at the bottom.'),
    ('Pushups', ['chest'], r'push-?ups?', 'Body in a straight line, chest to the floor.'),
    ('Dips_-_Chest_Version', ['chest', 'triceps'], r'^dips', 'Lean forward to bias the chest.'),
    ('Machine_Bench_Press', ['chest'], r'machine chest press|chest press', 'Great for safe overload close to failure.'),
    # Shoulders
    ('Dumbbell_Shoulder_Press', ['shoulders'], r'(seated )?(dumbbell )?shoulder press|overhead (kettlebell |shoulder )?press', 'Press up and slightly in, don\'t arch your back.'),
    ('Side_Lateral_Raise', ['shoulders'], r'lateral raise', 'Lead with elbows, stop at shoulder height. Builds width.'),
    ('Face_Pull', ['shoulders', 'traps'], r'face pull', 'Pull to your forehead, thumbs back. Shoulder health.'),
    ('Reverse_Flyes', ['shoulders'], r'rear delt|reverse (pec|fly)', 'Rear delts make shoulders look 3D.'),
    ('Arnold_Dumbbell_Press', ['shoulders'], r'arnold', 'Rotate palms as you press for full delt work.'),
    ('Standing_Military_Press', ['shoulders', 'triceps'], r'military press|log press', 'Squeeze glutes, press straight overhead.'),
    ('Front_Dumbbell_Raise', ['shoulders'], r'front raise', 'Front delts — often already worked by pressing.'),
    # Biceps
    ('Barbell_Curl', ['biceps'], r'^barbell( \/ incline dumbbell)? curls?|ez-?bar curls?|fat grip|axle bar', 'Elbows pinned to your sides, no swinging.'),
    ('Incline_Dumbbell_Curl', ['biceps'], r'incline dumbbell curl', 'Long-head stretch for a bigger peak.'),
    ('Hammer_Curls', ['biceps', 'forearms'], r'hammer curl', 'Builds arm thickness and forearms.'),
    ('Preacher_Curl', ['biceps'], r'preacher', 'Full stretch at the bottom, no bounce.'),
    ('Concentration_Curls', ['biceps'], r'concentration', 'Slow squeeze at the top.'),
    ('Standing_Biceps_Cable_Curl', ['biceps'], r'cable (bicep )?curl', 'Constant tension through the whole rep.'),
    # Triceps
    ('Triceps_Pushdown_-_Rope_Attachment', ['triceps'], r'pushdown|push-down', 'Elbows tucked, spread the rope at the bottom.'),
    ('EZ-Bar_Skullcrusher', ['triceps'], r'skull ?crusher|ez-bar extension', 'Lower to your forehead, elbows pointing up.'),
    ('Close-Grip_Barbell_Bench_Press', ['triceps', 'chest'], r'close[- ]?grip bench', 'Heavy triceps mass builder.'),
    ('Cable_Rope_Overhead_Triceps_Extension', ['triceps'], r'overhead (cable |tricep |triceps )?ext', 'Long-head stretch — the biggest part of the triceps.'),
    ('Dips_-_Triceps_Version', ['triceps'], r'tricep(s)? dip|dips \/', 'Stay upright to keep it on the triceps.'),
    ('Bench_Dips', ['triceps'], r'bench dip', 'Easy home triceps option.'),
    ('Tricep_Dumbbell_Kickback', ['triceps'], r'kickback.*tri|tricep.*kickback', 'Upper arm still, squeeze at lockout.'),
    # Forearms
    ('Palms-Up_Dumbbell_Wrist_Curl_Over_A_Bench', ['forearms'], r'wrist curl', 'Forearms rested on the bench, curl wrists only.'),
    ('Palms-Down_Dumbbell_Wrist_Curl_Over_A_Bench', ['forearms'], None, 'Hits the top of the forearm.'),
    ('Reverse_Barbell_Curl', ['forearms', 'biceps'], r'reverse curl', 'Overhand grip builds forearm size.'),
    ('Farmers_Walk', ['forearms', 'traps'], r'farmer', 'Heavy, tall posture, crushing grip.'),
    ('Wrist_Roller', ['forearms'], r'wrist roller', 'Roll up and down slowly — big forearm pump.'),
    # Abs
    ('Cable_Crunch', ['abs'], r'cable crunch|ab crunch machine', 'Curl your ribs to your hips; don\'t pull with arms.'),
    ('Hanging_Leg_Raise', ['abs'], r'hanging (leg|knee) raise|leg raises', 'No swinging, curl the pelvis up.'),
    ('Plank', ['abs', 'obliques'], r'^(?!.*side).*plank', 'Squeeze glutes and brace like you\'re about to be punched.'),
    ('Ab_Roller', ['abs'], r'ab (roll|wheel)', 'Advanced — keep your lower back flat.'),
    ('Reverse_Crunch', ['abs'], r'reverse crunch', 'Lower abs focus.'),
    ('Dead_Bug', ['abs'], r'dead bug', 'Lower back glued to the floor.'),
    ('Crunches', ['abs'], r'^crunch', 'Short range, hard squeeze.'),
    # Obliques
    ('Russian_Twist', ['obliques'], r'russian twist', 'Rotate from the ribs, not just the arms.'),
    ('Pallof_Press', ['obliques', 'abs'], r'pallof', 'Resist the twist — great for a solid core.'),
    ('Standing_Cable_Wood_Chop', ['obliques'], r'wood ?chop', 'Power from hips through the core.'),
    ('Side_Bridge', ['obliques'], r'side plank|side bridge', 'Hips high, straight line head to feet.'),
    ('Oblique_Crunches_-_On_The_Floor', ['obliques'], r'oblique crunch', 'Elbow towards the opposite hip.'),
    ('Dumbbell_Side_Bend', ['obliques'], r'side bend', 'Slow and controlled, one side at a time.'),
    # Traps
    ('Barbell_Shrug', ['traps'], r'(barbell )?shrugs?', 'Straight up to your ears, pause at the top.'),
    ('Dumbbell_Shrug', ['traps'], r'dumbbell shrug', 'Hold the top for 1–2 seconds.'),
    ('Upright_Cable_Row', ['traps', 'shoulders'], r'upright row', 'Elbows lead, stop at chest height.'),
    # Back / lats
    ('Pullups', ['lats'], r'pull-?ups?|chin-?ups?', 'Full hang to chin over bar — king of back width.'),
    ('Wide-Grip_Lat_Pulldown', ['lats'], r'(lat )?pulldown', 'Drive elbows down to your hips.'),
    ('Seated_Cable_Rows', ['lats'], r'(seated )?cable rows?|chest supported cable', 'Chest up, squeeze shoulder blades.'),
    ('Bent_Over_Barbell_Row', ['lats', 'lowerback'], r'bent over rows?|barbell (bent over )?rows?', 'Flat back, row to your belly button.'),
    ('One-Arm_Dumbbell_Row', ['lats'], r'(single|one)[- ]arm (dumbbell )?rows?|dumbbell rows?', 'Pull your elbow to your hip pocket.'),
    ('T-Bar_Row_with_Handle', ['lats'], r't-bar|chest-supported (t-bar )?row', 'Thick mid-back builder.'),
    ('Straight-Arm_Pulldown', ['lats'], r'straight-?arm', 'Pure lat isolation, arms nearly straight.'),
    ('Inverted_Row', ['lats'], r'inverted row', 'Great home/back option under a bar or table.'),
    # Lower back
    ('Hyperextensions_Back_Extensions', ['lowerback', 'glutes'], r'back extension|hyperextension', 'Hinge at the hips, don\'t over-arch.'),
    ('Barbell_Deadlift', ['lowerback', 'hamstrings', 'glutes'], r'^(?!.*(romanian|rdl|stiff)).*deadlift', 'Brace hard, push the floor away.'),
    ('Stiff_Leg_Barbell_Good_Morning', ['lowerback', 'hamstrings'], r'good morning', 'Light weight, slow hinge.'),
    ('Superman', ['lowerback'], r'superman|bird dog', 'Easy home lower-back strength.'),
    # Glutes
    ('Barbell_Hip_Thrust', ['glutes'], r'hip thrust', 'The #1 glute builder. Chin tucked, full lockout.'),
    ('Barbell_Glute_Bridge', ['glutes'], r'glute bridge', 'Drive through heels, squeeze hard at the top.'),
    ('One-Legged_Cable_Kickback', ['glutes'], r'(cable )?kickback|hip abduction or cable', 'Squeeze the glute, don\'t arch your back.'),
    ('Pull_Through', ['glutes', 'hamstrings'], r'pull[- ]?through', 'Hips back, snap them forward.'),
    ('Thigh_Abductor', ['glutes'], r'abduction', 'Upper/side glute shape.'),
    ('Single_Leg_Glute_Bridge', ['glutes'], None, 'Home glute builder, one side at a time.'),
    # Quads
    ('Barbell_Squat', ['quads', 'glutes'], r'back squat|barbell (back )?squat|^squats?$|front squat|safety bar', 'Full depth, knees track over toes.'),
    ('Leg_Press', ['quads', 'glutes'], r'leg press', 'Lower back stays on the pad.'),
    ('Hack_Squat', ['quads'], r'hack squat', 'Quad-focused squat on a machine.'),
    ('Leg_Extensions', ['quads'], r'leg extension', 'Pause and squeeze at the top.'),
    ('Goblet_Squat', ['quads', 'glutes'], r'goblet|bodyweight squats?', 'Weight at chest, sit between your heels.'),
    ('Dumbbell_Lunges', ['quads', 'glutes'], r'lunges?', 'Long stride hits glutes, short stride hits quads.'),
    ('Split_Squat_with_Dumbbells', ['quads', 'glutes'], r'split squat|bulgarian', 'Brutal but brilliant single-leg builder.'),
    # Hamstrings
    ('Romanian_Deadlift', ['hamstrings', 'glutes'], r'romanian|rdl|stiff[- ]leg', 'Push hips back, feel the hamstring stretch.'),
    ('Lying_Leg_Curls', ['hamstrings'], r'^(?!.*seated leg curl).*(lying leg curl|leg curl)', 'Control the way down.'),
    ('Seated_Leg_Curl', ['hamstrings'], r'seated leg curl', 'Lean forward for a bigger stretch.'),
    ('Stiff-Legged_Dumbbell_Deadlift', ['hamstrings'], r'dumbbell romanian', 'Dumbbell / home version of the RDL.'),
    ('Natural_Glute_Ham_Raise', ['hamstrings'], r'nordic|glute[- ]ham', 'Very hard — lower as slowly as you can.'),
    ('One-Arm_Kettlebell_Swings', ['hamstrings', 'glutes'], r'swing', 'Explosive hip snap, not a squat.'),
    # Calves
    ('Standing_Calf_Raises', ['calves'], r'(standing )?calf raises?|calf & ankle', 'Full stretch at the bottom, pause at the top.'),
    ('Seated_Calf_Raise', ['calves'], r'seated calf', 'Bent-knee version hits the deeper soleus.'),
    ('Calf_Press_On_The_Leg_Press_Machine', ['calves'], r'calf press', 'Easy to load heavy.'),
    ('Standing_Dumbbell_Calf_Raise', ['calves'], None, 'Home version — use a step for range.'),
    ('Donkey_Calf_Raises', ['calves'], r'donkey', 'Huge stretch for stubborn calves.'),
]

AREA_FROM_DATASET = {
    'chest': 'chest', 'shoulders': 'shoulders', 'biceps': 'biceps', 'triceps': 'triceps', 'forearms': 'forearms',
    'abdominals': 'abs', 'traps': 'traps', 'neck': 'traps', 'lats': 'lats', 'middle back': 'lats',
    'lower back': 'lowerback', 'glutes': 'glutes', 'abductors': 'glutes', 'quadriceps': 'quads',
    'adductors': 'quads', 'hamstrings': 'hamstrings', 'calves': 'calves'
}


def kit(equipment):
    if equipment in (None, 'body only'):
        return 'bodyweight'
    if equipment in ('dumbbell', 'kettlebells', 'bands', 'exercise ball', 'medicine ball'):
        return 'home'
    return 'gym'


def fetch_image(path, out_path):
    if os.path.exists(out_path):
        return os.path.getsize(out_path)
    with urllib.request.urlopen(RAW + path, timeout=30) as r:
        data = r.read()
    img = Image.open(io.BytesIO(data)).convert('RGB')
    img.thumbnail((480, 480))
    img.save(out_path, 'JPEG', quality=72, optimize=True, progressive=True)
    return os.path.getsize(out_path)


def main():
    db = {e['id']: e for e in json.load(open(SRC_JSON, encoding='utf-8'))}
    img_dir = os.path.join(ASSETS, 'exercises')
    os.makedirs(img_dir, exist_ok=True)
    out = []
    total = 0
    for ex_id, areas, match, tip in CURATED:
        e = db[ex_id]
        secondary = sorted({AREA_FROM_DATASET[m] for m in e['primaryMuscles'] + e['secondaryMuscles'] if m in AREA_FROM_DATASET} - set(areas))
        images = []
        for i, path in enumerate(e['images'][:2]):
            name = f'{ex_id}_{i}.jpg'
            total += fetch_image(path, os.path.join(img_dir, name))
            images.append('exercises/' + name)
        out.append({
            'id': ex_id,
            'name': e['name'],
            'areas': areas,
            'secondary': secondary,
            'equipment': e['equipment'] or 'body only',
            'kit': kit(e['equipment']),
            'level': e['level'],
            'mechanic': e.get('mechanic') or '',
            'match': match,
            'tip': tip,
            'instructions': e['instructions'],
            'images': images,
        })
    js = ('/* Generated by build_library.py from free-exercise-db (https://github.com/yuhonas/free-exercise-db, Unlicense). */\n'
          'window.EXERCISE_LIBRARY = ' + json.dumps(out, ensure_ascii=False, indent=1) + ';\n')
    open(os.path.join(ASSETS, 'exercise_library.js'), 'w', encoding='utf-8', newline='\n').write(js)
    print(f'{len(out)} exercises, images {total / 1e6:.1f} MB, js {len(js) / 1e3:.0f} KB')


main()
