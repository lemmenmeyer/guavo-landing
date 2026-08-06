#!/usr/bin/env node
// Generates the single industries page at /industries/.
//
//   node build-industries.mjs
//
// There is deliberately no page per industry. Everything lives on one page,
// and the nav dropdown deep-links to each tile by anchor. Earlier revisions
// generated seven separate pages; that copy is recoverable from git history
// if the decision is ever reversed.
//
// Nothing internal goes in here: no NAICS codes, no sourcing signals, no
// revenue proxies, and no client names.
//
// Tile copy rule: the blurb names the cash-flow reality of the industry, not
// what the industry is. Owners know what they do. Telling them reads as
// filler; naming their cash-flow problem is why Guavo is relevant to them.

import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('./industries/', import.meta.url);
const BASE = 'https://www.guavo.com';

const INDUSTRIES = [
  {
    slug: 'restaurants',
    nav: 'Restaurants & Bars',
    icon: `<path d="M6 3v8a2 2 0 0 0 2 2v8M6 3v5M10 3v5M17 3c-1.6 0-2.6 2.5-2.6 5.5S15.4 13 17 13v8"/>`,
    blurb: 'Revenue swings by season, by weather, and by day of the week.',
    purposes: 'Kitchen equipment, inventory, build-outs, and payroll through the slow months.',
    examples: 'Restaurants, bars, caterers, coffee shops'
  },
  {
    slug: 'medical-dental',
    nav: 'Medical & Dental',
    icon: `<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 7.5v9M7.5 12h9"/>`,
    blurb: 'Care is delivered 30 to 90 days before an insurer pays for it.',
    purposes: 'Equipment, extra treatment rooms, hiring, and bridging reimbursement cycles.',
    examples: 'Physicians, dentists, chiropractors, outpatient clinics'
  },
  {
    slug: 'auto-repair',
    nav: 'Auto & Repair',
    icon: `<path d="M15.5 3.5a5 5 0 0 0-6 6.4L4 15.4a2.5 2.5 0 1 0 3.5 3.5l5.5-5.5a5 5 0 0 0 6.4-6l-3 3-2.9-2.9z"/>`,
    blurb: 'Parts are bought and the work is done before the customer pays.',
    purposes: 'Lifts and diagnostic tools, parts inventory, extra bays, and vehicles.',
    examples: 'Repair shops, body shops, tire dealers, towing, used car dealers'
  },
  {
    slug: 'professional-services',
    nav: 'Professional Services',
    icon: `<rect x="2.5" y="7" width="19" height="13" rx="2.5"/><path d="M8.5 7V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2M2.5 12.5h19"/>`,
    blurb: 'Most of the year is earned in a few concentrated months.',
    purposes: 'Seasonal hiring, software and licensing, acquiring a client book, and off-season overhead.',
    examples: 'CPAs, tax preparers, bookkeepers, consultants'
  },
  {
    slug: 'retail',
    nav: 'Retail & C-Stores',
    icon: `<path d="M4 8h16l-1.2 12.2a1.8 1.8 0 0 1-1.8 1.6H7a1.8 1.8 0 0 1-1.8-1.6z"/><path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2"/>`,
    blurb: 'Inventory is bought months before any of it sells.',
    purposes: 'Seasonal stock, coolers and fixtures, POS systems, and store remodels.',
    examples: 'Convenience stores, gas stations, liquor, clothing, electronics'
  },
  {
    slug: 'contractors',
    nav: 'Contractors & Trades',
    icon: `<path d="M13.5 6.5 17 3l4 4-3.5 3.5zM15.2 8.2 4.5 18.9a2.1 2.1 0 0 0 3 3L18.2 11.2"/>`,
    blurb: 'Materials and crews are paid well ahead of the draw.',
    purposes: 'Materials for signed jobs, trucks and equipment, crew payroll, and larger contracts.',
    examples: 'HVAC, plumbing, electrical, remodeling, landscaping, pest control'
  },
  {
    slug: 'salons-spas-gyms',
    nav: 'Salons, Spas & Gyms',
    icon: `<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.6 15.4M20 20 8.6 8.6"/>`,
    blurb: 'The equipment is the service, and it wears out on its own schedule.',
    purposes: 'Stations and treatment rooms, equipment, build-outs, and marketing to fill the calendar.',
    examples: 'Hair, nails, spas, med-spas, gyms, pet grooming'
  }
];

/** Nav shared with index.html and faq.html. Industries deep-links to tiles. */
const nav = () => `
<nav>
  <a href="/" class="nl" aria-label="Guavo home"><img alt="Guavo" src="/assets/brand/guavo-logo-horizontal.svg"></a>
  <div class="nr">
    <a href="/#how-it-works">How it works</a>
    <a href="/#why-guavo">Why Guavo</a>
    <span class="nd">
      <a href="/industries/" class="active" aria-current="page">Industries</a>
      <div class="ndm">
        ${INDUSTRIES.map(i => `<a href="/industries/#${i.slug}">${i.nav}</a>`).join('\n        ')}
      </div>
    </span>
    <a href="/#apply">Apply</a>
    <a href="/faq.html">FAQ</a>
    <a href="/#contact">Contact</a>
    <a href="/#apply" class="ncta">Get Funded</a>
  </div>
</nav>`;

const META = 'Guavo provides revenue-based financing to small businesses across the United States, including restaurants, medical and dental practices, auto shops, contractors, retail, salons and gyms, and professional services firms.';

const jsonld = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'CollectionPage',
      '@id': `${BASE}/industries/#collection`,
      name: 'Industries we serve',
      description: META,
      isPartOf: { '@id': `${BASE}/#website` },
      about: { '@id': `${BASE}/#organization` }
    },
    {
      '@type': 'ItemList',
      itemListElement: INDUSTRIES.map((i, n) => ({
        '@type': 'ListItem', position: n + 1, name: i.nav,
        url: `${BASE}/industries/#${i.slug}`
      }))
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
        { '@type': 'ListItem', position: 2, name: 'Industries' }
      ]
    }
  ]
};

const page = () => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Industries We Serve · Guavo</title>
<meta name="description" content="${META}">
<link rel="canonical" href="${BASE}/industries/">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<link rel="icon" href="/assets/brand/guavo-icon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/brand/guavo-icon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/brand/guavo-icon-180.png">

<meta property="og:type" content="website">
<meta property="og:url" content="${BASE}/industries/">
<meta property="og:title" content="Industries We Serve · Guavo">
<meta property="og:description" content="${META}">
<meta property="og:image" content="${BASE}/assets/brand/og-image.png">

<script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
</script>

<!-- Google Analytics 4 with Consent Mode v2 (loaded default-denied) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-X0GRGG40QF"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    'ad_storage': 'denied',
    'ad_user_data': 'denied',
    'ad_personalization': 'denied',
    'analytics_storage': 'denied',
    'functionality_storage': 'granted',
    'security_storage': 'granted',
    'wait_for_update': 500
  });
  gtag('js', new Date());
  gtag('config', 'G-X0GRGG40QF', {
    'anonymize_ip': true,
    'allow_google_signals': false,
    'allow_ad_personalization_signals': false
  });
</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --g:#003724; --gm:#1A5C3A; --gl:#52B788; --o:#F07661; --oa:#B04A34;
  --cr:#FAF8F4; --wm:#F2EDE5; --wd:#E4D9CC;
  --tx:#1A1A16; --mu:#6B6358; --bd:#D4CCBF; --wh:#FFFFFF;
  --fd:'Playfair Display',Georgia,serif; --fb:'DM Sans',system-ui,sans-serif;
  --mx:1080px; --r:5px;
}
body{font-family:var(--fb);background:var(--cr);color:var(--tx);line-height:1.65;-webkit-font-smoothing:antialiased;}
nav{position:fixed;top:0;left:0;right:0;z-index:200;background:rgba(250,248,244,.97);backdrop-filter:blur(10px);border-bottom:1px solid var(--bd);height:62px;padding:0 40px;display:flex;align-items:center;justify-content:space-between;}
.nl img{height:42px;display:block;}
.nr{display:flex;align-items:center;gap:24px;}
.nr a{position:relative;font-size:13.5px;font-weight:500;color:var(--mu);text-decoration:none;transition:color .2s;}
.nr a:hover{color:var(--g);}
.nr a.active{color:var(--g);font-weight:600;}
.nr a.active::after{content:"";position:absolute;left:0;right:0;bottom:-21px;height:2px;background:var(--o);}
.ncta{background:var(--g);color:var(--wh)!important;padding:9px 22px;border-radius:var(--r);font-weight:600!important;transition:background .2s!important;}
.ncta:hover{background:var(--gm)!important;}
.ncta.active::after{display:none;}
/* Industries dropdown. CSS only: :hover for pointers, :focus-within for
   keyboard. The nav is hidden below 980px so this never has to work on touch. */
.nd{position:relative;display:inline-flex;align-items:center;}
.ndm{position:absolute;top:calc(100% + 21px);left:50%;transform:translateX(-50%) translateY(-4px);min-width:230px;background:var(--wh);border:1px solid var(--wd);border-radius:var(--r);box-shadow:0 10px 34px rgba(0,55,36,.13);padding:8px;display:flex;flex-direction:column;gap:2px;opacity:0;visibility:hidden;transition:opacity .16s ease,transform .16s ease,visibility .16s;z-index:210;}
.nd:hover .ndm,.nd:focus-within .ndm{opacity:1;visibility:visible;transform:translateX(-50%) translateY(0);}
.ndm a{font-size:13.5px;font-weight:500;color:var(--tx);padding:9px 14px;border-radius:3px;white-space:nowrap;position:relative;}
.ndm a::after{display:none;}
.ndm a:hover{background:var(--wm);color:var(--g);}

.hero{background:var(--g);padding:128px 40px 76px;}
.hero-in{max-width:var(--mx);margin:0 auto;}
.crumb{font-size:12.5px;color:rgba(255,255,255,.5);margin-bottom:18px;}
.crumb a{color:var(--gl);text-decoration:none;}
.crumb a:hover{text-decoration:underline;}
.eyebrow{font-size:11px;font-weight:600;letter-spacing:1.4px;text-transform:uppercase;color:var(--o);margin-bottom:14px;}
h1{font-family:var(--fd);font-weight:700;font-size:clamp(32px,5vw,50px);line-height:1.12;color:var(--wh);margin-bottom:16px;max-width:17ch;}
.lede{color:rgba(255,255,255,.72);font-size:17px;font-weight:300;line-height:1.75;max-width:64ch;}

.wrap{max-width:var(--mx);margin:0 auto;padding:56px 40px 110px;}

/* Tiles: 2 across, 4 down. */
.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;}
.card{background:var(--wh);border:1px solid var(--wd);border-radius:var(--r);padding:30px 30px 28px;text-decoration:none;display:flex;flex-direction:column;position:relative;overflow:hidden;transition:border-color .18s ease,box-shadow .18s ease;scroll-margin-top:86px;}
.card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--o);opacity:0;transition:opacity .18s ease;}
.card:hover::before,.card:target::before{opacity:1;}
.card:hover{border-color:var(--bd);box-shadow:0 6px 26px rgba(0,55,36,.07);}
.card:target{border-color:var(--o);}
.card-ico{width:46px;height:46px;border-radius:var(--r);background:var(--wm);border:1px solid var(--wd);display:flex;align-items:center;justify-content:center;color:var(--g);margin-bottom:18px;transition:background .18s ease,border-color .18s ease;}
.card-ico svg{width:23px;height:23px;display:block;}
.card:hover .card-ico{background:var(--cr);border-color:var(--o);}
.card h3{font-family:var(--fd);font-size:21px;font-weight:700;color:var(--g);margin-bottom:9px;line-height:1.25;}
.card-b{font-size:15px;color:var(--tx);font-weight:300;line-height:1.65;margin-bottom:13px;}
.card-p{font-size:14px;color:var(--mu);font-weight:300;line-height:1.65;margin-bottom:16px;}
.card-p b{font-weight:600;color:var(--gm);}
.card-e{margin-top:auto;font-size:12.5px;color:var(--mu);letter-spacing:.2px;padding-top:14px;border-top:1px solid var(--wd);}
.card-cta{background:var(--wm);}
.card-cta .card-ico{background:var(--wh);}
.card-cta .card-e{color:var(--gm);font-weight:600;font-size:14px;}

.cta{background:var(--g);border-radius:var(--r);padding:52px 40px;margin-top:76px;text-align:center;position:relative;overflow:hidden;}
.cta::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--o);}
.cta h3{font-family:var(--fd);font-size:clamp(24px,3.4vw,32px);color:var(--wh);margin-bottom:10px;}
.cta p{color:rgba(255,255,255,.68);font-size:15.5px;font-weight:300;margin-bottom:26px;}
.btn{display:inline-block;background:var(--o);color:var(--wh);font-weight:600;font-size:15.5px;padding:14px 34px;border-radius:100px;text-decoration:none;}
.btn:hover{background:var(--oa);}

footer{border-top:1px solid var(--wd);}
.fin{max-width:var(--mx);margin:0 auto;padding:30px 40px;display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;font-size:13.5px;color:var(--mu);}
.fin a{color:var(--mu);text-decoration:none;}
.fin a:hover{color:var(--g);text-decoration:underline;}

*:focus-visible{outline:2px solid var(--o);outline-offset:2px;}
.skip{position:absolute;left:-9999px;top:0;background:var(--g);color:#fff;padding:12px 20px;z-index:9999;text-decoration:none;font-weight:600;}
.skip:focus{left:0;}
@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth;}}

@media(max-width:980px){ nav .nr a:not(.ncta),nav .nr .nd{display:none;} }
@media(max-width:760px){
  nav{padding:0 20px;}
  .hero{padding:108px 20px 62px;}
  .wrap{padding:44px 20px 80px;}
  .cards{grid-template-columns:1fr;}
  .cta{padding:40px 24px;}
  .fin{padding:26px 20px;}
}
</style>
</head>
<body>
<a href="#main" class="skip">Skip to content</a>
${nav()}
<header class="hero">
  <div class="hero-in">
    <p class="crumb"><a href="/">Home</a> &rsaquo; Industries</p>
    <div class="eyebrow">Industries</div>
    <h1>Who we serve</h1>
    <p class="lede">Established small businesses across the United States, funded with financing that moves with their sales rather than against them.</p>
  </div>
</header>

<main id="main">
<div class="wrap">

  <div class="cards">
    ${INDUSTRIES.map(i => `<a class="card" id="${i.slug}" href="/#apply">
      <span class="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${i.icon}</svg></span>
      <h3>${i.nav}</h3>
      <p class="card-b">${i.blurb}</p>
      <p class="card-p"><b>Common uses.</b> ${i.purposes}</p>
      <p class="card-e">${i.examples}</p>
    </a>`).join('\n    ')}
    <a class="card card-cta" id="other" href="/#apply">
      <span class="card-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg></span>
      <h3>Don&rsquo;t see your industry?</h3>
      <p class="card-b">These are some of the industries we work with. There are more.</p>
      <p class="card-p">Guavo funds small businesses across the United States. If yours is established with steady revenue, apply now.</p>
      <span class="card-e">Get started &rarr;</span>
    </a>
  </div>

  <div class="cta">
    <h3>See what you qualify for</h3>
    <p>Takes less than 3 minutes. Soft credit pull only, no impact on your score.</p>
    <a class="btn" href="/#apply">Apply now</a>
  </div>

</div>
</main>

<footer>
  <div class="fin">
    <span>&copy; 2026 Guavo Inc.</span>
    <span>
      <a href="/">Home</a> &nbsp;&middot;&nbsp;
      <a href="/industries/">Industries</a> &nbsp;&middot;&nbsp;
      <a href="/faq.html">FAQ</a> &nbsp;&middot;&nbsp;
      <a href="/privacy.html">Privacy</a> &nbsp;&middot;&nbsp;
      <a href="/terms.html">Terms</a>
    </span>
  </div>
</footer>

<script src="/assets/klaro/klaro-config.js"></script>
<script defer src="/assets/klaro/klaro.js"></script>
</body>
</html>`;

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('./index.html', OUT), page());
console.log('Wrote /industries/ (single page, 7 industry tiles + 1 catch-all)');
INDUSTRIES.forEach(i => console.log(`  #${i.slug}  ${i.nav}`));
