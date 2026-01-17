# 🚀 Propositions d'amélioration - Dashboard PEA

## 🔴 PRIORITÉ HAUTE - Bugs et incohérences critiques

### 1. ❌ Incohérence majeure dans `reconstructLive()`

**Problème détecté** :
```javascript
// Dans script.js - ligne ~145
const dividende = getProductDividend(item, resultLive);
```

Tu appelles `getProductDividend(item, resultLive)` mais :
- `resultLive` n'existe pas dans le scope de `reconstructLive()`
- La fonction attend `result.live` mais cette clé n'existe plus dans l'API
- Les dividendes doivent venir de `result.dividende`

**Solution** :
```javascript
// Modifier la signature de reconstructLive
function reconstructLive(dataLive, transactions, dividendes) {
    if (!dataLive || !Array.isArray(dataLive)) return [];
    
    return dataLive.map(item => {
        const ticker = item.id_perso || item.tickers_utiliser;
        const productTransactions = getProductTransactions(item, transactions);
        const unite = productTransactions.reduce((sum, t) => sum + cleanNumber(t.quantite), 0);
        
        // ... calculs existants ...
        
        const dividende = getProductDividend(item, dividendes); // ✅ Passer dividendes
        
        // ... suite du code
    });
}

// Mettre à jour l'appel dans processData()
function processData(result) {
    globalTransactions = result.transactions || [];
    
    globalLive = reconstructLive(
        result.dataLive, 
        result.transactions, 
        result.dividende  // ✅ Passer les dividendes ici
    );
    
    // ...
}
```

---

### 2. ❌ `getProductDividend()` mal implémentée

**Problème** :
La fonction actuelle cherche dans `resultLive` qui n'existe plus. Elle doit :
1. Parcourir `result.dividende` (array)
2. Filtrer par ticker/code
3. Parser les montants `"2,05 €"` → `2.05`
4. Sommer tous les dividendes du produit

**Solution complète** :
```javascript
function getProductDividend(item, dividendes) {
    if (!dividendes || !Array.isArray(dividendes)) return 0;
    
    const ticker = (item.id_perso || item.tickers_utiliser || "").toUpperCase().trim();
    const nom = item.nom;
    
    // Filtrer les dividendes pour ce produit
    const productDividendes = dividendes.filter(div => {
        const divCode = (div.code || "").toUpperCase().trim();
        const divNom = div.nom || "";
        
        // Match par code ticker OU par nom
        return divCode === ticker || divNom === nom;
    });
    
    // Parser et sommer les montants
    const total = productDividendes.reduce((sum, div) => {
        const montant = parseDividende(div["div/u"]);
        return sum + montant;
    }, 0);
    
    return total;
}

// Fonction helper pour parser "2,05 €"
function parseDividende(divString) {
    if (!divString) return 0;
    // Enlever € et espaces, remplacer virgule par point
    const cleaned = divString.toString()
        .replace('€', '')
        .replace(/\s/g, '')
        .replace(',', '.')
        .trim();
    return parseFloat(cleaned) || 0;
}
```

---

### 3. ❌ Variable globale `globalLive` mal synchronisée

**Problème** :
Dans `processData()`, tu recalcules `globalLive` mais tu l'utilises aussi dans le `forEach` juste avant :

```javascript
// script.js - ligne ~236
reconstructLive(result.dataLive, result.transactions, result.live).forEach(item => {
    const ticker = (item.ticker || item.ticker_backup || "").toUpperCase().trim();
    const name = item.liste_produits || item.ticker;
    if (ticker) tickerToNameMap[ticker] = name;
});
globalLive = reconstructLive(result.dataLive, result.transactions, result.live);
```

**Solution** :
```javascript
function processData(result) {
    globalTransactions = result.transactions || [];
    
    // ✅ Calculer UNE SEULE FOIS
    globalLive = reconstructLive(result.dataLive, result.transactions, result.dividende);
    
    // ✅ Utiliser globalLive déjà calculé
    tickerToNameMap = {};
    globalLive.forEach(item => {
        const ticker = (item.ticker || item.ticker_backup || "").toUpperCase().trim();
        const name = item.liste_produits || item.ticker;
        if (ticker) tickerToNameMap[ticker] = name;
    });
    
    // Vérifier historique et render
    if (result.dataLive && result.historiqueProduit) {
        verifyHistoricalData(result);
        if (missingHistories.length > 0 || mismatchedHistories.length > 0) {
            setTimeout(syncHistoricalData, 1000);
        }
    }
    
    renderDashboard(result.transactions || [], globalLive);
}
```

---

### 4. ⚠️ Clé d'API manquante dans le cache

**Problème** :
Tu ne stockes pas `result.dividende` et `result.plan` dans les variables globales, donc ils ne sont pas disponibles hors ligne.

**Solution** :
```javascript
// Ajouter dans processData()
function processData(result) {
    globalTransactions = result.transactions || [];
    globalDividendes = result.dividende || [];  // ✅ Nouveau
    globalPlan = result.plan || [];             // ✅ Nouveau
    
    globalLive = reconstructLive(result.dataLive, result.transactions, globalDividendes);
    
    // ... reste du code
}
```

---

## 🟡 PRIORITÉ MOYENNE - Optimisations et cohérence

### 5. 🔧 Fonction `showProductHistory()` avec paramètre inutilisé

**Problème** :
```javascript
window.showProductHistory = function(code, ticker) {
    // ... mais 'ticker' n'est jamais utilisé
}
```

**Solution** :
```javascript
// Simplifier la signature
window.showProductHistory = function(ticker) {
    const modal = document.getElementById('productHistoryModal');
    const tbody = document.getElementById('modal-history-body');
    const title = document.getElementById('modal-history-title');
    
    if (!modal || !tbody) {
        console.error("Modal historique introuvable dans le DOM");
        return;
    }

    const targetTicker = (ticker || "").toUpperCase().trim();
    const productTransactions = globalTransactions.filter(t => 
        (t.ticker || "").toUpperCase().trim() === targetTicker
    );
    
    // ... reste du code
}

// Mettre à jour l'appel dans renderDashboard()
gridContainer.innerHTML += `
    <div class="position-card" onclick="showProductHistory('${item.ticker}')">
`;
```

---

### 6. 🔧 Duplication de code dans le calcul des performances

**Problème** :
Le calcul de performance est dupliqué dans :
- `renderDashboard()` pour les cartes de position
- `showProductHistory()` pour le modal
- `openTransactionDetail()` pour les détails

**Solution** :
```javascript
// Créer une fonction utilitaire
function calculateTransactionPerformance(transaction, cours) {
    const prix = cleanNumber(transaction.prix_unitaire);
    const frais = cleanNumber(transaction.frais);
    const quantite = cleanNumber(transaction.quantite);
    
    const coutRevient = prix + (frais / quantite);
    const perf = (coutRevient > 0 && cours > 0) 
        ? ((cours - coutRevient) / coutRevient) * 100 
        : 0;
    
    return {
        coutRevient,
        performance: perf,
        isPositive: perf >= 0,
        gainPerte: (cours - coutRevient) * quantite
    };
}

// Utilisation
const perfData = calculateTransactionPerformance(t, cours);
// perfData.performance, perfData.isPositive, etc.
```

---

### 7. 🎨 Calcul du ticker dans `renderDashboard()` incohérent

**Problème** :
```javascript
displayedTransactions.forEach((t, index)=> {
    const tickerKey = (t.ticker || "").toUpperCase().trim();
    const displayName = tickerToNameMap[tickerKey] || t.ticker || "Inconnu";
    // ... mais utilise t.nom qui peut être différent
```

**Solution** :
```javascript
displayedTransactions.forEach((t, index)=> {
    const tickerKey = (t.ticker || "").toUpperCase().trim();
    const displayName = t.nom || tickerToNameMap[tickerKey] || tickerKey || "Inconnu";
    
    // ... utiliser displayName partout de façon cohérente
```

---

### 8. 📊 Graphique cumulatif - gestion des dates mal optimisée

**Problème** :
Dans `updateCumulativeChart()`, tu fais :
```javascript
const dateMap = {};
cumulativeData.forEach(item => {
    const dateStr = item.label;
    if (!dateMap[dateStr] || item.value > dateMap[dateStr].value) {
        dateMap[dateStr] = item;
    }
});

let uniqueDates = Object.keys(dateMap).sort(...);
```

Tu tris après avoir groupé, mais les dates sont déjà triées car `filteredTransactions` est trié.

**Solution optimisée** :
```javascript
// Les données sont déjà triées, pas besoin de dateMap
const uniqueDates = [];
const uniqueValues = [];

filteredTransactions.forEach(t => {
    runningTotal += cleanNumber(t.total);
    const dateStr = new Date(t.date).toLocaleDateString('fr-FR');
    
    // Éviter les doublons de même jour
    if (uniqueDates[uniqueDates.length - 1] !== dateStr) {
        uniqueDates.push(dateStr);
        uniqueValues.push(runningTotal);
    } else {
        // Même jour, mettre à jour la valeur
        uniqueValues[uniqueValues.length - 1] = runningTotal;
    }
});
```

---

## 🟢 PRIORITÉ BASSE - Améliorations fonctionnelles

### 9. 💡 Exploiter les données `plan` pour suivi objectifs

**Fonctionnalité suggérée** :
Comparer automatiquement les plans d'investissement avec les transactions réelles.

**Implémentation** :
```javascript
function analyzeInvestmentPlans(plans, transactions) {
    return plans.map(plan => {
        const montantPrevu = parseMontant(plan.montant);
        const dateDebut = new Date(plan.date_debut);
        const dateFin = plan.date_de_cloture 
            ? new Date(plan.date_de_cloture) 
            : new Date(); // Si "En Cours", jusqu'à aujourd'hui
        
        // Filtrer transactions dans la période du plan
        const transactionsPeriode = transactions.filter(t => {
            const tDate = new Date(t.date);
            return tDate >= dateDebut && tDate <= dateFin;
        });
        
        const montantRealise = transactionsPeriode.reduce(
            (sum, t) => sum + cleanNumber(t.total), 
            0
        );
        
        const ecart = montantRealise - montantPrevu;
        const tauxRealisation = montantPrevu > 0 
            ? (montantRealise / montantPrevu) * 100 
            : 0;
        
        return {
            ...plan,
            montantPrevu,
            montantRealise,
            ecart,
            tauxRealisation,
            nbTransactions: transactionsPeriode.length
        };
    });
}

// Utilisation dans processData()
function processData(result) {
    // ... code existant
    
    const plansAnalyses = analyzeInvestmentPlans(
        result.plan || [], 
        result.transactions || []
    );
    
    // Afficher dans le dashboard
    renderPlansSection(plansAnalyses);
}
```

**UI suggérée** :
```html
<!-- Nouvelle section dans le dashboard -->
<div class="card">
    <h3>Suivi des Plans d'Investissement</h3>
    <div id="plans-container">
        <!-- Barre de progression par plan -->
    </div>
</div>
```

---

### 10. 📈 Graphique de distribution des dividendes

**Fonctionnalité suggérée** :
Afficher un graphique temporel des dividendes reçus.

**Implémentation** :
```javascript
function updateDividendesChart(dividendes) {
    const ctx = document.getElementById('dividendesChart');
    if (!ctx || !ctx.getContext) return;
    
    // Grouper par mois
    const dividendesByMonth = {};
    dividendes.forEach(div => {
        if (div.statut === "Reçus" && div["div/u"]) {
            const date = new Date(div.date);
            const label = date.toLocaleDateString('fr-FR', {
                month: 'short', 
                year: '2-digit'
            });
            
            const montant = parseDividende(div["div/u"]);
            dividendesByMonth[label] = (dividendesByMonth[label] || 0) + montant;
        }
    });
    
    const labels = Object.keys(dividendesByMonth).sort();
    const data = labels.map(l => dividendesByMonth[l]);
    
    new Chart(ctx.getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Dividendes reçus',
                data: data,
                backgroundColor: '#10b981',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            return 'Dividendes: ' + formatEuro(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => formatEuro(value)
                    }
                }
            }
        }
    });
}
```

---

### 11. 🎯 Indicateur de diversification du portefeuille

**Calcul suggéré** :
```javascript
function calculateDiversificationScore(liveData) {
    if (!liveData || liveData.length === 0) return 0;
    
    const totalValue = liveData.reduce((sum, item) => sum + item.somme, 0);
    
    // Calcul de l'indice Herfindahl (concentration)
    const herfindahl = liveData.reduce((sum, item) => {
        const weight = item.somme / totalValue;
        return sum + (weight * weight);
    }, 0);
    
    // Score de diversification (0 = très concentré, 100 = très diversifié)
    const maxHerfindahl = 1; // 100% sur un seul actif
    const minHerfindahl = 1 / liveData.length; // Équipondéré
    
    const score = ((maxHerfindahl - herfindahl) / (maxHerfindahl - minHerfindahl)) * 100;
    
    return {
        score: Math.round(score),
        nbActifs: liveData.length,
        concentration: herfindahl,
        interpretation: score > 70 ? "Bien diversifié" : 
                       score > 40 ? "Moyennement diversifié" : 
                       "Concentré"
    };
}
```

**Affichage** :
```html
<div class="card">
    <h3>Diversification</h3>
    <div class="value" id="diversification-score">--</div>
    <div class="sub" id="diversification-text">-- actifs</div>
</div>
```

---

### 12. 🔔 Alertes intelligentes

**Suggestions d'alertes automatiques** :
```javascript
function checkAlerts(liveData, monthlyObjective, transactions) {
    const alerts = [];
    
    // 1. Alerte concentration
    liveData.forEach(item => {
        const totalValue = liveData.reduce((s, i) => s + i.somme, 0);
        const weight = (item.somme / totalValue) * 100;
        
        if (weight > 30) {
            alerts.push({
                type: 'warning',
                title: 'Concentration élevée',
                message: `${item.liste_produits} représente ${weight.toFixed(1)}% du portefeuille`
            });
        }
    });
    
    // 2. Alerte objectif mensuel
    const now = new Date();
    const currentMonth = now.toLocaleDateString('fr-FR', {month: 'short', year: '2-digit'});
    const monthTransactions = transactions.filter(t => {
        const tDate = new Date(t.date);
        const tMonth = tDate.toLocaleDateString('fr-FR', {month: 'short', year: '2-digit'});
        return tMonth === currentMonth;
    });
    
    const monthTotal = monthTransactions.reduce((s, t) => s + cleanNumber(t.total), 0);
    const remainingDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    
    if (remainingDays < 7 && monthTotal < monthlyObjective) {
        alerts.push({
            type: 'info',
            title: 'Objectif mensuel',
            message: `Il reste ${formatEuro(monthlyObjective - monthTotal)} à investir ce mois`
        });
    }
    
    // 3. Alerte performance négative
    liveData.forEach(item => {
        if (item.perfo < -0.10) { // -10%
            alerts.push({
                type: 'danger',
                title: 'Performance faible',
                message: `${item.liste_produits} : ${(item.perfo * 100).toFixed(1)}%`
            });
        }
    });
    
    return alerts;
}
```

---

## 🔧 REFACTORING - Structure du code

### 13. 📦 Modulariser le code JavaScript

**Problème** :
`script.js` fait actuellement ~1400 lignes - difficile à maintenir.

**Solution** :
Découper en modules logiques :

```javascript
// utils.js - Fonctions utilitaires
export function cleanNumber(val) { /* ... */ }
export function formatEuro(val) { /* ... */ }
export function parseDividende(divString) { /* ... */ }

// api.js - Interactions API
export async function fetchData() { /* ... */ }
export async function postTransaction(data) { /* ... */ }

// calculations.js - Logique métier
export function reconstructLive(dataLive, transactions, dividendes) { /* ... */ }
export function calculatePerformance(transaction, cours) { /* ... */ }

// charts.js - Graphiques
export function updateBarChart(data) { /* ... */ }
export function updatePieChart(data) { /* ... */ }
export function updateCumulativeChart(data) { /* ... */ }

// ui.js - Rendu interface
export function renderDashboard(transactions, liveData) { /* ... */ }
export function renderPositionCards(liveData) { /* ... */ }

// main.js - Orchestration
import { fetchData } from './api.js';
import { renderDashboard } from './ui.js';
// ...
```

---

### 14. 🎨 Améliorer la gestion des modales

**Créer un gestionnaire centralisé** :
```javascript
class ModalManager {
    constructor() {
        this.modals = new Map();
    }
    
    register(id, onOpen = null, onClose = null) {
        const modal = document.getElementById(id);
        if (!modal) return;
        
        this.modals.set(id, { modal, onOpen, onClose });
    }
    
    open(id, data = null) {
        const entry = this.modals.get(id);
        if (!entry) return;
        
        if (entry.onOpen) entry.onOpen(data);
        entry.modal.style.display = 'flex';
    }
    
    close(id) {
        const entry = this.modals.get(id);
        if (!entry) return;
        
        if (entry.onClose) entry.onClose();
        entry.modal.style.display = 'none';
    }
}

// Utilisation
const modalManager = new ModalManager();
modalManager.register('transactionModal', null, () => {
    document.getElementById('transactionForm').reset();
});
modalManager.register('transactionDetailModal');
modalManager.register('productHistoryModal');

// Ouvrir une modale
modalManager.open('transactionModal');
```

---

## ✅ Checklist de mise en œuvre

### Phase 1 - Corrections critiques (1-2h)
- [X] Corriger `reconstructLive()` (bug #1)
- [X] Réimplémenter `getProductDividend()` (bug #2)
- [X] Dédupliquer calcul de `globalLive` (bug #3)
- [X] Ajouter `globalDividendes` et `globalPlan` (bug #4)

### Phase 2 - Optimisations (2-3h)
- [X] Simplifier `showProductHistory()` (amélioration #5)
- [X] Créer fonction `calculateTransactionPerformance()` (amélioration #6)
- [X] Cohérence affichage noms/tickers (amélioration #7)
- [X] Optimiser graphique cumulatif (amélioration #8)

### Phase 3 - Nouvelles features (4-6h)
- [ ] Suivi plans d'investissement (feature #9)
- [ ] Graphique dividendes (feature #10)
- [ ] Score de diversification (feature #11)
- [ ] Système d'alertes (feature #12)

### Phase 4 - Refactoring (optionnel, 6-8h)
- [ ] Modulariser le code (refactor #13)
- [ ] Gestionnaire de modales (refactor #14)

---

## 🎯 Impact estimé

| Amélioration | Impact UX | Impact Performance | Difficulté | Priorité |
|--------------|-----------|-------------------|------------|----------|
| Bugs 1-4 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | 🟢 Facile | 🔴 Critique |
| Optimisations 5-8 | ⭐⭐⭐ | ⭐⭐⭐⭐ | 🟢 Facile | 🟡 Moyenne |
| Features 9-12 | ⭐⭐⭐⭐⭐ | ⭐⭐ | 🟡 Moyenne | 🟢 Nice-to-have |
| Refactoring 13-14 | ⭐⭐ | ⭐⭐⭐⭐ | 🔴 Difficile | 🟢 Optionnel |
