# LLM Prototype — Barcode Scanner Manual

How scanning works in this prototype, and how to test it without a scanner.

## 1. How the scanner works

The prototype targets **USB barcode scanners of the "keyboard wedge" (HID) type** — the most
common and cheapest kind. No drivers or apps are needed:

1. The scanner is plugged into the laptop/tablet via USB.
2. It behaves exactly like a keyboard: when you scan a barcode, it **types the code
   character-by-character** into whatever field is focused, then **sends an `Enter` keypress**
   (most scanners are configured this way out of the box).
3. In LLM, every scan field listens for `Enter` — the scan is submitted automatically.

So the entire scan flow is: **field is focused → scan → code appears → Enter fires → action happens**.
Nothing else needs to happen in the UI.

**Camera scanning is also available on every scan field** — click the camera button next to the
field (or scan from a phone/tablet) and hold the barcode or QR code in front of the rear camera.
When the code is decoded, it is submitted exactly as if it had been typed and Enter pressed.

## 2. Focus management (why scanning "just works")

Every screen that accepts a scan **auto-focuses its input field**:

- On screen load (`autoFocus`)
- After every completed action, the field re-focuses for the next scan

**Rule of thumb: if a scan isn't registering, click into the scan field first** (or tap it on a
tablet) so it has focus, then scan.

## 3. What each screen scans

| Screen | What you scan | What happens | Sample codes |
|---|---|---|---|
| **Check-in** (Origin) | Participant ID card | Participant is found; register 1–9 bags, print tags | `ID-1001` (Abena Boateng), `ID-1002` (Kwame Asante) |
| **Loading** (Origin) | Bag tag | Bag is loaded onto the truck; scan the next one | `LLM-0001`, `LLM-0002`, … |
| **Handover** (Destination) | 1. Participant ID, 2. Bag tag | ID verified → scan each bag to return it | `ID-1001` then `LLM-0001` |
| **Lookup** (Audit) | Bag tag or participant ID | Full chain-of-custody timeline | `LLM-0001`, `ID-1003` |

Codes are **case-insensitive** (`llm-0001` works) and surrounding whitespace is trimmed
(scanners often append extra characters depending on configuration).

## 4. Testing without a scanner

No hardware needed — every scan field also works by typing:

1. Click/tap the scan field.
2. Type a code (see samples above).
3. Press `Enter`.

This is exactly the same code path a scanner uses, so what works with the keyboard works with
the scanner.

### Sample end-to-end run

1. **Check-in**: type `ID-1001`, press Enter → Abena Boateng appears → set 2 bags →
   "Check in 2 bags" → tag sheet with barcodes → Done. The new tags start at `LLM-0001`
   (the database starts empty — there are no pre-existing bags). The field clears itself
   after every successful scan so a USB scanner never appends to a previous code.
2. **Loading**: scan `LLM-0001`, Enter → loaded onto TRUCK-01. Keep scanning the other
   `LLM-00xx` tags, then "Confirm departure" (it warns if nothing is loaded or bags are
   left behind).
3. **Truck returns**: at destination, **Handover** offloads the truck ("Confirm arrival"
   or scan/offload each bag) — the truck is now `AT DESTINATION`. Switch to **Loading**
   and press "Return TRUCK-01 to origin" before the next batch can be loaded.
4. **Handover**: switch the officer to a Handover Officer → scan `ID-1001`, then `LLM-0001`
   → bag returned. Bags must be `UNLOADED` first (Loading → departure → offload first).
5. **Lookup**: scan `LLM-0001`, Enter → see its full history (check-in → loaded → transit →
   unloaded → handed over).

## 5. Validation the system performs on scan

| Scenario | Result |
|---|---|
| Unknown tag or participant | Red inline error / toast — nothing changes |
| Bag already loaded | Rejected with a message |
| Handover: bag belongs to a different participant | **MISMATCH** error — bag not returned |
| Handover: bag not yet unloaded | Rejected with its current status |
| Handover: bag already returned | Rejected |

## 6. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Scanning does nothing | Field not focused | Click/tap the scan field, then scan |
| Code types but nothing submits | Scanner sends no `Enter` suffix | Configure the scanner to append `Enter` (see its manual — usually a settings barcode like "Suffix: CR/LF") |
| Letters/characters missing from code | Keyboard layout mismatch | Set the device keyboard layout to the language the scanner emulates (US English) |
| Scan goes to the wrong field | Focus is in another field (e.g., stepper button) | Re-click the scan field; after each action the correct field re-focuses |
| Scan submits too early / code split in two | Scanner suffix is `Tab` or sends characters slowly | Configure suffix to `Enter` only |
| Camera button does nothing / camera won't start | Browser requires a secure context | Open the app over **HTTPS** or `localhost` — cameras are blocked on plain `http://192.168.x.x`. On phones also allow camera permission when prompted |

## 7. Real vs. demo codes

The prototype ships with **no demo bags** — the bag database starts empty so every event
starts from a clean slate (the Dashboard has an "Empty database" button to clear all bags).

- **Participants**: supplied by the **Registration app** (`registration/`). It keeps the
  master list in shared browser storage (`llm-participants-v1`); LLM reads it automatically
  (and live — if both apps are open in tabs, LLM picks up changes as they happen) and falls
  back to a sample list (`ID-1001` … `ID-1008`) when none exists. For the shared storage to
  work, both apps must be served from the same origin: build the registration app
  (`cd registration && npm run build`) and open it at `http://localhost:5173/registration/`
  on the prototype's dev server. Alternatively export JSON/CSV from the registration app and
  import it on the LLM Dashboard (both formats supported; duplicates are dropped).
- **Bags**: none on load. Newly checked-in bags are auto-numbered from `LLM-0001`, and their
  tags carry a real Code 128 barcode ready for thermal-label printing.
