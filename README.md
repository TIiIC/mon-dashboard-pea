# 📊 DASHBOARD PEA - Guide d'explication pour IA

## 🎯 Vue d'ensemble du projet

### Objectif principal
Application web personnelle de gestion et visualisation d'un Plan d'Épargne en Actions (PEA). L'objectif est de tracker ses investissements, analyser ses performances et visualiser l'évolution de son portefeuille boursier.

### Type de projet
- **Frontend** : Application web statique (HTML/CSS/JS vanilla)
- **Backend** : Google Apps Script (API REST sur Google Sheets)
- **Hébergement** : GitHub Pages
- **Utilisateur** : Mono-utilisateur, données stockées en cache navigateur

---

## 🏗️ Architecture technique

### Stack technologique
- **Frontend** :
  - HTML5 sémantique
  - CSS3 avec variables CSS (thème clair/sombre automatique)
  - JavaScript Vanilla (ES6+)
  - Chart.js pour les graphiques
  - Lucide Icons pour les icônes (CDN)

- **Backend** :
  - Google Apps Script (.gs)
  - Google Sheets comme base de données
  - API REST custom (doGet/doPost)

- **Stockage** :
  - LocalStorage navigateur pour cache des données
  - LocalStorage pour configuration (URL API, objectifs)

### Architecture des données

#### Google Sheets - Structure
Le fichier Google Sheets contient plusieurs feuilles :

1. **"Transaction"** : Journal de toutes les opérations d'achat
   - Colonnes : Date, Nom, Quantité, Prix/u, Frais, Total, Ticker (formule)
   
2. **"Stock Tickers"** : Référentiel des produits avec méthodes de scraping
   - Configuration pour récupération données live/historique

3. **"Data Live"** : Cours en temps réel via formule GOOGLEFINANCE()
   - Colonne B (index 1) : ID_perso (nom de la feuille historique associée)
   - Formules Google Finance pour cours actuels

4. **"Dividende"** : Historique des dividendes perçus
   - Colonnes : Date, Nom, Code, Div/u, Statut, Fréquence
   - Suivi des dividendes reçus par produit avec fréquence de versement
   - **Logique de calcul** : Dividende total = Σ(Montant unitaire × Quantité détenue à la date de versement)

5. **"Plan Invest"** : Planification et suivi des investissements
   - Colonnes : Date Début, Commentaire, Montant, Type, Date de Clôture, Statut
   - Gestion des plans d'investissement programmés (En Cours / Clôturé)
   - **Distribution pro-rata** : Les investissements réels sont répartis proportionnellement entre les plans actifs selon leurs objectifs mensuels

6. **Feuilles individuelles par produit** : Historique des cours
   - Structure à 3 blocs (18 colonnes) :
     - **Bloc 1** (A-F) : Historique Enregistré
     - **Bloc 2** (G-L) : Historique Non Enregistré (Google Finance)
     - **Bloc 3** (M-R) : Autre données
   - Ligne 1 : Ignorée
   - Ligne 2 : Noms des tableaux
   - Ligne 3 : Entêtes (date, open, high, low, close, volume)
   - Ligne 4+ : Données historiques

---

## 🔌 API Google Apps Script - Documentation complète

### 📥 doGet() - Endpoint de lecture

**URL** : `https://script.google.com/macros/s/{SCRIPT_ID}/exec`

**Méthode** : GET

**Réponse** : JSON structuré

#### Structure de la réponse JSON

```javascript
{
  "transactions": Array<Transaction>,      // Historique des achats
  "dataTickers": Array<TickerConfig>,      // Configuration tickers
  "dataLive": Array<LiveData>,             // Cours temps réel (Google Finance)
  "dividende": Array<Dividende>,           // Historique dividendes perçus
  "plan": Array<PlanInvest>,               // Plans d'investissement
  "historiqueProduit": Object<HistoryMap>  // Historiques par produit
}
```

#### Types détaillés avec exemples réels

**Transaction** (feuille "Transaction")
```javascript
{
  date: "2025-04-01T22:00:00.000Z",  // ISO 8601 DateTime
  nom: "CAC 40 EUR (Acc)",           // Nom complet du produit
  quantite: 2,                       // Nombre d'unités achetées
  prix_unitaire: 37.59,              // Prix d'achat unitaire en €
  frais: "",                         // Frais transaction (peut être vide/"")
  total: 75.18,                      // Montant total = (qté × prix) + frais
  ticker: "EPA:CACC"                 // Code ticker généré par formule GS
}
```

**TickerConfig** (feuille "Stock Tickers")
```javascript
{
  nom: "CAC 40 EUR (Acc)",           // Nom du produit
  id_perso: "CAC40",                 // Identifiant court/personnalisé
  type: "Google",                    // Type de source (Google Finance, etc.)
  "code/lien": "EPA:CACC"            // Code ticker ou lien de scraping
}
```
⚠️ **Note** : Clé `code/lien` contient un slash - accès JS via `obj["code/lien"]`

**LiveData** (feuille "Data Live")
```javascript
{
  nom: "CAC 40 EUR (Acc)",           // Nom du produit
  id_perso: "CAC40",                 // ID court (= nom feuille historique)
  tickers_utiliser: "EPA:CACC",      // Ticker utilisé pour GOOGLEFINANCE()
  open: 41.12,                       // Prix d'ouverture (session actuelle)
  high: 41.14,                       // Plus haut du jour
  low: 40.74,                        // Plus bas du jour
  cour: 40.84,                       // Cours actuel (clôture si marché fermé)
  volume: 29173                      // Volume échangé
}
```
⚠️ **Note** : `cour` (sans 's') = cours actuel

**Dividende** (feuille "Dividende")
```javascript
{
  date: "2025-06-03T00:00:00.000Z",  // Date de versement (ISO 8601)
  nom: "La Francaise des jeux",      // Nom du produit
  code: "FDJ",                       // Code ticker
  "div/u": "2,05 €",                 // Dividende par unité (format texte €)
  statut: "Reçus",                   // Statut ("Reçus" ou vide)
  frequence: "Annuel"                // Fréquence de versement
}
```
⚠️ **Notes** : 
- Clé `div/u` contient un slash - accès JS via `obj["div/u"]`
- Dividende peut être `"0,00 €"` pour certaines lignes
- Statut peut être vide (`""`)
- Fréquences possibles : Annuel, Semestriel, Trimestriel, Bimestriel, Mensuel, Bimensuel, Hebdomadaire

**PlanInvest** (feuille "Plan Invest")
```javascript
{
  date_debut: "2025-04-01T00:00:00.000Z",    // Date de début du plan (ISO 8601)
  commentaire: "Investissement Initial",     // Description du plan
  montant: "1 000,00 €",                     // Montant prévu (format texte €)
  type: "PEA",                               // Type de compte (PEA, CTO, etc.)
  date_de_cloture: "2025-05-01T00:00:00.000Z", // Date de fin (ISO 8601 ou vide)
  statut: "Clôturé"                          // Statut ("En Cours" ou "Clôturé")
}
```
⚠️ **Notes** :
- Clé `date_de_cloture` avec underscore et accents
- Montant au format texte avec espace et € : `"1 000,00 €"`
- Date de clôture peut être vide (`""`) si plan "En Cours"
- Statuts possibles : "En Cours", "Clôturé"

**HistoryMap** (feuilles produits individuelles)
```javascript
{
  "CAC40": {                         // Clé = id_perso du produit
    "Historique Enregistré": [       // Données sauvegardées
      {
        date: "2025-01-13T16:40:00.000Z",
        open: 35.63,
        high: 35.68,
        low: 35.37,
        close: 35.6,
        volume: 50196
      }
    ],
    "Historique Non Enregistré": [   // Données Google Finance non sauvées
      {
        date: "2025-12-31T13:05:00.000Z",
        open: 40.28,
        high: 40.35,
        low: 40.13,
        close: 40.35,
        volume: 9728
      }
    ],
    "Live": [                        // Données temps réel (optionnel)
      {
        date: "2026-01-15T23:00:00.000Z",
        open: 93.6,
        high: 94.3,
        low: 92.8,
        close: 92.8,
        volume: 2982
      }
    ]
  },
  "MSCI W": { ... }                  // Autres produits
}
```

---

## 🎨 Interface utilisateur

### Design Pattern
- **Mobile-First** : Responsive design prioritaire mobile
- **Thème adaptatif** : Détection automatique préférence système (clair/sombre) via `@media (prefers-color-scheme: dark)`
- **Progressive Enhancement** : Fonctionne offline avec cache
- **Design System** : Variables CSS centralisées pour cohérence visuelle

### Navigation
Système d'onglets avec **4 vues principales** :
1. **Aperçu** (Dashboard) : KPIs, répartition et positions
2. **Analyse** : Graphiques avancés (versements, évolution, plans)
3. **Dividendes** : Tableau de dividendes, projections et calendrier prévisionnel
4. **Journal** : Historique complet des transactions

**Icônes de navigation** :
- Aperçu : `layout-dashboard`
- Analyse : `trending-up`
- Dividendes : `coins`
- Journal : `history`

### Composants principaux

#### 1. Cartes KPI (Dashboard)

**Carte "Valorisation"** (`card-highlight`)
- Valeur actuelle totale du portefeuille
- Performance globale en pourcentage (avec code couleur)

**Carte "Plus/Moins Value"** (`card-highlight`)
- Gain/Perte total avec distinction :
  - Capital investi (hors dividendes)
  - Dividendes reçus
- Code couleur : vert (gain) / rouge (perte)

**Carte "Allocation"** (`card-highlight`)
- Graphique Pie Chart de la répartition par actif
- Pourcentages dynamiques
- Groupement automatique "Autres" sur mobile si > 6 positions

#### 2. Graphiques (Chart.js)

**Onglet Aperçu :**
- **Répartition Portefeuille** : Doughnut chart avec cutout 65%
  - Tooltip enrichi : Valeur + Pourcentage
  - Groupement intelligent sur mobile (top 5 + "Autres")
  - Palette de couleurs : bleu, vert, orange, rouge, violet, cyan

**Onglet Analyse :**

- **Suivi des Versements** : Bar chart empilé avec :
  - Dataset "Objectif" (bleu) : Part atteinte
  - Dataset "Reste" (bleu clair pointillé) : Restant à faire (mois actuel uniquement)
  - Dataset "Surplus" (vert) : Au-delà de l'objectif
  - Dataset "Manque" (rouge) : Manque (mois passés uniquement)
  - Ligne "Cible" (rouge pointillé) : Objectif mensuel
  - **Plugin personnalisé** : Labels d'écart (+XX € / -XX €) au-dessus des barres
  - **Cartes récapitulatives** :
    - Mois actuel : Réalisé vs Objectif + Barre de progression
    - Bilan annuel : Surplus/Déficit cumulé

- **Capital Investi** : Line chart avec gradient fill
  - Sélecteur de période : 1M, 6M, 1A, YTD, MAX, Custom
  - Tooltip enrichi (Total + Versé)
  - Zoom automatique intelligent selon période
  - **Nouveau** : Axe secondaire (y1) pour montant versé par transaction (bar chart)
  - Double dataset : Investi (line) + Versé (bar)

**Onglet Dividendes :**

- **Cartes KPI dividendes** :
  - **Total Reçu** (`card-highlight success`) : Somme totale des dividendes perçus
  - **Rendement / PRU** (`card-highlight success`) : Dividendes annuels estimés / Total investi × 100

- **Évolution Annuelle** : Bar chart empilé
  - Dataset "Reçus" (bleu) : Dividendes historiques
  - Dataset "Estimés" (bleu clair pointillé) : Projection année en cours
  - Calcul pondéré par quantité détenue à chaque versement
  - Année courante incluse avec estimation automatique

- **Calendrier Prévisionnel** : Table responsive
  - Liste des prochains versements projetés
  - Colonnes : Action, Qté, Div/u, Total
  - Projection basée sur fréquence et dernier dividende
  - Tri chronologique

#### 3. Cartes de Position (`position-card`)

Design unifié avec indicateurs visuels :

**Header** :
- Nom du produit + Ticker (badge)
- Badge de performance coloré :
  - **Vert** (`badge-up`) si gain ≥ 0
  - **Rouge** (`badge-down`) si perte < 0
  - Affichage : ▲/▼ + Pourcentage + Montant

**Détails** (`pos-details`) :
- Valeur actuelle
- Dividendes (ou "-- €" si aucun)
- **Total** (Valeur + Dividendes)
- Bordure supérieure en pointillés pour séparation

**Footer** (`pos-footer`) - 3 colonnes :
- **Unités** : Quantité détenue
- **PRU** : Prix de Revient Unitaire
- **Cours** : Prix actuel (avec couleur dynamique selon variation)

**Interaction** :
- Clic/Tap ouvre l'historique complet du produit
- Bordure gauche colorée selon performance (4px)
- Effet hover : Translation Y + Shadow

#### 4. Journal des transactions (`mobile-card-table`)

**Desktop** :
- Colonnes : Actif, Qté, P.U., Frais, Total
- Ligne cliquable ouvre modal détaillée
- Performance individuelle par transaction

**Mobile** :
- Transformation en cartes avec `data-label`
- Colonnes masquées : `.hide-mobile`
- Layout optimisé touch-friendly

**Affichage** :
- Tri décroissant par date (plus récent en premier)
- Performance calculée en temps réel vs cours actuel
- Badge ▲/▼ avec pourcentage

#### 5. Plans d'Investissement (`plans-grid`)

**Cartes de plan** (`plan-card`) :

**Classes conditionnelles** :
- `.active` : Plan "En Cours" (border-left bleue + gradient background)
- `.closed` : Plan "Clôturé" (border-left grise + opacity 0.8)

**Header** :
- Titre : Commentaire du plan
- Dates : Début → Fin (icône calendrier)
- Badge statut : "En Cours" / "Clôturé"

**Progression** (`plan-progress`) :
- Barre de progression colorée selon taux :
  - < 50% : Rouge
  - 50-75% : Orange (`#f59e0b`)
  - 75-100% : Bleu (primary)
  - ≥ 100% : Dégradé bleu → vert
- Texte : X% réalisé + Montant réalisé / Prévu

**Stats** (`plan-stats-grid`) - 2 colonnes :
- **Écart** : Réalisé - Prévu (vert si positif, rouge si négatif)
- **Transactions** : Nombre d'opérations dans la période

**Footer** (plans en cours uniquement) :
- ⏱️ Temps écoulé : Progression temporelle en pourcentage

**Tri** :
- Plans "En Cours" en premier
- Puis par date de début décroissante

### Modales

#### Modal "Nouvel Achat" (`ticket-modal-content`)

**Style Ticket de Caisse** :
- Border-top bleue (6px)
- Fond blanc/sombre adaptatif
- Titre : "NOUVELLE TRANSACTION" + sous-titre "AJOUTER UN ORDRE"

**Formulaire** :
- **Date** : Input date (pré-rempli avec aujourd'hui)
- **Actif** : Dropdown auto-peuplé depuis `globalLive`
- **Quantité** + **Prix Unitaire** : Grid 2 colonnes
- **Frais** : Optionnel
- **Résumé** : Encadré avec bordure pointillée
  - Sous-total (HT)
  - **TOTAL NET** (grand format, couleur primary)
- **Calcul temps réel** : Event listeners sur inputs

**Actions** :
- Bouton "Valider" : `.btn-primary`
- Bouton "Annuler" : `.btn-text`

#### Modal "Détails Transaction" (`transactionDetailModal`)

**Header** :
- Nom de l'actif (h2)
- Ticker (badge) + Date de transaction
- Cours actuel affiché

**Performance** :
- Badge coloré (vert/rouge) avec ▲/▼ + pourcentage
- Centré visuellement

**Détails** (`pos-row`) :
- Quantité
- P.U. (Prix Unitaire)
- TOTAL HT
- Frais
- Séparateur en pointillés
- **Total Net** (highlighted)

**Actions** :
- Bouton "Supprimer" : `.btn-danger` (avec confirmation)
- Bouton "Fermer" : `.btn-text`

#### Modal "Historique Produit" (`productHistoryModal`)

**Header** :
- Titre : Nom du produit (h2)
- Cours actuel affiché
- Bouton fermeture (icône X)

**Table** :
- Colonnes : Date, Qté, P.U., Frais, Total
- Responsive avec `mobile-card-table`
- Performance calculée par ligne

**Scroll** :
- Max-height : 60vh
- Overflow-y : auto

---

## 🔄 Flux de données

### Cycle de vie de l'application

1. **Initialisation** (DOMContentLoaded)
   ```
   → Vérifier URL API stockée
   → Si absente : showConfigModal()
   → Charger cache local : loadCachedData() (affichage immédiat)
   → Lancer fetchData() en arrière-plan
   → setupEventListeners() + setupTabs()
   → Initialiser Lucide Icons
   ```

2. **Synchronisation**
   ```
   fetchData() → doGet() Google Apps Script
   → Réception JSON
   → Mise à jour cache localStorage
   → processData() :
      → globalTransactions, globalDividendes, globalPlan
      → reconstructLive()
      → tickerToNameMap
      → verifyHistoricalData()
      → analyzeInvestmentPlans()
      → calculatePeriodicDividends()
   → renderDashboard() + renderPlansSection() + renderDividendsTab()
   ```

3. **Ajout transaction**
   ```
   Formulaire ticket → Validation
   → doPost(type:"ACHAT") → Google Sheets
   → Attente 2s → fetchData() → Refresh complet
   ```

4. **Suppression transaction**
   ```
   Modal détail → Confirmation
   → doPost(type:"DELETE") → Google Sheets
   → Attente 2s → fetchData() → Refresh complet
   ```

5. **Synchronisation historique**
   ```
   verifyHistoricalData() détecte anomalies
   → Propose sync automatique après 1s
   → doPost(type:"SYNC_HISTORY") → Mise à jour feuilles produits
   → fetchData() → Refresh
   ```

### Stratégie de cache
- **Chargement optimiste** : Affiche le cache immédiatement
- **Sync silencieuse** : Rafraîchit en arrière-plan sans loader si données déjà affichées
- **Fallback offline** : Continue de fonctionner avec données en cache
- **Indicateur de statut** : 
  - "Mémoire" : Données depuis cache
  - "Sync..." : Synchronisation en cours
  - "À jour" : Dernière sync réussie
  - "Hors Ligne" : Erreur API mais cache disponible
  - "Erreur Sync" : Erreur sans cache

---

## 🧮 Logique métier

### Calculs principaux

#### Performance d'un actif
```javascript
// Prix moyen pondéré
achat_moyen = Σ(total investi) / Σ(quantités)

// Valeur actuelle
valeur_actuelle = cours_actuel × quantité

// Dividendes totaux (LOGIQUE CLEF)
dividende_total = Σ(dividende_unitaire × quantité_détenue_à_date_versement)

// Performance globale
performance = ((valeur_actuelle + dividendes - coût_total) / coût_total) × 100

// Gain/Perte
gain_perte = (cours - prix_moyen) × unités + dividendes
```

#### Reconstruction des données "live"
⚠️ **PRINCIPE FONDAMENTAL** : Le frontend **recalcule dynamiquement** toutes les métriques.

**Fonction `reconstructLive(dataLive, transactions, dividendes)`** :
- **Source de vérité** : `transactions` (achats réels) + `dataLive` (cours actuels) + `dividendes`
- **Calculs effectués** :
  - Unités détenues = Σ quantités transactions
  - Prix moyen = Σ totaux / Σ quantités
  - Valeur actuelle = cours × unités
  - Dividendes = `getProductDividend(item, dividendes, transactions)`
  - Performance = ((valeur + dividendes - coût) / coût) × 100
  - Gain/Perte = (cours - prix_moyen) × unités + dividendes

**Cette approche garantit** :
- Cohérence des données affichées
- Indépendance vis-à-vis des formules Google Sheets
- Possibilité de détecter incohérences via `verifyHistoricalData()`

#### Calcul des dividendes (LOGIQUE AVANCÉE)

**Fonction `getProductDividend(item, dividendes, transactions)`** :

```javascript
// Pour chaque dividende versé :
// 1. Filtrer les dividendes du produit (match ticker ou nom)
// 2. Pour chaque versement :
//    - Récupérer date de versement
//    - Calculer quantité d'actions possédées À CETTE DATE
//    - Dividende réel = montant_unitaire × quantité_à_date
// 3. Sommer tous les dividendes réels

// Exemple concret :
// - 03/06/2025 : Dividende 2,05€, je possède 10 actions → 20,50€
// - 03/12/2025 : Dividende 2,05€, je possède 15 actions → 30,75€
// → Total dividendes = 51,25€
```

**Fonction `getQuantityAtDate(productTransactions, dateLimitStr)`** :
- Filtre les transactions **avant ou le jour même** de la date limite
- Somme les quantités achetées
- Permet de connaître le nombre d'actions détenues à une date précise

**Fonction `calculatePeriodicDividends(dividendes, transactions)`** :
- Agrège les dividendes par année pour le graphique
- Applique la même logique de pondération par quantité détenue

#### Projection des dividendes

**Fonction `projectNextDividend(product, history)`** :
- Analyse l'historique des dividendes passés
- Détecte la fréquence de versement (Annuel, Semestriel, Trimestriel, etc.)
- Calcule la prochaine date probable
- Projette le montant basé sur :
  - Dernier dividende unitaire versé
  - Quantité actuellement détenue
  - Fréquence de versement

**Fonction `getDividendProjections()`** :
- Génère les projections pour tous les produits du portefeuille
- Calcule le montant annuel estimé par produit
- Tri chronologique des prochains versements
- Retourne tableau de projections avec :
  - Ticker, Nom, Date prévue
  - Valeur unitaire, Quantité
  - Montant prochain versement
  - Annuel estimé, Fréquence

**Affichage dans l'onglet Dividendes** :
- **KPI "Dividendes Annuels Estimés"** : Somme des projections annuelles
- **KPI "Prochains 30 Jours"** : Somme des versements dans le mois à venir
- **Calendrier Prévisionnel** : Table avec tous les versements projetés

#### Distribution des plans d'investissement (PRO-RATA)

**Fonction `distributeInvestmentsByMonth(plans, transactions)`** :

**Logique** :
1. Regrouper investissements réels par mois (clé "YYYY-MM")
2. Pour chaque mois :
   - Identifier plans actifs durant ce mois (chevauchement de dates)
   - Calculer total des objectifs mensuels de ces plans
   - **Répartir proportionnellement** l'argent réellement investi :
     ```javascript
     Part_Plan = (Objectif_Plan / Total_Objectifs_Actifs) × Argent_Investi_Mois
     ```
3. Accumuler pour chaque plan

**Exemple concret** :
```
Mois : Janvier 2025
Argent réellement investi : 800€

Plans actifs :
- Plan A : Objectif 500€/mois
- Plan B : Objectif 300€/mois
Total objectifs : 800€

Répartition :
- Plan A reçoit : (500/800) × 800 = 500€
- Plan B reçoit : (300/800) × 800 = 300€
```

**Fonction `analyzeInvestmentPlans(plans, transactions)`** :

Calcule pour chaque plan :
- **Durée effective** : Nombre de mois entre début et fin
- **Montant prévu** : Objectif mensuel × Durée
- **Montant réalisé** : Via distribution pro-rata
- **Écart** : Réalisé - Prévu
- **Écart actuel** : Réalisé - (Objectif mensuel × Mois écoulés)
- **Taux de réalisation** : (Réalisé / Prévu) × 100
- **Progression temporelle** : % de temps écoulé
- **Nombre de transactions** : Dans la période du plan

**Avantages** :
- Attribution juste et proportionnelle
- Gère les périodes où plusieurs plans se chevauchent
- Permet de comparer Prévisionnel vs Réel de manière précise

#### Matching Ticker → Produit (FALLBACK ROBUSTE)

**Système de fallback hiérarchique** :

```javascript
// Priorité 1 : id_perso
transactions.filter(t => t.ticker === item.id_perso)

// Priorité 2 : tickers_utiliser
transactions.filter(t => t.ticker === item.tickers_utiliser)

// Priorité 3 : nom
transactions.filter(t => t.nom === item.nom)
```

**Fonction `findLiveItem(identifier)`** :
- Cherche d'abord par ticker exact (id_perso ou ticker_backup)
- Puis par nom (liste_produits)
- Retourne `null` si aucun match

⚠️ **Notes** :
- Tous les tickers normalisés : `.toUpperCase().trim()`
- Comparaisons insensibles à la casse
- Si aucun match → retourne `[]` ou `0` (jamais d'erreur)

#### Vérification des données historiques

**Fonction `verifyHistoricalData(result)`** :

Détecte automatiquement :
- **Lignes manquantes** : Dates dans "Historique Non Enregistré" absentes de "Historique Enregistré"
- **Lignes différentes** : Dates existantes avec données mises à jour

Stockage :
```javascript
missingHistories = [
  { ID_perso: "CAC40", data: { date: "2025-01-15", open: 41.12, ... } }
]

mismatchedHistories = [
  { ID_perso: "MSCI W", data: { date: "2025-01-14", close: 6.30, ... } }
]
```

**Action** : Si anomalies → Propose sync automatique après 1 seconde

### Objectif mensuel d'investissement

**Graphique Historique Versements** :
- Bar chart empilé avec 5 datasets :
  1. **Ligne rouge pointillée** : Ligne de cible (objectif mensuel)
  2. **Bleu** : Objectif atteint
  3. **Bleu clair pointillé** : Restant à faire (mois actuel uniquement)
  4. **Vert** : Surplus au-delà de l'objectif
  5. **Rouge** : Manque (mois passés uniquement)

**Cartes info** :
- **Mois actuel** : Réalisé vs Objectif + Barre de progression (card position style)
- **Bilan annuel** : Surplus/Déficit cumulé

**Plugin Chart.js custom** :
- Affiche labels d'écart (+XX € ou -XX €) au-dessus des barres
- Couleur dynamique selon signe (vert positif / rouge négatif)
- Positionnement intelligent (topY de la pile)

---

## 🎯 Fonctionnalités actuelles

### ✅ Implémenté (2025)

#### Gestion des transactions
- [x] Ajout de transactions (achat uniquement)
- [x] Suppression de transactions avec confirmation
- [x] Historique détaillé par produit
- [x] Journal complet avec performance temps réel

#### Visualisation des performances
- [x] Dashboard KPI (Valeur actuelle + Gain/Perte)
- [x] Graphique répartition portefeuille (Pie chart)
- [x] Cartes de position interactives
- [x] Performance individuelle par transaction

#### Graphiques avancés
- [x] Historique versements mensuels avec objectif
  - [x] Distribution intelligente (Objectif/Surplus/Manque)
  - [x] Labels dynamiques d'écart
  - [x] Cartes récapitulatives
- [x] Évolution cumulative multi-périodes (1m → MAX + Personnalisé)
  - [x] Axe secondaire pour montants versés
  - [x] Double dataset (Investi + Versé)
- [x] **Graphique dividendes annuel** (Nouveau 2025)
  - [x] Calcul pondéré par quantité détenue
  - [x] Agrégation par année
  - [x] Projection année en cours

#### Gestion des dividendes
- [x] Calcul intelligent basé sur quantité détenue à date de versement
- [x] Intégration dans performance globale
- [x] Affichage dans cartes de position
- [x] **Graphique annuel** (Nouveau)
- [x] **Onglet dédié** avec :
  - [x] KPI Total Reçu
  - [x] KPI Rendement / PRU
  - [x] Calendrier prévisionnel
  - [x] Projections des prochains versements
  - [x] Table historique des versements

#### Suivi plans d'investissement
- [x] **Section dédiée dans onglet Analyse** (Nouveau 2025)
- [x] **Distribution pro-rata mensuelle** (Logique avancée)
- [x] Cartes de progression par plan
- [x] Barre de progression colorée (4 niveaux)
- [x] Écart vs Prévisionnel
- [x] Écart actuel (vs théorique à date)
- [x] Progression temporelle (plans en cours)
- [x] Tri intelligent (En Cours → Récents)
- [x] Statistiques mensuelles globales pour graphique versements

#### Fonctionnalités techniques
- [x] Mode hors ligne (cache localStorage)
- [x] Thème clair/sombre automatique
- [x] Design responsive mobile-first
- [x] Système de retry automatique (3 tentatives)
- [x] Synchronisation historique automatique
- [x] Gestion robuste des types (parsing €, dates, nombres)
- [x] Loader full-screen avec backdrop blur
- [x] Icônes Lucide (CDN)
- [x] CSS externalisé avec design system

### 🔮 Évolutions futures prévues

#### Analyses avancées
- [ ] Graphique rendement annualisé
- [ ] Score de diversification (indice Herfindahl)
- [ ] Comparaison avec indices de référence (CAC40, S&P500)
- [ ] Projections de performance (Monte Carlo)
- [ ] Heat map des performances

#### Gestion avancée
- [ ] Gestion des ventes (type VENTE dans transactions)
- [ ] PRU pondéré après ventes
- [ ] Plus/moins-values réalisées vs latentes
- [ ] Import/Export CSV
- [ ] Alertes de prix configurables

#### Amélioration dividendes
- [ ] Saisie manuelle de dividendes (interface activée)
- [ ] Historique des modifications manuelles
- [ ] Export calendrier dividendes (iCal)

#### Améliorations UX
- [ ] Notifications push (objectifs, alertes)
- [ ] Rapports PDF exportables
- [ ] Mode dark/light manuel (override auto)
- [ ] Tutoriel interactif premier lancement

---

## 🛠️ Points techniques importants

### Gestion des erreurs
- **Retry automatique** : 3 tentatives avec délai 1s (`fetchWithRetry()`)
- **Mode dégradé** : Affichage cache si API inaccessible
- **Feedback utilisateur** : Badge statut clair (Mémoire/Sync/À jour/Hors Ligne/Erreur)

### Performance
- **Chargement optimiste** : Cache affiché immédiatement
- **Sync silencieuse** : Pas de loader si données déjà présentes
- **Debouncing** : Calculs temps réel formulaires
- **Charts intelligents** : Destruction avant recréation
- **Groupement mobile** : Pie chart limite à top 5 + "Autres" si > 6 positions

### UX/UI
- **Animations** : Transitions fluides (fadeIn, slideUp, stagger)
- **Hover states** : Feedback visuel (transform, box-shadow)
- **Modal overlay** : Backdrop blur 8px
- **Touch-friendly** : Zones clic ≥48px mobile
- **Double-tap configuration** : Status badge pour modifier URL API
- **Loader full-screen** : Avec texte dynamique et backdrop blur

### Gestion des types de données

#### Nettoyage des nombres
```javascript
function cleanNumber(val) {
  if (val === undefined || val === null) return 0;
  return parseFloat(val.toString().replace(',', '.')) || 0;
}
```

⚠️ **Google Sheets peut retourner** :
- Nombres avec virgule
- Chaînes vides `""`
- `null` / `undefined`
- Format texte avec € (`"2,05 €"`)

#### Parsing spécialisés
```javascript
// Dividendes : "2,05 €" → 2.05
function parseDividende(divString) {
  const cleaned = divString.toString()
    .replace(/[€\s]/g, '')
    .replace(',', '.')
    .trim();
  return parseFloat(cleaned) || 0;
}

// Montants plans : "1 000,00 €" → 1000.00
function parseMontant(montantString) {
  return cleanNumber(
    montantString.replace('€', '').replace(/\s/g, '').trim()
  );
}

// Formatage Euro
function formatEuro(val) {
  return cleanNumber(val).toLocaleString('fr-FR', { 
    style: 'currency', currency: 'EUR' 
  });
}
```

#### Gestion des dates
- **API retourne** : ISO 8601 (`"2025-04-01T22:00:00.000Z"`)
- **Conversion** : `new Date(isoString)`
- **Affichage** : `date.toLocaleDateString('fr-FR')` → `"02/04/2025"`
- **Input HTML** : Format `YYYY-MM-DD`

### Variables globales essentielles

```javascript
// Correspondances et données
tickerToNameMap = {}         // Ticker → Nom (dropdown)
globalTransactions = []      // Cache transactions
globalLive = []              // Résultat reconstructLive()
globalDividendes = []        // Cache dividendes
globalPlan = []              // Cache plans

// UI et état
displayedTransactions = []   // Transactions affichées (index modal)
activePeriod = '1m'          // Période graphique cumulatif
customDateRange = {}         // Dates personnalisées

// Vérification historique
missingHistories = []        // À ajouter
mismatchedHistories = []     // À mettre à jour

// Instances Chart.js
barChartInstance = null
pieChartInstance = null
cumulativeChartInstance = null
dividendChartInstance = null
```

⚠️ **IMPORTANT** : Toujours `.destroy()` Chart.js avant recréation

### Mode NO-CORS
```javascript
fetch(API_URL, { 
  method: 'POST', 
  mode: 'no-cors',  // ⚠️ OBLIGATOIRE pour Google Apps Script
  // ...
})
```
**Conséquence** : Réponse **non accessible** en JavaScript après POST
- **Solution** : Attendre 2s puis `fetchData()` pour vérifier état

---

## ⚠️ Pièges courants et solutions

### 1. Incohérence données live vs calculées
**Problème** : Pas de feuille "Table Produit" dans l'architecture
**Solution** : **TOUJOURS** utiliser `reconstructLive()` pour calculs dynamiques

### 2. Matching ticker échoue
**Problème** : Produit non trouvé malgré présence
**Solution** : Vérifier 3 clés (id_perso, tickers_utiliser, nom) + logs debug

### 3. Graphique ne se met pas à jour
**Problème** : Chart.js instance non détruite
**Solution** : `if (chartInstance) chartInstance.destroy()` avant `new Chart()`

### 4. Dividendes mal calculés
**Problème** : Quantité actuelle utilisée au lieu de quantité à date versement
**Solution** : Utiliser `getQuantityAtDate()` pour chaque dividende

### 5. Plans d'investissement incohérents
**Problème** : Attribution simple au lieu de pro-rata
**Solution** : Utiliser `distributeInvestmentsByMonth()` pour répartition proportionnelle

### 6. Dates mal formatées
**Problème** : Confusion formats ISO/FR/Input
**Solution** : 
- Stockage : ISO 8601
- Affichage : `toLocaleDateString('fr-FR')`
- Input : Format natif navigateur

### 7. Groupement mobile Pie Chart
**Problème** : Trop de segments illisibles sur petit écran
**Solution** : Détection `window.innerWidth < 768` → groupement top 5 + "Autres"

### 8. Projections dividendes incorrectes
**Problème** : Fréquence mal détectée ou dernier dividende = 0
**Solution** : Vérifier historique avec `montantUnitaire > 0` et dates valides

---

## 📋 Checklist modifications

- [ ] Variables globales mises à jour ?
- [ ] Cache localStorage invalidé si nécessaire ?
- [ ] Graphiques Chart.js détruits ?
- [ ] Responsive mobile testé ?
- [ ] Calculs utilisent `cleanNumber()` ?
- [ ] Tickers normalisés (uppercase + trim) ?
- [ ] Event listeners enregistrés ?
- [ ] Mode offline fonctionnel ?
- [ ] Icônes Lucide initialisées ?
- [ ] CSS variables respectées ?

---

## 🔐 Sécurité et configuration

### Configuration utilisateur
- **URL API** : `localStorage.getItem('pea_api_url')`
- **Objectif mensuel** : `localStorage.getItem('pea_monthly_objective')`
- **Cache données** : `localStorage.getItem('pea_data_cache')`
- **Dividendes manuels** : `localStorage.getItem('pea_manual_dividendes')`

### Sécurité
- **No-CORS** : Évite problèmes CORS Google Apps Script
- **Validation client** : Required attributes formulaires
- **Sanitization** : Nettoyage inputs (trim, uppercase)
- **Double-tap config** : Modification URL API sécurisée (mobile + desktop)

### Données sensibles
- Aucune donnée sensible (pas mot de passe)
- API URL publique (déploiement GAS)
- Données financières en cache navigateur uniquement

---

## 🛠️ Debug et maintenance

### Points de debug
- `console.log` flux données
- Badge statut état sync
- Double-clic/tap badge → modifier URL API
- Console : `localStorage.getItem('pea_data_cache')`

### Problèmes connus
1. **Matching tickers** : Fallback peut échouer si incohérence
2. **Cache obsolète** : Pas de TTL, indicateur "Hors Ligne"
3. **Gestion historique** : Coûteuse avec beaucoup données
4. **Frais vides** : GS retourne `""` → `cleanNumber()` gère
5. **Mode no-cors** : Impossible lire réponse POST → Timeout 2s
6. **Projections** : Nécessitent au moins 1 dividende historique

### Outils debug
```javascript
// Cache complet
JSON.parse(localStorage.getItem('pea_data_cache'))

// Données globales
console.log(globalTransactions, globalLive, globalDividendes, globalPlan)

// Map tickers
console.log(tickerToNameMap)

// Projections dividendes
console.log(getDividendProjections())

// Force reload
fetchData()

// Nettoyer
localStorage.removeItem('pea_data_cache')
location.reload()
```

---

## 📊 Récapitulatif - État du projet (2025)

### Architecture
✅ Frontend statique HTML/CSS/JS  
✅ CSS externalisé avec design system  
✅ Backend Google Apps Script  
✅ Cache localStorage offline  
✅ Mobile-first responsive  
✅ Icônes Lucide (CDN)  

### Flux de données
✅ Source vérité : Google Sheets (6 feuilles)  
✅ API : doGet() + doPost() (3 opérations)  
✅ Frontend recalcule tout via `reconstructLive()`  
✅ Dividendes pondérés par quantité à date  
✅ Plans avec distribution pro-rata mensuelle  

### Fonctionnalités clés
✅ Dashboard KPI + Graphiques avancés  
✅ Gestion transactions (ajout/suppression)  
✅ Calcul dividendes intelligent  
✅ **Projections dividendes** (Nouveau)  
✅ **Onglet Dividendes complet** (Nouveau)  
✅ **Suivi plans d'investissement** (Nouveau)  
✅ **Graphique dividendes annuel** (Nouveau)  
✅ Historique versements avec objectif  
✅ Évolution cumulative multi-périodes  
✅ Mode offline robuste  

### Particularités techniques
✅ Mode no-cors obligatoire  
✅ Chargement optimiste + sync background  
✅ Matching multi-critères  
✅ Gestion types robuste  
✅ Chart.js destroy avant recréation  
✅ Loader full-screen avec backdrop  
✅ Configuration tactile (double-tap)  

### Maintenance
✅ Code commenté et structuré  
✅ Debug tools (localStorage, console, badge)  
✅ Conventions nommage cohérentes  
✅ Architecture extensible  
✅ CSS variables pour thèmes  

---

## 📞 Notes finales

**Évolutivité** : Projet modulaire et extensible. Nouvelles fonctionnalités doivent s'intégrer naturellement.

**Philosophy** : Simplicité, performance et expérience utilisateur fluide.

**Dernière mise à jour** : Janvier 2025 - Intégration complète système plans d'investissement, onglet dividendes avec projections, et CSS externalisé avec design system.