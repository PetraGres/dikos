// Nastavení aplikace – tohle je jediný soubor, který je potřeba občas upravit.
export const CONFIG = {
  shopUrl: 'https://www.dikos-kosmetika.cz/',

  // Za kolik dní připomenout další manikúru.
  reminderDays: 21,

  // Slevový kód v připomínce. Prázdný řetězec = kód se nezobrazí.
  couponCode: 'NEHTIK',
  couponText: 'S kódem NEHTIK máš na další nákup slevu 10 %.',

  // Vyhledávání na e-shopu – použije se u produktů bez product_url v databázi.
  searchUrl: 'https://www.dikos-kosmetika.cz/vyhledavani/?string=',

  // Vkládání do košíku na Dikos. Zapnout (true) až po vložení skriptu
  // shoptet/zapati-skript.html do Shoptetu a úspěšném testu (test-kosik.html).
  cartEnabled: false,
};
