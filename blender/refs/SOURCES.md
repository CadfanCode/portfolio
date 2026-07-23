# Reference sources for the Maxi 77 model

The files these describe are **not committed**. They are third-party material --
factory brochures, class documents, photographs -- gathered for reference and
kept local. This file records where each came from and what was taken from it,
so anyone rebuilding the model can fetch them again.

Everything in `params.py` marked with a rule reference traces back to one of
these. Everything marked FITTED does not, and is shaped by eye against them.

---

## 1. Class rules (primary dimensional source)

**File:** `maxi77-klassregler-2001.pdf`
**Title:** Klassregler for Maxi 77, 2001-03-01
**Source:** Svenska Seglarforbundet document bank
**URL:** https://www.svensksegling.se/om-oss/dokumentbanken/255-maxi77-klassregel-2001.pdf/

The best source found. These are *measured* dimensions with tolerances, used by
licensed measurers to decide whether a hull is class-legal, which makes them far
stronger evidence than brochure figures -- and directly usable as a test suite.
`verify.py` checks the model against them.

Taken from it: hull length 7615 +/-20 (D.3.2), beam 2510 +/-20 at station 4850
(D.3.2), draft 1450 +/-25 (C.5.1), freeboard 980 bow / 720 stern (C.2.2, C.2.3),
weight 2000 kg with an 800 +/-25 kg iron keel (C.3.1, E.2.2), the full rig
dimension set (C.6.1, F.2-F.5), and every sail dimension (G.4-G.8).

Also names the original Pelle Petterson drawings, which are held by Svenska
Maxi 77 Forbundet and are **not public**: A0-1 lines, A0-3 and A0-14 deck,
A0-4/A0-5A/A0-6A interior, A0-9 keel, A0-10 rudder, A1-7 rig and sail plan.
Worth requesting if the model ever needs true offsets rather than fitted curves.

## 2. Factory brochure (shape and layout)

**File:** `maxi77-factory-brochure.pdf`
**Title:** "Skrovet, dacket, inredningen och riggen pa Maxi 77"
**Source:** MaxiSidorna (owners' site), hosted at qvalinova.se
**URL:** https://www.qvalinova.se/maxisidorna/pdf/maxi_77.pdf

The period factory brochure. Six pages, and the single most useful document for
shape. Contents by page:

- **p2 "Skrovet"** -- hull profile line drawing: sheer, stem, keel, rudder,
  coachroof outline, waterline and boot stripe. The main shape reference.
- **p3 "Dacket"** -- deck fittings, and an overhead photograph that reads as a
  deck plan. **Cockpit stated as 2.30 x 2.0 m** -- a hard dimension, no other
  source gives it.
- **p4 "Inredningen"** -- the whole accommodation, in prose and five
  photographs, and the only description of it anywhere. It gives no dimension
  at all, and it is still the source for every number in the interior section
  of `params.py`, because what it does give is constraints: five berths, "tva i
  forpiken och tre i salongen"; "Forpik med fullangdskojer"; companionway steps
  that are "tva stora dragbara lador"; a shelf above the settee backrests; and
  standing headroom **at the galley**, sold as the best thing about the boat --
  which only means anything if there is not standing headroom elsewhere. Those
  are what `verify.py --model interior` checks.
- **p5 "Riggen"** -- fully dimensioned rig and sail plan drawing, cross-checking
  the class-rule rig numbers (2500 E, 7500 P, 3335 J) and naming every wire.
- **p6 "Nyheter"** -- late-model changes, including the blue topsides tape that
  replaced the earlier blue gelcoat, and confirmation the boat became a
  one-design class in 1977 with its first SM in 1979.

Two things this document settled that no specification table mentions:

1. **There is a fin between the keel and the rudder** -- "Tittar du under
   skrovet upptacker du en fena som gar mellan kolen och rodret." A small skeg
   running aft along the canoe body. Easy to miss and clearly visible in the p2
   drawing.
2. The hull is described as **U-formed** with the deck high and flat, and the
   sheer is much straighter than a typical boat of the era.

## 3. Published specifications (cross-checks)

**Good Old Boat / SailData** -- https://goodoldboat.com/saildata/boat/maxi-77/
Source of **LWL 22.15 ft (6.751 m)**, which no other source gives and which is
what pins the overhangs. Also displacement 4409 lb and ballast 1764 lb, both
agreeing with the class rules, and the IOR rig set I 30.1 / J 10.94 / P 24.61 /
E 8.2 ft, which agrees with the class rules to within a centimetre.

**Skippo** -- https://www.skippo.se/batar/batmarken/maxi-yachts/77
Swedish figures: 7.62 x 2.5 m, 1.45 m draft, 2 tonnes, 0.8 t iron keel. Sail
areas 10.82 m2 main, 23.08 m2 largest headsail, 46.42 m2 downwind.

**Wikipedia / Swedish owner sites** -- production history. The boat ran
1972-1983, roughly 3800-3900 hulls. Substantially revised in **1975**: new deck
with a forward sail box, deck raised, cabin sole lowered, coachroof extended
aft, port-side wardrobe added. Keel fastening changed to two transverse beams.
A 1980 boat is the post-1975 deck and, being past hull #699, has the moulded
inner liner.

## 4. Broker photographs (the deck and the keel)

**Source:** Scanboat listings, `scanboat.com/images/boats/...`
Full-resolution images are reachable directly; the listing pages themselves are
at `scanboat.com/en/boat-market/boats/sailingboat-maxi-77-*`.

Four photographs of three different boats. The drawings could not settle two
things and these did:

- **`maxi77-trailer-side.jpg`** (picture-30723521) -- a red Maxi 77 on a trailer,
  ashore, near-perfect side elevation with the rig down. The single most useful
  photograph found. It shows the **sloped step at the forward end of the
  coachroof**, at about station 2980, and the **keel bulb**: a rounded casting
  swelling well proud of the fin and hanging aft of its trailing edge. Both had
  been modelled wrongly from the brochure drawing, which renders the bulb as a
  flat ellipse that reads as a plan-view annotation.
- picture-30586143 -- stern quarter, afloat. Deck layout, pushpit, bathing
  ladder, and the blue band running aft to the transom.
- picture-21108475 -- bow on, afloat. Foredeck, sail box hatch, pulpit.
- picture-29645930 -- bow quarter of a green-banded boat, showing that the band
  is a moulded step and not simply a painted stripe.

`blender/tools/crop_reference.py` pulls a region out of these and enlarges it,
which is how the step and the bulb were measured.

## 5. Year-by-year build changes (which boat this is)

**URL:** http://www.zetternet.se/maxi77/andringar.htm
Owner site, listing what changed each model year against the hull numbers it
changed at. Nothing else found says *when* anything happened, which makes it the
document that decides what a 1980 boat actually has. Not committed; it is a web
page, and the lines relied on are quoted here.

- **1975** (700-1209) -- "Nytt dack med forlig forvaringsbox" and, below,
  "Basinredning i form av ett innerskrov i plast. Hojt rufftak vid nedgangen och
  ny basinredning med lagre durkniva. Hojd sittbrunnsdurk. Ruffskottet flyttas
  akterut med mindre lutning. Nya bankluckor. **Dubbla huvudskott mellan salong
  och forpik**." The interior is a moulding, not joinery; the sole is lowered;
  and there are *two* main bulkheads with a compartment between them, which is
  where the wardrobe and the clothes locker are. The brochure describes those
  two as facing each other -- "kladskapet mitt emot" -- and never explains why.
  This does.
- **1976** -- "Forbattrat fordacksstuv med dranering. Plexiglas i forluckan".
- **1978** -- "Transparent forpikslucka".
- **1979** -- "Nytt pentryutforande och innerkladsel".
- **1972** -- "Garderobsskott om babord saknas", which is what names the side
  the wardrobe is on: it is the thing the first year's boats did without.

A 1980 boat is therefore the post-1975 interior with the late galley and a
glazed foredeck hatch.

---

## Still wanted

- Straight-on profile and bow-on photographs of a 1980 boat, to check the fitted
  curves. Broker listings (Blocket, Finn.no) are the likely source.
- The original A0-1 lines drawing, if the class association will share it. That
  would replace the fitted section curves with real offsets.
- Cockpit and coachroof photographs for the deck pass.
- **A saloon photograph looking aft or up**, to settle whether there is a
  compression post under the mast. The mast is deck-stepped (F.7.1) so its load
  has to reach the keel somehow, and one is modelled -- but every interior
  photograph to hand looks forward, and none of them shows the mast station.
  See `params.HAS_MAST_POST`, which is flagged UNVERIFIED for this reason.
- The A0-4 / A0-5A / A0-6A interior drawings, named in the class rules and held
  by the class association. They would replace the whole fitted interior section
  of `params.py` the way the A0-1 lines would replace the fitted hull sections.
