// Nastavení aplikace – tohle je jediný soubor, který je potřeba občas upravit.
export const CONFIG = {
  shopUrl: 'https://www.dikos-kosmetika.cz/',

  // Za kolik dní připomenout další manikúru.
  reminderDays: 21,

  // Text se slevou v připomínce (např. 'S kódem XYZ máš slevu 10 %.').
  // Prázdný řetězec = sleva se nezobrazí.
  couponText: '',

  // Značka pro měření návštěv z aplikace (Google Analytics apod.).
  // Prázdný řetězec = odkazy bez značky.
  utmSource: 'nehtik',

  // Vyhledávání na e-shopu – použije se u produktů bez product_url v databázi.
  searchUrl: 'https://www.dikos-kosmetika.cz/vyhledavani/?string=',
};
