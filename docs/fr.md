# Miniflux

Reliez Gladys à [Miniflux](https://miniflux.app), le lecteur de flux
minimaliste : suivez vos articles non lus par catégorie, réagissez à l'arrivée
d'un nouvel article ou quand un flux ne fonctionne plus, marquez des articles
comme lus depuis vos scènes, et affichez les derniers non lus sur le tableau de
bord. L'intégration suit l'état de votre lecteur (lu / non lu, le même sur tous
vos appareils), pas les flux eux-mêmes.

Testée avec un vrai Miniflux 2.3.4 (l'image Docker officielle) et des flux de
test. Vos retours sont les bienvenus sur le forum Gladys.

## Prérequis

- Gladys Assistant 5.1 ou plus.
- Miniflux 2, auto-hébergé (port 8080 par défaut, ou derrière un reverse proxy)
  ou le service hébergé `reader.miniflux.app`, joignable depuis la machine de
  Gladys.
- Une clé d'API : dans Miniflux, ouvrez **Paramètres → Clés d'API** et créez-en
  une. L'intégration voit les flux de l'utilisateur à qui appartient la clé.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Dans **Adresse de Miniflux**, saisissez l'adresse du serveur, par exemple
   `192.168.1.50:8080` (port 8080 quand aucun n'est donné), ou une adresse
   complète comme `https://rss.example.org` ou `https://reader.miniflux.app`.
3. Collez la **clé d'API**.
4. Facultatif : **Lire Miniflux toutes les** (5 minutes par défaut), et
   **Mots-clés à surveiller**, séparés par des virgules, pour le filtre
   mot-clé du déclencheur « Nouvel article ».
5. Cliquez sur **Tester la connexion** : elle affiche l'utilisateur, les
   articles non lus et les flux en erreur.
6. Ouvrez l'onglet **Découverte** et ajoutez les appareils voulus.

## Appareils

- **Miniflux** : _Articles non lus_ (toutes catégories) et _Flux en erreur_
  (flux que Miniflux n'a pas pu lire à sa dernière vérification, flux
  désactivés exclus).
- **Un appareil par catégorie** (proposé pour chaque catégorie de Miniflux) :
  ses _Articles non lus_.

Les valeurs sont lues toutes les quelques minutes (le réglage ci-dessus) et
juste après chaque modification faite depuis Gladys. Elles sont gardées dans
l'historique, pour suivre votre pile de non lus sur un graphique.

## Widget du tableau de bord

**Miniflux** : le nombre d'articles non lus (et de flux en erreur, en rouge,
s'il y en a), les six derniers articles non lus (flux, date, résumé, liens vers
l'article et vers Miniflux quand ils sont en https), un bouton **Actualiser**
qui demande à Miniflux de vérifier tous les flux, et un bouton **Marquer lu**,
avec confirmation, pour ce que montre le widget. Réglé sur un appareil
catégorie, le widget n'affiche et ne marque que cette catégorie.

## Déclencheurs de scène

- **Nouvel article** : un article non lu est arrivé dans Miniflux. Filtres :
  une catégorie (un appareil catégorie), un flux (son titre, exactement comme
  dans Miniflux), un mot-clé (un des mots-clés de la configuration, trouvé dans
  le titre, sans tenir compte des majuscules ni des accents). Informations
  transmises : titre, lien, flux, catégorie, auteur, mot-clé trouvé, date de
  publication et identifiant de l'article.
- **Flux en erreur** : Miniflux n'arrive plus à lire un flux qui fonctionnait
  jusque-là. Filtre : une catégorie. Informations transmises : flux,
  catégorie, message d'erreur, vérifications échouées, adresse du site,
  identifiant du flux.

Rien ne se déclenche à la première lecture après l'installation, ni pour les
articles déjà présents quand un flux est ajouté, ni pour les articles déjà lus
sur un autre appareil. Au plus 10 articles sont annoncés par lecture.

## Actions de scène

- **Marquer une catégorie Miniflux comme lue** : tous les articles non lus
  d'une catégorie ; choisissez l'appareil Miniflux pour tout marquer.
  Résultats : articles marqués, catégorie.
- **Marquer des articles Miniflux comme lus** : un ou plusieurs identifiants
  d'articles, typiquement l'identifiant donné par le déclencheur « Nouvel
  article ». Résultat : articles marqués.
- **Actualiser les flux Miniflux** : Miniflux récupère tous les flux maintenant
  (ou ceux d'une catégorie), quatre à la fois ; les nouveaux articles sont lus
  ensuite. Résultat : flux actualisés.
- **Lire les titres non lus de Miniflux** : les articles non lus les plus
  récents (1 à 10), de toutes les catégories ou d'une seule, marqués comme lus
  ensuite si vous le souhaitez. Résultats : nombre lu, articles non lus en
  tout, titres un par ligne (« Titre — Flux »), titre, lien et flux du plus
  récent.

## Exemples de scènes

- **Revue de presse du matin** : à 7 h 30, _Lire les titres non lus de
  Miniflux_ (catégorie Actualités, 5 articles, puis les marquer comme lus),
  puis envoyer un message Telegram avec son résultat _Titres_ (à insérer avec
  le sélecteur de variables).
- **Surveiller un sujet** : avec `Gladys` dans les mots-clés, _Nouvel article_
  avec le mot-clé `Gladys` → envoyer un message avec le _Titre_ et le _Lien_
  de l'article, puis _Marquer des articles Miniflux comme lus_ avec son
  _Identifiant de l'article_.
- **Flux cassé** : _Flux en erreur_ → envoyer un message avec le _Flux_ et le
  _Message d'erreur_.

## Dépannage

- **« Miniflux a refusé la clé d'API »** : la clé a été supprimée ou mal
  copiée : créez-en une nouvelle dans Paramètres → Clés d'API.
- **« Miniflux ne répond pas »** : vérifiez l'adresse et le port depuis la
  machine de Gladys. Derrière un reverse proxy, saisissez l'adresse complète,
  chemin compris.
- **« Cette adresse ne répond pas comme Miniflux »** : l'adresse mène à un
  autre service, ou à une page de connexion (un proxy d'authentification
  devant Miniflux doit laisser passer `/v1/` avec l'en-tête `X-Auth-Token`).
- **Pas d'événement « Nouvel article »** : les articles arrivent quand
  Miniflux vérifie les flux (toutes les 60 minutes par défaut de son côté),
  puis à la lecture suivante de l'intégration. _Actualiser les flux Miniflux_
  accélère les choses.
- Plus de détails : réglez la variable `LOG_LEVEL` de l'intégration sur
  `debug`.

## Limites

- Les filtres des déclencheurs ne comparent que des valeurs exactes : le
  filtre flux est le titre exact, le filtre mot-clé un des mots-clés
  configurés.
- Les favoris, l'historique de lecture et les flux eux-mêmes ne se gèrent pas
  depuis Gladys.
- Les liens du widget n'ouvrent que des adresses https : un article ou un
  Miniflux en simple http n'a pas de lien.
- Sans lien avec Miniflux.
