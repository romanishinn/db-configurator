/* ---------- customer mode: a five-step funnel over the same engine ----------
 * Size -> sides -> comfort -> colours -> quote. One decision per screen, simple choices first, the price is always
 * visible, nothing is pre-selected that costs extra. The full internal tool stays available as "Pro" mode.
 * Texts are in T below (DE / EN / RU); the printable quote and the request e-mail use the same language.
 */
(() => {
  // ASSUMPTION: private customers in Austria, standard VAT 20 %. Catalogue prices are net suggested retail prices.
  const VAT = 0.2;
  // TODO(D&B): office e-mail and phone for requests and the quote footer. While empty, the mail opens without a recipient.
  const OFFICE = { name: 'D&B Solutions', email: '', phone: '', web: '' };
  const CATALOGUE = '07/2026';

  const T = {
    de: {
      steps: ['Größe', 'Seiten', 'Komfort', 'Farben', 'Angebot'],
      next: 'Weiter', back: 'Zurück', toOffer: 'Zum Angebot', send: 'Anfrage senden',
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
      legend: { zip: 'Stoffbehang in seitlichen Führungen, motorisch – Sonnen- und Sichtschutz.', glass: 'Glas-Schiebeelemente (Win Glass) – Schutz vor Wind und Regen.', verto: 'Feste Aluminiumprofile (Win Verto) – Sichtschutz, Luft kommt durch.', panels: 'Aluminium-Lamellenpaneele auf Schienen (Win Panels) – verschiebbar.' },
      sides: { front: 'Vorne', left: 'Links', right: 'Rechts', back: 'Hinten' }, field: 'Feld', row: 'Reihe',
      park: 'Glas', parkL: '← links', parkR: 'rechts →', parkBoth: '↔ offen', shut: 'zu',
      cta: 'Tippen Sie auf ein ＋, um eine Seite zu schließen – ZIP-Screen, Glas oder Lamellenwand', hsOpen: 'Seite wählen',
      notMade: 'In dieser Größe nicht lieferbar – andere Variante wählen.', later: 'Preis auf Anfrage',
      fabric: 'Stoff der ZIP-Screens', ofName: { 14: 'Luftig, viel Durchsicht', 5: 'Sonnen- und Sichtschutz', 4: 'Sicht- und Sonnenschutz, etwas dichter', 1: 'Fast blickdicht', 0: 'Verdunkelung' },
      perM2: '€/m²', zipCtl: 'Bedienung über die Fernbedienung der Pergola.',
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
      frame: 'Rahmen und Stützen', roof: 'Lamellen', slideCol: 'Profile von Glas, Lamellenwand, Paneelen', zipCol: 'ZIP-Kassette und Führungen', asFrame: 'wie Rahmen', moreColours: 'Weitere Farben', groups: { fine: 'Feinstruktur', smooth: 'Glatt matt', exclusive: 'Exklusiv', wood: 'Holzoptik' },
      fabricTone: 'Farbton des Stoffes', colourNote: 'Farben am Bildschirm sind Annäherungen. Vor der Bestellung zeigen wir Ihnen Originalmuster.',
      // step 5
      s5: 'Ihr Richtpreis', s5l: 'Auf Basis der Katalogpreise ' + CATALOGUE + '. Unverbindlich – der endgültige Preis folgt nach dem Aufmaß vor Ort.',
      grp: { pergola: 'Pergola', sides: 'Seiten', comfort: 'Komfort', colours: 'Farben und Zuschläge' },
      notIncl: 'Nicht im Preis enthalten', notInclList: ['Lieferung und Montage', 'Fundamente und Elektroanschluss', 'Behördliche Genehmigungen, falls nötig'],
      incomplete: 'Einige Positionen sind in dieser Größe nicht lieferbar und nicht im Preis.',
      print: 'Angebot drucken oder als PDF speichern', request: 'Unverbindliche Anfrage senden', requestS: 'Wir melden uns persönlich bei Ihnen', share: 'Link kopieren', shareS: 'zum Teilen oder später weitermachen', copied: 'Link kopiert',
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
      qTitle: 'Richtpreisangebot', qNo: 'Nr.', qDate: 'Datum', qConfig: 'Ihre Konfiguration', qPrice: 'Preis', qItem: 'Position', qNet: 'Summe netto', qVat: 'USt. 20 %', qGross: 'Gesamt inkl. USt.',
      qFacts: { size: 'Größe', mount: 'Montage', model: 'Modell', height: 'Stützenhöhe', sides: 'Seiten', colours: 'Farben', comfort: 'Komfort' },
      qNotes: ['Richtpreis auf Basis der Katalogpreise ' + CATALOGUE + ', unverbindlich.', 'Nicht enthalten: Lieferung, Montage, Fundamente, Elektroanschluss, Genehmigungen.', 'Der endgültige Preis folgt nach dem Aufmaß vor Ort.', 'Farben am Bildschirm sind Annäherungen.'],
      qLink: 'Konfiguration online öffnen', none: 'keine', open: 'offen',
      fam: { S400: 'S400', S500: 'S500', S500_DOUBLE: 'S500 Doppel' }, pergola: 'Lamellendach', panelsW: 'Flügel', profilesW: 'Profile', slatsFixed: 'feste Lamellen', slatsRot: 'drehbare Lamellen',
      opt: { OPT_POST_HEIGHT: 'Höhere Stützen', OPT_LED_LOUVRES: 'LED-Lichtband in den Lamellen', OPT_LED_GUTTER: 'LED-Licht in der Rinne', OPT_THERMAL: 'Dämmeinlage in den Lamellen', OPT_SENSOR: 'Wettersensoren', OPT_SMART: 'App-Steuerung', OPT_HEATERS: 'Heizstrahler', OPT_HEATER_PREP: 'Vorbereitung für Heizstrahler', OPT_INTERNAL_BOX: 'Innenliegende Elektrobox', OPT_AUDIO: 'Audiosystem', OPT_SOCKET: 'Steckdosen in der Stütze', OPT_SPOTS: 'LED-Spots in den Lamellen', OPT_LAMPS: 'LED-Leuchten in den Lamellen', OPT_CROWN_SPOTS: 'LED-Spots im Rahmen', OPT_VERTICAL_LAMPS: 'LED-Leuchten an den Stützen', OPT_INTERMEDIATE_POST: 'Zusätzliche Stützen' },
      ctl: { CONTROL_PERGOLA_UNIT: 'Steuermodul für die Screens', CONTROL_REMOTE: 'Fernbedienung für die Screens', CONTROL_SMART: 'Smart-Home-Modul', CONTROL_WIND_SENSOR: 'Windsensor für die Screens', CONTROL_SWITCH: 'Wandschalter', CONTROL_PERGOLA_REMOTE_EXTRA: 'Zusätzliche Fernbedienung', CONTROL_CUSTOM: 'Steuerung' },
      coat: 'Farbaufpreis', coatMin: 'Mindermengenzuschlag Beschichtung', fabricS: 'Stoffaufpreis', corner: 'Eckverbindung Lamellenwand', tbdPanels: 'Farbaufpreis Paneele', onRequest: 'auf Anfrage', extra: 'Zuschlag',
      sysName: { S400: 'Pergola', S500: 'Pergola', GLASS: 'Schiebeglas', SCREEN_ZIP: 'ZIP-Screens', VERTO: 'Lamellenwand' },
      mailSubj: (s, p) => `Anfrage Lamellendach ${s} – Richtpreis ${p}`, mailHi: 'Guten Tag,\n\nich interessiere mich für folgende Konfiguration:', mailBye: 'Mit freundlichen Grüßen',
      mm: 'mm',
    },
    en: {
      steps: ['Size', 'Sides', 'Comfort', 'Colours', 'Quote'],
      next: 'Next', back: 'Back', toOffer: 'See quote', send: 'Send request',
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
      legend: { zip: 'Fabric blind in side guides, motorised – sun and privacy protection.', glass: 'Sliding glass panels (Win Glass) – shelter from wind and rain.', verto: 'Fixed aluminium profiles (Win Verto) – privacy, air still flows.', panels: 'Aluminium louvre panels on rails (Win Panels) – slide aside.' },
      sides: { front: 'Front', left: 'Left', right: 'Right', back: 'Back' }, field: 'bay', row: 'row',
      park: 'Glass', parkL: '← left', parkR: 'right →', parkBoth: '↔ open', shut: 'closed',
      cta: 'Tap a ＋ to close a side – ZIP screen, glass or louvre wall', hsOpen: 'Choose side',
      notMade: 'Not available in this size – please choose another option.', later: 'price on request',
      fabric: 'ZIP screen fabric', ofName: { 14: 'Airy, lots of view', 5: 'Sun and privacy', 4: 'Sun and privacy, a little denser', 1: 'Almost opaque', 0: 'Blackout' },
      perM2: '€/m²', zipCtl: 'Operated with the pergola remote control.',
      glassTint: 'Glass', tints: { float: 'Clear', diamant: 'Extra clear', milk: 'Frosted', brown: 'Bronze', graphite: 'Graphite', black: 'Black', mirror: 'Mirror' }, tintNa: '10 mm only',
      s3: 'What makes it cosy?', s3l: 'All optional. Pick only what you will really use – many things are harder to add later.',
      light: 'Light', lightD: 'For evenings outside', lights: { none: 'No light', white: 'LED strip, warm white', rgbw: 'LED strip, colour (RGBW)', spots: 'LED spots' },
      heat: 'Warmth', heatD: 'Heaters under the roof', heats: { none: 'None', 'm1.single': '1 heater 1.5 kW (~10 m²)', 'm1.pair': '2 heaters 1.5 kW', 'm1.double': 'Double heater 4 kW (~25 m²)', other: 'Heater set' },
      weather: 'Weather automation', weatherD: 'Louvres close by themselves', weathers: { none: 'None', wind: 'Wind sensor', rain: 'Rain sensor', set: 'Wind + rain + temperature', multi: 'Multi-sensor incl. snow' },
      app: 'Control', appD: 'A remote control is always included', apps: { none: 'Remote only', bluetooth: 'App via Bluetooth', wifi: 'App via Wi-Fi, also away' },
      audio: 'Music', audioD: '2 speakers, Bluetooth', thermal: 'Quieter in rain', thermalD: 'Insulating insert in the louvres',
      sockets: 'Sockets in the post', socketsD: '230 V', on: 'Yes', off: 'No',
      s4: 'Which colour suits your house?', s4l: 'The two standard colours are included. Other colours add a percentage.',
      frame: 'Frame and posts', roof: 'Louvres', slideCol: 'Glass, louvre wall and panel profiles', zipCol: 'ZIP box and guides', asFrame: 'same as frame', moreColours: 'More colours', groups: { fine: 'Fine texture', smooth: 'Smooth matt', exclusive: 'Exclusive', wood: 'Wood look' },
      fabricTone: 'Fabric shade', colourNote: 'Screen colours are approximate. We show you original samples before you order.',
      s5: 'Your indicative price', s5l: 'Based on catalogue prices ' + CATALOGUE + '. Not binding – the final price follows a site survey.',
      grp: { pergola: 'Pergola', sides: 'Sides', comfort: 'Comfort', colours: 'Colours and surcharges' },
      notIncl: 'Not included', notInclList: ['Delivery and installation', 'Foundations and electrical connection', 'Building permits, if required'],
      incomplete: 'Some items are not available in this size and are not in the price.',
      print: 'Print the quote or save it as PDF', request: 'Send a free request', requestS: 'We will get back to you personally', share: 'Copy link', shareS: 'to share or continue later', copied: 'Link copied',
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
      qTitle: 'Indicative quote', qNo: 'No.', qDate: 'Date', qConfig: 'Your configuration', qPrice: 'Price', qItem: 'Item', qNet: 'Total net', qVat: 'VAT 20 %', qGross: 'Total incl. VAT',
      qFacts: { size: 'Size', mount: 'Mounting', model: 'Model', height: 'Post height', sides: 'Sides', colours: 'Colours', comfort: 'Comfort' },
      qNotes: ['Indicative price based on catalogue prices ' + CATALOGUE + ', not binding.', 'Not included: delivery, installation, foundations, electrical connection, permits.', 'The final price follows a site survey.', 'Screen colours are approximate.'],
      qLink: 'Open the configuration online', none: 'none', open: 'open',
      fam: { S400: 'S400', S500: 'S500', S500_DOUBLE: 'S500 double' }, pergola: 'Louvred roof', panelsW: 'panels', profilesW: 'profiles', slatsFixed: 'fixed slats', slatsRot: 'rotating slats',
      opt: { OPT_POST_HEIGHT: 'Taller posts', OPT_LED_LOUVRES: 'LED strip in the louvres', OPT_LED_GUTTER: 'LED light in the gutter', OPT_THERMAL: 'Insulating insert in the louvres', OPT_SENSOR: 'Weather sensors', OPT_SMART: 'App control', OPT_HEATERS: 'Heaters', OPT_HEATER_PREP: 'Heater preparation', OPT_INTERNAL_BOX: 'Internal electrical box', OPT_AUDIO: 'Audio system', OPT_SOCKET: 'Sockets in the post', OPT_SPOTS: 'LED spots in the louvres', OPT_LAMPS: 'LED lamps in the louvres', OPT_CROWN_SPOTS: 'LED spots in the frame', OPT_VERTICAL_LAMPS: 'LED lights on the posts', OPT_INTERMEDIATE_POST: 'Additional posts' },
      ctl: { CONTROL_PERGOLA_UNIT: 'Control unit for the screens', CONTROL_REMOTE: 'Remote control for the screens', CONTROL_SMART: 'Smart home unit', CONTROL_WIND_SENSOR: 'Wind sensor for the screens', CONTROL_SWITCH: 'Wall switch', CONTROL_PERGOLA_REMOTE_EXTRA: 'Additional remote control', CONTROL_CUSTOM: 'Controls' },
      coat: 'Colour surcharge', coatMin: 'Small-batch coating surcharge', fabricS: 'Fabric surcharge', corner: 'Louvre wall corner joint', tbdPanels: 'Panel colour surcharge', onRequest: 'on request', extra: 'surcharge',
      sysName: { S400: 'pergola', S500: 'pergola', GLASS: 'sliding glass', SCREEN_ZIP: 'ZIP screens', VERTO: 'louvre wall' },
      mailSubj: (s, p) => `Request: louvred roof ${s} – indicative price ${p}`, mailHi: 'Hello,\n\nI am interested in the following configuration:', mailBye: 'Kind regards',
      mm: 'mm',
    },
    ru: {
      steps: ['Размер', 'Стороны', 'Комфорт', 'Цвета', 'Итог'],
      next: 'Далее', back: 'Назад', toOffer: 'К предложению', send: 'Отправить запрос',
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
      legend: { zip: 'Ткань в боковых направляющих, с мотором – от солнца и взглядов.', glass: 'Раздвижные стеклянные полотна (Win Glass) – от ветра и дождя.', verto: 'Неподвижные алюминиевые профили (Win Verto) – от взглядов, воздух проходит.', panels: 'Алюминиевые ламельные панели на направляющих (Win Panels) – сдвигаются.' },
      sides: { front: 'Спереди', left: 'Слева', right: 'Справа', back: 'Сзади' }, field: 'проём', row: 'ряд',
      park: 'Стекло', parkL: '← влево', parkR: 'вправо →', parkBoth: '↔ открыто', shut: 'закрыто',
      cta: 'Нажмите ＋ на стороне, чтобы закрыть её – ZIP-скрин, стекло или ламельная стена', hsOpen: 'Выбрать сторону',
      notMade: 'В таком размере не производится – выберите другой вариант.', later: 'цена по запросу',
      fabric: 'Ткань ZIP-скринов', ofName: { 14: 'Лёгкая, хорошо видно наружу', 5: 'От солнца и взглядов', 4: 'От солнца и взглядов, чуть плотнее', 1: 'Почти непрозрачная', 0: 'Блэкаут' },
      perM2: '€/м²', zipCtl: 'Управление с пульта перголы.',
      glassTint: 'Стекло', tints: { float: 'Прозрачное', diamant: 'Особо прозрачное', milk: 'Матовое', brown: 'Бронза', graphite: 'Графит', black: 'Чёрное', mirror: 'Зеркальное' }, tintNa: 'только 10 мм',
      s3: 'Что сделает уютнее?', s3l: 'Всё по желанию. Выбирайте только то, чем будете пользоваться, – многое потом добавить сложнее.',
      light: 'Свет', lightD: 'Для вечеров на террасе', lights: { none: 'Без света', white: 'LED-лента, тёплый белый', rgbw: 'LED-лента, цветная (RGBW)', spots: 'LED-споты' },
      heat: 'Тепло', heatD: 'Обогреватели под крышей', heats: { none: 'Нет', 'm1.single': '1 обогреватель 1,5 кВт (~10 м²)', 'm1.pair': '2 обогревателя 1,5 кВт', 'm1.double': 'Двойной 4 кВт (~25 м²)', other: 'Комплект обогревателей' },
      weather: 'Автоматика погоды', weatherD: 'Ламели закрываются сами', weathers: { none: 'Нет', wind: 'Датчик ветра', rain: 'Датчик дождя', set: 'Ветер + дождь + температура', multi: 'Мультидатчик со снегом' },
      app: 'Управление', appD: 'Пульт всегда в комплекте', apps: { none: 'Только пульт', bluetooth: 'Приложение по Bluetooth', wifi: 'Приложение по Wi-Fi, и вне дома' },
      audio: 'Музыка', audioD: '2 колонки, Bluetooth', thermal: 'Тише в дождь', thermalD: 'Термовставка в ламелях',
      sockets: 'Розетки в стойке', socketsD: '230 В', on: 'Да', off: 'Нет',
      s4: 'Какой цвет подойдёт к дому?', s4l: 'Два стандартных цвета входят в цену. Другие цвета – доплата в процентах.',
      frame: 'Рама и стойки', roof: 'Ламели', slideCol: 'Профили стекла, ламельной стены, панелей', zipCol: 'Короб и направляющие ZIP', asFrame: 'как рама', moreColours: 'Другие цвета', groups: { fine: 'Мелкая структура', smooth: 'Гладкий мат', exclusive: 'Эксклюзив', wood: 'Под дерево' },
      fabricTone: 'Оттенок ткани', colourNote: 'Цвета на экране приблизительные. Перед заказом покажем оригинальные образцы.',
      s5: 'Ваша ориентировочная цена', s5l: 'По каталожным ценам ' + CATALOGUE + '. Без обязательств – окончательная цена после замера на месте.',
      grp: { pergola: 'Пергола', sides: 'Стороны', comfort: 'Комфорт', colours: 'Цвета и доплаты' },
      notIncl: 'Не входит в цену', notInclList: ['Доставка и монтаж', 'Фундамент и подключение электричества', 'Разрешения, если нужны'],
      incomplete: 'Некоторые позиции в таком размере не производятся и не вошли в цену.',
      print: 'Распечатать или сохранить PDF', request: 'Отправить запрос без обязательств', requestS: 'Мы свяжемся с вами лично', share: 'Копировать ссылку', shareS: 'чтобы поделиться или продолжить позже', copied: 'Ссылка скопирована',
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
      qTitle: 'Предварительное предложение', qNo: '№', qDate: 'Дата', qConfig: 'Ваша конфигурация', qPrice: 'Цена', qItem: 'Позиция', qNet: 'Итого без НДС', qVat: 'НДС 20 %', qGross: 'Итого с НДС',
      qFacts: { size: 'Размер', mount: 'Установка', model: 'Модель', height: 'Высота стоек', sides: 'Стороны', colours: 'Цвета', comfort: 'Комфорт' },
      qNotes: ['Ориентировочная цена по каталогу ' + CATALOGUE + ', без обязательств.', 'Не входит: доставка, монтаж, фундамент, подключение электричества, разрешения.', 'Окончательная цена – после замера на месте.', 'Цвета на экране приблизительные.'],
      qLink: 'Открыть конфигурацию онлайн', none: 'нет', open: 'открыто',
      fam: { S400: 'S400', S500: 'S500', S500_DOUBLE: 'S500 двойная' }, pergola: 'Пергола с ламелями', panelsW: 'полотен', profilesW: 'профилей', slatsFixed: 'неподвижные ламели', slatsRot: 'поворотные ламели',
      opt: { OPT_POST_HEIGHT: 'Стойки выше стандарта', OPT_LED_LOUVRES: 'LED-лента в ламелях', OPT_LED_GUTTER: 'LED-подсветка в желобе', OPT_THERMAL: 'Термовставка в ламелях', OPT_SENSOR: 'Датчики погоды', OPT_SMART: 'Управление со смартфона', OPT_HEATERS: 'Обогреватели', OPT_HEATER_PREP: 'Подготовка под обогреватели', OPT_INTERNAL_BOX: 'Внутренний короб', OPT_AUDIO: 'Аудиосистема', OPT_SOCKET: 'Розетки в стойке', OPT_SPOTS: 'LED-споты в ламелях', OPT_LAMPS: 'LED-лампы в ламелях', OPT_CROWN_SPOTS: 'LED-споты в раме', OPT_VERTICAL_LAMPS: 'Светильники на стойках', OPT_INTERMEDIATE_POST: 'Дополнительные стойки' },
      ctl: { CONTROL_PERGOLA_UNIT: 'Блок управления скринами', CONTROL_REMOTE: 'Пульт для скринов', CONTROL_SMART: 'Блок умного дома', CONTROL_WIND_SENSOR: 'Датчик ветра для скринов', CONTROL_SWITCH: 'Настенный выключатель', CONTROL_PERGOLA_REMOTE_EXTRA: 'Дополнительный пульт', CONTROL_CUSTOM: 'Управление' },
      coat: 'Доплата за цвет', coatMin: 'Минимальная партия покраски', fabricS: 'Доплата за ткань', corner: 'Угловое соединение ламельной стены', tbdPanels: 'Доплата за цвет панелей', onRequest: 'по запросу', extra: 'доплата',
      sysName: { S400: 'перголы', S500: 'перголы', GLASS: 'стекла', SCREEN_ZIP: 'ZIP-скринов', VERTO: 'ламельной стены' },
      mailSubj: (s, p) => `Запрос: пергола ${s} – ориентировочно ${p}`, mailHi: 'Здравствуйте!\n\nМеня интересует такая конфигурация:', mailBye: 'С уважением',
      mm: 'мм',
    },
  };

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
  let step = 0, focusId = null, resumeOffer = null, form = { name: '', email: '', phone: '', place: '', when: 0, mount: true, visit: true, msg: '' }, formErr = {}, sentOk = false;
  const isCust = () => document.body.classList.contains('cust');
  const curOpt = () => state.options[state.optIndex];
  const sysOf = (o) => (o.family === 'S400' ? 'S400' : 'S500');
  const opsOf = (o) => (o ? openings(o, SPEC[sysOf(o)]) : []);
  const toast = (msg) => { const d = document.createElement('div'); d.className = 'f-toast'; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 1800); };

  /* ---------- configuration <-> link / storage ---------- */
  const KEYS = ['mount', 'width', 'depth', 'louvres', 'optIndex', 'fills', 'glass', 'glassOf', 'glassCfg', 'zipFab', 'zipCtl', 'po', 'colors', 'brand', 'panelOpt', 'wind', 'remote'];
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
    state.colors = { construction: '04', roof: null, slide: null, zip: null, fabric: 'soltis-7635', tone: '#3a3d40', ...(s.colors || {}) };
    if (!cat.fabrics.collections.some((f) => f.id === state.colors.fabric)) state.colors.fabric = 'soltis-7635';
    $('w').value = state.width; $('d').value = state.depth;
    $('mt-wall').setAttribute('aria-pressed', state.mount === 'wall'); $('mt-free').setAttribute('aria-pressed', state.mount === 'free');
    $('louv-dir').setAttribute('aria-pressed', state.louvres === 'perpendicular');
    const idx = s.optIndex || 0;
    recompute(false);
    if (idx && idx < state.options.length) choose(idx);
    applyColors(); renderColors(); syncGlassControls(); applyAnim();
  }
  function choose(i) {
    state.optIndex = i;
    document.querySelectorAll('.opt').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.i) === i)));
    build(); setView('iso'); renderEstimate(); renderColors(); renderPergolaOptions();
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
  const sideAmount = (id) => q().lines.filter((l) => l.id === id && l.a).reduce((s, l) => s + l.a, 0);
  function sideLabel(id, o) {
    const [side, i] = id.split('-'), n = Number(i);
    let s = L().sides[side];
    if ((side === 'front' || side === 'back') && o && o.cols > 1) s += ' · ' + L().field + ' ' + (n + 1);
    if ((side === 'left' || side === 'right') && o && o.rows > 1) s += ' · ' + L().row + ' ' + (n + 1);
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
      if (l.k === 'module') out.push({ g: 'pergola', t: `${t.pergola} ${t.fam[l.fam]}`, d: sz(l.w, l.d), a: l.a });
      else if (l.k === 'moduleExtra') out.push({ g: 'pergola', t: `${t.pergola} – ${t.extra}`, d: '', a: l.a });
      else if (l.k === 'opt') {
        let d = '';
        const p = l.p || {};
        if (l.code === 'OPT_POST_HEIGHT') d = `≤ ${metres(p.height)} ${t.m}`;
        if (l.code === 'OPT_HEATERS') d = (t.heats[p.set] || t.heats.other) + (p.qty > 1 ? ' × ' + p.qty : '');
        if (l.code === 'OPT_SENSOR') d = t.weathers[p.sensor] || '';
        if (l.code === 'OPT_SMART') d = t.apps[p.unit] || '';
        if (l.code === 'OPT_LED_LOUVRES') d = p.colour === 'white' ? t.lights.white : p.colour === 'rgbw' ? t.lights.rgbw : 'RGB';
        if (l.code === 'OPT_SOCKET') d = (p.kind === 'usb' ? 'USB' : '230 V') + ' × ' + p.qty;
        if (l.code === 'OPT_INTERMEDIATE_POST') d = '× ' + p.qty;
        const g = ['OPT_POST_HEIGHT', 'OPT_INTERMEDIATE_POST'].includes(l.code) ? 'pergola' : 'comfort';
        out.push({ g, t: t.opt[l.code] || l.code, d, a: l.a });
      } else if (l.k === 'glass') out.push({ g: 'sides', t: `${t.fills.glass} – ${sideLabel(l.id, o)}`, d: `${sz(l.w, l.h)} · ${l.panels} ${t.panelsW} · ${t.tints[l.glazing]} ${l.thick} mm`, a: l.a });
      else if (l.k === 'zip') { const f = cat.fabrics.collections.find((x) => x.id === l.fabric); out.push({ g: 'sides', t: `${t.fills.zip} – ${sideLabel(l.id, o)}`, d: `${sz(l.w, l.h)} · ${f ? f.name + ' (OF ' + f.openness + ' %)' : ''}`, a: l.a }); }
      else if (l.k === 'verto') out.push({ g: 'sides', t: `${t.fills.verto} – ${sideLabel(l.id, o)}`, d: `${sz(l.w, l.h)} · ${l.profiles} ${t.profilesW}`, a: l.a });
      else if (l.k === 'panels') out.push({ g: 'sides', t: `${t.fills.panels} – ${sideLabel(l.id, o)}`, d: `${sz(l.w, l.h)} · ${l.slats === 'fixed' ? t.slatsFixed : t.slatsRot}`, a: l.a });
      else if (l.k === 'unbuilt') out.push({ g: 'sides', t: `${t.fills[l.fill]} – ${sideLabel(l.id, o)}`, d: t.notMade, a: null });
      else if (l.k === 'pending') out.push({ g: 'sides', t: `${t.fills[l.fill]} – ${sideLabel(l.id, o)}`, d: t.later, a: null });
      else if (l.k === 'corner') out.push({ g: 'sides', t: t.corner + (l.n > 1 ? ' × ' + l.n : ''), d: '', a: l.a });
      else if (l.k === 'fabric') out.push({ g: 'sides', t: `${t.fabricS} ${l.name}`, d: `OF ${l.of} %`, a: l.a });
      else if (l.k === 'control') out.push({ g: 'sides', t: t.ctl[l.code] || l.name, d: l.qty > 1 ? '× ' + l.qty : '', a: l.a });
      else if (l.k === 'coat') out.push({ g: 'colours', t: `${t.coat} ${t.sysName[l.sys]} (${l.pct} %)`, d: '', a: l.a });
      else if (l.k === 'coatMin') out.push({ g: 'colours', t: t.coatMin, d: '', a: l.a });
      else if (l.k === 'tbd') out.push({ g: 'colours', t: t.tbdPanels, d: t.onRequest, a: null });
    }
    return out;
  }
  const groupsOrder = ['pergola', 'sides', 'comfort', 'colours'];

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
    const head = `<div class="f-head"><span class="f-brand">${esc(OFFICE.name)}</span><span class="sp"></span>
      <span class="f-lang" role="group" aria-label="Language">${Object.keys(T).map((k) => `<button type="button" data-lang="${k}" aria-pressed="${k === lang}">${k.toUpperCase()}</button>`).join('')}</span>
      <button type="button" class="f-pro" data-mode="pro" title="${esc(t.proTitle)}">${t.pro}</button></div>`;
    const steps = `<ol class="f-steps">${t.steps.map((s, i) => `<li><button type="button" data-step="${i}" ${i === step ? 'aria-current="step"' : ''} data-done="${i < step}"><span class="n">${i + 1}</span>${esc(s)}</button></li>`).join('')}</ol>`;
    const body = [stepSize, stepSides, stepComfort, stepColours, stepOffer][step](t, o);
    F.innerHTML = head + steps + `<div class="f-body">${body}</div>` + bar(t, o);
    if (focusId && step === 1) { const el = F.querySelector(`[data-side="${focusId}"]`); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    renderHotspots();
  }
  function bar(t, o) {
    const total = q().total, ok = !!o && total > 0;
    const price = ok ? `<b>${q().incomplete ? t.from + ' ' : ''}${fe(gross(total))}</b><span>${t.gross}<span class="nt"> · ${t.net} ${fe(total)}</span></span>` : `<b>—</b><span>${t.priceNa}</span>`;
    const nextLabel = step === 3 ? t.toOffer : step === 4 ? t.send : t.next + ': ' + t.steps[step + 1];
    return `<div class="f-bar"><div class="p" id="f-price">${price}</div>${step > 0 ? `<button type="button" class="back" data-go="-1">${t.back}</button>` : '<span></span>'}<button type="button" class="next" data-go="${step === 4 ? 'form' : '1'}" ${ok ? '' : 'disabled'}>${esc(nextLabel)}${step < 4 ? ' →' : ''}</button></div>`;
  }

  /* step 1: size */
  function stepSize(t, o) {
    const wall = state.mount === 'wall';
    let h = resumeOffer ? `<div class="f-resume"><span>${t.resume}</span><span><button type="button" class="f-link" data-resume="yes">${t.resumeYes}</button> · <button type="button" class="f-link" data-resume="no">${t.resumeNo}</button></span></div>` : '';
    h += `<p class="f-lead" style="margin-top:0">${t.intro}</p><h2>${t.s1}</h2><p class="f-lead">${t.s1l}</p>`;
    h += `<div class="f-cards">
      <button type="button" class="f-card" data-mount="wall" aria-pressed="${wall}">${ICON.wall}<b>${t.wall}</b><span class="d">${t.wallD}</span></button>
      <button type="button" class="f-card" data-mount="free" aria-pressed="${!wall}">${ICON.free}<b>${t.free}</b><span class="d">${t.freeD}</span></button></div>`;
    const dim = (k, label, v) => `<div class="f-dim"><label for="f-${k}">${label}, ${t.m}</label><div class="f-step"><button type="button" data-nudge="${k}" data-d="-100" aria-label="−">−</button><input id="f-${k}" type="number" inputmode="decimal" step="0.1" min="1" value="${(v / 1000).toFixed(2)}" data-dim="${k}"><button type="button" data-nudge="${k}" data-d="100" aria-label="+">+</button></div></div>`;
    h += `<div class="f-h3"><span>${t.width} × ${t.depth}</span></div><div class="f-dims">${dim('w', wall ? t.widthWall : t.width, state.width)}${dim('d', wall ? t.depthWall : t.depth, state.depth)}</div>`;
    const presets = [[3000, 3000], [4000, 3000], [5000, 3500], [6500, 3500], [8000, 4000]];
    h += `<div class="f-h3"><span>${t.presets}</span></div><div class="f-chips">${presets.map(([w, d]) => `<button type="button" class="f-chip" data-preset="${w}x${d}" aria-pressed="${state.width === w && state.depth === d}">${metres(w).replace(/,00|\.00/, '')} × ${metres(d).replace(/,00|\.00/, '')} ${t.m}</button>`).join('')}</div>`;
    // size problems: plain-language fix buttons
    const r = DBCore.compose({ mount: state.mount, width: state.width, depth: state.depth, louvres: state.louvres }, cat);
    for (const s of r.suggestions) h += `<div class="f-note">${t.sugg[s.code] || s.code}${s.params && s.params.suggested ? ` <button type="button" class="f-link" data-fix="${s.code}" data-v="${s.params.suggested}">${t.suggFix(metres(s.params.suggested))}</button>` : ''}</div>`;
    if (!o) return h;
    // post height
    const s500 = o.family !== 'S400', hs = s500 ? [2800, 3200] : [2800, 3000, 3200];
    h += `<div class="f-h3"><span>${t.height}</span></div><div class="f-chips">${hs.map((x) => { const d = optDelta({ postHeight: x }); return `<button type="button" class="f-chip" data-h="${x}" aria-pressed="${state.po.postHeight === x}">≤ ${metres(x)} ${t.m}${x === 2800 ? ' · ' + t.heightStd : ''}<span class="pr">${plusE(d)}</span></button>`; }).join('')}</div>`;
    // layout: recommended first, alternatives folded away
    const opts = state.options, cheapest = opts[0].total;
    const lay = (x, i) => {
      const widths = x.modules.filter((m) => m.row === 0).map((m) => metres(m.width)).join(' + ');
      return `<button type="button" data-opt="${i}" aria-pressed="${i === state.optIndex}"><span><b>${t.modules(x.modules.length)}</b>${i === 0 ? `<span class="f-badge">${t.cheapest}</span>` : ''}<span class="m">${widths} ${t.m} · ${t.fam[x.family]} · ${t.posts(x.posts)}</span></span><span class="pr">${i === 0 ? fe(gross(x.total)) : '+' + fe(gross(x.total - cheapest))}</span></button>`;
    };
    h += `<div class="f-h3"><span>${t.layout}</span></div><div class="f-lay">${lay(opts[0], 0)}${state.optIndex > 0 ? lay(opts[state.optIndex], state.optIndex) : ''}</div>`;
    const rest = opts.map((x, i) => [x, i]).filter(([, i]) => i !== 0 && i !== state.optIndex);
    if (rest.length) h += `<details class="f-more"><summary>${t.otherLayouts(rest.length)}</summary><div class="f-lay" style="margin-top:6px">${rest.map(([x, i]) => lay(x, i)).join('')}</div></details>`;
    if (o.width !== state.width) h += `<div class="f-note">${t.snapped(metres(o.width), metres(state.width))}</div>`;
    if (o.depth !== state.depth) h += `<div class="f-note">${t.snapped(metres(o.depth), metres(state.depth))}</div>`;
    if (o.issues.some((i) => i.code === 'MULTI_ROW_ASSUMPTION')) h += `<div class="f-note">${t.multiRow}</div>`;
    // louvre direction: offer the cheaper one, explain the current one
    const other = state.louvres === 'parallel' ? 'perpendicular' : 'parallel';
    const alt = DBCore.compose({ mount: state.mount, width: state.width, depth: state.depth, louvres: other }, cat).options[0];
    const dirTxt = state.louvres === 'parallel' ? (wall ? t.louvPar : t.louvParF) : (wall ? t.louvPerp : t.louvPerpF);
    const dirName = (k) => { const s = k === 'parallel' ? (wall ? t.louvPar : t.louvParF) : (wall ? t.louvPerp : t.louvPerpF); return s.charAt(0).toUpperCase() + s.slice(1); };
    const dirPrice = (k) => (k === state.louvres ? cheapest : alt ? alt.total : null);
    h += `<div class="f-h3"><span>${t.louvDir}</span><span style="text-transform:none;letter-spacing:0;font-weight:400">${t.louvNow(dirTxt)}</span></div><div class="f-chips">${['parallel', 'perpendicular'].map((k) => { const pr = dirPrice(k); return `<button type="button" class="f-chip" data-louv="${k}" aria-pressed="${state.louvres === k}" ${pr == null ? 'disabled' : ''}><span aria-hidden="true">${k === 'parallel' ? '⇆' : '⇅'}</span>${dirName(k)}<span class="pr">${pr == null ? t.louvNa : fe(gross(pr))}</span></button>`; }).join('')}</div>`;
    if (alt && alt.total < cheapest - 1) h += `<div class="f-tip"><span>${t.louvTip(fe(gross(cheapest - alt.total)))}</span><button type="button" class="f-chip" data-louv="${other}">${t.louvDo}</button></div>`;
    return h;
  }

  /* step 2: sides */
  function stepSides(t, o) {
    if (!o) return '';
    const ops = opsOf(o);
    let h = `<h2>${t.s2}</h2><p class="f-lead">${t.s2l}</p>`;
    h += `<div class="f-h3"><span>${t.allSides}</span></div><div class="f-chips" style="margin-bottom:12px">${['none', 'zip', 'glass'].map((f) => `<button type="button" class="f-chip" data-all="${f}" aria-pressed="${ops.every((x) => (state.fills[x.id] || 'none') === f)}">${GL[f]} ${t.fills[f]}</button>`).join('')}</div>`;
    h += `<div class="f-sides">`;
    for (const op of ops) {
      const f = state.fills[op.id] || 'none', amt = sideAmount(op.id), bad = q().lines.some((l) => l.k === 'unbuilt' && l.id === op.id);
      h += `<div class="f-side${focusId === op.id ? ' hl' : ''}" data-side="${op.id}"><div class="top"><span class="nm">${sideLabel(op.id, o)}<small>${metres(Math.round(op.len * 1000))} ${t.m}</small></span><span class="pr">${f === 'none' ? '' : bad ? '—' : '+' + fe(gross(amt))}</span></div>
        <div class="f-fills" role="group">${['none', 'zip', 'glass', 'verto', 'panels'].map((k) => `<button type="button" data-fill="${k}" data-id="${op.id}" aria-pressed="${f === k}"><span class="g">${GL[k]}</span>${t.fillsS[k]}</button>`).join('')}</div>`;
      if (f === 'glass' && !bad) {
        const g = glassFor(op), dbl = g.best && g.best.opening === 'double', cfg = glassCfg(op), side = cfg.side || state.glassSide;
        const isOpen = (cfg.open ?? state.glassOpen) > 0;
        const gb = (v, label, cur) => `<button type="button" class="f-chip" data-gpos="${v}" data-id="${op.id}" aria-pressed="${cur}">${label}</button>`;
        h += `<div class="sub2">${t.park}: ${dbl
          ? gb('close', '○ ' + t.shut, !isOpen) + gb('both', t.parkBoth, isOpen)
          : gb('left', t.parkL, isOpen && side === 'left') + gb('close', '○ ' + t.shut, !isOpen) + gb('right', t.parkR, isOpen && side === 'right')}</div>`;
      }
      if (bad) h += `<div class="bad">${t.notMade}</div>`;
      h += `</div>`;
    }
    h += `</div>`;
    const used = new Set(ops.map((x) => state.fills[x.id]).filter(Boolean));
    if (used.has('zip')) {
      const curOf = fabricOf().openness;
      h += `<div class="f-h3"><span>${t.fabric}</span></div><div class="f-chips f-list">${opennessList().map((of) => {
        const cheapestF = cat.fabrics.collections.filter((f) => f.openness === of).sort((a, b) => a.eurPerM2 - b.eurPerM2)[0];
        return `<button type="button" class="f-chip" data-of="${of}" aria-pressed="${curOf === of}">${of} % · ${esc(t.ofName[of] || '')}<span class="pr">${cheapestF && cheapestF.eurPerM2 ? '+' + cheapestF.eurPerM2 + ' ' + t.perM2 : t.incl}</span></button>`;
      }).join('')}</div><p class="f-lead" style="margin:6px 0 0;font-size:12.5px">${t.zipCtl}</p>`;
    }
    if (used.has('glass')) {
      h += `<div class="f-h3"><span>${t.glassTint}</span></div><div class="f-sw">${Object.entries(GLAZING).map(([k, g]) => {
        const rate = cat.glazing.types.find((x) => x.id === k).surcharge[String(DBCore.thicknessFor(k, cat))];
        return `<button type="button" data-gl="${k}" aria-pressed="${state.glass.type === k}"><span class="c" style="background:#${g.col.toString(16).padStart(6, '0')};opacity:${Math.max(0.35, g.op + 0.25)}"></span>${t.tints[k]}<span class="pr">${rate ? '+' + rate + ' ' + t.perM2 : t.incl}</span></button>`;
      }).join('')}</div>`;
    }
    const legend = ['zip', 'glass', 'verto', 'panels'].map((k) => `<li><b>${GL[k]} ${t.fills[k]}</b> – ${t.legend[k]}</li>`).join('');
    h += `<ul class="f-legend">${legend}</ul>`;
    return h;
  }

  /* step 3: comfort */
  function stepComfort(t, o) {
    if (!o) return '';
    const po = state.po, s500 = o.family !== 'S400';
    // longer choices are a list (one row each, text left, price right); yes/no and counts stay short chips
    const card = (title, desc, chips, list = true) => `<div class="f-h3"><span>${title}</span><span style="text-transform:none;letter-spacing:0;font-weight:400">${desc}</span></div><div class="f-chips${list ? ' f-list' : ''}">${chips}</div>`;
    const chip = (attr, cur, label, delta) => `<button type="button" class="f-chip" ${attr} aria-pressed="${cur}">${esc(label)}${delta !== undefined ? `<span class="pr">${plusE(delta)}</span>` : ''}</button>`;
    const lightCur = po.ledLouvres ? po.ledLouvres.colour : po.spots ? 'spots' : 'none';
    const LIGHT = { none: null, white: { ledLouvres: { colour: 'white', louvres: 5 } }, rgbw: { ledLouvres: { colour: 'rgbw', louvres: 5 } }, spots: { spots: { perLouvre: 3, louvres: 5 } } };
    let h = `<h2>${t.s3}</h2><p class="f-lead">${t.s3l}</p>`;
    h += card(t.light, t.lightD, Object.entries(LIGHT).map(([k, p]) => chip(`data-light="${k}"`, lightCur === k, t.lights[k], p ? optDelta(p) : undefined)).join(''));
    const heaters = cat.optionScalars.heaters[s500 ? 's500' : 's400'].sets.map((x) => x.id);
    const heatList = ['m1.single', 'm1.pair', 'm1.double'].filter((k) => heaters.includes(k));
    const heatCur = po.heaters ? po.heaters.set : 'none';
    if (heatCur !== 'none' && !heatList.includes(heatCur)) heatList.push(heatCur);
    h += card(t.heat, t.heatD, chip('data-heat="none"', heatCur === 'none', t.heats.none) + heatList.map((k) => chip(`data-heat="${k}"`, heatCur === k, t.heats[k] || t.heats.other, optDelta({ heaters: { set: k, qty: 1 } }))).join(''));
    h += card(t.weather, t.weatherD, ['none', 'wind', 'set', 'multi'].map((k) => chip(`data-sensor="${k}"`, (po.sensors || 'none') === k, t.weathers[k], k === 'none' ? undefined : optDelta({ sensors: k }))).join(''));
    h += card(t.app, t.appD, ['none', 'bluetooth', 'wifi'].map((k) => chip(`data-smart="${k}"`, (po.smart || 'none') === k, t.apps[k], k === 'none' ? undefined : optDelta({ smart: k }))).join(''));
    h += card(t.thermal, t.thermalD, chip('data-thermal="0"', !po.thermal, t.off) + chip('data-thermal="1"', !!po.thermal, t.on, optDelta({ thermal: true })), false);
    h += card(t.audio, t.audioD, chip('data-audio="0"', !po.audio, t.off) + chip('data-audio="1"', !!po.audio, t.on, optDelta({ audio: 1 })), false);
    if (s500) h += card(t.sockets, t.socketsD, [0, 1, 2, 4].map((n) => chip(`data-sock="${n}"`, po.sockets.power === n, n ? '× ' + n : t.off, n ? optDelta({ sockets: { power: n, usb: 0 } }) : undefined)).join(''), false);
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
    if (fills.some((f) => f === 'glass' || f === 'verto' || f === 'panels')) rows.push(['slide', t.slideCol]);
    if (fills.includes('zip')) rows.push(['zip', t.zipCol]);
    const pct = (key, g) => {
      if (key === 'slide') return cat.coating.rates.GLASS[g] || 0;
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
    h += `<div class="f-h3"><span>${t.notIncl}</span></div><ul class="f-incl">${t.notInclList.map((x) => `<li>${x}</li>`).join('')}</ul>`;
    h += `<div class="f-actions">
      <button type="button" class="f-btn primary" data-act="form">${t.request}<small>${t.requestS}</small></button>
      <button type="button" class="f-btn" data-act="print">${t.print}</button>
      <div class="f-row2"><button type="button" class="f-btn" data-act="share">${t.share}</button><button type="button" class="f-btn" data-act="save">${t.saveFile}</button></div>
      <button type="button" class="f-link" data-act="open" style="justify-self:start">${t.openFile}</button><input type="file" id="f-file" accept="application/json,.json" hidden></div>`;
    h += formHtml(t);
    h += `<div class="f-h3" style="margin-top:22px"><span>${t.faqT}</span></div><div class="f-faq">${t.faq.map(([qq, a]) => `<details><summary>${qq}</summary><p>${a}</p></details>`).join('')}</div>`;
    return h;
  }
  function formHtml(t) {
    if (sentOk) return `<div class="f-done" id="f-form"><b>${t.sentT}</b><p style="margin:6px 0 8px">${t.sent}</p><div style="display:flex;gap:14px;flex-wrap:wrap"><button type="button" class="f-link" data-act="reopen">${t.reopen}</button><button type="button" class="f-link" data-act="copytext">${t.noMail}</button></div></div>`;
    const err = (k) => formErr[k] ? `<span class="err">${formErr[k]}</span>` : '';
    return `<form class="f-form" id="f-form" novalidate><div class="f-h3" style="margin:22px 0 0"><span>${t.formT}</span></div>
      <label>${t.name}<input type="text" name="name" autocomplete="name" value="${esc(form.name)}">${err('name')}</label>
      <label>${t.email}<input type="email" name="email" autocomplete="email" value="${esc(form.email)}">${err('email')}</label>
      <label>${t.phone}<input type="tel" name="phone" autocomplete="tel" value="${esc(form.phone)}"></label>
      <label>${t.place}<input type="text" name="place" autocomplete="postal-code" value="${esc(form.place)}">${err('place')}</label>
      <label>${t.when}<select name="when">${t.whens.map((w, i) => `<option value="${i}" ${form.when === i ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" name="mount" ${form.mount ? 'checked' : ''}> ${t.wantMount}</label>
      <label class="chk"><input type="checkbox" name="visit" ${form.visit ? 'checked' : ''}> ${t.wantVisit}</label>
      <label>${t.msg}<textarea name="msg">${esc(form.msg)}</textarea></label>
      <p class="f-priv">${t.privacy}</p>
      <button type="submit" class="f-btn primary">${t.sendBtn}</button></form>`;
  }

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
    parts.push('', `${t.qLink}: ${shareUrl()}`, '', t.mailBye, form.name);
    return parts.join('\n');
  }
  let lastMailto = '';
  function openMail() { window.__lastMailto = lastMailto; const a = document.createElement('a'); a.href = lastMailto; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
  function sendRequest() {
    const t = L(); formErr = {};
    if (!form.name.trim()) formErr.name = t.required;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) formErr.email = form.email.trim() ? t.badEmail : t.required;
    // postcode / town: optional for now
    if (Object.keys(formErr).length) { render(); const f = F.querySelector('#f-form'); if (f) f.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const subj = t.mailSubj(sizeText(), (q().incomplete ? t.from + ' ' : '') + fe(gross(q().total)));
    lastMailto = `mailto:${OFFICE.email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(mailText())}`;
    openMail();
    sentOk = true; render();
  }
  const copy = (txt, msg) => { (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast(msg), () => { window.prompt('', txt); }); };
  function quoteNo() { const d = new Date(), s = enc(snapshot()); let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return 'DB-' + String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + (h % 46656).toString(36).toUpperCase().padStart(3, '0'); }
  function snapshotImage() {
    const pos = camera.position.clone(), tgt = controls.target.clone(), lv = lastView, um = userMoved;
    try { setView('iso'); renderer.render(scene, camera); return renderer.domElement.toDataURL('image/jpeg', 0.9); }
    catch (e) { return ''; }
    finally { camera.position.copy(pos); controls.target.copy(tgt); controls.update(); lastView = lv; userMoved = um; }
  }
  function buildQuote() {
    const t = L(), o = curOpt(), lines = quoteLines(), total = q().total, e = colorsEff();
    const ops = opsOf(o).filter((x) => state.fills[x.id] && state.fills[x.id] !== 'none');
    const comfort = lines.filter((l) => l.g === 'comfort').map((l) => l.t).join(', ') || t.none;
    const facts = [
      [t.qFacts.size, `${sizeText()} · ${state.mount === 'wall' ? t.wall : t.free}`],
      [t.qFacts.model, `${t.pergola} ${t.fam[o.family]} · ${t.modules(o.modules.length)} (${o.modules.filter((m) => m.row === 0).map((m) => metres(m.width)).join(' + ')} ${t.m}) · ${t.posts(o.posts)}`],
      [t.qFacts.height, `≤ ${metres(state.po.postHeight)} ${t.m}`],
      [t.qFacts.sides, ops.length ? ops.map((x) => `${sideLabel(x.id, o)}: ${t.fills[state.fills[x.id]]}`).join('; ') : t.open],
      [t.qFacts.colours, `${t.frame}: ${cname(e.construction)}${state.colors.roof ? '; ' + t.roof + ': ' + cname(e.roof) : ''}`],
      [t.qFacts.comfort, comfort],
    ];
    const img = snapshotImage(), date = new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : lang === 'ru' ? 'ru-RU' : 'de-AT');
    const rows = lines.map((l) => `<tr><td>${esc(l.t)}${l.d ? `<span class="s">${esc(l.d)}</span>` : ''}</td><td class="a">${l.a == null ? '—' : fe(l.a)}</td></tr>`).join('');
    const contact = [OFFICE.email, OFFICE.phone, OFFICE.web].filter(Boolean).join(' · ');
    return `<div class="q"><div class="hdr"><div><div class="brand">${esc(OFFICE.name)}</div>${contact ? `<div style="font-size:9pt;color:#444">${esc(contact)}</div>` : ''}</div><div class="meta"><h1>${t.qTitle}</h1>${t.qNo} ${quoteNo()} · ${t.qDate} ${date}</div></div>
      ${img ? `<img src="${img}" alt="">` : ''}
      <h2>${t.qConfig}</h2><table class="facts"><tbody>${facts.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</tbody></table>
      <div><h2>${t.qPrice}</h2><table><thead><tr><th>${t.qItem}</th><th class="a">${t.net}</th></tr></thead><tbody>${rows}
        <tr class="sumrow"><td style="padding-top:8px">${t.qNet}</td><td class="a" style="padding-top:8px">${fe(total)}</td></tr>
        <tr class="sumrow"><td>${t.qVat}</td><td class="a">${fe(total * VAT)}</td></tr>
        <tr class="tot"><td>${t.qGross}${q().incomplete ? ' (' + t.from + ')' : ''}</td><td class="a">${fe(gross(total))}</td></tr></tbody></table></div>
      <ul class="notes">${t.qNotes.map((n) => `<li>${n}</li>`).join('')}${q().incomplete ? `<li>${t.incomplete}</li>` : ''}</ul>
      <div class="foot"><a href="${esc(shareUrl())}">${t.qLink}</a> · ${quoteNo()}</div></div>`;
  }
  function printQuote() {
    $('quote').innerHTML = buildQuote();
    document.body.classList.add('printing');
    const done = () => { document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    setTimeout(() => window.print(), 60);
  }
  function saveFile() {
    const blob = new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `pergola-${quoteNo()}.json`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ---------- actions ---------- */
  const rebuild = () => { syncGlassControls(); build(); renderEstimate(); renderPergolaOptions(); };
  function go(d) { step = Math.max(0, Math.min(4, step + d)); focusId = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); if (step === 1) setView('iso'); }
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
  F.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b || !F.contains(b)) return;
    if (!b.dataset.step && !b.dataset.go && !b.dataset.lang) dirty = true;
    const d = b.dataset, o = curOpt();
    if (d.lang) { setLang(d.lang); return; }
    if (d.mode) { setMode(d.mode); return; }
    if (d.step !== undefined) { step = Number(d.step); focusId = null; render(); return; }
    if (d.go) { if (d.go === 'form') { const f = F.querySelector('#f-form'); if (f) { f.scrollIntoView({ block: 'start', behavior: 'smooth' }); const i = f.querySelector('input'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 400); } return; } go(Number(d.go)); return; }
    if (d.resume) { const s = resumeOffer; resumeOffer = null; if (d.resume === 'yes' && s) restore(s); else { dirty = true; render(); persist(); } return; }
    if (d.mount) { setMount(d.mount); return; }
    if (d.nudge) { const k = d.nudge, v = (k === 'w' ? state.width : state.depth) + Number(d.d); if (k === 'w') setDims(v, state.depth); else setDims(state.width, v); return; }
    if (d.preset) { const [w, dd] = d.preset.split('x').map(Number); setDims(w, dd); return; }
    if (d.fix) { if (d.fix.startsWith('DEPTH')) setDims(state.width, Number(d.v)); else setDims(Number(d.v), state.depth); return; }
    if (d.h) { state.po.postHeight = Number(d.h); rebuild(); return; }
    if (d.opt !== undefined) { choose(Number(d.opt)); return; }
    if (d.louv) { if (d.louv === state.louvres) return; state.louvres = d.louv; $('louv-dir').setAttribute('aria-pressed', state.louvres === 'perpendicular'); keepCamera(() => recompute(false)); return; }
    if (d.fill) { if (d.fill === 'none') delete state.fills[d.id]; else state.fills[d.id] = d.fill; focusId = d.id; rebuild(); applyAnim(); return; }
    if (d.all) { for (const x of opsOf(o)) { if (d.all === 'none') delete state.fills[x.id]; else state.fills[x.id] = d.all; } rebuild(); applyAnim(); return; }
    if (d.gpos) { // the glass slides to the chosen side, or closes the opening
      const op = openingById(d.id);
      if (op) { setCfg(op, d.gpos === 'close' ? { open: 0 } : d.gpos === 'both' ? { open: 100 } : { side: d.gpos, open: 100 }); build(); applyAnim(); render(); }
      return;
    }
    if (d.of) { state.colors.fabric = fabricForOpenness(Number(d.of)); for (const k of Object.keys(state.zipFab)) delete state.zipFab[k]; applyColors(); renderColors(); renderEstimate(); return; }
    if (d.gl) { state.glass.type = d.gl; for (const k of Object.keys(state.glassOf)) delete state.glassOf[k]; build(); renderColors(); renderEstimate(); return; }
    const po = state.po;
    if (d.light) { po.ledLouvres = null; po.spots = null; if (d.light === 'white' || d.light === 'rgbw') po.ledLouvres = { colour: d.light, louvres: 5 }; if (d.light === 'spots') po.spots = { perLouvre: 3, louvres: 5 }; rebuild(); return; }
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
    if (d.act === 'form') { sentOk = false; render(); const f = F.querySelector('#f-form'); if (f) { f.scrollIntoView({ block: 'start', behavior: 'smooth' }); const i = f.querySelector('input'); if (i) setTimeout(() => i.focus({ preventScroll: true }), 400); } return; }
    if (d.act === 'print') { printQuote(); return; }
    if (d.act === 'share') { copy(shareUrl(), L().copied); return; }
    if (d.act === 'save') { saveFile(); return; }
    if (d.act === 'open') { $('f-file').click(); return; }
    if (d.act === 'reopen') { if (lastMailto) openMail(); return; }
    if (d.act === 'copytext') { copy(mailText(), L().textCopied); return; }
  });
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
    if (el.form && el.form.id === 'f-form' && el.name) form[el.name] = el.type === 'checkbox' ? el.checked : el.name === 'when' ? Number(el.value) : el.value;
    if (el.dataset.dim) { clearTimeout(dimT); applyDim(el); }
    if (el.id === 'f-file' && el.files && el.files[0]) { const r = new FileReader(); r.onload = () => { try { restore(JSON.parse(r.result)); } catch (e) { toast('JSON?'); } }; r.readAsText(el.files[0]); }
  });
  F.addEventListener('submit', (ev) => { ev.preventDefault(); sendRequest(); });

  /* ---------- mode, language, toolbar ---------- */
  const TB_RU = T.ru.tb;
  const HINT_RU = $('hint') ? $('hint').textContent : '';
  const LOUV_TITLE_RU = $('louv-dir').title;
  function translateToolbar() {
    const tb = isCust() ? L().tb : TB_RU;
    const setLabel = (id, txt) => { const lab = $(id).closest('label'); if (lab && lab.firstChild && lab.firstChild.nodeType === 3) lab.firstChild.nodeValue = txt + ' '; };
    setLabel('ang', tb.ang); setLabel('drop', tb.drop); setLabel('gopen', tb.gopen);
    const cap = (id, s) => { const c = $(id).querySelector('.cap'); if (c) c.textContent = s; };
    cap('tb-view', tb.view); cap('louv-dir', tb.louvCap); cap('tb-move', tb.move); cap('evening', tb.night);
    $('tb-view').title = tb.view; $('tb-move').title = tb.moveT; $('evening').title = tb.nightT; $('evening').setAttribute('aria-label', tb.nightT);
    $('v-front').textContent = tb.front; $('v-top').textContent = tb.top;
    $('louv-dir').title = isCust() ? tb.louv : LOUV_TITLE_RU; $('louv-dir').setAttribute('aria-label', tb.louv);
    gopenText();
    window.MM_UNIT = isCust() ? L().mm : 'мм';
    renderLabels(curOpt());
    const hint = $('hint'); if (hint) hint.textContent = isCust() ? L().hint : HINT_RU;
    document.documentElement.lang = isCust() ? lang : 'ru';
    document.title = isCust() ? `${OFFICE.name} – ${L().pergola}` : '3D-конфигуратор D&B';
  }
  function gopenText() { const tb = isCust() ? L().tb : TB_RU, v = state.glassOpen; $('gopenv').textContent = v === 0 ? tb.closed : v === 100 ? tb.open : v + '%'; }
  $('gopen').addEventListener('input', gopenText);
  function setLang(l) { lang = l; Store.set('db.lang', l); translateToolbar(); render(); persist(); }
  function setMode(m) {
    document.body.classList.toggle('cust', m === 'cust');
    Store.set('db.mode', m);
    translateToolbar(); render();
    const r = $('mode-cust'); if (r) r.hidden = m === 'cust';
  }
  // pro mode: a way back to the customer view, at the top of the left panel
  {
    const b = document.createElement('button'); b.type = 'button'; b.id = 'mode-cust'; b.className = 'chip'; b.textContent = '← ' + T.ru.toCust; b.style.cssText = 'float:right;margin:-4px 0 0 8px;font-size:12px';
    b.onclick = () => setMode('cust');
    document.querySelector('.app > aside.panel').prepend(b);
  }
  function setMount(m) { state.mount = m; $('mt-wall').setAttribute('aria-pressed', m === 'wall'); $('mt-free').setAttribute('aria-pressed', m === 'free'); recompute(false); }

  /* ---------- 3D call to action: a "+" on every side; tap it to choose what closes that side ---------- */
  const HS = document.createElement('div'); HS.id = 'hotspots'; HS.className = 'cust-only';
  const CTA = document.createElement('button'); CTA.type = 'button'; CTA.id = 'f-cta'; CTA.className = 'cust-only';
  $('view').parentElement.append(HS, CTA);
  let hsSig = '';
  function renderHotspots() {
    const o = curOpt(), ops = opsOf(o), anyFill = ops.some((x) => state.fills[x.id] && state.fills[x.id] !== 'none');
    CTA.hidden = anyFill || !o; CTA.innerHTML = `<span class="hand">☝</span>${esc(L().cta)}`;
    const sig = lang + '|' + ops.map((x) => x.id + ':' + (state.fills[x.id] || 'none')).join(',') + '|' + (focusId || '');
    if (sig === hsSig) return; hsSig = sig;
    HS.innerHTML = ops.map((x) => {
      const f = state.fills[x.id] || 'none', lab = `${sideLabel(x.id, o)} · ${f === 'none' ? L().hsOpen : L().fills[f]}`;
      return `<button type="button" class="hs${f === 'none' ? '' : ' filled'}${!anyFill ? ' pulse' : ''}${focusId === x.id ? ' on' : ''}" data-hs="${x.id}" title="${esc(lab)}" aria-label="${esc(lab)}">${f === 'none' ? '+' : GL[f]}</button>`;
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
  HS.addEventListener('click', (ev) => { const b = ev.target.closest('[data-hs]'); if (!b) return; dirty = true; step = 1; focusId = b.dataset.hs; render(); });
  CTA.addEventListener('click', () => { step = 1; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---------- hooks from the main script ---------- */
  window.onEstimate = () => {
    persist();
    if (!isCust()) return;
    // keep what the user is typing: re-render, then put the text and the caret back into the same field
    const a = document.activeElement;
    const key = a && F.contains(a) && a.matches('input, textarea, select') ? (a.id ? '#' + a.id : a.name ? `[name="${a.name}"]` : null) : null;
    const val = key ? a.value : null;
    let sel = null; try { sel = key ? [a.selectionStart, a.selectionEnd] : null; } catch (e) { sel = null; }
    render();
    if (key) { const n = F.querySelector(key); if (n) { if (n.type !== 'checkbox') n.value = val; n.focus({ preventScroll: true }); try { if (sel && sel[0] != null) n.setSelectionRange(sel[0], sel[1]); } catch (e) { /* number inputs */ } } }
  };
  window.onOpeningPick = (o) => {
    if (!isCust()) return false;
    step = 1; focusId = o.id; render();
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
