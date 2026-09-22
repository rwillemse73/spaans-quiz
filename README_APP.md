# ¡HABLA! ESPAÑOL

Persoonlijke Spaanse woord- en uitdrukkingenquiz.

## Inbegrepen
- Normale woorden – 100
- Normale woorden – 4.850
- Spaanse uitdrukkingen – 101
- Spaans → Engels/Nederlands meerkeuze
- Engels/Nederlands → Spaans meerkeuze
- Engels/Nederlands → Spaans schrijven
- 30 vragen per sessie
- Fout antwoord wordt 3 sessies uitgesteld
- Resultaten per dataset/richting
- Lesdagen per volledige cyclus
- Moeilijke woorden vanaf 3 fouten
- Lokale opslag van voortgang
- PWA-bestanden voor installatie als app

## Installeren als app
Zet de map op een webserver (bijvoorbeeld GitHub Pages). Open de website in Chrome/Edge op Android en kies **Installeren** / **Toevoegen aan startscherm**.

De service worker zorgt daarna voor offline caching van de app en datasets.


## Mappenstructuur
```
Habla_Espanol_App_v0.0.8/
├── index.html
├── app.js
├── style.css
├── manifest.webmanifest
├── sw.js
├── README_APP.md
├── datasets/
│   ├── spaans_engels_test_100.json
│   ├── spaans_engels_compleet_4850.json
│   └── spaans_uitdrukkingen_101.json
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-maskable-512.png
    ├── apple-touch-icon.png
    └── favicon-32.png
```

De 4.850-woordenlijst staat nu rechtstreeks in `datasets/`; de map `productie/` is niet meer nodig. De app bevat de datasets daarnaast ingebed voor robuust lokaal gebruik, terwijl de JSON-bestanden als losse datasetbestanden aanwezig blijven voor onderhoud, uitbreiding en de PWA-cache.
