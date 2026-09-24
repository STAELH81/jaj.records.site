# Migration protégée AQ-NEO / MySpace

Ce code prépare une migration ; son ajout au dépôt ne sauvegarde et ne migre aucun compte.
Ne supprimer l'ancien compte qu'après une **capture réussie, exportée et vérifiée**.
La Function ne supprime, ne crée ni ne renomme aucun compte Identity. Seule l'action
`apply`, avec le hash du dry-run, peut recopier les métadonnées dans le **nouveau** compte.
Elle ne transfère ni mot de passe, ni session, ni rôle privilégié.

## Prérequis opérateur

- Déployer cette version en production, après essai sur un site de test distinct.
  Les deploy previews sont refusées par la Function de migration.
- Installer `ops/account-migration.sql` dans l'éditeur SQL Supabase avec le propriétaire
  de la base. Ce fichier ne migre aucun message et laisse la maintenance désactivée.
  Vérifier les politiques RLS existantes : les RPC de migration sont réservées à
  `service_role`, jamais aux clés anon/authenticated. Utiliser la clé serveur
  `SUPABASE_SECRET_KEY` déjà utilisée par MySpace.
- Configurer un secret aléatoire d'au moins 32 caractères dans
  `AQ_ACCOUNT_MIGRATION_SECRET`, réservé aux Functions. Ne jamais l'inscrire dans le
  code, le navigateur, une URL, une PR ou un rapport.
- Disposer d'un accès opérateur Netlify / Supabase indépendant du compte à recréer.
- Examiner les stockages réels : cette version couvre les cinq stores de production
  déclarés dans `_shared/account-migration.mjs` et `public.myspace_messages`.
  Un store inconnu, un binaire inconnu ou une autre colonne publique de type
  `user_id` / `owner_id` / `sender_id` / `recipient_id` / `author_id` bloque la capture.
  La détection ne remplace pas un audit des tables ayant des noms de colonnes non
  conventionnels, du stockage Supabase, des intégrations externes ou du navigateur.
  Ajouter et tester un adaptateur avant de poursuivre si de telles données existent.

## Ordre obligatoire

### 1. Capturer l'ancien ID et les données AVANT suppression

Relever `oldUserId` dans Netlify Identity et vérifier le compte/e-mail visé.
Sauvegarder séparément les données locales du navigateur si elles ne sont pas
synchronisées (localStorage, IndexedDB, fichiers locaux ne sont pas accessibles à
la Function). Conserver une sauvegarde générale de la base Supabase.

Activer `AQ_ACCOUNT_MIGRATION_MAINTENANCE=true` sur le site, puis redéployer cette
version avec la variable active. Vérifier que les routes AQ renvoient 503, y compris
GET : certaines lectures créent normalement un profil, une boîte ou un ID ACC.
Ne plus utiliser d'anciennes URL de déploiement, outils, jobs ou accès directs Blobs.
Les anciennes versions déployées n'ont pas ce garde-fou : restreindre leur accès et
arrêter tous les autres producteurs. Les écritures conditionnelles ne peuvent pas
verrouiller ces producteurs externes.

Activer aussi le verrou SQL, qui bloque même les clients Supabase déjà connectés :

```sql
begin;
lock table public.myspace_messages in exclusive mode;
update public.aq_account_migration_control set maintenance = true where singleton;
commit;
```

Attendre la fin des requêtes déjà en cours (au moins 60 secondes), puis lancer avec
Node 22.13+ et les variables d'environnement locales `AQ_MIGRATION_SITE_URL`
(origine HTTPS de production) et `AQ_ACCOUNT_MIGRATION_SECRET` :

```text
node scripts/account-migration.mjs capture OLD_ID
node scripts/account-migration.mjs export OLD_ID ABSOLUTE_PRIVATE_BACKUP_PATH
```

La capture vérifie réellement l'ancien compte avec `admin.getUser`, conserve son
e-mail, ses métadonnées/rôles et une sauvegarde des JSON de production et des messages.
Elle relit la sauvegarde persistée et retourne `captureHash`. Vérifier l'export
avec la fonction `digest` du module de migration (SHA-256 du JSON canonique, pas du
fichier mis en forme), stocker une seconde copie privée et conserver le hash.
Le fichier contient aussi des données d'autres utilisateurs : accès administrateur
uniquement, hors dépôt et hors dossier publié. Le client refuse l'écrasement d'un
fichier existant ; sous Windows, protéger son dossier avec les ACL appropriées.

Les morceaux audio ne sont pas réécrits : leurs clés sont des IDs d'assets aléatoires.
Leurs métadonnées et ETags sont inventoriés ; les manifestes JSON et leurs propriétaires
sont sauvegardés/migrés. Une sauvegarde générale des médias reste nécessaire.

Une capture est immuable. En cas d'erreur ou de changement de données, **arrêter** :
ne pas supprimer le compte, ne pas écraser une ancienne capture. Archiver le dossier
de migration et faire examiner la cause avant de préparer une nouvelle session.

### 2. Recréer le compte, manuellement

Seulement après validation de la sauvegarde, l'opérateur peut supprimer/recréer
le compte dans Identity avec le même e-mail. Utiliser l'administration Identity
pendant la maintenance ; ne pas ouvrir AQ-NEO avec le nouveau compte.
Relever `newUserId`, différent de l'ancien. Confirmer normalement l'e-mail.
Si nécessaire, rétablir manuellement les mêmes rôles après vérification : le mécanisme
ne confère aucun privilège. Les métadonnées du nouveau compte doivent être vides
ou compatibles avec celles sauvegardées.

L'ancien compte absent est accepté uniquement sur une réponse Identity 404. Une
erreur réseau/authentification bloque. S'il existe encore, sa preuve doit toujours
correspondre à la capture. Le nouveau compte doit exister et avoir le même e-mail.

### 3. Dry-run / rapport sans modification des données métier

```text
node scripts/account-migration.mjs dry-run OLD_ID NEW_ID
```

Le rapport est aussi persisté dans le store privé `aq-account-migration-v1`. Il liste
les copies, les mises à jour, les champs Identity, le nombre de messages, les anciennes
clés conservées et les conflits. Vérifier ces éléments et conserver `planHash`.
Le dry-run exige un inventaire inchangé depuis la capture. Une destination existante,
des données/messages du nouveau compte, une collision de métadonnées ou de clés
imbriquées bloque la migration. Il n'existe pas d'option `force` ou de fusion implicite.

Sont traités : profils (avatar/bio/style/mood/musique/Top Friends), références dans
les profils des amis, friendships (clé composite retriée), demandes d'amis, posts,
comments, reactions, wall comments, presence, forums/topics/réponses/demandes,
identifiants ACC et index inverses, cloud snapshots, playlists/player libraries,
ownership des brouillons/médias et profils d'artistes. Les identifiants d'artistes
dérivés du userId sont recalculés et les références JSON associées remappées.
La boîte AQ-Mail conserve sa clé d'adresse ; `aquerty_mail` est restauré dans Identity.
Les références exactes, clés d'objets, segments de chemin et paramètres d'URL sont
remappés récursivement. Le texte libre et les sous-chaînes arbitraires restent intacts.
Les anciens liens partagés hors des données cloud doivent être remplacés manuellement.

### 4. Migrer explicitement avec le hash validé

```text
node scripts/account-migration.mjs apply OLD_ID NEW_ID PLAN_HASH
```

Le client enchaîne des requêtes bornées : une écriture Blobs par requête, puis une
transaction Supabase, puis les métadonnées du nouveau compte. Chaque progression
est journalisée. Avant la première écriture, l'inventaire et le nouveau compte sont
revérifiés. Blobs utilise `onlyIfNew` / `onlyIfMatch`; les références partagées sont
mises à jour après conservation de leur version originale dans la capture.
Les messages sont migrés dans une transaction SQL (sender et recipient ensemble),
avec comparaison intégrale des lignes attendues et refus de données cibles existantes.
IDs de messages, textes, dates et état de lecture sont préservés.

En cas d'interruption, garder la maintenance et relancer **le même** `apply` / hash.
Une écriture déjà effectuée est reconnue sans duplication. Un verrou global sérialise
les migrations ; après un timeout, attendre jusqu'à 120 secondes avant réessai.
Un conflit de données nécessite une revue opérateur, pas des réessais aveugles.
Il n'y a pas de transaction commune à Identity, Blobs et Supabase : une migration
partielle reste en maintenance. Aucun rollback destructif automatique n'est fourni.
La restauration se prépare à partir des sauvegardes, après comparaison de l'état réel.

### 5. Vérifier, puis valider le résultat

```text
node scripts/account-migration.mjs verify OLD_ID NEW_ID PLAN_HASH
```

La vérification compare l'ensemble des JSON (y compris ceux qui n'auraient pas dû
changer), des messages et des empreintes binaires à l'état attendu. Elle vérifie
les métadonnées du nouveau compte et retourne `verified: true` seulement si tout
correspond. Sauvegarder ce rapport. Ne pas désactiver la maintenance sur la seule
réponse `complete` de l'étape apply.

### 6. Nettoyer les reliquats après validation, puis rouvrir

Aucune ancienne clé n'est supprimée automatiquement. Le rapport `retainedOldKeys`
est la liste exacte des copies sources encore présentes. **Avant réouverture**, un
opérateur doit examiner puis supprimer uniquement ces anciennes clés dans Blobs,
après vérification de leurs copies et conservation de la capture/export. En particulier,
les anciens profils/friendships/réactions listés globalement peuvent sinon créer
des doublons ou des références vers l'ancien compte. Ne supprimer ni les clés
partagées mises à jour sur place, ni les médias inchangés, ni la boîte AQ-Mail.

Après ce nettoyage manuel, `verify` signale volontairement l'écart par rapport aux
sources conservées : le rapport de vérification **avant nettoyage**, les opérations
de nettoyage et le contrôle manuel des destinations constituent la validation finale.
Le mécanisme n'a pas de bouton de nettoyage ni d'autorisation de suppression Identity.

Désactiver la maintenance SQL, puis `AQ_ACCOUNT_MIGRATION_MAINTENANCE` et redéployer :

```sql
update public.aq_account_migration_control set maintenance = false where singleton;
```

Tester la connexion et contrôler profil, amis, demandes, publications/commentaires,
messages dans les deux sens, courrier AQ-Mail, playlists et cloud. Effacer les anciennes
sessions du navigateur pour éviter le renvoi d'un snapshot local obsolète. Révoquer le
secret ponctuel, conserver les sauvegardes selon la politique de rétention choisie.
Le marqueur privé `active.json` réserve toute la session à un seul ancien compte,
même entre deux requêtes. Pour une migration ultérieure d'un autre compte, l'opérateur
peut archiver puis retirer ce seul marqueur après clôture complète de la précédente.
Ne jamais le retirer pour contourner une migration incomplète.

## Limites et validation du code

L'inventaire synchrone est volontairement borné à environ 4 Mio de JSON/messages et
40 secondes de parcours. Un dépassement bloque **avant toute écriture métier** ;
préparer alors un adaptateur opérateur paginé/hors ligne, ne pas supprimer les limites
ni le compte. Les previews/deploy-stores ne sont pas migrés. Aucun accès aux données
de production n'est nécessaire pour les tests.

```text
npm ci
npm run test:account-migration
npm run test:publisher
npm run test:player-library
```

Les tests utilisent des stores/Identity simulés pour le parcours HTTP et PostgreSQL
embarqué (PGlite) pour exécuter les vrais RPC, vérifier les droits, le gel des écritures,
les collisions et la reprise. Un essai sur un site de staging et le schéma Supabase réel
reste requis avant toute suppression de compte.
