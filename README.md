# BFX Portfolio Pro

Osobní nástroj na evidenci portfolia, sledování titulů, které chci koupit, a analýzu
jednotlivých akcií. Postavený v design systému **BFX Premium**.

Čtyři vrstvy:

| Vrstva | K čemu je |
|---|---|
| **Portfolio** | Co vlastním a kolik mi to vydělalo. Tranše, FIFO, měnový rozklad, XIRR, časový test. |
| **Watchlist** | Co vlastnit chci — a za jakou cenu to koupím. |
| **Analýza** | Modelování celého portfolia: Sharpe, benchmark, Monte Carlo, optimalizace vah. |
| **AI analýza** | Jeden titul pod lupou: fundamenty, technika, projekce, hodnocení. |

---

## Spuštění

### Docker Compose

```bash
cp .env.example .env      # doplň BFX_SECRET_KEY
docker compose up --build
```

Aplikace běží na http://localhost:5173, API na http://localhost:8000
(dokumentace endpointů na http://localhost:8000/docs).

Úpravy v `backend/app` a `frontend/src` se projeví živě, není potřeba rebuild.

### Bez Dockeru

```bash
# Backend
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (druhý terminál)
cd frontend
npm install
npm run dev
```

Backend potřebuje přístup na internet — ceny tahá z Yahoo Finance, kurzy z ČNB.
Bez internetu aplikace funguje dál, jen se ceny a kurzy zadávají ručně.

### GitHub Codespaces

Repo obsahuje `.devcontainer/`, takže Codespace se nastaví sám:

1. Na GitHubu na tomhle repu **Code → Codespaces → Create codespace on main**.
2. Počkej, až doběhne `postCreateCommand` (nainstaluje backend i frontend a
   založí `.env` s náhodným `BFX_SECRET_KEY`).
3. Ve dvou terminálech spusť stejné příkazy jako výše v sekci *Bez Dockeru*.
4. Jakmile naběhne port **5173**, Codespace ho sám přesměruje a otevře náhled
   v prohlížeči — na tu adresu se pak vracíš i příště.

Port 8000 (API) se nepřeposílá ven, frontend na něj volá přes Vite proxy
uvnitř Codespace, takže není potřeba ho zveřejňovat.

### Nastavení prostředí

| Proměnná | Povinná | Význam |
|---|---|---|
| `BFX_SECRET_KEY` | doporučená | Podepisuje přihlašovací tokeny. Bez ní se po restartu odhlásíš. |
| `BFX_DATA_DIR` | ne | Kam se ukládá SQLite databáze. Výchozí `backend/data`. |
| `ANTHROPIC_API_KEY` | ne | Zapíná slovní komentář v AI analýze. Bez něj běží zbytek analýzy dál. |
| `BFX_CORS_ORIGINS` | ne | Odkud smí frontend volat API. Výchozí `localhost:5173`. |

---

## Portfolio

### Čtyři typy transakcí

| Typ | Význam | Co dělá |
|---|---|---|
| `BUY` | Nákup | Přidá tranši |
| `SELL` | Prodej | Odebere z tranší metodou FIFO, vytvoří realizovaný zisk |
| `DIV` | Dividenda | Do `cena` jde **hrubá částka celkem**, do `poplatek` sražená daň, `mnozstvi` = 1 |
| `ADJUST` | Split | Do `mnozstvi` jde **poměr** (4 = split 4:1, 0.25 = reverse split 1:4) |

**Split je v aplikaci od začátku.** V patnáctititulovém portfoliu ho potkáš zhruba jednou
ročně a bez něj tracker po první události tiše lže. `ADJUST` násobí množství všech
otevřených tranší a dělí jejich nákupní cenu — celková nákladová základna se nemění.

**Záporný poplatek snižuje nákladovou základnu.** Řeší přiřazení z prodané PUT opce, kde
je skutečná pořizovací cena strike minus vybrané prémium.

### Proč tranše a ne průměrná cena

Pozice není jedno průměrné číslo, ale seznam tranší. Každá si drží vlastní nákupní cenu,
vlastní kurz a vlastní datum. Všechny tři jsou později potřeba: datum kvůli časovému
testu, kurz kvůli měnovému rozkladu. Průměr obojí rozbije.

### Dvě podobná procenta, která se nesmí splést

- **Celkový zisk %** — všechno: cena, kurz, dividendy, poplatky, realizované zisky
  z částečných prodejů. Odpověď na „vydělal jsem na tom".
- **Pohyb ceny %** — jen pohyb ceny samotné, bez kurzu a bez dividend.

V rozhraní jsou zřetelně oddělené a popsané. Dvě podobná procenta vedle sebe bez popisku
jsou zdroj zmatku.

### Rozklad na cenu a kurz

```
cenový efekt = množství × (cena dnes − cena při nákupu) × kurz při nákupu
měnový efekt = množství × cena dnes × (kurz dnes − kurz při nákupu)
```

Součet sedí na hrubý zisk. U českého investora s americkými akciemi rozhoduje měnová
složka často o polovině výsledku, a skoro žádný nástroj ji neukazuje.

### Časový test

Odpočet do osvobození počítá každá tranše zvlášť, barevně podle toho, jak je blízko.
Délka testu i strop osvobození jsou v nastavení, protože se mění.

Prodej dva měsíce před uplynutím testu u zisku 400 tisíc stojí 60 tisíc na dani. Proto má
každá pozice časovou osu, na které je vidět, které kusy už jsou venku.

> Jde o orientační výpočet z data nákupu, ne o daňové poradenství.

### Měny

Instrument je určen trojicí **ticker + burza + měna**. `AAPL|NASDAQ|USD` a `APC|XETRA|EUR`
jsou dva různé záznamy téhož podniku.

**GBX je samostatná měna.** Tituly na LSE se kotují v pencích, ne v librách. Při použití
`GBP` by byla pozice stokrát nadhodnocená a rozbilo by to celé portfolio i všechny váhy.
Stejně tak `ZAc` a `ILA`. Import navíc pozná, když někdo u GBX zadá kurz pro libru,
a přepočítá ho.

Historické kurzy se stahují z ČNB podle data obchodu a jednou dohledané se **nikdy
nepřepisují** — kurz platný v den obchodu je fakt o tom obchodu.

### Chybějící data

Když se cena nenajde, pozice zešedne a dostane štítek **Cena chybí**. Nikdy se nedosazuje
nula ani nákupní cena — obojí vypadá jako skutečné číslo a tiše by rozbilo součet
portfolia, váhy i upozornění na koncentraci. Ruční cena přebíjí automatickou a je označená
tužkou.

### Graf hodnoty a benchmark

Graf se nerekonstruuje zpětně — vyžadovalo by to historické ceny všech instrumentů
a historické kurzy ke každému dni. Místo toho si aplikace ukládá měsíční snapshot. První
rok bude řídký, pak přesný.

Benchmark je jedno číslo, ne křivka:

> Kdyby všechny nákupy ve stejných datech a částkách šly do VWCE, portfolio by dnes mělo
> X Kč. Tvoje má Y Kč.

Nejužitečnější možný výsledek tohohle čísla je zjištění, že vlastním výběrem akcií index
neporážíš.

---

## Import a export CSV

UTF-8, oddělovač čárka nebo středník (pozná se — český Excel dělá středníky a často
desetinné čárky). Import běží **náhled → potvrzení**, nikdy nezapisuje rovnou.

| # | Sloupec | Povinný | Popis |
|---|---|---|---|
| 1 | `typ` | ano | `BUY` \| `SELL` \| `DIV` \| `ADJUST` |
| 2 | `datum` | ano | `YYYY-MM-DD` |
| 3 | `ticker` | ano | Symbol velkými písmeny |
| 4 | `burza` | ano | `NASDAQ`, `NYSE`, `XETRA`, `LSE`, `PSE`, `CRYPTO` |
| 5 | `trida` | ano | `STOCK` \| `ETF` \| `CRYPTO` |
| 6 | `mnozstvi` | ano | Až 8 des. míst. U `ADJUST` poměr, u `DIV` vždy 1 |
| 7 | `cena` | ano | Za kus. U `DIV` hrubá částka celkem |
| 8 | `mena` | ano | `USD`, `EUR`, `CZK`, `GBP`, `GBX` … |
| 9 | `poplatek` | ne | Záporná hodnota snižuje základnu. U `DIV` sražená daň |
| 10 | `kurz_czk` | ne | Kurz k datu. Prázdné = dohledá se |
| 11 | `isin` | ne | |
| 12 | `nazev` | ne | |
| 13 | `portfolio` | ne | Prázdné = aktivní. Neexistující se založí |
| 14 | `poznamka` | ne | |

Náhled: zelené projdou, žluté s varováním, červené se nezaimportují. Import lze spustit
i s chybnými řádky, ty se vynechají. Duplicity (`typ` + `datum` + `ticker` + `mnozstvi` +
`cena`) se přeskočí.

Šablony ke stažení jsou v nastavení — prázdná (`import-sablona.csv`) a vzor se všemi
ošklivými případy (`import-vzor.csv`): GBX, split, dividenda, záporný poplatek, desetinné
krypto, částečný prodej, dvě portfolia. **Když po jeho importu sedí čísla, sedí celý
engine** — přesně to ověřuje testovací sada.

Export je ve stejném formátu. Bez něj je uživatel rukojmím jedné instance databáze.

---

## Watchlist

Seznam firem, které chci vlastnit, ale zatím nevlastním — a hlavně **za jakých okolností
je koupím**. Rozhodnutí padne v klidu, ve chvíli zápisu; nástroj pak jen hlídá, jestli
podmínka nastala. Tím se odděluje analýza od impulzu.

Bez cílové vstupní ceny položku nelze uložit. To je celý mechanismus.

Splněná podmínka se zvýrazní a vyskočí na začátek se štítkem *„Cena dosažena — rozhodni
se"*. Nikdy ne „kup".

Sloupec **„Od přidání %"** ukazuje, jak se titul vyvinul od chvíle, kdy sis ho poznamenal.
Je to jediné místo, kde uvidíš, jak by dopadly nákupy, které jsi neudělal.

Tlačítko **„Koupil jsem"** otevře transakci s předvyplněným titulem a po uložení přesune
položku do archivu s odkazem na vzniklou pozici. Poznámka se přenese do pozice, takže
portfolio si pamatuje, odkud se každá pozice vzala.

---

## AI analýza

Ticker → rozbor jednoho titulu. Data z Yahoo Finance (zdarma, bez klíče).

Obsahuje: kurz a pozice v 52týdenním rozpětí, fundamenty (P/E, PEG, P/B, EV/EBITDA, marže,
ROE, růst, zadlužení, dividendový výnos, beta), techniku (SMA 50/200, RSI, volatilita,
max. propad, výnosy 1m–1r), projekci a hodnocení.

**Projekce není předpověď.** Je to rozdělení konců, které vyplývá z historické volatility —
Monte Carlo s pevným seedem, takže stejný vstup dá vždy stejnou odpověď. Zobrazují se
percentily p5–p95, ne jedno číslo.

**Hodnocení je posudek, ne pokyn k obchodu.** Skóre 0–100 se skládá ze čtyř dílčích skóre
(valuace, kvalita, momentum, konsenzus analytiků) a u každého je vidět **každý faktor
zvlášť**: jeho hodnota, kolik bodů přispěl a proč. Součet faktorů dává dílčí skóre. Když
data chybí, dílčí skóre vypadne a řekne proč — nespadne na nulu. Když je dat málo,
klesne uvedená spolehlivost a verdikt se změní na „Nedostatek dat", protože sebejistě
vypadající závěr nad tenkými daty je nejhorší možný výstup.

Slovní komentář se generuje jen s `ANTHROPIC_API_KEY`. Bez klíče kvantitativní část stojí
sama o sobě — není to chybový stav.

> Neposkytuje investiční poradenství. Data mohou být nepřesná nebo zpožděná.

---

## Struktura

```
backend/
  app/
    engine/          Výpočetní jádro — currency, fifo, positions, xirr
    services/        Ceny, kurzy, CSV, snapshoty, kvant. analýza, AI analýza
    routers/         API endpointy
    models.py        SQLAlchemy modely
  tests/             pytest
frontend/
  src/
    design/          BFX Premium Design — tokeny a komponenty
    pages/
      portfolio/     Vrstva Portfolio
      watchlist/     Vrstva Watchlist
      analysis/      Vrstva Analýza
      ai/            Vrstva AI analýza
    api/             Klient a typy
    lib/format.ts    České formátování čísel
```

---

## Testy

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```

Testy pokrývají pět míst, kde se chyba neprojeví pádem, ale tichým špatným číslem:

1. FIFO rozklad při částečném prodeji
2. Převod `GBX` na CZK
3. `cenový efekt + měnový efekt` = hrubý zisk
4. `ADJUST` zachovává celkovou nákladovou základnu
5. XIRR proti známému referenčnímu příkladu

---

## Kvantitativní analýza

Vrstva **Analýza** počítá nad tržními daty: výkonnost (roční výnos, volatilita, Sharpe,
Sortino, max. propad), porovnání s benchmarkem (alfa, beta, tracking error, informační
poměr, zachycení růstu a poklesu), Monte Carlo projekci a optimalizaci vah (max Sharpe,
min. volatilita, risk parity).

Výchozí složení se bere ze skutečných pozic vážených aktuální hodnotou, takže analýza
popisuje reálné portfolio. Váhy jde přepsat a ptát se „co kdyby“, aniž by se cokoli
změnilo v evidenci.

Analytické jádro stojí na knihovně
[`engineer-investor-portfolio`](https://github.com/engineerinvestor/Portfolio-Analysis).

---

## Poznámka

Nástroj slouží k osobní evidenci. Neposkytuje investiční ani daňové poradenství. Výpočty
jsou orientační a mohou obsahovat chyby v datech i zaokrouhlení. Pro daňové účely je
závazné vlastní posouzení nebo konzultace s daňovým poradcem.
