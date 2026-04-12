Ce trebuie facut

Nu trebuie sa rescrii tot site-ul.
Trebuie sa faci 4 lucruri:

1. Fa 3 sabloane reale, nu 1 sablon repetat

Acum ai practic acelasi layout peste tot.

Tu trebuie sa imparti paginile asa:

Tip 1 – pagina “piesa mica”

Pentru:

clipuri-tapiterie-auto

gura-ventilatie-auto

clapeta-hublou-masina-spalat

sertar-detergent-masina-spalat

Structura:

hero

simptome / ce se rupe

ce poze trebuie

ce sa masori

probleme de potrivire

exemple

FAQ

CTA

Tip 2 – pagina “piesa de forta / prindere”

Pentru:

maner-usa-interior-auto

suport-cotiera-auto

maner-frigider-plastic

grila-bara-fata-rupt

Structura:

hero

unde cedeaza piesa

cand merita refacerea

cum se poate intari

ce intrebi in oferta

ce poze si cote sunt esentiale

exemple

CTA

FAQ

Tip 3 – pagina “categorie / hub”

Pentru:

refacere-piese-plastic

piese-plastic-auto

piese-plastic-electrocasnice

Structura:

hero

categorii mari

cum functioneaza

materiale

greseli frecvente

subpagini

exemple multiple

FAQ mare

CTA

Asta singur deja rupe senzatia de template repetat.

2. Scoate continutul generic repetat de pe toate paginile

Astea se repeta prea mult si trebuie reduse:

“Postarea cererii e gratuita?”

“PETG e recomandat?”

“Primesti oferte”

“Pui poze clare”

“Nu recomand printare 3D pentru piese de siguranta”

dublu CTA aproape identic pe aceeasi pagina

“Vezi si alte subcategorii”

aceleasi 3 exemple cu format identic

Nu zic sa le elimini complet.
Dar nu le lasa la fel pe toate.

Ce sa faci concret

Pe fiecare pagina:

pastrezi un singur CTA mare, nu doua aproape identice

lasi maxim 3-4 FAQ, dar foarte specifice

pastrezi o singura zona de cross-linking

inlocuiesti 1-2 sectiuni generice cu ceva unic

3. Pune pe fiecare pagina 2 blocuri unice, foarte specifice

Asta este cheia.

Pentru gura-ventilatie-auto.html

Adauga:

Ce poze sa faci exact la o gura de ventilatie

Cum verifici daca se poate reface doar aripioara, nu toata grila

Pentru maner-usa-interior-auto.html

Adauga:

Unde se fisureaza de obicei manerul

Cum masori distanta dintre prinderi

Pentru grila-bara-fata-rupt.html

Adauga:

Cand merge refacuta doar insertia

Ce conteaza la piesele expuse la UV si vibratii

Pentru clapeta-hublou-masina-spalat.html

Adauga:

Cum iti dai seama daca e clapeta sau blocatorul electric

Ce informatii iei de pe eticheta masinii de spalat

Pentru piese-plastic-electrocasnice.html

Adauga:

Tabel sau lista pe aparate

frigider

masina de spalat

aspirator

cuptor

espressor

si pentru fiecare: ce tip de piese se cer cel mai des

Asta face fiecare pagina sa para “pagina ei”, nu doar “alta varianta”.

4. Corecteaza si problemele tehnice din cod

Aici ai o problema reala in ce ai pus.

In cateva locuri ai comentat inceputul tagului <a>, dar ai lasat inchiderea </a> activa.

Exemplu la piese-plastic-electrocasnice.html:

<!--<a href="/sertar-frigider-rupt.html" class="page-card">-->
  <div class="page-card-dot"></div>
  <div class="page-card-content">
    ...
  </div>
</a>

Asta produce HTML invalid.

La fel si aici:

<!-- <a href="/buton-aragaz-rupt.html" class="page-card">-->
...
</a>

si in pagina cu clapeta ai exact aceeasi problema.

Ce trebuie facut

Ori lasi linkul complet:

<a href="/sertar-frigider-rupt.html" class="page-card">
  ...
</a>

ori scoti complet si inchiderea:

<!--
<a href="/sertar-frigider-rupt.html" class="page-card">
  ...
</a>
-->

Asta trebuie verificat pe toate paginile, pentru ca HTML invalid poate afecta parsarea si crawlul.

Ce as face eu acum, in ordinea corecta
Etapa 1

Corectezi HTML-ul invalid peste tot:

ancore comentate partial

taguri inchise fara deschidere

orice bloc comentat rupt

Etapa 2

Alegi 5 pagini prioritare:

refacere-piese-plastic.html

piese-plastic-auto.html

gura-ventilatie-auto.html

maner-usa-interior-auto.html

clapeta-hublou-masina-spalat.html

Etapa 3

Pe aceste 5:

schimbi structura in 2-3 sabloane diferite

elimini un CTA duplicat

rescrii FAQ-urile sa fie 100% specifice

adaugi 2 blocuri unice pe fiecare

Etapa 4

Abia apoi dai din nou request indexing pentru:

hub

categorie

2-3 subpagini

Verdictul meu

Paginile nu sunt proaste.
Dar in forma actuala sunt prea “uniforme” pentru un domeniu nou.

Nu trebuie sa le refaci de la zero.
Trebuie sa faci:

mai putine sectiuni repetitive

mai multe blocuri unice specifice piesei

3 sabloane diferite

curatare HTML invalid

Asta e ce trebuie facut.

Daca vrei, in pasul urmator iti fac exact asa:
iti iau una dintre paginile astea si iti spun concret:

ce sectiuni stergi

ce sectiuni muti

ce sectiuni noi adaugi

cu text gata de lipit.