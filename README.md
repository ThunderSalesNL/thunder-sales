# Beller Records: Thundersales leaderboard (v1)

Een simpel leaderboard voor thundersales.nl/leaderboard.

- **Bellers** loggen in met één gezamenlijke login en zien de records.
- **Admin** logt in met een eigen login en houdt per beller bij:
  - het salesrecord op 1 dag, in 1 week en in 1 maand (de beste stand ooit);
  - de effectieve beluren van deze week (actuele stand, dagelijks bijwerken). Het doel is minimaal 20 uur per week;
  - het totale aantal bruto sales en het totale aantal effectieve beluren sinds de start. Eén sale telt als
    € 120. Het gemiddelde uurloon = (aantal sales × € 120) ÷ effectieve beluren. Doel: 15 sales × € 120 ÷ 20 uur
    = € 90 per uur.
  - Uren mag je invullen als 21u30, 21h30m, 21:30 of 21,5.
- Geen database en geen koppeling met Salesdock nodig. Alles staat in één bestand in de map `data/`.

Er zitten twee backends in die precies hetzelfde doen. Kies er één:

---

## Optie A: gewone webhosting met PHP (het snelst)

Werkt bij vrijwel elke hoster (TransIP, Hostinger, Vimexx, cPanel/DirectAdmin, enz.) met PHP 7.3+.

1. Open `config.php` en **verander de wachtwoorden**.
2. Upload de hele map `leaderboard` naar de webroot van thundersales.nl
   (meestal `public_html/` of `www/`), zodat je `public_html/leaderboard/index.html` krijgt.
3. Zorg dat de map `leaderboard/data` schrijfbaar is (rechten 755 of 775).
4. Open **https://thundersales.nl/leaderboard/** en klaar.

`server.js` en `package.json` heb je hier niet nodig (mag je laten staan).

## Optie B: Node.js (als de site op Vercel/Netlify/GitHub Pages draait)

Die platforms kunnen geen bestanden opslaan, dus draai je de leaderboard als aparte kleine app.
Er zijn geen npm-packages nodig.

1. Zet de map in een GitHub-repo (of in jullie bestaande repo).
2. Maak een service aan bij **Railway** of **Render** met als startcommando `node server.js`.
3. Stel deze environment variables in:

   | Variabele        | Voorbeeld                       |
   |------------------|---------------------------------|
   | `BELLER_USER`    | `bellers`                       |
   | `BELLER_PASS`    | *(sterk wachtwoord)*            |
   | `ADMIN_USER`     | `admin`                         |
   | `ADMIN_PASS`     | *(sterk wachtwoord)*            |
   | `SESSION_SECRET` | *(lange willekeurige tekst)*    |
   | `DATA_DIR`       | `/data` *(pad van je volume)*   |
   | `BASE_PATH`      | `leaderboard` (standaard)       |

4. **Belangrijk:** koppel een *persistent volume/disk* op `DATA_DIR`. Anders verdwijnen de
   ingevoerde records bij elke herstart. (Railway: Volume; Render: Disk, niet op het gratis plan.)
5. Laat thundersales.nl/leaderboard doorverwijzen naar die app. Bij Vercel zet je dit in `vercel.json`:

   ```json
   {
     "rewrites": [
       { "source": "/leaderboard", "destination": "https://JOUW-APP.up.railway.app/leaderboard/" },
       { "source": "/leaderboard/:path*", "destination": "https://JOUW-APP.up.railway.app/leaderboard/:path*" }
     ]
   }
   ```

   Je kunt ook gewoon een subdomein gebruiken, zoals `leaderboard.thundersales.nl`.

Lokaal testen: `node server.js` en dan naar http://localhost:3000/leaderboard/ gaan.

---

## Gebruik

- **Admin**: ga naar *Beheer*, pas de waarden aan en klik op *Opslaan*. Gewijzigde velden kleuren oranje.
  Uren noteer je met een komma (`12,5`). Met *+ Beller toevoegen* voeg je een beller toe, met × verwijder je er een.
- **Nieuwe week**: klik op maandag op *Nieuwe week starten* en dan op *Opslaan*. De beluren van iedereen
  gaan terug naar 0. De salesrecords blijven staan.
- **Leaderboard**: klik op een recordtegel (dag/week/maand) om de ranglijst daarop te sorteren. Onder elke
  naam staan de beluren van deze week, met een balkje richting 20 uur (oranje = nog niet gehaald,
  groen = doel gehaald). Klik op een beller om al zijn cijfers te zien.
- **Verdiensten**: via de tab *Verdiensten* (of `/leaderboard/#verdiensten`) zien alle bellers de ranglijst
  op all-time bruto saleswaarde (aantal sales × € 120).
- **Uurloon (alleen beheerders)**: de tab *Uurloon* is alleen zichtbaar na inloggen als admin. Bellers krijgen
  de totale beluren niet eens doorgestuurd, dus ze kunnen het uurloon ook niet zelf terugrekenen.
- **TV-modus**: klik op *▶ TV-modus* voor een scherm op kantoor. De pagina gaat schermvullend en wisselt
  elke 12 seconden tussen dag, week, maand en bruto totaal (het uurloon komt niet op de tv). Na elke ronde worden de cijfers ververst. Stoppen kan met Esc.
- Het urendoel, de waarde per sale en het salesdoel staan bovenaan in `assets/app.js`
  (`UREN_DOEL = 20`, `SALE_WAARDE = 120`, `SALES_DOEL_WEEK = 15`).
- Bij een gelijke stand krijgen bellers dezelfde plek en zijn ze allemaal recordhouder.

## Bestanden

```
index.html        de pagina (login, leaderboard en beheer)
assets/style.css  opmaak
assets/app.js     interactie
api.php           backend (optie A) + config.php voor de wachtwoorden
server.js         backend (optie B)
data/             hier komen de records (wordt automatisch aangemaakt)
```

De startgegevens (Nora, Yordal, Liam en Maite) staan erin tot de admin de eerste keer opslaat.
Controleer in Beheer vooral de dag-, week- en maandrecords.

## Volgende stap (later)

Wil je ooit per beller een eigen login of een automatische koppeling met Salesdock, dan kan dat
bovenop deze opzet. Het dataformaat blijft hetzelfde.

## In Microsoft Teams zetten

Bij de leaderboard hoort het bestand `thundersales-teams-app.zip` (een Teams-app). Daarmee opent het
leaderboard binnen Teams, met een eigen icoon in de linkerbalk.

1. Zet het leaderboard eerst live op **https://**thundersales.nl/leaderboard/ (https is verplicht).
2. Ga als Teams-beheerder naar https://admin.teams.microsoft.com → *Teams-apps* → *Apps beheren* →
   *Uploaden* (nieuwe app uploaden) en kies `thundersales-teams-app.zip`.
3. Zet de app bovenaan in de linkerbalk van iedereen: *Teams-apps* → *Instellingsbeleid* → *Global*
   → *Vastgemaakte apps* → *Apps toevoegen* → "Sales Records" → Opslaan. Dat kan enkele uren duren.

Staat het leaderboard op een ander adres? Pas dan in `manifest.json` de `contentUrl`, `websiteUrl` en
`validDomains` aan, verhoog `version` (bijv. 1.0.1) en zip de drie bestanden opnieuw (zonder map eromheen).

Zie je in Teams een leeg scherm? Dan blokkeert je hosting het tonen van de pagina in een frame
(header `X-Frame-Options`). Vraag je hoster die header voor /leaderboard uit te zetten.
