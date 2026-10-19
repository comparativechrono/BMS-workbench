"""The chapter of the starter practical on the Anatomy tab (the human body in 3D, from Z-Anatomy): finding your way
round a system, selecting and isolating structures, find tasks, sections, labels and pictures. Generic anatomy only.
Imported by chapters.py, which calls chapter(num)."""
from lib import *
from lib import chapter as lib_chapter  # (chapter() below is this module's own)


def chapter(num):
    body = f'''
<p>The <b>Anatomy</b> tab shows the body in 3D, system by system: the skeleton, the muscles, the heart and the vessels, the organs, the brain and the nerves. Each structure is a separate model that you can select, hide, isolate or cut through, and each has its English and Latin names and a short definition. The models come from <a href="https://www.z-anatomy.com/" target="_blank" rel="noopener">Z-Anatomy</a>, an open atlas of anatomy built largely from BodyParts3D, a 3D reconstruction of a man’s body.</p>
{callout("concept", "Directions in the body", "<p>Anatomy describes the body in the <em>anatomical position</em>: standing, facing forwards, arms by the sides with the palms forwards. <b>Anterior</b> is towards the front and <b>posterior</b> towards the back; <b>superior</b> is towards the head and <b>inferior</b> towards the feet; <b>medial</b> is towards the midline and <b>lateral</b> away from it. Left and right are always the body’s own: in a view from the front, the body’s left is on <em>your</em> right, as when you face someone. The small figure at the bottom left of the view shows which way the body faces (S, I, A, P, L and R).</p>")}

<h2 id="an-around">Finding your way round</h2>
<p>The list on the left (<b>Systems</b>) shows and hides the systems of the body; the eye beside each makes it faint, so that you can see what lies behind it. Below it, the structures of the systems shown are listed in groups, and the search box finds any structure by its English or Latin name.</p>
{activity("The endocrine glands", [
    task("an-open", f'Show the endocrine glands {anat("endocrine")}. The skeleton stays faint behind them, so that you can see where each gland lies.', auto="anat:system id=endocrine on=true"),
    task("an-turn", 'Turn the body round: drag it (one finger on a touch screen), and scroll or pinch to zoom. Then try the standard views in the <b>View</b> menu (or the keys <kbd>1</kbd> to <kbd>6</kbd>).', auto="anat:view"),
    task("an-select", 'Click on the thyroid gland, at the front of the neck. Its name, its Latin name and the start of its Wikipedia article appear in the panel on the right (on a small screen, tap its name at the bottom of the view).', auto="anat:select id=thyroid-gland"),
    task("an-find", f'{anatfind("suprarenal-gland", "Find a suprarenal gland")} (also called the adrenal gland). If you are stuck, <b>Show me</b> makes it glow.', auto="anat:find ok=true target~suprarenal"),
    task("an-pit", f'Look at the pituitary gland, the <em>hypophysis</em>, under the brain {anat("endocrine:adenohypophysis")}. It has two parts: the adenohypophysis (the anterior pituitary) and the neurohypophysis (the posterior pituitary). Click on each, and find the hypothalamus just above them.', auto="anat:select base~hypophysis"),
])}
{q("an-q-thyroid", f'Show the endocrine glands with the respiratory system {anat("endocrine+respiratory@anterior")}. What does the thyroid gland lie against, and where is its isthmus?', "It lies against the front and sides of the larynx and the trachea: its two lobes are on either side of them, and the isthmus that joins the lobes crosses the front of the trachea just below the cricoid cartilage (over the second to fourth rings of the trachea, at about the level of the vertebrae C5 to T1).")}
{q("an-q-pit", "The neurohypophysis is part of the brain, and the adenohypophysis is a gland that grew up from the roof of the mouth. How does the hypothalamus control each of them?", "The neurohypophysis is made of the axons of neurons whose cell bodies lie in the hypothalamus: they run down the pituitary stalk and release their hormones (oxytocin and vasopressin, ADH) straight into the blood. The adenohypophysis has no nerves from the hypothalamus: the hypothalamus controls it with releasing and inhibiting hormones, which travel to it in the blood of the hypophysial portal vessels of the stalk.")}

<h2 id="an-heart">The heart and the great vessels</h2>
{activity("Look at the heart", [
    task("an-heart", f'Show the heart and the great vessels {anat("heart")}: the chambers and the valves, the coronary vessels, the aorta, the pulmonary arteries and veins, and the venae cavae.', auto="anat:system id=heart on=true"),
    task("an-iso", 'Click on the left ventricle and click <b>Isolate</b> in the panel (or press <kbd>I</kbd>): only the left ventricle is shown. Turn it round, then click <b>Show the others</b>.', auto="anat:isolate base~left ventricle on=true"),
    task("an-find-pt", f'{anatfind("pulmonary-trunk", "Find the pulmonary trunk")}, the artery that leaves the right ventricle and divides into the two pulmonary arteries.', auto="anat:find ok=true target=pulmonary-trunk"),
    task("an-fade", 'Select the aortic arch and click <b>Fade the others</b>: everything else becomes faint, so that you can follow the arch and the branches that leave it. Click <b>Unfade the others</b> when you have looked.', auto="anat:fade on=true"),
])}
{mcq("an-q-front", "Look at the heart from the front (the anterior view). Which chamber forms most of its front (sternocostal) surface?", [
    ("The right ventricle", True, "Yes. The heart is turned so that the right ventricle faces forwards, behind the sternum; the left ventricle forms the apex and the left border, and the right atrium the right border."),
    ("The left ventricle", False, "Not most of it: from the front, the left ventricle shows only as a strip along the left border and at the apex. The heart is turned so that the right ventricle faces forwards."),
    ("The right atrium", False, "The right atrium forms the right border of the heart in the anterior view, but most of the front is the right ventricle."),
    ("The left atrium", False, "No: the left atrium is the most posterior chamber, and forms most of the base (the back) of the heart."),
])}

<h2 id="an-section">Cutting through the body</h2>
<p>Medical images are sections: a CT or MRI scan shows the body in transverse (axial), coronal or sagittal slices, and a histological section is a slice too. <b>Section</b> cuts through the model, so that you can match a slice to the organs in 3D. The bar at the bottom of the view moves the cut, and <b>Flip</b> keeps the other part.</p>
{activity("Sections", [
    task("an-cut", f'Cut through the abdomen at the level of the kidneys, and look at the cut from above {anat("digestive+urinary+skeleton+section:transverse@0.63@superior")}.', auto="anat:section axis=transverse"),
    task("an-slide", 'Move the cut down, towards the pelvis, with the slider (to less than halfway), and watch which organs are cut.', auto="anat:section axis=transverse at<0.55"),
    task("an-sag", f'Make a sagittal section through the middle of the body, seen from the left {anat("heart+respiratory+digestive+urinary+skeleton+section:sagittal@0.5@left")}: the trachea, the oesophagus, the heart and the vertebral column are cut along their length.', auto="anat:section axis=sagittal"),
])}
{q("an-q-kidney", "In the transverse section at the level of the kidneys, where do the kidneys lie compared with the vertebral column and the intestines?", "On either side of the vertebral column, against the posterior wall of the abdomen, behind the intestines and the peritoneum (they are retroperitoneal), at about the level of the vertebrae T12 to L3. The liver lies above the right kidney, which is why the right kidney lies a little lower than the left.")}

<h2 id="an-pics">Labels and pictures</h2>
{activity("Label the glands and keep a picture", [
    task("an-labels", f'Show the endocrine glands with their labels {anat("endocrine+labels")} (the <b>Labels</b> button, or <kbd>L</kbd>): each gland is named at the side of the view. Turn the body round and watch the labels follow.', auto="anat:labels on=true"),
    task("an-picture", 'Take a picture of the view with the camera button at the right of the toolbar. It is saved in your files, in the folder <code>anatomy</code>, with the labels and the credit of the models.', auto="anat:capture"),
    task("an-files", f'Find your picture in the <b>Files</b> tab {bench("editor", "show me")} and click on it to see it.', auto="editor:view path~/anatomy/"),
])}
{callout("tip", "Using the pictures", "<p>The models are shared under the Creative Commons Attribution-ShareAlike licence (CC BY-SA 4.0): you may use the pictures, in a report or a poster, as long as you keep the credit to Z-Anatomy and BodyParts3D that is at the bottom of each picture, and share what you make with them under the same licence. The tab’s <b>About</b> panel says where each part of the models comes from, and what is not included (the body is a man’s, and there is no ear, no skin and no inside of the kidney).</p>")}
'''
    return lib_chapter("anatomy", num, "Anatomy in 3D", "anatomy", "Anatomy in 3D", 20,
                   "The body in 3D, system by system: turn it round, find the organs and structures of physiology, see what lies next to what, and cut through it as a scan does.", body)
