#!/usr/bin/env node
// Generates the industry hub (/industries/) and one page per vertical.
//
//   node build-industries.mjs
//
// The seven verticals mirror Guavo's buy box addenda, but the page names and
// copy are written for how owners actually search. Nobody googles "food and
// beverage financing"; they google "restaurant funding".
//
// Nothing internal goes in here: no NAICS codes, no sourcing signals, no
// revenue proxies, and no client names. Business types are described in the
// language an owner would use about their own shop.

import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = new URL('./industries/', import.meta.url);

const INDUSTRIES = [
  {
    slug: 'restaurants',
    nav: 'Restaurants & Bars',
    title: 'Restaurant & Bar Funding',
    h1: 'Funding for restaurants and bars',
    meta: 'Revenue-based financing for restaurants, bars, and caterers. $5,000 to $100,000, approved in 24 hours, repaid as a percentage of your sales.',
    intro: 'Kitchen equipment fails on a Friday. A slow January still owes rent. Guavo funds restaurants and bars with financing that moves with your sales instead of against them.',
    types: [
      ['Full-service restaurants', 'Table service and a full kitchen means the highest equipment load and the most staff to carry through a slow month. Funding here usually goes to equipment, build-out, or payroll between seasons.'],
      ['Fast-casual, pizzerias, and taquerías', 'High volume on thin tickets. Small equipment failures interrupt a lot of covers, and a second location is often the fastest route to real growth.'],
      ['Bars, taverns, and lounges', 'Revenue concentrates into a few nights a week and swings hard by season. Inventory buys, tap systems, and patio build-outs are the common uses.'],
      ['Caterers and event operators', 'You buy food and pay staff before the client settles the invoice, and bookings cluster around holidays and wedding season. Funding covers the gap between deposit and final payment.'],
      ['Coffee shops, juice bars, and paleterías', 'Small footprints with equipment that runs all day. Espresso machines and refrigeration are expensive to replace and impossible to operate without.']
    ],
    uses: [
      ['Replace equipment that failed', 'A walk-in or a hood system does not wait for your next good quarter.'],
      ['Get through the slow season', 'Cover payroll and rent in the months your dining room is quiet.'],
      ['Open or build out a second location', 'Fund the deposit and build-out before the new room earns anything.'],
      ['Buy inventory in bulk', 'Take the case discount instead of paying weekly retail.'],
      ['Add a patio, bar, or dining room', 'Seats you add in spring pay for themselves through summer.']
    ],
    why: 'Restaurant revenue swings by season, by weather, and by day of the week. A fixed monthly loan payment does not care that January was slow or that it rained all weekend. Because Guavo collects a percentage of your sales, a quiet week costs you less than a busy one. That is the whole point.'
  },
  {
    slug: 'medical-dental',
    nav: 'Medical & Dental',
    title: 'Medical & Dental Practice Funding',
    h1: 'Funding for medical and dental practices',
    meta: 'Revenue-based financing for physician offices, dental practices, and outpatient clinics. $5,000 to $100,000, approved in 24 hours, no collateral pledge on specific equipment.',
    intro: 'Your practice is busy and your bank account still looks thin, because insurance pays 30 to 90 days after you do the work. Guavo funds the gap.',
    types: [
      ['Physician offices and specialty practices', 'Reimbursement lands 30 to 90 days after the visit while payroll runs every two weeks. Funding smooths that gap or brings a new service line in-house.'],
      ['Dental practices and orthodontics', 'Growth is capacity-bound. An extra operatory or a newer scanner raises what the practice can produce without moving.'],
      ['Chiropractors and podiatrists', 'Smaller teams with high equipment dependence and a heavy mix of cash-pay and insurance. Funding covers tables, imaging, and expansion into a second room.'],
      ['Outpatient and ambulatory care centers', 'Higher fixed costs and more complex billing. Working capital keeps operations steady while claims work through the cycle.'],
      ['Physical therapy and rehabilitation clinics', 'Revenue depends on treatment capacity and equipment condition. Funding adds rooms, replaces tables, or carries a new therapist through ramp-up.']
    ],
    uses: [
      ['Add a chair or operatory', 'More capacity without waiting to save for it.'],
      ['Buy imaging or diagnostic equipment', 'Bring scans in-house instead of referring the revenue out.'],
      ['Bridge insurance reimbursement', 'Keep payroll steady while claims work through the cycle.'],
      ['Hire a hygienist or associate', 'Carry the salary through the ramp-up before they are fully booked.'],
      ['Buy out a retiring partner', 'Fund the transition without restructuring the whole practice.']
    ],
    why: 'Practices are revenue-rich and cash-tight, because the money is earned long before it arrives. Reimbursement cycles are outside your control. Financing that adjusts to what you actually collect fits that pattern better than a fixed payment set on the day you signed.'
  },
  {
    slug: 'auto-repair',
    nav: 'Auto & Repair',
    title: 'Auto Repair Shop Funding',
    h1: 'Funding for auto repair and service shops',
    meta: 'Revenue-based financing for auto repair shops, body shops, tire dealers, and towing operators. $5,000 to $100,000, approved in 24 hours.',
    intro: 'Parts get bought before the customer pays. Guavo funds repair shops so a big job never turns into a cash flow problem.',
    types: [
      ['General automotive repair', 'Parts get bought before the customer pays, and newer vehicles need diagnostic tools older scanners cannot read. Both are common reasons shops seek funding.'],
      ['Body, paint, and collision shops', 'Insurance work pays on its own timeline while materials and labor come out of your pocket first. Booth and prep equipment are the big capital items.'],
      ['Auto glass replacement', 'Inventory-heavy and mobile. Funding covers glass stock and the vans that get technicians to the job.'],
      ['Tire dealers and alignment shops', 'Seasonal demand with real inventory carrying costs. Alignment racks and a deeper tire stock both convert directly into throughput.'],
      ['Used car dealers', 'Floor stock is the whole business. Funding buys inventory ahead of a strong selling season or covers reconditioning before units go on the lot.'],
      ['Towing and roadside operators', 'A truck off the road earns nothing and still costs you. Funding goes to purchase, repair, or adding a second rig.']
    ],
    uses: [
      ['Buy lifts, racks, or scan tools', 'Newer vehicles need diagnostics your current tools cannot read.'],
      ['Stock parts inventory', 'Stop losing jobs because the part is three days out.'],
      ['Add a bay', 'Capacity is the ceiling on a shop that is already booked out.'],
      ['Buy or repair a tow truck', 'An off-road truck earns nothing and still costs you.'],
      ['Hire and train technicians', 'Cover the wage while a new tech gets up to speed.']
    ],
    why: 'Shop work arrives in bursts. One month is transmissions and the next is oil changes, and you buy the parts before you get paid either way. Payments that track your actual sales absorb that swing instead of amplifying it.'
  },
  {
    slug: 'professional-services',
    nav: 'Professional Services',
    title: 'Accounting & Professional Services Funding',
    h1: 'Funding for accounting and professional services firms',
    meta: 'Revenue-based financing for CPA firms, tax preparers, bookkeepers, and consultants. $5,000 to $100,000, approved in 24 hours, no collateral required.',
    intro: 'You earn most of the year in a few months and carry overhead through the rest. Guavo funds the shape of that business.',
    types: [
      ['CPA and accounting firms', 'Most of the year is earned in a few months while overhead runs all twelve. Funding staffs up before the season and carries the team through the trough after it.'],
      ['Tax preparation services', 'The most concentrated revenue of any vertical we fund. Marketing, seasonal hiring, and software all have to be paid for before a single return is filed.'],
      ['Bookkeeping and payroll providers', 'Recurring revenue that is steady but slow to compound. Funding is usually for acquiring a book of clients or adding capacity to serve one.'],
      ['Management and operations consultants', 'Project-based billing with long collection cycles. Working capital bridges the gap between winning an engagement and being paid for it.'],
      ['Other professional B2B service firms', 'Agencies, staffing, and specialised advisory firms with the same pattern: payroll now, client payment later.']
    ],
    uses: [
      ['Staff up for the season', 'Hire and train before the work arrives, not after.'],
      ['Cover the off-season trough', 'Keep the team together through the quiet months.'],
      ['Buy software and licensing', 'Annual renewals land whether or not it is a busy quarter.'],
      ['Acquire a book of clients', 'Fund the purchase and pay it back out of the revenue it brings.'],
      ['Expand the office', 'Add seats before you add headcount.']
    ],
    why: 'Professional services revenue is seasonal in a way few lenders price correctly. A tax firm earning most of its year between January and April still pays rent in September. Remittance tied to a percentage of sales falls in the slow months by design rather than by negotiation.'
  },
  {
    slug: 'retail',
    nav: 'Retail & C-Stores',
    title: 'Retail & Convenience Store Funding',
    h1: 'Funding for retail and convenience stores',
    meta: 'Revenue-based financing for convenience stores, gas stations, liquor stores, and specialty retail. $5,000 to $100,000, approved in 24 hours.',
    intro: 'Retail is inventory first and revenue second. You buy in September to sell in December. Guavo funds the gap in between.',
    types: [
      ['Convenience stores', 'Thin margins carried by volume and consistency. Coolers, shelving, and a deeper stock of what actually moves are the usual funding targets.'],
      ['Gas stations with convenience retail', 'Fuel inventory ties up serious capital before a gallon is sold, and the store attached to it is where the margin lives.'],
      ['Beer, wine, and liquor stores', 'Inventory-first and highly seasonal. Buying deep ahead of holidays is often the difference between a good year and an average one.'],
      ['Clothing, apparel, and shoe stores', 'Boutiques and independent apparel shops buy a season ahead and sell it down over months. Funding covers the buy, the fixtures, and the floor refresh.'],
      ['Electronics and appliance retailers', 'High ticket, high inventory cost, and manufacturer terms that rarely favour the independent. Working capital keeps the floor stocked.'],
      ['General merchandise and specialty shops', 'Gift, hobby, home goods, and other independents where the season you prepare for decides the year you have.']
    ],
    uses: [
      ['Stock up before a season', 'Buy deep ahead of the months that actually make your year.'],
      ['Replace coolers and shelving', 'A failing cooler is lost product and lost trips.'],
      ['Upgrade your POS', 'Faster checkout and cleaner reporting on inventory that moves.'],
      ['Remodel the store', 'Refresh the floor without pausing operations to save for it.'],
      ['Open a second location', 'Fund the lease, fixtures, and opening inventory together.']
    ],
    why: 'Retail cash flow runs backwards from every other business. Capital goes out months before it comes back, and the seasons that matter most demand the most inventory. Financing repaid as a share of sales stays proportional to how the floor is actually performing.'
  },
  {
    slug: 'contractors',
    nav: 'Contractors & Trades',
    title: 'Contractor & Trade Funding',
    h1: 'Funding for contractors and trade businesses',
    meta: 'Revenue-based financing for HVAC, plumbing, electrical, remodeling, and landscaping contractors. $5,000 to $100,000, approved in 24 hours.',
    intro: 'You buy materials and pay the crew weeks before the customer pays you. Guavo funds contractors through that gap.',
    types: [
      ['Plumbing, heating, and HVAC contractors', 'Peak demand arrives with the weather, and equipment has to be on the truck before the call comes. Funding covers stock, vans, and seasonal crew.'],
      ['Electrical contractors', 'Material costs move fast and permits add delay before any money comes back. Working capital keeps jobs starting on schedule.'],
      ['Residential remodelers', 'Draw schedules mean you finance the early phases of every project yourself. Funding lets you run more jobs at once instead of waiting on each one.'],
      ['Landscaping and grounds services', 'Sharply seasonal with expensive equipment. Funding buys mowers and trucks in spring or carries the crew through winter.'],
      ['Pest control operators', 'Recurring contracts that are steady once built, but chemicals, licensing, and route vehicles all come first.'],
      ['Finish carpentry and specialty trades', 'Materials and skilled labour paid up front against net-30 invoicing. Funding covers the gap on larger contracts.']
    ],
    uses: [
      ['Buy materials for a signed job', 'Start the work without waiting on the first draw.'],
      ['Cover crew payroll between draws', 'Your people get paid weekly. The invoice is net 30.'],
      ['Buy trucks and equipment', 'Add a rig and add a crew that can run independently.'],
      ['Take on a bigger contract', 'Say yes to the job that needs more float than you have.'],
      ['Get through the off-season', 'Weather stops the work but not the overhead.']
    ],
    why: 'Trade work is financed by the contractor by default. Materials, permits, and payroll all come out of your pocket before a draw or a net-30 invoice pays you back. That gap is exactly what revenue-based financing is built for, and repayment scales with the jobs you close.'
  },
  {
    slug: 'salons-spas-gyms',
    nav: 'Salons, Spas & Gyms',
    title: 'Salon, Spa & Gym Funding',
    h1: 'Funding for salons, spas, and gyms',
    meta: 'Revenue-based financing for hair and nail salons, barber shops, med-spas, gyms, and boutique fitness studios. $5,000 to $100,000, approved in 24 hours.',
    intro: 'Your equipment is your service. When it dates, clients notice and go elsewhere. Guavo funds the upgrade before that happens.',
    types: [
      ['Hair salons and barber shops', 'Revenue is capped by chairs and the people in them. Funding adds stations, refreshes the space, or stocks retail product that carries better margin than services.'],
      ['Nail salons and waxing studios', 'High appointment volume on small tickets. Stations, ventilation, and product inventory are the recurring capital needs.'],
      ['Day spas and med-spas', 'The most equipment-intensive corner of personal care. Laser and treatment devices are expensive, and dated equipment quietly loses clients to the studio down the road.'],
      ['Lash, brow, and tattoo studios', 'Appointment-driven with loyal repeat clients. Funding usually goes to build-out, an extra room, or bringing on another artist.'],
      ['Gyms and boutique fitness studios', 'Membership revenue is predictable but rarely leaves a cushion. Cardio and strength equipment wear out on their own schedule, and marketing is what keeps the roster full.'],
      ['Pet grooming, boarding, and daycare', 'Steady repeat demand with real facility costs. Funding covers grooming stations, kennel build-out, vans, and expansion into boarding or daycare alongside grooming.']
    ],
    uses: [
      ['Add stations or treatment rooms', 'Capacity is revenue when you are already booked out.'],
      ['Buy or replace equipment', 'Lasers, cardio, and styling stations wear out on their own schedule.'],
      ['Build out or relocate', 'Fund the space before the new location earns anything.'],
      ['Stock retail product', 'Product margin is the easiest revenue you are not capturing.'],
      ['Market to fill memberships', 'Spend to fill the calendar rather than waiting for referrals.']
    ],
    why: 'Personal care and fitness run on appointments and memberships, which are steady but rarely leave a large cushion. Equipment is expensive, and dated equipment quietly costs you clients. Repaying as a share of sales means a slow month does not become a missed payment.'
  }
];

const BASE = 'https://www.guavo.com';

/** Nav shared with index.html and faq.html. `here` marks the active item. */
const nav = (here, prefix = '/') => `
<nav>
  <a href="${prefix}" class="nl" aria-label="Guavo home"><img alt="Guavo" src="/assets/brand/guavo-logo-horizontal.svg"></a>
  <div class="nr">
    <a href="/#how-it-works">How it works</a>
    <a href="/#why-guavo">Why Guavo</a>
    <span class="nd">
      <a href="/industries/"${here === 'industries' ? ' class="active" aria-current="page"' : ''}>Industries</a>
      <div class="ndm">
        ${INDUSTRIES.map(i => `<a href="/industries/${i.slug}.html">${i.nav}</a>`).join('\n        ')}
      </div>
    </span>
    <a href="/#apply">Apply</a>
    <a href="/faq.html">FAQ</a>
    <a href="/#contact">Contact</a>
    <a href="/#apply" class="ncta">Get Funded</a>
  </div>
</nav>`;

const head = ({ title, meta, canonical, jsonld }) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} · Guavo</title>
<meta name="description" content="${meta}">
<link rel="canonical" href="${canonical}">
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large">
<link rel="icon" href="/assets/brand/guavo-icon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/brand/guavo-icon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/brand/guavo-icon-180.png">

<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${title} · Guavo">
<meta property="og:description" content="${meta}">
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
.lede{color:rgba(255,255,255,.72);font-size:17px;font-weight:300;line-height:1.75;max-width:62ch;}

.wrap{max-width:var(--mx);margin:0 auto;padding:0 40px 110px;}
.band{background:var(--wh);border:1px solid var(--wd);border-radius:var(--r);padding:30px 34px;margin-top:-34px;position:relative;z-index:2;box-shadow:0 6px 28px rgba(0,55,36,.07);display:flex;flex-wrap:wrap;gap:26px 44px;}
.stat{min-width:120px;}
.stat b{display:block;font-family:var(--fd);font-size:24px;color:var(--g);line-height:1.2;}
.stat span{font-size:13px;color:var(--mu);}

h2{font-family:var(--fd);font-weight:700;font-size:clamp(24px,3.2vw,32px);color:var(--g);line-height:1.2;margin-bottom:14px;}
.sec{margin-top:72px;}
.sec > p{font-size:16.5px;color:var(--mu);font-weight:300;line-height:1.8;max-width:66ch;}

.uses{display:grid;grid-template-columns:repeat(2,1fr);gap:18px;margin-top:28px;}
.use{background:var(--wm);border:1px solid var(--wd);border-radius:var(--r);padding:22px 24px;}
.use h3{font-family:var(--fb);font-size:15.5px;font-weight:600;color:var(--g);margin-bottom:6px;}
.use p{font-size:14.5px;color:var(--mu);font-weight:300;line-height:1.7;}

/* Sub-industry accordions. Native <details>, no JS, and the copy stays in the
   DOM when collapsed so crawlers and AI models still read it. */
.types{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;margin-top:26px;align-items:start;}
.tcard{background:var(--wm);border:1px solid var(--wd);border-radius:var(--r);position:relative;overflow:hidden;}
.tcard::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--o);opacity:0;transition:opacity .18s ease;}
.tcard[open]::before,.tcard:hover::before{opacity:1;}
.tcard summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 20px;}
.tcard summary::-webkit-details-marker{display:none;}
.tcard-t{font-size:15.5px;font-weight:600;color:var(--g);line-height:1.35;}
.tcard-i{flex:0 0 auto;width:32px;height:32px;border-radius:50%;background:var(--cr);border:1px solid var(--wd);display:flex;align-items:center;justify-content:center;transition:transform .2s ease,background .2s ease,border-color .2s ease;}
.tcard-i img{display:block;}
.tcard summary:hover .tcard-i,.tcard[open] .tcard-i{background:var(--wh);border-color:var(--o);transform:scale(1.1);}
.tcard p{font-size:14.5px;color:var(--mu);font-weight:300;line-height:1.7;padding:0 20px 18px;margin-top:-2px;}

.quals{margin-top:26px;border-top:1px solid var(--bd);}
.qual{display:grid;grid-template-columns:190px 1fr;gap:18px;padding:16px 0;border-bottom:1px solid var(--bd);}
.qual b{font-size:14.5px;color:var(--g);font-weight:600;}
.qual span{font-size:15px;color:var(--mu);font-weight:300;}

.cta{background:var(--g);border-radius:var(--r);padding:52px 40px;margin-top:76px;text-align:center;position:relative;overflow:hidden;}
.cta::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:var(--o);}
.cta h3{font-family:var(--fd);font-size:clamp(24px,3.4vw,32px);color:var(--wh);margin-bottom:10px;}
.cta p{color:rgba(255,255,255,.68);font-size:15.5px;font-weight:300;margin-bottom:26px;}
.btn{display:inline-block;background:var(--o);color:var(--wh);font-weight:600;font-size:15.5px;padding:14px 34px;border-radius:100px;text-decoration:none;}
.btn:hover{background:var(--oa);}

.more{margin-top:70px;}
.more h2{font-size:22px;margin-bottom:18px;}
.morelist{display:flex;flex-wrap:wrap;gap:9px;}
.morelist a{font-size:14px;color:var(--tx);background:var(--wm);border:1px solid var(--wd);border-radius:100px;padding:8px 17px;text-decoration:none;transition:all .16s ease;}
.morelist a:hover{background:var(--g);border-color:var(--g);color:var(--wh);}

.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:20px;margin-top:34px;}
.card{background:var(--wh);border:1px solid var(--wd);border-radius:var(--r);padding:26px 28px;text-decoration:none;display:block;position:relative;overflow:hidden;transition:border-color .18s ease;}
.card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--o);opacity:0;transition:opacity .18s ease;}
.card:hover::before{opacity:1;}
.card:hover{border-color:var(--bd);}
.card h3{font-family:var(--fd);font-size:20px;font-weight:700;color:var(--g);margin-bottom:8px;}
.card p{font-size:14.5px;color:var(--mu);font-weight:300;line-height:1.7;}

footer{border-top:1px solid var(--wd);}
.fin{max-width:var(--mx);margin:0 auto;padding:30px 40px;display:flex;flex-wrap:wrap;gap:14px;justify-content:space-between;font-size:13.5px;color:var(--mu);}
.fin a{color:var(--mu);text-decoration:none;}
.fin a:hover{color:var(--g);text-decoration:underline;}

*:focus-visible{outline:2px solid var(--o);outline-offset:2px;}
.skip{position:absolute;left:-9999px;top:0;background:var(--g);color:#fff;padding:12px 20px;z-index:9999;text-decoration:none;font-weight:600;}
.skip:focus{left:0;}

@media(max-width:980px){ nav .nr a:not(.ncta),nav .nr .nd{display:none;} }
@media(max-width:760px){
  nav{padding:0 20px;}
  .hero{padding:108px 20px 62px;}
  .wrap{padding:0 20px 80px;}
  .band{padding:24px 22px;gap:20px 30px;margin-top:-28px;}
  .uses,.cards,.types{grid-template-columns:1fr;}
  .qual{grid-template-columns:1fr;gap:4px;}
  .cta{padding:40px 24px;}
  .fin{padding:26px 20px;}
}
</style>
</head>`;

const footer = () => `
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

const QUALS = [
  ['Time in business', 'Four months or more'],
  ['Monthly sales', '$8,000 or more'],
  ['Funding range', '$5,000 to $100,000'],
  ['Credit check', 'Soft pull only, no impact on your score'],
  ['Approval', 'Most applications within 24 hours']
];

function industryPage(ind) {
  const canonical = `${BASE}/industries/${ind.slug}.html`;
  const others = INDUSTRIES.filter(i => i.slug !== ind.slug);
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        '@id': `${canonical}#service`,
        name: ind.title,
        serviceType: 'Revenue-based financing',
        description: ind.meta,
        provider: { '@id': `${BASE}/#organization` },
        areaServed: { '@type': 'Country', name: 'United States' },
        audience: { '@type': 'BusinessAudience', name: ind.nav },
        offers: {
          '@type': 'Offer',
          priceSpecification: {
            '@type': 'PriceSpecification',
            minPrice: 5000, maxPrice: 100000, priceCurrency: 'USD'
          }
        }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
          { '@type': 'ListItem', position: 2, name: 'Industries', item: `${BASE}/industries/` },
          { '@type': 'ListItem', position: 3, name: ind.title }
        ]
      }
    ]
  };

  return `${head({ title: ind.title, meta: ind.meta, canonical, jsonld })}
<body>
<a href="#main" class="skip">Skip to content</a>
${nav('industries')}
<header class="hero">
  <div class="hero-in">
    <p class="crumb"><a href="/">Home</a> &rsaquo; <a href="/industries/">Industries</a> &rsaquo; ${ind.nav}</p>
    <div class="eyebrow">Revenue-based financing</div>
    <h1>${ind.h1}</h1>
    <p class="lede">${ind.intro}</p>
  </div>
</header>

<main id="main">
<div class="wrap">

  <div class="band">
    <div class="stat"><b>$5K &ndash; $100K</b><span>Funding range</span></div>
    <div class="stat"><b>24 hours</b><span>Most approvals</span></div>
    <div class="stat"><b>4 months</b><span>Minimum in business</span></div>
    <div class="stat"><b>Soft pull</b><span>No credit score impact</span></div>
  </div>

  <section class="sec">
    <h2>What owners use it for</h2>
    <div class="uses">
      ${ind.uses.map(([t, d]) => `<div class="use"><h3>${t}</h3><p>${d}</p></div>`).join('\n      ')}
    </div>
  </section>

  <section class="sec">
    <h2>Why revenue-based financing fits</h2>
    <p>${ind.why}</p>
  </section>

  <section class="sec">
    <h2>Some of the businesses we work with</h2>
    <div class="types">
      ${ind.types.map(([t, d]) => `<details class="tcard"><summary><span class="tcard-t">${t}</span><span class="tcard-i"><img src="/assets/brand/guavo-icon.svg" alt="" width="20" height="20"></span></summary><p>${d}</p></details>`).join('\n      ')}
    </div>
  </section>

  <section class="sec">
    <h2>What it takes to qualify</h2>
    <div class="quals">
      ${QUALS.map(([k, v]) => `<div class="qual"><b>${k}</b><span>${v}</span></div>`).join('\n      ')}
    </div>
    <p style="margin-top:20px;font-size:15px;">Full details are on the <a href="/faq.html" style="color:var(--gm);">FAQ</a>.</p>
  </section>

  <div class="cta">
    <h3>See what you qualify for</h3>
    <p>Takes less than 3 minutes. Soft credit pull only, no impact on your score.</p>
    <a class="btn" href="/#apply">Apply now</a>
  </div>

  <section class="more">
    <h2>Other industries we fund</h2>
    <div class="morelist">
      ${others.map(o => `<a href="/industries/${o.slug}.html">${o.nav}</a>`).join('\n      ')}
    </div>
  </section>

</div>
</main>
${footer()}`;
}

function hubPage() {
  const canonical = `${BASE}/industries/`;
  const meta = 'Guavo funds restaurants, medical and dental practices, auto shops, contractors, retail, salons, gyms, and professional services firms. $5,000 to $100,000, approved in 24 hours.';
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${canonical}#collection`,
        name: 'Industries we fund',
        description: meta,
        isPartOf: { '@id': `${BASE}/#website` },
        about: { '@id': `${BASE}/#organization` }
      },
      {
        '@type': 'ItemList',
        itemListElement: INDUSTRIES.map((i, n) => ({
          '@type': 'ListItem', position: n + 1, name: i.title,
          url: `${BASE}/industries/${i.slug}.html`
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

  return `${head({ title: 'Industries We Fund', meta, canonical, jsonld })}
<body>
<a href="#main" class="skip">Skip to content</a>
${nav('industries')}
<header class="hero">
  <div class="hero-in">
    <p class="crumb"><a href="/">Home</a> &rsaquo; Industries</p>
    <div class="eyebrow">Industries</div>
    <h1>Who we fund</h1>
    <p class="lede">Some of the businesses we work with. If your revenue is steady and you have been open at least four months, there is likely a fit. Start with whichever looks closest to yours.</p>
  </div>
</header>

<main id="main">
<div class="wrap">

  <div class="band">
    <div class="stat"><b>$5K &ndash; $100K</b><span>Funding range</span></div>
    <div class="stat"><b>24 hours</b><span>Most approvals</span></div>
    <div class="stat"><b>4 months</b><span>Minimum in business</span></div>
    <div class="stat"><b>Soft pull</b><span>No credit score impact</span></div>
  </div>

  <section class="sec">
    <h2>Industries we fund</h2>
    <div class="cards">
      ${INDUSTRIES.map(i => `<a class="card" href="/industries/${i.slug}.html">
        <h3>${i.nav}</h3>
        <p>${i.intro}</p>
      </a>`).join('\n      ')}
    </div>
  </section>

  <div class="cta">
    <h3>See what you qualify for</h3>
    <p>Takes less than 3 minutes. Soft credit pull only, no impact on your score.</p>
    <a class="btn" href="/#apply">Apply now</a>
  </div>

</div>
</main>
${footer()}`;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('./index.html', OUT), hubPage());
for (const ind of INDUSTRIES) {
  writeFileSync(new URL(`./${ind.slug}.html`, OUT), industryPage(ind));
}
console.log(`Wrote hub + ${INDUSTRIES.length} industry pages to /industries/`);
INDUSTRIES.forEach(i => console.log(`  /industries/${i.slug}.html  ${i.title}`));
