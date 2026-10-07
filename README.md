# Nehtík – domácí průvodce gelovými nehty (Dikos Kosmetika)

Jednoduchá webová aplikace pro zákaznice e-shopu [dikos-kosmetika.cz](https://www.dikos-kosmetika.cz/).
Otevře se v telefonu z odkazu nebo QR kódu a dá se uložit na plochu jako appka.
Funguje i offline.

## Co umí

1. **Průvodce krok za krokem.** Zákaznice vybere, co chce dělat (gel lak, zpevnění, modeláž,
   zlomený nehet), odpoví na 2–3 otázky a dostane postup s odkazy na produkty v e-shopu.
2. **Časovač lampy.** U každé vrstvy je tlačítko „Vytvrdit“, které odpočítá čas a pípne.
   - Časy se berou **jen** z `data/dikos_nail_guide.json`, nikdy se nedopočítávají z výkonu lampy.
   - Když je čas uvedený jako rozsah (např. 60–120 s), aplikace ukáže obě hodnoty a vybere zákaznice.
   - Když čas chybí, aplikace zobrazí upozornění „řiď se návodem produktu“ a nabídne
     ruční zadání času z návodu.
   - Pod každým časem je volba **„Jiný čas“** – zákaznice si může zadat vlastní čas (1–600 s),
     např. podle návodu ke své lampě. Výchozí je vždy čas z databáze.
   - **Rychlý časovač** na úvodní obrazovce: zákaznice zvolí lampu a vidí jen produkty,
     které mají pro tu lampu v databázi uvedený čas (u Gummy Base a Nylon Fiber po krocích).
     Seznam se tvoří z `data/dikos_nail_guide.json` automaticky – doplněný čas se v něm
     objeví sám. Dole je pole pro vlastní čas.
3. **Připomínka další manikúry.** Po dokončení si zákaznice uloží připomínku do kalendáře
   (za 21 dní). Na úvodní obrazovce pak vidí odpočet a tlačítko „Doplnit zásoby“,
   v posledních dnech i slevový kód.

4. **Nákupní seznam a košík.** Pod postupem je seznam „Co budeš potřebovat“. Po zapnutí
   košíku (viz níže) si zákaznice produkty zaškrtne a tlačítkem je vloží do svého košíku
   na Dikos – přičtou se k tomu, co už v košíku má.

Žádné účty, žádný server, žádná databáze. Ceny a dostupnost zůstávají v e-shopu.

## Košík na Dikos (Shoptet)

Aplikace přesměruje zákaznici na `https://www.dikos-kosmetika.cz/?nehtik_add=KÓD:KUSY,KÓD:KUSY`.
Produkty do košíku vloží skript v zápatí e-shopu přes oficiální Shoptet funkci
`shoptet.cartShared.addToCart` – vkládá je postupně, bez vyskakovacích oken, max. 20 položek
a 10 kusů, a parametr hned smaže z adresy (obnovení stránky nic nezdvojí). Pak otevře košík.

1. Obsah `shoptet/zapati-skript.html` vlož v Shoptetu do *Vzhled a obsah → Editor → HTML kód → Zápatí*.
2. Otevři `test-kosik.html` a projdi testy 1–4 (v telefonu i počítači).
3. Když vše sedí, nastav v `config.js` `cartEnabled: true`.

Kód produktu: aplikace použije pole `shoptet_code` z JSONu, a pokud chybí, `id`.
U produktů s odstíny musí jít o **kód varianty** (např. `NA-18-119` = gel lak č. 119).

## Co je potřeba udržovat

| Co | Kde | Jak často |
|---|---|---|
| Slevový kód, počet dní do připomínky | `config.js` | podle potřeby (např. 1× měsíčně) |
| Produkty, časy vytvrzení, postupy | `data/dikos_nail_guide.json` | při změně sortimentu |
| Kontrola chybějících časů a odkazů | otevřít `admin.html` | občas |
| Přímé adresy produktů (nepovinné) | pole `product_url` v JSONu | když se hodí |

Odkazy na produkty: aplikace použije `product_url` (přímý detail produktu). Když chybí,
otevře vyhledávání na Dikosu – podle `search_term`, jinak podle názvu produktu bez
dovětku za pomlčkou. Pole `source` slouží jen pro kontrolu údajů v `admin.html`.

Po úpravě souborů zvyš verzi `CACHE` v `sw.js` (např. `nehtik-v2`), aby se změna
projevila i lidem, kteří mají appku uloženou na ploše.

> Časy v krocích `product.steps` (Gummy Base, Nylon Fiber) bere aplikace jako údaje pro
> UV/LED lampu. Pro jinou lampu použije údaj z produktu pro danou lampu, nebo zobrazí upozornění.

## Spuštění lokálně

```bash
npm start        # http://localhost:8080
npm test         # testy logiky (Node 18+)
```

## Zveřejnění zdarma (GitHub Pages)

Settings → Pages → Deploy from a branch → vybrat větev a složku `/ (root)`.
Aplikace pak poběží na `https://<uživatel>.github.io/dikos/`. Na tuhle adresu
může vést odkaz z e-shopu a QR kód na letáčku v balíčku.
