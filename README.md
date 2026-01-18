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

5. **"Plan Invest"** : Planification et suivi des investissements
   - Colonnes : Date Début, Commentaire, Montant, Type, Date de Clôture, Statut
   - Gestion des plans d'investissement programmés (En Cours / Clôturé)

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

**HistoryRow** (ligne d'historique)
```javascript
{
  date: "2025-01-13T16:40:00.000Z",  // ISO 8601 DateTime
  open: 35.63,                       // Prix ouverture
  high: 35.68,                       // Plus haut
  low: 35.37,                        // Plus bas
  close: 35.6,                       // Prix clôture
  volume: 50196                      // Volume échangé
}
```

---

### 📤 doPost() - Endpoint d'écriture

**URL** : Même que doGet()

**Méthode** : POST

**Content-Type** : `application/json`

**Mode CORS** : `no-cors` (depuis frontend)

#### Opérations supportées

##### 1. AJOUT DE TRANSACTION

**Payload**
```javascript
{
  "type": "ACHAT",              // Optionnel (par défaut si absent)
  "date": "2025-01-16",         // Format ISO
  "nom": "Amundi MSCI World",   // Nom du produit
  "ticker": "CW8",              // Code ticker
  "quantite": 10,
  "prix": 450.50,               // Prix unitaire
  "frais": 5.00,
  "total": 4510.00              // Calculé : (qté × prix) + frais
}
```

**Traitement**
- Ajoute une ligne à la fin de la feuille "Transaction"
- Génère automatiquement la formule Ticker en colonne G

**Réponse succès**
```javascript
{
  "status": "success",
  "action": "add"
}
```

---

##### 2. SUPPRESSION DE TRANSACTION

**Payload**
```javascript
{
  "type": "DELETE",
  "nom": "Amundi MSCI World",   // Ou ticker
  "ticker": "CW8",
  "quantite": 10,
  "total": 4510.00
}
```

**Traitement**
- Recherche la transaction correspondante (matching : nom/ticker + quantité + total)
- Parcourt de la fin vers le début pour trouver la plus récente
- Supprime la ligne trouvée
- Utilise tolérance de ±0.001 pour quantité, ±0.01 pour total (flottants)

**Réponse succès**
```javascript
{
  "status": "success",
  "action": "delete"
}
```

**Réponse erreur**
```javascript
{
  "status": "error",
  "message": "Transaction introuvable dans le fichier"
}
```

---

##### 3. SYNCHRONISATION HISTORIQUE

**Payload**
```javascript
{
  "type": "SYNC_HISTORY",
  "data": [
    {
      "ID_perso": "CW8",
      "data": {
        "date": "2025-01-15",
        "open": 450.00,
        "high": 452.00,
        "low": 449.50,
        "close": 451.00,
        "volume": 125000
      }
    },
    // ... autres lignes
  ]
}
```

**Traitement**
- Appelle `syncAllProducts(ss)` qui parcourt tous les produits listés dans "Data Live"
- Pour chaque produit :
  - Lit "Historique Non Enregistré" (colonnes G-L)
  - Compare avec "Historique Enregistré" (colonnes A-F)
  - Applique les mises à jour si données différentes
  - Ajoute les nouvelles lignes manquantes
- Utilise un système de Map pour optimisation (recherche par date)
- Comparaison tolérante pour flottants (±0.0001)

**Réponse succès**
```javascript
{
  "status": "success",
  "action": "sync",
  "count": 15                   // Nombre de produits synchronisés
}
```

---

### 🔒 Mécanismes de sécurité

#### Lock Service
- Utilise `LockService.getScriptLock()` pour éviter conflits
- Timeout 10 secondes
- Garantit l'atomicité des opérations d'écriture

#### Gestion des erreurs
- Try/catch global sur doPost()
- Retour JSON standardisé avec status + message
- Lock toujours releasé (finally)

---

### 🛠️ Fonctions utilitaires

#### getSheetData(sheet)
Convertit une feuille Google Sheets en array d'objets JSON
- Ligne 1 = entêtes (transformés en clés snake_case)
- Lignes suivantes = données
- Normalisation : minuscules, espaces → underscores

#### getProductSheetData(sheet)
Parser spécifique pour feuilles historiques produits
- Gère structure complexe à 3 blocs
- Ligne 2 : noms des tableaux
- Ligne 3 : entêtes
- Retourne objet avec tableaux nommés
- Filtre les lignes vides

#### syncProductSheet(sheet)
Synchronise une feuille produit individuelle
- Compare "Historique Enregistré" vs "Non Enregistré"
- Détecte différences et manques
- Applique updates + appends
- Optimisé avec Map pour recherches rapides

---

## 🎨 Interface utilisateur

### Design Pattern
- **Mobile-First** : Responsive design prioritaire mobile
- **Thème adaptatif** : Détection automatique préférence système (clair/sombre)
- **Progressive Enhancement** : Fonctionne offline avec cache

### Navigation
Système d'onglets avec 3 vues principales :
1. **Résumé** : Dashboard avec KPIs et répartition portefeuille
2. **Analyse** : Graphiques d'investissement (versements mensuels, évolution cumulative)
3. **Historique** : Liste détaillée des opérations

### Composants principaux

#### 1. Cartes KPI (Dashboard - Onglet Résumé)
- **Valeur Actuelle** : Valorisation totale du portefeuille
- **Gain/Perte Totale** : Performance globale (capital investi + dividendes)

#### 2. Graphiques (Chart.js)

**Onglet Résumé** :
- **Répartition Portefeuille** : Pie chart de l'allocation par actif

**Onglet Analyse** :
- **Historique Versements** : Bar chart empilé avec objectif mensuel
- **Évolution Cumulative** : Line chart des investissements dans le temps (1m, 6m, 1y, YTD, 5y, MAX, personnalisé)

#### 3. Cartes de Position (Onglet Résumé)
Affichage sous forme de cartes (card layout) pour chaque actif :
- Nom du produit + Ticker
- Badge de performance (% et €)
- Détails : Valeur, Dividendes, Total
- Footer : Unités, Prix moyen, Cours actuel

#### 4. Journal des transactions (Onglet Historique)
Table responsive avec :
- Desktop : Date, Actif, Qté, PU, Frais, Total
- Mobile : Transformation en cartes interactives

### Modales

#### Modal "Nouvel Achat" (Style Ticket de Caisse)
Formulaire d'ajout de transaction :
- Date, Actif (dropdown), Quantité, Prix Unitaire, Frais
- Calcul automatique Total HT et Net à payer
- Validation et envoi vers Google Sheets

#### Modal "Détails Transaction"
Vue détaillée d'une transaction avec :
- Informations complètes
- Performance actuelle vs prix d'achat
- Bouton de suppression

#### Modal "Historique Produit"
Liste de toutes les transactions pour un actif spécifique :
- Cours actuel
- Détail par transaction avec performance individuelle

---

## 🔄 Flux de données

### Cycle de vie de l'application

1. **Initialisation** (DOMContentLoaded)
   ```
   Vérifier URL API stockée → Si absente : modal config
   → Charger cache local (affichage immédiat)
   → Lancer fetchData() en arrière-plan
   ```

2. **Synchronisation**
   ```
   fetchData() → doGet() Google Apps Script
   → Réception JSON
   → Mise à jour cache localStorage
   → Traitement : processData()
   → Rendu visuel : renderDashboard()
   ```

3. **Ajout transaction**
   ```
   Formulaire → Validation
   → doPost(type:"ACHAT") → Google Sheets
   → Attente 2s → fetchData() → Refresh affichage
   ```

4. **Suppression transaction**
   ```
   Modal détail → Confirmation
   → doPost(type:"DELETE") → Google Sheets
   → Attente 2s → fetchData() → Refresh affichage
   ```

### Stratégie de cache
- **Chargement optimiste** : Affiche le cache immédiatement
- **Sync silencieuse** : Rafraîchit en arrière-plan
- **Fallback offline** : Continue de fonctionner avec données en cache
- **Indicateur de statut** : Badge (Mémoire / Sync... / À jour / Hors Ligne)

---

## 🧮 Logique métier

### Calculs principaux

#### Performance d'un actif
```
achat_moyen = Σ(total investi) / Σ(quantités)
valeur_actuelle = cours_actuel × quantité
dividende_total = récupéré depuis data live
performance = ((valeur_actuelle + dividendes - coût_total) / coût_total) × 100
```

#### Reconstruction des données "live"
⚠️ **IMPORTANT** : Le frontend ne fait **PAS confiance** à une feuille "Table Produit" (qui n'existe plus dans l'architecture actuelle).

La fonction `reconstructLive()` **recalcule dynamiquement** toutes les métriques à partir des données brutes :
- **Source de vérité** : `transactions` (achats réels) + `dataLive` (cours actuels)
- **Unités détenues** : Somme des quantités de toutes les transactions du produit
- **Prix moyen d'achat** : Σ(total investi) / Σ(quantités)
- **Valeur actuelle** : cours actuel × unités détenues
- **Dividendes** : Récupérés depuis `dividende` via `getProductDividend()`
- **Performance** : ((valeur + dividendes - coût) / coût) × 100
- **Gain/Perte** : (cours - prix_moyen) × unités + dividendes

Cette approche garantit :
- Cohérence des données affichées
- Calculs indépendants des formules Google Sheets
- Possibilité de détecter incohérences (via `verifyHistoricalData()`)

#### Matching Ticker → Produit
Système de fallback robuste pour lier les différentes sources de données :

**Priorité de matching** :
1. **id_perso** (identifiant principal depuis `dataLive`)
2. **tickers_utiliser** (ticker alternatif depuis `dataLive`)
3. **nom** (nom complet du produit)

**Fonction `getProductTransactions(item, transactions)`**
```javascript
// Cas 1 : Match par id_perso
transactions.filter(t => t.ticker === item.id_perso)

// Cas 2 : Match par tickers_utiliser
transactions.filter(t => t.ticker === item.tickers_utiliser)

// Cas 3 : Match par nom
transactions.filter(t => t.nom === item.nom)
```

**Fonction `getProductDividend(item, resultDividende)`**
```javascript
// Recherche les dividendes pour un produit donné
// Parcourt result.dividende et somme les montants
// Retourne 0 si aucun match trouvé
```

⚠️ **Notes** :
- Tous les tickers sont normalisés : `.toUpperCase().trim()`
- Comparaisons insensibles à la casse
- Si aucun match, retourne `[]` ou `0` (pas d'erreur)

#### Vérification des données historiques
La fonction `verifyHistoricalData()` détecte automatiquement :
- **Lignes manquantes** : Dates présentes dans "Historique Non Enregistré" mais absentes de "Historique Enregistré"
- **Lignes différentes** : Dates existantes mais avec données mises à jour (open, high, low, close, volume)

Stockage dans variables globales :
```javascript
missingHistories = [
  { ID_perso: "CAC40", data: { date: "2025-01-15", open: 41.12, ... } }
]

mismatchedHistories = [
  { ID_perso: "MSCI W", data: { date: "2025-01-14", close: 6.30, ... } }
]
```

Si anomalies détectées → Proposition de synchronisation automatique après 1 seconde

### Objectif mensuel d'investissement
- Objectif configurable (défaut 500€)
- Comparaison mois actuel vs objectif
- Calcul surplus/manque cumulé sur l'année
- Bar chart empilé avec code couleur :
  - **Bleu** : Part atteinte de l'objectif
  - **Vert** : Surplus au-delà de l'objectif
  - **Rouge** : Manque (mois passés uniquement)

---

## 🎯 Fonctionnalités actuelles

### ✅ Implémenté
- [x] Ajout de transactions (achat uniquement)
- [x] Suppression de transactions
- [x] Visualisation performance globale
- [x] Graphique répartition portefeuille
- [x] Graphique versements mensuels avec objectif
- [x] Graphique évolution cumulative (multi-périodes)
- [x] Cartes de position par actif
- [x] Historique détaillé par produit
- [x] Mode hors ligne (cache)
- [x] Thème clair/sombre automatique
- [x] Design responsive mobile-first
- [x] Gestion dividendes (calcul automatique depuis feuille Dividende)
- [x] Système de retry automatique (3 tentatives)
- [x] Fonction `calculateTransactionPerformance()` centralisée
- [x] Optimisation graphique cumulatif (pas de dateMap)
- [x] Variables globales `globalDividendes` et `globalPlan` pour cache offline
- [x] Navigation par onglets (3 onglets : Résumé, Analyse, Historique)

### 🔮 Évolutions futures prévues
- [ ] Graphiques d'analyse avancés
- [ ] Projections de performance
- [ ] Import/Export données
- [ ] Alertes de prix
- [ ] Comparaison avec indices de référence
- [ ] Gestion des ventes (actuellement achat uniquement)
- [ ] Suivi des plans d'investissement (comparaison prévisionnel/réel)
- [ ] Graphique distribution des dividendes
- [ ] Score de diversification du portefeuille
- [ ] Système d'alertes intelligent

---

## 🏗️ Architecture extensible - Guide pour nouvelles fonctionnalités

### Principe de conception
Le projet est conçu pour être **modulaire et extensible**. Toute nouvelle fonctionnalité doit :
1. S'intégrer naturellement dans l'architecture existante
2. Respecter le flux de données établi
3. Être compatible avec le mode offline
4. Maintenir la performance (mobile-first)

### Template pour ajouter un graphique

```javascript
// 1. Déclarer l'instance globale
let nouveauChartInstance = null;

// 2. Créer la fonction de mise à jour
function updateNouveauChart(data) {
  const ctx = document.getElementById('nouveauChart');
  if (!ctx || !ctx.getContext) return;
  
  // Détruire l'ancienne instance
  if (nouveauChartInstance) nouveauChartInstance.destroy();
  
  // Créer le nouveau graphique
  nouveauChartInstance = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { /* ... */ },
    options: { /* ... */ }
  });
}

// 3. Appeler depuis renderDashboard() ou updateCharts()
function renderDashboard(transactions, liveData) {
  // ... code existant
  updateNouveauChart(transactions);
}
```

### Template pour ajouter une modal

```html
<!-- HTML -->
<div class="modal" id="nouvelleModal">
  <div class="modal-content">
    <h2>Titre Modal</h2>
    <!-- Contenu -->
    <button id="closeNouvelleModal">Fermer</button>
  </div>
</div>
```

```javascript
// JavaScript - Dans setupEventListeners()
const openBtn = document.getElementById('openNouvelleModal');
const closeBtn = document.getElementById('closeNouvelleModal');

if (openBtn) {
  openBtn.addEventListener('click', () => {
    document.getElementById('nouvelleModal').style.display = 'flex';
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    document.getElementById('nouvelleModal').style.display = 'none';
  });
}
```

### Template pour ajouter une opération POST

```javascript
// Frontend
async function nouvelleOperation(data) {
  const btn = event.target;
  const originalText = btn.innerText;
  btn.innerText = "Traitement...";
  btn.disabled = true;
  showLoader("Opération en cours...");

  const payload = {
    type: "NOUVELLE_OPERATION",
    data: data
  };

  try {
    await fetch(API_URL, { 
      method: 'POST', 
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload) 
    });
    
    document.getElementById('status').innerText = "Opération réussie !";
    setTimeout(fetchData, 2000); 
  } catch (error) {
    console.error("Erreur opération :", error);
    alert("Erreur lors de l'opération.");
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
    hideLoader();
  }
}
```

```javascript
// Backend (Code.gs)
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const data = JSON.parse(e.postData.contents);
    
    if (data.type === "NOUVELLE_OPERATION") {
      // Logique métier
      const result = traiterNouvelleOperation(data.data);
      
      return ContentService.createTextOutput(
        JSON.stringify({ status: "success", result: result })
      ).setMimeType(ContentService.MimeType.JSON);
    }
    
    // ... autres cas
    
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: err.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
```

### Exemples d'extensions futures

#### 1. Graphique de rendement annualisé
- **Données** : `globalTransactions` + `globalLive`
- **Calcul** : Performance composée sur période
- **Intégration** : Nouvel onglet ou section dans Dashboard

#### 2. Alertes de prix
- **Stockage** : Nouvelle feuille "Alertes" dans Google Sheets
- **Backend** : Nouveau type POST "ADD_ALERT"
- **Frontend** : Modal configuration + notifications visuelles

#### 3. Gestion des ventes
- **Modification** : Ajouter colonne "Type" (ACHAT/VENTE) dans feuille Transaction
- **Backend** : Gérer quantités négatives
- **Frontend** : Toggle dans formulaire + calcul PRU pondéré

#### 4. Suivi des plans d'investissement
- **Données** : Feuille "Plan Invest" déjà disponible
- **Calculs** : Comparer montants prévus vs investis réellement
- **Affichage** : Graphique progression plans en cours + historique clôturés
- **Alertes** : Notification si objectif mensuel non atteint

#### 5. Import CSV
- **Frontend** : Input file + parsing Papaparse ou natif
- **Backend** : Endpoint POST bulk insert
- **Validation** : Vérification format + détection doublons

#### 6. Projection de performance
- **Calcul** : Simulation Monte Carlo ou moyenne mobile
- **Affichage** : Zone graphique avec bandes de confiance
- **Données** : Historique long terme requis

---

## 📋 Récapitulatif - Points clés du projet

### Architecture
✅ Frontend statique (HTML/CSS/JS) hébergé sur GitHub Pages  
✅ Backend Google Apps Script (API REST sur Google Sheets)  
✅ Cache LocalStorage pour mode offline  
✅ Mobile-first responsive design  
✅ Navigation 3 onglets (Résumé, Analyse, Historique)

### Flux de données
✅ Source de vérité : Google Sheets (6 feuilles + feuilles produits)  
✅ API : doGet() lecture, doPost() écriture (3 opérations)  
✅ Frontend recalcule tout via reconstructLive() (aucune feuille de données calculées)  
✅ Dividendes et plans d'investissement stockés séparément avec historique complet  

### Particularités techniques
✅ Mode no-cors obligatoire → pas de lecture réponse POST  
✅ Chargement optimiste (cache immédiat + sync background)  
✅ Matching multi-critères (id_perso, tickers_utiliser, nom)  
✅ Gestion robuste des types (cleanNumber, formatEuro, parseDividende, parseMontant)  
✅ Chart.js : toujours destroy avant recréation  
✅ Fonction centralisée calculateTransactionPerformance()  
✅ Optimisation graphique cumulatif (suppression dateMap)

### Bonnes pratiques
✅ Tout passe par processData() pour cohérence globale  
✅ Cas limites testés (vide, null, offline, erreurs)  
✅ Variables globales documentées et centralisées  
✅ Event listeners dans setupEventListeners()  
✅ Responsive testé (hide-mobile, grilles adaptatives)  
✅ Aucune duplication de code pour calculs de performance

### Maintenance
✅ Code commenté et structuré en sections  
✅ Debug tools (localStorage, console, badge statut)  
✅ Conventions de nommage cohérentes  
✅ Architecture extensible pour évolutions futures  
✅ Bugs critiques corrigés (reconstructLive, getProductDividend, globalLive)  
✅ Variables globales complètes (globalDividendes, globalPlan)

---

## 🛠️ Points techniques importants

### Gestion des erreurs
- **Retry automatique** : 3 tentatives avec délai de 1s (fonction `fetchWithRetry()`)
- **Mode dégradé** : Affichage cache si API inaccessible
- **Feedback utilisateur** : Indicateurs de statut clairs
  - "Mémoire" : Données depuis cache
  - "Sync..." : Synchronisation en cours
  - "À jour" : Dernière sync réussie
  - "Hors Ligne" : Erreur API mais cache disponible
  - "Erreur Sync" : Erreur sans cache

### Performance
- **Chargement optimiste** : `loadCachedData()` affiche immédiatement le cache, puis `fetchData()` en background
- **Sync silencieuse** : Pas de loader full-screen si données déjà affichées
- **Debouncing** : Calculs temps réel dans formulaires (`updateTicketCalculations()`)
- **Charts recréés intelligemment** : Destruction puis recréation seulement si nécessaire

### UX/UI
- **Animations** : Transitions fluides (fadeIn 0.3s, slideUp 0.3s)
- **Hover states** : Feedback visuel sur interactions (transform, box-shadow)
- **Modal overlay** : Backdrop blur (8px) pour profondeur visuelle
- **Touch-friendly** : Zones de clic adaptées mobile (≥48px)
- **Click sur transactions** : 
  - Desktop : Clic sur ligne ouvre modal détail
  - Mobile : Tap sur ligne ouvre modal détail

### Accessibilité
- Variables CSS pour thème adaptatif (prefers-color-scheme)
- Contrastes respectés (WCAG AA minimum)
- Tap targets ≥ 48px sur mobile
- Semantic HTML (header, nav, main)
- Labels explicites pour formulaires

### Gestion des types de données

#### Nettoyage des nombres
```javascript
function cleanNumber(val) {
  if (val === undefined || val === null) return 0;
  return parseFloat(val.toString().replace(',', '.')) || 0;
}
```
⚠️ **IMPORTANT** : Google Sheets peut retourner :
- Nombres avec virgule au lieu de point
- Chaînes vides `""` pour champs numériques vides
- `null` ou `undefined` pour cellules vides
- Format texte avec symbole € (`"2,05 €"`) pour les dividendes

#### Parsing des dividendes
```javascript
function parseDividende(divString) {
  // Entrée: "2,05 €" ou "0,00 €"
  // Sortie: 2.05 ou 0
  if (!divString) return 0;
  return cleanNumber(divString.replace('€', '').trim());
}
```

#### Parsing des montants (Plan Invest)
```javascript
function parseMontant(montantString) {
  // Entrée: "1 000,00 €" ou "600,00 €"
  // Sortie: 1000.00 ou 600.00
  if (!montantString) return 0;
  return cleanNumber(
    montantString
      .replace('€', '')
      .replace(/\s/g, '')  // Supprime tous les espaces
      .trim()
  );
}
```
⚠️ **Note** : Le format avec espace comme séparateur de milliers nécessite un nettoyage spécifique

#### Formatage Euro
```javascript
function formatEuro(val) {
  return cleanNumber(val).toLocaleString('fr-FR', { 
    style: 'currency', 
    currency: 'EUR' 
  });
}
```

#### Gestion des dates
- API retourne ISO 8601 : `"2025-04-01T22:00:00.000Z"`
- Conversion JavaScript : `new Date(isoString)`
- Affichage : `date.toLocaleDateString('fr-FR')` → `"02/04/2025"`
- Input HTML : `<input type="date">` attend format `YYYY-MM-DD`

### Particularités clés du code

#### Variables globales essentielles
```javascript
tickerToNameMap = {}           // Map Ticker → Nom (pour dropdown et affichage)
globalTransactions = []        // Cache transactions pour filtrage
globalLive = []                // Résultat reconstructLive() (calculé dynamiquement)
globalDividendes = []          // Cache dividendes pour calculs
globalPlan = []                // Cache plans d'investissement
displayedTransactions = []     // Transactions affichées (pour retrouver par index au clic)
activePeriod = '1m'            // Période graphique cumulatif
customDateRange = {}           // Dates personnalisées pour graphique
missingHistories = []          // Lignes historique à synchroniser
mismatchedHistories = []       // Lignes historique à mettre à jour
```

#### Instances Chart.js
```javascript
barChartInstance = null        // Graphique versements mensuels
pieChartInstance = null        // Graphique répartition
cumulativeChartInstance = null // Graphique évolution cumulative
```
⚠️ **IMPORTANT** : Toujours `.destroy()` avant recréation pour éviter fuites mémoire

#### Mode NO-CORS
```javascript
fetch(API_URL, { 
  method: 'POST', 
  mode: 'no-cors',  // ⚠️ OBLIGATOIRE pour Google Apps Script
  // ...
})
```
**Conséquence** : La réponse n'est **pas accessible** en JavaScript après un POST
- Solution : Attendre 2s puis relancer `fetchData()` pour vérifier l'état

---

## 📝 Convention de code

### Nomenclature
- **Variables globales** : camelCase avec préfixe (`globalTransactions`, `tickerToNameMap`)
- **Fonctions** : camelCase descriptif (`fetchData`, `renderDashboard`)
- **Constantes** : UPPERCASE (`API_URL`)
- **IDs HTML** : kebab-case (`table-body-history`)

### Structure des fichiers
```
/
├── index.html          # Structure HTML + styles inline
├── script.js           # Logique métier + interactions
├── manifest.json       # PWA manifest
├── icon.png            # Icône application
└── Code.gs             # Google Apps Script (backend)
```

### Commentaires
- Sections principales délimitées par `// --- SECTION ---`
- Fonctions complexes documentées avec description
- TODO/FIXME pour améliorations futures

---

## 🔐 Sécurité et configuration

### Configuration utilisateur
- **URL API** : Stockée en localStorage (`pea_api_url`)
- **Objectif mensuel** : Stocké en localStorage (`pea_monthly_objective`)
- **Cache données** : Stocké en localStorage (`pea_data_cache`)

### Sécurité
- **No-CORS mode** : Pour éviter problèmes CORS avec Google Apps Script
- **Validation côté client** : Formulaires avec required attributes
- **Sanitization** : Nettoyage des inputs (trim, uppercase pour tickers)

### Données sensibles
- Aucune donnée sensible stockée (pas de mot de passe)
- API URL visible mais publique (déploiement Google Apps Script)
- Données financières personnelles en cache navigateur uniquement

---

## 🐛 Debug et maintenance

### Points de debug principaux
- `console.log` pour suivre le flux de données
- Badge de statut pour identifier état synchronisation
- Double-clic sur badge statut pour modifier URL API
- Console browser : `localStorage.getItem('pea_data_cache')` pour voir cache

### Problèmes connus à surveiller
1. **Matching tickers** : Système de fallback peut échouer si données incohérentes
   - Solution : Vérifier cohérence des colonnes `ticker`, `id_perso`, `tickers_utiliser`
   
2. **Cache obsolète** : Pas de TTL, peut afficher données anciennes si API down
   - Solution : Indicateur "Hors Ligne" visible + forcer refresh manuel
   
3. **Gestion historique** : Logique de vérification peut être coûteuse avec beaucoup de données
   - Solution : Optimisation future avec pagination ou lazy loading

4. **Frais vides** : Google Sheets retourne `""` au lieu de `0`
   - Solution : `cleanNumber()` gère tous les cas

5. **Mode no-cors** : Impossible de lire réponse POST
   - Solution : Timeout 2s + refetch pour vérifier état

### Outils de debug recommandés
```javascript
// Voir cache complet
JSON.parse(localStorage.getItem('pea_data_cache'))

// Voir transactions globales chargées
console.log(globalTransactions)

// Voir résultat reconstructLive
console.log(globalLive)

// Vérifier map tickers
console.log(tickerToNameMap)

// Forcer rechargement API
fetchData()

// Nettoyer cache
localStorage.removeItem('pea_data_cache')
location.reload()
```

---

## ⚠️ Pièges courants et solutions

### 1. Incohérence données live vs calculées
**Problème** : Il n'existe pas de feuille "Table Produit" dans l'architecture actuelle
**Solution** : **TOUJOURS** utiliser `reconstructLive()` pour calculer dynamiquement les métriques à partir de `transactions` et `dataLive`

### 2. Matching ticker échoue
**Problème** : Produit non trouvé malgré présence dans les données
**Solution** : Vérifier les 3 clés de matching (id_perso, tickers_utiliser, nom) - ajouter des logs pour debug

### 3. Graphique ne se met pas à jour
**Problème** : Chart.js instance non détruite avant recréation
**Solution** : Toujours faire `if (chartInstance) chartInstance.destroy()` avant `new Chart()`

### 4. Modal ne s'ouvre pas
**Problème** : Event listener manquant ou ID incorrect
**Solution** : Vérifier que `setupEventListeners()` est appelé après DOMContentLoaded

### 5. Données affichées incohérentes entre onglets
**Problème** : Variables globales non synchronisées
**Solution** : Tout passe par `processData()` qui met à jour TOUTES les variables globales

### 6. Performance dégradée avec beaucoup de transactions
**Problème** : `reconstructLive()` parcourt toutes les transactions pour chaque produit
**Solution** : Optimisation future → créer un index/cache des transactions par ticker

### 5. Dates mal formatées
**Problème** : Confusion entre formats ISO, FR, et input HTML
**Solution** : 
- Stockage : ISO 8601 (`2025-04-01T22:00:00.000Z`)
- Affichage : `toLocaleDateString('fr-FR')`
- Input : Format natif du navigateur

### 6. Parsing des montants avec séparateurs
**Problème** : Format `"1 000,00 €"` avec espaces et symbole €
**Solution** : 
```javascript
// Supprimer espaces + € + remplacer virgule par point
parseMontant(str.replace('€', '').replace(/\s/g, '').trim())
```

### 7. Calculs de performance incorrects
**Problème** : Oubli des dividendes ou mauvais prix moyen
**Solution** : Toujours suivre la formule exacte dans `reconstructLive()`

### 8. Gestion des plans d'investissement en cours
**Problème** : Date de clôture vide pour plans "En Cours"
**Solution** : Vérifier `if (plan.date_de_cloture && plan.date_de_cloture !== "")` avant parsing

---

## 🎯 Bonnes pratiques pour contributions

### Avant de modifier le code

1. **Comprendre le flux complet**
   ```
   DOMContentLoaded → loadCachedData() (immédiat)
                   → fetchData() (background)
                   → processData()
                   → renderDashboard()
   ```

2. **Identifier les sources de vérité**
   - Transactions : Feuille "Transaction"
   - Cours actuels : Feuille "Data Live"
   - Configuration : Feuille "Stock Tickers"
   - Dividendes : Feuille "Dividende" (clé API : `dividende`)
   - Plans : Feuille "Plan Invest" (clé API : `plan`)
   - ⚠️ Pas de feuille de calculs précalculés - tout est recalculé dynamiquement

3. **Tester les cas limites**
   - Données vides (`""`, `null`, `undefined`)
   - Cache vide (premier lancement)
   - API indisponible
   - Transactions sans frais
   - Produits sans dividendes
   - Historique incomplet
   - Plans d'investissement sans date de clôture
   - Montants avec séparateurs de milliers

### Checklist modifications

- [ ] Les variables globales sont-elles mises à jour ?
- [ ] Le cache localStorage est-il invalidé si nécessaire ?
- [ ] Les graphiques Chart.js sont-ils correctement détruits ?
- [ ] Le responsive mobile est-il testé ?
- [ ] Les calculs utilisent-ils `cleanNumber()` ?
- [ ] Les tickers sont-ils normalisés (uppercase + trim) ?
- [ ] Les event listeners sont-ils correctement enregistrés ?
- [ ] Le mode offline fonctionne-t-il toujours ?

### Conventions de commit
```
feat: Ajout graphique rendement annualisé
fix: Correction calcul dividendes pour produits multi-tickers
perf: Optimisation reconstructLive avec cache
refactor: Extraction fonction getProductMetrics
docs: Documentation API doPost SYNC_HISTORY
```

---

## 📚 Contexte d'utilisation pour l'IA

### Quand intervenir sur ce projet
- Ajout de nouvelles fonctionnalités (graphiques, analyses)
- Optimisation performance (rendering, calculs)
- Amélioration UX/UI (nouveaux composants, animations)
- Debug et correction de bugs
- Refactoring et clean code

### Principes à respecter
1. **Ne jamais casser l'existant** : Compatibilité backward avec cache
2. **Mobile-first** : Toute modification doit être responsive
3. **Performance** : Éviter les appels API inutiles
4. **UX cohérente** : Respecter le design system existant (variables CSS)
5. **Code lisible** : Commentaires et nommage explicites

### Structure de réponse attendue
Lorsque tu interviens sur ce projet :
1. Expliquer la problématique
2. Proposer une solution avec code
3. Préciser les impacts (autres fonctions, cache, etc.)
4. Tester mentalement les cas limites
5. Suggérer des améliorations futures si pertinent

---

## 📞 Informations complémentaires

**Note** : Le code Google Apps Script (Code.gs) peut être fourni pour mieux comprendre la structure exacte des données échangées via l'API.

**Évolutivité** : Le projet est conçu pour être modulaire et extensible. Toute nouvelle fonctionnalité doit s'intégrer naturellement dans l'architecture existante.

**Philosophy** : Simplicité, performance et expérience utilisateur fluide sont les piliers de ce projet.