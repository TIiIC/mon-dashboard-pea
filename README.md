# 📊 DASHBOARD PEA - Documentation Complète

> **Dernière mise à jour** : 30 janvier 2026  
> **Version** : 2.0  
> **Statut** : Production stable

---

## 🎯 Vue d'ensemble du projet

### Objectif principal
Application web personnelle de gestion et visualisation d'un Plan d'Épargne en Actions (PEA). L'objectif est de tracker ses investissements, analyser ses performances, suivre ses dividendes et visualiser l'évolution de son portefeuille boursier en temps réel.

### Caractéristiques principales
- ✅ **100% fonctionnel hors ligne** avec cache localStorage
- ✅ **Responsive mobile-first** avec optimisations tactiles
- ✅ **Thème automatique** clair/sombre selon préférences système
- ✅ **Synchronisation temps réel** avec Google Sheets
- ✅ **Notifications intelligentes** pour dividendes à venir
- ✅ **Graphiques interactifs** avec Chart.js
- ✅ **Design moderne** avec glassmorphism et animations fluides

### Type de projet
- **Frontend** : Application web statique (HTML/CSS/JS vanilla)
- **Backend** : Google Apps Script (API REST sur Google Sheets)
- **Hébergement** : GitHub Pages ou serveur statique
- **Utilisateur** : Mono-utilisateur, données stockées en cache navigateur

---

## 🏗️ Architecture technique

### Stack technologique

#### Frontend
- **HTML5** sémantique avec structure modulaire
- **CSS3** avec variables CSS (design system complet)
  - Thème adaptatif automatique (clair/sombre)
  - Glassmorphism et effets modernes
  - Animations fluides avec transitions CSS
- **JavaScript Vanilla** (ES6+)
  - Aucune dépendance framework
  - Modules fonctionnels organisés
  - Gestion d'état via variables globales
- **Chart.js** pour les graphiques avancés
- **Lucide Icons** pour les icônes (CDN)

#### Backend
- **Google Apps Script** (.gs)
- **Google Sheets** comme base de données
- **API REST** custom avec endpoints doGet/doPost
- **Mode no-cors** pour compatibilité cross-origin

#### Stockage
- **LocalStorage** pour cache des données (offline-first)
- **LocalStorage** pour configuration utilisateur
- **Pas de cookies** ni tracking

---

## 📁 Structure du projet

```
dashboard-pea/
│
├── index.html          # Structure principale
├── style.css           # Styles et design system
├── script.js           # Logique applicative (2350+ lignes)
├── manifest.json       # PWA manifest
├── icon.png            # Icône de l'application
├── README.md           # Documentation (ce fichier)
└── TodoList.md         # Historique des modifications
```

### Fichiers principaux

#### `index.html` - Structure de l'interface
- **Header** : Logo + Statut sync + Notifications
- **Navigation** : 4 onglets (Aperçu, Analyse, Dividendes, Journal)
- **Modales** : 7 modales pour interactions (transactions, dividendes, plans)
- **FAB** : Speed dial avec 3 actions rapides
- **Notifications** : Panneau latéral pour dividendes à venir

#### `style.css` - Design System
- **Variables CSS** : 40+ variables pour personnalisation
- **Composants** : Cartes, tables, modales, boutons, badges
- **Responsive** : Breakpoints mobile (< 768px)
- **Animations** : FadeIn, slideUp, stagger, pulse
- **Thèmes** : Mode clair/sombre automatique

#### `script.js` - Logique métier
- **Configuration** : Variables globales et API
- **Données** : Fetch, cache, processData
- **Calculs** : reconstructLive, dividendes, plans
- **UI** : Render dashboard, charts, modales
- **Events** : Listeners et interactions utilisateur

---

## 🗄️ Google Sheets - Structure de la base de données

### Feuilles principales

#### 1. **"Transaction"** - Journal des opérations
| Colonne | Type | Description | Exemple |
|---------|------|-------------|---------|
| Date | Date | Date d'achat | 2025-04-01 |
| Nom | Texte | Nom du produit | CAC 40 EUR (Acc) |
| Quantité | Nombre | Unités achetées | 2 |
| Prix/u | Nombre | Prix unitaire en € | 37.59 |
| Frais | Nombre | Frais transaction | 2.50 |
| Total | Nombre | Montant total | 77.68 |
| Ticker | Formule | Code ticker (auto) | EPA:CACC |

#### 2. **"Stock Tickers"** - Référentiel produits
| Colonne | Type | Description |
|---------|------|-------------|
| Nom | Texte | Nom du produit |
| ID_perso | Texte | Identifiant court |
| Type | Texte | Source (Google, etc.) |
| Code/lien | Texte | Ticker ou URL |

#### 3. **"Data Live"** - Cours temps réel
| Colonne | Type | Description |
|---------|------|-------------|
| Nom | Texte | Nom du produit |
| ID_perso | Texte | ID court (clé) |
| Tickers_utiliser | Texte | Code GOOGLEFINANCE |
| Open | Nombre | Prix ouverture |
| High | Nombre | Plus haut du jour |
| Low | Nombre | Plus bas du jour |
| Cour | Nombre | Cours actuel |
| Volume | Nombre | Volume échangé |

#### 4. **"Dividende"** - Historique dividendes
| Colonne | Type | Description | Exemple |
|---------|------|-------------|---------|
| Date | Date | Date versement | 2025-06-03 |
| Nom | Texte | Nom du produit | La Française des Jeux |
| Code | Texte | Ticker | FDJ |
| Div/u | Texte | Montant unitaire | 2,05 € |
| Statut | Texte | État versement | Reçu / Enregistré |
| Fréquence | Texte | Périodicité | Annuel / Trimestriel |

**Statuts possibles** :
- **Reçu** : Dividende effectivement perçu (historique)
- **Enregistré** : Dividende futur confirmé (projection)

**Fréquences supportées** :
- Annuel, Semestriel, Trimestriel, Bimestriel, Mensuel, Bimensuel, Hebdomadaire

#### 5. **"Plan Invest"** - Plans d'investissement
| Colonne | Type | Description | Exemple |
|---------|------|-------------|---------|
| Date_début | Date | Début du plan | 2025-04-01 |
| Commentaire | Texte | Description | DCA Mensuel 2025 |
| Montant | Texte | Objectif mensuel | 1 000,00 € |
| Type | Texte | Type compte | PEA / CTO |
| Date_de_cloture | Date | Fin du plan | 2025-12-31 |
| Statut | Texte | État | En Cours / Clôturé |

#### 6. **Feuilles produits individuelles** - Historiques cours
Structure en 3 blocs (18 colonnes) :
- **Bloc 1 (A-F)** : Historique Enregistré (sauvegardé)
- **Bloc 2 (G-L)** : Historique Non Enregistré (Google Finance live)
- **Bloc 3 (M-R)** : Autres données

Format des données :
- Ligne 1 : Ignorée
- Ligne 2 : Noms des tableaux
- Ligne 3 : Entêtes (date, open, high, low, close, volume)
- Ligne 4+ : Données historiques

---

## 🔌 API Google Apps Script

### Endpoints disponibles

#### 📥 **GET** - Récupération des données
**URL** : `https://script.google.com/macros/s/{SCRIPT_ID}/exec`

**Réponse JSON** :
```javascript
{
  "transactions": Array<Transaction>,
  "dataTickers": Array<TickerConfig>,
  "dataLive": Array<LiveData>,
  "dividende": Array<Dividende>,
  "plan": Array<PlanInvest>,
  "historiqueProduit": Object<HistoryMap>
}
```

#### 📤 **POST** - Opérations d'écriture
**URL** : Même endpoint

**Opérations supportées** :
1. **ACHAT** - Nouvelle transaction
2. **DELETE** - Suppression transaction
3. **DIVIDENDE** - Nouveau dividende
4. **EDIT_DIVIDENDE** - Modification dividende
5. **DELETE_DIVIDENDE** - Suppression dividende
6. **PLAN** - Nouveau plan
7. **EDIT_PLAN** - Modification plan
8. **DELETE_PLAN** - Suppression plan
9. **SYNC_HISTORY** - Synchronisation historique

**Format requête** :
```javascript
{
  method: 'POST',
  mode: 'no-cors',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: "ACHAT",
    date: "2025-01-30",
    ticker: "EPA:CACC",
    nom: "CAC 40 EUR (Acc)",
    quantite: 5,
    prix: 40.50,
    frais: 2.50,
    total: 205.00
  })
}
```

⚠️ **Important** : Mode `no-cors` obligatoire → Réponse inaccessible après POST (workaround : attente 2s puis refresh)

---

## 🎨 Interface utilisateur

### Navigation - 4 onglets principaux

#### 1️⃣ **Aperçu** (Dashboard)
**Objectif** : Vue globale instantanée du portefeuille

**KPI principaux** :
- 💰 **Valorisation** : Valeur totale actuelle + Performance globale
- 📈 **Plus/Moins Value** : Gain/Perte avec distinction capital/dividendes
- 🥧 **Allocation** : Graphique pie chart répartition

**Cartes de position** :
- Nom + Ticker + Badge performance (▲/▼)
- Valeur actuelle + Dividendes + Total
- Footer : Unités | PRU | Cours actuel
- Clic → Modal historique détaillé

**Design** :
- Cartes gradient avec bordure gauche colorée
- Effet hover : translation Y + shadow
- Groupement mobile automatique (> 6 positions)

#### 2️⃣ **Analyse** (Graphiques)
**Objectif** : Visualiser l'évolution et les objectifs

**Graphique Versements** :
- Bar chart empilé avec 5 datasets :
  1. Ligne rouge pointillée : Objectif mensuel
  2. Bleu : Part objectif atteinte
  3. Bleu clair pointillé : Reste à faire (mois actuel)
  4. Vert : Surplus
  5. Rouge : Manque (mois passés)
- Plugin custom : Labels d'écart au-dessus des barres
- Cartes info : Mois actuel + Bilan annuel

**Graphique Capital Investi** :
- Line chart avec gradient fill
- Sélecteur période : 1M / 6M / 1A / YTD / MAX / Custom
- Double dataset : Investi (line) + Versé (bar)
- Axe secondaire (y1) pour montants versés

**Section Plans d'Investissement** :
- Grille de cartes par plan
- Barre progression colorée (4 niveaux)
- Stats : Écart / Écart actuel / Transactions
- Tri : En Cours → Récents

#### 3️⃣ **Dividendes** (Complet)
**Objectif** : Suivi et projection des dividendes

**KPI (Cartes gradient)** :
- 💵 **Total Reçu** : Somme historique
- 📊 **Annuel Estimé** : Projection 12 mois
- 💹 **Rendement / PRU** : Yield on cost
- 📅 **Prochains 30 Jours** : Versements à venir

**Graphique Évolution Annuelle** :
- Bar chart empilé par année
- Dataset "Reçus" (bleu)
- Dataset "Estimés" (bleu clair pointillé)
- Projection année en cours automatique

**Calendrier Prévisionnel** :
- Table responsive avec projections
- Colonnes : Date | Action | Qté | Div/u | Total | Fréquence
- Badge "Confirmé" pour dividendes enregistrés
- Tri chronologique
- **Optimisation mobile** : Masquage Qté, Div/u, Fréquence

**Historique des Versements** :
- Table complète dividendes perçus
- Colonnes : Date | Produit | Qté | Div/u | Total
- **Optimisation mobile** : 
  - Masquage Date, Qté, Div/u
  - Date intégrée dans le ticker
- Clic → Modal édition/suppression

**Système de Notifications** :
- 🔔 Badge avec compteur
- Panneau latéral déroulant
- Alertes J-7 pour versements
- Items urgents (J-2) en rouge
- Clic → Formulaire pré-rempli

#### 4️⃣ **Journal** (Transactions)
**Objectif** : Historique complet des opérations

**Table responsive** :
- Desktop : Actif | Qté | P.U. | Frais | Total
- Mobile : Cartes avec data-label
- Tri : Plus récent en premier
- Performance temps réel vs cours actuel
- Clic → Modal détails transaction

---

## 🧮 Logique métier - Calculs clés

### 1. Reconstruction des données live
**Fonction** : `reconstructLive(dataLive, transactions, dividendes)`

**Source de vérité** : Transactions + Cours actuels + Dividendes

**Calculs effectués** :
```javascript
// Unités détenues
unités = Σ(quantités transactions)

// Prix moyen pondéré
prix_moyen = Σ(totaux investis) / Σ(quantités)

// Valeur actuelle
valeur_actuelle = cours_actuel × unités

// Dividendes totaux (LOGIQUE CLEF)
dividendes = Σ(div_unitaire × quantité_détenue_à_date_versement)

// Performance globale
performance = ((valeur + dividendes - coût) / coût) × 100

// Gain/Perte
gain_perte = (cours - prix_moyen) × unités + dividendes
```

**Avantages** :
- ✅ Indépendant des formules Google Sheets
- ✅ Cohérence garantie des données
- ✅ Détection d'incohérences possible

### 2. Calcul des dividendes (Pondération historique)
**Fonction** : `getProductDividend(item, dividendes, transactions)`

**Algorithme** :
```javascript
Pour chaque dividende versé :
  1. Récupérer date de versement
  2. Calculer quantité d'actions possédées À CETTE DATE
  3. dividende_réel = montant_unitaire × quantité_à_date
  4. Sommer tous les dividendes réels
```

**Exemple concret** :
```
Produit : CAC 40 EUR (Acc)
Versements :
  - 03/06/2025 : 2,05€/action, possédé 10 actions → 20,50€
  - 03/12/2025 : 2,05€/action, possédé 15 actions → 30,75€
→ Total dividendes = 51,25€
```

**Fonction helper** : `getQuantityAtDate(transactions, date)`
- Filtre transactions avant ou le jour même
- Somme quantités achetées
- Retourne unités possédées à la date exacte

### 3. Projection des dividendes
**Fonction** : `getDividendProjections()`

**Logique** :
```javascript
1. Pour chaque produit détenu :
   a. Analyser historique dividendes
   b. Détecter fréquence (Annuel, Trimestriel, etc.)
   c. Calculer prochaine date probable
   d. Projeter montant = dernier_div_u × quantité_actuelle

2. Gérer dividendes "Enregistrés" :
   a. Récupérer depuis Google Sheets
   b. Éviter doublons avec projections auto
   c. Marquer comme "Confirmé" dans l'UI

3. Trier chronologiquement
```

**Déduplication intelligente** :
- Détection produit identique (ticker ou nom)
- Vérification date proche (< 20 jours)
- Priorité aux dividendes "Enregistrés"

**Affichage** :
- Calendrier prévisionnel avec badge "Confirmé"
- KPI "Prochains 30 Jours"
- KPI "Annuel Estimé"

### 4. Distribution plans d'investissement (Pro-rata)
**Fonction** : `distributeInvestmentsByMonth(plans, transactions)`

**Algorithme** :
```javascript
1. Regrouper investissements réels par mois (YYYY-MM)

2. Pour chaque mois :
   a. Identifier plans actifs (chevauchement dates)
   b. Total_objectifs = Σ(objectifs mensuels plans actifs)
   c. Pour chaque plan actif :
      Part_plan = (Objectif_plan / Total_objectifs) × Argent_investi_mois
   d. Accumuler pour chaque plan

3. Retourner totaux par plan + stats mensuelles
```

**Exemple concret** :
```
Mois : Janvier 2025
Argent investi : 800€

Plans actifs :
  - Plan A : Objectif 500€/mois
  - Plan B : Objectif 300€/mois
Total objectifs : 800€

Répartition :
  - Plan A : (500/800) × 800 = 500€
  - Plan B : (300/800) × 800 = 300€
```

**Fonction** : `analyzeInvestmentPlans(plans, transactions)`

**Métriques calculées** :
- Durée effective (mois)
- Montant prévu vs réalisé
- Écart vs prévisionnel total
- Écart actuel (vs théorique à date)
- Taux de réalisation (%)
- Progression temporelle (%)
- Nombre de transactions

### 5. Matching Ticker → Produit (Fallback robuste)
**Système hiérarchique** :
```javascript
// Priorité 1 : ID personnalisé
match = item.id_perso === identifier

// Priorité 2 : Ticker utilisé
match = item.tickers_utiliser === identifier

// Priorité 3 : Nom du produit
match = item.liste_produits === identifier
```

**Normalisation** :
- `.toUpperCase().trim()` sur tous les champs
- Comparaisons insensibles à la casse
- Retour `null` si aucun match (pas d'erreur)

---

## 📱 Responsive Design & Mobile

### Breakpoints
- **Mobile** : < 768px
- **Desktop** : ≥ 768px

### Optimisations mobile

#### Navigation
- Icônes seules (texte masqué)
- Largeur icônes augmentée (24px)
- Padding adapté (16px vertical)

#### Graphiques
- Pie chart : Groupement top 5 + "Autres"
- Bar chart : Labels plus petits (10px)
- Line chart : Max 6 labels sur axe X

#### Tables
**Classes utilitaires** :
- `.hide-mobile` : Masque sur mobile
- `.show-on-mobile` : Affiche uniquement mobile

**Transformation** :
- Desktop : Table classique
- Mobile : Cards avec `data-label`

**Optimisations spécifiques** :
1. **Journal transactions** :
   - Masqué : Qté, P.U., Frais
   - Visible : Actif (nom+ticker+date), Total+Perf

2. **Calendrier dividendes** :
   - Masqué : Qté, Div/u, Fréquence
   - Visible : Date, Action, Total

3. **Historique dividendes** :
   - Masqué : Date (colonne), Qté, Div/u
   - Date relocalisée dans ticker
   - Visible : Produit (nom+ticker+date), Total

#### Modales
- Largeur max : `calc(100vw - 40px)`
- Padding réduit : 20px
- Font-size réduit : 0.9rem
- Boutons full-width

#### FAB (Floating Action Button)
- Position : bottom-right (24px)
- Taille : 56px (touch-friendly)
- Speed dial : 3 mini-FAB (48px)
- Labels contextuels au hover

---

## 🎨 Design System

### Variables CSS principales

#### Couleurs
```css
/* Mode Clair */
--primary: #2563eb;
--bg: #f8fafc;
--card: #ffffff;
--text: #0f172a;
--text-muted: #64748b;
--border: #e2e8f0;
--up: #10b981;
--down: #ef4444;

/* Mode Sombre (auto) */
--bg: #0f172a;
--card: #1e293b;
--text: #f1f5f9;
--text-muted: #94a3b8;
--border: #334155;
```

#### Espacements
```css
--radius-lg: 16px;
--radius-md: 12px;
--radius-sm: 8px;
--header-height: 64px;
```

#### Effets
```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
--glass-bg: rgba(255, 255, 255, 0.85);
--modal-overlay: rgba(15, 23, 42, 0.4);
```

### Composants

#### Cartes
- **Base** : `.card`
- **Highlight** : `.card-highlight` (bordure gauche + gradient)
- **Success** : `.card-highlight.success` (vert)
- **Warning** : `.card-highlight.warning` (orange)

#### Badges
- **Base** : `.badge`
- **Up** : `.badge-up` (vert)
- **Down** : `.badge-down` (rouge)
- **Count** : `.badge-count` (compteur)

#### Boutons
- **Primary** : `.btn-primary`
- **Danger** : `.btn-danger`
- **Text** : `.btn-text`

#### Tables
- **Base** : `table`
- **Enhanced** : `.enhanced-table`
- **Mobile** : `.mobile-card-table`

### Animations
```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes bellRing {
  0%, 100% { transform: rotate(0deg); }
  10%, 30% { transform: rotate(-10deg); }
  20%, 40% { transform: rotate(10deg); }
  50% { transform: rotate(0deg); }
}
```

---

## 🔄 Flux de données

### Cycle de vie complet

#### 1. Initialisation (DOMContentLoaded)
```
1. Vérifier URL API (localStorage)
   ├─ Si absente → showConfigModal()
   └─ Si présente → Continuer

2. Chargement optimiste
   └─ loadCachedData() → Affichage immédiat

3. Synchronisation background
   └─ fetchData() → Refresh silencieux

4. Setup interface
   ├─ setupEventListeners()
   ├─ setupTabs()
   └─ lucide.createIcons()
```

#### 2. Synchronisation (fetchData)
```
1. GET https://script.google.com/.../exec

2. Réception JSON
   ├─ transactions
   ├─ dataTickers
   ├─ dataLive
   ├─ dividende
   ├─ plan
   └─ historiqueProduit

3. Mise à jour cache
   └─ localStorage.setItem('pea_data_cache', JSON)

4. Traitement (processData)
   ├─ globalTransactions = result.transactions
   ├─ globalDividendes = result.dividende
   ├─ globalPlan = result.plan
   ├─ globalLive = reconstructLive(...)
   ├─ tickerToNameMap = buildMap(...)
   ├─ verifyHistoricalData(...)
   ├─ analyzeInvestmentPlans(...)
   └─ calculatePeriodicDividends(...)

5. Rendu UI
   ├─ renderDashboard(...)
   ├─ renderPlansSection(...)
   ├─ renderDividendsTab(...)
   └─ checkDividendNotifications()

6. Mise à jour statut
   └─ Badge "À jour" (vert)
```

#### 3. Opérations utilisateur

**Ajout transaction** :
```
Formulaire → Validation → POST(type:"ACHAT")
→ Attente 2s → fetchData() → Refresh UI
```

**Suppression transaction** :
```
Modal détail → Confirmation → POST(type:"DELETE")
→ Attente 2s → fetchData() → Refresh UI
```

**Ajout/Modification dividende** :
```
Formulaire/Modal → Validation → POST(type:"DIVIDENDE"|"EDIT_DIVIDENDE")
→ Attente 2s → fetchData() → Refresh UI
```

**Ajout/Modification plan** :
```
Formulaire/Modal → Validation → POST(type:"PLAN"|"EDIT_PLAN")
→ Attente 2s → fetchData() → Refresh UI
```

**Synchronisation historique** :
```
verifyHistoricalData() détecte anomalies
→ Proposition après 1s
→ Confirmation utilisateur
→ POST(type:"SYNC_HISTORY", data:[...])
→ Attente 2s → fetchData() → Refresh UI
```

### Stratégie de cache

#### Offline-First
```javascript
1. App démarre
   ├─ Cache existe ?
   │  ├─ OUI → Affichage immédiat
   │  └─ NON → Loader
   └─ fetchData() en background

2. Sync réussie
   ├─ Mise à jour cache
   └─ Refresh UI (si différences)

3. Sync échouée
   ├─ Cache existe ?
   │  ├─ OUI → Mode "Hors Ligne"
   │  └─ NON → Message erreur
   └─ Retry après 5s (max 3 fois)
```

#### Indicateurs de statut
| Statut | Couleur | Signification |
|--------|---------|---------------|
| Mémoire | Muted | Affichage depuis cache |
| Sync... | Primary | Synchronisation en cours |
| À jour | Vert | Dernière sync réussie |
| Hors Ligne | Muted | Erreur API mais cache OK |
| Erreur Sync | Rouge | Erreur sans cache |

---

## 🛠️ Configuration et installation

### Prérequis
- Navigateur moderne (Chrome, Firefox, Safari, Edge)
- Compte Google (pour Google Sheets)
- Éditeur de code (VSCode recommandé)

### Installation locale

#### 1. Cloner le projet
```bash
git clone https://github.com/votre-repo/dashboard-pea.git
cd dashboard-pea
```

#### 2. Serveur local
```bash
# Option 1 : Python
python -m http.server 8000

# Option 2 : Node.js
npx http-server -p 8000

# Option 3 : VSCode Live Server
# Installer l'extension Live Server
# Clic droit sur index.html → Open with Live Server
```

#### 3. Configuration Google Apps Script

**Créer le projet GAS** :
1. Ouvrir Google Sheets
2. Extensions → Apps Script
3. Copier le code backend (non fourni ici)
4. Déployer → Nouveau déploiement
5. Type : Application web
6. Accès : "Tout le monde"
7. Copier l'URL de déploiement

**Configurer l'app** :
1. Ouvrir l'application
2. Double-clic/tap sur badge statut
3. Coller l'URL Google Apps Script
4. Valider → Synchronisation automatique

### Déploiement GitHub Pages

```bash
# 1. Pousser sur GitHub
git add .
git commit -m "Initial commit"
git push origin main

# 2. Activer GitHub Pages
# Settings → Pages → Source: main → /root → Save

# 3. Accéder à l'app
# https://votre-username.github.io/dashboard-pea/
```

---

## 🔐 Sécurité et confidentialité

### Données stockées
- **LocalStorage** : Cache données + Configuration
- **Pas de cookies**
- **Pas de tracking**
- **Pas de serveur tiers**

### Accès API
- URL publique Google Apps Script
- Mode no-cors (CORS non géré)
- Pas d'authentification (mono-utilisateur)
- Pas de données sensibles (pas de mots de passe)

### Recommandations
- ✅ Utiliser URL déploiement unique
- ✅ Ne pas partager l'URL publiquement
- ✅ Sauvegarder régulièrement Google Sheets
- ❌ Ne pas stocker de données bancaires complètes
- ❌ Ne pas exposer l'URL sur forums publics

---

## 🐛 Debug et maintenance

### Outils de debug

#### Console JavaScript
```javascript
// Vérifier cache
JSON.parse(localStorage.getItem('pea_data_cache'))

// Variables globales
console.log({
  globalTransactions,
  globalLive,
  globalDividendes,
  globalPlan,
  tickerToNameMap
})

// Projections dividendes
console.log(getDividendProjections())

// Force reload
fetchData()

// Nettoyer cache
localStorage.removeItem('pea_data_cache')
location.reload()
```

#### Badge statut
- Simple clic : Affiche état
- Double-clic/tap : Modifier URL API

### Problèmes connus

#### 1. Matching tickers échoue
**Symptôme** : Produit non trouvé malgré présence  
**Cause** : Incohérence ticker/nom entre sheets  
**Solution** : 
```javascript
// Vérifier dans Console
console.log(tickerToNameMap)
console.log(globalLive.map(i => i.ticker))
```

#### 2. Cache obsolète
**Symptôme** : Données anciennes affichées  
**Solution** :
```javascript
localStorage.removeItem('pea_data_cache')
location.reload()
```

#### 3. Graphique ne se met pas à jour
**Cause** : Chart.js instance non détruite  
**Solution** : Vérifier `chartInstance.destroy()` avant `new Chart()`

#### 4. Dividendes mal calculés
**Cause** : Quantité actuelle au lieu de historique  
**Solution** : Utiliser `getQuantityAtDate()`

#### 5. Mode no-cors
**Symptôme** : Impossible lire réponse POST  
**Workaround** : Attendre 2s puis `fetchData()`

### Logs utiles
```javascript
// Activer logs détaillés
const DEBUG = true;

if (DEBUG) console.log('processData:', result);
if (DEBUG) console.log('reconstructLive:', globalLive);
if (DEBUG) console.log('analyzeInvestmentPlans:', plansAnalyses);
```

---

## 📊 Fonctionnalités détaillées

### ✅ Implémenté (Version 2.0)

#### Gestion transactions
- [x] Ajout transactions (achat)
- [x] Suppression avec confirmation
- [x] Historique détaillé par produit
- [x] Journal complet avec performance temps réel
- [x] Modal détails transaction

#### Visualisation performances
- [x] Dashboard KPI (Valeur + Gain/Perte)
- [x] Graphique répartition (Pie chart)
- [x] Cartes position interactives
- [x] Performance individuelle par transaction
- [x] Groupement mobile automatique

#### Graphiques avancés
- [x] Historique versements avec objectif
- [x] Distribution intelligente (Objectif/Surplus/Manque)
- [x] Labels dynamiques d'écart
- [x] Cartes récapitulatives (Mois + Année)
- [x] Évolution cumulative multi-périodes
- [x] Axe secondaire montants versés
- [x] Graphique dividendes annuel

#### Gestion dividendes
- [x] Calcul intelligent (quantité historique)
- [x] Intégration performance globale
- [x] Affichage cartes position
- [x] Graphique annuel avec projection
- [x] Onglet dédié complet
- [x] KPI (Total/Annuel/Rendement/Prochains)
- [x] Calendrier prévisionnel
- [x] Projections automatiques
- [x] Dividendes enregistrés (futurs confirmés)
- [x] Déduplication intelligente
- [x] Table historique versements
- [x] Optimisation mobile tables
- [x] Système notifications (J-7)
- [x] Panneau latéral interactif
- [x] Formulaire pré-rempli depuis notifications

#### Suivi plans investissement
- [x] Section dédiée (Analyse)
- [x] Distribution pro-rata mensuelle
- [x] Cartes progression par plan
- [x] Barre progression colorée (4 niveaux)
- [x] Écart vs prévisionnel
- [x] Écart actuel (vs théorique)
- [x] Progression temporelle
- [x] Tri intelligent (En Cours → Récents)
- [x] Stats mensuelles globales
- [x] Modal édition/suppression

#### Fonctionnalités techniques
- [x] Mode hors ligne (cache localStorage)
- [x] Thème clair/sombre automatique
- [x] Responsive mobile-first
- [x] Retry automatique (3 tentatives)
- [x] Sync historique automatique
- [x] Gestion robuste types (€, dates, nombres)
- [x] Loader full-screen backdrop blur
- [x] Icônes Lucide (CDN)
- [x] CSS externalisé design system
- [x] FAB speed dial (3 actions)
- [x] Modales contextuelles
- [x] Animations fluides

### 🔮 Roadmap futures

#### Analyses avancées
- [ ] Graphique rendement annualisé
- [ ] Score diversification (Herfindahl)
- [ ] Comparaison indices (CAC40, S&P500)
- [ ] Projections Monte Carlo
- [ ] Heat map performances

#### Gestion avancée
- [ ] Gestion ventes (type VENTE)
- [ ] PRU pondéré après ventes
- [ ] Plus/moins-values réalisées vs latentes
- [ ] Import/Export CSV
- [ ] Alertes prix configurables
- [ ] Objectifs personnalisés par produit

#### Améliorations dividendes
- [ ] Export calendrier iCal
- [ ] Alertes email/push
- [ ] Historique modifications manuelles
- [ ] Graphique rendement par produit

#### Améliorations UX
- [ ] Notifications push (PWA)
- [ ] Rapports PDF exportables
- [ ] Mode dark/light manuel
- [ ] Tutoriel interactif
- [ ] Thèmes personnalisables
- [ ] Multi-comptes (PEA + CTO)

#### Optimisations techniques
- [ ] Service Worker (offline complet)
- [ ] IndexedDB (cache avancé)
- [ ] WebSocket (temps réel)
- [ ] Lazy loading graphiques
- [ ] Modularisation code (ES6 modules)

---

## ⚠️ Limitations connues

### Techniques
1. **Mode no-cors** : Réponse POST inaccessible (workaround : timeout 2s)
2. **Pas de TTL cache** : Indicateur "Hors Ligne" si obsolète
3. **Mono-utilisateur** : Pas de gestion multi-comptes
4. **Sync historique coûteuse** : Lente avec beaucoup de données

### Fonctionnelles
1. **Pas de gestion ventes** : Uniquement achats
2. **Dividendes manuels limités** : Pas de persistance backend
3. **Pas d'alertes** : Notifications passives uniquement
4. **Pas d'export** : Pas de CSV, PDF, Excel

### UI/UX
1. **Groupement mobile** : Limité à 6 positions (pie chart)
2. **Graphiques non responsive** : Hauteur fixe (300px)
3. **Pas de dark mode manuel** : Automatique uniquement

---

## 📚 Ressources et documentation

### Documentation externe
- [Chart.js](https://www.chartjs.org/docs/latest/) - Graphiques
- [Lucide Icons](https://lucide.dev/) - Icônes
- [Google Apps Script](https://developers.google.com/apps-script) - Backend
- [Google Sheets API](https://developers.google.com/sheets/api) - Données

### Fichiers du projet
- `README.md` - Ce fichier (documentation complète)
- `TodoList.md` - Historique modifications et corrections
- `script.js` - Code source commenté (2350+ lignes)
- `style.css` - Design system complet (1200+ lignes)
- `index.html` - Structure HTML sémantique

### Contribution
Pour contribuer au projet :
1. Fork le repository
2. Créer une branche feature (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

---

## 📄 Licence

Ce projet est à usage personnel. Pas de licence open-source définie.

---

## 👤 Auteur

**Projet Personnel PEA Dashboard**

Développé avec ❤️ pour le suivi d'investissements boursiers.

---

## 📅 Historique des versions

### Version 2.0 (30 Janvier 2026)
- ✅ Système notifications dividendes (J-7)
- ✅ Panneau latéral interactif
- ✅ Formulaire pré-rempli depuis notifications
- ✅ Optimisation mobile tables dividendes
- ✅ Dividendes enregistrés (futurs confirmés)
- ✅ Déduplication intelligente projections
- ✅ Correction bug sélection ticker formulaire
- ✅ Amélioration UX onglet Dividendes

### Version 1.9 (24 Janvier 2026)
- ✅ Intégration système plans investissement
- ✅ Distribution pro-rata mensuelle
- ✅ Onglet Dividendes complet
- ✅ Projections automatiques
- ✅ Graphique dividendes annuel
- ✅ CSS externalisé design system

### Version 1.8 (16 Janvier 2026)
- ✅ Correction bugs calcul dividendes
- ✅ Amélioration matching tickers
- ✅ Optimisation graphiques
- ✅ Refactoring code (helpers)

### Version 1.7 (05 Janvier 2026)
- ✅ Mode hors ligne complet
- ✅ Thème adaptatif automatique
- ✅ Responsive mobile-first
- ✅ Loader full-screen

### Version 1.0 (15 Décembre 2025)
- ✅ Version initiale
- ✅ Dashboard KPI
- ✅ Gestion transactions
- ✅ Graphiques de base
- ✅ Cartes de position

---

## 🎯 Conclusion

**Dashboard PEA** est une application web moderne, rapide et intuitive pour gérer son portefeuille boursier. Avec un focus sur l'expérience utilisateur, la précision des calculs et la visualisation des données, elle permet un suivi complet et professionnel de ses investissements.

**Points forts** :
- ✅ 100% fonctionnel hors ligne
- ✅ Calculs précis et transparents
- ✅ Interface moderne et responsive
- ✅ Système de notifications intelligent
- ✅ Projections dividendes avancées
- ✅ Suivi plans d'investissement pro-rata
- ✅ Open-source et personnalisable

**Cas d'usage** :
- 📈 Investisseurs particuliers (PEA, CTO)
- 💼 Suivi portefeuille long terme
- 📊 Analyse performance détaillée
- 💰 Optimisation fiscale dividendes
- 🎯 Suivi objectifs investissement

---

**Besoin d'aide ?**  
Consultez la section [Debug et maintenance](#-debug-et-maintenance) ou ouvrez une issue sur GitHub.

**Bon investissement ! 🚀**