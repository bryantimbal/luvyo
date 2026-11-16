# Google Play preparation

## Packaging
SakayPinoy is a PWA. Ship it to Play as a **Trusted Web Activity** using Bubblewrap:

```bash
npx @bubblewrap/cli init --manifest https://<your-domain>/manifest.webmanifest
```

```bash
npx @bubblewrap/cli build
```

- Suggested package ID: `ph.sakaypinoy.app`. Confirm the domain is yours before choosing it.
- Host `/.well-known/assetlinks.json` with the app signing key fingerprint.
- Target the current API level that Play requires.

## Assets
| Asset | File |
|---|---|
| App icon 512×512 | `docs/store/app-icon-512.png` |
| Feature graphic 1024×500 | `docs/store/feature-graphic-1024x500.png` |
| Phone, 7" and 10" screenshots | Capture from production data (don't publish DEV DATA screenshots) |

## Listing text
**Name:** SakayPinoy – Commute Companion
**Short description (≤80):** Compare jeep, bus, MRT/LRT, tricycle & ride-hailing fares and travel times.
**Full description:**
> One destination. Multiple ways to get there. Know the cost before you go.
>
> SakayPinoy helps you plan your commute in the Philippines. Enter where you're going and compare
> jeepneys, buses, MRT/LRT, UV Express, tricycles, motorcycle taxis, taxis and ride-hailing.
> Each option shows the estimated total fare, travel time, transfers and walking.
> • Cheapest, fastest, fewest transfers and best overall picks
> • Step-by-step "sakay, baba, lipat" directions
> • Jeepney finder: "Does this jeep pass here?"
> • Fare calculator with student, senior and PWD discounts where applicable
> • Commute expense tracker and budgets
> • Service advisories from official sources
> • Works offline with your saved routes
> Fares and times are estimates, labelled by source. Final fares are set by operators and providers.

## Data safety form (draft)
| Data | Collected | Shared | Purpose | Optional |
|---|---|---|---|---|
| Approximate and precise location | Yes, on user action only | No | App functionality | Yes |
| Email, name (accounts) | Yes | No | Account management | Yes (guest mode) |
| Photos (report attachments) | Yes | No | Community reports | Yes |
| App interactions (search counts) | Yes, aggregated | No | Analytics | No |

Data is encrypted in transit. Users can request deletion in-app (Profile → Delete my account & data).

## Content declarations
No ads at launch. If ads are added later, they must be labelled. Target audience 13+. Not a news app.
Not a government app; don't use agency logos.
