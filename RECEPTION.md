# 15B — réception partielle du 8 octobre 2026

15B contient un moteur narratif et deux œuvres distinctes : Kinara Classic et
Nuit Éternelle. Une compilation réussie n'est pas la réception de ces œuvres.

## Lot construction et premier démarrage

La commande de build appelait un script absent. TypeScript seul omettait le
client, les livres, les templates de narration et le schéma SQL lus à l'exécution.
Le premier démarrage échouait aussi sans dossier `data/`. Le build assemble ces
ressources et l'initialisation crée le dossier, sans toucher à une base existante.
Une initialisation échouée ferme sa connexion avant de permettre une reprise.

Trois tests utilisent un runtime compilé isolé, une SQLite jetable et les vrais
fichiers des deux livres. Deux contre-exemples étaient rouges avant correction.
La recette vérifie les empreintes des ressources et leur lecture par les routes
et la construction des prompts, sans fournisseur. Aucune livraison de service
ni réception mobile n'en découle.

## Écarts encore reproduits

- Une sauvegarde renvoie son instantané, mais le serveur conserve l'état ultérieur.
  L'interface affiche l'ancien état puis le prochain tour repart du serveur.
  Pacing et derniers choix ne figurent pas dans l'instantané. La référence de
  partie active écrite en local n'est pas relue à l'initialisation.
- Deux réponses construites depuis le même tour sont appliquées : deux récompenses
  et deux entrées de journal pour un compteur qui n'avance qu'une fois. La
  transaction SQLite atomise chaque réponse sans recevoir l'identité du tour.
- Le validateur d'archive accepte un beat dont le JSON est illisible : il compte
  les noms de fichiers. Installation atomique, chemins/identifiants, références
  et compatibilité de version restent à recevoir.
- La personnalité « passionnel » déclarée par Nuit Éternelle est refusée par la
  liste fixe du moteur. Les quatre axes techniques restent aussi nommés Ubuntu,
  Maât, Sankofa et Biso ; les libellés de livre ne rendent pas le noyau universel.

L'ouverture et les tours appellent un modèle métier à la demande. Cela ne constitue
pas, à soi seul, une dépendance à un agent autonome : le contrat Shinkiro autorise
une capacité IA pilotée depuis une interface humaine. Il n'exige pas un meneur
manuel remplaçant le narrateur. Aucun agent autonome ni Dan n'est requis par les
routes lues ; la recette native sans ces agents reste à effectuer.
Le statut d'accès, la séparation de comptes, les erreurs réseau, la reprise et
les fondations multijoueur ne sont pas reçus. Ne pas publier ce prototype comme
service TPE mutualisé sur la seule foi du build.
Les livres importés/générés sont écrits dans le répertoire de livres du runtime ;
leur stockage durable séparé d'un remplacement d'image reste à recevoir.

## Rapport à Ngoma

15B utilise un d20 et des conséquences proposées par le modèle. Ngoma impose
son système 2d12, une résolution calculée par le code et un canevas de Livre
distinct. Aucun import compatible n'a été reçu. Partager la structure en quinze
beats n'autorise pas à remplacer les règles ou convertir les œuvres en silence.

La factorisation doit conserver l'identité/version/voix de chaque œuvre, déclarer
les mécaniques compatibles et transférer la progression par un reçu vérifiable.
Les contrats de livre, tour, conséquence, sauvegarde et export sont les éléments
à rapprocher ; une fusion des runtimes n'est pas déduite de cet audit.
