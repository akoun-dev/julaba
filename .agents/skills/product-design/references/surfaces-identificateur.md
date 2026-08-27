# Surface: Identificateur

Mobile-first field agent tool for market actor identification and enrollment.

## Color System

| Token     | Value     | Usage                              |
| --------- | --------- | ---------------------------------- |
| Primary   | `#9F8170` | Active tabs, icon accents, FAB    |
| Primary 10| `#9F8170/10` | Subtle backgrounds              |
| Background| `#FAFAF7` | Page background (shared with marchand) |

## Layout

- Single column, full width (same conventions as marchand).
- Bottom navigation: 5 tabs. Voice ("Tata") tab disabled (PD-007).
- FAB: "Nouveau dossier" — `bottom-20 right-6`, brand-colored circle.
- Screen root: `screen-enter pb-24`.

## Key Screens

### Auth
- PIN-only (4-digit numpad). No voice, no pattern, no visual code.
- Demo account: `05 55 55 55 55` / `0000`.
- Simpler than marchand auth: field agents use company devices.

### Home (Dashboard)
- Agent greeting (not "Maman" — that's marchand-only).
- 4 counter cards: Brouyon, Atann, Validé, Rejeté.
- Mission progress bar (monthly target).
- Quick access links.

### Identification (9-section form)
- Auto-save every 30 seconds.
- Sections: Photo, Type, Mandatory fields, Complementary, Dynamic fields, GPS, Notes, Documents, Submit.
- Actor types: Marchand, Producteur, Coopérative — each has different dynamic fields.
- GPS: auto-capture coordinates via `navigator.geolocation`.
- Drafts saved locally, can be resumed.

### Suivi (Tracking)
- Dossiers grouped by status: En attente, Validés, Rejetés.
- Actions: Valider, Rejeter (with reason), Korijé (retry for rejected).

## Interaction Patterns

### Bottom Sheet for Editing
- Use shadcn `Sheet` (side="bottom") for editing dossiers.
- Full-width on mobile, max-width 640px centered.

### AlertDialog for Destructive Actions
- Use shadcn `AlertDialog` for: Supprimer brouillon, Rejeter dossier.
- Destructive CTA: "Supprimer le brouillon" (Verb + Object, per `copy.md`).

### Photo Capture
- Uses device camera via `<input type="file" accept="image/*" capture="environment">`.
- Preview with file reader, not a heavy image library.

## States to Cover

- **Loading:** Skeleton screens for dossier lists.
- **Empty:** "Aucun brouillon" / "Aucun dossier en attente".
- **Draft progress:** Visual indicator of completion % (section checkmarks).
- **GPS denied:** Fallback message, form still submittable without GPS.
- **Camera denied:** Fallback to file upload.
- **Long content:** Actor names up to 40 chars, notes field multiline.
- **Constrained width:** Tested at 375px minimum.
