# LLM — Luggage Logistics Manager

> A system built to handle and ease the stress and confusion associated with collecting, transporting, and accounting for participants' luggage.

---

## 1. Vision

Every year, event organizers face the same chaos: hundreds of participants, thousands of bags, one transport day, and a destination that's far from the departure point. Bags get lost, mixed up, or unaccounted for — and when a participant can't find their luggage at the destination, nobody knows who to blame or where the bag went.

**LLM** resolves this by providing a single platform where:

- **Participant luggage is checked in** on transport day (origin side), and
- **Luggage is handed over** to the participant on arrival (destination side),

all recorded with **timestamps** and the **names of responsible officers** — creating a complete, auditable chain of custody for every bag.

---

## 2. Problem Statement

| Problem | Impact |
|---|---|
| No record of how many bags each participant boarded with | Disputes when bags go missing; organizers can't reconcile counts |
| No accountability — anyone can touch any bag | Theft and mishandling can't be traced |
| No proof of handover at the destination | Participants claim bags were never returned; officers claim they were |
| Manual registers (paper) are slow and illegible | Long queues, errors, hours wasted on transport day |
| No visibility mid-transit | Nobody knows if the bag is on the bus, still at origin, or unloaded |

**Consequence:** lost time, lost trust, and lost luggage.

---

## 3. Goals (SMART)

1. **Accountability** — Every luggage event (check-in, transfer, handover) is recorded with officer name + timestamp. No action can happen without an accountable officer.
2. **Traceability** — Every bag can be traced from check-in → loading → transit → unloading → handover, in real time.
3. **Speed** — A participant can check in their luggage in under 30 seconds (barcode-driven).
4. **Accuracy** — Automated reconciliation: number of bags checked in at origin must equal number handed over + outstanding, per transport vehicle.
5. **Post-event audit** — Full history exportable per participant, per bag, per officer, per vehicle.

---

## 4. Target Users & Roles

| Role | Description | Core Needs |
|---|---|---|
| **Participant** | Event attendee travelling with luggage | Fast check-in, proof of check-in (receipt/tag), fast handover on arrival |
| **Check-in Officer** (origin) | Collects and tags bags at departure | Quick scan/registration, bag tag printing, queue control |
| **Load/Security Officer** | Moves bags into vehicles | Verification that every scanned bag is actually loaded |
| **Transport Officer / Driver** | Transports bags to destination | Vehicle manifest, count confirmation |
| **Handover Officer** (destination) | Returns bags to participants | Scan participant ID, match bag, record handover |
| **Logistics Manager / Admin** | Oversees the whole operation | Dashboard, reconciliation, reports, user management |

---

## 5. Core Workflow (Chain of Custody)

```
1. CHECK-IN (Origin)
   Participant presents ID + bags
   Officer registers bags -> system issues unique Bag Tag (barcode/QR)
   Participant receives receipt; bag status = CHECKED_IN

2. LOADING (Origin)
   Officer scans each bag into a designated vehicle
   Bag status = LOADED (vehicle: BUS-01)
   Vehicle manifest generated

3. TRANSIT (On the road)
   Vehicle status = IN_TRANSIT (optional GPS ping)
   No bag activity expected; bag status = IN_TRANSIT

4. UNLOADING (Destination)
   Handover officers scan bags off the vehicle
   Bag status = UNLOADED (destination)

5. HANDOVER (Destination)
   Participant presents ID
   Officer scans participant + bag; system verifies match
   Participant signs/confirms; bag status = HANDED_OVER (timestamp recorded)

6. RECONCILIATION (Continuous)
   Checked-in count == Handed-over + Outstanding
   Outstanding bags flagged immediately to the Logistics Manager
```

---

## 6. Functional Requirements

### 6.1 Participant Management
- FR-1: Register participants (name, phone, ID number, bus/group assignment).
- FR-2: Search participants by name, ID, or phone.

### 6.2 Check-in (Origin)
- FR-3: Register one or more bags per participant in a single session.
- FR-4: Auto-generate unique bag tags (sequential code + barcode/QR) and print tags.
- FR-5: Record check-in officer's name and timestamp automatically.
- FR-6: Print a participant receipt listing all checked bags.

### 6.3 Loading & Transport
- FR-7: Assign bags to vehicles (bus/van) by scanning.
- FR-8: Generate a vehicle manifest (bag codes + participant names).
- FR-9: Prevent a bag from being loaded twice.
- FR-10: Departure confirmation — lock vehicle manifest when vehicle leaves.

### 6.4 Unloading & Handover (Destination)
- FR-11: Scan bags off the vehicle; record unloading officer + timestamp.
- FR-12: Handover requires participant identity check + bag scan; record officer + timestamp.
- FR-13: Handover to a different person than the owner requires manager approval (override with reason).

### 6.5 Search & Audit
- FR-14: Bag lookup by tag code → shows full history timeline (who, what, when).
- FR-15: Participant lookup → shows all bags + current statuses.
- FR-16: Officer activity log — every action performed by each officer.
- FR-17: Reconciliation report per vehicle / per batch (checked-in vs handed-over vs outstanding).

### 6.6 Administration
- FR-18: Role-based user accounts and access control.
- FR-19: Batch/event management (create a new "transport day" event).
- FR-20: Export all records (CSV/Excel) for post-event audit.

---

## 7. Non-Functional Requirements

- **Offline capability:** Transport-day operations can hit network dead zones — the app must work offline and sync later.
- **Speed:** Tag scanning → confirmation in < 1 second.
- **Concurrency:** Must handle peak check-in surges (e.g., 500 participants in 2 hours).
- **Security:** Officers must log in; actions are attributed to logged-in users only.
- **Data integrity:** No bag can exist without a check-in event; no handover without a matching check-in.
- **Simplicity of UI:** Officers in the field (many on mobile) should need zero training beyond a 5-minute demo.

---

## 8. Proposed Tech Stack (draft)

| Layer | Options | Notes |
|---|---|---|
| Frontend | Web app (responsive) + optional mobile PWA | One codebase, works on phones and tablets |
| Backend | Node.js / Python (FastAPI) / Django | API-first design |
| Database | PostgreSQL / SQLite (offline-first sync) | Relational chain-of-custody data |
| Barcode | Code 128 / QR via thermal label printer | Zebra or generic TSC printers |
| Deployment | Cloud (Railway/Render/AWS) + local fallback | Event-day resilience |

---

## 9. MVP Scope (v1)

**In:** Participant + bag registration, tag printing, vehicle loading manifest, handover scanning, participant/bag lookup, reconciliation dashboard, CSV export, basic role-based login.

**Out (later):** GPS vehicle tracking, SMS/WhatsApp notifications to participants, lost-bag case management, photo capture of bags, offline mode.

---

## 10. Open Questions (to resolve during elaboration)

1. Does the event have internet at origin/destination, or must we plan for fully offline operation?
2. How are participants identified — event ID card, phone number, national ID, or check-in code?
3. Will LLM handle *pre-arrival* luggage (bags dropped days before transport day)?
4. What is the expected peak volume (participants, bags per participant, number of vehicles)?
5. Is there an existing participant/registration database to integrate with?
6. Who supplies the tag printers and scanners — and what models?
7. Should participants be able to *claim* bags without a tag (lost tag scenario)?
8. Do we need multi-language support?

---

## 11. Success Metrics

- % of bags with complete chain of custody (target: 100%)
- Check-in throughput (target: > 120 bags/hour per officer)
- Lost/unaccounted bags (target: 0)
- Time from vehicle arrival to last handover (target: < 45 min per vehicle)
- Dispute resolution time (target: < 5 min via bag lookup)

---

## 12. Roadmap

| Phase | Timeline (indicative) | Deliverables |
|---|---|---|
| 1. Elaboration | Week 1 | This README validated, open questions answered |
| 2. Prototype | Week 2 | Clickable prototype / demo of check-in + handover |
| 3. MVP build | Week 3–6 | Full v1 system, tested on a dry run |
| 4. Pilot | Event day | Live operation with a small group, post-mortem |
| 5. Hardening | Post-pilot | Fixes, offline mode, notifications, reporting |

---

## 13. Conclusion

LLM turns luggage handling from a source of chaos into a quiet, predictable process. Every bag gets an identity, every hand gets a name, every action gets a timestamp. Participants stop worrying about their bags, officers stop getting blamed unfairly, and organizers finally have the numbers to prove everything went right.

> **"Every bag accounted for. Every step timestamped. Every hand known."**
