import { header } from '../lib/ui.js';

export default function privacy(el) {
  el.innerHTML = `${header('Privacy & Terms')}
  <article class="pad stack small">
    <p class="banner warn" style="margin:0">Template text for development. Have it reviewed by counsel before publishing to Google Play.</p>
    <h2>Privacy Policy</h2>
    <p>LUVYO is designed to comply with the Philippine Data Privacy Act of 2012 (RA 10173) and NPC issuances.</p>
    <h3>What we collect</h3>
    <ul>
      <li><b>Guest mode:</b> saved places, routes, history and expenses are stored only on your device.</li>
      <li><b>Accounts:</b> email, display name, optional photo and the preferences you set, stored in our database protected by row-level security so only you can read them.</li>
      <li><b>Location:</b> used only when you tap a location action or turn on GPS progress during navigation. We do not collect background or continuous location history.</li>
      <li><b>Searches:</b> anonymous aggregate counts (e.g. popular destinations) to improve coverage. Searches are not linked to your identity.</li>
      <li><b>Community reports:</b> the content, location and optional photo you submit, plus a pseudonymous reporter ID.</li>
    </ul>
    <h3>Your rights</h3>
    <p>You can view, correct, export (Profile → Export my data) and delete (Profile → Delete my account & data) your information at any time. Contact the Data Protection Officer at the address published in the Play Store listing.</p>
    <h3>Sharing</h3>
    <p>We do not sell personal data. Opening a ride-hailing provider sends you to that provider's own app or site; their privacy policy then applies.</p>
    <h2>Terms of Use</h2>
    <ul>
      <li>Fares, travel times and schedules are <b>estimates</b>. They are labelled by source (official, live quote, operator, admin-verified, community, indicative) and may differ from what you actually pay or experience.</li>
      <li>LUVYO does not book, confirm or guarantee any trip. Final fares are set by operators and providers.</li>
      <li>Community submissions are reviewed before being treated as verified. Don't submit false or abusive reports.</li>
      <li>Sponsored content, if any, is clearly labelled and never changes cheapest or fastest rankings.</li>
      <li>Safety advisories and essential route information remain free.</li>
    </ul>
  </article>`;
}
