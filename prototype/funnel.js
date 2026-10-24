/* ---------- customer mode: a five-step funnel over the same engine ----------
 * Size -> sides -> comfort -> colours -> quote. One decision per screen, simple choices first, the price is always
 * visible, nothing is pre-selected that costs extra. The full internal tool stays available as "Pro" mode.
 * Texts are in T below (DE / EN / RU); the printable quote and the request e-mail use the same language.
 */
(() => {
  // ASSUMPTION: private customers in Austria, standard VAT 20 %. Catalogue prices are net suggested retail prices.
  const VAT = 0.2;
  // TODO(office): office e-mail and phone for requests and the quote footer. While empty, the mail opens without a recipient.
  // Brand hidden for a demo video: put the company name back into name to show it again (header, quote, tab title).
  const OFFICE = { name: '', email: '', phone: '', web: '' };
  const CATALOGUE = '07/2026';
  // Visitor analytics (PostHog, EU cloud Frankfurt): funnel by step, sources, session recordings.
  // TODO(office): paste the Project API key (phc_…). While empty nothing is loaded and no consent banner is shown.
  const ANALYTICS = { posthogKey: 'phc_BMUEnuCKmhWZbpcLAPzGuUboWQdnUjE5BUknxKgkCc2b', host: 'https://eu.i.posthog.com' };

  const T = {
    de: {
      steps: ['Größe', 'Seiten', 'Komfort', 'Farben', 'Angebot'],
      moreOpt: 'Mehr …', next: 'Weiter', back: 'Zurück', toOffer: 'Zum Angebot', send: 'Anfrage senden',
      pro: 'Pro', proTitle: 'Erweiterte Ansicht für Fachberater', toCust: 'Kundenansicht',
      intro: 'Lamellendach in 5 Schritten konfigurieren. Richtpreis sofort, unverbindlich, ohne Anmeldung.',
      resume: 'Ihre letzte Konfiguration fortsetzen?', resumeYes: 'Fortsetzen', resumeNo: 'Neu beginnen',
      gross: 'inkl. 20 % USt.', net: 'netto', from: 'ab', priceNa: 'Größe anpassen',
      // step 1
      s1: 'Wie groß soll Ihre Terrassenüberdachung werden?', s1l: 'Messen Sie die Fläche, die beschattet werden soll. Wir teilen große Flächen automatisch in Module auf.',
      wall: 'An der Hauswand', wallD: 'Hinten an der Fassade befestigt', free: 'Freistehend', freeD: 'Mit Stützen an allen vier Ecken',
      width: 'Breite', widthWall: 'Breite (entlang der Wand)', depth: 'Tiefe', depthWall: 'Tiefe (von der Wand weg)', m: 'm',
      presets: 'Häufige Größen', height: 'Stützenhöhe', heightStd: 'Standard', incl: 'inklusive',
      layout: 'Aufteilung', recommended: 'Empfehlung', cheapest: 'günstigste', modules: (n) => n === 1 ? '1 Modul' : n + ' Module', posts: (n) => n + ' Stützen',
      otherLayouts: (n) => n === 1 ? '1 weitere Aufteilung' : n + ' weitere Aufteilungen',
      louvTip: (s) => `Tipp: Lamellen quer drehen – gleiche Fläche, ${s} günstiger.`, louvDo: 'Übernehmen', louvDir: 'Lamellenrichtung', louvNa: 'nicht möglich',
      louvNow: (d) => `Lamellen laufen ${d}.`, louvPar: 'parallel zur Hauswand', louvPerp: 'von der Hauswand weg', louvParF: 'entlang der Breite', louvPerpF: 'entlang der Tiefe',
      sugg: { DEPTH_TOO_SMALL: 'Die Tiefe ist kleiner als möglich.', WIDTH_TOO_SMALL: 'Die Breite ist kleiner als möglich.', DEPTH_TOO_LARGE: 'Die Tiefe ist größer als möglich.', WIDTH_TOO_LARGE: 'Die Breite ist größer als möglich.', NO_COMBINATION: 'Diese Größe lässt sich nicht bauen.' },
      suggFix: (v) => `Auf ${v} m ändern`,
      snapped: (b, r) => `Wegen des Lamellenrasters wird ${b} m statt ${r} m gebaut.`, multiRow: 'Mehrere Reihen in der Tiefe – den Preis bestätigen wir mit Ihrer Anfrage.',
      // step 2
      s2: 'Welche Seiten möchten Sie schließen?', s2l: 'Jede Seite kann offen bleiben oder Sonnen-, Wind- oder Sichtschutz bekommen. Sie können auch im 3D-Bild auf eine Seite tippen.',
      fillsS: { none: 'Offen', zip: 'ZIP', glass: 'Glas', verto: 'Lamellen', panels: 'Paneele' },
      allSides: 'Alle Seiten', fills: { none: 'Offen', zip: 'ZIP-Screen', glass: 'Schiebeglas', verto: 'Lamellenwand', panels: 'Schiebepaneele' },
      legend: { zip: 'Stoffbehang in seitlichen Führungen, motorisch – Sonnen- und Sichtschutz.', glass: 'Glas-Schiebeelemente (Win Glass) – Schutz vor Wind und Regen.', verto: 'Feste Aluminiumprofile (Decor) – Sichtschutz, Luft kommt durch.', panels: 'Aluminium-Lamellenpaneele auf Schienen (Win Panels) – verschiebbar.' },
      sides: { front: 'Vorne', left: 'Links', right: 'Rechts', back: 'Hinten' }, field: 'Feld', row: 'Reihe',
      park: 'Glas', parkL: '← links', parkR: 'rechts →', parkBoth: '↔ offen', shut: 'zu',
      cta: 'Tippen Sie auf ein ＋, um eine Seite zu schließen – ZIP-Screen, Glas oder Paneele', hsOpen: 'Seite wählen',
      notMade: 'In dieser Größe nicht lieferbar – andere Variante wählen.', zipFabricOnly: (s) => `In dieser Größe nur mit Stoff ${s} – oben bei „Stoff der ZIP-Screens“ wählen.`, zipMax: (m, ax) => `ZIP-Screens gibt es bis ${m} m ${ax === 'height' ? 'Höhe' : 'Breite'}.`, swapped: (a, b) => `Stoff ${a} statt ${b} – ${b} gibt es nicht so groß`, later: 'Preis auf Anfrage',
      fabric: 'Stoff der ZIP-Screens', ofName: { 14: 'Luftig, viel Durchsicht', 5: 'Sonnen- und Sichtschutz', 4: 'Sicht- und Sonnenschutz, etwas dichter', 1: 'Fast blickdicht', 0: 'Verdunkelung' },
      perM2: '€/m²', zipCtl: 'Bedienung über die Fernbedienung der Pergola.', ctlT: 'Bedienung der Screens', ctlD: 'alle Screens mit Motor', ctlM: { pergola: 'Mit der Pergola-Fernbedienung', remote: 'Separate Fernbedienung', smart: 'Smartphone-App', switch: 'Schalter an der Wand', solar: 'Solar, ohne Stromkabel' }, ctlStd: 'Standard', cardQ: 'Was kommt auf diese Seite?', done: 'Fertig', thisScreen: 'Bedienung dieses Screens',
      glassTint: 'Glas', tints: { float: 'Klar', diamant: 'Extraklar', milk: 'Milchglas', brown: 'Bronze', graphite: 'Graphit', black: 'Schwarz', mirror: 'Spiegel' }, tintNa: 'nur 10 mm',
      // step 3
      s3: 'Was macht es gemütlich?', s3l: 'Alles optional. Wählen Sie nur, was Sie wirklich nutzen werden – nachrüsten ist bei vielem später schwieriger.',
      light: 'Licht', lightD: 'Für Abende auf der Terrasse', lights: { none: 'Kein Licht', white: 'LED-Band warmweiß', rgbw: 'LED-Band farbig (RGBW)', spots: 'LED-Spots' },
      heat: 'Wärme', heatD: 'Heizstrahler unter dem Dach', heats: { none: 'Keine', 'm1.single': '1 Strahler 1,5 kW (~10 m²)', 'm1.pair': '2 Strahler 1,5 kW', 'm1.double': 'Doppelstrahler 4 kW (~25 m²)', other: 'Heizstrahler-Set' },
      weather: 'Wetter-Automatik', weatherD: 'Lamellen schließen von selbst', weathers: { none: 'Keine', wind: 'Windsensor', rain: 'Regensensor', set: 'Wind + Regen + Temperatur', multi: 'Multisensor inkl. Schnee' },
      app: 'Steuerung', appD: 'Fernbedienung ist immer dabei', apps: { none: 'Nur Fernbedienung', bluetooth: 'App über Bluetooth', wifi: 'App über WLAN, auch unterwegs' },
      audio: 'Musik', audioD: '2 Lautsprecher, Bluetooth', thermal: 'Leiser bei Regen', thermalD: 'Dämmeinlage in den Lamellen',
      sockets: 'Steckdosen in der Stütze', socketsD: '230 V', on: 'Ja', off: 'Nein',
      // step 4
      s4: 'Welche Farbe passt zu Ihrem Haus?', s4l: 'Die zwei Standardfarben sind im Preis. Andere Farben kosten einen Aufpreis in Prozent.',
      frame: 'Rahmen und Stützen', roof: 'Lamellen', slideCol: 'Profile von Glas und Paneelen', zipCol: 'ZIP-Kassette und Führungen', asFrame: 'wie Rahmen', moreColours: 'Weitere Farben', groups: { fine: 'Feinstruktur', smooth: 'Glatt matt', exclusive: 'Exklusiv', wood: 'Holzoptik' },
      fabricTone: 'Farbton des Stoffes', colourNote: 'Farben am Bildschirm sind Annäherungen. Vor der Bestellung zeigen wir Ihnen Originalmuster.',
      // step 5
      s5: 'Ihr Richtpreis', s5l: 'Auf Basis der Katalogpreise ' + CATALOGUE + '. Unverbindlich – der endgültige Preis folgt nach dem Aufmaß vor Ort.',
      grp: { pergola: 'Pergola', sides: 'Seiten', comfort: 'Komfort', colours: 'Farben und Zuschläge', extra: 'Montage und Zusatzleistungen' },
      split: { title: 'Aufteilung der Module', alongW: 'Breite', alongD: 'Tiefe', left: 'Stoß nach links', right: 'Stoß nach rechts', even: 'Gleich teilen', auto: '↺ Automatisch', note: (a, b) => `Pfeile verschieben den Stoß · ein Modul ${a} bis ${b}` }, jointT: (a, b) => `Zwischen Modul ${a} und ${b}`, montT: 'Montage', delivery: 'Lieferung', extraT: 'Zusatzleistung', qExclM: 'Nicht enthalten: Lieferung, Fundamente, Elektroanschluss, Genehmigungen.',
      notIncl: 'Nicht im Preis enthalten', notInclList: ['Lieferung und Montage', 'Fundamente und Elektroanschluss', 'Behördliche Genehmigungen, falls nötig'],
      incomplete: 'Einige Positionen sind in dieser Größe nicht lieferbar und nicht im Preis.',
      print: 'Angebot drucken oder als PDF speichern', printS: 'Angebot als PDF speichern', request: 'Unverbindliche Anfrage senden', requestS: 'Wir melden uns persönlich bei Ihnen', share: 'Link kopieren', shareS: 'zum Teilen oder später weitermachen', copied: 'Link kopiert',
      saveFile: 'Als Datei speichern', openFile: 'Datei öffnen',
      formT: 'Ihre Anfrage', name: 'Name', email: 'E-Mail', phone: 'Telefon (optional)', place: 'PLZ und Ort der Montage (optional)', when: 'Wann möchten Sie bauen?',
      whens: ['So bald wie möglich', 'In 1–3 Monaten', 'Später in diesem Jahr', 'Ich informiere mich nur'],
      wantMount: 'Montage gewünscht', wantVisit: 'Besichtigung und Aufmaß vor Ort gewünscht', msg: 'Nachricht (optional)',
      required: 'Bitte ausfüllen', badEmail: 'Bitte eine gültige E-Mail-Adresse eingeben',
      privacy: 'Ihre Angaben werden nur für diese Anfrage verwendet. Die Nachricht wird über Ihr E-Mail-Programm gesendet – auf dieser Seite wird nichts gespeichert.',
      sendBtn: 'E-Mail mit Anfrage öffnen', sentT: 'Fast geschafft', reopen: 'E-Mail noch einmal öffnen', sent: 'Ihr E-Mail-Programm hat sich mit der fertigen Nachricht geöffnet. Bitte senden Sie sie ab.', noMail: 'Kein E-Mail-Programm? Text kopieren', textCopied: 'Text kopiert',
      faqT: 'Häufige Fragen',
      faq: [
        ['Ist der Preis verbindlich?', 'Nein. Es ist ein Richtpreis auf Basis der Katalogpreise ' + CATALOGUE + '. Den verbindlichen Preis erhalten Sie nach dem Aufmaß vor Ort.'],
        ['Brauche ich eine Baugenehmigung?', 'Das hängt vom Bundesland und der Gemeinde ab. Fragen Sie vor der Bestellung beim Bauamt nach – Maße und Ansicht aus diesem Angebot helfen dabei.'],
        ['Was ist im Preis nicht enthalten?', 'Lieferung, Montage, Fundamente, Elektroanschluss und eventuelle Genehmigungen.'],
        ['Wie geht es nach der Anfrage weiter?', 'Wir besprechen die Details mit Ihnen und vereinbaren bei Bedarf einen Termin für das Aufmaß. Danach erhalten Sie ein verbindliches Angebot.'],
      ],
      hint: 'Ziehen zum Drehen. Tippen Sie auf eine Seite, um sie zu schließen.',
      tb: { ang: 'Lamellen', drop: 'Screens', gopen: 'Glas', evening: 'Abend', front: 'Vorne', top: 'Oben', closed: 'zu', open: 'offen', louv: 'Lamellenrichtung drehen', view: 'Ansicht', louvCap: 'Lamellen', move: 'Bewegen', night: 'Nacht', nightT: 'Tag / Nacht – Licht einschalten', moveT: 'Lamellen drehen, Glas und Screens bewegen' },
      // quote
      qClient: 'Kunde', qTitle: 'Richtpreisangebot', qNo: 'Nr.', qDate: 'Datum', qConfig: 'Ihre Konfiguration', qPrice: 'Preis', qItem: 'Position', qNet: 'Summe netto', qVat: 'USt. 20 %', qGross: 'Gesamt inkl. USt.',
      qFacts: { size: 'Größe', mount: 'Montage', model: 'Modell', height: 'Stützenhöhe', sides: 'Seiten', colours: 'Farben', comfort: 'Komfort' },
      qNotes: ['Richtpreis auf Basis der Katalogpreise ' + CATALOGUE + ', unverbindlich.', 'Nicht enthalten: Lieferung, Montage, Fundamente, Elektroanschluss, Genehmigungen.', 'Der endgültige Preis folgt nach dem Aufmaß vor Ort.', 'Farben am Bildschirm sind Annäherungen.'],
      qLink: 'Konfiguration online öffnen', none: 'keine', open: 'offen',
      fam: { S400: 'S400', S500: 'S500', S500_DOUBLE: 'S500 Doppel' }, pergola: 'Lamellendach', panelsW: 'Flügel', profilesW: 'Profile', slatsFixed: 'feste Lamellen', slatsRot: 'drehbare Lamellen',
      opt: { OPT_POST_HEIGHT: 'Höhere Stützen', OPT_LED_LOUVRES: 'LED-Lichtband in den Lamellen', OPT_LED_GUTTER: 'LED-Licht in der Rinne', OPT_THERMAL: 'Dämmeinlage in den Lamellen', OPT_SENSOR: 'Wettersensoren', OPT_SMART: 'App-Steuerung', OPT_HEATERS: 'Heizstrahler', OPT_HEATER_PREP: 'Vorbereitung für Heizstrahler', OPT_INTERNAL_BOX: 'Innenliegende Elektrobox', OPT_AUDIO: 'Audiosystem', OPT_SOCKET: 'Steckdosen in der Stütze', OPT_SPOTS: 'LED-Spots in den Lamellen', OPT_LAMPS: 'LED-Leuchten in den Lamellen', OPT_CROWN_SPOTS: 'LED-Spots im Rahmen', OPT_VERTICAL_LAMPS: 'LED-Leuchten an den Stützen', OPT_INTERMEDIATE_POST: 'Zusätzliche Stützen' },
      ctl: { CONTROL_PERGOLA_UNIT: 'Steuermodul für die Screens', CONTROL_REMOTE: 'Fernbedienung für die Screens', CONTROL_SMART: 'Smart-Home-Modul', CONTROL_WIND_SENSOR: 'Windsensor für die Screens', CONTROL_SWITCH: 'Wandschalter', CONTROL_PERGOLA_REMOTE_EXTRA: 'Zusätzliche Fernbedienung', CONTROL_CUSTOM: 'Steuerung' },
      parT: 'Brüstung', parD: 'Stützen direkt an der Mauer, Glas / ZIP stehen darauf', parNone: 'Keine', parH: 'Höhe der Brüstung',
      vertoT: 'Decor – Lamellen an der Pergola', vertoD: 'Feste Aluminiumprofile als Sicht- und Sonnenschutz, auch zusammen mit ZIP und Glas', vNone: 'Ohne',
      vTypes: { 1: 'An jeder Ecke', 2: 'Vorne und hinten', 3: 'Ein Paket vorne', 4: 'An beiden Seiten', 5: 'Beide Seiten ganz', 6: 'Mitte vorne' }, vTypesWall: { 2: 'Vorne und seitlich', 6: 'Mitte vorne und seitlich' },
      vTypesT: 'Beispiele', vSideT: 'Seite', vMountT: 'Montage der Profile', vMounts: { A: 'Über das Dach hinaus', B: 'Bis Oberkante Rahmen', C: 'In der Öffnung', D: 'Mit Eckverbindung' },
      vMountsD: { A: 'Profile enden über den Lamellen', B: 'Außen am Rahmen, bündig oben', C: 'Unter dem Rahmen zwischen den Stützen, außen bündig – ZIP oder Glas bleibt möglich', D: 'Pakete laufen um die Ecke, je Ecke +53 €' },
      vEdit: 'Tippen Sie im 3D auf eine Seite, um Pakete zu ändern.', vSide: 'Decor an dieser Seite', vPos: { none: 'Ohne', L: 'Links', center: 'Mitte', R: 'Rechts', full: 'Ganze Seite' },
      vProf: 'Profile', vPack: 'Paket', vClosed: 'In der Öffnung nicht möglich – die Seite ist schon geschlossen. Montage am Rahmen wählen.', vHigh: 'Profile zu lang für die Preisliste', vMountW: 'Montage',
      coat: 'Farbaufpreis', coatMin: 'Mindermengenzuschlag Beschichtung', fabricS: 'Stoffaufpreis', corner: 'Eckverbindung Lamellenwand', tbdPanels: 'Farbaufpreis Paneele', onRequest: 'auf Anfrage', extra: 'Zuschlag',
      sysName: { S400: 'Pergola', S500: 'Pergola', GLASS: 'Schiebeglas', SCREEN_ZIP: 'ZIP-Screens', VERTO: 'Lamellenwand' },
      mailSubj: (s, p) => `Anfrage Lamellendach ${s} – Richtpreis ${p}`, mailHi: 'Guten Tag,\n\nich interessiere mich für folgende Konfiguration:', mailBye: 'Mit freundlichen Grüßen',
      mm: 'mm',
    },
    en: {
      steps: ['Size', 'Sides', 'Comfort', 'Colours', 'Quote'],
      moreOpt: 'More …', next: 'Next', back: 'Back', toOffer: 'See quote', send: 'Send request',
      pro: 'Pro', proTitle: 'Advanced view for sales staff', toCust: 'Customer view',
      intro: 'Configure your louvred roof in 5 steps. Indicative price right away, no obligation, no sign-up.',
      resume: 'Continue your last configuration?', resumeYes: 'Continue', resumeNo: 'Start over',
      gross: 'incl. 20 % VAT', net: 'net', from: 'from', priceNa: 'adjust the size',
      s1: 'How large should your terrace roof be?', s1l: 'Measure the area you want to shade. Large areas are split into modules automatically.',
      wall: 'Against the house', wallD: 'Fixed to the facade at the back', free: 'Freestanding', freeD: 'Posts at all four corners',
      width: 'Width', widthWall: 'Width (along the wall)', depth: 'Depth', depthWall: 'Depth (away from the wall)', m: 'm',
      presets: 'Common sizes', height: 'Post height', heightStd: 'standard', incl: 'included',
      layout: 'Layout', recommended: 'Recommended', cheapest: 'lowest price', modules: (n) => n === 1 ? '1 module' : n + ' modules', posts: (n) => n + ' posts',
      otherLayouts: (n) => n === 1 ? '1 other layout' : n + ' other layouts',
      louvTip: (s) => `Tip: turn the louvres – same area, ${s} less.`, louvDo: 'Apply', louvDir: 'Louvre direction', louvNa: 'not possible',
      louvNow: (d) => `Louvres run ${d}.`, louvPar: 'parallel to the wall', louvPerp: 'away from the wall', louvParF: 'along the width', louvPerpF: 'along the depth',
      sugg: { DEPTH_TOO_SMALL: 'The depth is below the minimum.', WIDTH_TOO_SMALL: 'The width is below the minimum.', DEPTH_TOO_LARGE: 'The depth is above the maximum.', WIDTH_TOO_LARGE: 'The width is above the maximum.', NO_COMBINATION: 'This size cannot be built.' },
      suggFix: (v) => `Change to ${v} m`,
      snapped: (b, r) => `Because of the louvre spacing, ${b} m is built instead of ${r} m.`, multiRow: 'Several rows in depth – we confirm the price with your request.',
      s2: 'Which sides would you like to close?', s2l: 'Each side can stay open or get sun, wind or privacy protection. You can also tap a side in the 3D view.',
      fillsS: { none: 'Open', zip: 'ZIP', glass: 'Glass', verto: 'Louvres', panels: 'Panels' },
      allSides: 'All sides', fills: { none: 'Open', zip: 'ZIP screen', glass: 'Sliding glass', verto: 'Louvre wall', panels: 'Sliding panels' },
      legend: { zip: 'Fabric blind in side guides, motorised – sun and privacy protection.', glass: 'Sliding glass panels (Win Glass) – shelter from wind and rain.', verto: 'Fixed aluminium profiles (Decor) – privacy, air still flows.', panels: 'Aluminium louvre panels on rails (Win Panels) – slide aside.' },
      sides: { front: 'Front', left: 'Left', right: 'Right', back: 'Back' }, field: 'bay', row: 'row',
      park: 'Glass', parkL: '← left', parkR: 'right →', parkBoth: '↔ open', shut: 'closed',
      cta: 'Tap a ＋ to close a side – ZIP screen, glass or panels', hsOpen: 'Choose side',
      notMade: 'Not available in this size – please choose another option.', zipFabricOnly: (s) => `In this size only with fabric ${s} – choose it under “ZIP screen fabric” above.`, zipMax: (m, ax) => `ZIP screens are made up to ${m} m ${ax === 'height' ? 'high' : 'wide'}.`, swapped: (a, b) => `fabric ${a} instead of ${b} – ${b} is not made this large`, later: 'price on request',
      fabric: 'ZIP screen fabric', ofName: { 14: 'Airy, lots of view', 5: 'Sun and privacy', 4: 'Sun and privacy, a little denser', 1: 'Almost opaque', 0: 'Blackout' },
      perM2: '€/m²', zipCtl: 'Operated with the pergola remote control.', ctlT: 'Screen control', ctlD: 'all screens are motorised', ctlM: { pergola: 'With the pergola remote', remote: 'Separate remote', smart: 'Smartphone app', switch: 'Wall switch', solar: 'Solar, no power cable' }, ctlStd: 'standard', cardQ: 'What goes on this side?', done: 'Done', thisScreen: 'Control of this screen',
      glassTint: 'Glass', tints: { float: 'Clear', diamant: 'Extra clear', milk: 'Frosted', brown: 'Bronze', graphite: 'Graphite', black: 'Black', mirror: 'Mirror' }, tintNa: '10 mm only',
      s3: 'What makes it cosy?', s3l: 'All optional. Pick only what you will really use – many things are harder to add later.',
      light: 'Light', lightD: 'For evenings outside', lights: { none: 'No light', white: 'LED strip, warm white', rgbw: 'LED strip, colour (RGBW)', spots: 'LED spots' },
      heat: 'Warmth', heatD: 'Heaters under the roof', heats: { none: 'None', 'm1.single': '1 heater 1.5 kW (~10 m²)', 'm1.pair': '2 heaters 1.5 kW', 'm1.double': 'Double heater 4 kW (~25 m²)', other: 'Heater set' },
      weather: 'Weather automation', weatherD: 'Louvres close by themselves', weathers: { none: 'None', wind: 'Wind sensor', rain: 'Rain sensor', set: 'Wind + rain + temperature', multi: 'Multi-sensor incl. snow' },
      app: 'Control', appD: 'A remote control is always included', apps: { none: 'Remote only', bluetooth: 'App via Bluetooth', wifi: 'App via Wi-Fi, also away' },
      audio: 'Music', audioD: '2 speakers, Bluetooth', thermal: 'Quieter in rain', thermalD: 'Insulating insert in the louvres',
      sockets: 'Sockets in the post', socketsD: '230 V', on: 'Yes', off: 'No',
      s4: 'Which colour suits your house?', s4l: 'The two standard colours are included. Other colours add a percentage.',
      frame: 'Frame and posts', roof: 'Louvres', slideCol: 'Glass and panel profiles', zipCol: 'ZIP box and guides', asFrame: 'same as frame', moreColours: 'More colours', groups: { fine: 'Fine texture', smooth: 'Smooth matt', exclusive: 'Exclusive', wood: 'Wood look' },
      fabricTone: 'Fabric shade', colourNote: 'Screen colours are approximate. We show you original samples before you order.',
      s5: 'Your indicative price', s5l: 'Based on catalogue prices ' + CATALOGUE + '. Not binding – the final price follows a site survey.',
      grp: { pergola: 'Pergola', sides: 'Sides', comfort: 'Comfort', colours: 'Colours and surcharges', extra: 'Installation and extras' },
      split: { title: 'Module division', alongW: 'Width', alongD: 'Depth', left: 'Joint to the left', right: 'Joint to the right', even: 'Split evenly', auto: '↺ Automatic', note: (a, b) => `Arrows move the joint · one module ${a} to ${b}` }, jointT: (a, b) => `Between module ${a} and ${b}`, montT: 'Installation', delivery: 'Delivery', extraT: 'Additional item', qExclM: 'Not included: delivery, foundations, electrical connection, permits.',
      notIncl: 'Not included', notInclList: ['Delivery and installation', 'Foundations and electrical connection', 'Building permits, if required'],
      incomplete: 'Some items are not available in this size and are not in the price.',
      print: 'Print the quote or save it as PDF', printS: 'Save the offer as PDF', request: 'Send a free request', requestS: 'We will get back to you personally', share: 'Copy link', shareS: 'to share or continue later', copied: 'Link copied',
      saveFile: 'Save as file', openFile: 'Open file',
      formT: 'Your request', name: 'Name', email: 'E-mail', phone: 'Phone (optional)', place: 'Postcode and town of installation (optional)', when: 'When would you like to build?',
      whens: ['As soon as possible', 'In 1–3 months', 'Later this year', 'Just looking'],
      wantMount: 'Installation wanted', wantVisit: 'Site visit and measurement wanted', msg: 'Message (optional)',
      required: 'Please fill in', badEmail: 'Please enter a valid e-mail address',
      privacy: 'Your details are only used for this request. The message is sent from your own e-mail program – nothing is stored on this page.',
      sendBtn: 'Open e-mail with request', sentT: 'Almost done', reopen: 'Open the e-mail again', sent: 'Your e-mail program opened with the message ready. Please send it.', noMail: 'No e-mail program? Copy the text', textCopied: 'Text copied',
      faqT: 'Questions',
      faq: [
        ['Is the price binding?', 'No. It is an indicative price based on catalogue prices ' + CATALOGUE + '. You get a binding price after the site survey.'],
        ['Do I need a building permit?', 'That depends on your region and municipality. Ask your building authority before ordering – the sizes and view in this quote help.'],
        ['What is not included?', 'Delivery, installation, foundations, electrical connection and any permits.'],
        ['What happens after my request?', 'We discuss the details with you and, if needed, arrange a site survey. After that you receive a binding quote.'],
      ],
      hint: 'Drag to rotate. Tap a side to close it.',
      tb: { ang: 'Louvres', drop: 'Screens', gopen: 'Glass', evening: 'Evening', front: 'Front', top: 'Top', closed: 'closed', open: 'open', louv: 'Turn the louvre direction', view: 'View', louvCap: 'Louvres', move: 'Move', night: 'Night', nightT: 'Day / night – switch the lights on', moveT: 'Tilt the louvres, move glass and screens' },
      qClient: 'Customer', qTitle: 'Indicative quote', qNo: 'No.', qDate: 'Date', qConfig: 'Your configuration', qPrice: 'Price', qItem: 'Item', qNet: 'Total net', qVat: 'VAT 20 %', qGross: 'Total incl. VAT',
      qFacts: { size: 'Size', mount: 'Mounting', model: 'Model', height: 'Post height', sides: 'Sides', colours: 'Colours', comfort: 'Comfort' },
      qNotes: ['Indicative price based on catalogue prices ' + CATALOGUE + ', not binding.', 'Not included: delivery, installation, foundations, electrical connection, permits.', 'The final price follows a site survey.', 'Screen colours are approximate.'],
      qLink: 'Open the configuration online', none: 'none', open: 'open',
      fam: { S400: 'S400', S500: 'S500', S500_DOUBLE: 'S500 double' }, pergola: 'Louvred roof', panelsW: 'panels', profilesW: 'profiles', slatsFixed: 'fixed slats', slatsRot: 'rotating slats',
      opt: { OPT_POST_HEIGHT: 'Taller posts', OPT_LED_LOUVRES: 'LED strip in the louvres', OPT_LED_GUTTER: 'LED light in the gutter', OPT_THERMAL: 'Insulating insert in the louvres', OPT_SENSOR: 'Weather sensors', OPT_SMART: 'App control', OPT_HEATERS: 'Heaters', OPT_HEATER_PREP: 'Heater preparation', OPT_INTERNAL_BOX: 'Internal electrical box', OPT_AUDIO: 'Audio system', OPT_SOCKET: 'Sockets in the post', OPT_SPOTS: 'LED spots in the louvres', OPT_LAMPS: 'LED lamps in the louvres', OPT_CROWN_SPOTS: 'LED spots in the frame', OPT_VERTICAL_LAMPS: 'LED lights on the posts', OPT_INTERMEDIATE_POST: 'Additional posts' },
      ctl: { CONTROL_PERGOLA_UNIT: 'Control unit for the screens', CONTROL_REMOTE: 'Remote control for the screens', CONTROL_SMART: 'Smart home unit', CONTROL_WIND_SENSOR: 'Wind sensor for the screens', CONTROL_SWITCH: 'Wall switch', CONTROL_PERGOLA_REMOTE_EXTRA: 'Additional remote control', CONTROL_CUSTOM: 'Controls' },
      parT: 'Parapet wall', parD: 'Posts right next to the wall, glass / ZIP stand on it', parNone: 'None', parH: 'Parapet height',
      vertoT: 'Decor – louvres on the pergola', vertoD: 'Fixed aluminium profiles for privacy and shade, also together with ZIP and glass', vNone: 'None',
      vTypes: { 1: 'At every corner', 2: 'Front and back', 3: 'One package at the front', 4: 'On both sides', 5: 'Both sides full', 6: 'Front centre' }, vTypesWall: { 2: 'Front and side', 6: 'Front centre and side' },
      vTypesT: 'Examples', vSideT: 'Side', vMountT: 'Mounting of the profiles', vMounts: { A: 'Above the roof', B: 'Up to the frame top', C: 'In the opening', D: 'With corner joint' },
      vMountsD: { A: 'Profiles end above the louvres', B: 'Outside on the frame, flush at the top', C: 'Under the frame between the posts, flush outside – ZIP or glass still possible', D: 'Packages wrap around the corner, +53 € per corner' },
      vEdit: 'Tap a side in the 3D view to change its packages.', vSide: 'Decor on this side', vPos: { none: 'None', L: 'Left', center: 'Centre', R: 'Right', full: 'Whole side' },
      vProf: 'profiles', vPack: 'package', vClosed: 'Not possible in the opening – the side is already closed. Choose mounting on the frame.', vHigh: 'Profiles too long for the price list', vMountW: 'mounting',
      coat: 'Colour surcharge', coatMin: 'Small-batch coating surcharge', fabricS: 'Fabric surcharge', corner: 'Louvre wall corner joint', tbdPanels: 'Panel colour surcharge', onRequest: 'on request', extra: 'surcharge',
      sysName: { S400: 'pergola', S500: 'pergola', GLASS: 'sliding glass', SCREEN_ZIP: 'ZIP screens', VERTO: 'louvre wall' },
      mailSubj: (s, p) => `Request: louvred roof ${s} – indicative price ${p}`, mailHi: 'Hello,\n\nI am interested in the following configuration:', mailBye: 'Kind regards',
      mm: 'mm',
    },
    ru: {
      steps: ['Размер', 'Стороны', 'Комфорт', 'Цвета', 'Итог'],
      moreOpt: 'Ещё …', next: 'Далее', back: 'Назад', toOffer: 'К предложению', send: 'Отправить запрос',
      pro: 'Pro', proTitle: 'Расширенный режим для менеджера', toCust: 'Режим клиента',
      intro: 'Пергола с ламелями за 5 шагов. Ориентировочная цена сразу, без обязательств и без регистрации.',
      resume: 'Продолжить прошлую конфигурацию?', resumeYes: 'Продолжить', resumeNo: 'Начать заново',
      gross: 'с НДС 20 %', net: 'без НДС', from: 'от', priceNa: 'измените размер',
      s1: 'Какого размера нужна пергола?', s1l: 'Измерьте площадь, которую хотите затенить. Большую площадь система сама разделит на модули.',
      wall: 'У стены дома', wallD: 'Сзади крепится к фасаду', free: 'Отдельностоящая', freeD: 'Стойки на всех четырёх углах',
      width: 'Ширина', widthWall: 'Ширина (вдоль стены)', depth: 'Глубина', depthWall: 'Глубина (от стены)', m: 'м',
      presets: 'Популярные размеры', height: 'Высота стоек', heightStd: 'стандарт', incl: 'в цене',
      layout: 'Компоновка', recommended: 'Рекомендуем', cheapest: 'дешевле всего', modules: (n) => n + ' ' + (n === 1 ? 'модуль' : n < 5 ? 'модуля' : 'модулей'), posts: (n) => n + ' ' + (n < 5 ? 'стойки' : 'стоек'),
      otherLayouts: (n) => 'Ещё ' + n + ' ' + (n === 1 ? 'вариант' : n < 5 ? 'варианта' : 'вариантов'),
      louvTip: (s) => `Совет: поверните ламели – та же площадь, дешевле на ${s}.`, louvDo: 'Применить', louvDir: 'Направление ламелей', louvNa: 'нельзя',
      louvNow: (d) => `Ламели идут ${d}.`, louvPar: 'вдоль стены', louvPerp: 'от стены вперёд', louvParF: 'вдоль ширины', louvPerpF: 'вдоль глубины',
      sugg: { DEPTH_TOO_SMALL: 'Глубина меньше минимальной.', WIDTH_TOO_SMALL: 'Ширина меньше минимальной.', DEPTH_TOO_LARGE: 'Глубина больше возможной.', WIDTH_TOO_LARGE: 'Ширина больше возможной.', NO_COMBINATION: 'Такой размер не собирается.' },
      suggFix: (v) => `Изменить на ${v} м`,
      snapped: (b, r) => `Из-за шага ламелей строится ${b} м вместо ${r} м.`, multiRow: 'Несколько рядов в глубину – цену подтвердим по запросу.',
      s2: 'Какие стороны закрыть?', s2l: 'Каждая сторона может остаться открытой или получить защиту от солнца, ветра или взглядов. Можно нажать на сторону прямо на 3D.',
      fillsS: { none: 'Открыто', zip: 'ZIP', glass: 'Стекло', verto: 'Ламели', panels: 'Панели' },
      allSides: 'Все стороны', fills: { none: 'Открыто', zip: 'ZIP-скрин', glass: 'Раздвижное стекло', verto: 'Ламельная стена', panels: 'Раздвижные панели' },
      legend: { zip: 'Ткань в боковых направляющих, с мотором – от солнца и взглядов.', glass: 'Раздвижные стеклянные полотна (Win Glass) – от ветра и дождя.', verto: 'Неподвижные алюминиевые профили (Decor) – от взглядов, воздух проходит.', panels: 'Алюминиевые ламельные панели на направляющих (Win Panels) – сдвигаются.' },
      sides: { front: 'Спереди', left: 'Слева', right: 'Справа', back: 'Сзади' }, field: 'проём', row: 'ряд',
      park: 'Стекло', parkL: '← влево', parkR: 'вправо →', parkBoth: '↔ открыто', shut: 'закрыто',
      cta: 'Нажмите ＋ на стороне, чтобы закрыть её – ZIP-скрин, стекло или панели', hsOpen: 'Выбрать сторону',
      notMade: 'В таком размере не производится – выберите другой вариант.', zipFabricOnly: (s) => `В таком размере только с тканью ${s} – выберите её выше в «Ткань ZIP-скринов».`, zipMax: (m, ax) => `ZIP-скрины делают до ${m} м по ${ax === 'height' ? 'высоте' : 'ширине'}.`, swapped: (a, b) => `ткань ${a} вместо ${b} – ${b} не делают такого размера`, later: 'цена по запросу',
      fabric: 'Ткань ZIP-скринов', ofName: { 14: 'Лёгкая, хорошо видно наружу', 5: 'От солнца и взглядов', 4: 'От солнца и взглядов, чуть плотнее', 1: 'Почти непрозрачная', 0: 'Блэкаут' },
      perM2: '€/м²', zipCtl: 'Управление с пульта перголы.', ctlT: 'Управление скринами', ctlD: 'все скрины с мотором', ctlM: { pergola: 'С пульта перголы', remote: 'Отдельный пульт', smart: 'Приложение на телефоне', switch: 'Выключатель на стене', solar: 'Солнечная батарея, без кабеля' }, ctlStd: 'стандарт', cardQ: 'Что поставить на эту сторону?', done: 'Готово', thisScreen: 'Управление этим скрином',
      glassTint: 'Стекло', tints: { float: 'Прозрачное', diamant: 'Особо прозрачное', milk: 'Матовое', brown: 'Бронза', graphite: 'Графит', black: 'Чёрное', mirror: 'Зеркальное' }, tintNa: 'только 10 мм',
      s3: 'Что сделает уютнее?', s3l: 'Всё по желанию. Выбирайте только то, чем будете пользоваться, – многое потом добавить сложнее.',
      light: 'Свет', lightD: 'Для вечеров на террасе', lights: { none: 'Без света', white: 'LED-лента, тёплый белый', rgbw: 'LED-лента, цветная (RGBW)', spots: 'LED-споты' },
      heat: 'Тепло', heatD: 'Обогреватели под крышей', heats: { none: 'Нет', 'm1.single': '1 обогреватель 1,5 кВт (~10 м²)', 'm1.pair': '2 обогревателя 1,5 кВт', 'm1.double': 'Двойной 4 кВт (~25 м²)', other: 'Комплект обогревателей' },
      weather: 'Автоматика погоды', weatherD: 'Ламели закрываются сами', weathers: { none: 'Нет', wind: 'Датчик ветра', rain: 'Датчик дождя', set: 'Ветер + дождь + температура', multi: 'Мультидатчик со снегом' },
      app: 'Управление', appD: 'Пульт всегда в комплекте', apps: { none: 'Только пульт', bluetooth: 'Приложение по Bluetooth', wifi: 'Приложение по Wi-Fi, и вне дома' },
      audio: 'Музыка', audioD: '2 колонки, Bluetooth', thermal: 'Тише в дождь', thermalD: 'Термовставка в ламелях',
      sockets: 'Розетки в стойке', socketsD: '230 В', on: 'Да', off: 'Нет',
      s4: 'Какой цвет подойдёт к дому?', s4l: 'Два стандартных цвета входят в цену. Другие цвета – доплата в процентах.',
      frame: 'Рама и стойки', roof: 'Ламели', slideCol: 'Профили стекла и панелей', zipCol: 'Короб и направляющие ZIP', asFrame: 'как рама', moreColours: 'Другие цвета', groups: { fine: 'Мелкая структура', smooth: 'Гладкий мат', exclusive: 'Эксклюзив', wood: 'Под дерево' },
      fabricTone: 'Оттенок ткани', colourNote: 'Цвета на экране приблизительные. Перед заказом покажем оригинальные образцы.',
      s5: 'Ваша ориентировочная цена', s5l: 'По каталожным ценам ' + CATALOGUE + '. Без обязательств – окончательная цена после замера на месте.',
      grp: { pergola: 'Пергола', sides: 'Стороны', comfort: 'Комфорт', colours: 'Цвета и доплаты', extra: 'Монтаж и доп. позиции' },
      split: { title: 'Деление на модули', alongW: 'Ширина', alongD: 'Глубина', left: 'Стык влево', right: 'Стык вправо', even: 'Поровну', auto: '↺ Автоматически', note: (a, b) => `Стрелки двигают стык · модуль от ${a} до ${b}` }, jointT: (a, b) => `Между модулями ${a} и ${b}`, montT: 'Монтаж', delivery: 'Доставка', extraT: 'Доп. позиция', qExclM: 'Не входит: доставка, фундамент, подключение электричества, разрешения.',
      notIncl: 'Не входит в цену', notInclList: ['Доставка и монтаж', 'Фундамент и подключение электричества', 'Разрешения, если нужны'],
      incomplete: 'Некоторые позиции в таком размере не производятся и не вошли в цену.',
      print: 'Распечатать или сохранить PDF', printS: 'Сохранить предложение в PDF', request: 'Отправить запрос без обязательств', requestS: 'Мы свяжемся с вами лично', share: 'Копировать ссылку', shareS: 'чтобы поделиться или продолжить позже', copied: 'Ссылка скопирована',
      saveFile: 'Сохранить в файл', openFile: 'Открыть файл',
      formT: 'Ваш запрос', name: 'Имя', email: 'E-mail', phone: 'Телефон (необязательно)', place: 'Индекс и город монтажа (необязательно)', when: 'Когда планируете?',
      whens: ['Как можно скорее', 'Через 1–3 месяца', 'Позже в этом году', 'Пока просто смотрю'],
      wantMount: 'Нужен монтаж', wantVisit: 'Нужен выезд и замер', msg: 'Сообщение (необязательно)',
      required: 'Заполните, пожалуйста', badEmail: 'Введите правильный e-mail',
      privacy: 'Ваши данные используются только для этого запроса. Письмо отправляется из вашей почтовой программы – на сайте ничего не сохраняется.',
      sendBtn: 'Открыть письмо с запросом', sentT: 'Почти готово', reopen: 'Открыть письмо ещё раз', sent: 'Открылась ваша почтовая программа с готовым письмом. Отправьте его, пожалуйста.', noMail: 'Нет почтовой программы? Скопировать текст', textCopied: 'Текст скопирован',
      faqT: 'Частые вопросы',
      faq: [
        ['Цена окончательная?', 'Нет. Это ориентировочная цена по каталогу ' + CATALOGUE + '. Окончательную цену вы получите после замера на месте.'],
        ['Нужно ли разрешение на строительство?', 'Зависит от земли и общины. Уточните в строительном ведомстве до заказа – размеры и вид из этого предложения помогут.'],
        ['Что не входит в цену?', 'Доставка, монтаж, фундамент, подключение электричества и разрешения.'],
        ['Что будет после запроса?', 'Мы обсудим с вами детали и при необходимости договоримся о замере. После этого вы получите окончательное предложение.'],
      ],
      hint: 'Тяните, чтобы вращать. Нажмите на сторону, чтобы закрыть её.',
      tb: { ang: 'Ламели', drop: 'Скрины', gopen: 'Остекление', evening: 'Вечер', front: 'Спереди', top: 'Сверху', closed: 'закрыто', open: 'открыто', louv: 'Повернуть ламели', view: 'Вид', louvCap: 'Ламели', move: 'Движение', night: 'Ночь', nightT: 'День / ночь – включить свет', moveT: 'Повернуть ламели, открыть стекло и скрины' },
      qClient: 'Клиент', qTitle: 'Предварительное предложение', qNo: '№', qDate: 'Дата', qConfig: 'Ваша конфигурация', qPrice: 'Цена', qItem: 'Позиция', qNet: 'Итого без НДС', qVat: 'НДС 20 %', qGross: 'Итого с НДС',
      qFacts: { size: 'Размер', mount: 'Установка', model: 'Модель', height: 'Высота стоек', sides: 'Стороны', colours: 'Цвета', comfort: 'Комфорт' },
      qNotes: ['Ориентировочная цена по каталогу ' + CATALOGUE + ', без обязательств.', 'Не входит: доставка, монтаж, фундамент, подключение электричества, разрешения.', 'Окончательная цена – после замера на месте.', 'Цвета на экране приблизительные.'],
      qLink: 'Открыть конфигурацию онлайн', none: 'нет', open: 'открыто',
      fam: { S400: 'S400', S500: 'S500', S500_DOUBLE: 'S500 двойная' }, pergola: 'Пергола с ламелями', panelsW: 'полотен', profilesW: 'профилей', slatsFixed: 'неподвижные ламели', slatsRot: 'поворотные ламели',
      opt: { OPT_POST_HEIGHT: 'Стойки выше стандарта', OPT_LED_LOUVRES: 'LED-лента в ламелях', OPT_LED_GUTTER: 'LED-подсветка в желобе', OPT_THERMAL: 'Термовставка в ламелях', OPT_SENSOR: 'Датчики погоды', OPT_SMART: 'Управление со смартфона', OPT_HEATERS: 'Обогреватели', OPT_HEATER_PREP: 'Подготовка под обогреватели', OPT_INTERNAL_BOX: 'Внутренний короб', OPT_AUDIO: 'Аудиосистема', OPT_SOCKET: 'Розетки в стойке', OPT_SPOTS: 'LED-споты в ламелях', OPT_LAMPS: 'LED-лампы в ламелях', OPT_CROWN_SPOTS: 'LED-споты в раме', OPT_VERTICAL_LAMPS: 'Светильники на стойках', OPT_INTERMEDIATE_POST: 'Дополнительные стойки' },
      ctl: { CONTROL_PERGOLA_UNIT: 'Блок управления скринами', CONTROL_REMOTE: 'Пульт для скринов', CONTROL_SMART: 'Блок умного дома', CONTROL_WIND_SENSOR: 'Датчик ветра для скринов', CONTROL_SWITCH: 'Настенный выключатель', CONTROL_PERGOLA_REMOTE_EXTRA: 'Дополнительный пульт', CONTROL_CUSTOM: 'Управление' },
      parT: 'Парапет', parD: 'Стойки рядом с парапетом, стекло / ZIP стоят на нём', parNone: 'Нет', parH: 'Высота парапета',
      vertoT: 'Decor – ламели на перголе', vertoD: 'Неподвижные алюминиевые профили от взглядов и солнца, можно вместе с ZIP и стеклом', vNone: 'Без',
      vTypes: { 1: 'На каждом углу', 2: 'Спереди и сзади', 3: 'Один пакет спереди', 4: 'По обеим сторонам', 5: 'Обе стороны целиком', 6: 'По центру спереди' }, vTypesWall: { 2: 'Спереди и сбоку', 6: 'По центру спереди и сбоку' },
      vTypesT: 'Готовые типы', vSideT: 'Сторона', vMountT: 'Монтаж профилей', vMounts: { A: 'Выше крыши', B: 'До верха рамы', C: 'В проёме', D: 'С угловым соединением' },
      vMountsD: { A: 'Профили заканчиваются над ламелями', B: 'Снаружи на раме, вровень сверху', C: 'Под коробом между стойками, вровень снаружи – ZIP или стекло остаются возможны', D: 'Пакеты огибают угол, +53 € за угол' },
      vEdit: 'Нажмите на сторону в 3D, чтобы изменить пакеты.', vSide: 'Decor на этой стороне', vPos: { none: 'Без', L: 'Слева', center: 'По центру', R: 'Справа', full: 'Вся сторона' },
      vProf: 'профилей', vPack: 'пакет', vClosed: 'В проёме невозможно – сторона уже закрыта. Выберите монтаж на раме.', vHigh: 'Профили длиннее, чем в прайсе', vMountW: 'монтаж',
      coat: 'Доплата за цвет', coatMin: 'Минимальная партия покраски', fabricS: 'Доплата за ткань', corner: 'Угловое соединение ламельной стены', tbdPanels: 'Доплата за цвет панелей', onRequest: 'по запросу', extra: 'доплата',
      sysName: { S400: 'перголы', S500: 'перголы', GLASS: 'стекла', SCREEN_ZIP: 'ZIP-скринов', VERTO: 'ламельной стены' },
      mailSubj: (s, p) => `Запрос: пергола ${s} – ориентировочно ${p}`, mailHi: 'Здравствуйте!\n\nМеня интересует такая конфигурация:', mailBye: 'С уважением',
      mm: 'мм',
    },
  };

  // Sliding roof (Slide) and the roof-type choice: texts added to every language
  const EXTRA = {
    de: {
      roofT: 'Dach', roofRot: 'Drehbare Lamellen', roofSlide: 'Schiebedach',
      roofRotD: 'Die Lamellen drehen sich (bis ca. 135°) – Licht und Luft nach Wunsch, das Dach bleibt über Ihnen.',
      roofSlideD: 'Die Lamellen kippen und falten sich zur Seite zusammen – der Himmel wird frei.',
      slideStack: (st, rest, side) => `Ganz geöffnet liegen die Lamellen gefaltet ${side}: ca. ${st} m, ${rest} m sind offen.`, sideWall: 'an der Hauswand', sideEdge: 'an einer Seite',
      reqPosts: 'Zusätzliche Stützen (Tiefe über 6 m)', pergolaSlide: 'Lamellen-Schiebedach', part: 'Teil',
      lightG: { louvre: 'In den Lamellen', gutter: 'In der Rinne, rundum', crown: 'Spots im Rahmen', posts: 'An den Stützen', zipled: 'In den ZIP-Führungen' }, lightI: { none: 'Ohne', white: 'LED-Band warmweiß', rgb: 'LED-Band RGB', rgbw: 'LED-Band RGBW', spots: 'LED-Spots, 3 pro Lamelle', lamps: 'LED-Lampen, 2 pro Lamelle', bwhite: 'warmweiß', brgb: 'RGB', brgbw: 'RGBW', cwhitergb: 'weiß + RGB', crown8: '8 LED-Spots', postsAll: 'Leuchte an jeder Stütze', zipLedOn: 'LED-Licht in den Führungen' }, zipLedT: 'LED-Licht in den ZIP-Führungen', zipLedD: 'Führungsschienen mit LED-Band, Netzteil und Schalter', crownNote: 'Nur an Seiten ohne Glas oder ZIP-Screen', perLouvre: 'pro Lamelle', lightsSlide: { none: 'Kein Licht', bwhite: 'LED in der Rinne, warmweiß', brgb: 'LED in der Rinne, RGB', brgbw: 'LED in der Rinne, RGBW', cwhitergb: 'LED in der Rinne, weiß + RGB' },
      heatsSlide: { 's5.single': '1 Strahler 1,5 kW (~10 m²)', 's5.double': 'Doppelstrahler 4 kW (~25 m²)' },
      windSun: 'Wind + Sonne', stackLbl: (v) => `gefaltet ${v} mm`, tbRoof: 'Dach', roofClosed: 'zu', roofOpen: 'offen',
      reqPostH: 'Höhere Zusatzstützen',
      glTypT: 'Öffnung', glTyp: { ltr: 'nach rechts', rtl: 'nach links', center: 'aus der Mitte' }, glOpen: 'offen', ctaS: 'Tippen Sie auf ＋, um eine Seite zu schließen', tones: ['Anthrazit', 'Graphit', 'Grau', 'Hellgrau', 'Weiß', 'Beige', 'Taupe', 'Schwarz'], tbColor: 'Farbe', tbColorT: 'Glas- und Rahmenfarbe', noGlass: 'Erscheint, sobald eine Seite Glas hat', tbLight: 'Licht', tbUnder: 'Von unten', ctlNa: 'nicht in dieser Größe', ctlS: { pergola: 'Fernbedienung', switch: 'Wandtaster', smart: 'Smartphone', solar: 'Solar' },
      ctlH: { pergola: 'ohne zweiten Sender – Empfangsmodul in der Stütze', remote: 'kleiner zusätzlicher Handsender nur für die Screens', smart: 'per App am Smartphone, auch unterwegs', switch: 'fester Taster an der Wand, nur mit YOODA- oder Somfy-Motoren', solar: 'Motor mit Solarpanel, kein Stromkabel, eigener Handsender' },
      photo: 'Foto', photoT: 'Pergola auf dem Foto Ihrer Terrasse ansehen', photoHelp: 'Ziehen Sie die 4 Punkte dorthin, wo die Stützen stehen sollen: 1 und 2 an der Hauswand (links, rechts), 3 und 4 vorne. Die Pergola stellt sich in die Perspektive des Fotos. Das Foto bleibt in Ihrem Browser.', photoBad: 'Punkte vertauscht: 1 und 2 an der Wand links und rechts, 3 und 4 vorne rechts und links.', photoPts: 'Punkte', photoHelpS: '4 Punkte auf die Ecken der Pergola ziehen', photoShot: 'Bild speichern', photoNew: 'Anderes Foto', photoOff: 'Foto entfernen', photoTip: 'Wie sieht es bei Ihnen aus? Laden Sie ein Foto Ihrer Terrasse hoch – die Pergola erscheint darauf, auch im Angebot.', photoBtn: '📷 Foto hochladen',
    },
    en: {
      roofT: 'Roof', roofRot: 'Rotating louvres', roofSlide: 'Sliding roof',
      roofRotD: 'The louvres rotate (up to about 135°) – light and air as you like, the roof stays above you.',
      roofSlideD: 'The louvres tilt and fold together to one side – the sky opens up.',
      slideStack: (st, rest, side) => `Fully open, the folded louvres sit ${side}: about ${st} m, ${rest} m are open.`, sideWall: 'at the house wall', sideEdge: 'on one side',
      reqPosts: 'Additional posts (depth over 6 m)', pergolaSlide: 'Sliding louvre roof', part: 'part',
      lightG: { louvre: 'In the louvres', gutter: 'In the gutter, all round', crown: 'Spots in the frame', posts: 'On the posts', zipled: 'In the ZIP guide rails' }, lightI: { none: 'None', white: 'LED strip, warm white', rgb: 'LED strip, RGB', rgbw: 'LED strip, RGBW', spots: 'LED spots, 3 per louvre', lamps: 'LED lamps, 2 per louvre', bwhite: 'warm white', brgb: 'RGB', brgbw: 'RGBW', cwhitergb: 'white + RGB', crown8: '8 LED spots', postsAll: 'a light on every post', zipLedOn: 'LED light in the rails' }, zipLedT: 'LED light in the ZIP guide rails', zipLedD: 'guide rails with LED strip, power supply and switch', crownNote: 'Only on sides without glass or a ZIP screen', perLouvre: 'per louvre', lightsSlide: { none: 'No light', bwhite: 'LED in the gutter, warm white', brgb: 'LED in the gutter, RGB', brgbw: 'LED in the gutter, RGBW', cwhitergb: 'LED in the gutter, white + RGB' },
      heatsSlide: { 's5.single': '1 heater 1.5 kW (~10 m²)', 's5.double': 'Double heater 4 kW (~25 m²)' },
      windSun: 'Wind + sun', stackLbl: (v) => `folded ${v} mm`, tbRoof: 'Roof', roofClosed: 'closed', roofOpen: 'open',
      reqPostH: 'Taller additional posts',
      glTypT: 'Opening', glTyp: { ltr: 'to the right', rtl: 'to the left', center: 'from the centre' }, glOpen: 'open', ctaS: 'Tap ＋ to close a side', tones: ['anthracite', 'graphite', 'grey', 'light grey', 'white', 'beige', 'taupe', 'black'], tbColor: 'Colour', tbColorT: 'Glass and frame colour', noGlass: 'Appears once a side has glass', tbLight: 'Light', tbUnder: 'From below', ctlNa: 'not for this size', ctlS: { pergola: 'Remote', switch: 'Wall button', smart: 'Smartphone', solar: 'Solar' },
      ctlH: { pergola: 'no second remote – receiver module in the post', remote: 'small extra remote just for the screens', smart: 'with the smartphone app, also when away', switch: 'fixed push button on the wall, only with YOODA or Somfy motors', solar: 'motor with solar panel, no power cable, own remote' },
      photo: 'Photo', photoT: 'See the pergola on a photo of your terrace', photoHelp: 'Drag the 4 points to where the posts will stand: 1 and 2 at the house wall (left, right), 3 and 4 at the front. The pergola takes the perspective of the photo. The photo stays in your browser.', photoBad: 'Points mixed up: 1 and 2 at the wall left and right, 3 and 4 at the front right and left.', photoPts: 'Points', photoHelpS: 'Drag the 4 points to the pergola corners', photoShot: 'Save picture', photoNew: 'Other photo', photoOff: 'Remove photo', photoTip: 'How will it look at your place? Upload a photo of your terrace – the pergola appears on it, also in the quote.', photoBtn: '📷 Upload a photo',
    },
    ru: {
      roofT: 'Крыша', roofRot: 'Поворотные ламели', roofSlide: 'Раздвижная крыша',
      roofRotD: 'Ламели поворачиваются (примерно до 135°) – свет и воздух по желанию, крыша остаётся над вами.',
      roofSlideD: 'Ламели наклоняются и складываются к одной стороне – открывается небо.',
      slideStack: (st, rest, side) => `Полностью открытые ламели лежат пакетом ${side}: около ${st} м, открыто ${rest} м.`, sideWall: 'у стены дома', sideEdge: 'с одной стороны',
      reqPosts: 'Дополнительные стойки (глубина больше 6 м)', pergolaSlide: 'Пергола с раздвижной крышей', part: 'часть',
      lightG: { louvre: 'В ламелях', gutter: 'В желобе по периметру', crown: 'Споты в раме', posts: 'На стойках', zipled: 'В направляющих ZIP' }, lightI: { none: 'Нет', white: 'LED-лента, тёплый белый', rgb: 'LED-лента RGB', rgbw: 'LED-лента RGBW', spots: 'LED-споты, 3 в ламели', lamps: 'LED-лампы, 2 в ламели', bwhite: 'тёплый белый', brgb: 'RGB', brgbw: 'RGBW', cwhitergb: 'белый + RGB', crown8: '8 LED-спотов', postsAll: 'светильник на каждой стойке', zipLedOn: 'LED в направляющих' }, zipLedT: 'LED в направляющих ZIP', zipLedD: 'направляющие с LED-лентой, блок питания и выключатель', crownNote: 'Только на сторонах без стекла и ZIP-скрина', perLouvre: 'в ламели', lightsSlide: { none: 'Без света', bwhite: 'LED в желобе, тёплый белый', brgb: 'LED в желобе, RGB', brgbw: 'LED в желобе, RGBW', cwhitergb: 'LED в желобе, белый + RGB' },
      heatsSlide: { 's5.single': '1 обогреватель 1,5 кВт (~10 м²)', 's5.double': 'Двойной обогреватель 4 кВт (~25 м²)' },
      windSun: 'Ветер + солнце', stackLbl: (v) => `сложены ${v} мм`, tbRoof: 'Крыша', roofClosed: 'закрыта', roofOpen: 'открыта',
      reqPostH: 'Доп. стойки выше стандарта',
      glTypT: 'Открывание', glTyp: { ltr: 'слева направо', rtl: 'справа налево', center: 'из центра' }, glOpen: 'открыто', ctaS: 'Нажмите ＋, чтобы закрыть сторону', tones: ['антрацит', 'графит', 'серый', 'светло-серый', 'белый', 'бежевый', 'тауп', 'чёрный'], tbColor: 'Цвет', tbColorT: 'Цвет стекла и рамы', noGlass: 'Появится, когда закроете сторону стеклом', tbLight: 'Свет', tbUnder: 'Снизу', ctlNa: 'не для этого размера', ctlS: { pergola: 'Пульт', switch: 'Кнопка', smart: 'Смартфон', solar: 'Солнечная батарея' },
      ctlH: { pergola: 'без второго пульта – приёмный блок в стойке', remote: 'небольшой отдельный пульт только для скринов', smart: 'через приложение в смартфоне, и вне дома', switch: 'кнопка на стене, только с моторами YOODA или Somfy', solar: 'мотор с солнечной панелью, без кабеля, свой пульт' },
      photo: 'Фото', photoT: 'Посмотреть перголу на фото своей террасы', photoHelp: 'Перетащите 4 точки туда, где будут стоять стойки: 1 и 2 – у стены дома (слева и справа), 3 и 4 – впереди. Пергола сама встанет в перспективу фото. Фото остаётся в вашем браузере.', photoBad: 'Точки перепутаны: 1 и 2 – у стены слева и справа, 3 и 4 – впереди справа и слева.', photoPts: 'Точки', photoHelpS: 'Перетащите 4 точки на углы перголы', photoShot: 'Сохранить снимок', photoNew: 'Другое фото', photoOff: 'Убрать фото', photoTip: 'Как это будет выглядеть у вас? Загрузите фото своей террасы – пергола появится на нём, и в КП тоже.', photoBtn: '📷 Загрузить фото',
    },
  };
  for (const [l, x] of Object.entries(EXTRA)) {
    Object.assign(T[l], x);
    T[l].fam.SLIDE = 'Slide';
    T[l].sysName.SLIDE = T[l].sysName.S500;
    T[l].weathers.windSun = x.windSun;
    Object.assign(T[l].heats, x.heatsSlide);
    T[l].opt.OPT_REQUIRED_POST_HEIGHT = x.reqPostH;
    Object.assign(T[l].tb, { color: x.tbColor, colorT: x.tbColorT, light: x.tbLight, under: x.tbUnder, sopen: x.tbRoof, roofClosed: x.roofClosed, roofOpen: x.roofOpen, photo: x.photo, photoT: x.photoT, photoHelp: x.photoHelp, photoHelpS: x.photoHelpS, photoBad: x.photoBad, photoPts: x.photoPts, photoShot: x.photoShot, photoNew: x.photoNew, photoOff: x.photoOff });
  }

  /* ---------- small helpers ---------- */
  const Store = { // storage adapter: browser storage for now (a persistent store is decided later)
    get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: ignore */ } },
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const metres = (mmv) => (mmv / 1000).toLocaleString(lang === 'en' ? 'en-GB' : 'de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const gross = (n) => n * (1 + VAT);
  const fe = (n) => eur(Math.round(n));
  const plusE = (n) => n > 0.5 ? '+' + fe(n) : L().incl;
  const L = () => T[lang];
  const pickLang = () => {
    const q = new URLSearchParams(location.search).get('lang');
    if (q && T[q]) return q;
    const s = Store.get('db.lang'); if (s && T[s]) return s;
    const n = (navigator.language || 'de').slice(0, 2).toLowerCase();
    return n === 'ru' || n === 'uk' ? 'ru' : n === 'en' ? 'en' : 'de';
  };
  let lang = pickLang();
  let step = 0, focusId = null, scrollFocus = false, resumeOffer = null, form = { name: '', email: '', phone: '', place: '', when: 0, mount: true, visit: true, msg: '' }, formErr = {}, sentOk = false;
  const isCust = () => document.body.classList.contains('cust');
  const curOpt = () => state.options[state.optIndex];
  const sysOf = (o) => famKey(o);
  const opsOf = (o) => (o ? openings(o, SPEC[sysOf(o)]) : []);
  const toast = (msg) => { const d = document.createElement('div'); d.className = 'f-toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); };

  /* ---------- configuration <-> link / storage ---------- */
  const KEYS = ['mount', 'width', 'depth', 'louvres', 'roof', 'optIndex', 'fills', 'glass', 'glassOf', 'glassCfg', 'zipFab', 'zipCtl', 'po', 'colors', 'brand', 'panelOpt', 'wind', 'remote', 'verto', 'parapet', 'extra', 'split'];
  const prune = (v) => { // drop empty values so the link stays short
    if (Array.isArray(v)) return v.map(prune);
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { const p = prune(x); if (p === null || p === undefined || p === '' || (typeof p === 'object' && !Array.isArray(p) && !Object.keys(p).length)) continue; o[k] = p; } return o; }
    return v;
  };
  const snapshot = () => { const o = { v: 1 }; for (const k of KEYS) o[k] = state[k]; return prune(JSON.parse(JSON.stringify(o))); };
  const enc = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
  const shareUrl = () => location.origin + location.pathname + '?lang=' + lang + '#c=' + enc(snapshot());
  const DEFAULT_PO = JSON.parse(JSON.stringify(state.po));
  function restore(s) {
    for (const k of KEYS) if (s[k] !== undefined) state[k] = JSON.parse(JSON.stringify(s[k]));
    state.po = { ...JSON.parse(JSON.stringify(DEFAULT_PO)), ...(s.po || {}) };
    state.po.sockets = { power: 0, usb: 0, ...((s.po && s.po.sockets) || {}) };
    for (const k of ['fills', 'glassOf', 'glassCfg', 'zipFab', 'zipCtl', 'panelOpt']) if (!s[k]) state[k] = {};
    if (!s.verto) state.verto = { mount: 'B', packs: {}, preset: null };
    if (!s.parapet) state.parapet = { sides: [], h: 900 };
    if (!s.split) state.split = null;
    state.extra = { mont: 0, items: [], ...(s.extra || {}) }; state.extra.items = (state.extra.items || []).map((x) => ({ t: x.t || '', a: Number(x.a) || 0 }));
    state.colors = { construction: '04', roof: null, slide: null, zip: null, verto: null, fabric: 'soltis-7635', tone: '#3a3d40', ...(s.colors || {}) };
    if (!cat.fabrics.collections.some((f) => f.id === state.colors.fabric)) state.colors.fabric = 'soltis-7635';
    $('w').value = state.width; $('d').value = state.depth;
    $('mt-wall').setAttribute('aria-pressed', state.mount === 'wall'); $('mt-free').setAttribute('aria-pressed', state.mount === 'free');
    $('louv-dir').setAttribute('aria-pressed', state.louvres === 'perpendicular');
    if (state.roof !== 'sliding') state.roof = 'rotating';
    syncRoofButtons();
    const idx = s.optIndex || 0;
    recompute(false);
    if (idx && idx < state.options.length) choose(idx);
    applyColors(); renderColors(); syncGlassControls(); applyAnim();
  }
  function choose(i) {
    state.optIndex = i;
    document.querySelectorAll('.opt').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.i) === i)));
    build(); refit(); renderEstimate(); renderColors(); renderPergolaOptions();
  }
  let saveT = 0, dirty = false; // customers: nothing is saved until they change something (keeps the last saved project)
  function persist() {
    if (isCust() && !dirty) return;
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const s = snapshot(); Store.set('db.cfg', s);
      try { history.replaceState(null, '', location.pathname + location.search + '#c=' + enc(s)); } catch (e) { /* file:// or sandbox */ }
    }, 300);
  }

  /* ---------- price helpers ---------- */
  const q = () => state.q || { lines: [], total: 0, incomplete: 0 };
  /** why a side is not priced, in plain words (ZIP: fabric or size limit from the price table) */
  function badText(id) {
    const t = L(), l = q().lines.find((x) => x.k === 'unbuilt' && x.id === id);
    if (!l) return t.notMade;
    if (l.fill === 'zip' && l.why === 'fabric') return t.zipFabricOnly(l.ok.map((fid) => { const f = cat.fabrics.collections.find((c) => c.id === fid); return `${f.name} (${f.openness} %)`; }).join(', '));
    if (l.fill === 'zip' && l.why === 'size' && l.max) return t.zipMax(metres(l.max), l.axis);
    return t.notMade;
  }
  const sideAmount = (id) => q().lines.filter((l) => l.id === id && l.a && l.k !== 'vpack').reduce((s, l) => s + l.a, 0);
  const vertoAmount = (id) => q().lines.filter((l) => l.id === id && l.k === 'vpack').reduce((s, l) => s + l.a, 0);
  /** a package position in the customer's words: left / centre / right as seen from outside, or the whole side */
  function vPosName(id, pos, t) { if (pos === 'full' || pos === 'center') return t.vPos[pos]; return t.vPos[pos === window.outRight(window.faceOf(id)) ? 'R' : 'L']; }
  function sideLabel(id, o) {
    if (window.isJoint(id)) { // between two modules: "Zwischen Modul 1 und 2"
      // modules numbered row by row from the terrace corner, as in the layout
      const [kind, rest] = id.split('-'), [k, r] = rest.replace(/-b$/, '').split('_').map(Number), c = (o && o.cols) || 1, a = r * c + k + 1;
      return L().jointT(a, kind === 'joint' ? a + 1 : a + c);
    }
    const [side, i] = id.split('-'), n = Number(i);
    let s = L().sides[side];
    if ((side === 'front' || side === 'back') && o && o.cols > 1) s += ' · ' + L().field + ' ' + (n + 1);
    if ((side === 'left' || side === 'right') && o && o.rows > 1) s += ' · ' + L().row + ' ' + (n + 1);
    // a Slide side with a required post in the middle is two openings
    const op = o && o.family === 'SLIDE' ? opsOf(o).find((x) => x.id === id) : null;
    if (op && op.part) s += ' · ' + L().part + ' ' + op.part;
    return s;
  }
  // German colour names: the catalogue has English and Russian names; wood décors keep their catalogue names
  const DE_COLOUR = [['Navy anthracite', 'Marine-Anthrazit'], ['Cream white', 'Cremeweiß'], ['Pearl white', 'Perlweiß'], ['Cool white', 'Kühlweiß'], ['Elegant grey', 'Elegantgrau'], ['Warm stone', 'Warmstein'], ['Brown mood', 'Braun Mood'], ['Classic silver', 'Klassiksilber'], ['Champagne gold', 'Champagnergold'], ['Gold olive', 'Goldoliv'], ['Copper bronze', 'Kupferbronze'], ['Dark bronze', 'Dunkelbronze'], ['Dark brown', 'Dunkelbraun'], ['Grey-brown', 'Graubraun'], ['Grey-beige', 'Graubeige'], ['Blue-grey', 'Blaugrau'], ['Light beige', 'Hellbeige'], ['Anthracite', 'Anthrazit'], ['White', 'Weiß'], ['Cream', 'Creme'], ['Brown', 'Braun'], ['Silver', 'Silber'], ['Black', 'Schwarz'], ['Olive', 'Oliv'], ['structured', 'strukturiert'], ['(exclusive)', '(exklusiv)']];
  const deColour = (s) => DE_COLOUR.reduce((a, [en, de]) => a.split(en).join(de), s);
  const cname = (id) => { const c = colorOf(id); if (c.custom) return c.nameRu; return c.id + ' ' + (lang === 'ru' ? c.nameRu : lang === 'de' && c.group !== 'wood' ? deColour(c.name) : c.name); };
  const heaterKey = (set) => (L().heats[set] ? set : 'other');

  /** Customer-language lines for the summary and the quote: [{g, t, d, a}] where a = null means "not priced". */
  function quoteLines() {
    const o = curOpt(), t = L(), out = [];
    if (!o) return out;
    const sz = (w, h) => `${metres(w)} × ${metres(h)} ${t.m}`;
    for (const l of q().lines) {
      if (l.k === 'module') out.push({ g: 'pergola', t: `${l.fam === 'SLIDE' ? t.pergolaSlide : t.pergola} ${t.fam[l.fam]}`, d: sz(l.w, l.d), a: l.a });
      else if (l.k === 'reqPosts') out.push({ g: 'pergola', t: t.reqPosts, d: '× ' + l.qty, a: l.a });
      else if (l.k === 'moduleExtra') out.push({ g: 'pergola', t: `${t.pergola} – ${t.extra}`, d: '', a: l.a });
      else if (l.k === 'opt') {
        let d = '';
        const p = l.p || {};
        if (l.code === 'OPT_POST_HEIGHT') d = `≤ ${metres(p.height)} ${t.m}`;
        if (l.code === 'OPT_HEATERS') d = (t.heats[p.set] || t.heats.other) + (p.qty > 1 ? ' × ' + p.qty : '');
        if (l.code === 'OPT_SENSOR') d = t.weathers[p.sensor] || '';
        if (l.code === 'OPT_SMART') d = t.apps[p.unit] || '';
        if (l.code === 'OPT_LED_LOUVRES') d = `${t.lightI[p.colour] || p.colour} · ${p.louvres} ${t.roof}`;
        if (l.code === 'OPT_SOCKET') d = (p.kind === 'usb' ? 'USB' : '230 V') + ' × ' + p.qty;
        if (l.code === 'OPT_INTERMEDIATE_POST') d = '× ' + p.qty;
        if (l.code === 'OPT_REQUIRED_POST_HEIGHT') d = `≤ ${metres(p.height)} ${t.m} · × ${p.posts}`;
        if (l.code === 'OPT_LED_GUTTER') d = t.lightI[p.type] || '';
        if (l.code === 'OPT_SPOTS' || l.code === 'OPT_LAMPS') d = `${p.louvres} ${t.roof} × ${p.perLouvre} ${t.perLouvre}`;
        if (l.code === 'OPT_CROWN_SPOTS' || l.code === 'OPT_VERTICAL_LAMPS') d = '× ' + p.points;
        const g = ['OPT_POST_HEIGHT', 'OPT_INTERMEDIATE_POST', 'OPT_REQUIRED_POST_HEIGHT'].includes(l.code) ? 'pergola' : 'comfort';
        out.push({ g, t: t.opt[l.code] || l.code, d, a: l.a });
      } else if (l.k === 'glass') out.push({ g: 'sides', t: `${t.fills.glass} – ${sideLabel(l.id, o)}`, d: `${sz(l.w, l.h)} · ${l.panels} ${t.panelsW} · ${t.tints[l.glazing]} ${l.thick} mm`, a: l.a });
      else if (l.k === 'zip') { const f = cat.fabrics.collections.find((x) => x.id === l.fabric), f0 = l.swapFrom && cat.fabrics.collections.find((x) => x.id === l.swapFrom); out.push({ g: 'sides', t: `${t.fills.zip} – ${sideLabel(l.id, o)}`, d: `${sz(l.w, l.h)} · ${f ? f.name + ' (OF ' + f.openness + ' %)' : ''}${f0 ? ' · ' + t.swapped(f.name, f0.name) : ''}`, a: l.a }); }
      else if (l.k === 'verto') out.push({ g: 'sides', t: `${t.fills.verto} – ${sideLabel(l.id, o)}`, d: `${sz(l.w, l.h)} · ${l.profiles} ${t.profilesW}`, a: l.a });
      else if (l.k === 'panels') out.push({ g: 'sides', t: `${t.fills.panels} – ${sideLabel(l.id, o)}`, d: `${sz(l.w, l.h)} · ${l.slats === 'fixed' ? t.slatsFixed : t.slatsRot}`, a: l.a });
      else if (l.k === 'unbuilt') out.push({ g: 'sides', t: `${t.fills[l.fill]} – ${sideLabel(l.id, o)}`, d: badText(l.id), a: null });
      else if (l.k === 'pending') out.push({ g: 'sides', t: `${t.fills[l.fill]} – ${sideLabel(l.id, o)}`, d: t.later, a: null });
      else if (l.k === 'corner') out.push({ g: 'sides', t: t.corner + (l.n > 1 ? ' × ' + l.n : ''), d: '', a: l.a });
      else if (l.k === 'zipled') out.push({ g: 'sides', t: `${t.zipLedT} – ${sideLabel(l.id, o)}`, d: t.zipLedD, a: l.a });
      else if (l.k === 'vpack') out.push({ g: 'sides', t: `Decor – ${sideLabel(l.id, o)}`, d: `${l.pos === 'full' ? t.vPos.full : t.vPack + ' ' + vPosName(l.id, l.pos, t).toLowerCase()} · ${l.n} ${t.vProf} · ${t.vMountW}: ${t.vMounts[l.mount]}`, a: l.a });
      else if (l.k === 'vbad') out.push({ g: 'sides', t: `Decor – ${sideLabel(l.id, o)}`, d: l.why === 'closed' ? t.vClosed : t.vHigh, a: null });
      else if (l.k === 'fabric') out.push({ g: 'sides', t: `${t.fabricS} ${l.name}`, d: `OF ${l.of} %`, a: l.a });
      else if (l.k === 'control') out.push({ g: 'sides', t: t.ctl[l.code] || l.name, d: l.qty > 1 ? '× ' + l.qty : '', a: l.a });
      else if (l.k === 'coat') out.push({ g: 'colours', t: `${t.coat} ${t.sysName[l.sys]} (${l.pct} %)`, d: '', a: l.a });
      else if (l.k === 'coatMin') out.push({ g: 'colours', t: t.coatMin, d: '', a: l.a });
      else if (l.k === 'mont') out.push({ g: 'extra', t: t.montT, d: '', a: l.a });
      else if (l.k === 'extra') out.push({ g: 'extra', t: l.t || t.extraT, d: '', a: l.a });
      else if (l.k === 'tbd') out.push({ g: 'colours', t: t.tbdPanels, d: t.onRequest, a: null });
    }
    return out;
  }
  const groupsOrder = ['pergola', 'sides', 'comfort', 'colours', 'extra'];

  /* ---------- rendering ---------- */
  const F = $('funnel');
  const ICON = {
    wall: '<svg class="ic" viewBox="0 0 34 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 2v20M3 5h26M8 5v16M24 5v16M29 5v16" stroke-linecap="round"/><path d="M3 2v20" stroke-width="4"/></svg>',
    free: '<svg class="ic" viewBox="0 0 34 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 5h28M5 5v16M29 5v16M12 8v13M22 8v13M3 5l4-3h20l4 3" stroke-linecap="round"/></svg>',
  };
  const GL = { none: '○', zip: '▤', glass: '◇', verto: '▥', panels: '▦' };

  function render() {
    if (!isCust()) return;
    const t = L(), o = curOpt();
    const head = `<div class="f-head">${OFFICE.name ? `<span class="f-brand">${esc(OFFICE.name)}</span>` : ''}<span class="sp"></span>
      <span class="f-lang" role="group" aria-label="Language">${Object.keys(T).map((k) => `<button type="button" data-lang="${k}" aria-pressed="${k === lang}">${k.toUpperCase()}</button>`).join('')}</span>
      <button type="button" class="f-pro" data-mode="pro" title="${esc(t.proTitle)}">${t.pro}</button></div>`;
    const steps = `<ol class="f-steps">${t.steps.map((s, i) => { const dn = i < 4 && stepDone(i); return `<li><button type="button" data-step="${i}" ${i === step ? 'aria-current="step"' : ''} data-done="${dn || i < step}" data-check="${dn}"><span class="n">${dn ? '✓' : i + 1}</span>${esc(s)}</button></li>`; }).join('')}</ol>`;
    const body = [stepSize, stepSides, stepComfort, stepColours, stepOffer][step](t, o);
    // keep the tapped control where the finger is: re-rendering the panel must not move the page
    const anchor = lastTap ? F.querySelector(lastTap) : null, y0 = anchor ? anchor.getBoundingClientRect().top : null;
    F.innerHTML = head + steps + `<div class="f-body">${body}</div>` + bar(t, o);
    if (step === 4 && o) { try { $('quote').innerHTML = buildQuote(); fitQuote(); } catch (e) { /* the picture may fail without WebGL */ } }
    if (anchor) { const a2 = F.querySelector(lastTap); if (a2) { const dy = a2.getBoundingClientRect().top - y0; if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: 'instant' }); } }
    // scroll to a side only once, right after it was picked in 3D — never on later re-renders (they would yank the page up)
    if (scrollFocus && focusId && step === 1) { const el = F.querySelector(`[data-side="${focusId}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    scrollFocus = false;
    renderHotspots();
    renderCard();
  }
  function bar(t, o) {
    const total = q().total, ok = !!o && total > 0;
    const price = ok ? `<b>${q().incomplete ? t.from + ' ' : ''}${fe(gross(total))}</b><span>${t.gross}<span class="nt"> · ${t.net} ${fe(total)}</span></span>` : `<b>—</b><span>${t.priceNa}</span>`;
    // on a narrow phone the step name after "Next" is dropped, so the price never gets cut
    const to = step < 4 ? nextStep() : 4;
    const nextLabel = step === 4 ? esc(t.send) : to === 4 ? esc(t.toOffer) : esc(t.next) + `<span class="nx">: ${esc(t.steps[to])}</span>`;
    return `<div class="f-bar"><div class="p" id="f-price">${price}</div>${step > 0 ? `<button type="button" class="back" data-go="-1" aria-label="${esc(t.back)}"><span class="bk">${t.back}</span><span class="ar">←</span></button>` : '<span></span>'}<button type="button" class="next" data-go="${step === 4 ? 'form' : '1'}" ${ok ? '' : 'disabled'}>${nextLabel}${step < 4 ? ' →' : ''}</button></div>`;
  }

  /** motors + control devices of all ZIP screens if each screen used modeFor(id) with the given motor brand — the same rules as the estimate */
  function zipCtlCost(modeFor, brand = state.brand) {
    const o = curOpt(); if (!o) return null;
    const zips = opsOf(o).filter((x) => state.fills[x.id] === 'zip'); if (!zips.length) return 0;
    const ok = modesOf(brand);
    let sum = 0; const modes = [], sys = new Set();
    for (const op of zips) {
      const mode = modeFor(op.id); if (!ok.includes(mode)) return null;
      const r = DBCore.selectScreen({ width: Math.round(op.len * 1000), height: Math.round(op.h * 1000), fabric: zipFabId(op), fabricFallback: 'sameOpenness', control: DBCore.MOTOR_FOR_MODE[mode], brand, customMotor: { name: state.custom.name, price: state.custom.motor } }, cat);
      if (!r.best) return null;
      sum += r.best.motor.price; modes.push(mode); sys.add(o.family === 'S400' ? 'p' + o.modules.indexOf(op.mod) : 'all');
    }
    const opt = DBCore.priceOptions(o, poFor(o), cat);
    return sum + DBCore.screenControlLines(modes, { brand, remote: brand === state.brand ? state.remote || undefined : undefined, wind: state.wind, windSensors: sys.size, customControls: state.custom.controls, pergolaChannels: o.family === 'SLIDE' ? undefined : o.modules.length + opt.channels }, cat).total;
  }
  /** keep the current motor brand if it can do these controls, else the cheapest brand that can (e.g. a wall button needs YOODA or Somfy) */
  function brandFor(modeFor) {
    // customers: always back to the standard motors (WIN CONTROL) when they can do it — a wall switch must not leave
    // the cheaper YOODA motors behind after the customer returns to the pergola remote
    const pref = isCust() ? 'wincontrol' : state.brand;
    if (pref !== 'custom' && zipCtlCost(modeFor, pref) != null) return { brand: pref, cost: zipCtlCost(modeFor, pref) };
    let best = null;
    for (const br of DBCore.MOTOR_BRANDS.filter((x) => x !== 'custom')) { const c = zipCtlCost(modeFor, br); if (c != null && (!best || c < best.cost)) best = { brand: br, cost: c }; }
    return best;
  }
  /** Customer view, kept simple: the screens run from the pergola remote as standard (the receiver unit comes with it);
   *  the only alternatives are a wall switch or a separate remote. No motors, brands or price differences here —
   *  the total at the bottom shows the price. App and solar control stay available in the Pro view. */
  const CTL_MODES = ['pergola', 'switch', 'smart', 'solar'];
  const CTL_ICON = {
    pergola: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="2.5" width="9" height="19" rx="2.5"/><circle cx="12" cy="7.5" r="1.6"/><path d="M10 12h4M10 15h4M10 18h4"/></svg>',
    switch: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="2"/><rect x="9" y="7.5" width="6" height="9" rx="1"/><path d="M12 9.5v2"/></svg>',
    smart: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><path d="M10.5 18.5h3"/><path d="M9.5 9.5a3.5 3.5 0 0 1 5 0M10.8 11.4a1.7 1.7 0 0 1 2.4 0"/></svg>',
    solar: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="17.5" cy="5.5" r="2.2"/><path d="M17.5 1.3v.9M21.7 5.5h-.9M20.5 2.5l-.6.6M14.5 2.5l.6.6"/><path d="M3 21l2.4-10h11.2L19 21z"/><path d="M4.2 16h13.6M8.5 11l-1 10M13.5 11l1 10"/></svg>',
  };
  /** three pictures: remote (standard), wall button, smartphone — nothing else to think about */
  function ctlRows(t, attr, isCur, modeForOf, extra = '') {
    // a way that is not possible for this screen (e.g. solar on a very wide one) stays visible but greyed out
    return `<div class="f-ctl">` + CTL_MODES.map((m) => {
      const ok = !!brandFor(modeForOf(m));
      if (!ok && m === 'pergola' && curOpt() && curOpt().family === 'SLIDE') return ''; // sliding roof: no pergola remote for screens
      return `<button type="button" ${attr}="${m}" ${extra} aria-pressed="${ok && isCur(m)}" ${ok ? '' : 'disabled'}>${CTL_ICON[m]}<b>${esc(t.ctlS[m])}</b><small${ok ? '' : ' class="na"'}>${!ok ? esc(t.ctlNa) : m === 'pergola' ? esc(t.ctlStd) : ''}</small></button>`;
    }).join('') + `</div>`;
  }
  const zipIds = () => opsOf(curOpt()).filter((x) => state.fills[x.id] === 'zip').map((x) => x.id);

  /** glass on one side: how it opens (left → right, right → left, from the centre) and closed / open.
   *  "From the centre" is a two-way Win Glass system (the panels part in the middle); the others park on one side.
   *  A way that this size is not made in is greyed out. */
  const GLASS_TYP_ICON = { ltr: '⇥', rtl: '⇤', center: '⇹' };
  function glassTyp(op) { const g = glassFor(op), cfg = glassCfg(op); return g.best && g.best.opening === 'double' ? 'center' : (cfg.side || state.glassSide) === 'left' ? 'rtl' : 'ltr'; }
  function glassPos(op, t) {
    const g = glassFor(op), cfg = glassCfg(op), typ = glassTyp(op);
    const has = (o) => g.options.some((x) => x.opening === o);
    const isOpen = (cfg.open ?? state.glassOpen) > 0;
    const tb = (v, cur, ok) => `<button type="button" class="f-chip" data-gtyp="${v}" data-id="${op.id}" aria-pressed="${cur}" ${ok ? '' : 'disabled'}>${GLASS_TYP_ICON[v]} ${esc(t.glTyp[v])}</button>`;
    const sb = (v, label, cur) => `<button type="button" class="f-chip" data-gpos="${v}" data-id="${op.id}" aria-pressed="${cur}">${label}</button>`;
    return `<div class="sub2">${t.glTypT}: ${tb('ltr', typ === 'ltr', has('single'))}${tb('rtl', typ === 'rtl', has('single'))}${tb('center', typ === 'center', has('double'))}</div>`
      + `<div class="sub2" style="margin-top:6px">${t.park}: ${sb('close', '○ ' + t.shut, !isOpen)}${sb('open', '◫ ' + t.glOpen, isOpen)}</div>`;
  }

  /** two choices side by side; a third and more go into a dropdown ("More …") next to them */
  function two(name, items, cur, t) {
    const btn = (it) => `<button type="button" class="f-seg" data-${name}="${it.v}" aria-pressed="${String(cur) === String(it.v)}" ${it.off ? 'disabled' : ''}><span>${esc(it.label)}</span>${it.pr ? `<span class="pr">${esc(it.pr)}</span>` : ''}</button>`;
    const rest = items.slice(2), inRest = rest.some((it) => String(it.v) === String(cur));
    const sel = rest.length ? `<select class="f-more-sel${inRest ? ' on' : ''}" data-sel="${name}" aria-label="${esc(t.moreOpt)}"><option value="">${esc(t.moreOpt)}</option>${rest.map((it) => `<option value="${it.v}" ${String(cur) === String(it.v) ? 'selected' : ''}>${esc(it.label)}${it.pr ? ' · ' + esc(it.pr) : ''}</option>`).join('')}</select>` : '';
    return `<div class="f-two${rest.length ? ' f-three' : ''}">${items.slice(0, 2).map(btn).join('')}${sel}</div>`;
  }
  const head = (title, desc) => `<div class="f-h3"><span>${title}</span><span style="text-transform:none;letter-spacing:0;font-weight:400">${desc}</span></div>`;

  /* step 1: size */
  function stepSize(t, o) {
    const wall = state.mount === 'wall';
    let h = resumeOffer ? `<div class="f-resume"><span>${t.resume}</span><span><button type="button" class="f-link" data-resume="yes">${t.resumeYes}</button> · <button type="button" class="f-link" data-resume="no">${t.resumeNo}</button></span></div>` : '';
    h += `<p class="f-lead" style="margin-top:0">${t.intro}</p><h2>${t.s1}</h2><p class="f-lead">${t.s1l}</p>`;
    h += `<div class="f-cards">
      <button type="button" class="f-card" data-mount="wall" aria-pressed="${wall}">${ICON.wall}<b>${t.wall}</b><span class="d">${t.wallD}</span></button>
      <button type="button" class="f-card" data-mount="free" aria-pressed="${!wall}">${ICON.free}<b>${t.free}</b><span class="d">${t.freeD}</span></button></div>`;
    // roof type: rotating louvres (S400 / S500) or the sliding roof (Slide), each with its lowest price for this size
    const firstOf = (r) => DBCore.compose({ mount: state.mount, width: state.width, depth: state.depth, louvres: state.louvres, families: FAMILIES[r] }, cat).options[0];
    h += head(t.roofT, '') + two('rooft', ['rotating', 'sliding'].map((r) => { const x = firstOf(r); return { v: r, label: r === 'rotating' ? t.roofRot : t.roofSlide, pr: x ? t.from + ' ' + fe(gross(x.total)) : t.louvNa, off: !x && state.roof !== r }; }), state.roof, t);
    h += `<p class="f-lead" style="font-size:12.5px;margin:6px 0 0">${state.roof === 'sliding' ? t.roofSlideD : t.roofRotD}</p>`;
    const dim = (k, label, v) => `<div class="f-dim"><label for="f-${k}">${label}, ${t.m}</label><div class="f-step"><button type="button" data-nudge="${k}" data-d="-100" aria-label="−">−</button><input id="f-${k}" type="number" inputmode="decimal" step="0.1" min="1" value="${(v / 1000).toFixed(2)}" data-dim="${k}"><button type="button" data-nudge="${k}" data-d="100" aria-label="+">+</button></div></div>`;
    h += `<div class="f-h3"><span>${t.width} × ${t.depth}</span></div><div class="f-dims">${dim('w', wall ? t.widthWall : t.width, state.width)}${dim('d', wall ? t.depthWall : t.depth, state.depth)}</div>`;
    const presets = [[3000, 3000], [4000, 3000], [5000, 3500], [6600, 3500], [8000, 4000]];
    h += `<div class="f-h3"><span>${t.presets}</span></div><div class="f-chips">${presets.map(([w, d]) => `<button type="button" class="f-chip" data-preset="${w}x${d}" aria-pressed="${state.width === w && state.depth === d}">${metres(w).replace(/,00|\.00/, '')} × ${metres(d).replace(/,00|\.00/, '')} ${t.m}</button>`).join('')}</div>`;
    // a parapet (low wall) on one or more sides: posts right inside it, glass / ZIP of that side stand on it
    {
      const pp = state.parapet, faces = wall ? ['front', 'left', 'right'] : ['front', 'left', 'right', 'back'];
      h += `<div class="f-h3"><span>${t.parT}</span><span style="text-transform:none;letter-spacing:0;font-weight:400">${t.parD}</span></div>`;
      h += `<div class="f-chips">${`<button type="button" class="f-chip" data-par="none" aria-pressed="${!pp.sides.length}">${t.parNone}</button>`}${faces.map((f) => `<button type="button" class="f-chip" data-par="${f}" aria-pressed="${pp.sides.includes(f)}">${t.sides[f]}</button>`).join('')}</div>`;
      if (pp.sides.length) h += `<div class="f-dims" style="margin-top:8px"><div class="f-dim"><label for="f-ph">${t.parH}, ${t.m}</label><div class="f-step"><button type="button" data-parh="-50" aria-label="−">−</button><input id="f-ph" type="number" inputmode="decimal" step="0.05" min="0.1" max="1.5" value="${(pp.h / 1000).toFixed(2)}" data-parin="1"><button type="button" data-parh="50" aria-label="+">+</button></div></div></div>`;
    }
    // size problems: plain-language fix buttons
    const r = DBCore.compose({ mount: state.mount, width: state.width, depth: state.depth, louvres: state.louvres, families: famFilter() }, cat);
    for (const s of r.suggestions) h += `<div class="f-note">${t.sugg[s.code] || s.code}${s.params && s.params.suggested ? ` <button type="button" class="f-link" data-fix="${s.code}" data-v="${s.params.suggested}">${t.suggFix(metres(s.params.suggested))}</button>` : ''}</div>`;
    if (!o) return h;
    // post height
    const hs = heightsOf(o);
    h += `<div class="f-h3"><span>${t.height}</span></div>` + two('h', hs.map((x, i) => ({ v: x, label: `≤ ${metres(x)} ${t.m}`, pr: i === 0 ? t.heightStd : plusE(optDelta({ postHeight: x })) })), state.po.postHeight, t);
    // layout: recommended first, alternatives folded away
    const opts = state.options, cheapest = opts[0].total;
    const lay = (x, i) => {
      const widths = x.modules.filter((m) => m.row === 0).map((m) => metres(m.width)).join(' + ') + (x.rows > 1 ? ' × ' + x.modules.filter((m) => m.col === 0).map((m) => metres(m.depth)).join(' + ') : '');
      return `<button type="button" data-opt="${i}" aria-pressed="${i === state.optIndex}"><span><b>${t.modules(x.modules.length)}</b>${i === 0 ? `<span class="f-badge">${t.cheapest}</span>` : ''}<span class="m">${widths} ${t.m} · ${t.fam[x.family]} · ${t.posts(x.posts)}</span></span><span class="pr">${i === 0 ? fe(gross(x.total)) : '+' + fe(gross(x.total - cheapest))}</span></button>`;
    };
    h += `<div class="f-h3"><span>${t.layout}</span></div><div class="f-lay">${lay(opts[0], 0)}${state.optIndex > 0 ? lay(opts[state.optIndex], state.optIndex) : ''}</div>`;
    const rest = opts.map((x, i) => [x, i]).filter(([, i]) => i !== 0 && i !== state.optIndex);
    if (rest.length) h += `<details class="f-more"><summary>${t.otherLayouts(rest.length)}</summary><div class="f-lay" style="margin-top:6px">${rest.map(([x, i]) => lay(x, i)).join('')}</div></details>`;
    // move the joint between modules (e.g. two equal halves) — only when the layout has more than one module
    const spl = window.splitHtml(o, t.split, (x) => metres(x) + ' ' + t.m);
    if (spl) h += `<div class="f-h3"><span>${t.split.title}</span></div>${spl}`;
    if (o.width !== state.width) h += `<div class="f-note">${t.snapped(metres(o.width), metres(state.width))}</div>`;
    if (o.depth !== state.depth) h += `<div class="f-note">${t.snapped(metres(o.depth), metres(state.depth))}</div>`;
    if (o.issues.some((i) => i.code === 'MULTI_ROW_ASSUMPTION')) h += `<div class="f-note">${t.multiRow}</div>`;
    if (o.family === 'SLIDE') { // how much room the folded louvres take: the customer sees what stays open
      const m = o.modules[0], st = slideStack(m), side = wall && m.louvreAxis === 'x' ? t.sideWall : t.sideEdge;
      h += `<div class="f-tip"><span>${t.slideStack(metres(st), metres(m.projection - st - 2 * SPEC.SLIDE.post * 1000), side)}</span></div>`;
    }
    if (!PHOTO.url) h += `<div class="f-tip"><span>${t.photoTip}</span><button type="button" class="f-chip" data-act="photo">${t.photoBtn}</button></div>`;
    // louvre direction: offer the cheaper one, explain the current one
    const other = state.louvres === 'parallel' ? 'perpendicular' : 'parallel';
    const alt = DBCore.compose({ mount: state.mount, width: state.width, depth: state.depth, louvres: other, families: famFilter() }, cat).options[0];
    const dirTxt = state.louvres === 'parallel' ? (wall ? t.louvPar : t.louvParF) : (wall ? t.louvPerp : t.louvPerpF);
    const dirName = (k) => { const s = k === 'parallel' ? (wall ? t.louvPar : t.louvParF) : (wall ? t.louvPerp : t.louvPerpF); return s.charAt(0).toUpperCase() + s.slice(1); };
    const dirPrice = (k) => (k === state.louvres ? cheapest : alt ? alt.total : null);
    h += `<div class="f-h3"><span>${t.louvDir}</span><span style="text-transform:none;letter-spacing:0;font-weight:400">${t.louvNow(dirTxt)}</span></div>` + two('louv', ['parallel', 'perpendicular'].map((k) => { const pr = dirPrice(k); return { v: k, label: `${k === 'parallel' ? '⇆' : '⇅'} ${dirName(k)}`, pr: pr == null ? t.louvNa : fe(gross(pr)), off: pr == null }; }), state.louvres, t);
    if (alt && alt.total < cheapest - 1) h += `<div class="f-tip"><span>${t.louvTip(fe(gross(cheapest - alt.total)))}</span><button type="button" class="f-chip" data-louv="${other}">${t.louvDo}</button></div>`;
    return h;
  }

  /* ---------- Win Verto: example configurations 1–6 (price list p.9–10) as small top views, mounting, per side in the card ---------- */
  /** top view: the pergola from above (front at the bottom), the wall as a thick line, the packages as bars outside the frame */
  function vertoThumb(o, ops, packs) {
    const W = o.width / 1000, D = o.depth / 1000, k = Math.min(52 / W, 28 / D), w = W * k, d = D * k, X0 = (64 - w) / 2, Y0 = (40 - d) / 2;
    let svg = `<svg viewBox="0 0 64 40" width="64" height="40" aria-hidden="true"><rect x="${X0}" y="${Y0}" width="${w}" height="${d}" fill="none" stroke="currentColor" stroke-opacity=".45" stroke-width="1"/>`;
    if (state.mount !== 'free') svg += `<line x1="${X0 - 3}" y1="${Y0 - 1.5}" x2="${X0 + w + 3}" y2="${Y0 - 1.5}" stroke="currentColor" stroke-opacity=".35" stroke-width="3"/>`;
    for (const { id, pk } of window.vertoList(packs)) {
      const op = ops.find((x) => x.id === id); if (!op) continue;
      const gm = window.vertoGeom(op, pk, o), a = gm.x0, b = gm.x0 + (gm.n - 1) * gm.pitch + 0.035, f = window.faceOf(id), off = 2.6;
      const P = (x) => (op.axis === 'x' ? [X0 + (op.cx + x) * k, f === 'front' ? Y0 + d + off : Y0 - off] : [f === 'left' ? X0 - off : X0 + w + off, Y0 + (op.cz - x) * k]);
      const [x1, y1] = P(a), [x2, y2] = P(b);
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--accent)" stroke-width="4" stroke-linecap="butt"/>`;
    }
    return svg + '</svg>';
  }
  window.vertoThumb = vertoThumb;
  function vertoSection(t, o, ops) {
    const v = state.verto, any = window.vertoList(v.packs).length > 0;
    const price = (packs) => window.vertoQuote(o, ops, packs).total;
    let h = `<div class="f-h3"><span>${t.vertoT}</span></div><p class="f-lead" style="margin:-4px 0 8px;font-size:12.5px">${t.vertoD}</p>`;
    const name = (k) => (state.mount !== 'free' && t.vTypesWall[k]) || t.vTypes[k];
    // as in the price list (p.9-10): mounting A-D, then the types → "B-1" … "D-6"; prices follow the mounting
    h += `<div class="f-h3"><span>${t.vMountT}</span><span style="text-transform:none;letter-spacing:0;font-weight:400">${t.vMountsD[v.mount]}</span></div>`;
    h += `<div class="f-chips" style="margin-bottom:8px">${['B', 'A', 'C', 'D'].map((m) => `<button type="button" class="f-chip" data-vmount="${m}" aria-pressed="${v.mount === m}">${m} · ${t.vMounts[m]}</button>`).join('')}</div>`;
    h += `<div class="f-vt">` + `<button type="button" data-vpreset="0" aria-pressed="${!any}"><span class="th">${vertoThumb(o, ops, {})}</span><b>${t.vNone}</b><span class="pr"></span></button>` +
      [1, 2, 3, 4, 5, 6].map((k) => { const packs = window.vertoPresetPacks(k, o, v.mount); return `<button type="button" data-vpreset="${k}" aria-pressed="${v.preset === k}"><span class="th">${vertoThumb(o, ops, packs)}</span><b>${v.mount}-${k} · ${esc(name(k))}</b><span class="pr">+${fe(gross(price(packs)))}</span></button>`; }).join('') + `</div>`;
    if (any) h += `<p class="f-lead" style="font-size:12px;margin:6px 0 0">${t.vEdit}</p>`;
    return h;
  }
  /** the Verto part of the side card: positions (left / centre / right can be combined, or the whole side) and the profile count */
  function vertoCard(t, o, op) {
    if (window.isJoint(op.id)) return ''; // Decor only on the outer sides
    const m = state.verto.packs[op.id] || {}, list = window.vertoList({ [op.id]: m }), R = window.outRight(window.faceOf(op.id)), Lp = R === 'b' ? 'a' : 'b';
    const amt = vertoAmount(op.id), bad = q().lines.find((l) => l.k === 'vbad' && l.id === op.id);
    let h = `<div class="fc-q">${t.vSide}${amt ? ` <span class="pr" style="float:right">+${fe(gross(amt))}</span>` : ''}</div><div class="f-chips">`;
    h += [['none', 'none'], [Lp, 'L'], ['center', 'center'], [R, 'R'], ['full', 'full']].map(([pos, lbl]) => `<button type="button" class="f-chip" data-vpos="${pos}" data-id="${op.id}" aria-pressed="${pos === 'none' ? !list.length : m[pos] !== undefined}">${t.vPos[lbl]}</button>`).join('') + `</div>`;
    if (list.length && m.full === undefined) {
      const gm = window.vertoGeom(op, list[0].pk, o);
      h += `<div class="f-vn"><button type="button" class="f-chip" data-vn="-1" data-id="${op.id}" ${gm.n <= 2 ? 'disabled' : ''} aria-label="−">−</button><span>${gm.n} ${t.vProf} · ${metres(DBCore.vertoPackageWidth(gm.n))} ${t.m}</span><button type="button" class="f-chip" data-vn="1" data-id="${op.id}" ${gm.n >= gm.maxN ? 'disabled' : ''} aria-label="+">+</button></div>`;
    }
    if (bad) h += `<div class="f-note">${bad.why === 'closed' ? t.vClosed : t.vHigh}</div>`;
    return h;
  }

  /* step 2: sides */
  function stepSides(t, o) {
    if (!o) return '';
    const ops = opsOf(o);
    let h = `<h2>${t.s2}</h2><p class="f-lead">${t.s2l}</p>`;
    h += `<div class="f-h3"><span>${t.allSides}</span></div><div class="f-chips" style="margin-bottom:12px">${['none', 'zip', 'glass'].map((f) => `<button type="button" class="f-chip" data-all="${f}" aria-pressed="${ops.filter((x) => !window.isJoint(x.id)).every((x) => (state.fills[x.id] || 'none') === f)}">${GL[f]} ${t.fills[f]}</button>`).join('')}</div>`;
    h += `<div class="f-sides">`;
    for (const op of ops) {
      const f = state.fills[op.id] || 'none', amt = sideAmount(op.id), bad = q().lines.some((l) => l.k === 'unbuilt' && l.id === op.id);
      h += `<div class="f-side${focusId === op.id ? ' hl' : ''}" data-side="${op.id}"><div class="top"><span class="nm">${sideLabel(op.id, o)}<small>${metres(Math.round(op.len * 1000))} ${t.m}</small></span><span class="pr">${f === 'none' ? '' : bad ? '—' : '+' + fe(gross(amt))}</span></div>
        <div class="f-fills" role="group">${['none', 'zip', 'glass', 'panels'].map((k) => `<button type="button" data-fill="${k}" data-id="${op.id}" aria-pressed="${f === k}"><span class="g">${GL[k]}</span>${t.fillsS[k]}</button>`).join('')}</div>`;
      if (f === 'glass' && !bad) h += glassPos(op, t);
      if (bad) h += `<div class="bad">${badText(op.id)}</div>`;
      h += `</div>`;
    }
    h += `</div>`;
    h += vertoSection(t, o, ops.filter((x) => !window.isJoint(x.id)));
    const used = new Set(ops.map((x) => state.fills[x.id]).filter(Boolean));
    if (used.has('zip')) {
      const curOf = fabricOf().openness;
      h += `<div class="f-h3"><span>${t.fabric}</span></div><div class="f-chips f-list">${opennessList().map((of) => {
        const cheapestF = cat.fabrics.collections.filter((f) => f.openness === of).sort((a, b) => a.eurPerM2 - b.eurPerM2)[0];
        return `<button type="button" class="f-chip" data-of="${of}" aria-pressed="${curOf === of}">${of} % · ${esc(t.ofName[of] || '')}<span class="pr">${cheapestF && cheapestF.eurPerM2 ? '+' + cheapestF.eurPerM2 + ' ' + t.perM2 : t.incl}</span></button>`;
      }).join('')}</div>`;
      h += head(t.ctlT, '') + `${ctlRows(t, 'data-zctlall', (m) => zipIds().every((id) => ctlOf(id) === m), (m) => () => m)}`;
    }
    if (used.has('glass')) {
      h += `<div class="f-h3"><span>${t.glassTint}</span></div><div class="f-sw">${Object.entries(GLAZING).map(([k, g]) => {
        const rate = cat.glazing.types.find((x) => x.id === k).surcharge[String(DBCore.thicknessFor(k, cat))];
        return `<button type="button" data-gl="${k}" aria-pressed="${state.glass.type === k}"><span class="c" style="background:#${g.col.toString(16).padStart(6, '0')};opacity:${Math.max(0.35, g.op + 0.25)}"></span>${t.tints[k]}<span class="pr">${rate ? '+' + rate + ' ' + t.perM2 : t.incl}</span></button>`;
      }).join('')}</div>`;
    }
    const legend = ['zip', 'glass', 'panels'].map((k) => `<li><b>${GL[k]} ${t.fills[k]}</b> – ${t.legend[k]}</li>`).join('');
    h += `<ul class="f-legend">${legend}</ul>`;
    return h;
  }

  /* step 3: comfort */
  function stepComfort(t, o) {
    if (!o) return '';
    const po = state.po, s500 = o.family !== 'S400', slide = o.family === 'SLIDE';
    // longer choices are a list (one row each, text left, price right); yes/no and counts stay short chips
    const card = (title, desc, chips, list = true) => `<div class="f-h3"><span>${title}</span><span style="text-transform:none;letter-spacing:0;font-weight:400">${desc}</span></div><div class="f-chips${list ? ' f-list' : ''}">${chips}</div>`;
    const chip = (attr, cur, label, delta) => `<button type="button" class="f-chip" ${attr} aria-pressed="${cur}">${esc(label)}${delta !== undefined ? `<span class="pr">${plusE(delta)}</span>` : ''}</button>`;
    // light: every kind the price list has for this type, in groups that combine (Slide: gutter and posts only)
    let h = `<h2>${t.s3}</h2><p class="f-lead">${t.s3l}</p>`;
    const recess = Object.values(state.fills).some((f) => f === 'glass' || f === 'zip');
    window.lightGroups().forEach((g, i) => {
      const chips = g.items.map((k) => chip(`data-light="${g.k}:${k}"`, window.lightCurOf(g.k) === k, t.lightI[k], k === 'none' ? undefined : g.k === 'zipled' ? window.zipLedDelta() : optDelta(window.lightPatch(g.k, k)))).join('');
      h += card(i === 0 ? `${t.light} · ${t.lightG[g.k]}` : t.lightG[g.k], i === 0 ? t.lightD : g.k === 'crown' && recess ? t.crownNote : '', chips);
    });
    const heaters = cat.optionScalars.heaters[slide ? 'slide' : s500 ? 's500' : 's400'].sets.map((x) => x.id);
    const heatList = (slide ? ['s5.single', 's5.double'] : ['m1.single', 'm1.pair', 'm1.double']).filter((k) => heaters.includes(k));
    const heatCur = po.heaters ? po.heaters.set : 'none';
    if (heatCur !== 'none' && !heatList.includes(heatCur)) heatList.push(heatCur);
    h += card(t.heat, t.heatD, chip('data-heat="none"', heatCur === 'none', t.heats.none) + heatList.map((k) => chip(`data-heat="${k}"`, heatCur === k, t.heats[k] || t.heats.other, optDelta({ heaters: { set: k, qty: 1 } }))).join(''));
    h += card(t.weather, t.weatherD, (slide ? ['none', 'wind', 'windSun'] : ['none', 'wind', 'set', 'multi']).map((k) => chip(`data-sensor="${k}"`, (po.sensors || 'none') === k, t.weathers[k], k === 'none' ? undefined : optDelta({ sensors: k }))).join(''));
    h += card(t.app, t.appD, (slide ? ['none', 'wifi'] : ['none', 'bluetooth', 'wifi']).map((k) => chip(`data-smart="${k}"`, (po.smart || 'none') === k, t.apps[k], k === 'none' ? undefined : optDelta({ smart: k }))).join(''));
    h += head(t.thermal, t.thermalD) + two('thermal', [{ v: '0', label: t.off, pr: '' }, { v: '1', label: t.on, pr: plusE(optDelta({ thermal: true })) }], po.thermal ? '1' : '0', t);
    h += head(t.audio, t.audioD) + two('audio', [{ v: '0', label: t.off, pr: '' }, { v: '1', label: t.on, pr: plusE(optDelta({ audio: 1 })) }], po.audio ? '1' : '0', t);
    if (s500) h += head(t.sockets, t.socketsD) + two('sock', [0, 1, 2, 4].map((n) => ({ v: String(n), label: n ? '× ' + n : t.off, pr: n ? plusE(optDelta({ sockets: { power: n, usb: 0 } })) : '' })), String(po.sockets.power), t);
    return h;
  }

  /* step 4: colours */
  // colour rows: [as frame] · standard colours · [chosen special colour] · "…" opens the full palette under the row
  const moreOpen = {};
  function stepColours(t, o) {
    if (!o) return '';
    const e = colorsEff(), rates = cat.coating.rates[sysOf(o)];
    const std = PALETTE.filter((c) => c.group === 'standard');
    const fills = Object.values(state.fills);
    const rows = [['construction', t.frame], ['roof', t.roof]];
    if (fills.some((f) => f === 'glass' || f === 'panels')) rows.push(['slide', t.slideCol]);
    if (Object.keys(state.verto.packs || {}).length) rows.push(['verto', 'Decor']);
    if (fills.includes('zip')) rows.push(['zip', t.zipCol]);
    const pct = (key, g) => {
      if (key === 'slide') return cat.coating.rates.GLASS[g] || 0;
      if (key === 'verto') return cat.coating.rates.VERTO[g] || 0;
      if (key === 'zip') return cat.coating.rates.SCREEN_ZIP[g] || 0;
      const r = rates[g]; if (!r) return 0;
      return key === 'roof' ? r[1] : state.colors.roof ? r[0] : r[2];
    };
    const prTxt = (key, g) => { const p = pct(key, g); return p ? '+' + p + ' %' : t.incl; };
    let h = `<h2>${t.s4}</h2><p class="f-lead">${t.s4l}</p>`;
    for (const [key, label] of rows) {
      const linked = key !== 'construction' && !state.colors[key];
      const eff = e[key], effC = colorOf(eff);
      const sw = (c, cur) => `<button type="button" data-cl="${key}" data-c="${c.id}" aria-pressed="${cur}"><span class="c" style="background:${swatchBg(c)}"></span>${esc(cname(c.id))}<span class="pr">${prTxt(key, c.group)}</span></button>`;
      let row = '';
      if (key !== 'construction') row += `<button type="button" data-cl="${key}" data-c="" aria-pressed="${linked}"><span class="c" style="background:${swatchBg(colorOf(e.construction))}"><span class="lnk">=</span></span>${t.asFrame}<span class="pr">&nbsp;</span></button>`;
      row += std.map((c) => sw(c, !linked && eff === c.id)).join('');
      if (!linked && effC.group !== 'standard' && !effC.custom) row += sw(effC, true);
      row += `<button type="button" data-more="${key}" aria-expanded="${!!moreOpen[key]}"><span class="c more"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="19" cy="12" r="2.1"/></svg></span>${t.moreColours}<span class="pr">&nbsp;</span></button>`;
      h += `<div class="f-h3"><span>${label}</span><span style="text-transform:none;letter-spacing:0;font-weight:400">${linked ? t.asFrame : esc(cname(eff))}</span></div><div class="f-sw">${row}</div>`;
      if (moreOpen[key]) {
        h += `<div class="f-palette">` + Object.keys(t.groups).map((g) => {
          const list = PALETTE.filter((c) => c.group === g); if (!list.length) return '';
          return `<div class="f-h3" style="margin-top:12px"><span>${t.groups[g]}</span><span>${prTxt(key, g)}</span></div><div class="f-sw f-sw-sm">${list.map((c) => `<button type="button" data-cl="${key}" data-c="${c.id}" aria-pressed="${!linked && eff === c.id}"><span class="c" style="background:${swatchBg(c)}"></span>${esc(cname(c.id))}</button>`).join('')}</div>`;
        }).join('') + `</div>`;
      }
    }
    if (fills.includes('zip')) h += `<div class="f-h3"><span>${t.fabricTone}</span></div><div class="f-pal">${FABRIC_TONES.map(([hx, n]) => `<button type="button" data-tone="${hx}" aria-pressed="${state.colors.tone === hx}" title="${esc(n)}" aria-label="${esc(n)}" style="background:${hx}"></button>`).join('')}</div>`;
    h += `<p class="f-lead" style="margin-top:14px;font-size:12.5px">${t.colourNote}</p>`;
    return h;
  }

  /* step 5: offer */
  function stepOffer(t, o) {
    if (!o) return '';
    const lines = quoteLines(), total = q().total;
    let h = `<h2>${t.s5}</h2><p class="f-lead">${t.s5l}</p>`;
    h += `<div class="f-total"><span class="muted">${t.qGross}</span><span class="big">${q().incomplete ? t.from + ' ' : ''}${fe(gross(total))}</span><span class="muted">${t.qNet}</span><span class="r">${fe(total)}</span></div>`;
    if (q().incomplete) h += `<div class="f-note">${t.incomplete}</div>`;
    h += `<table class="f-sum"><tbody>`;
    for (const g of groupsOrder) {
      const ls = lines.filter((l) => l.g === g); if (!ls.length) continue;
      h += `<tr class="g"><td colspan="2">${t.grp[g]}</td></tr>` + ls.map((l) => `<tr><td>${esc(l.t)}${l.d ? `<span class="s">${esc(l.d)}</span>` : ''}</td><td class="a">${l.a == null ? '—' : fe(gross(l.a))}</td></tr>`).join('');
    }
    h += `</tbody></table><p class="f-lead" style="font-size:12px;margin:6px 0 0">${t.gross}</p>`;
    h += `<div class="f-h3"><span>${t.notIncl}</span></div><ul class="f-incl">${t.notInclList.map((x, i) => `<li>${i === 0 && q().lines.some((l) => l.k === 'mont') ? t.delivery : x}</li>`).join('')}</ul>`;
    h += formHtml(t);
    h += `<div class="f-h3" style="margin-top:22px"><span>${t.faqT}</span></div><div class="f-faq">${t.faq.map(([qq, a]) => `<details><summary>${qq}</summary><p>${a}</p></details>`).join('')}</div>`;
    return h;
  }
  function formHtml(t) {
    if (sentOk) return `<div class="f-done" id="f-form"><b>${t.sentT}</b><p style="margin:6px 0 8px">${t.sent}</p><div style="display:flex;gap:14px;flex-wrap:wrap"><button type="button" class="f-link" data-act="reopen">${t.reopen}</button><button type="button" class="f-link" data-act="copytext">${t.noMail}</button></div></div>`;
    const err = (k) => formErr[k] ? `<span class="err">${formErr[k]}</span>` : '';
    // one action on this step: "Send request" in the bar; the form keeps an invisible submit so Enter works
    return `<form class="f-form" id="f-form" novalidate><div class="f-h3" style="margin:22px 0 0"><span>${t.formT}</span><span style="text-transform:none;letter-spacing:0;font-weight:400">${t.requestS}</span></div>
      <label>${t.name}<input type="text" name="name" autocomplete="name" value="${esc(form.name)}">${err('name')}</label>
      <label>${t.email}<input type="email" name="email" autocomplete="email" value="${esc(form.email)}">${err('email')}</label>
      <label>${t.phone}<input type="tel" name="phone" autocomplete="tel" value="${esc(form.phone)}"></label>
      <label>${t.place}<input type="text" name="place" autocomplete="postal-code" value="${esc(form.place)}">${err('place')}</label>
      <label>${t.when}<select name="when">${t.whens.map((w, i) => `<option value="${i}" ${form.when === i ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" name="mount" ${form.mount ? 'checked' : ''}> ${t.wantMount}</label>
      <label class="chk"><input type="checkbox" name="visit" ${form.visit ? 'checked' : ''}> ${t.wantVisit}</label>
      <label>${t.msg}<textarea name="msg">${esc(form.msg)}</textarea></label>
      <p class="f-priv">${t.privacy}</p>
      <button type="submit" class="f-sr" tabindex="-1">${t.send}</button></form>
      <p class="f-more"><button type="button" class="f-link" data-act="print">${t.printS}</button> · <button type="button" class="f-link" data-act="share">${t.share}</button></p>`;
  }


  /* ---------- the visitor's path on the site (goes with the request, nothing is sent anywhere else) ----------
   * Kept in the browser only; the customer sees this block in the e-mail before sending it.
   * ASSUMPTION: "active" time = page visible and a tap, key or scroll in the last 60 s; interest points below are a first guess. */
  /* ---------- visitor analytics (PostHog) ----------
   * Loaded only in the customer view and only after the visitor accepted the banner (consent kept in Store 'db.consent').
   * Recordings mask every input (name, phone, e-mail, address are never recorded); no personal data is sent with events.
   * ASSUMPTION: consent text and privacy policy to be checked by D&B (GDPR / Austrian TKG). */
  const A = (() => {
    const key = ANALYTICS.posthogKey, on = () => !!key && Store.get('db.consent') === 'yes';
    let started = false;
    const AT = {
      de: { t: 'Dürfen wir anonym auswerten, wie Sie den Konfigurator nutzen, um ihn zu verbessern? Eingaben wie Name oder Telefon werden nie aufgezeichnet.', yes: 'Einverstanden', no: 'Ablehnen' },
      en: { t: 'May we anonymously analyse how you use the configurator to improve it? Entries like your name or phone are never recorded.', yes: 'Accept', no: 'Decline' },
      ru: { t: 'Можно анонимно анализировать, как вы пользуетесь конфигуратором, чтобы его улучшить? Имя, телефон и другие поля никогда не записываются.', yes: 'Согласен', no: 'Отказаться' },
    };
    function load() {
      if (started || !on() || !isCust()) return; started = true;
      /* eslint-disable */ // official PostHog loader snippet (stub queue, then array.js from the EU assets host)
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session identify setPersonProperties reset get_distinct_id get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
      /* eslint-enable */
      window.posthog.init(key, {
        api_host: ANALYTICS.host,
        person_profiles: 'identified_only', // visitors stay anonymous
        capture_pageview: true, autocapture: true,
        session_recording: { maskAllInputs: true, maskTextSelector: '#f-form, .q .client' },
      });
      window.posthog.register({ lang, app: 'configurator' });
    }
    const loaded = () => window.posthog && window.posthog.__loaded;
    return {
      init() { load(); },
      track(name, props) { if (on() && isCust()) { load(); window.posthog.capture(name, { ...(props || {}), step: (props && props.step) || step + 1, lang }); } },
      replayUrl() { try { return loaded() ? window.posthog.get_session_replay_url({ withTimestamp: false }) : ''; } catch (e) { return ''; } },
      /** a small card at the bottom of the 3D view, once per browser until answered */
      banner() {
        if (!key || !isCust() || Store.get('db.consent')) { const b = $('f-consent'); if (b) b.remove(); return; }
        let b = $('f-consent');
        if (!b) { b = document.createElement('div'); b.id = 'f-consent'; b.setAttribute('role', 'dialog'); $('view').parentElement.appendChild(b);
          b.addEventListener('click', (e) => { const x = e.target.closest('[data-consent]'); if (!x) return; Store.set('db.consent', x.dataset.consent); b.remove(); if (x.dataset.consent === 'yes') { load(); A.track('consent_given'); } }); }
        const t = AT[lang] || AT.de;
        b.innerHTML = `<p>${esc(t.t)}</p><div><button type="button" data-consent="no">${esc(t.no)}</button><button type="button" class="y" data-consent="yes">${esc(t.yes)}</button></div>`;
      },
      /** the manager view is never recorded */
      mode(cust) { if (!loaded()) return; try { if (cust) window.posthog.startSessionRecording(); else window.posthog.stopSessionRecording(); } catch (e) { /* older loader */ } },
    };
  })();
  const J = { t0: Date.now(), active: 0, open: 0, stepSec: [0, 0, 0, 0, 0], last: Date.now(), sizes: new Set(), roofs: new Set(), mounts: new Set(),
    sides: 0, colours: 0, lights: 0, comfort: 0, layouts: 0, rot: 0, views: new Set(), night: 0, printed: 0, linkCopied: 0, photo: 0, formOpened: 0, minP: Infinity, maxP: 0, visit: null };
  (function initVisit() {
    const qs = new URLSearchParams(location.search), utm = ['utm_source', 'utm_medium', 'utm_campaign'].map((k) => qs.get(k)).filter(Boolean).join(' / ');
    let ref = ''; try { const r = document.referrer && new URL(document.referrer); if (r && r.host !== location.host) ref = r.host.replace(/^www\./, ''); } catch (e) { ref = ''; }
    const src = utm || (qs.has('fbclid') ? 'facebook (ad)' : qs.has('gclid') ? 'google (ad)' : ref) || '';
    let v = Store.get('db.visit') || { n: 0, first: Date.now(), src: '' };
    let newSession = true; try { newSession = !sessionStorage.getItem('db.sess'); sessionStorage.setItem('db.sess', '1'); } catch (e) { newSession = true; }
    if (newSession) v.n += 1;
    if (!v.src && src) v.src = src; // first touch: where the customer came from the first time
    Store.set('db.visit', v);
    J.visit = { ...v, now: src };
  })();
  const poke = () => { J.last = Date.now(); };
  for (const e of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) window.addEventListener(e, poke, { capture: true, passive: true });
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    J.open += 1;
    if (Date.now() - J.last < 60000) { J.active += 1; if (isCust()) J.stepSec[step] = (J.stepSec[step] || 0) + 1; }
  }, 1000);
  (function track3D() { // turning the pergola with a finger or the mouse
    const el = typeof renderer !== 'undefined' && renderer.domElement; if (!el) return;
    let x = 0, y = 0, down = false;
    el.addEventListener('pointerdown', (e) => { down = true; x = e.clientX; y = e.clientY; });
    window.addEventListener('pointerup', (e) => { if (down && Math.hypot(e.clientX - x, e.clientY - y) > 25) J.rot += 1; down = false; });
  })();
  document.addEventListener('click', (e) => { // the buttons on the 3D view
    const b = e.target.closest('button'); if (!b) return;
    if (b.closest('#tb-views')) J.views.add(b.id);
    else if (b.id === 'evening') J.night += 1;
    else if (b.closest('#tb-colors') && (b.dataset.qcol !== undefined || b.dataset.tone || b.dataset.gtint || b.dataset.qof)) J.colours += 1;
    else if (b.closest('#tb-lights') && b.dataset.light) J.lights += 1;
    else if (b.id === 'louv-dir') J.layouts += 1;
  }, true);
  const photoIn = $('photo-in'); if (photoIn) photoIn.addEventListener('change', () => { J.photo += 1; A.track('photo_uploaded'); });
  window.addEventListener('beforeprint', () => { if (isCust()) J.printed += 1; });
  function trackAct(d) {
    // the same actions as named events for the analytics (no personal data, only what was chosen)
    if (d.step !== undefined) A.track('step_opened', { step: Number(d.step) + 1, via: 'tab' });
    if (d.fill) A.track('side_set', { fill: d.fill, inner: window.isJoint(d.id) });
    if (d.all) A.track('all_sides_set', { fill: d.all });
    if (d.rooft) A.track('roof_type', { roof: d.rooft });
    if (d.mount) A.track('mount', { mount: d.mount });
    if (d.light) A.track('light', { light: d.light });
    if (d.opt !== undefined || d.louv || d.spl) A.track('layout_changed');
    if (d.vpreset !== undefined || d.vpos) A.track('decor_changed');
    if (d.act === 'share') A.track('link_copied');
    if (d.act === 'photo') A.track('photo_clicked');
    if (d.nudge || d.preset || d.fix) setTimeout(() => J.sizes.add(state.width + 'x' + state.depth), 0);
    if (d.rooft) J.roofs.add(d.rooft);
    if (d.mount) J.mounts.add(d.mount);
    if (d.opt !== undefined || d.louv || d.spl) J.layouts += 1;
    if (d.fill || d.all || d.gtyp || d.gpos || d.vpreset !== undefined || d.vpos || d.vn || d.vmount) J.sides += 1;
    if (d.of || d.gl || d.cl || d.frame || d.roofc || d.roof === 'same' || d.tone) J.colours += 1;
    if (d.light) J.lights += 1;
    if (d.heat || d.sensor || d.smart || d.thermal || d.audio || d.sock !== undefined) J.comfort += 1;
    if (d.act === 'share') J.linkCopied += 1;
    if (d.act === 'form' || d.go === 'form') J.formOpened += 1;
  }
  function trackPrice() {
    const t = q().total; if (!(t > 0) || q().incomplete) return;
    J.minP = Math.min(J.minP, gross(t)); J.maxP = Math.max(J.maxP, gross(t));
    J.sizes.add(state.width + 'x' + state.depth); J.roofs.add(state.roof); J.mounts.add(state.mount);
  }
  /** interest points: the longer and the deeper someone works with the configurator, the warmer the lead */
  function interest() {
    let p = 0;
    if (J.active >= 180) p += 2; if (J.active >= 480) p += 2;
    if (J.visit && J.visit.n > 1) p += 2;
    if (J.sides) p += 1; if (J.colours) p += 1; if (J.lights || J.comfort) p += 1;
    if (J.sizes.size > 1 || J.roofs.size > 1) p += 1;
    if (J.printed) p += 2; if (J.photo) p += 2; if (J.linkCopied) p += 1;
    if (J.rot >= 5) p += 1;
    return { p, lvl: p >= 9 ? 'high' : p >= 5 ? 'mid' : 'low' };
  }
  const JT = {
    de: { head: 'So habe ich den Konfigurator genutzt (für Ihre Beratung)', replay: 'Sitzungsaufzeichnung (intern)', visit: (n, d) => n > 1 ? `${n}. Besuch, erster am ${d}` : 'Erster Besuch', src: 'Gefunden über', direct: 'direkt', active: 'Aktive Zeit', open: 'Seite offen', steps: 'Zeit je Schritt', stepN: ['Größe', 'Seiten', 'Komfort', 'Farben', 'Angebot'], tried: 'Ausprobiert', sizes: 'Größen', roofs: { rotating: 'drehbare Lamellen', sliding: 'Schiebedach' }, sides: 'Änderungen an Seiten', colours: 'Farbwechsel', lights: 'Licht gewählt', comfort: 'Komfort-Änderungen', layouts: 'Varianten/Ausrichtung', range: 'Gesehene Preise', looked: '3D', rot: 'gedreht', views: 'Ansichten', night: 'Abendansicht', printed: 'Angebot gedruckt/PDF', link: 'Link kopiert', photo: 'Foto der Terrasse geladen', yes: 'ja', no: 'nein', interest: 'Interesse', lvl: { high: 'hoch', mid: 'mittel', low: 'niedrig' }, pts: 'Punkte', min: 'Min.', s: 's' },
    en: { head: 'How I used the configurator (for your advice)', replay: 'Session recording (internal)', visit: (n, d) => n > 1 ? `Visit ${n}, first on ${d}` : 'First visit', src: 'Found via', direct: 'direct', active: 'Active time', open: 'page open', steps: 'Time per step', stepN: ['Size', 'Sides', 'Comfort', 'Colours', 'Offer'], tried: 'Tried', sizes: 'sizes', roofs: { rotating: 'rotating louvres', sliding: 'sliding roof' }, sides: 'side changes', colours: 'colour changes', lights: 'light choices', comfort: 'comfort changes', layouts: 'layouts/direction', range: 'Prices seen', looked: '3D', rot: 'turned', views: 'views', night: 'evening view', printed: 'Offer printed/PDF', link: 'link copied', photo: 'terrace photo loaded', yes: 'yes', no: 'no', interest: 'Interest', lvl: { high: 'high', mid: 'medium', low: 'low' }, pts: 'points', min: 'min', s: 's' },
    ru: { head: 'Как я пользовался конфигуратором (для консультации)', replay: 'Запись сессии (для офиса)', visit: (n, d) => n > 1 ? `${n}-й визит, первый ${d}` : 'Первый визит', src: 'Откуда пришёл', direct: 'напрямую', active: 'Активное время', open: 'страница открыта', steps: 'Время по шагам', stepN: ['Размер', 'Стороны', 'Комфорт', 'Цвета', 'Предложение'], tried: 'Пробовал', sizes: 'размеров', roofs: { rotating: 'поворотные ламели', sliding: 'раздвижная крыша' }, sides: 'изменений сторон', colours: 'смен цвета', lights: 'выборов света', comfort: 'изменений комфорта', layouts: 'вариантов/направлений', range: 'Видел цены', looked: '3D', rot: 'вращал', views: 'виды', night: 'вечерний вид', printed: 'КП распечатано/PDF', link: 'ссылка скопирована', photo: 'загрузил фото террасы', yes: 'да', no: 'нет', interest: 'Интерес', lvl: { high: 'высокий', mid: 'средний', low: 'низкий' }, pts: 'баллов', min: 'мин', s: 'с' },
  };
  function journeyText() {
    trackPrice();
    const j = JT[lang] || JT.de, v = J.visit || { n: 1, first: Date.now(), src: '' };
    const dur = (sec) => sec >= 60 ? `${Math.floor(sec / 60)} ${j.min} ${String(sec % 60).padStart(2, '0')} ${j.s}` : `${sec} ${j.s}`;
    const dt = new Date(v.first).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-AT');
    const src = v.src && v.now && v.now !== v.src ? `${v.src} (${v.now})` : v.src || v.now || j.direct;
    const tried = [`${J.sizes.size} ${j.sizes}`, [...J.roofs].map((r) => j.roofs[r] || r).join(' + ')];
    for (const [k, n] of [['sides', J.sides], ['colours', J.colours], ['lights', J.lights], ['comfort', J.comfort], ['layouts', J.layouts]]) if (n) tried.push(`${n} ${j[k]}`);
    const look = [`${j.rot} ${J.rot}×`]; if (J.views.size) look.push(`${j.views} ${J.views.size}`); if (J.night) look.push(j.night);
    const yn = (n) => (n ? j.yes : j.no), it = interest();
    return [`— ${j.head} —`,
      `${j.visit(v.n, dt)} · ${j.src}: ${src}`,
      `${j.active}: ${dur(J.active)} (${j.open} ${dur(J.open)})`,
      `${j.steps}: ${J.stepSec.map((sec, i) => (sec ? `${j.stepN[i]} ${dur(sec)}` : '')).filter(Boolean).join(' · ')}`,
      `${j.tried}: ${tried.filter(Boolean).join(', ')}`,
      J.maxP ? `${j.range}: ${fe(J.minP)} – ${fe(J.maxP)}` : '',
      `${j.looked}: ${look.join(', ')}`,
      `${j.printed}: ${yn(J.printed)} · ${j.link}: ${yn(J.linkCopied)} · ${j.photo}: ${yn(J.photo)}`,
      `${j.interest}: ${j.lvl[it.lvl]} (${it.p} ${j.pts})`,
      A.replayUrl() ? `${j.replay}: ${A.replayUrl()}` : ''].filter(Boolean).join('\n');
  }
  window.journeyText = journeyText; // for the manager: journeyText() in the console

  /* ---------- request e-mail and quote ---------- */
  function sizeText() { const o = curOpt(); return o ? `${metres(o.width)} × ${metres(o.depth)} ${L().m}` : ''; } // as built (louvre spacing may round the size)
  function mailText() {
    const t = L(), lines = quoteLines(), total = q().total;
    const parts = [t.mailHi, '', `${t.qFacts.size}: ${sizeText()} (${state.mount === 'wall' ? t.wall : t.free})`];
    for (const l of lines) parts.push(`- ${l.t}${l.d ? ' (' + l.d + ')' : ''}: ${l.a == null ? '—' : fe(gross(l.a))}`);
    parts.push('', `${t.qGross}: ${q().incomplete ? t.from + ' ' : ''}${fe(gross(total))} (${t.net} ${fe(total)})`, '');
    parts.push(`${t.name}: ${form.name}`, `${t.email}: ${form.email}`);
    if (form.phone) parts.push(`${t.phone.replace(/ \(.*\)/, '')}: ${form.phone}`);
    if (form.place.trim()) parts.push(`${t.place.replace(/ \(.*\)/, '')}: ${form.place}`);
    parts.push(`${t.when}: ${t.whens[form.when]}`);
    if (form.mount) parts.push('✓ ' + t.wantMount);
    if (form.visit) parts.push('✓ ' + t.wantVisit);
    if (form.msg) parts.push('', form.msg);
    parts.push('', `${t.qLink}: ${shareUrl()}`, '', journeyText(), '', t.mailBye, form.name);
    return parts.join('\n');
  }
  let lastMailto = '';
  function openMail() { window.__lastMailto = lastMailto; const a = document.createElement('a'); a.href = lastMailto; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
  /** take the values straight from the fields (browser autofill does not always send input events) */
  function syncForm() {
    const f = F.querySelector('#f-form'); if (!f || f.tagName !== 'FORM') return; // after sending it is the confirmation box
    for (const el of Array.from(f.elements)) if (el.name && el.name in form) form[el.name] = el.type === 'checkbox' ? el.checked : el.name === 'when' ? Number(el.value) : el.value;
  }
  function sendRequest() {
    syncForm();
    const t = L(); formErr = {};
    if (!form.name.trim()) formErr.name = t.required;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) formErr.email = form.email.trim() ? t.badEmail : t.required;
    // postcode / town: optional for now
    if (Object.keys(formErr).length) { render(); const f = F.querySelector('#f-form'); if (f) f.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const subj = t.mailSubj(sizeText(), (q().incomplete ? t.from + ' ' : '') + fe(gross(q().total)));
    lastMailto = `mailto:${OFFICE.email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(mailText())}`;
    openMail();
    A.track('request_sent', { total_gross: Math.round(gross(q().total)), size: state.width + 'x' + state.depth, roof: state.roof, mount: state.mount, interest: interest().lvl, has_postcode: !!String(form.place || '').trim() });
    sentOk = true; render();
  }
  const copy = (txt, msg) => { (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast(msg), () => { window.prompt('', txt); }); };
  function quoteNo() { const d = new Date(), s = enc(snapshot()); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return (OFFICE.name ? 'DB-' : '') + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + (h % 46656).toString(36).toUpperCase().padStart(3, '0'); }
  /** offer number DDMMYY-N: N counts the PDFs generated today and starts at 1 the next day.
   * ASSUMPTION: no server, so the counter lives in this browser — unique per device, two devices can give the same number. */
  const dayKey = (d = new Date()) => String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + String(d.getFullYear()).slice(2);
  function nextQuoteNo(take) {
    const day = dayKey(), c = Store.get('db.qno'), n = c && c.d === day ? c.n + 1 : 1;
    if (take) Store.set('db.qno', { d: day, n });
    return day + '-' + n;
  }
  let quoteNum = null; // the number of the PDF being printed; null = preview shows the next free number
  let lastImg = '';
  function snapshotImage() {
    // on the customer's photo: exactly what they set up (photo + pergola), no camera change
    if (PHOTO.url) { try { return (lastImg = compositeImage()); } catch (e) { return lastImg; } }
    // a sharp picture for A4: render off-screen at 1600 × 900 in the 3D view, then put everything back
    const pos = camera.position.clone(), tgt = controls.target.clone(), lv = lastView, um = userMoved, asp = camera.aspect;
    const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
    try {
      renderer.setPixelRatio(1); renderer.setSize(1680, 600, false); camera.aspect = 1680 / 600; camera.updateProjectionMatrix(); // the A4 picture's own proportion
      setView('front'); // straight from the front, as "Vorne" on the screen
      { // then step in until the pergola itself fills the picture (the screen view keeps room for the labels)
        const { W, D } = bounds(), c = controls.target, off = camera.position.clone().sub(c), pts = [];
        for (const x of [0, W]) for (const y of [0, H + 0.1]) for (const z of [0, D]) pts.push(new THREE.Vector3(x, y, z));
        const fit = (k) => { camera.position.copy(c).addScaledVector(off, k); camera.lookAt(c); camera.updateMatrixWorld(); return Math.max(...pts.map((p) => { const v = p.clone().project(camera); return v.z > 1 ? 9 : Math.max(Math.abs(v.x), Math.abs(v.y)); })); };
        let lo = 0.2, hi = 1;
        for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (fit(mid) > 0.9) lo = mid; else hi = mid; }
        fit(hi);
      }
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/jpeg', 0.88);
      if (url.length > 1000) lastImg = url; // a hidden canvas (print layout) gives an empty picture: keep the last good one
      return lastImg;
    } catch (e) { return lastImg; }
    finally {
      renderer.setPixelRatio(pr); renderer.setSize(size.x, size.y, false); camera.aspect = asp; camera.updateProjectionMatrix();
      camera.position.copy(pos); controls.target.copy(tgt); controls.update(); lastView = lv; userMoved = um;
    }
  }
  function buildQuote() {
    const t = L(), o = curOpt(), lines = quoteLines(), total = q().total, e = colorsEff();
    const ops = opsOf(o).filter((x) => state.fills[x.id] && state.fills[x.id] !== 'none');
    const comfort = lines.filter((l) => l.g === 'comfort').map((l) => l.t).join(', ') || t.none;
    const facts = [
      [t.qFacts.size, `${sizeText()} · ${state.mount === 'wall' ? t.wall : t.free}`],
      [t.qFacts.model, `${o.family === 'SLIDE' ? t.pergolaSlide : t.pergola} ${t.fam[o.family]} · ${t.modules(o.modules.length)} (${o.modules.filter((m) => m.row === 0).map((m) => metres(m.width)).join(' + ')} ${t.m}) · ${t.posts(o.posts)}`],
      [t.qFacts.height, `≤ ${metres(state.po.postHeight)} ${t.m}`],
      ...(state.parapet.sides.length ? [[t.parT, `${state.parapet.sides.map((f) => t.sides[f]).join(', ')} · ${metres(state.parapet.h)} ${t.m}`]] : []),
      [t.qFacts.sides, ops.length ? ops.map((x) => `${sideLabel(x.id, o)}: ${t.fills[state.fills[x.id]]}`).join('; ') : t.open],
      [t.qFacts.colours, `${t.frame}: ${cname(e.construction)}${state.colors.roof ? '; ' + t.roof + ': ' + cname(e.roof) : ''}`],
    ];
    const img = snapshotImage(), date = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'ru' ? 'ru-RU' : 'de-AT');
    // one line per item (details in grey on the same line), grouped like on the screen — fits one A4 page
    const rows = groupsOrder.map((g) => {
      const ls = lines.filter((l) => l.g === g); if (!ls.length) return '';
      return `<tr class="g"><td colspan="2">${esc(t.grp[g])}</td></tr>` + ls.map((l) => `<tr><td>${esc(l.t)}${l.d ? `<span class="s"> · ${esc(l.d)}</span>` : ''}</td><td class="a">${l.a == null ? '—' : fe(l.a)}</td></tr>`).join('');
    }).join('');
    const contact = [OFFICE.email, OFFICE.phone, OFFICE.web].filter(Boolean).join(' · ');
    // top left: the customer from the request form (empty lines to fill in by hand when nothing is typed yet)
    const cl = [form.name, form.phone, form.email].map((x) => String(x || '').trim());
    const client = `<div class="client"><div class="lb">${t.qClient}</div>${cl.some(Boolean) ? `${cl[0] ? `<b>${esc(cl[0])}</b>` : ''}${cl[1] ? `<div>${esc(cl[1])}</div>` : ''}${cl[2] ? `<div>${esc(cl[2])}</div>` : ''}` : '<div class="ln"></div><div class="ln"></div><div class="ln"></div>'}</div>`;
    const no = quoteNum || nextQuoteNo(false);
    return `<div class="q"><div class="hdr">${client}<div class="meta"><h1>${t.qTitle}</h1>${t.qNo} ${no} · ${t.qDate} ${date}${OFFICE.name ? `<div class="brand">${esc(OFFICE.name)}</div>` : ''}${contact ? `<div>${esc(contact)}</div>` : ''}</div></div>
      ${img ? `<img src="${img}" alt="">` : ''}
      <h2>${t.qConfig}</h2><table class="facts"><tbody>${facts.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
      <div><h2>${t.qPrice}</h2><table><thead><tr><th>${t.qItem}</th><th class="a">${t.net}</th></tr></thead><tbody>${rows}
        <tr class="sumrow"><td style="padding-top:8px">${t.qNet}</td><td class="a" style="padding-top:8px">${fe(total)}</td></tr>
        <tr class="sumrow"><td>${t.qVat}</td><td class="a">${fe(total * VAT)}</td></tr>
        <tr class="tot"><td>${t.qGross}${q().incomplete ? ' (' + t.from + ')' : ''}</td><td class="a">${fe(gross(total))}</td></tr></tbody></table></div>
      <ul class="notes">${t.qNotes.map((n, i) => `<li>${i === 1 && q().lines.some((l) => l.k === 'mont') ? t.qExclM : n}</li>`).join('')}${q().incomplete ? `<li>${t.incomplete}</li>` : ''}</ul>
      <div class="foot"><a href="${esc(shareUrl())}">${t.qLink}</a> · ${no}</div></div>`;
  }
  /** the offer always fits one A4 page: measured at print width, a long one is scaled down a little */
  function fitQuote() {
    const box = $('quote'), q0 = box.querySelector('.q'); if (!q0) return;
    q0.style.zoom = '';
    const keep = box.getAttribute('style');
    box.setAttribute('style', 'display:block;position:absolute;left:-10000px;top:0;width:186mm');
    const mm = q0.getBoundingClientRect().width / 186, h = q0.scrollHeight / mm; // height in mm
    if (keep === null) box.removeAttribute('style'); else box.setAttribute('style', keep);
    const avail = 297 - 20 - 4; // A4 minus the page margins, a little slack
    if (h > avail) q0.style.zoom = String(Math.max(0.6, avail / h));
  }
  /** the browser names the PDF after the page title: "Quotation 231026-4" while printing, then the normal title again */
  let titleBefore = null;
  function pdfTitle() { if (titleBefore === null) titleBefore = document.title; document.title = 'Quotation ' + quoteNum; }
  function printQuote() {
    quoteNum = nextQuoteNo(true); // every generated PDF gets its own number
    pdfTitle(); A.track('pdf_generated', { quote_no: quoteNum, total_gross: Math.round(gross(q().total)) });
    $('quote').innerHTML = buildQuote(); fitQuote();
    document.body.classList.add('printing');
    setTimeout(() => window.print(), 60);
  }
  // Printing from the browser menu (or "share → print" on a phone) also gives the clean offer, never the screen:
  // the offer is rebuilt right before printing; print CSS shows only #quote in the customer view.
  window.addEventListener('beforeprint', () => {
    if (!isCust() || !curOpt()) return;
    // printed from the browser menu: this PDF needs its own number too (the button has already taken one)
    if (!quoteNum) { quoteNum = nextQuoteNo(true); $('quote').innerHTML = buildQuote(); fitQuote(); }
    pdfTitle();
    document.body.classList.add('printing');
  });
  window.addEventListener('afterprint', () => { document.body.classList.remove('printing'); quoteNum = null; });
  // Chrome closes the print preview (afterprint) before its "Save as" dialog takes the file name from the title:
  // the title stays "Quotation …" until the next click or key on the page, so the PDF keeps that name.
  const titleBack = () => { if (titleBefore !== null && !quoteNum) { document.title = titleBefore; titleBefore = null; } };
  document.addEventListener('pointerdown', titleBack, true); document.addEventListener('keydown', titleBack, true);
  function saveFile() {
    const blob = new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pergola-${quoteNo()}.json`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- actions ---------- */
  const rebuild = () => { syncGlassControls(); build(); renderEstimate(); renderPergolaOptions(); };
  // the 3D view stays exactly as the customer left it when the step changes
  /* ---------- steps already answered: a ✓ on the step, and "Next" jumps over them ---------- */
  const visited = new Set(); // steps the customer went on from with "Next"
  const DEF_COLORS = { construction: '04', roof: null, slide: null, zip: null, verto: null, fabric: 'soltis-7635', tone: '#3a3d40' };
  function stepDone(i) {
    if (visited.has(i)) return true;
    const po = state.po;
    if (i === 0) return false; // the size is always looked at first
    if (i === 1) return Object.values(state.fills).some((f) => f && f !== 'none') || Object.keys(state.verto.packs || {}).length > 0;
    if (i === 2) return !!(po.ledLouvres || po.ledGutter || po.spots || po.lamps || po.crownSpots || po.verticalLamps || po.zipLed || po.heaters || po.sensors || po.smart || po.thermal || po.audio || (po.sockets && (po.sockets.power || po.sockets.usb)));
    if (i === 3) return Object.keys(DEF_COLORS).some((k) => state.colors[k] !== DEF_COLORS[k]) || state.glass.type !== 'float';
    return false;
  }
  /** the step "Next" leads to: the next one not answered yet, else the offer */
  function nextStep() { for (let i = step + 1; i < 4; i++) if (!stepDone(i)) return i; return 4; }
  function go(d) {
    if (d > 0) { visited.add(step); step = nextStep(); } else step = Math.max(0, step - 1);
    A.track('step_opened', { step: step + 1, via: d > 0 ? 'next' : 'back' });
    focusId = null; lastTap = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  let dimT = 0;
  /** typed size in metres -> mm; the same value again does nothing (a blur must not re-render under the user's next tap) */
  function applyDim(el) {
    const v = Math.round(parseFloat(String(el.value).replace(',', '.')) * 1000); if (!(v > 0)) return;
    const w = el.dataset.dim === 'w' ? Math.max(1000, Math.round(v / 10) * 10) : state.width, d = el.dataset.dim === 'd' ? Math.max(1000, Math.round(v / 10) * 10) : state.depth;
    if (w === state.width && d === state.depth) return;
    setDims(w, d);
  }
  function setDims(w, d) {
    state.width = Math.max(1000, Math.round(w / 10) * 10); state.depth = Math.max(1000, Math.round(d / 10) * 10);
    $('w').value = state.width; $('d').value = state.depth; recompute(false);
  }
  /** selector of a control by its data-* attributes (the same control after a re-render) */
  const selOf = (el) => { const ds = Object.entries(el.dataset); return ds.length ? el.tagName.toLowerCase() + ds.map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}="${CSS.escape(v)}"]`).join('') : null; };
  let lastTap = null;
  F.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b || !F.contains(b)) return;
    lastTap = b.dataset.step !== undefined || b.dataset.go ? null : selOf(b);
    if (!b.dataset.step && !b.dataset.go && !b.dataset.lang) dirty = true;
    act(b.dataset);
  });
  function act(d) {
    trackAct(d);
    const o = curOpt();
    if (d.lang) { setLang(d.lang); return; }
    if (d.mode) { setMode(d.mode); return; }
    if (d.step !== undefined) { step = Number(d.step); focusId = null; render(); return; }
    if (d.go) {
      if (d.go === 'form') { // "Send request" in the bar: send when the form is filled, otherwise go to the first missing field
        syncForm();
        const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
        const missing = !form.name.trim() ? 'name' : !okMail ? 'email' : null;
        if (!missing && !sentOk) { sendRequest(); return; }
        const f = F.querySelector('#f-form'); if (f) { const i = f.querySelector(`[name="${missing || 'name'}"]`) || f; i.scrollIntoView({ block: 'center', behavior: 'smooth' }); if (missing && i !== f) setTimeout(() => i.focus(), 400); }
        return;
      } go(Number(d.go)); return; }
    if (d.resume) { const s = resumeOffer; resumeOffer = null; if (d.resume === 'yes' && s) restore(s); else { dirty = true; render(); persist(); } return; }
    if (d.mount) { setMount(d.mount); return; }
    if (d.par) { const pp = state.parapet; if (d.par === 'none') pp.sides = []; else { const st = new Set(pp.sides); if (st.has(d.par)) st.delete(d.par); else st.add(d.par); pp.sides = [...st]; } rebuild(); applyAnim(); return; }
    if (d.parh) { state.parapet.h = Math.max(100, Math.min(1500, state.parapet.h + Number(d.parh))); rebuild(); applyAnim(); return; }
    if (d.nudge) { const k = d.nudge, v = (k === 'w' ? state.width : state.depth) + Number(d.d); if (k === 'w') setDims(v, state.depth); else setDims(state.width, v); return; }
    if (d.preset) { const [w, dd] = d.preset.split('x').map(Number); setDims(w, dd); return; }
    if (d.fix) { if (d.fix.startsWith('DEPTH')) setDims(state.width, Number(d.v)); else setDims(Number(d.v), state.depth); return; }
    if (d.h) { state.po.postHeight = Number(d.h); rebuild(); return; }
    if (d.rooft) { if (d.rooft === state.roof) return; state.roof = d.rooft; syncRoofButtons(); keepCamera(() => recompute(false)); return; }
    if (d.opt !== undefined) { choose(Number(d.opt)); return; }
    if (d.spl) { keepCamera(() => window.splitAct(d.spl)); return; }
    if (d.louv) { if (d.louv === state.louvres) return; state.louvres = d.louv; $('louv-dir').setAttribute('aria-pressed', state.louvres === 'perpendicular'); keepCamera(() => recompute(false)); return; }
    if (d.zctlall || d.zctl) { // the motor brand follows the control if needed (see brandFor)
      const ids = zipIds(), cur = Object.fromEntries(ids.map((id) => [id, ctlOf(id)]));
      const modeFor = d.zctlall ? () => d.zctlall : (id) => (id === d.id ? d.zctl : cur[id]);
      const bf = brandFor(modeFor); if (!bf) return;
      state.brand = bf.brand; state.remote = '';
      for (const id of ids) state.zipCtl[id] = modeFor(id);
      renderEstimate(); return;
    }
    if (d.cardClose) { closeCard(); return; }
    if (d.vpreset !== undefined) { window.setVertoPreset(Number(d.vpreset)); render(); return; }
    if (d.vmount) { window.setVertoMount(d.vmount); render(); return; }
    if (d.vpos) { window.setVertoPack(d.id, d.vpos); focusId = d.id; render(); return; }
    if (d.vn) { const op = opsOf(o).find((x) => x.id === d.id), l = window.vertoList({ [d.id]: state.verto.packs[d.id] || {} }); if (op && l.length) { const gm = window.vertoGeom(op, l[0].pk, o); window.setVertoPack(d.id, 'n', Math.max(2, Math.min(gm.maxN, gm.n + Number(d.vn)))); } render(); return; }
    if (d.fill) { state.fills[d.id] = d.fill; /* 'none' is kept: the side was answered "nothing" (its + turns see-through) */ focusId = d.id; rebuild(); applyAnim(); return; }
    if (d.all) { for (const x of opsOf(o)) if (!window.isJoint(x.id)) state.fills[x.id] = d.all; rebuild(); applyAnim(); return; }
    if (d.gtyp) { // opening type: the cheapest one-way system parking on that side, or the cheapest two-way system
      const op = openingById(d.id); if (!op) return;
      const g = glassFor(op), want = d.gtyp === 'center' ? 'double' : 'single';
      const pick = g.options.filter((x) => x.opening === want).sort((a, b) => a.price - b.price)[0]; if (!pick) return;
      setCfg(op, { variant: pick.table, ...(d.gtyp === 'center' ? {} : { side: d.gtyp === 'rtl' ? 'left' : 'right' }) });
      build(); applyAnim(); renderEstimate(); render(); return;
    }
    if (d.gpos) { // the glass slides to the chosen side, or closes the opening
      const op = openingById(d.id);
      if (op) { setCfg(op, d.gpos === 'close' ? { open: 0 } : d.gpos === 'both' || d.gpos === 'open' ? { open: 100 } : { side: d.gpos, open: 100 }); build(); applyAnim(); render(); }
      return;
    }
    if (d.of) { state.colors.fabric = fabricForOpenness(Number(d.of)); for (const k of Object.keys(state.zipFab)) delete state.zipFab[k]; applyColors(); renderColors(); renderEstimate(); return; }
    if (d.gl) { state.glass.type = d.gl; for (const k of Object.keys(state.glassOf)) delete state.glassOf[k]; build(); renderColors(); renderEstimate(); return; }
    const po = state.po;
    if (d.light) { setLight(d.light); syncGlassControls(); return; } // same as the light button on the 3D: shown at once
    if (d.heat) { po.heaters = d.heat === 'none' ? null : { set: d.heat, qty: 1 }; rebuild(); return; }
    if (d.sensor) { po.sensors = d.sensor === 'none' ? null : d.sensor; rebuild(); return; }
    if (d.smart) { po.smart = d.smart === 'none' ? null : d.smart; rebuild(); return; }
    if (d.thermal) { po.thermal = d.thermal === '1'; rebuild(); return; }
    if (d.audio) { po.audio = Number(d.audio); rebuild(); return; }
    if (d.sock !== undefined) { po.sockets = { ...po.sockets, power: Number(d.sock) }; rebuild(); return; }
    if (d.more) { moreOpen[d.more] = !moreOpen[d.more]; render(); return; }
    if (d.cl) { // a colour for one part; '' = same as the frame
      const k = d.cl; moreOpen[k] = false;
      if (!d.c) { state.colors[k] = null; applyColors(); renderColors(); renderEstimate(); }
      else setColor(k, d.c);
      return;
    }
    if (d.frame) { setColor('construction', d.frame); return; }
    if (d.roof === 'same') { state.colors.roof = null; applyColors(); renderColors(); renderEstimate(); return; }
    if (d.roofc) { state.colors.roof = d.roofc === state.colors.construction ? null : d.roofc; applyColors(); renderColors(); renderEstimate(); return; }
    if (d.tone) { state.colors.tone = d.tone; applyColors(); renderColors(); render(); return; }
    if (d.act === 'form') { sentOk = false; render(); const f = F.querySelector('#f-form'); if (f) { f.scrollIntoView({ block: 'start', behavior: 'smooth' }); const i = f.querySelector('input'); if (i) setTimeout(() => i.focus(), 400); } return; }
    if (d.act === 'print') { printQuote(); return; }
    if (d.act === 'photo') { $('photo-in').click(); return; }
    if (d.act === 'share') { copy(shareUrl(), L().copied); return; }
    if (d.act === 'save') { saveFile(); return; }
    if (d.act === 'open') { $('f-file').click(); return; }
    if (d.act === 'reopen') { if (lastMailto) openMail(); return; }
    if (d.act === 'copytext') { copy(mailText(), L().textCopied); return; }
  }
  F.addEventListener('input', (ev) => {
    const el = ev.target;
    dirty = true;
    if (el.dataset.dim) {
      clearTimeout(dimT);
      dimT = setTimeout(() => applyDim(el), 600);
      return;
    }
    if (el.form && el.form.id === 'f-form' && el.name) { form[el.name] = el.type === 'checkbox' ? el.checked : el.name === 'when' ? Number(el.value) : el.value; }
  });
  F.addEventListener('change', (ev) => {
    const el = ev.target;
    if (el.dataset.sel) { if (el.value !== '') { dirty = true; lastTap = selOf(el); act({ [el.dataset.sel]: el.value }); } return; } // "More …" dropdown
    if (el.form && el.form.id === 'f-form' && el.name) form[el.name] = el.type === 'checkbox' ? el.checked : el.name === 'when' ? Number(el.value) : el.value;
    if (el.dataset.dim) { clearTimeout(dimT); applyDim(el); }
    if (el.dataset.parin) { const v = Math.round(parseFloat(String(el.value).replace(',', '.')) * 1000); if (v > 0) { state.parapet.h = Math.max(100, Math.min(1500, Math.round(v / 10) * 10)); rebuild(); applyAnim(); } }
    if (el.id === 'f-file' && el.files && el.files[0]) { const r = new FileReader(); r.onload = () => { try { restore(JSON.parse(r.result)); } catch (e) { toast('JSON?'); } }; r.readAsText(el.files[0]); }
  });
  F.addEventListener('submit', (ev) => { ev.preventDefault(); sendRequest(); });
  // phones: while typing, the 3D stops sticking to the top (with the keyboard open it would cover the form),
  // and the field being typed in is brought into view above the keyboard
  F.addEventListener('focusin', (ev) => {
    if (!ev.target.matches('input:not([type=checkbox]):not([type=file]), textarea, select')) return;
    document.body.classList.add('typing');
    setTimeout(() => { if (document.activeElement === ev.target) ev.target.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 350);
  });
  F.addEventListener('focusout', () => setTimeout(() => { if (!F.contains(document.activeElement) || !document.activeElement.matches('input, textarea, select')) document.body.classList.remove('typing'); }, 200));

  /* ---------- mode, language, toolbar ---------- */
  const TB_RU = T.ru.tb;
  const HINT_RU = $('hint') ? $('hint').textContent : '';
  const LOUV_TITLE_RU = $('louv-dir').title;
  function translateToolbar() {
    const tb = isCust() ? L().tb : TB_RU;
    const setLabel = (id, txt) => { const lab = $(id).closest('label'); if (lab && lab.firstChild && lab.firstChild.nodeType === 3) lab.firstChild.nodeValue = txt + ' '; };
    setLabel('ang', tb.ang); setLabel('drop', tb.drop); setLabel('gopen', tb.gopen); setLabel('sopen', tb.sopen);
    window.TB_TEXT = tb; sopenText();
    window.STACK_TEXT = isCust() ? L().stackLbl : null;
    const cap = (id, s) => { const c = $(id).querySelector('.cap'); if (c) c.textContent = s; };
    cap('tb-view', tb.view); cap('louv-dir', tb.louvCap); cap('tb-move', tb.move); cap('evening', tb.night); cap('tb-photo', tb.photo); cap('tb-light', tb.light); cap('tb-color', tb.color); $('tb-color').title = tb.colorT; window.COLOR_TEXT = isCust() ? { glass: L().glassTint, frame: L().frame, roof: L().roof, zip: L().zipCol, fabric: L().fabricTone, fabricOf: L().fabric, ofName: L().ofName, slide: L().slideCol, verto: 'Decor', toneNames: L().tones, asFrame: L().asFrame, more: L().moreColours, groups: L().groups, noGlass: L().noGlass, tints: L().tints } : null; window.COLOR_NAME = isCust() ? (c) => cname(c.id) : null; if (!$('tb-colors').hidden) renderColorQuick(); $('tb-light').title = tb.light; $('v-under').textContent = tb.under; window.LIGHT_TEXT = isCust() ? { groups: L().lightG, ...L().lightI } : null; window.SIDE_NAME = isCust() ? (id) => sideLabel(id, curOpt()) : null; window.VERTO_TEXT = isCust() ? { sideT: L().vSideT, pos: L().vPos, prof: L().vProf, none: L().vNone, types: L().vTypes, typesWall: L().vTypesWall, mountT: L().vMountT, mounts: L().vMounts, hint: L().vEdit, typesT: L().vTypesT } : null; if (!$('tb-vertos').hidden) renderVertoPop(); if (!$('tb-lights').hidden) renderLightPop();
    $('tb-photo').title = tb.photoT; $('photo-txt-s').textContent = tb.photoHelpS; $('photo-pts').textContent = tb.photoPts; if (PHOTO.pts) drawMarks(); else $('photo-txt').textContent = tb.photoHelp; $('photo-shot').textContent = tb.photoShot; $('photo-new').textContent = tb.photoNew; $('photo-off').textContent = tb.photoOff;
    $('tb-view').title = tb.view; $('tb-move').title = tb.moveT; $('evening').title = tb.nightT; $('evening').setAttribute('aria-label', tb.nightT);
    $('v-front').textContent = tb.front; $('v-top').textContent = tb.top;
    $('louv-dir').title = isCust() ? tb.louv : LOUV_TITLE_RU; $('louv-dir').setAttribute('aria-label', tb.louv);
    gopenText();
    window.MM_UNIT = isCust() ? L().mm : 'мм';
    renderLabels(curOpt());
    const hint = $('hint'); if (hint) hint.textContent = isCust() ? L().hint : HINT_RU;
    document.documentElement.lang = isCust() ? lang : 'ru';
    document.title = isCust() ? (OFFICE.name ? `${OFFICE.name} – ${L().pergola}` : L().pergola) : '3D-конфигуратор';
  }
  function gopenText() { const tb = isCust() ? L().tb : TB_RU, v = state.glassOpen; $('gopenv').textContent = v === 0 ? tb.closed : v === 100 ? tb.open : v + '%'; }
  $('gopen').addEventListener('input', gopenText);
  function setLang(l) { lang = l; Store.set('db.lang', l); translateToolbar(); render(); persist(); A.banner(); A.track('language', { to: l }); }
  function setMode(m) {
    document.body.classList.toggle('cust', m === 'cust');
    Store.set('db.mode', m);
    translateToolbar(); render();
    A.mode(m === 'cust'); A.init(); A.banner();
    const r = $('mode-cust'); if (r) r.hidden = m === 'cust';
    for (const x of document.querySelectorAll('.pro-file')) x.hidden = m === 'cust';
  }
  // pro mode: a way back to the customer view, at the top of the left panel
  {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'mode-cust'; b.className = 'chip'; b.textContent = '← ' + T.ru.toCust; b.style.cssText = 'float:right;margin:-4px 0 0 8px;font-size:12px';
    b.onclick = () => setMode('cust');
    // JSON export / import of a configuration (the storage adapter for now): for the manager only
    const fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'application/json,.json'; fi.hidden = true;
    fi.onchange = () => { const f = fi.files && fi.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { restore(JSON.parse(r.result)); } catch (e) { toast('JSON?'); } }; r.readAsText(f); fi.value = ''; };
    const mk = (txt, fn) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'chip pro-file'; x.textContent = txt; x.style.cssText = 'float:right;margin:-4px 0 0 8px;font-size:12px'; x.onclick = fn; return x; };
    const panel = document.querySelector('.app > aside.panel');
    panel.prepend(b, mk(T.ru.openFile, () => fi.click()), mk(T.ru.saveFile, saveFile), fi);
  }
  function setMount(m) { state.mount = m; $('mt-wall').setAttribute('aria-pressed', m === 'wall'); $('mt-free').setAttribute('aria-pressed', m === 'free'); recompute(false); }

  /* ---------- 3D call to action: a "+" on every side; tap it to choose what closes that side ---------- */
  const HS = document.createElement('div'); HS.id = 'hotspots'; HS.className = 'cust-only';
  const CTA = document.createElement('button'); CTA.type = 'button'; CTA.id = 'f-cta'; CTA.className = 'cust-only';
  $('view').parentElement.append(HS, CTA);
  let hsSig = '';
  function renderHotspots() {
    const o = curOpt(), ops = opsOf(o), anyFill = ops.some((x) => state.fills[x.id] && state.fills[x.id] !== 'none');
    const anySet = ops.some((x) => state.fills[x.id]); // a side answered "nothing" also stops the pulse
    CTA.hidden = anySet || Object.keys(state.verto.packs || {}).length > 0 || !o || !!PHOTO.url; CTA.innerHTML = `<span class="hand">☝</span><span class="l">${esc(L().cta)}</span><span class="s">${esc(L().ctaS)}</span>`;
    const sig = lang + '|' + ops.map((x) => x.id + ':' + (state.fills[x.id] || '?')).join(',') + '|' + (focusId || '');
    if (sig === hsSig) return; hsSig = sig;
    HS.innerHTML = ops.map((x) => {
      const f = state.fills[x.id] || 'none', lab = `${sideLabel(x.id, o)} · ${f === 'none' ? L().hsOpen : L().fills[f]}`;
      const no = state.fills[x.id] === 'none'; // chosen "nothing": a see-through +, still tappable
      return `<button type="button" class="hs${f === 'none' ? '' : ' filled'}${no ? ' nofill' : ''}${!anySet ? ' pulse' : ''}${focusId === x.id ? ' on' : ''}" data-hs="${x.id}" title="${esc(lab)}" aria-label="${esc(lab)}">${f === 'none' ? '+' : GL[f]}</button>`;
    }).join('');
  }
  const hv = new THREE.Vector3();
  (function placeHs() { // follow the camera: each button sits on the middle of its side
    requestAnimationFrame(placeHs);
    if (!isCust() || !HS.firstChild) return;
    const r = $('view').getBoundingClientRect(), list = [];
    for (const b of HS.children) {
      const pl = pickables.find((p) => p.userData.opening && p.userData.opening.id === b.dataset.hs);
      if (!pl) { b.style.display = 'none'; continue; }
      pl.getWorldPosition(hv); hv.project(camera);
      list.push({ b, x: ((hv.x + 1) / 2) * r.width, y: ((1 - hv.y) / 2) * r.height, z: hv.z, off: hv.z > 1 || Math.abs(hv.x) > 1.02 || Math.abs(hv.y) > 1.02 });
    }
    // nearest first; a button that would sit on top of a nearer one (e.g. front and back in the front view) is hidden
    list.sort((a, c) => a.z - c.z);
    // dimension labels stay readable: a button that would cover one moves up above it
    const dims = [...document.querySelectorAll('#labels .dim')].filter((d) => d.style.display !== 'none').map((d) => {
      const x = parseFloat(d.style.left), y = parseFloat(d.style.top), w = d.offsetWidth / 2 + 18, h = d.offsetHeight / 2 + 18;
      return { l: x - w, r: x + w, t: y - h, b: y + h };
    });
    const shown = [];
    for (const it of list) {
      for (const d of dims) if (it.x > d.l && it.x < d.r && it.y > d.t && it.y < d.b) it.y = d.t - 2;
      const hide = it.off || shown.some((s) => Math.hypot(s.x - it.x, s.y - it.y) < 34);
      it.b.style.display = hide ? 'none' : '';
      if (!hide) { shown.push(it); it.b.style.left = it.x + 'px'; it.b.style.top = it.y + 'px'; }
    }
  })();
  HS.addEventListener('click', (ev) => { const b = ev.target.closest('[data-hs]'); if (!b) return; dirty = true; openCard(b.dataset.hs); });
  CTA.addEventListener('click', () => { step = 1; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---------- side card: tap a side in 3D and choose right there ---------- */
  const CARD = document.createElement('div'); CARD.id = 'f-card'; CARD.className = 'cust-only'; CARD.hidden = true;
  CARD.setAttribute('role', 'dialog');
  $('view').parentElement.append(CARD);
  let cardId = null;
  function openCard(id) { cardId = id; focusId = id; render(); }
  function closeCard() { cardId = null; CARD.hidden = true; render(); }
  function renderCard() {
    if (!cardId || !isCust()) { CARD.hidden = true; return; }
    const o = curOpt(), op = opsOf(o).find((x) => x.id === cardId);
    if (!op) { CARD.hidden = true; return; }
    const t = L(), f = state.fills[op.id] || 'none', bad = q().lines.some((l) => l.k === 'unbuilt' && l.id === op.id);
    let h = `<div class="fc-h"><b>${sideLabel(op.id, o)}</b><small>${metres(Math.round(op.len * 1000))} ${t.m}</small><span class="pr">${f === 'none' || bad ? '' : '+' + fe(gross(sideAmount(op.id)))}</span><button type="button" class="fc-x" data-card-close="1" aria-label="${esc(t.done)}">×</button></div>`;
    h += `<div class="fc-q">${t.cardQ}</div><div class="fc-fills">${['none', 'zip', 'glass', 'panels'].map((k) => `<button type="button" data-fill="${k}" data-id="${op.id}" aria-pressed="${f === k}"><span class="g">${GL[k]}</span>${t.fillsS[k]}</button>`).join('')}</div>`;
    if (bad) h += `<div class="f-note">${badText(op.id)}</div>`;
    if (f === 'zip' && !bad) h += `<div class="fc-q">${t.thisScreen}</div>${ctlRows(t, 'data-zctl', (m) => ctlOf(op.id) === m, (m) => (id) => (id === op.id ? m : ctlOf(id)), `data-id="${op.id}"`)}`;
    if (f === 'glass' && !bad) h += `<div style="margin-top:10px">${glassPos(op, t)}</div>`;
    h += vertoCard(t, o, op);
    h += `<button type="button" class="f-btn primary fc-done" data-card-close="1">${t.done}</button>`;
    const top = CARD.scrollTop; // a choice must not scroll the card back to the top
    CARD.innerHTML = h; CARD.hidden = false; CARD.scrollTop = top;
  }
  CARD.addEventListener('click', (ev) => { const b = ev.target.closest('button'); if (!b) return; dirty = true; act(b.dataset); });

  /* ---------- hooks from the main script ---------- */
  window.onEstimate = () => {
    persist(); trackPrice();
    if (!isCust()) return;
    // keep what the user is typing: re-render, then put the text and the caret back into the same field
    const a = document.activeElement;
    const key = a && F.contains(a) && a.matches('input, textarea, select') ? (a.id ? '#' + a.id : a.name ? `[name="${a.name}"]` : null) : null;
    const val = key ? a.value : null;
    let sel = null; try { sel = key ? [a.selectionStart, a.selectionEnd] : null; } catch (e) { sel = null; }
    render();
    if (key) { const n = F.querySelector(key); if (n) { if (n.type !== 'checkbox') n.value = val; n.focus({ preventScroll: true }); try { if (sel && sel[0] != null) n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* number inputs */ } } }
  };
  window.onPhoto = (on, moved) => { dirty = true; if (moved) return; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  window.onOpeningPick = (o) => {
    if (!isCust()) return false;
    openCard(o.id); // choose right on the 3D view; the sides step shows the same choice
    return true;
  };

  /* ---------- start ---------- */
  const params = new URLSearchParams(location.search);
  const mode = params.has('pro') ? 'pro' : params.has('kunde') || params.has('client') ? 'cust' : (Store.get('db.mode') || 'cust');
  document.body.classList.toggle('cust', mode === 'cust');
  const m = /[#&]c=([^&]+)/.exec(location.hash);
  let restored = false;
  if (m) { try { restore(dec(m[1])); restored = true; dirty = true; } catch (e) { /* broken link: start fresh */ } }
  if (!restored && mode === 'cust') {
    // customers start with an open pergola: nothing extra is pre-selected, every addition is their own choice
    state.fills = {}; build(); renderEstimate();
    const saved = Store.get('db.cfg');
    if (saved && JSON.stringify(saved) !== JSON.stringify(snapshot())) resumeOffer = saved;
  }
  setMode(mode);
})();
