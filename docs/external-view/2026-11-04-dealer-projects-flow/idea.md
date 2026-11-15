# Idea file: how reference projects reach the website (outside view requested by the owner)

## The business (public facts only)
D&B Pergolen (working name): premium bioclimatic and sliding pergolas in Austria (Vienna, Linz) and Croatia, later other EU countries. Own brand, full cycle: measurement, installation by own teams, warranty, yearly service. A "virtual" company: very few people, software built with AI. Customers: home owners and hospitality businesses within about 50 km of a base. Channel partners ("dealers", also called agents) bring leads and work with the configurator and a CRM on a tablet; they can put their own branding on quotes.

## The hypothesis behind this decision (unconfirmed)
A simulated buyer panel (not real customers; models tend to be agreeable) suggested that the main barrier to buying is trust in an unknown brand, not price or product. What reportedly flips a refusal: real installed projects near the buyer, the possibility to call the owner of a project, reviews, a showroom. So the German landing page leads with real projects ("Referenzen") instead of speed claims. This is a hypothesis to be confirmed with real people and real traffic.

## The problem
The landing page needs a growing library of REAL projects with photos. The small office cannot photograph and write up every installation. Dealers and installers see the projects first-hand and can take photos.

## What exists already
- Public landing page that shows published projects (title, district, options, photos, video link, a "reference available on request" badge). The owner's contact data is never stored publicly; the office passes a contact on by phone.
- Roles: superadmin; manager (an office employee, many managers later); dealer (= agent, an external partner); client.
- Managers and the superadmin can add and edit projects and upload photos; only the superadmin can delete. A published project needs at least one photo.

## The flow the owner wants (his words, translated)
A dealer sends photos (and a description) of a project to the manager for approval. The manager, a person in the office, reviews it, deletes photos he does not like, checks the text for spelling, may add or correct something, and sends it for publication.

## Open design questions (with the current default in brackets)
1. What does a dealer see? [only his own submissions]
2. What may a manager delete? [photos of any submission and whole unpublished submissions; published projects only the superadmin]
3. Can the manager send a submission back to the dealer with a comment? [not in v1: the manager fixes it himself]
4. Spelling help [the browser's own spell checker for German and Russian now; AI-assisted correction later]
5. Notification to the manager about a new submission [inside the CRM now; e-mail later]
6. Consent: photos show customers' homes. [dealer must tick "the owner agrees to publication of the photos"; the database refuses to publish without it]

## Constraints
- EU/Austria/Croatia: GDPR, image rights of home owners and people in photos, the rule of the project: never publish invented projects, reviews or testimonials.
- Public repository and site: no financial figures or supplier names are in your brief and must not be requested.
- Tiny team; the manager's time is the bottleneck. The website is static, data in an EU database; hosting will move later.
- Dealers are external partners with their own interests; their incentive to send good material is not yet defined.

## What the owner will do next
Build the simplest version that works, test it in practice with real dealers and managers, then correct it.

## What we ask of you
Judge the DESIGN OF THIS FLOW through your lens: what is strong, what would kill it (top 3), the answers you recommend to the six questions with reasons, what to cut from version 1, how to give dealers a reason to send good material, how to prevent fake or low-quality submissions, and what exactly to measure in the first weeks and at which result to change course.
